# 0.6 实施记录：加号面板 2 行分页 + 设置页手机化

> 目标版本：0.5.12 → 0.6.0（已实施并在 MuMu 模拟器验收）  
> 取证环境：MuMu 模拟器（物理 720×1280、dpr2、页面缩放 0.9 → **CSS 视口 400×711**），DSH Android 1.4.38 / 引擎 `0.2.1-rc.4`  
> 取证方式：插件尾部临时注入 `[DSHM-DIAG]` 诊断脚本，`console.log` → `adb logcat`（chromium CONSOLE），读取真实几何与 DOM 结构  
> 日期：2026-10-29

---

## 0.0 最终形态（相对下方原计划的调整）

原计划写于开工前，实施过程中按实际表现与使用反馈改了十处，以下为最终形态；后文保留原计划作为决策依据，冲突处以本节为准。

| 项目 | 原计划 | 最终形态 | 原因 |
|---|---|---|---|
| 页位置指示 | 面板上沿一条页签条，每页一个带文字 chip（`role=tab`），占 44px 高 | 面板最底部的**无文字圆点**（当前页拉成 12px 短条），`bottom = 安全区 + 3px`、高 8px，**不占额外高度** | 使用反馈：不要页签名、圆点贴底、不得增高面板 |
| 分页切分 | 按官方分组（`role=presentation` 标题）切页，组名做页签 | **顺序切页**（每 8 项一页），不再读组名 | 去掉页签文字后组名无展示位置，按组切会留下整行空白（实测 11 项时首页只有 3 项） |
| 每项定位 | `grid-auto-flow: column` + 逐项 `style.order` 重排 | **显式 `grid-column` / `grid-row`**（纯函数 `slotOf`），容器改回 `grid-auto-flow: row` | 网格自动排布按「排名」压缩 order 空号，11 项时第二页的「余额/对话」漏进第一页 |
| 末页宽度 | 靠项数自然撑开 | 显式 `grid-template-columns: repeat(pages*4, 25%)` | 末页项数不足时列数不够，`scrollWidth` 只有 589（需 785），滑不到整页 |
| 与常驻条重复的项 | 保留 | 面板里过滤掉「文件」（`ADD_DROP_LABELS`），用 `display:none !important` 压过官方 `display:flex !important` | 常驻条已有「文件」，面板里重复 |
| 设置页顶部 | 直接顶到安全区，页签在最上 | 先一条 `deepseek` 品牌行（56px，鲸鱼图标 clone 自官方抽屉），页签随之下移 | 宿主「引擎已就绪」悬浮条（收起后是把手）压住页签，且需要品牌标识 |
| 外观卡片 | 固定 3 列 | `≤430px` 两列 | 3 列会把「跟随系统」挤成两行 |
| 返回键 | 只处理设置页/抽屉/底部表 | 追加接管**加号面板**与**顶部 ⋯ 菜单**，并加「关闭过渡闸门」 | 官方弹层不响应返回键，面板开着按返回会直接退出应用 |
| 会话面板工作区 | 原计划未涉及 | 多工作区走**分组标题 + 会话缩进**（官方抽屉式），单工作区只在「会话」标题旁标一次 | 逐行标工作区会把行高 44 撑到 68、每屏少 2 行；分组只多 N 条 28px 标题 |
| 会话面板高度 | 内容撑到宿主悬浮条下为止 | **上限屏高 60%**，屏特别矮时用 280px 下限继续长高，始终封顶在悬浮条下方 | 占满全屏会盖住上方对话、不便单手操作；内容少时按内容自适应不硬撑 |

---

## 0. 结论

两条需求都可以在不改官方内核、不替换官方插件、不改官方 React 树的前提下完成：

| 需求 | 做法 | 关键手法 |
|---|---|---|
| 加号面板只要 2 行，超出部分用多页左右滑动 | 固定 2 行宫格 + 横向分页容器（CSS Grid 显式 `grid-column`/`grid-row` 定位），页位置由插件自绘圆点表示 | **只写行内 `grid-column`/`grid-row` 与容器 `grid-template-columns`，不移动/不插入官方节点** |
| 设置页更适合手机 | 官方设置弹窗（`[role=dialog][aria-modal=true]`，含 `<nav>`）全屏化：品牌行 + 横滑页签 + 固定操作行 + 单列可滚动内容，控件补足 44px 热区 | 自有 `data-dshm-settings-*` 标记 + 作用域 CSS，几何判据打标 |

两项都受 `data-dshm-mode="mobile"` 作用域保护，锚点缺失或卸载即回退官方布局。

---

## 1. 现状取证（0.5.12，CSS 视口 400×711）

### 1.1 加号面板（右下 ⊕）

```
LISTBOX 4,422 393x285  grid / column / opts=11 / scrollH=285
  HOST   0,417 401x294  flex column  max-height 391  （官方弹层定位根）
  OPTS   每项 91x80（图标 span 48x48 + 标签 span 14px + slug/描述隐藏）
  文件 目标 计划 反馈 / 压缩 权限 模型 下载日志 / 余额 对话 桌宠   ← 3 行
```

