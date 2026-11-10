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
| 松手吸附 `drawerSettle` | 甩动优先（速度模值 ≥ 0.35 px/ms）；否则位移比例 ≥ 0.38 展开 | 快速轻扫不必拖过半屏；两阈值取偏小值，手机上「拖出 1/3 屏 + 稍快」就该算明确意图。比例阈值两侧对称（展开态拖回 <0.38 才收） |
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

### 3.9 顶部状态带、键盘判定与键盘态占位（0.4.1）

真机（iPA2575 平板小窗 + 悬浮预设）连着报的两个症状，根因都在「按文案猜结构」和「按设备像素比高度」：

**① 状态带（轮次 / Token / 缓存命中 / 上下文）掉回输入区下方。** 官方这三块在 `div[data-composer-dock]`（`conversation.composer.dock` 槽位）里，插件把它固定到标题栏下方当常驻状态带。0.4.0 的定位链是「tok 按钮 + 上下文按钮的 aria-label 配对 → 爬公共祖先」，两处宿主变化都会失配：

- 官方是 `activity ? null : <ContextMeter/>`——**智能体执行期间上下文环整块不渲染**，配对必然缺一半；
- 新宿主顶栏多了「对话 / 轨迹 / 上下文」切换条，`/上下文|context/i` 先命中**页签**；`buttons.find` 取的是 DOM 顺序第一个，于是 `context` 指向标题栏里的页签，爬祖先一路爬到中心列，命中 `dock === root` 分支 → `clearStatsBar()`。这条与截图症状完全一致（页签可见、状态带在底部）。
- 兜底路径 `findTurnDock` 的文本上限 40 也太紧：官方补上「缓存命中 95%」后，三枚胶囊 + 上下文环的 `textContent` 拼接正好 **41** 字符（「3 轮 24 步 · 231 tok/s」+「693K tok · 缓存命中 95%」+「4%」），整行被拒。

修法：**优先认结构锚点 `[data-composer-dock]`**（运行中与空闲都在，与文案无关），`dockHasStats()` 只判「这个 dock 里有没有统计内容」（`[data-composer-stat]` / 带「上下文」的按钮 / 轮次文本），aria 配对降为老宿主退路；文本上限放宽到 `STATS_TEXT_MAX = 80`。另外 `statsBandHeight()` 在已打标后改量**子项**——固定高度写回 `--dshm-stats-height` 后，量自身得到的是上一次写进去的值，会自指。

**② 键盘判定被页面缩放误触发（底部导航整条消失）。** `visualViewport.height` 随页面缩放等比变化：826dp 窗口 + 150% 缩放量出 551，差 275 ≥ `IME_MIN_PX(120)` → 误判键盘弹出 → `data-dshm-ime` → v2 导航 `opacity: 0`。改为统一换算成**布局 px**（`layoutHeightPx = round(clientHeight × scale)`）再比较，对缩放免疫；判定拆成 `layoutHeightPx` / `isKeyboardOpen` 两个纯函数便于单测。

**③ 键盘弹起后输入框与键盘之间一条白带。** 键盘态只把导航做了 `opacity: 0`，但官方 `shell.bottom` 是 grid 的**第二行（尺寸 auto）**，行高由导航自身的 `--dshm-v2-nav: 56px` 撑着——导航看不见了，高度还在，输入卡就被顶到离键盘整整一条导航远的地方（1260×2800 / ≈3x 截图实测约 200 物理 px ≈ 56dp + 8px 阴影净空）。淡出只解决「眼睛看见导航」，不解决「导航占位」。
修法：`[data-dshm-ime]` 下把该行 `height: 0`（含 `min-height` / 上下内边距 / `overflow: hidden`），卡片下面那 8px「阴影净空」一并归零（阴影落在键盘上本来就看不见，留着只是一条白缝）；设置页弹窗底边同步从 `--dshm-v2-nav` 落到 0。锁法：`test/ime.test.js` 里一条 CSS 契约用例扫源码，防止以后被「只做淡出」的改动带回来。

### 3.10 焦点归还与输入法（0.4.2）

真机反馈：**焦点在输入框 → 手动收起软键盘 → 打开侧边栏 → 收起侧边栏**，键盘被自动唤起，且输入卡被压在键盘下面。

Android 平台事实：**对 `input` / `textarea` / `contenteditable` 调 `focus()`，不需要任何用户手势，系统就会把软键盘拉起来。** 所以插件的焦点管理必须把这类元素排除在外。

两条独立缺陷叠在一起：

1. 抽屉的焦点进出按「打开时记住 `activeElement`，关闭时还回去」实现。打开抽屉前焦点就在 textarea 里（用户只是收了键盘，没移走焦点），于是收起抽屉时 `prev.focus()` = 一次脚本聚焦 = 键盘重新弹出。
2. 这一路是脚本触发的聚焦，WebView 侧的键盘让位（`visualViewport` / `clientHeight` 收缩）不一定跟着到位，于是输入卡算出来的位置仍是「键盘收起时」的，直接被键盘盖住。

修法：

- `isTextEntry(node)` 判定文本录入控件，**抽屉与底部表收起时都不再归还焦点给它们**（按钮、链接等照旧归还，读屏用户不丢位置）。要接着打字，用户自己点一下输入框——这才符合「收浮层」这个纯导航动作的预期。
- `guardComposerFocusAfterOverlay()`：浮层收起后开一个 **400ms 窗口**，窗内任何落进文本控件的 `focusin` 都下一帧 `blur` 掉（拦官方自己的 refocus：切会话后的补焦、窄屏侧栏收起后的兜底聚焦）。一旦出现 `pointerdown` 立刻撤窗——用户点输入框照常弹键盘。这把「谁 refocus 的」这个变量从等式里消掉了：不管是插件还是宿主，收起浮层都不能把键盘带出来。
- 判定与护栏都是模块级导出（`__test.isTextEntry` / `__test.guardComposerFocusAfterOverlay`），`test/focus-return.test.js` 用 jsdom 覆盖 blur、`pointerdown` 撤窗、非文本控件不受影响。

### 3.11 系统返回栈（手机形态，0.4.5）

**为什么必须插件自己管**：宿主 `layout.selectPanel()` 只改 `panelInfo.activePanelId`，不写浏览器历史（`_dshm-shots/layout.js:407-409`）；Android 壳 `onBackPressed()` 原本是 `canGoBack() ? goBack() : finish()`。于是「插件页 / 自动化任务 / SSH 工作区」这类整页界面在 WebView 历史里没有任何痕迹 —— 按一次返回直接 finish 到桌面。反过来，若 WebView 历史里混入跨文档条目，`goBack()` 又会退到上一份文档，表现为「按返回重新加载了一下」。

**三层模型**

