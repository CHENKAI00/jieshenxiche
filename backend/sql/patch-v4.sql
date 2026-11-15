-- ============================================================
-- v3 → v4：支持车主端（微信登录绑定会员卡）
--   新增 openid（微信 openid，唯一，NULL 可重复）
--   仍然只有 js_member 一张表
-- ============================================================

USE `jieshenxiche`;

ALTER TABLE `js_member`
  ADD COLUMN `openid` VARCHAR(64) DEFAULT NULL COMMENT '微信 openid（车主端绑定后写入）' AFTER `phone`,
  ADD UNIQUE KEY `uk_openid` (`openid`);

SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA='jieshenxiche' AND TABLE_NAME='js_member' ORDER BY ORDINAL_POSITION;
