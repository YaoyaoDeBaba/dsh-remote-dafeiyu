/**
 * avatar-manifest.test —— 素材契约（拆包前先把这层钉死）
 *
 * 为什么单独测它：形象功能要拆成独立插件，而**手机协议的 avatar 素材是主体在读**。
 * 拆完之后这里和形象包里会各存一份同名实现（跨包不能 import），
 * 所以这层的行为必须**先有判据**，否则两边各改一半没人发现。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { avatarDir, loadAvatarManifest, sanitizeAvatarState } from '../src/platform/avatar-manifest.js'

const GOOD = {
  id: 'idle',
  label: '待机',
  cols: 8,
  rows: 6,
  frames: 48,
  cellWidth: 287,
  cellHeight: 386,
  file: 'idle.webp',
  anchorX: 0.4164,
  anchorY: 0.955,
}

test('素材目录契约：<dshHome>/storages/dsh-remote-dafeiyu/avatar', () => {
  // 路径刻意沿用旧包名：现有素材、序列帧产出、手机协议都指着它，改名只会制造迁移成本。
  const dir = avatarDir('C:\\home')
  assert.equal(dir, path.join('C:\\home', 'storages', 'dsh-remote-dafeiyu', 'avatar'))
})

test('合法 state 原样通过（含锚点）', () => {
  const state = sanitizeAvatarState(GOOD)
  assert.ok(state)
  assert.equal(state!.id, 'idle')
  assert.equal(state!.cellWidth, 287)
  assert.equal(state!.anchorX, 0.4164)
  assert.equal(state!.anchorY, 0.955)
})

test('缺 label 用 id 顶上；anchorY 按 y-from-top 存（0=格子顶）', () => {
  const state = sanitizeAvatarState({ ...GOOD, label: undefined })
  assert.equal(state!.label, 'idle')
  // 0.955 表示"离格子顶部 95.5%"，也就是靠近脚底——这是本模块的口径，不许在这层翻成 from-bottom
  assert.equal(state!.anchorY, 0.955)
})

test('形状不对就丢：缺 id / cols / rows / frames / file，或 file 带路径', () => {
  assert.equal(sanitizeAvatarState({ ...GOOD, id: undefined }), undefined)
  assert.equal(sanitizeAvatarState({ ...GOOD, cols: 0 }), undefined)
  assert.equal(sanitizeAvatarState({ ...GOOD, rows: -1 }), undefined)
  assert.equal(sanitizeAvatarState({ ...GOOD, frames: 0 }), undefined)
  assert.equal(sanitizeAvatarState({ ...GOOD, file: '' }), undefined)
  // 目录穿越：file 只能是文件名
  assert.equal(sanitizeAvatarState({ ...GOOD, file: '../evil.webp' }), undefined)
})

test('锚点越界就丢锚点，但 state 本身保留（让端上走兜底）', () => {
  const state = sanitizeAvatarState({ ...GOOD, anchorX: 3.996, anchorY: -0.2 })
  assert.ok(state)
  assert.equal(state!.anchorX, undefined)
  assert.equal(state!.anchorY, undefined)
})

test('读盘：正常 manifest 能读出来；坏 JSON / 缺文件 / states 全非法都返回 undefined', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'avatar-manifest-'))
  try {
    const dir = avatarDir(home)
    mkdirSync(dir, { recursive: true })

    // 缺文件
    assert.equal(loadAvatarManifest(dir), undefined)

    // 坏 JSON
    writeFileSync(path.join(dir, 'manifest.json'), '{ not json', 'utf8')
    assert.equal(loadAvatarManifest(dir), undefined)

    // states 全非法 → 当没有
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: 2, states: [{ id: 'x' }] }), 'utf8')
    assert.equal(loadAvatarManifest(dir), undefined)

    // 正常
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: 2, states: [GOOD] }), 'utf8')
    const manifest = loadAvatarManifest(dir)
    assert.equal(manifest?.version, 2)
    assert.equal(manifest?.states.length, 1)
    assert.equal(manifest?.states[0]?.id, 'idle')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('version 缺失时回落 1（端上不按 undefined 分支）', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'avatar-manifest2-'))
  try {
    const dir = avatarDir(home)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ states: [GOOD] }), 'utf8')
    assert.equal(loadAvatarManifest(dir)?.version, 1)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
