/**
 * 车主/员工登录与身份判定
 *
 * 1) 微信手机号一键登录（button open-type="getPhoneNumber"）
 *    wx 端拿到 code → 这里换手机号：
 *      access_token（缓存 2 小时）→ wxa/business/getuserphonenumber
 *    未配置 WX_APPID/WX_SECRET 时走 mock：手机号由请求里的 phone 字段提供（仅调试）
 * 2) 身份判定：
 *    - 手机号在 STAFF_PHONES 白名单 → role=staff，回员工口令 token
 *    - 否则 role=customer：按手机号找会员卡，自动把 openid 绑到「还没被绑定」的那辆车上
 */
const cfg = require('../config');
const { pool } = require('../db');
const { validatePlate, normalizePlate } = require('../utils/plate');

let tokenCache = { value: '', expireAt: 0 };

async function getAccessToken() {
  if (cfg.wx.mock || !cfg.wx.appId || !cfg.wx.secret) return '';
  if (tokenCache.value && Date.now() < tokenCache.expireAt) return tokenCache.value;
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(cfg.wx.appId)}&secret=${encodeURIComponent(cfg.wx.secret)}`;
  const res = await fetch(url);
  const j = await res.json().catch(() => ({}));
  if (!j.access_token) {
    const e = new Error(`获取 access_token 失败：${j.errcode || ''} ${j.errmsg || ''}`);
    e.status = 502;
    throw e;
  }
  tokenCache = { value: j.access_token, expireAt: Date.now() + (Number(j.expires_in || 7200) - 300) * 1000 };
  return tokenCache.value;
}

/** getPhoneNumber 的 code → 手机号 */
async function getPhoneNumber(code, fallbackPhone) {
  if (!code) {
    const e = new Error('缺少手机号授权 code'); e.status = 400; throw e;
  }
  if (cfg.wx.mock || !cfg.wx.appId || !cfg.wx.secret) {
    const phone = String(fallbackPhone || '').replace(/\D/g, '');
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      const e = new Error('未配置微信 AppID/Secret，调试模式需要在请求里带 phone（11 位）');
      e.status = 400;
      throw e;
    }
    return { phone, mock: true };
  }
  const token = await getAccessToken();
  const res = await fetch(`https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const j = await res.json().catch(() => ({}));
  const info = j.phone_info || {};
  if (j.errcode || !info.purePhoneNumber) {
    const e = new Error(`获取手机号失败：${j.errcode || ''} ${j.errmsg || ''}`);
    e.status = 502;
    throw e;
  }
  return { phone: info.purePhoneNumber, mock: false };
}

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

/** 按手机号找会员卡，并把 openid 绑到一张「空闲」的卡上 */
async function bindByPhone({ openid, phone }) {
  const [rows] = await pool.query('SELECT * FROM `js_member` WHERE phone = ? ORDER BY last_service_at DESC, id DESC', [phone]);
  if (!rows.length) return { bound: false, members: [] };

  const mine = rows.find((r) => r.openid && r.openid === openid);
  if (mine) return { bound: true, memberId: mine.id };

  const free = rows.find((r) => !r.openid);
  if (!free) return { bound: false, reason: '这些车都已绑定其他微信，请在「我的」里解绑后再试' };

  try {
    await pool.query('UPDATE `js_member` SET openid = ? WHERE id = ?', [openid, free.id]);
    return { bound: true, memberId: free.id };
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return { bound: false, reason: '这个微信已绑定过其他车辆' };
    throw e;
  }
}

/** 手机号一键登录：一次性返回身份、口令、绑定的车 */
async function phoneLogin({ code, phone, openid }) {
  const got = await getPhoneNumber(code, phone);
  const isStaff = cfg.staffPhones.includes(got.phone);

  if (isStaff) {
    return {
      role: 'staff',
      phone: got.phone,
      token: cfg.adminToken,
      mock: got.mock,
      bound: false,
      member: null,
    };
  }

  let bind = { bound: false, reason: '' };
  if (openid) bind = await bindByPhone({ openid, phone: got.phone });

  let member = null;
  if (bind.memberId) {
    const [rows] = await pool.query('SELECT * FROM `js_member` WHERE id = ?', [bind.memberId]);
    if (rows[0]) member = rows[0];
  }
  return {
    role: 'customer',
    phone: got.phone,
    token: '',
    mock: got.mock,
    bound: !!member,
    reason: member ? '' : (bind.reason || '这个手机号还没有会员卡，到店建档后即可绑定'),
    memberRow: member,
  };
}

/** 车主绑定：车牌 + 档案里的手机号（保留，作为手机号登录之外的兜底） */
async function bindMember({ openid, plateNo, phone }) {
  if (!openid) {
    const e = new Error('未登录'); e.status = 401; throw e;
  }
  const v = validatePlate(plateNo);
  if (!v.ok) {
    const e = new Error(`车牌格式不正确：${v.reason}`); e.status = 400; throw e;
  }
  if (!/^1[3-9]\d{9}$/.test(String(phone || ''))) {
    const e = new Error('请填写 11 位手机号'); e.status = 400; throw e;
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
  if (String(row.phone) !== String(phone)) {
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

module.exports = { wxLogin, getPhoneNumber, phoneLogin, bindByPhone, bindMember, findByOpenid, unbind };
