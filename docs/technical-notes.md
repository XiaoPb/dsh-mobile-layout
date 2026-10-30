# dsh-mobile-layout 技术说明

> 实现细节、参数依据、测试与真机调试方法。总体设计见《[架构文档](architecture.md)》。

## 1. 产物与包契约

- **单文件产物**：`lib/client.js` 即发布物，无构建步骤。文件是 `define(...)` 工厂（Cordis 客户端模块协议），内部自带 `module.exports` 闭包，只 require 官方提供的 `react`。
- **版本契约**：文件内 `const VERSION` 必须与 `package.json` 一致，`npm run verify-package` 负责校验（发布前 CI 强制）。改版本号两处要同步。
- **测试出口**：`module.exports.__test` 导出全部纯函数与常量（`classify`、`swipeDirection`、`drawerStartLimit`、`floatMenuLeft`、`planAddPages`、`tintHash`、`sessionRows`、`shouldCloseSheetByDrag`、`STRINGS` 等），供 `test/*.test.js` 使用。注意 `__test` 对象出自 vm 沙箱（跨 realm），断言对象值时先逐字段取值或转本域数组，**不要直接 `deepEqual` 沙箱对象**（原型不同必挂）。

```sh
npm run check     # node --check → 69 项单测 → verify-package 包契约自检
npm test          # 仅单测
npm run pack:dry  # 预览发布文件清单
```

## 2. 关键参数与依据

| 参数 | 值 | 依据 |
|---|---|---|
| 进入手机模式 | 竖屏 + 短边 ≤ 600 CSS px + 长宽比 ≥ 1.25 | 覆盖主流手机 CSS 视口；桌面最小可缩窗 520×600 会被宿主判据挡住 |
| 保持模式（滞回） | 短边 ≤ 640 / 比例 ≥ 1.15 | 避免 600~640 区间窗口缩放来回抖动 |
| 横滑最小位移 `SWIPE_MIN` | 48 CSS px | 低于此视为误触；纵向超过横向 0.72 倍不认（竖向滚动优先） |
| 抽屉开栏起手区 `drawerStartLimit` | 屏宽左 40%，钳 64–200 CSS px | 全面屏把系统返回绑在硬边缘，24px 边缘区根本滑不到；QQ 式中间偏左起手。钳制防窄屏退化成边缘手势、宽屏和内容横滑打架 |
| 页头侧栏键贴靠 `floatMenuLeft` | `left = 标题左缘 − 44`（36px 键 + 8px 间距） | 视觉嵌入标题行、标题零平移；标题左缘 < 52px 时退回「键固定 8px + 标题右移 ≤48px」兜底 |
| 页头滚动隐藏判据 | 页头行相对 center 顶部位移 `topGap < −4` | **不能用绝对阈值**：实测各页/各设备静止标题顶从 8px 到 56px 不等（MuMu 8/24/44，K70 28），只有相对位移是设备无关且兼容吸顶头的判据 |
| ⊕ 面板焦点抑制时长 | 输入控件禁用 600ms | 官方打开面板时的异步 refocus 落在窗口内；过长影响用户立刻打字 |
| 键盘高来源 `resolveImeHeight` | 原生桥 > 实测/持久化 > 视口 42% 估值 | 原生 WindowInsets 最准且无需弹键盘；visualViewport 需真弹一次（K70 实测 resize 为一次性跳变，收缩量即键盘高）；估值仅首次兜底 |
| 面板 ⇄ 键盘切换 | 揭开 / 覆盖（`startImeSwap`） | 键盘绘制在 WebView 之上，面板与输入行提前就位靠键盘滑出揭开；resize 一次性跳变时刻换算 padding 保持输入行屏幕位置（0.1.12，替代 0.1.11 等高瞬换） |
| 加号面板分页 | 4 列 × 2 行，超出横向分页 | 单手可达；页签 `pageLabel(i, active)` |
| 会话表高度上限 | 屏高 64%，下限 300px | 官方弹层比例（v1.4.57 视觉分支）；仍留出底部操作条与输入区 |
| 底部表下拉关闭阈值 `SHEET_DRAG_CLOSE_PX` | 96 CSS px | 约拇指一节：低于此多为误触，高于此用户已明确「不要这张表」 |

## 3. 各功能域实现要点

### 3.1 页头侧栏键（全局面板）

