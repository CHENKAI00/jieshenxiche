# 洁神洗车 · 微信小程序（门店端 + 车主端）+ Web 后台管理

同一套小程序，两种身份：

- **门店员工**：拍一下车牌就调出会员档案（余额、剩余次数、洗车/打蜡次数、最近到店），当场核销 / 充值 / 建档
- **车主**：微信登录 + 车牌手机号绑定，看自己的余额、剩余次数、洗车打蜡记录、店内项目

另配一套 **Web 后台管理系统**：维护店内项目（图片 / 价格 / 时长 / 上下架 / 排序）、查会员、看门店数据。

```
jieshenxiche/
├── README.md
├── docs/表结构说明.md           17 字段逐个解释
├── scripts/push-git.sh          一键推送到远程 Git
├── backend/
│   ├── .env                     数据库与口令（gitignore，不入库）
│   ├── data/services.json       店内项目目录（后台可增删改，无需第二张表）
│   ├── uploads/                 后台上传的项目图片
│   ├── public/admin/index.html  Web 后台管理系统（单页，免构建）
│   ├── sql/init.sql             建库建表（17 字段）
│   ├── sql/patch-v2.sql         v1 → v2 迁移（精简字段）
│   ├── sql/patch-v3.sql         v2 → v3 迁移（洗车/打蜡次数拆分）
│   ├── scripts/                 init-db / migrate-v2 / migrate-v3 / align-comments
│   ├── src/
│   │   ├── app.js               入口 / 路由 / 静态资源 / 统一错误出口
│   │   ├── config.js            数据库、OCR、充值档位
│   │   ├── services/catalog.js  项目目录读写（JSON 文件 + 原子写入）
│   │   ├── services/member.js   建档 / 核销（分项计数）/ 充值 / 看板
│   │   ├── services/ocr.js      腾讯云 LicensePlateOCR（TC3 签名）
│   │   ├── routes/              ocr / catalog / member / wash / stats / admin
│   │   └── utils/plate.js       车牌归一化、校验、颜色、OCR 纠偏
│   └── test/api.smoke.js        30 条端到端断言（不需要数据库）
└── miniprogram/                 微信开发者工具直接导入
    ├── app.js / app.json / app.wxss
    ├── miniprogram_npm/@vant/weapp/  Vant Weapp（已按需精简到 0.2MB，无需构建 npm）
    ├── utils/api.js             请求封装（x-token / x-openid、图片绝对地址）
    ├── utils/role.js            角色守卫（门店端 / 车主端互不串门）
    ├── components/customer-tabbar/  车主端底部导航（我的卡 / 项目 / 我的）
    ├── pages/role               启动页：选身份（车主 / 门店员工）
    ├── pages/  index 首页 · scan 拍车牌 · catalog 店内项目 · member 会员卡
    │           recharge 充值 · records 会员名录 · admin 门店工作台 · mine 我的
    └── pages/customer/  home 我的卡 · booking 预约 · orders 订单 · result 结果页
                         bind 绑车 · services 项目 · mine 我的
```

---

## 一、两种身份（同一个小程序）

首次打开是身份页（`pages/role`），两个入口，**全部免费、不调按次收费的接口**：

- **微信登录（车主）**：只调 `wx.login` → `code2session`（免费），然后车牌 + 手机号绑定
- **老板 / 门店员工登录**：输门店员工口令（`ADMIN_TOKEN`），登录后进门店端
- **老板免密（可选，零成本）**：员工端「我的」页一键复制本机 `openid`，填到服务器 `.env` 的
  `BOSS_OPENID=oX7bI5...`（逗号分隔可多台），老板以后点「微信登录」就直接进门店端，不用再输口令

选完记住，之后可在「我的」里切换：

