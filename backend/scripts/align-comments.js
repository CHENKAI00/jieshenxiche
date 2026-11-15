/**
 * 统一线上表的字段注释 / 索引名（纯表述层，不动数据）
 * 执行：node scripts/align-comments.js
 */
const mysql = require('mysql2/promise');
const cfg = require('../src/config');

const alter = `
ALTER TABLE \`js_member\`
  MODIFY COLUMN \`plate_color\`     VARCHAR(8)    NOT NULL DEFAULT '蓝' COMMENT '车牌颜色：蓝/绿(新能源)/黄',
  MODIFY COLUMN \`member_no\`       VARCHAR(24)   DEFAULT NULL           COMMENT '会员卡号 JS+yyMMdd+4位',
  MODIFY COLUMN \`nickname\`        VARCHAR(32)   DEFAULT NULL           COMMENT '车主称呼',
  MODIFY COLUMN \`phone\`           VARCHAR(20)   DEFAULT NULL           COMMENT '手机号（接口返回脱敏）',
  MODIFY COLUMN \`balance\`         DECIMAL(10,2) NOT NULL DEFAULT 0.00  COMMENT '储值余额（元），唯一的钱',
  MODIFY COLUMN \`total_count\`     INT           NOT NULL DEFAULT 0     COMMENT '累计服务次数（洗车/打蜡/抛光…）',
  MODIFY COLUMN \`remain_count\`    INT           NOT NULL DEFAULT 0     COMMENT '剩余次数（次卡）',
  MODIFY COLUMN \`expire_at\`       DATE          DEFAULT NULL           COMMENT '次数有效期（过期后核销按余额计价）',
  MODIFY COLUMN \`last_service_at\` DATETIME      DEFAULT NULL           COMMENT '最近到店时间',
  MODIFY COLUMN \`last_item\`       VARCHAR(32)   DEFAULT NULL           COMMENT '最近一次服务项目（洗车/打蜡…）',
  MODIFY COLUMN \`last_amount\`     DECIMAL(10,2) NOT NULL DEFAULT 0.00  COMMENT '最近一次实收金额（0=扣的次数卡）',
  MODIFY COLUMN \`remark\`          VARCHAR(255)  DEFAULT NULL           COMMENT '备注（只洗外观/充电口别冲水…）',
  MODIFY COLUMN \`status\`          TINYINT       NOT NULL DEFAULT 1     COMMENT '1正常 0停用（停用后不参与看板）',
  MODIFY COLUMN \`created_at\`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建档时间',
  MODIFY COLUMN \`updated_at\`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后改动时间',
  COMMENT='洁神洗车会员总表（单表精简版）'
`;

(async () => {
  const c = await mysql.createConnection({
    host: cfg.db.host, port: cfg.db.port, user: cfg.db.user,
    password: cfg.db.password, database: cfg.db.database, charset: 'utf8mb4',
  });
  await c.query(alter);
  try {
    await c.query('ALTER TABLE `js_member` RENAME INDEX `idx_last_wash` TO `idx_last_service`');
    console.log('✅ 索引 idx_last_wash 已改名为 idx_last_service');
  } catch (e) {
    console.log('↷ 索引改名跳过：', e.code);
  }
  const [r] = await c.query('SHOW CREATE TABLE js_member');
  console.log(r[0]['Create Table']);
  await c.end();
})().catch((e) => { console.error('失败:', e.code || '', e.message); process.exit(1); });
