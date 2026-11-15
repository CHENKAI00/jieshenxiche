/**
 * 无数据库烟雾测试：把 src/db.js 换成内存假库，跑通 v2 精简表结构下的全链路
 * 「识别车牌 → 查会员 → 建档 → 核销(洗车/打蜡) → 充值 → 看板」
 * 运行：node test/api.smoke.js
 */
const assert = require('assert');

/* ---------------- 内存假库（对齐 v2 的 17 字段） ---------------- */
const store = [];
let seq = 0;
const clone = (o) => JSON.parse(JSON.stringify(o));
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

function exec(sql, params = []) {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (/^SELECT 1 AS ok/i.test(s)) return [[{ ok: 1 }]];

  if (/^SELECT \* FROM `js_member` WHERE plate_no = \? (LIMIT 1|FOR UPDATE)/i.test(s)) {
    return [[store.find((r) => r.plate_no === params[0])].filter(Boolean).map(clone)];
  }
  if (/^SELECT \* FROM `js_member` WHERE id = \?/i.test(s)) {
    return [[store.find((r) => r.id === params[0])].filter(Boolean).map(clone)];
  }
  if (/^INSERT INTO `js_member`/i.test(s)) {
    const [plate_no, plate_color, member_no, nickname, phone, remark] = params;
    const row = {
      id: ++seq, plate_no, plate_color, member_no, nickname, phone,
      balance: 0, remain_count: 0, total_count: 0, expire_at: null,
      last_service_at: null, last_item: null, last_amount: 0, remark: remark || null,
      status: 1, created_at: `${today()} 10:00:00`, updated_at: `${today()} 10:00:00`,
    };
    store.push(row);
    return [{ insertId: row.id, affectedRows: 1 }];
  }
  if (/^UPDATE `js_member` SET balance=\?, remain_count=\?, total_count=total_count\+1/i.test(s)) {
    const [balance, remain_count, last_item, last_amount, remark, id] = params;
    const r = store.find((x) => x.id === id);
    Object.assign(r, {
      balance, remain_count, last_item, last_amount,
      total_count: r.total_count + 1,
      last_service_at: `${today()} 20:30:00`,
      remark: remark || r.remark,
    });
    return [{ affectedRows: 1 }];
  }
  if (/^UPDATE `js_member` SET balance=\?, remain_count=\?, expire_at=\?, last_item=\?, last_amount=\?/i.test(s)) {
    const [balance, remain_count, expire_at, last_item, last_amount, remark, id] = params;
    const r = store.find((x) => x.id === id);
    Object.assign(r, { balance, remain_count, expire_at, last_item, last_amount, remark: remark || r.remark });
    return [{ affectedRows: 1 }];
  }
  if (/^SELECT \* FROM `js_member` WHERE \(\?='' OR plate_no LIKE \?/i.test(s)) {
    const lim = params[params.length - 2];
    const off = params[params.length - 1];
    return [store.slice(off, off + lim).map(clone)];
  }
  if (/^SELECT COUNT\(\*\) total FROM `js_member`/i.test(s)) return [[{ total: store.length }]];
  if (/^SELECT COUNT\(\*\) members, SUM\(balance\) balance, SUM\(remain_count\) remain/i.test(s)) {
    return [[{
      members: store.length,
      balance: store.reduce((a, r) => a + Number(r.balance), 0),
      remain: store.reduce((a, r) => a + Number(r.remain_count), 0),
    }]];
  }
  if (/^SELECT COUNT\(\*\) visits, SUM\(last_amount\) amount/i.test(s)) {
    const hit = store.filter((r) => String(r.last_service_at || '').startsWith(today()));
    return [[{ visits: hit.length, amount: hit.reduce((a, r) => a + Number(r.last_amount || 0), 0) }]];
  }
  if (/^SELECT COUNT\(\*\) c FROM `js_member` WHERE DATE\(created_at\)/i.test(s)) {
    return [[{ c: store.filter((r) => String(r.created_at).startsWith(today())).length }]];
  }
  if (/^SELECT \* FROM `js_member` WHERE last_service_at IS NOT NULL/i.test(s)) {
    const lim = params[0];
    return [store.filter((r) => r.last_service_at)
      .sort((a, b) => String(b.last_service_at).localeCompare(String(a.last_service_at)))
      .slice(0, lim).map(clone)];
  }
  throw new Error('假库未覆盖的 SQL: ' + s.slice(0, 140));
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
  ping: async () => true,
};

const dbPath = require.resolve('../src/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb, children: [], paths: [] };

/* ---------------- 断言 ---------------- */
const results = [];
function ok(name, cond, extra = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
}

(async () => {
  const app = require('../src/app');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const H = { 'x-token': 'js-wash-2026', 'content-type': 'application/json' };

  // 0. 工具函数
  const plateUtil = require('../src/utils/plate');
  ok('车牌归一化 粤b·12345 → 粤B12345', plateUtil.normalizePlate(' 粤b·12345 ') === '粤B12345');
  ok('新能源 8 位绿牌校验', plateUtil.validatePlate('粤BD12345').ok && plateUtil.validatePlate('粤BD12345').color === '绿');
  ok('非法车牌被拒绝', plateUtil.validatePlate('ABC123').ok === false);
  ok('OCR 混淆纠偏 O→0', plateUtil.fixOcrConfusion('粤BO1234') === '粤B01234');

  // 1. 鉴权
  let r = await fetch(`${base}/stats/overview`);
  ok('无口令访问被 401 拦截', r.status === 401);

  // 2. 价目表含非洗车服务
  r = await fetch(`${base}/ocr/meta`, { headers: H });
  let j = await r.json();
  const names = (j.services || []).map((s) => s.name);
  ok('价目表包含打蜡等美容项目', names.includes('打蜡') && names.includes('标准洗车'), names.join('/'));
  ok('等级/积分字段已从返回中消失', !('levels' in j));

  // 3. 建档（不再有等级参数）
  r = await fetch(`${base}/member`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤B12345', nickname: '张先生', phone: '13800138000' }) });
  j = await r.json();
  ok('会员建档成功', r.status === 201 && j.created === true);
  ok('新会员默认 余额0/次数0/总次数0', j.balance === 0 && j.remainCount === 0 && j.totalCount === 0);
  ok('不再返回 level/points', j.level === undefined && j.points === undefined);

  // 4. 幂等
  r = await fetch(`${base}/member`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤b 12345' }) });
  j = await r.json();
  ok('车牌归一化后不重复建档', r.status === 200 && j.created === false);

  // 5. 拍照识别
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('fake-jpeg')], { type: 'image/jpeg' }), 'plate.jpg');
  r = await fetch(`${base}/ocr/plate`, { method: 'POST', headers: { 'x-token': H['x-token'] }, body: form });
  j = await r.json();
  ok('上传图片走 OCR 识别并带会员', r.status === 200 && j.ok && !!j.plateNo && typeof j.exists === 'boolean', `${j.plateNo} engine=${j.engine}`);

  // 6. 充值（充200送30 + 10次，12个月）
  r = await fetch(`${base}/wash/recharge`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤B12345', amount: 200, giftAmount: 30, times: 10, months: 12 }) });
  j = await r.json();
  ok('充值到账 230 元 + 10 次 + 有效期', r.status === 200 && j.balance === 230 && j.remainCount === 10 && !!j.expireAt, `余额=${j.balance} 次数=${j.remainCount} 到期=${j.expireAt}`);

  // 7. 洗车核销（扣次数）
  r = await fetch(`${base}/wash/consume`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤B12345', serviceId: 'wash_suv' }) });
  j = await r.json();
  ok('洗车核销扣次数', r.status === 200 && j.payType === '次数' && j.remainCount === 9 && j.totalCount === 1, `余次=${j.remainCount} 总次数=${j.totalCount}`);

  // 8. 打蜡核销（次数用完 → 扣余额）
  r = await fetch(`${base}/wash/consume`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤B12345', serviceId: 'wax', useCount: false }) });
  j = await r.json();
  ok('打蜡（非洗车项目）可按余额核销', r.status === 200 && j.payType === '余额' && j.amount === 98 && j.service === '打蜡', `实收=${j.amount}`);
  ok('余额扣减与最近项目回写', j.balance === 132 && j.member.lastItem === '打蜡', `余额=${j.balance}`);

  // 9. 余额不足
  r = await fetch(`${base}/wash/consume`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤B12345', serviceId: 'polish', useCount: false }) });
  ok('余额不足返回 402 且不扣负', r.status === 402);

  // 10. 未建档
  r = await fetch(`${base}/member/${encodeURIComponent('粤B12346')}`, { headers: H });
  j = await r.json();
  ok('未建档车牌 exists=false', j.exists === false);

  // 11. 详情
  r = await fetch(`${base}/member/${encodeURIComponent('粤B12345')}`, { headers: H });
  j = await r.json();
  ok('会员详情字段精简为余额/剩余次数/总次数', j.phone === '138****8000' && j.totalCount === 2 && j.remainCount === 9, `总次数=${j.totalCount} 余次=${j.remainCount}`);
  ok('不再返回 records 数组', j.records === undefined);

  // 12. 看板
  r = await fetch(`${base}/stats/overview`, { headers: H });
  j = await r.json();
  ok('门店看板：今日到店/今日实收/会员数', j.todayVisits === 1 && j.todayIncome === 98 && j.members === 1, JSON.stringify({ visits: j.todayVisits, income: j.todayIncome, members: j.members }));
  ok('看板不再输出积分/套餐名', j.todayPoints === undefined && j.packageLeftSum === undefined);

  // 13. 最近到店
  r = await fetch(`${base}/stats/recent?limit=5`, { headers: H });
  j = await r.json();
  ok('最近到店列表按 last_service_at', r.status === 200 && j.list.length === 1 && j.list[0].lastItem === '打蜡');

  // 14. 搜索
  r = await fetch(`${base}/member?keyword=${encodeURIComponent('粤B')}`, { headers: H });
  j = await r.json();
  ok('会员名录搜索', j.total === 1 && j.list[0].platePretty === '粤B·12345');

  server.close();
  const failed = results.filter((x) => !x.pass);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('测试异常:', e); process.exit(1); });
