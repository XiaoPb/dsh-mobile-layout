'use strict'

/**
 * 0.6 加号面板分页 / 设置页判据的单元测试。
 *
 * 只测纯函数：分页切分、列优先 order 映射、行数、设置弹窗判据。DOM 打标与
 * 样式属于真机验收范围（见 docs/mobile-ux-plan-0.6.md 的验证矩阵）。
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
  rowsFor,
  slotOf,
  planAddPages,
  isSettingsDialog,
  workspaceTitleMap,
  workspaceNameFor,
  workspaceLabelFor,
  groupSessionsByWorkspace,
  formatRelativeTime,
  normalizeWorkspacePath,
  sessionRows,
  sessionRowId,
  ADD_COLS,
  ADD_MAX_ROWS,
} = loadClient().__test

/** vm 沙箱里造出来的数组原型不同，比较前先转成本域的普通数组。 */
function arr(value) {
  return Array.from(value || [])
}

/** 造 n 个选项，groups 为每个选项的分组名。 */
function makeOptions(groups) {
  return groups.map((group) => ({ group }))
}

test('rowsFor：不超过一列宽度用单行，否则两行', () => {
  assert.equal(rowsFor(0, 4), 1)
  assert.equal(rowsFor(1, 4), 1)
  assert.equal(rowsFor(4, 4), 1)
  assert.equal(rowsFor(5, 4), 2)
  assert.equal(rowsFor(11, 4), 2)
  assert.equal(rowsFor(24, 4), ADD_MAX_ROWS)
  assert.equal(rowsFor(11, ADD_COLS), 2)
})

test('slotOf：两行四列按行优先铺满，第一页落在第 1~4 列', () => {
  const slots = [0, 1, 2, 3, 4, 5, 6, 7].map((j) => slotOf(j, 0, 2, 4))
  assert.deepEqual(arr(slots.map((s2) => s2.column)), [1, 2, 3, 4, 1, 2, 3, 4])
  assert.deepEqual(arr(slots.map((s2) => s2.row)), [1, 1, 1, 1, 2, 2, 2, 2])
})

test('slotOf：第二页整体右移 4 列，页边界不重叠', () => {
  const slots = [0, 1, 2, 3, 4].map((j) => slotOf(j, 1, 2, 4))
  assert.deepEqual(arr(slots.map((s2) => s2.column)), [5, 6, 7, 8, 5])
  assert.deepEqual(arr(slots.map((s2) => s2.row)), [1, 1, 1, 1, 2])
})

test('slotOf：单行时只有第 1 行，跨页仍连续', () => {
  assert.equal(slotOf(0, 0, 1, 4).row, 1)
  assert.equal(slotOf(3, 0, 1, 4).column, 4)
  assert.equal(slotOf(0, 1, 1, 4).column, 5)
})

test('slotOf：非法输入退化但不产生 NaN', () => {
  const slot = slotOf(undefined, undefined, 0, 0)
  assert.equal(Number.isNaN(slot.column), false)
  assert.equal(Number.isNaN(slot.row), false)
  assert.equal(slot.row >= 1, true)
})

test('planAddPages：0 项没有页', () => {
  assert.deepEqual(arr(planAddPages([], 8)), [])
  assert.deepEqual(arr(planAddPages(null, 8)), [])
})

test('planAddPages：1 / 4 / 8 项都只有一页', () => {
  for (const n of [1, 4, 8]) {
    const pages = planAddPages(makeOptions(new Array(n).fill('')), 8)
    assert.equal(pages.length, 1, `${n} 项应为 1 页`)
    assert.equal(pages[0].items.length, n)
  }
})

