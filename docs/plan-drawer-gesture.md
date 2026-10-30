# 抽屉手势全局化方案（v0.1.15）

> 目标：左缘右滑开抽屉这件事，不再依赖 `shell.overlay` 这个 React 槽位组件是否活着，
> 在任何页面（会话 / 插件 / 自动化 / SSH / 其它插件注册的 `main` 面板）都能监听到，
> 并对齐官方原生面板的动效与视觉 token。
>
> 调研依据：本机 profile 内的官方包（`~/.dsh/profiles/node_modules/@deepseek-ai/`），
> 主要参考 `dsh-client-ui-layout`（AppFrame / 槽位 / `ctx.layout`）、`dsh-client-ui-theme`（设计 token）、
> `dsh-client-runtime`（客户端插件上下文）。行号对应当前 `0.1.14` 的 `lib/client.js`。

---

## 0. 结论先行

| 结论 | 依据 |
|---|---|
| 手势不该挂在 `shell.overlay` 组件里 | 它现在是 `OverlayLayer` 的一个 `useEffect`（`client.js:4587-4689`），生命周期绑在 **React 槽位组件**上；组件不渲染 = 手势消失 |
| 官方外围是稳的，问题在「附着点太深 + 判据太耦合」 | 官方 AppFrame 整体不随 `main` 面板切换重挂，理论上 overlay 常驻；真正让手势失效的是冒泡阶段被页面吃掉、或横滑容器误判 |
| 修法：单一事件源（window capture）+ 纯函数判据 + 跟手反馈 | 见 §3；一行注册、一处释放，与页面、槽位、重渲染全部解耦 |
| 视觉上应该用官方 token 而不是硬编码 | 现在遮罩 `rgba(0,0,0,.38)`、阴影 `0 12px 32px rgba(0,0,0,.32)`、过渡 `220ms ease` 都是自造值；官方有现成 alias，见 §4 |

---

## 1. 官方能力调研（插件能做什么）

### 1.1 槽位模型

官方由 `dsh-client-ui-layout` 的 `apply(ctx)` 一次性注册 root 槽位，`AppFrame` 负责渲染
（`dsh-client-ui-layout/lib/client.js:617`、`:639-651`）：

| 槽位 | 类型 | 作用域 | 谁来占 |
|---|---|---|---|
| `sidebar` | single | root | `dsh-client-ui-sidebar` |
| `main` | **keyed** | root | `conversation`（保留键）+ 各插件的全局面板 |
| `rightbar` | single | root | `dsh-client-ui-sidebar-right` |
| `shell.bottom` | single | root | 整帧底行（本插件的常驻操作条） |
| `shell.overlay` | **list** | root | 覆盖整帧的浮层（本插件的遮罩 / 手势层） |
| `shell.leading` | single | root | macOS 折叠态左上角座位 |

要点：

- `main` 是 **keyed** 槽位，插件注册 `{ name:'main', key:'xxx' }` 就得到一个全局面板页；
  官方 README 明确「Main-panel navigation preserves the bottom component」「`shell.overlay` covers the whole frame」。
- `MainPanel` 只是 `renderSlot('main', {}, { entryKey })`（`:118-120`），它被塞进 `CenterColumn` 里。
  **所以换面板时 AppFrame 不重挂，`shell.overlay` 的组件实例仍然在。**
  → 这排除了「换页面把 overlay 卸载了」这个最直觉的解释，把嫌疑压到事件链路与判据上（§2）。
- 客户端 cordis 的服务必须先 `inject` 才能取用（`ctx.slots` 直接读会抛错），本插件已按此写。
- 槽位注册失败只该降级对应功能，不能上抛（web shell 会在 apply 抛错时整体启动失败）。

### 1.2 布局服务 `ctx.layout`

`LayoutController` 只暴露四个动作 + 一个快照（`dsh-client-ui-layout/lib/client.js:452-495`）：

```ts
selectPanel(id | null): void      // 切换到某个 main 面板 / null 回会话
beginNavigation(): AbortSignal
toggleSidebar(): void             // 桌面：sidebar 0 ⇄ 280；窄屏（<1024）：翻转 narrowExpanded
openRightbar(track, fullscreen): void
closeRightbar(): void
panelInfo: { getSnapshot, subscribe }   // 只有「当前 main 面板 id」
```

