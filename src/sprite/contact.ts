/**
 * sprite/contact —— 拼图/量图的**纯核**：格子切分、alpha 包围盒、中位数聚合、画线合成。
 *
 * 为什么单独成文件：`sprite_export` 的 `measured`（成品实测）与 `sprite_baseline`（准绳图）
 * 都是"在像素上下判断"的活，判据必须能在 node:test 里拿**合成像素**直接钉死
 * （不依赖真图、不依赖浏览器、不依赖文件系统）。所以这里：
 * 1. **不 import 任何运行时代码**（只有 `import type`）：解码在调用方做（`png.ts`），
 *    落盘在调用方做（`encode.ts` 的编码器）；
 * 2. 坐标系**一律是"输入图自己的像素空间"**（左上原点、右下开区间），y 全部 y-from-top；
 *    归一化锚点（y-from-bottom）只在 `composeBaseline` 的入口换成像素，别处不混用；
 * 3. **不许静默降级**：量不到内容（整格 alpha 全透）如实报 `empty:true` 并进 warnings，
 *    不拿 0 冒充"身高 0px 也是成功"。
 */
import type { RgbaImage } from './match.js'

/** 判「这个像素算内容」的 alpha 阈值，与 `analyze.ts` / `sprite_measure` 同口径。 */
export const CONTENT_ALPHA_CUT = 32

/** 抽样门槛：格子数 ≤ 它就全量量，否则等间隔抽 `SAMPLE_LIMIT` 格。 */
export const FULL_SCAN_LIMIT = 48
export const SAMPLE_LIMIT = 12

/** 一个矩形（输入图像素空间）。 */
export interface PixelRect {
  x: number
  y: number
  w: number
  h: number
}

/** 单格内容的实测结果（**格子坐标**，y-from-top）。 */
export interface CellContent {
  /** 格子序号（行优先，0 起）。 */
  index: number
  col: number
  row: number
  /** alpha>阈值 像素的包围盒（格子坐标）；空格子为 null。 */
  bbox: PixelRect | null
  /** 内容高 = soleY − headTopY + 1；空格子为 0。 */
  charHeightPx: number
  /** 内容最上面那一行（格子坐标，y-from-top）；空格子 null。 */
  headTopY: number | null
  /** 内容最下面那一行；空格子 null。 */
  soleY: number | null
  /** true = 这一格里一个 alpha>阈值的像素都没有（网格比帧数大时的末尾格子）。 */
  empty: boolean
  /** true = 内容顶到了格子某条边（缩放/裁剪把主体切了）。 */
  clipped: boolean
}

/** `measureSheet` 的口径与聚合结果。 */
export interface SheetMeasurement {
  /** 抽样格子里内容高的**中位数**（个别帧的手/特效不该把结论带跑）。 */
  charHeightPx: number
  /**
   * 取「最接近中位数」的那一格的头顶/脚底行；偶数格时中位数可能落在两格中间，
   * 这时允许 `soleY − headTopY + 1` 与 `charHeightPx` 差 1px（perCell 里有逐格真值可对账）。
   */
  headTopY: number | null
  soleY: number | null
  cellWidth: number
  cellHeight: number
  /** 网格总格子数（cols×rows），不是帧数。 */
  totalCells: number
  /** 实际量了哪些格（全量时就是 0..totalCells-1）。 */
  perCell: CellContent[]
  /** true = 格子数 > FULL_SCAN_LIMIT，只抽了 SAMPLE_LIMIT 格。 */
  sampled: boolean
  min: { charHeightPx: number }
  max: { charHeightPx: number }
  /** 明确这是「把导出的成品解回像素再量的」，不是参数回显。 */
  source: 'sheet-rgba'
  warnings: string[]
}

export interface MeasureSheetOptions {
  cols: number
  rows: number
  cellWidth: number
  cellHeight: number
  alphaThreshold?: number
  /** 覆盖抽样门槛（测试用；正常不传）。 */
  fullScanLimit?: number
  sampleLimit?: number
}