| 层 | 判定 | 条目 | 退出动作 |
|---|---|---|---|
| base | 会话页 | 新壳：`replaceState({dshm:'base'})`，不新增；旧壳：`pushState({dshm:'base'})` 哨兵 | 交给壳的双击退出 |
| page | `panelInfo.activePanelId !== null` | `pushState({dshm:'page'})` | `layout.selectPanel(null)` |
| overlay | `overlayVisible()` + `genericOverlayVisible()` | `pushState({dshm:'overlay'})` | 逐层关闭：子层 → v2 加号 → 设置 → 官方面板 → 头部菜单 → 表 / 抽屉 / 右栏 |

压栈顺序 base → page → overlay；退栈顺序相反。因此栈顶永远是 overlay —— popstate 里不必读 `event.state` 也能确定「刚被消费的是哪一层」。

**四条不变量**

1. `consumable === (depth > 0)`，且只在手机形态为真。壳仅在 `mobile && consumable && canGoBack()` 时 `goBack()`；`consumable=false` 时即使 `canGoBack()` 为真也不回退 —— 这是「不重载」的根。
2. 任何路径禁止 `location.reload()` / `location.href=` / `webView.reload()`；返回只改 DOM 与状态。
3. 无 `dshm` 标记的 popstate 不猜测关闭：先交给 `__dshmBack` 注册者，无人认领只复位。
4. 程序化回退（UI 主动关页 / 切预设）用 `programmaticBacks` 计数，命中的 popstate 只消费、不关闭。

**关闭闸门**：`beginClosingOverlay()` 在返回后 320ms 内只挡 overlay 的压栈（page 不受影响），到期按真实可见性重算。挡的是「关闭动画期间可见性仍为 true → 重复压栈 → 下一次返回空转」；旧实现用 700ms 且连 page 一起挡，导致「面板 + 设置」连按两次的第二次空转。

**跨插件覆盖**

- **页面层不枚举 id**：其它插件经 `main` keyed slot（`ctx.slots.register({name:'main', key})`）注册的页面自动落进 page 层；`selectPanel` 内部用 `ctx.slots.entries('main')` 校验，`selectPanel(null)` 对任何已注册面板都通用。
- **浮层 / 二级页 / portal 全屏页**走开放契约 `window.__dshmBack.register({id, priority, kind, isActive, close})`：`priority` 降序、同级后注册先问，`close()` 返回 `true` 即独占本次返回（对齐 Android `OnBackPressedDispatcher`）。
- **纯 DOM 接入**：浮层根节点加 `data-dshm-back-layer` 即被识别并按「找关闭按钮 / 派发 Esc」兜底；`data-dshm-ignore-back` 可排除。
- **壳侧与页面来源无关**：`DshAndroidBack` 只认 `mobile / consumable / depth`，不认识任何 `panelId`，所以跨插件泛化只动插件侧。
- 底栏高亮对未知 `panelId` 返回 `unknown-page`，避免被误判成「会话页」。

**探针待办**：插件侧 `ctx.slots.entries/subscribe`、`ctx.reflect.provide` 的可用性，以及 `shell.overlay`（list slot）条目是常驻还是按需挂载。当前实现只依赖 `activePanelId` 与 DOM 可见性，不依赖这些结论；探针结果只影响诊断能力。

**旧壳兜底：栈底哨兵**

新壳有 `DshAndroidBack`，插件报 `consumable` 即可；**旧壳没有这个桥**，`onBackPressed()` 只有 `canGoBack() ? goBack() : finish()`。此时插件若按新壳的写法只 `replaceState` 打标、不占条目，会话页 `canGoBack()` 就是 `false`，按一次返回直接 `finish()`。

触发条件 `legacyBackFallback()` 三个同时成立：`runtime.host === 'android'` + `state.mode === MODE_MOBILE` + `hasBackBridge() === false`。**必须限定 Android 宿主** —— 桌面端和纯浏览器里 base 状态按返回就是关页面，塞哨兵反而污染浏览器返回键。

| 时刻 | 历史 | `canGoBack()` | 插件动作 |
|---|---|---|---|
| 进入手机形态 | `[E0(无标记), S1(base)]` | true | 压哨兵；不打标 E0（栈底必须无标记，才能认出「退无可退」） |
| 按返回 | `[E0, S1]` → `[E0]` | false | popstate 无 `dshm` → 弹提示，`baseEntry=false` |
| 2 秒内再按 | `[E0]` | false | 壳直接 `finish()`（用户想退，放行） |
| 超过 2 秒 | `[E0, S1']` | true | 定时器重压哨兵，恢复可回退 |

关键点：**提示期间故意不压回**。如果退到底就立刻重压，`canGoBack()` 永远为真，用户永远退不出去 —— 这是哨兵方案最容易踩的死锁。哨兵也不计入 `depth` / `consumable`（它不代表用户能看到什么），离开手机形态或换到带桥的新壳时由 `planBackStack` 的 `staleBase` 分支退掉。

提示条是插件自绘的 `[data-dshm-exit-hint]` 节点：`position:fixed`、`pointer-events:none`、尺寸用 `em`（跟随系统字号），不参与布局也不挡触摸。文案走 `STRINGS[*].backExitHint`，与新壳 `R.string.back_exit_hint` 语义一致（样式不同，时序一致）。

**回滚**：`localStorage['dshm-back-stack'] = 'off'` → 只维护 overlay 一条，并上报 `mobile=false` 让壳走原逻辑（等价 v0.4.4）；哨兵同样不压（`backStackEnabled()` 是 `legacyBackFallback()` 的条件之一）。

### 3.12 会话视图页签与「⋯」折叠（0.4.5）

**现象**：手机上「对话 / 轨迹 / 编辑器」这排页签，宽度明明还够，第三个却被收进「⋯ 更多会话视图」。

**判据在官方侧**（`@deepseek-ai/dsh-client-ui-conversation/lib/client.js`，`ConversationSessionHeader`）：

```js
const updateLimit = () => {
  setVisibleViewLimit(Math.max(1, Math.floor((row.clientWidth - 48) / 120)));
};
const visibleTabs = hasEntryActions ? preferred.slice(0, visibleViewLimit) : preferred;
const moreTabs = tabs.filter((t) => !visibleIds.has(t.id));
```

即**每个视图按 120px 预留**、再扣 48px 给 ⋯。而实测页签间距只有 58px（26px 文字 + 32px 内边距），口径差一倍多：手机 CSS 宽 392 时 `row.clientWidth ≈ 344` → `floor(296/120) = 2` → 只露两个。

视图来源是 `conversation.view` 槽：内置 `chat`、`trajectory`（且 `trajectory` 需开启开发者工具），「编辑器」由 `@xiaopb/dsh-solution-explorer` 以 `id: "solution-explorer-editor"` 注册。所以只装本插件时模拟器上只有两个页签，要复现必须额外装那个插件。

