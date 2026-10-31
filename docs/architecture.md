# dsh-mobile-layout 架构文档

> 手机竖屏布局插件的总体设计。实现细节、参数依据与真机调试方法见《[技术说明](technical-notes.md)》。

## 1. 定位与设计原则

dsh-mobile-layout 是一个 Cordis 插件，把 DSH Web 客户端在**手机竖屏**下改造成单手可操作的触控布局。四条设计原则贯穿全部实现：

| 原则 | 含义 | 落地方式 |
|---|---|---|
| **零侵入** | 不修改官方内核、不替换官方布局插件 | 只通过官方 slot 注入 + 在官方 DOM 上打 `data-dshm-*` 属性 + 注入 scoping 样式 |
| **形态隔离** | 只认手机竖屏，其他形态像素级不变 | 宿主识别 + 视口几何双判定，样式全部收在 `html[data-dshm-mode="mobile"]` 作用域下 |
| **可回退** | 卸载插件或锚点失败即恢复官方布局 | 所有改造走属性标记，`clearAnchors()` / `dispose()` 可整体还原 |
| **单文件产物** | 无构建、无运行时依赖 | `lib/client.js` 即发布物，`define()` 工厂内自带 module 闭包 |

## 2. 运行环境与模式判定

插件在页面里跑的第一件事是回答两个问题：**这是谁**（宿主）、**要不要激活**（模式）。

```
页面加载
  │
  ├─ detectHost(win) ──→ 'desktop' | 'android' | 'web'
  │     判据顺序：dsh-app: 协议 → window.dshDesktop
  │              → DshAndroidClipboard / DshAndroidDownloader 桥 → web
  │     双判据防单点失效；结果生命周期内不变
  │
  ├─ classify(width, height, prev) ──→ 'mobile' | 'default'
  │     竖屏 + 短边 ≤ 600 + 长宽比 ≥ 1.25 进入；
  │     保持阈值放宽到 640 / 1.15（滞回，防 600~640 抖动）
  │
  └─ resolveMode(host, …)
        desktop → 永远 'default'（桌面可缩窗到 520×600，会误命中
                  视口判定，但那里有原生窗控 / 拖拽头，移动布局必错乱）
        android / web → 采信 classify 结果
```

模式之外还有一路**动态条件**：官方全局面板（`layout.panelInfo`）激活时插件把整屏让给官方面板页，只保留遮罩与手势。

## 3. 插件接入方式

入口在 `apply(ctx)` / `dispose()`，通过客户端 cordis 服务注入完成对接：

| 注入的服务 | 用途 |
|---|---|
| `slots` + `layout` | 注册两个官方槽位组件；取 `layout.panelInfo` 订阅面板激活状态、`layout.toggleSidebar` 开合抽屉 |
| `sessions` + `uiWorkspace` | 新建会话、会话表数据、工作区分组 |
| `locale` | i18n 跟随官方语言，监听 `locale/change` |

**官方槽位（React 组件）**：

| 槽位 | 组件 | 职责 |
|---|---|---|
| `shell.overlay` | `OverlayLayer` | 常驻遮罩 / 底部表 / Esc 处理；关闭态 `pointer-events: none` 不阻塞任何交互 |
| `shell.bottom` | `BottomBar` | 底部操作条（新建 / 会话 / 文件 / 图片 / 插件 / 更多）；官方全局面板打开时自动隐藏 |

抽屉入口**只有左缘手势**，不占任何槽位：`bindDrawerGesture` 常驻 `window` 捕获阶段（touch + pointer 双通道去重），不依赖槽位 / 页面挂载，任何插件面板页都可用——0.1.15 起移除了 ☰ 与浮动侧栏键，避免遮挡子页面自身的返回键。

所有 slot 注册都单独 try/catch：某一槽位失败只降级对应功能，不拖垮插件。

## 4. 分层结构

`lib/client.js` 约 10000 行，自上而下分六层。依赖方向单向向下：