/** 中位数（偶数个取中间两个的均值，四舍五入到整数像素）。空数组抛错，不返回 NaN。 */
export function medianOf(values: number[]): number {
  if (values.length === 0) throw new Error('medianOf 需要至少一个数（空集合没有中位数）')
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
}

/**
 * 抽样要量哪些格子。
 * ≤ limit 全量；多于此则**等间隔**取 `take` 个，并且一定包含首格与末格
 * （不含末格时，"最后一格是不是空的"这种最典型的问题会被系统性漏掉）。
 */
export function sampleCellIndices(total: number, limit = FULL_SCAN_LIMIT, take = SAMPLE_LIMIT): number[] {
  const count = Math.max(0, Math.floor(total))
  if (count === 0) return []
  if (count <= limit) return Array.from({ length: count }, (_one, index) => index)
  const picks = Math.max(2, Math.min(count, Math.floor(take)))
  const step = (count - 1) / (picks - 1)
  const out: number[] = []
  for (let i = 0; i < picks; i++) {
    const index = Math.round(i * step)
    if (out[out.length - 1] !== index) out.push(index)
  }
  return out
}

/** 量一格：只扫这一格的像素，返回内容包围盒（空格子 bbox=null）。 */
export function cellContentOf(
  image: RgbaImage,
  cell: PixelRect,
  index: number,
  col: number,
  row: number,
  alphaThreshold = CONTENT_ALPHA_CUT,
): CellContent {
  const x0 = Math.max(0, Math.round(cell.x))
  const y0 = Math.max(0, Math.round(cell.y))
  const x1 = Math.min(image.width, x0 + Math.max(0, Math.round(cell.w)))
  const y1 = Math.min(image.height, y0 + Math.max(0, Math.round(cell.h)))
  let minX = x1
  let minY = y1
  let maxX = -1
  let maxY = -1
  for (let y = y0; y < y1; y++) {
    const rowBase = y * image.width
    for (let x = x0; x < x1; x++) {
      if (image.rgba[(rowBase + x) * 4 + 3]! <= alphaThreshold) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0 || maxY < 0) {
    return { index, col, row, bbox: null, charHeightPx: 0, headTopY: null, soleY: null, empty: true, clipped: false }
  }
  // 返回**格子坐标**（相对格子左上角），调用方直接拿去画线/对账。
  const bbox: PixelRect = { x: minX - x0, y: minY - y0, w: maxX - minX + 1, h: maxY - minY + 1 }
  const left = x0 > 0 ? x0 : 0
  const top = y0 > 0 ? y0 : 0
  const right = x1 < image.width ? x1 : image.width
  const bottom = y1 < image.height ? y1 : image.height
  const clipped =
    (minX <= left && left > 0) ||
    (minY <= top && top > 0) ||
    (maxX >= right - 1 && right < image.width) ||
    (maxY >= bottom - 1 && bottom < image.height)
  return {
    index,
    col,
    row,
    bbox,
    charHeightPx: maxY - minY + 1,
    headTopY: bbox.y,
    soleY: bbox.y + bbox.h - 1,
    empty: false,
    clipped,
  }
}

/**
 * 量整张图集：按格子切开，每格算 alpha 包围盒，聚合用**中位数**。
 *
 * `perCell` 的坐标是**格子坐标**（y-from-top），与 `ExportResult.measured` 的契约一致；
 * 换算到图集绝对坐标只要 `cellY + headTopY`（overlay 就是这么画的）。
 */
export function measureSheet(image: RgbaImage, options: MeasureSheetOptions): SheetMeasurement {
  const cols = Math.max(1, Math.floor(options.cols))
  const rows = Math.max(1, Math.floor(options.rows))
  const cellWidth = Math.max(1, Math.round(options.cellWidth))
  const cellHeight = Math.max(1, Math.round(options.cellHeight))
  const alphaThreshold = options.alphaThreshold ?? CONTENT_ALPHA_CUT
  const totalCells = cols * rows
  const indices = sampleCellIndices(totalCells, options.fullScanLimit ?? FULL_SCAN_LIMIT, options.sampleLimit ?? SAMPLE_LIMIT)

  const perCell: CellContent[] = []
  for (const index of indices) {
    const col = index % cols
    const row = Math.floor(index / cols)
    perCell.push(
      cellContentOf(
        image,
        { x: col * cellWidth, y: row * cellHeight, w: cellWidth, h: cellHeight },
        index,
        col,
        row,
        alphaThreshold,
      ),
    )
  }

  const filled = perCell.filter((cell) => !cell.empty)
  const warnings: string[] = []
  const sampled = indices.length < totalCells
  if (sampled) {
    warnings.push(
      `成品共 ${totalCells} 格（>${FULL_SCAN_LIMIT}），只等间隔抽了 ${indices.length} 格实测；` +
        `要全量看就用 sprite_measure 逐帧量。`,
    )
  }
  if (filled.length === 0) {
    warnings.push(
      `成品图抽样格子里量不到任何内容（alpha>${alphaThreshold} 的像素一个都没有）——` +
        '不是"身高 0px"，是这张图可能全透/拼错了，先看核对图。',
    )
  } else if (filled.length < perCell.length) {
    warnings.push(`抽样 ${perCell.length} 格里有 ${perCell.length - filled.length} 格是空的（网格比帧数大时末尾正常留空）`)
  }
  const clipped = perCell.filter((cell) => cell.clipped)
  if (clipped.length > 0) {
    warnings.push(
      `有 ${clipped.length} 格的内容顶到了格子边缘（第 ${clipped
        .slice(0, 3)
        .map((cell) => cell.index)
        .join('、')} 格）——缩放/裁剪把主体切了，这一格的身高会偏小。`,
    )
  }

  if (filled.length === 0) {
    return {
      charHeightPx: 0,
      headTopY: null,
      soleY: null,
      cellWidth,
      cellHeight,
      totalCells,
      perCell,
      sampled,
      min: { charHeightPx: 0 },
      max: { charHeightPx: 0 },
      source: 'sheet-rgba',
      warnings,
    }
  }

  const heights = filled.map((cell) => cell.charHeightPx)
  const median = medianOf(heights)
  // 代表格：取最接近中位数的那一格（同距取较高的，让"差 1px"落在安全侧的偏大方向）。
  let representative = filled[0]!
  for (const cell of filled) {
    const gap = Math.abs(cell.charHeightPx - median)
    const best = Math.abs(representative.charHeightPx - median)
    if (gap < best || (gap === best && cell.charHeightPx > representative.charHeightPx)) representative = cell
  }
  return {
    charHeightPx: median,
    headTopY: representative.headTopY,
    soleY: representative.soleY,
    cellWidth,
    cellHeight,
    totalCells,
    perCell,
    sampled,
    min: { charHeightPx: Math.min(...heights) },
    max: { charHeightPx: Math.max(...heights) },
    source: 'sheet-rgba',
    warnings,
  }
}

/** 某格是否偏离中位数超过阈值（overlay 用黄色标出来的那些格）。 */
export function deviates(cell: CellContent, median: number, pct = 0.05): boolean {
  if (cell.empty || median <= 0) return false
  return Math.abs(cell.charHeightPx - median) / median > pct
}

// ─────────────────────────────── 颜色与绘制 ───────────────────────────────

export interface RgbaColor {
  r: number
  g: number
  b: number
  /** 0~255。 */
  a: number
}

/** `#RRGGBB` / `#RRGGBBAA` / 不带 # 都认；不认就抛错（不悄悄退回黑色）。 */
export function parseColorHex(hex: string, label = 'color'): RgbaColor {
  const text = String(hex ?? '').trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(text)) {
    throw new Error(`${label} 不是合法的 #RRGGBB（或 #RRGGBBAA）：${String(hex)}`)
  }
  return {
    r: Number.parseInt(text.slice(0, 2), 16),
    g: Number.parseInt(text.slice(2, 4), 16),
    b: Number.parseInt(text.slice(4, 6), 16),
    a: text.length === 8 ? Number.parseInt(text.slice(6, 8), 16) : 255,
  }
}

