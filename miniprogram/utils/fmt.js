function money(n) {
  return Number(n || 0).toFixed(2);
}

function prettyPlate(p) {
  if (!p) return '';
  return `${p.slice(0, 2)}·${p.slice(2)}`;
}

function timeAgo(ts) {
  if (!ts) return '—';
  const t = new Date(String(ts).replace(' ', 'T')).getTime();
  if (isNaN(t)) return ts;
  const diff = Date.now() - t;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 86400000 * 30) return `${Math.floor(diff / 86400000)} 天前`;
  return String(ts).slice(0, 10);
}

/** 按服务名给一个标签色：洗车类=蓝，美容类=橙 */
const WASH = ['洗车', '精洗', '开蜡'];
function serviceTag(name) {
  if (!name) return 'grey';
  if (name.indexOf('充值') === 0) return 'mint';
  return WASH.some((k) => name.includes(k)) ? '' : 'gold';
}

module.exports = { money, prettyPlate, timeAgo, serviceTag };
