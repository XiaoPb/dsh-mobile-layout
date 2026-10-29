# dsh-mobile-layout 实施计划

> 状态：M0–M4 已实现（0.5.5），M5 发布项待办  
> 调研目标版本：DSH `0.2.1-rc.4`（桌面 Electron / Web / Android runtime 共用 Web 客户端）  
> 日期：2026-10-28（更新 2026-10-29）

## 1. 结论

**可行。** 不需要修改 DSH 内核，也不需要替换官方布局插件，就能把手机竖屏切换成「单列内容 + 抽屉式侧边栏 + 全屏右栏」的布局：

- 官方布局本身就是一个普通客户端插件（`@deepseek-ai/dsh-client-ui-layout`），它占 root 槽位并把 `sidebar / main / rightbar` 声明为子槽位；
- 插件可以注入全局 CSS、注册官方槽位、通过 `ctx.layout` 调用 `toggleSidebar()` / `selectPanel()` / `openRightbar()`；
- 现有官方样式**没有任何宽度媒体查询**（整份前端 CSS 只有 `prefers-reduced-motion`），窄屏只是用 JS 把侧栏压成 56px 轨道，因此外层覆盖不会与官方响应式规则打架；
- `ctx.layout` 没有暴露侧栏开合快照，需要用 frame 上的 `data-sidebar-collapsed` 属性做状态同步——这是本方案唯一需要 DOM 观测的点，已确认该属性由 AppFrame 稳定输出。

风险集中在**官方 DOM / 哈希类名随版本漂移**与 **Android WebView 的安全区 / 输入法行为**，两者都有降级方案（锚点失败即回到默认布局，不阻塞启动）。

## 2. 调研结果

### 2.1 官方布局的可操作面

| 能力 | 事实 | 对本方案的意义 |
|---|---|---|
| 布局是插件 | `ui-layout` 把 `AppFrame` 注册进内置 `root` 槽位，并声明 `sidebar` / `main` / `rightbar` / `shell.bottom` / `shell.overlay` / `shell.leading` | 可替换，但不应该替换 |
| 替换 root 的代价 | `sidebar` 是 single 槽位，注册即「整列替换」，其内部 `sidebar.workspaces` / `sidebar.settings` 等座位会一起消失 | 重写导航列成本极高，否决 |
| 官方响应式 | `<1024px` 侧栏自动收成 56px 轨道；手动展开只改变 `narrowExpanded`；`<768px` 右栏打开时自动全屏 | 手机默认形态已接近桌面缩小版，侧栏仍占轨道 |
| 官方 CSS | 布局、侧栏、会话前端 CSS 中没有 `max-width` / `orientation` 媒体查询 | 覆盖层不与官方规则冲突 |
| 布局服务 | `ctx.layout.toggleSidebar()`、`selectPanel(id)`、`beginNavigation()`、`openRightbar(track, fullscreen)`、`closeRightbar()` | 抽屉开合、面板跳转可走官方通道 |
| 侧栏状态 | `ILayout.panelInfo` 只发布 `activePanelId`，不发布侧栏开合；AppFrame 渲染 `data-sidebar-collapsed` | 用 DOM 属性观测侧栏状态，其余走服务 |
| 可用槽位 | `conversation.header.leading`（single，root，当前无占用者）、`shell.overlay`（list，root，可点击穿透） | 汉堡入口放 header leading；遮罩/兜底入口放 shell.overlay |
| 插件样式 | 官方客户端插件通过 `<style data-plugin-css>` 注入样式；CSS 在挂载前生效 | 可在首帧前建立移动态，避免闪跳 |
| 插件产物 | `__ModuleLoader__.load({id, factory(require)})` + `dsh.client.platform: "web"` + `cordis.patch.yml` 插 roster 行 | 与 `dsh-mobile-compose` 相同的已验证路径 |
| 现有实现参考 | `dsh-mobile-compose` 已用官方槽位 + 样式注入 + locale + RPC 在桌面与 MuMu 模拟器验证 | 工程路径可复用 |

### 2.2 为什么不能只靠媒体查询

媒体查询能改尺寸，但改不了交互：

- 抽屉开合要调 `ctx.layout.toggleSidebar()`，且必须知道当前是开还是关；
- 手机竖屏下侧栏不能继续占 56px 网格轨道，否则内容宽度被吃掉；
- 右栏是 occupant 自己上报的呈现形态，CSS 只能兜底，不能替代官方 `<768px` 全屏逻辑。

