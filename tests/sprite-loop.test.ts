/**
 * sprite-loop.test —— 循环闭合算法核的判据（纯合成像素，不跑浏览器）。
 *
 * 这里钉的是"能分辨"这件事本身：
 * 1. 24 帧一个循环的序列，自相关必须报 **L=24**（而且 L=12 的分数明显更大——半个循环不许冒充）；
 * 2. 12 帧重复一次的序列（24 帧处也几乎为 0），必须归到**基频 L=12**；
 * 3. 分数平缓的曲线必须判 `low` 并说明"按一次性动作处理"；
 * 4. `suggestFps` 反推的采样率要能还原方法论里那个实测例子（20.11fps / 24 帧）；
 * 5. 掩膜必须是共用的一张：掩膜外的差异一个都不许算进去。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  autocorrelation,
  bodyCoreMask,
  closureOf,
  downsample,
  downsampleMask,
  finalizeLoopScan,
  frameDiff,
  fullMask,
  lowConfidenceWarning,
  lumaOf,
  maskArea,
  pickPeriod,
  scanRangeFor,
  suggestFps,
  multipleSuspectWarning,
} from '../src/sprite/loop.js'
import type { RgbaImage } from '../src/sprite/match.js'

/**
 * 合成一帧：一个恒定的圆（身体，luma 120）+ 一根会动的亮条（动作，luma 250）。
 *
 * 为什么这么造：身体不动 → body-core 掩膜稳定；只有亮条动 → 差异全由"相位"决定，
 * 于是"每 L 帧重复一次"这件事在数值上是可证的，不必靠肉眼看图。
 * 位置按**整数相位**取整，保证"同相位的两帧逐字节相同"（否则浮点尾差会让分数不严格为 0）。
 */
function frameAt(size: number, index: number, period: number): RgbaImage {
  const rgba = new Uint8Array(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.3
  const amp = radius * 0.55
  const barX = Math.round(cx + Math.cos((2 * Math.PI * index) / period) * amp)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      if (dx * dx + dy * dy > radius * radius) continue
      const onBar = Math.abs(x + 0.5 - barX) <= 3 && Math.abs(dy) <= radius * 0.6
      const at = (y * size + x) * 4
      const luma = onBar ? 250 : 120
      rgba[at] = luma
      rgba[at + 1] = luma
      rgba[at + 2] = luma
      rgba[at + 3] = 255
    }
  }
  return { width: size, height: size, rgba }
}

/** 造 count 帧，姿势按 period 循环（count 通常是 period 的整数倍）。 */
function framesOf(count: number, period: number, size = 96): RgbaImage[] {
  return Array.from({ length: count }, (_one, i) => frameAt(size, i % period, period))
}

function scoreAt(curve: Array<{ L: number; score: number }>, L: number): number {
  const hit = curve.find((point) => point.L === L)
  assert.ok(hit, `自相关表里没有 L=${L}`)
  return hit.score
}

test('lumaOf：int32 里算完再截断，预乘 alpha（透明区恒为 0）', () => {
  const white: RgbaImage = { width: 1, height: 1, rgba: new Uint8Array([255, 255, 255, 255]) }
  assert.equal(lumaOf(white)[0], 255, '299×255+587×255+114×255 = 255000（int16 早已溢出），除回 1000 仍是纯白')
  const green: RgbaImage = { width: 1, height: 1, rgba: new Uint8Array([0, 255, 0, 255]) }
  assert.equal(lumaOf(green)[0], Math.round((587 * 255) / 1000))
  const transparent: RgbaImage = { width: 1, height: 1, rgba: new Uint8Array([200, 200, 200, 0]) }
  assert.equal(lumaOf(transparent)[0], 0, 'alpha=0 的残色不许混进差异')
  const half: RgbaImage = { width: 1, height: 1, rgba: new Uint8Array([255, 255, 255, 128]) }
  assert.equal(lumaOf(half)[0], Math.round((255 * 128) / 255))
})