/** 新建一张图：先铺底色（默认全透明）。 */
export function createImage(width: number, height: number, fill?: RgbaColor): RgbaImage {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const rgba = new Uint8Array(w * h * 4)
  if (fill) {
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = fill.r
      rgba[i * 4 + 1] = fill.g
      rgba[i * 4 + 2] = fill.b
      rgba[i * 4 + 3] = fill.a
    }
  }
  return { width: w, height: h, rgba }
}

/** source-over 叠一个像素（越界、全透明都静默跳过——画线不该因为 1px 超界就报错）。 */
function plotOver(image: RgbaImage, x: number, y: number, color: RgbaColor): void {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px < 0 || py < 0 || px >= image.width || py >= image.height) return
  const sa = color.a / 255
  if (sa <= 0) return
  const i = (py * image.width + px) * 4
  const da = image.rgba[i + 3]! / 255
  const outA = sa + da * (1 - sa)
  if (outA <= 0) {
    image.rgba[i] = 0
    image.rgba[i + 1] = 0
    image.rgba[i + 2] = 0
    image.rgba[i + 3] = 0
    return
  }
  const mix = (s: number, d: number): number => Math.round((s * sa + d * da * (1 - sa)) / outA)
  image.rgba[i] = mix(color.r, image.rgba[i]!)
  image.rgba[i + 1] = mix(color.g, image.rgba[i + 1]!)
  image.rgba[i + 2] = mix(color.b, image.rgba[i + 2]!)
  image.rgba[i + 3] = Math.round(outA * 255)
}