所以采用 **JS 形态判定 + `ctx.layout` 控制 + 属性作用域 CSS**，媒体查询只作为辅助（`prefers-reduced-motion` 等）。

### 2.3 Android 端边界

- 官方 Android runtime 加载同一套 Web 客户端，插件产物可以直接复用（`dsh-hardssh` 已在 Android runtime 验证过宿主与客户端插件）。
- 官方 `index.html` 的 viewport 目前是 `width=device-width, initial-scale=1`，**没有 `viewport-fit=cover`**，因此 `env(safe-area-inset-*)` 在 Android WebView 里可能为 0；需要在运行时探测并允许设置侧补偿。
- Android 返回键 / 手势不经过 Web 的 `popstate` 时，抽屉关闭要依赖容器行为；插件侧同时提供 Esc、遮罩点击、左滑关闭，返回键作为真机验收项。

## 3. 方案对比

| 方案 | 做法 | 结论 |
|---|---|---|
| A. 替换 root / sidebar | 禁用官方 `ui-layout`，自己重写三栏与导航列 | 工作量大、跟随官方升级成本极高，否决 |
| B. 插槽 + 服务 + 覆盖层 CSS（选定） | 保留官方 AppFrame；手机竖屏时改写网格与侧栏定位，新增汉堡入口、遮罩与手势 | 改动小、可回退、默认布局零影响 |
| C. 修改内核 / 改前端构建产物 | 直接改 DSH 安装目录 | 升级即丢，且违反「不修改官方内核」原则，否决 |

## 4. 手机形态判定

### 4.1 输入

- `window.visualViewport`（存在时优先）与 `window.innerWidth/innerHeight`
- `window.devicePixelRatio`（仅用于诊断，不参与阈值）
- `matchMedia('(orientation: portrait)')`、`matchMedia('(pointer: coarse)')`
- 页面可见性、软键盘引起的 visualViewport 高度变化

### 4.2 判定公式（默认值，可配置）

```text
w, h   = 当前布局视口宽高（CSS px）
short  = min(w, h)
long   = max(w, h)
portrait = h > w
ratio  = long / short

进入手机布局：portrait && short <= 600 && ratio >= 1.25
保持手机布局：portrait && short <= 640 && ratio >= 1.15
其余情况：默认桌面布局
```

- 进入 / 退出加 120ms 去抖与滞回，避免旋屏、分屏拖拽时来回切换。
- 判定使用布局视口而不是屏幕物理像素：Android WebView 的 CSS px 已按 dp 换算，物理像素会把高 DPR 手机误判成平板。
- 参考机型：320×568、360×640、375×667、390×844、412×915 进入；768×1024 平板、844×390 横屏、1280×900 桌面不进入。
- 模式写入 `documentElement.dataset.dshmMode = "mobile" | "default"`；**所有移动 CSS 只在 `html[data-dshm-mode="mobile"]` 下生效**，退出时立即恢复默认，不写任何官方布局偏好。

## 5. 布局与交互规格（手机竖屏）

```text
┌──────────────────────────────────────┐
│ ☰  会话标题（单行省略）      ⋯  右栏开关 │  44px 顶栏 + 安全区
├──────────────────────────────────────┤
│                                      │
│              会话 / 面板              │  单列，全宽
│                                      │
│                                      │
├──────────────────────────────────────┤
│ 权限 | 输入框            V4.1 · H  ↑ │  输入行（官方 composer 槽位）
├──────────────────────────────────────┤
│ 新建  会话  文件  图片  插件   ⊕      │  56px 常驻操作条
└──────────────────────────────────────┘
    ← 左缘右滑或点 ☰：侧栏抽屉（86vw / max 320px）
```

### 5.1 左侧栏 → 抽屉