| 事实 | 数值 | 影响 |
|---|---|---|
| 当前项数 | **11**（`dsh-pet` 追加了 余额 / 对话 / 桌宠） | 已经 3 行，撑高 285px |
| 每项尺寸 | 91×80，图标 48×48，标签 12px | 4 列 × 2 行 = 194px，是理想高度 |
| 面板高度 | 跟随内容（285），并把整个输入区推高同样高度 | 项数变化时底部区域跳动 |
| 官方分组 | `[role=presentation]` 两个：**添加**(4 项) / **指令**(7 项) | 可直接用作页签名，不需要新造文案 |
| 滚动 | 垂直 `overflow-y: auto`，`max-height: 55vh - 24px` | 与「2 行 + 左右翻页」冲突，需替换 |

### 1.2 设置弹窗

```
PANEL   8,120 385x391        ← 浮在页面中上部的小窗，不是全屏
  NAV   8,120 385x52         ← 横向 tab 条（"设置"标题占 44px + 6 个 tab）
       账号与余额 114 | 通用设置 100 | 模型 72 | 内置插件 100 | Agent 预设 112 | 桌宠配置 100
       tab 总宽 ≈ 442 + 标题 44 = 486 > 385 → 右侧 3 个 tab 完全在视野外
  CONTENT 8,172 385x340
    ├ 工具行 385x54："打开配置文件" 93x28 + "关闭" 28x28
    └ 滚动区 385x286（padding-left 24）
        └ 通用设置实际内容高 1207px → 只能靠小窗内滚动看 4.2 屏
```

| 症状 | 实测 | 期望 |
|---|---|---|
| 弹窗尺寸 | 385×391，上下留大片遮罩 | 全屏（400×711 减安全区） |
| 内容可视高度 | 286px | ≈ 560px（+96%） |
| tab 条 | 6 个 tab 只能看到 3.5 个，无任何「还有更多」提示 | 横滑 + 激活项自动居中 + 右缘渐隐提示 |
| tab 高度 | 32px | ≥44px |
| 关闭按钮 | 28×28 | 44×44 |
| 开关（显示代码工作视图等） | 36×20 | 视觉不变，热区 ≥44×44 |
| 下拉控件 | 36px 高、82–124 宽 | ≥44px 高，宽度自适应 |
| 外观主题 | 3 张卡各 332×83 **纵向叠成 3 行**（flex 换行） | 3 列宫格，一行放下 |
| 抽屉 | 设置打开后抽屉仍然可见（层级混乱） | 打开即收起抽屉；设置关闭后常驻条恢复 |
| 常驻条 | 被设置遮罩盖住但仍渲染 | 设置打开期间隐藏 |

### 1.3 环境既有插件（必须共存）

- `dsh-android-narrow-settings`（引擎内置，v1.2.178）：已把设置面板改成"nav 上移横排"，正是当前 385×391 的来源；它只在「面板宽度」上做文章。
- `dsh-android-narrow-sidebar` / `dsh-android-narrow-rightbar` / `dsh-android-chat-perf`：与本次改动无交集。
- 优先级策略：本插件选择器带 `html[data-dshm-mode="mobile"]` 前缀 + 自有属性，天然比 `[data-android-narrow-settings]` 更具体，后加载也不影响胜负。

---

## 2. 目标与验收指标

### 2.1 加号面板

1. 面板高度恒定：**2 行 = 194px**（≤4 项时 1 行 114px），与项数无关，常驻条不再随项数跳动。
2. 每页 8 项（4 列 × 2 行），第 9 项起进入下一页；左右滑动一次翻一页，松手吸附到页边界。
3. 页签条：按官方分组命名（当前两级：**添加 / 指令**）；同一分组超过 8 项时自动拆页并标 `指令 1/2`。
4. 页签总数 = 1 时不显示页签条（保持现状观感）。
5. 点击页签跳页，横滑时页签同步高亮；页签高度 40px、热区 ≥44px。
6. 11 项 → 2 页（添加 4 / 指令 7）；24 项 → 3 页，全部可达、无垂直滚动。

### 2.2 设置页

1. 面板 `inset: 0`，宽高 100%，四角 0 圆角，无投影；遮罩隐藏（全屏即遮罩）。
2. 顶部：tab 横滑条（高 52，chip ≥44 高，激活项自动滚入视野）+ 工具行（高 48，关闭按钮 44×44）。
3. 内容区：`flex: 1`，单列滚动，可视高度 ≥560px（400×711 下），`overscroll-behavior: contain`，底部补安全区。
4. 所有可点元素热区 ≥44×44（tab / 关闭 / 开关 / 下拉 / 主按钮）；视觉尺寸不做无谓放大。
5. 外观主题 3 列一行；`通用设置` 1207px 内容在 ≥560px 视口内滚动顺畅、无横向溢出（`scrollWidth == clientWidth`）。
6. 6 个 tab（账号与余额 / 通用设置 / 模型 / 内置插件 / Agent 预设 / 桌宠配置）逐一巡检：无横向溢出、无逐字竖排、无被裁切控件。
7. 打开设置自动收起抽屉、隐藏底部常驻条；关闭后恢复。
8. Android 返回键 / Esc 关闭设置页（走官方关闭按钮，不改官方状态）。

