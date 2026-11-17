'use strict'

/**
 * 无障碍：焦点陷阱 + 读屏播报（2026-11，rebase 到 0.4.12 后重写）。
 *
 * 底部表是模态但没有焦点陷阱（Tab 会走到遮罩下面），开合也没有播报。
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
    window: { __ModuleLoader__: { load({ factory }) { captured = factory(() => ({})) } } },
    console: { warn() {}, error() {}, log() {}, info() {} },
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'lib/client.js' })
  return { captured, source }
}

const { captured, source } = loadClient()

function slice(startMarker, stopMarker) {
  const from = source.indexOf(startMarker)
  assert.notEqual(from, -1, '找不到起点：' + startMarker)
  const to = stopMarker ? source.indexOf(stopMarker, from + startMarker.length) : -1
  return source.slice(from, to === -1 ? from + 4000 : to)
}

test('播报文案：中英成对、英文不含中文、都带 {name}', () => {
  const { STRINGS } = captured.__test
  for (const key of ['a11yOpened', 'a11yClosed']) {
    assert.ok(STRINGS.zh[key], 'zh 缺少 ' + key)
    assert.ok(STRINGS.en[key], 'en 缺少 ' + key)
    assert.match(STRINGS.zh[key], /\{name\}/)
    assert.match(STRINGS.en[key], /\{name\}/)
    assert.equal(/[\u4e00-\u9fa5]/.test(STRINGS.en[key]), false, '英文文案里不应有中文')
  }
})

test('播报区：role=status + aria-live，且不是 display:none', () => {
  const body = slice('function announce(message) {', 'function a11yText(')
  assert.match(body, /setAttribute\('role', 'status'\)/)
  assert.match(body, /setAttribute\('aria-live', 'polite'\)/)
  assert.match(body, /setAttribute\('aria-atomic', 'true'\)/)
  // 同一句话重复播报要先清空再写
  assert.match(body, /node\.textContent = ''/)
  assert.equal(/display\s*=\s*'none'/.test(body), false)
  assert.equal(/visibility\s*=\s*'hidden'/.test(body), false)
})

test('焦点陷阱：Tab 双向循环 + 可解绑', () => {
  const body = slice('function trapFocus(container) {', 'function guardComposerFocusAfterOverlay(')
  assert.match(body, /event\.key !== 'Tab'/)
  assert.match(body, /event\.shiftKey/)
  assert.match(body, /removeEventListener\('keydown'/)
  assert.match(body, /preventScroll: true/)
})

test('底部表：打开装陷阱并播报，关闭解绑并播报', () => {
  const body = slice("const target = node.querySelector('.dshm-sheet-close')", 'if (!sheet) return null;')
  assert.match(body, /const releaseTrap = trapFocus\(node\)/)
  assert.match(body, /releaseTrap\(\)/)
  assert.match(body, /announce\(a11yText\('a11yOpened'/)
  assert.match(body, /announce\(a11yText\('a11yClosed'/)
})

test('清场时摘掉播报区节点', () => {
  const body = slice('function clearAnchors(doc) {', 'function ')
  assert.match(body, /LIVE_ATTR/)
  assert.match(body, /removeChild\(node\)/)
})
