const express = require('express');
const cors = require('cors');
const path = require('path');
const cfg = require('./config');
const { ping } = require('./db');
const { staffAuth } = require('./middleware/auth');
const ocrRouter = require('./routes/ocr');
const memberRouter = require('./routes/member');
const washRouter = require('./routes/wash');
const statsRouter = require('./routes/stats');
const catalogRouter = require('./routes/catalog');
const adminRouter = require('./routes/admin');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态资源：项目图片 + Web 后台管理系统
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), { maxAge: '7d' }));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));

app.get('/health', async (req, res) => {
  let db = 'down';
  try { db = (await ping()) ? 'up' : 'down'; } catch (e) { db = `down:${e.code || e.message}`; }
  res.json({
    ok: true,
    service: 'jieshenxiche-api',
    db,
    ocr: cfg.ocr.mock || !cfg.ocr.secretId ? 'mock' : 'tencent',
    admin: '/admin/',
    time: new Date().toISOString(),
  });
});

// 小程序接口（员工口令）
app.use('/api/v1/ocr', staffAuth, ocrRouter);
app.use('/api/v1/catalog', staffAuth, catalogRouter);
app.use('/api/v1/member', staffAuth, memberRouter);
app.use('/api/v1/wash', staffAuth, washRouter);
app.use('/api/v1/stats', staffAuth, statsRouter);
// 后台管理接口：登录接口在 router 内部放行，其余走 staffAuth
app.use('/api/v1/admin', adminRouter);

app.use((req, res) => res.status(404).json({ ok: false, msg: '接口不存在', path: req.path }));

// 统一错误出口
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[ERR]', req.method, req.originalUrl, err);
  res.status(status).json({
    ok: false,
    code: err.code || (status === 500 ? 'SERVER_ERROR' : 'BAD_REQUEST'),
    msg: err.message || '服务异常',
  });
});

if (require.main === module) {
  app.listen(cfg.port, () => {
    console.log(`洁神洗车 API 已启动: http://127.0.0.1:${cfg.port}`);
    console.log(`Web 后台管理系统: http://127.0.0.1:${cfg.port}/admin/`);
    console.log(`数据库: ${cfg.db.user}@${cfg.db.host}:${cfg.db.port}/${cfg.db.database}`);
  });
}

module.exports = app;