```
┌──────────────────────────────────────────────────────┐
│ ⑥ 组件层（React）                                     │
│    BottomBar · Sheet · AddPager · OverlayLayer       │
│    （遮罩 / Esc 出口；抽屉手势不在此层，见下）           │
├──────────────────────────────────────────────────────┤
│ ⑤ 功能域层                                            │
│    抽屉 / 底部表 / 加号面板 / 设置页手机化 / 会话表      │
│    设置页接管（全屏 / 悬浮窗双形态）/ 布局模式选择器     │
│    （openSheet · tagSettings · syncSettingsPanel ·   │
│      syncLayoutPicker(Texts/State) · bindDrawer…）   │
├──────────────────────────────────────────────────────┤
│ ④ 预设层（host → phone → preset 三层解耦）             │
│    resolvePreset / setPreset / currentPreset         │
│    syncComposerClip · settingsFrameMetrics ·         │
│    syncLayoutPicker —— 纯函数决策 + 根属性驱动样式     │
├──────────────────────────────────────────────────────┤
│ ③ 同步引擎层                                          │
│    锚点标记 applyAnchors / clearAnchors               │
│    MutationObserver 驱动的 sync* 家族                 │
│    （syncComposerChips · syncAddPaging …）            │
├──────────────────────────────────────────────────────┤
│ ② 纯函数层（全部有单测，经 __test 出口导出）            │
│    classify · swipeDirection · drawerStartLimit ·    │
│    decideDrawerGesture · drawerSettle · scrollerConsumes │
│    nextTabIndex · planAddPages · tintHash ·          │
│    settingsFrameMetrics · sessionRows …               │
├──────────────────────────────────────────────────────┤
│ ① 基础层                                              │
│    宿主/模式判定 · i18n(STRINGS/t/syncLayoutPickerTexts) │
│    布局状态 store（getState/setState/subscribe）       │
│    · injectStyle · activeDispose 单实例守卫            │
└──────────────────────────────────────────────────────┘
```

### 4.0 预设体系（host → phone → preset）

- **host**（Android 壳 / 桌面 / 浏览器）→ **phone**（`data-dshm-form`，是否手机布局）→ **preset**（`data-dshm-preset`：`default` 原生 / `classic` 融合 / `v2` 悬浮），三层各自独立、根属性驱动样式。
- 预设持久化在 `localStorage['dshm-layout-preset']`；切换入口只有设置页「布局模式」三卡片（挂官方滚动容器，不订阅 state，因此文案刷新由 `syncLayoutPickerTexts` 显式补刀）。
- `apply(ctx)` 开头有 **`activeDispose` 单实例守卫**：宿主「禁用插件不调 dispose、启用不重新 apply」时，旧实例晚于新实例启动会把订阅者清空、`runtime.setPreset` 置空——守卫保证任一时刻只有一个活实例。
- `default` 预设不进入手机布局（`mode=default` 时样式整体不生效），只接管官方设置弹窗（悬浮窗形态）。

### 4.1 锚点标记层（插件与官方 DOM 的唯一接触面）

插件不改官方 DOM 结构，只给官方节点**打属性**（40+ 个 `data-dshm-*` 常量，如 `ATTR_SIDEBAR`、`ATTR_BOTTOM`、`ATTR_POPOVER`、`ATTR_SETTINGS_PANEL`）：

- 打上属性 = 声明"这个官方节点的手机形态由我负责"；样式层按属性选择器接管外观。
- 官方 React 随时可能重渲染掉属性，所以每个 `sync*` 都是**幂等重打**：由 MutationObserver 触发，发现属性丢失就补。
- 部分机制需要反向变量：`syncComposerEdge` 把测得的几何写入 CSS 变量，样式层消费；抽屉跟手期则由手势引擎直接写内联样式（见 §5 抽屉行）。

### 4.2 布局状态 store

轻量自制 store（`getState` / `setState` / `subscribe` / React 侧 `useLayoutState`），状态字段围绕**浮层互斥**设计：`drawer`、`sheet`、`panelActive`、`popoverOpen` 等。浮层开合统一走 `openSheet` / `closeSheet` / `requestDrawer` / `closeOfficialAddMenu`，经 `syncOverlayHistory` 维护层序栈，保证按层逐级关闭（系统返回 / Esc / 遮罩点击共用同一出口）。

### 4.3 同步引擎

MutationObserver 在 mobile 模式下全局监听，回调里按需分发到各 `sync*`。设计约定：

- **幂等**：同一状态多次执行结果一致，observer 抖动无副作用；
- **几何走纯函数**：探测取得原始几何后，决策交给纯函数（`scrollerConsumes`、`drawerStartLimit`、`drawerSettle`），引擎只负责把结果写回 DOM/CSS 变量；
- **防抖合帧**：resize/visualViewport 用 120ms 防抖。

## 5. 关键机制一览

| 机制 | 入口 | 说明 |
|---|---|---|
| 抽屉 | `bindDrawerGesture` + `requestDrawer` | window 捕获阶段常驻手势（任何页面可用）：左 60% 起手区右滑开、展开后任意位置左滑关、Esc / 遮罩关；24px 定向即跟手，松手按位移 / 速度吸附；焦点进出由独立 effect 管理 |
| 底部表 | `openSheet` / `Sheet` | 会话表（工作区分组 + 吸顶头）/ 插件表；最多占屏高 64%，顶部把手可下拉关闭 |
| 加号面板 | `openOfficialAddMenu` + `tagComposerMenus` | 程序化点击官方 ⊕，对面板 surface 打标 + 分页 + 配色；与软键盘互斥 |
| 设置页手机化 | `tagSettings` | 官方设置对话框改全屏：品牌行 + 可横滑页签 + 返回键；自带页签滑动手势；仅最左页签右滑跟手退出（`settingsPagerCanConsume` 按翻页边界让路），开合补滑动过渡 |
| 设置页接管（预设感知） | `syncSettingsPanel` / `settingsFrameMetrics` | 双形态：融合 / 悬浮钉全屏、原生钉居中悬浮窗（10vh 留白、等宽 gutter、安全区叠加）；清场时逐键还原官方内联样式 |
| 布局模式选择器 | `syncLayoutPicker` / `syncLayoutPickerState` / `syncLayoutPickerTexts` | 三卡片挂官方滚动容器、不订阅 state；选中态同步顺带刷文案，locale/change 后显式补刀（i18n 实时刷新） |
| Composer 融合 | `syncComposerPad` / `syncComposerFrame` / `syncComposerClip` | 输入区去边框融合底部面板；权限 / 模型 chip 留输入行；滚动容器全预设收敛（隐藏滚动条 + 取消 gutter 沟槽） |

