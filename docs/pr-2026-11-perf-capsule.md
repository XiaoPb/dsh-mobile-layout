# PR 记录：每帧链探测节流 + 弹层首帧打标 + 无障碍 + 胶囊界面收口

> PR：<https://github.com/XiaoPb/dsh-mobile-layout/pull/2>（分支 `feat/perf-capsule-2026-11`）
>
> **本分支已 rebase 到 `dcb1b6c`（0.4.12）**，再按真机反馈叠加胶囊界面的数值收口。
> 上一版的「纯 CSS 行高 / 分段控件 24px / 统计带 overflow」等改动已被上游 0.4.12 的
> inline 行高 + 还原机制取代，这里只保留与主线不重叠、且真机验证过需要的部分。

## 保留了什么

### 1. 每帧同步链：探测节流、维护不减速

主 observer 的每帧链里最贵的固定开销是**存在性探测**：设置页在不在、官方弹层开没
开，各要 1~4 次全文档查询，而绝大多数帧答案是「不在」。

- `PRESENCE_PROBE_MS = 120`：探测节流，结果**粘性**保存（`overlaysPresent` /
  `menuPresent`）——没有东西在屏上时中间帧连维护一起跳过，一旦探到就恢复每帧维护，
  官方重渲染冲掉标记仍能下一帧补回。官方弹窗（含设置页）插入的那一帧把
  `lastPresenceProbeAt` 清零，下一帧立刻补探，设置页不会先按桌面形态画出来。
- `prunePopoverMarks` 改为遍历 `popoverMarks` 登记表（`tagComposerMenus` 打标时登记
  并去重），空表 O(1)；`syncPanelSpace` 从登记表取面板根。
- 输入卡节点改为缓存 + `isConnected` 复核；`removeLayoutPickers` 用
  `layoutPickerCount` 做 O(1) 闸门；每帧链里重复的 `syncLayoutPicker()` 去掉一次。

收益口径（不要写成「归零」）：去掉的是三处**无条件**的每帧全文档扫描；剩余每帧
开销主要来自 `syncOverlayHistory` 的存在性判断，有浮层在屏上时它仍会量尺寸
（`overlayVisible` / `genericOverlayVisible`），只有「没有任何浮层」的帧才没有强制
布局读数。

### 2. 官方弹层首帧打标 / 先藏再显

- 主 observer 回调接收 mutation records：新增节点里出现 `[role=listbox]` /
  `[role=menu]` 时记 `menuDueAt`，同一帧的 rAF（**绘制前**）立刻补
  `tagComposerMenus`；补打窗口 `MENU_TAG_WINDOW_MS = 400`。
- 新增官方弹层在插入的同一拍先 `visibility: hidden`，等本帧的 rAF（打标/定位）跑完
  再显示。**三条约束**（合并前 review 补的）：
  - 只在 `state.mode === MODE_MOBILE` 生效，桌面/平板不藏官方弹窗；
  - 跳过插件自绘浮层（`.dshm-sheet` / `.dshm-quick` / `[data-dshm-attach-menu]` /
    `[data-dshm-layout-picker]`），也不接手已被 `liftAboveDock` 藏住的节点；
  - 判稳用 `offsetLeft/Top/Width/Height`（不受 `dshm-panel-in` / `dshm-sheet-up` 的
    translate 入场动画影响），隐藏上限约 66~133ms。用 `getBoundingClientRect`
    判稳会把带 180/220ms 动画的面板一直藏到动画结束。

### 3. 无障碍

- `trapFocus(container)`：底部表 Tab / Shift+Tab 在面板内循环。
- `announce(message)`：常驻视觉隐藏 `role=status` 播报区，底部表开合各播一次
  （`STRINGS.a11yOpened/a11yClosed`，中英成对）；隐藏用 `clip + 1px` 而不是
  `display:none`（后者读屏整段跳过）；同一句重复播报先清空再写。
- `clearAnchors` 会摘掉播报区节点。

### 4. 胶囊界面（按真机反馈）

- 头部行高 `36px 48px → 36px 32px`（内联与 CSS 兜底同值），分段控件单项
  `min-height 2.5rem → 1.5rem`、横向内边距 `0.75em → 0.95em`（字号仍 13px）。
- 统计带 `space-between` 等距铺开 + 收内边距/图标（10.5px / 1.1em），三组数字完整显示；
  header 卡片 `overflow: visible`（40×40 按键落在 36px 行里，裁切会切掉按键）。
- 标题行带文字的按键 `flex: 0 0 auto; white-space: nowrap`，不再竖排、也不挤掉标题。
- `.dshm-seg` / `.dshm-attach-btn` 的创建点加 `capsuleMode()` 闸门（它们的 CSS 只在
  胶囊作用域，别的预设里创建出来就是裸按钮）。
- ⋯ 菜单展开期间不再抬 header 层叠，改为 `[data-dshm-viewtabs-row]` `pointer-events:
  none`，侧栏键与统计带不再被盖住、也没有回位闪烁。

### 5. 测试

- `npm test` 去掉 `--test-force-exit`（该参数会在用例未跑完时按掉子进程：同一份
  代码实测 282 / 290 / 297，全量 308，门禁看起来绿其实漏跑）。
- 新增 `test/frame-sync.test.js`（10 项）与 `test/a11y.test.js`（5 项）源码契约；
  其中「插入即隐藏」的形态/几何判据与「不残留调试探针」是合并前 review 补的回归锁。

## 合并前 review 修掉的问题

| 问题 | 处理 |
|---|---|
| 遗留 `[dshm-geo]` 调试探针（body 级 observer + 每次开弹层 12 帧强制布局 + `console.warn`） | 整块删除 |
| 「插入即隐藏」误伤插件自绘底部表（`role=dialog`，220ms 上滑）与桌面官方弹窗 | 加形态闸门 + 归属判断 |
| 按 `getBoundingClientRect` 判稳，等于把面板藏住整段入场动画 | 改 `offset*`，上限收到约 66~133ms |
| CSS 兜底 `40px 32px` 与内联 `36px 32px` 不一致（页签行缺失时跳 4px） | 统一为 36/32 |
| `clearAnchors` 先摘 `data-dshm-header-card` 再还原内联行高（还原失效） | 调换顺序，并一并清掉布局选择器节点 |
| CHANGELOG / 本文档称这些胶囊改动「已丢弃」、字号 13→12、z-index 56/55 | 按代码实际行为改写 |

## 验证

- 单测：**324 项 / 316 pass / 8 skip**（跳过的仍是 jsdom 相关）。
- 全量 `npm run check` PASS：hardcoded 230 known / 0 new；colors 0 raw；
  important 152 规则 / 608 声明，0 可收紧。
- 真机（OnePlus PLZ110 / Android 16 / WebView 156）：胶囊头部变矮、统计带三组完整、
  无竖排文字、标题保留；本分支最后一次改动（插入即隐藏的归属/几何判据）未单独在
  设备上复验，逻辑等价性由源码契约锁住。

## 已知未解决

- **图片上传失败**：`/api/session/uploadFileBinary?mediaType=image%2Fjpeg` 返回
  `net::ERR_FAILED`（连接层失败，非 4xx/5xx），同端点传文件正常；PR 里已改为按
  `accept` 选官方输入，实际效果待真机复验。

## 回滚

- `git revert` 本 PR；或只恢复 `lib/client.js`（单文件产物，无构建步骤）。
