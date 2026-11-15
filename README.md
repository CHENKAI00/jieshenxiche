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
    ├── utils/api.js             请求封装（x-token / x-openid、图片绝对地址）
    ├── utils/role.js            角色守卫（门店端 / 车主端互不串门）
    ├── components/customer-tabbar/  车主端底部导航（我的卡 / 项目 / 我的）
    ├── pages/role               启动页：选身份（车主 / 门店员工）
    ├── pages/  index 首页 · scan 拍车牌 · catalog 店内项目 · member 会员卡
    │           recharge 充值 · records 会员名录 · admin 门店工作台 · mine 我的
    └── pages/customer/  home 我的卡 · bind 绑车 · services 项目 · mine 我的
```

---

## 一、两种身份（同一个小程序）

首次打开是身份页（`pages/role`）：点 **手机号一键登录** 后按手机号自动分流——员工号进门店端、车主号进车主端；
也可以手动选身份（调试或没开手机号权限时用）。选完记住，之后可在「我的」里切换：

| 身份 | 底部导航 | 能做什么 |
| --- | --- | --- |
| 门店员工 | 首页 / 拍车牌 / 项目 / 门店 / 我的 | 拍车牌查会员、核销（扣次数或余额）、充值开卡、建档、看门店数据 |
| 车主 | 我的卡 / 店内项目 / 我的 | 看余额、剩余次数、洗车/打蜡次数、最近到店；逛项目；绑定/解绑 |

登录与身份判定：

```
① 微信手机号一键登录（推荐）
   button open-type="getPhoneNumber" → code
   → POST /api/v1/customer/phone-login { code, openid }
       后端用 access_token 调 getuserphonenumber 换手机号
       ├ 手机号命中 STAFF_PHONES 白名单 → role=staff，直接下发 ADMIN_TOKEN
       └ 否则 role=customer：按手机号找会员卡，自动把 openid 绑到「还没被绑」的那辆车
            0 张卡 → bound=false（提示到店建档）
            多张卡 → 绑定最近到店、且未被其他微信绑定的那张

② 车牌 + 手机号兜底绑定
   POST /api/v1/customer/bind {plateNo, phone}
       校验：车牌已建档 + 档案手机号完全一致 → 写入 openid（一微信一车，冲突 409）

③ 读自己的卡
   GET /api/v1/customer/me → 余额/剩余次数/洗车打蜡/最近到店 + 店内项目
```

员工白名单在 `.env` 里配：`STAFF_PHONES=18800000001,13900001111`（逗号分隔，改完 `manage.sh restart`）。

车主接口用 `x-openid` 鉴权，和员工口令 `x-token` 完全隔离：车主拿不到会员列表、核销、充值等员工接口。

## 二、两个入口

| 入口 | 地址 | 给谁用 |
| --- | --- | --- |
| 微信小程序 | 开发者工具导入 `miniprogram/` | 前台员工：拍车牌查会员、核销、充值 |
| Web 后台管理 | `http://127.0.0.1:8099/admin/` | 店主：项目上下架与图片、价格、会员、看板 |

后台登录口令 = `.env` 里的 `ADMIN_TOKEN`（默认 `js-wash-2026`，上线务必改）。

---

## 三、特色功能：拍照识车牌查会员

```
wx.chooseMedia 拍照 → wx.uploadFile → POST /api/v1/ocr/plate
    ├ 腾讯云 LicensePlateOCR（手写 TC3-HMAC-SHA256 签名，零 SDK）
    ├ fixOcrConfusion()  O→0 / I→1 / S→5 纠偏
    ├ validatePlate()    省简称+发牌机关+序号位，判 蓝/绿(新能源)/黄
    ├ SELECT * FROM js_member WHERE plate_no=? LIMIT 1
    └ 一次返回 车牌 + 置信度 + 会员（余额/剩余次数/洗车次数/打蜡次数/最近到店）
→ 结果卡片；未建档一键建档；识别失败弹手输，不挡业务
```

## 四、店内项目陈列（小程序「项目」页）

- 项目来自 `backend/data/services.json`，**后台增删改后小程序刷新即生效**。
- 卡片展示：封面图（无图用 emoji 渐变占位）、名称、分类（洗车/美容）、价格、时长、说明、计次规则。
- 点卡片 → 输车牌 → 选「扣次数 / 余额支付」→ 当场核销，核销后回显余额与洗车/打蜡次数。
- 分类页签由项目数据自动聚合（洗车 / 美容 / 其他）。

## 五、Web 后台管理系统（`/admin/`）

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

