'use strict'

/**
 * 形态判定单元测试。
 *
 * lib/client.js 是浏览器端产物（顶层读取 window.__ModuleLoader__），因此这里
 * 用 vm 造一个最小沙箱：只替换 window / console / react，工厂函数体内除
 * `require('react')` 外不触碰 DOM，于是可以直接取出 exports.__test。
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
    console: { warn() {}, error() {}, log() {} },
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'lib/client.js' })
  return captured
}

const {
  classify,
  permissionShort,
  modelShort,
  MODE_DEFAULT,
  MODE_MOBILE,
  detectHost,
  resolveMode,
  HOST_DESKTOP,
  HOST_ANDROID,
  HOST_WEB,
} = loadClient().__test

test('常见手机竖屏进入 mobile', () => {
  const phones = [
    [320, 568],
    [360, 640],
    [375, 667],
    [390, 844],
    [412, 915],
  ]
  for (const [w, h] of phones) {
    assert.equal(classify(w, h, MODE_DEFAULT), MODE_MOBILE, `${w}x${h} 应进入 mobile`)
  }
})

test('平板、横屏、桌面保持 default', () => {
  const defaults = [
    [768, 1024],
    [820, 1180],
    [844, 390],
    [1280, 900],
    [1920, 1080],
  ]
  for (const [w, h] of defaults) {
    assert.equal(classify(w, h, MODE_DEFAULT), MODE_DEFAULT, `${w}x${h} 应保持 default`)
  }
})

test('滞回：640x1024 进入需要放宽，退出允许保持', () => {
  // 短边 640 / 比例 1.6：默认态不进入，mobile 态保持。
  assert.equal(classify(640, 1024, MODE_DEFAULT), MODE_DEFAULT)
  assert.equal(classify(640, 1024, MODE_MOBILE), MODE_MOBILE)
})

test('滞回：600x760 比例 1.267 进入且保持', () => {
  assert.equal(classify(600, 760, MODE_DEFAULT), MODE_MOBILE)
  assert.equal(classify(600, 760, MODE_MOBILE), MODE_MOBILE)
})

test('比例不足 1.25 的短屏不进入', () => {
  assert.equal(classify(480, 560, MODE_DEFAULT), MODE_DEFAULT)
})

test('横屏即使短边很小也不进入', () => {
  assert.equal(classify(640, 360, MODE_DEFAULT), MODE_DEFAULT)
  assert.equal(classify(640, 360, MODE_MOBILE), MODE_DEFAULT)
})

test('非法尺寸回退 default', () => {
  assert.equal(classify(0, 0, MODE_MOBILE), MODE_DEFAULT)
  assert.equal(classify(Number.NaN, 800, MODE_MOBILE), MODE_DEFAULT)
})

test('detectHost：dsh-app 协议识别为桌面端', () => {
  assert.equal(detectHost({ location: { protocol: 'dsh-app:' } }), HOST_DESKTOP)
  assert.equal(detectHost({ location: { protocol: 'https:' } }), HOST_WEB)
  assert.equal(detectHost({ location: { protocol: 'http:' } }), HOST_WEB)
})

test('detectHost：dshDesktop 桥识别为桌面端（主框架与 iframe 桩都算）', () => {
  assert.equal(detectHost({ dshDesktop: {} }), HOST_DESKTOP)
  assert.equal(detectHost({ dshDesktop: { protocolVersion: 1 } }), HOST_DESKTOP)
})

test('detectHost：Android 桥识别为安卓壳', () => {
  assert.equal(detectHost({ DshAndroidClipboard: {} }), HOST_ANDROID)
  assert.equal(detectHost({ DshAndroidDownloader: {} }), HOST_ANDROID)
  assert.equal(detectHost({ DshAndroidClipboard: {}, DshAndroidDownloader: {} }), HOST_ANDROID)
})

test('detectHost：桌面判据优先于 Android 桥，空窗口回退 web', () => {
  assert.equal(detectHost({ location: { protocol: 'dsh-app:' }, DshAndroidClipboard: {} }), HOST_DESKTOP)
  assert.equal(detectHost({ dshDesktop: {}, DshAndroidClipboard: {} }), HOST_DESKTOP)
  assert.equal(detectHost({}), HOST_WEB)
  assert.equal(detectHost(null), HOST_WEB)
  assert.equal(detectHost(undefined), HOST_WEB)
})

test('resolveMode：桌面端任何尺寸都是 default（含能命中视口判定的窄窗）', () => {
  assert.equal(resolveMode(HOST_DESKTOP, 520, 700, MODE_DEFAULT), MODE_DEFAULT)
  assert.equal(resolveMode(HOST_DESKTOP, 520, 700, MODE_MOBILE), MODE_DEFAULT)
  assert.equal(resolveMode(HOST_DESKTOP, 360, 780, MODE_DEFAULT), MODE_DEFAULT)
  assert.equal(resolveMode(HOST_DESKTOP, 320, 568, MODE_DEFAULT), MODE_DEFAULT)
})

test('resolveMode：android / web 维持视口几何判定', () => {
  assert.equal(resolveMode(HOST_ANDROID, 390, 844, MODE_DEFAULT), MODE_MOBILE)
  assert.equal(resolveMode(HOST_WEB, 390, 844, MODE_DEFAULT), MODE_MOBILE)
  assert.equal(resolveMode(HOST_WEB, 1280, 900, MODE_DEFAULT), MODE_DEFAULT)
  assert.equal(resolveMode(HOST_ANDROID, 640, 360, MODE_DEFAULT), MODE_DEFAULT)
})

test('权限按钮 aria-label → 短文案', () => {
  assert.equal(permissionShort('访问模式，当前：完全权限', 'zh'), '完全访问')
  assert.equal(permissionShort('访问模式，当前：仅可查看', 'zh'), '只读')
  assert.equal(permissionShort('访问模式，当前：工作区内修改', 'zh'), '工作区')
  assert.equal(permissionShort('Access mode, current: Read-only', 'en'), 'Read-only')
})

test('模型按钮 aria-label → V4.1 · H', () => {
  assert.equal(modelShort('选择模型，当前 DeepSeek-V4.1-Flash，推理等级 High'), 'V4.1 \u00b7 H')
  assert.equal(modelShort('选择模型，当前 DeepSeek-V4.1-Flash，推理等级 中'), 'V4.1 \u00b7 M')
  assert.equal(modelShort('Select model, current DeepSeek-V4.1-Flash, reasoning level Low'), 'V4.1 \u00b7 L')
})