/** 深色描边的口径：纯黑、半透明（在浅背景上也能把高饱和线衬出来）。 */
const HALO: RgbaColor = { r: 0, g: 0, b: 0, a: 120 }

/**
 * 1px 横线（含 x0、x1 两端）。
 * `halo` 默认 true：上下各加一条半透明黑边——深色背景靠线本身亮，浅色背景靠黑边衬。
 */
export function drawHLine(
  image: RgbaImage,
  x0: number,
  x1: number,
  y: number,
  color: RgbaColor,
  halo = true,
): void {
  const from = Math.min(x0, x1)
  const to = Math.max(x0, x1)
  if (halo) {
    for (let x = from; x <= to; x++) {
      plotOver(image, x, y - 1, HALO)
      plotOver(image, x, y + 1, HALO)
    }
  }
  for (let x = from; x <= to; x++) plotOver(image, x, y, color)
}

/** 1px 竖线（含 y0、y1 两端），描边规则同 `drawHLine`。 */
export function drawVLine(
  image: RgbaImage,
  x: number,
  y0: number,
  y1: number,
  color: RgbaColor,
  halo = true,
): void {
  const from = Math.min(y0, y1)
  const to = Math.max(y0, y1)
  if (halo) {
    for (let y = from; y <= to; y++) {
      plotOver(image, x - 1, y, HALO)
      plotOver(image, x + 1, y, HALO)
    }
  }
  for (let y = from; y <= to; y++) plotOver(image, x, y, color)
}

/** 十字（锚点标记）：臂长 `arm` 像素。 */
export function drawCross(image: RgbaImage, x: number, y: number, color: RgbaColor, arm = 4): void {
  drawHLine(image, x - arm, x + arm, y, color)
  drawVLine(image, x, y - arm, y + arm, color)
}

/** 把 src 的整幅（或 `region`）叠到 dst 的 (dx,dy)，source-over（透明区不覆盖）。 */
export function blit(dst: RgbaImage, src: RgbaImage, dx: number, dy: number, region?: PixelRect): void {
  const rect = region ?? { x: 0, y: 0, w: src.width, h: src.height }
  const sx0 = Math.max(0, Math.round(rect.x))
  const sy0 = Math.max(0, Math.round(rect.y))
  const sx1 = Math.min(src.width, sx0 + Math.max(0, Math.round(rect.w)))
  const sy1 = Math.min(src.height, sy0 + Math.max(0, Math.round(rect.h)))
  for (let y = sy0; y < sy1; y++) {
    for (let x = sx0; x < sx1; x++) {
      const i = (y * src.width + x) * 4
      const a = src.rgba[i + 3]!
      if (a === 0) continue
      plotOver(dst, x - sx0 + dx, y - sy0 + dy, { r: src.rgba[i]!, g: src.rgba[i + 1]!, b: src.rgba[i + 2]!, a })
    }
  }
}

