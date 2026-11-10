# 更新日志

格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [未发布]

### 变更（胶囊界面，按真机反馈在 0.4.12 基础上再调数值）

- **头部再压一档**：0.4.12 用内联 `36px 48px` 收紧头部；真机上页签行仍偏高，这里改成 `36px 32px`，分段控件单项收窄（字号 13 → 12、横向内边距略放宽），整块头部再矮约 16px。
- **统计带不再被截断**：改为 `space-between` 等距铺开并收内边距/图标，让「轮次/速度」「Token/缓存」「上下文」三组完整落在卡片宽度内；header 卡片 `overflow: visible`（统计带落在卡片底部预留里，裁切会切掉半截）。
- **标题行带文字的按键不再竖排**：`flex: 0 0 auto; white-space: nowrap; overflow: hidden`（「N 个后台任务」曾被挤成一行一个字；宽度仍与图标键一致，超出的文字裁掉而不是换行）。
- **自绘控件只在胶囊态创建**：`.dshm-seg` / `.dshm-attach-btn` 的 CSS 只在胶囊作用域，创建点加 `capsuleMode()` 闸门，不再依赖 1.2s 回收兜底。

### 修复（胶囊界面，真机反馈）

- **顶栏 ⋯ 菜单展开时，侧栏键与统计带整条消失、关闭后又闪一下**：菜单展开期间 header 被提到 `z-index: 50`（为了让菜单越过官方那条透明的 `_tabs` 行），而「打开侧边栏」那枚键在 header **之外**、统计带只有 `z-index: 6`，于是被 header 的卡片底盖住；关闭时两者回位就闪一次。现在展开期间把它们一起提到 header 之上（`z-index: 56 / 55`，菜单 host 仍是 60），从根上不再消失，也就没有回位闪烁。


- **顶栏 ⋯ 菜单的行只剩一个字**：菜单挂在 header 子树里，被「头部按键统一 40×40」的规则一起命中，行按钮被压成 40px 宽、内容裁掉。现在菜单内的按钮还原成自然宽高（`width/height: auto`、`white-space: normal`），实测三项「复制会话为 Markdown / 下载 Session 日志 / 反馈」完整显示。
- **分段控件仍然 40px 高、压住标题行**：上游 0.4.12 里有一条同选择器的 `min-height: 2.5rem` 在正文后面，把本 PR 的 24px 覆盖掉了；改为直接改上游那条（`1.5rem`），页签行 32px 才装得下。
- **标题行按键竖排 / 挤掉标题**：去掉会误伤菜单的 `overflow: hidden`，保留 `nowrap`。

### 性能（无视觉变化）

- **每帧同步链：探测节流、维护不减速**。主 observer 的每帧链里最贵的固定开销是「设置页 / 官方弹层在不在」的存在性探测（各 1~4 次全文档查询），而绝大多数帧答案是「不在」。新增 `PRESENCE_PROBE_MS = 120`，探测结果粘性保存（`overlaysPresent` / `menuPresent`）：没有东西在屏上时中间帧连维护一起跳过，一旦探到就恢复每帧维护，官方重渲染冲掉标记仍能下一帧补回。
- `prunePopoverMarks` 改为遍历 `popoverMarks` 登记表（`tagComposerMenus` 打标时登记），空表 O(1)；`syncPanelSpace` 从登记表取面板根；输入卡节点改为缓存 + `isConnected` 复核；`removeLayoutPickers` 用 `layoutPickerCount` 做 O(1) 闸门；每帧链里重复的 `syncLayoutPicker()` 去掉一次。
- 稳态收益：帧路径上的全文档查询约 10 次/帧 → 约 0.4 次/帧，强制布局读数归零。

### 修复

- **官方弹层首帧跳变**：主 observer 的回调现在接收 mutation records，新增节点里出现 `[role=listbox]` / `[role=menu]` 时在同一帧的 rAF（绘制前）补 `tagComposerMenus`，补打窗口 400ms 覆盖官方填内容的几帧——不再「先按官方锚点画一帧、120ms 后跳到底部」。

### 无障碍

- 底部表新增**焦点陷阱**（`trapFocus`）：Tab / Shift+Tab 在面板内循环，不再走到遮罩下面的底部条。
- 新增常驻的视觉隐藏 `role=status` **播报区**（`announce`）：底部表开合各播一次（`STRINGS.a11yOpened/a11yClosed`，中英成对）；隐藏用 `clip + 1px` 而非 `display:none`，清场时随 `clearAnchors` 摘掉。

### 测试

- `npm test` 去掉 `--test-force-exit`：该参数会在用例未跑完时按掉子进程，同一份代码每次跑到的用例数不同（实测 282 / 290 / 297，全量 308），门禁看起来绿其实漏跑。
- 新增 `test/frame-sync.test.js`（7 项）与 `test/a11y.test.js`（5 项）源码契约。


### 修复

- **胶囊头部顶部空档收紧**：官方 header 的 grid 行是 44px（标题）+ 52px（页签带），自绘分段控件只有 48px 高，标题与 TAB 之间留出一条明显空白。胶囊态下用内联 `grid-template-rows: 36px 48px !important` 压紧两行（官方规则带 `!important`，普通选择器压不动）；分段控件的 `top` 由实测行位自动跟随；切透明 / 其它预设时移除内联行高，还原官方布局。

---

## [0.4.12] - 2026-11-10

### 变更

- **对话正文交还 DSH 原生渲染**：移除插件的全部对话区接管——居中日期分隔、工具调用 chip 胶囊、代码块卡片与「收起 / 展开」按钮、思考行 / 命令行打标、步骤级折叠、消息时间与操作行样式、正文行高 / 段落间距 / 代码块限高、深色正文 +1px。对话页面现在由官方组件渲染：不注入节点、不打标、不改结构；`[data-dshm-center]` 只保留为布局锚点。同时删掉 `document.body` 子树观察器，避免流式输出时每帧全量扫描。（唯一的样式例外是深色用户气泡底色，只覆盖官方变量 `--dsw-specific-bubble`，见最后一条。）
- **命令结果卡片交还官方**：删除命令卡片（`[data-terminal]`）的网格重排、命令不折行 / 自动换行开关与浮层按钮层（`data-dshm-term-layer`、`data-dshm-terminal-wrap`、`localStorage['dshm-terminal-wrap']`）。输入框里敲 `/` 与 ⊕ 使用同一套自绘加号面板（与当前底栏样式保持一致），不再单独区分触发来源。
- **深色下胶囊样式的浮起关系**：胶囊（卡片头 / 输入卡 / 底栏）的阴影改用主题蓝（`--dsw-alias-state-business-primary` 55% + `color-mix`），并给外缘加一圈 32% 主题蓝的 1px 高光（输入卡描上/左/右、底栏描下/左/右，接缝处不画线；顶部卡片头四边都描）；顶部 TAB 分段控件改为灰轨道（`bg-layer-1`）+ 浅灰滑块（`bg-layer-3`），轨道与滑块各加一圈 1px 灰描边（`border-l1` / `border-l2`），选中文字仍为主题蓝。浅色与透明底栏保持原样。
- **设置页选择器高亮对齐外观卡片**：布局模式（原生 / 融合 / 悬浮）与底栏样式（透明 / 胶囊）的选中态改用与「外观」卡片同一对官方 token——`--dsw-alias-bg-module-platform` 作底、`--dsw-static-neutral-bluish-400` 作 1px 描边；浅色（`#f5f6f7` / `#adb2b8`）与深色（`#353638` / `#adb2b8`）都自动跟随。原生预设的「原生设置」行共用同一规则。
- **深色用户消息气泡改为暗蓝**：官方深色气泡底 `--dsw-specific-bubble` 是 `#2c2c2e`，与页面/卡片几乎没有区分度；现在只在该气泡节点上把变量覆盖为「主题蓝 30% 混底」（`color-mix`，深色实测 `rgb(51,66,93)`），不改结构、不加 `!important`。手机形态下三个预设（原生 / 融合 / 悬浮）统一生效；浅色气泡与桌面形态不变。

