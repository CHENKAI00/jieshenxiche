# 洁神洗车 · 微信小程序（拍照识车牌查会员）

一个面向洗车门店的员工端小程序：**拍一下车牌，立刻调出这辆车的会员档案、余额、剩余套餐、积分和洗车流水**，并当场完成核销 / 充值 / 建档。

```
jieshenxiche/
├── README.md
├── backend/                    Node.js + Express + MySQL 接口服务
│   ├── .env                    ← 数据库与口令配置（本机已填好，已被 .gitignore 排除）
│   ├── sql/init.sql            ← 只建 1 个库 + 1 张表
│   ├── scripts/init-db.js      ← 一键建库建表（npm run db:init）
│   ├── src/
│   │   ├── app.js              入口 / 路由挂载 / 统一错误出口
│   │   ├── config.js           价目表、会员等级、折扣
│   │   ├── db.js               mysql2 连接池 + JSON 字段解析
│   │   ├── middleware/auth.js  员工口令校验
│   │   ├── routes/             ocr / member / wash / stats
│   │   ├── services/ocr.js     腾讯云车牌识别（TC3 签名，零 SDK）
│   │   ├── services/member.js  会员业务（核销/充值/积分/看板）
│   │   └── utils/plate.js      车牌归一化、校验、颜色判定、OCR 纠偏
│   └── test/api.smoke.js       19 条端到端断言（无需数据库即可跑）
└── miniprogram/                微信小程序源码（开发者工具直接导入）
    ├── app.js / app.json / app.wxss
    ├── project.config.json     urlCheck 已关闭，本地直连 127.0.0.1
    ├── utils/api.js            请求封装（统一 x-token、统一报错）
    ├── utils/fmt.js            金额/车牌/等级颜色格式化
    └── pages/
        ├── index/              首页：大字按钮 + 今日看板 + 最近到店
        ├── scan/               ★ 拍照识车牌 → 会员卡（核心页）
        ├── member/             会员卡：余额/套餐/积分/流水 + 核销 + 建档
        ├── recharge/           充值开卡（充送、赠次、有效期、升级）
        ├── records/            会员名录搜索 / 单会员全部流水
        ├── admin/              门店工作台：看板 + 快速核销 + 服务状态
        └── mine/               服务地址、员工口令、员工姓名、价目表
```

---

## 一、特色功能：拍照识车牌查会员

```
小程序端                          后端                         数据库
wx.chooseMedia 拍照
      │  tempFilePath
      ▼
wx.uploadFile → POST /api/v1/ocr/plate  (form-data: file)
                                   │
                                   ├─ 腾讯云 LicensePlateOCR（TC3-HMAC-SHA256 签名）
                                   ├─ fixOcrConfusion()：O→0 / I→1 / S→5 自动纠偏
                                   ├─ validatePlate()：省简称+发牌机关+序号位校验，
                                   │   顺带判定 蓝/绿(新能源)/黄 车牌颜色
                                   ├─ SELECT * FROM js_member WHERE plate_no=? LIMIT 1
                                   ▼
      ← 一次返回 { plateNo, platePretty, plateColor, confidence, exists, member{...} }
      │
      ▼
识别结果卡片：车牌大字 + 置信度 + 会员姓名/等级/余额/套餐/积分
   ├─ 已建档 → 「进入会员卡」「充值」
   └─ 未建档 → 「立即建档」（车牌已带入，只需填称呼/手机）
```

关键设计点：

| 设计 | 原因 |
| --- | --- |
| 识别与查询合成 **一个接口** | 前台只等一次网络往返，拍完就到卡片 |
| 车牌做 **归一化 + 混淆纠偏 + 合法性校验** | 车牌是唯一检索键，脏数据会让会员查不到 |
| OCR 失败 **不阻塞业务** | 自动弹出「手动输入车牌」，照样查会员 |
| 未配腾讯云密钥 → **MOCK 识别** | 本地/演示零成本跑通全链路（结果页会标「演示模式」） |
| 图片只走内存（multer memoryStorage） | 不在服务器落盘，避免车主照片堆积 |

