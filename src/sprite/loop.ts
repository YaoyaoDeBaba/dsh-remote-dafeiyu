/**
 * sprite/loop —— **循环闭合**的算法核：自相关测周期 + 采样率反推 + 闭合度判定。
 *
 * 解决的是「AI 生成的 4 秒动画里含 N 个不完整循环」：播放器播完 48 帧跳回第 0 帧时，
 * 要么看到两个相同姿势（顿一下）、要么姿势差得远（跳变）。正确做法是**量出真实周期**、
 * 按周期截断、丢掉重复的那一帧（方法论见 `docs/loop-closure-methodology-20261113.md`）。
 *
 * 四条纪律（每条都对应方法论 §4 记的一个坑）：
 * 1. **掩膜必须共用一张**（第 0 帧的 body-core）。逐帧各算各的掩膜，会让"边界在某几帧动了"
 *    冒充"动作差异"，自相关曲线直接失去意义。
 * 2. **不用整图算差异**：绿幕渐变/压缩噪声会淹没动作差异 → 只在掩膜内算。
 * 3. **全分辨率直接算自相关会卡死**（48 帧 × 48 周期 × 70 万像素 ≈ 16 亿次）→ 先在
 *    `LOOP_DOWNSAMPLE_FACTOR` 倍降采样上扫，只在最优 L 上回全分辨率复核。
 * 4. **累加器用 int32**：`299 × 255 = 76245` 已经超 int16，一行像素的和更是几十万
 *    （方法论 §4.3 就是这么踩的）。这里行累加器是 `Int32Array`，总和自己按 double 加
 *    （整数 < 2^53 精确）。
 *
 * 这个文件与 `match.ts` 一样**不引用任何运行时代码**（只有 `import type` + 复用纯函数）：
 * 单测直接拿合成像素跑，不起浏览器、不读文件、不碰时钟。
 */
import { maskFromAlpha, round4, type MaskImage, type RgbaImage } from './match.js'

/** 自相关扫描前先降到几分之一（方法论 §5.1 的实测结论：1/4 够用）。 */
export const LOOP_DOWNSAMPLE_FACTOR = 4

/** 掩膜口径：body-core = alpha>阈值 → 最大连通域 → 1px 腐蚀；none = 整幅都算（绿幕素材别用）。 */
export const LOOP_MASK_MODES = ['body-core', 'none'] as const
export type LoopMaskMode = (typeof LOOP_MASK_MODES)[number]

/** alpha 阈值（与 measure/剪影一致：32）。 */
export const LOOP_ALPHA_THRESHOLD = 32

// ─────────────────────────────── 亮度 ───────────────────────────────

const lumaCache = new WeakMap<RgbaImage, Uint8Array>()

/**
 * 预乘 alpha 的亮度图（0~255，整数）。
 *
 * - `luma = round((299r + 587g + 114b) / 1000)`：系数和刚好 1000，纯白仍然是 255
 *   （用 `>> 10` 会变成 249，白色被系统性压低 2%）；中间量 255000 在 int32 里安全，
 *   `int16 × 299` 才会溢出（方法论 §4.3）；
 * - **乘 alpha**：与 `match.ts` 的 `toGray` 同口径，canvas 语义下透明区 RGB 可能是 0 也可能是
 *   残色，乘过之后统一变 0——否则"透明区的垃圾 RGB"会被当成动作差异算进去。
 *
 * 按输入对象记忆化：自相关里同一帧要跟几十个 L 比，逐次灰度化纯属浪费。
 */
export function lumaOf(image: RgbaImage): Uint8Array {
  const hit = lumaCache.get(image)
  if (hit) return hit
  const { width, height, rgba } = image
  const data = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    const alpha = rgba[p + 3]!
    if (alpha === 0) {
      data[i] = 0
      continue
    }
    const luma = Math.round((299 * rgba[p]! + 587 * rgba[p + 1]! + 114 * rgba[p + 2]!) / 1000)
    data[i] = alpha === 255 ? luma : Math.round((luma * alpha) / 255)
  }
  lumaCache.set(image, data)
  return data
}

// ─────────────────────────────── 差异 ───────────────────────────────

/** 整幅都算的掩膜（`mask:'none'` 用；也用于导出后按格子比首尾）。 */
export function fullMask(width: number, height: number): MaskImage {
  const w = Math.max(1, Math.floor(width))
  const h = Math.max(1, Math.floor(height))
  return { width: w, height: h, data: new Uint8Array(w * h).fill(1) }
}

