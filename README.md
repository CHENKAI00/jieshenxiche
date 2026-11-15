# 洁神洗车 · 微信小程序（拍照识车牌查会员）

门店员工端：**拍一下车牌，立刻调出这辆车的会员档案（余额、剩余次数、累计服务、最近到店）**，并当场完成核销 / 充值 / 建档。
服务不限于洗车 —— 洗车、打蜡、抛光、内饰清洁、玻璃镀膜 都在价目表里，一套核销逻辑通吃。

```
jieshenxiche/
├── README.md
├── scripts/push-git.sh          一键推送到远程 Git
├── backend/                     Node.js + Express + MySQL
│   ├── .env                     数据库与口令（已 gitignore，不入库）
│   ├── sql/init.sql             建库建表（17 字段精简版）
│   ├── sql/patch-v2.sql         v1(20字段) → v2(17字段) 迁移脚本
│   ├── scripts/init-db.js       npm run db:init
│   ├── scripts/migrate-v2.js    npm run db:migrate
│   ├── src/
│   │   ├── app.js               入口 / 路由 / 统一错误出口
│   │   ├── config.js            服务价目表、充值档位（唯一事实来源）
│   │   ├── db.js                mysql2 连接池
│   │   ├── middleware/auth.js   员工口令校验
│   │   ├── routes/              ocr / member / wash / stats
│   │   ├── services/ocr.js      腾讯云 LicensePlateOCR（TC3 签名，零 SDK）
│   │   ├── services/member.js   建档 / 核销 / 充值 / 看板
│   │   └── utils/plate.js       车牌归一化、校验、颜色、OCR 纠偏
│   └── test/api.smoke.js        24 条端到端断言（无需数据库）
└── miniprogram/                 微信开发者工具直接导入
    ├── app.js / app.json / app.wxss
    ├── project.config.json      urlCheck 已关，本地直连 127.0.0.1
    ├── utils/api.js             请求封装（统一 x-token、统一报错）
    ├── utils/fmt.js             金额/车牌/时间/服务标签
    └── pages/  index 首页 · scan 拍车牌 · member 会员卡 · recharge 充值
                records 会员名录 · admin 门店工作台 · mine 我的
```

---

## 一、特色功能：拍照识车牌查会员

```
wx.chooseMedia 拍照
  → wx.uploadFile → POST /api/v1/ocr/plate
       ├ 腾讯云 LicensePlateOCR（手写 TC3-HMAC-SHA256 签名）
       ├ fixOcrConfusion()  O→0 / I→1 / S→5 纠偏
       ├ validatePlate()    省简称+发牌机关+序号位，判 蓝/绿(新能源)/黄
       ├ SELECT * FROM js_member WHERE plate_no=? LIMIT 1
       └ 一次返回 车牌 + 置信度 + 会员（余额/剩余次数/累计/最近一次）
  → 结果卡片；未建档一键建档（车牌已带入）；识别失败弹手输，不挡业务
```

| 设计 | 原因 |
| --- | --- |
| 识别 + 查询合成一个接口 | 前台只等一次往返，拍完就出卡 |
| 车牌归一化 + OCR 纠偏 + 合法性校验 | 车牌是唯一检索键，脏数据就查不到会员 |
| 图片只走内存（multer memoryStorage） | 车主照片不落盘 |
| 无密钥时 MOCK 识别 | 本地零成本跑通全链路（页面标「演示模式」） |

---

## 二、数据库：`jieshenxiche` 库 + `js_member` 一张表（17 字段精简版）

按店主意见精简：**去掉 level（不做等级）、points（与余额重复）、package_name、avatar、records（不存流水明细）**，
`wash_total` 改名 `total_count`（累计服务次数，洗车/打蜡都算）；另外只保留「最近一次服务」三个字段，用来看门店最近动态。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | INT UNSIGNED AI | 主键 |
| plate_no | VARCHAR(16) UNIQUE | 车牌（大写去空格，新能源 8 位），检索键 |
| plate_color | VARCHAR(8) | 蓝 / 绿 / 黄（识别结果回填） |
| member_no | VARCHAR(24) | 卡号 JS+日期+4位 |
| nickname / phone | VARCHAR | 称呼、手机（返回自动脱敏 138****8000） |
| balance | DECIMAL(10,2) | 储值余额（唯一的钱） |
| remain_count | INT | 剩余次数（次卡） |
| total_count | INT | **累计服务次数**（洗车/打蜡/抛光…） |
| expire_at | DATE | 次数有效期 |
| last_service_at | DATETIME | 最近到店 |
| last_item | VARCHAR(32) | 最近一次服务项目 |
| last_amount | DECIMAL(10,2) | 最近一次实收金额 |
| remark | VARCHAR(255) | 备注（如「新能源，充电口别冲水」） |
| status / created_at / updated_at | — | 状态与时间戳 |

**为什么不再存流水**：单表要求下，流水要么单开表、要么塞 JSON 数组；店主明确不需要明细。
所以只保留 `last_*` 三个字段回答「这车最近来做了什么」，账目级明细不再留（需要时再开第二张表）。

### 已建好 / 迁移

```bash
cd backend
npm run db:init       # 首次：建库 jieshenxiche + 表 js_member（幂等）
npm run db:migrate    # 从 v1(20字段/带 records) 升级到 v2(17字段)，只 ALTER 本表
```

