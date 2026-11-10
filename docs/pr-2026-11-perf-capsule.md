# PR 记录：每帧链探测节流 + 弹层首帧打标 + 无障碍（rebase 到 0.4.12）

> PR：<https://github.com/XiaoPb/dsh-mobile-layout/pull/2>（分支 `feat/perf-capsule-2026-11`）
>
> **本分支已 rebase 到 `dcb1b6c`（0.4.12）**，只保留与主线不重叠的部分。上一版里
> 的「胶囊头部行高 / 分段控件尺寸 / 标题左对齐 / 侧栏键圆环」已**全部丢弃**——
> 上游 0.4.12 的 `fix(header): tighten capsule header rows to 36/48` 已经做了同一
> 件事，且用的是 inline 行高 + 还原逻辑，比本 PR 的纯 CSS 更稳。

## 保留了什么

### 1. 每帧同步链：探测节流、维护不减速

主 observer 的每帧链里最贵的固定开销是**存在性探测**：设置页在不在、官方弹层开没
开，各要 1~4 次全文档查询，而绝大多数帧答案是「不在」。

- `PRESENCE_PROBE_MS = 120`：探测节流，结果**粘性**保存（`overlaysPresent` /
  `menuPresent`）——没有东西在屏上时中间帧连维护一起跳过，一旦探到就恢复每帧维护，
  官方重渲染冲掉标记仍能下一帧补回。
- `prunePopoverMarks` 改为遍历 `popoverMarks` 登记表（`tagComposerMenus` 打标时登记
  并去重），空表 O(1)；`syncPanelSpace` 从登记表取面板根。
- 输入卡节点改为缓存 + `isConnected` 复核；`removeLayoutPickers` 用
  `layoutPickerCount` 做 O(1) 闸门；每帧链里重复的 `syncLayoutPicker()` 去掉一次。

稳态：帧路径上的全文档查询约 10 次/帧 → 约 0.4 次/帧，强制布局读数归零。

### 2. 官方弹层首帧打标

主 observer 回调现在接收 mutation records：新增节点里出现 `[role=listbox]` /
`[role=menu]` 时记 `menuDueAt`，同一帧的 rAF（**绘制前**）立刻补
`tagComposerMenus`；补打窗口 `MENU_TAG_WINDOW_MS = 400` 覆盖官方填内容的几帧。
不再「先按官方锚点画一帧、下一拍才跳到底部」。

### 3. 无障碍

- `trapFocus(container)`：底部表 Tab / Shift+Tab 在面板内循环。
- `announce(message)`：常驻视觉隐藏 `role=status` 播报区，底部表开合各播一次
  （`STRINGS.a11yOpened/a11yClosed`，中英成对）；隐藏用 `clip + 1px` 而不是
  `display:none`（后者读屏整段跳过）；同一句重复播报先清空再写。
- `clearAnchors` 会摘掉播报区节点。

### 4. 测试

- `npm test` 去掉 `--test-force-exit`（该参数会在用例未跑完时按掉子进程：同一份
  代码实测 282 / 290 / 297，全量 308，门禁看起来绿其实漏跑）。
- 新增 `test/frame-sync.test.js`（7 项）与 `test/a11y.test.js`（5 项）源码契约。

## 丢弃了什么（原因）

| 丢弃项 | 原因 |
|---|---|
| 胶囊头部行高 38/32、分段控件 24px | 上游 0.4.12 已做 36/48 inline 版本 |
| 标题左对齐、侧栏键圆形描边 | 属于设计取舍，应由维护者定 |
| 对话区打标合并 / tick 节流 / teardown | 上游 0.4.12 已把该 DOM 打标子系统整体移除（native dialogue/commands） |
| 终端换行按钮同步 | `syncTerminalWrap` 在 0.4.12 中已不存在 |
| 统计带 overflow/等距铺开 | 上游已重写该区块 |

## 验证

- 单测：**321 项 / 313 pass / 8 skip**（跳过的仍是 jsdom 相关）。
- 7 个 check 脚本全 PASS（hardcoded 230 known / 0 new；colors 0 raw；important 145 规则 / 581 声明，0 可收紧）。
- 真机：本次 rebase 后**尚未**在设备上验证（上一版行为已验：菜单不遮输入区、二次点击收起）。

## 已知未解决

- **图片上传失败**：`/api/session/uploadFileBinary?mediaType=image%2Fjpeg` 返回
  `net::ERR_FAILED`（连接层失败，非 4xx/5xx），同端点传文件正常；插件两条注入路径
  代码相同，怀疑体积或 `image/*` 分支，待用几百 KB 截图二分。

## 回滚

- `git revert` 本 PR；或只恢复 `lib/client.js`（单文件产物，无构建步骤）。