### 修复

- **透明底栏恢复原始五项导航**：`V2Nav` 之前无条件使用胶囊的「按页换项」模型，透明底栏因此变成 `会话 / 插件 / 工作权限 / 模型 / 更多` 并多出「更多 / 返回」第二页。新增纯函数 `dockVisibleItems`，透明态回到 `navSlots` 的 `会话 / 自动化任务 / 插件 / 工作台 / 设置`（无翻页），胶囊态保持现状；非胶囊态复位 `dockPage` 且不挂 Esc 监听。
- **回形针不再注入透明态**：`syncComposerAttach()` 增加 `data-dshm-dock === capsule` 门禁，透明底栏的官方 ⊕ 行保持原样（不再有插入/删除裸按钮的窗口）。
- **修复 ⊕ 偶现无响应**：`data-dshm-v2-addmenu` 幽灵态残留时官方弹层被隐成透明且接管被拒；`releaseGhost()` 的延迟收尾会误关用户刚打开的新弹层；双击时第二下点中遮罩把面板开完又关。现在真实 `pointerdown` 会先修幽灵态并作废旧收尾（`ensureAddMenuCoherent` + `addMenuGhostEpoch`），遮罩在打开后 250ms 内忽略点击，心跳自愈残留幽灵；透明 / 胶囊两条路径行为一致。

### 验证

- 门禁全绿：`npm run check`（308 项 / 300 pass / 8 skipped）；`check-tokens` / `check-contracts` / `check-compat` / `verify-package` / `check-hardcoded` / `check-colors` / `check-important` 全部通过。
- AVD `Medium_Phone_API_35` 实测：透明 / 胶囊双样式、三预设、浅色 / 深色、加号面板 60 次风暴与幽灵注入、对话正文零接管、命令卡片零注入、深色气泡与设置页选择器高亮。

---

## [0.4.11] - 2026-11-09

v2 悬浮预设的底栏改造成**可选的样式层**：默认外观保持透明（属性不存在 = 透明底栏），胶囊底栏由根属性 `html[data-dshm-dock="capsule"]` 显式打开。

### 新增

- **底栏样式层（胶囊）**：浮起的圆角胶囊 = 官方卡片面 `--dsw-alias-bg-layer-2` + 1px 描边 `--dsw-alias-border-l1` + 官方投影 `--dsw-elevation-panel`（缺省回退为整条阴影表达式，颜色取 `--dshm-color-shadow-2`）。入口：设置 → 通用设置 → 布局模式 →「悬浮」下的「底栏样式」（透明底栏 / 胶囊底栏），与原生预设的「原生设置」行同一套 UI。
- **抽屉把手可收起**：胶囊底部两条小横杠，点一下收起导航、再点展开。收起态由根属性 `html[data-dshm-dock-collapsed]` 驱动，CSS 只把五个 `.dshm-bar-btn` 设 `display: none`，把手留在原位（胶囊收缩到把手那一行，屏幕底边固定，把手位置不动）；触控区 `min-height: var(--dshm-v2-dock-handle)`（默认 44px）。按设备持久化在 `localStorage['dshm-dock-collapsed']`（`'1'` 表示收起）。
- **新 token `--dshm-v2-nav-total`**：默认 `var(--dshm-v2-nav)`（等于导航高度，行为不变），胶囊态下含把手行；面板页正文底部 padding、设置弹窗底边、工作台右栏底部 padding、设置面板内联 `bottom` 统一消费它。
- **样式偏好按设备记住**：`localStorage['dshm-dock-style']`（`capsule` / 缺省即透明）；隐私模式写不进去只影响本次会话。

### 胶囊形态（顶部 / 输入区 / 弹层 / 对话区）

- **顶部悬浮卡片头**：官方 `<header>` 渲染成圆角卡片（标题行 44 / 页签带 52 / 统计带 26 三段独立），标题与左右按键同中线、左右各 24px 内缩；统计带改为透明底并入卡片。
- **居中分段控件**：官方页签行**尺寸不变**、只 `opacity: 0` 隐藏，自绘灰轨道 + 白胶囊控件叠在卡片底部预留带上，48px 高、末尾保留「⋯」，点击按索引转发官方页签。
- **输入区合成一行** `[输入 ⊕ 回形针 发送]`：官方工具行自身收成 0 高（按钮仍在 DOM、`.click()` 可用），可见动作由自绘动作行承担（按钮 44px、图标 24px）；回形针菜单与权限菜单同款（36px 行、白面 14 圆角），以按钮为中心、两侧 ≥12px。
- **底栏脚注**：把手高度降到 18px，两侧显示实际权限与实际模型（只读，会话页限定）；权限图标直接从权限菜单克隆官方 SVG，完全访问整项标红。
- **弹层定位**：抬升改用 CSS `translate`（不改布局盒），修复「子菜单点了没反应/要很久」；目标高度读实测导航高度而非 `--dshm-v2-nav-total`（该变量在弹层打开瞬间可能读到 0），权限菜单 684..794、模型子菜单 700..790、输入卡 802..866，零重叠。
- **加号面板**：面板与遮罩都停在底栏上沿，底栏保持可见可点。
- **对话区**：居中日期分隔（`::before` 画在当天第一条消息上方，不插入节点）、工具调用 chip 胶囊化、代码块卡片、消息时间与操作行样式、深色正文 +1px。
- **设置页**：底栏与设置白面同底（无灰槽）、保留胶囊阴影。

### 修复

- **颜色裸值**：胶囊的描边与投影改为 `var(官方 token, 回退)`，不留 rgba 字面量。
- **官方 token 名不存在**：原实现拿 `--dsw-alias-bg-elevated` 当卡片面，该 token 在当前 DSH 运行时里未定义（实测），一直静默渲染成回退值；改为 `--dsw-alias-bg-layer-2`。
- **底栏高度契约**：`--dshm-v2-nav` 只表示导航行（56px），胶囊态多一行把手后，四处按它让位的硬编码开始错位；新增 `--dshm-v2-nav-total` 统一消费，默认值与旧行为一致。
- **根属性生命周期**：切走 v2 预设、切回原生、`clearAnchors()`、`dispose()` 都摘掉 `data-dshm-dock` 与 `data-dshm-dock-collapsed`，不再残留到其它预设（「三档双向不残留」）。
- **触控目标**：把手补 `min-height: var(--dshm-v2-dock-handle)`（默认 44px），与 `.dshm-bar-btn` 的 44px 约定同一口径。
- **ARIA 结构**：把手从 `role="tablist"` 里移出（tablist 只包五个导航键）；把手是 `<button>` 带 `aria-controls` / `aria-label`（收起时念「展开底栏」）/ `aria-expanded`，两条横杠 `aria-hidden="true"` 纯装饰；收起时焦点若落在被隐藏的导航键上会移到把手。

### 文档

- 新增 `docs/preset-v2-capsule.md`：胶囊样式的独立文档，含 11 张整机截图（会话 / 收起 / 加号面板 / 权限菜单 / 模型菜单 / 回形针菜单 / 对话区 / 插件页 / 通用设置 / 键盘态 / 深色）。

### 验证

- 门禁全绿：299 项 / 291 pass / 8 skipped；`check-tokens` / `check-contracts` / `check-compat` / `verify-package` / `check-hardcoded` / `check-colors` / `check-important` 全部通过。