**做法**：公式只读 `row.clientWidth`，改不动，但 `clientWidth` 是 border-box 宽度 —— 给页签行补一段不可见的横向余量即可。`syncViewTabsRow()` 给 `[data-conversation-tabs]` 的父元素打 `data-dshm-viewtabs-row`，CSS 在手机形态下：

```css
[data-dshm-viewtabs-row] { width: calc(100% + var(--dshm-viewtabs-extra, 360px)) !important; }
[data-dshm-center] { overflow-x: clip; }
```

内容仍左对齐，行尾多出来的是空白；溢出的那截由中心列裁掉。实测（CSS 宽 392）：

| 状态 | `row.clientWidth` | 名额 | 可见页签 | `scrollWidth` |
|---|---|---|---|---|
| `--dshm-viewtabs-extra: 0` | 344 | 2 | 对话 / 轨迹 / ⋯ | 392 |
| 默认 360px | 704 | 5 | 对话 / 轨迹 / 编辑器 / ⋯ | 392 |

`--dshm-viewtabs-extra` 是公开旋钮：设 0 即回到官方行为。

### 3.13 工作台（右栏）的两种状态机（0.4.5）

Android 窄屏下右栏是**官方自己的浮层**，和桌面列不是同一套状态：

| 标记 | 含义 | 由谁撤销 |
|---|---|---|
| `[data-rightbar-fullscreen]`（在 `[data-dshm-frame]`） | 是否占满宽度 | `layout.closeRightbar()` |
| `[data-sidebar-right-open]`（在 `[data-sidebar-right-panel]`） | 浮层在不在 | 只有官方「收起右侧边栏」按钮 |

`closeRightbar()` 只做前者。旧实现按返回时只调它 → 面板继续全屏、返回栈却已归零，用户被卡在工作台且再按返回只能退出 App。现在 `closeRightbarSafe()` 先按 `aria-label`（`收起右|收起侧|关闭…|collapse/close sidebar`）找官方按钮点击，找不到才退回 `closeRightbar()`；`nextBackTarget` 的右栏判据同时认两个标记，覆盖短暂不同步的中间态。

### 3.14 引擎 0.2.2-rc.1 契约适配与设置页统一全屏（0.4.7）

`@deepseek-ai/dsh-client-ui-layout 0.2.2-rc.1`（App 1.5.0）把抽屉改成了独立 overlay dialog，官方节点上开始稳定地挂 `data-shortcut-modal`：

| 官方标记 | 含义 | 插件判据 |
|---|---|---|
| `[data-shortcut-modal="settings"]` | 真设置弹窗 | 正向识别，唯一入口 |
| `[data-shortcut-modal="sidebar"]` | 手机抽屉 | 一律排除（旧启发式会把它误标成设置页） |
| `[data-shortcut-modal="shortcut-edit"]` | 快捷键编辑 | 一律排除 |

`classifyDialog()` / `stillMatchesSettings()` 把「按 role + nav + 文案猜」换成契约分类与缓存复查；`pruneSettingsTags()` 负责把误标过的节点擦干净。配置 UI 则优先注册官方 list slot `settings.general.item`（`id: 'dshm-layout'`，`order: 10.5`），`chooseSettingsPath()` 按 `safe` → `forceLegacy` → slot 已挂载 → 注册宽限期 → legacy 依次选路；`applyLocale()` 在 slot 路径下额外 `setState({})` 触发 React 组件重渲染（React 节点不会像自绘 DOM 那样被 `syncLayoutPickerTexts` 扫到）。

能力探测只读：`window.__dshmCompat` 暴露 `mode`（`native` / `legacy` / `safe`）、`settingsPath`、`settingsSlotSeen`、`dialogContract`、`engineVersion`、`reason`。不解析 UA（平板 AVD 的 UA 是桌面 Chrome，与 JS 桥判 android 两套口径并存），未知引擎一律降级，任何失败只 `console.warn`。回滚：`localStorage['dshm-compat'] = 'legacy' | 'safe'`、`localStorage['dshm-settings-slot'] = 'off'`。

**统一全屏**：0.4.6 给原生预设单独做的悬浮窗重排（CSS 钉 12/24px 边距 + `hardenSettings()` 内联 `!important` 几何）在这个引擎上把标题、页签右端和内容底部裁掉，周围还留大片灰色遮罩。0.4.7 把全屏规则的作用域从 `html[data-dshm-mode="mobile"]` 改为 `html[data-dshm-form="phone"]`——原生预设 `mode=default`，旧规则根本不生效——并停用整套原生悬浮窗 CSS（`...(SETTINGS_UNIFIED_FULLSCREEN ? [] : [...])`）与内联旧分支。悬浮（v2）预设仍按设计在底部留 56px 给五项导航。

**关闭路径**：0.2.2-rc.1 把「打开配置文件 / ✕」工具行移到了内容区之外，`tagSettings()` 原先只在 `content.children` 里找工具行，导致 `data-dshm-settings-close` 永不打标，返回箭头 / 系统返回 / Esc / 左滑手势四条退出路径同时失效。`closeSettingsImmediate()` 现在按 `[data-shortcut-modal="settings"]` 正向找官方关闭按钮并点击，找不到才退回清标记。

### 3.15 版本适配矩阵与声明口径（0.4.7 发版后补文档）

对外矩阵放在 `README.md` / `README.en.md` 的「版本适配与 DSH 引擎兼容性」一节（插件版本 → DSH 版本 + 反向速查两张表）。这里记录**证据链**，避免以后凭印象改表。

**「DSH 版本」的定义**：指宿主内核 / 官方 UI 布局包 `@deepseek-ai/dsh-client-ui-layout` 的版本，不是 Android App 的 `versionName`。二者不是一一对应，只有 `0.2.2-rc.1 ↔ App 1.5.0 / BUILD 2026.11.06-4566c0be` 有实测记录，`0.2.1-rc.x` 的 App 对应关系未记录，表里留空而不是猜一个。

**两个字段不是一回事**：

| 字段 | 引入版本 | 谁读它 | 语义 |
|---|---|---|---|
| `engines.dsh` | 所有已发布版本均为 `>=0.2.1-rc.2` | 内核 `evaluatePluginCompatibility()`（`@deepseek-ai/dsh-app-boot`），与 `peerDependencies` 一起 | 安装判定；只表达「最低线」，不表达「某版本已适配」 |
| `dsh.compatibility.dshReleases` | 0.4.4（见 `eb009d9`） | 插件市场 / 商店索引 | 逐版本声明 `compatible` / `incompatible` / `unknown`；**不参与安装判定**，未列出即 `unknown` |
| `dsh.compatibility.capabilities` | 0.4.7 | 索引 / 诊断 | 声明用到的 slots / services 与弹窗契约 |

