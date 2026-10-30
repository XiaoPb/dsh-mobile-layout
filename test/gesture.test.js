'use strict'

/**
 * 抽屉手势判定的单元测试（0.1.15 手势全局化）。
 *
 * 只测纯函数：方向 / 触发阈值 / 起手区 / 竖滑让路 / 横滚容器边界让路 /
 * 浮层拦截。事件绑定（window 捕获阶段、双通道去重、复核重试）与跟手
 * 反馈属于真机验收范围（见 docs/plan-drawer-gesture.md 的验收矩阵）。
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

function loadClient() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')
  let captured
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load({ factory }) {
          captured = factory(() => ({}))
        },
      },
    },
    console: { warn() {}, error() {}, log() {}, info() {} },
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'lib/client.js' })
  return captured
}

const {
  SWIPE_MIN,
  SWIPE_ARM_PX,
  drawerStartLimit,
  isHorizScrollerMetrics,
  scrollerConsumes,
  decideDrawerGesture,
  drawerSettle,
  settingsSettle,
  SETTLE_RATIO,
  SETTLE_VELOCITY,
} = loadClient().__test

/** 视口宽 411（K70 一类常见手机 CSS 宽），打开区 = 左 40% ≈ 164px。 */
const W = 411

/** 判定快捷入口：缺省字段补全。 */
function decide(input) {
  return decideDrawerGesture({
    startX: 120,
    width: W,
    drawerOpen: false,
    blocked: false,
    hScrollerConsumes: false,
    ...input,
  })
}

test('常量：意图确认 24px，触发阈值 48px，确认先于触发', () => {
  assert.equal(SWIPE_ARM_PX, 24)
  assert.equal(SWIPE_MIN, 48)
  assert.ok(SWIPE_ARM_PX < SWIPE_MIN)
})

test('decideDrawerGesture：起手区内右滑 → open', () => {
  assert.equal(decide({ dx: 60, dy: 0, startX: 164 }), 'open')
  assert.equal(decide({ dx: 60, dy: -10, startX: 0 }), 'open')
  // 刚好到触发阈值也算
  assert.equal(decide({ dx: SWIPE_MIN, dy: 0, startX: 164 }), 'open')
  assert.equal(decide({ dx: SWIPE_MIN - 1, dy: 0, startX: 164 }), 'none')
})

test('decideDrawerGesture：起手出区（右侧大半屏起手）不开', () => {
  assert.equal(decide({ dx: 80, dy: 0, startX: 165 }), 'none')
  assert.equal(decide({ dx: 80, dy: 0, startX: 300 }), 'none')
  // 起手区边界按 drawerStartLimit 钳制后的宽度算（411 → 164）
  assert.equal(drawerStartLimit(W), 164)
})

test('decideDrawerGesture：抽屉已开时右滑无事发生', () => {
  assert.equal(decide({ dx: 80, dy: 0, startX: 120, drawerOpen: true }), 'none')
})

test('decideDrawerGesture：抽屉已开时左滑不限起手位置都收', () => {
  assert.equal(decide({ dx: -60, dy: 0, startX: 0, drawerOpen: true }), 'close')
  assert.equal(decide({ dx: -60, dy: 0, startX: 380, drawerOpen: true }), 'close')
  // 未开时左滑不产生任何动作（没有「左滑打开」语义）
  assert.equal(decide({ dx: -60, dy: 0, startX: 0, drawerOpen: false }), 'none')
})

test('decideDrawerGesture：竖滑 / 斜滑不触发', () => {
  // 纵向超过横向 0.72 倍：内容滚动
  assert.equal(decide({ dx: 100, dy: 80, startX: 120 }), 'none')
  assert.equal(decide({ dx: -100, dy: 80, startX: 120, drawerOpen: true }), 'none')
  // 横向明显大于纵向才认
  assert.equal(decide({ dx: 100, dy: 60, startX: 120 }), 'open')
})

