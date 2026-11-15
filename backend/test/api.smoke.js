/**
 * 无数据库烟雾测试（v3）：内存假库替换 db 层，项目目录用临时文件，
 * 覆盖：拍照识别 → 查会员 → 建档 → 洗车/打蜡分别计数 → 充值 → 后台项目管理
 * 运行：node test/api.smoke.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// 项目目录用临时文件，避免测试改到真实 data/services.json
process.env.CATALOG_FILE = path.join(os.tmpdir(), `js-catalog-test-${Date.now()}.json`);
process.env.BOOKINGS_FILE = path.join(os.tmpdir(), `js-bookings-test-${Date.now()}.json`);
fs.copyFileSync(path.join(__dirname, '..', 'data', 'services.json'), process.env.CATALOG_FILE);

/* ---------------- 内存假库（对齐 v3 的 17 字段） ---------------- */
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
  if (/^SELECT \* FROM `js_member` WHERE phone = \? ORDER BY/i.test(s)) {
    return [store.filter((r) => r.phone && r.phone === params[0]).map(clone)];
  }
  if (/^SELECT \* FROM `js_member` WHERE openid = \? LIMIT 1/i.test(s)) {
    return [[store.find((r) => r.openid && r.openid === params[0])].filter(Boolean).map(clone)];
  }
  if (/^UPDATE `js_member` SET openid = \? WHERE id = \?/i.test(s)) {
    const [openid, id] = params;
    if (store.some((r) => r.openid === openid && r.id !== id)) {
      const e = new Error('Duplicate entry'); e.code = 'ER_DUP_ENTRY'; throw e;
    }
    const r = store.find((x) => x.id === id);
    if (r) r.openid = openid;
    return [{ affectedRows: r ? 1 : 0 }];
  }
  if (/^UPDATE `js_member` SET openid = NULL WHERE openid = \?/i.test(s)) {
    let n = 0;
    store.forEach((r) => { if (r.openid === params[0]) { r.openid = null; n += 1; } });
    return [{ affectedRows: n }];
  }
  if (/^SELECT \* FROM `js_member` WHERE id = \?/i.test(s)) {
    return [[store.find((r) => r.id === params[0])].filter(Boolean).map(clone)];
  }
  if (/^INSERT INTO `js_member`/i.test(s)) {
    const [plate_no, plate_color, member_no, nickname, phone, remark] = params;
    const row = {
      id: ++seq, plate_no, plate_color, member_no, nickname, phone,
      openid: null,
      balance: 0, remain_count: 0, wash_count: 0, wax_count: 0, expire_at: null,
      last_service_at: null, last_item: null, remark: remark || null,
      status: 1, created_at: `${today()} 10:00:00`, updated_at: `${today()} 10:00:00`,
    };
    store.push(row);
    return [{ insertId: row.id, affectedRows: 1 }];
  }
  // 核销：SET balance=?, remain_count=?, last_service_at=NOW(), last_item=?, remark=COALESCE(...) [,+计数]
  if (/^UPDATE `js_member` SET balance=\?, remain_count=\?, last_service_at=NOW\(\), last_item=\?/i.test(s)) {
    const incWash = /wash_count=wash_count\+1/.test(s);
    const incWax = /wax_count=wax_count\+1/.test(s);
    const [balance, remain_count, last_item, remark, id] = params;
    const r = store.find((x) => x.id === id);
    Object.assign(r, {
      balance, remain_count, last_item,
      last_service_at: `${today()} 20:30:00`,
      remark: remark || r.remark,
    });
    if (incWash) r.wash_count += 1;
    if (incWax) r.wax_count += 1;
    return [{ affectedRows: 1 }];
  }
  if (/^UPDATE `js_member` SET phone=\?, nickname=COALESCE\(NULLIF\(\?,''\), nickname\), remark=COALESCE/i.test(s)) {
    const [phone, nickname, remark, id] = params;
    const r = store.find((x) => x.id === id);
    if (r) Object.assign(r, { phone, nickname: nickname || r.nickname, remark: remark || r.remark });
    return [{ affectedRows: r ? 1 : 0 }];
  }
  // 充值
  if (/^UPDATE `js_member` SET balance=\?, remain_count=\?, expire_at=\?, remark=COALESCE/i.test(s)) {
    const [balance, remain_count, expire_at, remark, id] = params;
    const r = store.find((x) => x.id === id);
    Object.assign(r, { balance, remain_count, expire_at, remark: remark || r.remark });
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
      wash: store.reduce((a, r) => a + Number(r.wash_count), 0),
      wax: store.reduce((a, r) => a + Number(r.wax_count), 0),
    }]];
  }
  if (/^SELECT COUNT\(\*\) visits FROM `js_member` WHERE DATE\(last_service_at\)/i.test(s)) {
    return [[{ visits: store.filter((r) => String(r.last_service_at || '').startsWith(today())).length }]];
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
  throw new Error('假库未覆盖的 SQL: ' + s.slice(0, 160));
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
  const TOKEN = 'js-wash-2026';
  const H = { 'x-token': TOKEN, 'content-type': 'application/json' };

  // 0. 工具
  const plateUtil = require('../src/utils/plate');
  ok('车牌归一化', plateUtil.normalizePlate(' 粤b·12345 ') === '粤B12345');
  ok('新能源绿牌', plateUtil.validatePlate('粤BD12345').ok && plateUtil.validatePlate('粤BD12345').color === '绿');
  ok('OCR 纠偏 O→0', plateUtil.fixOcrConfusion('粤BO1234') === '粤B01234');

  // 1. 鉴权
  let r = await fetch(`${base}/stats/overview`);
  ok('无口令 401', r.status === 401);

  // 2. 项目目录（文件驱动）
  r = await fetch(`${base}/catalog`, { headers: H });
  let j = await r.json();
  const names = j.services.map((s) => s.name);
  ok('项目目录含洗车+打蜡', names.includes('标准洗车') && names.includes('打蜡'), names.join('/'));
  ok('项目带分类与计次配置', j.services.find((s) => s.id === 'wax').countKey === 'wax' && j.services.find((s) => s.id === 'wax').tag === '美容');
  ok('项目目录有分类聚合', Array.isArray(j.tags) && j.tags.length >= 2);

  // 3. 建档
  r = await fetch(`${base}/member`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤B12345', nickname: '张先生', phone: '13800138000' }) });
  j = await r.json();
  ok('建档成功', r.status === 201 && j.created === true);
  ok('新会员 洗车/打蜡 均为 0', j.washCount === 0 && j.waxCount === 0 && j.remainCount === 0);
  ok('不再返回 totalCount / lastAmount', j.totalCount === undefined && j.lastAmount === undefined);

  // 4. 拍照识别
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('fake')], { type: 'image/jpeg' }), 'p.jpg');
  r = await fetch(`${base}/ocr/plate`, { method: 'POST', headers: { 'x-token': TOKEN }, body: form });
  j = await r.json();
  ok('拍照识别链路', r.status === 200 && j.ok && !!j.plateNo);

  // 5. 充值
  r = await fetch(`${base}/wash/recharge`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤B12345', amount: 200, giftAmount: 30, times: 10, months: 12 }) });
  j = await r.json();
  ok('充值 230 元 + 10 次', r.status === 200 && j.balance === 230 && j.remainCount === 10 && !!j.expireAt);

  // 6. 洗车核销 → wash_count +1
  r = await fetch(`${base}/wash/consume`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤B12345', serviceId: 'wash_suv' }) });
  j = await r.json();
  ok('洗车核销：扣次数 + 洗车次数 1', r.status === 200 && j.payType === '次数' && j.washCount === 1 && j.waxCount === 0, `洗车=${j.washCount} 打蜡=${j.waxCount}`);

  // 7. 打蜡核销 → wax_count +1（扣余额）
  r = await fetch(`${base}/wash/consume`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤B12345', serviceId: 'wax', useCount: false }) });
  j = await r.json();
  ok('打蜡核销：扣余额 + 打蜡次数 1', r.status === 200 && j.payType === '余额' && j.amount === 98 && j.waxCount === 1 && j.washCount === 1, `洗车=${j.washCount} 打蜡=${j.waxCount} 实收=${j.amount}`);

  // 8. 不计数项目（抛光）
  r = await fetch(`${base}/wash/consume`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤B12345', serviceId: 'glass', useCount: false }) });
  j = await r.json();
  ok('玻璃镀膜：只扣钱不计数', r.status === 200 && j.amount === 88 && j.washCount === 1 && j.waxCount === 1, `余额=${j.balance}`);

  // 9. 余额不足
  r = await fetch(`${base}/wash/consume`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤B12345', serviceId: 'polish', useCount: false }) });
  ok('余额不足 402（抛光 180 > 余额 44）', r.status === 402);

  // 10. 详情
  r = await fetch(`${base}/member/${encodeURIComponent('粤B12345')}`, { headers: H });
  j = await r.json();
  ok('详情：洗车/打蜡分开计数', j.washCount === 1 && j.waxCount === 1 && j.remainCount === 9);
  ok('详情不再有 lastAmount', j.lastAmount === undefined);

  // 10.5 员工补登手机号（车主绑定前提）
  r = await fetch(`${base}/member/${encodeURIComponent('粤B12345')}`, { method: 'PATCH', headers: H, body: JSON.stringify({ phone: '13800138000' }) });
  j = await r.json();
  ok('员工补登手机号成功', r.status === 200 && j.phone === '138****8000');
  r = await fetch(`${base}/member/${encodeURIComponent('粤B12345')}`, { method: 'PATCH', headers: H, body: JSON.stringify({ phone: '123' }) });
  ok('非法手机号 400', r.status === 400);

  // 11. 看板
  r = await fetch(`${base}/stats/overview`, { headers: H });
  j = await r.json();
  ok('看板有洗车/打蜡累计', j.washSum === 1 && j.waxSum === 1 && j.todayVisits === 1);
  ok('看板不再有今日实收', j.todayIncome === undefined);

  // 11.5 车主端：登录 → 未绑定 → 错手机号 → 绑定 → 已绑定 → 解绑
  r = await fetch(`${base}/customer/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'devcode' }) });
  j = await r.json();
  const OID = j.openid;
  ok('车主 wx.login 换 openid（mock）', r.status === 200 && !!OID && j.mock === true && j.role === 'customer', OID);

  r = await fetch(`${base}/customer/me`, { headers: { 'x-openid': OID } });
  j = await r.json();
  ok('未绑定时 bound=false 且能看项目', j.bound === false && j.services.length > 0);

  r = await fetch(`${base}/customer/me`);
  ok('没带 openid 的车主接口 401', r.status === 401);

  r = await fetch(`${base}/customer/bind`, { method: 'POST', headers: { 'x-openid': OID, 'content-type': 'application/json' }, body: JSON.stringify({ plateNo: '粤B12345', phone: '13900000000' }) });
  ok('手机号不匹配 403', r.status === 403);

  r = await fetch(`${base}/customer/bind`, { method: 'POST', headers: { 'x-openid': OID, 'content-type': 'application/json' }, body: JSON.stringify({ plateNo: '粤B12345', phone: '13800138000' }) });
  j = await r.json();
  ok('车牌+手机号匹配后绑定成功', r.status === 200 && j.member.platePretty === '粤B·12345', j.member && j.member.platePretty);

  r = await fetch(`${base}/customer/me`, { headers: { 'x-openid': OID } });
  j = await r.json();
  ok('绑定后 /me 返回自己的卡', j.bound === true && j.member.balance === j.member.balance && j.member.washCount >= 1);

  r = await fetch(`${base}/customer/bind`, { method: 'POST', headers: { 'x-openid': OID, 'content-type': 'application/json' }, body: JSON.stringify({ plateNo: '粤B12345', phone: '13800138000' }) });
  ok('重复绑定同一辆车幂等', r.status === 200);

  r = await fetch(`${base}/customer/unbind`, { method: 'POST', headers: { 'x-openid': OID } });
  ok('解绑成功', r.status === 200 && j.ok !== false);

  r = await fetch(`${base}/customer/me`, { headers: { 'x-openid': OID } });
  j = await r.json();
  ok('解绑后 bound=false', j.bound === false);

  // 11.8 车主绑定：手机号后 4 位也能绑（不调收费接口）+ 员工口令登录
  r = await fetch(`${base}/customer/bind`, { method: 'POST', headers: { 'x-openid': 'mock_last4b', 'content-type': 'application/json' }, body: JSON.stringify({ plateNo: '粤B12345', phone: '9999' }) });
  ok('后 4 位不匹配 403', r.status === 403);

  r = await fetch(`${base}/customer/bind`, { method: 'POST', headers: { 'x-openid': 'mock_last4', 'content-type': 'application/json' }, body: JSON.stringify({ plateNo: '粤B12345', phone: '8000' }) });
  j = await r.json();
  ok('手机号后 4 位可绑定', r.status === 200 && j.member && j.member.platePretty === '粤B·12345', j.member && j.member.platePretty);

  r = await fetch(`${base}/customer/me`, { headers: { 'x-openid': 'mock_last4' } });
  j = await r.json();
  ok('后 4 位绑定后能读自己的卡', j.bound === true);

  r = await fetch(`${base}/customer/staff-login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) });
  ok('员工口令错误 401', r.status === 401);

  r = await fetch(`${base}/customer/staff-login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: TOKEN }) });
  j = await r.json();
  ok('员工口令登录返回 token（免费，不依赖手机号）', r.status === 200 && j.token === TOKEN && j.role === 'staff');

  await fetch(`${base}/customer/unbind`, { method: 'POST', headers: { 'x-openid': 'mock_last4' } });

  // 12. 后台登录
  r = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) });
  ok('后台错误口令 401', r.status === 401);
  r = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: TOKEN }) });
  j = await r.json();
  ok('后台登录返回 token', r.status === 200 && j.token === TOKEN);

  // 13. 后台看板
  r = await fetch(`${base}/admin/overview`, { headers: H });
  j = await r.json();
  ok('后台看板含项目统计', r.status === 200 && j.servicesCount > 0 && Array.isArray(j.recent));

  // 14. 后台项目管理：新增 → 改 → 排序 → 删除
  r = await fetch(`${base}/admin/services`, { method: 'POST', headers: H, body: JSON.stringify({ name: '测试镀晶', tag: '美容', price: 399, mins: 120, desc: '临时', countKey: null }) });
  j = await r.json();
  const newId = j.service && j.service.id;
  ok('后台新增项目', r.status === 201 && !!newId && j.service.price === 399);

  r = await fetch(`${base}/admin/services/${newId}`, { method: 'PUT', headers: H, body: JSON.stringify({ price: 499, on: false }) });
  j = await r.json();
  ok('后台改价 + 下架', r.status === 200 && j.service.price === 499 && j.service.on === false);

  r = await fetch(`${base}/catalog`, { headers: H });
  j = await r.json();
  ok('下架项目不出现在小程序目录', !j.services.some((s) => s.id === newId));

  r = await fetch(`${base}/admin/services/reorder`, { method: 'POST', headers: H, body: JSON.stringify({ ids: ['wax', 'wash_std'] }) });
  j = await r.json();
  ok('后台排序生效', r.status === 200 && j.services.findIndex((s) => s.id === 'wax') < j.services.findIndex((s) => s.id === 'wash_std'));

  r = await fetch(`${base}/admin/services/${newId}`, { method: 'DELETE', headers: H });
  ok('后台删除项目', r.status === 200);

  // 15. 后台会员查询 + 核销
  r = await fetch(`${base}/admin/members?keyword=${encodeURIComponent('粤B12345')}`, { headers: H });
  j = await r.json();
  ok('后台会员检索', j.total === 1 && j.list[0].platePretty === '粤B·12345');
  r = await fetch(`${base}/admin/consume`, { method: 'POST', headers: H, body: JSON.stringify({ plateNo: '粤B12345', serviceId: 'wash_std', useCount: true, operator: '后台' }) });
  j = await r.json();
  ok('后台核销走同一业务链路', r.status === 200 && j.washCount === 2);

  // 16. 预约：时段 → 下单 → 重复 409 → 门店确认 → 取消
  await fetch(`${base}/customer/bind`, { method: 'POST', headers: { 'x-openid': 'mock_last4', 'content-type': 'application/json' }, body: JSON.stringify({ plateNo: '粤B12345', phone: '8000' }) });
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  r = await fetch(`${base}/customer/slots?date=${tomorrow}`, { headers: { 'x-openid': 'mock_last4' } });
  j = await r.json();
  ok('预约时段返回剩余量', r.status === 200 && j.slots.length === 9 && j.slots[0].left === 3);

  r = await fetch(`${base}/customer/bookings`, { method: 'POST', headers: { 'x-openid': 'mock_last4', 'content-type': 'application/json' }, body: JSON.stringify({ serviceId: 'wax', date: tomorrow, time: '10:00', remark: '有泥' }) });
  j = await r.json();
  const bkId = j.booking && j.booking.id;
  ok('车主下单成功（待确认）', r.status === 201 && !!bkId && j.booking.status === 'pending' && j.booking.statusText === '待确认', bkId);

  r = await fetch(`${base}/customer/bookings`, { method: 'POST', headers: { 'x-openid': 'mock_last4', 'content-type': 'application/json' }, body: JSON.stringify({ serviceId: 'wax', date: tomorrow, time: '10:00' }) });
  ok('同时段重复下单 409', r.status === 409);

  r = await fetch(`${base}/staff/bookings?date=${tomorrow}`, { headers: H });
  j = await r.json();
  ok('门店端能看到预约', r.status === 200 && j.list.some((b) => b.id === bkId));

  r = await fetch(`${base}/staff/bookings/${bkId}/status`, { method: 'POST', headers: H, body: JSON.stringify({ status: 'confirmed' }) });
  j = await r.json();
  ok('门店确认预约', r.status === 200 && j.booking.status === 'confirmed');

  r = await fetch(`${base}/staff/bookings/${bkId}/status`, { method: 'POST', headers: H, body: JSON.stringify({ status: 'done' }) });
  ok('状态机拦截非法跳转（待到店→已完成）', r.status === 400);

  r = await fetch(`${base}/customer/bookings`, { headers: { 'x-openid': 'mock_last4' } });
  j = await r.json();
  ok('我的预约列表带状态文案', j.list.length === 1 && j.list[0].statusText === '待到店');

  r = await fetch(`${base}/customer/bookings/${bkId}/cancel`, { method: 'POST', headers: { 'x-openid': 'mock_last4' } });
  j = await r.json();
  ok('车主取消预约', r.status === 200 && j.booking.status === 'cancelled');

  server.close();
  fs.unlinkSync(process.env.CATALOG_FILE);
  if (fs.existsSync(process.env.BOOKINGS_FILE)) fs.unlinkSync(process.env.BOOKINGS_FILE);
  const failed = results.filter((x) => !x.pass);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('测试异常:', e); process.exit(1); });