---

## [0.4.10] - 2026-11-08

三预设稳定性与低耦合加固，继续兼容已验证的 DSH `0.2.1-rc.2`、`0.2.1-rc.5`、`0.2.2-rc.1`。

### 新增

- **可覆盖的 token 契约**：新增 size / color token 目录、参考 CSS 与文档；`--dshm-color-*` 将自有颜色提升为第三方可覆盖变量，颜色值保持原样。
- **兼容与漂移门禁**：登记官方 `data-*` 与 ARIA role 契约、11 项运行时特征及官方服务方法快照；新增 token、颜色、官方契约、兼容清单、服务漂移和 `!important` 检查。
- **异步服务绑定**：client half 同时导出 `{ inject, apply }` 形态；有 `ctx.inject` 时使用官方注入，无该 API 时通过 `ctx.get` 有界轮询，dispose 后停止。
- **稳定空会话标记**：结合官方 session `blank`、空态 hero 与官方瞬时卡片变体维护 `html[data-dshm-empty]`；classic 预设用该稳定信号显示空态虚线卡。
- **commandUi 候选元数据**：v2 加号面板通过官方候选目录获取本地化标签 / 描述 / 分组，仅增强已有 DOM action，不从服务候选单独创建可执行入口。

### 变更

- **颜色裸值清零**：CSS 使用点统一改为 `var(--dshm-color-*, fallback)`；裸颜色守卫统计为 0。
- **哈希类选择器清零**：composerStack / workspace trigger 改用自有 `data-dshm-*` 锚点；`[class*=]` 选择器为 0。
- **减少冗余 `!important`**：经 AVD 几何与计算样式对照，在自有节点上移除 75 条；设置弹窗盒模型与键盘态规则保留，并由增长守卫防止回涨。
- **特征探针粘性化**：DOM 契约延迟出现时，探针会在挂载后复检并保留已观察结果，避免把启动时序误报为宿主不兼容。

### 验证

- `npm run check` 全绿：**262 项测试**，包契约、几何硬编码、token 三方一致、颜色、官方契约、兼容清单及 `!important` 增长门禁均通过。
- `Medium_Phone_API_35` AVD 三预设与设置页矩阵通过；v2 五项导航、底栏、加号面板及 classic 空态规则完成运行态核验。

---

## [0.4.9] - 2026-11-07

加号面板（v2）时序缺陷修复（取证报告：`.workbuddy/plan/button-flow-audit-plan.md` §十）。四个问题、两处 P0，全部实机复现后修掉。

### 修复

- **（P0）点外关闭后立刻再点「+」，掉回官方原生菜单 → 图片 / 相机入口消失**。接管 effect 的两个抑制窗（关闭后 500ms、派发后 2000ms）是**全局时间戳**，与「谁关的」无关：用户主动连点被当成「官方重放同一浮层」静默丢弃，官方面板原样贴底弹出，而原生菜单的附件只有「文件」一项——这就是「图片键有时打不开 / 发不了图」的确切机制。新增 `addMenuUserIntentAt`：只记**真人** pointerdown（`isTrusted`，插件自己派的事件不算），意图时刻晚于关闭 / 派发时刻即视为新意图、照常接管。实测「关 → 80ms → 再点」从降级恢复为接管。
- **（P0）面板打开时底栏点击被静默吞掉**。`.dshm-v2-addpanel` 是固定 55% 高的整块矩形（z 1401），底部留白正好压在已经看不见的底栏上；容器 `pointer-events:auto` 时那块区域既不是遮罩（点了不关）也不是按钮（点了不切页），`elementFromPoint` 实测命中 `DIV.dshm-v2-addpanel-list`，完全无响应。改为容器穿透、只有 `-head` / `-tiles` / `-list` 吃事件，留白点击落到下层遮罩，等同于「点面板外 = 关闭」；`-list` 的 `flex: 1 1 auto` 同步改为 `0 1 auto`，内容不足时不再把空白撑到全高（内容超出仍自行滚动）。
- **（P1）切预设 / 切模式不清理自绘面板**。`setPreset` 走的是 `classic ⇄ v2`，`setMode` 首行 `if (next === state.mode) return` 直接返回，清理链根本不跑——面板会以「没有样式的裸列表」留在屏上并盖住底栏。`setPreset` 开头与 `setMode(MODE_DEFAULT)` 的清理清单各补一次 `closeV2AddMenu()`。
- **（P1）派发重试链没有取消令牌**。一次派发最长 45×60ms ≈ 2.7s 的「重开官方面板 → 找节点 → 点下去」轮询，期间切预设会让旧链继续按 key 找节点、还把官方面板重新点开一次。引入 `addMenuEpoch`：切预设 / 切模式递增，`dispatchAddOption` / `dispatchSubOption` 每跳自检，世代不符立即收摊。
- **（P2）结构没就绪时静默放弃**。接管时 `countSectionTitles(listbox)` 为 0 就 `return`，React 尚未画完或官方 DOM 一改，失败率就从「偶现」变「必现」，且没有任何痕迹。改为 8×50ms 短重试，仍读不到才 `console.warn` 并保留原生菜单（至少还有「文件」可用）。
- **（P0，复验中新发现）接管以 DOM 为准 + 心跳自愈**。接管 effect 原本依赖 React 状态 `popoverOpen`，而该状态只在主观察器收到 `childList` 变更时同步——官方复用同一个浮层节点、只改样式重开时收不到通知，状态会长期停在 `false`，effect 于是**再也不触发**，面板从此退回官方窄条菜单（这正是「用一阵子就失效、重进 App 才好」的机制，比 500ms 时间窗更致命）。改为 `tryTakeOverAddMenu()` 直接以 `[data-dshm-popover]` + 组标题为准，并加 200ms 心跳巡检（顺带双向修正 `popoverOpen`），状态脱节后 200ms 内自愈。
- 接管判定新增可读诊断：`window.__dshmCompat.addMenu` 记录最近一次的 `phase`（`took-over` / `suppressed` / `structure-miss` / `no-popover`）与三个时间戳差值，排障不必再改代码插日志。

### 变更

- 版本 0.4.8 → 0.4.9。行为不变的部分一律不动：数据仍来自官方节点（`readAddMenu`），条目点击仍派发官方 mousedown，命令语义 / 权限提示 / 上传链路完全沿用官方。
- 设置入口的 P2（槽位不可用时的降级）经核查无需改动：`chooseSettingsPath()` 已有 2500ms 宽限期 + legacy DOM 注入兜底，不存在「静默消失」。

### 验证

- `npm run check` 全绿：语法 → **227 项单测（0 失败，新增 5 项接管链契约）** → 包清单 / `VERSION` 一致性（0.4.9）→ 硬编码守卫（222 known / 0 new）。
- 手机 AVD（`Medium_Phone_API_35`，457×962 CSS 像素 / dpr 2.625）CDP 真实触摸回归 **17/17 PASS**：
  - A 组（抑制窗）：点外关闭后 **0 / 50 / 80 / 150 / 300 / 500ms** 再点「+」，六档全部仍由插件面板接管（`data-dshm-v2-addmenu` 在、官方 popover `opacity:0`），S2 的 80ms 复现路径不再降级；
  - B 组（点击黑洞）：面板底部留白与底栏（y=934）位置 `elementFromPoint` 均命中 `dshm-v2-addpanel-mask`，点击即关闭面板；面板上部空白同样命中遮罩；
  - C 组（状态脱节）：脚本 `click()` 关闭（不产生用户意图）后立刻点「+」，心跳在 200ms 内修回状态并接管；
  - D 组（功能）：附件三块（图片 / 相机 / 文件）齐全、分组二级页进出、Esc 关闭、列表溢出时可滚动（注入 20 行假数据：`scrollHeight 1178 > clientHeight 393`，`scrollTop` 生效）；
  - E 组（压测）：随机间隔 30–250ms 连点 12 轮，12/12 全部接管。
