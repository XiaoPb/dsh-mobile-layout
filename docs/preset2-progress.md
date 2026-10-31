# 预设 2（悬浮卡片 + 五项导航）进度与交接

> 交接时间：2026-10-31 13:00 · 分支 `main` · 最近提交 `546fd31`
> 环境：MuMu 模拟器 / DSH 1.4.67 / 插件 0.2.11（待升 0.3.0）/ 视口 400×684 CSS

---

## 1. 已完成

| commit | 内容 |
|---|---|
| `11224c5` | 三层解耦：宿主 host → 手机形态 phone → 外观预设 preset（default / classic / v2），`resolvePreset` / `isPhoneForm` / `effectiveMode` 等纯函数 |
| `2194c17` | 设置页注入「布局模式」三选一（`data-dshm-form` 供样式，切到默认时选择器仍在） |
| `3008f7a` | 预设 2 壳层：悬浮输入卡（复用官方卡片）+ 五项导航 `会话 / 工作区 / 插件 / 工作台 / 设置` |
| `a01c7c0` | 方案文档 `docs/preset2-implementation-plan.md` + 六帧线框 |
| `1e7c66f` | 加号面板按官方分组渲染（附件段前置、组标题恢复显示） |
| `593c4e2` | 插件 / 设置保留五项导航；底部弹层改覆盖式抽屉（不再把正文推上去） |
| `ddb1746` | **工作台**改走 `ctx.sidebarRight`，真正打开官方右侧面板 |
| `3db7430` | 会话键改为「回首页」：有页面态时先回会话页，在会话页才弹抽屉 |
| `5e4c714` | 去掉底栏分割线；输入卡下移 40px 贴到导航上沿 |
| `546fd31` | 清掉抽屉手势里的 24 行 TEMP-DEBUG 日志 |

### 已验证行为（MuMu 实测）

- 三档互切：预设1 ↔ 预设2 ↔ 默认；切默认后官方三栏恢复、设置里三张卡仍在
- 五项导航常驻：会话页 / 插件页 / 设置页 / 工作台页都保留，选中项高亮
- 工作台：打开官方右侧面板（手机自动 100vw 全屏），面板底部让出导航，标题不被
  应用级「引擎已就绪」状态条压住
- 会话键：在工作台 / 插件 / 设置页点击 → 回会话页；在会话页点击 → 开关会话抽屉
- 加号面板：官方分组（附件 / 添加 / 指令）纵向排列，组标题可见，选项可点
- 输入卡下沿 = 导航上沿（实测 `card.bottom = bottom.y = 628`），中间无 hairline
- `npm test` 115 项全过；`node scripts/verify-package.mjs` ALL PASS

---

## 2. 尚未完成

### 2.1 本轮用户新提的两条（未动工）

**② 附件拆成 图片 / 相机 / 文件 三项**

现在「附件」段只有官方 `文件` 一项（`addPanelGroups` 把命中 `ADD_ATTACH_ALIASES`
的项抽到最前）。要加的两个入口官方没有，得用 v1 的做法自建：

```js
h('input', { type:'file', accept:'image/*', multiple:true, hidden:true, 'data-dshm-input':'' })   // 图片
h('input', { type:'file', accept:'image/*', capture:'environment', hidden:true, 'data-dshm-input':'' }) // 相机
h('input', { type:'file', multiple:true, hidden:true, 'data-dshm-input':'' })                        // 文件
```
选中后统一走 `injectOfficialFiles(files)`（已实现，v1 在用）。注意自建 input 必须带
`data-dshm-input`，否则 `injectOfficialFiles` 会选中它自己造成回环。

**③ 添加 / 指令 改成「菜单项 → 二级页」**

用户要的是：一级页只列 group 名（菜单行），点进去才是该 group 的条目列表，
**每条带标题 + 副标题**。当前把官方 group 标题和宫格平铺，做不到二级页与副标题。

设计结论（已探明可行性，尚未写码）：

- 官方加号面板是 `[role=listbox]` + `[role=option]`，option 内部 span 依次是
  **名称 / 别名 / 描述**（`optionTexts()` 已经在读）。描述可以直接当副标题。
