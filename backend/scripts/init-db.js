/**
 * 一键初始化数据库：node scripts/init-db.js
 * 只创建 1 个库 jieshenxiche + 1 张表 js_member；表已存在时跳过，可重复执行。
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const cfg = require('../src/config');

(async () => {
  const sqlFile = path.join(__dirname, '..', 'sql', 'init.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');
  const conn = await mysql.createConnection({
    host: cfg.db.host, port: cfg.db.port, user: cfg.db.user,
    password: cfg.db.password, multipleStatements: true, charset: 'utf8mb4',
  });
  try {
    const [[v]] = await conn.query('SELECT VERSION() v, @@hostname h');
    console.log(`已连接 ${cfg.db.user}@${cfg.db.host}:${cfg.db.port}  MySQL ${v.v}  host=${v.h}`);
    await conn.query(sql);
    const [tables] = await conn.query(
      'SELECT TABLE_NAME n, TABLE_ROWS r, TABLE_COMMENT c FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',
      [cfg.db.database]
    );
    console.log(`库 ${cfg.db.database} 就绪，表清单：`);
    for (const t of tables) console.log(` - ${t.n}  rows≈${t.r}  ${t.c}`);
  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error('初始化失败:', e.code || '', e.message);
  if (e.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('提示：数据库拒绝登录。请在 MySQL 上为该来源 IP 授权，例如：');
    console.error("  CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY '<你的数据库口令>';");
    console.error("  GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION; FLUSH PRIVILEGES;");
  }
  process.exit(1);
});
