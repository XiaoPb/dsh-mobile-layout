/**
 * dsh-mobile-layout 浏览器端（client half）。
 *
 * 产物形状与 dsh-mobile-compose 一致：__ModuleLoader__ closure factory，
 * 外部依赖经注入的 require 从平台模块表解析（react 不在 bundle 内）。
 *
 * 职责（当前阶段：M1 形态判定 + DOM 锚点）：
 *   1. 按布局视口判定「手机竖屏」；进入 600/1.25、保持 640/1.15 做滞回，
 *      旋屏 / 分屏拖拽时 120ms 去抖，避免来回切换。
 *   2. 模式写入 documentElement.dataset.dshmMode；全部移动样式只在
 *      html[data-dshm-mode="mobile"] 下生效，退出即恢复官方默认布局。
 *   3. 给官方 AppFrame 打 data-dshm-* 锚点，后续阶段只用自有属性写 CSS，
 *      不依赖官方 CSS Modules 哈希类名。锚点缺失时回退默认布局并 warn 一次。
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

    const VERSION = '0.1.0';
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

    /** 插件级最小状态：只有模式与锚点就绪情况，UI 组件自行订阅。 */
    const subscribers = new Set();
    let state = { mode: MODE_DEFAULT, anchored: false };

    function getState() {
      return state;
    }

    function setState(patch) {
      const next = Object.assign({}, state, patch);
      if (next.mode === state.mode && next.anchored === state.anchored) return;
      state = next;
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
      const frame = doc.querySelector('[data-shell-bottom]');
      const rightbar = doc.querySelector('[data-rightbar-col]');
      if (!frame || !rightbar) return false;
      const frameEl = frame.parentElement;
      if (!frameEl) return false;
      const sidebar = frameEl.firstElementChild;
      const center = rightbar.previousElementSibling;
      if (!sidebar || !center) return false;
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

    // ---- 样式 ----
    const STYLE_ID = 'dshm-style';

    /**
     * 注入一个 <style data-plugin-css>。样式在挂载前生效，避免首帧闪跳；
     * 本阶段只有变量与作用域壳，视觉规则随后续阶段追加。
     */
    function injectStyle(doc) {
      let tag = doc.getElementById(STYLE_ID);
      if (!tag) {
        tag = doc.createElement('style');
        tag.id = STYLE_ID;
        tag.setAttribute('data-plugin-css', 'dsh-mobile-layout');
        doc.head.appendChild(tag);
      }
      tag.textContent = [
        'html[data-dshm-mode="mobile"] {',
        '  --dshm-header-height: 44px;',
        '  --dshm-bar-height: 56px;',
        '  --dshm-drawer-width: min(86vw, 320px);',
        '  --dshm-safe-top: env(safe-area-inset-top, 0px);',
        '  --dshm-safe-bottom: env(safe-area-inset-bottom, 0px);',
        '}',
      ].join('\n');
      return tag;
    }

    // ---- 生命周期 ----
    function apply(ctx) {
      const win = window;
      const doc = win.document;
      let disposed = false;
      let debounceTimer = 0;
      let warnCount = 0;
      let observer = null;
      let anchorRaf = 0;
      let styleEl = null;

      const logWarn = (message, error) => {
        if (warnCount >= 5) return;
        warnCount += 1;
        if (error) console.warn('[dsh-mobile-layout]', message, error);
        else console.warn('[dsh-mobile-layout]', message);
      };

      styleEl = injectStyle(doc);

      const resolveAnchors = () => {
        if (disposed) return;
        const ok = applyAnchors(doc);
        if (ok) {
          setState({ anchored: true });
          return true;
        }
        setState({ anchored: false });
        if (state.mode === MODE_MOBILE) setMode(MODE_DEFAULT);
        logWarn('未找到官方 AppFrame 锚点（data-shell-bottom / data-rightbar-col），回退默认布局');
        return false;
      };

      const setMode = (next) => {
        if (next === state.mode) return;
        doc.documentElement.setAttribute('data-dshm-mode', next);
        setState({ mode: next });
        try {
          win.dispatchEvent(new win.CustomEvent('dshm:mode', { detail: { mode: next, version: VERSION } }));
        } catch (error) {
          console.error('[dsh-mobile-layout] 派发模式事件失败：', error);
        }
      };

      const evaluateNow = () => {
        if (disposed) return;
        if (!state.anchored && !applyAnchors(doc)) {
          setState({ anchored: false });
          return;
        }
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

      // 初始：先标记锚点（失败也不阻断），再判定模式。
      resolveAnchors();
      evaluateNow();

      exports.__test = { classify, measure, ENTER, STAY, MODE_MOBILE, MODE_DEFAULT, VERSION };

      return function dispose() {
        disposed = true;
        if (debounceTimer) win.clearTimeout(debounceTimer);
        if (anchorRaf) win.cancelAnimationFrame(anchorRaf);
        if (observer) observer.disconnect();
        win.removeEventListener('resize', onResize);
        win.removeEventListener('orientationchange', onOrientation);
        win.removeEventListener('pageshow', onOrientation);
        if (win.visualViewport) win.visualViewport.removeEventListener('resize', onResize);
        clearAnchors(doc);
        doc.documentElement.removeAttribute('data-dshm-mode');
        if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
        subscribers.clear();
        setState({ mode: MODE_DEFAULT, anchored: false });
      };
    }

    exports.apply = apply;
    exports.__test = { classify, measure, ENTER, STAY, MODE_MOBILE, MODE_DEFAULT, VERSION };
    void useLayoutState;
    return module.exports;
  },
});
