# dsh-mobile-layout 技术说明

> 实现细节、参数依据、测试与真机调试方法。总体设计见《[架构文档](architecture.md)》。

## 1. 产物与包契约

- **单文件产物**：`lib/client.js` 即发布物，无构建步骤。文件是 `define(...)` 工厂（Cordis 客户端模块协议），内部自带 `module.exports` 闭包，只 require 官方提供的 `react`。
- **版本契约**：文件内 `const VERSION` 必须与 `package.json` 一致，`npm run verify-package` 负责校验（发布前 CI 强制）。改版本号两处要同步。
- **测试出口**：`module.exports.__test` 导出全部纯函数与常量（`classify`、`swipeDirection`、`drawerStartLimit`、`decideDrawerGesture`、`drawerSettle`、`scrollerConsumes`、`planAddPages`、`tintHash`、`sessionRows`、`shouldCloseSheetByDrag`、`STRINGS` 等），供 `test/*.test.js` 使用。注意 `__test` 对象出自 vm 沙箱（跨 realm），断言对象值时先逐字段取值或转本域数组，**不要直接 `deepEqual` 沙箱对象**（原型不同必挂）。

```sh
npm run check             # node --check → 129 项单测 → verify-package → 硬编码守卫
npm test                  # 仅单测
npm run hardcode:check    # 仅硬编码守卫（新增违规即失败）
npm run hardcode:baseline # 消除违规后收紧 baseline
npm run pack:dry          # 预览发布文件清单
```

- **硬编码守卫**：`scripts/check-hardcoded.mjs` 扫描 `lib/client.js` 注入 CSS 字符串行里「布局属性（width/height/margin/padding/top…/gap/border-radius）+ 纯 px」。值含 `var()/clamp()/env()/min()/max()/%` 自动放行，0.5 / 1px 细线豁免，行上方注释 `HARDCODE-OK: 理由` 可豁免；与 `scripts/hardcoded-baseline.json`（sha1 哈希集）比对，**新增违规即失败**、消除违规提示收紧。跨机型适配问题在源头被 CI 拦截。

## 2. 关键参数与依据