- 不要试图往 listbox 里插自己的节点（会破坏 `aria-activedescendant` 与键盘导航）。
  正确做法是**自绘一个 React 面板**（挂在 `shell.overlay`，与 `Sheet` 同级），
  把官方面板当「数据源 + 动作派发器」：
  1. 用 `openOfficialAddMenu()` 打开官方面板（可先置 `html` 上的 ghost 标记，
     CSS 让它 `opacity:0`，MutationObserver 在微任务里打标，不会闪一帧）；
  2. `collectAddOptions()` 收 `{group, key, label, desc}` 存进 state；
  3. 自绘面板渲染：一级 = 附件三块（图片/相机/文件）+ 每个 group 一行（带计数与
     右箭头）；二级 = 返回头 + 该 group 的条目（标题 + 副标题）；
  4. 点条目 → 直接 `node.click()` 派发官方动作（节点还在，零延迟）；节点已卸载
     则重开官方面板轮询同 key 再点。
- 自绘面板的全屏 mask 必须 `pointer-events:auto` 且层级高于 ghost 的官方面板，
  否则会点到底下那个看不见的官方浮层。
- 关闭自绘面板时同时收掉官方面板（`closeOfficialAddMenu()`），别留一个不可见的
  浮层在底部吃点击。

### 2.2 方案文档里原有、但还没做的

- **v2 顶栏**：`ensureV2Header`（会话标题 / 工作区 + 权限副标题 / 新建按钮）
- **空态**：顶部锚定 + 最近会话列表（现在是预设 1 的居中式 hero）
- **运行态进度条**：先探有没有官方信号（发送键 aria-label 变化 / stop 按钮 /
  `[data-streaming]`），读不到就整条删掉，不做假进度
- **测试与文档**：`test/mode.test.js` 补 v2 用例、`scripts/verify-package.mjs`
  放行新属性、README / architecture / technical-notes / 截图
- **版本**：0.2.11 → 0.3.0

---

## 3. 踩过的坑（按坑的隐蔽程度排序）

1. **`ctx.layout.openRightbar(track, fullscreen)` 是「上报」不是「打开」**
   右栏插件渲染时调用它告诉布局层「我是什么形态」。单独调它只置
   `rightbarShown=true`，`track` 仍是 undefined，官方 `computeColumns()` 里
   `rightbarTrack ? pref : 0` 取 0 → 列宽 0，屏幕上什么都不出现。
   真正的开关是 `ctx.sidebarRight.toggleExpanded()` / `isExpanded()`。

2. **右栏展开状态是持久化的**
   `force-stop` 重启后 `expanded` 仍是上次的值。表现是「点一下没反应」——
   其实是把它关掉了。调试时必须先确认初态，别把关当成开。

3. **底栏在 `rightbarFullscreen` 时被整条隐藏**
   `visible = mobile && !rightbarFullscreen && ...`。工作台一开，导航消失，
   「进去就出不来」。v2 里改成常驻。

4. **面板内 dock 层的 z-index 40 会压过没有 z-index 的底栏行**
   只把面板底部让出来不够，导航还得 `position: relative; z-index: 60`。

5. **设置页要三件事一起做**：预设 1 把 `[data-dshm-bottom]` 整行
   `display:none`、设置弹窗钉成 `inset:0`、overlay `z-index:1000`。
   只抬 z-index 完全无效（行 `display:none` 时导航本身就是 0×0，探针实测
   `navrect=0,0 0×0`）。另外切页面前必须先 `closeSettingsImmediate()`，
   否则新页被压在 overlay 底下 =「点了没反应」。

6. **组标题「打了标记却不显示」是 CSS 特异性**
   预设 1 有 `[role="presentation"]{display:none!important}`（0,4,1），比
   `[data-dshm-add-group-title]{display:block!important}`（0,3,1）高一级。
   修法是加 `:not([data-dshm-add-group-title])`。

7. **`addOptionKey()` 产出的是 `alias:file` / `label:文件`**
   跟 `ADD_ATTACH_ALIASES` 里的 `file` 直接比较永远不中，「文件」从来没被识别成
   附件。比较前必须剥前缀（`attachAliasOf()`）。

