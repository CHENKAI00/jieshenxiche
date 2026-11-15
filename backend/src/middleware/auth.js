const cfg = require('../config');

/** 员工口令校验：小程序每个请求都带 x-token 头 */
function staffAuth(req, res, next) {
  const token = req.get('x-token') || req.query.token || '';
  if (!cfg.adminToken) return next();
  if (String(token) !== String(cfg.adminToken)) {
    return res.status(401).json({ ok: false, code: 'NO_AUTH', msg: '员工口令不正确，请在「我的」页重新设置' });
  }
  next();
}

module.exports = { staffAuth };
