# 洁神洗车 · UI 规范（按钮 / 输入框 / 设计令牌）

> 定位：原生微信小程序 + Vant Weapp。目标不是"炫"，而是**清爽、专业、可信**——车主敢把钱和车牌交给你。
> 落地方式：设计令牌写进 `app.wxss`；按钮/输入框用自研语义类（`u-btn` / `u-input`）；Vant 只做展示层组件（日历、步骤条、标签、空状态），
> 需要交互控件时通过 `custom-class` 挂我们的类，**不直接改 Vant 内部样式**。

---

## 一、设计令牌（直接粘进 app.wxss）

```css
page {
  /* ===== 主色：水感蓝，饱和度控制在 70% 左右，不用霓虹色 ===== */
  --c-primary:          #146FE0;   /* 主色：主按钮、链接、选中态 */
  --c-primary-pressed:  #0F57B3;   /* 主色按压/激活 */
  --c-primary-weak:     #EAF3FF;   /* 主色浅背景：选中底、图标底、标签底 */
  --c-primary-border:   #C7DDF8;   /* 主色描边：次按钮边框 */

  /* ===== 状态色 ===== */
  --c-success:          #12A150;
  --c-success-weak:     #E8F7EF;
  --c-warning:          #D97917;
  --c-warning-weak:     #FDF3E5;
  --c-error:            #D93F3F;
  --c-error-weak:       #FDECEC;

  /* ===== 文字 ===== */
  --c-text:             #1A2230;   /* 主文字：标题、金额、车牌 */
  --c-text-2:           #5A6B7F;   /* 次要文字：标签、说明 */
  --c-text-3:           #8C9AAB;   /* 辅助文字：时间、计数 */
  --c-placeholder:      #A9B4C2;   /* 占位符 */

  /* ===== 背景 / 描边 ===== */
  --c-bg:               #F4F7FA;   /* 页面背景 */
  --c-card:             #FFFFFF;   /* 卡片背景 */
  --c-fill:             #F6F8FB;   /* 输入框填充 */
  --c-fill-disabled:    #F1F4F8;   /* 禁用填充 */
  --c-border:           #E3E9F0;   /* 分隔线、默认边框 */
  --c-border-strong:    #D6E0EC;   /* 需要更明显的边框 */

  /* ===== 圆角 ===== */
  --radius-sm:   8rpx;    /* 标签、徽标、小色块 */
  --radius-md:   12rpx;   /* 按钮、输入框（默认控件圆角） */
  --radius-lg:   16rpx;   /* 卡片、面板 */
  --radius-xl:   24rpx;   /* 大卡片、弹层 */
  --radius-pill: 999rpx;  /* 胶囊：状态标签、筛选 chip */

  /* ===== 间距（4 的倍数，页面左右固定 32） ===== */
  --space-1: 4rpx;    /* 图标与文字之间 */
  --space-2: 8rpx;    /* 行内元素间距、标签与正文 */
  --space-3: 12rpx;   /* 表单控件内部纵向间距 */
  --space-4: 16rpx;   /* 卡片内部元素间距 */
  --space-5: 24rpx;   /* 卡片之间、区块之间 */
  --space-6: 32rpx;   /* 页面左右留白、大区块分隔 */

  /* ===== 字号 ===== */
  --font-24: 24rpx;  /* 辅助说明、标签、计数 */
  --font-26: 26rpx;  /* 表单标签、次要信息 */
  --font-28: 28rpx;  /* 正文、输入框文字 */
  --font-30: 30rpx;  /* 按钮文字、关键操作 */
  --font-32: 32rpx;  /* 页面小标题、车牌号 */

  /* ===== 阴影：只给卡片和浮层，按钮默认不用 ===== */
  --shadow-card:  0 8rpx 24rpx rgba(20, 40, 70, 0.06);
  --shadow-float: 0 16rpx 48rpx rgba(20, 40, 70, 0.12);
  --shadow-btn:   0 4rpx 12rpx rgba(20, 111, 224, 0.12); /* 主按钮可选，禁止大范围彩色发光 */
}
```

**使用规则**

| 令牌 | 用在哪 | 不要用在哪 |
| --- | --- | --- |
| `--shadow-card` | 白色卡片、列表分组 | 按钮、标签、输入框 |
| `--shadow-float` | 底部弹层、日历、对话框 | 常驻页面元素 |
| `--shadow-btn` | 仅在需要"浮起"的主按钮上用一次 | 次按钮、文字按钮、列表内小按钮 |
| `--c-primary` | 一屏**最多一个主按钮** | 同屏多个并列主按钮会没有主次 |

---

## 二、按钮规范

### 2.1 尺寸与外观

