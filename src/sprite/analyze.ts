/**
 * sprite/analyze —— 把「抠得好不好」变成数字。
 *
 * 这是 agent 迭代抠图参数的判据来源：几个比例各自盯一类失败
 * （背景没抠干净 / 主体被啃掉 / 边缘留绿边 / alpha 分档是否健康）。
 * 全部是纯函数：同样的 PNG 一定得到同样的数字，方便对比两轮参数的好坏。
 */
import { decodePng } from './png.js'

export interface SpriteStats {
  width: number
  height: number
  /** alpha > 阈值（默认 32）的像素的最小外接矩形；一个都没有就是 null。 */
  bbox: { x: number; y: number; w: number; h: number } | null
  /** 图像**边框带**里 alpha > 阈值的占比（边框带定义见 bandWidth）。越低越好，合格 < 0.01。 */
  bgResidual: number
  /** bbox 内 alpha > 阈值的占比。越高越好，目标 > 0.98。 */
  subjectCoverage: number
  /** bbox 往外扩 2px 的环上「G 明显高于 R 和 B」的像素占比。目标 < 0.10。 */
  edgeGreen: number
  /** 0-32 / 32-128 / 128-192 / 192-255 四档占比，和为 1。 */
  alphaHistogram: [number, number, number, number]
}

const DEFAULT_ALPHA_CUT = 32

/**
 * 通道差阈值：绿边通常是未去干净的绿幕/草地反射，G 同时压过 R、B 才判定，
 * 避免把正常的黄绿或青色误判成绿边。
 */
const GREEN_MARGIN = 12

/** 边缘环外扩的像素数。 */
const EDGE_RING = 2

/** 边框带最窄 4px；大图按短边 6% 取，保证不同尺寸的图看到的是同一块「背景」比例。 */
const MIN_BAND = 4
const BAND_RATIO = 0.06

/**
 * 边框带宽度。
 *
 * 为什么背景残渣统计的是「贴着图边的一圈」而不是 bbox 之外：
 * bbox 和残渣阈值是同一个 alphaCut 算出来的，bbox 外按定义不可能存在
 * alpha > 阈值的像素 —— 旧口径下 bgResidual 恒为 0，恒等于 0 的指标等于没有指标，
 * agent 会误以为每一轮都抠干净了。贴边一圈是人眼「这肯定是背景」的区域，
 * 不依赖 bbox，才照得出没去干净的花屏/地板/上一帧残影。
 *
 * 小图（短边 ≤ 2 * band）整张图都落在带里，主体像素也会被统计进去。
 * 这不是 bug：这种尺寸本来就分不出「背景」，如实报出来比粉饰成 0 安全。
 */
function bandWidth(width: number, height: number): number {
  return Math.max(MIN_BAND, Math.round(Math.min(width, height) * BAND_RATIO))
}

/**
 * 分析一张 PNG 的抠图质量。
 * @param png PNG 原始字节
 * @param options.alphaCut 判定「不透明」的 alpha 阈值，0~255 的整数，默认 32
 */
export function analyzeSpritePng(png: Buffer, options?: { alphaCut?: number }): SpriteStats {
  const alphaCut = options?.alphaCut ?? DEFAULT_ALPHA_CUT
  if (!Number.isInteger(alphaCut) || alphaCut < 0 || alphaCut > 255) {
    throw new Error(`alphaCut 必须是 0~255 的整数，实际收到 ${String(alphaCut)}`)
  }

  const { width, height, rgba } = decodePng(png)
  const total = width * height

  // 第一遍：bbox + alpha 直方图 + 边框带残渣。直方图分档是固定的规格，与 alphaCut 无关。
  const band = bandWidth(width, height)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let bandPixels = 0
  let bandOpaque = 0
  let bin0 = 0
  let bin1 = 0
  let bin2 = 0
  let bin3 = 0

  for (let y = 0; y < height; y++) {
    const inBandRow = y < band || y >= height - band
    for (let x = 0; x < width; x++) {
      const alpha = rgba[(y * width + x) * 4 + 3]!
      if (alpha <= 32) bin0++
      else if (alpha <= 128) bin1++
      else if (alpha <= 192) bin2++
      else bin3++

      // 离任意一条边不超过 band 就算边框带；四角天然被 OR 覆盖。
      if (inBandRow || x < band || x >= width - band) {
        bandPixels++
        if (alpha > alphaCut) bandOpaque++
      }

      if (alpha > alphaCut) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  const bbox = maxX >= 0 ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null

  // 第二遍：bbox 内有多少不透明像素（subjectCoverage 的分子）。
  let insideOpaque = 0
  if (bbox !== null) {
    for (let y = bbox.y; y < bbox.y + bbox.h; y++) {
      for (let x = bbox.x; x < bbox.x + bbox.w; x++) {
        if (rgba[(y * width + x) * 4 + 3]! > alphaCut) insideOpaque++
      }
    }
  }

  // 带内像素总数为 0 只可能发生在 0×0 图（解码器已拒绝），这里仍兜一下。
  const bgResidual = bandPixels === 0 ? 0 : bandOpaque / bandPixels

  const subjectCoverage = bbox === null ? 0 : insideOpaque / (bbox.w * bbox.h)

  // 边缘环：bbox 外扩 2px 后再挖掉 bbox 本身，并裁到图内。
  // 环上的像素不看 alpha（规格要求包含 alpha 高的像素），只看颜色是不是偏绿。
  let edgeGreen = 0
  if (bbox !== null) {
    const x0 = Math.max(0, bbox.x - EDGE_RING)
    const x1 = Math.min(width - 1, bbox.x + bbox.w - 1 + EDGE_RING)
    const y0 = Math.max(0, bbox.y - EDGE_RING)
    const y1 = Math.min(height - 1, bbox.y + bbox.h - 1 + EDGE_RING)
    let ring = 0
    let green = 0
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const inBox = x >= bbox.x && x < bbox.x + bbox.w && y >= bbox.y && y < bbox.y + bbox.h
        if (inBox) continue
        ring++
        const i = (y * width + x) * 4
        const r = rgba[i]!
        const g = rgba[i + 1]!
        const b = rgba[i + 2]!
        if (g > r + GREEN_MARGIN && g > b + GREEN_MARGIN) green++
      }
    }
    edgeGreen = ring === 0 ? 0 : green / ring
  }

  return {
    width,
    height,
    bbox,
    bgResidual,
    subjectCoverage,
    edgeGreen,
    alphaHistogram: [bin0 / total, bin1 / total, bin2 / total, bin3 / total],
  }
}