/** 图集副本（overlay 不能改到导出图本身）。 */
export function cloneImage(image: RgbaImage): RgbaImage {
  return { width: image.width, height: image.height, rgba: new Uint8Array(image.rgba) }
}

export interface CellOverlayOptions {
  /** 归一化锚点（anchorX 按格宽、anchorY 是 y-from-bottom）。 */
  anchorX: number
  anchorY: number
  /** 偏离中位数多少算异常格（默认 5%，异常格整格画黄线）。 */
  deviationPct?: number
}

export interface CellOverlayResult {
  image: RgbaImage
  /** 被判成异常（|身高−中位数|/中位数 > 阈值）的格子序号。 */
  flagged: number[]
}

/**
 * 导出核对图：在**图集副本**上逐格画三条线——
 * 品红 = 实测头顶行、青 = 实测脚底行、白色十字 = 当前锚点位置；
 * `charHeightPx` 偏离中位数超过 `deviationPct` 的格子整格改成**黄色**，一眼能看出是哪些格不对。
 *
 * 只画 `measurement.perCell` 里真实量过的那几格（>48 格时是抽样的 12 格）——
 * 没量过的格子不画线，调用方会在 warnings 里被告知"核对图只画了抽样的 N 格"。
 */
export function drawCellOverlay(
  sheet: RgbaImage,
  measurement: SheetMeasurement,
  options: CellOverlayOptions,
): CellOverlayResult {
  const image = cloneImage(sheet)
  const headColor = parseColorHex('#ff00ff', 'headColor')
  const soleColor = parseColorHex('#00e5ff', 'soleColor')
  const anchorColor = parseColorHex('#ffffff', 'anchorColor')
  const warnColor = parseColorHex('#ffd400', 'warnColor')
  const pct = options.deviationPct ?? 0.05
  const flagged: number[] = []
  for (const cell of measurement.perCell) {
    const cellX = cell.col * measurement.cellWidth
    const cellY = cell.row * measurement.cellHeight
    const odd = deviates(cell, measurement.charHeightPx, pct)
    if (odd) flagged.push(cell.index)
    const head = odd ? warnColor : headColor
    const sole = odd ? warnColor : soleColor
    if (cell.headTopY !== null) {
      drawHLine(image, cellX, cellX + measurement.cellWidth - 1, cellY + cell.headTopY, head, true)
    }
    if (cell.soleY !== null) {
      drawHLine(image, cellX, cellX + measurement.cellWidth - 1, cellY + cell.soleY, sole, true)
    }
    // 锚点十字：格子坐标 → 图集绝对坐标（anchorY 是 y-from-bottom，先翻成 y-from-top）。
    const ax = cellX + Math.max(0, Math.min(measurement.cellWidth - 1, Math.round(options.anchorX * measurement.cellWidth)))
    const ay =
      cellY +
      Math.max(0, Math.min(measurement.cellHeight - 1, Math.round((1 - options.anchorY) * measurement.cellHeight)))
    drawCross(image, ax, ay, odd ? warnColor : anchorColor, Math.max(3, Math.round(measurement.cellWidth / 32)))
  }
  return { image, flagged }
}

// ─────────────────────────────── 准绳图合成 ───────────────────────────────
/** 准绳图里的一格里要用的东西（调用方已从 meta 读好）。 */
export interface BaselineCellInput {
  name: string
  /** 整张图集的像素（已解码）。 */
  image: RgbaImage
  /** 取第几格（行优先）。 */
  cellIndex: number
  cols: number
  cellWidth: number
  cellHeight: number
  /** 归一化锚点（0~1；anchorY 是 **y-from-bottom**，与 meta.json 同口径）。 */
  anchorX: number
  anchorY: number
}

