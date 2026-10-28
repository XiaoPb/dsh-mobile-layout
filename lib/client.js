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

    const VERSION = '0.2.0';
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
      },
      en: {
        menu: 'Open sidebar',
        close: 'Close',
        newSession: 'New',
        sessions: 'Sessions',
        files: 'Files',
      },
    };

    const runtime = { ctx: null, layout: null, lang: 'en' };

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
      return frameEl;
    }

    function clearAnchors(doc) {
      [ATTR_FRAME, ATTR_SIDEBAR, ATTR_CENTER, ATTR_RIGHTBAR].forEach((attr) => {
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

    /**
     * 通过官方布局服务开合侧栏。目标是幂等的：已经处于目标状态就不调用，
     * 避免官方 toggle 在窄屏下翻转 narrowExpanded 造成反效果。
     */
    function requestDrawer(open) {
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
          if (event.key === 'Escape' && isDrawerOpen()) requestDrawer(false);
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
      let warnedMissing = false;

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
          if (!warnedMissing) {
            warnedMissing = true;
            logWarn('未找到官方 AppFrame 锚点（data-shell-bottom / data-rightbar-col），回退默认布局');
          }
          return false;
        }
        warnedMissing = false;
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
        });
      });
      observer.observe(doc.documentElement, { childList: true, subtree: true });

      win.addEventListener('resize', onResize);
      win.addEventListener('orientationchange', onOrientation);
      win.addEventListener('pageshow', onOrientation);
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

      exports.__test = { classify, measure, ENTER, STAY, MODE_MOBILE, MODE_DEFAULT, VERSION };

      return function dispose() {
        disposed = true;
        if (debounceTimer) win.clearTimeout(debounceTimer);
        if (anchorRaf) win.cancelAnimationFrame(anchorRaf);
        if (observer) observer.disconnect();
        if (attrObserver) attrObserver.disconnect();
        win.removeEventListener('resize', onResize);
        win.removeEventListener('orientationchange', onOrientation);
        win.removeEventListener('pageshow', onOrientation);
        if (win.visualViewport) win.visualViewport.removeEventListener('resize', onResize);
        clearAnchors(doc);
        doc.documentElement.removeAttribute('data-dshm-mode');
        if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
        subscribers.clear();
        state = { mode: MODE_DEFAULT, anchored: false, drawerOpen: false, headerLeading: false, rightbarFullscreen: false };
        runtime.ctx = null;
      };
    }

    exports.apply = apply;
    exports.__test = { classify, measure, ENTER, STAY, MODE_MOBILE, MODE_DEFAULT, VERSION };
    return module.exports;
  },
});