8. **输入卡离底栏 40px 是两处留白叠的**：输入座 `padding-bottom: 8px` +
   官方 `composerStack` 的 `padding-bottom: 32px`。官方类名带构建哈希
   （`wSKVaV_composerStack`），用 `[class*="composerStack"]` 匹配。

9. **空会话首页顶部那条「引擎已就绪」不在 DOM 里**
   它是应用自身的原生视图（TreeWalker 找不到、`elementFromPoint` 命中的是别的
   节点、CSS 关不掉）。只能给面板补顶部内边距让位（空态 `composer-split` 下 56px）。

10. **底部弹层「把正文推上去」的根因是 `--dshm-panel-space`**
    它撑起 frame 的 `padding-bottom`。v2 里恒为 0 就得到覆盖式抽屉；
    导航只加 `pointer-events:none`，**不要收缩高度**（收缩会让正文回流，等于又推一次）。

11. **输入框草稿会持久化**
    `/目标` 会一直留在输入框里，此时官方加号面板只显示指令类条目，很容易误判成
    「分组没生效」。

12. **测试期间会弹「开始使用」登录弹窗**
    它自带 z-index 1000 的遮罩，挡住所有点击。每次 `force-stop` 重启后都可能再弹，
    脚本里先 `input tap 609 560` 关掉再操作。

---

## 4. 调试经验（MuMu 真机取证）

### 坐标换算

- 视口 **400×684 CSS**，WebView 缩放 **1.8**，顶部状态栏 **49px**
- `adb shell input tap` 用设备像素：`x = cssX × 1.8`，`y = 49 + cssY × 1.8`
- 截图 720×1280；导航五项中心 css x = 40 / 120 / 200 / 280 / 360，
  y ≈ 655（→ 设备 1228）
- 输入行 ⊕ 在 css (49, 585) 附近（→ 设备 88, 1054）

### 部署

```sh
sh _dshm-shots/deploy2.sh v2                 # 强制预设 v2 并重启
sh _dshm-shots/deploy2.sh v2 _dshm-shots/probe-xxx.js   # 追加探针
```
`deploy2.sh` 会把 `lib/client.js` 里的 preset 读取改成硬编码（避免 localStorage
干扰），push 到
`/data/data/app.dshm.mobile/files/dsh-home/profiles/web/node_modules/@xiaopb/dsh-mobile-layout/lib/client.js`
后 `force-stop` + 重启。**push 后一定 `wc -c` 核对字节数**，静默失败过几次。

### 探针写法（插件没有暴露运行时钩子）

- 在文件末尾追加一个 IIFE（`setTimeout` + 固定定位浮层），把要看的数值画在屏上，
  再截图读。比 logcat 可靠（这版 Android 的 console 不进 logcat）。
- 浮层必须 `pointer-events:none`，否则会吃掉点击（踩过：全屏白底浮层挡住输入框）。
- 浮层 `z-index: 2147483647`，位置留在不遮挡目标的空区。
- **探针延时和截图时间要错开 2 秒以上**：12s 的探针，13s 截图经常读不到，
  14s 才稳定。
- 需要读运行时对象时，临时在 `apply()` 里加 `win.__DSHM_RT = runtime;`，
  调试完删掉（本轮已经删过一轮，注意别提交进去）。

### 排查顺序（省时间的那个顺序）

1. 先看 DOM 有没有 → 有再看计算样式（display / visibility / opacity / z-index）
2. 有样式又看不见 → `document.elementFromPoint(x, y)` 看命中谁（找遮挡层，
   设置页与工作台都是这么定位的）
3. 命中自己 → 检查祖先的 `overflow` / 包含块 / transform
4. 都没有 → 大概率不在 DOM（原生视图），别再往 CSS 上找

---

## 5. 下一步建议

1. 先做 ②（附件三项）——小、独立、不依赖面板重做；临时可以挂在现有官方宫格里
   验证 `injectOfficialFiles` 的三条链路（相册 / 相机 / 文件）。
2. 再做 ③（二级菜单页），按 §2.1 的自绘面板方案，一次把「附件三块 + group 行 +
   二级列表」做完，避免在官方 DOM 上叠两套。
3. 之后回到 §2.2：v2 顶栏 → 空态 → 运行态进度条 → 测试与文档 → 版本 0.3.0。