| 参数 | 值 | 依据 |
|---|---|---|
| 进入手机模式 | 竖屏 + 短边 ≤ 600 CSS px + 长宽比 ≥ 1.25 | 覆盖主流手机 CSS 视口；桌面最小可缩窗 520×600 会被宿主判据挡住 |
| 保持模式（滞回） | 短边 ≤ 640 / 比例 ≥ 1.15 | 避免 600~640 区间窗口缩放来回抖动 |
| 横滑最小位移 `SWIPE_MIN` | 48 CSS px | 低于此视为误触；纵向超过横向 0.72 倍不认（竖向滚动优先） |
| 意图确认 `SWIPE_ARM_PX` | 24 CSS px | 24px 定向即进入跟手：更晚的话第三方页面已把 touchmove 吃掉（终端 / VS Code 组件 stopPropagation），手势跟不上 |
| 抽屉开栏起手区 `drawerStartLimit` | 屏宽左 60%，下限 64 CSS px | 全面屏把系统返回绑在硬边缘，24px 边缘区根本滑不到；QQ 式中间偏左起手。0.2.10 由 40% 扩到 60% 并去掉 200 上限（用户实测中段起手更自然）；下限防极窄屏退化成纯边缘手势 |
| 横滚让路 `scrollerConsumes` | 方向 + 边界判定 | 右滑看 `scrollLeft > 0`、左滑看是否到右端（1px 亚像素容差）；不是「起手在横滚容器内就让路」——终端 / 宽表整页横滚时最左端起手仍要能开抽屉（0.1.15 修） |
| 松手吸附 `drawerSettle` | 甩动优先 \|v| ≥ 0.35 px/ms；否则位移比例 ≥ 0.38 展开 | 快速轻扫不必拖过半屏；两阈值取偏小值，手机上「拖出 1/3 屏 + 稍快」就该算明确意图。比例阈值两侧对称（展开态拖回 <0.38 才收） |
| ⊕ 面板焦点抑制时长 | 输入控件禁用 600ms | 官方打开面板时的异步 refocus 落在窗口内；过长影响用户立刻打字 |
| 键盘高来源 `resolveImeHeight` | 原生桥 > 实测/持久化 > 视口 42% 估值 | 原生 WindowInsets 最准且无需弹键盘；visualViewport 需真弹一次（K70 实测 resize 为一次性跳变，收缩量即键盘高）；估值仅首次兜底 |
| 面板 ⇄ 键盘切换 | 揭开 / 覆盖（`startImeSwap`） | 键盘绘制在 WebView 之上，面板与输入行提前就位靠键盘滑出揭开；resize 一次性跳变时刻换算 padding 保持输入行屏幕位置（0.1.12，替代 0.1.11 等高瞬换） |
| 加号面板分页 | 4 列 × 2 行，超出横向分页 | 单手可达；页签 `pageLabel(i, active)` |
| 会话表高度上限 | 屏高 64%，下限 300px | 官方弹层比例（v1.4.57 视觉分支）；仍留出底部操作条与输入区 |
| 空态 hero 居中 | 内容列顶 → 输入卡顶的中点 | 手机布局把标题栏折叠成 0 高，若拿 composer seat 顶当上边界，只有「seat 顶 → 输入卡顶」几十像素参与居中，hero 会贴底压到输入面板分界线上（0.2.11 修） |
| 底部表下拉关闭阈值 `SHEET_DRAG_CLOSE_PX` | 96 CSS px | 约拇指一节：低于此多为误触，高于此用户已明确「不要这张表」 |
| 原生设置悬浮窗 gutter `--dshm-settings-gutter` | `clamp(12px, 3.4vw, 20px)` | 左右留白随屏宽缩放；left/right 表达式逐字符相同 + `margin: 0 auto`，杜绝 over-constrained 下 LTR left 优先导致的偏左 |
| 原生设置悬浮窗 vpad `--dshm-settings-vpad` | `clamp(min 24px, 10vh, max 120px)` | 上下各留约 10% 视口高；矮屏保底、高屏封顶（0.4.0 由固定 18–28px 改为比例式） |
| 融合空态卡 gutter `--dshm-classic-gutter` | `clamp(12px, 3.4vw, 20px)` | 空态虚线输入卡左右对称留白；**margin 方案必须配 `width: calc(100% - 2×gutter)`**，否则被钉死的 `width:100%` 在 over-constrained 下吃掉 margin |
| 悬浮卡圆角 `--dshm-v2-radius` | 20px | 虚线描边画在官方 `::after` 伪元素上，必须同步 `border-radius: inherit`，否则出现月牙缝 |

## 3. 各功能域实现要点

### 3.1 抽屉手势（0.1.15 全局化 + 跟手）

- **入口只有手势，无按键**：☰ 与浮动侧栏键已移除——子页面（插件二级页等）自己的返回键会被按键遮挡，且手势全局化后按键冗余。`verify-package` 里「旧按键标记必须不存在」防回潮。
- **事件源**：`bindDrawerGesture` 常驻 `window` **捕获阶段**（touch + pointer 双通道按先到者去重，全部 passive）。捕获先于一切目标处理器，其它插件页面 `stopPropagation` / `preventDefault` 都拦不住，也不再随槽位卸载失效。`release()` 单一清理出口。
- **判定**：抽成纯函数 `decideDrawerGesture`——左 60% 起手区右滑开、展开后任意位置左滑收；横滚容器按「方向 + 边界」让路（`scrollerConsumes`），终端 / 宽表整页在最左端起手右滑也能开；`data-dshm-swipe-ignore` 子树是逃生口。起手区判定在捕获阶段读 DOM 前，浮层（底部表 / ⊕ 面板 / 设置页）打开时不叠开。
- **跟手**：24px 定向即进入跟手（`beginFollow`）——侧栏打 `data-dshm-dragging` 关过渡（官方 `data-dragging` 同语义），`translate3d` 内联逐帧驱动；遮罩用自建 `.dshm-drag-mask`（透明度跟进度，无过渡），跟手期间官方 React 遮罩 `display:none` 让位防双层发黑。
- **吸附**：松手 `drawerSettle` 按速度 / 位移比例决定终态，交还 CSS 过渡补间（`--ds-transition-duration-slow` + `--ds-ease-in-out`），360ms 后清内联样式并把遮罩交还官方 React 遮罩；官方遮罩始终不来的宿主（overlay 槽位注册失败）轮询 600ms 后挂 MutationObserver 监听 `data-sidebar-collapsed`，抽屉收起时淡出自建遮罩。
- **打断与复核**：多点触控 / `pointercancel` / `touchcancel` 都按当前进度吸附收尾；官方 `toggleSidebar` 是异步提交，触发后 320ms 按 DOM 复核一次（只补一次），快速连滑不会双翻。减动效（`prefers-reduced-motion`）宿主**保留跟手**，仅把吸附补间压到 100ms（0.2.4 起；早期「退化为阈值触发」的方案已废弃）。
- **视觉**：遮罩 `--dsw-alias-bg-mask-1`、抽屉阴影 `--dsw-shadow-lv3`、圆角 `--dsw-radius-lg`，全部走官方主题 token（带缺省兜底）。
- **调试**：`localStorage.dshm-debug = 1` 输出拒绝原因（`H_SCROLLER` / `BLOCKED_LAYER` / `OUT_OF_ZONE` / `TOO_VERTICAL` / `SWIPE_IGNORE` / `RIGHTBAR_FULLSCREEN`）与吸附参数（progress / velocity / 终态），现场一条日志定位根因。

