/**
 * 门店服务项目目录（店内陈列 + 后台管理）
 *
 * 为什么不用第二张表：店主明确「只能新建一个表」，而项目目录需要后台增删改。
 * 折中方案：目录落在后端 JSON 文件（data/services.json），图片落在 backend/uploads/，
 * 数据库仍然只有 js_member 一张表。以后想搬进 MySQL，把本文件的读写换成 SQL 即可，
 * 接口与前端都不用动。
 */
const fs = require('fs/promises');
const path = require('path');

const FILE = process.env.CATALOG_FILE || path.join(__dirname, '..', '..', 'data', 'services.json');

let cache = null;
let chain = Promise.resolve();

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

async function load() {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    cache = JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') {
      cache = { version: 1, updatedAt: new Date().toISOString(), services: [] };
      await save(cache);
    } else {
      throw e;
    }
  }
  if (!Array.isArray(cache.services)) cache.services = [];
  return cache;
}

function save(data) {
  // 串行化写入 + 原子替换，避免并发写把文件写坏
  chain = chain.then(async () => {
    data.updatedAt = new Date().toISOString();
    const tmp = `${FILE}.tmp`;
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmp, FILE);
  });
  return chain;
}

function normalize(s) {
  return {
    id: s.id,
    name: String(s.name || '').trim(),
    tag: String(s.tag || '洗车').trim(),
    price: Number(s.price || 0),
    mins: Number(s.mins || 0),
    desc: String(s.desc || '').trim(),
    emoji: String(s.emoji || '🧽'),
    image: String(s.image || ''),
    countKey: s.countKey === 'wash' || s.countKey === 'wax' ? s.countKey : null,
    on: s.on !== false,
    sort: Number(s.sort || 0),
  };
}

function slug(name) {
  const base = `svc_${Date.now().toString(36)}`;
  return name ? `${base}_${encodeURIComponent(name).replace(/%/g, '').slice(0, 8)}` : base;
}

/** 列表：默认只返回上架的（小程序），后台传 all=true 看全部 */
async function list({ all = false, tag = '' } = {}) {
  const data = await load();
  let arr = clone(data.services);
  if (!all) arr = arr.filter((s) => s.on);
  if (tag) arr = arr.filter((s) => s.tag === tag);
  arr.sort((a, b) => (a.sort || 0) - (b.sort || 0) || String(a.name).localeCompare(String(b.name)));
  return arr;
}

async function tags() {
  const arr = await list({ all: false });
  return [...new Set(arr.map((s) => s.tag))];
}

async function get(id) {
  const arr = await list({ all: true });
  return arr.find((s) => s.id === id) || null;
}

async function create(payload) {
  const data = await load();
  const item = normalize({ ...payload, id: payload.id || slug(payload.name) });
  if (!item.name) {
    const e = new Error('项目名称不能为空');
    e.status = 400;
    throw e;
  }
  if (!(item.price >= 0)) {
    const e = new Error('价格不正确');
    e.status = 400;
    throw e;
  }
  if (data.services.some((s) => s.id === item.id)) item.id = slug(item.name);
  if (!item.sort) item.sort = (Math.max(0, ...data.services.map((s) => s.sort || 0)) || 0) + 10;
  data.services.push(item);
  await save(data);
  return item;
}

async function update(id, patch) {
  const data = await load();
  const idx = data.services.findIndex((s) => s.id === id);
  if (idx < 0) {
    const e = new Error('项目不存在');
    e.status = 404;
    throw e;
  }
  const merged = normalize({ ...data.services[idx], ...patch, id });
  data.services[idx] = merged;
  await save(data);
  return merged;
}

async function remove(id) {
  const data = await load();
  const idx = data.services.findIndex((s) => s.id === id);
  if (idx < 0) {
    const e = new Error('项目不存在');
    e.status = 404;
    throw e;
  }
  const [gone] = data.services.splice(idx, 1);
  await save(data);
  return gone;
}

/** 拖拽/上下移排序：传 id 数组，按数组顺序重排 sort */
async function reorder(ids) {
  const data = await load();
  const map = new Map((ids || []).map((id, i) => [id, (i + 1) * 10]));
  data.services.forEach((s) => {
    if (map.has(s.id)) s.sort = map.get(s.id);
  });
  await save(data);
  return list({ all: true });
}

module.exports = { list, tags, get, create, update, remove, reorder, FILE };