test('frameDiff：掩膜内平均绝对差；掩膜外的差异一个都不算', () => {
  const size = 8
  const mask = fullMask(size, size)
  const a: RgbaImage = { width: size, height: size, rgba: new Uint8Array(size * size * 4) }
  const b: RgbaImage = { width: size, height: size, rgba: new Uint8Array(size * size * 4) }
  for (let i = 0; i < size * size; i++) {
    a.rgba[i * 4] = 100
    a.rgba[i * 4 + 1] = 100
    a.rgba[i * 4 + 2] = 100
    a.rgba[i * 4 + 3] = 255
    b.rgba[i * 4] = 140
    b.rgba[i * 4 + 1] = 140
    b.rgba[i * 4 + 2] = 140
    b.rgba[i * 4 + 3] = 255
  }
  assert.equal(frameDiff(a, b, mask), 40, '全幅均匀差 40 → 平均差就是 40')
  assert.equal(frameDiff(a, a, mask), 0)

  // 只把左半边算进来：右半边的差异必须被完全忽略。
  const half = { width: size, height: size, data: new Uint8Array(size * size) }
  for (let y = 0; y < size; y++) for (let x = 0; x < size / 2; x++) half.data[y * size + x] = 1
  const c: RgbaImage = { width: size, height: size, rgba: a.rgba.slice() }
  for (let y = 0; y < size; y++) {
    for (let x = size / 2; x < size; x++) {
      const at = (y * size + x) * 4
      c.rgba[at] = 10
      c.rgba[at + 1] = 10
      c.rgba[at + 2] = 10
    }
  }
  assert.equal(frameDiff(a, c, half), 0, '差异全在掩膜外 → 分数必须是 0（不然边界噪声会冒充动作）')

  // 空掩膜要报错，不许返回 0（把"没量到"伪装成"完全一样"）。
  const empty = { width: size, height: size, data: new Uint8Array(size * size) }
  assert.throws(() => frameDiff(a, b, empty), /一个前景像素都没有/)
})

test('downsample：整数倍块平均 + 过半前景才算掩膜', () => {
  const size = 8
  const img: RgbaImage = { width: size, height: size, rgba: new Uint8Array(size * size * 4) }
  const mask = { width: size, height: size, data: new Uint8Array(size * size) }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const at = (y * size + x) * 4
      const opaque = x < size / 2
      img.rgba[at] = 80
      img.rgba[at + 1] = 80
      img.rgba[at + 2] = 80
      img.rgba[at + 3] = opaque ? 255 : 0
      if (opaque) mask.data[y * size + x] = 1
    }
  }
  const small = downsample(img, 4)
  assert.deepEqual({ width: small.width, height: small.height }, { width: 2, height: 2 })
  // 左块全不透明 → alpha 255；右块全透明 → alpha 0（块平均，不是抽点）。
  assert.equal(small.rgba[3], 255)
  assert.equal(small.rgba[7], 0)
  assert.equal(small.mask.data[0], 1)
  assert.equal(small.mask.data[1], 0)
  // 共用掩膜走 downsampleMask：块内过半是前景才算前景（保面积）。
  const smallMask = downsampleMask(mask, 4)
  assert.equal(maskArea(smallMask), 2, '8×8 的左半边（32 px/块）→ 2×2 里的左边一列')
  assert.equal(downsampleMask(mask, 1), mask, 'factor=1 原样返回')
})

test('自相关：24 帧一个循环 → L=24 最优，L=12（半个循环）明显更差', () => {
  const frames = framesOf(48, 24)
  const mask = bodyCoreMask(frames[0]!)
  assert.ok(maskArea(mask) > 500, '合成的圆应该撑出一块实心掩膜')

  const curve = autocorrelation(frames, mask, { lo: 2, hi: 24 })
  assert.equal(curve.length, 23, 'lo=2..hi=24 一共 23 个候选')
  assert.equal(scoreAt(curve, 24), 0, '同相位的两帧逐字节相同 → 分数必须是 0')
  const half = scoreAt(curve, 12)
  assert.ok(half > 5, `L=12 是半个循环，分数应该明显大（实测 ${half}）`)

  const pick = pickPeriod(curve)
  assert.equal(pick.L, 24)
  assert.equal(pick.confidence, 'high')
  assert.equal(pick.score, 0)
  assert.ok(pick.sharpness > 0.9, `邻居 L=23/25 与最优差得远，锐度应该接近 1（实测 ${pick.sharpness}）`)
})

test('自相关：每 12 帧重复一次 → 归到基频 L=12（24 处也几乎为 0，但不许选它）', () => {
  const frames = framesOf(48, 12)
  const mask = bodyCoreMask(frames[0]!)
  const curve = autocorrelation(frames, mask, { lo: 2, hi: 24 })

  assert.equal(scoreAt(curve, 12), 0)
  assert.equal(scoreAt(curve, 24), 0, '24 = 2×12，同相位所以也是 0 —— 这就是"倍数歧义"')
  assert.ok(scoreAt(curve, 6) > 5, '6 是半个 12 帧周期，应该对不上')
  const pick = pickPeriod(curve)
  assert.equal(pick.L, 12, '近似平手时取最小 L（基频），否则会把 12 帧动作当 24 帧交付')
  assert.equal(pick.confidence, 'high')
  assert.equal(suggestFps(pick.L, 12, [24, 48]).targetFrames, 24)
})

