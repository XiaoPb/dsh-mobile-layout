# 融合布局（classic 预设 · v1）

> 输入区与底栏**连成一整条**的通栏设计。三套布局之一，切换入口：**设置 → 通用设置 → 布局模式**。
> 截图为 v0.4.0 在 MuMu 模拟器（物理 720×1280，CSS 视口 400×684）的整机实拍，浅色主题。

其他预设：[原生](preset-default.md) ｜ [悬浮](preset-v2.md) ｜ 回到 [README](../README.md)

---

## 界面总览

<table>
  <tr>
    <th align="center">主界面（空会话）</th>
    <th align="center">通用设置 · 布局模式</th>
  </tr>
  <tr>
    <td align="center"><img src="assets/screens/preset-classic/home.png" width="280"></td>
    <td align="center"><img src="assets/screens/preset-classic/settings.png" width="280"></td>
  </tr>
  <tr>
    <td valign="top">输入区去圆角 / 边框 / 阴影，与底栏<b>同表面连成一条</b>（仅 1px 分界）；底部六键操作条（新建 / 会话 / 文件 / 图片 / 插件 / 更多）。</td>
    <td valign="top">设置页全屏接管；「布局模式」中<b>融合</b>选中。权限与模型 chip 留在输入行。</td>
  </tr>
</table>

## 特性说明

- **通栏输入区**：`syncComposerPad` / `syncComposerFrame` 把输入区压平融合底部面板——全宽同表面、1px 分界；空态收紧。
- **chip 留在输入行**：权限短名（**「完全访问」恒标红**，中英文都认）与模型短名不收进菜单。
- **滚动容器收敛**：手机布局全预设隐藏经典滚动条并取消 `scrollbar-gutter` 沟槽，避免内容右侧出现不对称空隙。
- **空态虚线卡**（选择工作区空态）：左右留白对称（`--dshm-classic-gutter`，默认 `clamp(12px, 3.4vw, 20px)`），圆角 `--dshm-classic-radius`（默认 16px）。
- **左侧栏 → 抽屉**：左 60% 区域右滑打开、跟手拖拽 + 松手吸附；详情见 [README 核心功能](../README.md#核心功能)。
- **设置页全屏**：品牌行 + 可横滑页签 + 返回键；仅最左页签右滑跟手退出。

## 与悬浮预设的差异

| | 融合（本页） | 悬浮 |
|---|---|---|
| 输入区 | 通栏、与底栏连成一条 | 浮起卡片、圆角阴影 |
| 底部导航 | 六键操作条（动作入口） | 五项导航（页面换页器） |
| 加号面板 | 官方 ⊕ 面板打标 + 分页宫格 | 自绘一 / 二级菜单 |
| 设置页 | 全屏接管 | 全屏接管（切原生变悬浮窗） |