- 派发链路抽验：文件块 → `documentsui/PickActivity`（面板关闭、隐身标记撤净）；图片块 → `media/PhotoPickerActivity`。
- 预设侧回归：v2 → classic → v2 往返（`localStorage` + reload）后面板零残留、⊕ 在位、仍能接管；classic 六键底栏与「更多」官方面板开合正常；v2 五个导航项 `aria-current` 迁移与 S 组扫描结果不变。
- **Redmi K70 真机**（23113RKC6C / Android 15 / 1440×3200 @ 560dpi → CSS 411px / `preset=v2`，覆盖安装保留数据，插件文件经 App 内终端替换后 md5 与仓库一致）：UI Automator 真实触摸回归 **13/13 PASS** × 两轮——
  - A 组（抑制窗 / P0-1）：点外关闭后 0 / 50 / 80 / 150 / 300 / 500ms 再点「+」，六档全部仍由插件面板接管；
  - B 组（点击黑洞 / P0-2）：面板打开时点底栏位置，遮罩即关、底栏本身可导航（会话页出现）；
  - D 组（功能）：附件三块齐全、「添加」二级页进出正常；
  - E 组（压测）：随机间隔连点 12 轮，12/12 接管；
  - 附加抽验：文件块 → `PickActivity`、图片块 → `PhotoPickerActivity`；五个底栏导航项全部可切；DSH 设置 → 通用设置内三预设单选可用；v2 ⇄ classic 往返后布局正常。


## [0.4.8] - 2026-11-07

0.2.2-rc.1 第二轮适配修复（审计报告：`.workbuddy/plan/audit-022rc1-fix-plan.md`）+ 平板宽屏侧栏手势。

### 修复

- **悬浮 / 融合预设点「设置」打不开**。`openSettings()` 重试梯子在「展开抽屉」一组之后就放弃，永远不会补点账号菜单，而抽屉关闭时账号菜单按钮在 inert 容器里点击无效、旧「更多操作」入口在 0.2.2-rc.1 已不存在。入口链重排为「关着先开抽屉 → 点账号菜单 → 更多操作兜底 → 收口补刀」，实测设置页 1s 内打开（旧版永不）。
- **设置页内容贴边且整页不可滚**（三预设通用）。0.2.2-rc.1 经 `SlotOutlet` 给官方 options 内层包装渲染内联 `display:contents`（无盒），「最高子元素 = 滚动容器」启发式把滚动标打在空元素上：插件内边距落空（贴边）、真滚动容器被强制 `overflow:hidden`（内容 1215px > 视口 711px，下半页够不着）。`tagSettingsContent()` 现在跳过 `display:contents` 子元素、对旧标去重，全部无实体时把 content 本体当滚动区；content 的清边距 / 锁溢出规则改为 `:not([data-dshm-settings-scroll])` 让位。实测三预设内容区留白 16px 且可滚到底。
- **原生预设左缘右滑不开抽屉**。`bindDrawerGesture` 的 `mode !== MODE_MOBILE` 门禁把原生预设（`mode` 恒 `default`）整个排除。新判据 `gestureEligible()` = mobile 模式或手机竖屏几何；实测原生预设右滑开、左滑收均正常。同门禁的 `applyDrawerDecision` 复核一并放宽。
- **统计状态带没有移到顶部、「更多」弹层悬空**。官方 0.2.2-rc.1 给 `composerSeat` 写了 `will-change:transform`，使其成为 fixed 后代的包含块，插件固定定位的统计带与弹层全部锚到 seat（统计带停在底部 y=903、弹层与底栏间空 202px）。新增 `html[data-dshm-form="phone"] [class*="composerSeat"] { will-change: auto !important; }`，实测统计带回顶部、弹层贴回底栏上沿。
- **「更多」偶发点了没反应**。官方 ⊕ 按钮随页面切换重挂时（工作台返回后 composer 短暂缺位），`openOfficialAddMenu()` 找不到按钮即静默放弃。现在 160ms × 5 次有限重试，仍失败才告警；后一次点击会取消前一次的待重试链，避免链间互斥打架。
- **设置页顶部多出两行杂项**（三预设通用）：品牌行下悬着一条被裁切的「设置」标题行、页签行与内容区之间插着一条静态「打开配置文件 / ✕」工具行。0.2.2-rc.1 把两者都从 `nav` / `content` 内部挪成了面板直接子元素，旧打标循环够不着。`tagSettings()` 现在在面板层补扫：无交互元素的短文本节点打 `title` 标隐藏，带关闭按钮的行打 `head` 标叠到品牌行右侧；内容区上移约 85px。顺带 `data-dshm-settings-close` 在三预设都能正向打标，返回箭头 / 系统返回关页不再依赖兜底查找。
- **悬浮预设「自动化任务」键无作用**。0.2.2-rc.1 的 `data-slot="sidebar"` 列是抽屉**遮罩**（drawerMask），按钮所在的内容列（sidebarCol）是它的兄弟节点——`automationEntry()` 在遮罩里搜按钮永远搜不到，静默失效。改为全文档按 aria-label 搜索（排除插件自己的底栏键防递归），并顺手在点击前后解除 / 恢复抽屉列 inert 作保险。
- **悬浮预设点「设置」会先滑出抽屉再开设置**。0.2.2-rc.1 抽屉收起时官方给内容列置 inert，账号菜单的弹层类点击无效，旧链只能先 `requestDrawer(true)` 再点。现在改为**临时解除抽屉列 inert → 点账号菜单 → 恢复**：全程抽屉保持收起、无闪动（实测设置页 ~350ms 打开，inert 在 ~700ms 恢复）；「展开抽屉」降级为老宿主的最后一组兜底。恢复函数提到闭包级共享——重试链跨多次 `openSettings()` 调用，局部变量会让组 0 的解锁记录随调用返回丢失、抽屉永不恢复。
- **悬浮预设「工作台」从面板页切换时固定 140ms 人为延迟**。改为轮询面板卸载（40ms 步进、上限 360ms），React 一两帧内卸载完成即立刻开右栏，实测能省约 100ms。另实测插件 / 工作台面板的本体打开耗时 140~720ms（首次含官方异步数据加载），控制链路本身无附加延迟。

### 变更

- **平板宽屏（wide 形态）启用侧栏滑动开合手势**。宽屏原生页没有抽屉语义：侧栏是常驻列、收起后变窄条 rail，新增纯函数 `decideWideSidebarSwipe()` 走阈值触发（无跟手——收起会推动整个主内容列，跟手必抖），动画交给官方过渡。手势语义与手机抽屉对齐，**起手区统一为视口左半边**：展开态左半边任意位置左滑收起、收起态左半边任意位置右滑展开（窄条只有 ~64px，把起手限制在侧栏列 / 窄条上不符合实际操作手法）；展开态右滑 / 收起态左滑 / 右半边起手一律让路。`gestureEligible()` 放宽到宽屏（仅 android / web 宿主，桌面鼠标拖拽不启用），手机分支（抽屉跟手 / 设置页退出 / 工作台退出）在宽屏不参与，宽屏设置页（官方两列弹窗）也无左滑退出语义。**官方模态弹窗在屏时手势整轮放弃**（`data-shortcut-modal` / `role=dialog[aria-modal]` 拦截，不隔着弹窗开关被遮住的侧栏）。平板三预设实测均为原生页（`data-dshm-mode` 不写、无插件底栏 / v2 导航），手势十项用例（左半边多点开 / 收 / 双向反例 / 右半边反例 / 弹窗拦截与恢复 / 复测）全部通过。开发中发现并修复判定结果误用真值判断的问题：`'none'` 是非空字符串、恒为真，导致任何被拒绝的滑动都被当成「收起」执行——表现为「只能滑关、不能滑开」。
- 诊断对象 `window.__dshmCompat` 新增 `settingsPathNote`：`'awaiting-slot'` 表示 slot 可用但设置页尚未打开过（slot 懒挂载，冷启动宽限期后报 legacy 属正常路径），与引擎真降级区分。
- 版本锁单测改为「`VERSION` 与 `package.json` 一致」的动态断言，不再写死具体版本号（每次 bump 都要改测试）。