---

## 二、数据库：`jieshenxiche` 库 + `js_member` 一张表

按你的要求 **只新建 1 个库、1 张表**。会员、车辆、套餐、余额、积分、流水全部收在 `js_member` 里，
流水用 JSON 数组存在 `records` 字段（不额外建流水表），核销时用 `SELECT ... FOR UPDATE` 保证并发下不重复扣次。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | INT UNSIGNED AI | 主键 |
| plate_no | VARCHAR(16) UNIQUE | 车牌（大写去空格，新能源 8 位），唯一索引 = 扫码检索键 |
| plate_color | VARCHAR(8) | 蓝 / 绿 / 黄 |
| member_no | VARCHAR(24) | 卡号 JS+日期+4位 |
| nickname / phone | VARCHAR | 车主称呼、手机（接口返回自动脱敏 138****8000） |
| level | TINYINT | 1 普通 2 银卡 3 金卡 4 钻石（折扣 1.0/0.95/0.9/0.85） |
| balance | DECIMAL(10,2) | 储值余额 |
| points | INT | 积分（消费 1 元 = 1 分） |
| wash_total | INT | 累计洗车次数 |
| package_left / package_name / expire_at | INT/VARCHAR/DATE | 次卡剩余次数、套餐名、到期日 |
| last_wash_at | DATETIME | 最近到店（首页「最近到店」排序用） |
| remark | VARCHAR(255) | 备注（如「新能源，充电口别冲水」） |
| records | JSON | 流水数组：`[{id,ts,type,item,amount,points,payType,operator,balanceAfter}]` |
| status / created_at / updated_at | — | 状态与时间戳 |

### 建库（当前这台机器被数据库拒绝，见下）

```sql
-- 等价于 backend/sql/init.sql 的第一段；完整脚本含建表 + 3 条演示会员
CREATE DATABASE IF NOT EXISTS `jieshenxiche` DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_general_ci;
```

**执行方式（三选一）：**

1. 在数据库所在服务器上跑（最稳）：
   ```bash
   mysql -h127.0.0.1 -uroot -p'<你的数据库口令>' < backend/sql/init.sql
   ```
2. 用 Navicat / phpMyAdmin / DBeaver 连上后，整段粘贴 `backend/sql/init.sql` 执行。
3. 授权本机 IP 后在这里跑一键脚本：
   ```sql
   CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY '<你的数据库口令>';
   GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;
   FLUSH PRIVILEGES;
   ```
   ```bash
   cd backend && npm run db:init
   ```

> ⚠️ 实测记录：`<DB_HOST>:3306` TCP 可达、握手返回 **MySQL 8.0.43**，但从本机用 `root` 登录返回
> `ER_ACCESS_DENIED_ERROR Access denied for user 'root'@'<本机公网IP>' (using password: YES)`
> 即账号存在、但来源主机未授权或口令不匹配（账号口令请以你自己的为准）。上表第 1/2 条任选其一即可建库，
> `backend/.env` 与 `sql/init.sql` 都已就绪，授权后一条命令建完。

---

## 三、接口一览（前缀 `/api/v1`，请求头带 `x-token: 员工口令`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 服务/数据库/OCR 状态（小程序「门店」「我的」页显示） |
| POST | `/ocr/plate` | **拍照识别**：form-data `file` 或 JSON `image`(base64)；返回车牌+会员 |
| GET | `/ocr/meta` | 价目表、会员等级折扣 |
| GET | `/member/:plate` | 车牌查会员（未建档返回 `exists:false`） |
| GET | `/member?keyword=&page=&size=` | 会员名录（车牌/姓名/手机/卡号模糊搜） |
| POST | `/member` | 建档 `{plateNo,nickname,phone,level,remark}` |
| POST | `/member/:plate/points` | 积分兑换 `{points,item}` |
| POST | `/wash/consume` | 核销 `{plateNo,itemId,usePackage,operator}`；优先扣套餐次数，否则余额并按等级打折 |
| POST | `/wash/recharge` | 充值 `{plateNo,amount,giftAmount,times,packageName,months,level}` |
| GET | `/stats/overview` | 门店看板：今日核销、今日营收、会员数、储值总额、待用套餐 |
| GET | `/stats/recent?limit=` | 全店最近流水 |