## 6. 模块地图（函数分组）

| 分组 | 代表函数 |
|---|---|
| 宿主 / 模式 | `detectHost` · `classify` · `resolveMode` · `measure` |
| 预设 | `resolvePreset` · `setPreset` · `currentPreset` · `syncComposerClip` · `settingsFrameMetrics` |
| i18n | `STRINGS` · `t` · `detectLang` · `setLang` · `syncLayoutPickerTexts` |
| 状态 store | `getState` · `setState` · `subscribe` · `useLayoutState` |
| 锚点 / 样式 | `applyAnchors` · `clearAnchors` · `injectStyle` · `frameElement` |
| 抽屉手势 | `bindDrawerGesture` · `decideDrawerGesture` · `drawerSettle` · `scrollerConsumes` · `drawerStartLimit` |
| Composer | `syncComposerChips` · `syncComposerPad` · `syncComposerFrame` · `syncHero` |
| 加号面板 | `collectAddOptions` · `planAddPages` · `syncAddPaging` · `planAddTints` · `tintHash` |
| 设置页 | `tagSettings` · `settingsTabItems` · `switchSettingsTab` · `ensureSettingsBack` · `centerSettingsTab` · `syncSettingsPanel` · `clearSettingsPanel` · `officialSettingsDialogAlive` |
| 布局选择器 | `ensureLayoutPicker` · `syncLayoutPicker` · `syncLayoutPickerState` · `syncLayoutPickerTexts` |
| 会话表 | `sessionRows` · `groupSessionsByWorkspace` · `workspaceLabelFor` · `formatRelativeTime` |
| 浮层 / 手势 | `openSheet` · `closeSheet` · `openOfficialAddMenu` · `closeOfficialAddMenu` · `syncOverlayHistory` · `requestDrawer` |
| 组件 | `BottomBar` · `Sheet` · `AddPager` · `OverlayLayer` |
| 生命周期 | `apply` · `dispose` · `activeDispose`（单实例守卫） |

## 7. 生命周期

```
apply(ctx)
  ├─ activeDispose 守卫：上一个实例活着就先同步清场
  ├─ injectStyle（样式只注入一次）
  ├─ resolveAnchors（打锚点，失败不阻断）
  ├─ evaluateNow（宿主/模式判定，写 data-dshm-mode/form/preset）
  ├─ MutationObserver / resize / scroll / keyboard 监听
  ├─ ctx.inject(['slots','layout']) → 注册三个槽位 + 订阅 panelInfo
  ├─ ctx.inject(['sessions','uiWorkspace'])
  ├─ ctx.inject(['locale']) → locale/change 后 syncLayoutPicker 刷新文案
  └─ apply 末尾登记 activeDispose = dispose

dispose()
  ├─ 移除全部监听与 observer
  ├─ clearAnchors + clearPageHead（还原官方 DOM，含内联样式逐键还原）
  ├─ 摘除注入样式
  ├─ activeDispose === dispose 时自清引用
  └─ 官方槽位由 cordis 随插件卸载回收
```

## 8. 测试与质量边界

- **纯函数 + 源码契约单测**（129 项）：所有几何决策、分页、配色、状态机判定都抽成纯函数，经 `module.exports.__test` 出口在 Node 单测中覆盖（vm 沙箱隔离，测试不碰 DOM）。
- **包契约自检**：`verify-package` 校验 bundle 内 `VERSION` 与 package.json 一致、发布文件清单完整。
- **硬编码守卫**：`check-hardcoded.mjs` 扫描注入 CSS 的「布局属性 + 纯 px」，新增违规 CI 失败；自适应表达式（`var()/clamp()/env()/%`）自动放行，存量 221 处进 baseline 渐进收紧。
- **真机验收**：MuMu 模拟器（720×1280）+ Redmi K70 真机两档；验证矩阵与 adb 部署方法见《技术说明》第 6 节。
- **明确不做的**：不改官方 DOM 结构（只打属性）、不拦截系统边缘手势（WebView 无权限）、桌面端不激活。
