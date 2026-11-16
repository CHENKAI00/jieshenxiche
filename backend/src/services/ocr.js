const crypto = require('crypto');
const cfg = require('../config');
const { fixOcrConfusion, validatePlate } = require('../utils/plate');

const HOST = 'ocr.tencentcloudapi.com';
const SERVICE = 'ocr';
const ACTION = 'LicensePlateOCR';
const VERSION = '2018-11-19';

/* ============================================================
 * 三种识别引擎，统一出口 recognizePlate()
 *
 *  1) mock      ：本地演示，随机返回演示车牌（0 成本）
 *  2) hyperlpr  ：本地/自建服务（scripts/hyperlpr_service.py，免费离线）
 *                 POST /recognize {image:base64} → {results:[{plate,color,confidence}]}
 *  3) tencent   ：腾讯云 LicensePlateOCR（按次计费，准确率高）
 *
 * .env:
 *   OCR_ENGINE=auto|mock|hyperlpr|tencent   （auto：本地服务在就用本地，否则有密钥用腾讯云）
 *   HYPERLPR_URL=http://127.0.0.1:18090
 * ============================================================ */

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}
function hmac(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}

/** 腾讯云 TC3-HMAC-SHA256 签名（不依赖官方 SDK，少一个依赖） */
function buildHeaders(payloadStr, secretId, secretKey) {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const contentType = 'application/json; charset=utf-8';

  const canonicalHeaders = `content-type:${contentType}\nhost:${HOST}\nx-tc-action:${ACTION.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256Hex(payloadStr)].join('\n');

  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), credentialScope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmac(`TC3${secretKey}`, date);
  const kService = hmac(kDate, SERVICE);
  const kSigning = hmac(kService, 'tc3_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return {
    Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'Content-Type': contentType,
    Host: HOST,
    'X-TC-Action': ACTION,
    'X-TC-Version': VERSION,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Region': cfg.ocr.region,
  };
}

/** 腾讯云车牌识别 */
async function tencentOcr(imageBase64) {
  const payload = JSON.stringify({ ImageBase64: imageBase64 });
  const headers = buildHeaders(payload, cfg.ocr.secretId, cfg.ocr.secretKey);
  const res = await fetch(`https://${HOST}/`, { method: 'POST', headers, body: payload });
  const json = await res.json();
  const r = json.Response || {};
  if (r.Error) {
    const err = new Error(`OCR失败: ${r.Error.Code} ${r.Error.Message}`);
    err.code = r.Error.Code;
    err.status = 502;
    throw err;
  }
  const list = r.LicensePlateInfos || [];
  if (!list.length) return { plate: '', color: '', confidence: 0, raw: r, candidates: [] };
  list.sort((a, b) => (b.Confidence || 0) - (a.Confidence || 0));
  const top = list[0];
  return {
    plate: fixOcrConfusion(top.Number || ''),
    color: top.Color || '',
    confidence: Number(top.Confidence || 0) / 100,
    raw: r,
    candidates: list.map((x) => ({ plate: fixOcrConfusion(x.Number || ''), color: x.Color, confidence: Number(x.Confidence || 0) / 100 })),
  };
}

/** 本地 HyperLPR3 服务（免费离线），不可用时抛错由上层降级 */
async function hyperlprOcr(imageBase64) {
  const url = `${cfg.ocr.hyperlprUrl.replace(/\/+$/, '')}/recognize`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: imageBase64 }),
    signal: AbortSignal.timeout(5000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) throw new Error(`本地识别服务异常：${j.msg || res.status}`);
  const list = (j.results || []).map((x) => ({
    plate: fixOcrConfusion(x.plate || ''),
    color: x.color || '',
    confidence: Number(x.confidence || 0),
    bbox: x.bbox || [],
  }));
  list.sort((a, b) => b.confidence - a.confidence);
  const top = list[0] || { plate: '', color: '', confidence: 0 };
  return { plate: top.plate, color: top.color, confidence: top.confidence, raw: j, candidates: list };
}

const MOCK_PLATES = ['粤B12345', '粤BD12345', '粤A66666', '粤B12346', '粤B8888G'];

function mockOcr() {
  const plate = MOCK_PLATES[Math.floor(Math.random() * MOCK_PLATES.length)];
  const v = validatePlate(plate);
  return {
    plate: v.plate,
    color: v.color || '蓝',
    confidence: 0.97,
    raw: { mock: true },
    candidates: [{ plate: v.plate, color: v.color || '蓝', confidence: 0.97 }],
  };
}

function toBase64(input) {
  if (Buffer.isBuffer(input)) return input.toString('base64');
  return String(input).replace(/^data:image\/\w+;base64,/, '');
}

/**
 * 统一识别入口
 * @param {Buffer|string} input Buffer 或 base64 字符串
 */
async function recognizePlate(input) {
  const b64 = toBase64(input);
  if (b64.length > 7 * 1024 * 1024) {
    const e = new Error('图片过大（base64 上限约 7MB）');
    e.status = 413;
    throw e;
  }

  const want = cfg.ocr.mock ? 'mock' : (cfg.ocr.engine || 'auto');
  const hasTencent = !!(cfg.ocr.secretId && cfg.ocr.secretKey);

  const tryHyperlpr = async () => {
    try {
      const r = await hyperlprOcr(b64);
      return { ...r, engine: 'hyperlpr' };
    } catch (e) {
      return { plate: '', color: '', confidence: 0, engine: 'hyperlpr', error: e.message, candidates: [], raw: null };
    }
  };
  const tryTencent = async () => {
    try {
      const r = await tencentOcr(b64);
      return { ...r, engine: 'tencent' };
    } catch (e) {
      return { plate: '', color: '', confidence: 0, engine: 'tencent', error: e.message, candidates: [], raw: null };
    }
  };

  if (want === 'mock') return { ...mockOcr(), engine: 'mock' };

  if (want === 'hyperlpr') {
    const r = await tryHyperlpr();
    if (r.error && hasTencent) return tryTencent(); // 本地挂了且有云密钥，兜底
    return r;
  }

  if (want === 'tencent') {
    if (!hasTencent) return { ...mockOcr(), engine: 'mock', note: '未配置腾讯云密钥，已降级 mock' };
    return tryTencent();
  }

  // auto：先本地（免费），不可用再云，再不行 mock
  const local = await tryHyperlpr();
  if (!local.error) return local;
  if (hasTencent) return tryTencent();
  return { ...mockOcr(), engine: 'mock', note: `本地识别未启动（${local.error}），已降级 mock` };
}

module.exports = { recognizePlate, ACTION };
