/**
 * v1 → v2 表结构精简迁移：node scripts/migrate-v2.js
 * 只 ALTER js_member 一张表；幂等（字段已删/已改名时会跳过对应语句）
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const cfg = require('../src/config');

const steps = [
  ['rename+add', `ALTER TABLE \`js_member\`
     CHANGE COLUMN \`wash_total\`   \`total_count\`     INT NOT NULL DEFAULT 0 COMMENT '累计服务次数（洗车/打蜡/抛光…）',
     CHANGE COLUMN \`package_left\` \`remain_count\`    INT NOT NULL DEFAULT 0 COMMENT '剩余次数（次卡）',
     CHANGE COLUMN \`last_wash_at\` \`last_service_at\` DATETIME DEFAULT NULL COMMENT '最近到店时间'`],
  ['add-last-item', `ALTER TABLE \`js_member\`
     ADD COLUMN \`last_item\` VARCHAR(32) DEFAULT NULL COMMENT '最近一次服务项目' AFTER \`last_service_at\``],
  ['add-last-amount', `ALTER TABLE \`js_member\`
     ADD COLUMN \`last_amount\` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '最近一次实收金额' AFTER \`last_item\``],
  ['drop-level', 'ALTER TABLE `js_member` DROP COLUMN `level`'],
  ['drop-points', 'ALTER TABLE `js_member` DROP COLUMN `points`'],
  ['drop-package-name', 'ALTER TABLE `js_member` DROP COLUMN `package_name`'],
  ['drop-avatar', 'ALTER TABLE `js_member` DROP COLUMN `avatar`'],
  ['drop-records', 'ALTER TABLE `js_member` DROP COLUMN `records`'],
];

(async () => {
  const conn = await mysql.createConnection({
    host: cfg.db.host, port: cfg.db.port, user: cfg.db.user,
    password: cfg.db.password, database: cfg.db.database, charset: 'utf8mb4',
  });
  for (const [name, sql] of steps) {
    try {
      await conn.query(sql);
      console.log(`✅ ${name}`);
    } catch (e) {
      if (['ER_BAD_FIELD_ERROR', 'ER_DUP_FIELDNAME', 'ER_NO_SUCH_TABLE'].includes(e.code)) {
        console.log(`↷ ${name} 已处理，跳过（${e.code}）`);
      } else throw e;
    }
  }
  const [cols] = await conn.query(
    'SELECT COLUMN_NAME n, COLUMN_TYPE t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',
    [cfg.db.database, 'js_member']
  );
  console.log(`\n最终 ${cols.length} 个字段：`);
  console.log(cols.map((c) => `${c.n}:${c.t}`).join(' | '));
  const [rows] = await conn.query('SELECT COUNT(*) c FROM `js_member`');
  console.log('数据行数:', rows[0].c);
  await conn.end();
})().catch((e) => { console.error('迁移失败:', e.code || '', e.message); process.exit(1); });
