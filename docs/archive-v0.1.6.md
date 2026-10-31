# 早期版本存档（v0.1.6 · v1 单栏布局）

> 本页是 **v0.1.6 时期**的整机截图存档，用于对照早期形态与设计演进。
> 当前版本（0.4.0）的三预设界面见：[原生](preset-default.md) ｜ [融合](preset-classic.md) ｜ [悬浮](preset-v2.md)，入口见 [README](../README.md)。
>
> 拍摄环境：MuMu 模拟器（物理 720×1280，CSS 视口 400×711）。当时的布局是**单一体（v1）**：左侧栏改抽屉 + 底部常驻操作条 + 输入区融合，还没有「布局模式」三档。

---

## 会话与输入区

<table>
  <tr>
    <th align="center">空会话（hero 居中）</th>
    <th align="center">会话中（分界线回到输入座）</th>
  </tr>
  <tr>
    <td align="center"><img src="assets/screens/empty-session.png" width="270"></td>
    <td align="center"><img src="assets/screens/conversation.png" width="270"></td>
  </tr>
  <tr>
    <td valign="top">空态 hero 居中，输入区收紧；权限与模型 chip 留输入行。</td>
    <td valign="top">有内容时 1px 分界线回到输入座上沿，输入区与底栏同表面。</td>
  </tr>
</table>

## 抽屉与加号面板

<table>
  <tr>
    <th align="center">左侧栏 → 抽屉</th>
    <th align="center">加号面板（第一页）</th>
    <th align="center">加号面板（第二页）</th>
  </tr>
  <tr>
    <td align="center"><img src="assets/screens/drawer.png" width="200"></td>
    <td align="center"><img src="assets/screens/sheet-add.png" width="200"></td>
    <td align="center"><img src="assets/screens/sheet-add-page2.png" width="200"></td>
  </tr>
  <tr>
    <td valign="top">左缘右滑打开（QQ 式中间偏左起手），遮罩 / 左滑关闭。</td>
    <td valign="top">4 列 × 2 行宫格，图标按功能类型配色。</td>
    <td valign="top">超过 8 项横向分页，页签指示当前页。</td>
  </tr>
</table>

## 设置页

<table>
  <tr>
    <th align="center">设置页 · 账号</th>
    <th align="center">设置页 · 通用</th>
  </tr>
  <tr>
    <td align="center"><img src="assets/screens/settings-account.png" width="270"></td>
    <td align="center"><img src="assets/screens/settings-general.png" width="270"></td>
  </tr>
  <tr>
    <td valign="top">全屏接管：品牌行 + 可横滑页签 + 返回键。</td>
    <td valign="top">当时还没有「布局模式」三档（0.3.0 才加入）。</td>
  </tr>
</table>

## 会话表与选择器

<table>
  <tr>
    <th align="center">会话表（按工作区分组）</th>
    <th align="center">权限选择（完全权限标红）</th>
  </tr>
  <tr>
    <td align="center"><img src="assets/screens/sessions-sheet.png" width="270"></td>
    <td align="center"><img src="assets/screens/popover-permission.png" width="270"></td>
  </tr>
  <tr>
    <td valign="top">吸顶标题 + 相对时间，最多占屏高 64%，把手下拉即关。</td>
    <td valign="top">模型 / 权限改贴底列表，选中态主题蓝，「完全访问」恒标红。</td>
  </tr>
</table>

## 全局面板与菜单

<table>
  <tr>
    <th align="center">全局面板 · 自动化</th>
    <th align="center">全局面板 · 插件</th>
    <th align="center">全局面板 · SSH</th>
  </tr>
  <tr>
    <td align="center"><img src="assets/screens/panel-automation.png" width="200"></td>
    <td align="center"><img src="assets/screens/panel-plugins.png" width="200"></td>
    <td align="center"><img src="assets/screens/panel-ssh.png" width="200"></td>
  </tr>
  <tr>
    <td valign="top">官方全局面板激活时整屏让出，只保留遮罩与手势。</td>
    <td valign="top">插件面板同样是官方页面，插件不叠自己的浮层。</td>
    <td valign="top">第三方插件页在手势常驻下仍可左滑开抽屉。</td>
  </tr>
</table>

<table>
  <tr>
    <th align="center">工作区菜单（向上弹）</th>
    <th align="center">模式菜单（向上弹）</th>
  </tr>
  <tr>
    <td align="center"><img src="assets/screens/menu-workspace-up.png" width="270"></td>
    <td align="center"><img src="assets/screens/menu-mode-up.png" width="270"></td>
  </tr>
  <tr>
    <td valign="top">贴底列表形态，不再使用桌面下拉。</td>
    <td valign="top">与工作区菜单同理，避免被输入区遮挡。</td>
  </tr>
</table>

---

**演进要点**：0.3.0 起拆出**原生 / 融合 / 悬浮**三档（本页截图属于「融合」的前身形态）；0.4.0 补齐了设置悬浮窗几何、融合空态虚线卡留白、布局模式 i18n 与硬编码守卫，详见 [CHANGELOG](../CHANGELOG.md)。
