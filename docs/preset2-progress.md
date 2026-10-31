# 悬浮布局（v2）进度与交接

> 三套布局的对外名字：**原生 / 融合 / 悬浮**（原生 = DSH 官方原样；融合 = 输入区与底栏连成一条，即 v1；悬浮 = 输入卡浮起 + 五项导航，即 v2）
>
> 更新时间：2026-10-31 14:25 · 分支 `main` · 版本 0.3.0
> 环境：MuMu 模拟器 / DSH 1.4.67 / 视口 400×684 CSS（dpr 2）

---

## 1. 已完成

| commit | 内容 |
|---|---|
| `11224c5` | 三层解耦：宿主 host → 手机形态 phone → 外观预设 preset（default / classic / v2） |
| `2194c17` | 设置页注入「布局模式」三选一（`data-dshm-form` 供样式，切到默认时选择器仍在） |
| `3008f7a` | 预设 2 壳层：悬浮输入卡 + 五项导航 `会话 / 工作区 / 插件 / 工作台 / 设置` |
| `a01c7c0` | 方案文档 `docs/preset2-implementation-plan.md` + 六帧线框 |
| `1e7c66f` | 加号面板按官方分组渲染（附件段前置、组标题恢复显示） |
| `593c4e2` | 插件 / 设置保留五项导航；底部弹层改覆盖式抽屉 |
| `ddb1746` | **工作台**改走 `ctx.sidebarRight`，真正打开官方右侧面板 |
| `3db7430` | 会话键改为「回首页」：有页面态时先回会话页，在会话页才弹抽屉 |
| `5e4c714` | 去掉底栏分割线；输入卡下移 40px 贴到导航上沿 |
| `546fd31` | 清掉抽屉手势里 24 行 TEMP-DEBUG 日志 |
| `20cfa45` | 交接文档 |
| `fa6af34` | **加号面板改自绘一 / 二级菜单**：附件拆图片 / 相机 / 文件，分组进二级页 |
| `18d7c57` | 引擎状态条让位改为 `--dshm-engine-bar` 变量；README / 版本 0.3.0 |
| 本轮 | 第二键「工作区」→「**自动化任务**」；底栏换 DSH 官方图标 + 官方蓝高亮；底栏透明；会话抽屉固定 55%；工作台横滑退出；面板页点工作台先收页；打开设置时隐掉中间菜单 |

### 已验证行为（MuMu 实测）

- 三档互切；五项导航在会话 / 插件 / 设置 / 工作台四页都常驻、选中态正确
- 工作台：开 / 关官方右侧面板，全屏面板给导航让位，中心列不透视
- 会话键：其它页点它回会话页；会话页点它开关抽屉
- 加号面板：一级 = 附件三块 + 分组行；二级 = 条目（标题 + 官方描述）
  - 图片 / 相机 → 系统图片选择器（自建 `input[type=file]`，相机带 `capture`）
  - 文件 → 官方那一项（保留官方上传与校验链路）
  - 指令 · 模型 → 打开官方模型选择器；添加 · 目标 → `/目标` 写入输入框
  - 返回键 / Esc / 遮罩点击都能收起，且不会退出应用
- 输入卡下沿 = 导航上沿；底部弹层覆盖式、不推正文
- 第二键进官方「自动化任务」页（panelId = `schedules`），当前页高亮为官方蓝；再点一次回会话
- 工作台：左滑 / 右滑都能退出（页签条与横滚容器让路）；从插件 / 自动化页点它先收页面再打开
- 会话抽屉固定 55% 屏高，条目少时底部留白；底栏透明，输入卡阴影不被切断
- 打开设置时中间那层「更多操作 / 账号」菜单不可见（`data-dshm-opening-settings`）
- `npm test` 123 项全过；`verify-package` ALL PASS

---

## 2. 尚未完成 / 明确不做

### 2.1 v2 顶栏：决定「沿用官方」而不是重写

官方顶栏在手机竖屏下承载四个入口：**侧栏抽屉、会话层级标题、对话 / 轨迹页签、右侧工作台**。
自绘一套 `ensureV2Header` 等于把这四个入口的功能重写一遍，且工作台入口在空态还必须
保留——收益（多一行「工作区 + 权限」副标题）远小于风险（页签切换、会话层级、抽屉
入口全要重新接线，官方每次改版都要跟）。**结论：不重写**，只做样式适配（已有）。