---

## 3. 方案 A：加号面板 2 行分页

### 3.1 为什么不能只写 CSS

- 现有结构是 4 列网格 + 垂直滚动；改成"2 行 + 左右翻页"要么重排 DOM（动官方 React 子树，风险高），要么用 CSS 制造"列优先填充 + 页宽吸附"。
- 纯 CSS 的两点不足：① `grid-auto-flow: column` 是**列优先**填充，视觉顺序会变成"文件/目标"竖排在第一列；② 页宽与容器 padding 的百分比基准不一致，吸附点会错位。

### 3.2 采用：「列优先 + order 重排 + 页宽吸附」

```
容器：[role=listbox]
  display: grid;
  grid-template-rows: repeat(2, 80px);   /* 行数由 data-dshm-add-rows 决定 */
  grid-auto-flow: column;
  grid-auto-columns: 25%;                /* 4 列 = 一页 = 容器 100% */
  padding: 12px 0;                       /* 左右 padding 为 0，保证页宽 = clientWidth */
  overflow-x: auto; overflow-y: hidden;
  scroll-snap-type: x mandatory;
```

每个 option（官方节点，只加内联 `order`）：

```
order = pageIndex * 8 + (j % 4) * 2 + Math.floor(j / 4)
```

- 网格按 order 升序填入列优先槽位（c1r1, c1r2, c2r1, c2r2, …），传入上式后视觉上就是"行优先、每行 4 个、每页 8 个"；
- 第一列（`j % 4 === 0`）的项加 `scroll-snap-align: start`，形成 0 / 100% / 200% 的页级吸附点；其余项 `none`；
- option 自身左右用 `padding-inline: 4px` 补回视觉留白，不影响页宽计算。

**这是本方案最关键的一点：不移动、不包裹、不插入任何官方节点，只写一个内联样式属性**，React 重渲染最多把它覆盖掉，下一帧 `MutationObserver` 再补写回来即可，不会破坏官方键盘导航与 `aria-activedescendant`。

### 3.3 分页算法（纯函数，可单测）

```js
planAddPages(options /* [{label, group}] */, perPage = 8, cols = 4)
  → [{ label: '添加', items: [0..3] }, { label: '指令', items: [4..10] }]

// 分页按官方分组切分；某组超过 perPage 时按 8 项拆页，标签追加 "1/2"、"2/2"
// 组内不足一页也独占一页（不做跨组拼页，保持语义清晰）
rows(count) = count <= cols ? 1 : 2

// 页内序号 j（0 起）→ 网格显式行列（1 起）
slotOf(j, pageIndex, rows, cols):
  page = floor(j / (rows * cols))
  r    = floor((j - page * rows * cols) / cols)
  c    = (j - page * rows * cols) % cols
  return { column: (pageIndex + page) * cols + c + 1, row: min(r, floor(j / cols) + 1) }
```

来源：读取 `[role=listbox]` 的直接子节点顺序，遇到 `[role=presentation]` 取 `textContent` 作为组名（它当前被 `display:none`，但 `textContent` 仍可读），遇到 `[role=option]` 归入当前组。

### 3.4 页位置指示（最终形态：无文字圆点）

- 渲染位置：自定义 `<AddPager>` React 组件挂在 `shell.overlay`（与现有 Sheet/遮罩同一层），`position: fixed`、透明背景、`pointer-events: none`；
- 定位：`bottom: calc(var(--dshm-safe-bottom) + 3px)`、`height: 8px`——**浮在面板自身的底部内边距里，不给面板增加任何高度**（面板高度只由宫格行数决定，实测恒 203px）；
- 视觉：每页一个 5×5 圆点，当前页 `width: 12px`（短条），颜色 `--dsw-alias-label-secondary`；点自身 `pointer-events: auto` 并向外扩 `inset: -9px -5px` 热区，可直接点选翻页；
- 结构：仅 1 页时组件返回 `null`，不渲染任何节点；
- 交互：点圆点 → `scrollTo({ left: i * clientWidth, behavior: 'smooth' })`；监听 `scroll`（rAF 节流）→ `Math.round(scrollLeft / clientWidth)` 同步高亮；
- 无障碍：每个圆点带 `aria-label="第 N 页"`。

### 3.5 与现有逻辑的衔接