### 3.2 ⊕ 加号面板与输入法互斥

根因链：输入法开着点 ⊕ → 官方打开面板还会**异步 refocus** 输入框 → 面板与软键盘同屏。只 blur 挡不住 refocus（实测真机「键盘拉起→收起→弹面板」体验交叉）。方案：

1. `openOfficialAddMenu()` 点击官方按钮**前**经公共底座 `suppressComposerFocus(ms, onRestore)` 把 composer 输入控件短暂置 `disabled` / `contenteditable=false`——`focus()` 在禁用元素上是 no-op，官方 refocus 直接落空，软键盘全程不拉起；600ms 后按原值恢复。
2. 120 / 250ms 各补一次 `blurComposer()`，兜底找不到控件的场景。
3. `tagComposerMenus()` 的宫格分支兜底：面板打开 >800ms 且焦点仍在 composer 时收掉（800ms 内不动，避免和官方异步 focus 竞争；选择器带搜索框走 picker 分支，不受影响）。
4. **反向互斥（0.1.10）**：面板开着点输入框时在 document 捕获阶段截住对输入框的 pointerdown，主动收面板后拉键盘。
5. **揭开 / 覆盖切换（0.1.12，替代 0.1.11 的等高原位替换）**：面板高度回归内容自适应，切换靠平台事实——**系统键盘绘制在 WebView 之上**，让面板与输入行提前就位，键盘自身的滑出 / 滑入动画自然地把它们揭开 / 覆盖，Web 侧无需逐帧同步：
   - 键盘 → 面板（点 ⊕，检测 composer 持有焦点）：`startImeSwap('panel')` 冻结 frame padding → 面板免弹入立即就位（在键盘下方被盖住）→ blur + 防官方 refocus → 键盘滑落把面板揭出来；
   - 面板 → 键盘（点输入框）：`startImeSwap('kb')` → 面板免收起留在原地 → 立即 `focusComposer()` → 键盘上滑把它盖住；
   - **resize 跳变 = 落地时刻**：K70 实测 visualViewport resize 是一次性跳变（开：focusin 后 ~126ms，875→524；收：一次 524→875），拿不到逐帧键盘动画。`settleImeSwap()` 在跳变时令 `padding = 切换前屏幕底距 - (满高 - 当前视口)`（钳 ≥0），输入行屏幕位置保持不动，随后清内联 padding、由 frame 的 0.18s 过渡滑向目标态——「键盘→面板」方向输入行随键盘落到面板顶，「面板→键盘」方向输入行原地被键盘覆盖；
   - 面板未渲染完（官方异步打开 + resize 来得早）时保持 hold 位、80ms 轮询到 `--dshm-panel-space` 就绪再落地，避免输入行先坠底再弹起；600ms 兜底强制落地；
   - **标记必须挂在 `<html>` 上**：挂在面板节点上会被官方 React 收起/打开时的重渲染抹掉，面板闪现一下（看起来像「收起又快速打开」，真机复现过）；html 属性不受官方管辖。切换标记在面板消失时（`syncPanelSpace` no-panel 分支）清除，面板存续期间保持免动画，防止清除后 pop-in 动画重放；
   - 0.1.11 的等高方案（`--dshm-add-panel-h` / `addPanelHeight`）已删除：等高是为「瞬换」服务的几何前提，揭开模型不需要，且用户要求面板保持内容自适应高度。
