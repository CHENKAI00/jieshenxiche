const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cfg = require('../config');
const catalog = require('../services/catalog');
const members = require('../services/member');
const { staffAuth } = require('../middleware/auth');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '');
    const safe = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, safe);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error('只支持 jpg / png / webp / gif 图片'), ok);
  },
});

/** POST /api/v1/admin/login { password } → { token } */
router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password) !== String(cfg.adminToken)) {
    return res.status(401).json({ ok: false, msg: '口令不正确' });
  }
  res.json({ ok: true, token: cfg.adminToken, expiresIn: 7 * 24 * 3600 });
});

// 以下全部需要 x-token
router.use(staffAuth);

/** 后台看板 */
router.get('/overview', async (req, res, next) => {
  try {
    const [stat, recent, services] = await Promise.all([
      members.overview(), members.recentVisits(10), catalog.list({ all: true }),
    ]);
    res.json({ ok: true, ...stat, servicesCount: services.length, servicesOn: services.filter((s) => s.on).length, recent });
  } catch (e) { next(e); }
});

/* ---------------- 项目管理 ---------------- */
router.get('/services', async (req, res, next) => {
  try {
    res.json({ ok: true, services: await catalog.list({ all: true }), tags: await catalog.tags() });
  } catch (e) { next(e); }
});

router.post('/services', async (req, res, next) => {
  try {
    res.status(201).json({ ok: true, service: await catalog.create(req.body || {}) });
  } catch (e) { next(e); }
});

router.put('/services/:id', async (req, res, next) => {
  try {
    res.json({ ok: true, service: await catalog.update(req.params.id, req.body || {}) });
  } catch (e) { next(e); }
});

router.delete('/services/:id', async (req, res, next) => {
  try {
    res.json({ ok: true, service: await catalog.remove(req.params.id) });
  } catch (e) { next(e); }
});

/** 排序：{ ids: ['a','b','c'] } */
router.post('/services/reorder', async (req, res, next) => {
  try {
    res.json({ ok: true, services: await catalog.reorder((req.body || {}).ids) });
  } catch (e) { next(e); }
});

/** 图片上传（项目封面） */
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, msg: '没有收到文件' });
  res.json({ ok: true, url: `/uploads/${req.file.filename}`, size: req.file.size });
});

/* ---------------- 会员管理 ---------------- */
router.get('/members', async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await members.listMembers(req.query)) });
  } catch (e) { next(e); }
});

router.get('/members/:plate', async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await members.getMemberView(req.params.plate)) });
  } catch (e) { next(e); }
});

/** 后台也能核销（和前台同一条业务链路） */
router.post('/consume', async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await members.consume(req.body || {})) });
  } catch (e) { next(e); }
});

router.post('/recharge', async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await members.recharge(req.body || {})) });
  } catch (e) { next(e); }
});

router.get('/recent', async (req, res, next) => {
  try {
    res.json({ ok: true, list: await members.recentVisits(req.query.limit) });
  } catch (e) { next(e); }
});

module.exports = router;
