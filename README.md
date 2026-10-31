# dsh-mobile-layout

> 中文文档 ｜ [English version](README.en.md)

[![CI](https://github.com/XiaoPb/dsh-mobile-layout/actions/workflows/ci.yml/badge.svg)](https://github.com/XiaoPb/dsh-mobile-layout/actions/workflows/ci.yml)
[![Release](https://github.com/XiaoPb/dsh-mobile-layout/actions/workflows/release.yml/badge.svg)](https://github.com/XiaoPb/dsh-mobile-layout/actions/workflows/release.yml)
[![npm](https://img.shields.io/npm/v/@xiaopb/dsh-mobile-layout?label=npm)](https://www.npmjs.com/package/@xiaopb/dsh-mobile-layout)

**DSH 手机竖屏布局插件（v0.4.0）**

文档：[架构文档](docs/architecture.md) ｜ [技术说明](docs/technical-notes.md) ｜ [预设方案 / 进度](docs/preset2-progress.md) ｜ [更新日志](CHANGELOG.md) ｜ [English](README.en.md)

一个 Cordis 插件，让 DSH Web 客户端在**手机竖屏**下变成单手可操作的触控布局——**不修改官方内核、不替换官方布局插件**。仅识别手机竖屏形态，横屏 / 平板 / 桌面保持官方原样，像素级不变。

---

## 核心功能

- **左侧栏 → 抽屉**：屏幕左侧约 60% 区域（QQ 式，中间偏左起手）右滑打开，**跟手拖拽 + 松手吸附**（甩动优先），遮罩或左滑关闭；入口只有手势、无按键（不遮挡子页面返回键），手势常驻 window 捕获阶段、任何插件页面都可用；只在真正换页时自动收起（点空白、搜索、账号菜单等保持展开）。
- **底部常驻操作条**：新建 / 会话 / 文件 / 图片 / 插件 / 更多，紧贴输入区上沿。
- **加号面板**：与软键盘**揭开 / 覆盖式切换**（面板内容自适应高度；键盘上滑盖住面板、下滑揭开面板，输入行位置由视口跳变换算保持，无收展交叉）；开合带滑动动画（减动效宿主自动跳过）；4 列 × 2 行宫格，超过 8 项横向分页；图标**按功能类型配色**（蓝 / 橙 / 紫 / 绿 12 档柔和色，同类型同色、同屏不撞色、新增功能按别名哈希自动落位）。
- **会话面板 / 插件面板**：按工作区分组、吸顶标题、相对时间，最多占屏高 64%；顶部把手**下拉即关**，视觉对齐引擎 v1.4.57 官方弹层（28px 大圆角、抬升面、大标题、胶囊主按钮）。
- **输入区融合底部面板**：去圆角 / 边框 / 阴影、全宽同表面、1px 分界；空态收紧；权限与模型短名 chip 留在输入行（**「完全访问」恒标红**，中英文都认）。
- **设置页全屏**：品牌行 + 可横滑页签 + 返回键；内容区左右横滑切换页签，仅最左页签右滑跟手退出面板（其余方向让路换页，边界判定与翻页共享）。
- **选择器重造型**：模型 / 权限二级菜单改为贴底列表，选中态用主题蓝；空态下打开选择器不弹软键盘（搜索框自动落焦守卫，真点搜索框仍可正常输入）。
- **浮层互斥 + 历史栈**：抽屉 / 底部表 / 加号面板互斥，按层序逐层关闭；加号面板与输入法双向互斥（开面板先收键盘；面板开着点输入框先收面板、键盘等面板收完再拉起）。
- **三套布局预设**：**原生**（官方原样）/ **融合**（输入区与底栏连成一条）/ **悬浮**（手机应用形态），设置页一键切换，见下节。
- **中英文跟随**：插件自绘 UI（布局模式卡片、底栏、面板文案）随官方语言**实时刷新**，切语言不必重启；语言服务缺席时退回 `<html lang>` / 系统语言。
- **无障碍 & 动效降级**：`aria-modal`、焦点进出、尊重系统「减少动态效果」。

### 三套布局预设（原生 / 融合 / 悬浮）

三套布局叫**原生 / 融合 / 悬浮**：原生 = DSH 官方原样；融合 = 输入区与底栏连成一整条（v1）；悬浮 = 输入卡浮起 + 五项导航（v2）。切换入口只有一处：**设置 → 通用设置 → 外观下面**的「布局模式」，原生 / 融合 / 悬浮三张卡片（各带迷你线框缩略图），其它页签（模型 / 内置插件）不出现。切换即时生效、三档双向往返不残留，且**插件自带的配置页**（如桌宠配置、插件市场）同样被接管。

- **原生**：整体交还官方布局，只把官方设置弹窗钉成**居中悬浮窗**——左右等宽不掉边、上下各留约 10% 视口高（小屏保底、大屏封顶）；从其它预设切过来时设置页保持打开。
- **融合**：输入区与底栏连成一整条；空态虚线输入卡左右留白对称（此前左侧贴边、右侧多 7px，是官方滚动容器的经典滚动条沟槽所致）。

悬浮预设是**手机应用形态**：底部五项导航当换页器，输入卡悬浮，加号面板改成一 / 二级菜单。

- **五项导航**：会话 / 自动化任务 / 插件 / 工作台 / 设置，图标直接用 DSH 自带符号，当前页那枚用官方蓝（`--dsw-alias-state-business-primary`）上色。会话键是「回首页」——在插件 / 设置 / 工作台页按它回到会话页，已经在会话页才弹会话抽屉；插件 / 自动化任务 / 设置是**页面**不是弹层，导航常驻可继续换页（在该页再点同一个键 = 返回会话）。
- **工作台**：直接开关官方右侧面板（`sidebarRight.toggleExpanded`），手机宽度下官方自动全屏，面板底部给导航让位；**横滑一下即退出**，从插件 / 自动化任务页点它则先收起页面再打开。
- **加号面板（自绘）**：一级页 = 附件三块（**图片 / 相机 / 文件**）+ 各官方分组一行；点分组进二级页，条目按「标题 + 官方描述」列成菜单。数据与动作仍来自官方节点（读它的选项、派发它的 `mousedown`），不复制命令语义。
- **覆盖式抽屉**：加号 / 模型 / 权限 / 工作区选择都从底部盖上来，不把正文推上去；会话抽屉固定占屏高 55%，条目少时底部留白。
- **透明底栏**：底栏不铺底色、不画分割线，输入卡的软阴影可以直接落到导航这一行，不会被切出一条硬边。
- **引擎状态条让位**：宿主自己的「引擎已就绪」条是原生视图（DOM 里没有、CSS 关不掉、量视口也不变），用 `--dshm-engine-bar`（默认 56px）给面板让出顶部；习惯先点箭头收起它的话改成 `0px` 即可。

## 优势

| | |
|---|---|
| **零侵入** | 全部样式受 `data-dshm-mode="mobile"` 作用域保护，卸载或锚点失败即回退官方布局。 |
| **单文件产物** | `lib/client.js` 即发布物，无构建、无运行时依赖。 |
| **形态保守** | 识别三种宿主（Android 壳 / 桌面 Electron / 浏览器）；桌面端 DeepSeek Harness **永不激活**（任何窗口尺寸官方布局不变），其余形态只认手机竖屏、像素级不变。 |
| **触控优先** | 44px 触控目标、滑动手势、单手可达。 |
| **稳定配色** | 哈希落位，新增功能图标免改代码自动配色。 |
| **自适应几何** | 留白 / 圆角 / 高度全部走 CSS 变量（`clamp()` + 安全区），不写死 px，跨机型自动缩放。 |
| **硬编码守卫** | CI 扫描注入样式中的固定 px，**新增一处即失败**，存量进 baseline 渐进收紧。 |
| **真机验收** | MuMu 模拟器（720×1280）与 Redmi K70 真机复核，CI 单测 **129** 项全绿。 |

---

## 多机型自适应

几何量不写死：全部走 `html[data-dshm-form="phone"]` 作用域下的 CSS 变量，小屏不至于挤、大屏不至于留两条大空边，并叠加 `env(safe-area-inset-*)` 兼容挖孔屏 / 手势条。可在自己的用户样式里覆盖任一变量：

| 变量 | 默认值 | 作用 |
|---|---|---|
| `--dshm-settings-gutter` | `clamp(12px, 3.4vw, 20px)` | 原生设置悬浮窗左右留白（左右逐字符相同，居中不掉边） |
| `--dshm-settings-vpad` | `clamp(--dshm-settings-vpad-min 24px, 10vh, --dshm-settings-vpad-max 120px)` | 原生设置悬浮窗上下留白；小屏保底、大屏封顶 |
| `--dshm-settings-maxw` | `480px` | 原生设置悬浮窗最大宽度 |
| `--dshm-classic-gutter` | `clamp(12px, 3.4vw, 20px)` | 融合空态虚线输入卡左右留白 |
| `--dshm-classic-radius` | `16px` | 融合空态输入卡圆角 |
| `--dshm-v2-gutter` | `8px` | 悬浮输入卡四周留白 |
| `--dshm-v2-radius` | `20px` | 悬浮输入卡圆角（虚线描边跟随，不再错开） |
| `--dshm-v2-nav` | `56px` | 悬浮五项导航高度 |
| `--dshm-engine-bar` | `56px` | 宿主「引擎已就绪」状态条让位高度（习惯先收起就设 `0px`） |

---

## 工作原理

![dsh-mobile-layout 工作原理](docs/assets/diagram-overview.svg)

## 界面截图

> v0.4.0 在 MuMu 模拟器（物理 720×1280，CSS 视口 400×684）的整机实拍，浅色主题。每个模式的全部页面见独立文档：[原生](docs/preset-default.md) ｜ [融合](docs/preset-classic.md) ｜ [悬浮](docs/preset-v2.md)。

<table>
  <tr>
    <th align="center"><a href="docs/preset-default.md">原生（官方原样）</a></th>
    <th align="center"><a href="docs/preset-classic.md">融合（通栏 v1）</a></th>
    <th align="center"><a href="docs/preset-v2.md">悬浮（v2）</a></th>
  </tr>
  <tr>
    <td align="center"><img src="docs/assets/screens/preset-default/home.png" width="200"><br><sub>主界面</sub></td>
    <td align="center"><img src="docs/assets/screens/preset-classic/home.png" width="200"><br><sub>主界面</sub></td>
    <td align="center"><img src="docs/assets/screens/preset-v2/home.png" width="200"><br><sub>主界面</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/assets/screens/preset-default/settings.png" width="200"><br><sub>设置悬浮窗（10vh 留白）</sub></td>
    <td align="center"><img src="docs/assets/screens/preset-classic/settings.png" width="200"><br><sub>设置全屏 · 布局模式</sub></td>
    <td align="center"><img src="docs/assets/screens/preset-v2/settings-general.png" width="200"><br><sub>设置全屏 · 布局模式</sub></td>
  </tr>
</table>

早期版本（v0.1.6，v1 单栏布局）的截图存档已移到独立文档：[docs/archive-v0.1.6.md](docs/archive-v0.1.6.md)。

---

## 安装

```sh
dsh plugin --profile web add @xiaopb/dsh-mobile-layout
```

## 开发 / 发布

本包无运行时 / 开发依赖，客户端是单文件产物（无需构建），`lib/client.js` 即发布物。

```sh
npm run check             # node --check → 单测 → 包清单 / bundle 契约 → 硬编码守卫
npm test                  # 仅单测（129 项）
npm run hardcode:check    # 仅硬编码守卫（新增违规即失败）
npm run hardcode:baseline # 消除违规后收紧 baseline
npm run pack:dry          # 查看将发布的文件
```

推 `v*` tag 即触发 Release（npm Trusted Publishing / `NPM_TOKEN` 兜底，发布后轮询确认公开）。真机验收需设备，按 `docs/technical-notes.md` 第 6 节手动完成。

## 许可证

MIT
