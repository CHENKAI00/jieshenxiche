const { pool, parseRecords } = require('../db');
const cfg = require('../config');
const { validatePlate, normalizePlate, prettyPlate, genMemberNo } = require('../utils/plate');

const TABLE = '`js_member`';
const RECORD_KEEP = 200; // 单会员流水最多保留 200 条（JSON 字段，避免无限膨胀）

function levelInfo(level) {
  const l = cfg.levels[level] || cfg.levels[1];
  return { level, name: l.name, discount: l.discount };
}

function currentPayable(price, level) {
  const l = cfg.levels[level] || cfg.levels[1];
  return Math.round(price * l.discount * 100) / 100;
}

function toViewModel(row) {
  if (!row) return null;
  const records = parseRecords(row.records);
  const lv = levelInfo(row.level);
  const expired = row.expire_at ? new Date(`${row.expire_at}T23:59:59+08:00`).getTime() < Date.now() : false;
  return {
    id: row.id,
    plateNo: row.plate_no,
    platePretty: prettyPlate(row.plate_no),
    plateColor: row.plate_color,
    memberNo: row.member_no,
    nickname: row.nickname || '车主',
    phone: row.phone ? row.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '',
    phoneRaw: row.phone || '',
    level: lv.level,
    levelName: lv.name,
    discount: lv.discount,
    balance: Number(row.balance),
    points: row.points,
    washTotal: row.wash_total,
    packageLeft: row.package_left,
    packageName: row.package_name || '',
    expireAt: row.expire_at || '',
    expireWarn: !!row.expire_at && expired,
    lastWashAt: row.last_wash_at || '',
    avatar: row.avatar || '',
    remark: row.remark || '',
    status: row.status,
    records: records.slice(0, 50),
    createdAt: row.created_at,
  };
}

function newRecord({ type, item, amount, points = 0, payType = '', operator = '小程序', balanceAfter = 0, note = '' }) {
  return {
    id: `R${Date.now()}${Math.floor(Math.random() * 100)}`,
    ts: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }),
    type,
    item: item || '',
    amount: Number(Number(amount || 0).toFixed(2)),
    points: Number(points || 0),
    payType,
    operator,
    balanceAfter: Number(Number(balanceAfter || 0).toFixed(2)),
    note,
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

async function createMember({ plateNo, nickname, phone, level, remark }) {
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

  const lv = Number(level) >= 1 && Number(level) <= 4 ? Number(level) : 1;
  const memberNo = genMemberNo();
  const [r] = await pool.query(
    `INSERT INTO ${TABLE}
      (plate_no, plate_color, member_no, nickname, phone, level, remark, records, last_wash_at)
     VALUES (?,?,?,?,?,?,?,?,NULL)`,
    [v.plate, v.color || '蓝', memberNo, nickname || '车主', phone || null, lv, remark || null, JSON.stringify([
      newRecord({ type: 'register', item: '会员建档', operator: '系统', note: '拍照建档' }),
    ])]
  );
  const [rows] = await pool.query(`SELECT * FROM ${TABLE} WHERE id = ?`, [r.insertId]);
  return { created: true, ...toViewModel(rows[0]) };
}

