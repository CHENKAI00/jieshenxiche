const { pool } = require('../db');
const cfg = require('../config');
const catalog = require('./catalog');
const { validatePlate, normalizePlate, prettyPlate, genMemberNo } = require('../utils/plate');

const TABLE = '`js_member`';

function maskPhone(phone) {
  return phone ? String(phone).replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '';
}

function toViewModel(row) {
  if (!row) return null;
  const expired = row.expire_at ? new Date(`${row.expire_at}T23:59:59+08:00`).getTime() < Date.now() : false;
  return {
    id: row.id,
    plateNo: row.plate_no,
    platePretty: prettyPlate(row.plate_no),
    plateColor: row.plate_color,
    memberNo: row.member_no,
    nickname: row.nickname || '车主',
    phone: maskPhone(row.phone),
    phoneRaw: row.phone || '',
    balance: Number(row.balance),
    remainCount: row.remain_count,
    washCount: row.wash_count,
    waxCount: row.wax_count,
    expireAt: row.expire_at || '',
    expireWarn: !!row.expire_at && expired,
    lastServiceAt: row.last_service_at || '',
    lastItem: row.last_item || '',
    remark: row.remark || '',
    status: row.status,
    createdAt: row.created_at,
  };
}

async function findByPlate(plateNo) {
  const plate = normalizePlate(plateNo);
  const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE plate_no = ? LIMIT 1`, [plate]);
  return rows[0] || null;
}

async function getMemberView(plateNo) {
  const row = await findByPlate(plateNo);
  if (!row) {
    const v = validatePlate(plateNo);
    return { exists: false, plateNo: v.plate, platePretty: prettyPlate(v.plate), plateValid: v.ok, reason: v.reason };
  }
  return { exists: true, ...toViewModel(row) };
}

async function createMember({ plateNo, nickname, phone, remark }) {
  const v = validatePlate(plateNo);
  if (!v.ok) {
    const e = new Error(`车牌格式不正确：${v.reason}`);
    e.status = 400;
    throw e;
  }
  if (phone && !/^1[3-9]\d{9}$/.test(String(phone))) {
    const e = new Error('手机号格式不正确');
    e.status = 400;
    throw e;
  }
  const exist = await findByPlate(v.plate);
  if (exist) return { created: false, ...toViewModel(exist) };

  const [r] = await pool.query(
    `INSERT INTO ${TABLE} (plate_no, plate_color, member_no, nickname, phone, remark)
     VALUES (?,?,?,?,?,?)`,
    [v.plate, v.color || '蓝', genMemberNo(), nickname || '车主', phone || null, remark || null]
  );
  const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE id = ?`, [r.insertId]);
  return { created: true, ...toViewModel(rows[0]) };
}

/**
 * 服务核销
 * - 服务项目来自「项目目录」（后台可增删改），支持洗车 / 打蜡 / 抛光 / 内饰…
 * - 次数优先（未过期），否则扣余额
 * - 洗车类累加 wash_count，打蜡累加 wax_count，其余项目只记录金额与最近项目
 */
