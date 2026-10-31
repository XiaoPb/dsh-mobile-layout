# 原生布局（default 预设）

> DSH 官方原样。插件只做一件事：把官方设置弹窗钉成**居中悬浮窗**。三套布局之一，切换入口：**设置 → 通用设置 → 布局模式**。
> 截图为 v0.4.0 在 MuMu 模拟器（物理 720×1280，CSS 视口 400×684）的整机实拍，浅色主题。

其他预设：[融合](preset-classic.md) ｜ [悬浮](preset-v2.md) ｜ 回到 [README](../README.md)

---

## 界面总览

<table>
  <tr>
    <th align="center">主界面（官方布局）</th>
    <th align="center">设置悬浮窗（10vh 纵向留白）</th>
  </tr>
  <tr>
    <td align="center"><img src="assets/screens/preset-default/home.png" width="280"></td>
    <td align="center"><img src="assets/screens/preset-default/settings.png" width="280"></td>
  </tr>
  <tr>
    <td valign="top">手机竖屏下<b>交还官方布局</b>：官方侧栏、官方居中 hero、官方输入卡，插件零干预。</td>
    <td valign="top">官方设置弹窗被钉成<b>居中悬浮窗</b>：左右等宽不掉边、上下各留约 10% 视口高；右上「打开配置文件」+ ✕。</td>
  </tr>
</table>

## 设置悬浮窗几何（多机型自适应）

几何量全部走 CSS 变量（定义在 `html[data-dshm-form="phone"]` 作用域），不写死 px：

| 变量 | 默认值 | 作用 |
|---|---|---|
| `--dshm-settings-gutter` | `clamp(12px, 3.4vw, 20px)` | 左右留白（左右逐字符相同 + `margin: 0 auto`，居中不掉边） |
| `--dshm-settings-vpad` | `clamp(min 24px, 10vh, max 120px)` | 上下各留约 10% 视口高；矮屏保底 24px、高屏封顶 120px |
| `--dshm-settings-maxw` | `480px` | 面板最大宽度（同时受 `100vw - 2×gutter - 2×safe-x` 钳制） |
| `--dshm-settings-safe-x` | `max(env(safe-area-inset-left), env(safe-area-inset-right))` | 挖孔屏 / 手势条安全区叠加 |

## 行为说明

- **纯官方布局**：原生预设不进入手机布局的任何改造（`mode=default`，样式全部收在 `data-dshm-mode="mobile"` 之外不生效）。
- **设置页悬浮窗**：`settingsFrameMetrics` 纯函数计算四边 + `max-width`，经内联 `!important` 钉住任意官方变体；页签行、工具行与标题对齐。
- **切换保持打开**：从融合 / 悬浮切到原生时设置页**保持打开**并原地变悬浮窗形态；从原生切回则恢复全屏接管。
- **✕ / 系统返回**：关闭后正确消费历史栈条目，桌面返回不空转、不误关官方弹窗。
