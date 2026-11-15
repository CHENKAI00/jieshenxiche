const mysql = require('mysql2/promise');
const cfg = require('./config');

const pool = mysql.createPool(cfg.db);

async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function ping() {
  const [rows] = await pool.query('SELECT 1 AS ok');
  return rows[0].ok === 1;
}

/** 把 JSON 字段安全解析成数组（MySQL 8 的 JSON 列在 mysql2 里可能直接返回对象） */
function parseRecords(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (Buffer.isBuffer(v)) v = v.toString('utf8');
  if (typeof v === 'string') {
    try {
      const r = JSON.parse(v);
      return Array.isArray(r) ? r : [];
    } catch {
      return [];
    }
  }
  return [];
}

module.exports = { pool, q, ping, parseRecords };