### 2.2 空态「顶部锚定 + 最近会话」：不做

当前空态是官方居中 hero（`探索未至之境`），实测观感正常，且输入卡就在下方一屏内。
要改成顶部锚定 + 最近会话列表，需要往官方 hero 上方插节点并与官方重排冲突，
收益不抵成本。**保留官方居中 hero**。

### 2.3 运行态进度条：没做，需要先取证

方案里写了「先探有没有官方信号，读不到就整条删」。发送中状态的真机信号
（发送键 aria-label 变化 / stop 按钮 / `[data-streaming]`）**尚未取证**，
没有证据前不做假进度。

### 2.4 文档截图

`docs/assets/screens/` 还是 0.1.6 的图，预设 2 的六帧线框有了
（`docs/assets/preset2-wireframe.svg`），但没有真机截图。

---

## 3. 踩过的坑（按隐蔽程度排序）

1. **`ctx.layout.openRightbar(track, fullscreen)` 是「上报」不是「打开」**
   只调它 → `rightbarShown=true` 但 `track` 未定义 → 官方 `computeColumns()`
   里 `rightbarTrack ? pref : 0` 取 0 → 列宽 0，屏幕上什么都没有。
   真正开关是 `ctx.sidebarRight.toggleExpanded()` / `isExpanded()`。

2. **右栏展开状态持久化**
   `force-stop` 重启后仍是上次的值。表现像「点一下没反应」，其实是把它关掉了。

3. **官方加号选项只挂 `onMouseDown`，没有 `onClick`**
   探针读 React props 实测：`{onMouseDown}`（模型那条多一个 `onMouseMove`）。
   所以 `node.click()` 完全不触发动作，必须
   `dispatchEvent(new MouseEvent('mousedown', {bubbles:true, ...}))`。
   这条卡了整整一轮：面板能开、能进二级页，就是点了没反应。

4. **官方面板是「点外部关闭」的，第一次点自绘面板它就被收掉**
   节点随之卸载，手里缓存的节点全部失效。自绘面板不能把生命周期挂在
   `popoverOpen` 上（会跟着面板一起消失），派发动作时也不能只用手里的节点：
   要重开官方面板、**按当前 DOM 重建 key → 节点表**再点。
   只重开不重建表，表现是「循环 20 次全点空，最后把官方面板留在屏幕上」。

5. **底栏在 `rightbarFullscreen` 时被整条隐藏** → 进工作台就出不来。v2 改成常驻。

6. **面板内 dock 层 z-index 40 压过没有 z-index 的底栏行** → 导航还要 `position:relative; z-index:60`。

7. **设置页要三件事一起做**：`[data-dshm-bottom]` 行 `display:none`、弹窗 `inset:0`、
   overlay `z-index:1000`。只抬 z-index 无效（行 `display:none` 时导航本身是 0×0）。
   切页面前必须先 `closeSettingsImmediate()`，否则新页被压在 overlay 下 =「点了没反应」。

8. **组标题「打了标记却不显示」是 CSS 特异性**
   预设 1 的 `[role="presentation"]{display:none!important}`（0,4,1）压过
   `[data-dshm-add-group-title]{display:block!important}`（0,3,1），
   加 `:not([data-dshm-add-group-title])` 才行。

9. **`addOptionKey()` 产出 `alias:file` / `label:文件`**，跟别名表里的 `file` 直接比
   永远不中，比较前必须剥前缀（`attachAliasOf()`）。

10. **输入卡离底栏 40px = 输入座 8px + 官方 `composerStack` 32px**
    官方类名带构建哈希（`wSKVaV_composerStack`），按 `[class*="composerStack"]` 匹配。

11. **「引擎已就绪」条是宿主原生视图**
    DOM 里搜不到（含 shadow root，`txtHits=0`）、`elementFromPoint` 命中的是登录遮罩
    （它盖在遮罩之上）、`innerHeight` 恒 684（不改视口）、`DshAndroid*` 桥只有
    剪贴板和下载两个方法（没有收起它）。唯一杠杆是预留高度：
    `--dshm-engine-bar`。它能点右侧箭头收起，所以默认值要给成可调变量，
    别写死在两条规则里。

