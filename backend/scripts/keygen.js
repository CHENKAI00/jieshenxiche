/** 生成/查看手机号加密密钥：node scripts/keygen.js [--write] */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ENV = path.join(__dirname, '..', '.env');

const raw = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
const exist = (raw.match(/^PHONE_ENC_KEY=(.*)$/m) || [])[1] || '';
const key = crypto.randomBytes(32).toString('base64');

if (process.argv.includes('--write')) {
  const next = raw.includes('PHONE_ENC_KEY')
    ? raw.replace(/^PHONE_ENC_KEY=.*$/m, `PHONE_ENC_KEY=${key}`)
    : `${raw.replace(/\s*$/, '')}\n# 手机号加密密钥（32 字节 base64）\nPHONE_ENC_KEY=${key}\n`;
  fs.writeFileSync(ENV, next, { mode: 0o600 });
  console.log('已写入 .env：PHONE_ENC_KEY=' + key);
  console.log('⚠️ 换密钥后历史手机号将无法解密，务必先备份');
} else {
  console.log('当前密钥:', exist || '(未配置，使用 ADMIN_TOKEN 派生，不安全)');
  console.log('可生成新密钥:', key);
  console.log('写入 .env：node scripts/keygen.js --write');
}