test('planAddPages：9 项 → 8 + 1 两页', () => {
  const pages = planAddPages(makeOptions(new Array(9).fill('')), 8)
  assert.equal(pages.length, 2)
  assert.deepEqual(arr(pages.map((p) => p.items.length)), [8, 1])
  assert.deepEqual(arr(pages[0].items), [0, 1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(arr(pages[1].items), [8])
})

test('planAddPages：11 项 → 8 + 3，首页铺满不留白', () => {
  const pages = planAddPages(makeOptions(new Array(11).fill('添加')), 8)
  assert.deepEqual(arr(pages.map((p) => p.items.length)), [8, 3])
})

test('planAddPages：16 / 17 项边界', () => {
  const p16 = planAddPages(makeOptions(new Array(16).fill('')), 8)
  assert.deepEqual(arr(p16.map((p) => p.items.length)), [8, 8])
  const p17 = planAddPages(makeOptions(new Array(17).fill('')), 8)
  assert.deepEqual(arr(p17.map((p) => p.items.length)), [8, 8, 1])
})

test('planAddPages：24 项 → 3 页全覆盖、无遗漏', () => {
  const pages = planAddPages(makeOptions(new Array(24).fill('')), 8)
  assert.equal(pages.length, 3)
  const flat = arr(pages.flatMap((p) => p.items))
  assert.equal(flat.length, 24)
  assert.deepEqual(flat, Array.from({ length: 24 }, (_, i) => i))
  assert.deepEqual(arr(pages.map((p) => p.parts)), [3, 3, 3])
})

test('planAddPages：单行时每页 4 项', () => {
  const pages = planAddPages(makeOptions(new Array(6).fill('')), 4)
  assert.deepEqual(arr(pages.map((p) => p.items.length)), [4, 2])
})

test('isSettingsDialog：必须是 aria-modal dialog 且导航按钮 ≥3', () => {
  assert.equal(isSettingsDialog({ role: 'dialog', ariaModal: 'true', navButtons: 6 }), true)
  assert.equal(isSettingsDialog({ role: 'dialog', ariaModal: 'true', navButtons: 3 }), true)
  // 只有关闭按钮的普通弹窗不算
  assert.equal(isSettingsDialog({ role: 'dialog', ariaModal: 'true', navButtons: 2 }), false)
  // 没有 nav 的 dialog（用 navButtons=0 表示）
  assert.equal(isSettingsDialog({ role: 'dialog', ariaModal: 'true', navButtons: 0 }), false)
  // 非 modal
  assert.equal(isSettingsDialog({ role: 'dialog', ariaModal: 'false', navButtons: 6 }), false)
  // 不是 dialog（主界面误判防护）
  assert.equal(isSettingsDialog({ role: null, ariaModal: null, navButtons: 6 }), false)
  assert.equal(isSettingsDialog(null), false)
})

test('normalizeWorkspacePath：统一分隔符并去掉尾斜杠', () => {
  assert.equal(normalizeWorkspacePath('C:\\a\\b\\'), 'C:/a/b')
  assert.equal(normalizeWorkspacePath('/a/b///'), '/a/b')
  assert.equal(normalizeWorkspacePath('  '), '')
  assert.equal(normalizeWorkspacePath(null), '')
})

test('workspaceTitleMap：按 path 建表，title 缺失退回目录名', () => {
  const map = {
    ...workspaceTitleMap({
      items: [
        { path: '/data/files/workspaces', title: 'workspaces' },
        { path: '/data/proj/dsh-mobile-layout/', title: '' },
        { path: '', title: '空路径忽略' },
        null,
      ],
    }),
  }
  assert.deepEqual(map, {
    '/data/files/workspaces': 'workspaces',
    '/data/proj/dsh-mobile-layout': 'dsh-mobile-layout',
  })
})

test('workspaceTitleMap：空快照得到空表', () => {
  assert.deepEqual({ ...workspaceTitleMap(null) }, {})
  assert.deepEqual({ ...workspaceTitleMap({ items: [] }) }, {})
})

test('workspaceNameFor：尾斜杠 / 反斜杠都能对上，对不上返回空串', () => {
  const map = { '/data/files/workspaces': 'workspaces' }
  assert.equal(workspaceNameFor('/data/files/workspaces', map), 'workspaces')
  assert.equal(workspaceNameFor('/data/files/workspaces/', map), 'workspaces')
  assert.equal(workspaceNameFor('/data/other', map), '')
  assert.equal(workspaceNameFor(null, map), '')
  assert.equal(workspaceNameFor('/data/files/workspaces', null), '')
})

test('groupSessionsByWorkspace：组序跟随首行出现顺序、组内顺序不变', () => {
  const map = { '/w/a': 'alpha', '/w/b': 'beta' }
  const rows = [
    { id: '1', cwd: '/w/b' },
    { id: '2', cwd: '/w/a' },
    { id: '3', cwd: '/w/b' },
    { id: '4', cwd: '/w/a' },
  ]
  const plan = groupSessionsByWorkspace(rows, map)
  assert.equal(plan.grouped, true)
  assert.equal(plan.single, '')
  assert.deepEqual(
    arr(plan.groups.map((group) => group.name)),
    ['beta', 'alpha'],
  )
  assert.deepEqual(arr(plan.groups[0].rows.map((row) => row.id)), ['1', '3'])
  assert.deepEqual(arr(plan.groups[1].rows.map((row) => row.id)), ['2', '4'])
})

test('groupSessionsByWorkspace：单工作区不分组，空名单独成组', () => {
  const single = groupSessionsByWorkspace([{ id: '1', cwd: '/w/a' }, { id: '2', cwd: '/w/a' }], {
    '/w/a': 'alpha',
  })
  assert.equal(single.grouped, false)
  assert.equal(single.single, 'alpha')
  assert.equal(single.groups.length, 1)

  const mixed = groupSessionsByWorkspace([{ id: '1' }, { id: '2', cwd: '/w/a' }], { '/w/a': 'alpha' })
  assert.equal(mixed.grouped, true)
  assert.deepEqual(arr(mixed.groups.map((group) => group.name)), ['', 'alpha'])
  assert.equal(mixed.groups[0].rows[0].id, '1')

  const empty = groupSessionsByWorkspace([], {})
  assert.equal(empty.grouped, false)
  assert.equal(empty.single, '')
  assert.equal(empty.groups.length, 0)
})

test('formatRelativeTime：分钟 / 小时 / 昨天 / 天数 / 日期逐级收敛', () => {
  const now = new Date(2026, 9, 29, 18, 0, 0).getTime()
  const at = (ms) => now - ms
  const MIN = 60 * 1000
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR

  assert.equal(formatRelativeTime(at(30 * 1000), now, 'zh'), '刚刚')
  assert.equal(formatRelativeTime(at(30 * 1000), now, 'en'), 'now')
  assert.equal(formatRelativeTime(at(5 * MIN), now, 'zh'), '5 分钟')
  assert.equal(formatRelativeTime(at(5 * MIN), now, 'en'), '5m')
  assert.equal(formatRelativeTime(at(3 * HOUR), now, 'zh'), '3 小时')
  assert.equal(formatRelativeTime(at(3 * HOUR), now, 'en'), '3h')
  assert.equal(formatRelativeTime(at(1 * DAY), now, 'zh'), '昨天')
  assert.equal(formatRelativeTime(at(1 * DAY + 3 * HOUR), now, 'en'), 'Yesterday')
  assert.equal(formatRelativeTime(at(3 * DAY), now, 'zh'), '3 天')
  assert.equal(formatRelativeTime(at(3 * DAY), now, 'en'), '3d')
  // 同年只给月-日，跨年补年份（当前会话时间设在本地时区 10 月）。
  assert.equal(formatRelativeTime(new Date(2026, 9, 21, 9, 0, 0).getTime(), now, 'zh'), '10-21')
  assert.equal(formatRelativeTime(new Date(2026, 9, 21, 9, 0, 0).getTime(), now, 'en'), '10/21')
  assert.equal(formatRelativeTime(new Date(2024, 4, 3, 9, 0, 0).getTime(), now, 'zh'), '2024-05-03')
  assert.equal(formatRelativeTime(0, now, 'zh'), '')
  assert.equal(formatRelativeTime(at(5 * MIN), 0, 'zh'), '')
})

test('workspaceLabelFor：查不到表时退回 cwd 目录名', () => {
  const map = { '/data/files/workspaces': '我的项目' }
  assert.equal(workspaceLabelFor('/data/files/workspaces', map), '我的项目')
  assert.equal(workspaceLabelFor('/data/files/old-ws/', map), 'old-ws')
  assert.equal(workspaceLabelFor('C://proj//demo', {}), 'demo')
  assert.equal(workspaceLabelFor('', map), '')
  assert.equal(workspaceLabelFor(null, map), '')
})

/**
 * 回归：工作区目录名撞上 Object.prototype 的键名时，分组字典不能命中
 * 原型链（曾用 `{}` 当字典，`seen['constructor']` 取到函数，push 直接抛
 * TypeError；该函数在会话面板渲染期执行，等于整个面板崩掉）。
 */
test('groupSessionsByWorkspace：目录名叫 constructor / toString 也不炸', () => {
  for (const name of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
    const rows = [
      { id: '1', cwd: '/w/' + name },
      { id: '2', cwd: '/w/a' },
      { id: '3', cwd: '/w/' + name },
    ]
    const plan = groupSessionsByWorkspace(rows, { '/w/a': 'alpha' })
    assert.equal(plan.grouped, true, `${name} 应分成两组`)
    assert.deepEqual(arr(plan.groups.map((group) => group.name)), [name, 'alpha'])
    assert.deepEqual(arr(plan.groups[0].rows.map((row) => row.id)), ['1', '3'])
  }
})

test('workspaceTitleMap：标题为原型键名不影响其它键的取值', () => {
  const map = workspaceTitleMap({
    items: [
      { path: '/w/a', title: '__proto__' },
      { path: '/w/b', title: 'constructor' },
    ],
  })
  assert.equal(workspaceNameFor('/w/a', map), '__proto__')
  assert.equal(workspaceNameFor('/w/b', map), 'constructor')
  assert.equal(workspaceNameFor('/w/c', map), '')
})

test('sessionRowId：id 优先，只有 sessionId 也能取到', () => {
  assert.equal(sessionRowId({ id: 'a', sessionId: 'b' }), 'a')
  assert.equal(sessionRowId({ sessionId: 'b' }), 'b')
  assert.equal(sessionRowId({}), null)
  assert.equal(sessionRowId(null), null)
})

/**
 * 回归：官方快照的行可能只有 sessionId；面板渲染只认 row.id，不归一化会
 * 出现「当前会话不标记 + 点击打开 undefined + React key 为空」。
 */
test('sessionRows：只有 sessionId 的行也归一化出 id，当前会话置顶', () => {
  const { rows, currentId } = sessionRows({
    byId: {
      a: { sessionId: 'a', title: 'A', updatedAt: 3 },
      b: { id: 'b', title: 'B', updatedAt: 2, retainedBy: { mainView: 1 } },
      c: { sessionId: 'c', blank: true, updatedAt: 5 },
    },
  })
  assert.equal(currentId, 'b')
  assert.deepEqual(arr(rows.map((row) => row.id)), ['b', 'a'])
  // 原对象上的字段不能丢
  assert.equal(rows[1].sessionId, 'a')
  assert.equal(rows[1].title, 'A')
})

test('sessionRows：current 会话即使 blank 也保留，其余 blank 过滤', () => {
  const { rows } = sessionRows({
    items: [
      { id: 'x', blank: true, retainedBy: { mainView: 1 }, updatedAt: 1 },
      { id: 'y', blank: true, updatedAt: 2 },
      { id: 'z', updatedAt: 4 },
    ],
  })
  assert.deepEqual(arr(rows.map((row) => row.id)), ['x', 'z'])
})

test('sessionRows：输入非法时返回空表，不改动调用方数组', () => {
  assert.deepEqual(arr(sessionRows(null).rows), [])
  assert.equal(sessionRows(null).currentId, null)
  const source = [{ id: '1', updatedAt: 1 }]
  const snapshot = { items: source }
  sessionRows(snapshot)
  assert.equal(source.length, 1)
})
