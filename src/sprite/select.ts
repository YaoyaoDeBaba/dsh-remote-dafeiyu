/**
 * sprite/select —— 准绳图「取哪一格」的纯核（P2-6）。
 *
 * 为什么需要它：`sprite_baseline` 原来只会取第 0 格。姿势差异大的动画（吹哨首帧手臂下垂、
 * 后仰惊吓）首帧的 bbox 高度天然比别帧矮 6%，于是一组本身没问题的产物被判成"身高不一致"。
 * 正确做法是让调用方按**语义**挑一格（或退回"最接近中位数"的一格），而不是押在首帧上。
 *
 * 两条口径（都写进返回的 `basis`，不让人猜）：
 * - `tallest`：先全量量 bbox，再对**bbox 最高的若干格**猜语义身高（`semantic.ts` 的默认判据）；
 *   猜到了就按语义高排序，一个都没猜到才退回 bbox 高——语义身高才是"角色高度"，
 *   bbox 会把呆毛/尾巴/挂件算进去。
 * - `median`：bbox 高度取中位数，选**最接近它**的那一格（偶数格时同距取较高的，再同距取序号小的）。
 *
 * 这个文件只碰像素、不碰文件/浏览器（node:test 里拿合成图直接钉）。
 */
import { cellContentOf, CONTENT_ALPHA_CUT, medianOf, type PixelRect } from './contact.js'
import type { RgbaImage } from './match.js'
import { guessSemanticHeight } from './semantic.js'

/** 一次「猜语义身高」最多猜几格（每格一次 body-core 掩膜 + 两轮扫描，12 格够挑出最高的了）。 */
export const SELECT_SEMANTIC_LIMIT = 12

/** 选格子的口径（`number` = 固定格号，向后兼容）。 */
export type BaselineCellMode = 'fixed' | 'tallest' | 'median'

export interface BaselineGrid {
  cols: number
  rows: number
  cellWidth: number
  cellHeight: number
}

export interface BaselineSelection {
  /** 选出来的格子序号（行优先，0 起）。 */
  cellIndex: number
  /** 选它的依据：固定格号 / 语义身高 / bbox 高。 */
  basis: 'fixed' | 'semantic' | 'bbox'
  /** 选它时它的高度（`fixed` 口径下为 0——没量过，调用方自己会再量）。 */
  heightPx: number
  /** 一共量了几格（`fixed` 为 0）。 */
  cellsScanned: number
  /** 其中猜出了语义身高的格数（`fixed` 为 0）。 */
  semanticCells: number
  /** 一句话说明这次怎么选的（进 warnings 用的原文，便于对账）。 */
  note?: string
}

/** 从整张图集里裁出一格（越界自动夹紧；合成图/测试图也一样用）。 */
function cropCell(image: RgbaImage, rect: PixelRect): RgbaImage {
  const x0 = Math.max(0, Math.round(rect.x))
  const y0 = Math.max(0, Math.round(rect.y))
  const x1 = Math.min(image.width, x0 + Math.max(0, Math.round(rect.w)))
  const y1 = Math.min(image.height, y0 + Math.max(0, Math.round(rect.h)))
  const width = Math.max(1, x1 - x0)
  const height = Math.max(1, y1 - y0)
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const srcRow = (y0 + y) * image.width
    for (let x = 0; x < width; x++) {
      const from = (srcRow + x0 + x) * 4
      const to = (y * width + x) * 4
      rgba[to] = image.rgba[from]!
      rgba[to + 1] = image.rgba[from + 1]!
      rgba[to + 2] = image.rgba[from + 2]!
      rgba[to + 3] = image.rgba[from + 3]!
    }
  }
  return { width, height, rgba }
}

/**
 * 选一格（P2-6）。
 *
 * `mode` 是数字时**不量任何格子**（与老行为一字不差：越界由调用方报"超出网格"）；
 * `tallest` / `median` 才会全量扫一遍 bbox，`tallest` 再对候选格猜语义身高。
 */