test('pickPeriod：曲线平缓 → low + 明确说"按一次性动作处理"', () => {
  const flat = [
    { L: 10, score: 12.0 },
    { L: 11, score: 11.8 },
    { L: 12, score: 11.6 },
    { L: 13, score: 11.7 },
    { L: 14, score: 12.1 },
  ]
  const pick = pickPeriod(flat)
  assert.equal(pick.L, 12)
  assert.equal(pick.confidence, 'low')
  assert.match(String(pick.reason), /平缓/)
  assert.match(String(pick.reason), /一次性/)
  assert.ok(pick.sharpness < 0.1)

  // 只有一个候选：区间太窄，也不许说"高置信"。
  const single = pickPeriod([{ L: 24, score: 3 }])
  assert.equal(single.confidence, 'low')
  assert.match(String(single.reason), /区间太窄/)

  // 只满足一个条件 → medium：锐度 11%（>10%）但没到 0.85× 邻居（8.8/9.9 = 0.889）。
  const borderline = [
    { L: 9, score: 10.0 },
    { L: 10, score: 8.8 },
    { L: 11, score: 9.9 },
  ]
  const mid = pickPeriod(borderline)
  assert.equal(mid.L, 10)
  assert.equal(mid.confidence, 'medium', '锐度 11% 但没到 0.85× 邻居 → medium')

  assert.throws(() => pickPeriod([]), /曲线是空的/)
  assert.throws(() => pickPeriod([{ L: Number.NaN, score: 1 }]), /非数字/)
})

test('suggestFps：复现方法论的实测例子（25 帧 @20.945fps → 24 帧 @≈20.11fps）', () => {
  const suggested = suggestFps(25, 20.945, [24, 48])
  assert.equal(suggested.targetFrames, 24)
  assert.ok(Math.abs(suggested.fps - 20.11) < 0.01, `实测例子是 20.11fps，这里是 ${suggested.fps}`)
  assert.ok(Math.abs(suggested.periodSec - 1.1937) < 0.001, `周期 1.1937s，这里是 ${suggested.periodSec}`)

  // 周期 2s @12fps = 24 帧 → 目标 24 帧正好还是 12fps（离预采样率 0 距离）。
  const same = suggestFps(24, 12, [24, 48])
  assert.equal(same.targetFrames, 24)
  assert.equal(same.fps, 12)

  // 周期更长（40 帧 @12fps ≈ 3.33s）时 48 帧更接近原采样率 → 选 48。
  const long = suggestFps(40, 12, [24, 48])
  assert.equal(long.targetFrames, 48)
  assert.ok(Math.abs(long.fps - 14.4) < 0.001, `48 / 3.3333s = 14.4fps，这里是 ${long.fps}`)

  // 目标帧数一样近时取更小的 T（帧少、排版省）。
  assert.equal(suggestFps(12, 12, [24, 48]).targetFrames, 24)
  assert.throws(() => suggestFps(0, 12, [24]), /正数/)
  assert.throws(() => suggestFps(24, 0, [24]), /正数/)
  assert.throws(() => suggestFps(24, 12, []), /没有可用/)
})

test('closureOf：首尾差要与相邻帧差同量级', () => {
  assert.equal(closureOf(2.9, 2.8).ok, true)
  assert.equal(closureOf(0, 3).ok, false, '首尾差 0 = 还有重复帧，不算闭合')
  assert.equal(closureOf(9, 3).ok, false, '首尾差远大于相邻帧差 = 跳变')
  assert.equal(closureOf(1.6, 3).ok, true, '|1.6-3|/3 = 0.47 < 0.5')
  assert.equal(closureOf(0, 0).ok, true, '相邻帧也完全一样时只能按"闭合"处理（不除零）')
})

test('scanRangeFor：minPeriodSec 超出可测上界时要显式说，不许退化成单点', () => {
  const normal = scanRangeFor(48, 12, 0.5)
  assert.deepEqual({ lo: normal.lo, hi: normal.hi }, { lo: 6, hi: 24 })
  assert.equal(normal.warnings.length, 0)

  const degenerate = scanRangeFor(48, 12, 2)
  assert.equal(degenerate.lo, 24)
  assert.ok(degenerate.hi > degenerate.lo, '区间不许是单点，否则 pickPeriod 只能给 low')
  assert.match(degenerate.warnings.join('\n'), /放宽/)

  const tooBig = scanRangeFor(24, 12, 5)
  assert.match(tooBig.warnings.join('\n'), /超出本段可测范围/)
})

