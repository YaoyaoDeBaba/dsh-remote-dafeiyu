/**
 * avatar.test — 形象素材 manifest 的解析与安全边界。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadAvatarManifest } from '../src/avatar/routes.js'

function withManifest(states: unknown): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-avatar-'))
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: 1, states }), 'utf8')
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('avatar manifest：正常解析出动作列表', () => {
  const { dir, cleanup } = withManifest([
    { id: 'idle', label: '待机', cols: 8, rows: 6, frames: 48, cellWidth: 354, cellHeight: 480, file: 'idle.webp' },
  ])
  try {
    const manifest = loadAvatarManifest(dir)
    assert.ok(manifest)
    assert.equal(manifest!.states.length, 1)
    assert.equal(manifest!.states[0]!.label, '待机')
    assert.equal(manifest!.states[0]!.frames, 48)
  } finally {
    cleanup()
  }
})

test('avatar manifest：不合法动作被过滤，带路径的 file 直接拒绝（防穿越）', () => {
  const { dir, cleanup } = withManifest([
    { id: 'idle', label: '待机', cols: 8, rows: 6, frames: 48, cellWidth: 354, cellHeight: 480, file: 'idle.webp' },
    { id: 'evil', label: '恶意', cols: 8, rows: 6, frames: 48, cellWidth: 1, cellHeight: 1, file: '../../secret.webp' },
    { id: 'broken', cols: 0, rows: 6, frames: 48, file: 'broken.webp' },
  ])
  try {
    const manifest = loadAvatarManifest(dir)
    assert.equal(manifest?.states.length, 1, '只有合法动作留下')
    assert.equal(manifest!.states[0]!.id, 'idle')
  } finally {
    cleanup()
  }
})

test('avatar manifest：缺文件返回 undefined', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-avatar-empty-'))
  try {
    assert.equal(loadAvatarManifest(dir), undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
