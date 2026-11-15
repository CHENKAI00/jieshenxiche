const express = require('express');
const auth = require('../services/auth');
const catalog = require('../services/catalog');
const members = require('../services/member');
const cfg = require('../config');

const router = express.Router();

function customerAuth(req, res, next) {
  const openid = req.get('x-openid') || req.query.openid;
  if (!openid) return res.status(401).json({ ok: false, code: 'NO_LOGIN', msg: '请先微信登录' });
  req.openid = String(openid);
  next();
}

/** POST /api/v1/customer/login  { code }  → { openid, mock } */
router.post('/login', async (req, res, next) => {
  try {
    const r = await auth.wxLogin((req.body || {}).code);
    res.json({ ok: true, ...r });
  } catch (e) { next(e); }
});

/**
 * POST /api/v1/customer/phone-login
 * { code, openid, phone? }
 *   code   = getPhoneNumber 回调里的 code（正式环境）
 *   phone  = 调试用（未配置 AppID/Secret 时必填）
 * 返回 { role: 'staff'|'customer', token?, bound, member?, reason? }
 */
router.post('/phone-login', async (req, res, next) => {
  try {
    const body = req.body || {};
    const r = await auth.phoneLogin({ code: body.code, phone: body.phone, openid: body.openid || req.get('x-openid') });
    const out = { ...r };
    if (out.memberRow) {
      out.member = members.toViewModel(out.memberRow);
      delete out.memberRow;
    }
    if (out.phone) out.phoneMasked = String(out.phone).replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
    delete out.phone;
    res.json({ ok: true, ...out });
  } catch (e) { next(e); }
});

/** POST /api/v1/customer/bind  { plateNo, phone }  → 兜底：车牌 + 手机号绑定 */
router.post('/bind', customerAuth, async (req, res, next) => {
  try {
    const body = req.body || {};
    await auth.bindMember({ openid: req.openid, plateNo: body.plateNo, phone: body.phone });
    const member = await members.getCustomerView(req.openid);
    res.json({ ok: true, member });
  } catch (e) { next(e); }
});

/** POST /api/v1/customer/unbind */
router.post('/unbind', customerAuth, async (req, res, next) => {
  try {
    res.json(await auth.unbind(req.openid));
  } catch (e) { next(e); }
});

/** GET /api/v1/customer/me  车主首页数据：自己的卡 + 项目菜单 */
router.get('/me', customerAuth, async (req, res, next) => {
  try {
    const [member, services, tags] = await Promise.all([
      members.getCustomerView(req.openid), catalog.list(), catalog.tags(),
    ]);
    res.json({ ok: true, bound: !!member, member, services, tags });
  } catch (e) { next(e); }
});

/** GET /api/v1/customer/services  店内项目（车主端也可看） */
router.get('/services', async (req, res, next) => {
  try {
    const [services, tags] = await Promise.all([catalog.list(), catalog.tags()]);
    res.json({ ok: true, services, tags, rechargePlans: cfg.rechargePlans });
  } catch (e) { next(e); }
});

module.exports = router;
