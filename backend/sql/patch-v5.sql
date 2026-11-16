-- ============================================================
-- v4 → v5：手机号加密存储
--   phone          → 存 AES-256-GCM 密文（enc:v1.xxx），长度放宽到 255
--   phone_hash     → 完整手机号的 HMAC 盲索引（支持精确搜索/绑定校验）
--   phone_tail_hash→ 后 4 位的 HMAC 盲索引（支持「填后 4 位」绑定）
-- 仍需执行 scripts/migrate-v5.js 做老数据加密回填（本文件只改结构）
-- ============================================================

USE `jieshenxiche`;

ALTER TABLE `js_member`
  MODIFY COLUMN `phone` VARCHAR(255) DEFAULT NULL COMMENT '手机号密文（AES-256-GCM，enc:v1.…）',
  ADD COLUMN `phone_hash` CHAR(64) DEFAULT NULL COMMENT '手机号 HMAC 盲索引（完整号）' AFTER `phone`,
  ADD COLUMN `phone_tail_hash` CHAR(64) DEFAULT NULL COMMENT '手机号后 4 位 HMAC 盲索引' AFTER `phone_hash`,
  ADD KEY `idx_phone_hash` (`phone_hash`);

SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA='jieshenxiche' AND TABLE_NAME='js_member' ORDER BY ORDINAL_POSITION;
