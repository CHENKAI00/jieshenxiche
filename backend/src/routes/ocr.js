const express = require('express');
const multer = require('multer');
const { recognizePlate, recognizeBatch } = require('../services/ocr');
const { validatePlate, prettyPlate } = require('../utils/plate');
const { bestMatch } = require('../utils/plateMatch');
const { getMemberView, listPlates } = require('../services/member');
const catalog = require('../services/catalog');
const cfg = require('../config');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

/**
 * 闭集校正：OCR 结果和会员库只差 1 个字符时，优先信会员库
 * （单店场景下这是一招「接近 100%」的关键——识别的是已知集合）
 */
async function resolveByKnown(plate, { autoCorrect = false, confidence = 0, votes = 1 } = {}) {
  const known = await listPlates();
  const m = bestMatch(plate, known.map((k) => k.plateNo));
  if (!m) return { plate, corrected: false, suggestion: null };
  if (m.exact) return { plate: m.plate, corrected: false, suggestion: null };
  const confident = votes >= 2 || confidence >= 0.9;
  const suggestion = {
    plate: m.plate,
    platePretty: prettyPlate(m.plate),
    distance: m.distance,
    nickname: (known.find((k) => k.plateNo === m.plate) || {}).nickname || '',
  };
  if (autoCorrect && m.distance === 1 && m.unique && confident) {
    return { plate: m.plate, corrected: true, suggestion };
  }
  return { plate, corrected: false, suggestion: m.distance <= 2 ? suggestion : null };
}

/**
 * POST /api/v1/ocr/plate
 * form-data: file=<图片>  或 JSON: { image: "<base64>" }
 * 单张识别：识别 + 闭集建议（不自动改，交给人确认）
 */
router.post('/plate', upload.single('file'), async (req, res, next) => {
  try {
    let input = null;
    if (req.file && req.file.buffer) input = req.file.buffer;
    else if (req.body && req.body.image) input = req.body.image;
    if (!input) return res.status(400).json({ ok: false, msg: '缺少图片：请用 file 字段上传，或传 image(base64)' });

    const result = await recognizePlate(input);
    const v = validatePlate(result.plate);
    // 单张：只给「是不是 粤B·12345？」的建议，绝不自动改（避免把新车错配到老会员）
    const resolved = v.ok
      ? await resolveByKnown(v.plate, { autoCorrect: false })
      : { plate: result.plate, corrected: false, suggestion: null };
    const finalPlate = resolved.plate;
    const fv = validatePlate(finalPlate);
    let member = null;
    if (fv.ok) {
      const m = await getMemberView(fv.plate);
      member = m.exists ? m : null;
    }
    res.json({
      ok: true,
      engine: result.engine,
      plateNo: fv.ok ? fv.plate : finalPlate,
      platePretty: prettyPlate(fv.ok ? fv.plate : finalPlate),
      plateColor: result.color || fv.color || '',
      confidence: result.confidence,
      votes: 1,
      corrected: resolved.corrected,
      suggestion: resolved.suggestion,
      plateValid: fv.ok,
      reason: fv.ok ? '' : (result.error || fv.reason),
      candidates: result.candidates || [],
      note: result.note || '',
      exists: !!member,
      member,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/v1/ocr/plate-batch
 * JSON: { images: ["<base64>", ...] }  或 form-data: files[]=<图片>（最多 5 张）
 * 连拍投票 → 闭集校正 → 返回最终车牌与每帧明细
 */
router.post('/plate-batch', upload.array('files', 5), async (req, res, next) => {
  try {
    let inputs = [];
    if (req.files && req.files.length) inputs = req.files.map((f) => f.buffer);
    else if (req.body && Array.isArray(req.body.images)) inputs = req.body.images;
    else if (req.body && req.body.image) inputs = [req.body.image];

    inputs = inputs.filter(Boolean).slice(0, 5);
    if (!inputs.length) return res.status(400).json({ ok: false, msg: '缺少图片：JSON 传 images 数组，或 form-data 传 files' });

    const { frames, ranked, top, totalFrames } = await recognizeBatch(inputs);
    if (!top) {
      return res.json({
        ok: true,
        engine: frames[0] ? frames[0].engine : 'unknown',
        plateNo: '',
        plateValid: false,
        reason: (frames[0] && (frames[0].error || '未识别到车牌')) || '未识别到车牌',
        frames: frames.map((f) => ({ plate: f.plate, confidence: f.confidence, engine: f.engine, error: f.error || '' })),
        candidates: [],
        votes: 0,
        exists: false,
        member: null,
      });
    }

    const v = validatePlate(top.plate);
    const resolved = v.ok
      ? await resolveByKnown(v.plate, { autoCorrect: true, confidence: top.avgConfidence, votes: top.votes })
      : { plate: top.plate, corrected: false, suggestion: null };
    const finalPlate = resolved.plate;
    const fv = validatePlate(finalPlate);
    let member = null;
    if (fv.ok) {
      const m = await getMemberView(fv.plate);
      member = m.exists ? m : null;
    }

    res.json({
      ok: true,
      engine: frames[0] ? frames[0].engine : 'unknown',
      totalFrames,
      votes: top.votes,
      plateNo: fv.ok ? fv.plate : finalPlate,
      platePretty: prettyPlate(fv.ok ? fv.plate : finalPlate),
      plateColor: top.color || fv.color || '',
      confidence: top.avgConfidence,
      corrected: resolved.corrected,
      suggestion: resolved.suggestion,
      plateValid: fv.ok,
      reason: fv.ok ? '' : (frames.map((f) => f.error).filter(Boolean)[0] || fv.reason),
      candidates: ranked,
      frames: frames.map((f) => ({ plate: f.plate, confidence: f.confidence, engine: f.engine, error: f.error || '' })),
      exists: !!member,
      member,
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/v1/ocr/meta —— 服务目录 + 充值档位 + 识别引擎状态 */
router.get('/meta', async (req, res, next) => {
  try {
    const [services, tags] = await Promise.all([catalog.list(), catalog.tags()]);
    res.json({
      ok: true,
      services,
      tags,
      rechargePlans: cfg.rechargePlans,
      ocrEngine: cfg.ocr.mock ? 'mock' : cfg.ocr.engine,
    });
  } catch (e) { next(e); }
});

module.exports = router;