/**
 * 第 0 帧的 body-core 掩膜（**全序列共用这一张**）。
 *
 * 复用 `match.ts` 的 `maskFromAlpha`——那里已经有"最大连通域 + 1px 腐蚀"的实现，
 * 再写一份就是两份会漂的代码。
 */
export function bodyCoreMask(image: RgbaImage, alphaThreshold = LOOP_ALPHA_THRESHOLD): MaskImage {
  return maskFromAlpha(image, { threshold: alphaThreshold, mode: 'body-core' })
}

/**
 * 两帧在给定掩膜内的**平均绝对亮度差**（0~255 量纲）。
 *
 * `mask` 必须是全序列共用的那一张（见 `bodyCoreMask`）：逐帧各算各的会让边界变化混进分数。
 * `width/height` 是参与比较的矩形尺寸（缺省取 `a` 的尺寸），用于按格子比导出图集里的两格。
 *
 * 掩膜里一个前景像素都没有时**抛错**，不返回 0——那会把"没量到"伪装成"完全一样"。
 */
export function frameDiff(
  a: RgbaImage,
  b: RgbaImage,
  mask: MaskImage,
  width?: number,
  height?: number,
): number {
  const w = Math.floor(Number(width ?? a.width))
  const h = Math.floor(Number(height ?? a.height))
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new Error(`比较区域必须是正数尺寸（收到 ${String(width)}x${String(height)}）`)
  }
  if (a.width < w || a.height < h) throw new Error(`帧 a 是 ${a.width}x${a.height}，装不下 ${w}x${h} 的比较区域`)
  if (b.width < w || b.height < h) throw new Error(`帧 b 是 ${b.width}x${b.height}，装不下 ${w}x${h} 的比较区域`)
  if (mask.width < w || mask.height < h) {
    throw new Error(`掩膜是 ${mask.width}x${mask.height}，比比较区域 ${w}x${h} 小（掩膜要跟帧同尺寸）`)
  }
  const la = lumaOf(a)
  const lb = lumaOf(b)
  if (la.length < a.width * a.height || lb.length < b.width * b.height) {
    throw new Error('亮度图尺寸与像素图对不上')
  }
  // 行累加器用 int32：一行的和最大 = 宽 × 255（1400 宽就是 35 万），int16 早就溢出了。
  const rowSum = new Int32Array(h)
  let covered = 0
  for (let y = 0; y < h; y++) {
    const maskRow = y * mask.width
    const rowA = y * a.width
    const rowB = y * b.width
    let sum = 0
    for (let x = 0; x < w; x++) {
      if (mask.data[maskRow + x] !== 1) continue
      sum += Math.abs(la[rowA + x]! - lb[rowB + x]!)
      covered++
    }
    rowSum[y] = sum
  }
  if (covered === 0) {
    throw new Error('掩膜里一个前景像素都没有：先用 bodyCoreMask 造一张，或换 mask:"none"（整幅）')
  }
  let total = 0
  for (let y = 0; y < h; y++) total += rowSum[y]!
  return round4(total / covered)
}

// ─────────────────────────────── 降采样 ───────────────────────────────

/**
 * 整数倍**盒式**降采样 RGBA（每块取平均）。默认 4×。
 *
 * 为什么按块平均而不是取一个像素：绿幕噪声与抗锯齿边会让"单点采样"的差异忽大忽小，
 * 平均之后这些高频噪声被压掉，动作本身的位移才浮出来。
 *
 * 返回的 `mask` 是**这张图自己**的 alpha 掩膜（块平均 alpha > 阈值），方便单独用；
 * 序列扫描要的是"全序列共用的那一张"，请用 `downsampleMask(bodyCoreMask(frames[0]), f)`。
 */