test('decideDrawerGesture：浮层挡着 / 横滚容器还要滚都让路', () => {
  assert.equal(decide({ dx: 100, dy: 0, startX: 120, blocked: true }), 'none')
  assert.equal(decide({ dx: 100, dy: 0, startX: 120, hScrollerConsumes: true }), 'none')
  assert.equal(decide({ dx: -100, dy: 0, startX: 120, drawerOpen: true, hScrollerConsumes: true }), 'none')
})

test('decideDrawerGesture：非法输入一律 none，不产生 NaN 分支', () => {
  assert.equal(decideDrawerGesture(null), 'none')
  assert.equal(decide({ dx: NaN, dy: 0 }), 'none')
  assert.equal(decide({ dx: 100, dy: undefined }), 'none')
  assert.equal(decide({ dx: 100, dy: 0, startX: NaN }), 'none')
  // 视口宽非法 → 起手区退保守缺省 96（drawerStartLimit 的兜底）
  assert.equal(decide({ dx: 100, dy: 0, width: NaN, startX: 90 }), 'open')
  assert.equal(decide({ dx: 100, dy: 0, width: NaN, startX: 120 }), 'none')
})

test('decideDrawerGesture：min 参数可收紧 / 放宽触发阈值', () => {
  assert.equal(decideDrawerGesture({ dx: 30, dy: 0, startX: 120, width: W, drawerOpen: false, blocked: false, hScrollerConsumes: false }, 24), 'open')
  assert.equal(decideDrawerGesture({ dx: 30, dy: 0, startX: 120, width: W, drawerOpen: false, blocked: false, hScrollerConsumes: false }, 60), 'none')
})

/** 造一个只带滚动指标的「元素」。 */
function scroller(scrollLeft, clientWidth, scrollWidth) {
  return { scrollLeft, clientWidth, scrollWidth }
}

test('scrollerConsumes：右滑看 scrollLeft 余量，左滑看右端边界', () => {
  // 手指右滑（dx>0）：scrollLeft>0 才让路（内容还能往右滚）
  assert.equal(scrollerConsumes(scroller(40, 300, 600), 80), true)
  assert.equal(scrollerConsumes(scroller(0, 300, 600), 80), false)
  // 手指左滑（dx<0）：还没滚到右端才让路
  assert.equal(scrollerConsumes(scroller(40, 300, 600), -80), true)
  assert.equal(scrollerConsumes(scroller(300, 300, 600), -80), false)
  // 距右端 2px：还没到头，让路
  assert.equal(scrollerConsumes(scroller(298, 300, 600), -80), true)
  // 距右端 1px 以内视为到头（浮点 / 亚像素容差），手势交还抽屉
  assert.equal(scrollerConsumes(scroller(299, 300, 600), -80), false)
  assert.equal(scrollerConsumes(scroller(299.5, 300, 600), -80), false)
})

test('scrollerConsumes：空元素 / 非法指标不让路（手势接管）', () => {
  assert.equal(scrollerConsumes(null, 80), false)
  assert.equal(scrollerConsumes(undefined, -80), false)
  // 指标缺字段按 0 处理：既不在左余量也不在右边界之外
  assert.equal(scrollerConsumes({}, 80), false)
})

test('isHorizScrollerMetrics：宽出 4px 以上且 overflow-x 可滚才算横滚容器', () => {
  assert.equal(isHorizScrollerMetrics({ scrollWidth: 600, clientWidth: 300, overflowX: 'auto' }), true)
  assert.equal(isHorizScrollerMetrics({ scrollWidth: 600, clientWidth: 300, overflowX: 'scroll' }), true)
  // overflow-x hidden / visible / clip：不是横滚容器
  assert.equal(isHorizScrollerMetrics({ scrollWidth: 600, clientWidth: 300, overflowX: 'hidden' }), false)
  assert.equal(isHorizScrollerMetrics({ scrollWidth: 600, clientWidth: 300, overflowX: 'visible' }), false)
  assert.equal(isHorizScrollerMetrics({ scrollWidth: 600, clientWidth: 300, overflowX: '' }), false)
  // 宽度几乎相等（≤4px 视为布局亚像素）：不算
  assert.equal(isHorizScrollerMetrics({ scrollWidth: 303, clientWidth: 300, overflowX: 'auto' }), false)
  assert.equal(isHorizScrollerMetrics({ scrollWidth: 305, clientWidth: 300, overflowX: 'auto' }), true)
  // 非法输入
  assert.equal(isHorizScrollerMetrics(null), false)
  assert.equal(isHorizScrollerMetrics({}), false)
  assert.equal(isHorizScrollerMetrics({ scrollWidth: NaN, clientWidth: 300, overflowX: 'auto' }), false)
})