export interface BaselineOptions {
  /** 格与格之间的横向空隙（像素），默认 8。 */
  gap?: number
  /** 底色，默认 #202030（中性深灰，品红/青都看得清）。 */
  background?: string
  /** 四周留白，默认 4。 */
  padding?: number
  alphaThreshold?: number
}

export interface BaselineItem {
  name: string
  /** 这一格实测的内容高（成品像素，不是 meta 里的参数回显）。 */
  charHeightPx: number
  anchorX: number
  anchorY: number
  /** 锚点在格子里的像素位置（格子坐标，y-from-top）。 */
  anchorXPx: number
  anchorYPx: number
  headTopY: number | null
  soleY: number | null
  /** 这一格贴在画布上的左上角。 */
  drawX: number
  drawY: number
  empty: boolean
}

export interface BaselineComposed {
  image: RgbaImage
  width: number
  height: number
  /** 地平线（所有锚点落在同一行），画布坐标 y-from-top。 */
  baselineY: number
  /** 头顶线（各格实测最高点的中位数），画布坐标；全空时为 null。 */
  headTopY: number | null
  items: BaselineItem[]
  warnings: string[]
}

/**
 * 把几张图集按**锚点对齐到同一条地平线**，画成一张准绳图。
 *
 * 对齐公式（全部 y-from-top，像素）：
 * ```
 * anchorYPx_i = round((1 − anchorY_i) × cellHeight_i)      // 锚点在格子里的行
 * topSpace    = max_i anchorYPx_i                          // 画布上方的最大需求
 * bottomSpace = max_i (cellHeight_i − anchorYPx_i)         // 下方
 * baselineY   = padding + topSpace                         // 所有锚点都落在这一行
 * drawY_i     = baselineY − anchorYPx_i
 * drawX_i     = padding + Σ_{j<i}(cellWidth_j + gap)
 * width       = 2·padding + Σ cellWidth_j + gap·(n−1)
 * height      = 2·padding + topSpace + bottomSpace
 * ```
 * 头顶线取 `median(drawY_i + headTopY_i)`——**不是**某一张图的头顶，
 * 这样个别帧的呆毛/特效拔高不会把参考线带跑。
 */