export function downsample(
  img: RgbaImage,
  factor = LOOP_DOWNSAMPLE_FACTOR,
): { width: number; height: number; rgba: Uint8Array; mask: MaskImage } {
  const f = Math.max(1, Math.round(Number(factor)))
  const src = img.rgba
  if (f === 1) {
    return { width: img.width, height: img.height, rgba: src.slice(), mask: maskFromAlpha(img, { mode: 'raw' }) }
  }
  const w = Math.max(1, Math.floor(img.width / f))
  const h = Math.max(1, Math.floor(img.height / f))
  const rgba = new Uint8Array(w * h * 4)
  const maskData = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const yStart = y * f
    const yEnd = Math.min(img.height, yStart + f)
    for (let x = 0; x < w; x++) {
      const xStart = x * f
      const xEnd = Math.min(img.width, xStart + f)
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0
      for (let yy = yStart; yy < yEnd; yy++) {
        let p = (yy * img.width + xStart) * 4
        for (let xx = xStart; xx < xEnd; xx++, p += 4) {
          r += src[p]!
          g += src[p + 1]!
          b += src[p + 2]!
          a += src[p + 3]!
          n++
        }
      }
      const at = y * w + x
      const q = at * 4
      if (n === 0) continue
      rgba[q] = Math.round(r / n)
      rgba[q + 1] = Math.round(g / n)
      rgba[q + 2] = Math.round(b / n)
      rgba[q + 3] = Math.round(a / n)
      maskData[at] = a / n > LOOP_ALPHA_THRESHOLD ? 1 : 0
    }
  }
  return { width: w, height: h, rgba, mask: { width: w, height: h, data: maskData } }
}

const maskCache = new WeakMap<MaskImage, Map<number, MaskImage>>()

/** 二值掩膜的整数倍降采样：块内**过半**是前景才算前景（保面积，与 `resampleMask` 同规则）。 */
export function downsampleMask(mask: MaskImage, factor = LOOP_DOWNSAMPLE_FACTOR): MaskImage {
  const f = Math.max(1, Math.round(Number(factor)))
  if (f === 1) return mask
  let bucket = maskCache.get(mask)
  if (!bucket) {
    bucket = new Map()
    maskCache.set(mask, bucket)
  }
  const hit = bucket.get(f)
  if (hit) return hit
  const w = Math.max(1, Math.floor(mask.width / f))
  const h = Math.max(1, Math.floor(mask.height / f))
  const data = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const yStart = y * f
    const yEnd = Math.min(mask.height, yStart + f)
    for (let x = 0; x < w; x++) {
      const xStart = x * f
      const xEnd = Math.min(mask.width, xStart + f)
      let on = 0
      let n = 0
      for (let yy = yStart; yy < yEnd; yy++) {
        const row = yy * mask.width
        for (let xx = xStart; xx < xEnd; xx++) {
          if (mask.data[row + xx] === 1) on++
          n++
        }
      }
      data[y * w + x] = n > 0 && on * 2 >= n ? 1 : 0
    }
  }
  const out: MaskImage = { width: w, height: h, data }
  bucket.set(f, out)
  return out
}

// ─────────────────────────────── 自相关 ───────────────────────────────

export interface ScorePoint {
  /** 候选周期（帧）。 */
  L: number
  /** `mean_i frameDiff(i, i+L)`：越小越像"每隔 L 帧重复一次"。 */
  score: number
}

export interface AutocorrelationOptions {
  /** 扫描下界（帧，含），默认 1。 */
  lo?: number
  /** 扫描上界（帧，含），默认 `floor(N/2)`（每个 L 至少有半程样本，分数才稳）。 */
  hi?: number
}

/**
 * 自相关全表：`score(L) = mean_i frameDiff(frame_i, frame_{i+L})`，`L ∈ [lo, hi]`。
 *
 * 为什么比"只比首帧"稳：半个步态常常长得像整个步态，只比首帧会被骗；全序列平均把
 * "每个 i 都要对得上"这个约束加上去（方法论 §2 步骤 4）。
 *
 * 调用方负责先把帧降到 `LOOP_DOWNSAMPLE_FACTOR` 分之一 —— 全分辨率跑这张表会慢到不可用。
 */
export function autocorrelation(
  frames: RgbaImage[],
  mask: MaskImage,
  opts: AutocorrelationOptions = {},
): ScorePoint[] {
  const n = frames.length
  if (n < 4) throw new Error(`自相关至少要 4 帧（收到 ${n} 帧）：帧太少量不出周期`)
  const lo = Math.max(1, Math.floor(Number(opts.lo ?? 1)))
  const hi = Math.min(n - 1, Math.floor(Number(opts.hi ?? Math.max(2, Math.floor(n / 2)))))
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error(`扫描区间不是数字：lo=${String(opts.lo)} hi=${String(opts.hi)}`)
  if (lo > hi) throw new Error(`扫描区间是空的：lo=${lo} > hi=${hi}（帧数 ${n}）`)
  const out: ScorePoint[] = []
  for (let L = lo; L <= hi; L++) {
    let sum = 0
    let pairs = 0
    for (let i = 0; i + L < n; i++) {
      sum += frameDiff(frames[i]!, frames[i + L]!, mask)
      pairs++
    }
    out.push({ L, score: pairs > 0 ? round4(sum / pairs) : Number.POSITIVE_INFINITY })
  }
  return out
}