| 现有机制 | 改动 |
|---|---|
| `syncPanelSpace()` 用弹层实测高度写 `--dshm-panel-space` | 不变：圆点不占高度，面板高度仍只由宫格决定（`const next = height + 'px'`），不再叠加页签高度 |
| `tagComposerMenus()` 识别 `role=listbox` 并打 `data-dshm-popover` | 打标后追加 `countSectionTitles` 判据（有分组标题才算加号菜单，避免把桌宠选择列表也分页）+ `planAddPages` + 逐项写 `grid-column`/`grid-row` |
| `popoverClosedAt` / ⊕ 二次点击收起 | 不变 |
| 弹层互斥（`closeSheet`） | 不变；圆点在页面卸载时才消失（`count < 2` 即返回 null） |
| 返回栈（`syncOverlayHistory`） | 加号面板与顶部 ⋯ 菜单纳入 `overlayVisible()`，返回键先收它们（官方不处理返回键，不接管会直接退出应用） |

### 3.6 回退

- 若 `planAddPages` 结果异常（无 option / 组名为空 / 写入 order 抛错）→ 不写 order、不加分页标记，退回 0.5.12 的 4 列 + 垂直滚动。
- 配置 `addPanel.pages: false` 可强制关闭分页。

---

## 4. 方案 B：设置页手机化

### 4.1 识别与打标

同一套判据（吸取 `narrow-settings` 曾把主界面误判成设置面板导致黑屏的教训）：

1. 首选 `[role="dialog"][aria-modal="true"]`，且**内部存在 `<nav>` 且 nav 内 button ≥3**；
2. 退路：`position: fixed` 浮层内、含 `aria-label="关闭"` 按钮、且有 `<nav>`；
3. 只在 `data-dshm-mode="mobile"` 下打标。

标记：

| 标记 | 落在 |
|---|---|
| `data-dshm-settings-overlay` | 面板的固定定位祖先（mask 的兄弟层） |
| `data-dshm-settings-panel` | 对话框本体 |
| `data-dshm-settings-nav` / `-tabs` / `-title` | `<nav>` / nav 内滚动列表 / "设置"标题 |
| `data-dshm-settings-content` / `-head` / `-scroll` | 内容列 / 工具行（首个子元素）/ 滚动容器 |
| `data-dshm-settings-close` | 关闭按钮（28×28） |
| `data-dshm-settings-theme` | 外观主题卡片容器（几何识别：子元素为 ≥2 个高 >60、宽 >250 的 button） |
| `data-dshm-settings-row` | 需要栈式排布的宽控件行（几何识别，见 4.3） |

打标用 `MutationObserver` 复用现有 rAF 通道（设置面板打开/切 tab 时重算），关闭即清理。

### 4.2 全屏外壳

```css
html[data-dshm-mode="mobile"] [data-dshm-settings-panel] {
  position: fixed; inset: 0;
  width: 100%; max-width: none; height: 100%; max-height: none;
  border-radius: 0; box-shadow: none;
  flex-direction: column;
  padding-top: var(--dshm-safe-top);
  padding-bottom: var(--dshm-safe-bottom);
  background: var(--dsw-alias-bg-base);
}
html[data-dshm-mode="mobile"] [data-dshm-settings-overlay] > [aria-hidden="true"] { display: none; } /* 遮罩 */
```

- 层级：面板 `z-index` 抬到常驻条（27）与顶栏菜单（60）之上，并用 `html[data-dshm-settings-open]` 隐藏常驻条、隐藏抽屉遮罩；
- 打开设置时 `requestDrawer(false)` 收起抽屉；
- 头部顺序：`nav`（tab 条）→ 工具行 → 滚动区，全部 `flex: none`，只有滚动区 `flex: 1 1 auto; min-height: 0`。

### 4.3 内容区规则

| 目标 | 规则 |
|---|---|
| tab 条 | 高 52 → 56；chip `height: 44px; padding: 0 14px; border-radius: 999px; font-size: 14px`；隐藏 `设置` 标题（省 44px）；`scroll-snap-type: x proximity`；右缘 `mask-image` 渐隐提示可横滑；激活 chip 自动 `scrollIntoView({ inline: 'center' })` |
| 工具行 | 高 48；`打开配置文件` 32px 高（保留功能）；关闭按钮 44×44，图标 18px |
| 滚动区 | `padding: 0 16px calc(16px + safe-bottom); overflow-y: auto; overscroll-behavior: contain`；隐藏滚动条 |
| 表单行 | `min-height: 56px; gap: 12px;`；文字块 `flex: 1 1 auto; min-width: 0`；控件 `flex: none; max-width: 52%`；标签 15px / 描述 12.5px |
| 控件热区 | `button[role=switch]`、高度 <44 的 `button`、`select` → `::after { position: absolute; inset: -12px; }`（不改布局，只扩热区）；行内下拉 `min-height: 44px` |
| 外观宫格 | 主题容器 → `display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px`；卡片 `width: auto; min-height: 92px` |
| 宽控件行 | 几何判据：行内控件宽 > 行宽 60% 且与文字块同行 → 打 `data-dshm-settings-row`，改 `flex-direction: column; align-items: stretch`（控件独占一行） |
| 横向溢出兜底 | 内容区 `overflow-x: hidden`；内部超宽块（表格 / 代码 / 长路径）若仍溢出，给该块 `overflow-x: auto` 并打 `data-dshm-settings-wide` |

