'use strict'

/**
 * 每帧同步链的成本回落（2026-11，rebase 到 0.4.12 后重写）。
 *
 * 手机上流式输出时主 observer 每帧跑一遍轻链，链里最贵的固定开销是**存在性
 * 探测**（设置页在不在 / 官方弹层开没开），而绝大多数帧答案是「不在」。
 * 这里锁住四条约定：探测节流+粘性、弹层首帧打标、弹层登记表、节点缓存。
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')

function slice(startMarker, stopMarker) {
  const from = source.indexOf(startMarker)
  assert.notEqual(from, -1, '找不到起点：' + startMarker)
  const to = stopMarker ? source.indexOf(stopMarker, from + startMarker.length) : -1
  return source.slice(from, to === -1 ? from + 6000 : to)
}

test('存在性探测：独立节流常量 + 粘性保存', () => {
  const body = slice('const PRESENCE_PROBE_MS = ', 'observer.observe(doc.documentElement')
  assert.match(body, /let overlaysPresent = false/)
  assert.match(body, /let menuPresent = false/)
  assert.match(body, /overlaysPresent \|\| nowAt - lastPresenceProbeAt >= PRESENCE_PROBE_MS/)
  assert.match(body, /menuPresent \|\| menuFresh \|\| nowAt - menuProbeAt >= PRESENCE_PROBE_MS/)
  // 探到之后必须继续每帧维护，否则标记被官方重渲染冲掉就停住
  assert.match(body, /overlaysPresent = state\.settingsOpen/)
  assert.match(body, /menuPresent = menuVisible \|\| popoverMarks\.size > 0/)
})

test('弹层首帧打标：MutationObserver 回调里就发现新增菜单', () => {
  const body = slice('observer = new win.MutationObserver((records) => {', 'observer.observe(doc.documentElement')
  assert.match(body, /record\.addedNodes/)
  assert.match(body, /menuDueAt = stamp/)
  assert.match(body, /role === 'listbox' \|\| role === 'menu'/)
  assert.match(body, /MENU_TAG_WINDOW_MS/)
  // 深层子树下探要有限制
  assert.match(body, /childElementCount < 40/)
})

test('弹层清理只遍历登记表，不做全文档扫描', () => {
  const body = slice('function prunePopoverMarks()', 'function tagComposerMenus')
  assert.match(body, /popoverMarks\.size === 0/)
  assert.equal(/document\.querySelectorAll\(/.test(body), false)
  // 打标时必须登记
  const tag = slice('function tagComposerMenus', 'function syncAddPaging')
  assert.match(tag, /popoverMarks\.add\(target\)/)
})

test('面板让位高度用登记表取根', () => {
  const body = slice('function syncPanelSpace()', 'function ')
  assert.match(body, /firstPopoverMark\(\)/)
  assert.equal(/querySelector\('\[data-dshm-popover\]'\)/.test(body), false)
})

test('布局选择器回收在「一份都没有」时 O(1)', () => {
  const body = slice('let layoutPickerCount = 0;', 'function findAppearanceSection')
  assert.match(body, /if \(layoutPickerCount === 0 && !keep\) return;/)
  const ensure = slice('function ensureLayoutPicker(', 'function syncLayoutCardStyle')
  assert.match(ensure, /layoutPickerCount = 1;/)
})

test('输入卡节点走缓存 + isConnected 复核', () => {
  assert.match(source, /let composerCardCache = null;/)
  assert.match(source, /const composerCardNode = \(\) => \{/)
})

test('clearAnchors 清空登记表与闸门（不留跨实例脏状态）', () => {
  const body = slice('function clearAnchors(doc) {', 'function ')
  assert.match(body, /popoverMarks\.clear\(\)/)
  assert.match(body, /layoutPickerCount = 0/)
})

test('插入即隐藏：只在手机形态、跳过插件自绘浮层、按布局几何判稳', () => {
  const body = slice('const OWN_OVERLAY_SELECTOR = ', 'observer.observe(doc.documentElement')
  // 只在手机形态里接管：桌面/平板藏官方弹窗是纯拖慢。
  assert.match(body, /if \(records && records\.length && state\.mode === MODE_MOBILE\) \{/)
  // 底部表 / 附件菜单 / 快速菜单是自绘的，不参与「插入即隐藏」。
  assert.match(body, /const OWN_OVERLAY_SELECTOR = /)
  assert.match(body, /isPanel && !isOwnOverlay\(node\) && node\.style\.visibility !== 'hidden'/)
  // justify 用 offset*（不受 transform 影响），不能再用 rect 判稳。
  assert.match(body, /node\.offsetLeft \+ ',' \+ node\.offsetTop/)
  assert.equal(/const r = node\.getBoundingClientRect\(\);/.test(body), false)
  // 藏的时间有上限，且不能是 500ms 这种「动画都放完了」的窗口。
  assert.match(body, /frames > 8/)
  assert.equal(/win\.setTimeout\(reveal, 500\)/.test(body), false)
})

test('不残留调试探针', () => {
  assert.equal(source.includes('TEMP-PROBE'), false)
  assert.equal(source.includes('dshm-geo'), false)
})

test('clearAnchors 先还原内联行高再摘 header 标记，并清掉布局选择器节点', () => {
  const body = slice('function clearAnchors(doc) {', 'function ')
  const restoreAt = body.indexOf("removeProperty('grid-template-rows')")
  const stripAt = body.indexOf('ATTR_HEADER_CARD')
  assert.notEqual(restoreAt, -1, 'clearAnchors 里应有内联行高还原')
  assert.notEqual(stripAt, -1, 'clearAnchors 里应摘 header-card 标记')
  assert.ok(restoreAt < stripAt, '必须先还原内联行高，摘掉标记后就找不到 header 了')
  assert.match(body, /\[data-dshm-layout-picker\]/)
})