/**
 * 组合回归：终端 / 宽表整页横滚（旧实现在这里整页让路，左滑永远失灵）。
 * 边界让路后：最左端起手右滑开抽屉，中部起手让路给内容。
 */
test('边界让路组合：横滚容器到边界后手势交还抽屉', () => {
  const wideTable = scroller(0, 300, 900)
  // 最左端起手右滑：容器到左边界，不再消费右滑 → 开抽屉
  assert.equal(decide({ dx: 90, dy: 0, startX: 120, hScrollerConsumes: scrollerConsumes(wideTable, 90) }), 'open')
  // 中部起手右滑：scrollLeft 有余量 → 让路
  wideTable.scrollLeft = 120
  assert.equal(decide({ dx: 90, dy: 0, startX: 120, hScrollerConsumes: scrollerConsumes(wideTable, 90) }), 'none')
})

// ---- 跟手吸附（drawerSettle）----

test('常量：吸附位移比例与速度阈值取偏小值（手机轻扫即响应）', () => {
  assert.equal(SETTLE_RATIO, 0.38)
  assert.equal(SETTLE_VELOCITY, 0.35)
})

test('drawerSettle：甩动优先，速度达到阈值按甩动方向吸附', () => {
  // 从关闭侧拖出 10% 就快速右甩 → 展开
  assert.equal(drawerSettle(false, 0.1, 0.5), true)
  // 展开态快速左甩 → 收起（哪怕还没拖回一半）
  assert.equal(drawerSettle(true, 0.8, -0.4), false)
  // 恰好达到阈值也算甩动
  assert.equal(drawerSettle(false, 0.1, SETTLE_VELOCITY), true)
  assert.equal(drawerSettle(true, 0.9, -SETTLE_VELOCITY), false)
})

test('drawerSettle：无甩动按位置比例吸附（同一阈值对称判定）', () => {
  assert.equal(drawerSettle(false, 0.37, 0), false)
  assert.equal(drawerSettle(false, 0.38, 0), true)
  // 展开态：拖回比例仍 ≥0.38 视为停在「接近展开」，保持展开；
  // 拖回 0.38 以下才算明确的收回意图
  assert.equal(drawerSettle(true, 0.62, 0), true)
  assert.equal(drawerSettle(true, 0.37, 0), false)
})

test('drawerSettle：非法输入回落到起点侧，不产生 NaN 分支', () => {
  assert.equal(drawerSettle(false, NaN, 0), false)
  assert.equal(drawerSettle(true, NaN, 0), true)
  assert.equal(drawerSettle(false, 0.5, NaN), true)
  assert.equal(drawerSettle(true, undefined, null), true)
})

test('settingsSettle：位移比例越过阈值（左滑为负）关闭设置页', () => {
  assert.equal(settingsSettle(-0.38, 0), true)
  assert.equal(settingsSettle(-0.37, 0), false)
  // 右滑（正比例）永不关闭
  assert.equal(settingsSettle(0.5, 0), false)
})

test('settingsSettle：左甩优先，右甩永远不关闭', () => {
  assert.equal(settingsSettle(-0.05, -SETTLE_VELOCITY), true)
  assert.equal(settingsSettle(-0.05, -0.5), true)
  assert.equal(settingsSettle(-0.9, 0.6), false)
})

test('settingsSettle：非法输入不产生 NaN 分支，一律弹回', () => {
  assert.equal(settingsSettle(NaN, 0), false)
  assert.equal(settingsSettle(-0.5, NaN), true)
  assert.equal(settingsSettle(undefined, null), false)
})