6. **开合动画（0.2.9）**：面板及其内部菜单（`[data-dshm-popover]` 的直接子元素）入场走 `dshm-pop-in`（0.18s ease-out 上滑淡入，逐层错峰），关闭走对称退场（`closeOfficialAddMenu` 补）；减动效宿主与动画缩放为 0 的宿主整体跳过。此前「面板瞬间出现 / 消失而输入框慢慢过渡」的不同步就是缺这组补间。

### 3.3 加号面板分页与配色

- 官方 ⊕ 菜单 surface 被 `tagComposerMenus` 打标后，`collectAddOptions()` 收集条目（去重：`isDuplicateAddOption` 认官方与 drop 别名），`planAddPages()` 按行上限分页，`AddPager` 渲染页点。
- 配色：`tintHash()` 按别名哈希从 12 档柔和色（蓝/橙/紫/绿 4 系）落位，同类型同色、同屏不撞色；新增功能零代码自动配色。

### 3.4 设置页手机化

- 官方设置对话框被 `tagSettings` 整体改造为全屏面板（`data-dshm-settings-*` 属性族）：品牌行 + 可横滑页签 + 返回键。
- 页签滑动：`canStartSettingsSwipe` 判定起手合法性（不在卡片/列表内），`swipeDirection` 判方向，`nextTabIndex` 钳边界不循环，`centerSettingsTab` 滚动对齐激活页签。
- **左边界滑动退出（0.2.9）**：手势引擎把设置页起手单独拆成 `settingsExit` 模式——面板在屏上且起手在内容区（准入与翻页一致）时进入本轮跟踪，但面板是否跟手由 `settingsPagerCanConsume(dir)` 决定：**方向会被页签翻页吞掉（内容区还没到边界）就让路换页、面板不动；只有最左页签上、翻页吞不掉的方向才让面板跟手退出**（`beginSettingsFollow`）。最终版规则（用户验收收敛）：左滑（翻下一页）一律让路，右滑仅在 `index > 0` 时让路——即「仅保留左边界的滑动退出」，不再从最右页签左滑退出。
- **退出吸附**：`settingsSettle(ratio, velocity)` 与抽屉同一套甩动优先逻辑（比例 0.38 / 速度 0.35 px/ms），两侧对称（退出中途拖回不吸出）。面板开合本身补 198ms 滑动过渡（`animateSettingsPanel`，`transition`/`translate` 带 `!important` 防官方内联样式抢占），与减动效宿主兼容。
- 返回键 `ensureSettingsBack` 是**真实 DOM 插入**到官方页签行最左——此处行容器单一可控，每次同步重插防官方清除。

### 3.5 Composer 融合

`syncComposerPad` / `syncComposerFrame` / `syncComposerEdge` 把输入区压平融合底部面板（去圆角/边框/阴影、全宽同表面、1px 分界）；`syncComposerChips` 把权限 / 模型短名 chip（`permissionShort` / `modelShort`，中英文表驱动）留在输入行，「完全访问 / Full access」恒标红。

`syncComposerClip` 给滚动容器打 `[data-dshm-composer-clip]`：**手机布局全预设生效**（0.4.0 起不再仅悬浮）——隐藏经典滚动条（`scrollbar-width: none` 只覆盖了 seat 子树，scrollBody 这类 seat 的父级会漏）并取消官方 `scrollbar-gutter: stable` 的 5px 沟槽，否则空态卡左 0 / 右 7 不对称。`default` 预设不进 mobile，不受影响。

### 3.6 底部表（会话表 / 插件表）的视觉与把手