- 关闭态：侧栏列完全移出视口，不保留 56px 轨道；主列 `grid-template-columns: 0 minmax(0,1fr) 0`。
- 打开态：`position: absolute; inset-block: 0; left: 0; width: min(86vw, 320px)`，右缘圆角 + 阴影；官方侧栏内容原样复用。
- 遮罩：`shell.overlay` 注册全屏透明层，打开时显示 `color-mix` 背景，点击关闭；遮罩层 `pointer-events: auto`，关闭时 `pointer-events: none`。
- 触发：
  - `conversation.header.leading` 注册 40×40 汉堡按钮（官方槽位当前无占用者）；
  - `shell.overlay` 注册左缘 20px 手势热区 + 全局左滑手势，保证全局面板下也能打开；
  - 打开 / 关闭统一调用 `ctx.layout.toggleSidebar()`，通过 `[data-sidebar-collapsed]` 同步 UI 状态。
- 关闭路径：遮罩点击、Esc、左滑 ≥ 40px、选中会话 / 工作区 / 全局面板后自动关闭、进入默认布局时强制关闭。
- 可访问性：抽屉打开时焦点移入侧栏，`role="dialog"` + `aria-modal="true"`；关闭后焦点回到汉堡按钮；遮罩不进入 Tab 序列。

### 5.2 顶栏与按键分区

- 左上：汉堡 40×40，抽屉入口；全局面板追加返回按钮。
- 右上：官方右栏开关（`conversation.session.header.corner`）+ 1 个可配置官方工具 + `⋯`。默认工具为「打开方式」，配置键 `headerAction`；其余 utilities 与 session actions 全部进 `⋯`。
- 标题单行省略，右侧工具组总宽不超过标题宽度的 40%。
- `⋯` 打开的是右上角下拉菜单，不是底部面板：紧贴按钮下沿、右缘紧贴窗口；官方浮层定位根在 Android WebView（页面 0.9 初始缩放）下 `right: 0` 会内缩，JS 每帧量出「窗口宽度 − 菜单右缘」的空档并反向补偿到 `--dshm-header-menu-right`，自校正后菜单右缘与窗口齐平；菜单展开期间统计细条临时隐藏（状态带所在 composerSeat 层叠上下文会压住 header 内菜单），关闭后恢复；菜单根自身为不透明白底，展开期间还要把菜单到 header 之间的祖先链（`data-dshm-header-menu-host`）抬成 `position: relative; z-index: 60`，否则官方 `_tabs`（对话/轨迹 切换条，透明但全宽、`relative/z-index: 1`）在命中顺序上会压过菜单首行，导致「下载 Session 日志」点不到（实测 `elementFromPoint` 命中 `_tabs`，抬升后命中菜单项，实机点击可生成 Session ZIP）；输入区的权限 / 模型保持官方原始弹层，只有加号宫格才底部化。
- 全局面板（插件管理器等）没有 conversation header 时，由 `shell.overlay` 兜底显示左上角浮动菜单键；检测到 header 存在时自动隐藏，避免重复。
- 默认功能区不重复放右栏、新建、会话；这些分别属于右上与底部常驻条。

### 5.2.1 默认功能盘点与分区

以 DSH 默认界面为准（参考截图：[reference-default-ui.png](assets/reference-default-ui.png)），功能分区如下：

| 默认入口 | 分区 | 理由 |
|---|---|---|
| 新会话；插件；自动化任务；上下文洞察；SSH 工作区；更多；工作区搜索/筛选/刷新；工作区与会话树；设置 | 左上抽屉 | 导航低频、面积大，不占底部；抽屉内完整保留官方侧栏 |
| 右栏；打开方式、导出、任务等 utilities；会话 actions | 右上 | 视图与上下文工具，不是聊天动作；除右栏与 1 个可配置工具外折叠进 `⋯` |
| 权限模式；模型与思考等级；发送/停止 | 输入行 | 权限决定安全边界、模型决定输出，必须在打字位置可见 |
| 新建、会话、文件、图片、插件、`⊕` | 常驻条 | 会话内高频且可一步完成 |
| 文件、目标、计划、反馈；压缩、权限、模型、导出日志、余额、对话 | 加号面板 | 完整镜像默认「添加 + 指令」菜单；与常驻条重复的项是同一动作的快捷方式，不维护第二套状态 |
| 拍照、图片、文件 | 系统选择器 | 由文件/图片键直接拉起，不额外增加面板层级 |

### 5.2.2 常驻操作条（6 固定键 + 加号）

