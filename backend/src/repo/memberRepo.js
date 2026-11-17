/**
 * 会员表数据访问层：一份接口，两种驱动
 *   DB_DRIVER=mysql  → 现有 MySQL（默认，线上正在用）
 *   DB_DRIVER=cloud  → 微信云开发数据库（MongoDB 文档型，@cloudbase/node-sdk）
 *
 * 为什么放在这里：业务逻辑（services/*）不关心底层是 SQL 还是文档，
 * 换库只要改 .env 里的 DB_DRIVER + 迁移一次数据。
 */
const cfg = require('../config');

const DRIVER = String((cfg.db && cfg.db.driver) || 'mysql').toLowerCase();

/* ============================ MySQL 驱动 ============================ */
const mysqlDriver = (() => {
  const { pool } = require('../db');
  const TABLE = '`js_member`';

  return {
    name: 'mysql',

    async findByPlate(plate) {
      const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE plate_no = ? LIMIT 1`, [plate]);
      return rows[0] || null;
    },

    async findById(id) {
      const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
      return rows[0] || null;
    },

    async findByOpenid(openid) {
      const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE openid = ? LIMIT 1`, [openid]);
      return rows[0] || null;
    },

    /** 建档：只有车牌必填 */
    async insert(doc) {
      const [r] = await pool.query(
        `INSERT INTO ${TABLE} (plate_no, plate_color, member_no, nickname, car_model, phone, phone_hash, phone_tail_hash, remark)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [doc.plate_no, doc.plate_color, doc.member_no, doc.nickname, doc.car_model,
          doc.phone, doc.phone_hash, doc.phone_tail_hash, doc.remark]
      );
      return this.findById(r.insertId);
    },

    async setOpenid(id, openid) {
      await pool.query(`UPDATE ${TABLE} SET openid = ? WHERE id = ?`, [openid, id]);
    },

    async clearOpenid(openid) {
      const [r] = await pool.query(`UPDATE ${TABLE} SET openid = NULL WHERE openid = ?`, [openid]);
      return r.affectedRows || 0;
    },

    /** 会员资料补登（手机号有/无两条 SQL，保持与原实现一致） */
    async updateProfile(row, patch) {
      if (patch.phone) {
        await pool.query(
          `UPDATE ${TABLE} SET phone=?, phone_hash=?, phone_tail_hash=?,
                  nickname=COALESCE(NULLIF(?,''), nickname),
                  car_model=COALESCE(NULLIF(?,''), car_model),
                  remark=COALESCE(NULLIF(?,''), remark)
            WHERE id=?`,
          [patch.phone, patch.phone_hash, patch.phone_tail_hash, patch.nickname || '', patch.car_model || '', patch.remark || '', row.id]
        );
      } else {
        await pool.query(
          `UPDATE ${TABLE} SET nickname=COALESCE(NULLIF(?,''), nickname),
                  car_model=COALESCE(NULLIF(?,''), car_model),
                  remark=COALESCE(NULLIF(?,''), remark) WHERE id=?`,
          [patch.nickname || '', patch.car_model || '', patch.remark || '', row.id]
        );
      }
    },

    /** 核销：事务 + 行锁，handler(row) 返回 { fields, inc } */
    async transact(plate, handler) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query(`SELECT * FROM ${TABLE} WHERE plate_no = ? FOR UPDATE`, [plate]);
        const row = rows[0];
        if (!row) {
          const e = new Error('未找到该车牌会员，请先建档');
          e.status = 404;
          throw e;
        }
        const out = await handler(row);
        if (out && out.fields) {
          const f = out.fields;
          const inc = out.inc || {};
          let sql = `UPDATE ${TABLE} SET balance=?, remain_count=?, last_service_at=NOW(), last_item=?, remark=COALESCE(NULLIF(?,''), remark)`;
          const params = [f.balance, f.remain_count, f.last_item, f.remark || ''];
          if (inc.wash_count) sql += ', wash_count=wash_count+1';
          if (inc.wax_count) sql += ', wax_count=wax_count+1';
          sql += ' WHERE id=?';
          params.push(row.id);
          await conn.query(sql, params);
        } else if (out && out.recharge) {
          const f = out.recharge;
          await conn.query(
            `UPDATE ${TABLE} SET balance=?, remain_count=?, expire_at=?, remark=COALESCE(NULLIF(?,''), remark) WHERE id=?`,
            [f.balance, f.remain_count, f.expire_at, f.remark || '', row.id]
          );
        }
        await conn.commit();
        return { row: await this.findById(row.id) };
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },

    async list({ keyword = '', page = 1, size = 20 }) {
      const kw = String(keyword || '').trim();
      const lim = Math.min(Math.max(Number(size) || 20, 1), 200);
      const off = (Math.max(Number(page) || 1, 1) - 1) * lim;
      const like = `%${kw}%`;
      let where; let params;
      if (/^1[3-9]\d{9}$/.test(kw)) {
        where = 'phone_hash = ?'; params = [kw && require('../utils/crypto').hashPhone(kw)];
      } else if (/^\d{4}$/.test(kw)) {
        where = 'phone_tail_hash = ?'; params = [require('../utils/crypto').tailHash(kw)];
      } else {
        where = "(?='' OR plate_no LIKE ? OR nickname LIKE ? OR member_no LIKE ?)";
        params = [kw, like, like, like];
      }
      const [rows] = await pool.query(
        `SELECT * FROM ${TABLE} WHERE ${where} ORDER BY last_service_at DESC, id DESC LIMIT ? OFFSET ?`,
        [...params, lim, off]
      );
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) total FROM ${TABLE} WHERE ${where}`, params);
      return { total, rows, page: Number(page) || 1, size: lim };
    },

    async overview() {
      const [[agg]] = await pool.query(
        `SELECT COUNT(*) members, SUM(balance) balance, SUM(remain_count) remain,
                SUM(wash_count) wash, SUM(wax_count) wax FROM ${TABLE}`
      );
      const [[today]] = await pool.query(
        `SELECT COUNT(*) visits FROM ${TABLE} WHERE DATE(last_service_at) = CURDATE()`
      );
      const [[fresh]] = await pool.query(
        `SELECT COUNT(*) c FROM ${TABLE} WHERE DATE(created_at) = CURDATE()`
      );
      return { agg, today: today.visits, fresh: fresh.c };
    },

    async listPlates() {
      const [rows] = await pool.query('SELECT plate_no, nickname FROM `js_member` WHERE status = 1');
      return rows;
    },

    async recentVisits(limit) {
      const [rows] = await pool.query(
        `SELECT * FROM ${TABLE} WHERE last_service_at IS NOT NULL ORDER BY last_service_at DESC LIMIT ?`,
        [limit]
      );
      return rows;
    },
  };
})();