### 4.4 分页与返回

- `overlayVisible()` 增加「设置打开」一项，让返回键 / 手势优先关设置；
- `popstate` → 若设置打开，点击官方关闭按钮（`[data-dshm-settings-close]`），不走 `history.back()`；
- 设置关闭后：恢复常驻条、清理全部 `data-dshm-settings-*` 标记，并**连同节点一起移除品牌行**（品牌行是插件创建的，官方不会回收）。

### 4.5 品牌行（实施中追加）

- 位置：`dialog.insertBefore(brand, dialog.firstChild)`，成为全屏面板的第一行，`flex: none`、高 56px；
- 内容：`<logo svg 22×auto>` + `deepseek` 文本（15px / 600）；
- 图标来源：官方没有稳定选择器，实测侧栏里第一个 `<svg>` 就是它（`viewBox="0 0 23.16 17.04"`，宽扁；其余 7 个都是 16×16 线性图标）——按「宽高比 1.15~2.2 且宽 ≤40」挑第一个，`cloneNode` 后按 viewBox 比例设 22×16，拿不到就只显示字标；
- 作用：页签整体下移 56px，避开宿主顶部「引擎已就绪」悬浮条（展开 88px / 收起后残留约 60px 的把手），同时补上品牌标识；
- 打标时必须从 `content` 判定里排除品牌行，否则它会被当成内容区。

### 4.6 返回键接管（实施中追加）

- 背景：官方加号面板、顶部 ⋯ 菜单、设置页都不响应 Android 返回键，`onBackPressed` 会越过 WebView 直接 `finish` Activity（真机实测：面板开着按返回退到桌面）；
- 做法：三者在 `overlayVisible()` 里各占一项；`popstate` 按「设置 → 加号面板 → 顶部 ⋯ 菜单 → 底部表 → 抽屉 → 右栏」顺序逐层关闭；
- 关闭方式：加号面板与 ⋯ 菜单都给 `body` 派发一次 `pointerdown`（等同于官方「点击外部关闭」），再兜底清标记；
- **关闭过渡闸门**：`popstate` 消费掉栈条目后进入 `closingOverlay`，此时浮层还在跑关闭动画、`overlayVisible()` 仍为 true，若照常 `pushState` 会多压一条，下一次返回被它空转掉（真机复现：设置页第一次返回只切了页签）。闸门在浮层真正消失后解除，并带 700ms 兜底重算，避免关闭没生效时锁死返回栈。

---

## 5. 代码改造点（`lib/client.js`，单文件产物）

| 位置 | 改动 | 规模 |
|---|---|---|
| 常量区 | 新增 `ATTR_ADD_*`（paged / rows / tabs / page）、`ATTR_SETTINGS_*` | +15 行 |
| 纯函数区 | `planAddPages`、`orderOf`、`rowsFor`、`settingsStructureOf` | +90 行 |
| CSS_TEXT | 加号面板分页样式块（替换现 1607–1664 的宫格规则）+ 页签条 + 设置页样式块 | +170 行 |
| `tagComposerMenus` | listbox 打标后调用 `syncAddPager()` | +8 行 |
| 新增 `syncAddPager` / `syncSettingsPanel` | DOM 打标 + 状态同步 + 清理 | +160 行 |
| 组件区 | `<AddPager>`（页签条） | +70 行 |
| 状态 | `state.addPager` / `state.settingsOpen` | +4 行 |
| 卸载清理 | 移除新标记、新 CSS 变量、滚动监听 | +10 行 |
| `__test` | 导出新纯函数 | +6 行 |

新增 `test/ux.test.js`：分页切分（0/1/4/8/9/11/16/17/24 项）、组名拆分、order 映射（4 列 × 2 行、页 2 起点 8）、rows 计算、设置结构判据（真/假 DOM 描述对象）。

---

## 6. 阶段计划（全部完成）

| 阶段 | 内容 | 结果 |
|---|---|---|
| **M1** 纯函数 + 单测 | `rowsFor` / `slotOf` / `planAddPages` / `isSettingsDialog`；`npm run check` 全绿 | `test/ux.test.js` 30 项全过（0/1/4/5/8/9/11/16/17/24 项、非法输入、跨 realm 数组比较；另含工作区分组与相对时间 3 项）；0.6.0 之后补 8 项（原型键目录名分组、会话行 id 归一 / 当前会话置顶 / blank 过滤 / 不改源数组、`STRINGS` 中英键一致、翻页 `aria-label`），合计 38 项 |
| **M2** 加号面板分页 | 显式行列定位 + 页宽吸附 + 圆点指示 | 11 项（过滤「文件」后 10 项）→ 2 行 ×4 列 ×2 页；面板高恒 203px；`scrollLeft` 0↔393、`scrollWidth` 785；一页一次手势 |
| **M3** 设置页全屏 | 打标 + 外壳 CSS + 品牌行 + 抽屉互斥 + 常驻条隐藏 | 面板 `0,0,401,712`；`HEAD 0,56,401,48`；`SCROLL 0,104,401,608` |
| **M4** 内容区细节 | 页签 chip、工具行、行布局、开关热区、外观宫格 | 6 个 chip 均高 40；工具按钮 32、「关闭」44×44；`scrollWidth == clientWidth == 401`；外观窄屏两列 |
| **M5** 交互闭环 | 返回键/Esc、切 tab 后重算、关闭后清理 | 设置/加号面板/⋯ 菜单返回均一次关闭且应用存活（连测 6 轮）；反复开合无残留标记 |
| **M6** 回归与文档 | 非手机形态回归、小尺寸回归、README、截图、版本 0.6.0 | 非手机形态（CSS 500×556）插件完全退出；640×1136（CSS 356×631）分页与设置页正常；`npm run check` + `pack --dry-run` 通过 |