| 键 | 点击行为 | 长按 |
|---|---|---|
| 新建 | 在当前工作区 `session.create`，进入空会话并聚焦输入框；创建中 loading、禁止重复点击 | 无 |
| 会话 | 底部会话表：新建置顶、当前打勾、显示工作区与最近时间；选择即切换并保留滚动位置 | 无 |
| 文件 | 直接拉起系统文件选择器，插入后保留草稿 | 无 |
| 图片 | 直接拉起系统图片选择器 | 无 |
| 插件 | 底部插件快捷面板：已安装/常用插件与命令，顶部「管理插件」进入官方插件全局面板 | 无 |
| `⊕` 更多 | 输入框失焦、键盘收起，向上展开加号面板；再点、下滑或点空白关闭 | 无 |

- 每条 44×44，图标 20、标签 12px；320px 宽下每格约 53px，390px 下约 65px。
- 键盘弹起时整条随输入区上移，不隐藏。
- 常驻条只在会话页出现；全局面板、右栏全屏、非手机竖屏时移除。
- 模型回到输入行，按键显示当前模型短名（例如 `V4.1 · H`），完整名称与思考等级在模型中查看。

### 5.2.3 加号面板与插件快捷面板

- 加号面板完整镜像默认菜单：
  - 添加：文件、目标、计划、反馈；
  - 指令：压缩、权限、模型、导出日志、余额、对话。
- 面板贴屏幕最底部展开，常驻条与输入行整体上移（frame 预留面板高度），面板落在常驻条下方；两者同一表面（同底色、全宽、无圆角与阴影），仅用一条分隔线区分；内容超出时面板内部滚动。
- 展开时面板上滑 10px 淡入，⊕ 图标旋转 45° 变成 ×；再点 ⊕ 收起（pointerdown 关闭后同手势不再重开），点击面板外也可收起。
- 插件快捷面板为独立底部表，与加号面板互斥；列出已安装插件与常用命令，选择后执行或打开对应面板，顶部提供「管理插件」。
- 所有动作优先复用官方命令目录 / RPC；目录缺失时展示空态，不硬编码动作列表。

### 5.2.4 浮层互斥与返回顺序

- 权限表、模型表、会话表、加号面板、插件面板、抽屉、右栏一次只开一个。
- 返回顺序：加号面板 → 插件面板 → 会话表 → 权限/模型表 → 抽屉 → 右栏 → 会话页。
- 打开任一浮层前先收起键盘；抽屉与右栏打开时互相关闭。

### 5.3 右侧栏

- 官方 `<768px` 已自动全屏，保持官方行为，不重写。
- 补三处：全屏面板四周安全区内边距、关闭按钮 44px 触控、Android 返回键优先关闭右栏（插件无法拦截原生返回时，至少保证遮罩与 Esc 可用）。
- 右栏打开时自动关闭左侧抽屉。

### 5.4 输入区与键盘

- 会话统计（轮次/速度、Token 用量、上下文占用）从输入区 dock 移到会话标题栏下方的常驻细条：标题栏底部预留同高内边距，正文从细条下方开始；三组统计按 11px 压缩并取消按钮收缩，保证关键数字完整，文案更长时细条可横向滑动；两个详情弹层固定在该细条下方展开；右栏全屏时细条隐藏。
- 输入行始终紧贴 56px 常驻条上沿：空会话（hero）态官方把整段 composer 垂直居中，插件用自动外边距把输入座压到底部，并清零 hero 的 32px 底部留白；正常会话官方本就贴底，无需改动。
- 输入行内的官方 ⊕（添加文件或调用指令）在移动态隐藏，只保留常驻条最右侧的 ⊕；隐藏后仍可程序化点击它打开官方加号菜单。
- 空态输入卡片收紧：输入框（contenteditable）一行高度由官方 36px 压到 24px（2/3），顶部 4px 内边距清零，card 与工具行间距压到 4px，整卡由 98px 降到 78px；多行输入仍按官方逻辑自增长（官方 `max-height: 336px` 不变），空态不再保留大段空白。
- 输入区与常驻条融合：`data-composer-card` 到 `composerSeat` 之间的外壳统一去掉圆角 / 边框 / 阴影 / 左右留白（`data-dshm-composer-flat`），card 拉满 100% 宽度，与常驻条、加号面板连成同一条全宽底部面板；分隔线只保留在输入区顶端一条，常驻条不再单独画线；输入区滚动条在移动态隐藏。
- 权限模式留在输入行左侧，压缩为「图标 + 短文案」（完全访问 / 工作区 / 只读）；点击弹出底部选项表，当前项打勾，切换后文案立即更新。
- 模型与思考等级留在输入行右侧，显示当前模型短名（`V4.1 · H`，由官方 aria-label 解析）；官方长文本在移动态隐藏，完整名称仍由 aria-label 提供。切换模型 / 思考等级后 chip 在 80ms 内同步。
- 发送 / 停止固定在输入框内右侧；生成中切换为停止，触控尺寸不变。
- 底部内边距使用 `max(env(safe-area-inset-bottom), 0px)`，并提供配置覆盖（Android 无 `viewport-fit=cover` 时）。
- 软键盘弹起时以 `visualViewport.height` 驱动 `--dshm-viewport-height`，避免底部输入框被遮挡；不修改官方 composer 的 DOM。
- 与 `dsh-mobile-compose` 共存：不覆盖其 `＋` 面板与 dock 样式；若检测到该插件已接管输入行，保持其布局优先级。