**关键限制：官方没有把 `layoutInfo`（侧栏是否折叠）暴露成可订阅快照。**
所以「抽屉开没开」只能继续以 frame 的 `data-sidebar-collapsed` 为准（现状 `isDrawerOpen()` 已是这个思路），
但也意味着**手势触发后不能立刻再读 DOM**——React 渲染是异步的，连续两次 `requestDrawer()` 会双翻。
方案里用「下一帧复核」解决（§3.3）。

### 1.3 断点语义

- `< 1024px` 侧栏自动折叠，折叠后保留 56px rail（本插件在手机态把 rail 也收掉，列宽 0）。
- 窄屏下 `toggleSidebar()` 改的是 `narrowExpanded`，不是宽度。
  → `requestDrawer(open)` 必须幂等（现状已幂等），且样式判定必须认 `data-sidebar-collapsed` 而不是宽度。

### 1.4 设计 token（`dsh-client-ui-theme`）

| token | 取值 | 官方用途 |
|---|---|---|
| `--dsw-alias-bg-mask-1` | `#0000003d`（浅）/ `#00000080`（深） | 弹层遮罩 |
| `--dsw-alias-bg-mask-2 / -3` | `#0000001f` / `#0003` / `#0000007a` | 次级遮罩 |
| `--dsw-specific-sidebar-fill` | 侧栏底色（含渐变） | 侧栏 / 标题栏 |
| `--dsw-alias-bg-base` | 内容底色 | 中心列 |
| `--dsw-alias-border-l3` | `.5px` 分隔线 | 列分隔 |
| `--dsw-shadow-lv3` | `0 0 1px #0003, 0 0 4px #00000005, 0 12px 32px #00000014` | 浮层投影 |
| `--dsw-radius-lg / -panel / -xl` | `16 / 28 / 20px` | 面板圆角 |
| `--ds-transition-duration-slow` | `.3s` | 列宽 / 面板滑入 |
| `--ds-ease-in-out` | 官方缓动 | 同上 |
| `--dsh-frame-top-clearance` / `--dsh-frame-overlay-top` | 48px（macOS）/ 标题栏高；+20px | 浮层让开窗口 chrome |

官方自己的抽屉式动画约定：切换时给 frame 打 `data-animating`，位移与缓动统一读上面两个变量，
拖拽时打 `data-dragging` 关掉过渡（`AppFrame` 的 `onDragStart/onDragEnd`）。**跟手拖拽应当复用这套语义。**

### 1.5 快捷键服务

`ctx.shortcuts.register({ id, label, aliases, defaults, regions, modals, resolve })`（`:655`）。
桌面 Mod+B 就是它。它的 `resolve` 只能返回「已处理」，**无法表达连续手势**，
所以抽屉手势不该走快捷键通道，只能自己做事件源；Esc 出口保持现状即可。

---

## 2. 现状与根因

### 2.1 现状实现

```js
// client.js:4582 OverlayLayer
react.useEffect(() => {
  if (!mobile) return undefined
  ...
  doc.addEventListener('touchstart', onTouchStart, { passive: true })   // 冒泡阶段
  doc.addEventListener('touchmove',  onTouchMove,  { passive: true })
  ...
}, [mobile])
```

判定条件（`onTouchStart` / `onTouchMove`）：

1. 单指、非 `[data-rightbar-fullscreen]`；
2. `startedInZone = !isDrawerOpen() && startX <= drawerStartLimit(width)`（左侧 40%，钳 64–200）；
3. 未开浮层（sheet / ⊕ 面板 / 设置页）；
4. **起手点不在「横向滚动容器」内**：`insideHorizScroller()` 向上找 6 层祖先，
   只要 `scrollWidth > clientWidth + 4` 且 `overflow-x` 为 `auto|scroll` 就判定让路；
5. `touchmove` 里 `|dx| >= 48` 且 `|dx| >= |dy| * 1.2` 才动手。

### 2.2 三条候选根因（按可能性排序，均可现场验证）

