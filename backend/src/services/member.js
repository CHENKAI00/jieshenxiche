const repo = require('../repo/memberRepo');
const cfg = require('../config');
const catalog = require('./catalog');
const auth = require('./auth');
const { validatePlate, normalizePlate, prettyPlate, genMemberNo } = require('../utils/plate');
const { encryptPhone, decryptPhone, hashPhone, tailHash, maskPhone } = require('../utils/crypto');

function toViewModel(row) {
  if (!row) return null;
  const expired = row.expire_at ? new Date(`${row.expire_at}T23:59:59+08:00`).getTime() < Date.now() : false;
  const phonePlain = decryptPhone(row.phone);
  return {
    id: row.id,
    plateNo: row.plate_no,
    platePretty: prettyPlate(row.plate_no),
    plateColor: row.plate_color,
    memberNo: row.member_no,
    nickname: row.nickname || '车主',
    carModel: row.car_model || '',
    phone: maskPhone(phonePlain),
    phoneRaw: phonePlain,
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
  return repo.findByPlate(normalizePlate(plateNo));
}

async function getMemberView(plateNo) {
  const row = await findByPlate(plateNo);
  if (!row) {
    const v = validatePlate(plateNo);
    return { exists: false, plateNo: v.plate, platePretty: prettyPlate(v.plate), plateValid: v.ok, reason: v.reason };
  }
  return { exists: true, ...toViewModel(row) };
}

async function createMember({ plateNo, nickname, phone, remark, carModel }) {
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

  const phonePlain = phone ? String(phone).replace(/\D/g, '') : '';
  // 只有车牌是必填，其余（称呼/车型/手机/备注）都可以空
  const row = await repo.insert({
    plate_no: v.plate,
    plate_color: v.color || '蓝',
    member_no: genMemberNo(),
    nickname: nickname || null,
    car_model: carModel || null,
    phone: phonePlain ? encryptPhone(phonePlain) : null,
    phone_hash: phonePlain ? hashPhone(phonePlain) : null,
    phone_tail_hash: phonePlain ? tailHash(phonePlain) : null,
    remark: remark || null,
  });
  return { created: true, ...toViewModel(row) };
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

  let payType = '次数';
  let amount = 0;

  const { row } = await repo.transact(normalizePlate(plateNo), async (cur) => {
    const expired = cur.expire_at ? new Date(`${cur.expire_at}T23:59:59+08:00`).getTime() < Date.now() : false;
    let remain = cur.remain_count;
    let balance = Number(cur.balance);

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
    const inc = {};
    if (svc.countKey === 'wash') inc.wash_count = 1;
    if (svc.countKey === 'wax') inc.wax_count = 1;

    return {
      fields: {
        balance,
        remain_count: remain,
        last_item: svc.name,
        remark: note || '',
      },
      inc,
    };
  });

  return {
    ok: true,
    service: svc.name,
    price: svc.price,
    payType,
    amount,
    balance: Number(row.balance),
    remainCount: row.remain_count,
    washCount: row.wash_count,
    waxCount: row.wax_count,
    member: await getMemberView(row.plate_no),
  };
}

/** 充值 / 买次卡：加余额、加次数、延有效期（不动 last_* 服务字段） */
async function recharge({ plateNo, amount, giftAmount = 0, times = 0, months = 0, note = '' }) {
  const amt = Number(amount);
  if (!(amt > 0)) {
    const e = new Error('充值金额必须大于 0');
    e.status = 400;
    throw e;
  }

  const { row } = await repo.transact(normalizePlate(plateNo), async (cur) => {
    const balance = Math.round((Number(cur.balance) + amt + Number(giftAmount || 0)) * 100) / 100;
    const remain = cur.remain_count + Number(times || 0);
    let expireAt = cur.expire_at;
    if (months > 0) {
      const base = cur.expire_at ? new Date(`${cur.expire_at}T00:00:00+08:00`) : new Date();
      base.setMonth(base.getMonth() + Number(months));
      expireAt = base.toISOString().slice(0, 10);
    }
    return { recharge: { balance, remain_count: remain, expire_at: expireAt, remark: note || '' } };
  });

  return {
    ok: true,
    balance: Number(row.balance),
    remainCount: row.remain_count,
    expireAt: row.expire_at,
    member: await getMemberView(row.plate_no),
  };
}

/** 员工补登/修改会员资料（车主绑定需要有手机号，常用来补登） */
async function updateMember({ plateNo, phone, nickname, remark, carModel }) {
  const row = await findByPlate(plateNo);
  if (!row) {
    const e = new Error('会员不存在'); e.status = 404; throw e;
  }
  if (phone && !/^1[3-9]\d{9}$/.test(String(phone))) {
    const e = new Error('手机号格式不正确'); e.status = 400; throw e;
  }
  const phonePlain = phone ? String(phone).replace(/\D/g, '') : '';
  await repo.updateProfile(row, {
    phone: phonePlain ? encryptPhone(phonePlain) : null,
    phone_hash: phonePlain ? hashPhone(phonePlain) : null,
    phone_tail_hash: phonePlain ? tailHash(phonePlain) : null,
    nickname: nickname || '',
    car_model: carModel || '',
    remark: remark || '',
  });
  return getMemberView(row.plate_no);
}

async function listMembers({ keyword = '', page = 1, size = 20 }) {
  const r = await repo.list({ keyword, page, size });
  return { total: r.total, page: r.page, size: r.size, list: r.rows.map(toViewModel) };
}

/** 门店看板：会员数、储值总额、待用次数、今日到店、今日新增、累计洗车/打蜡 */
async function overview() {
  const { agg, today, fresh } = await repo.overview();
  return {
    date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }),
    members: Number(agg.members || 0),
    balanceSum: Number(agg.balance || 0),
    remainSum: Number(agg.remain || 0),
    washSum: Number(agg.wash || 0),
    waxSum: Number(agg.wax || 0),
    todayVisits: Number(today || 0),
    todayNew: Number(fresh || 0),
  };
}

/** 会员库里的车牌（闭集校正用） */
async function listPlates() {
  const rows = await repo.listPlates();
  return rows.map((r) => ({ plateNo: r.plate_no, nickname: r.nickname }));
}

/** 最近到店 */
async function recentVisits(limit = 10) {
  const lim = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const rows = await repo.recentVisits(lim);
  return rows.map(toViewModel);
}

/** 车主端：按 openid 取自己的卡（未绑定返回 null） */
async function getCustomerView(openid) {
  const row = await auth.findByOpenid(openid);
  return row ? toViewModel(row) : null;
}

module.exports = {
  getMemberView, createMember, updateMember, consume, recharge, listMembers, overview, recentVisits,
  getCustomerView, toViewModel, listPlates, repo,
  driver: repo.driverName,
  dbDriver: cfg.db.driver,
};
