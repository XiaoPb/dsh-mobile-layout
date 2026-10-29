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
  sidebarClickAction,
  sessionRows,
  sessionRowId,
  pageLabel,
  swipeDirection,
  nextTabIndex,
  floatMenuLeft,
  SWIPE_MIN,
  STRINGS,
  ADD_COLS,
  ADD_MAX_ROWS,
  ADD_TINTS,
  addOptionKey,
  tintHash,
  planAddTints,
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

test('STRINGS：中英文键集合一致（防止漏翻）', () => {
  const zh = Object.keys(STRINGS.zh).sort()
  const en = Object.keys(STRINGS.en).sort()
  assert.deepEqual(arr(zh), arr(en))
})

test('pageLabel：模板按语言渲染且不残留占位符', () => {
  // 默认语言为 en（state.lang 初值），页码从 1 开始
  assert.equal(pageLabel(0, false), 'Page 1')
  assert.equal(pageLabel(1, true), 'Current page, 2')
  for (const text of [pageLabel(0, false), pageLabel(2, true)]) {
    assert.ok(!text.includes('{n}'), `残留占位符：${text}`)
    assert.ok(!/第|页/.test(text), `英文环境不应出现中文：${text}`)
  }
})

test('sidebarClickAction：只有换页的点击才收起抽屉', () => {
  // 会话 / 工作区行：换了选中项，直接收
  assert.equal(sidebarClickAction({ inside: true, navRow: true }), 'close')
  // 带文字的导航按钮（新建会话 / 插件 / 自动化任务 / SSH 工作区）
  assert.equal(sidebarClickAction({ inside: true, button: true, hasText: true }), 'close')
  // 纯图标按钮：默认不收，等视图签名
  assert.equal(sidebarClickAction({ inside: true, button: true, hasText: false }), 'signature')
})

test('sidebarClickAction：点空白 / 表单 / 展开折叠 / 菜单都不收', () => {
  // 点抽屉里的空白处（没有命中任何可交互元素）
  assert.equal(sidebarClickAction({ inside: true }), 'none')
  assert.equal(sidebarClickAction({ inside: true, button: false, navRow: false }), 'none')
  // 表单控件：正在输入或搜索
  assert.equal(sidebarClickAction({ inside: true, formControl: true, button: true, hasText: true }), 'none')
  // 有 aria-expanded / aria-haspopup / aria-controls：展开折叠、下拉菜单、行内「… 操作」
  assert.equal(sidebarClickAction({ inside: true, disclosure: true, navRow: true }), 'none')
  assert.equal(sidebarClickAction({ inside: true, disclosure: true, button: true, hasText: true }), 'none')
  // 不在侧栏内
  assert.equal(sidebarClickAction({ inside: false, navRow: true, hasText: true }), 'none')
  assert.equal(sidebarClickAction(null), 'none')
})

/**
 * 设置页横滑换页签：先判方向，再挑目标下标。
 *
 * 真机上的失误形态有两种——竖滑（想滚列表）被当成换页、首尾继续滑跳到另一头，
 * 这两条都在这组用例里钉死。
 */
test('swipeDirection：横滑给方向，短距 / 竖滑 / 斜滑都不换页', () => {
  assert.equal(SWIPE_MIN, 48)
  // 左滑（dx<0）→ 下一页签；右滑 → 上一页签
  assert.equal(swipeDirection(-120, 4), 1)
  assert.equal(swipeDirection(120, -6), -1)
  // 刚好到阈值也算
  assert.equal(swipeDirection(-SWIPE_MIN, 0), 1)
  assert.equal(swipeDirection(-SWIPE_MIN + 1, 0), 0)
  // 竖滑（滚动列表）不换页
  assert.equal(swipeDirection(-60, 90), 0)
  assert.equal(swipeDirection(0, 120), 0)
  // 斜滑：纵向超过横向 0.72 倍就不认
  assert.equal(swipeDirection(-100, 80), 0)
  assert.equal(swipeDirection(-100, 60), 1)
  // 自定义阈值
  assert.equal(swipeDirection(-30, 0, 24), 1)
  assert.equal(swipeDirection(-30, 0, 60), 0)
})

test('nextTabIndex：只钳不绕，首尾到头原地不动', () => {
  assert.equal(nextTabIndex(0, 1, 6), 1)
  assert.equal(nextTabIndex(3, 1, 6), 4)
  assert.equal(nextTabIndex(3, -1, 6), 2)
  // 末页再右滑、首页再左滑：返回 -1（不循环）
  assert.equal(nextTabIndex(5, 1, 6), -1)
  assert.equal(nextTabIndex(0, -1, 6), -1)
  // 没找到激活项（-1）时从第一项起算
  assert.equal(nextTabIndex(-1, 1, 6), 1)
  assert.equal(nextTabIndex(-1, -1, 6), -1)
  // 只有一个页签 / 非法 delta
  assert.equal(nextTabIndex(0, 1, 1), -1)
  assert.equal(nextTabIndex(0, 1, 0), -1)
  assert.equal(nextTabIndex(0, 2, 6), -1)
  assert.equal(nextTabIndex(0, 1, 'x'), -1)
})

test('STRINGS：设置页返回键有中英文文案', () => {
  assert.equal(STRINGS.zh.back, '返回')
  assert.equal(STRINGS.en.back, 'Back')
})