| 类型 | 高度 | 圆角 | 字号/字重 | 左右内边距 | 背景 | 文字 | 边框 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 主按钮 `.u-btn--primary` | 96rpx | 12rpx | 30rpx / 600 | 40rpx | `--c-primary` | `#FFFFFF` | 无 |
| 次按钮 `.u-btn--secondary` | 96rpx | 12rpx | 30rpx / 500 | 40rpx | `--c-card` | `--c-primary` | 1rpx `--c-primary-border` |
| 文字按钮 `.u-btn--text` | 64rpx | 8rpx | 28rpx / 500 | 12rpx | 透明 | `--c-primary` | 无 |
| 小按钮 `.u-btn--mini` | 56rpx | 8rpx | 24rpx / 500 | 20rpx | 透明 | `--c-primary` | 1rpx `--c-primary-border` |
| 危险操作 `.u-btn--danger` | 96rpx | 12rpx | 30rpx / 600 | 40rpx | `--c-error` | `#FFFFFF` | 无 |

- 主/次按钮**默认撑满容器宽度**（`width:100%`）；同一行两个按钮时间距 `--space-4`，右侧按钮为主操作。
- 列表行内的操作统一用 `.u-btn--mini`，**不要**在列表里放大按钮。
- 按钮文字不用 emoji；需要图标时用 32rpx 线性图标 + 8rpx 间距。

### 2.2 状态

| 状态 | 规则 |
| --- | --- |
| 默认 | 无阴影（主按钮可选 `--shadow-btn`），无渐变 |
| 按压 | 背景=`--c-primary-pressed`；`transform: scale(0.985)`；`transition: 120ms ease-out`；不加阴影变化 |
| 禁用 | 背景=`--c-fill-disabled`，文字=`--c-placeholder`，边框=无，`pointer-events:none`，**不加透明度闪烁** |
| 加载 | 左侧 32rpx 环形 loading（1.5rpx 线宽，`--c-primary` 或白色）+ 文案变「处理中…」；保持按钮宽度不变；禁止重复点击 |
| 键盘/底部吸底 | 容器 `padding-bottom: calc(24rpx + env(safe-area-inset-bottom))` |

### 2.3 可直接用的 WXSS

```css
.u-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  width: 100%;
  height: 96rpx;
  padding: 0 40rpx;
  box-sizing: border-box;
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-30);
  font-weight: 600;
  line-height: 1;
  transition: transform 120ms ease-out, background-color 120ms ease-out;
}
.u-btn::after { border: none; }
.u-btn:active { transform: scale(0.985); }

.u-btn--primary { background: var(--c-primary); color: #fff; }
.u-btn--primary:active { background: var(--c-primary-pressed); }

.u-btn--secondary {
  background: var(--c-card);
  color: var(--c-primary);
  border: 1rpx solid var(--c-primary-border);
  font-weight: 500;
}
.u-btn--secondary:active { background: var(--c-primary-weak); }

.u-btn--text {
  width: auto; height: 64rpx; padding: 0 12rpx;
  background: transparent; color: var(--c-primary);
  font-size: var(--font-28); font-weight: 500;
}

.u-btn--mini {
  width: auto; height: 56rpx; padding: 0 20rpx;
  background: transparent; color: var(--c-primary);
  border: 1rpx solid var(--c-primary-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-24); font-weight: 500;
}
.u-btn--mini:active { background: var(--c-primary-weak); }
.u-btn--mini.is-primary { background: var(--c-primary); color: #fff; border-color: var(--c-primary); }

.u-btn.is-disabled,
.u-btn[disabled] {
  background: var(--c-fill-disabled);
  color: var(--c-placeholder);
  border-color: transparent;
  pointer-events: none;
  transform: none;
}
.u-btn.is-danger { background: var(--c-error); color: #fff; }
```

---

## 三、输入框规范

### 3.1 默认结构

```
[标签 26rpx]                       ← 可选，距输入框 8rpx
┌───────────────────────────────────────────┐
│ [前缀图标 40]  [输入区 28rpx]      [后缀 40/88] │  96rpx 高，12rpx 圆角，填充 #F6F8FB
└───────────────────────────────────────────┘
[帮助/错误文案 22rpx]              字数 0/60 ← 右下，22rpx
```

| 项 | 值 |
| --- | --- |
| 高度 | 96rpx（单行）；多行文本域最小 160rpx |
| 圆角 | `--radius-md` 12rpx |
| 默认背景 | `--c-fill` `#F6F8FB`，**无边框**（1rpx 透明占位，避免聚焦跳动） |
| 聚焦背景/边框 | 背景 `#FFFFFF` + 边框 1rpx `--c-primary` + 外环 `0 0 0 3rpx rgba(20,111,224,.10)` |
| 错误 | 背景 `#FFFFFF` + 边框 1rpx `--c-error` + 外环 `rgba(217,63,63,.10)`；下方错误文案 22rpx `--c-error` |
| 禁用 | 背景 `--c-fill-disabled`，文字 `--c-placeholder`，不显示聚焦环 |
| 文字 | 输入 28rpx `--c-text`；数字/车牌可 32rpx + `letter-spacing:2rpx` + 等宽字体 |
| placeholder | `--c-placeholder` `#A9B4C2`，字号与输入一致，**不加粗** |
| 内边距 | 左 24rpx，右 24rpx（有后缀时右 16rpx） |
| 前后缀 | 前缀图标 40rpx，与文字间距 8rpx；后缀按钮点击区 ≥88rpx |
| 字数统计 | 绝对定位右下，22rpx `--c-text-3`；超限变 `--c-error` |

