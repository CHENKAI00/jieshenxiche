const express = require('express');
const bookings = require('../services/bookings');
const auth = require('../services/auth');
const members = require('../services/member');

const router = express.Router();

function customerAuth(req, res, next) {
  const openid = req.get('x-openid') || req.query.openid;
  if (!openid) return res.status(401).json({ ok: false, code: 'NO_LOGIN', msg: '请先微信登录' });
  req.openid = String(openid);
  next();
}

/** GET /api/v1/customer/slots?date=YYYY-MM-DD 预约日历用 */
router.get('/slots', customerAuth, async (req, res, next) => {
  try {
    res.json({ ok: true, date: req.query.date || '', slots: await bookings.slots(req.query.date) });
  } catch (e) { next(e); }
});

/** POST /api/v1/customer/bookings { serviceId, date, time, remark } */
router.post('/bookings', customerAuth, async (req, res, next) => {
  try {
    const row = await auth.findByOpenid(req.openid);
    if (!row) {
      return res.status(400).json({ ok: false, msg: '还没绑定爱车，先在「我的」里绑定才能预约' });
    }
    const body = req.body || {};
    const item = await bookings.create({
      openid: req.openid,
      plateNo: row.plate_no,
      serviceId: body.serviceId,
      date: body.date,
      time: body.time,
      remark: body.remark,
    });
    res.status(201).json({ ok: true, booking: item });
  } catch (e) { next(e); }
});

/** GET /api/v1/customer/bookings 我的预约 */
router.get('/bookings', customerAuth, async (req, res, next) => {
  try {
    res.json({ ok: true, list: await bookings.listByOpenid(req.openid) });
  } catch (e) { next(e); }
});

/** POST /api/v1/customer/bookings/:id/cancel */
router.post('/bookings/:id/cancel', customerAuth, async (req, res, next) => {
  try {
    res.json({ ok: true, booking: await bookings.cancelByCustomer(req.openid, req.params.id) });
  } catch (e) { next(e); }
});

module.exports = router;
