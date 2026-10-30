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

模式之外还有一路**动态条件**：官方全局面板（`layout.panelInfo`）激活时插件把整屏让给官方面板页，只保留遮罩层的侧栏键与手势。

## 3. 插件接入方式

入口在 `apply(ctx)` / `dispose()`，通过客户端 cordis 服务注入完成对接：

| 注入的服务 | 用途 |
|---|---|
| `slots` + `layout` | 注册三个官方槽位组件；取 `layout.panelInfo` 订阅面板激活状态 |
| `sessions` + `uiWorkspace` | 新建会话、会话表数据、工作区分组 |
| `locale` | i18n 跟随官方语言，监听 `locale/change` |

**官方槽位（React 组件）**：

| 槽位 | 组件 | 职责 |
|---|---|---|
| `conversation.header.leading` | `HamburgerButton` | 会话头 ☰，开关抽屉（与槽位同生共死） |
| `shell.overlay` | `OverlayLayer` | 常驻遮罩 / 手势层 / 全局面板兜底侧栏键 / Esc 处理；关闭态 `pointer-events: none` 不阻塞任何交互 |
| `shell.bottom` | `BottomBar` | 底部操作条（新建 / 会话 / 文件 / 图片 / 插件 / 更多）；官方全局面板打开时自动隐藏 |

所有 slot 注册都单独 try/catch：某一槽位失败只降级对应功能，不拖垮插件。

## 4. 分层结构

`lib/client.js` 约 5100 行，自上而下分五层。依赖方向单向向下：

```
┌──────────────────────────────────────────────────────┐
│ ⑤ 组件层（React）                                     │
│    HamburgerButton · BottomBar · Sheet · AddPager    │
│    OverlayLayer（含全部手势监听与 Esc 出口）            │
├──────────────────────────────────────────────────────┤
│ ④ 功能域层                                            │
│    抽屉 / 底部表 / 加号面板 / 设置页手机化 / 会话表      │
│    （openSheet · tagComposerMenus · tagSettings ·    │
│      sessionRows …）                                  │
├──────────────────────────────────────────────────────┤
│ ③ 同步引擎层                                          │
│    锚点标记 applyAnchors / clearAnchors               │
│    MutationObserver 驱动的 sync* 家族                 │
│    （syncPageHead · syncComposerChips ·              │
│      syncSettingsPanel · syncAddPaging …）            │
├──────────────────────────────────────────────────────┤
│ ② 纯函数层（全部有单测，经 __test 出口导出）            │
│    classify · swipeDirection · drawerStartLimit ·    │
│    floatMenuLeft · nextTabIndex · planAddPages ·     │
│    tintHash · sessionRows …                           │
├──────────────────────────────────────────────────────┤
│ ① 基础层                                              │
│    宿主/模式判定 · i18n(STRINGS/t) · 布局状态 store    │
│    （getState/setState/subscribe）· injectStyle       │
└──────────────────────────────────────────────────────┘
```

### 4.1 锚点标记层（插件与官方 DOM 的唯一接触面）

插件不改官方 DOM 结构，只给官方节点**打属性**（40+ 个 `data-dshm-*` 常量，如 `ATTR_SIDEBAR`、`ATTR_BOTTOM`、`ATTR_POPOVER`、`ATTR_SETTINGS_PANEL`、`ATTR_PAGE_HEAD`）：

- 打上属性 = 声明"这个官方节点的手机形态由我负责"；样式层按属性选择器接管外观。
- 官方 React 随时可能重渲染掉属性，所以每个 `sync*` 都是**幂等重打**：由 MutationObserver 触发，发现属性丢失就补。
- 部分机制需要反向变量：`syncPageHead` 把测得的几何写入 CSS 变量（`--dshm-float-menu-*`、`--dshm-page-head-shift`），样式层消费。

### 4.2 布局状态 store

轻量自制 store（`getState` / `setState` / `subscribe` / React 侧 `useLayoutState`），状态字段围绕**浮层互斥**设计：`drawer`、`sheet`、`panelActive`、`popoverOpen` 等。浮层开合统一走 `openSheet` / `closeSheet` / `requestDrawer` / `closeOfficialAddMenu`，经 `syncOverlayHistory` 维护层序栈，保证按层逐级关闭（系统返回 / Esc / 遮罩点击共用同一出口）。

### 4.3 同步引擎

MutationObserver 在 mobile 模式下全局监听，回调里按需分发到各 `sync*`。设计约定：