/** 洗车核销 / 消费 */
async function consume({ plateNo, itemId, usePackage = true, operator = '前台', note = '' }) {
  const item = cfg.items.find((i) => i.id === itemId) || cfg.items.find((i) => i.name === itemId);
  if (!item) {
    const e = new Error('未知的洗车项目');
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
    let payType = '套餐次数';
    let amount = 0;
    let packageLeft = row.package_left;
    let balance = Number(row.balance);
    const expired = row.expire_at ? new Date(`${row.expire_at}T23:59:59+08:00`).getTime() < Date.now() : false;

    if (usePackage && packageLeft > 0 && !expired) {
      packageLeft -= 1;
    } else {
      amount = currentPayable(item.price, row.level);
      if (balance < amount) {
        const e = new Error(`余额不足：需 ¥${amount.toFixed(2)}，当前 ¥${balance.toFixed(2)}`);
        e.status = 402;
        throw e;
      }
      balance = Math.round((balance - amount) * 100) / 100;
      payType = '余额';
    }
    const rec = newRecord({
      type: 'wash', item: item.name, amount, points: item.points, payType,
      operator, balanceAfter: balance, note: payType === '套餐次数' ? `套餐扣次，余 ${packageLeft} 次` : note,
    });
    const records = [rec, ...parseRecords(row.records)].slice(0, RECORD_KEEP);

    await conn.query(
      `UPDATE ${TABLE} SET balance=?, package_left=?, wash_total=wash_total+1, points=points+?,
        last_wash_at=NOW(), records=? WHERE id=?`,
      [balance, packageLeft, item.points, JSON.stringify(records), row.id]
    );
    await conn.commit();
    return {
      ok: true,
      record: rec,
      item: item.name,
      payType,
      amount,
      balance,
      packageLeft,
      points: row.points + item.points,
      washTotal: row.wash_total + 1,
      member: await getMemberView(row.plate_no),
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** 充值（含赠送金额 / 赠次 / 升级） */
async function recharge({ plateNo, amount, giftAmount = 0, times = 0, packageName = '', months = 0, level, operator = '前台', note = '' }) {
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
    const packageLeft = row.package_left + Number(times || 0);
    let expireAt = row.expire_at;
    if (months > 0) {
      const base = row.expire_at ? new Date(`${row.expire_at}T00:00:00+08:00`) : new Date();
      base.setMonth(base.getMonth() + Number(months));
      expireAt = base.toISOString().slice(0, 10);
    }
    const lv = level && Number(level) >= 1 && Number(level) <= 4 ? Number(level) : row.level;
    const rec = newRecord({
      type: 'recharge',
      item: `充值¥${amt}${giftAmount ? ` 送¥${giftAmount}` : ''}${times ? ` +${times}次` : ''}`,
      amount: amt, points: 0, payType: '微信支付', operator, balanceAfter: balance, note,
    });
    const records = [rec, ...parseRecords(row.records)].slice(0, RECORD_KEEP);

    await conn.query(
      `UPDATE ${TABLE} SET balance=?, package_left=?, package_name=COALESCE(NULLIF(?,''), package_name),
        expire_at=?, level=?, records=? WHERE id=?`,
      [balance, packageLeft, packageName || '', expireAt, lv, JSON.stringify(records), row.id]
    );
    await conn.commit();
    return { ok: true, record: rec, balance, packageLeft, level: lv, expireAt, member: await getMemberView(row.plate_no) };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** 积分兑换（扣积分，记流水） */
async function usePoints({ plateNo, points, item, operator = '前台' }) {
  const p = Number(points);
  if (!(p > 0)) {
    const e = new Error('积分数量不正确');
    e.status = 400;
    throw e;
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(`SELECT * FROM ${TABLE} WHERE plate_no = ? FOR UPDATE`, [normalizePlate(plateNo)]);
    const row = rows[0];
    if (!row) {
      const e = new Error('未找到该车牌会员');
      e.status = 404;
      throw e;
    }
    if (row.points < p) {
      const e = new Error(`积分不足：需 ${p}，当前 ${row.points}`);
      e.status = 402;
      throw e;
    }
    const rec = newRecord({ type: 'points', item: item || '积分兑换', amount: 0, points: -p, payType: '积分', operator, balanceAfter: Number(row.balance) });
    const records = [rec, ...parseRecords(row.records)].slice(0, RECORD_KEEP);
    await conn.query(`UPDATE ${TABLE} SET points=points-?, records=? WHERE id=?`, [p, JSON.stringify(records), row.id]);
    await conn.commit();
    return { ok: true, record: rec, points: row.points - p, member: await getMemberView(row.plate_no) };
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
  const [rows] = await pool.query(
    `SELECT * FROM ${TABLE} WHERE (?='' OR plate_no LIKE ? OR nickname LIKE ? OR phone LIKE ? OR member_no LIKE ?)
     ORDER BY last_wash_at DESC, id DESC LIMIT ? OFFSET ?`,
    [kw, like, like, like, like, lim, off]
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) total FROM ${TABLE} WHERE (?='' OR plate_no LIKE ? OR nickname LIKE ? OR phone LIKE ? OR member_no LIKE ?)`,
    [kw, like, like, like, like]
  );
  return { total, page: Number(page) || 1, size: lim, list: rows.map(toViewModel) };
}

/** 门店看板：今日核销、今日营收、会员数 */
async function overview() {
  const [rows] = await pool.query('SELECT COUNT(*) AS members, SUM(balance) AS balance, SUM(package_left) AS packageLeft FROM ' + TABLE);
  const all = [];
  const [recRows] = await pool.query('SELECT records FROM ' + TABLE);
  for (const r of recRows) all.push(...parseRecords(r.records));

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  const todays = all.filter((x) => String(x.ts || '').startsWith(today));
  const washes = todays.filter((x) => x.type === 'wash');
  const income = todays
    .filter((x) => x.type === 'recharge' || (x.type === 'wash' && x.payType === '余额'))
    .reduce((s, x) => s + Number(x.amount || 0), 0);

  return {
    date: today,
    members: rows[0].members || 0,
    balanceSum: Number(rows[0].balance || 0),
    packageLeftSum: Number(rows[0].packageLeft || 0),
    todayWash: washes.length,
    todayWashAmount: Number(washes.reduce((s, x) => s + Number(x.amount || 0), 0).toFixed(2)),
    todayIncome: Number(income.toFixed(2)),
    todayPoints: washes.reduce((s, x) => s + Number(x.points || 0), 0),
  };
}

/** 最近流水（全部会员，用于门店管理页） */
async function recentRecords(limit = 15) {
  const lim = Math.min(Math.max(Number(limit) || 15, 1), 100);
  const [rows] = await pool.query(`SELECT plate_no, nickname, level, records FROM ${TABLE}`);
  const all = [];
  for (const r of rows) {
    for (const rec of parseRecords(r.records)) {
      all.push({ plateNo: r.plate_no, platePretty: prettyPlate(r.plate_no), nickname: r.nickname, level: r.level, ...rec });
    }
  }
  all.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  return all.slice(0, lim);
}

module.exports = {
  getMemberView, createMember, consume, recharge, usePoints, listMembers, overview, recentRecords, levelInfo, cfg,
};
