'use strict'

/**
 * 预设（default / classic / v2）与预设 2 壳层纯函数的单元测试。
 *
 * 与 mode.test.js 同一套沙箱：lib/client.js 是浏览器产物，顶层读
 * window.__ModuleLoader__，工厂体内除 require('react') 外不碰 DOM，
 * 所以可以直接取 exports.__test。
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
  resolvePreset,
  presetLabelKey,
  isPhoneForm,
  effectiveMode,
  navSlots,
  addPanelGroups,
  attachAliasOf,
  composerState,
  PRESET_DEFAULT,
  PRESET_CLASSIC,
  PRESET_V2,
  PRESET_FALLBACK,
  NAV_KEYS,
  MODE_DEFAULT,
  MODE_MOBILE,
  HOST_DESKTOP,
  HOST_ANDROID,
  HOST_WEB,
} = loadClient().__test

test('resolvePreset：三档合法值原样返回', () => {
  assert.equal(resolvePreset('default'), PRESET_DEFAULT)
  assert.equal(resolvePreset('classic'), PRESET_CLASSIC)
  assert.equal(resolvePreset('v2'), PRESET_V2)
})

test('resolvePreset：大小写与首尾空格归一到合法值', () => {
  assert.equal(resolvePreset('V2'), PRESET_V2)
  assert.equal(resolvePreset('  Classic '), PRESET_CLASSIC)
  assert.equal(resolvePreset('DEFAULT'), PRESET_DEFAULT)
})

test('resolvePreset：脏值一律回退 classic，不产生第四种状态', () => {
  for (const raw of ['', '  ', null, undefined, 0, 1, {}, [], 'v3', 'mobile', true]) {
    assert.equal(resolvePreset(raw), PRESET_FALLBACK, `${String(raw)} 应回退 classic`)
  }
  assert.equal(PRESET_FALLBACK, PRESET_CLASSIC, '首次安装的默认预设必须是 classic')
})

test('presetLabelKey：三档各自对应一个文案 key', () => {
  assert.equal(presetLabelKey('default'), 'presetDefault')
  assert.equal(presetLabelKey('classic'), 'presetClassic')
  assert.equal(presetLabelKey('v2'), 'presetV2')
  // 脏值走 classic 的 key，和 resolvePreset 的归一化保持一致
  assert.equal(presetLabelKey('nope'), 'presetClassic')
})

test('isPhoneForm：桌面端无论尺寸都不是手机形态', () => {
  assert.equal(isPhoneForm(HOST_DESKTOP, 390, 844, MODE_DEFAULT), false)
})

test('isPhoneForm：安卓 / web 手机竖屏为真，平板与横屏为假', () => {
  for (const host of [HOST_ANDROID, HOST_WEB]) {
    assert.equal(isPhoneForm(host, 390, 844, MODE_DEFAULT), true)
    assert.equal(isPhoneForm(host, 320, 568, MODE_DEFAULT), true)
    assert.equal(isPhoneForm(host, 768, 1024, MODE_DEFAULT), false)
    assert.equal(isPhoneForm(host, 844, 390, MODE_DEFAULT), false)
  }
})

test('isPhoneForm：滞回边界与 classify 完全一致', () => {
  assert.equal(isPhoneForm(HOST_ANDROID, 640, 1024, MODE_DEFAULT), false)
  assert.equal(isPhoneForm(HOST_ANDROID, 640, 1024, MODE_MOBILE), true)
})

test('effectiveMode：桌面 × 三预设全部 default', () => {
  for (const preset of [PRESET_DEFAULT, PRESET_CLASSIC, PRESET_V2]) {
    assert.equal(effectiveMode(HOST_DESKTOP, 390, 844, MODE_DEFAULT, preset), MODE_DEFAULT)
  }
})

test('effectiveMode：手机 × 预设 → 只有 default 交还官方布局', () => {
  assert.equal(effectiveMode(HOST_ANDROID, 390, 844, MODE_DEFAULT, PRESET_DEFAULT), MODE_DEFAULT)
  assert.equal(effectiveMode(HOST_ANDROID, 390, 844, MODE_DEFAULT, PRESET_CLASSIC), MODE_MOBILE)
  assert.equal(effectiveMode(HOST_ANDROID, 390, 844, MODE_DEFAULT, PRESET_V2), MODE_MOBILE)
})

test('effectiveMode：非手机几何下预设再花也不进 mobile', () => {
  assert.equal(effectiveMode(HOST_WEB, 1280, 900, MODE_DEFAULT, PRESET_V2), MODE_DEFAULT)
  assert.equal(effectiveMode(HOST_WEB, 1024, 768, MODE_DEFAULT, PRESET_CLASSIC), MODE_DEFAULT)
})

test('effectiveMode：脏预设按 classic 处理', () => {
  assert.equal(effectiveMode(HOST_ANDROID, 390, 844, MODE_DEFAULT, 'garbage'), MODE_MOBILE)
})

test('effectiveMode：从 default 预设切到 v2 能重新进入 mobile（回切能力）', () => {
  // 上一模式是 default 时 classify 用进入阈值，390x844 达到门槛
  assert.equal(effectiveMode(HOST_ANDROID, 390, 844, MODE_DEFAULT, PRESET_V2), MODE_MOBILE)
  // 切回 default 预设立刻退出
  assert.equal(effectiveMode(HOST_ANDROID, 390, 844, MODE_MOBILE, PRESET_DEFAULT), MODE_DEFAULT)
})

test('navSlots：能力全开时是五项且顺序固定', () => {
  const slots = navSlots({ sessions: true, workspaces: true, plugins: true, rightbar: true, settings: true })
  assert.deepEqual([...slots], ['sessions', 'workspaces', 'plugins', 'workbench', 'settings'])
  assert.deepEqual([...slots], [...NAV_KEYS])
})

test('navSlots：工作台不可达时降为四项，且不留空位', () => {
  const slots = navSlots({ rightbar: false })
  assert.equal(slots.length, 4)
  assert.deepEqual([...slots], ['sessions', 'workspaces', 'plugins', 'settings'])
  assert.ok(!slots.includes('workbench'))
  assert.ok(slots.every(Boolean))
})

test('navSlots：未声明的能力默认渲染（只有显式 false 才摘掉）', () => {
  assert.equal(navSlots({}).length, 5)
  assert.equal(navSlots(null).length, 5)
  assert.equal(navSlots({ plugins: false, settings: false }).length, 3)
})

test('navSlots：任何组合都不产生重复键', () => {
  const combos = [
    { rightbar: false },
    { plugins: false },
    { rightbar: false, plugins: false, settings: false },
    { sessions: false, workspaces: false },
  ]
  for (const caps of combos) {
    const slots = navSlots(caps)
    assert.equal(new Set(slots).size, slots.length, JSON.stringify(caps))
  }
})

test('attachAliasOf：剥掉 addOptionKey 的前缀并小写', () => {
  assert.equal(attachAliasOf({ key: 'alias:file' }), 'file')
  assert.equal(attachAliasOf({ key: 'label:文件' }), '文件')
  assert.equal(attachAliasOf({ key: 'group:添加' }), '添加')
  assert.equal(attachAliasOf({ key: 'File' }), 'file', '裸别名保持不变')
  assert.equal(attachAliasOf({}), '')
  assert.equal(attachAliasOf(null), '')
})

test('addPanelGroups：带 alias:/label: 前缀的真实 key 也能识别为附件', () => {
  const groups = addPanelGroups([
    { key: 'alias:file', group: '添加' },
    { key: 'alias:goal', group: '添加' },
  ])
  assert.equal(groups[0].kind, 'attachment')
  assert.equal(groups[0].items.length, 1)
  assert.equal(groups[1].group, '添加')
})

test('addPanelGroups：无组标题退化为单段', () => {
  const groups = addPanelGroups([{ key: 'expert' }, { key: 'skill' }])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].group, '')
  assert.equal(groups[0].items.length, 2)
  assert.equal(groups[0].kind, 'capability')
})

test('addPanelGroups：附件项抽出后，能力组按官方顺序保序切段，组名原样', () => {
  const groups = addPanelGroups([
    { key: 'camera', group: '添加' },
    { key: 'photo', group: '添加' },
    { key: 'file', group: '添加' },
    { key: 'expert', group: '能力' },
    { key: 'skill', group: '能力' },
  ])
  // 附件段固定在最前，组名为空；后面的能力组保持官方顺序与组名
  assert.equal(groups.map((g) => g.kind).join('|'), 'attachment|capability')
  assert.equal(groups.map((g) => g.group).join('|'), '|能力')
  assert.equal(groups.map((g) => g.items.length).join(','), '3,2')
})

test('addPanelGroups：附件项与能力项混在同一官方组时也要拆开', () => {
  // 真实场景：官方把「文件」和「目标/计划/反馈」都放在「添加」组里
  const groups = addPanelGroups([
    { key: 'file', group: '添加' },
    { key: 'goal', group: '添加' },
    { key: 'plan', group: '添加' },
  ])
  assert.equal(groups.length, 2)
  assert.equal(groups[0].kind, 'attachment')
  assert.equal(groups[0].items.length, 1)
  assert.equal(groups[1].group, '添加')
  assert.equal(groups[1].items.length, 2)
})

test('addPanelGroups：官方组被附件摘空时整段不产出', () => {
  const groups = addPanelGroups([
    { key: 'camera', group: '附件' },
    { key: 'file', group: '附件' },
    { key: 'expert', group: '能力' },
  ])
  assert.equal(groups.length, 2)
  assert.equal(groups[0].group, '', '附件段不带官方组名')
  assert.equal(groups[1].group, '能力', '被摘空的「附件」组不再单独产出一段')
})

test('addPanelGroups：只有附件项时只剩一段，且顺序与官方一致', () => {
  const groups = addPanelGroups([
    { key: 'camera', group: '添加' },
    { key: 'file', group: '添加' },
  ])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].kind, 'attachment')
  assert.equal(groups[0].items.map((i) => i.key).join('|'), 'camera|file')
})

test('addPanelGroups：同名组不相邻时各成一段，不合并', () => {
  const groups = addPanelGroups([
    { key: 'a', group: 'X' },
    { key: 'b', group: 'Y' },
    { key: 'c', group: 'X' },
  ])
  assert.equal(groups.length, 3)
  assert.deepEqual(groups.map((g) => g.group).join('|'), 'X|Y|X')
})

test('addPanelGroups：空输入与脏输入都返回空数组', () => {
  assert.equal(addPanelGroups([]).length, 0)
  assert.equal(addPanelGroups(null).length, 0)
  assert.equal(addPanelGroups(undefined).length, 0)
})

test('composerState：空草稿失焦为收起，有内容或聚焦为展开', () => {
  assert.equal(composerState(0, false), 'collapsed')
  assert.equal(composerState(0, true), 'expanded')
  assert.equal(composerState(3, false), 'expanded')
  assert.equal(composerState(3, true), 'expanded')
})

test('composerState：非法草稿长度按空处理', () => {
  assert.equal(composerState(undefined, false), 'collapsed')
  assert.equal(composerState(NaN, false), 'collapsed')
  assert.equal(composerState('abc', false), 'collapsed')
})
