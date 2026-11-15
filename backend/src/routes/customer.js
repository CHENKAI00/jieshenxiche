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

/** POST /api/v1/customer/login  { code }  → { openid, mock }（code2session，免费接口） */
router.post('/login', async (req, res, next) => {
  try {
    const r = await auth.wxLogin((req.body || {}).code);
    // 老板本人微信：openid 命中白名单 → 直接进门店端
    if (cfg.bossOpenids.includes(r.openid)) {
      return res.json({ ok: true, ...r, role: 'staff', token: cfg.adminToken });
    }
    res.json({ ok: true, ...r, role: 'customer' });
  } catch (e) { next(e); }
});

/**
 * POST /api/v1/customer/bind  { plateNo, phone }
 * phone 可以是登记手机号，也可以是后 4 位；不需要短信、不调用收费接口
 */
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

/** POST /api/v1/customer/staff-login {password} 员工/老板登录（免费，纯口令） */
router.post('/staff-login', (req, res) => {
  const pwd = (req.body || {}).password;
  if (!pwd || String(pwd) !== String(cfg.adminToken)) {
    return res.status(401).json({ ok: false, msg: '口令不正确' });
  }
  res.json({ ok: true, role: 'staff', token: cfg.adminToken });
});

module.exports = router;