## 六、数据库：`jieshenxiche` 库 + `js_member` 一张表（18 字段）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | INT UNSIGNED AI | 主键 |
| plate_no | VARCHAR(16) UNIQUE | 车牌，检索键 |
| plate_color | VARCHAR(8) | 蓝 / 绿 / 黄 |
| member_no | VARCHAR(24) | 卡号 JS+yyMMdd+4位 |
| nickname / phone | VARCHAR | 称呼、手机（返回脱敏） |
| **openid** | VARCHAR(64) UNIQUE | 车主端绑定的微信 openid（NULL=未绑定） |
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

## 七、接口一览（前缀 `/api/v1`，请求头 `x-token`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 服务 / 数据库 / OCR 状态 |
| POST | `/ocr/plate` | 拍照识别 + 会员信息 |
| GET | `/ocr/meta` | 项目目录 + 分类 + 充值档位 |
| GET | `/catalog` | 店内项目（只返回上架） |
| GET | `/catalog/:id` | 单个项目 |
| GET | `/member/:plate` | 车牌查会员 |
| GET | `/member?keyword&page&size` | 会员检索 |
| POST | `/member` | 建档 `{plateNo,nickname,phone,remark}` |
| POST | `/wash/consume` | 核销 `{plateNo,serviceId,useCount,operator}` |
| POST | `/wash/recharge` | 充值 `{plateNo,amount,giftAmount,times,months}` |
| GET | `/stats/overview` · `/stats/recent` | 小程序看板 / 最近到店 |
| POST | `/customer/phone-login` | 手机号一键登录 → 判身份 `{code, openid, phone?}` |
| POST | `/customer/login` | 车主 wx.login 换 openid `{code}` |
| POST | `/customer/bind` · `/customer/unbind` | 绑定 / 解绑爱车（车牌 + 手机号校验） |
| GET | `/customer/me` · `/customer/services` | 车主首页数据 / 店内项目 |
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

## 八、跑起来

```bash
cd backend
npm run db:init      # 首次
npm start            # http://127.0.0.1:8099  后台 /admin/
npm test             # 30 条断言，不需要数据库
```

小程序：导入 `miniprogram/` →「我的」页填 `服务地址` / `员工口令` / `员工姓名`。
真机预览把地址换成局域网 IP 或 https 域名；发布前把域名加进 request / uploadFile 合法域名。
真实车牌识别：`.env` 填 `TENCENT_SECRET_ID/KEY` + `MOCK_OCR=0`。

---

## 九、已验证

`npm test` → **46/46 通过**（内存假库 + 临时项目文件，跑真实路由与业务代码）：

```
车牌归一化 / 新能源绿牌 / OCR 纠偏 / 无口令 401
项目目录含洗车+打蜡、分类聚合、计次配置
建档 → 洗车核销(wash+1) → 打蜡核销(wax+1) → 玻璃镀膜只扣钱不计数 → 余额不足 402
详情洗车/打蜡分开计数、不再返回 totalCount/lastAmount
看板 washSum/waxSum、不再有今日实收
后台：错误口令 401 / 登录 / 看板 / 新增 / 改价+下架 / 下架不进小程序 / 排序 / 删除 / 会员检索 / 后台核销
车主端：mock 登录换 openid / 未绑定 bound=false / 无 openid 401 / 手机号不匹配 403 / 绑定成功 / 重复绑定幂等 / 解绑
手机号登录：员工号→门店端+下发口令 / 车主号→车主端并自动绑卡 / 陌生号→未绑卡 / 缺 phone 400
```

**真实环境联调（MySQL 8.0.43）**：登录返回 token、上传 PNG 后 `/uploads/xxx.png` 200、新增项目、核销后
`洗车 59 / 打蜡 1` 分别累加、余额正确扣减，全部通过后已清理测试项目与图片。

---

## 十、部署到服务器（nohup 常驻）

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

### 5. 接域名 / HTTPS（小程序正式上线必须）

```bash
cp deploy/nginx-jieshenxiche.conf /etc/nginx/conf.d/
# 改 server_name 与证书路径 → nginx -t && nginx -s reload
```

微信公众平台 → 开发设置 → **request / uploadFile 合法域名** 填 `https://你的域名`；
小程序「我的」页把服务地址换成该域名，员工口令填服务器 `.env` 里的 `ADMIN_TOKEN`。

> 自测阶段可以先不配域名：小程序填 `http://<服务器IP>:8099`，开发者工具勾「不校验合法域名」即可。

## 十一、还能接着做

- **微信支付**：充值页「确认收款」换 `wx.requestPayment`（后端统一下单 + 回调）。
- **项目进库**：要按项目做报表时，把 `data/services.json` 换成 `js_service` 表，接口不变。
- **精确账目**：需要日结/对账时加第二张 `js_order` 流水表（项目、经办人、支付方式、金额）。
- **多门店**：会员表加 `store_id`，项目目录按门店分文件。