| 编号 | 根因 | 为什么能解释「只在其它插件页面失效」 | 验证方法 |
|---|---|---|---|
| **H1** | `insideHorizScroller` 误判 | 其它插件的页面常是「整页宽表 / 终端 / 画布」，容器本身就是 `overflow-x:auto` 且可横向滚动 → 起手点永远被判成「内容横滑」，手势直接让路。终端页尤其典型：xterm 的 viewport 常年 `scrollWidth > clientWidth` | 真机在该页起手，看是否有 `dshm-drawer-blocked: h-scroller` 日志（方案里加） |
| **H2** | 事件在到达 `document` 冒泡前被吃掉 | 第三方页面（如 hardssh 的 VS Code 组件栈）在容器上 `stopPropagation()`；`document` 冒泡阶段的监听收不到 | 打印 `touchstart` 计数：目标页为 0 即命中 |
| **H3** | 页面 `preventDefault` 后 WebView 停止派发后续 `touchmove` | 页面为了让自己的拖拽生效会在 `touchstart` 里 `preventDefault`（xterm 的 `Gesture.onTouchStart` 就是 `preventDefault + stopPropagation`），部分 WebView 不再投递 move，手势永远到不了 48px 阈值 | 只收到 1 次 `touchstart`、0 次 `touchmove` |

三者共同的结构性缺陷是同一个：**事件附着点在 React 槽位内 + 冒泡阶段 + 判据与页面内容强耦合**。
所以修法不是「再加一个兜底监听」，而是换附着点 + 换判据。

### 2.3 现状的第二个问题：不跟手

现在手势只是「阈值触发一次状态翻转」，抽屉由 CSS `transform` 220ms 淡入。
官方列宽拖拽是跟手的（`data-dragging` 关过渡）。手机上「滑一下 → 等动画」和官方手感不一致。

---

## 3. 方案设计

四层，自下而上；全部集中在 `lib/client.js`，对外只多一个 `bindDrawerGesture()`。

### 3.1 L1 事件源：window + capture，单点绑定

```js
// 与 settings 横滑换页签并列注册（apply 里），随 dispose 一起摘掉
function bindDrawerGesture(win, doc) { ... }   // 返回 release()
```

- **绑在 `window`，`capture: true`**：捕获阶段在目标元素自身处理器之前执行，
  任何层级的 `stopPropagation()` 都挡不住；即便某天 `shell.overlay` 真的缺席也不影响。
- 双通道：`touchstart/touchmove/touchend/touchcancel` 为主（Android WebView 最稳），
  `pointerdown/pointermove/pointerup/pointercancel` 仅作 `pointerType === 'touch'` 的兜底，
  用时间戳去重，避免一次手势被处理两遍。
- 全是 `passive: true`：只观察不拦截，不与页面抢默认行为（除非进入跟手阶段，见 3.3）。
- 清理出口只有一处：`dispose()` 里 `release()`。

### 3.2 L2 判据：纯函数 + 边界让路

把「这一下算不算开抽屉」抽成可单测的纯函数：

```js
decideDrawerGesture({
  dx, dy, dt,          // 位移与时长
  startX, width,       // 起手位置与视口宽
  drawerOpen,          // 当前抽屉状态（DOM 复核）
  blocked,             // 浮层 / 设置页 / 右栏全屏
  hScrollerEdge,       // 起手容器在该方向上还能不能滚（true = 还能滚，让路）
}) => 'open' | 'close' | 'none'
```

相对现状的三处改动：

1. **横滑让路改成「边界判断」**：不只看容器能不能横滚，还要看它**在该方向是否已到边界**
   （右滑时 `scrollLeft <= 0`，左滑时 `scrollLeft + clientWidth >= scrollWidth - 1`）。
   只有「还能继续滚」才让路。终端 / 宽表在最左端起手右滑 → 判定为开抽屉，符合直觉；
   在中间起手右滑 → 让路给内容的横向滚动。
2. **方向判定提前到阈值一半（24px）**：一旦确认横向意图就进入 `armed` 态并向页面要默认行为
   （仅 `armed` 后才 `preventDefault`），避免 H3 那种「move 不再派发」。
3. **起手区保持现状**（左侧 40%，钳 64–200）：全面屏系统的左缘返回手势必须让开；
   抽屉已展开时的左滑不受起手区限制。