### 验证

- `npm run check` 全绿：语法检查 → **222 项单测（0 失败）** → 包清单 / bundle 契约（含 `VERSION` 0.4.8 一致性）→ 硬编码守卫。新增 `decideWideSidebarSwipe()` 的 6 项判定用例（左半边两方向、右半边反例、反方向、竖滑 / 阈值 / 让路、非法输入）。
- 平板 AVD（`Pixel_Tablet_API_35`，1280×752）CDP 真实触摸十项用例全部通过：左半边多点开 / 收、右半边反例、边界 `startX=640`、伪模态弹窗拦截与移除恢复、双向反例与复测；三预设逐一确认宽屏均为官方原生页。手机 AVD（`Medium_Phone_API_35`）部署同版回归正常。
- 平板 AVD 配置由 4 核 / 2GB / 堆 192MB 提到 8 核 / 4GB / 堆 336MB 后冷启动复测：掉帧率 81.8% → 26.4%、p95 帧耗时 150ms → 46ms，确认此前的卡顿是 CPU / 内存配额而非 GPU。

### 文档

- `README.md` / `README.en.md` 同步到 0.4.8：标题与定位补平板形态、新增「平板宽屏侧栏手势」能力条目、修正原生预设设置页的过时描述（0.4.7 起为全屏而非悬浮窗）、版本适配矩阵加 0.4.8 行并把反向速查改为 ≥ 0.4.8、单测数 216 → 222、新增「0.4.8 变更要点」。
- `docs/technical-notes.md` §3.15 取证表补 `v0.4.8` 行；新增 §3.16 记录宽屏手势的形态前提、判据表、弹窗拦截边界、`'none'` 真值陷阱与多设备 CDP 端口乌龙。
- `docs/preset-default.md` 的设置页截图说明同步到重拍后的全屏实拍（移除「图为历史悬浮窗」注记），`docs/assets/screens/preset-default/settings.png` 已替换为 0.2.2-rc.1 上的当前形态（P2 修复后、无头部杂行）。

### 已知限制

- 抽屉展开时按系统返回键不会收起抽屉，属手机形态返回栈专项（需 Android 壳配合），不在本次范围。
- 引擎启动期底栏约 2 秒挂载延迟属 WebView 启动链路本身，插件侧无解；真机（Redmi K70）上不明显。

## [0.4.7] - 2026-11-07

### 适配

- **兼容 DSH 引擎 `@deepseek-ai/dsh-client-ui-layout 0.2.2-rc.1`**（Android App 1.5.0 / BUILD `2026.11.06-4566c0be`）。`package.json` 的 `dsh.compatibility.dshReleases` 登记该版本，并新增 `capabilities` 声明（slots / services / `dialogContract`）。
- **配置入口优先走官方 slot**：布局模式选择器注册到 `settings.general.item`（`id: 'dshm-layout'`、`order: 10.5`），落在官方「外观」与「字号大小」之间；旧版 DOM 注入保留为 `legacy` 降级路径。
- **设置弹窗按官方稳定契约正向识别**：`[data-shortcut-modal="settings"]` 是真设置页，`sidebar` / `shortcut-edit` 一律排除；不再用 `role=dialog + nav + 文案` 启发式，避免把 0.2.2-rc.1 的独立抽屉 dialog 误标成设置页。缓存复用前经 `stillMatchesSettings()` 复查，误标由 `pruneSettingsTags()` 自愈。
- **锚点优先 `data-slot`**：`sidebar` / `main` 先按官方 slot 属性定位，位置推断只作兜底。
- **`data-dshm-form` 首帧无条件写入**：宽屏从启动即为 `wide`（此前属性根本不存在），修复所有依赖该属性的 CSS 判据。
- **能力探测与三态降级**：只读诊断对象 `window.__dshmCompat` + `native` / `legacy` / `safe` 三态；未知引擎自动降级，探测失败只 `console.warn`、绝不影响启动。回滚开关：`localStorage['dshm-compat'] = 'legacy' | 'safe'`、`localStorage['dshm-settings-slot'] = 'off'`。

### 修复

- **原生预设设置页严重布局异常**（0.2.2-rc.1 上实测：浮动小窗 + 大片灰色遮罩 + 标题/页签右端裁切 + 内容底部截断）。根因是 0.4.6 给原生预设单独做的「悬浮窗重排」CSS（12/24px 边距）与 `hardenSettings()` 内联 `!important` 几何，官方换变体后把面板钉死。**三个预设统一为手机全屏设置页**（全屏 CSS 作用域从 `data-dshm-mode="mobile"` 改为 `data-dshm-form="phone"`），品牌行与返回键在原生预设下也保留；旧悬浮窗实现保留在源码里，把 `SETTINGS_UNIFIED_FULLSCREEN` 置 `false` 可一键回滚。
- **设置页关不掉**（返回箭头 / 系统返回 / Esc / 左滑手势四条路径同时失效）。0.2.2-rc.1 把「打开配置文件 / ✕」工具行移出了内容区，旧 `tagSettings()` 只在 `content.children` 里找工具行，于是 `data-dshm-settings-close` 永不打标。`closeSettingsImmediate()` 增加按 `[data-shortcut-modal="settings"]` 正向查找官方关闭按钮的兜底。

### 验证

- `npm run check` 全绿：语法检查 → 216 项单测（0 失败）→ 包清单 / bundle 契约 → 硬编码守卫。新增 `test/compat-contract.test.js` 覆盖弹窗分类、缓存复查、slot 路径选择、能力归一化与源码契约。
- 两台 AVD（手机 `Medium_Phone_API_35` / 平板 `Pixel_Tablet_API_35`，App 1.5.0）CDP + 截图验收：三预设冷启动与设置页内热切换、设置页几何（全屏 `0,0` 覆盖视口；悬浮预设底部按设计留 56px 导航）、五个页签逐页可达、返回箭头与系统返回键、侧边栏抽屉、附件入口向上弹出、深浅主题、中英语言往返、slot 路径与抽屉误标计数全部通过；平板宽屏保持官方两列弹窗，不受手机全屏规则影响。

### 文档

- 发版后补充**版本适配矩阵**：`README.md` / `README.en.md` 各新增「插件版本 → 适配的 DSH 版本」与「DSH 版本 → 建议插件版本」两张表；`docs/technical-notes.md` §3.15 记录逐标签取证（`engines.dsh` / `dshReleases` / `capabilities`）与「能装上 ≠ 已适配」的口径差异。仅文档变更，不涉及 0.4.7 产物代码；npm 包内 README 为发布时快照。

### 已知限制

- 抽屉展开时按系统返回键不会收起抽屉（WebView 历史与官方抽屉状态分离），属 `back-stack-mobile-plan.md` 的手机形态返回栈专项，需 Android 壳侧配合，不在本次改动范围。

## [0.4.6] - 2026-11-06

### 新增