12. **底部弹层「把正文推上去」的根因是 `--dshm-panel-space`** 撑起 frame 的
    `padding-bottom`。v2 恒为 0 即得覆盖式抽屉；导航只加 `pointer-events:none`，
    **不要收缩高度**（收缩会让正文回流，等于又推一次）。

13. **输入框草稿会持久化**：`/目标` 会一直留在输入框里，此时官方加号面板只显示
    指令类条目（没有分组标题）→ 自绘面板不接管 → 看到的是官方原面板。
    这不是 bug，但排查时极易误判。

14. **测试期间会弹「开始使用」登录弹窗**（z-index 1000 遮罩），脚本里先
    `tap 607 556` 关掉。

15. **vm 沙箱里 `assert.deepEqual` 会因跨 realm 原型不同而失败**
    单测比较纯函数返回的对象时逐字段断言。

16. **右栏 store 会「假展开」**：`sidebarRight.isExpanded()` 读的是持久化偏好，
    重启后可能仍是 true，而面板其实没挂载 / 还是 `visibility:hidden`。
    只看服务就会把「没打开」判成「已打开」，第一下点击变成「关掉一个不存在的
    面板」= 没反应。**有 `[data-sidebar-right-panel]` 时以 `data-sidebar-right-open`
    为准**，服务只作兜底；两边不一致就先拨回一致再 toggle。

17. **面板页里右栏不渲染**：插件（`plugins`）/ 自动化任务（`schedules`）页盖住
    整个主区，此时 `toggleExpanded()` 只改 store、屏幕不动。要先
    `selectPanel(null)` 回会话页，再开右栏（延迟 ~140ms 等 React 提交）。

18. **官方图标名别按语义猜**：侧栏「插件」是 `IconPluginPinwheelOutlineRegular`
    （四瓣风车），「自动化任务」是 `IconClockOutlineRegular`（指针时钟），
    不是 `IconCordisPlugin` / `IconAlarmClock`。图标都在
    `@deepseek-ai/dsh-client-ui-primitives`，`require` 失败要能退回自绘图标。

19. **打开设置必然经过一层菜单**：官方没暴露 settings 服务，唯一路径是
    「点更多操作 → 点设置」；窄屏还会退到「账号菜单 → 设置」。所以隐身标记要
    在**进入 `openSettings` 的第一次**就挂上（不能只挂在「更多操作」分支，
    否则走账号菜单那条路径照样闪）。

20. **右栏页签的 × 看着「飞了」是官方的 min-width 留白**：`.tab` 是
    `min-width:80px`（content-box）+ `padding:0 10px`，关闭键 `absolute top:4 right:4`
    → 页签总宽 100、文字只占 ~47，× 被顶到最右边，中间空一大块。
    收成 `box-sizing:border-box; min-width:0; padding-right:26px` 后 × 紧贴文字。

21. **底栏不透明底色会把输入卡阴影切一刀**：卡片阴影会落到导航那一行，
    铺 `--dsw-alias-bg-base` 会在交界处出现一条硬边，看起来像输入框被截断。
    底栏与 `.dshm-v2-nav` 都要 `background: transparent`。

22. **设置页的滚动容器是「整页一个」，不是「每页签一个」**：`[data-dshm-settings-scroll]`
    的直接子节点只有两层 wrapper，各节藏在 `scroll > div > div > div[节…]` 里。
    早期按 `scroll.children` 找「外观」永远找不到，只好把选择器插在滚动区顶部，
    于是**每个页签都看得见**。

23. **「外观」小节就是「当前在通用设置」的判据**：别的页签没有这一节，所以
    找得到就插、找不到就移除，不用去猜官方三种激活标记（实测只有
    `aria-current="true"`，别处还见过 `aria-selected` / `data-state`）。
    节 = 「纯文本标题 + 内容块」，判定时要要求 `kids[0].children.length === 0`，
    否则节列表本身（第一个子节点就是外观节）会先被命中。

24. **节之间的分隔线来自各节的 `border-bottom: 0.5px`**，不是独立 `<hr>`。
    外来节点要自带 `padding: 16px 0` + `border-bottom` 才和相邻节对得上；
    上面那条由「外观」自己的 border 提供，不要重复画。

