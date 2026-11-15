const { pool } = require('../db');
const cfg = require('../config');
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
    totalCount: row.total_count,
    expireAt: row.expire_at || '',
    expireWarn: !!row.expire_at && expired,
    lastServiceAt: row.last_service_at || '',
    lastItem: row.last_item || '',
    lastAmount: Number(row.last_amount || 0),
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

function findService(idOrName) {
  return cfg.services.find((s) => s.id === idOrName) || cfg.services.find((s) => s.name === idOrName);
}

/**
 * 服务核销：优先扣剩余次数（未过期），否则扣余额。
 * 支持全部服务项目（洗车、打蜡、抛光、内饰、镀膜…），不再是「洗车专用」。
 */
async function consume({ plateNo, serviceId, itemId, useCount = true, operator = '前台', note = '' }) {
  const svc = findService(serviceId || itemId);
  if (!svc) {
    const e = new Error('未知的服务项目');
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

    await conn.query(
      `UPDATE ${TABLE}
         SET balance=?, remain_count=?, total_count=total_count+1,
             last_service_at=NOW(), last_item=?, last_amount=?, remark=COALESCE(NULLIF(?,''), remark)
       WHERE id=?`,
      [balance, remain, svc.name, amount, note, row.id]
    );
    await conn.commit();
    return {
      ok: true,
      service: svc.name,
      price: svc.price,
      payType,
      amount,
      balance,
      remainCount: remain,
      totalCount: row.total_count + 1,
      member: await getMemberView(row.plate_no),
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** 充值 / 买次卡：加余额、加次数、延有效期 */
async function recharge({ plateNo, amount, giftAmount = 0, times = 0, months = 0, operator = '前台', note = '' }) {
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
    const label = `充值¥${amt}${giftAmount ? ` 送¥${giftAmount}` : ''}${times ? ` +${times}次` : ''}`;
    await conn.query(
      `UPDATE ${TABLE} SET balance=?, remain_count=?, expire_at=?, last_item=?, last_amount=?, remark=COALESCE(NULLIF(?,''), remark) WHERE id=?`,
      [balance, remain, expireAt, label, amt, note, row.id]
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
  const lim = Math.min(Math.max(Number(size) || 20, 1), 100);
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

/** 门店看板：会员数、储值总额、待用次数、今日到店、今日服务实收、今日新增 */
async function overview() {
  const [[agg]] = await pool.query(
    `SELECT COUNT(*) members, SUM(balance) balance, SUM(remain_count) remain FROM ${TABLE}`
  );
  const [[today]] = await pool.query(
    `SELECT COUNT(*) visits, SUM(last_amount) amount FROM ${TABLE} WHERE DATE(last_service_at) = CURDATE()`
  );
  const [[fresh]] = await pool.query(
    `SELECT COUNT(*) c FROM ${TABLE} WHERE DATE(created_at) = CURDATE()`
  );
  return {
    date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }),
    members: Number(agg.members || 0),
    balanceSum: Number(agg.balance || 0),
    remainSum: Number(agg.remain || 0),
    todayVisits: Number(today.visits || 0),
    todayIncome: Number(Number(today.amount || 0).toFixed(2)),
    todayNew: Number(fresh.c || 0),
  };
}

/** 最近到店（只有最近一次，所以按 last_service_at 排序即可，不需要流水表） */
async function recentVisits(limit = 10) {
  const lim = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const [rows] = await pool.query(
    `SELECT * FROM ${TABLE} WHERE last_service_at IS NOT NULL ORDER BY last_service_at DESC LIMIT ?`,
    [lim]
  );
  return rows.map(toViewModel);
}

module.exports = {
  getMemberView, createMember, consume, recharge, listMembers, overview, recentVisits, findService,
};
