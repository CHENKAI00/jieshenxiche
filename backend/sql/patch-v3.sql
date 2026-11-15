-- ============================================================
-- v2 → v3：次数拆分 + 去掉 last_amount
--   total_count  → wash_count(洗车次数) + wax_count(打蜡次数)
--   last_amount  → 删除（不需要「最近实收」，看板也不再统计今日实收）
-- 只动 js_member 一张表
-- ============================================================

USE `jieshenxiche`;

-- 1) 加两列：先按历史 total_count 全部算作洗车次数（打蜡从 0 开始）
ALTER TABLE `js_member`
  ADD COLUMN `wash_count` INT NOT NULL DEFAULT 0 COMMENT '洗车次数' AFTER `remain_count`,
  ADD COLUMN `wax_count`  INT NOT NULL DEFAULT 0 COMMENT '打蜡次数' AFTER `wash_count`;

UPDATE `js_member` SET `wash_count` = `total_count`;

-- 2) 删掉总次数与最近实收
ALTER TABLE `js_member`
  DROP COLUMN `total_count`,
  DROP COLUMN `last_amount`;

-- 3) 校验
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA='jieshenxiche' AND TABLE_NAME='js_member' ORDER BY ORDINAL_POSITION;
