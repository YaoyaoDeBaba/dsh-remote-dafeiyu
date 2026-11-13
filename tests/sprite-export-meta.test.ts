/**
 * sprite-export-meta.test —— P0-1 的判据：`sprite_export` 的锚点必须与 `sprite_set_anchor`
 * 走同一条读回路径，meta 里的 anchorX/anchorY/anchorYTopDown 一个键都不许丢。
 *
 * 为什么用页面桩而不是真机：这个缺陷的根因就是「页面 setAnchor 只回 {ok,x,y}」，
 * 真机要跑无头 Edge 才能复现，而这一层只要把桥接调用按页面真实返回值喂进去就能钉死。
 * 页面桩返回形状照抄 `assets/sprite/sprite-tool.html` 里的 setAnchor / getAnchor。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildExportMeta, resolveExportAnchor, type BridgeCall } from '../src/sprite/service.js'
import type { KeyParams } from '../src/sprite/types.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PAGE = path.join(ROOT, 'assets', 'sprite', 'sprite-tool.html')

interface PageStub {
  calls: Array<{ name: string; args: unknown[] }>
  call: BridgeCall
}

/** 一个只会 setAnchor / getAnchor 的页面桩；返回值就是页面里那两个函数的真实形状。 */
function pageStub(overrides: { getAnchor?: () => unknown } = {}): PageStub {
  const calls: Array<{ name: string; args: unknown[] }> = []
  const page: Record<string, (...args: unknown[]) => unknown> = {
    /* 页面 setAnchor 的真实返回：归一化后的 x/y，没有 anchorX/anchorY/convention/pixels */
    setAnchor: (opts?: unknown) => {
      const o = (opts && typeof opts === 'object' ? opts : {}) as { x?: number; y?: number }
      return { ok: true, x: o.x ?? 0.5, y: o.y ?? 0 }
    },
    /* 页面 getAnchor 的真实返回：完整 AnchorInfo（契约 §6） */
    getAnchor: overrides.getAnchor ?? (() => ({
      ok: true,
      anchorX: 0.4164,
      anchorY: 0.9375,
      convention: 'y-from-bottom',
      pixels: { x: 300, y: 480 },
      frameWidth: 720,
      frameHeight: 512,
    })),
  }
  const call: BridgeCall = async <T>(name: string, ...args: unknown[]): Promise<T> => {
    calls.push({ name, args })
    const fn = page[name]
    if (!fn) throw new Error('页面桩没有 ' + name)
    return fn(...args) as T
  }
  return { calls, call }
}

const SCALED = { scale: 0.29, achievedPx: 300 }
const BUILT = { width: 2048, height: 1840, meta: { cols: 8, rows: 6, pageName: 'sprite_sheet' } }
const PARAMS: KeyParams = { mode: 'advanced', colorHex: '#95C469', softness: 100 }