25. **`tagSettingsCards` 会把三张布局卡片也当成外观卡片**（三个等高、可选、
    role=radio），被打标后 CSS 会改成三列。加 `closest('[data-dshm-layout-picker]')`
    排除。

26. **切到「原生」= 插件整个退场**：`mode` 变 `default`，设置弹窗立刻回到官方的
    窄卡片形态（左侧竖排页签、24,24 350x636），底栏也没了。这**不是 bug**，
    但排查时容易误判——先读 `preset` / `mode` 再怀疑代码。选择器本身受
    `form=phone` 保护，在原生模式下依然在，用户回得来。

27. **外观卡片的真实尺寸**（用于对齐）：两列 180×84、`border-radius: 20px`、
    描边 `0.5px rgba(0,0,0,0.16)`、选中态 `background:#f5f6f7 + 边框加深`、
    标题 14px、节标题 16px。布局卡片照这套走，不再自绘蓝圈单选点。

28. **覆盖层的「当前页」不能各自独立判定**：设置是 `z-index:1000` 的覆盖层，
    打开时右栏（工作台）与面板页**仍挂在它下面**，`rightbarFullscreen` /
    `settingsOpen` 会同时为真 —— 先开工作台再开设置，底栏就亮两个蓝。
    正确做法是按覆盖顺序取**唯一**的 pageKey（settings → 面板页 → 工作台 →
    会话），其余一律不亮；不要用「各自判定 + 事后互斥」，因为覆盖是有方向的
    （设置盖住工作台，工作台盖住会话）。

29. **设置盖着工作台时点「工作台」不能 toggle**：底层那个工作台本来就在
    展开状态，直接 `setWorkbench()` 会把它关掉，表现为「设置关了、工作台也
    没了」。设置原本开着、且 `isWorkbenchOpen()` 为真时，只需要关掉设置
    （撤覆盖层），不要再动工作台。

30. **「在不在会话页」的判据必须含设置**：设置是覆盖层不是面板页，所以
    `panelActive` 为假。会话键若只判 `!panelActive && !isWorkbenchOpen()`，
    在设置里点会话会先弹出会话抽屉（盖在设置上）。要加上
    `!settingsOpen`——否则「回首页」语义被抽屉抢走。

---

## 4. 调试经验（MuMu 真机取证）

### 坐标换算

- 视口 **400×684 CSS**，WebView 缩放 **1.8**，状态栏 **49px**
- `adb shell input tap` 用设备像素：`x = cssX × 1.8`，`y = 49 + cssY × 1.8`
- 截图 612×1088 = 设备 720×1280 × 0.85（读图上的坐标要乘 720/612）
- 五项导航中心 css x = 40 / 120 / 200 / 280 / 360，y ≈ 655（→ 设备 1228）
- 输入行 ⊕ 现在在设备 **(78, 1128)**（去掉 40px 留白后整体下移）

### 部署

```sh
sh _dshm-shots/deploy2.sh v2                        # 强制预设 v2 并重启
sh _dshm-shots/deploy2.sh v2 _dshm-shots/probe-x.js # 追加探针
```
push 后**必须核对字节数**（静默失败过）。

### 探针写法

- 文件末尾追加 IIFE + 固定浮层，把数值画屏上再截图读；浮层必须 `pointer-events:none`
- **探针延时与截图时间错开 2 秒以上**
- 读 React 事件挂载：`Object.keys(node).filter(k => k.startsWith('__react'))`
  → `fiber.memoizedProps` 里列出函数型 prop（第 3 条坑就是这么找到的）

### 排查顺序

1. DOM 有没有 → 2. 计算样式（display / visibility / opacity / z-index） →
3. `elementFromPoint` 看谁在遮挡 → 4. 都没有就是原生视图，别再改 CSS

---

## 5. 下一步

1. 想加「运行态进度条」先取证：发送中真机抓一次 DOM，看发送键 / stop 按钮 / 状态属性有没有可用信号。
2. 预设 2 的真机截图补进 `docs/assets/screens/`，README 的截图段还没换。
3. `test/mode.test.js` 可补三项导航在页面态的可见性用例（当前覆盖在 `preset.test.js`）。
4. 选择器的「节插入」逻辑目前靠文本匹配「外观 / Appearance」；官方若改文案需要同步 `findAppearanceSection` 的正则。