因此「能装上」≠「已适配」：所有版本的 `engines.dsh` 都是 `>=0.2.1-rc.2`，0.4.6 装到 0.2.2-rc.1 上照样通过安装判定，但功能坏。这也是 0.4.7 增加 `window.__dshmCompat` 三态降级的原因——未知引擎不能靠「装上了」就假定契约还在。

**逐标签取证**（`git show <tag>:package.json`）：

| 标签区间 | `version` | `engines.dsh` | `dshReleases` |
|---|---|---|---|
| `v0.1.6` – `v0.4.3` | 0.1.6 → 0.4.3 | `>=0.2.1-rc.2` | 字段不存在 |
| `v0.4.4` – `v0.4.6` | 0.4.4 → 0.4.6 | `>=0.2.1-rc.2` | `0.2.1-rc.2`、`0.2.1-rc.5` = `compatible` |
| `v0.4.7` | 0.4.7 | `>=0.2.1-rc.2` | 再加 `0.2.2-rc.1` = `compatible` |
| `v0.4.8` | 0.4.8 | `>=0.2.1-rc.2` | 沿用 0.4.7（无新增引擎声明；新增平板宽屏手势与 0.2.2-rc.1 二轮修复，见 §3.16） |

`0.2.1-rc.2` / `0.2.1-rc.5` 的「实测可用」结论来自 0.4.4 更新日志，0.4.7 沿用；0.4.7 对 `0.2.2-rc.1` 的验证是两台 AVD（`Medium_Phone_API_35` / `Pixel_Tablet_API_35`）+ Redmi K70 的三预设 × 深浅主题 × 中英文矩阵，见 CHANGELOG 0.4.7 与 §3.14。0.4.6 及更早版本在该引擎上的三个故障（选择器失效 / 原生设置页悬浮小窗裁切 / 设置页关不掉）均为实测，不是推断。

**维护约定**：新增引擎版本适配时，同时更新 `package.json` 的 `dshReleases`、README 中英两张表、本节取证表与 CHANGELOG；若只是「装得上但没验证」，标 `unknown` 而不是 `compatible`。

### 3.16 平板宽屏侧栏滑动手势（0.4.8）

**形态前提**：`effectiveMode()` 的分层判据里「非手机竖屏几何 → 恒 `MODE_DEFAULT`」保证平板 / 宽窗不受预设影响，三预设实测都走官方原生页（`data-dshm-mode` 不写、无插件底栏 / v2 导航）。所以宽屏需要的不是另一套布局，而是在官方布局之上**只注入一层手势**。

**为什么不能复用手机抽屉手势**：宽屏侧栏是常驻列，收起后变窄条 rail，没有 overlay / 遮罩 / `will-change` 跟手位移；收起会推动整个主内容列，做跟手必然整页抖动。因此宽屏走**阈值触发 + 官方 toggle/过渡**，不跟手、不改内联几何。

**判据（纯函数 `decideWideSidebarSwipe()`，单测覆盖）**：

| 条件 | 结果 |
|---|---|
| 起手 `startX ≤ width/2` 且 `dx > 0`、当前收起 | `open` |
| 起手 `startX ≤ width/2` 且 `dx < 0`、当前展开 | `close` |
| 右半边起手 / 反方向 / 竖滑（`\|dy\| > \|dx\|×0.72`）/ 横滚容器消费 / 位移不足 `SWIPE_MIN` | `none` |

起手区按用户要求统一为**整页左半边**（两个方向对称），不限制在 ~64px 的窄条上；右半边一律交还内容自身。控制器里 `dx/dy` 与手机分支共用，宽屏分支额外传 `width: doc.documentElement.clientWidth` 与 `blocked`。

**弹窗层级拦截**：`wideModalBlocked()` 按 0.2.2-rc.1 官方契约查 `[data-shortcut-modal]` 与 `[role="dialog"][aria-modal="true"]`。`gestureStart` 里命中即整轮 `BLOCKED_LAYER` 放弃，`gestureMove` 结算前再实时复核一次（防手势途中弹窗出现）。**不能并进 `overlayBlocked()`**——手机分支里「设置页在屏时仍要能左滑退出」依赖 dialog 不阻断手势，两者语义相反。

**门禁放宽**：`gestureEligible()` 从 `mode === MODE_MOBILE || state.phone` 放宽到「非 desktop 宿主即可」；`gestureStart` 用 `wideSwipe = mode !== MODE_MOBILE && !phone` 分流，宽屏不参与抽屉跟手 / 设置页左滑退出 / 工作台横滑退出（这些都是手机形态语义），桌面鼠标拖拽仍不启用。

**两个踩过的坑（值得记住）**：

1. **枚举字符串不能真值判断**。控制器首版写 `if (wideDecision)`，`'none'` 是非空字符串恒为真 → 任何被拒绝的滑动都打「→ 收起」日志并执行 `requestDrawer(false)`，表现为用户反馈的「只能滑关、不能滑开」。修复为 `if (wideDecision === 'open' || wideDecision === 'close')`。这个 bug 在控制器而非纯函数里，单测覆盖不到，是 AVD 真实触摸用例的矛盾日志抓出来的。
2. **多设备 CDP 调试工具禁止硬编码端口**。排查中 `.tmp/audit/cdplib.mjs` 把端口写死 `9222`（转发到手机 AVD 5558），而平板走 `9350`，导致「同一页面 innerWidth 在 1280 / 457 间振荡」的假象，误判成 App 自由窗口来回切换、追了很久。已改为 `CDP_PORT` 环境变量覆盖；`cdp.mjs` / `cdpseq.mjs` 一直按参数取端口，平板上的滑动测试自始至终有效。另：CDP forward 绑 pid，模拟器 / App 每次重启都要按新 `pidof` 重建。

**验证**：平板 AVD（`Pixel_Tablet_API_35`，1280×752）十项真实触摸用例全通过（左半边两方向开合、右半边反例、边界 640、伪模态弹窗拦截 + 移除恢复、复测）；手机 AVD 同版回归正常。顺带发现平板 AVD 掉帧瓶颈在 CPU/内存配额而非 GPU（`gfxinfo` 81.8% jank、p95 150ms 而 GPU p50 仅 10ms）：把 `hw.cpu.ncore 4→8`、`hw.ramSize 2048→4096`、`vm.heapSize 192→336` 冷启动后 jank 降到 26.4%、p95 46ms。

### 3.17 可选的胶囊底栏：两个坑（底栏样式层）

底栏原本只有一种外观：透明。有一版把它直接改成浮起的胶囊 + 抽屉把手，规范上留下两个硬伤。现在胶囊被收成**可选样式层**（根属性 `html[data-dshm-dock="capsule"]`，默认关闭、属性不存在即透明），两个坑一并修掉。