test('下限过滤 → 倍数误判要报警（真周期被 minPeriodSec 挡在门外的那种）', () => {
  // 2026-11-13 实测：真周期 14 帧（1.17s），默认 minPeriodSec=2 让区间成了 L≥24，
  // 自相关只能报 L=28 —— 2 倍周期，而且原来一声不吭。
  const warn = multipleSuspectWarning(28, 11.6, 2, 11.9, 24, 12)
  assert.ok(warn, '应当报警')
  assert.match(warn!, /2 倍/)
  assert.match(warn!, /L=14/)
  assert.match(warn!, /minPeriodSec/)
  assert.match(warn!, /1\.17s/, '要给出换算后的秒数建议')
})

test('候选没被下限挡住时不管（区间内已经比过了）', () => {
  assert.equal(multipleSuspectWarning(28, 11.6, 2, 11.9, 10, 12), null)
})

test('1/2 周期分数明显更差时不误报', () => {
  // 12 帧是 24 帧的一半：分数 20 比 10 差一倍以上 → 说明真周期就是 24
  assert.equal(multipleSuspectWarning(24, 10, 2, 20, 18, 12), null)
})

test('候选太小（<2 帧）不报', () => {
  assert.equal(multipleSuspectWarning(3, 5, 2, 4.9, 20, 12), null)
})

test('finalizeLoopScan（P1-补）：low 时 suggestedAction + warnings 第一条就是"按一次性动作处理"', () => {
  const low = finalizeLoopScan({
    periodFrames: 14,
    fps: 12,
    suggested: { fps: 24, targetFrames: 24 },
    curve: [
      { L: 14, score: 11.6 },
      { L: 13, score: 11.9 },
      { L: 15, score: 11.8 },
    ],
    closureScore: 0.9,
    confidence: 'low',
    reason: '自相关曲线平缓，建议按一次性动作处理（别硬闭合）',
    warnings: ['还没 key_apply：这次用原帧扫'],
    scanned: { frames: 48, fps: 12, mask: 'body-core', source: 'raw', downsample: 4, candidates: 23, range: { lo: 24, hi: 24 } },
    elapsedMs: 42,
  })
  assert.equal(low.confidence, 'low')
  assert.equal(low.suggestedAction, 'treat-as-one-shot', 'low 时必须有显式的动作建议字段')
  assert.equal(low.warnings.length, 2, '原有 warning 不许被吃掉')
  assert.match(low.warnings[0]!, /建议按一次性动作处理/, '第一条必须是那句，不能藏在 reason 里')
  assert.match(low.warnings[0]!, /confidence:"low"/)
  assert.match(low.warnings[1]!, /还没 key_apply/, '其余 warning 顺延到后面')
  assert.match(String(low.reason), /一次性动作/, 'reason 保留（向后兼容）')
  assert.equal(low.periodSec, 1.1667, '14 帧 @12fps ≈ 1.1667s')
  assert.deepEqual(low.scoreCurve.map((point) => point.frames), [14, 15, 13], 'scoreCurve 取分数最低的 5 个')

  const high = finalizeLoopScan({
    periodFrames: 24,
    fps: 12,
    suggested: { fps: 12, targetFrames: 24 },
    curve: [{ L: 24, score: 0 }],
    closureScore: 0.98,
    confidence: 'high',
    warnings: ['已有 warning'],
    scanned: { frames: 48, fps: 12, mask: 'body-core', source: 'keyed', downsample: 4, candidates: 23, range: { lo: 24, hi: 24 } },
    elapsedMs: 40,
  })
  assert.equal(high.suggestedAction, undefined, 'high 时不许乱塞动作建议')
  assert.deepEqual(high.warnings, ['已有 warning'], '非 low 时 warnings 顺序与内容都不许变')
})

test('lowConfidenceWarning：reason 里已经有那句话时不重复说两遍', () => {
  const withHint = lowConfidenceWarning('自相关曲线平缓，建议按一次性动作处理')
  assert.equal((withHint.match(/一次性动作/g) ?? []).length, 1, `实测：${withHint}`)
  assert.match(withHint, /confidence:"low"/)

  const withoutHint = lowConfidenceWarning('扫描区间太窄，判不出锐度')
  assert.match(withoutHint, /^建议按一次性动作处理/)
  assert.match(withoutHint, /扫描区间太窄/)

  const noReason = lowConfidenceWarning(undefined)
  assert.match(noReason, /^建议按一次性动作处理/)
  assert.match(noReason, /曲线平缓/)
})