**这是一条有意的本地视觉分支**：会话表与插件表不再沿用自绘的「白卡片 + 16px 圆角」，而是对齐引擎 v1.4.57 官方弹层（「预览版说明」卡片）的设计语言。同步上游时这层样式可能被整体覆盖，`test/sheet.test.js` 与 Android 侧 `scripts/probes/_test_builtin_plugins.py` 都做了字符串锁，CI/探针会先报出来。

- **抬升面**：官方卡片是 `rgb(44,44,46)` 卡片压在 `rgb(13,13,14)` 页面上、外加 1px `rgb(61,61,62)` 描边。这里用「页面底色 + 9% 白叠加」等效实现（`linear-gradient(...), var(--dsw-alias-bg-base)`）——浅色主题下白叠加几乎无效，自动退化为白底 + 描边，不需要额外的主题分支。
- **尺寸**：圆角 28px（只圆上方）、高度上限 `min(max(300px, 64% 视口), 顶部条以下)`、内边距 10px；行高 52px、字号 15px、行圆角 14px；主操作按钮为 999px 胶囊且颜色对调（`label-primary` 作底、`bg-base` 作字）。
- **入场动效**：遮罩 45% + 180ms 淡入，面板 220ms `cubic-bezier(0.32, 0.72, 0, 1)` 自底部上滑；`prefers-reduced-motion` 段必须同时列 `.dshm-sheet` 与 `.dshm-sheet-mask`（面板的降级容易漏，漏了就是「遮罩不淡入、面板照样滑」）。
- **把手拖拽关闭**：只在 `.dshm-sheet-grabber` 上识别（`touch-action: none` + pointer capture，避免与列表滚动抢手势）。按下时清掉入场动画与过渡并接管 `transform`，位移实时跟手、向上拖钳 0；松手时 `shouldCloseSheetByDrag(dy)` 判定——超过 `SHEET_DRAG_CLOSE_PX`（96 CSS px，约拇指一节）即关闭，否则 200ms 回弹。`pointercancel` 与 `pointerup` 同路径，被系统手势/来电打断也能正确收尾。
- **为什么不直接在列表上做下拉**：列表是滚动容器，下拉手势与 `overflow-y: auto` 的回弹/滚动冲突，误关闭率远高于收益；把手是官方卡片自带的「拖拽暗示」，也是唯一能同时表达「可拖」与「不干扰滚动」的位置。

### 3.7 选择器与空态键盘守卫（0.2.5–0.2.8）

模型 / 权限选择器（`[data-dshm-picker]`）在**无模型空态**下打开会弹出软键盘：官方选择器把自动落焦落在内部搜索框上。三层守卫：

1. 打开选择器时主动 `blurComposer()` 收掉落焦（0.2.5，`511ede1`）；
2. 无 `[role=listbox]` 标记打不上「选择器」身份时，按搜索框 placeholder（`^(搜索|search)/i`）**语义兜底**识别（0.2.7，`cc0669f`）；
3. `focusin` 兜底防官方异步 refocus；`pointerdown` 对已标记选择器内的输入框**一律记录**到 `pickerFocusGuard.lastTouch`（0.2.8，`9a6e443`——此前记录动作也带 placeholder 条件，缺 placeholder 属性的搜索框漏记，用户真点搜索框会被误 blur）。

### 3.8 三预设与设置页接管（0.3.x–0.4.0）

三层解耦：宿主 host → 手机形态 phone（`data-dshm-form`）→ 外观预设 preset（`data-dshm-preset`：default / classic / v2，持久化 `localStorage['dshm-layout-preset']`）。切换入口只有设置页「布局模式」三卡片。

