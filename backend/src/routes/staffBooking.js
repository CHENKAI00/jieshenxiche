const express = require('express');
const bookings = require('../services/bookings');
const members = require('../services/member');

const router = express.Router();

/** GET /api/v1/staff/bookings?date=&status= 门店端预约看板 */
router.get('/bookings', async (req, res, next) => {
  try {
    const list = await bookings.listStaff({ date: req.query.date || '', status: req.query.status || '' });
    res.json({ ok: true, list, today: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }) });
  } catch (e) { next(e); }
});

/** POST /api/v1/staff/bookings/:id/status { status } 推进状态 */
router.post('/bookings/:id/status', async (req, res, next) => {
  try {
    const item = await bookings.setStatus(req.params.id, (req.body || {}).status, req.get('x-name') || '门店');
    res.json({ ok: true, booking: item });
  } catch (e) { next(e); }
});

/** POST /api/v1/staff/bookings/:id/finish 完成服务并核销（扣次数/余额） */
router.post('/bookings/:id/finish', async (req, res, next) => {
  try {
    const list = await bookings.listStaff({});
    const item = list.find((b) => b.id === req.params.id);
    if (!item) return res.status(404).json({ ok: false, msg: '预约不存在' });
    if (!['confirmed', 'serving'].includes(item.status)) {
      return res.status(400).json({ ok: false, msg: '只有「待到店 / 服务中」的预约可以核销' });
    }
    const out = await members.consume({
      plateNo: item.plateNo,
      serviceId: item.serviceId,
      useCount: req.body && req.body.useCount !== false,
      operator: req.get('x-name') || '门店',
    });
    await bookings.setStatus(item.id, 'done', req.get('x-name') || '门店');
    res.json({ ok: true, ...out });
  } catch (e) { next(e); }
});

module.exports = router;