### 5.5 已确认决策（2026-10-28）

- 底部常驻条：6 格含加号——新建 / 会话 / 文件 / 图片 / 插件 / `⊕`；模型回到输入行。
- 模型 chip 显示当前模型短名与思考等级，窄屏收成图标。
- 权限模式留在输入行左侧，点击保持官方原始弹层。
- 加号面板完整镜像默认菜单：文件 / 目标 / 计划 / 反馈 + 压缩 / 权限 / 模型 / 导出日志 / 余额 / 对话。
- 插件键打开底部快捷面板，顶部「管理插件」进入官方全局面板。
- 右上：右栏 + 1 个可配置官方工具 + `⋯`，默认「打开方式」。

## 6. 技术实现

### 6.1 仓库与包结构

```text
dsh-mobile-layout/
├─ package.json                 # @xiaopb/dsh-mobile-layout
├─ cordis.patch.yml             # insert: mobile-layout
├─ lib/
│  ├─ index.js                  # 宿主侧：配置命名空间 / capabilities 路由（P4）
│  └─ client.js                 # 浏览器侧：__ModuleLoader__ + 判定 + CSS + 槽位
├─ test/                        # node:test（判定、DOM 锚点、状态机）
├─ tools/                       # Playwright 验收与诊断脚本
├─ docs/
│  └─ mobile-layout-plan.md
└─ README.md
```

- `package.json` 的 `dsh.client.platform = "web"`、`dsh.bundle.patch = "./cordis.patch.yml"`，`cordis.patch.yml` 只插入 roster 行，不禁用任何官方服务。
- 客户端保持单文件产物（与 `dsh-mobile-compose` 一致），纯判定函数挂到 `module.exports.__test` 供 Node 测试，避免引入构建链。

### 6.2 DOM 锚点

官方类名是 CSS Modules 哈希，不能直接依赖。按结构 + 稳定属性锚定：

| 锚点 | 定位 |
|---|---|
| frame | 包含 `[data-rightbar-col]` 的 grid 容器 |
| 侧栏列 | frame 的第 1 个元素子节点 |
| 中列 | 侧栏列的下一个元素兄弟 |
| 右栏列 | `[data-rightbar-col]` |
| 底栏 / 浮层 | `[data-shell-bottom]` / `[data-shell-overlay]` |

插件给锚点打 `data-dshm-*` 属性，CSS 只使用这些自有属性。`MutationObserver` 监听 frame 重建并补齐属性；锚点缺失时：

1. `console.warn` 一次；
2. 强制 `data-dshm-mode = "default"`；
3. 不抛错、不阻断 DSH 启动。

### 6.3 状态机

```text
default --(判定进入)--> mobile-closed
mobile-closed --(☰ / 左滑)--> mobile-open      // ctx.layout.toggleSidebar()
mobile-open --(遮罩 / Esc / 左滑 / 选中项)--> mobile-closed
任意 mobile 状态 --(判定退出 / 旋屏 / 锚点丢失)--> default
```

- 唯一事实来源：`data-sidebar-collapsed`。
- `toggleSidebar()` 后等待下一帧 + MutationObserver 确认，再更新按钮 `aria-expanded`；超时 300ms 视为失败并回退默认布局。
- 不用 React 状态镜像官方布局，避免双写。

### 6.4 样式作用域与主题

