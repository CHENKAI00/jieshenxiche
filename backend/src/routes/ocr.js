const express = require('express');
const multer = require('multer');
const { recognizePlate } = require('../services/ocr');
const { validatePlate, prettyPlate } = require('../utils/plate');
const { getMemberView } = require('../services/member');
const cfg = require('../config');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

/**
 * POST /api/v1/ocr/plate
 * form-data: file=<图片>          （小程序 wx.uploadFile）
 * 或 JSON: { image: "<base64>" }
 * 识别成功直接带出会员信息，前端一次请求就能出卡片
 */
router.post('/plate', upload.single('file'), async (req, res, next) => {
  try {
    let input = null;
    if (req.file && req.file.buffer) input = req.file.buffer;
    else if (req.body && req.body.image) input = req.body.image;
    if (!input) return res.status(400).json({ ok: false, msg: '缺少图片：请用 file 字段上传，或传 image(base64)' });

    const result = await recognizePlate(input);
    const v = validatePlate(result.plate);
    let member = null;
    if (v.ok) {
      const m = await getMemberView(v.plate);
      member = m.exists ? m : null;
    }
    res.json({
      ok: true,
      engine: result.engine,
      plateNo: v.ok ? v.plate : result.plate,
      platePretty: prettyPlate(v.ok ? v.plate : result.plate),
      plateColor: result.color || v.color || '',
      confidence: result.confidence,
      plateValid: v.ok,
      reason: v.ok ? '' : (result.error || v.reason),
      candidates: result.candidates || [],
      exists: !!member,
      member,
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/v1/ocr/meta  —— 前端展示价目表/等级，避免两端硬编码 */
router.get('/meta', (req, res) => {
  res.json({ ok: true, items: cfg.items, levels: cfg.levels, ocrEngine: cfg.ocr.mock || !cfg.ocr.secretId ? 'mock' : 'tencent' });
});

module.exports = router;