v1→v2 迁移做的事：`wash_total→total_count`、`package_left→remain_count`、`last_wash_at→last_service_at`，
新增 `last_item/last_amount`，删除 `level/points/package_name/avatar/records`；老数据回填演示会员的最近服务。

---

## 三、接口一览（前缀 `/api/v1`，请求头 `x-token`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 服务 / 数据库 / OCR 状态 |
| POST | `/ocr/plate` | 拍照识别：form-data `file` 或 JSON `image`(base64)；返回车牌 + 会员 |
| GET | `/ocr/meta` | 服务价目表、充值档位 |
| GET | `/member/:plate` | 车牌查会员（未建档 `exists:false`） |
| GET | `/member?keyword=&page=&size=` | 会员名录搜索 |
| POST | `/member` | 建档 `{plateNo,nickname,phone,remark}` |
| POST | `/wash/consume` | 核销 `{plateNo,serviceId,useCount,operator}`；次数优先，否则扣余额 |
| POST | `/wash/recharge` | 充值 `{plateNo,amount,giftAmount,times,months}` |
| GET | `/stats/overview` | 今日到店 / 今日实收 / 会员数 / 储值总额 / 未用次数 / 今日新增 |
| GET | `/stats/recent?limit=` | 最近到店（按 `last_service_at` 倒序） |

价目表（`src/config.js`，小程序从 `/ocr/meta` 拉取，改价只改一处）：

```
洗车   标准洗车 ¥30 · 精洗SUV/MPV ¥50
美容   打蜡 ¥98 · 抛光 ¥180 · 内饰清洁 ¥128 · 玻璃镀膜 ¥88 · 新车开蜡 ¥168
核销规则：次数卡未过期 → 扣 1 次；否则扣余额；余额不足 402 拦下，不会扣成负数
```

> 看板口径：`今日到店` 取 `DATE(last_service_at)=CURDATE()`；`今日实收` 取这些会员的 `last_amount` 之和
> （单表只记最近一次，同一会员当天来两次也只算最后一单的金额；要精确账目就再加流水表）。

---

## 四、跑起来

```bash
cd backend
npm run db:init       # 首次；已建过会跳过
npm start             # http://127.0.0.1:8099
npm test              # 24 条业务断言，不需要数据库
```

微信开发者工具 → 导入 `jieshenxiche/miniprogram`（urlCheck 已关，本地免配域名）→「我的」页确认
`服务地址 http://127.0.0.1:8099`、`员工口令` 见 `backend/.env` 的 `ADMIN_TOKEN`、员工姓名填门店实际经办人。
真机预览把地址换成局域网 IP 或 https 域名；发布前把域名加入 request / uploadFile 合法域名。

真实车牌识别：`.env` 填 `TENCENT_SECRET_ID/KEY` + `MOCK_OCR=0`（腾讯云文字识别 LicensePlateOCR）。

---

## 五、已验证

`cd backend && npm test` → **24/24 通过**（内存假库替换 db 层，跑真实路由与业务代码）：

```
✅ 车牌归一化 / 新能源绿牌 / 非法车牌拒绝 / OCR 纠偏
✅ 无口令 401
✅ 价目表含打蜡等美容项目            ✅ 等级/积分字段已从返回中消失
✅ 建档 / 车牌归一化后不重复建档      ✅ 新会员默认 余额0/次数0/总次数0
✅ 上传图片走 OCR 并带会员            ✅ 充值到账 230 元 + 10 次 + 有效期
✅ 洗车核销扣次数                    ✅ 打蜡（非洗车项目）按余额核销
✅ 余额不足 402 不扣负               ✅ 未建档 exists=false
✅ 详情只剩余额/剩余次数/总次数       ✅ 不再返回 records
✅ 看板 今日到店/今日实收/会员数      ✅ 看板不再输出积分/套餐名
✅ 最近到店按 last_service_at         ✅ 会员名录搜索
```

**真实 MySQL 联调（MySQL 8.0.43）：**

```
/health                    → {"db":"up","ocr":"mock"}
/member/粤B12345           → 张先生 · 余额 268.50 · 剩余 3 次 · 累计 27 次 · 最近 精洗SUV/MPV ¥50
/wash/consume 精洗SUV      → 扣次数（余 2）· 累计 28 · 余额不变
/stats/overview            → 会员 3 · 储值 1400.50 · 未用 16 次 · 今日到店 2 · 今日实收 98
/stats/recent              → 粤B·12345 精洗 / 粤A·66666 打蜡 / 粤B·8888G 标准洗车
```

小程序侧：JSON / JS / WXML 全通过语法校验，事件处理函数全部实现。

---

## 六、还能接着做

- **微信支付**：`recharge.js` 的「确认收款」换 `wx.requestPayment`（后端统一下单 + 回调，余额以回调为准）。
- **精确账目**：店主哪天要日报表，再开第二张 `js_order` 流水表（报价 / 实收 / 经办人 / 支付方式），看板改成聚合它。
- **次卡按项目计次**：现在次数是通用的；若要「洗车 10 次 + 打蜡 3 次」，把 `remain_count` 拆成两列或用 JSON 记各类次数。
- **到期提醒 / 复购召回**：按 `last_service_at`、`expire_at` 跑定时任务，走订阅消息。
