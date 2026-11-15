/**
 * v2 → v3 迁移：total_count 拆成 wash_count/wax_count，删除 last_amount
 * 幂等：列已存在/已删除时跳过
 * 执行：node scripts/migrate-v3.js
 */
const mysql = require('mysql2/promise');
const cfg = require('../src/config');

(async () => {
  const c = await mysql.createConnection({
    host: cfg.db.host, port: cfg.db.port, user: cfg.db.user,
    password: cfg.db.password, database: cfg.db.database, charset: 'utf8mb4',
  });
  const run = async (label, sql) => {
    try { await c.query(sql); console.log(`✅ ${label}`); }
    catch (e) {
      if (['ER_DUP_FIELDNAME', 'ER_BAD_FIELD_ERROR'].includes(e.code)) console.log(`↷ ${label} 已处理（${e.code}）`);
      else throw e;
    }
  };

  await run('add wash_count', "ALTER TABLE `js_member` ADD COLUMN `wash_count` INT NOT NULL DEFAULT 0 COMMENT '洗车次数' AFTER `remain_count`");
  await run('add wax_count', "ALTER TABLE `js_member` ADD COLUMN `wax_count` INT NOT NULL DEFAULT 0 COMMENT '打蜡次数' AFTER `wash_count`");

  // 把旧的 total_count 历史值一次性折算进 wash_count（只在 total_count 还存在时做一次）
  const [cols] = await c.query(
    'SELECT COLUMN_NAME n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?',
    [cfg.db.database, 'js_member']
  );
  const names = cols.map((x) => x.n);
  if (names.includes('total_count')) {
    await c.query("UPDATE `js_member` SET `wash_count` = `total_count` WHERE `wash_count` = 0");
    console.log('✅ 历史 total_count → wash_count');
    await run('drop total_count', "ALTER TABLE `js_member` DROP COLUMN `total_count`");
  } else {
    console.log('↷ total_count 已不存在，跳过折算');
  }
  await run('drop last_amount', "ALTER TABLE `js_member` DROP COLUMN `last_amount`");

  const [after] = await c.query(
    'SELECT COLUMN_NAME n, COLUMN_TYPE t, COLUMN_COMMENT c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',
    [cfg.db.database, 'js_member']
  );
  console.log(`\n最终 ${after.length} 个字段：`);
  console.log(after.map((x) => `${x.n}:${x.t}${x.c ? ' // ' + x.c : ''}`).join('\n'));
  const [rows] = await c.query('SELECT plate_no, wash_count, wax_count, remain_count, balance FROM js_member');
  console.table(rows);
  await c.end();
})().catch((e) => { console.error('迁移失败:', e.code || '', e.message); process.exit(1); });