**① 胶囊底栏的不透明表面会把输入卡阴影切出硬边。**

- **现象**：胶囊态一开，输入卡下沿的软阴影在胶囊上沿处断成一条直线，看起来像卡片被「截了一刀」。
- **根因**：卡片阴影是 `0 6px 20px`，本来就向下落到导航这一行。底栏与 `.dshm-v2-nav` 保持 `background: transparent` 是既有决策（`lib/client.js` 的 v2 底栏注释、`preset2-progress.md` 坑位 21 / 31），一旦铺上不透明卡片面，阴影下半截就没有落点可画。和「卡片下半截阴影消失」是同一类问题的另一半：那次的裁剪来自 `overflow: hidden` 的滚动画布，这次来自我们自己铺底。
- **修法**：**透明继续做默认**，胶囊是用户显式选择的样式层；并且胶囊态把 8px 阴影净空归零（`[data-dshm-composer-clip]` 的 `padding-bottom`）——卡片下沿直接贴到胶囊上沿，阴影不再在半空被截断，抬起感交给胶囊自己的官方投影（`--dsw-elevation-panel`，缺省回退是整条阴影表达式，颜色取 0.16 档 `--dshm-color-shadow-2`）。

**② 底栏行高从「恰好 56px」变成「导航 + 把手行」。**

- **现象**：胶囊态下四类「按底栏高度让位」的地方同时错位——面板页正文被底栏压住一截、设置弹窗底边压在把手上、工作台右栏底部空出一条、设置面板的内联 `bottom` 让位不足。
- **根因**：这四处原来都直接消费 `var(--dshm-v2-nav)`（56px，恰好等于导航行高）。胶囊态多出一行把手，行高变了而消费点没变，四处各错各的——把 56px 复制到四个地方，等于把同一个约定维护四遍。
- **修法**：新增公开 size token `--dshm-v2-nav-total`，默认 `var(--dshm-v2-nav)`（默认态取值与行为都不变），胶囊态下等于「导航 + 把手行」；四处让位统一改成消费它。以后再给底栏加一行，只改这一个变量。

**规范细节**：把手是 `<button>`（`aria-controls` / `aria-label` / `aria-expanded`，收起时念「展开底栏」），两条横杠 `aria-hidden="true"`，`role="tablist"` 只包五个导航键；收起时把被隐藏导航键上的焦点移到把手；持久化 `localStorage['dshm-dock-style']` / `['dshm-dock-collapsed']` 按设备记。见 [悬浮预设](preset-v2.md)。

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
   ⚠️ **0.4.1 起**：`visualViewport.height` / `documentElement.clientHeight` 都会随页面缩放（`visualViewport.scale`）等比变化，**必须先换算成布局 px** 再与满高比较（`round(clientHeight × scale)`），否则 150% 缩放就会凭空造出 275px 的「键盘」。实测：平板小窗 + 150% 缩放下 v2 底部导航整条 `opacity: 0`，就是这条误判。
3. **启发式估值**：视口 × 42%，仅"从未开过键盘且无持久化值"的首次兜底，开过一次即被实测覆盖。

## 8. 已知限制与回退

| 限制 | 原因 | 缓解 |
|---|---|---|
| 系统边缘返回无法拦截 | WebView 无系统手势权限 | 打开区扩到左 60% 屏宽 |
| 官方重渲染可能掉锚点属性 | 插件不拥有官方 DOM | sync* 幂等重打；MutationObserver 兜底 |
| 锚点失败 | 官方改版 | 打标失败不阻断启动，对应功能静默降级 |
| 桌面端不激活 | 原生窗控/鼠标交互与移动布局冲突 | 宿主判据硬性排除 |
| 回退 | — | 卸载插件或 `dispose()` 即还原；样式全在 scoping 属性之下，不残留 |

### 3.18 胶囊合并形态与「按页换项」（2026-11-08，本轮）

**① 合并成一块卡片，靠贴合而不是搬 DOM。** 官方 `shell.bottom` 是 grid 第二行、输入卡在上一行，改结构会与 React 协调打架。做法是：输入卡只留上圆角、去掉下边框；底栏只留下圆角、去掉上边框；两块取同一个官方卡片面。阴影不能各画各的（上沿会变成一条横贯卡片的暗带），所以底栏用 `clip-path: inset(0 -40px -40px -40px)` 把上方阴影裁掉，只留下侧与左右。

**② 设置页里底栏是 flex 子项，`width:auto` 会缩成内容宽。** 实测胶囊只剩半个屏幕宽（441 → 内容宽）。改成 `width: calc(100% - 2 * var(--dshm-v2-gutter))`，两种容器下都成立。

**③ 工作权限 / 模型 只在会话页存在。** 它们直连输入行的两枚官方 chip；面板页 / 设置页里 chip 不在 DOM，粘性探测（见过一次就记住）保证底栏不会从五项突然缩成三项，点下去时先回会话页再有界重试（~1.4s，照 addMenu 派发链的做法）。

**④ 还没落地：顶部卡片头与分段控件。** 探测结论：官方 ViewTabs 行（`[data-dshm-viewtabs-row]`）的矩形是 769px 宽（视口只有 457px），它在一个横向可滚的容器里，因此「居中分段控件」用 `justify-content: center` + `margin: 0 auto` **不会**居中，而是把内容推到屏幕外。要落地必须先把这一行的宽度约束住（或在其外层包一个受限容器），属于结构性改造，本轮未做，见 plan §8。

**⑤ 顶部卡片头与页签居中（2026-11-09 追加，均为 AVD 实测）**

- 卡片头已落地：给官方 `<header>` 打 `data-dshm-header-card`，渲染成圆角 28 / 面 `bg-layer-2` / 投影的悬浮卡片；header 高度变化后统计带（按 `header.bottom` 量取）会自动跟随（实测 97 → stats-top 77）。
- 页签行不能靠 CSS 居中：该行实测 **769–789px** 宽（视口 457），子节点只有 155px；`width:100%!important` 会把 tablist 压到 97px、三页签（45/45/58=148）挤成一团；`display:none` 会让官方只渲染当前页签（3 → 1），自绘镜像会丢页签。
- 唯一让块「视觉居中」的办法是 `transform: translateX(delta)`（实测 list center 229 == header center 229），但压缩不变，视觉仍不可接受 → 已回滚。
- 结论：页签区要真正做成设计稿的「居中分段控件」，必须**替换这一行的渲染**（自绘 tab 列表 + 转发点击给官方），而不是在官方行上做样式；官方在窄容器下压缩页签的行为是这条路的根因。

**⑥ 输入区一行布局（2026-11-09 追加，7 次尝试，全部回滚）**

