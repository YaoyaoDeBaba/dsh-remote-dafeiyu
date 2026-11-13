/**
 * sprite-verify.test —— 一批产物的一致性自检。
 *
 * 钉的是"单份都对、整组不像话"这类只在批量交付时才暴露的问题：
 * 2026-11-13 那批 6 条动画单看都没事，组内身高差到 ±5%，全靠人眼发现。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyConsistency, type VerifyMeta } from '../src/sprite/verify.js'

function meta(over: Partial<VerifyMeta> = {}): VerifyMeta {
  return {
    name: 'idle',
    charHeightPx: 277,
    anchorX: 0.4164,
    anchorY: 0.99,
    cellWidth: 287,
    cellHeight: 386,
    scale: 0.4348,
    fps: 12,
    anchorConvention: 'y-from-bottom',
    anchorWritten: true,
    ...over,
  }
}

test('整齐的一组：ok=true，基准取中位数', () => {
  const result = verifyConsistency([
    meta({ name: 'idle', charHeightPx: 277 }),
    meta({ name: 'angry', charHeightPx: 276.5 }),
    meta({ name: 'sad', charHeightPx: 276 }),
  ])
  assert.equal(result.ok, true, JSON.stringify(result.warnings))
  assert.equal(result.count, 3)
  assert.equal(result.reference?.charHeightPx, 276.5)
  assert.equal(result.tolerance.heightPct, 0.01)
})

test('组内身高差超 1% 要点名，并把偏差百分比写进去', () => {
  const result = verifyConsistency([
    meta({ name: 'idle', charHeightPx: 277 }),
    meta({ name: 'angry', charHeightPx: 290 }), // 偏大 ~4.7%
  ])
  assert.equal(result.ok, false)
  const hit = result.warnings.find((w) => w.startsWith('angry'))
  assert.ok(hit, '没点名 angry：' + JSON.stringify(result.warnings))
  assert.match(hit!, /偏大/)
  assert.match(hit!, /%/)
  const item = result.items.find((i) => i.name === 'angry')!
  assert.ok(item.deltaPct !== undefined && item.deltaPct > 0.01)
})

test('离群点不影响基准（中位数而不是均值）', () => {
  const result = verifyConsistency([
    meta({ name: 'a', charHeightPx: 276 }),
    meta({ name: 'b', charHeightPx: 277 }),
    meta({ name: 'c', charHeightPx: 400 }), // 离群
  ])
  assert.equal(result.reference?.charHeightPx, 277)
  assert.equal(result.items.find((i) => i.name === 'c')!.deltaPct! > 0.4, true)
})

test('锚点 X 折成像素后比，>2px 要报警', () => {
  // 三条起（两条时中位数是它俩的中点，偏离会被平均掉，测不出东西）
  const result = verifyConsistency([
    meta({ name: 'idle' }),
    meta({ name: 'walk' }),
    meta({ name: 'jump', anchorX: 0.432 }), // 0.432*287 ≈ 124.0 vs 0.4164*287 ≈ 119.5，差 ~4.5px
  ])
  assert.equal(result.ok, false)
  const item = result.items.find((i) => i.name === 'jump')!
  assert.ok(Math.abs(item.deltaAnchorXPx!) > 2, `delta=${item.deltaAnchorXPx}`)
  assert.ok(result.warnings.some((w) => w.includes('锚点 X')))
})

test('口径混用会被抓出来（数值都合理，运行时却会跳位）', () => {
  const result = verifyConsistency([
    meta({ name: 'a', anchorConvention: 'y-from-bottom' }),
    meta({ name: 'b', anchorConvention: 'y-from-top' }),
  ])
  assert.equal(result.ok, false)
  assert.ok(result.warnings.some((w) => w.includes('口径不一致')))
})

test('必备字段缺失要点名，尤其是 anchorWritten=false（旧版导出的特征）', () => {
  const result = verifyConsistency([meta({ name: 'old', anchorWritten: false, fps: undefined, cellWidth: undefined })])
  assert.equal(result.ok, false)
  const item = result.items[0]!
  assert.ok(item.problems.some((p) => p.includes('anchorWritten=false')))
  assert.ok(item.problems.some((p) => p.includes('fps')))
  assert.ok(item.problems.some((p) => p.includes('cellWidth')))
})

test('空列表要明确报原因，不许静默 ok', () => {
  const result = verifyConsistency([])
  assert.equal(result.ok, false)
  assert.match(String(result.reason), /没有可校验/)
})

test('可以指定基准身高（跨批次沿用上一批的尺子）', () => {
  const result = verifyConsistency([meta({ name: 'idle', charHeightPx: 277 })], { referenceCharHeight: 260 })
  assert.equal(result.reference?.charHeightPx, 260)
  assert.ok(result.items[0]!.deltaPct! > 0.06)
  assert.equal(result.ok, false)
})