export function composeBaseline(inputs: BaselineCellInput[], options: BaselineOptions = {}): BaselineComposed {
  if (inputs.length === 0) throw new Error('准绳图需要至少一张图集')
  const gap = Math.max(0, Math.round(options.gap ?? 8))
  const padding = Math.max(0, Math.round(options.padding ?? 4))
  const alphaThreshold = options.alphaThreshold ?? CONTENT_ALPHA_CUT
  const background = parseColorHex(options.background ?? '#202030', 'background')

  const anchors = inputs.map((input) => {
    if (!(input.anchorX >= 0 && input.anchorX <= 1)) throw new Error(`${input.name} 的 anchorX 不在 0~1：${input.anchorX}`)
    if (!(input.anchorY >= 0 && input.anchorY <= 1)) throw new Error(`${input.name} 的 anchorY 不在 0~1：${input.anchorY}`)
    const cellWidth = Math.max(1, Math.round(input.cellWidth))
    const cellHeight = Math.max(1, Math.round(input.cellHeight))
    const anchorYPx = Math.max(0, Math.min(cellHeight - 1, Math.round((1 - input.anchorY) * cellHeight)))
    const anchorXPx = Math.max(0, Math.min(cellWidth - 1, Math.round(input.anchorX * cellWidth)))
    return { input, cellWidth, cellHeight, anchorYPx, anchorXPx }
  })

  const topSpace = Math.max(...anchors.map((one) => one.anchorYPx))
  const bottomSpace = Math.max(...anchors.map((one) => one.cellHeight - one.anchorYPx))
  const width = 2 * padding + anchors.reduce((sum, one) => sum + one.cellWidth, 0) + gap * (anchors.length - 1)
  const height = 2 * padding + topSpace + bottomSpace
  const image = createImage(width, height, background)
  const baselineY = padding + topSpace

  const items: BaselineItem[] = []
  const warnings: string[] = []
  let cursorX = padding
  for (const one of anchors) {
    const { input, cellWidth, cellHeight, anchorYPx, anchorXPx } = one
    const drawX = cursorX
    const drawY = baselineY - anchorYPx
    const cols = Math.max(1, Math.floor(input.cols))
    const cellIndex = Math.max(0, Math.floor(input.cellIndex))
    const col = cellIndex % cols
    const row = Math.floor(cellIndex / cols)
    // 只搬这一格：整张图集可能有几十格，全搬上去就成不了"按顺序排开"的准绳图。
    blit(image, input.image, drawX, drawY, {
      x: col * cellWidth,
      y: row * cellHeight,
      w: cellWidth,
      h: cellHeight,
    })
    const content = cellContentOf(
      input.image,
      { x: col * cellWidth, y: row * cellHeight, w: cellWidth, h: cellHeight },
      cellIndex,
      col,
      row,
      alphaThreshold,
    )
    if (content.empty) {
      warnings.push(`${input.name} 的第 ${cellIndex} 格是空的（量不到内容），这一条不参与头顶线`)
    }
    items.push({
      name: input.name,
      charHeightPx: content.charHeightPx,
      anchorX: input.anchorX,
      anchorY: input.anchorY,
      anchorXPx,
      anchorYPx,
      headTopY: content.headTopY,
      soleY: content.soleY,
      drawX,
      drawY,
      empty: content.empty,
    })
    cursorX += cellWidth + gap
  }

  // 三条参考线：地平线（青）、头顶线（品红）、每格竖向中轴（绿）。
  const baselineColor = parseColorHex('#00e5ff', 'baselineColor')
  const headColor = parseColorHex('#ff00ff', 'headColor')
  const axisColor = parseColorHex('#33ff99', 'axisColor')
  const filled = items.filter((item) => !item.empty)
  const headTops = filled.map((item) => item.drawY + (item.headTopY ?? 0))
  const headTopY = headTops.length > 0 ? medianOf(headTops) : null

  for (const item of items) {
    drawVLine(image, item.drawX + item.anchorXPx, 0, height - 1, axisColor, true)
  }
  drawHLine(image, 0, width - 1, baselineY, baselineColor, true)
  if (headTopY !== null) drawHLine(image, 0, width - 1, headTopY, headColor, true)
  if (filled.length > 0) {
    // 每格头顶各点一个小十字，方便看清"这条线是怎么来的"。
    for (const item of filled) {
      drawCross(image, item.drawX + item.anchorXPx, item.drawY + (item.headTopY ?? 0), headColor, 3)
    }
  }

  const heights = filled.map((item) => item.charHeightPx)
  if (heights.length > 1) {
    const median = medianOf(heights)
    const spread = (Math.max(...heights) - Math.min(...heights)) / Math.max(1, median)
    if (spread > 0.01) {
      warnings.push(
        `组内身高差 ${(spread * 100).toFixed(1)}%（最大 ${Math.max(...heights)}px / 最小 ${Math.min(...heights)}px），` +
          '超过 1% 就该查是哪一条的缩放/裁剪出了问题。',
      )
    }
    // 身高一样但头顶行错开 = 锚点口径/锚点值不一致：光看身高差发现不了，图上却一眼能看出错位。
    const topSpread = Math.max(...headTops) - Math.min(...headTops)
    const tolerance = Math.max(2, Math.round(median * 0.01))
    if (topSpread > tolerance) {
      warnings.push(
        `各格头顶行极差 ${topSpread}px（容差 ${tolerance}px）：身高虽然一样，但锚点/锚点口径不一致，` +
          '图上能看到头顶错位——先核对 meta 的 anchorX/anchorY 是否同一套。',
      )
    }
  }

  return { image, width, height, baselineY, headTopY, items, warnings }
}