// ─────────────────────────────── 挑周期 ───────────────────────────────

export interface PeriodPick {
  /** 挑出来的周期（帧）。 */
  L: number
  score: number
  /** 邻域锐度 = (邻居最小分 − 最优分) / 邻居最小分。 */
  sharpness: number
  confidence: 'high' | 'medium' | 'low'
  reason?: string
}

export interface PickPeriodOptions {
  /** `score(L_best) < dominanceRatio × min(邻居)` 才算"明显赢"，默认 0.85。 */
  dominanceRatio?: number
  /** 邻域锐度阈值，默认 0.10（>10% 说明周期清晰）。 */
  sharpnessThreshold?: number
  /** 邻居半径（帧），默认 1，即只跟 L±1 比。 */
  refineRadius?: number
  /** 近似平手的容差，默认 0.02：只在**整除**关系下把周期倍数归到基频（12 vs 24）。 */
  tieTolerance?: number
}

/**
 * 从自相关表里挑周期：取最小分 → 近似平手里归到最小 L → 跟邻居比锐度 → 给三档置信度。
 *
 * 三档照方法论 §3：
 * - `high`：`score < 0.85 × min(邻居)` **且** 锐度 > 10%；
 * - `medium`：只满足一个条件；
 * - `low`：都不满足（曲线平缓）→ `reason` 里直说"建议按一次性动作处理"。
 */
export function pickPeriod(curve: ScorePoint[], opts: PickPeriodOptions = {}): PeriodPick {
  if (!Array.isArray(curve) || curve.length === 0) {
    throw new Error('曲线是空的：没有候选周期就没法挑（先跑 autocorrelation）')
  }
  for (const point of curve) {
    if (!Number.isFinite(point?.L) || !Number.isFinite(point?.score)) {
      throw new Error(`自相关表里有非数字项：${JSON.stringify(point)}`)
    }
  }
  const points = [...curve].sort((a, b) => a.L - b.L)
  const dominanceRatio = Number(opts.dominanceRatio ?? 0.85)
  const sharpnessThreshold = Number(opts.sharpnessThreshold ?? 0.1)
  const refineRadius = Math.max(1, Math.round(Number(opts.refineRadius ?? 1)))
  const tieTolerance = Math.max(0, Number(opts.tieTolerance ?? 0.02))

  let best = points[0]!
  for (const point of points) if (point.score < best.score) best = point
  // 周期倍数归到基频：12 帧重复的动作在 24 帧处也几乎为 0——但只有"小周期整除大周期"时才归，
  // 否则平缓曲线上"随便一个近分数"都会被当成更短的周期（那会把动作剪成半截）。
  let chosen = best
  for (const point of points) {
    if (point.L >= chosen.L) continue
    if (best.L % point.L !== 0) continue
    if (point.score <= best.score * (1 + tieTolerance)) chosen = point
  }

  const neighbors = points.filter(
    (point) => point.L !== chosen.L && Math.abs(point.L - chosen.L) <= refineRadius,
  )
  if (neighbors.length === 0) {
    return {
      L: chosen.L,
      score: round4(chosen.score),
      sharpness: 0,
      confidence: 'low',
      reason: `曲线只有 L=${chosen.L} 一个候选，没法判断周期清晰度（扫描区间太窄）`,
    }
  }
  const neighborMin = Math.min(...neighbors.map((point) => point.score))
  const sharpness = neighborMin > 0 ? (neighborMin - chosen.score) / neighborMin : 0
  const dominance = neighborMin > 0 ? chosen.score / neighborMin : chosen.score > 0 ? 1 : 0
  const dominantOk = dominance < dominanceRatio
  const sharpOk = sharpness > sharpnessThreshold
  const confidence: PeriodPick['confidence'] = dominantOk && sharpOk ? 'high' : dominantOk || sharpOk ? 'medium' : 'low'
  if (confidence !== 'low') {
    return { L: chosen.L, score: round4(chosen.score), sharpness: round4(sharpness), confidence }
  }
  return {
    L: chosen.L,
    score: round4(chosen.score),
    sharpness: round4(sharpness),
    confidence,
    reason:
      `曲线平缓：最优 L=${chosen.L} 分数 ${round4(chosen.score)}，邻居最低 ${round4(neighborMin)}，` +
      `只差 ${(sharpness * 100).toFixed(1)}%（要 <${dominanceRatio}× 邻居且锐度 >${(sharpnessThreshold * 100).toFixed(0)}% 才算清晰）` +
      '→ 动作本身不严格周期，建议按一次性动作处理',
  }
}

