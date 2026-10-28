/**
 * dsh-mobile-layout 浏览器端（client half）。
 *
 * 产物形状与 dsh-mobile-compose 一致：__ModuleLoader__ closure factory，
 * 外部依赖经注入的 require 从平台模块表解析（react 不在 bundle 内）。
 *
 * 职责：
 *   1. 按布局视口判定「手机竖屏」；进入 600/1.25、保持 640/1.15 做滞回，
 *      旋屏 / 分屏拖拽时 120ms 去抖，避免来回切换。
 *   2. 模式写入 documentElement.dataset.dshmMode；全部移动样式只在
 *      html[data-dshm-mode="mobile"] 下生效，退出即恢复官方默认布局。
 *   3. 给官方 AppFrame 打 data-dshm-* 锚点，后续阶段只用自有属性写 CSS，
 *      不依赖官方 CSS Modules 哈希类名。锚点缺失时回退默认布局并 warn 一次。
 *   4. 左侧栏在手机竖屏下改为抽屉：会话头左侧注册 ☰，shell.overlay 承担
 *      遮罩、左缘手势与全局面板兜底入口；开合统一走 ctx.layout.toggleSidebar()，
 *      状态以 frame 的 data-sidebar-collapsed 为唯一事实来源。
 *
 * 失败策略：与 hardssh / mobile-compose 客户端一致 —— 任何 DOM 失败只
 * console.warn，绝不上抛（web shell 会在插件 apply 抛错时令整个启动失败）。
 */
