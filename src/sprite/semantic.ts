/**
 * sprite/semantic —— 「语义身高」到底量的是什么，以及 `measured` 那组字段怎么定下来。
 *
 * 为什么单独一个文件（P1-5 的根）：`measureSheet` 只会量 **alpha 包围盒**——呆毛/尾巴/挂件
 * 全算进身高，同一组素材 bbox 339~357，而语义身高（发带下沿→鞋底）316~317，差 4~6%。
 * 拿 bbox 去对 `targetCharHeight`（语义口径）**必然"不收敛"**：试 2~3 轮也只是绕着同一个偏差打转。
 * 所以这里做三件事：
 *
 * 1. `guessSemanticHeight`：没给 span 时，用**现有扫描原语**（`scan.ts` 的 `findBodyTop` /
 *    `findBodyBottom` + `body-core` 掩膜）在一格上猜一次身高上下端。**纯猜**，调用方必须 warning；
 * 2. `resolveMeasuredBasis`：把「调用方给的 span / 猜出来的 / 只剩 bbox」三条路收敛成
 *    `measured` 的 `basis` 与 `charHeightPx`（口径只有一处决定，不散在 service 里）；
 * 3. 这里**不写第二份扫描实现**：判据（channel/op/value/多列投票/行扫描）全在 `scan.ts`。
 *
 * 坐标系：一格是**图集格子像素**（左上原点、右下开区间），与 `contact.ts` 的 `perCell` 同口径。
 */
import type { MaskImage, RgbaImage } from './match.js'
import { bodyCoreMask } from './loop.js'
import { findBodyBottom, findBodyTop, type ScanPixelSource } from './scan.js'
import type { MeasuredBasis, MeasureLandmarkResult } from './types.js'

/**
 * 上端猜测的默认判据：`whiteness > 0`（低饱和 + 高亮度，见 `scan.ts` 的 `WHITENESS_*`）。
 * 为什么用 min 聚合：附属物只会让个别列偏上，min 取"最先出现白的那一列"。
 */
export const GUESS_TOP_PROBE = { channel: 'whiteness', op: '>', value: 0 } as const

/**
 * 下端猜测的默认判据：深色 `luma < 110`（鞋底/贴地的深色影子）。
 * 为什么用行扫描 + 连续像素数：只看"这一行有多少命中"会被散落的阴影/碎屑满足。
 */
export const GUESS_BOTTOM_PROBE = { channel: 'luma', op: '<', value: 110 } as const

/** 上端"连续多少行才算数"：格子高的 5%（下限 2 行）——挡掉高光/抗锯齿的 1~2 行。 */
export function guessTopMinRun(cellHeight: number): number {
  const h = Math.max(0, Math.round(Number(cellHeight) || 0))
  return Math.max(2, Math.round(h * 0.05))
}

/** 下端"行内连续多少像素才算数"：格子宽的 6%（下限 3px）——挡掉碎点阴影。 */
export function guessBottomMinRunPx(cellWidth: number): number {
  const w = Math.max(0, Math.round(Number(cellWidth) || 0))
  return Math.max(3, Math.round(w * 0.06))
}

/** 把一格的 RGBA 包成扫描原语要的像素源（原语只要求能按 (x,y) 取 [r,g,b,a]）。 */
function gridOf(image: RgbaImage): ScanPixelSource {
  return {
    width: image.width,
    height: image.height,
    rgbaAt: (x: number, y: number): [number, number, number, number] => {
      const i = (y * image.width + x) * 4
      return [image.rgba[i]!, image.rgba[i + 1]!, image.rgba[i + 2]!, image.rgba[i + 3]!]
    },
  }
}

