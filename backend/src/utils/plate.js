/** 车牌规范化 + 校验 + 展示格式化（前后端共用规则，这里以后端为准） */

const PROVINCES = '京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 无 I/O
const TAIL_CN = '挂学警港澳领试超';

/**
 * 归一化：全角转半角、去空格/点/横线、字母大写、去掉「车牌:」等前缀
 */
function normalizePlate(input) {
  if (!input) return '';
  let s = String(input)
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/^(车牌|车牌号|号码)[:：\s]*/i, '')
    .toUpperCase()
    .replace(/[\s·・.\-_—]/g, '');
  return s;
}

/**
 * 校验大陆车牌（含新能源 8 位）
 * 返回 { ok, plate, color, reason }
 */
function validatePlate(input) {
  const plate = normalizePlate(input);
  if (!plate) return { ok: false, plate, color: '', reason: '车牌为空' };
  if (plate.length < 7 || plate.length > 8) {
    return { ok: false, plate, color: '', reason: '长度不是 7/8 位' };
  }
  if (!PROVINCES.includes(plate[0])) {
    return { ok: false, plate, color: '', reason: '首位不是省级简称' };
  }
  if (!LETTERS.includes(plate[1])) {
    return { ok: false, plate, color: '', reason: '第二位不是发牌机关字母' };
  }
  const body = plate.slice(2, -1);
  if (!/^[A-Z0-9]+$/.test(body)) {
    return { ok: false, plate, color: '', reason: '序号位含非法字符' };
  }
  const tail = plate.slice(-1);
  if (!/[A-Z0-9]/.test(tail) && !TAIL_CN.includes(tail)) {
    return { ok: false, plate, color: '', reason: '末位非法' };
  }
  // 新能源：小型车 8 位，序号首位为 D/F；大型车末位为 D/F
  let color = '蓝';
  if (plate.length === 8) {
    color = /[DF]/.test(plate[2]) || /[DF]/.test(tail) ? '绿' : '黄';
  } else if (TAIL_CN.includes(tail) || /^[A-Z]{2}/.test(plate.slice(4))) {
    color = '黄';
  }
  return { ok: true, plate, color, reason: '' };
}

/** 展示格式化：粤B12345 → 粤B·12345 */
function prettyPlate(plate) {
  const p = normalizePlate(plate);
  if (p.length < 3) return p;
  return `${p.slice(0, 2)}·${p.slice(2)}`;
}

/** 常见 OCR 误识别修正表：0↔O、1↔I、5↔S、8↔B 在数字位上纠偏 */
function fixOcrConfusion(plate) {
  const p = normalizePlate(plate);
  if (p.length < 3) return p;
  const head = p.slice(0, 2); // 省 + 字母
  let body = p.slice(2);
  body = body
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .replace(/S/g, '5')
    .replace(/Z/g, '2');
  // 位置 2（第三位）在普通车牌里是字母的可能性也存在，这里只在能通过校验时采纳
  const candidate = head + body;
  return validatePlate(candidate).ok ? candidate : p;
}

/** 生成会员卡号：JS + yymmdd + 4位随机 */
function genMemberNo() {
  const d = new Date();
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `JS${y}${m}${day}${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

module.exports = { normalizePlate, validatePlate, prettyPlate, fixOcrConfusion, genMemberNo, PROVINCES };
