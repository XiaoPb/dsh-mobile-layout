# 更新日志

格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.4.0] - 2026-11-01

### 新增

- **三套布局预设体系稳定化**（原生 / 融合 / 悬浮）：设置页「布局模式」三选一（各带迷你线框缩略图，`currentColor` 适配深浅主题）；卡片一行三列、官方配色实时跟随（切主题自动重跑）。
- **插件自带配置页兼容**：dsh-pet 桌宠配置、dshmarket 插件市场实测通过；设置内容块按几何 + 内容量判定，不再强依赖表单控件。
- **原生设置悬浮窗**：`settingsFrameMetrics` 纯函数计算几何；左右等宽居中（`--dshm-settings-gutter` + `margin: 0 auto`）、上下各留约 10vh（`clamp(vpad-min 24px, 10vh, vpad-max 120px)` 双向钳制）；从其它预设切原生时设置页保持打开。
- **布局模式文案 i18n**：新增 `syncLayoutPickerTexts`，语言切换后标题 / 副标题 / aria-label 实时刷新（Native / Merged / Floating），无需重启。
- **布局几何硬编码守卫**：`scripts/check-hardcoded.mjs` 扫描注入 CSS 中「布局属性 + 纯 px」，`var()/clamp()/env()/%` 自适应表达式自动放行、`HARDCODE-OK:` 注释豁免；与 baseline 比对，**新增违规即 CI 失败**，存量 221 处渐进收紧。已接入 `npm run check` 与 CI。

### 修复

- 融合空态虚线输入卡左边贴屏、右侧多 7px（官方滚动容器 `scrollbar-gutter: stable` 经典滚动条沟槽 + 窄宽度）：滚动容器收敛改为手机布局全预设打标，空态卡恢复对称 gutter 与圆角。
- 悬浮空态输入卡虚线描边与卡片圆角不一致（虚线画在官方 `::after` 伪元素上）：伪元素 `border-radius` 跟随 `--dshm-v2-radius`。
- 预设切换临界态加固：宿主「禁用插件不 dispose / 启用不重新 apply」导致的多实例撕裂（卡片失效、底栏残留）——新增 `activeDispose` 单实例守卫；`setPreset` 显式 `syncSettingsPanel`；`clearSettingsPanel` 还原官方内联样式（含 `max-width`）。
- 设置页切页签闪烁；Agent 预设被官方贴边悬浮窗接管。
- 从其它模式切原生时设置页被 `history.back()` 直接关闭：仅在设置页 / 官方弹窗不存活时才消费历史条目。

### 文档

- README（中 / 英）同步至 0.4.0；新增三预设独立展示文档：[原生](docs/preset-default.md) / [融合](docs/preset-classic.md) / [悬浮](docs/preset-v2.md)（内嵌 HTML 表格排版，v0.4.0 整机实拍截图）。
- 架构文档补充预设体系、设置接管与质量边界；技术说明补充自适应变量表、真机取证经验与守卫脚本用法。

## [0.3.0] - 2026-10-31

### 新增

- 悬浮布局（v2）壳层：悬浮输入卡 + 五项导航（会话 / 自动化任务 / 插件 / 工作台 / 设置），DSH 官方图标与蓝色高亮。
- 三层解耦：宿主 host → 手机形态 phone → 外观预设 preset（default / classic / v2）；`data-dshm-form` / `data-dshm-preset` 根属性。
- 设置页「布局模式」三选一注入；三档改名为原生 / 融合 / 悬浮并挪到外观下面。
- 工作台走 `ctx.sidebarRight` 打开官方右侧面板，横滑退出；会话键「回首页」语义。
- 加号面板改自绘「一级菜单 + 二级列表」，附件拆图片 / 相机 / 文件。
- 引擎状态条让位变量 `--dshm-engine-bar`（默认 56px）。

### 变更

- 底栏透明、输入卡下沿贴导航上沿；覆盖式抽屉（会话抽屉固定 55%）。