目标：`[(输入) ⊕ 回形针 发送]` 一行。失败模式与结论（不要再重复）：

1. `flex-direction: row`：官方 `overlayAnchor`（441px 宽 / 0 高）吃掉整行，工具行被挤出卡片；
2. 负 `margin-top` 上提：工具行被顶到卡片外，且几何测量被 CSS 自污染（量到 24px）；
3. 工具行 `position: absolute`：`width:max-content` 量到 0，行高 87（子项纵向堆叠），按钮浮在卡片上方；
4. 给工具行显式 `width: 9.5em` + `flex-direction: row`：宽度生效但高度仍 87，按钮仍在卡片外；
5. 卡片 `display: grid`（两列 + 0 高兄弟压到第 2 行）：工具行仍是 16px 宽，布局垮；
6. CSS `:has()` 直接命中「包含 ⊕ 的直接子节点」：选中的仍是那个 16px 的窄容器；
7. **把 ⊕ / 回形针 / 发送三枚按钮搬进自建 `.dshm-actions`**：官方 React 重渲染后**整张输入卡被清空**（输入行与按钮全部消失，实测），已回滚。

结论：发布态里 `.uV2eYG_row`（工具行）在**不干预时**是 441×42、子项 93+62 横排；一旦改它的外层布局，同一节点实测变 16×87 —— 说明这类改动会触发官方重渲染并把标签打到新节点上。**一行布局必须整体替换输入卡渲染**（自绘输入行 + 转发 ⊕/发送点击），属于下一阶段的结构性改造，不能用 CSS 渐进实现。

**⑦ 平板不变性验证（2026-11-09）**

- 单测证据：`node --test test/mode.test.js test/preset.test.js test/quick-pick.test.js` → **64 / 64 通过**，其中「平板、横屏、桌面保持 default」「isPhoneForm：平板全屏不命中（短边 > 600）」直接覆盖平板判定。
- 静态作用域审计：胶囊相关的全部选择器（`.dshm-seg` / `.dshm-actions` / `.dshm-dock-foot` / `.dshm-dock-meta` / `.dshm-dock-grabber` 等）都带 `html[data-dshm-mode="mobile"]` 前缀，平板下不会命中任何一条 → 样式层零影响。
- JS 侧：胶囊底栏、分段控件、自绘动作行都只在 `dock === capsule` 且 mobile 模式时创建；平板不进入该分支，DOM 不注入。
- 结论：平板布局与改造前一致（无样式命中、无节点注入）。真实平板 AVD 像素 diff 仍建议在设备可用时补一次。

**⑧ 截图矩阵（浅色，2026-11-09）**

| 场景 | 文件 | 结论 |
|---|---|---|
| 会话页（浅） | `.tmp-shot/avd/mx-01-conv-light.png` | 卡片头三段、分段控件 48px、统计带在卡内、输入区一行、底栏五项 + 脚注 |
| 加号面板（浅） | `.tmp-shot/avd/mx-02-addpanel-light.png` | 附件（图片/相机/文件）+ 指令（压缩·模型·下载日志）正常；面板为整屏 sheet |
| 收起态（浅） | `.tmp-shot/avd/mx-03-collapsed-light.png` | 底栏只剩「权限 · 把手 · 模型」一行，页面让位同步收缩 |
| 设置页（浅） | `.tmp-shot/avd/p64-01-settings.png` | 五项补位（会话/插件/设置/自动化任务/工作台），内容不被遮挡 |

**深色未能验证**：`adb shell cmd uimode night yes` 后 App 仍为浅色（`data-ds-theme-source=system`、`color-scheme: light`），说明该壳不跟随系统夜间模式；深色需要在 App 设置里切「外观」，脚本没定位到该入口。深色样式本身（卡片头 / 分段控件 / 输入卡 / 底栏跟随 token）已随 CSS 生效，只差一张实拍。对话正文自 0.4.12 起完全交还官方，插件不再做深色 +1px 或代码块卡片。

### 3.19 透明 / 胶囊样式层彻底隔离 + ⊕ 偶现无响应（0.4.12，2026-11-09）

**① 导航项模型必须跟样式层一起分叉。** `32563dc` 把 `slots.map(...)` 换成了 `dockPages(...)` 的「按页换项」，但没按 `data-dshm-dock` 分叉，透明底栏被胶囊的模型覆盖：五键变成 `会话/插件/工作权限/模型/更多`，设置/自动化/工作台被折叠进第二页。修法：新增纯函数 `dockVisibleItems({ capsule, slots, chipFlags, page })`——`capsule !== true` 时原样返回 `navSlots`（无翻页），否则走 `dockPages`；`V2Nav` 先解析 `dockStyle/dockCapsule` 再算项，非胶囊态把 `dockPage` 复位且不挂 Esc 监听。单测锁两边的项集合与顺序。

**② 胶囊的回形针不应注入透明态。** `syncComposerAttach()` 原先无条件把 `[data-dshm-attach-btn]` 插到官方 ⊕ 行，靠同一 tick 的 `cleanupCapsuleArtifacts()` 删掉——窗口内是未加样的裸按钮，且让官方 ⊕ 行发生多余 DOM 变更。修法：插入前判断 `data-dshm-dock === capsule`，否则只清理残留、直接 return。

**③ ⊕「偶现无响应」的三条真因（AVD 可复现）。**

- **幽灵态**：`data-dshm-v2-addmenu` 把官方弹层隐成 `opacity:0`，而 `addMenuTakeOverAllowed()` 在幽灵存在时拒绝接管。只要幽灵比自绘面板多活一拍，点 ⊕ 就是「官方弹层开了但不可见、自绘面板不接管」。注入幽灵后实测 `pop=1, opacity=0, panel=0, phase=suppressed`；清掉幽灵才恢复（`phase=enter, panel=1`）。
- **延迟收尾误伤新弹层**：`releaseGhost()` 240ms 后无条件 `closeOfficialAddMenu()`。用户在这窗口内重新点 ⊕，新弹层会被旧定时器关掉。
- **双击 / 连点被遮罩吃掉**：面板一打开遮罩就盖住输入行，第二次点落在遮罩上 = 关闭。实测两次点击间隔 40–600ms，7/7 最终都是「面板关闭」，视觉上就是没反应。

修法（四层）：