- 只注入一个 `<style data-plugin-css="dsh-mobile-layout">`，全部选择器以 `html[data-dshm-mode="mobile"]` 开头。
- 颜色全部取官方 token（`--dsw-*`），不硬编码主题色；仅遮罩使用 `color-mix`。
- 移动态禁用列宽过渡与拖拽手柄；退出时移除全部覆盖样式。
- 预留 CSS 变量：`--dshm-drawer-width`、`--dshm-header-height`、`--dshm-safe-top`、`--dshm-safe-bottom`、`--dshm-viewport-height`。

### 6.5 生命周期

- `apply(ctx)`：注入样式 → 注册 header leading / shell.bottom / shell.overlay → 启动判定与锚点观察 → 绑定 `visualViewport` / `orientationchange` / `resize`。
- `ctx.effect` 清理：移除样式、槽位、监听器、DOM 属性，恢复默认布局。
- 插件卸载后不得留下 `data-dshm-*` 或移动样式。

### 6.6 常驻条与浮层挂载点

- 常驻条注册进 `shell.bottom`（single，root）：官方定义其高度会压缩三列可用高度，空内容不占位，正好承载 56px 操作条；组件自行控制 mobile / 默认、会话页 / 全局面板的显隐。
- 浮层（加号面板、插件面板、会话表、权限表、模型表）与遮罩注册进 `shell.overlay`（list，root）：浮层自身恢复 `pointer-events`，不阻塞底层；一次只挂载一个。
- 汉堡与全局面板兜底入口注册进 `conversation.header.leading`；右上继续使用官方 `corner` 与 `utilities`，插件只做可见性收敛，不重建官方动作。
- 插件快捷面板的数据优先来自官方插件/命令目录；动作执行走官方 RPC 或命令入口，目录不可用时展示空态。

## 7. 阶段计划

| 阶段 | 内容 | 验收 |
|---|---|---|
| M0 契约探针 | DOM 锚点、`data-sidebar-collapsed`、`ctx.layout` 调用、Android viewport 探测 | 桌面 / Android 真机各出一份诊断；锚点失败时默认布局正常 |
| M1 形态判定 | 判定公式、滞回、`data-dshm-mode`、样式骨架、无移动样式时零视觉差 | 边界单测全绿；1280×900 像素级无变化 |
| M2 侧栏抽屉与常驻条 | 汉堡入口、遮罩、开合同步、手势；`shell.bottom` 常驻条、新建/会话/文件/图片/插件/加号 | 320 / 390 宽无横向滚动，内容全宽；开合 10 次状态不漂移；6 键均 ≥ 44px |
| M3 顶栏、浮层与右栏 | 右上右栏 + 可配置工具 + `⋯`；加号面板、插件快捷面板、会话表；右栏安全区 | 右栏全屏、关闭可达；所有浮层互斥；无 header 的面板仍能打开抽屉 |
| M4 输入区 | 权限表、模型短名 chip、安全区、软键盘、与 `dsh-mobile-compose` 共存 | 键盘弹起输入框不被遮挡；权限/模型切换即时同步；组合安装无重叠 |
| M5 加固发布 | 版本契约测试、设置命名空间、README、CI / 打包 | 0.2.1 线全矩阵通过；发布 tarball 可安装 |

进度（2026-10-29，0.5.5）：M0–M2 完成；M3 完成（顶栏沿用官方窄屏收敛结果；会话表、插件表、贴底宫格面板已实现，面板与常驻条同表面仅以分隔线区分）；M4 完成（输入行贴底与 hero 底部留白清零、输入行内官方 ⊕ 隐藏、权限 / 模型短名 chip 且保持官方原始弹层、加号弹层贴底与互斥、会话统计迁移到标题栏下方常驻细条且详情弹层下移、`--dshm-viewport-height` 与安全区、右栏返回键关闭与 44px 顶部工具、右栏打开时关抽屉）；已用 Playwright 360×640 与 MuMu 真机验证输入行下沿与常驻条上沿齐平、面板展开时同步上移、chip 文案、宫格列宽与行高、⊕ 二次点击收起、权限切换即时同步、统计细条三组数字完整且对话框位于细条下方、右上角 `⋯` 菜单紧贴按钮与窗口右缘（右缘自校正后 `rect.right` 与窗口宽度一致）且展开时统计细条隐藏、空态输入卡由 98px 收到 78px（输入框 36→24px）且多行仍自增长、输入区与常驻条融合后同表面同宽度（分隔线只在输入区顶端）、横屏像素级回退；0.5.5 修掉顶栏菜单可点性：菜单祖先链抬升后 `elementFromPoint` 对「下载 Session 日志」由命中 `_tabs` 变为命中菜单项，MuMu 实机点击后 `/sdcard/Download/DSH MOBILE/` 生成 Session ZIP 并弹出下载提示；M5 待办。