---

## 7. 验证矩阵（实测结果）

**真机（MuMu，主战场）**

| 项 | 方法 | 实测结果 |
|---|---|---|
| 加号面板高度/页数 | logcat 打印 `listbox rect + pages` | `HOST 0,509,401,203`、`LB 4,519,393,194`；11 项（过滤后 10）→ 2 页 |
| 横滑翻页 | `adb shell input swipe` 左/右 | 一次手势正好一页，松手吸附；`sl=0 → 393` |
| 圆点指示 | 截图对比两页 | 当前页圆点拉成 12px 短条；贴面板最底、不占高度 |
| ⊕ 二次点击收起 | tap ⊕ ×2 | 面板与圆点同时消失，常驻条位置不变 |
| 设置全屏 | 抽屉 → 账号菜单 → 设置 | `PANEL 0,0,401,712`；无遮罩空白；抽屉已收起 |
| 品牌行 | 截图 | `deepseek` + 鲸鱼图标（clone 自官方抽屉，`viewBox 23.16×17.04`）；页签下移到 y 56 以下 |
| 6 个 tab 巡检 | 逐个 tap + 截图 | 账号与余额 / 通用设置 / 模型 / 内置插件 / Agent 预设 / 桌宠配置：无裁切、无竖排、无横向溢出 |
| 页签横滑 | `input swipe` + 截图 | `scrollWidth 710 > clientWidth 401`；激活项自动居中（`sl=0→98→200→310`） |
| 触控热区 | 截图 + 测点 | 页签 chip 40、关闭 44×44、工具按钮 32、开关/下拉已补热区 |
| 返回键（设置） | `input keyevent 4` | 一次关闭、应用存活；连测 6 轮均为一次关闭 |
| 返回键（加号面板 / ⋯ 菜单） | 同上 | 一次关闭、不退出应用；若宿主「引擎已就绪」浮条正展开，第一次返回会被它吃掉（应用原生行为），收起后再按即关 |
| 关闭后无残留 | 关闭后 dump + 截图 | 品牌行节点一并移除，常驻条回到原位 |
| 会话面板分组 | 探针（假三段工作区）+ 截图 | 组标题 11px 灰字 + 右侧组内条数，会话行缩进 24px；滚动时组标题吸顶、背景不透明、无半行裁切 |
| 会话面板高度 | logcat 打印 sheet/list 几何 | `max-height` 426.6px（711×60%）；内容 4 行时 `sheet h=236`、`list clientHeight = scrollHeight = 176`，不硬撑、无空滚动；20 行假数据时撑到上限并可滚动 |
| 顶部悬浮条避让 | 同上 | 上限内 `sheet top = 419`（> 悬浮条下沿 57）；内容超长时也不会钻进悬浮条 |
| 相对时间 | 截图 + 单测 | 当前会话「3 小时」、其余「2/3/6 小时」；纯函数覆盖刚刚 / 分钟 / 小时 / 昨天 / N 天 / 同年 M-D / 跨年 Y-M-D |

**尺寸/形态回归**

| 场景 | 结果 |
|---|---|
| 非手机形态（CSS 500×556，宽高比 1.11 < 阈值） | 插件完全退出：无底部常驻条、无悬浮 ⊕、左侧栏为官方竖条，与官方布局一致 |
| 小尺寸 640×1136（CSS 356×631） | 常驻条 6 项正常；加号面板 2 行 4 列 ×2 页、圆点正常；设置页全屏、页签可横滑、外观两列 |
| 横屏 | 该 App 在 manifest 固定竖屏，`wm size` 横置会被系统旋回，无法直接验证；以「宽高比低于阈值」等价覆盖 `default` 分支 |

---

## 8. 风险与回退