> WXSS 不支持 `::placeholder`，统一用 `placeholder-class="u-ph"`（或 `placeholder-style`），并在 `app.wxss` 定义 `.u-ph`。

### 3.2 可直接用的 WXSS

```css
.u-field { margin-bottom: var(--space-5); }
.u-field__label {
  font-size: var(--font-26);
  color: var(--c-text-2);
  margin-bottom: var(--space-2);
}
.u-field__box {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 96rpx;
  padding: 0 24rpx;
  background: var(--c-fill);
  border: 1rpx solid transparent;
  border-radius: var(--radius-md);
  transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}
.u-field__box.is-focus {
  background: var(--c-card);
  border-color: var(--c-primary);
  box-shadow: 0 0 0 3rpx rgba(20, 111, 224, 0.10);
}
.u-field__box.is-error {
  background: var(--c-card);
  border-color: var(--c-error);
  box-shadow: 0 0 0 3rpx rgba(217, 63, 63, 0.10);
}
.u-field__box.is-disabled {
  background: var(--c-fill-disabled);
  color: var(--c-placeholder);
}
.u-field__input {
  flex: 1;
  min-width: 0;
  font-size: var(--font-28);
  color: var(--c-text);
}
.u-ph { color: var(--c-placeholder); font-size: var(--font-28); }
.u-field__icon { width: 40rpx; height: 40rpx; flex: none; }
.u-field__error {
  margin-top: var(--space-2);
  font-size: var(--font-24);
  color: var(--c-error);
}
.u-field__count {
  font-size: var(--font-24);
  color: var(--c-text-3);
  text-align: right;
  margin-top: var(--space-1);
}
```

### 3.3 车牌输入 + 拍照识别（重点场景）

车牌是**输入 + 识别**的组合控件，建议这样排（同一行，视觉上是一个整体）：

| 方案 | 结构 | 适用 |
| --- | --- | --- |
| **A（推荐）** | 输入框右侧内嵌相机按钮：88×88rpx、`--radius-sm`、背景 `--c-primary-weak`、图标 `camera-o 40rpx`（`--c-primary`）；整块点击区 ≥88rpx | 车主绑车、员工修正车牌 |
| B | 输入框下方放一个全宽 `.u-btn--secondary`「📷 拍照识别车牌」 | 首次绑定、引导性强 |
| C | 输入框右侧纯图标（无底色） | 空间极窄时 |

规则：
- 相机按钮与输入框**同高、同圆角体系**，不要做成独立的大按钮贴在下面（会显得零碎）。
- 点拍照后按钮进入加载态（图标替换为 32rpx 环形 loading），识别中禁用输入。
- 识别结果回填到输入框，同时把输入框切到**聚焦态**并全选，方便员工直接改字符。
- 识别失败不弹大弹窗，用输入框下方的 22rpx 提示文案：「没认出来，请手动输入或重拍」。

---

## 四、洗车场景的落地建议

1. **主色只用来"指路"**：一屏一个主按钮（预约/确认/保存），其余全是次按钮或文字按钮。
2. **背景干净**：页面 `#F4F7FA`、卡片纯白、输入框浅灰填充；不叠加渐变、不做发光。
3. **青绿只做状态**：`#12A150` 仅用于"已完成/成功"，`#0FA6A0` 这类青绿最多用作图标点缀，不做大面积底色。
4. **阴影克制**：卡片一层 `0 8rpx 24rpx rgba(20,40,70,.06)` 就够；按钮不要投影，按压靠 0.985 缩放反馈。
5. **字号阶梯固定四档**（24/26/28/30/32），不要再出现 27、29 这种中间值。
6. **对齐**：页面左右 32rpx；卡片内 16rpx；表单项之间 24rpx；标签与控件 8rpx。
7. **Vant 用法**：`van-cell` / `van-field` 统一 `custom-class="u-cell"`（去圆角、去默认内边距）+ 我们自己的 `u-field__box`；
   `van-button` 一律传 `round="{{false}}"` + `custom-class="u-btn u-btn--primary"`，避免两套圆角/阴影打架。

---

## 五、验收清单（改完逐条过）

- [ ] 全站按钮只有三种圆角：12rpx（常规）、8rpx（小/文字）、999rpx（仅状态标签）
- [ ] 没有任何按钮使用渐变或大面积彩色阴影
- [ ] 输入框聚焦有明确视觉反馈（白底 + 主色描边 + 3rpx 外环）
- [ ] 错误态同时有：红边 + 红字提示，不只变红
- [ ] 车牌输入框右侧有拍照识别入口，且加载时禁用重复点击
- [ ] 列表内操作按钮统一 56rpx 高，不与主按钮同尺寸
- [ ] 页面底部主按钮避开安全区（`env(safe-area-inset-bottom)`）