1. `document` 捕获阶段监听 `[data-dshm-add-chip]` 的真实 `pointerdown`：记录 `addMenuUserIntentAt`、递增 `addMenuGhostEpoch`、取消旧收尾定时器、调 `ensureAddMenuCoherent(true)`（幽灵在且面板不在 → 摘幽灵；300ms 后仍无可见弹层/面板 → 补一次重开）。胶囊自绘 ⊕ 与 `openOfficialAddMenu()` 也调用同一个修复函数。
2. `releaseGhost(popAtClose)` 带世代号 + 只关「离开时那一个」弹层；`dispatchAddOption()` 的 200ms 收尾同样带世代号。
3. 遮罩 `onClick` 在 `v2AddMenuOpenedAt` 后 250ms 内忽略——双击最终保持打开。
4. 200ms 心跳在无弹层且关闭/派发均超过 500ms 时自愈幽灵属性；`closeAddMenuForComposerTap()` 的 400ms 吞事件放行 `[data-dshm-add-chip]`。

**验证口径**：AVD 上 60 次「点开→点遮罩关」风暴 0 失败；幽灵注入后单击 900ms 内出面板；60/120/200ms 双击全部保持打开；胶囊自绘 ⊕ 仍正常打开面板；`npm run check` 全绿（299 pass）。


### 3.20 对话正文交还 DSH 原生渲染（0.4.12，2026-11-09）

0.4.9–0.4.11 为了对齐设计稿，插件在对话正文里做了一整套接管：居中日期分隔（`::before`）、工具调用 chip 胶囊、代码块卡片与「收起 / 展开」按钮、思考行 / 命令行打标、步骤级折叠、消息时间与操作行样式、正文行高 / 段落间距 / 代码块限高，以及深色正文 +1px。

这些做法的问题：① 全靠叶子文本 / 结构启发式认节点，官方一次改文案或结构就可能误伤；② 每次 DOM 提交都要重放，流式输出时等于给对话页加了一层全量子树扫描；③ 注入的按钮 / 属性与官方 React 重渲染互相打架，出现「收起又弹回」「代码块卡片留空壳」等状态问题；④ 用户明确要求正文不要接管。

本轮全部移除：

- JS：删除 `syncMessageMeta` / `syncToolChips` / `syncMessageDates` / `syncCodeBlockToggles` / `syncStepRows` / `syncStepCollapse` / `tagRowParts` / `findMessageItem` 与 `stepCollapsed`；
- 观察器：`startDialogueWatchers` 改名为 `startCapsuleReclaimWatcher`，只负责回收胶囊自绘控件（根属性变化时触发 + 1.2s 兜底轮询），不再监听 `document.body` 子树（流式输出每帧都会触发它）；
- CSS：删除 `[data-dshm-center]` 下的正文排版 / pre / 段落 / 列表 / 引用块规则、`[data-dshm-msg-*]`、`[data-dshm-tool-chip]`、`[data-dshm-date-label]`、`[data-dshm-code-*]`、`[data-dshm-think|cmd]`、`[data-dshm-step-hidden]`、`[data-dshm-row-*]`、`.dshm-code-toggle`、深色 +1px；
- 清理链：`cleanupCapsuleArtifacts` / `clearAnchors` 不再扫对话相关节点与属性。

**边界**：`[data-dshm-center]` 锚点本身保留（布局、hero 位移、统计带、空态分界线仍要用它），但不改它内部任何消息节点的样式或结构。

**验证**：AVD 上对话页 DOM 无任何 `data-dshm-msg-*` / `data-dshm-code-*` / `data-dshm-think|cmd|row-*` 标记，无 `.dshm-code-toggle` 节点；日期、工具行、代码块、操作行与原生预设一致；`npm run check` 全绿。

### 3.21 对话页的命令卡片交还官方；`/` 与 ⊕ 保持一致（0.4.12，2026-11-09）

**① 命令结果卡片（`[data-terminal]`）**：插件曾把 bash / pwsh 命令卡片重排成三列网格（目录 / 退出码 / 复制一行、命令整宽不折行），并在 body 下建一个固定层放「自动换行 / 取消自动换行」按钮（`data-dshm-term-layer` + `data-dshm-terminal-wrap` + `localStorage['dshm-terminal-wrap']`，用官方复制键的 rect 定位）。本轮全部删除，命令卡片的头部布局、命令折行、复制键都由官方渲染；插件不再注入浮层按钮，也不再持久化换行偏好。

**② 指令菜单（输入框敲 `/`）与 ⊕ 保持一致**：官方 `/` 菜单与 ⊕ 加号面板复用同一个 `[role="listbox"]` 浮层，所以两者走同一套接管逻辑——`V2AddPanel` 只凭「有分组标题」就接管，`/` 与 ⊕（含胶囊自绘 ⊕）看到的都是自绘的「附件 + 添加 + 指令」抽屉，内容与交互完全一致。**不按触发来源区分**（曾加过 `addMenuChipIntentAt` 门禁让 `/` 保持官方宫格，按用户要求撤回）：两套外观并存反而更容易让人以为是两套菜单。

**验证（AVD）**：敲 `/` → `addPanel=1, ghost=true`，自绘面板与 ⊕ 相同；胶囊自绘 ⊕ → `addPanel=1`；命令卡片 `[data-dshm-term-layer]=0`、`data-dshm-terminal-wrap` 不存在。

### 3.22 深色胶囊样式的浮起关系（0.4.12，2026-11-10）

**① 深色判定用官方主题标记，不靠 prefers-color-scheme。** 该壳不跟随系统夜间模式（深色在 App 内切），实测：
- `html[data-ds-theme-source="dark"]`（显式深色；跟随系统时为 `system`）；
- `body[data-ds-dark-theme]`（深色下存在的空属性，覆盖「跟随系统且系统为深色」）。

两条都登记在 `contracts/official-selectors.json`。CSS 侧用 `html[...][data-ds-theme-source="dark"]` 与 `html[...] body[data-ds-dark-theme]` 两个选择器覆盖。

**② 胶囊阴影改用主题蓝。** 深色底是 `#151517`，黑色阴影几乎不可见。胶囊（卡片头 / 输入卡 / 底栏）的阴影改为 `0 6px 20px color-mix(in srgb, var(--dsw-alias-state-business-primary, #7aaaff) 55%, transparent)`。主题蓝 token 在深色下是 `#7aaaff`，与底栏选中态、发送键同一色号；浅色下该规则不生效。`color-mix` 由当前 WebView（Chrome 156 实测）支持；不支持的宿主会忽略该声明，退回黑色阴影，不会把阴影整条弄没。

**③ 外缘高光。** 「胶囊」是输入卡 + 底栏两块拼成的一个视觉整体，直接给两块各描一圈 1px 会在接缝处画出一条横线。改用**定向 inset 阴影**：输入卡描上 / 左 / 右，底栏描下 / 左 / 右，合成一条连续的外轮廓，接缝处留空。顶部卡片头是独立卡片，没有接缝，描完整四边。颜色为主题蓝 32%。值写进运行时变量（`--dshm-v2-card-rim` / `--dshm-v2-nav-rim` / `--dshm-v2-header-rim`），因为输入卡基规则的 `box-shadow` 带 `!important`，改值比再叠一条 `!important` 稳。

