-- ============================================================
-- 洁神洗车 · 数据库初始化（只新建 1 个库 + 1 张表）
-- 目标库：jieshenxiche   唯一业务表：js_member
-- 设计要点：会员 / 车辆 / 套餐 / 余额 / 积分 / 流水全部收在一张表，
--          流水用 JSON 数组存在 records 字段里，不额外建表。
-- ============================================================

CREATE DATABASE IF NOT EXISTS `jieshenxiche`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE `jieshenxiche`;

CREATE TABLE IF NOT EXISTS `js_member` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `plate_no`        VARCHAR(16)  NOT NULL                 COMMENT '车牌号（大写去空格，新能源8位）',
  `plate_color`     VARCHAR(8)   NOT NULL DEFAULT '蓝'     COMMENT '车牌颜色：蓝/绿/黄/白/黑',
  `member_no`       VARCHAR(24)  DEFAULT NULL             COMMENT '会员卡号 JS+日期+序号',
  `nickname`        VARCHAR(32)  DEFAULT NULL             COMMENT '车主称呼',
  `phone`           VARCHAR(20)  DEFAULT NULL             COMMENT '手机号',
  `level`           TINYINT      NOT NULL DEFAULT 1       COMMENT '1普通 2银卡 3金卡 4钻石',
  `balance`         DECIMAL(10,2) NOT NULL DEFAULT 0.00   COMMENT '储值余额（元）',
  `points`          INT          NOT NULL DEFAULT 0       COMMENT '积分',
  `wash_total`      INT          NOT NULL DEFAULT 0       COMMENT '累计洗车次数',
  `package_left`    INT          NOT NULL DEFAULT 0       COMMENT '套餐剩余次数',
  `package_name`    VARCHAR(32)  DEFAULT NULL             COMMENT '套餐名（如 洗车10次卡）',
  `expire_at`       DATE         DEFAULT NULL             COMMENT '套餐/权益到期日',
  `last_wash_at`    DATETIME     DEFAULT NULL             COMMENT '最近到店时间',
  `avatar`          VARCHAR(255) DEFAULT NULL             COMMENT '头像/车辆照片 URL',
  `remark`          VARCHAR(255) DEFAULT NULL             COMMENT '备注（如 只洗外观/豪车）',
  `records`         JSON         DEFAULT NULL             COMMENT '流水数组:[{id,ts,type,item,amount,points,payType,operator,balanceAfter}]',
  `status`          TINYINT      NOT NULL DEFAULT 1       COMMENT '1正常 0停用',
  `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_plate_no` (`plate_no`),
  KEY `idx_phone` (`phone`),
  KEY `idx_last_wash` (`last_wash_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='洁神洗车会员总表（单表设计）';

-- 演示数据（可删）：用于小程序联调「拍照识车牌 → 查会员」链路
INSERT INTO `js_member`
  (`plate_no`,`plate_color`,`member_no`,`nickname`,`phone`,`level`,`balance`,`points`,
   `wash_total`,`package_left`,`package_name`,`expire_at`,`last_wash_at`,`remark`,`records`)
VALUES
  ('粤B12345','蓝','JS2026001','张先生','13800138000',3,268.50,860,26,4,'洗车10次卡','2026-12-31',
   NOW() - INTERVAL 3 DAY,'常客，喜欢周五下午来',
   JSON_ARRAY(
     JSON_OBJECT('id','R1001','ts',DATE_FORMAT(NOW() - INTERVAL 3 DAY,'%Y-%m-%d %H:%i:%s'),
       'type','wash','item','精洗SUV','amount',45.00,'points',45,'payType','套餐次数','operator','前台小李','balanceAfter',268.50),
     JSON_OBJECT('id','R1002','ts',DATE_FORMAT(NOW() - INTERVAL 10 DAY,'%Y-%m-%d %H:%i:%s'),
       'type','recharge','item','充值200送30','amount',200.00,'points',0,'payType','微信支付','operator','前台小李','balanceAfter',268.50)
   )),
  ('粤B8888G','绿','JS2026002','李女士','13900139000',4,1024.00,3200,58,12,'钻石年卡','2027-06-30',
   NOW() - INTERVAL 1 DAY,'新能源，注意充电口别冲水',
   JSON_ARRAY(
     JSON_OBJECT('id','R2001','ts',DATE_FORMAT(NOW() - INTERVAL 1 DAY,'%Y-%m-%d %H:%i:%s'),
       'type','wash','item','标准洗车','amount',25.00,'points',25,'payType','套餐次数','operator','前台小王','balanceAfter',1024.00)
   )),
  ('粤A66666','蓝','JS2026003','王先生','13700137000',2,96.00,320,9,0,NULL,'2026-11-30',
   NOW() - INTERVAL 7 DAY,NULL,
   JSON_ARRAY(
     JSON_OBJECT('id','R3001','ts',DATE_FORMAT(NOW() - INTERVAL 7 DAY,'%Y-%m-%d %H:%i:%s'),
       'type','wash','item','标准洗车','amount',25.00,'points',25,'payType','余额','operator','前台小王','balanceAfter',96.00)
   ));