/** 掩膜里前景像素的包围盒；全空返回 null（不返回一个"看着像 bbox 的空区间"）。 */
function maskBBox(mask: MaskImage): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = mask.width
  let y0 = mask.height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < mask.height; y++) {
    const row = y * mask.width
    for (let x = 0; x < mask.width; x++) {
      if (mask.data[row + x] !== 1) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return x1 < 0 || y1 < 0 ? null : { x0, y0, x1, y1 }
}

/**
 * 多列投票要扫哪几列：在**主体**（body-core）的横向中间 60% 里等距取 5 列。
 * 只扫中间是因为两端多半是手臂/披风/尾巴——它们不承担"身高上端"这个语义。
 */
function pickColumns(x0: number, x1: number): number[] {
  const width = x1 - x0 + 1
  if (width <= 1) return [x0]
  const out: number[] = []
  for (let i = 0; i < 5; i++) {
    const x = Math.round(x0 + (width - 1) * (0.3 + 0.4 * (i / 4)))
    if (!out.includes(x)) out.push(x)
  }
  return out.length > 0 ? out : [x0]
}

export interface SemanticGuessOptions {
  /** 上端判据（默认 `GUESS_TOP_PROBE`）。 */
  topProbe?: { channel: string; op: string; value: number }
  /** 下端判据（默认 `GUESS_BOTTOM_PROBE`）。 */
  bottomProbe?: { channel: string; op: string; value: number }
  /** 上端连续多少行才算数（默认见 `guessTopMinRun`）。 */
  topMinRun?: number
  /** 下端行内连续多少像素才算数（默认见 `guessBottomMinRunPx`）。 */
  bottomMinRunPx?: number
}

/** `guessSemanticHeight` 的回执：`ok:false` 时一定带 `reason`（别让调用方猜"为什么没有值"）。 */
export interface SemanticGuess {
  ok: boolean
  /** 身高上端（格子坐标，y-from-top）。 */
  topY: number | null
  /** 身高下端。 */
  bottomY: number | null
  /** `bottomY − topY + 1`。 */
  height: number | null
  top?: MeasureLandmarkResult
  bottom?: MeasureLandmarkResult
  reason?: string
}

/**
 * 在一格上**猜**语义身高：上端用 `whiteness` 多列取 min，下端用 `luma<110` 行扫描。
 *
 * 前提（会写进 warning）：这是一套**与素材无关的默认判据**，对不上（比如角色没有白色头部装饰、
 * 鞋也不是深色）就该由调用方显式给 `span`——工具不替调用方决定"什么算身高"。
 */
export function guessSemanticHeight(image: RgbaImage, options: SemanticGuessOptions = {}): SemanticGuess {
  const fail = (reason: string, top?: MeasureLandmarkResult, bottom?: MeasureLandmarkResult): SemanticGuess => ({
    ok: false,
    topY: null,
    bottomY: null,
    height: null,
    ...(top ? { top } : {}),
    ...(bottom ? { bottom } : {}),
    reason,
  })
  const width = Math.round(Number(image?.width ?? 0))
  const height = Math.round(Number(image?.height ?? 0))
  if (!(width > 0 && height > 0)) return fail(`这一格是空图（${String(width)}x${String(height)}），没法猜身高`)

  const box = maskBBox(bodyCoreMask(image))
  if (!box) return fail('这一格里没有主体（body-core 掩膜是空的），没法猜身高')

  const grid = gridOf(image)
  const top = findBodyTop(grid, {
    columns: pickColumns(box.x0, box.x1),
    fromY: box.y0,
    toY: box.y1,
    probe: { ...(options.topProbe ?? GUESS_TOP_PROBE), minRun: options.topMinRun ?? guessTopMinRun(height) },
    aggregate: 'min',
  })
  if (top.found !== true || typeof top.py !== 'number') {
    return fail('上端没猜出来（whiteness 判据在这格的主体列上一条连续段都没命中）', top)
  }

  const bandCenter = width > 0 ? (box.x0 + box.x1) / 2 / width : 0.5
  const bottom = findBodyBottom(grid, {
    fromY: top.py,
    toY: box.y1,
    probe: { ...(options.bottomProbe ?? GUESS_BOTTOM_PROBE) },
    band: { centerFrac: bandCenter, widthFrac: 0.4 },
    minRunPx: options.bottomMinRunPx ?? guessBottomMinRunPx(width),
  })
  if (bottom.found !== true || typeof bottom.py !== 'number') {
    return fail('下端没猜出来（luma<110 在中央竖带里没扫到够长的连续段）', top, bottom)
  }
  if (bottom.py <= top.py) {
    return fail(`下端（第 ${bottom.py} 行）不在上端（第 ${top.py} 行）下面，这次猜测不可用`, top, bottom)
  }
  return { ok: true, topY: top.py, bottomY: bottom.py, height: bottom.py - top.py + 1, top, bottom }
}

/** bbox 口径的告警：**必须**让调用方知道"这个数是包围盒，不是语义身高"。 */
export const BBOX_BASIS_WARNING =
  'measured 的口径是 bbox（alpha 包围盒）：呆毛/尾巴/挂件都会被算进身高，同一组素材与语义身高能差 4~6%——' +
  '要按语义对齐请显式给 span（身高上端→身高下端，帧像素）'

/** 猜测口径的告警：猜出来的数只在本批素材上成立，换素材必须重看。 */
export const GUESSED_BASIS_WARNING =
  '语义身高是猜的（whiteness 上端 / luma<110 下端，默认判据），素材不匹配请显式给 span'

export interface MeasuredBasisInput {
  /** alpha 包围盒口径的内容高（`measureSheet` 量出来的中位数）。 */
  bboxHeight: number
  /** 调用方给的 span（**源帧像素**，含端点）。 */
  span?: { fromY: number; toY: number }
  /** span 的口径（默认 `semantic`）。 */
  spanBasis?: 'semantic' | 'bbox'
  /**
   * 页面回的实际缩放比（格子 px / 源帧 px）。**用 `scaleTo.achievedPx / scaleTo.sourcePx`
   * 算出来，不要用 `scaleTo.scale`**——那个字段的单位是"百分比"（100 = 1:1）。
   */
  ratio?: number
  /** 猜出来的语义身高（没猜 / 没猜成就是 null）。 */
  guessedHeight?: number | null
  /** 猜测失败的原因（只用来把 warning 写得更具体，不影响结论）。 */
  guessReason?: string
}

export interface MeasuredBasisResult {
  bboxHeight: number
  semanticHeight: number | null
  basis: MeasuredBasis
  /** 本次采用的身高（semantic/guessed 时是语义身高，bbox 时等于 bboxHeight）。 */
  charHeightPx: number
  warnings: string[]
}

/**
 * 决定 `measured` 的基准。优先级（顺序就是可信度）：
 *
 * 1. 给了 span 且声明是语义 span ⇒ `semanticHeight = round(spanLen × ratio)`，`basis:"semantic"`；
 * 2. span 是 bbox 口径（auto/batch 那种），或干脆没给 span ⇒ 猜到了就 `basis:"guessed"`；
 *    但**spanBasis:'bbox' 时基准仍取 bbox**——那个 span 只说明了"缩放绑在包围盒上"，
 *    拿猜出来的语义身高去当收敛基准会改变成品的实际像素尺寸（向后兼容不允许）；
 * 3. 猜不到 ⇒ `basis:"bbox"`，`charHeightPx = bboxHeight`，并 warning。
 */
export function resolveMeasuredBasis(input: MeasuredBasisInput): MeasuredBasisResult {
  const bboxHeight = Number.isFinite(input.bboxHeight) ? Math.max(0, Math.round(input.bboxHeight)) : 0
  const guessed =
    typeof input.guessedHeight === 'number' && Number.isFinite(input.guessedHeight) && input.guessedHeight > 0
      ? Math.round(input.guessedHeight)
      : null
  const span = input.span
  const spanSemantic = input.spanBasis !== 'bbox'
  const ratio = typeof input.ratio === 'number' && Number.isFinite(input.ratio) && input.ratio > 0 ? input.ratio : null

  if (span && spanSemantic) {
    const spanLen = Math.abs(Math.round(span.toY) - Math.round(span.fromY)) + 1
    if (ratio !== null && spanLen > 0) {
      const semanticHeight = Math.round(spanLen * ratio)
      return { bboxHeight, semanticHeight, basis: 'semantic', charHeightPx: semanticHeight, warnings: [] }
    }
    // 有语义 span 但拿不到缩放比：宁可退回 bbox 并说清楚，也不编一个"语义身高"。
    return {
      bboxHeight,
      semanticHeight: guessed,
      basis: 'bbox',
      charHeightPx: bboxHeight,
      warnings: [`拿到了 span 但算不出缩放比（scaleTo 没回 sourcePx/achievedPx），这次按 bbox 口径：${BBOX_BASIS_WARNING}`],
    }
  }

  if (span && !spanSemantic) {
    // span 只是"缩放绑在包围盒上"；基准仍是真实的 bbox 实测（与以前一致），语义身高只作参考。
    return {
      bboxHeight,
      semanticHeight: guessed,
      basis: 'bbox',
      charHeightPx: bboxHeight,
      warnings: [BBOX_BASIS_WARNING],
    }
  }

  if (guessed !== null) {
    return {
      bboxHeight,
      semanticHeight: guessed,
      basis: 'guessed',
      charHeightPx: guessed,
      warnings: [GUESSED_BASIS_WARNING],
    }
  }

  return {
    bboxHeight,
    semanticHeight: null,
    basis: 'bbox',
    charHeightPx: bboxHeight,
    warnings: [BBOX_BASIS_WARNING, ...(input.guessReason ? [`语义身高没猜出来：${input.guessReason}`] : [])],
  }
}
