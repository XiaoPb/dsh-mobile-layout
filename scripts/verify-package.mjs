#!/usr/bin/env node
'use strict'

/**
 * 包清单 / 产物契约自检（离线，CI 与 npm pack 共用）。
 *
 *   node scripts/verify-package.mjs
 *
 * 校验项：
 *   1. package.json 关键字段（名字、SemVer、入口与 exports 指向真实文件）
 *   2. files 白名单只发布 lib + cordis.patch.yml（不夹带 test / docs / scripts）
 *   3. dsh 元数据：bundle.patch / client.platform / client.inject
 *   4. cordis.patch.yml：insert 行 id 与插件名指向本包
 *   5. 客户端 bundle 契约：__ModuleLoader__ 包装 + 官方槽位与自有锚点标记
 *      + bundle 内 VERSION 常量与 package.json 版本一致
 *   6. 宿主入口可 require 且导出 { name, inject, apply }
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const exists = (rel) => fs.existsSync(path.join(root, rel))

let failures = 0
const ok = (msg) => console.log(`  ok   ${msg}`)
const fail = (msg) => { failures += 1; console.error(`  FAIL ${msg}`) }
const check = (cond, msg) => (cond ? ok(msg) : fail(msg))

const pkg = JSON.parse(read('package.json'))

console.log(`verify-package: ${pkg.name}@${pkg.version}`)

// ---- 1. 清单字段 ----
check(/^@[a-z0-9-]+\/[a-z0-9-]+$/.test(pkg.name || ''), 'name 是 scoped 包名')
check(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(pkg.version || ''), 'version 是 SemVer')
check(pkg.main === 'lib/index.js', 'main 指向 lib/index.js')
check(exists(pkg.main), 'main 文件存在')
for (const [key, target] of Object.entries(pkg.exports || {})) {
  if (typeof target === 'string' && target.startsWith('./') && target !== './package.json') {
    check(exists(target), `exports["${key}"] 指向真实文件（${target}）`)
  }
}

// ---- 2. 发布白名单 ----
const files = pkg.files || []
check(Array.isArray(files) && files.length > 0, 'package.json 声明了 files 白名单')
check(files.includes('lib'), 'files 含 lib')
check(files.includes('cordis.patch.yml'), 'files 含 cordis.patch.yml')
const leaked = files.filter((f) => /^(test|tools|docs|scripts|\.github)/.test(f))
check(leaked.length === 0, `files 未夹带开发目录（${leaked.join(', ') || '无'}）`)
for (const entry of files) {
  check(exists(entry), `files 条目存在（${entry}）`)
}

// ---- 3. dsh 元数据 ----
const dsh = pkg.dsh || {}
check(dsh.bundle && dsh.bundle.patch === './cordis.patch.yml', 'dsh.bundle.patch = ./cordis.patch.yml')
check(dsh.client && dsh.client.platform === 'web', 'dsh.client.platform = web')
const inject = (dsh.client && dsh.client.inject) || []
check(inject.includes('@deepseek-ai/dsh-client-runtime'), 'client.inject 含官方 runtime')
check(inject.includes('@deepseek-ai/dsh-client-ui-layout'), 'client.inject 含官方 layout UI')

// ---- 4. cordis.patch.yml ----
const patchText = read('cordis.patch.yml')
check(/^-\s*insert:/m.test(patchText), 'patch 含 insert 层')
check(/id:\s*mobile-layout/.test(patchText), 'roster 行 id = mobile-layout')
const quoted = `'${pkg.name}'`
check(patchText.includes(quoted), `roster 行 name 指向本包（${quoted}）`)

// ---- 5. 客户端 bundle 契约 ----
const client = read('lib/client.js')
check(/__ModuleLoader__\s*\.\s*load\(/.test(client), '客户端产物走 __ModuleLoader__.load 包装')
for (const marker of ['shell.overlay', 'shell.bottom', 'data-dshm-frame', 'bindDrawerGesture']) {
  check(client.includes(marker), `bundle 含标记 ${marker}`)
}
// 抽屉入口只有左缘手势（0.1.15 起移除 ☰ / 浮动侧栏键，避免遮挡子页面
// 返回键）：这些旧入口标记必须不存在，防止回潮。
for (const gone of ['dshm-menu-btn', 'dshm-float-menu', 'conversation.header.leading']) {
  check(!client.includes(gone), `bundle 不再含旧按键标记 ${gone}`)
}
check(!/^\s*import\s+/m.test(client), 'bundle 不用 ESM import（走 loader 注入的 require）')
check(/const\s+react\s*=\s*require\(['"]react['"]\)/.test(client), 'react 经 factory 注入的 require 解析')

// bundle 里的 VERSION 会出现在 dshm:mode 事件里，必须与包版本一致；
// 两处靠人肉同步容易漏。
const versionInBundle = /const\s+VERSION\s*=\s*['"]([^'"]+)['"]/.exec(client)
check(Boolean(versionInBundle), 'bundle 声明了 VERSION 常量')
if (versionInBundle) {
  check(
    versionInBundle[1] === pkg.version,
    `bundle VERSION 与 package.json 一致（${versionInBundle[1]} vs ${pkg.version}）`,
  )
}

// ---- 6. 宿主入口 ----
const host = require(path.join(root, 'lib', 'index.js'))
check(host.name === 'mobile-layout', '宿主入口 name = mobile-layout')
check(typeof host.apply === 'function', '宿主入口导出 apply')
check(Array.isArray(host.inject), '宿主入口导出 inject 数组')

if (failures > 0) {
  console.error(`verify-package: ${failures} 项未通过`)
  process.exit(1)
}
console.log('verify-package: ALL PASS')