| 身份 | 底部导航 | 能做什么 |
| --- | --- | --- |
| 门店员工 | 首页 / 拍车牌 / 项目 / 门店 / 我的 | 拍车牌查会员、核销（扣次数或余额）、充值开卡、建档、**今日预约看板（确认/开工/完成核销）** |
| 车主 | 我的卡 / 预约 / 订单 / 我的 | 看余额、剩余次数、洗车/打蜡、最近到店；**选时段预约**；看订单进度；绑定/解绑 |

登录与绑定（**没有任何按次收费的接口**）：

```
① 登录（code2session 免费）
   wx.login → POST /api/v1/customer/login {code} → { openid, role }
       role=staff 且带 token ↔ openid 命中 BOSS_OPENID（老板本人微信）
       role=customer ↔ 普通车主

② 绑定爱车
   POST /api/v1/customer/bind {plateNo, phone}
       phone 填完整 11 位，或只填门店登记号码的后 4 位
       校验：车牌已建档 + 手机号/后 4 位与档案一致 → 写入 openid
       一微信一车（uk_openid），冲突返回 409；同一 openid 10 分钟内最多试 6 次

③ 读自己的卡
   GET /api/v1/customer/me → 余额/剩余次数/洗车打蜡/最近到店 + 店内项目

④ 老板 / 员工登录
   POST /api/v1/customer/staff-login {password} → { token }   （纯口令，免费）
```

> 为什么不用「手机号快速验证组件」：那个接口按次计费。本项目的做法是用门店建档时登记的手机号做校验，
> 车主填完整号码或后 4 位即可，成本 0；想换回微信手机号登录，把 `/customer/phone-login` 加回来即可。

车主接口用 `x-openid` 鉴权，和员工口令 `x-token` 完全隔离：车主拿不到会员列表、核销、充值等员工接口。

## 二、两个入口

| 入口 | 地址 | 给谁用 |
| --- | --- | --- |
| 微信小程序 | 开发者工具导入 `miniprogram/` | 前台员工：拍车牌查会员、核销、充值 |
| Web 后台管理 | `http://27.124.46.63:8099/admin/`（本地调试用 `http://127.0.0.1:8099/admin/`） | 店主：项目上下架与图片、价格、会员、看板 |

后台登录口令 = `.env` 里的 `ADMIN_TOKEN`，**当前统一为 `123456`**（生产前务必改成强口令）。

---

## 三、特色功能：拍照识车牌查会员

> 识别原理、开源方案对比（HyperLPR3 / PaddleOCR / LPRNet）、准确率提升手段 → [docs/车牌识别原理.md](docs/车牌识别原理.md)

```
wx.chooseMedia 拍照 → wx.uploadFile → POST /api/v1/ocr/plate
    ├ 腾讯云 LicensePlateOCR（手写 TC3-HMAC-SHA256 签名，零 SDK）
    ├ fixOcrConfusion()  O→0 / I→1 / S→5 纠偏
    ├ validatePlate()    省简称+发牌机关+序号位，判 蓝/绿(新能源)/黄
    ├ SELECT * FROM js_member WHERE plate_no=? LIMIT 1
    └ 一次返回 车牌 + 置信度 + 会员（余额/剩余次数/洗车次数/打蜡次数/最近到店）
→ 结果卡片；未建档一键建档；识别失败弹手输，不挡业务
```

识别引擎三选一（`.env` 的 `OCR_ENGINE`，默认 `auto`）：

| 引擎 | 说明 | 成本 |
| --- | --- | --- |
| `hyperlpr` | 本地/自建 HyperLPR3 服务（`scripts/hyperlpr_service.py`，`POST /recognize`） | **0 元/次**，隐私不出内网 |
| `tencent` | 腾讯云 LicensePlateOCR（TC3 签名手写） | 按次计费 |
| `mock` | 随机演示车牌 | 0 |

`auto` 降级链：本地 HyperLPR → 腾讯云 → mock，任何一环挂了都不影响前台出结果（最差手输车牌）。

**服务器上的部署方式（已在 27.124.46.63 跑通）**