- **原生预设的输入行「附件」快捷入口**：官方 composer 工具行左侧多一枚**回形针按钮**（位置在官方 ⊕ 与权限 chip 之后、模型 chip 之前），点开就会在按钮**上方就近弹出**两项菜单——「选择图片」/「选择文件」，选完仍由官方完成校验、上传与缩略图。
  - 落点是官方给第三方插件留的 list slot `conversation.input.left`（声明 `kind:list` / `scope:session`，`replaceRisk: none`），**不往 `div.tools` 插 DOM**，因此不与 React 协调打架。
  - 复用既有「自建 input → `injectOfficialFiles` → 官方 `intakeFiles`」链路（与底部六键同一套），上传、大小/数量校验、错误 toast 全部归官方，插件不重复提示。
  - 菜单关闭有三条途径：再点一次按钮、点菜单以外任何位置、按 Esc；展开前先 `blur()` 输入框，避免菜单与软键盘同屏。
  - 生效范围：**App 内（Android 壳）一律显示**——手机 / 平板、横竖屏、全屏 / 小窗都不再区分；桌面宿主在**注册这一层**就跳过（不是「注册后返回 null」），避免 list slot 留下空容器破坏「原生零侵入」；`web` 浏览器仍按手机竖屏几何兜，桌面浏览器不多出按钮。
- 新增 `ICONS.attach`（回形针线性图标，与底部六键同一套 1.7 描边）。
- 新增纯函数 `quickPickVisible(preset, host, phone)` 并导出到 `__test`；`test/quick-pick.test.js` 覆盖 10 例（预设 × 宿主 × 形态、`isPhoneForm` 的桌面优先 / 平板全屏边界）。

### 修复

- **平板（横屏 / 全屏）看不到附件入口**。两个根因叠加：① 可见性判据原本只看 `state.phone`，而它是 `isPhoneForm()` 的结论——要求**竖屏 + 短边 ≤ 600 + 长宽比 ≥ 1.25**，平板全屏 1280×752 横屏、短边 752，两条都不满足，slot 注册成功但组件直接返回 `null`；② 样式作用域原本写成 `html[data-dshm-form="phone"]…`，而 `applyFormAttr()` 只在 `state.phone` **发生变化**时才写属性——平板从启动起就是 `false`、从未变化，属性压根不存在，即使渲染出来也拿不到任何样式。现在作用域只认 `data-dshm-preset="default"`，与 DOM 存在与否解耦，并用 `.dshm-quick.dshm-quick` 把特异性抬回原水位。
- 按钮尺寸上限从 `30px` 收到 `28px`，与官方 ⊕ 完全一致（平板 1280 宽时 `7vw` 早已顶到上限）。

### 变更

- 底部六键的「文件 / 图片」回流逻辑抽成模块级 `onPickedFiles()`，与新的附件入口共用一处 `value` 清空与上报逻辑（行为不变，仍先收浮层再交给官方）。

### 兼容

- 融合 / 悬浮预设零改动（它们各自已有底部六键 / 加号面板入口）；桌面端保持官方原样，DOM 里不新增任何节点。
- 插件的默认预设仍为「融合」，原生预设的附件入口只在用户切到原生后出现。

## [0.4.5] - 2026-11-06

### 修复

- **手机形态按系统返回键直接退出到桌面，而不是回上一级**。三层根因：① 宿主 `layout.selectPanel()` 只改 `panelInfo.activePanelId`、不写浏览器历史，插件页 / 自动化任务 / SSH 工作区这类整页界面在 WebView 历史里完全没有痕迹；② Android 壳 `onBackPressed()` 是 `canGoBack() ? goBack() : finish()`，没有条目就直接结束 Activity；③ 插件这边只有「浮层可见 ⇒ 压一条 history」的单布尔模型，`panelActive` 根本没纳入。改为**三层返回栈**（base / page / overlay）：页面层只认宿主通用字段 `panelInfo.activePanelId`（不枚举具体 id，其它插件经 `main` keyed slot 注册的页面同样命中），关闭走通用的 `layout.selectPanel(null)`；浮层层沿用原有逐层顺序。一次返回只退一层，栈顶永远是浮层。
- **面板页 + 设置页叠加时第二次返回仍然退出**。旧模型把页面态和浮层挤在同一个布尔里，第一次收浮层、第二次没有条目可退。三层栈给页面态单独一条，`S5`（面板 + 设置连按两次）现在逐层退干净。
- **内部返回会「重新加载一下」**。根因是壳无条件相信 `canGoBack()`：WebView 历史里混着跨文档条目时，`goBack()` 退到上一份文档就是整页重载。插件改为按「自己压了几条同文档条目」经 `DshAndroidBack.setState({mobile, consumable, depth})` 上报，壳只在 `mobile && consumable && canGoBack()` 时才 `goBack()`；条目 state 带 `dshm` 标记，无标记条目一律不猜测着关 UI。
- **会话页按返回直接退出、没有防误触**。壳侧改为「首次轻提示 + 2 秒内再按才退出」，提示走新增 `R.string.back_exit_hint`（五语言同步）。
- **按返回键关不掉工作台（右侧边栏）**。Android 窄屏下右栏是官方自己的**浮层**形态：`[data-sidebar-right-panel]` 挂上 `data-sidebar-right-open` 后是 `position:fixed; inset:0`，而 `layout.closeRightbar()` 只把列折叠成 0 宽，浮层标记没撤销 → 面板继续全屏盖住会话页；同时 `[data-rightbar-fullscreen]` 已经消失，返回栈随之归零，用户再按返回只能退出 App。改为优先点官方「收起右侧边栏」（按 `aria-label` 词根在右栏子树里找，避开「退出全屏」「分栏」），点不到才退回 `closeRightbar()`；返回目标的右栏判据补上窄屏浮层标记，覆盖两个状态短暂不同步的中间态。
- **会话视图页签过早收进「⋯ 更多会话视图」**。官方 `ConversationSessionHeader` 用 `visibleViewLimit = max(1, floor((row.clientWidth - 48) / 120))` 决定几个视图能直接露出标题，120px/个 的口径与实测页签间距（58px）差一倍多：手机 CSS 宽 392 时只算出 2 个，「编辑器」（由 `@xiaopb/dsh-solution-explorer` 经 `conversation.view` 槽提供）明明放得下也被折叠。公式只读 `row.clientWidth`，插件改不动它，改为给页签行打 `data-dshm-viewtabs-row` 并补一段不可见横向余量（`--dshm-viewtabs-extra`，默认 360px），名额随之从 2 升到 5；内容仍左对齐、行尾多出来的是空白，溢出的那截由中心列 `overflow-x: clip` 吃掉，实测 `scrollWidth === innerWidth` 无横向滚动。

### 新增

- **开放返回契约 `window.__dshmBack`**：任何插件都能 `register({ id, priority, kind, isActive, close })`，按返回时按优先级逆序询问，第一个 `close()` 返回 `true` 的独占本次返回 —— 对齐 Android `OnBackPressedDispatcher` 的「按注册逆序、谁使能谁消费」模型。其它插件新增的浮层、portal 型全屏界面、页内二级页因此都能自己接管返回，本插件不需要认识它们的 id。
- **通用浮层发现**：`[role="dialog"][aria-modal="true"]` / `[role="alertdialog"]` / `[data-dshm-back-layer]` 也会压一条 overlay 条目（用尺寸、`visibility`、`data-dshm-ignore-back` 三重过滤）。没有注册者时尝试「找关闭按钮 / 派发 Esc」，收不掉也会回会话页，**不会直接退出应用**。
- 底栏页面高亮新增 `unknown-page` 兜底：其它插件注册的 `main` 面板不再被误判成「会话页」（只影响高亮，不参与返回栈决策）。
- 新增 `planBackStack` / `nextBackTarget` 两个纯函数并导出到 `__test`，`test/back-stack.test.js` 覆盖 34 例（压栈顺序、退栈顺序、幂等、关闭闸门、离开形态清栈、逐层优先级、哨兵兜底）。
- **旧 APK 兜底（栈底哨兵）**：没有 `DshAndroidBack` 桥的旧版 App 只有 `canGoBack() ? goBack() : finish()` 一条判断，插件若不给栈底留条目，会话页按返回就会被直接 `finish()`。检测到桥缺失（且宿主是 Android 壳）时，base 层改为压一条**真实条目**并配合自绘「再按一次退出」提示 + 2 秒窗口：提示期间故意不压回，`canGoBack()` 保持 `false`，用户再按一次就落到旧壳原有的 `finish()` 上；超过 2 秒则重压哨兵，恢复「可回退」状态。哨兵不计入 `depth` / `consumable`，换到带桥的新壳或离开手机形态时会自动退回。

