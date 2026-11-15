/**
 * 预约管理（车主端下单，门店端推进状态）
 *
 * 为什么不建第二张表：沿用项目目录的做法，数据落在 data/bookings.json，
 * 数据库仍然只有 js_member 一张表。接口层已抽象，将来要进 MySQL 只改本文件。
 *
 * 状态机：
 *   pending(待确认) → confirmed(待到店) → serving(服务中) → done(已完成)
 *   任意未完成状态 → cancelled(已取消)
 */
const fs = require('fs/promises');
const path = require('path');
const catalog = require('./catalog');

const FILE = process.env.BOOKINGS_FILE || path.join(__dirname, '..', '..', 'data', 'bookings.json');

const SLOTS = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
const CAPACITY = 3; // 每个时段最多接待 3 台
const MAX_DAYS_AHEAD = 30;

const STATUS_TEXT = {
  pending: '待确认',
  confirmed: '待到店',
  serving: '服务中',
  done: '已完成',
  cancelled: '已取消',
};

let cache = null;
let chain = Promise.resolve();

function clone(v) { return JSON.parse(JSON.stringify(v)); }

async function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') { cache = { items: [] }; await save(cache); }
    else throw e;
  }
  if (!Array.isArray(cache.items)) cache.items = [];
  return cache;
}

function save(data) {
  chain = chain.then(async () => {
    const tmp = `${FILE}.tmp`;
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmp, FILE);
  });
  return chain;
}

function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function id() {
  return `BK${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

/** 某天的时段剩余量（给预约日历用） */
async function slots(date) {
  const data = await load();
  const day = String(date || todayStr());
  const used = {};
  data.items
    .filter((b) => b.date === day && ['pending', 'confirmed', 'serving', 'done'].includes(b.status))
    .forEach((b) => { used[b.time] = (used[b.time] || 0) + 1; });
  return SLOTS.map((t) => ({ time: t, left: Math.max(0, CAPACITY - (used[t] || 0)) }));
}

/** 车主下单 */
async function create({ openid, plateNo, serviceId, date, time, remark }) {
  if (!openid) { const e = new Error('请先登录'); e.status = 401; throw e; }
  const svc = await catalog.get(serviceId);
  if (!svc || !svc.on) { const e = new Error('项目已下架，请重新选择'); e.status = 400; throw e; }

  const day = String(date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { const e = new Error('请选择日期'); e.status = 400; throw e; }
  const diff = Math.floor((new Date(`${day}T00:00:00+08:00`) - new Date(`${todayStr()}T00:00:00+08:00`)) / 86400000);
  if (diff < 0) { const e = new Error('不能预约过去的日期'); e.status = 400; throw e; }
  if (diff > MAX_DAYS_AHEAD) { const e = new Error(`最多提前 ${MAX_DAYS_AHEAD} 天预约`); e.status = 400; throw e; }
  if (!SLOTS.includes(time)) { const e = new Error('请选择时段'); e.status = 400; throw e; }

  const data = await load();
  const active = data.items.filter((b) => b.openid === openid && ['pending', 'confirmed', 'serving'].includes(b.status));
  if (active.some((b) => b.date === day && b.time === time)) {
    const e = new Error('这个时段你已经有一单了'); e.status = 409; throw e;
  }
  if (active.length >= 3) {
    const e = new Error('你还有未完成的预约，先完成或取消再约'); e.status = 409; throw e;
  }
  const used = data.items.filter((b) => b.date === day && b.time === time && ['pending', 'confirmed', 'serving', 'done'].includes(b.status)).length;
  if (used >= CAPACITY) { const e = new Error('该时段已约满，换个时间试试'); e.status = 409; throw e; }

  const item = {
    id: id(),
    openid,
    plateNo: String(plateNo || ''),
    serviceId: svc.id,
    serviceName: svc.name,
    price: svc.price,
    mins: svc.mins,
    date: day,
    time,
    remark: String(remark || '').slice(0, 100),
    status: 'pending',
    createdAt: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }),
    updatedAt: '',
    operator: '',
  };
  data.items.push(item);
  await save(data);
  return withText(item);
}

function withText(b) {
  return { ...b, statusText: STATUS_TEXT[b.status] || b.status };
}

async function listByOpenid(openid) {
  const data = await load();
  return data.items
    .filter((b) => b.openid === openid)
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    .map(withText);
}

async function listStaff({ date = '', status = '' } = {}) {
  const data = await load();
  return data.items
    .filter((b) => (!date || b.date === date) && (!status || b.status === status))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .map(withText);
}

async function cancelByCustomer(openid, bookingId) {
  const data = await load();
  const b = data.items.find((x) => x.id === bookingId && x.openid === openid);
  if (!b) { const e = new Error('预约不存在'); e.status = 404; throw e; }
  if (!['pending', 'confirmed'].includes(b.status)) {
    const e = new Error('当前状态不能取消，请联系门店'); e.status = 400; throw e;
  }
  b.status = 'cancelled';
  b.updatedAt = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
  await save(data);
  return withText(b);
}

const FLOW = { pending: ['confirmed', 'cancelled'], confirmed: ['serving', 'cancelled'], serving: ['done'], done: [], cancelled: [] };

async function setStatus(idOrBooking, status, operator = '门店') {
  const data = await load();
  const b = data.items.find((x) => x.id === idOrBooking);
  if (!b) { const e = new Error('预约不存在'); e.status = 404; throw e; }
  const allowed = FLOW[b.status] || [];
  if (!allowed.includes(status)) {
    const e = new Error(`不能从「${STATUS_TEXT[b.status]}」直接改成「${STATUS_TEXT[status] || status}」`);
    e.status = 400;
    throw e;
  }
  b.status = status;
  b.operator = operator;
  b.updatedAt = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
  await save(data);
  return withText(b);
}

module.exports = { SLOTS, CAPACITY, STATUS_TEXT, slots, create, listByOpenid, listStaff, cancelByCustomer, setStatus, FILE };
