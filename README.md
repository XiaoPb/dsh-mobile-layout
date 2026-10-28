# dsh-mobile-layout

**DSH 手机竖屏自适应布局插件（规划中）**

DSH 的 Web 客户端目前没有移动端布局：窄屏时左侧栏只是被压缩成 56px 轨道，右侧栏在 768px 以下才自动全屏，整份前端 CSS 没有任何宽度媒体查询。本插件计划在不修改官方内核、不替换官方布局插件的前提下，把**手机竖屏**切换成适合触控的形态：

- 左侧栏改为抽屉（汉堡入口 / 左缘滑动打开 / 遮罩或左滑关闭），不再占用内容宽度；
- 紧凑顶栏与 44px 触控目标，右栏保持官方全屏行为并补安全区；
- 按视口宽度、高度比例与方向自动判定「手机竖屏」，其他形态（横屏、平板、桌面）**保持官方默认布局**，像素级不变；
- 全量样式受 `data-dshm-mode="mobile"` 作用域保护，锚点失败或插件卸载即回退默认布局。

## 状态

方案调研完成，实施计划见 [docs/mobile-layout-plan.md](docs/mobile-layout-plan.md)。

## 计划中的包名

```sh
dsh plugin --profile web add @xiaopb/dsh-mobile-layout
```

## 命名

选 `dsh-mobile-layout`：与已有的 `dsh-mobile-compose`（手机端输入体验）形成同一命名族，职责边界清晰——`compose` 管输入，`layout` 管外壳。

## 许可证

MIT