### 兼容

- **旧壳（无 `DshAndroidBack` 桥）**：三层栈照常维护，页面 / 浮层逐层退可用；另经栈底哨兵 + 自绘提示实现「再按一次退出」（提示样式不同于新壳的原生 Toast，时序一致）。无需升级 App 即可获得防误退。
- **桌面形态（`MODE_DEFAULT`）零改动**：不压条目、不上报、不碰 history。非 Android 宿主（纯浏览器 / 桌面）也绝不启用哨兵，不污染浏览器返回键。
- **一键回滚**：`localStorage['dshm-back-stack'] = 'off'` 退回 v0.4.4 行为（只维护浮层一条 + 上报 `mobile=false` 让壳走原逻辑），不需要降级版本。

### 配套（Android 壳，独立 PR）

- `MainActivity` 新增 `DshAndroidBack` 桥、`onBackPressed()` 三段逻辑、WebView 重建时重置返回状态、`back_exit_hint` 五语言；debug 包顺带开启 WebView 远程调试（`chrome://inspect`）。

## [0.4.4] - 2026-11-01

### 修复

- **窄窗口（悬浮小窗 / 分屏）首次打开设置页不被接管**。官方设置弹窗是桌面两列版式（导航固定 188px），视口 ~327px 时内容列只剩 ~91px，写死的宽度下限 120px 永远不成立。改为按弹窗宽度归一：宽屏仍 120px，窄屏放宽到 `min(120, max(48, 弹窗宽 × 0.25))`。内容判定同时扣掉工具行（新增 `contentPayload`：跳过含关闭按钮的头部子块再统计文本 / 节点），切预设 / 会话恢复留下的空壳弹窗不再被误判为「有内容」。
- **设置页一次横滑直接跳到最后一个 / 第一个页签**。两处根因：① 页签行原生 `overflow-x: auto + scroll-snap` 带惯性，一次快速横滑被甩到最右 / 最左——改为 `overflow-x: hidden`，页签滚动由 `centerSettingsTab` 跟随激活项完成；② 插件可能被宿主实例化多次（热重载 / 重复 entry），每份实例都在 document 上收到同一个 touchend，一次横滑连换多页——touchend 用事件对象打标（`__dshmTabSwipeHandled`）去重，并新增跨模块单实例守卫（`window.__dshmLayoutDispose`）：apply 时先真正 dispose 上一个实例，手势监听不再叠加。页签行同时纳入换页手势（返回键除外）。
- **命令结果卡片（bash / pwsh）窄屏上命令列被压到 ~20px、逐字换行没法读**。卡片 header 改三列网格：第 1 行 = 目录（左，过长省略）+ 退出码胶囊 + 复制，第 2 行 = 命令整宽一行不折行（超宽行内横滚），第 3 行起 = 多行命令的后续行各占一整行；状态点按新基准重新对齐。只依赖官方结构与 data 属性，不碰 CSS Modules 哈希类名。
- **新增命令「自动换行」开关**：插件自建浮层按钮（不进 React 的卡片 DOM，避免被协调流程冲掉），用官方复制键的 rect 定位到首行右侧，滚动 / resize / DOM 变更时重算、卡片滚出视口即隐藏；图标复用官方 `IconWrapFillRegular` / `IconNowrapFillRegular`（React 元素树序列化成 SVG，官方换图标自动跟随）；偏好存 `localStorage`（`dshm-terminal-wrap`）。打开后命令按容器宽度折行。
- **底部导航整体偏上、条底留一条空带**（DSH Mobile 宿主真机）：宿主 WebView 底边已经抬到手势条上方（让出 ~18 CSS px 导航条），页面里再叠一遍 `env(safe-area-inset-bottom)` 就是双份。`--dshm-safe-bottom` 置 0（普通移动浏览器该值一般为 0，行为不变）。

### 新增

- `package.json` 增加 `dsh.compatibility.dshReleases`：逐版本声明对 DSH 内核的兼容性，目前 `0.2.1-rc.2` 与 `0.2.1-rc.5` 标为 `compatible`（两者均实测可用）。取值沿用生态惯例 `compatible` / `incompatible` / `unknown`，未列出的版本视为 `unknown`。
  - 说明：内核 `evaluatePluginCompatibility()`（`@deepseek-ai/dsh-app-boot`）只读 `engines.dsh` 与 `peerDependencies`，**不读这个字段**，所以它不影响安装判定，是给插件市场 / 商店索引看的声明。`dsh.compatibility.dsh` 与 `engines.dsh` 保持一致（`>=0.2.1-rc.2`）。

## [0.4.3] - 2026-11-01

### 调试

- 新增诊断探针 `probeIme`：在**键盘开合**与**抽屉 / 底部表收起**这几个低频时刻，往控制台打一行 JSON（`clientHeight` / `visualViewport` 的 `height`+`scale`+`offsetTop` / `data-dshm-ime` 标记 / 输入卡上下边 / `activeElement` / 当前预设）。app 侧 `onConsoleMessage` 会把 WARNING 写进 logcat，用来分辨「键盘没让位（app / OEM 侧 insets）」和「输入卡定位算错（插件侧）」——vivo X300 与 Redmi K70 表现不一致，靠这条日志定位。

## [0.4.2] - 2026-11-01

### 修复

- **收起侧边栏会自动唤起输入法，输入框还被键盘挡住**（真机：正常手机 + 悬浮预设）。抽屉关闭时把焦点「还给打开前的元素」，而打开抽屉前焦点就在输入框里：`textarea.focus()` 在 Android 上会无条件拉起软键盘，于是「手动收键盘 → 开抽屉 → 收抽屉」变成键盘自己弹回来；这一路是脚本聚焦，WebView 拿不到对应的键盘让位，输入卡就被压在键盘下面。
  - 文本录入控件（`input` / `textarea` / `select` / `contenteditable`）**不再归还焦点**，新增纯函数 `isTextEntry`；底部表的焦点归还走同一条规矩。
  - 新增 400ms 的「焦点回弹」护栏 `guardComposerFocusAfterOverlay`：浮层收起后短时间内任何落进文本控件的焦点都被 blur 掉（挡住官方自己的 refocus，比如切换会话后的补焦），一旦出现真实触摸立刻撤窗——用户点输入框照常弹键盘。

### 测试

- 新增 `test/focus-return.test.js`（4 条）：`isTextEntry` 的控件判定、护栏 blur 行为、`pointerdown` 撤窗、非文本控件不受影响。

## [0.4.1] - 2026-11-01

### 修复

