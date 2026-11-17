/**
 * compat.test —— 宿主版本兼容判据（2026-11-17）。
 *
 * 事故背景：宿主跑到 0.2.2-rc.3，插件只验证到 0.2.1-rc.5，中间崩过一次。
 * 这套判据管两件事：①安装时拦（宿主连下限都不到就别装）；②登记时挡（不兼容的房间不建 tab）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  buildCompatReport,
  compareVersions,
  detectHostVersion,
  entryOf,
  parseVersion,
  verdictFor,
} from '../src/compat/index.js'
import { nodeFs, applyAction } from '../src/extensions/service.js'
import { findExtension } from '../src/extensions/registry.js'

test('版本比较：预发布低于同号正式版，rc 序号按数字比', () => {
  assert.equal(compareVersions('0.2.1-rc.5', '0.2.2-rc.3'), -1, 'rc.5 的次版本更低')
  assert.equal(compareVersions('0.2.2-rc.3', '0.2.2'), -1, '预发布低于正式版')
  assert.equal(compareVersions('0.2.2-rc.3', '0.2.2-rc.3'), 0)
  assert.equal(compareVersions('0.2.2-rc.10', '0.2.2-rc.9'), 1, '数字按数值比，不是字符串')
  assert.equal(compareVersions('v0.2.2', '0.2.2'), 0, 'v 前缀要认')
  assert.equal(parseVersion('silly'), undefined)
})

test('判级：低于下限 block，高于验证上限 warn，之间 ok，读不到版本 warn', () => {
  const entry = entryOf('dsh-avatar-dafeiyu')
  assert.ok(entry !== undefined, '兼容表里必须有形象这条')
  assert.equal(verdictFor('0.2.0', entry).level, 'block', '宿主太老：明确不兼容')
  assert.equal(verdictFor('0.2.2-rc.3', entry).level, 'ok')
  assert.equal(verdictFor('0.3.0', entry).level, 'warn', '比验证过的更新：能跑但没验过')
  assert.equal(verdictFor(undefined, entry).level, 'warn', '读不到版本不许当成没问题')
  assert.equal(verdictFor('0.2.2-rc.3', undefined).level, 'warn', '表里没有的包按未验证')
  assert.match(verdictFor('0.2.0', entry).message, /要求宿主/)
})

test('宿主版本从 profile 里装好的宿主包读；读不到返回 undefined（不当 0.0.0）', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-compat-'))
  try {
    const scope = path.join(dir, 'node_modules', '@deepseek-ai', 'dsh-app-boot')
    mkdirSync(scope, { recursive: true })
    writeFileSync(path.join(scope, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-app-boot', version: '0.2.2-rc.3' }))
    assert.equal(detectHostVersion(dir, nodeFs), '0.2.2-rc.3')
    const empty = mkdtempSync(path.join(tmpdir(), 'drc-compat-empty-'))
    try {
      assert.equal(detectHostVersion(empty, nodeFs), undefined)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('报告：宿主太老时把形象/识图/序列帧的房间列进 blockedRooms', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-compat-report-'))
  try {
    const scope = path.join(dir, 'node_modules', '@deepseek-ai', 'dsh-app-boot')
    mkdirSync(scope, { recursive: true })
    writeFileSync(path.join(scope, 'package.json'), JSON.stringify({ version: '0.2.0' }))
    const report = buildCompatReport(dir, nodeFs)
    assert.equal(report.host, '0.2.0')
    assert.deepEqual(report.blockedRooms.sort(), ['avatar', 'sprite', 'vision', 'xyq'])
    assert.equal(report.warnRooms.length, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('安装闸：宿主低于下限时拒绝安装（不写 profile、不跑 pnpm）', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-compat-gate-'))
  try {
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'dsh-profile-desktop', private: true, dependencies: {}, dsh: { profile: { bundles: [] } } }, null, 2),
    )
    const scope = path.join(dir, 'node_modules', '@deepseek-ai', 'dsh-app-boot')
    mkdirSync(scope, { recursive: true })
    writeFileSync(path.join(scope, 'package.json'), JSON.stringify({ version: '0.2.0' }))
    const spec = findExtension('avatar')
    assert.ok(spec !== undefined)
    let pnpmRan = 0
    const result = await applyAction(dir, spec!, 'install', {
      runPnpm: async () => {
        pnpmRan += 1
        return { ok: true, message: '' }
      },
    })
    assert.equal(result.ok, false, '宿主太老要直接拒绝')
    assert.equal(pnpmRan, 0, '连 pnpm 都不许跑')
    assert.match(String(result.message), /要求宿主/)
    const after = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as { dependencies?: unknown }
    assert.deepEqual(after.dependencies, {}, 'profile 不许被改')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