async function consume({ plateNo, serviceId, useCount = true, operator = '前台', note = '' }) {
  const svc = serviceId ? await catalog.get(serviceId) : null;
  if (!svc) {
    const e = new Error('未知的服务项目（可能已在后台下架）');
    e.status = 400;
    throw e;
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(`SELECT * FROM ${TABLE} WHERE plate_no = ? FOR UPDATE`, [normalizePlate(plateNo)]);
    const row = rows[0];
    if (!row) {
      const e = new Error('未找到该车牌会员，请先建档');
      e.status = 404;
      throw e;
    }
    const expired = row.expire_at ? new Date(`${row.expire_at}T23:59:59+08:00`).getTime() < Date.now() : false;
    let payType = '次数';
    let amount = 0;
    let remain = row.remain_count;
    let balance = Number(row.balance);

    if (useCount && remain > 0 && !expired) {
      remain -= 1;
    } else {
      amount = Number(svc.price);
      if (balance < amount) {
        const e = new Error(`余额不足：需 ¥${amount.toFixed(2)}，当前 ¥${balance.toFixed(2)}`);
        e.status = 402;
        throw e;
      }
      balance = Math.round((balance - amount) * 100) / 100;
      payType = '余额';
    }

    // 按项目计次：洗车 → wash_count，打蜡 → wax_count，其它项目不计数
    const inc = svc.countKey === 'wash' ? ', wash_count=wash_count+1'
      : svc.countKey === 'wax' ? ', wax_count=wax_count+1'
        : '';

    await conn.query(
      `UPDATE ${TABLE}
         SET balance=?, remain_count=?,
             last_service_at=NOW(), last_item=?,
             remark=COALESCE(NULLIF(?,''), remark)${inc}
       WHERE id=?`,
      [balance, remain, svc.name, note, row.id]
    );
    await conn.commit();

    const [fresh] = await conn.query(`SELECT * FROM ${TABLE} WHERE id = ?`, [row.id]);
    return {
      ok: true,
      service: svc.name,
      price: svc.price,
      payType,
      amount,
      balance,
      remainCount: remain,
      washCount: fresh[0].wash_count,
      waxCount: fresh[0].wax_count,
      member: await getMemberView(row.plate_no),
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** 充值 / 买次卡：加余额、加次数、延有效期（不动 last_* 服务字段） */
async function recharge({ plateNo, amount, giftAmount = 0, times = 0, months = 0, note = '' }) {
  const amt = Number(amount);
  if (!(amt > 0)) {
    const e = new Error('充值金额必须大于 0');
    e.status = 400;
    throw e;
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(`SELECT * FROM ${TABLE} WHERE plate_no = ? FOR UPDATE`, [normalizePlate(plateNo)]);
    const row = rows[0];
    if (!row) {
      const e = new Error('未找到该车牌会员，请先建档');
      e.status = 404;
      throw e;
    }
    const balance = Math.round((Number(row.balance) + amt + Number(giftAmount || 0)) * 100) / 100;
    const remain = row.remain_count + Number(times || 0);
    let expireAt = row.expire_at;
    if (months > 0) {
      const base = row.expire_at ? new Date(`${row.expire_at}T00:00:00+08:00`) : new Date();
      base.setMonth(base.getMonth() + Number(months));
      expireAt = base.toISOString().slice(0, 10);
    }
    await conn.query(
      `UPDATE ${TABLE} SET balance=?, remain_count=?, expire_at=?, remark=COALESCE(NULLIF(?,''), remark) WHERE id=?`,
      [balance, remain, expireAt, note, row.id]
    );
    await conn.commit();
    return { ok: true, balance, remainCount: remain, expireAt, member: await getMemberView(row.plate_no) };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function listMembers({ keyword = '', page = 1, size = 20 }) {
  const kw = String(keyword || '').trim();
  const lim = Math.min(Math.max(Number(size) || 20, 1), 200);
  const off = (Math.max(Number(page) || 1, 1) - 1) * lim;
  const like = `%${kw}%`;
  const where = `(?='' OR plate_no LIKE ? OR nickname LIKE ? OR phone LIKE ? OR member_no LIKE ?)`;
  const [rows] = await pool.query(
    `SELECT * FROM ${TABLE} WHERE ${where} ORDER BY last_service_at DESC, id DESC LIMIT ? OFFSET ?`,
    [kw, like, like, like, like, lim, off]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) total FROM ${TABLE} WHERE ${where}`, [kw, like, like, like, like]);
  return { total, page: Number(page) || 1, size: lim, list: rows.map(toViewModel) };
}

/** 门店看板：会员数、储值总额、待用次数、今日到店、今日新增、累计洗车/打蜡 */
async function overview() {
  const [[agg]] = await pool.query(
    `SELECT COUNT(*) members, SUM(balance) balance, SUM(remain_count) remain,
            SUM(wash_count) wash, SUM(wax_count) wax
       FROM ${TABLE}`
  );
  const [[today]] = await pool.query(
    `SELECT COUNT(*) visits FROM ${TABLE} WHERE DATE(last_service_at) = CURDATE()`
  );
  const [[fresh]] = await pool.query(
    `SELECT COUNT(*) c FROM ${TABLE} WHERE DATE(created_at) = CURDATE()`
  );
  return {
    date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }),
    members: Number(agg.members || 0),
    balanceSum: Number(agg.balance || 0),
    remainSum: Number(agg.remain || 0),
    washSum: Number(agg.wash || 0),
    waxSum: Number(agg.wax || 0),
    todayVisits: Number(today.visits || 0),
    todayNew: Number(fresh.c || 0),
  };
}

/** 最近到店 */
async function recentVisits(limit = 10) {
  const lim = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const [rows] = await pool.query(
    `SELECT * FROM ${TABLE} WHERE last_service_at IS NOT NULL ORDER BY last_service_at DESC LIMIT ?`,
    [lim]
  );
  return rows.map(toViewModel);
}

module.exports = {
  getMemberView, createMember, consume, recharge, listMembers, overview, recentVisits,
};