// ─────────────────────────────── 反推采样率 ───────────────────────────────

export interface FpsSuggestion {
  /** 建议交付的帧数（从 targetMultiples 里挑的）。 */
  targetFrames: number
  /** 建议的新采样率：`targetFrames / periodSec`。 */
  fps: number
  /** 周期秒数 = `periodFrames / preFps`。 */
  periodSec: number
}

/**
 * 由周期反推"让帧数等于 T"的采样率：`P = L / preFps`，挑让 `|T/P − preFps|` 最小的 T，
 * `fps = T / P`（方法论 §2 步骤 5）。
 *
 * 挑 `T` 的标准是**新采样率离预采样率最近**——换采样率越少，重采出来的帧越不糊、越不像
 * "插值凑数"。分数一样近时取更小的 T（帧少、排版省）。
 */
export function suggestFps(periodFrames: number, preFps: number, targetMultiples: number[] = [24, 48]): FpsSuggestion {
  const L = Number(periodFrames)
  const fpsPre = Number(preFps)
  if (!Number.isFinite(L) || L <= 0) throw new Error(`周期帧数必须是正数（收到 ${String(periodFrames)}）`)
  if (!Number.isFinite(fpsPre) || fpsPre <= 0) throw new Error(`预采样帧率必须是正数（收到 ${String(preFps)}）`)
  const wanted = (Array.isArray(targetMultiples) ? targetMultiples : [])
    .map((value) => Math.floor(Number(value)))
    .filter((value) => Number.isFinite(value) && value >= 2)
  if (wanted.length === 0) throw new Error('targetMultiples 里没有可用的目标帧数（至少给一个 ≥2 的整数，例如 [24,48]）')
  const periodSec = L / fpsPre
  let bestT = wanted[0]!
  let bestGap = Math.abs(bestT / periodSec - fpsPre)
  for (const T of wanted) {
    const gap = Math.abs(T / periodSec - fpsPre)
    if (gap < bestGap - 1e-9 || (Math.abs(gap - bestGap) <= 1e-9 && T < bestT)) {
      bestT = T
      bestGap = gap
    }
  }
  return { targetFrames: bestT, fps: round4(bestT / periodSec), periodSec: round4(periodSec) }
}

// ─────────────────────────────── 闭合度 ───────────────────────────────

export interface LoopClosureCheck {
  /** `frameDiff(末帧, 首帧)`。 */
  firstLastDiff: number
  /** 相邻帧平均差（`mean_i frameDiff(i, i+1)`）。 */
  adjacentDiff: number
  ok: boolean
}

/**
 * 闭合度判据：`|firstLast − adjacent| / adjacent < tolerance`（默认 0.5）。
 *
 * 两边都要看：
 * - 首尾差 **≈ 0** → 还有重复帧（第 T 帧就是第 0 帧，没丢）；
 * - 首尾差 **明显大于** 相邻帧差 → 没闭合，跳过去就是跳变。
 */
export function closureOf(firstLastDiff: number, adjacentDiff: number, tolerance = 0.5): LoopClosureCheck {
  const firstLast = Number(firstLastDiff)
  const adjacent = Number(adjacentDiff)
  if (!Number.isFinite(firstLast) || !Number.isFinite(adjacent)) {
    throw new Error(`闭合度需要两个有限数（收到 ${String(firstLastDiff)} / ${String(adjacentDiff)}）`)
  }
  const ok = adjacent > 0 ? Math.abs(firstLast - adjacent) / adjacent < tolerance : firstLast <= 0
  return { firstLastDiff: round4(firstLast), adjacentDiff: round4(adjacent), ok }
}

/** body-core 掩膜里有多少前景像素（诊断用：掩膜空掉的话，差异全都没意义）。 */
export function maskArea(mask: MaskImage): number {
  let area = 0
  for (let i = 0; i < mask.data.length; i++) if (mask.data[i] === 1) area++
  return area
}

