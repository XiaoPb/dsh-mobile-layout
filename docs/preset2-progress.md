# 预设 2（悬浮卡片 + 五项导航）进度与交接

> 更新时间：2026-10-31 13:30 · 分支 `main` · 版本 0.3.0
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
| 本轮 | 引擎状态条让位改为 `--dshm-engine-bar` 变量；README / 版本 0.3.0 |

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
