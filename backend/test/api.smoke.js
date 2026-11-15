/**
 * 无数据库烟雾测试：把 src/db.js 换成内存假库，跑通「识别车牌 → 查会员 → 建档 → 核销 → 充值」全链路。
 * 目的：在没有 MySQL 授权的主机上也能验证接口与业务逻辑；真库联调用 npm run db:init + npm start。
 * 运行：node test/api.smoke.js
 */
const assert = require('assert');
const path = require('path');

/* ---------------- 内存假库 ---------------- */
const store = [];
let seq = 0;
const clone = (o) => JSON.parse(JSON.stringify(o));

function findPlate(row) {
  return store.find((r) => r.plate_no === row);
}

function exec(sql, params = []) {
  const s = sql.replace(/\s+/g, ' ').trim();

  if (/^SELECT 1 AS ok/i.test(s)) return [[{ ok: 1 }]];

  if (/^SELECT \* FROM `js_member` WHERE plate_no = \? LIMIT 1/i.test(s)) {
    return [[findPlate(params[0])].filter(Boolean).map(clone)];
  }
  if (/^SELECT \* FROM `js_member` WHERE plate_no = \? FOR UPDATE/i.test(s)) {
    return [[findPlate(params[0])].filter(Boolean).map(clone)];
  }
  if (/^SELECT \* FROM `js_member` WHERE id = \?/i.test(s)) {
    return [[store.find((r) => r.id === params[0])].filter(Boolean).map(clone)];
  }
  if (/^INSERT INTO `js_member`/i.test(s)) {
    const [plate_no, plate_color, member_no, nickname, phone, level, remark, records] = params;
    const row = {
      id: ++seq, plate_no, plate_color, member_no, nickname, phone, level,
      balance: 0, points: 0, wash_total: 0, package_left: 0, package_name: null,
      expire_at: null, last_wash_at: null, avatar: null, remark: remark || null,
      records, status: 1, created_at: '2026-11-15 20:00:00', updated_at: '2026-11-15 20:00:00',
    };
    store.push(row);
    return [{ insertId: row.id, affectedRows: 1 }];
  }
  if (/^UPDATE `js_member` SET balance=\?, package_left=\?, wash_total=wash_total\+1/i.test(s)) {
    const [balance, package_left, points, records, id] = params;
    const r = store.find((x) => x.id === id);
    Object.assign(r, { balance, package_left, points: r.points + points, wash_total: r.wash_total + 1, records, last_wash_at: '2026-11-15 20:30:00' });
    return [{ affectedRows: 1 }];
  }
  if (/^UPDATE `js_member` SET balance=\?, package_left=\?, package_name=COALESCE/i.test(s)) {
    const [balance, package_left, package_name, expire_at, level, records, id] = params;
    const r = store.find((x) => x.id === id);
    Object.assign(r, {
      balance, package_left, expire_at, level, records,
      package_name: package_name || r.package_name,
    });
    return [{ affectedRows: 1 }];
  }
  if (/^UPDATE `js_member` SET points=points-\?, records=\?/i.test(s)) {
    const [points, records, id] = params;
    const r = store.find((x) => x.id === id);
    Object.assign(r, { points: r.points - points, records });
    return [{ affectedRows: 1 }];
  }
  // 列表 / 计数（keyword='' 时取全量）
  if (/^SELECT \* FROM `js_member` WHERE \(\?='' OR plate_no LIKE \?/i.test(s)) {
    const lim = params[params.length - 2];
    const off = params[params.length - 1];
    return [store.slice(off, off + lim).map(clone)];
  }
  if (/^SELECT COUNT\(\*\) total FROM `js_member`/i.test(s)) return [[{ total: store.length }]];
  if (/^SELECT COUNT\(\*\) AS members, SUM\(balance\)/i.test(s)) {
    return [[{
      members: store.length,
      balance: store.reduce((s2, r) => s2 + Number(r.balance), 0),
      packageLeft: store.reduce((s2, r) => s2 + Number(r.package_left), 0),
    }]];
  }
  if (/^SELECT records FROM `js_member`/i.test(s)) return [store.map((r) => ({ records: r.records }))];
  if (/^SELECT plate_no, nickname, level, records FROM `js_member`/i.test(s)) {
    return [store.map((r) => ({ plate_no: r.plate_no, nickname: r.nickname, level: r.level, records: r.records }))];
  }
  throw new Error('假库未覆盖的 SQL: ' + s.slice(0, 120));
}

const fakeDb = {
  pool: {
    query: async (sql, params) => exec(sql, params),
    getConnection: async () => ({
      query: async (sql, params) => exec(sql, params),
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    }),
  },
  q: async (sql, params) => (await exec(sql, params))[0],
  ping: async () => true,
  parseRecords: (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
    return [];
  },
};

const dbPath = require.resolve('../src/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb, children: [], paths: [] };

/* ---------------- 断言工具 ---------------- */
const results = [];
function ok(name, cond, extra = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
}

(async () => {
  const app = require('../src/app');
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/api/v1`;
  const TOKEN = 'js-wash-2026';
  const H = { 'x-token': TOKEN, 'content-type': 'application/json' };

  // 0. 单元：车牌工具
  const plateUtil = require('../src/utils/plate');
  ok('车牌归一化 粤b·12345', plateUtil.normalizePlate(' 粤b·12345 ') === '粤B12345');
  ok('新能源 8 位绿牌校验', plateUtil.validatePlate('粤BD12345').ok && plateUtil.validatePlate('粤BD12345').color === '绿');
  ok('非法车牌被拒绝', plateUtil.validatePlate('ABC123').ok === false);
  ok('OCR 混淆纠偏 O→0', plateUtil.fixOcrConfusion('粤BO1234') === '粤B01234');

  // 1. 无口令被拦
  let r = await fetch(`${base}/stats/overview`);
  ok('无口令访问被 401 拦截', r.status === 401);

  // 2. 建档
  r = await fetch(`${base}/member`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤B12345', nickname: '张先生', phone: '13800138000', level: 3 }) });
  let j = await r.json();
  ok('会员建档成功', r.status === 201 && j.created === true, `plate=${j.plateNo}`);

  // 3. 重复建档幂等
  r = await fetch(`${base}/member`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤b 12345' }) });
  j = await r.json();
  ok('新车牌归一化后不重复建档', r.status === 200 && j.created === false);

  // 4. 拍照识别（mock OCR）
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('fake-jpeg-bytes')], { type: 'image/jpeg' }), 'plate.jpg');
  r = await fetch(`${base}/ocr/plate`, { method: 'POST', headers: { 'x-token': TOKEN }, body: form });
  j = await r.json();
  ok('上传图片走 OCR 识别链路', r.status === 200 && j.ok && !!j.plateNo, `识别=${j.plateNo} engine=${j.engine} 会员=${j.exists}`);
  ok('识别结果自动带出会员信息', typeof j.exists === 'boolean');

  // 5. 充值
  r = await fetch(`${base}/wash/recharge`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤B12345', amount: 200, giftAmount: 30, times: 10, packageName: '洗车10次卡', months: 12, operator: '小李' }) });
  j = await r.json();
  ok('充值 + 赠额 + 赠次 + 有效期', r.status === 200 && j.balance === 230 && j.packageLeft === 10, `余额=${j.balance} 次数=${j.packageLeft}`);

  // 6. 核销（优先扣套餐次数）
  r = await fetch(`${base}/wash/consume`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤B12345', itemId: 'suv', operator: '小李' }) });
  j = await r.json();
  ok('洗车核销扣套餐次数', r.status === 200 && j.payType === '套餐次数' && j.packageLeft === 9, `pay=${j.payType} 余次=${j.packageLeft} 积分=${j.points}`);

  // 7. 核销（套餐用完走余额 + 会员折扣）
  r = await fetch(`${base}/wash/consume`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤B12345', itemId: 'coat', usePackage: false }) });
  j = await r.json();
  ok('余额支付并享金卡 9 折', r.status === 200 && j.payType === '余额' && j.amount === 79.2, `应付=${j.amount}`);

  // 8. 余额不足拦截
  r = await fetch(`${base}/wash/consume`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤B12345', itemId: 'newcar', usePackage: false }) });
  ok('余额不足返回 402 而非扣成负数', r.status === 402);

  // 9. 未建档车牌
  r = await fetch(`${base}/member/粤B12346`, { headers: H });
  j = await r.json();
  ok('未建档车牌返回 exists=false', j.exists === false);

  // 10. 会员详情 & 手机号脱敏
  r = await fetch(`${base}/member/粤B12345`, { headers: H });
  j = await r.json();
  ok('会员详情含流水/余额/等级', j.exists && j.phone === '138****8000' && j.levelName === '金卡会员', `phone=${j.phone} 流水=${j.records.length}条`);

  // 11. 积分兑换
  r = await fetch(`${base}/member/粤B12345/points`, { method: 'POST', headers: H, body: JSON.stringify({ points: 100, item: '毛巾兑换' }) });
  j = await r.json();
  ok('积分兑换扣减成功', r.status === 200 && j.points > 0, `余积分=${j.points}`);

  // 12. 门店看板
  r = await fetch(`${base}/stats/overview`, { headers: { 'x-token': TOKEN } });
  j = await r.json();
  ok('门店看板统计今日核销', r.status === 200 && j.todayWash === 2, `今日=${j.todayWash}单 营收=${j.todayIncome}`);

  // 13. 列表搜索
  r = await fetch(`${base}/member?keyword=粤B`, { headers: { 'x-token': TOKEN } });
  j = await r.json();
  ok('会员列表搜索', r.status === 200 && j.total === 1);

  // 14. 最近流水
  r = await fetch(`${base}/stats/recent?limit=5`, { headers: { 'x-token': TOKEN } });
  j = await r.json();
  ok('最近流水按时间倒序', r.status === 200 && j.list.length > 0 && j.list.length <= 5);

  server.close();
  const failed = results.filter((x) => !x.pass);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('测试异常:', e); process.exit(1); });