| 风险 | 等级 | 缓解 |
|---|---|---|
| `order` 重排被 React 重渲染覆盖 | 中 | 每次 MutationObserver 通道重算并比对，只在变化时写入；不写 DOM 结构 |
| 老 WebView 对 `scroll-snap` + grid 列流支持不全 | 中 | 已确认 Chrome 内核版本支持；退化路径为「不吸附的横滑」，仍可翻页；再退化回垂直滚动 |
| 页宽吸附点与 padding 基准错位 | 中 | 容器左右 padding 归零、item 用 `padding-inline`，页宽严格 = clientWidth，实测校验 `scrollLeft` |
| 设置面板误判（历史事故） | 高 | 必须 `role=dialog` + `<nav>` + ≥3 button；只在 mobile 下生效；打标失败只影响观感不影响功能 |
| 与 `narrow-settings` 规则打架 | 中 | 自有属性 + `html[data-dshm-mode]` 前缀 specificity 更高；同时保留其回退观感 |
| 各 tab 结构差异大（模型/插件列表/桌宠配置） | 中 | M4 逐 tab 取证后按需补规则；未识别的页面仅应用通用规则（全屏 + 安全区 + 热区），不会破版 |
| 返回键与官方 `history` 栈冲突 | 中 | 复用现有 `overlayVisible` + `popstate` 通道，关闭走官方按钮点击 |
| 关闭过渡期间重复压栈，吃掉下一次返回 | 高（已发生） | 「关闭过渡闸门」：`popstate` 消费条目后进入 `closingOverlay`，浮层真正消失才解除，并带 700ms 兜底重算 |
| 品牌 logo 依赖「侧栏第一个宽扁 svg」 | 中 | 只在 `ratio 1.15~2.2 且宽 ≤40` 时取用；拿不到就只显示字标，不显示错误图形 |
| 宿主「引擎已就绪」浮条拦截返回键 | 低（环境） | 应用原生行为，收起浮条后返回键正常；文档与 README 已注明 |
| 会话面板撑满全屏遮住上下文 | 中（已发生） | 上限改为屏高 60%，并用 `min()` 封顶到悬浮条下方；内容少时按内容自适应 |
| `max()` / `min()` 在旧 WebView 不生效 | 低 | 官方宿主为现代 Chrome 内核，已在真机验证 `max-height` 解析为 426.6px；退化时仅失去高度上限，列表仍可滚动 |

**总回退**：`data-dshm-mode` 退出或插件卸载即恢复官方布局；新增两处配置可单独关闭（`addPanel.pages`、`settings.fullscreen`）。

---

## 9. 已确认的选择

1. **页位置指示**：无文字，圆点贴在面板最底部，不增加面板高度。
2. **分页切分**：顺序切页（每 8 项），不按官方分组，也不再显示组名。
3. **与常驻条重复的项**：「文件」从面板里过滤掉。
4. **设置页形态**：全屏页；顶部加品牌行把页签垫到宿主悬浮条下方。
5. **`打开配置文件`**：保留，压到 32px 高。
6. **版本号**：`0.6.0`（行为变化，非补丁）。
7. **会话面板的工作区**：改用官方抽屉式的「分组标题 + 会话缩进」，不用 `[工作区]·[会话]` 单行拼接（截断方向不一致、`·` 易与分隔符混淆）；单工作区不出现分组标题，只在「会话」标题旁标一次。
8. **会话面板高度**：内容多时最多占屏高 60%，屏特别矮时用 280px 下限继续长高；内容少时按内容自适应，不硬撑、不出现空滚动。

---

## 10. 0.6.0 之后的修复与复核（2026-10-29）

0.6.0 发布后按「阻断 → 高优 → 清理」把 `lib/client.js` 全量重审了一遍，共 17 个修复（版本号仍是 `0.6.0`，发版建议 `0.6.1`）。

### 10.1 修复清单