```bash
pip3 install hyperlpr3 opencv-python-headless        # 一次即可，约 200MB
systemctl enable --now jieshenlpr                     # 识别服务（127.0.0.1:18090，开机自启）
sed -i 's/^MOCK_OCR=.*/MOCK_OCR=0/;s/^OCR_ENGINE=.*/OCR_ENGINE=hyperlpr/' .env
systemctl restart jieshenxiche
curl -s localhost:8099/health      # → "ocr":"hyperlpr"
```

实测（服务器 CPU 推理，单帧）：`藏DT5022` 置信度 0.958、`苏ED5172` 0.731；图片不合法时返回「车牌为空」而不是报错。
`deploy/jieshenlpr.service` 里必须带 `Environment=HOME=/root`（hyperlpr3 会读 `$HOME/.hyperlpr3`，systemd 默认不设 HOME）。

**为了准到接近 100%**：连拍 3 张投票（`POST /ocr/plate-batch`）+ 会员库**闭集校正**（OCR 与会员车牌只差 1 位且唯一命中 → 直接纠到会员库，仅在 ≥2 帧一致或置信度 ≥0.9 时自动改）+ 结果页永远保留「修正车牌」。详见 [docs/车牌识别原理.md](docs/车牌识别原理.md#六怎么逼近100已实现--待做)。

## 四、界面方案：Vant Weapp 打底 + 两个地方做重（预约日历 / 订单状态）

> **包体积**：Vant 全量 dist 有 1.9MB，会让主包超过微信 2MB 上限。仓库里的 `miniprogram_npm/@vant/weapp`
> 已用 `scripts/prune-vant.js` 按「页面实际 usingComponents + 组件间 require/wxs/@import」递归裁剪，
> 只留 12 个组件与公共模块（约 0.2MB），整个小程序上传体积 **0.66MB**。
> 以后要加新 Vant 组件：`cd miniprogram && npm i @vant/weapp`，在页面 json 里引用后执行
> `node ../scripts/prune-vant.js`，再删掉 `node_modules` 即可。

组件层用 **Vant Weapp（已内置在 `miniprogram/miniprogram_npm/`，不需要在开发者工具里「构建 npm」）**，
表单、单元格、按钮、标签、空状态、步骤条全部走 Vant；自研只做业务外壳，不再手写基础控件。

「炫酷」只花在两个地方：

1. **预约日历交互**
   - `van-calendar` 单日选择，限 30 天内，最小日期=今天
   - 选完日期立刻拉当天时段：每小时 3 台，卡片显示「余 N / 已满」，已满置灰不可点，选中高亮
   - 项目用 `van-action-sheet` 选（名称 + 价格/时长），底部实时汇总「项目/到店时间/费用」
   - 下单成功走**独立结果页**：CSS 打勾动画 + 预约编号 + 到店提醒

2. **订单状态可视化**
   - `van-tabs` 分「进行中 / 全部」，状态用 `van-tag` 区分（待确认=橙、待到店/服务中=蓝、已完成=绿、已取消=灰）
   - 每张订单内嵌 `van-steps` 四步进度（预约提交 → 门店确认 → 到店服务 → 已完成），`active` 跟随真实状态
   - 底部给「取消预约」/「再来一次」的下一步动作，减少来回跳页

动态效果只在结果页（打勾描边 + 弹入）和首页公告条用了一点点，不做大面积动效堆砌。

**视觉基调（v1.1 起）**：全局设计变量在 `app.wxss`（墨蓝 `#0f1c2a`、留白 32rpx、卡片 28rpx 圆角、
`0 12rpx 34rpx` 柔阴影）；车主首页改成「深色会员卡 + 大号余额数字 + 三列统计」的克制版式，
四宫格入口改用 `van-icon` 线性图标（不再用 emoji 堆砌）。

**「我的」页做减法**：
- 车主端只剩两组：会员卡/预约/门店 + 更多（解绑、切换身份、关于），其余下沉
- 门店端把「服务地址 / 口令 / 员工姓名 / openid」收进默认折叠的 **开发者设置**，日常只看到
  会员名录、项目价目、切换车主端、关于这四项，另附数据库/OCR 状态灯

**预约与订单的数据存在 `backend/data/bookings.json`**（和项目目录一样，不新增表），状态机：

```
pending(待确认) → confirmed(待到店) → serving(服务中) → done(已完成)
                 任意未完成 → cancelled(已取消)
门店「完成核销」会走和前台一样的核销链路（扣次数或余额）
```

## 五、店内项目陈列（小程序「项目」页）

- 项目来自 `backend/data/services.json`，**后台增删改后小程序刷新即生效**。
- 卡片展示：封面图（无图用 emoji 渐变占位）、名称、分类（洗车/美容）、价格、时长、说明、计次规则。
- 点卡片 → 输车牌 → 选「扣次数 / 余额支付」→ 当场核销，核销后回显余额与洗车/打蜡次数。
- 分类页签由项目数据自动聚合（洗车 / 美容 / 其他）。

## 六、Web 后台管理系统（`/admin/`）

| 模块 | 能力 |
| --- | --- |
| 门店看板 | 会员数、储值总额、待用次数、今日到店、今日新客、累计洗车/打蜡、上架项目数、最近到店 |
| 项目管理 | 新增/编辑/删除项目；上传封面图（≤5MB，jpg/png/webp/gif）；价格、时长、说明、分类；`洗车+1`/`打蜡+1`/不计数 三种计次规则；上/下架；↑↓ 排序 |
| 会员管理 | 车牌/姓名/手机/卡号搜索；会员详情弹窗内可直接 **核销**（选项目 + 扣次数/余额）和 **充值**（金额/赠送/赠次/有效期） |

后台是单页 HTML（`backend/public/admin/index.html`），无构建、无前端依赖，改完刷新即生效。

> 为什么项目数据不进 MySQL：你要求「只新建一个表」。项目目录需要后台增删改，所以落在 `data/services.json`；
> 图片落在 `uploads/`。接口层（`/api/v1/catalog`、`/api/v1/admin/services`）已经抽象好，将来想搬进 MySQL，
> 只需替换 `src/services/catalog.js` 的读写实现，前端不用动。

---

## 七、数据库：`jieshenxiche` 库 + `js_member` 一张表（20 字段）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | INT UNSIGNED AI | 主键 |
| plate_no | VARCHAR(16) UNIQUE | 车牌，检索键 |
| plate_color | VARCHAR(8) | 蓝 / 绿 / 黄 |
| member_no | VARCHAR(24) | 卡号 JS+yyMMdd+4位 |
| nickname | VARCHAR(32) | 车主称呼（**选填**，空则显示「车主」） |
| **car_model** | VARCHAR(32) | **车型号（选填）**：轿车/SUV/MPV/新能源… 后台与小程序的 picker 可选项 |
| phone | VARCHAR(255) | 手机号密文（选填） |
| **openid** | VARCHAR(64) UNIQUE | 车主端绑定的微信 openid（NULL=未绑定） |
| **phone** | VARCHAR(255) | 手机号**密文**（AES-256-GCM，`enc:v1.…`） |
| **phone_hash / phone_tail_hash** | CHAR(64) | 手机号盲索引（完整号 / 后 4 位），用于搜索与绑定校验 |
| balance | DECIMAL(10,2) | 储值余额（唯一的钱） |
| remain_count | INT | 次卡剩余次数（通用） |
| **wash_count** | INT | **洗车次数** |
| **wax_count** | INT | **打蜡次数** |
| expire_at | DATE | 次数有效期 |
| last_service_at | DATETIME | 最近到店 |
| last_item | VARCHAR(32) | 最近一次服务项目 |
| remark / status / created_at / updated_at | — | 备注、状态、时间戳 |

**洗车与打蜡分开计数**：核销时按项目配置累加 —— 洗车类项目 → `wash_count+1`，打蜡 → `wax_count+1`，
抛光/内饰/镀膜等默认只扣钱不计数（后台可给任意项目改成计洗车或计打蜡）。

> 逐字段解释（含义、示例、谁写入、何时变化、前端哪里用）→ [docs/表结构说明.md](docs/表结构说明.md)

### 迁移 / 初始化

```bash
cd backend
npm run db:init       # 全新库：建库 + 建表 + 演示数据（幂等）
npm run db:migrate    # v1 → v2（精简字段）
npm run migrate:v3    # v2 → v3（total_count 拆成 wash_count/wax_count，删除 last_amount）
npm run align:comments# 同步字段注释与索引名
```

v3 迁移时旧的 `total_count` 会一次性折算进 `wash_count`（打蜡从 0 起算）。

---

## 八、接口一览（前缀 `/api/v1`，请求头 `x-token`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 服务 / 数据库 / OCR 状态 |
| POST | `/ocr/plate` | 拍照识别 + 会员信息 |
| GET | `/ocr/meta` | 项目目录 + 分类 + 充值档位 |
| GET | `/catalog` | 店内项目（只返回上架） |
| GET | `/catalog/:id` | 单个项目 |
| GET | `/member/:plate` | 车牌查会员 |
| GET | `/member?keyword&page&size` | 会员检索 |
| POST | `/member` | 建档：**只有 `plateNo` 必填**，其余 `nickname/carModel/phone/remark` 均可空 |
| POST | `/wash/consume` | 核销 `{plateNo,serviceId,useCount,operator}` |
| POST | `/wash/recharge` | 充值 `{plateNo,amount,giftAmount,times,months}` |
| GET | `/stats/overview` · `/stats/recent` | 小程序看板 / 最近到店 |
| POST | `/customer/staff-login` | 员工口令登录（老板端入口）`{password}` |
| GET | `/customer/slots?date=` | 当天可约时段与剩余量 |
| POST/GET | `/customer/bookings` | 下单 / 我的预约 |
| POST | `/customer/bookings/:id/cancel` | 取消预约 |
| GET | `/staff/bookings?date=` | 门店预约看板 |
| POST | `/staff/bookings/:id/status` · `/finish` | 推进状态 / 完成并核销 |
| POST | `/customer/login` | 车主 wx.login 换 openid `{code}` |
| POST | `/customer/bind` · `/customer/unbind` | 绑定 / 解绑爱车（车牌 + 手机号校验） |
| GET | `/customer/me` · `/customer/services` | 车主首页数据 / 店内项目 |
| POST | `/customer/ocr` | 车主端拍照/相册识别车牌（1~3 张投票，不返回会员信息） |
| POST | `/admin/login` | 后台登录 `{password}` → token |
| GET | `/admin/overview` | 后台看板 |
| GET/POST | `/admin/services` | 项目列表 / 新增 |
| PUT/DELETE | `/admin/services/:id` | 改 / 删（含上下架） |
| POST | `/admin/services/reorder` | 排序 `{ids:[...]}` |
| POST | `/admin/upload` | 上传项目封面（multipart `file`） |
| GET | `/admin/members` · `/admin/members/:plate` | 会员列表 / 详情 |
| POST | `/admin/consume` · `/admin/recharge` | 后台核销 / 充值 |

价目与规则：

```
洗车   标准洗车 ¥30 · 精洗SUV/MPV ¥50
美容   打蜡 ¥98 · 抛光 ¥180 · 内饰清洁 ¥128 · 玻璃镀膜 ¥88 · 新车开蜡 ¥168
核销：次数卡未过期 → 扣 1 次；否则扣余额；余额不足 402，不会扣成负数
```

---

## 九、数据安全：手机号加密存储

- 落库：`phone` 存 **AES-256-GCM 密文**（`enc:v1.iv.tag.data`），整库泄露也看不到明文；同一号码两次加密结果不同（随机 IV）
- 检索：`phone_hash`（完整号 HMAC）/ `phone_tail_hash`（后 4 位 HMAC）两个**盲索引**，支持「按手机号搜会员」「车主填后 4 位绑定」，无需解密全表
- 展示：门店端/车主端接口默认返回脱敏 `138****8000`；只有员工点「拨打车主」时，服务端才解密后回传
- 密钥：`.env` 的 `PHONE_ENC_KEY`（32 字节 base64，`npm run keygen -- --write` 生成）。**丢了历史手机号不可解**，务必连同数据库一起备份
- 迁移：`npm run migrate:v5`（加列 + 老明文加密回填，幂等）；`npm run migrate:v4`/`v3` 照旧

## 十、跑起来

```bash
cd backend
npm run db:init      # 首次
npm start            # 后台 /admin/；小程序默认已指向 http://27.124.46.63:8099
npm test             # 30 条断言，不需要数据库
```

小程序：导入 `miniprogram/` →「我的」页填 `服务地址` / `员工口令` / `员工姓名`。
真机预览把地址换成局域网 IP 或 https 域名；发布前把域名加进 request / uploadFile 合法域名。
真实车牌识别：`.env` 填 `TENCENT_SECRET_ID/KEY` + `MOCK_OCR=0`。

---

## 十一、已验证

`npm test` → **59/59 通过**（内存假库 + 临时项目文件，跑真实路由与业务代码）：

```
车牌归一化 / 新能源绿牌 / OCR 纠偏 / 无口令 401
项目目录含洗车+打蜡、分类聚合、计次配置
建档 → 洗车核销(wash+1) → 打蜡核销(wax+1) → 玻璃镀膜只扣钱不计数 → 余额不足 402
详情洗车/打蜡分开计数、不再返回 totalCount/lastAmount
看板 washSum/waxSum、不再有今日实收
后台：错误口令 401 / 登录 / 看板 / 新增 / 改价+下架 / 下架不进小程序 / 排序 / 删除 / 会员检索 / 后台核销
车主端：mock 登录换 openid / 未绑定 bound=false / 无 openid 401 / 手机号不匹配 403 / 绑定成功 / 重复绑定幂等 / 解绑
绑定增强：后 4 位可绑定 / 后 4 位不匹配 403 / 员工口令登录（错 401、对返回 token）
预约：时段剩余量 / 下单 / 同时段重复 409 / 门店可见 / 确认 / 状态机拦非法跳转 / 我的列表 / 取消
识别：单张只给建议不改 / 连拍 3 帧投票 + 闭集校正到会员车牌（粤B12346 → 粤B12345）
加密：手机号落库为 enc:v1 密文 / 按完整号盲索引搜索 / 按后 4 位盲索引搜索
```

**真实环境联调（MySQL 8.0.43）**：登录返回 token、上传 PNG 后 `/uploads/xxx.png` 200、新增项目、核销后
`洗车 59 / 打蜡 1` 分别累加、余额正确扣减，全部通过后已清理测试项目与图片。

---

## 十二、部署到服务器（nohup 常驻）

服务器上跑的是 `backend/`，`deploy/` 里是配套脚本（Node ≥ 18）。

### 1. 打包上传（本机执行）

```bash
cd /Users/chenkai/Documents/jieshenxiche
tar czf /tmp/backend.tgz --exclude=node_modules --exclude=.env --exclude=logs --exclude=run backend
scp /tmp/backend.tgz root@<服务器IP>:/tmp/
```

> `.env` 不打进包里：口令现场输入，不留在传输文件里。

### 2. 服务器上安装并启动

```bash
ssh root@<服务器IP>
mkdir -p /opt/jieshenxiche && tar xzf /tmp/backend.tgz --strip-components=1 -C /opt/jieshenxiche
cd /opt/jieshenxiche
bash deploy/install.sh
```

`install.sh` 会依次做：

1. 检查 Node 版本（< 18 直接给出安装命令并退出）
2. 交互生成 `.env`（数据库地址/口令、自动生成 `ADMIN_TOKEN`，权限 600）
3. `npm ci --omit=dev` 安装生产依赖
4. `npm run db:init` 建库建表（幂等）
5. `nohup node src/app.js >> logs/app.log 2>&1 &` 启动，PID 写入 `run/app.pid`
6. 自动跑一次 `/health` 打印结果 + 后台地址 + 登录口令

若后端和 MySQL 在同一台机器，`.env` 里 `DB_HOST` 填 `127.0.0.1`。

### 3. 日常管理

```bash
cd /opt/jieshenxiche
bash deploy/manage.sh status     # 进程 + /health
bash deploy/manage.sh restart    # 改完 .env 或代码后重启
bash deploy/manage.sh logs       # tail -f logs/app.log
bash deploy/manage.sh stop|start
```

### 4. 开放端口 / 重启后自启

```bash
# 云厂商安全组放行 8099；系统防火墙
ufw allow 8099/tcp                      # Debian/Ubuntu
firewall-cmd --add-port=8099/tcp --permanent && firewall-cmd --reload   # CentOS/Rocky

# nohup 不随重启恢复，二选一：
crontab -e   # 加一行：@reboot cd /opt/jieshenxiche && bash deploy/manage.sh start
# 或者用 systemd（更稳）
cp deploy/jieshenxiche.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now jieshenxiche
```

### 5. 云托管直连（callContainer）：不配合法域名也能发体验版

微信**不允许**把 `*.run.tcloudbase.com` 填进 `request 合法域名`（会红字拒绝保存），
云托管的官方通道是 `wx.cloud.callContainer`，它不走域名白名单。

1. 云托管控制台记下 **环境 ID**（形如 `prod-8gxxxx`）和 **服务名**（如 `jieshen-proxy`）
2. 改 `miniprogram/config/env.js`：

```js
module.exports = {
  cloud: { enabled: true, env: '你的环境ID', service: 'jieshen-proxy' },
};
```

3. 重新编译上传。之后所有 API 走 `callContainer`，`baseUrl` 只用于显示项目图片
4. 识别图片会自动压到 260KB 以内再 base64（callContainer 的 JSON 有大小限制）

> 小程序后台的「服务器域名」留空即可，不用再填云托管域名。

### 5.1 没有备案域名又不想用 callContainer？用云托管做 https 入口（方案 C 备选）

`deploy/cloudrun-nginx/` 是一个 20 行的 nginx 容器：云托管给它一个**已备案 https 域名**，
它反代到现有 `27.124.46.63:8099`，小程序只换地址即可，详见该目录 README。

### 6. 接域名 / HTTPS（小程序正式上线必须）

```bash
cp deploy/nginx-jieshenxiche.conf /etc/nginx/conf.d/
# 改 server_name 与证书路径 → nginx -t && nginx -s reload
```

微信公众平台 → 开发设置 → **request / uploadFile 合法域名** 填 `https://你的域名`；
小程序「我的」页把服务地址换成该域名，员工口令填服务器 `.env` 里的 `ADMIN_TOKEN`。

> 自测阶段可以先不配域名：小程序填 `http://<服务器IP>:8099`，开发者工具勾「不校验合法域名」即可。

## 十三、还能接着做

- **微信支付**：充值页「确认收款」换 `wx.requestPayment`（后端统一下单 + 回调）。
- **项目进库**：要按项目做报表时，把 `data/services.json` 换成 `js_service` 表，接口不变。
- **精确账目**：需要日结/对账时加第二张 `js_order` 流水表（项目、经办人、支付方式、金额）。
- **多门店**：会员表加 `store_id`，项目目录按门店分文件。
