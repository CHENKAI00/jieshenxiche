/**
 * 手机号加密存储
 * - 落库：AES-256-GCM 密文（enc:v1.<iv>.<tag>.<data>），数据库里看不到明文
 * - 检索：HMAC-SHA256 盲索引 phone_hash（精确匹配）、phone_tail_hash（后 4 位匹配）
 * - 兼容：读到非 enc:v1 开头的旧明文时原样返回，迁移脚本会把它加密回写
 *
 * 密钥：.env 的 PHONE_ENC_KEY（base64 的 32 字节）。缺失时用 sha256(ADMIN_TOKEN) 兜底并告警。
 */
const crypto = require('crypto');

let cachedKey = null;
let cachedRaw = '';

function key() {
  const raw = process.env.PHONE_ENC_KEY || '';
  if (cachedKey && raw === cachedRaw) return cachedKey;
  cachedRaw = raw;
  if (raw) {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 32) { cachedKey = buf; return cachedKey; }
    console.warn('[crypto] PHONE_ENC_KEY 不是 32 字节 base64，已退回派生密钥，请执行 npm run keygen');
  }
  const seed = process.env.ADMIN_TOKEN || 'jieshenxiche';
  cachedKey = crypto.createHash('sha256').update(`phone:${seed}`).digest();
  return cachedKey;
}

function normalize(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/** 加密：11 位手机号 → enc:v1.xxx */
function encryptPhone(plain) {
  const p = normalize(plain);
  if (!p) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(p, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1.${iv.toString('base64')}.${tag.toString('base64')}.${data.toString('base64')}`;
}

/** 解密：兼容旧明文 */
function decryptPhone(stored) {
  if (!stored) return '';
  const s = String(stored);
  if (!s.startsWith('enc:v1.')) return s;
  try {
    const [, ivB64, tagB64, dataB64] = s.split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch (e) {
    return '';
  }
}

/** 盲索引：完整手机号 */
function hashPhone(plain) {
  const p = normalize(plain);
  if (!p) return null;
  return crypto.createHmac('sha256', key()).update(`phone:${p}`).digest('hex');
}

/** 盲索引：后 4 位 */
function tailHash(plain) {
  const p = normalize(plain);
  if (p.length < 4) return null;
  return crypto.createHmac('sha256', key()).update(`tail:${p.slice(-4)}`).digest('hex');
}

/** 脱敏展示 138****8000 */
function maskPhone(plain) {
  const p = normalize(plain);
  if (!p) return '';
  if (p.length === 11) return `${p.slice(0, 3)}****${p.slice(-4)}`;
  return p.replace(/.(?=.{2})/g, '*');
}

/** 生成新密钥（base64 32 字节） */
function generateKey() {
  return crypto.randomBytes(32).toString('base64');
}

module.exports = { encryptPhone, decryptPhone, hashPhone, tailHash, maskPhone, generateKey, normalize };