| # | 类别 | 问题 | 处理 |
|---|---|---|---|
| 1 | 阻断 | 分组字典用 `{}`，工作区目录名叫 `constructor` / `toString` / `valueOf` 时命中原型链上的函数，`group.rows.push` 抛 `TypeError`，会话面板整片崩 | `groupSessionsByWorkspace` 与 `workspaceTitleMap` 一并改 `Object.create(null)`；补 5 个原型键名目录名的回归用例 |
| 2 | 高 | `sessionRows` 按 `row.id \|\| row.sessionId` 取 id，渲染侧只认 `row.id`：只有 `sessionId` 的快照会「当前会话不标记 + 点击无效 + key 全 undefined」 | 抽出 `sessionRowId()`，在 `sessionRows` 里浅拷贝补 `id`，排序也改走归一值 |
| 3 | 高 | `data-dshm-popover` 只打不撤；官方把浮层根留成 0 高空壳时 `overlayVisible()` 恒为真，返回键被空转吃掉 | 新增 `prunePopoverMarks()`（已卸载 / 量不出高度且内部无可见菜单即撤标记），observer 每帧与打标入口各清一次 |
| 4 | 高 | `tagStatsDialog` 只按「`role=dialog` + 无 ≥3 导航 + 含 tok/用量/context」判定，插件自己的 `.dshm-sheet` 会被压成统计小窗 | 排除 `.dshm-sheet`、`[data-dshm-popover]` 子树与 `[data-dshm-sidebar]` |
| 5 | 高 | 进入 mobile 时 `requestDrawer(false)` 收起官方侧栏，退出时从不恢复，桌面 / 平板切回来永久少一块 | 记 `sidebarExpandedBeforeMobile`，退出 / 卸载按原值回正（只调一次 `toggleSidebar`，避免异步互相覆盖） |
| 6 | 高 | observer 每帧全量同步几何，消息流式输出时 60fps 反复量 rect / computedStyle | 几何类同步合并到 120ms；输入卡换节点走立即分支；`document.hidden` 跳过；`syncComposerEdge` 加几何签名，没变不重扫子树 |
| 7 | 中 | `t()` 读 `runtime.lang`，切语言不触发重渲染，文案要等下一次状态变化 | 新增 `setLang()`：同时写 `runtime.lang` 与 `state.lang`，渲染期优先读 state |
| 8 | 中 | 翻页圆点 `aria-label` 硬编码中文，英文环境读屏念中文 | `STRINGS` 加 `page` / `pageCurrent` 模板 + `pageLabel()`；补中英键一致与占位符用例 |
| 9 | 中 | `dispose` / `syncPanelSpace` 只清分页状态，不清官方节点上的 `grid-template-columns` / `grid-column` / `display:none`，官方复用 listbox 会停在「多列 + 缺项」 | 两处都先 `clearAddPaging(node)` 再清状态 |
| 10 | 低 | `servicesReady` / `--dshm-panel-height` / `.dshm-mobile-only` / `timeNow\|timeYesterday` 无引用；`apply` 内重复一份 `exports.__test` | 全部删除 |
| 11 | 低 | `verify-package` 不校验 bundle 内 `VERSION` 与 `package.json` 一致 | 加 `/const\s+VERSION\s*=\s*['"]([^'"]+)['"]/` 比对，并做负向验证 |
| 12 | 低 | `publish-npm.sh` 头注释写 `POLL_ATTEMPTS=10 / INTERVAL=6`，代码是 18 / 10 | 注释对齐代码 |
| 13 | a11y | 底部表有 `role=dialog` 但无 `aria-modal`、打开后焦点仍在背后；抽屉无焦点管理 | 表补 `aria-modal` + 焦点进出；抽屉展开时补 `role` / `aria-label` / `aria-modal` 并把焦点送进侧栏（跳过输入框，免得弹软键盘） |
| 14 | a11y | 插件自建动效不响应系统「减少动态效果」 | `@media (prefers-reduced-motion: reduce)` 关过渡与动画，终态保留 |

### 10.2 复核方式与结论

- `node --check lib/client.js` + `npm test`（38 项）+ `npm run check`（包清单 / bundle 契约自检）全绿；
- 17 个提交逐个用 `git worktree` 检出后跑 `npm test` + `verify-package`，中间态没有一个被破坏；
- 把 `CSS_TEXT` 反解成数组实际 `join('\n')`：**847 行、花括号 125/125 平衡**，`@media` 块落在末尾且结构完整；
- `verify-package` 的版本校验做过负向验证：临时把常量改成 `0.6.1`，脚本打印 `0.6.1 vs 0.6.0` 并以退出码 1 结束，还原后 ALL PASS。

复核中又发现并修掉两处（提交 `e002746`、`f904e1c`）：

1. **抽屉 `role=dialog` 常驻**：原实现一进手机形态就挂 `role=dialog`，只按开合切 `aria-modal`。但收起后的侧栏只是 `translateX(-104%)` 的离屏元素，仍留在无障碍树里，读屏会在一段看不见的内容上念「对话框」。改为**仅在展开时**补 role / `aria-label` / `aria-modal`，收起立即还原；官方属性按节点记录，React 重挂侧栏节点时先还原旧节点、再对新节点重新取值。
2. **每帧重复 prune**：observer 先 `prunePopoverMarks()`，进 `tagComposerMenus()` 又清一遍，同一帧两次全文档查询 + rect 测量。给 `tagComposerMenus(marksPruned)` 加参数，observer 传 `true`。

### 10.3 待真机验证

| 项 | 方法 | 关注点 |
|---|---|---|
| 底部表读屏 | TalkBack：开「会话」→ 滑动遍历 → 关闭 | 焦点是否落在关闭按钮；关闭后是否回到常驻条的「会话」 |
| 抽屉读屏 | TalkBack：开抽屉 → 滑动遍历 → 关闭 | 展开时是否作为对话框播报；收起后侧栏不应再被念成 dialog |
| 键盘 Tab（平板 + 外接键盘） | Tab / Shift+Tab 循环 | 底部表与抽屉内 Tab 会不会被背后内容打断（当前未做焦点陷阱，靠 `aria-modal` 约束读屏） |
| 减少动态效果 | 开发者选项把动画缩放调到 0.5x / 关闭，或仿真 `prefers-reduced-motion` | 抽屉、遮罩、宫格、圆点四类动效应无过渡，终态与开启动效时一致 |
| 侧栏 `role` 覆盖 | 与官方布局对照 | 展开期间官方侧栏语义被临时替换；若官方自身逻辑依赖该 role，可退到「只保留焦点管理、不加 role」 |
