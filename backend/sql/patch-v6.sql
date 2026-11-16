-- ============================================================
-- v5 → v6：新增车型号（可空，选填）
--   除 plate_no / plate_color / member_no / 计数字段外，其余字段均可为空
-- ============================================================

USE `jieshenxiche`;

ALTER TABLE `js_member`
  ADD COLUMN `car_model` VARCHAR(32) DEFAULT NULL COMMENT '车型号（选填，如 轿车/SUV/新能源）' AFTER `nickname`;

SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA='jieshenxiche' AND TABLE_NAME='js_member'
 ORDER BY ORDINAL_POSITION;
