/** 车牌模糊匹配：用于「会员库闭集校正」——把 OCR 结果贴到已有的车牌上 */
const { normalizePlate } = require('./plate');

/** 编辑距离（只做车牌这种 7-8 字符串，O(n*m) 足够） */
function levenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  const m = s.length;
  const n = t.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * 在已有车牌集合里找最接近的
 * @param {string} target OCR 出的车牌
 * @param {string[]} known 会员库里的车牌
 * @returns {{plate:string,distance:number,exact:boolean,unique:boolean}|null}
 */
function bestMatch(target, known) {
  const t = normalizePlate(target);
  if (!t || !Array.isArray(known) || !known.length) return null;
  const scored = known
    .map((p) => ({ plate: normalizePlate(p), distance: levenshtein(t, normalizePlate(p)) }))
    .filter((x) => x.plate)
    .sort((a, b) => a.distance - b.distance);
  if (!scored.length) return null;
  const best = scored[0];
  const same = scored.filter((x) => x.distance === best.distance);
  return {
    plate: best.plate,
    distance: best.distance,
    exact: best.distance === 0,
    unique: same.length === 1,
  };
}

module.exports = { levenshtein, bestMatch };