- `syncPageHead()` 在官方全局面板页里**纯几何探测**页头行（贴近 center 顶端、横向 ≥ 半宽、高 14–160、不含输入控件），再在页头内找最上层纯文本叶子作标题。
- 键本体由 `OverlayLayer` 渲染（fixed 定位），几何写入 CSS 变量：`--dshm-float-menu-top`（垂直对齐标题行中线）、`--dshm-float-menu-left`（水平贴标题左缘）。
- 滚动跟踪：document 捕获 scroll（rAF 合帧）重算 `syncPageHead`；`topGap < −4` 打 `data-dshm-float-menu-hidden`（opacity 0 + pointer-events none，120ms 过渡），滚回顶部回显。该页从未出现过页头时维持缺省位不隐藏。
- 图标为 Sidebar（panel-left 形：圆角矩形 + 左竖线，`SidebarIcon`）；会话头里的抽屉入口保持 ☰ 汉堡（官方 header leading 语义），两者不混用。
- 故意**不做 DOM 插入**：面板页页头结构各异且归官方 React 管辖，插入节点会被重渲染吞掉或需改造行容器，回归风险大于收益；fixed 键 + CSS 变量贴靠是零侵入解。

### 3.2 抽屉手势

- 监听在 document 上（passive），`touchstart` 记起点并判定起手区（含三道防冲突闸：底部表 / ⊕ 面板 / 设置页打开时不叠开；起手点在横向滚动容器——`scrollWidth > clientWidth + 4` 且 `overflow-x: auto|scroll`，向上找 6 层——内不触发），`touchmove` 里按方向阈值判定意图。
- 打开方向限起手区，**收起方向（左滑关抽屉）全屏任意位置可用**；系统边缘返回无法拦截也不应拦截（WebView 无权限），扩大起手区是唯一正解。

### 3.3 ⊕ 加号面板与输入法互斥

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

### 3.4 加号面板分页与配色

- 官方 ⊕ 菜单 surface 被 `tagComposerMenus` 打标后，`collectAddOptions()` 收集条目（去重：`isDuplicateAddOption` 认官方与 drop 别名），`planAddPages()` 按行上限分页，`AddPager` 渲染页点。
- 配色：`tintHash()` 按别名哈希从 12 档柔和色（蓝/橙/紫/绿 4 系）落位，同类型同色、同屏不撞色；新增功能零代码自动配色。

### 3.5 设置页手机化

- 官方设置对话框被 `tagSettings` 整体改造为全屏面板（`data-dshm-settings-*` 属性族）：品牌行 + 可横滑页签 + 返回键。
- 页签滑动：`canStartSettingsSwipe` 判定起手合法性（不在卡片/列表内），`swipeDirection` 判方向，`nextTabIndex` 钳边界不循环，`centerSettingsTab` 滚动对齐激活页签。
- 返回键 `ensureSettingsBack` 是**真实 DOM 插入**到官方页签行最左——与浮动键不同，此处行容器单一可控，每次同步重插防官方清除。

### 3.6 Composer 融合

`syncComposerPad` / `syncComposerFrame` / `syncComposerEdge` 把输入区压平融合底部面板（去圆角/边框/阴影、全宽同表面、1px 分界）；`syncComposerChips` 把权限 / 模型短名 chip（`permissionShort` / `modelShort`，中英文表驱动）留在输入行，「完全访问 / Full access」恒标红。

### 3.7 底部表（会话表 / 插件表）的视觉与把手

**这是一条有意的本地视觉分支**：会话表与插件表不再沿用自绘的「白卡片 + 16px 圆角」，而是对齐引擎 v1.4.57 官方弹层（「预览版说明」卡片）的设计语言。同步上游时这层样式可能被整体覆盖，`test/sheet.test.js` 与 Android 侧 `scripts/probes/_test_builtin_plugins.py` 都做了字符串锁，CI/探针会先报出来。

