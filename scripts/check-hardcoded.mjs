#!/usr/bin/env node
/**
 * 布局几何硬编码守卫。
 *
 * 背景：不同机型的视口宽高差异很大（360-480+ CSS px 宽、600-900+ 高），
 * 直接写死 px 的间距 / 尺寸会在某些机型上溢出、贴边或留白失衡。经验做法是
 * 用 CSS 变量 + clamp()/vh/vw/env() 自适应。本脚本扫描 lib/client.js 里
 * 注入的 CSS，找出「布局属性 + 纯 px 硬编码」的行，与 baseline
 * （scripts/hardcoded-baseline.json）比对：
 *
 *   - 出现 baseline 之外的新违规 → 退出码 1，CI 失败；
 *   - baseline 里已经消失的条目 → 仅提示可以收紧，不失败。
 *
 * 用法：
 *   node scripts/check-hardcoded.mjs           # 校验（npm run hardcode:check）
 *   node scripts/check-hardcoded.mjs --update  # 重新生成 baseline（npm run hardcode:baseline）
 *
 * 两种豁免方式（按需使用，不要滥用）：
 *   1. 行内值本身已经是自适应表达式（含 var( / clamp( / env( / min( / max(
 *      / % 单位），不视为违规；
 *   2. 该行上方紧邻的注释行含 `HARDCODE-OK: 说明`，视为有意写死。
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'lib', 'client.js')
const baselinePath = path.join(root, 'scripts', 'hardcoded-baseline.json')

/** 参与检查的布局属性：与屏幕尺寸强相关，写死 px 最容易翻车的那些。 */
const LAYOUT_PROPS =
  'width|min-width|max-width|height|min-height|max-height|margin(?:-left|-right|-top|-bottom)?|' +
  'padding(?:-left|-right|-top|-bottom)?|top|right|bottom|left|inset|gap|row-gap|column-gap|border-radius'

/** 值里出现这些 token 视为已自适应（变量 / 相对单位 / 环境值）。 */
const ADAPTIVE = /var\(|clamp\(|env\(|\bmin\(|\bmax\(|\d+(\.\d+)?%/

/** 视觉细线：不随机型出问题的小值，直接豁免。 */
const HAIRLINE = /^(0(?:\.5)?px|1px|-[01](?:\.5)?px)$/

const source = fs.readFileSync(sourcePath, 'utf8')
const rawLines = source.split(/\r?\n/)

const violations = []
let inBlockComment = false

for (let i = 0; i < rawLines.length; i += 1) {
  let line = rawLines[i]
  const lineNo = i + 1

  // 跳过跨行块注释（CSS 说明大段是块注释）。
  if (inBlockComment) {
    if (line.includes('*/')) inBlockComment = false
    continue
  }
  const blockStart = line.indexOf('/*')
  if (blockStart >= 0) {
    const blockEnd = line.indexOf('*/', blockStart)
    if (blockEnd < 0) {
      inBlockComment = true
      line = line.slice(0, blockStart)
    } else {
      line = line.slice(0, blockStart) + line.slice(blockEnd + 2)
    }
  }

  // 只关心 CSS 字符串行：以 ' 开头、以 ' 或 ', 结尾。
  const m = line.match(/^\s*'(.*)',?\s*$/)
  if (!m) continue
  const css = m[1]
  if (!css.includes(':')) continue

  // 行上方紧邻注释带 HARDCODE-OK: 标记 → 有意写死，豁免。
  const prev = (rawLines[i - 1] || '')
  if (/HARDCODE-OK:/.test(prev)) continue

  for (const rule of css.split(';')) {
    const prop = rule.trim().match(new RegExp('^(' + LAYOUT_PROPS + '):(.+)$'))
    if (!prop) continue
    const value = prop[2].trim()
    if (ADAPTIVE.test(value)) continue

    // 值里所有 px 数值都必须是细线级；否则算硬编码。
    const pxs = value.match(/-?\d+(?:\.\d+)?px/g) || []
    const bad = pxs.some((px) => !HAIRLINE.test(px))
    if (!bad) continue

    violations.push({
      line: lineNo,
      prop: prop[1],
      value,
      text: css.trim().slice(0, 160),
      hash: crypto.createHash('sha1').update(prop[1] + ':' + value + ':' + css.trim()).digest('hex').slice(0, 12),
    })
  }
}

const update = process.argv.includes('--update')
if (update) {
  const payload = {
    _comment: '布局几何硬编码 baseline（见 scripts/check-hardcoded.mjs）。收紧方式：修掉 client.js 里的违规后运行 npm run hardcode:baseline。',
    entries: violations.map((v) => v.hash),
  }
  fs.writeFileSync(baselinePath, JSON.stringify(payload, null, 2) + '\n')
  console.log('hardcoded-baseline.json updated:', payload.entries.length, 'entries')
  process.exit(0)
}

let baseline = { entries: [] }
if (fs.existsSync(baselinePath)) {
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  } catch (error) {
    console.error('hardcoded-baseline.json 解析失败：', error.message)
    process.exit(1)
  }
}
const known = new Set(baseline.entries || [])

const fresh = violations.filter((v) => !known.has(v.hash))
if (fresh.length > 0) {
  console.error('发现新的布局几何硬编码（' + fresh.length + ' 处）。请改用 CSS 变量 / clamp() / vh / vw / env() 自适应，')
  console.error('或在该行上方的注释里写 HARDCODE-OK: 理由 豁免。新增违规：')
  for (const v of fresh) {
    console.error('  lib/client.js:' + v.line + '  ' + v.prop + ': ' + v.value)
    console.error('    ' + v.text)
  }
  process.exit(1)
}

const stale = (baseline.entries || []).filter((hash) => !violations.some((v) => v.hash === hash))
console.log('hardcode check: PASS (' + violations.length + ' known, ' + fresh.length + ' new' + (stale.length ? ', ' + stale.length + ' stale — 可运行 npm run hardcode:baseline 收紧' : '') + ')')
