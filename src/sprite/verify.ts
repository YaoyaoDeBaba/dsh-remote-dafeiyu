/**
 * sprite/verify —— 一批产物的**一致性自检**（纯函数，不碰浏览器）。
 *
 * 为什么有它：单份 meta 全绿不代表这组能交付。2026-11-13 那批 6 条动画，
 * 每条单独看都没问题，**组内身高差到 ±5%**，是人工比对才发现的。
 * 这条把"该由人发现的事"变成"数值判定"：
 *
 *   1. 组内身高方差 ≤1%（用 charHeightPx，**成品口径**，不是参数回显）；
 *   2. 锚点 X 偏差 ≤2px（源帧口径）——归一化 anchorX × cellWidth 折回像素再比；
 *   3. 口径一致（anchorConvention 不许一半 y-from-bottom 一半 y-from-top）；
 *   4. 必备字段齐全（缺 anchorWritten / cellWidth 这类"看着有其实没有"的字段要点名）。
 *
 * 刻意不做的事：**不去重新解码成品图**。那需要像素通道 + 重新量一遍，代价大；
 * 这里只回答"这一组彼此自洽吗"，"每条本身准不准"由 measure/export 的 measured 负责。
 */

/** 参与校验的 meta 形状（宽松：字段都可能缺，缺了要报出来而不是崩）。 */
export interface VerifyMeta {
  name?: string
  charHeightPx?: number
  anchorX?: number
  anchorY?: number
  cellWidth?: number
  cellHeight?: number
  scale?: number
  fps?: number
  anchorConvention?: string
  anchorWritten?: boolean
}

export interface VerifyOptions {
  /** 身高允许的相对偏差，默认 1%。 */
  heightPct?: number
  /** 锚点 X 允许的源帧像素偏差，默认 2px。 */
  anchorPx?: number
  /** 指定基准身高（不给就取中位数）。 */
  referenceCharHeight?: number
}

/** 工具层入参：meta 可以直接给，也可以给文件/目录路径让宿主去读。 */
export interface VerifyArgs extends VerifyOptions {
  /** 直接传 meta 对象（适合调用方手里已经有数据）。 */
  metas?: VerifyMeta[]
  /** meta.json 的路径，或包含它们的目录（目录里所有 .json 都会被读）。 */
  paths?: string[]
}

export interface VerifyItem {
  name: string
  charHeightPx?: number
  /** 相对基准的偏差（0.02 = 偏大 2%）。 */
  deltaPct?: number
  /** 锚点 X 折算到源帧的像素值。 */
  anchorXPx?: number
  /** 与中位数的差（px，带符号）。 */
  deltaAnchorXPx?: number
  problems: string[]
}

export interface VerifyResult {
  ok: boolean
  count: number
  reference?: { charHeightPx: number; anchorXPx?: number }
  tolerance: { heightPct: number; anchorPx: number }
  items: VerifyItem[]
  warnings: string[]
  reason?: string
}

const DEFAULT_HEIGHT_PCT = 0.01
const DEFAULT_ANCHOR_PX = 2

