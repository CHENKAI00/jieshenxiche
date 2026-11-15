/**
 * v3 → v4：加 openid（车主端绑定），幂等
 * 执行：npm run migrate:v4
 */
const mysql = require('mysql2/promise');
const cfg = require('../src/config');

(async () => {
  const c = await mysql.createConnection({
    host: cfg.db.host, port: cfg.db.port, user: cfg.db.user,
    password: cfg.db.password, database: cfg.db.database, charset: 'utf8mb4',
  });
  const has = async (col) => {
    const [r] = await c.query(
      'SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',
      [cfg.db.database, 'js_member', col]
    );
    return r[0].n > 0;
  };
  if (await has('openid')) {
    console.log('↷ openid 已存在，跳过');
  } else {
    await c.query("ALTER TABLE `js_member` ADD COLUMN `openid` VARCHAR(64) DEFAULT NULL COMMENT '微信 openid（车主端绑定后写入）' AFTER `phone`");
    console.log('✅ 新增 openid');
  }
  try {
    await c.query('ALTER TABLE `js_member` ADD UNIQUE KEY `uk_openid` (`openid`)');
    console.log('✅ 索引 uk_openid');
  } catch (e) {
    console.log('↷ 索引已存在或冲突：', e.code);
  }
  const [cols] = await c.query(
    'SELECT COLUMN_NAME n, COLUMN_TYPE t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',
    [cfg.db.database, 'js_member']
  );
  console.log(`最终 ${cols.length} 个字段：`);
  console.log(cols.map((x) => `${x.n}:${x.t}`).join(' | '));
  await c.end();
})().catch((e) => { console.error('迁移失败:', e.code || '', e.message); process.exit(1); });