**④ 顶部 TAB 分段控件。** 深色下官方 `--dsw-alias-bg-secondary` 缺席，轨道退回 `rgba(127,127,127,0.09)`（≈ #232325），选中面 `--dsw-alias-bg-layer-2` 是 `#2c2c2e`——两者都贴在近黑底上，没有区分度。改为：
- 轨道 `--dsw-alias-bg-layer-1`（#232324，灰）+ 1px 内描边 `--dsw-alias-border-l1`；
- 选中滑块 `--dsw-alias-bg-layer-3`（#353638，浅灰）+ 1px 内描边 `--dsw-alias-border-l2`；
- 选中文字继续用主题蓝（参考图的配色只取背景与描边，不动文字色）。

描边用 `inset` 阴影而不是 `border`：轨道有 padding、滑块在轨道内，加真实边框会改变盒尺寸并把圆角挤歪；`inset 0 0 0 1px` 不占布局、圆角自动跟随。

**验证（AVD，深色胶囊）**：轨道 `rgb(35,35,36)`、滑块 `rgb(53,54,56)`；输入卡/底栏阴影为「32% 蓝 inset 三边 + 55% 蓝 0 6px 20px」；浅色模拟：轨道 `rgba(127,127,127,0.09)`、滑块 `#fff`、阴影 `rgba(0,0,0,0.12)`；透明底栏模拟：输入卡阴影仍为黑色。`npm run check` 全绿（299 pass）。

### 3.23 设置页三种选择器统一高亮（2026-11-10）

同一张「通用设置」页里现在有三种单选：官方**外观**卡片（浅色 / 深色 / 跟随系统）、插件的**布局模式**（原生 / 融合 / 悬浮）与**底栏样式**（透明 / 胶囊）。官方外观卡片的选中规则是 `._selected { background: var(--dsw-alias-bg-module-platform); border-color: var(--dsw-static-neutral-bluish-400) }`：浅色实测 `#f5f6f7` 底 + `#adb2b8` 描边，深色实测 `#353638` 底 + 同一条 `#adb2b8` 描边。插件原来的选中态用 `interactive-bg-hover` + `border-l2`（深色约 8% 白底 + 12% 白描边），在近黑底上几乎看不出选了谁；只换 `bg-layer-3` / `label-tertiary` 又会在浅色下偏白、描边偏深。

本轮把后两者的选中态改成与外观卡片同一套 token：

- `.dshm-layout-option[data-dshm-checked]`；
- `.dshm-dock-style-option[aria-checked="true"]`（与原生预设的 `.dshm-native-style-option[aria-checked="true"]` 共规则）。

`background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-3))`、`border-color: var(--dsw-static-neutral-bluish-400, #adb2b8)`。未选中态保持原样（透明底 + 低对比描边），选中项因此有「亮边 + 主题底」两层区分；浅色 / 深色都由官方 token 自动跟随，不需要再按主题写两套。

**验证（AVD）**：浅色下外观「浅色」选中 `bg rgb(245,246,247) / border rgb(173,178,184)`，布局「悬浮」、底栏「胶囊」选中计算值与之一致；切到深色后三者的计算值同步变为 `bg rgb(53,54,56) / border rgb(173,178,184)`。未选中项仍为透明底 + 低对比描边；`npm run check` 全绿。

### 3.24 深色用户消息气泡改为暗蓝（2026-11-10）

官方用户消息气泡是 `[data-message-bubble]`（已登记在 contracts/official-selectors.json），底色走 `var(--dsw-specific-bubble)`。深色下该 token 是 `#2c2c2e`，与页面 `#151517`、卡片面 `#2c2c2e` 几乎同色，发送的消息在长对话里看不出边界。

做法：不碰官方结构，只在该气泡节点上覆盖这一个变量。

```
html[data-dshm-form="phone"] body[data-ds-dark-theme] [data-message-bubble] {
  --dsw-specific-bubble: color-mix(in srgb, var(--dsw-alias-state-business-primary, #7aaaff) 30%, var(--dsw-alias-bg-base, #151517));
}
```

- 选择器带 `data-dshm-form="phone"`：桌面形态不生效；三个预设都带这个形态属性（原生 `mode=default` 也带），因此「所有模式」共用同一条规则。
- 只改变量：气泡自己的 `background: var(--dsw-specific-bubble)` 就地生效，不需要给背景加更重的选择器或 `!important`。
- 颜色 = 主题蓝 30% + 页面底 70%，深色实测 `rgb(51,66,93)`（`color(srgb 0.201 0.258 0.363)`），仍是暗色但和背景有明确区分；浅色下规则不命中，官方气泡保持 `rgb(237,243,254)`。
- 合约：`data-message-bubble` 与 `data-ds-dark-theme` 都已在官方依赖表登记；`test/ux.test.js` 增加源码契约锁这两点。

**验证（AVD，深色）**：v2 / classic / default 三个预设的气泡计算值均为 `color(srgb 0.201176 0.257647 0.363137)`；浅色模拟为官方 `rgb(237,243,254)`；`npm run check` 全绿（300 pass）。

### 3.25 胶囊头部行高收紧（2026-11-10）

用户反馈：标题行与自绘分段控件之间空出一条明显空白（截图中红框）。测量（AVD，CSS px）：官方 header 的 grid 行是 `44px 52px`，标题元素 40px 居中在 44px 行里；自绘 `.dshm-seg` 只有 48px 高，由 JS 按官方页签行顶（`rowRect.top - headerRect.top`）定位——标题行偏高 + 标题行内的垂直居中留白，合起来就是那条空档。

处理：胶囊态下把 header 的 grid 行压成 `36px 32px`（初版 36/48，按真机反馈再把页签行压到 32），用**内联 `!important`**（官方 `grid-template-rows` 规则本身带 `!important`，普通选择器压不动）：
- 标题行 36px = 头部按键 36px，正好放下；标题文本仍垂直居中；
- 页签带 48px = 自绘控件高度（40 + 上下 padding 4），分段控件由 JS 实测行位自动跟随，无需改 `top`；
- header 高度 124 → 112，标题与 TAB 之间的空档减少约 12px。

回收：`cleanupCapsuleArtifacts()` / `clearAnchors()` 在摘 `data-dshm-header-card` 之前 `removeProperty('grid-template-rows')`，切透明 / 其它预设 / 卸载即还原官方 44/52。`test/ux.test.js` 增加源码契约锁这两点。

**验证（AVD）**：胶囊态 `grid-template-rows=36px 32px`、header 高 112、`.dshm-seg` top 由 56 → 44（页面坐标）；切透明后 header 不带内联、行高还原（官方 30/35 的透明布局）；浅色 / 深色均生效；`npm run check` 全绿（301 pass）。