- **选择器 i18n（0.4.0）**：三卡片挂在官方滚动容器里、不订阅插件 state，官方切语言不重建这块 DOM——文案会停在构建时的语言。`syncLayoutPickerTexts(box)` 按 `data-value` 重刷 head 标题、各卡 title / hint / aria-label；`syncLayoutPickerState` 开头统一调用（即每次预设变化也刷新），`locale/change` 回调（`applyLocale`）补调 `syncLayoutPicker()`。
- **设置页双形态接管**：`syncSettingsPanel` 按预设双向——融合 / 悬浮钉全屏（清原生残留内联），原生钉居中悬浮窗；`clearSettingsPanel` 按 `SETTINGS_HARDEN_KEYS` 逐节点 `removeProperty` 还原官方内联（含 `max-width`），否则原生 `max-width:352px` 泄漏会卡窄全屏面板。
- **原生悬浮窗几何**：`settingsFrameMetrics()` 纯函数（有契约单测：left === right 逐字符相同、含 vpad/safe-x 变量、纵向不强制相等）产出四边 + `max-width: min(480px, 100vw - 2*gutter - 2*safe-x)` + `margin: 0 auto`。官方 `max-width:352px` + `left:12/right:12` 是 over-constrained，LTR left 优先 → 面板偏左，这就是「悬浮窗偏左」的根因。
- **切原生不再关闭设置页**：`clearSettingsPanel` 消费历史前检查 `state.settingsOpen` / `officialSettingsDialogAlive()`；`setMode(default)` 只在设置页与官方弹窗都不存活时才 `history.back()`——否则 popstate 会让官方卸载设置弹窗（探针实测 BACK→POP→OVL-REMOVED 仅 23ms）。
- **单实例守卫**：宿主在插件页禁用插件**不调 dispose**、启用**不重新 apply**；旧实例晚 dispose 会清空订阅者、置空 `runtime.setPreset`。`apply` 开头 `activeDispose` 同步清场、末尾登记，`dispose` 里 `activeDispose === dispose` 才自清。
- **插件自带配置页兼容（0.4.0）**：dsh-pet 桌宠配置 / dshmarket 插件市场实测。`isSettingsContentBlock` / `hasSettingsContent` 按几何 + 内容量判定（不再强依赖表单控件）；`tagSettingsCards` 限定外观小节；`findSettingsScroll` 兜底排除 nav / brand。

## 4. i18n

- `STRINGS` 表驱动，`t(key)` 取词；语言跟随官方 `locale` 服务（监听 `locale/change`），服务缺席退回 `<html lang>` / `navigator.language`（`detectLang`）。
- 文案集中在表里新增，不在逻辑里散落；设置页页签、底部表、加号面板标签、布局模式三卡片全部走表。
- **挂在官方滚动容器里的自绘节点（布局模式选择器）不订阅 state**，语言切换后必须显式重刷文案（`syncLayoutPickerTexts`，见 §3.8）——这类「官方不重渲染就不更新」的节点是 i18n 漏网重灾区。

## 5. 状态与浮层互斥

浮层四类：抽屉、底部表、⊕ 面板、设置页。互斥规则：

- 打开任一浮层先关其他（`openSheet` 内先 `requestDrawer(false)` 等）；层序栈 `syncOverlayHistory` 记录打开顺序，Esc / 系统返回 / 遮罩点击 / 把手下拉按栈逐层关（`onKeyDown` 的优先级：设置页 → 底部表 → ⊕ 面板 → 抽屉 → 右栏全屏）。
- 关闭瞬间记录 `popoverClosedAt` 类时间戳，防止官方浮层的收起事件又触发插件侧重开。
- 官方全局面板（panelInfo）激活时：底部条隐藏、hero 清除、手势接管——面板页自身不是插件的浮层，是官方页面。

## 6. 真机部署与调试（Redmi K70 / MuMu）

### 6.1 adb 部署

```sh
ADB="D:/Apps/QtScrcpy/adb.exe"   # 模拟器 + 物理设备都可用
export MSYS_NO_PATHCONV=1        # Git Bash 下防止路径改写
SERIAL=127.0.0.1:7555            # MuMu；第二台 127.0.0.1:16576；K70 用 USB serial
DST=/data/data/app.dsh.mobile/files/dsh-home/profiles/web/node_modules/@xiaopb/dsh-mobile-layout/lib/client.js

"$ADB" -s $SERIAL push lib/client.js /data/local/tmp/client.js
"$ADB" -s $SERIAL shell "su -c 'cp /data/local/tmp/client.js $DST'"
"$ADB" -s $SERIAL shell am force-stop app.dsh.mobile
"$ADB" -s $SERIAL shell "monkey -p app.dsh.mobile -c android.intent.category.LAUNCHER 1"
```

