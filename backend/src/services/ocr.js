const crypto = require('crypto');
const cfg = require('../config');
const { fixOcrConfusion, validatePlate } = require('../utils/plate');

const HOST = 'ocr.tencentcloudapi.com';
const SERVICE = 'ocr';
const ACTION = 'LicensePlateOCR';
const VERSION = '2018-11-19';

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
  const canonicalRequest = [
    'POST', '/', '',
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payloadStr),
  ].join('\n');

  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = [
    'TC3-HMAC-SHA256', String(timestamp), credentialScope, sha256Hex(canonicalRequest),
  ].join('\n');

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

/** 调腾讯云车牌识别；返回统一结构 */
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

/**
 * 统一识别入口
 * @param {Buffer|string} input Buffer 或 base64 字符串
 */
async function recognizePlate(input) {
  if (cfg.ocr.mock || !cfg.ocr.secretId || !cfg.ocr.secretKey) {
    return { ...mockOcr(), engine: 'mock' };
  }
  const b64 = Buffer.isBuffer(input) ? input.toString('base64') : String(input).replace(/^data:image\/\w+;base64,/, '');
  if (b64.length > 7 * 1024 * 1024) {
    const e = new Error('图片过大（base64 上限约 7MB）');
    e.status = 413;
    throw e;
  }
  try {
    const r = await tencentOcr(b64);
    return { ...r, engine: 'tencent' };
  } catch (e) {
    // 识别服务挂了也别让前台卡死：回退人工输入
    return { plate: '', color: '', confidence: 0, engine: 'tencent', error: e.message, candidates: [], raw: null };
  }
}

module.exports = { recognizePlate, ACTION };
