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
  ocr: {
    secretId: env.TENCENT_SECRET_ID || '',
    secretKey: env.TENCENT_SECRET_KEY || '',
    region: env.TENCENT_OCR_REGION || 'ap-guangzhou',
    mock: String(env.MOCK_OCR || '0') === '1',
  },
  // 洗车项目价目表（后端唯一事实来源）
  items: [
    { id: 'std', name: '标准洗车', price: 25, points: 25, mins: 20 },
    { id: 'suv', name: '精洗SUV/MPV', price: 45, points: 45, mins: 35 },
    { id: 'coat', name: '打蜡养护', price: 88, points: 88, mins: 50 },
    { id: 'inner', name: '内饰深度清洁', price: 128, points: 128, mins: 70 },
    { id: 'newcar', name: '新车开蜡', price: 168, points: 168, mins: 90 },
  ],
  levels: {
    1: { name: '普通会员', discount: 1.0 },
    2: { name: '银卡会员', discount: 0.95 },
    3: { name: '金卡会员', discount: 0.9 },
    4: { name: '钻石会员', discount: 0.85 },
  },
};