/**
 * 「周期是不是被下限过滤成了 2/3 倍」——给 `minPeriodSec` 兜底。
 *
 * 2026-11-13 实测踩中：一段真周期 1.17s 的动作，用默认 `minPeriodSec=2` 扫，
 * 区间下界（L≥24）把真周期 L=14 直接排除，自相关只能报 L=28 —— **2 倍周期，且不吭声**。
 * 用户拿到 `periodFrames=28 / confidence=high` 会照做，交付物就是"每两拍才闭一次"。
 *
 * 所以：只要最优 L 的 1/2、1/3 落在扫描下界之外（＝根本没被试过），就单独复核一次它们的分数；
 * 只要不比 L 差太多（1.2 倍以内），就报警并给出"把 minPeriodSec 调到多少重扫"的具体建议。
 *
 * @param periodFrames 已选定的周期（帧）
 * @param fullScore 该周期在全分辨率上的分数
 * @param divisor 2 或 3
 * @param divisorScore 该 1/divisor 周期在全分辨率上的分数
 * @param lowerBound 扫描区间下界（帧）：只有「候选 < 下界」才说明它压根没参选
 * @param fps 预采样帧率（用来把建议换算成秒）
 * @returns 需要报警时的中文文案；不该报就 null
 */
export function multipleSuspectWarning(
  periodFrames: number,
  fullScore: number,
  divisor: number,
  divisorScore: number,
  lowerBound: number,
  fps: number,
): string | null {
  const candidate = Math.round(periodFrames / divisor)
  // 少数几帧当「一个循环」没有意义（12fps 下 4 帧 = 0.33s），只会制造噪音
  if (!Number.isFinite(candidate) || candidate < 4) return null
  // 只有"它被下限挡在门外"时才需要复核 —— 区间内的话 pickPeriod 已经比过了
  if (candidate >= lowerBound) return null
  if (!(fullScore >= 0)) return null
  if (!(divisorScore < fullScore * 1.2)) return null
  const sec = (candidate / (fps > 0 ? fps : 12)).toFixed(2)
  return (
    `周期可能是 ${divisor} 倍：L=${candidate}（约 ${sec}s）的分数 ${divisorScore.toFixed(2)} 与 L=${periodFrames}（${fullScore.toFixed(2)}）接近，` +
    `但它被扫描下界（L≥${lowerBound}）挡住了没参选。` +
    `如果这段动作用 ${sec}s 就能闭一次，把 loop.minPeriodSec 调到 ≤${sec} 重扫。`
  )
}


/**
 * 供调用方按"帧数/帧率"把 `minPeriodSec` 换成扫描区间，并**显式**报出被夹的情况。
 *
 * 为什么要这个函数：`minPeriodSec=2` 在「4s × 12fps = 48 帧」上等价于 L≥24，而上界
 * `floor(48/2)=24` —— 区间会退化成单点，pickPeriod 只能给 low。这里把上界放宽到
 * 至少 `lo+2`（或 `N-2`），并把这件事写进 `warnings`，不静默。
 */
export function scanRangeFor(
  frames: number,
  preFps: number,
  minPeriodSec: number,
): { lo: number; hi: number; warnings: string[] } {
  const n = Math.max(4, Math.floor(frames))
  const fps = Number(preFps) > 0 ? Number(preFps) : 12
  const wantedLo = Math.max(2, Math.round(Number(minPeriodSec ?? 2) * fps))
  const half = Math.max(2, Math.floor(n / 2))
  const maxLo = Math.max(2, n - 2)
  const lo = Math.min(wantedLo, maxLo)
  let hi = Math.min(Math.max(half, lo), n - 1)
  const warnings: string[] = []
  if (wantedLo > maxLo) {
    warnings.push(
      `minPeriodSec=${minPeriodSec}s × ${fps}fps = L≥${wantedLo} 已超出本段可测范围（共 ${n} 帧），下界被压到 L=${lo}`,
    )
  }
  if (hi - lo < 2 && n - 1 > hi) {
    const widened = Math.min(n - 1, lo + Math.max(2, Math.round(lo * 0.5)))
    warnings.push(
      `扫描区间 [${lo},${hi}] 只有 ${hi - lo + 1} 个候选，自相关判不出锐度；已把上界放宽到 ${widened}（要更准就调小 minPeriodSec）`,
    )
    hi = widened
  }
  return { lo, hi, warnings }
}