每个阶段先落可回退的小改动；M1 之前不改变任何官方节点位置。

## 8. 验证矩阵

**单元测试（node:test）**

- 判定：320×568、360×640、375×667、390×844、412×915、600×900、601×900、640×900、768×1024、844×390、400×600（分屏）、1280×900。
- 滞回：600→610→640→641 的进入 / 保持 / 退出。
- DOM 锚点：正常 frame、缺失 rightbar、重建 frame。
- 状态机：开合超时、锚点丢失、浮层互斥、卸载清理。
- 常驻条：6 键顺序、激活态、320/360/390 宽度下的最小触控宽度。

**无头 Chromium（Playwright，触摸 + 移动视口）**

- 390×844 DPR3：默认态 -> 移动态，侧栏不占轨道、无横向溢出、汉堡可见、开合与遮罩、返回后默认。
- 320×568 / 360×640：抽屉宽度、6 键触控尺寸、标签不换行、内容不裁切。
- 768×1024 / 844×390 / 1280×900：与基线布局矩形逐项比对，差异为 0。
- 右栏：打开全屏、关闭、抽屉互斥。
- 浮层：加号面板、插件面板、会话表、权限表、模型表逐个开合并验证互斥与返回顺序。
- 软键盘：注入 visualViewport 高度变化，输入框与常驻条仍在可视区。

**真机**

- Android（MuMu 模拟器 + 实机）：安全区、输入法、返回键 / 手势、旋屏、分屏。
- 桌面 Electron：窗口缩放到 390×844 时行为与 Web 一致；默认布局无回归。

## 9. 风险与回退

| 风险 | 等级 | 缓解 |
|---|---|---|
| 官方 DOM / 哈希类名升级漂移 | 中高 | 只依赖结构与 `data-*`；每个 DSH 版本跑锚点契约测试；失败即 `default` 模式 |
| 侧栏状态未公开，DOM 同步滞后 | 中 | 单一事实来源 + MutationObserver + 300ms 超时回退；不做乐观 UI |
| 覆盖 inline `grid-template-columns` 冲突 | 中 | 移动态 `!important` + 禁用过渡；仅改 frame 网格，不动 occupant |
| Android `env()` 为 0 / 无 `viewport-fit` | 中 | 运行时探测，配置侧补偿；不修改官方 index.html |
| Android 返回键不可拦截 | 低 | 遮罩 / Esc / 左滑三条关闭路径；真机验收 |
| `shell.bottom` 是 single 槽位，可能被其他插件占用 | 中 | 启动时检测占用；失败则把常驻条降级到 `shell.overlay` 底部锚定，功能不丢 |
| 右上官方 utilities 不暴露动作列表，`⋯` 需要代理 | 中 | 只做可见性收敛；`⋯` 通过隐藏入口代理点击；代理失败则保留官方原样 |
| 与其他插件样式冲突 | 低 | 全部选择器带 `data-dshm-*` 作用域；不覆盖 composer 与右栏内部样式 |
| 误判导致桌面布局变化 | 低 | 默认阈值 + 滞回 + 像素级回归；提供“强制关闭”配置 |

**总回退**：任何阶段删除插件或关闭配置，官方布局原样恢复；插件不持久化任何官方布局偏好。

## 10. 未决问题

1. 手机阈值默认 600 / 640 是否需要按机型放宽到 720（大屏手机 / 折叠屏外屏）。
2. 抽屉宽度默认 `min(86vw, 320px)` 是否覆盖 320px 窄机（可能压到 275px，需真机看官方侧栏内容裁切）。
3. 插件快捷面板的排序与置顶规则（最近使用 / 手动置顶 / 按插件顺序）。
4. Android 原生返回键是否需要容器侧配合（插件只能覆盖 Web 内路径）。
5. 右上 `headerAction` 的可选项与 `⋯` 代理失败时的降级优先级。