同时保留一个逃生口：`data-dshm-swipe-ignore` 属性——任何插件/页面对某个子树打了这个标，
手势一律让路。写给未来的自己，也写给第三方插件作者。

### 3.3 L3 反馈：跟手 + 吸附

进入 `armed` 后：

```js
html.dataset.dshmDragging = ''                 // 关过渡（对齐官方 data-dragging 语义）
sidebar.style.transition = 'none'
sidebar.style.transform  = `translate3d(${-100 + progress * 100}%,0,0)`
mask.style.opacity       = String(0.38 * progress)   // 或 token 值
```

松手时按 **位移比例（> 0.35）+ 速度（> 0.35 px/ms）** 决定吸附方向，然后：

1. 清掉内联 `transition/transform`（先补一帧过渡，再交付给 CSS 规则，避免闪跳）；
2. 调 `requestDrawer(open)`；
3. 移除 `data-dshm-dragging`；
4. **下一帧复核** `[data-sidebar-collapsed]`，若与目标不符再补一次（解决 §1.2 的异步渲染问题，
   也顺手修掉现在「快速连滑两次会双翻」的隐患）。

`prefers-reduced-motion: reduce` 时跳过跟手，退化为阈值触发 + 官方 0ms/短过渡。

遮罩缺失兜底：若 `requestDrawer(true)` 后 1 帧仍没找到 `.dshm-mask`（`shell.overlay` 确实不在），
由 `bindDrawerGesture` 在 `[data-dshm-frame]` 里临时插入一个 `dshm-mask-fallback`
（同样的 token 值），关闭时移除——保证「能开就一定能点外面关」。

### 3.4 L4 可观测

`localStorage.setItem('dshm-debug','1')` 后，手势被拒绝时打一行结构化日志：

```
[dsh-mobile-layout] drawer gesture ignored: H_SCROLLER | BLOCKED_SHEET | OUT_OF_ZONE | TOO_VERTICAL
```

现场一条日志即可定位 H1/H2/H3，不必再猜。默认关闭，零成本。

---

## 4. 视觉对齐原生

| 元素 | 现状 | 改为 | 理由 |
|---|---|---|---|
| 遮罩 | `rgba(0,0,0,0.38)` | `var(--dsw-alias-bg-mask-1)` | 与官方弹层同一层遮罩强度，深色主题自动变 `.5` |
| 抽屉底 | 继承官方侧栏 | `var(--dsw-specific-sidebar-fill)` 兜底 + `--dsw-alias-border-l3` 右描边 | 侧栏底色在 macOS 是渐变，硬写底色会打架；只做兜底 |
| 投影 | `0 12px 32px rgba(0,0,0,.32)` | `var(--dsw-shadow-lv3)` | 官方浮层投影，深色下不会糊成黑块 |
| 圆角 | `0 16px 16px 0` | `0 var(--dsw-radius-lg,16px) var(--dsw-radius-lg,16px) 0` | 与官方 16px 一致 |
| 过渡 | `220ms var(--ds-ease-in-out,ease)` | `var(--ds-transition-duration-slow,.3s) var(--ds-ease-in-out)` | 与官方列宽/面板滑入同一曲线；拖拽时置 `none` |
| 宽度 | `min(86vw, 280px)` | `min(86vw, 280px)`（不变，注释对齐官方 264–420 / 默认 280） | 官方默认 280，保持 |
| 顶部让位 | `--dshm-header-height` | 追加 `--dsh-frame-top-clearance` / `--dsh-frame-overlay-top` 兜底 | 桌面窗口 chrome 下不压标题栏 |
| 降级 | 已有 `@media (prefers-reduced-motion: reduce)` 段（`:4093`） | 补「手势吸附不做跟手」分支 | 无障碍一致 |

遮罩淡入/淡出改为 `opacity` 过渡（现状是瞬时增删节点 + 160ms transition，但节点插入首帧不一定吃到过渡）：
挂载后再置 `opacity:1`，关闭时先置 `0` 再等 `transitionend` 卸载。

---

## 5. 改动清单

