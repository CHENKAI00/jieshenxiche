const LEVEL_COLORS = ['#8a97a6', '#6f8fa8', '#c9a227', '#7b5ea7'];

function money(n) {
  const v = Number(n || 0);
  return v.toFixed(2);
}

function prettyPlate(p) {
  if (!p) return '';
  return `${p.slice(0, 2)}·${p.slice(2)}`;
}

function levelColor(level) {
  return LEVEL_COLORS[Number(level) || 1] || LEVEL_COLORS[1];
}

function timeAgo(ts) {
  if (!ts) return '—';
  const t = new Date(String(ts).replace(' ', 'T')).getTime();
  if (isNaN(t)) return ts;
  const diff = Date.now() - t;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return String(ts).slice(0, 10);
}

const TYPE_TEXT = { wash: '洗车', recharge: '充值', points: '积分', register: '建档' };

function typeText(t) {
  return TYPE_TEXT[t] || t || '记录';
}

module.exports = { money, prettyPlate, levelColor, timeAgo, typeText };
