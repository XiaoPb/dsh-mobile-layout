'use strict'

/**
 * 底部表（会话表 / 插件表）契约测试。
 *
 * 两张表是「纯 CSS 视觉 + 一点点指针逻辑」的组合：视觉部分没有可断言的
 * 状态机，逻辑部分只有一个阈值判定。这里分两层兜住：
 *
 *   1. 纯函数层：把手拖拽的关闭阈值（shouldCloseSheetByDrag）走 __test 出口。
 *   2. 源码契约层：视觉 token 与交互挂载点做**字符串锁**。
 *      视觉是这个包的本地分支（有意偏离上游基线，见 docs/technical-notes.md），
 *      以后同步上游时很容易被整体覆盖掉，锁一下能在 CI 上立刻发现。
 *      这类断言只锁「存在」，不锁具体数值的排版细节，避免把 CSS 改死。
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')

function loadClient() {
  let captured
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load({ factory }) {
          captured = factory(() => ({}))
        },
      },
    },
    console: { warn() {}, error() {}, log() {} },
  }
  vm.createContext(sandbox)
  vm.runInContext(SOURCE, sandbox, { filename: 'lib/client.js' })
  return captured
}

const { SHEET_DRAG_CLOSE_PX, shouldCloseSheetByDrag } = loadClient().__test

// ---------------------------------------------------------------- 纯函数层

test('SHEET_DRAG_CLOSE_PX：阈值是 96px', () => {
  assert.equal(SHEET_DRAG_CLOSE_PX, 96)
})

test('shouldCloseSheetByDrag：未到阈值不关闭', () => {
  for (const dy of [0, 1, 40, 95, SHEET_DRAG_CLOSE_PX]) {
    assert.equal(shouldCloseSheetByDrag(dy), false, `dy=${dy} 不该关闭`)
  }
})

test('shouldCloseSheetByDrag：刚过阈值即关闭', () => {
  for (const dy of [SHEET_DRAG_CLOSE_PX + 1, 200, 10000]) {
    assert.equal(shouldCloseSheetByDrag(dy), true, `dy=${dy} 应该关闭`)
  }
})

test('shouldCloseSheetByDrag：方向语义——负位移不关闭', () => {
  // 调用方把位移钳到 ≥0，这里再兜一层：向上拖不该有「负距离关闭」
  assert.equal(shouldCloseSheetByDrag(-1), false)
  assert.equal(shouldCloseSheetByDrag(-1000), false)
})

test('shouldCloseSheetByDrag：非法输入退化为不关闭', () => {
  for (const dy of [NaN, undefined, null, {}, '', 'abc']) {
    assert.equal(shouldCloseSheetByDrag(dy), false, `${String(dy)} 不该关闭`)
  }
  // 数字字符串按数值解释（pointer 事件的 clientY 差值可能来自序列化数据）
  assert.equal(shouldCloseSheetByDrag('120'), true)
})

test('shouldCloseSheetByDrag：调用点不再硬编码阈值', () => {
  assert.match(SOURCE, /if \(shouldCloseSheetByDrag\(drag\.dy\)\)/)
  assert.doesNotMatch(SOURCE, /drag\.dy > 96/)
})

// ------------------------------------------------------------ 源码契约层

test('视觉契约：抽屉抬升面与官方圆角', () => {
  assert.ok(SOURCE.includes('border-radius: 28px 28px 0 0;'), '缺 28px 顶部圆角')
  assert.ok(SOURCE.includes('rgba(255, 255, 255, 0.09)'), '缺 9% 白叠加的抬升面')
  assert.ok(SOURCE.includes('border: 1px solid rgba(127, 127, 127, 0.25)'), '缺 1px 淡描边')
})

test('视觉契约：高度上限 64% / 下限 300px', () => {
  assert.ok(SOURCE.includes('* 0.64)'), '高度上限应随官方弹层改为 64%')
  assert.ok(SOURCE.includes('min(max(300px'), '矮屏下限应为 300px')
})

test('视觉契约：入场动效（上滑 + 淡入）', () => {
  assert.ok(SOURCE.includes('@keyframes dshm-sheet-up'), '缺上滑关键帧')
  assert.ok(SOURCE.includes('@keyframes dshm-sheet-fade'), '缺淡入关键帧')
  assert.ok(SOURCE.includes('animation: dshm-sheet-up 220ms'), '面板未挂入场动画')
  assert.ok(SOURCE.includes('rgba(0, 0, 0, 0.45)'), '遮罩应加深到 45%')
})

test('视觉契约：主操作按钮为胶囊反色', () => {
  assert.ok(
    SOURCE.includes('background: var(--dsw-alias-label-primary, #fff);') &&
      SOURCE.includes('border-radius: 999px;'),
    '主按钮应是 label-primary 底 + 999px 圆角',
  )
})

test('交互契约：把手节点存在且带全套指针事件', () => {
  const at = SOURCE.indexOf("className: 'dshm-sheet-grabber'")
  assert.notEqual(at, -1, '缺 .dshm-sheet-grabber 节点')
  const node = SOURCE.slice(at, at + 400)
  for (const handler of ['onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel']) {
    assert.ok(node.includes(handler), `把手上缺 ${handler}`)
  }
  assert.ok(node.includes("'aria-hidden': 'true'"), '把手是纯装饰，应对读屏隐藏')
  // 把手作为第一个子节点插在 head 之前（head 的 JSX 在文件里更早构造，
  // 所以这里只认「同一处 h() 的子节点顺序」，不能比字符串下标）
  assert.match(
    SOURCE.slice(at, at + 600),
    /\}\),\s*head,/,
    '把手应是面板的第一个子节点，排在 head 之前',
  )
})

test('交互契约：把手吞掉滚动，避免和列表抢手势', () => {
  const at = SOURCE.indexOf('.dshm-sheet-grabber {')
  assert.notEqual(at, -1, '缺把手样式')
  assert.ok(SOURCE.slice(at, at + 400).includes('touch-action: none;'), '把手应 touch-action: none')
})

test('动效降级：prefers-reduced-motion 段里含 .dshm-sheet', () => {
  const marker = "'@media (prefers-reduced-motion: reduce) {'"
  const start = SOURCE.indexOf(marker)
  assert.notEqual(start, -1, '缺降级媒体查询')
  const end = SOURCE.indexOf("\n      '}',", start)
  assert.notEqual(end, -1, '降级段没有正常收尾，测试解析失败')
  const block = SOURCE.slice(start, end)
  assert.ok(block.includes('.dshm-sheet,'), '面板本身缺席降级清单 → 前庭敏感用户仍会看到滑入')
  assert.ok(block.includes('animation: none !important;'), '降级段应整体关掉动画')
})
