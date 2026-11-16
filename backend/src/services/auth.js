/**
 * 微信登录与车主绑定（不调用任何收费接口）
 *
 * - 微信登录只调 code2session（免费）：code → openid
 * - 车主绑定：车牌 + 手机号（支持完整手机号，或手机号后 4 位）
 *   不接短信、不接手机号快速验证组件（按次收费），所以用「档案里已有的手机号」做校验
 * - 员工/老板：走员工口令（ADMIN_TOKEN），不依赖手机号
 */
const cfg = require('../config');
const { pool } = require('../db');
const { validatePlate, normalizePlate } = require('../utils/plate');
const { hashPhone, tailHash, decryptPhone } = require('../utils/crypto');

async function wxLogin(code) {
  if (!code) {
    const e = new Error('缺少 wx.login 的 code'); e.status = 400; throw e;
  }
  if (cfg.wx.mock || !cfg.wx.appId || !cfg.wx.secret) {
    return { openid: `mock_${String(code).slice(0, 24)}`, mock: true };
  }
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(cfg.wx.appId)}&secret=${encodeURIComponent(cfg.wx.secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const res = await fetch(url);
  const j = await res.json().catch(() => ({}));
  if (!j.openid) {
    const e = new Error(`微信登录失败：${j.errcode || ''} ${j.errmsg || '未返回 openid'}`);
    e.status = 502;
    throw e;
  }
  return { openid: j.openid, sessionKey: j.session_key, mock: false };
}

/* ---------- 绑定尝试节流（内存，重启即清空） ---------- */
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_TRY = 6;

function throttle(key) {
  const now = Date.now();
  const rec = attempts.get(key) || { count: 0, start: now };
  if (now - rec.start > WINDOW_MS) { rec.count = 0; rec.start = now; }
  rec.count += 1;
  attempts.set(key, rec);
  if (rec.count > MAX_TRY) {
    const e = new Error('尝试次数过多，请 10 分钟后再试，或联系门店'); e.status = 429; throw e;
  }
}

/** 手机号比对（密文存储 + HMAC 盲索引；兼容未迁移的旧明文行） */
function phoneMatches(row, input) {
  const v = String(input || '').replace(/\D/g, '');
  if (!v) return false;
  if (v.length === 11) {
    if (row.phone_hash) return row.phone_hash === hashPhone(v);
    return decryptPhone(row.phone) === v;           // 旧数据兜底
  }
  if (v.length === 4) {
    if (row.phone_tail_hash) return row.phone_tail_hash === tailHash(v);
    return decryptPhone(row.phone).slice(-4) === v; // 旧数据兜底
  }
  return false;
}

/** 车主绑定：车牌 + 手机号（或后 4 位） */
async function bindMember({ openid, plateNo, phone }) {
  if (!openid) {
    const e = new Error('未登录'); e.status = 401; throw e;
  }
  throttle(`bind:${openid}`);

  const v = validatePlate(plateNo);
  if (!v.ok) {
    const e = new Error(`车牌格式不正确：${v.reason}`); e.status = 400; throw e;
  }
  const input = String(phone || '').replace(/\D/g, '');
  if (input.length !== 11 && input.length !== 4) {
    const e = new Error('请填写登记的 11 位手机号，或手机号后 4 位'); e.status = 400; throw e;
  }

  const [rows] = await pool.query('SELECT * FROM `js_member` WHERE plate_no = ? LIMIT 1', [normalizePlate(v.plate)]);
  const row = rows[0];
  if (!row) {
    const e = new Error('没有找到这辆车的会员卡，请先到店建档'); e.status = 404; throw e;
  }
  if (row.openid && row.openid !== openid) {
    const e = new Error('这辆车已绑定其他微信，如需变更请联系门店'); e.status = 409; throw e;
  }
  if (!row.phone) {
    const e = new Error('这辆车还没登记手机号，请到门店补登后再绑定'); e.status = 400; throw e;
  }
  if (!phoneMatches(row, input)) {
    const e = new Error('手机号与门店登记的不一致'); e.status = 403; throw e;
  }
  try {
    await pool.query('UPDATE `js_member` SET openid = ? WHERE id = ?', [openid, row.id]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      const err = new Error('这个微信已经绑定过一辆车，请先在「我的」里解绑'); err.status = 409; throw err;
    }
    throw e;
  }
  return { plateNo: row.plate_no };
}

async function findByOpenid(openid) {
  if (!openid) return null;
  const [rows] = await pool.query('SELECT * FROM `js_member` WHERE openid = ? LIMIT 1', [openid]);
  return rows[0] || null;
}

async function unbind(openid) {
  const [r] = await pool.query('UPDATE `js_member` SET openid = NULL WHERE openid = ?', [openid]);
  return { ok: true, affected: r.affectedRows };
}

module.exports = { wxLogin, bindMember, findByOpenid, unbind, phoneMatches };
