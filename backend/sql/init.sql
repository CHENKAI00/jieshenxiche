-- ============================================================
-- 洁神洗车 · 数据库初始化（精简版 v3）
-- 目标库：jieshenxiche   唯一业务表：js_member（17 字段）
--
-- v3 变更：total_count 拆成 wash_count(洗车) / wax_count(打蜡)；
--          删除 last_amount（不再记最近实收）
-- 服务项目不在这张表：目录在 backend/data/services.json，后台可增删改
-- ============================================================

CREATE DATABASE IF NOT EXISTS `jieshenxiche`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE `jieshenxiche`;

CREATE TABLE IF NOT EXISTS `js_member` (
  `id`               INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '主键',
  `plate_no`         VARCHAR(16)   NOT NULL                COMMENT '车牌号（大写去空格，新能源8位）',
  `plate_color`      VARCHAR(8)    NOT NULL DEFAULT '蓝'    COMMENT '车牌颜色：蓝/绿(新能源)/黄',
  `member_no`        VARCHAR(24)   DEFAULT NULL            COMMENT '会员卡号 JS+yyMMdd+4位',
  `nickname`         VARCHAR(32)   DEFAULT NULL            COMMENT '车主称呼',
  `phone`            VARCHAR(255)  DEFAULT NULL            COMMENT '手机号密文（AES-256-GCM，enc:v1.…）',
  `phone_hash`       CHAR(64)      DEFAULT NULL            COMMENT '手机号 HMAC 盲索引（完整号）',
  `phone_tail_hash`  CHAR(64)      DEFAULT NULL            COMMENT '手机号后 4 位 HMAC 盲索引',
  `balance`          DECIMAL(10,2) NOT NULL DEFAULT 0.00   COMMENT '储值余额（元），唯一的钱',
  `remain_count`     INT           NOT NULL DEFAULT 0      COMMENT '剩余次数（次卡）',
  `wash_count`       INT           NOT NULL DEFAULT 0      COMMENT '洗车次数',
  `wax_count`        INT           NOT NULL DEFAULT 0      COMMENT '打蜡次数',
  `expire_at`        DATE          DEFAULT NULL            COMMENT '次数有效期（过期后核销按余额计价）',
  `last_service_at`  DATETIME      DEFAULT NULL            COMMENT '最近到店时间',
  `last_item`        VARCHAR(32)   DEFAULT NULL            COMMENT '最近一次服务项目（洗车/打蜡…）',
  `remark`           VARCHAR(255)  DEFAULT NULL            COMMENT '备注（只洗外观/充电口别冲水…）',
  `status`           TINYINT       NOT NULL DEFAULT 1      COMMENT '1正常 0停用（停用后不参与看板）',
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建档时间',
  `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后改动时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_plate_no` (`plate_no`),
  KEY `idx_phone_hash` (`phone_hash`),
  KEY `idx_last_service` (`last_service_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='洁神洗车会员总表（单表精简版）';

-- 演示数据（可删）：用于小程序联调「拍照识车牌 → 查会员」链路
-- INSERT IGNORE 保证脚本可重复执行
-- 注意：这里的手机号是明文，首次执行后请跑 `npm run migrate:v5` 加密回填
INSERT IGNORE INTO `js_member`
  (`plate_no`,`plate_color`,`member_no`,`nickname`,`phone`,`balance`,
   `remain_count`,`wash_count`,`wax_count`,`expire_at`,
   `last_service_at`,`last_item`,`remark`)
VALUES
  ('粤B12345','蓝','JS2026001','张先生','13800138000',268.50,4,26,2,'2026-12-31',
   NOW() - INTERVAL 3 DAY,'精洗SUV/MPV','常客，喜欢周五下午来'),
  ('粤B8888G','绿','JS2026002','李女士','13900139000',1024.00,12,58,1,'2027-06-30',
   NOW() - INTERVAL 1 DAY,'标准洗车','新能源，注意充电口别冲水'),
  ('粤A66666','蓝','JS2026003','王先生','13700137000',96.00,0,9,4,'2026-11-30',
   NOW() - INTERVAL 7 DAY,'打蜡','喜欢打蜡，每月一次');
