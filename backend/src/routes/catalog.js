const express = require('express');
const catalog = require('../services/catalog');
const cfg = require('../config');

const router = express.Router();

/** GET /api/v1/catalog —— 小程序「店内项目」陈列（只返回上架的） */
router.get('/', async (req, res, next) => {
  try {
    const [services, tags] = await Promise.all([catalog.list({ tag: req.query.tag }), catalog.tags()]);
    res.json({ ok: true, services, tags, rechargePlans: cfg.rechargePlans });
  } catch (e) { next(e); }
});

/** GET /api/v1/catalog/:id */
router.get('/:id', async (req, res, next) => {
  try {
    const item = await catalog.get(req.params.id);
    if (!item) return res.status(404).json({ ok: false, msg: '项目不存在或已下架' });
    res.json({ ok: true, service: item });
  } catch (e) { next(e); }
});

module.exports = router;