export function selectBaselineCell(
  image: RgbaImage,
  grid: BaselineGrid,
  mode: number | 'tallest' | 'median',
  alphaThreshold = CONTENT_ALPHA_CUT,
): BaselineSelection {
  const cols = Math.max(1, Math.floor(grid.cols))
  const rows = Math.max(1, Math.floor(grid.rows))
  const cellWidth = Math.max(1, Math.round(grid.cellWidth))
  const cellHeight = Math.max(1, Math.round(grid.cellHeight))
  const totalCells = cols * rows

  if (typeof mode === 'number') {
    const cellIndex = Math.max(0, Math.floor(mode))
    if (cellIndex >= totalCells) {
      throw new Error(`cellIndex=${cellIndex} 超出网格（${cols}×${rows}，最大序号 ${totalCells - 1}）`)
    }
    return { cellIndex, basis: 'fixed', heightPx: 0, cellsScanned: 0, semanticCells: 0 }
  }

  const cells = Array.from({ length: totalCells }, (_one, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const rect: PixelRect = { x: col * cellWidth, y: row * cellHeight, w: cellWidth, h: cellHeight }
    const content = cellContentOf(image, rect, index, col, row, alphaThreshold)
    return { index, rect, heightPx: content.charHeightPx, empty: content.empty }
  })
  const filled = cells.filter((cell) => !cell.empty)
  if (filled.length === 0) {
    return {
      cellIndex: 0,
      basis: 'bbox',
      heightPx: 0,
      cellsScanned: totalCells,
      semanticCells: 0,
      note: `全量量了 ${totalCells} 格，一格内容都没有（拼错/全透？），退回第 0 格`,
    }
  }
  const heights = filled.map((cell) => cell.heightPx)
  const medianHeight = medianOf(heights)

  if (mode === 'median') {
    // 与 measureSheet 的"代表格"同口径：最接近中位数 → 同距取较高的 → 再同距取序号小的。
    let chosen = filled[0]!
    for (const cell of filled) {
      const gap = Math.abs(cell.heightPx - medianHeight)
      const best = Math.abs(chosen.heightPx - medianHeight)
      if (gap < best || (gap === best && cell.heightPx > chosen.heightPx) || (gap === best && cell.heightPx === chosen.heightPx && cell.index < chosen.index)) {
        chosen = cell
      }
    }
    return {
      cellIndex: chosen.index,
      basis: 'bbox',
      heightPx: chosen.heightPx,
      cellsScanned: totalCells,
      semanticCells: 0,
      note: `cellIndex=median：量了 ${filled.length}/${totalCells} 格，bbox 高中位数 ${medianHeight}px → 第 ${chosen.index} 格（${chosen.heightPx}px）`,
    }
  }

  // tallest：先按 bbox 挑候选（最高的一段），再在候选里猜语义身高（语义优先，猜不到才用 bbox）。
  const shortlist = [...filled]
    .sort((a, b) => b.heightPx - a.heightPx || a.index - b.index)
    .slice(0, SELECT_SEMANTIC_LIMIT)
  const ranked = shortlist.map((cell) => {
    const guess = guessSemanticHeight(cropCell(image, cell.rect))
    const semantic = guess.ok && typeof guess.height === 'number' && guess.height > 0 ? guess.height : null
    return {
      index: cell.index,
      bboxHeightPx: cell.heightPx,
      semanticHeightPx: semantic,
      usePx: semantic ?? cell.heightPx,
    }
  })
  let best = ranked[0]!
  for (const entry of ranked) {
    // 语义优先：有语义高的格子排在只有 bbox 的格子前面（同分再比 bbox、最后比序号）。
    const better =
      entry.usePx > best.usePx ||
      (entry.usePx === best.usePx && entry.bboxHeightPx > best.bboxHeightPx) ||
      (entry.usePx === best.usePx && entry.bboxHeightPx === best.bboxHeightPx && entry.index < best.index)
    if (better) best = entry
  }
  const semanticCells = ranked.filter((entry) => entry.semanticHeightPx !== null).length
  const basis = best.semanticHeightPx === null ? 'bbox' : 'semantic'
  const note =
    `cellIndex=tallest：量了 ${filled.length}/${totalCells} 格，` +
    `在 bbox 最高的 ${ranked.length} 格里猜语义身高（猜出 ${semanticCells} 格）→ 第 ${best.index} 格` +
    `（${basis === 'semantic' ? `语义高 ${best.semanticHeightPx}px` : `bbox 高 ${best.bboxHeightPx}px（语义身高没猜出来）`}）`
  return { cellIndex: best.index, basis, heightPx: best.usePx, cellsScanned: totalCells, semanticCells, note }
}
