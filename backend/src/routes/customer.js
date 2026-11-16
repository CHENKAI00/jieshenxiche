const express = require('express');
const multer = require('multer');
const auth = require('../services/auth');
const catalog = require('../services/catalog');
const members = require('../services/member');
const cfg = require('../config');
const { recognizePlate, recognizeBatch } = require('../services/ocr');
const { validatePlate, prettyPlate } = require('../utils/plate');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

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

/**
 * POST /api/v1/customer/ocr
 * 车主端拍照/相册识别车牌（只返回车牌与候选，不返回任何会员信息）
 * form-data: file / files[]  或 JSON: { image } / { images: [] }
 */
router.post('/ocr', customerAuth, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: 5 }]), async (req, res, next) => {
  try {
    const files = [];
    if (req.files && req.files.file) files.push(req.files.file[0].buffer);
    if (req.files && req.files.files) req.files.files.forEach((f) => files.push(f.buffer));
    if (!files.length && req.body && req.body.image) files.push(req.body.image);
    if (!files.length && req.body && Array.isArray(req.body.images)) files.push(...req.body.images);
    if (!files.length) return res.status(400).json({ ok: false, msg: '缺少图片' });

    if (files.length === 1) {
      const r = await recognizePlate(files[0]);
      const v = validatePlate(r.plate);
      return res.json({
        ok: true,
        engine: r.engine,
        plateNo: v.ok ? v.plate : (r.plate || ''),
        platePretty: prettyPlate(v.ok ? v.plate : r.plate),
        plateColor: v.color || r.color || '',
        confidence: r.confidence,
        plateValid: v.ok,
        reason: v.ok ? '' : (r.error || v.reason),
        votes: 1,
        candidates: (r.candidates || []).map((c) => ({ plate: c.plate, confidence: c.confidence })),
      });
    }

    const { frames, ranked, top } = await recognizeBatch(files);
    if (!top) {
      return res.json({ ok: true, plateNo: '', plateValid: false, reason: '未识别到车牌', votes: 0, candidates: [] });
    }
    const v = validatePlate(top.plate);
    res.json({
      ok: true,
      engine: frames[0] ? frames[0].engine : 'unknown',
      plateNo: v.ok ? v.plate : top.plate,
      platePretty: prettyPlate(v.ok ? v.plate : top.plate),
      plateColor: v.color || top.color || '',
      confidence: top.avgConfidence,
      plateValid: v.ok,
      reason: v.ok ? '' : '识别结果不完整，请手动修正',
      votes: top.votes,
      candidates: ranked.map((c) => ({ plate: c.plate, confidence: c.avgConfidence, votes: c.votes })),
    });
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