- K70：物理 1440×3200 @560dpi，CSS 视口 ≈ 411×917（÷3.5）；MuMu：720×1280，CSS 400×684。
- 无 root 路径：`exec-in run-as app.dsh.mobile sh -c 'cat > files/dsh-home/…/client.js' < lib/client.js`。
- 部署后 `md5sum` 双端校验；**临时探针必须先从本地 `lib/client.js` 移除再 `npm run check`**，防止探针代码混进提交。
- **几何结论以 DOM 探针为准，不要拿截图像素换算**：截图是物理像素，加状态栏偏移，误差足以误导判定。

### 6.2 DOM 探针法（定位样式/判定 bug 的标准流程）

把只读 IIFE 探针插到 `apply(ctx)` 开头（须 `typeof window !== 'undefined'` 守卫，且用全局 `document` / `window`——apply 内局部 `doc`/`win` 在模块顶层不可见），复刻可疑判定逻辑，结果渲染成 fixed 黄色浮层（比 logcat 直观），测完按 `/* TEMP-PROBE: */ … /* TEMP-PROBE-END */` 标记整块删除：

- 探针挂 `scroll`（capture + 350ms 合帧）可实时跟踪几何变化；
- **浮层行过长会被屏幕截断**——一行一个字段组，宁可多行；
- **真机进不去设置页时切预设的捷径**：探针里 `localStorage.setItem('dshm-layout-preset', 'v2') + location.reload()`，走正规初始化路径（比手改 DOM 可靠）；
- 探针法的经典战例：0.1.9 前的「滚回顶部不回显」bug、0.1.15 的抽屉手势失效（第三方页面整页横滚 + 事件被吃，探针证明冒泡监听根本收不到 touchmove）、0.4.0 的融合虚框 7px 右偏（逐层打印 L/Rgap/padding/scrollbar-gutter 收敛到 scrollBody）都靠它定根因。

### 6.3 UI 自动化要点

- `input tap/swipe` 坐标是**物理像素**；软键盘弹起后底部条整体上移，「更多」等键的纵坐标会变（K70 实测 y 3118 → 1780）。
- 验证浮层时序用双截图法：动作后 0.4s 抓中间帧（键盘/过渡态）+ 1.5s 抓终态。

## 7. 键盘高度的获取（Android 壳桥接约定）

WebView JS **没有**"不弹键盘就知道高度"的 API；来源按优先级：

1. **原生注入（推荐，最准）**：Android 壳（Kotlin）用 `WindowInsetsCompat.Type.ime()` 拿精确值，经 JS 推给 WebView。插件侧读取约定（二选一）：
   ```kotlin
   // Kotlin 侧（API 30+；需 WindowCompat.setDecorFitsSystemWindows(window, false)）
   ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
       val imePx = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
       val css = (imePx / resources.displayMetrics.density).toInt()
       webView.evaluateJavascript(
           "window.__DSH_IME_HEIGHT=$css;window.dispatchEvent(new Event('dsh-ime-height'))", null)
       insets
   }
   ```
   插件读取 `window.__DSH_IME_HEIGHT`（CSS px 直给）或 `window.DshAndroidKeyboard.heightPx()`（物理 px，按 devicePixelRatio 换算）；`dsh-ime-height` 事件触发插件立即重算。
2. **visualViewport 实测**：adjustResize 下视口收缩量 = 键盘高（≥120px 显著收缩才采纳，防 pinch-zoom 误判）；测得后写 localStorage（`dshm-ime-height`），跨会话持久化——只需真弹一次键盘。
3. **启发式估值**：视口 × 42%，仅"从未开过键盘且无持久化值"的首次兜底，开过一次即被实测覆盖。

## 8. 已知限制与回退

| 限制 | 原因 | 缓解 |
|---|---|---|
| 系统边缘返回无法拦截 | WebView 无系统手势权限 | 打开区扩到左 60% 屏宽 |
| 官方重渲染可能掉锚点属性 | 插件不拥有官方 DOM | sync* 幂等重打；MutationObserver 兜底 |
| 锚点失败 | 官方改版 | 打标失败不阻断启动，对应功能静默降级 |
| 桌面端不激活 | 原生窗控/鼠标交互与移动布局冲突 | 宿主判据硬性排除 |
| 回退 | — | 卸载插件或 `dispose()` 即还原；样式全在 scoping 属性之下，不残留 |