- **幂等**：同一状态多次执行结果一致，observer 抖动无副作用；
- **几何走纯函数**：探测（如页头行判定）取得原始几何后，决策交给纯函数（`floatMenuLeft`、`drawerStartLimit`），引擎只负责把结果写回 DOM/CSS 变量；
- **防抖合帧**：滚动跟踪用 rAF 合帧（`onDocScroll`），resize/visualViewport 用 120ms 防抖。

## 5. 关键机制一览

| 机制 | 入口 | 说明 |
|---|---|---|
| 抽屉 | `requestDrawer` + OverlayLayer 手势 | 右滑开（起手区 = 左 40% 屏宽，QQ 式）、左滑关、Esc / 遮罩关；焦点进出由独立 effect 管理 |
| 底部表 | `openSheet` / `Sheet` | 会话表（工作区分组 + 吸顶头）/ 插件表；最多占屏高 64%，顶部把手可下拉关闭 |
| 加号面板 | `openOfficialAddMenu` + `tagComposerMenus` | 程序化点击官方 ⊕，对面板 surface 打标 + 分页 + 配色；与软键盘互斥 |
| 设置页手机化 | `tagSettings` | 官方设置对话框改全屏：品牌行 + 可横滑页签 + 返回键；自带页签滑动手势 |
| 页头侧栏键 | `syncPageHead` + `OverlayLayer` 兜底 | 全局面板页 Sidebar 键贴标题左缘；页头几何滚动跟踪，滚出视口隐藏 |
| Composer 融合 | `syncComposerPad` / `syncComposerFrame` | 输入区去边框融合底部面板；权限 / 模型 chip 留输入行 |

## 6. 模块地图（函数分组）

| 分组 | 代表函数 |
|---|---|
| 宿主 / 模式 | `detectHost` · `classify` · `resolveMode` · `measure` |
| i18n | `STRINGS` · `t` · `detectLang` · `setLang` |
| 状态 store | `getState` · `setState` · `subscribe` · `useLayoutState` |
| 锚点 / 样式 | `applyAnchors` · `clearAnchors` · `injectStyle` · `frameElement` |
| 页头 / 浮动键 | `findPageTitle` · `floatMenuLeft` · `syncPageHead` · `clearPageHead` |
| Composer | `syncComposerChips` · `syncComposerPad` · `syncComposerFrame` · `syncHero` |
| 加号面板 | `collectAddOptions` · `planAddPages` · `syncAddPaging` · `planAddTints` · `tintHash` |
| 设置页 | `tagSettings` · `settingsTabItems` · `switchSettingsTab` · `ensureSettingsBack` · `centerSettingsTab` |
| 会话表 | `sessionRows` · `groupSessionsByWorkspace` · `workspaceLabelFor` · `formatRelativeTime` |
| 浮层 / 手势 | `openSheet` · `closeSheet` · `openOfficialAddMenu` · `closeOfficialAddMenu` · `syncOverlayHistory` · `requestDrawer` |
| 组件 | `HamburgerButton` · `BottomBar` · `Sheet` · `AddPager` · `OverlayLayer` |
| 生命周期 | `apply` · `dispose` |

## 7. 生命周期

```
apply(ctx)
  ├─ injectStyle（样式只注入一次）
  ├─ resolveAnchors（打锚点，失败不阻断）
  ├─ evaluateNow（宿主/模式判定，写 data-dshm-mode）
  ├─ MutationObserver / resize / scroll / keyboard 监听
  ├─ ctx.inject(['slots','layout']) → 注册三个槽位 + 订阅 panelInfo
  ├─ ctx.inject(['sessions','uiWorkspace'])
  └─ ctx.inject(['locale'])

dispose()
  ├─ 移除全部监听与 observer
  ├─ clearAnchors + clearPageHead（还原官方 DOM）
  ├─ 摘除注入样式
  └─ 官方槽位由 cordis 随插件卸载回收
```

## 8. 测试与质量边界

- **纯函数 + 源码契约单测**（69 项）：所有几何决策、分页、配色、状态机判定都抽成纯函数，经 `module.exports.__test` 出口在 Node 单测中覆盖（vm 沙箱隔离，测试不碰 DOM）。
- **包契约自检**：`verify-package` 校验 bundle 内 `VERSION` 与 package.json 一致、发布文件清单完整。
- **真机验收**：MuMu 模拟器（720×1280）+ Redmi K70 真机两档；验证矩阵与 adb 部署方法见《技术说明》第 6 节。
- **明确不做的**：不改官方 DOM 结构（只打属性）、不拦截系统边缘手势（WebView 无权限）、桌面端不激活。