/* ========================== 云开发数据库驱动 ========================== */
const cloudDriver = (() => {
  let db = null;
  const COLL = (cfg.cloudDb && cfg.cloudDb.collection) || 'js_member';

  function coll() {
    if (db) return db;
    const tcb = require('@cloudbase/node-sdk'); // 懒加载：mysql 模式不装也能跑
    const app = tcb.init({
      env: cfg.cloudDb.env,
      secretId: cfg.cloudDb.secretId || undefined,
      secretKey: cfg.cloudDb.secretKey || undefined,
    });
    db = app.database();
    return db;
  }

  const c = () => coll().collection(COLL);
  const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

  /** 文档 → 与 MySQL 行同构（业务层不用改字段名） */
  function toRow(doc) {
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return { ...rest, id: _id };
  }

  return {
    name: 'cloud',

    async findByPlate(plate) {
      const r = await c().where({ plate_no: plate }).limit(1).get();
      return toRow((r.data || [])[0]);
    },

    async findById(id) {
      const r = await c().doc(String(id)).get();
      return toRow((r.data || [])[0]);
    },

    async findByOpenid(openid) {
      const r = await c().where({ openid }).limit(1).get();
      return toRow((r.data || [])[0]);
    },

    async insert(doc) {
      const payload = {
        ...doc,
        balance: 0, remain_count: 0, wash_count: 0, wax_count: 0,
        expire_at: null, last_service_at: null, last_item: null,
        status: 1, openid: null,
        created_at: now(), updated_at: now(),
      };
      const r = await c().add(payload);
      return { ...payload, id: r.id };
    },

    async setOpenid(id, openid) {
      await c().doc(String(id)).update({ openid, updated_at: now() });
    },

    async clearOpenid(openid) {
      const r = await c().where({ openid }).update({ openid: null, updated_at: now() });
      return (r.updated || 0) > 0 ? 1 : 0;
    },

    async updateProfile(row, patch) {
      const data = { updated_at: now() };
      if (patch.phone) {
        data.phone = patch.phone;
        data.phone_hash = patch.phone_hash;
        data.phone_tail_hash = patch.phone_tail_hash;
      }
      if (patch.nickname) data.nickname = patch.nickname;
      if (patch.car_model) data.car_model = patch.car_model;
      if (patch.remark) data.remark = patch.remark;
      await c().doc(String(row.id)).update(data);
    },

    /** 云数据库没有行锁：用「条件更新 + 重试」实现同样的原子性 */
    async transact(plate, handler) {
      const _ = coll().command;
      for (let i = 0; i < 5; i += 1) {
        const current = await this.findByPlate(plate);
        if (!current) {
          const e = new Error('未找到该车牌会员，请先建档');
          e.status = 404;
          throw e;
        }
        const out = await handler(current);
        let data = { updated_at: now() };
        if (out && out.fields) {
          const f = out.fields;
          Object.assign(data, {
            balance: f.balance,
            remain_count: f.remain_count,
            last_service_at: now(),
            last_item: f.last_item,
          });
          if (f.remark) data.remark = f.remark;
          if (out.inc && out.inc.wash_count) data.wash_count = _.inc(1);
          if (out.inc && out.inc.wax_count) data.wax_count = _.inc(1);
        } else if (out && out.recharge) {
          const f = out.recharge;
          Object.assign(data, { balance: f.balance, remain_count: f.remain_count, expire_at: f.expire_at });
          if (f.remark) data.remark = f.remark;
        }
        // 条件更新：只有读到的那份没被别人改过才写成功
        const r = await c().where({
          _id: current.id,
          balance: current.balance,
          remain_count: current.remain_count,
        }).update(data);
        if ((r.updated || 0) > 0) return { row: await this.findById(current.id) };
      }
      const e = new Error('操作过于频繁，请重试');
      e.status = 409;
      throw e;
    },

    async list({ keyword = '', page = 1, size = 20 }) {
      const kw = String(keyword || '').trim();
      const lim = Math.min(Math.max(Number(size) || 20, 1), 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * lim;
      let query;
      const { hashPhone, tailHash } = require('../utils/crypto');
      if (/^1[3-9]\d{9}$/.test(kw)) query = c().where({ phone_hash: hashPhone(kw) });
      else if (/^\d{4}$/.test(kw)) query = c().where({ phone_tail_hash: tailHash(kw) });
      else if (!kw) query = c().where({});
      else {
        // 车牌 / 称呼 / 卡号 三选一（云数据库用 or 组合）
        const _ = coll().command;
        query = c().where(_.or([
          { plate_no: coll().RegExp({ regexp: kw, options: 'i' }) },
          { nickname: coll().RegExp({ regexp: kw, options: 'i' }) },
          { member_no: coll().RegExp({ regexp: kw, options: 'i' }) },
        ]));
      }
      const cnt = await query.count();
      const r = await query.orderBy('last_service_at', 'desc').skip(skip).limit(lim).get();
      return { total: cnt.total || 0, rows: (r.data || []).map(toRow), page: Number(page) || 1, size: lim };
    },

    async overview() {
      const all = await c().field({ balance: true, remain_count: true, wash_count: true, wax_count: true, last_service_at: true, created_at: true }).limit(1000).get();
      const rows = all.data || [];
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
      return {
        agg: {
          members: rows.length,
          balance: rows.reduce((s, x) => s + Number(x.balance || 0), 0),
          remain: rows.reduce((s, x) => s + Number(x.remain_count || 0), 0),
          wash: rows.reduce((s, x) => s + Number(x.wash_count || 0), 0),
          wax: rows.reduce((s, x) => s + Number(x.wax_count || 0), 0),
        },
        today: rows.filter((x) => String(x.last_service_at || '').slice(0, 10) === today).length,
        fresh: rows.filter((x) => String(x.created_at || '').slice(0, 10) === today).length,
      };
    },

    async listPlates() {
      const r = await c().where({ status: 1 }).field({ plate_no: true, nickname: true }).limit(1000).get();
      return r.data || [];
    },

    async recentVisits(limit) {
      const r = await c().where({ last_service_at: coll().command.neq(null) })
        .orderBy('last_service_at', 'desc').limit(limit).get();
      return (r.data || []).map(toRow);
    },
  };
})();

module.exports = DRIVER === 'cloud' ? cloudDriver : mysqlDriver;
module.exports.driverName = DRIVER === 'cloud' ? 'cloud' : 'mysql';