function median(values: number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * 校验一组 meta 是否自洽。
 *
 * @param metas 一组 meta（同一批素材、同一套缩放）
 * @param options 容差与基准
 */
export function verifyConsistency(metas: VerifyMeta[], options: VerifyOptions = {}): VerifyResult {
  const heightPct = options.heightPct ?? DEFAULT_HEIGHT_PCT
  const anchorPx = options.anchorPx ?? DEFAULT_ANCHOR_PX
  const tolerance = { heightPct, anchorPx }

  if (!Array.isArray(metas) || metas.length === 0) {
    return { ok: false, count: 0, tolerance, items: [], warnings: [], reason: '没有可校验的 meta（传进来的列表是空的）' }
  }

  const items: VerifyItem[] = metas.map((meta, index) => {
    const name = (meta.name ?? `#${index + 1}`).toString()
    const problems: string[] = []
    // 必备字段：缺了就别让它"看着有"
    if (typeof meta.charHeightPx !== 'number' || !(meta.charHeightPx > 0)) problems.push('缺 charHeightPx')
    if (typeof meta.anchorX !== 'number') problems.push('缺 anchorX')
    if (typeof meta.anchorY !== 'number') problems.push('缺 anchorY')
    if (meta.anchorWritten === false) problems.push('anchorWritten=false（锚点没落盘，可能是旧版导出）')
    if (typeof meta.cellWidth !== 'number' || meta.cellWidth <= 0) problems.push('缺 cellWidth（锚点无法折算成像素）')
    if (typeof meta.fps !== 'number' || meta.fps <= 0) problems.push('缺 fps')
    const item: VerifyItem = { name, problems }
    if (typeof meta.charHeightPx === 'number') item.charHeightPx = meta.charHeightPx
    // 归一化锚点 × 格子宽 = 该格内的像素位置（源帧口径要求 caller 传源尺度的 meta）
    if (typeof meta.anchorX === 'number' && typeof meta.cellWidth === 'number') {
      item.anchorXPx = Number((meta.anchorX * meta.cellWidth).toFixed(3))
    }
    return item
  })

  const heights = items.map((item) => item.charHeightPx).filter((v): v is number => typeof v === 'number')
  const referenceCharHeight = options.referenceCharHeight ?? median(heights)
  const anchorXs = items.map((item) => item.anchorXPx).filter((v): v is number => typeof v === 'number')
  const referenceAnchorX = anchorXs.length > 0 ? median(anchorXs) : undefined

  const warnings: string[] = []

  if (!Number.isFinite(referenceCharHeight)) {
    warnings.push('没有一条带 charHeightPx，无法比较身高')
  }

  for (const item of items) {
    if (item.charHeightPx !== undefined && Number.isFinite(referenceCharHeight)) {
      const deltaPct = (item.charHeightPx - referenceCharHeight) / referenceCharHeight
      item.deltaPct = Number(deltaPct.toFixed(5))
      if (Math.abs(deltaPct) > heightPct + 1e-9) {
        const sign = deltaPct > 0 ? '偏大' : '偏小'
        warnings.push(
          `${item.name}：身高 ${item.charHeightPx}px，比基准 ${referenceCharHeight}px ${sign} ${(Math.abs(deltaPct) * 100).toFixed(2)}%（容差 ${(heightPct * 100).toFixed(1)}%）`,
        )
      }
    }
    if (item.anchorXPx !== undefined && referenceAnchorX !== undefined) {
      const delta = Number((item.anchorXPx - referenceAnchorX).toFixed(3))
      item.deltaAnchorXPx = delta
      if (Math.abs(delta) > anchorPx + 1e-9) {
        warnings.push(`${item.name}：锚点 X 折 ${item.anchorXPx}px，偏离中位数 ${delta > 0 ? '+' : ''}${delta}px（容差 ${anchorPx}px）`)
      }
    }
    if (item.problems.length > 0) warnings.push(`${item.name}：${item.problems.join('；')}`)
  }

  // 口径混用是最阴的一类错：数值都合理，运行时角色却会跳
  const conventions = new Set(metas.map((meta) => meta.anchorConvention).filter((v): v is string => typeof v === 'string'))
  if (conventions.size > 1) {
    warnings.push(`锚点口径不一致：${[...conventions].join(' / ')}（混用会让切动画时角色跳位）`)
  }
  if (metas.some((meta) => meta.anchorConvention === undefined)) {
    warnings.push('有 meta 缺 anchorConvention（无法判断口径）')
  }

  return {
    ok: warnings.length === 0,
    count: items.length,
    reference: Number.isFinite(referenceCharHeight)
      ? { charHeightPx: referenceCharHeight, ...(referenceAnchorX !== undefined ? { anchorXPx: referenceAnchorX } : {}) }
      : undefined,
    tolerance,
    items,
    warnings,
  }
}