| 文件 | 位置 | 改动 |
|---|---|---|
| `lib/client.js` | 新增（`requestDrawer` 附近） | `decideDrawerGesture()` / `scrollerEdge()` / `bindDrawerGesture()` / `drawerSwipeIgnore()` 纯函数与常量 |
| `lib/client.js` | `OverlayLayer`（`:4582-4689`） | 删除手势段（`onTouchStart/onTouchMove/onTouchEnd` 与四个 `addEventListener`），保留遮罩 / 浮动侧栏键 / Esc / ⊕ pointerdown |
| `lib/client.js` | `apply()`（`:5261-5285` 一带） | 注册 `bindDrawerGesture(win, doc)`，`dispose()` 里 `release()` |
| `lib/client.js` | `requestDrawer`（`:2867`） | 增加「下一帧复核」与 `data-dshm-dragging` 期间抑制，保持幂等语义 |
| `lib/client.js` | `CSS_TEXT` | §4 的 token 替换 + 遮罩淡入 + reduced-motion 分支 |
| `lib/client.js` | `exports.__test` | 导出新纯函数，供单测 |
| `test/gesture.test.js` | 新增 | 方向 / 阈值 / 起手区 / 横滑边界让路 / 速度吸附 / 幂等复核 |
| `docs/architecture.md` | 槽位表 | `shell.overlay` 职责里去掉「手势层」，新增一节「手势层常驻 window」 |
| `README.md` / `README.en.md` | 能力列表 | 第 19 行改为「任意页面（含插件面板、终端页）可用」 |
| `package.json` | — | `0.1.15`（发布时统一改） |

不改的东西：官方 `AppFrame`、`data-sidebar-collapsed` 事实来源、`ctx.layout` 调用方式、槽位注册集合。

---

## 6. 验收矩阵

| # | 场景 | 期望 |
|---|---|---|
| 1 | 会话页左缘右滑 | 抽屉跟手滑入，松手吸附 |
| 2 | 插件页 / 自动化页 / 设置页左缘右滑 | 同 1（本次核心回归项） |
| 3 | SSH 工作区（终端）左缘右滑 | 开抽屉；终端居中位置右滑则滚终端内容 |
| 4 | 代码块 / 表格内部**中部**横向拖动 | 内容横滚，不误开抽屉 |
| 5 | 代码块已到最左端再右滑 | 开抽屉（边界让路规则） |
| 6 | 抽屉展开时任意位置左滑 | 关闭，且跟手 |
| 7 | 抽屉展开点遮罩 / 按返回键 | 关闭，历史栈只退一条 |
| 8 | 快速连滑两次 | 最终状态与第二次手势方向一致（不双翻） |
| 9 | 横竖屏切换 / 键盘弹起时手势 | 不触发、不卡在 armed 态 |
| 10 | 手势中途 `touchcancel` | 内联 transform 清干净，无残留 |
| 11 | `prefers-reduced-motion` | 无跟手，直接吸附，无长动画 |
| 12 | 桌面端（Electron） | 完全不注册（现有 host 判定不变） |

自动化：`npm test` 覆盖纯函数（1/2/4/5/8 的判定部分）；DOM 与真机部分进「真机验收」清单。

---

## 7. 风险与回退

| 风险 | 缓解 |
|---|---|
| 与页面自身手势竞争 | 边界让路 + `data-dshm-swipe-ignore` + 起手区 |
| 跟手期间官方同时改了 grid | 跟手只动 `transform` 与 `opacity`，不碰 grid；结束一帧后交还原生过渡 |
| `narrowExpanded` 语义随官方变化 | 一切以 DOM `data-sidebar-collapsed` 复核，不缓存推断值 |
| 内联样式残留 | 唯一清理出口 `release()`：`pointercancel` / `touchend` / `dispose` 都走它 |
| 需要紧急回退 | 删除 `bindDrawerGesture` 调用即回到 0.1.14 行为，其余改动（token、遮罩淡入）可独立保留 |

---

## 8. 实施顺序

1. **批一（功能修复，最小可发）**：L1 事件源迁移 + L2 判据（含边界让路）+ 下一帧复核 + debug 日志 + 单测。
2. **批二（手感与视觉）**：L3 跟手吸附 + §4 token 替换 + 遮罩淡入 + reduced-motion。
3. **批三（文档）**：architecture / README / CHANGELOG，版本号 `0.1.15`。

每批都能独立发布，批一即使不跟手也已经解决「其它插件页面不生效」。