- **抬升面**：官方卡片是 `rgb(44,44,46)` 卡片压在 `rgb(13,13,14)` 页面上、外加 1px `rgb(61,61,62)` 描边。这里用「页面底色 + 9% 白叠加」等效实现（`linear-gradient(...), var(--dsw-alias-bg-base)`）——浅色主题下白叠加几乎无效，自动退化为白底 + 描边，不需要额外的主题分支。
- **尺寸**：圆角 28px（只圆上方）、高度上限 `min(max(300px, 64% 视口), 顶部条以下)`、内边距 10px；行高 52px、字号 15px、行圆角 14px；主操作按钮为 999px 胶囊且颜色对调（`label-primary` 作底、`bg-base` 作字）。
- **入场动效**：遮罩 45% + 180ms 淡入，面板 220ms `cubic-bezier(0.32, 0.72, 0, 1)` 自底部上滑；`prefers-reduced-motion` 段必须同时列 `.dshm-sheet` 与 `.dshm-sheet-mask`（面板的降级容易漏，漏了就是「遮罩不淡入、面板照样滑」）。
- **把手拖拽关闭**：只在 `.dshm-sheet-grabber` 上识别（`touch-action: none` + pointer capture，避免与列表滚动抢手势）。按下时清掉入场动画与过渡并接管 `transform`，位移实时跟手、向上拖钳 0；松手时 `shouldCloseSheetByDrag(dy)` 判定——超过 `SHEET_DRAG_CLOSE_PX`（96 CSS px，约拇指一节）即关闭，否则 200ms 回弹。`pointercancel` 与 `pointerup` 同路径，被系统手势/来电打断也能正确收尾。
- **为什么不直接在列表上做下拉**：列表是滚动容器，下拉手势与 `overflow-y: auto` 的回弹/滚动冲突，误关闭率远高于收益；把手是官方卡片自带的「拖拽暗示」，也是唯一能同时表达「可拖」与「不干扰滚动」的位置。

## 4. i18n

- `STRINGS` 表驱动，`t(key)` 取词；语言跟随官方 `locale` 服务（监听 `locale/change`），服务缺席退回 `<html lang>` / `navigator.language`（`detectLang`）。
- 文案集中在表里新增，不在逻辑里散落；设置页页签、底部表、加号面板标签全部走表。

## 5. 状态与浮层互斥

浮层四类：抽屉、底部表、⊕ 面板、设置页。互斥规则：

- 打开任一浮层先关其他（`openSheet` 内先 `requestDrawer(false)` 等）；层序栈 `syncOverlayHistory` 记录打开顺序，Esc / 系统返回 / 遮罩点击 / 把手下拉按栈逐层关（`onKeyDown` 的优先级：设置页 → 底部表 → ⊕ 面板 → 抽屉 → 右栏全屏）。
- 关闭瞬间记录 `popoverClosedAt` 类时间戳，防止官方浮层的收起事件又触发插件侧重开。
- 官方全局面板（panelInfo）激活时：底部条隐藏、hero 清除、侧栏键与手势接管——面板页自身不是插件的浮层，是官方页面。

## 6. 真机部署与调试（Redmi K70 / MuMu）

### 6.1 adb 部署

```sh
ADB="D:/Program Files/Netease/MuMu Player 12/shell/adb.exe"   # 含物理设备支持
# K70：插件路径与模拟器不同，注意 profiles/web/node_modules
MSYS_NO_PATHCONV=1 "$ADB" -s <serial> exec-in run-as app.dsh.mobile sh -c \
  'cat > files/dsh-home/profiles/web/node_modules/@xiaopb/dsh-mobile-layout/lib/client.js' \
  < lib/client.js
# md5 双端校验 → force-stop → monkey 拉起
```

- K70：物理 1440×3200 @560dpi，CSS 视口 ≈ 411×917（÷3.5）；MuMu：720×1280，CSS 400×711。
- **几何结论以 DOM 探针为准，不要拿截图像素换算**：截图是物理像素，加状态栏偏移，误差足以误导判定。

### 6.2 DOM 探针法（定位样式/判定 bug 的标准流程）

把只读 IIFE 探针**追加**到设备端 `client.js` 末尾（测完推回干净版），复刻可疑判定逻辑并把中间量 `console.log('[P2]' + JSON.stringify(...))`，`adb logcat -d` 取证：

- 探针挂 `scroll`（capture, 捕获阶段 + 350ms 合帧）可实时跟踪几何变化；
- 0.1.9 前的「滚回顶部不回显」bug 即由此定位：探针证明页面**静止**时标题顶各页在 8~56px 浮动，绝对阈值 `top < 40` 把静止态误判成已滚动 → 改 topGap 相对判据。

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
| 系统边缘返回无法拦截 | WebView 无系统手势权限 | 打开区扩到左 40% 屏宽 |
| 官方重渲染可能掉锚点属性 | 插件不拥有官方 DOM | sync* 幂等重打；MutationObserver 兜底 |
| 锚点失败 | 官方改版 | 打标失败不阻断启动，对应功能静默降级 |
| 桌面端不激活 | 原生窗控/鼠标交互与移动布局冲突 | 宿主判据硬性排除 |
| 回退 | — | 卸载插件或 `dispose()` 即还原；样式全在 scoping 属性之下，不残留 |
