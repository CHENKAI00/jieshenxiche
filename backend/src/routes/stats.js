const express = require('express');
const svc = require('../services/member');

const router = express.Router();

/** GET /api/v1/stats/overview  门店看板 */
router.get('/overview', async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await svc.overview()) });
  } catch (e) { next(e); }
});

/** GET /api/v1/stats/recent  最近流水 */
router.get('/recent', async (req, res, next) => {
  try {
    res.json({ ok: true, list: await svc.recentRecords(req.query.limit) });
  } catch (e) { next(e); }
});

module.exports = router;
