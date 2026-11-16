const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const env = process.env;

module.exports = {
  port: Number(env.PORT || 8099),
  publicBaseUrl: env.PUBLIC_BASE_URL || 'http://127.0.0.1:8099',
  adminToken: env.ADMIN_TOKEN || 'js-wash-2026', // 演示默认值，上线务必改 .env
  db: {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'jieshenxiche',
    waitForConnections: true,
    connectionLimit: Number(env.DB_CONN_LIMIT || 10),
    charset: 'utf8mb4',
    timezone: '+08:00',
    dateStrings: true,
    decimalNumbers: true,
  },
  // 车主端微信登录（不填 appId/secret 时自动 mock，方便本地联调）
  wx: {
    appId: env.WX_APPID || '',
    secret: env.WX_SECRET || '',
    mock: String(env.WX_MOCK || '0') === '1',
  },
  // 老板本人的微信 openid（逗号分隔）：登录即自动进门店端，零成本
  bossOpenids: String(env.BOSS_OPENID || '').split(',').map((x) => x.trim()).filter(Boolean),
  ocr: {
    // engine: auto（有本地识别服务优先用它）| hyperlpr | tencent | mock
    engine: env.OCR_ENGINE || 'auto',
    hyperlprUrl: env.HYPERLPR_URL || 'http://127.0.0.1:18090',
    secretId: env.TENCENT_SECRET_ID || '',
    secretKey: env.TENCENT_SECRET_KEY || '',
    region: env.TENCENT_OCR_REGION || 'ap-guangzhou',
    mock: String(env.MOCK_OCR || '0') === '1',
  },
  // 服务项目目录已挪到 data/services.json（后台可增删改），见 src/services/catalog.js
  // 充值常用档位（小程序展示，可后端也用来校验）
  rechargePlans: [
    { amount: 100, gift: 0, times: 0 },
    { amount: 200, gift: 30, times: 0 },
    { amount: 300, gift: 60, times: 2 },
    { amount: 500, gift: 150, times: 5 },
    { amount: 1000, gift: 400, times: 12 },
  ],
};