/** 与 exportSheet 落盘那一句完全一致（meta 直接 JSON.stringify，不预先剔 undefined）。 */
function writeMetaRoundTrip(meta: Record<string, unknown>): Record<string, unknown> {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-sprite-meta-'))
  try {
    const metaPath = path.join(dir, 'Idle_8x6.meta.json')
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8')
    return JSON.parse(readFileSync(metaPath, 'utf8')) as Record<string, unknown>
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('P0-1：传了 anchorX/anchorY 时先 setAnchor、再 getAnchor 回读，落盘 meta 键齐全', async () => {
  const page = pageStub()
  const resolved = await resolveExportAnchor(page.call, { anchorX: 0.4164, anchorY: 0.9375 })

  // 顺序必须是「先设、再回读」——只信 setAnchor 的返回就是上一版的坑
  assert.deepEqual(page.calls.map((entry) => entry.name), ['setAnchor', 'getAnchor'])
  assert.deepEqual(page.calls[0]!.args, [{ x: 0.4164, y: 0.9375 }])
  assert.equal(resolved.written, true)
  assert.equal(resolved.anchor.anchorX, 0.4164, '回读值才是 meta 的来源')
  assert.equal(resolved.anchor.anchorY, 0.9375)
  assert.equal(resolved.anchor.convention, 'y-from-bottom')

  const meta = buildExportMeta({
    built: BUILT,
    name: 'Idle',
    format: 'png',
    cellWidth: 256,
    cellHeight: 306,
    anchor: resolved.anchor,
    anchorWritten: resolved.written,
    fps: 12,
    scaled: SCALED,
    appliedParams: PARAMS,
    generatedAt: '2026-11-13T00:00:00.000Z',
  })
  const disk = writeMetaRoundTrip(meta)

  // 这三个键是 P0-1 的验收点：以前它们会被 JSON.stringify 直接丢掉/写 null
  assert.ok(Object.prototype.hasOwnProperty.call(disk, 'anchorX'), 'meta 必须有 anchorX')
  assert.ok(Object.prototype.hasOwnProperty.call(disk, 'anchorY'), 'meta 必须有 anchorY')
  assert.ok(Object.prototype.hasOwnProperty.call(disk, 'anchorYTopDown'), 'meta 必须有 anchorYTopDown')
  assert.equal(disk.anchorX, 0.4164)
  assert.equal(disk.anchorY, 0.9375)
  assert.equal(disk.anchorYTopDown, 0.0625, '顶口径 = 1 - 0.9375，且必须是数字不是 null')
  assert.equal(disk.anchorConvention, 'y-from-bottom')
  assert.equal(disk.anchorWritten, true, 'anchorWritten 必须明确说这次写了锚点')
  // 别的既有字段不能被这次改动弄丢
  assert.equal(disk.name, 'Idle', '调用方传的 name 要覆盖页面那个 sprite_sheet')
  assert.equal(disk.fps, 12)
  assert.equal(disk.scale, 0.29)
  assert.equal(disk.charHeightPx, 300)
  assert.deepEqual(disk.appliedParams, PARAMS)
  assert.equal(disk.engine, 'dsh-remote-dafeiyu/sprite')
})

test('没传锚点参数：只回读 getAnchor，anchorWritten=false，但 meta 里锚点字段仍有值', async () => {
  const page = pageStub()
  const resolved = await resolveExportAnchor(page.call, {})
  assert.deepEqual(page.calls.map((entry) => entry.name), ['getAnchor'], '没传参数就不该去 setAnchor')
  assert.equal(resolved.written, false)

  const disk = writeMetaRoundTrip(
    buildExportMeta({
      built: BUILT,
      name: 'Idle',
      format: 'png',
      cellWidth: 256,
      cellHeight: 306,
      anchor: resolved.anchor,
      anchorWritten: resolved.written,
      fps: 12,
      scaled: SCALED,
      appliedParams: null,
    }),
  )
  assert.equal(disk.anchorWritten, false)
  assert.equal(disk.anchorX, 0.4164)
  assert.equal(disk.anchorY, 0.9375)
  assert.equal(disk.anchorYTopDown, 0.0625)
})

test('页面 getAnchor 回不出 anchorX/anchorY：直接报错，不写半份 meta', async () => {
  const page = pageStub({ getAnchor: () => ({ ok: true }) })
  await assert.rejects(() => resolveExportAnchor(page.call, { anchorX: 0.3 }), /anchorX\/anchorY/)
})

test('页面 setAnchor 的返回值也带完整字段（x/y 保留，别让人再踩同一个坑）', () => {
  const html = readFileSync(PAGE, 'utf8')
  const start = html.indexOf('async function setAnchor(x, y)')
  assert.ok(start > 0, 'sprite-tool.html 里找不到 setAnchor')
  const end = html.indexOf('/* ---------------- 13. 拼图', start)
  assert.ok(end > start, '找不到 setAnchor 的结束边界')
  const body = html.slice(start, end)
  for (const token of [
    'x: ax',
    'y: ay',
    'anchorX: ax',
    'anchorY: ay',
    "convention: 'y-from-bottom'",
    'pixels: { x:',
  ]) {
    assert.ok(body.includes(token), 'setAnchor 返回值缺少 ' + token)
  }
})
