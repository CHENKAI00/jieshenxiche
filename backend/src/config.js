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
  /**
   * 服务价目表（唯一事实来源）
   * 门店不只洗车：洗车 / 打蜡 / 抛光 / 内饰 / 玻璃镀膜 都在这里，
   * 小程序与核销弹窗按 tag 分组展示，加项目只改这一处。
   */
  services: [
    { id: 'wash_std', name: '标准洗车', price: 30, mins: 20, tag: '洗车' },
    { id: 'wash_suv', name: '精洗SUV/MPV', price: 50, mins: 35, tag: '洗车' },
    { id: 'wax', name: '打蜡', price: 98, mins: 45, tag: '美容' },
    { id: 'polish', name: '抛光', price: 180, mins: 60, tag: '美容' },
    { id: 'inner', name: '内饰清洁', price: 128, mins: 70, tag: '美容' },
    { id: 'glass', name: '玻璃镀膜', price: 88, mins: 30, tag: '美容' },
    { id: 'newcar', name: '新车开蜡', price: 168, mins: 90, tag: '美容' },
  ],
  // 充值常用档位（小程序展示，可后端也用来校验）
  rechargePlans: [
    { amount: 100, gift: 0, times: 0 },
    { amount: 200, gift: 30, times: 0 },
    { amount: 300, gift: 60, times: 2 },
    { amount: 500, gift: 150, times: 5 },
    { amount: 1000, gift: 400, times: 12 },
  ],
};
