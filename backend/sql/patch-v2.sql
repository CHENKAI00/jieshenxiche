-- ============================================================
-- 从 v1（20 字段）迁移到 v2（17 字段精简版）
-- 只动 js_member 一张表，不动库里的其它库
-- 执行：mysql -h127.0.0.1 -uroot -p < backend/sql/patch-v2.sql
-- 或：  cd backend && npm run db:migrate
-- ============================================================

USE `jieshenxiche`;

-- 1) 改名 / 新增（保留历史数据的字段）
ALTER TABLE `js_member`
  CHANGE COLUMN `wash_total`   `total_count`     INT           NOT NULL DEFAULT 0 COMMENT '累计服务次数（洗车/打蜡/抛光…）',
  CHANGE COLUMN `package_left` `remain_count`    INT           NOT NULL DEFAULT 0 COMMENT '剩余次数（次卡）',
  CHANGE COLUMN `last_wash_at` `last_service_at` DATETIME      DEFAULT NULL COMMENT '最近到店时间',
  ADD COLUMN `last_item`   VARCHAR(32)   DEFAULT NULL             COMMENT '最近一次服务项目' AFTER `last_service_at`,
  ADD COLUMN `last_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00    COMMENT '最近一次实收金额' AFTER `last_item`;

-- 2) 删除冗余字段：等级、积分、套餐名、头像、流水 JSON
ALTER TABLE `js_member`
  DROP COLUMN `level`,
  DROP COLUMN `points`,
  DROP COLUMN `package_name`,
  DROP COLUMN `avatar`,
  DROP COLUMN `records`;

-- 3) 老数据回填「最近一次服务」（v1 的流水 JSON 已删，这里只补演示会员的展示值）
UPDATE `js_member` SET `last_item`='精洗SUV/MPV', `last_amount`=50.00
 WHERE `plate_no`='粤B12345' AND (`last_item` IS NULL OR `last_item`='');
UPDATE `js_member` SET `last_item`='标准洗车', `last_amount`=0.00
 WHERE `plate_no`='粤B8888G' AND (`last_item` IS NULL OR `last_item`='');
UPDATE `js_member` SET `last_item`='打蜡', `last_amount`=98.00
 WHERE `plate_no`='粤A66666' AND (`last_item` IS NULL OR `last_item`='');

-- 4) 校验：应只剩 17 个字段
SELECT COUNT(*) AS column_count FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = 'jieshenxiche' AND TABLE_NAME = 'js_member';

SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = 'jieshenxiche' AND TABLE_NAME = 'js_member'
 ORDER BY ORDINAL_POSITION;