test('ADD_TINTS：蓝 / 橙 / 紫 / 绿四族，避开正色且前景与柔光底成对', () => {
  const groups = new Set(ADD_TINTS.map((tint) => tint.name.split('-')[0]))
  assert.deepEqual(Array.from(groups).sort(), ['amber', 'blue', 'green', 'violet'])
  for (const tint of ADD_TINTS) {
    assert.match(tint.fg, /^#[0-9A-Fa-f]{6}$/)
    assert.match(tint.soft, /^rgba\(\d+, \d+, \d+, 0\.15\)$/)
    // 正色（纯红/绿/蓝、纯白纯黑）一个都不要
    assert.ok(!['#0000FF', '#00FF00', '#FF0000', '#000000', '#FFFFFF'].includes(tint.fg.toUpperCase()))
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(tint.fg.slice(i, i + 2), 16))
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    // 饱和度 40%~75%：中低饱和，不刺眼（蓝紫橙本身偏高，留一点余量）
    const saturation = max === min ? 0 : (max - min) / max
    assert.ok(saturation >= 0.4 && saturation <= 0.75, tint.name + ' 饱和度 ' + saturation.toFixed(2))
    // 明度 38%~70%：白底看得清、深色底不糊（绿色天然偏暗，给到 0.38）
    const light = (max + min) / 2 / 255
    assert.ok(light >= 0.38 && light <= 0.70, tint.name + ' 明度 ' + light.toFixed(2))
  }
})

test('addOptionKey：优先用官方别名（命令 id），缺失时退回名称 / 分组', () => {
  // 实测结构：名称 / 别名 / 描述
  assert.equal(addOptionKey(['文件', 'file', '上传或引用本地文件'], '添加'), 'alias:file')
  assert.equal(addOptionKey(['下载日志', 'export'], '指令'), 'alias:export')
  // 大小写归一
  assert.equal(addOptionKey(['Model', 'Model'], ''), 'alias:model')
  // 没有别名（第二段是描述）时用名称
  assert.equal(addOptionKey(['  余额  '], '指令'), 'label:余额')
  // 全空退回分组，再空回 misc
  assert.equal(addOptionKey([], '指令'), 'group:指令')
  assert.equal(addOptionKey(null, ''), 'misc')
})

test('planAddTints：同类型同色、同屏不撞色、新增项自动落位', () => {
  const palette = 12
  const plan = planAddTints([{ key: 'alias:file' }, { key: 'alias:goal' }, { key: 'alias:file' }], palette)
  // 同 key 复用同一色位
  assert.equal(plan[0], plan[2])
  // 不同 key 不撞
  assert.notEqual(plan[0], plan[1])
  // 稳定：同样输入永远同样输出（不是每次随机变）
  assert.deepEqual(arr(planAddTints([{ key: 'alias:file' }, { key: 'alias:goal' }, { key: 'alias:file' }], palette)), arr(plan))
  // 11 项（当前面板实测数量）在同屏 12 色板里各占一位
  const keys = ['file', 'goal', 'plan', 'feedback', 'compact', 'permission', 'model', 'export', 'balance', 'chat', 'pet'].map((k) => ({ key: 'alias:' + k }))
  const wide = arr(planAddTints(keys, palette))
  assert.equal(new Set(wide).size, keys.length)
  // 超出色板：不崩，仍能给出合法下标
  const many = arr(planAddTints(new Array(30).fill(0).map((_, i) => ({ key: 'k' + i })), 4))
  assert.equal(many.length, 30)
  assert.ok(many.every((i) => i >= 0 && i < 4))
  // 空输入 / 非法色板
  assert.equal(arr(planAddTints([], palette)).length, 0)
  assert.equal(arr(planAddTints(null, palette)).length, 0)
  assert.equal(planAddTints([{ key: 'a' }], 0)[0], 0)
})

test('tintHash：同键恒等、异键大概率不同、对空值稳定', () => {
  assert.equal(tintHash('alias:file'), tintHash('alias:file'))
  assert.notEqual(tintHash('alias:file'), tintHash('alias:model'))
  assert.equal(tintHash(''), tintHash(null))
  assert.ok(tintHash('alias:file') >= 0)
})

/** floatMenuLeft 返回对象出自 vm 沙箱，原型不同，逐字段断言。 */
function fm(value) {
  return [value.left, value.shift]
}

test('floatMenuLeft：侧栏键贴标题左缘，标题不再平移', () => {
  // 标题左缘 52 及以上：键贴到 rawLeft-44（36px 键 + 8px 间距），标题位移 0
  assert.deepEqual(fm(floatMenuLeft(52)), [8, 0])
  assert.deepEqual(fm(floatMenuLeft(120)), [76, 0])
  assert.deepEqual(fm(floatMenuLeft(400)), [356, 0])
  // 标题太靠左（<52）放不下：退回旧兜底，键固定 8px、标题右移让位
  assert.deepEqual(fm(floatMenuLeft(16)), [8, 36])
  assert.deepEqual(fm(floatMenuLeft(0)), [8, 48])
  // 右移上限 48px（不无限推移）
  assert.deepEqual(fm(floatMenuLeft(-10)), [8, 48])
  // 非法输入退回兜底
  assert.deepEqual(fm(floatMenuLeft(NaN)), [8, 48])
  assert.deepEqual(fm(floatMenuLeft(undefined)), [8, 48])
})