业务规则（`src/config.js` 唯一事实来源，小程序通过对 `/ocr/meta` 拉取，改价只改一处）：

```
标准洗车 ¥25 / 精洗SUV ¥45 / 打蜡 ¥88 / 内饰深度 ¥128 / 新车开蜡 ¥168
会员等级折扣 1.0 / 0.95 / 0.9 / 0.85；消费 1 元 = 1 积分
核销顺序：套餐次数（未过期优先）→ 余额 → 余额不足直接 402 拦下，不会扣成负数
```

---

## 四、跑起来（3 步）

```bash
# 1. 后端（依赖已装好）
cd backend
npm run db:init      # 首次建库建表（需要数据库授权，见上一节）
npm start            # → http://127.0.0.1:8099
npm test             # 可选：19 条业务断言，不依赖数据库

# 2. 小程序：微信开发者工具 → 导入项目 → 选择 jieshenxiche/miniprogram
#    project.config.json 已设 urlCheck:false，本地无需配置合法域名

# 3. 小程序「我的」页确认：
#    服务地址 http://127.0.0.1:8099    员工口令 见 backend/.env 的 ADMIN_TOKEN    员工姓名 前台小李
```

真机预览时把「服务地址」换成局域网 IP（如 `http://192.168.1.8:8099`）或已备案的 https 域名；
正式发布需在微信公众平台把域名加入 **request 合法域名 / uploadFile 合法域名**。

### 启用真实车牌识别

`.env` 填上腾讯云密钥（OCR 的 `LicensePlateOCR` 接口，需开通文字识别服务）：

```ini
TENCENT_SECRET_ID=AKIDxxxx
TENCENT_SECRET_KEY=xxxx
TENCENT_OCR_REGION=ap-guangzhou
MOCK_OCR=0
```

不填密钥时自动走 MOCK（随机返回演示车牌，用于把交互跑通）。签名是手写的 TC3-HMAC-SHA256，**不依赖腾讯云 SDK**，少一层依赖。

---

## 五、已验证

`cd backend && npm test` → **19/19 通过**（用内存假库替换 `src/db.js`，跑真实路由与业务代码）：

```
✅ 车牌归一化 粤b·12345 → 粤B12345        ✅ 新能源 8 位绿牌校验
✅ 非法车牌被拒绝                          ✅ OCR 混淆纠偏 O→0
✅ 无口令访问 401 拦截                     ✅ 建档 / 重复建档幂等
✅ 上传图片走 OCR 链路并带出会员           ✅ 充值 + 赠额 + 赠次 + 有效期
✅ 核销扣套餐次数                          ✅ 套餐用完走余额并享金卡 9 折
✅ 余额不足 402 不扣成负数                 ✅ 未建档车牌 exists=false
✅ 会员详情手机号脱敏 + 流水               ✅ 积分兑换扣减
✅ 门店看板统计                            ✅ 会员名录搜索
✅ 最近流水倒序
```

小程序侧：所有 JSON / JS / WXML 通过语法校验，WXML 中 30+ 个事件处理函数均已实现。

---

## 六、还能接着做

- **微信支付**：把 `recharge.js` 里的「确认收款」换成 `wx.requestPayment`（后端加统一下单 + 回调），余额到账走回调而不是前端。
- **洗车排队叫号**：`records` 里加 `status: waiting/washing/done`，门店页出排队看板。
- **车牌识别加强**：识别失败两次后自动进「手动修正 + 记住」，把修正结果回写 `plate_no` 别名（同一表加 `plate_alias` JSON 字段即可，仍是一张表）。
- **车主端**：同一后端再开一套 C 端小程序，用手机号登录看自己的卡。
- **到期提醒 / 复购召回**：按 `last_wash_at`、`expire_at` 跑定时任务，走订阅消息。
