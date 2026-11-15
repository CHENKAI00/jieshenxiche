/**
 * 车主端登录 / 绑定
 * - 正式：wx.login → code → 微信 jscode2session 换 openid
 * - 本地：未配置 WX_APPID/WX_SECRET（或 WX_MOCK=1）时，openid 由 code 派生，方便调试
 * 绑定依据：车牌 + 该会员档案里登记的手机号，两者都对上才允许绑定。
 */
const cfg = require('../config');
const { pool } = require('../db');
const { validatePlate, normalizePlate } = require('../utils/plate');

async function wxLogin(code) {
  if (!code) {
    const e = new Error('缺少 wx.login 的 code');
    e.status = 400;
    throw e;
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

/** 车主绑定：车牌 + 档案里的手机号 */
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

module.exports = { wxLogin, bindMember, findByOpenid, unbind };