window.__ModuleLoader__.load({
  id: '@xiaopb/dsh-mobile-layout',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const react = require('react');

    const VERSION = '0.3.0';
    const MODE_MOBILE = 'mobile';
    const MODE_DEFAULT = 'default';

    /** 进入手机布局的阈值。 */
    const ENTER = { shortSide: 600, ratio: 1.25 };
    /** 保持手机布局的阈值（滞回，避免 600~640 区间抖动）。 */
    const STAY = { shortSide: 640, ratio: 1.15 };
    const DEBOUNCE_MS = 120;

    /**
     * 纯判定：布局视口 → 模式。
     * @param {number} width 布局视口宽（CSS px）
     * @param {number} height 布局视口高（CSS px）
     * @param {'mobile'|'default'} prev 上一模式，用于滞回
     * @returns {'mobile'|'default'}
     */
    function classify(width, height, prev) {
      const w = Number(width);
      const h = Number(height);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return MODE_DEFAULT;
      const shortSide = Math.min(w, h);
      const longSide = Math.max(w, h);
      const portrait = h > w;
      const ratio = longSide / shortSide;
      const threshold = prev === MODE_MOBILE ? STAY : ENTER;
      return portrait && shortSide <= threshold.shortSide && ratio >= threshold.ratio ? MODE_MOBILE : MODE_DEFAULT;
    }

    /** 读取布局视口尺寸；visualViewport 存在时优先。 */
    function measure(win) {
      const doc = win.document;
      const vv = win.visualViewport;
      const innerW = Number(win.innerWidth) || 0;
      const innerH = Number(win.innerHeight) || 0;
      const clientW = doc && doc.documentElement ? Number(doc.documentElement.clientWidth) || 0 : 0;
      const clientH = doc && doc.documentElement ? Number(doc.documentElement.clientHeight) || 0 : 0;
      return {
        width: Math.round((vv && Number(vv.width)) || innerW || clientW || 0),
        height: Math.round((vv && Number(vv.height)) || innerH || clientH || 0),
      };
    }

    // ---- 文案（跟随 DSH 语言，缺省英文） ----
    const STRINGS = {
      zh: {
        menu: '打开侧栏',
        close: '关闭',
        newSession: '新建',
        sessions: '会话',
        files: '文件',
        images: '图片',
        plugins: '插件',
        more: '更多',
        noSessions: '还没有会话',
        current: '当前',
        managePlugins: '管理插件',
        pluginsHint: '插件的安装、启停与配置在官方插件面板完成。',
      },
      en: {
        menu: 'Open sidebar',
        close: 'Close',
        newSession: 'New',
        sessions: 'Sessions',
        files: 'Files',
        images: 'Images',
        plugins: 'Plugins',
        more: 'More',
        noSessions: 'No sessions yet',
        current: 'Current',
        managePlugins: 'Manage plugins',
        pluginsHint: 'Install, toggle, and configure plugins in the official panel.',
      },
    };

    const runtime = { ctx: null, layout: null, sessions: null, workspace: null, lang: 'en' };

    function t(key) {
      const table = STRINGS[runtime.lang] || STRINGS.en;
      return table[key] || STRINGS.en[key] || key;
    }

    function detectLang(locale) {
      try {
        const snap = (locale && typeof locale.getSnapshot === 'function' && locale.getSnapshot()) || null;
        const active = snap && (snap.active || snap.locale);
        if (typeof active === 'string' && active) return /^zh/i.test(active) ? 'zh' : 'en';
      } catch (error) {
        console.error('[dsh-mobile-layout] 读取 locale 失败：', error);
      }
      const htmlLang = document.documentElement.getAttribute('lang');
      if (htmlLang) return /^zh/i.test(htmlLang) ? 'zh' : 'en';
      return /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
    }

    /** 插件级最小状态：模式、锚点、抽屉与右栏呈现，UI 组件自行订阅。 */
    const subscribers = new Set();
    let state = {
      mode: MODE_DEFAULT,
      anchored: false,
      drawerOpen: false,
      headerLeading: false,
      rightbarFullscreen: false,
      panelActive: false,
      servicesReady: false,
      sheet: null,
    };

    function getState() {
      return state;
    }

    function setState(patch) {
      let changed = false;
      for (const key of Object.keys(patch)) {
        if (state[key] !== patch[key]) changed = true;
      }
      if (!changed) return;
      state = Object.assign({}, state, patch);
      subscribers.forEach((listener) => {
        try {
          listener(state);
        } catch (error) {
          console.error('[dsh-mobile-layout] 状态订阅者异常：', error);
        }
      });
    }

    function subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    }

    /** 组件钩子：订阅插件状态。 */
    function useLayoutState() {
      return react.useSyncExternalStore(subscribe, getState, getState);
    }

    // ---- DOM 锚点 ----
    const ATTR_FRAME = 'data-dshm-frame';
    const ATTR_SIDEBAR = 'data-dshm-sidebar';
    const ATTR_CENTER = 'data-dshm-center';
    const ATTR_RIGHTBAR = 'data-dshm-rightbar';
    const ATTR_BOTTOM = 'data-dshm-bottom';
    const ATTR_ADD_MENU = 'data-dshm-addmenu';

    /**
     * 标记官方 AppFrame 结构。
     *
     * 官方结构（0.2.1-rc.x）：frame = grid，子节点依次为 sidebarCol、
     * centerCol、rightbarCol（带 data-rightbar-col）、bottomRow
     * （data-shell-bottom）、overlayLayer（data-shell-overlay），其后可能还有
     * leadingSeat 与拖拽手柄。这里只用稳定属性 + 相邻关系定位。
     */
    function applyAnchors(doc) {
      const bottomRow = doc.querySelector('[data-shell-bottom]');
      const rightbar = doc.querySelector('[data-rightbar-col]');
      if (!bottomRow || !rightbar) return null;
      const frameEl = bottomRow.parentElement;
      if (!frameEl) return null;
      const sidebar = frameEl.firstElementChild;
      const center = rightbar.previousElementSibling;
      if (!sidebar || !center) return null;
      frameEl.setAttribute(ATTR_FRAME, '');
      sidebar.setAttribute(ATTR_SIDEBAR, '');
      center.setAttribute(ATTR_CENTER, '');
      rightbar.setAttribute(ATTR_RIGHTBAR, '');
      bottomRow.setAttribute(ATTR_BOTTOM, '');
      return frameEl;
    }

    function clearAnchors(doc) {
      [ATTR_FRAME, ATTR_SIDEBAR, ATTR_CENTER, ATTR_RIGHTBAR, ATTR_BOTTOM, ATTR_ADD_MENU].forEach((attr) => {
        doc.querySelectorAll('[' + attr + ']').forEach((node) => node.removeAttribute(attr));
      });
    }

    /** 拿当前锚定后的 frame 元素；未锚定时返回 null。 */
    function frameElement() {
      const doc = document;
      const frame = doc.querySelector('[' + ATTR_FRAME + ']');
      return frame && frame.isConnected ? frame : null;
    }

    function isDrawerOpen() {
      const frame = frameElement();
      return Boolean(frame && !frame.hasAttribute('data-sidebar-collapsed'));
    }

    /** 中心列容器；官方 composer 与主内容都在其中。 */
    function centerElement() {
      const el = document.querySelector('[data-dshm-center]');
      return el && el.isConnected ? el : null;
    }

    /** 新建 / 切换会话后把焦点还给输入框（不强制拉起键盘）。 */
    function focusComposer() {
      const root = centerElement();
      if (!root) return;
      const target = root.querySelector('textarea, [contenteditable="true"]');
      if (target && typeof target.focus === 'function') target.focus();
    }

    /**
     * 浮层返回栈：抽屉或底部表打开时压入一条 history，Android 返回键 /
     * 浏览器后退先关闭浮层，而不是离开页面。
     */
    let overlayHistory = false;
    let suppressHistory = false;

    function overlayVisible() {
      return state.sheet !== null || isDrawerOpen();
    }

    /** 按浮层可见性同步 history 条目；关闭时回退并复位标记。 */
    function syncOverlayHistory() {
      if (suppressHistory) return;
      const visible = overlayVisible();
      if (visible && !overlayHistory) {
        overlayHistory = true;
        try {
          window.history.pushState({ dshmOverlay: true }, '');
        } catch (error) {
          console.warn('[dsh-mobile-layout] history.pushState 失败：', error);
        }
      } else if (!visible && overlayHistory) {
        overlayHistory = false;
        try {
          window.history.back();
        } catch (error) {
          console.warn('[dsh-mobile-layout] history.back 失败：', error);
        }
      }
    }

    /** 关闭当前底部表。 */
    function closeSheet() {
      if (state.sheet !== null) setState({ sheet: null });
      syncOverlayHistory();
    }

    /** 打开底部表；与抽屉、键盘互斥。 */
    function openSheet(name) {
      if (isDrawerOpen()) requestDrawer(false);
      const root = centerElement();
      const active = root && root.querySelector('textarea, [contenteditable="true"]');
      if (active && typeof active.blur === 'function') active.blur();
      setState({ sheet: name });
      syncOverlayHistory();
    }

    /** 新建会话：沿用官方 uiWorkspace.startSession，失败不动原会话。 */
    function startNewSession() {
      closeSheet();
      if (isDrawerOpen()) requestDrawer(false);
      const workspace = runtime.workspace;
      if (!workspace || typeof workspace.startSession !== 'function') {
        console.warn('[dsh-mobile-layout] uiWorkspace.startSession 不可用，忽略新建');
        return;
      }
      try {
        workspace.startSession();
      } catch (error) {
        console.error('[dsh-mobile-layout] 新建会话失败：', error);
        return;
      }
      requestAnimationFrame(() => window.setTimeout(focusComposer, 200));
    }

    /** 切到某个会话。 */
    function openSessionById(sessionId) {
      closeSheet();
      const workspace = runtime.workspace;
      if (!workspace || typeof workspace.openSession !== 'function') return;
      try {
        workspace.openSession(sessionId);
      } catch (error) {
        console.error('[dsh-mobile-layout] 打开会话失败：', sessionId, error);
      }
    }

    /** 打开官方插件全局面板。 */
    function openPluginPanel() {
      closeSheet();
      const layout = runtime.layout;
      if (!layout || typeof layout.selectPanel !== 'function') return;
      try {
        layout.selectPanel('plugins');
      } catch (error) {
        console.error('[dsh-mobile-layout] 打开插件面板失败：', error);
      }
    }

    /**
     * 把文件回流到官方隐藏 input[type=file]，由官方 onPickFiles → addFiles
     * 完成校验、上传与附件预览（本插件不造上传链路）。
     */
    function injectOfficialFiles(files) {
      if (!files || files.length === 0) return;
      const candidates = Array.from(document.querySelectorAll('input[type="file"]')).filter(
        (el) => !el.hasAttribute('data-dshm-input'),
      );
      const target = candidates.find((el) => el.multiple) || candidates[0];
      if (!target) {
        console.warn('[dsh-mobile-layout] 未找到官方文件输入，忽略本次选择');
        return;
      }
      try {
        const transfer = new DataTransfer();
        for (const file of files) transfer.items.add(file);
        target.files = transfer.files;
        target.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (error) {
        console.error('[dsh-mobile-layout] 回流文件到官方输入失败：', error);
      }
    }

    /** 点击官方 composer 的「添加文件或调用指令」按钮，打开官方加号菜单。 */
    function openOfficialAddMenu() {
      closeSheet();
      const root = centerElement();
      if (!root) return false;
      const buttons = root.querySelectorAll('button[aria-label], button[title]');
      for (const button of buttons) {
        const label = (button.getAttribute('aria-label') || button.getAttribute('title') || '').toLowerCase();
        if (/添加文件|调用指令|add file|add command|attach/.test(label)) {
          button.click();
          window.setTimeout(tagAddMenu, 0);
          window.setTimeout(tagAddMenu, 120);
          return true;
        }
      }
      return false;
    }

    /**
     * 给官方加号菜单打移动端标记。
     *
     * 菜单是 composer overlayAnchor 内的浮层（position:absolute + z-index>=100），
     * 这里按 role=listbox 的选项文案识别，再向上找到定位根节点打属性；
     * 样式只在 html[data-dshm-mode="mobile"] 下把根节点固定到底部条上方。
     */
    function tagAddMenu() {
      if (state.mode !== MODE_MOBILE) return;
      const listboxes = document.querySelectorAll('[role="listbox"]');
      for (const box of listboxes) {
        if (!/添加文件|调用指令|add file|add command|attach/i.test(box.textContent || '')) continue;
        let node = box;
        while (node && node !== document.body) {
          const style = window.getComputedStyle(node);
          if ((style.position === 'absolute' || style.position === 'fixed') && Number(style.zIndex) >= 100) {
            if (!node.hasAttribute(ATTR_ADD_MENU)) node.setAttribute(ATTR_ADD_MENU, '');
            break;
          }
          node = node.parentElement;
        }
      }
    }

    // ---- 会话列表 ----
    const EMPTY_LIST = { byId: {}, items: [] };

    function sessionRows(snapshot) {
      const source = snapshot && snapshot.byId ? Object.values(snapshot.byId) : (snapshot && snapshot.items) || [];
      const current = source.find((row) => row && row.retainedBy && (row.retainedBy.mainView || 0) > 0);
      const currentId = current ? current.id || current.sessionId : null;
      const rows = source
        .filter((row) => row && (!row.blank || (row.id || row.sessionId) === currentId))
        .slice()
        .sort((a, b) => {
          const aCurrent = (a.id || a.sessionId) === currentId ? 1 : 0;
          const bCurrent = (b.id || b.sessionId) === currentId ? 1 : 0;
          if (aCurrent !== bCurrent) return bCurrent - aCurrent;
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        })
        .slice(0, 40);
      return { rows, currentId };
    }

    function useSessionRows(enabled) {
      const list = runtime.sessions && runtime.sessions.list;
      const subscribeList = react.useCallback(
        (listener) => {
          if (!list || typeof list.subscribe !== 'function') return () => {};
          return list.subscribe(listener);
        },
        [list, enabled],
      );
      const getSnapshot = react.useCallback(
        () => (enabled && list && typeof list.getSnapshot === 'function' ? list.getSnapshot() : EMPTY_LIST),
        [list, enabled],
      );
      return sessionRows(react.useSyncExternalStore(subscribeList, getSnapshot, getSnapshot));
    }

    /**
     * 通过官方布局服务开合侧栏。目标是幂等的：已经处于目标状态就不调用，
     * 避免官方 toggle 在窄屏下翻转 narrowExpanded 造成反效果。
     */
    function requestDrawer(open) {
      if (open) closeSheet();
      if (isDrawerOpen() === open) return;
      const layout = runtime.layout;
      if (!layout || typeof layout.toggleSidebar !== 'function') return;
      try {
        layout.toggleSidebar();
      } catch (error) {
        console.error('[dsh-mobile-layout] 切换侧栏失败：', error);
      }
    }

    // ---- 样式 ----
    const STYLE_ID = 'dshm-style';

    const CSS_TEXT = [
      'html[data-dshm-mode="mobile"] {',
      '  --dshm-header-height: 44px;',
      '  --dshm-bar-height: 56px;',
      '  --dshm-drawer-width: min(86vw, 320px);',
      '  --dshm-safe-top: env(safe-area-inset-top, 0px);',
      '  --dshm-safe-bottom: env(safe-area-inset-bottom, 0px);',
      '}',
      /* 手机竖屏：侧栏列不占内容宽度，主列全宽；右栏全屏时交还官方网格。 */
      'html[data-dshm-mode="mobile"] [data-dshm-frame]:not([data-rightbar-fullscreen]) {',
      '  grid-template-columns: 0 minmax(0, 1fr) 0 !important;',
      '}',
      'html[data-dshm-mode="mobile"] [data-dshm-center] {',
      '  border-left: none !important;',
      '  min-width: 0;',
      '  grid-column: 2 !important;',
      '  grid-row: 1 !important;',
      '}',
      'html[data-dshm-mode="mobile"] [data-dshm-rightbar] {',
      '  grid-column: 3 !important;',
      '  grid-row: 1 !important;',
      '  min-width: 0;',
      '}',
      /* 官方侧栏列变成离屏抽屉；只有展开态（frame 无 data-sidebar-collapsed）才滑入。 */
      'html[data-dshm-mode="mobile"] [data-dshm-sidebar] {',
      '  position: absolute;',
      '  inset: 0 auto 0 0;',
      '  z-index: 30;',
      '  width: var(--dshm-drawer-width);',
      '  max-width: 86vw;',
      '  height: 100%;',
      '  overflow: hidden;',
      '  border-radius: 0 16px 16px 0;',
      '  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.32);',
      '  transform: translateX(-104%);',
      '  transition: transform 220ms var(--ds-ease-in-out, ease);',
      '  will-change: transform;',
      '}',
      'html[data-dshm-mode="mobile"] [data-dshm-frame]:not([data-sidebar-collapsed]) [data-dshm-sidebar] {',
      '  transform: translateX(0);',
      '}',
      'html[data-dshm-mode="mobile"] [data-dshm-sidebar] > * {',
      '  width: 100% !important;',
      '  max-width: none;',
      '}',
      /* 官方 Android narrow-sidebar 在抽屉展开时会隐藏中心列/右栏并把侧栏
         拉成整行；抽屉需要内容留在原位，这里把它的标记还原。 */
      'html[data-dshm-mode="mobile"] [data-android-narrow-yield-col] {',
      '  display: block !important;',
      '}',
      'html[data-dshm-mode="mobile"] [data-android-narrow-sidebar-col] {',
      '  grid-column: auto !important;',
      '}',
      /* 抽屉遮罩：位于内容之上、抽屉之下（overlayLayer z=20 < sidebar z=30）。 */
      'html[data-dshm-mode="mobile"] .dshm-mask {',
      '  position: absolute;',
      '  inset: 0;',
      '  z-index: 25;',
      '  background: rgba(0, 0, 0, 0.38);',
      '  border: 0;',
      '  padding: 0;',
      '  transition: opacity 160ms ease;',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-menu-btn {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  width: 40px;',
      '  height: 40px;',
      '  margin-right: 4px;',
      '  padding: 0;',
      '  border: 0;',
      '  border-radius: 10px;',
      '  background: transparent;',
      '  color: inherit;',
      '  flex: none;',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-menu-btn:active {',
      '  background: rgba(127, 127, 127, 0.16);',
      '}',
      /* 全局面板没有会话头时，遮罩层左上角提供浮动入口。 */
      'html[data-dshm-mode="mobile"] .dshm-float-menu {',
      '  position: absolute;',
      '  top: calc(8px + var(--dshm-safe-top));',
      '  left: 8px;',
      '  z-index: 26;',
      '  width: 40px;',
      '  height: 40px;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  padding: 0;',
      '  border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.28));',
      '  border-radius: 10px;',
      '  background: var(--dsw-alias-bg-base, #fff);',
      '  color: inherit;',
      '}',
      /* 底部常驻条由官方 shell.bottom 行承载（grid 第二行 auto），
         高度含安全区，避免手势条遮挡最后一个按键。 */
      'html[data-dshm-mode="mobile"] [data-dshm-bottom] {',
      '  padding: 0 env(safe-area-inset-right) var(--dshm-safe-bottom) env(safe-area-inset-left);',
      '  background: var(--dsw-alias-bg-base, #fff);',
      '  border-top: 0.5px solid var(--dsw-alias-border-l3, rgba(127, 127, 127, 0.25));',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-bottom-bar {',
      '  display: flex;',
      '  align-items: stretch;',
      '  width: 100%;',
      '  height: var(--dshm-bar-height);',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-bar-btn {',
      '  flex: 1 1 0;',
      '  min-width: 44px;',
      '  min-height: 44px;',
      '  display: inline-flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 2px;',
      '  padding: 0;',
      '  border: 0;',
      '  background: transparent;',
      '  color: var(--dsw-alias-label-secondary, inherit);',
      '  font-size: 11px;',
      '  line-height: 1;',
      '  -webkit-tap-highlight-color: transparent;',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-bar-btn:active {',
      '  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-bar-btn[aria-expanded="true"] {',
      '  color: var(--dsw-alias-label-primary, inherit);',
      '}',
      /* 底部表：止于常驻条上沿，遮罩避开常驻条，保证随时可切换面板。 */
      'html[data-dshm-mode="mobile"] .dshm-sheet-mask {',
      '  position: absolute;',
      '  inset: 0 0 calc(var(--dshm-bar-height) + var(--dshm-safe-bottom)) 0;',
      '  z-index: 24;',
      '  border: 0;',
      '  padding: 0;',
      '  background: rgba(0, 0, 0, 0.28);',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-sheet {',
      '  position: absolute;',
      '  left: 0;',
      '  right: 0;',
      '  bottom: calc(var(--dshm-bar-height) + var(--dshm-safe-bottom));',
      '  z-index: 27;',
      '  display: flex;',
      '  flex-direction: column;',
      '  max-height: 62vh;',
      '  padding-bottom: 8px;',
      '  border-radius: 16px 16px 0 0;',
      '  background: var(--dsw-alias-bg-base, #fff);',
      '  box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.18);',
      '  overflow: hidden;',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-sheet-head {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  gap: 8px;',
      '  padding: 12px 16px 8px;',
      '  font-size: 14px;',
      '  font-weight: 600;',
      '  color: var(--dsw-alias-label-primary, inherit);',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-sheet-close {',
      '  width: 32px;',
      '  height: 32px;',
      '  padding: 0;',
      '  border: 0;',
      '  border-radius: 8px;',
      '  background: transparent;',
      '  color: var(--dsw-alias-label-secondary, inherit);',
      '  font-size: 18px;',
      '  line-height: 1;',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-sheet-list {',
      '  padding: 0 8px;',
      '  overflow-y: auto;',
      '  -webkit-overflow-scrolling: touch;',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-sheet-row {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  gap: 8px;',
      '  width: 100%;',
      '  min-height: 44px;',
      '  padding: 8px 12px;',
      '  border: 0;',
      '  border-radius: 10px;',
      '  background: transparent;',
      '  color: var(--dsw-alias-label-primary, inherit);',
      '  font-size: 14px;',
      '  text-align: left;',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-sheet-row:active {',
      '  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-sheet-row.is-current {',
      '  color: var(--dsw-alias-label-primary-bluish, #4d6bfe);',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-sheet-row-title {',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '  white-space: nowrap;',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-sheet-badge {',
      '  flex: none;',
      '  padding: 2px 6px;',
      '  border: 0.5px solid currentColor;',
      '  border-radius: 999px;',
      '  font-size: 11px;',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-sheet-empty {',
      '  margin: 12px 16px 16px;',
      '  font-size: 13px;',
      '  color: var(--dsw-alias-label-secondary, inherit);',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-sheet-hint {',
      '  margin: 0 16px 12px;',
      '  font-size: 13px;',
      '  line-height: 1.5;',
      '  color: var(--dsw-alias-label-secondary, inherit);',
      '}',
      'html[data-dshm-mode="mobile"] .dshm-sheet-action {',
      '  min-height: 44px;',
      '  margin: 0 16px 4px;',
      '  border: 0;',
      '  border-radius: 10px;',
      '  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));',
      '  color: var(--dsw-alias-label-primary, inherit);',
      '  font-size: 14px;',
      '  font-weight: 500;',
      '}',
      /* 官方加号菜单底部化：改 fixed 贴底（保留官方行为与项），
         ::before 提供不拦点击的遮罩，点外部仍由官方浮层自行关闭。 */
      'html[data-dshm-mode="mobile"] [data-dshm-addmenu] {',
      '  position: fixed !important;',
      '  top: auto !important;',
      '  left: 0 !important;',
      '  right: 0 !important;',
      '  bottom: calc(var(--dshm-bar-height) + var(--dshm-safe-bottom)) !important;',
      '  width: auto !important;',
      '  min-width: 0 !important;',
      '  max-width: none !important;',
      '  max-height: 62vh !important;',
      '  margin: 0 !important;',
      '  transform: none !important;',
      '  border-radius: 16px 16px 0 0 !important;',
      '  box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.18) !important;',
      '  z-index: 27 !important;',
      '}',
      'html[data-dshm-mode="mobile"] [data-dshm-addmenu]::before {',
      '  content: "";',
      '  position: fixed;',
      '  inset: 0 0 calc(var(--dshm-bar-height) + var(--dshm-safe-bottom)) 0;',
      '  z-index: -1;',
      '  background: rgba(0, 0, 0, 0.28);',
      '  pointer-events: none;',
      '}',
      'html[data-dshm-mode="mobile"] [data-dshm-addmenu] [role="listbox"] {',
      '  max-height: 56vh;',
      '  overflow-y: auto;',
      '  -webkit-overflow-scrolling: touch;',
      '}',
      'html[data-dshm-mode="mobile"] [data-rightbar-fullscreen] .dshm-mask {',
      '  display: none;',
      '}',
      'html:not([data-dshm-mode="mobile"]) .dshm-mobile-only {',
      '  display: none !important;',
      '}',
    ].join('\n');

    function injectStyle(doc) {
      let tag = doc.getElementById(STYLE_ID);
      if (!tag) {
        tag = doc.createElement('style');
        tag.id = STYLE_ID;
        tag.setAttribute('data-plugin-css', 'dsh-mobile-layout');
        doc.head.appendChild(tag);
      }
      tag.textContent = CSS_TEXT;
      return tag;
    }

    // ---- React 组件 ----
    const h = react.createElement;

    /** ☰ 图标。 */
    function MenuIcon() {
      return h(
        'svg',
        { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', 'aria-hidden': 'true' },
        h('path', { d: 'M4 6.5h16' }),
        h('path', { d: 'M4 12h16' }),
        h('path', { d: 'M4 17.5h16' }),
      );
    }

    /** 会话头左侧的抽屉入口。占位由官方 header leading 槽位提供。 */
    function HamburgerButton() {
      const layoutState = useLayoutState();
      react.useEffect(() => {
        setState({ headerLeading: true });
        return () => setState({ headerLeading: false });
      }, []);
      if (layoutState.mode !== MODE_MOBILE) return null;
      return h(
        'button',
        {
          type: 'button',
          className: 'dshm-menu-btn',
          'aria-label': t('menu'),
          'aria-expanded': layoutState.drawerOpen ? 'true' : 'false',
          onClick: () => requestDrawer(!isDrawerOpen()),
        },
        h(MenuIcon),
      );
    }

    /** 20px 线性图标（底部条统一风格，不依赖官方图标组件）。 */
    function strokeIcon(...paths) {
      return h(
        'svg',
        {
          width: 20,
          height: 20,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        paths.map((d, index) => h('path', { key: index, d })),
      );
    }

    /** 图标工厂：延迟到渲染期调用，避免测试环境（无 createElement）在加载期失败。 */
    const ICONS = {
      newSession: () => strokeIcon('M12 5v14', 'M5 12h14'),
      sessions: () => strokeIcon('M20 11.5a7.5 7.5 0 0 1-10.9 6.6L5 19.5l1.4-3.6A7.5 7.5 0 1 1 20 11.5Z'),
      files: () => strokeIcon('M4 7.5A1.5 1.5 0 0 1 5.5 6h3.8l2 2h7.2A1.5 1.5 0 0 1 20 9.5v8A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z'),
      images: () => strokeIcon('M4 5.5h16v13H4Z', 'M4 15l4.6-4.6 3.4 3.4 2.4-2.4L20 17', 'M15.2 9.2h.01'),
      plugins: () => strokeIcon('M9 3v4', 'M15 3v4', 'M7 7h10v3.5a5 5 0 0 1-10 0Z', 'M12 15v6'),
      more: () => strokeIcon('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', 'M12 8v8', 'M8 12h8'),
    };

    /** 底部条按键：图标在上、11px 标签在下，触控区不小于 44px。 */
    function BarButton({ icon, label, expanded, onClick }) {
      return h(
        'button',
        {
          type: 'button',
          className: 'dshm-bar-btn',
          'aria-label': label,
          'aria-expanded': expanded === undefined ? undefined : expanded ? 'true' : 'false',
          onClick,
        },
        icon,
        h('span', null, label),
      );
    }

    /**
     * 底部常驻条（官方 shell.bottom 行）。
     *
     * 6 键：新建 / 会话 / 文件 / 图片 / 插件 / ⊕。文件与图片使用插件自建
     * input，选中后回流到官方隐藏输入，上传与校验仍由官方 composer 负责。
     * 官方全局面板或右栏全屏时不渲染，把整行交还官方。
     */
    function BottomBar() {
      const layoutState = useLayoutState();
      const fileRef = react.useRef(null);
      const imageRef = react.useRef(null);
      const mobile = layoutState.mode === MODE_MOBILE;
      const sheet = layoutState.sheet;
      const visible = mobile && !layoutState.panelActive && !layoutState.rightbarFullscreen;

      const pick = (ref) => {
        const input = ref.current;
        if (input) input.click();
      };

      const onPick = (event) => {
        const input = event.currentTarget;
        const files = input.files ? Array.from(input.files) : [];
        input.value = '';
        if (files.length === 0) return;
        closeSheet();
        injectOfficialFiles(files);
      };

      if (!visible) return null;

      return h(
        'div',
        { className: 'dshm-bottom-bar' },
        h(BarButton, { icon: ICONS.newSession(), label: t('newSession'), onClick: startNewSession }),
        h(BarButton, {
          icon: ICONS.sessions(),
          label: t('sessions'),
          expanded: sheet === 'sessions',
          onClick: () => (sheet === 'sessions' ? closeSheet() : openSheet('sessions')),
        }),
        h(BarButton, { icon: ICONS.files(), label: t('files'), onClick: () => pick(fileRef) }),
        h(BarButton, { icon: ICONS.images(), label: t('images'), onClick: () => pick(imageRef) }),
        h(BarButton, {
          icon: ICONS.plugins(),
          label: t('plugins'),
          expanded: sheet === 'plugins',
          onClick: () => (sheet === 'plugins' ? closeSheet() : openSheet('plugins')),
        }),
        h(BarButton, { icon: ICONS.more(), label: t('more'), onClick: openOfficialAddMenu }),
        h('input', {
          type: 'file',
          multiple: true,
          hidden: true,
          ref: fileRef,
          'data-dshm-input': '',
          onChange: onPick,
        }),
        h('input', {
          type: 'file',
          accept: 'image/*',
          multiple: true,
          hidden: true,
          ref: imageRef,
          'data-dshm-input': '',
          onChange: onPick,
        }),
      );
    }

    /**
     * 底部表：会话列表 / 插件快捷入口。
     *
     * 由 overlay 层渲染，位置止于底部条上沿；遮罩避开底部条，方便随时切换。
     * 会话行数据来自官方 sessions.list，当前会话按 retainedBy.mainView 标记。
     */
    function Sheet() {
      const layoutState = useLayoutState();
      const sheet = layoutState.mode === MODE_MOBILE ? layoutState.sheet : null;
      const sessionState = useSessionRows(sheet === 'sessions');

      if (!sheet) return null;

      const title = sheet === 'sessions' ? t('sessions') : t('plugins');
      const head = h(
        'div',
        { className: 'dshm-sheet-head' },
        h('span', null, title),
        h(
          'button',
          { type: 'button', className: 'dshm-sheet-close', 'aria-label': t('close'), onClick: closeSheet },
          '\u00d7',
        ),
      );

      let body = null;
      if (sheet === 'sessions') {
        body = sessionState.rows.length === 0
          ? h('p', { className: 'dshm-sheet-empty' }, t('noSessions'))
          : h(
              'div',
              { className: 'dshm-sheet-list' },
              sessionState.rows.map((row) => {
                const isCurrent = row.id === sessionState.currentId;
                return h(
                  'button',
                  {
                    type: 'button',
                    key: row.id,
                    className: 'dshm-sheet-row' + (isCurrent ? ' is-current' : ''),
                    onClick: () => openSessionById(row.id),
                  },
                  h('span', { className: 'dshm-sheet-row-title' }, row.displayTitle || row.title || row.id),
                  isCurrent ? h('span', { className: 'dshm-sheet-badge' }, t('current')) : null,
                );
              }),
            );
      } else {
        body = h(
          react.Fragment,
          null,
          h('p', { className: 'dshm-sheet-hint' }, t('pluginsHint')),
          h('button', { type: 'button', className: 'dshm-sheet-action', onClick: openPluginPanel }, t('managePlugins')),
        );
      }

      return h('div', { className: 'dshm-sheet', role: 'dialog', 'aria-label': title }, head, body);
    }

    /**
     * 遮罩 / 手势层 / 全局面板兜底入口。
     *
     * 注册在 shell.overlay（list，root）；该层 pointer-events: none，子元素
     * 自动恢复指针事件，所以关闭态不阻塞任何交互。
     */
    function OverlayLayer() {
      const layoutState = useLayoutState();
      const mobile = layoutState.mode === MODE_MOBILE;
      const open = mobile && layoutState.drawerOpen;

      react.useEffect(() => {
        if (!mobile) return undefined;
        const doc = document;
        let tracking = false;
        let startX = 0;
        let startY = 0;
        let startedAtEdge = false;

        const onTouchStart = (event) => {
          if (event.touches.length !== 1) return;
          const touch = event.touches[0];
          if (doc.querySelector('[data-rightbar-fullscreen]')) return;
          startX = touch.clientX;
          startY = touch.clientY;
          startedAtEdge = startX <= 24 && !isDrawerOpen();
          tracking = true;
        };
        const onTouchMove = (event) => {
          if (!tracking || event.touches.length !== 1) return;
          const touch = event.touches[0];
          const dx = touch.clientX - startX;
          const dy = touch.clientY - startY;
          if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
          tracking = false;
          if (dx > 0 && startedAtEdge) requestDrawer(true);
          else if (dx < 0 && isDrawerOpen()) requestDrawer(false);
        };
        const onTouchEnd = () => {
          tracking = false;
        };
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          if (getState().sheet !== null) {
            closeSheet();
            return;
          }
          if (isDrawerOpen()) requestDrawer(false);
        };

        doc.addEventListener('touchstart', onTouchStart, { passive: true });
        doc.addEventListener('touchmove', onTouchMove, { passive: true });
        doc.addEventListener('touchend', onTouchEnd, { passive: true });
        doc.addEventListener('touchcancel', onTouchEnd, { passive: true });
        doc.addEventListener('keydown', onKeyDown);
        return () => {
          doc.removeEventListener('touchstart', onTouchStart);
          doc.removeEventListener('touchmove', onTouchMove);
          doc.removeEventListener('touchend', onTouchEnd);
          doc.removeEventListener('touchcancel', onTouchEnd);
          doc.removeEventListener('keydown', onKeyDown);
        };
      }, [mobile]);

      if (!mobile) return null;

      const sheet = layoutState.sheet;

      return h(
        react.Fragment,
        null,
        open
          ? h('button', {
              type: 'button',
              className: 'dshm-mask',
              'aria-label': t('close'),
              tabIndex: -1,
              onClick: () => requestDrawer(false),
            })
          : null,
        !layoutState.headerLeading
          ? h(
              'button',
              {
                type: 'button',
                className: 'dshm-float-menu',
                'aria-label': t('menu'),
                'aria-expanded': open ? 'true' : 'false',
                onClick: () => requestDrawer(!isDrawerOpen()),
              },
              h(MenuIcon),
            )
          : null,
        sheet
          ? h('button', {
              type: 'button',
              className: 'dshm-sheet-mask',
              'aria-label': t('close'),
              tabIndex: -1,
              onClick: closeSheet,
            })
          : null,
        sheet ? h(Sheet) : null,
      );
    }

    // ---- 生命周期 ----
    function apply(ctx) {
      runtime.ctx = ctx;
      const win = window;
      const doc = win.document;
      let disposed = false;
      let debounceTimer = 0;
      let warnCount = 0;
      let observer = null;
      let attrObserver = null;
      let anchorRaf = 0;
      let frameEl = null;
      let styleEl = null;
      let anchorTimer = 0;
      let mobileBase = null;
      const teardowns = [];

      const logWarn = (message, error) => {
        if (warnCount >= 5) return;
        warnCount += 1;
        if (error) console.warn('[dsh-mobile-layout]', message, error);
        else console.warn('[dsh-mobile-layout]', message);
      };

      styleEl = injectStyle(doc);

      const syncFrameFlags = () => {
        if (!frameEl || !frameEl.isConnected) return;
        setState({
          drawerOpen: !frameEl.hasAttribute('data-sidebar-collapsed'),
          rightbarFullscreen: frameEl.hasAttribute('data-rightbar-fullscreen'),
        });
        syncOverlayHistory();
      };

      const bindFrame = (next) => {
        if (frameEl === next) {
          syncFrameFlags();
          return;
        }
        if (attrObserver) attrObserver.disconnect();
        frameEl = next;
        if (frameEl) {
          attrObserver = new win.MutationObserver(syncFrameFlags);
          attrObserver.observe(frameEl, {
            attributes: true,
            attributeFilter: ['data-sidebar-collapsed', 'data-rightbar-fullscreen'],
          });
        }
        syncFrameFlags();
      };

      const resolveAnchors = () => {
        if (disposed) return true;
        if (frameEl && frameEl.isConnected) {
          syncFrameFlags();
          return true;
        }
        const next = applyAnchors(doc);
        if (!next) {
          setState({ anchored: false });
          if (state.mode === MODE_MOBILE) setMode(MODE_DEFAULT);
          bindFrame(null);
          return false;
        }
        bindFrame(next);
        setState({ anchored: true });
        return true;
      };

      const setMode = (next) => {
        if (next === state.mode) return;
        const prev = state.mode;
        doc.documentElement.setAttribute('data-dshm-mode', next);
        setState({ mode: next });
        // 进入手机竖屏先收起抽屉；离开手机竖屏时若抽屉是由插件打开的也收起，
        // 避免把移动态的开合状态泄漏到官方默认布局。
        if (next === MODE_MOBILE && isDrawerOpen()) requestDrawer(false);
        if (prev === MODE_MOBILE && next === MODE_DEFAULT && isDrawerOpen()) requestDrawer(false);
        if (next === MODE_DEFAULT) closeSheet();
        try {
          win.dispatchEvent(new win.CustomEvent('dshm:mode', { detail: { mode: next, version: VERSION } }));
        } catch (error) {
          console.error('[dsh-mobile-layout] 派发模式事件失败：', error);
        }
      };

      const evaluateNow = () => {
        if (disposed) return;
        if (!state.anchored && !resolveAnchors()) return;
        const size = measure(win);
        // 软键盘（visualViewport 收缩）不应把手机竖屏判定成非手机：手机态下
        // 宽度不变、高度明显变小时视为键盘/浮层，保持模式并保留进入时的基线。
        if (state.mode === MODE_MOBILE) {
          if (!mobileBase) mobileBase = size;
          const sameWidth = Math.abs(size.width - mobileBase.width) <= 2;
          if (sameWidth && size.height < mobileBase.height - 40) return;
          mobileBase = size;
        } else {
          mobileBase = null;
        }
        const next = classify(size.width, size.height, state.mode);
        setMode(next);
      };

      const schedule = (delay) => {
        if (disposed) return;
        if (debounceTimer) win.clearTimeout(debounceTimer);
        debounceTimer = win.setTimeout(() => {
          debounceTimer = 0;
          evaluateNow();
        }, delay);
      };

      const onResize = () => schedule(DEBOUNCE_MS);
      const onOrientation = () => schedule(0);

      // 锚点可能在登录、面板切换、重建时重挂：用 MutationObserver 重新标记。
      observer = new win.MutationObserver(() => {
        if (disposed || anchorRaf) return;
        anchorRaf = win.requestAnimationFrame(() => {
          anchorRaf = 0;
          if (!resolveAnchors()) return;
          evaluateNow();
          if (state.mode === MODE_MOBILE && doc.querySelector('[role="listbox"]')) tagAddMenu();
        });
      });
      observer.observe(doc.documentElement, { childList: true, subtree: true });

      // Android 返回键 / 浏览器后退：先关闭抽屉与底部表。
      const onPopState = () => {
        if (!overlayHistory) return;
        suppressHistory = true;
        overlayHistory = false;
        closeSheet();
        if (isDrawerOpen()) requestDrawer(false);
        suppressHistory = false;
      };

      win.addEventListener('resize', onResize);
      win.addEventListener('orientationchange', onOrientation);
      win.addEventListener('pageshow', onOrientation);
      win.addEventListener('popstate', onPopState);
      if (win.visualViewport) win.visualViewport.addEventListener('resize', onResize);

      // 官方槽位注册：☰ 与会话头同生共死；遮罩层常驻但在默认布局下不渲染。
      // 客户端 cordis 的服务必须先 inject 才能取用（直接 ctx.slots 会抛错）。
      try {
        ctx.inject(['slots', 'layout'], (scoped) => {
          runtime.layout = scoped.layout || null;
          const slots = scoped.slots;
          try {
            slots.inject('conversation.header.leading', () => slots.register(
              { name: 'conversation.header.leading', id: 'dshm-menu', order: 5 },
              HamburgerButton,
            ));
          } catch (error) {
            logWarn('会话头 leading 槽位注册失败（抽屉入口不可用）：', error);
          }
          try {
            slots.inject('shell.overlay', () => slots.register(
              { name: 'shell.overlay', id: 'dshm-overlay', order: 5 },
              OverlayLayer,
            ));
          } catch (error) {
            logWarn('shell.overlay 槽位注册失败（遮罩与兜底入口不可用）：', error);
          }
          try {
            slots.inject('shell.bottom', () => slots.register(
              { name: 'shell.bottom', id: 'dshm-bottom', order: 5 },
              BottomBar,
            ));
          } catch (error) {
            logWarn('shell.bottom 槽位注册失败（底部操作条不可用）：', error);
          }

          // 官方全局面板打开时隐藏底部条，把整行交还官方。
          const panelInfo = runtime.layout && runtime.layout.panelInfo;
          if (
            panelInfo &&
            typeof panelInfo.subscribe === 'function' &&
            typeof panelInfo.getSnapshot === 'function'
          ) {
            const syncPanel = () => {
              const snapshot = panelInfo.getSnapshot();
              setState({ panelActive: Boolean(snapshot && snapshot.activePanelId) });
            };
            syncPanel();
            teardowns.push(panelInfo.subscribe(syncPanel));
          }

          // 会话与工作区服务：新建会话、会话表、切换会话。
          try {
            ctx.inject(['sessions', 'uiWorkspace'], (services) => {
              runtime.sessions = services.sessions || null;
              runtime.workspace = services.uiWorkspace || null;
              setState({ servicesReady: Boolean(runtime.sessions && runtime.workspace) });
            });
          } catch (error) {
            logWarn('sessions / uiWorkspace 注入失败（新建与会话表不可用）：', error);
          }
        });
      } catch (error) {
        logWarn('slots / layout 注入失败（抽屉不可用）：', error);
      }

      // 语言跟随官方 locale；服务缺席时退回 <html lang> / navigator。
      try {
        ctx.inject(['locale'], (scoped) => {
          const locale = scoped && scoped.locale;
          if (!locale) return;
          const applyLocale = () => {
            runtime.lang = detectLang(locale);
          };
          applyLocale();
          if (typeof scoped.on === 'function') scoped.on('locale/change', applyLocale);
        });
      } catch (error) {
        runtime.lang = detectLang(null);
        console.error('[dsh-mobile-layout] locale 注入失败：', error);
      }

      // 初始：先标记锚点（失败也不阻断），再判定模式。
      resolveAnchors();
      evaluateNow();
      // AppFrame 由官方在启动后挂载，锚点缺失不算错误；延迟确认仍缺失再提示。
      anchorTimer = win.setTimeout(() => {
        anchorTimer = 0;
        if (!disposed && !state.anchored) {
          logWarn('未找到官方 AppFrame 锚点（data-shell-bottom / data-rightbar-col），回退默认布局');
        }
      }, 2000);

      exports.__test = { classify, measure, ENTER, STAY, MODE_MOBILE, MODE_DEFAULT, VERSION };

      return function dispose() {
        disposed = true;
        if (debounceTimer) win.clearTimeout(debounceTimer);
        if (anchorTimer) win.clearTimeout(anchorTimer);
        if (anchorRaf) win.cancelAnimationFrame(anchorRaf);
        if (observer) observer.disconnect();
        if (attrObserver) attrObserver.disconnect();
        win.removeEventListener('resize', onResize);
        win.removeEventListener('orientationchange', onOrientation);
        win.removeEventListener('pageshow', onOrientation);
        win.removeEventListener('popstate', onPopState);
        if (win.visualViewport) win.visualViewport.removeEventListener('resize', onResize);
        teardowns.forEach((fn) => {
          try {
            fn();
          } catch (error) {
            console.error('[dsh-mobile-layout] 清理订阅失败：', error);
          }
        });
        clearAnchors(doc);
        doc.documentElement.removeAttribute('data-dshm-mode');
        if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
        subscribers.clear();
        state = {
          mode: MODE_DEFAULT,
          anchored: false,
          drawerOpen: false,
          headerLeading: false,
          rightbarFullscreen: false,
          panelActive: false,
          servicesReady: false,
          sheet: null,
        };
        runtime.ctx = null;
        runtime.layout = null;
        runtime.sessions = null;
        runtime.workspace = null;
      };
    }

    exports.apply = apply;
    exports.__test = { classify, measure, ENTER, STAY, MODE_MOBILE, MODE_DEFAULT, VERSION };
    return module.exports;
  },
});
