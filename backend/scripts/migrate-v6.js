/**
 * v5 → v6：新增 car_model（车型号，选填），幂等
 * 执行：npm run migrate:v6
 */
const mysql = require('mysql2/promise');
const cfg = require('../src/config');

(async () => {
  const c = await mysql.createConnection({
    host: cfg.db.host, port: cfg.db.port, user: cfg.db.user,
    password: cfg.db.password, database: cfg.db.database, charset: 'utf8mb4',
  });
  const [cols] = await c.query(
    'SELECT COLUMN_NAME n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?',
    [cfg.db.database, 'js_member']
  );
  if (cols.some((x) => x.n === 'car_model')) {
    console.log('↷ car_model 已存在，跳过');
  } else {
    await c.query("ALTER TABLE `js_member` ADD COLUMN `car_model` VARCHAR(32) DEFAULT NULL COMMENT '车型号（选填，如 轿车/SUV/新能源）' AFTER `nickname`");
    console.log('✅ 新增 car_model');
  }

  const [lack] = await c.query(
    'SELECT COLUMN_NAME n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',
    [cfg.db.database, 'js_member']
  );
  console.log(`字段数 ${lack.length}：`);
  console.log(lack.map((x) => x.n).join(', '));
  await c.end();
})().catch((e) => { console.error('迁移失败:', e.code || '', e.message); process.exit(1); });