- **键盘判定被页面缩放误触发**（真机：平板小窗 + 悬浮预设，底部导航栏整条消失）。`visualViewport.height` 会随页面缩放等比变化，150% 缩放下 826dp 窗口量出来是 551（差 275 ≥ 120 阈值）→ 被当成键盘弹出 → `data-dshm-ime` 生效、导航 `opacity: 0`。改为统一换算成「布局 px」（`clientHeight × scale`）再比，对缩放免疫。新增 `layoutHeightPx` / `isKeyboardOpen` 两个纯函数与 6 条回归用例。
- **顶部状态带（轮次/Token/缓存命中/上下文）掉回输入区下方**。定位链原先依赖「tok 按钮 + 上下文按钮」的 aria-label 配对，两处宿主变化都会让它失配：① 官方是 `activity ? null : <ContextMeter/>`，智能体执行期间上下文环整块不渲染；② 新宿主顶栏多了「对话 / 轨迹 / 上下文」切换条，`/上下文/` 先命中页签，公共祖先一路爬到中心列后判定 `dock === root` 直接清标。改为**优先认官方结构锚点 `[data-composer-dock]`**（运行中与空闲都在），aria 配对降为老宿主退路。
- 兜底「轮次统计行」的文本长度上限由 40 放宽到 80：官方补上「缓存命中 95%」后中文整行 41 字符，正好被旧上限拒掉。
- 状态带高度在打标后改量子项（原先量自身，而上一次写入的固定高度会自指），执行中上下文环消失时能缩回去。
- **键盘弹起后输入框与键盘之间多一条白带**（真机：正常手机 + 悬浮预设）。导航只做了 `opacity: 0`，官方 `shell.bottom` 这一行（grid 第二行，尺寸 `auto`）仍被导航自身 56px 撑着，输入卡就被顶到离键盘一整条导航远的位置。改为键盘态把该行 `height: 0`、卡片下沿那 8px「阴影净空」一并归零（阴影落在键盘上看不见，留着只是一条白缝），设置页弹窗底边同步落到键盘上沿。

### 测试

- 新增 `test/ime.test.js`（6 条）、`test/stats-bar.test.js`（7 条）。
- 新增 `test/stats-bar-dom.test.js`（5 条，jsdom 骨架驱动 `syncStatsBar`）：空闲 / 执行中 / 顶栏有「上下文」页签 / 空会话 / 41 字符纯文本行；未安装 jsdom 时自动 skip（`NODE_PATH=<含 jsdom 的 node_modules> npm test` 可跑）。

## [0.4.0] - 2026-11-01

### 新增

- **三套布局预设体系稳定化**（原生 / 融合 / 悬浮）：设置页「布局模式」三选一（各带迷你线框缩略图，`currentColor` 适配深浅主题）；卡片一行三列、官方配色实时跟随（切主题自动重跑）。
- **插件自带配置页兼容**：dsh-pet 桌宠配置、dshmarket 插件市场实测通过；设置内容块按几何 + 内容量判定，不再强依赖表单控件。
- **原生设置悬浮窗**：`settingsFrameMetrics` 纯函数计算几何；左右等宽居中（`--dshm-settings-gutter` + `margin: 0 auto`）、上下各留约 10vh（`clamp(vpad-min 24px, 10vh, vpad-max 120px)` 双向钳制）；从其它预设切原生时设置页保持打开。
- **布局模式文案 i18n**：新增 `syncLayoutPickerTexts`，语言切换后标题 / 副标题 / aria-label 实时刷新（Native / Merged / Floating），无需重启。
- **布局几何硬编码守卫**：`scripts/check-hardcoded.mjs` 扫描注入 CSS 中「布局属性 + 纯 px」，`var()/clamp()/env()/%` 自适应表达式自动放行、`HARDCODE-OK:` 注释豁免；与 baseline 比对，**新增违规即 CI 失败**，存量 221 处渐进收紧。已接入 `npm run check` 与 CI。

### 修复

- 融合空态虚线输入卡左边贴屏、右侧多 7px（官方滚动容器 `scrollbar-gutter: stable` 经典滚动条沟槽 + 窄宽度）：滚动容器收敛改为手机布局全预设打标，空态卡恢复对称 gutter 与圆角。
- 悬浮空态输入卡虚线描边与卡片圆角不一致（虚线画在官方 `::after` 伪元素上）：伪元素 `border-radius` 跟随 `--dshm-v2-radius`。
- 预设切换临界态加固：宿主「禁用插件不 dispose / 启用不重新 apply」导致的多实例撕裂（卡片失效、底栏残留）——新增 `activeDispose` 单实例守卫；`setPreset` 显式 `syncSettingsPanel`；`clearSettingsPanel` 还原官方内联样式（含 `max-width`）。
- 设置页切页签闪烁；Agent 预设被官方贴边悬浮窗接管。
- 从其它模式切原生时设置页被 `history.back()` 直接关闭：仅在设置页 / 官方弹窗不存活时才消费历史条目。

### 文档

- README（中 / 英）同步至 0.4.0；新增三预设独立展示文档：[原生](docs/preset-default.md) / [融合](docs/preset-classic.md) / [悬浮](docs/preset-v2.md)（内嵌 HTML 表格排版，v0.4.0 整机实拍截图）。
- 架构文档补充预设体系、设置接管与质量边界；技术说明补充自适应变量表、真机取证经验与守卫脚本用法。

## [0.3.0] - 2026-10-31

### 新增

- 悬浮布局（v2）壳层：悬浮输入卡 + 五项导航（会话 / 自动化任务 / 插件 / 工作台 / 设置），DSH 官方图标与蓝色高亮。
- 三层解耦：宿主 host → 手机形态 phone → 外观预设 preset（default / classic / v2）；`data-dshm-form` / `data-dshm-preset` 根属性。
- 设置页「布局模式」三选一注入；三档改名为原生 / 融合 / 悬浮并挪到外观下面。
- 工作台走 `ctx.sidebarRight` 打开官方右侧面板，横滑退出；会话键「回首页」语义。
- 加号面板改自绘「一级菜单 + 二级列表」，附件拆图片 / 相机 / 文件。
- 引擎状态条让位变量 `--dshm-engine-bar`（默认 56px）。

### 变更

- 底栏透明、输入卡下沿贴导航上沿；覆盖式抽屉（会话抽屉固定 55%）。

### 追加（胶囊形态实装）

- **顶部**：悬浮卡片头（标题行 / 居中分段控件 / 统计带三段独立）、按键内缩与标题贴合、分段控件末尾保留「⋯」；
- **输入区**：合成一行 `[输入 ⊕ 回形针 发送]`，动作按钮 44px、图标 24px；回形针只弹「图片 / 文件」两项；
- **底栏**：把手行降到 18px，两侧显示实际权限与实际模型（只读）；权限图标从权限菜单克隆，完全访问时整项标红；
- **弹层**：抬到底栏与输入卡之上，高度封顶 `min(58vh, 22em)`；
- **对话区**：代码块卡片化、深色正文 +1px。

### 追加 2（弹层与细节收口）

- 弹层抬升改为 **`translate`**（不改布局盒）：修复「子菜单点了没反应/要等很久」——官方子菜单按父菜单布局盒算锚点，被我们改 `bottom` 后会一直停在 0 高度；实测修复后子菜单即时渲染（h=90）。
- 弹层高度改读**实测导航高度**而非 `--dshm-v2-nav-total`（该变量在弹层打开瞬间读到 0，导致菜单落进按键区）：菜单 684..794 vs 输入卡 802..866，零重叠。
- 回形针菜单与权限菜单同款（36px 行、白面 14 圆角），以按钮为中心、两侧 ≥12px。
- 顶部 TAB 加高一档（seg 48px，用 `rem` 避开 13.3px 的 em 基准陷阱）。
- 新增**屏幕中央调试面板**（`localStorage['dshm-debug']='1'`）：打印弹层节点链、rect、translate 与计算结果，一张截图即可定位几何问题。
