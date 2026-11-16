/**
 * v4 → v5：手机号加密
 *  1) 若 .env 没有 PHONE_ENC_KEY，自动生成 32 字节密钥并写入 .env（权限 600）
 *  2) 加 phone_hash / phone_tail_hash 列，phone 改为存密文（VARCHAR(255)）
 *  3) 把历史明文手机号加密回填（幂等：已加密的行跳过）
 *
 * 执行：npm run migrate:v5
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ENV_PATH = path.join(__dirname, '..', '.env');

function ensureKey() {
  const raw = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const m = raw.match(/^PHONE_ENC_KEY=(.*)$/m);
  if (m && m[1].trim()) {
    process.env.PHONE_ENC_KEY = m[1].trim();
    console.log('✅ 已有 PHONE_ENC_KEY');
    return m[1].trim();
  }
  const key = require('crypto').randomBytes(32).toString('base64');
  const next = raw.includes('PHONE_ENC_KEY')
    ? raw.replace(/^PHONE_ENC_KEY=.*$/m, `PHONE_ENC_KEY=${key}`)
    : `${raw.replace(/\s*$/, '')}\n# 手机号加密密钥（32 字节 base64，丢了历史手机号不可解）\nPHONE_ENC_KEY=${key}\n`;
  fs.writeFileSync(ENV_PATH, next, { mode: 0o600 });
  process.env.PHONE_ENC_KEY = key;
  console.log('✅ 已生成 PHONE_ENC_KEY 并写入 .env（请备份，换了就解不开历史数据）');
  return key;
}

(async () => {
  ensureKey();
  const cfg = require('../src/config');
  const { encryptPhone, hashPhone, tailHash } = require('../src/utils/crypto');

  const c = await mysql.createConnection({
    host: cfg.db.host, port: cfg.db.port, user: cfg.db.user,
    password: cfg.db.password, database: cfg.db.database, charset: 'utf8mb4',
  });

  const cols = async () => {
    const [rows] = await c.query(
      'SELECT COLUMN_NAME n, COLUMN_TYPE t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?',
      [cfg.db.database, 'js_member']
    );
    return rows;
  };
  let list = await cols();
  const has = (n) => list.some((x) => x.n === n);

  if (!has('phone_hash')) {
    await c.query("ALTER TABLE `js_member` ADD COLUMN `phone_hash` CHAR(64) DEFAULT NULL COMMENT '手机号 HMAC 盲索引（完整号）' AFTER `phone`");
    console.log('✅ + phone_hash');
  } else console.log('↷ phone_hash 已存在');
  if (!has('phone_tail_hash')) {
    await c.query("ALTER TABLE `js_member` ADD COLUMN `phone_tail_hash` CHAR(64) DEFAULT NULL COMMENT '手机号后 4 位 HMAC 盲索引' AFTER `phone_hash`");
    console.log('✅ + phone_tail_hash');
  } else console.log('↷ phone_tail_hash 已存在');

  await c.query("ALTER TABLE `js_member` MODIFY COLUMN `phone` VARCHAR(255) DEFAULT NULL COMMENT '手机号密文（AES-256-GCM，enc:v1.…）'").catch(() => {});
  await c.query('ALTER TABLE `js_member` ADD KEY `idx_phone_hash` (`phone_hash`)').catch((e) => {
    if (e.code !== 'ER_DUP_KEYNAME') console.log('↷ 索引：', e.code);
  });

  const [rows] = await c.query('SELECT id, phone FROM `js_member`');
  let enc = 0; let skip = 0; let bad = 0;
  for (const row of rows) {
    const p = String(row.phone || '');
    if (!p) { skip += 1; continue; }
    if (p.startsWith('enc:v1.')) { skip += 1; continue; }
    const plain = p.replace(/\D/g, '');
    if (plain.length !== 11) { bad += 1; console.log('⚠️ 跳过非法手机号 id=' + row.id); continue; }
    await c.query(
      'UPDATE `js_member` SET phone=?, phone_hash=?, phone_tail_hash=? WHERE id=?',
      [encryptPhone(plain), hashPhone(plain), tailHash(plain), row.id]
    );
    enc += 1;
  }
  console.log(`\n✅ 回填完成：加密 ${enc} 行，跳过 ${skip} 行，异常 ${bad} 行`);

  const [sample] = await c.query('SELECT plate_no, phone, phone_hash, phone_tail_hash FROM `js_member` LIMIT 2');
  for (const r of sample) {
    console.log(`  ${r.plate_no}: ${String(r.phone).slice(0, 24)}… hash=${String(r.phone_hash).slice(0, 12)}… tail=${String(r.phone_tail_hash).slice(0, 12)}…`);
  }
  list = await cols();
  console.log(`\n最终 ${list.length} 个字段：`);
  console.log(list.map((x) => `${x.n}:${x.t}`).join(' | '));
  await c.end();
})().catch((e) => { console.error('迁移失败:', e.code || '', e.message); process.exit(1); });
