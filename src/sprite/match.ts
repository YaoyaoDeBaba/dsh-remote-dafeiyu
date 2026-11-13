/**
 * sprite/match —— 三个"重计算"原语的算法核：模板匹配 / 特征反推 / 剪影拟合。
 *
 * 为什么放在宿主 Node 而不是页面里：页面里没有 numpy，纯 JS 在全分辨率上做全搜索会把
 * UI 线程钉死（工具页自己还要响应按钮与预览）；而宿主侧已经有 `png.ts` 的 `decodePng`，
 * 拿一张 dataURL 就能得到 RGBA。页面只负责把像素搬过来，算在 Node 算。
 *
 * 三条纪律（都来自前面踩过的坑）：
 * 1. **这个文件不许引用任何运行时代码**（只有 `import type`）：它要能在 node:test 里
 *    直接拿合成像素跑，不起浏览器、不读文件、不碰时钟——判据才能钉在算法本身。
 * 2. **坐标一律是"输入图自己的像素空间"**（左上原点、右下开区间），返回值带 `space`
 *    标签；调用方换空间（源帧 → 裁剪框 → 格子）是调用方的事，这里不做隐式换算。
 * 3. **不许静默降级**：算不出来（模板是纯色、掩膜是空的、宽度不够做金字塔）一律
 *    返回带 `reason` 的失败结果，而不是给一个"看起来像成功"的 0 分。
 */
import type { Rect } from './types.js'

/** 宿主侧的 RGBA 像素图（与 `png.ts` 的 `DecodedPng` 同形，便于直接传）。 */
export interface RgbaImage {
  width: number
  height: number
  /** 行优先、每像素 4 字节。 */
  rgba: Uint8Array
}

/** 灰度图：所有匹配/搜索都在这个空间里做。 */
export interface GrayImage {
  width: number
  height: number
  data: Float32Array
}

/** 二值掩膜：1 = 前景。 */
export interface MaskImage {
  width: number
  height: number
  data: Uint8Array
}

// ─────────────────────────────── 基础工具 ───────────────────────────────

function intRect(rect: Rect, label: string): Rect {
  const x = Math.round(Number(rect.x))
  const y = Math.round(Number(rect.y))
  const w = Math.round(Number(rect.w))
  const h = Math.round(Number(rect.h))
  if (![x, y, w, h].every((value) => Number.isFinite(value))) {
    throw new Error(`${label} 必须是四个有限数字（x,y,w,h）`)
  }
  if (w <= 0 || h <= 0) throw new Error(`${label} 的宽高必须为正（收到 ${w}x${h}）`)
  return { x, y, w, h }
}

/** 把矩形夹进图内并返回整数矩形；夹完是空的就返回 undefined（不静默当成整幅）。 */
function clampRect(rect: Rect, width: number, height: number): Rect | undefined {
  const x0 = Math.max(0, Math.min(width, Math.round(rect.x)))
  const y0 = Math.max(0, Math.min(height, Math.round(rect.y)))
  const x1 = Math.max(0, Math.min(width, Math.round(rect.x + rect.w)))
  const y1 = Math.max(0, Math.min(height, Math.round(rect.y + rect.h)))
  if (x1 - x0 <= 0 || y1 - y0 <= 0) return undefined
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

function clampNumber(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

/** 保留 4 位小数（模型读数字够用，又不会让 JSON 里出现一长串浮点噪声）。 */
export function round4(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 10000) / 10000
}

export function cropRgba(image: RgbaImage, rect: Rect): RgbaImage {
  const box = intRect(rect, 'rect')
  if (box.x < 0 || box.y < 0 || box.x + box.w > image.width || box.y + box.h > image.height) {
    throw new Error(
      `矩形 ${box.x},${box.y} ${box.w}x${box.h} 超出了帧 ${image.width}x${image.height}（像素坐标，左上原点）`,
    )
  }
  const out = new Uint8Array(box.w * box.h * 4)
  const stride = image.width * 4
  for (let y = 0; y < box.h; y++) {
    const from = (box.y + y) * stride + box.x * 4
    out.set(image.rgba.subarray(from, from + box.w * 4), y * box.w * 4)
  }
  return { width: box.w, height: box.h, rgba: out }
}

const grayCache = new WeakMap<RgbaImage, GrayImage>()

/**
 * 灰度化：`luma × alpha`（预乘）。
 *
 * 为什么要乘 alpha：抠图结果的透明区 RGB 是 0（canvas 语义），而原帧的不透明区 alpha=255，
 * 两者乘完都还是"透明=0"，于是 keyed / raw 两路在同一个公式下一致；不乘的话
 * 半透明羽化边会被当成"很亮的实心像素"，把模板的方差点偏。
 *
 * 按输入对象记忆化：全序列拟合时参考帧会被反复用到（24 帧 = 24 次），
 * 而这张图是同一张——重算纯属浪费。输入被当作不可变（这里从不写回）。
 */
export function toGray(image: RgbaImage): GrayImage {
  const hit = grayCache.get(image)
  if (hit) return hit
  const { width, height, rgba } = image
  const data = new Float32Array(width * height)
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    const alpha = rgba[p + 3]! / 255
    data[i] = (0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!) * alpha
  }
  const gray: GrayImage = { width, height, data }
  grayCache.set(image, gray)
  return gray
}

export function cropGray(image: GrayImage, rect: Rect): GrayImage {
  const box = intRect(rect, 'rect')
  if (box.x < 0 || box.y < 0 || box.x + box.w > image.width || box.y + box.h > image.height) {
    throw new Error(
      `矩形 ${box.x},${box.y} ${box.w}x${box.h} 超出了图 ${image.width}x${image.height}（像素坐标，左上原点）`,
    )
  }
  const data = new Float32Array(box.w * box.h)
  for (let y = 0; y < box.h; y++) {
    const from = (box.y + y) * image.width + box.x
    data.set(image.data.subarray(from, from + box.w), y * box.w)
  }
  return { width: box.w, height: box.h, data }
}

/** 二值掩膜 → 前景点表（搜索时只遍历前景点，代价与 bbox 面积无关）。 */
export interface MaskPoints {
  xs: Int32Array
  ys: Int32Array
  count: number
  area: number
}

export function maskPoints(mask: MaskImage): MaskPoints {
  let count = 0
  for (let i = 0; i < mask.data.length; i++) if (mask.data[i] === 1) count++
  const xs = new Int32Array(count)
  const ys = new Int32Array(count)
  let at = 0
  for (let y = 0; y < mask.height; y++) {
    const row = y * mask.width
    for (let x = 0; x < mask.width; x++) {
      if (mask.data[row + x] === 1) {
        xs[at] = x
        ys[at] = y
        at++
      }
    }
  }
  return { xs, ys, count, area: count }
}

/** 双线性重采样（任意比例）。`scale===1` 直接返回原图，不做无谓的模糊。 */
export function resampleGray(image: GrayImage, scale: number): GrayImage {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(`重采样比例必须是正数（收到 ${scale}）`)
  if (Math.abs(scale - 1) < 1e-9) return image
  const w = Math.max(1, Math.round(image.width * scale))
  const h = Math.max(1, Math.round(image.height * scale))
  const data = new Float32Array(w * h)
  const sx = image.width / w
  const sy = image.height / h
  for (let y = 0; y < h; y++) {
    const fy = clampNumber((y + 0.5) * sy - 0.5, 0, image.height - 1)
    const y0 = Math.floor(fy)
    const wy = fy - y0
    const y1 = Math.min(image.height - 1, y0 + 1)
    for (let x = 0; x < w; x++) {
      const fx = clampNumber((x + 0.5) * sx - 0.5, 0, image.width - 1)
      const x0 = Math.floor(fx)
      const wx = fx - x0
      const x1 = Math.min(image.width - 1, x0 + 1)
      const v00 = image.data[y0 * image.width + x0]!
      const v01 = image.data[y0 * image.width + x1]!
      const v10 = image.data[y1 * image.width + x0]!
      const v11 = image.data[y1 * image.width + x1]!
      data[y * w + x] = (v00 * (1 - wx) + v01 * wx) * (1 - wy) + (v10 * (1 - wx) + v11 * wx) * wy
    }
  }
  return { width: w, height: h, data }
}

const downsampleCache = new WeakMap<GrayImage, Map<number, GrayImage>>()

/**
 * 整数倍盒式降采样（金字塔用）。结果按 (源对象, 倍数) 记忆化：
 * 金字塔每一层都要用同一张降采样图，重复算一遍纯属浪费。
 */
export function downsampleGray(image: GrayImage, factor: number): GrayImage {
  const f = Math.max(1, Math.round(factor))
  if (f === 1) return image
  let bucket = downsampleCache.get(image)
  if (!bucket) {
    bucket = new Map()
    downsampleCache.set(image, bucket)
  }
  const hit = bucket.get(f)
  if (hit) return hit
  const w = Math.max(1, Math.floor(image.width / f))
  const h = Math.max(1, Math.floor(image.height / f))
  const data = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const yStart = y * f
    const yEnd = Math.min(image.height, yStart + f)
    for (let x = 0; x < w; x++) {
      const xStart = x * f
      const xEnd = Math.min(image.width, xStart + f)
      let sum = 0
      let n = 0
      for (let yy = yStart; yy < yEnd; yy++) {
        const row = yy * image.width
        for (let xx = xStart; xx < xEnd; xx++) {
          sum += image.data[row + xx]!
          n++
        }
      }
      data[y * w + x] = n > 0 ? sum / n : 0
    }
  }
  const out: GrayImage = { width: w, height: h, data }
  bucket.set(f, out)
  return out
}

// ─────────────────────────────── 积分图 + NCC ───────────────────────────────

interface Integral {
  /** 行宽 = 图宽 + 1（前面补一排 0，省掉边界判断）。 */
  stride: number
  sum: Float64Array
  sumSq: Float64Array
}

const integralCache = new WeakMap<GrayImage, Integral>()

/**
 * 积分图（含平方和）。
 *
 * 为什么必须有：NCC 的分子里 Σ(G−meanG)² 与 ΣG 每个偏移都要算，逐偏移遍历模板面积
 * 会让"粗搜"直接慢一个量级；积分图把这两项压成 4 次加减。交叉项 ΣT·G 没法用积分图
 * （那是两图的乘，不是单图的矩形和），所以每个偏移仍然要 O(模板面积) —— 这就是金字塔
 * 存在的理由：粗层面积小了 16 倍、偏移少了 16 倍，总代价降到 1/256。
 */
function integralOf(image: GrayImage): Integral {
  const hit = integralCache.get(image)
  if (hit) return hit
  const stride = image.width + 1
  const sum = new Float64Array(stride * (image.height + 1))
  const sumSq = new Float64Array(stride * (image.height + 1))
  for (let y = 0; y < image.height; y++) {
    let rowSum = 0
    let rowSumSq = 0
    const src = y * image.width
    const out = (y + 1) * stride
    const prev = y * stride
    for (let x = 0; x < image.width; x++) {
      const value = image.data[src + x]!
      rowSum += value
      rowSumSq += value * value
      sum[out + x + 1] = sum[prev + x + 1]! + rowSum
      sumSq[out + x + 1] = sumSq[prev + x + 1]! + rowSumSq
    }
  }
  const built: Integral = { stride, sum, sumSq }
  integralCache.set(image, built)
  return built
}

function rectSum(plane: Float64Array, stride: number, x: number, y: number, w: number, h: number): number {
  return plane[(y + h) * stride + x + w]! - plane[y * stride + x + w]! - plane[(y + h) * stride + x]! + plane[y * stride + x]!
}

export interface NccHit {
  x: number
  y: number
  score: number
}

/** 模板的统计量（每偏移都要用，算一次就够）。`undefined` = 纯色，NCC 无定义。 */
interface TemplateStats {
  sumT: number
  sumT2: number
  n: number
  varT: number
}

function templateStatsOf(template: GrayImage): TemplateStats | undefined {
  const n = template.width * template.height
  if (n < 1) return undefined
  let sumT = 0
  let sumT2 = 0
  for (let i = 0; i < n; i++) {
    const value = template.data[i]!
    sumT += value
    sumT2 += value * value
  }
  const varT = sumT2 - (sumT * sumT) / n
  if (!(varT > 1e-9)) return undefined
  return { sumT, sumT2, n, varT }
}

/** 单点 NCC。窗口方差为 0（纯色底）或越界时返回 undefined。 */
function nccAtOffset(
  image: GrayImage,
  template: GrayImage,
  stats: TemplateStats,
  x: number,
  y: number,
): number | undefined {
  const tw = template.width
  const th = template.height
  if (x < 0 || y < 0 || x + tw > image.width || y + th > image.height) return undefined
  const integral = integralOf(image)
  const stride = integral.stride
  const sumG = rectSum(integral.sum, stride, x, y, tw, th)
  const sumG2 = rectSum(integral.sumSq, stride, x, y, tw, th)
  const varG = sumG2 - (sumG * sumG) / stats.n
  if (!(varG > 1e-9)) return undefined
  let cross = 0
  for (let ty = 0; ty < th; ty++) {
    const gRow = (y + ty) * image.width + x
    const tRow = ty * tw
    for (let tx = 0; tx < tw; tx++) cross += template.data[tRow + tx]! * image.data[gRow + tx]!
  }
  return (cross - (stats.sumT * sumG) / stats.n) / Math.sqrt(stats.varT * varG)
}

/**
 * 单个偏移的 NCC 分值（亚像素精修要探 ±1px 的三个点）。
 * 越界或该处窗口方差为 0 时返回 `undefined`——不返回 0，那样抛物线拟合会被假点带偏。
 */
export function nccScoreAt(image: GrayImage, template: GrayImage, x: number, y: number): number | undefined {
  const stats = templateStatsOf(template)
  if (!stats) return undefined
  return nccAtOffset(image, template, stats, x, y)
}

/**
 * 在 `image` 里滑窗搜 `template`，返回 NCC 最高的位置。
 *
 * `score = Σ(T−meanT)(G−meanG) / sqrt(Σ(T−meanT)² · Σ(G−meanG)²)`
 * —— 对亮度线性变化免疫，所以抠图参数微调、整体明暗差一档都不会把分数打崩。
 * 模板方差为 0（纯色）时 NCC 无定义，返回 score:0 而不是 1：纯色块在整幅上处处"相等"，
 * 给 1 会让调用方以为找到了。
 */
export function nccSearch(
  image: GrayImage,
  template: GrayImage,
  options: { rect?: Rect; step?: number } = {},
): NccHit | undefined {
  const tw = template.width
  const th = template.height
  if (tw < 1 || th < 1) return undefined
  if (tw > image.width || th > image.height) return undefined
  const step = Math.max(1, Math.round(options.step ?? 1))
  const wanted = options.rect ?? { x: 0, y: 0, w: image.width, h: image.height }
  const box = clampRect(wanted, image.width, image.height)
  if (!box) return undefined
  const maxX = box.x + box.w - tw
  const maxY = box.y + box.h - th
  if (maxX < box.x || maxY < box.y) return undefined

  const stats = templateStatsOf(template)
  if (!stats) return { x: box.x, y: box.y, score: 0 }
  let best: NccHit | undefined
  for (let y = box.y; y <= maxY; y += step) {
    for (let x = box.x; x <= maxX; x += step) {
      const score = nccAtOffset(image, template, stats, x, y)
      if (score === undefined) continue
      if (!best || score > best.score) best = { x, y, score }
    }
  }
  return best
}

/**
 * 同上，但返回前 k 个互不重叠的峰值（金字塔粗层用：只留一个峰，一旦粗层判错，
 * 后面几层就再也救不回来了）。
 */
export function nccSearchTopK(
  image: GrayImage,
  template: GrayImage,
  options: { rect?: Rect; step?: number; k?: number; minSep?: number } = {},
): NccHit[] {
  const tw = template.width
  const th = template.height
  const k = Math.max(1, Math.round(options.k ?? 3))
  const minSep = Math.max(1, Math.round(options.minSep ?? Math.max(tw, th) / 2))
  if (tw < 1 || th < 1 || tw > image.width || th > image.height) return []
  const step = Math.max(1, Math.round(options.step ?? 1))
  const box = clampRect(options.rect ?? { x: 0, y: 0, w: image.width, h: image.height }, image.width, image.height)
  if (!box) return []
  const maxX = box.x + box.w - tw
  const maxY = box.y + box.h - th
  if (maxX < box.x || maxY < box.y) return []

  const stats = templateStatsOf(template)
  if (!stats) return []
  const hits: NccHit[] = []
  for (let y = box.y; y <= maxY; y += step) {
    for (let x = box.x; x <= maxX; x += step) {
      const score = nccAtOffset(image, template, stats, x, y)
      if (score === undefined) continue
      hits.push({ x, y, score })
    }
  }
  hits.sort((a, b) => b.score - a.score)
  const picked: NccHit[] = []
  for (const hit of hits) {
    if (picked.length >= k) break
    if (picked.some((one) => Math.abs(one.x - hit.x) < minSep && Math.abs(one.y - hit.y) < minSep)) continue
    picked.push(hit)
  }
  return picked
}

/**
 * 粗层候选：`step > 1` 时**必须在候选点周围按 step=1 重搜一遍**。
 *
 * 为什么：NCC 的峰可能只有 1~2px 宽（靶环/纽扣这类高频特征）。实测 step=2 会让一个
 * 真值 1.000 的模板在别处只找到 0.878 的假峰（真峰在奇数像素上，整段搜索直接跳过），
 * 后面几层就全都建在错的位置上了。跳着扫只能用来"找候选"，不能用来"定位置"。
 */
export function nccCandidates(
  image: GrayImage,
  template: GrayImage,
  options: { rect?: Rect; step?: number; k?: number } = {},
): NccHit[] {
  const step = Math.max(1, Math.round(options.step ?? 1))
  const k = Math.max(1, Math.round(options.k ?? 3))
  const rect = options.rect ? { rect: options.rect } : {}
  if (step <= 1) {
    const hit = nccSearch(image, template, rect)
    return hit ? [hit] : []
  }
  const tops = nccSearchTopK(image, template, {
    ...rect,
    step,
    k,
    minSep: Math.max(2 * step, Math.max(template.width, template.height) / 2),
  })
  const radius = 2 * step
  const out: NccHit[] = []
  for (const top of tops) {
    const hit = nccSearch(image, template, {
      rect: {
        x: top.x - radius,
        y: top.y - radius,
        w: template.width + 2 * radius,
        h: template.height + 2 * radius,
      },
      step: 1,
    })
    if (hit) out.push(hit)
  }
  out.sort((a, b) => b.score - a.score)
  return out
}

// ─────────────────────────────── 任务 1：模板匹配 ───────────────────────────────

export interface TemplateMatchResult {
  found: boolean
  /** 命中位置的左上角（**输入图的像素空间**，左上原点）。 */
  x: number
  y: number
  /** NCC 分值（−1~1；同位置自匹配 ≈ 1）。 */
  score: number
  space: 'frame'
  reason?: string
}

/**
 * 模板匹配。
 *
 * 做法：**1/4 → 1/2 → 1 的三级金字塔**（模板短边 <48 只做 1/2→1，<16 直接原分辨率），
 * 粗层全图搜（取前 3 个互不重叠的峰），细层在候选点周围 ±(比例差+1) 的窗口里精修，
 * 最细一层窗口 ±2px。分数以**最细一层**为准，所以"自匹配 ≥0.999"这条自检是硬的。
 *
 * 没写 FFT：全图 720×966、模板 40×40 的规模下，金字塔已经把它压到几十毫秒；
 * 而 FFT 的边界/对齐/窗函数错一个都会给出"看起来很合理"的错误峰值，排查成本高一个量级。
 */
export function matchTemplate(
  source: RgbaImage,
  template: RgbaImage,
  options: { searchRect?: Rect; minScore?: number; maxOpsPerLevel?: number } = {},
): TemplateMatchResult {
  return matchGray(toGray(source), toGray(template), options)
}

export function matchGray(
  source: GrayImage,
  template: GrayImage,
  options: { searchRect?: Rect; minScore?: number; maxOpsPerLevel?: number } = {},
): TemplateMatchResult {
  const tw = template.width
  const th = template.height
  if (tw < 1 || th < 1) return { found: false, x: 0, y: 0, score: 0, space: 'frame', reason: '模板是空的（宽或高 ≤ 0）' }
  const searchRect = options.searchRect ?? { x: 0, y: 0, w: source.width, h: source.height }
  const box = clampRect(searchRect, source.width, source.height)
  if (!box) {
    return { found: false, x: 0, y: 0, score: 0, space: 'frame', reason: '搜索区域与帧没有交集' }
  }
  if (box.w < tw || box.h < th) {
    return {
      found: false,
      x: 0,
      y: 0,
      score: 0,
      space: 'frame',
      reason: `搜索区域 ${box.w}x${box.h} 比模板 ${tw}x${th} 还小（放不下任何一个偏移）`,
    }
  }
  // 纯色模板的 NCC 分母是 0：数学上无定义。这里必须**先判**再搜，否则会回一个 score:0 的
  // "找到"，调用方设 minScore:0 时就会当成命中（纯色块在整幅上处处相等）。
  if (!templateStatsOf(template)) {
    return {
      found: false,
      x: 0,
      y: 0,
      score: 0,
      space: 'frame',
      reason: '模板是纯色/几乎无变化（方差 0），NCC 无定义：换一块有纹理的区域（纽扣、徽章、眼睛）',
    }
  }

  const factors = pyramidFactors(tw, th)
  const budget = options.maxOpsPerLevel ?? 120_000_000
  let candidates: Array<{ factor: number; x: number; y: number; score: number; step: number }> = []
  let first = true
  for (const factor of factors) {
    const image = downsampleGray(source, factor)
    const tpl = downsampleGray(template, factor)
    if (tpl.width < 1 || tpl.height < 1) continue
    if (tpl.width > image.width || tpl.height > image.height) continue
    const next: Array<{ factor: number; x: number; y: number; score: number; step: number }> = []
    if (first) {
      const scaled = clampRect(
        { x: box.x / factor, y: box.y / factor, w: box.w / factor, h: box.h / factor },
        image.width,
        image.height,
      )
      if (!scaled) continue
      const offsets =
        Math.max(1, scaled.w - tpl.width + 1) * Math.max(1, scaled.h - tpl.height + 1)
      const ops = offsets * tpl.width * tpl.height
      const step = ops > budget ? Math.min(8, Math.ceil(Math.sqrt(ops / budget))) : 1
      const hits = nccCandidates(image, tpl, { rect: scaled, step, k: 3 })
      for (const hit of hits) next.push({ factor, x: hit.x, y: hit.y, score: hit.score, step })
      first = false
    } else {
      for (const prev of candidates) {
        const centerX = Math.round((prev.x * prev.factor) / factor)
        const centerY = Math.round((prev.y * prev.factor) / factor)
        const radius = Math.max(2, Math.ceil((prev.step * prev.factor) / factor) + 1)
        const window = {
          x: centerX - radius,
          y: centerY - radius,
          w: tpl.width + 2 * radius,
          h: tpl.height + 2 * radius,
        }
        const hit = nccSearch(image, tpl, { rect: window, step: 1 })
        if (hit) next.push({ factor, x: hit.x, y: hit.y, score: hit.score, step: 1 })
      }
    }
    if (next.length === 0) {
      return {
        found: false,
        x: 0,
        y: 0,
        score: 0,
        space: 'frame',
        reason: `金字塔 1/${factor} 层没能算出候选（模板在该层 ${tpl.width}x${tpl.height}，可能太小）`,
      }
    }
    next.sort((a, b) => b.score - a.score)
    candidates = next.slice(0, 3)
  }

  const best = candidates[0]
  if (!best) {
    return { found: false, x: 0, y: 0, score: 0, space: 'frame', reason: '没有可用的金字塔层（帧太小）' }
  }
  const minScore = clampNumber(options.minScore ?? 0.85, -1, 1)
  const score = best.score
  if (score >= minScore) {
    return { found: true, x: best.x, y: best.y, score: round4(score), space: 'frame' }
  }
  return {
    found: false,
    x: best.x,
    y: best.y,
    score: round4(score),
    space: 'frame',
    reason: `最高分 ${round4(score)} 低于阈值 ${minScore}（位置仍回传，可据此判断"差多少"）`,
  }
}

/** 金字塔层数：按模板短边定，短边 <16 时降采样只会把图案抹成噪声，干脆不做。 */
export function pyramidFactors(templateWidth: number, templateHeight: number): number[] {
  const minDim = Math.min(templateWidth, templateHeight)
  if (minDim >= 32) return [4, 2, 1]
  if (minDim >= 16) return [2, 1]
  return [1]
}

// ─────────────────────────────── 尺度网格 ───────────────────────────────

export interface ScaleRange {
  min?: number
  max?: number
  step?: number
}

/**
 * 生成尺度候选。默认 0.85~1.15（步长 0.01 → 31 档），超过 `cap` 档就**均分整个区间**
 * 而不是硬截断：截断会让"想要 1.2 倍"的调用方永远搜不到。
 */
export function scaleGrid(
  range: ScaleRange = {},
  defaults: { min: number; max: number; step: number } = { min: 0.85, max: 1.15, step: 0.01 },
  cap = 31,
): number[] {
  const lo0 = clampNumber(Number(range.min ?? defaults.min), 0.1, 4)
  const hi0 = clampNumber(Number(range.max ?? defaults.max), 0.1, 4)
  const step0 = clampNumber(Number(range.step ?? defaults.step), 0.001, 1)
  const lo = Math.min(lo0, hi0)
  const hi = Math.max(lo0, hi0)
  const natural = Math.floor((hi - lo) / step0 + 1e-9) + 1
  const count = Math.max(1, Math.min(cap, natural))
  const step = count === 1 ? 0 : (hi - lo) / (count - 1)
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(round4(lo + i * step))
  if (out.length === 0) out.push(round4(lo))
  return out
}

// ─────────────────────────────── 任务 2：特征反推 ───────────────────────────────

export interface FeatureTemplateSpec {
  rect: Rect
  weight?: number
}

export interface FeatureFitOptions {
  templates: FeatureTemplateSpec[]
  scale?: ScaleRange
  /** 上一层（上一帧）的结果：给了就只在它附近搜，动画连续时省一个量级。 */
  seed?: { scale: number; positions: Array<{ x: number; y: number }> }
}

export interface FeatureFrameFit {
  scale: number
  /** 参考图坐标 → 目标图坐标：`p_target = p_ref × scale + (dx, dy)`。 */
  dx: number
  dy: number
  score: number
  /** 各模板各自反推的平移差（目标图像素）；>2px 说明特征被遮挡/形变。 */
  residualPx: number
  perTemplate: Array<{ score: number; x: number; y: number }>
}

interface CropTemplate {
  gray: GrayImage
  origin: { x: number; y: number }
  weight: number
}

/** 一段搜索的中间结果：位置统一换算回**原分辨率**，`scores` 与模板一一对应。 */
interface StageResult {
  scale: number
  score: number
  positions: Array<{ x: number; y: number }>
  scores: number[]
  /** 这一段试过的全部 (尺度, 分值)：尺度峰值是平的，靠它做抛物线插值。 */
  curve: Array<{ scale: number; score: number }>
}

/**
 * 在"分值曲线"上选峰值：**同分区间取中点**。
 *
 * 为什么不能取第一个最高分：降采样之后，相邻几档尺度会得到**同一个像素尺寸的模板**
 * （28px 模板在 1/2 层上，0.97~1.03 全都是 14px），于是同分。取第一个就会落在区间
 * 下端，而下一段的窗口又以下端为中心 → 每段再往下一格，实测会一路 ratchet 到区间下限
 * （0.92 的真值最后报成 0.85）。取中点则正好落在真值上，且后续窗口一定盖住它。
 */
function choosePeak(curve: Array<{ scale: number; score: number }>): number | undefined {
  if (curve.length === 0) return undefined
  let top = -Infinity
  for (const one of curve) if (one.score > top) top = one.score
  let first = -1
  let last = -1
  for (let i = 0; i < curve.length; i++) {
    if (curve[i]!.score >= top - 1e-9) {
      if (first < 0) first = i
      last = i
    }
  }
  const middle = curve[Math.floor((first + last) / 2)]
  return middle?.scale
}

/**
 * 三点抛物线求极值偏移（单位：格），夹在 ±0.5 格内。
 * 夹住是必须的：三点拟合在近平坦的峰上会外推出离谱的值，那个值比"不插值"更差。
 */
function parabolaOffset(before: number, mid: number, after: number): number {
  const denominator = before - 2 * mid + after
  if (!(Math.abs(denominator) > 1e-9)) return 0
  return clampNumber((0.5 * (before - after)) / denominator, -0.5, 0.5)
}

/**
 * 尺度峰值的亚步长估计。
 *
 * 尺度方向的 NCC 峰是**平的**（1.09 与 1.10 常常只差 0.002），取网格点就会系统性地
 * 差半个步长；用三点抛物线插值能把它压到 ±0.2 步长以内。
 */
export function refineScaleParabola(curve: Array<{ scale: number; score: number }>): number | undefined {
  if (curve.length < 3) return undefined
  let peak = 0
  for (let i = 1; i < curve.length; i++) if (curve[i]!.score > curve[peak]!.score) peak = i
  if (peak === 0 || peak === curve.length - 1) return undefined
  const prev = curve[peak - 1]!
  const mid = curve[peak]!
  const next = curve[peak + 1]!
  const step = mid.scale - prev.scale
  if (!(Math.abs(step) > 1e-9)) return undefined
  const delta = parabolaOffset(prev.score, mid.score, next.score)
  return mid.scale + delta * step
}

/**
 * 尺度粗搜在哪一层算：模板短边 <40 时降到 1/4 会只剩 7~10 个像素，图案被抹平，
 * 尺度就判不准了（实测 28px 的圆环在 1/4 层上会被选成 1.13 而不是 1.10）。
 */
function coarseFactorOf(frameWidth: number, frameHeight: number, minTemplateDim: number): number {
  const small = Math.min(frameWidth, frameHeight)
  if (minTemplateDim >= 40 && small >= 128) return 4
  if (minTemplateDim >= 12 && small >= 48) return 2
  return 1
}

/**
 * 单帧的特征反推。
 *
 * 三段搜索（尺度 × 平移一起定，但每段只解一件事）：
 * 1. **尺度粗定**：帧降到 1/4（模板小于 24px 时用 1/2），把尺度按"粗网格"扫一遍，
 *    每个尺度在整幅上做一次 NCC（带成本预算，超了自动加大平移步长）；
 * 2. **尺度细定**：在粗定尺度 ±粗步长 的区间里按调用方给的步长逐档试，平移在
 *    上一段的候选点周围 ±10（该层像素）里精修；
 * 3. **原分辨率收尾**：只在最优尺度 ±2 个步长里试，平移 ±4px。
 *
 * 双模板时 `dx/dy` 取各模板反推平移的加权平均，`residualPx` 是它们之间的最大距离——
 * 那就是"特征一致不一致"的唯一证据。
 */
export function fitFeatureFrame(
  reference: RgbaImage,
  frame: RgbaImage,
  options: FeatureFitOptions,
): FeatureFrameFit {
  const specs = options.templates
  if (!Array.isArray(specs) || specs.length === 0) throw new Error('至少要给 1 个特征模板（templates）')
  if (specs.length > 8) throw new Error(`特征模板最多 8 个（收到 ${specs.length} 个），2 个最稳`)
  const refGray = toGray(reference)
  const frameGray = toGray(frame)
  const templates: CropTemplate[] = specs.map((spec, index) => {
    const rect = intRect(spec.rect, `templates[${index}].rect`)
    const gray = cropGray(refGray, rect)
    return {
      gray,
      origin: { x: rect.x, y: rect.y },
      weight: Math.max(0.0001, Number(spec.weight ?? 1)),
    }
  })
  const minDim = Math.min(...templates.map((one) => Math.min(one.gray.width, one.gray.height)))
  const grid = scaleGrid(options.scale)
  const span = grid[grid.length - 1]! - grid[0]!
  const userStep = grid.length > 1 ? grid[1]! - grid[0]! : 0.01
  // 粗层最多十来档：粗搜的代价是"档数 × 整幅偏移数 × 模板面积"，档数不封顶就没底了；
  // 剩下的分辨率交给后面两段（±粗步长 的细定 + 原分辨率收尾）。
  const coarseStep = Math.max(0.02, span / 9, userStep)

  const evaluate = (
    scales: number[],
    factor: number,
    radius: number,
    seeds: Array<{ x: number; y: number }> | undefined,
  ): StageResult | undefined => {
    const image = downsampleGray(frameGray, factor)
    const results: StageResult[] = []
    for (const scale of scales) {
      let weighted = 0
      let weightSum = 0
      const positions: Array<{ x: number; y: number }> = []
      const scores: number[] = []
      let usable = true
      for (let i = 0; i < templates.length; i++) {
        const one = templates[i]!
        const tpl = resampleGray(one.gray, scale / factor)
        if (tpl.width < 2 || tpl.height < 2 || tpl.width > image.width || tpl.height > image.height) {
          usable = false
          break
        }
        if (!templateStatsOf(tpl)) {
          // 纯色模板的 NCC 无定义：这一档直接不算（不能让它以 0 分"参与竞争"）。
          usable = false
          break
        }
        let rect: Rect
        if (seeds) {
          const seed = seeds[i]!
          const centerX = Math.round(seed.x / factor)
          const centerY = Math.round(seed.y / factor)
          rect = {
            x: centerX - radius,
            y: centerY - radius,
            w: tpl.width + 2 * radius,
            h: tpl.height + 2 * radius,
          }
        } else {
          rect = { x: 0, y: 0, w: image.width, h: image.height }
        }
        const offsets =
          Math.max(1, Math.min(rect.w, image.width) - tpl.width + 1) *
          Math.max(1, Math.min(rect.h, image.height) - tpl.height + 1)
        // **粗搜也要逐像素扫**：NCC 的峰可能只有 1~2px 宽，跳着扫会整体错过它
        // （实测 step=2 时真值 1.000 的模板找不到，反而在别处认了 0.878 的假峰）。
        // 代价靠"粗层档数封顶 + 帧间种子"控制，不靠跳像素。
        const ops = offsets * tpl.width * tpl.height
        if (!seeds && ops > 120_000_000) {
          throw new Error(
            `特征模板太大（缩放后 ${tpl.width}x${tpl.height}）：粗搜要算 ${Math.round(ops / 1e6)}M 次乘加，` +
              '请把模板裁到 16~64px 见方（选纽扣/眼睛这类小而稳的特征，别框整颗头）',
          )
        }
        const hit = nccSearch(image, tpl, { rect, step: 1 })
        if (!hit || hit.score < -0.99) {
          usable = false
          break
        }
        weighted += hit.score * one.weight
        weightSum += one.weight
        positions.push({ x: hit.x * factor, y: hit.y * factor })
        scores.push(hit.score)
      }
      if (!usable || weightSum <= 0) continue
      results.push({ scale, score: weighted / weightSum, positions, scores, curve: [] })
    }
    if (results.length === 0) return undefined
    const curve = results.map((one) => ({ scale: one.scale, score: one.score }))
    const chosen = choosePeak(curve)
    const winner = results.find((one) => one.scale === chosen) ?? results[0]!
    // 整条曲线都带回去：尺度峰是平的，靠它做三点抛物线插值。
    winner.curve = curve
    return winner
  }

  const factor0 = coarseFactorOf(frame.width, frame.height, minDim)
  const midFactor = factor0 > 2 ? 2 : factor0
  const skip = Math.max(1, Math.round(coarseStep / Math.max(userStep, 1e-6)))
  const coarseScales = grid.filter((_value, index) => index % skip === 0)
  let current: StageResult | undefined
  if (options.seed) {
    // 帧间连续：直接在上一帧的尺度/位置附近细化，不做全图粗搜（省一个量级）。
    const seed = options.seed
    const wanted = grid.filter((value) => Math.abs(value - seed.scale) <= coarseStep + 1e-9)
    const seeds = templates.map((_one, index) => seed.positions[index] ?? { x: 0, y: 0 })
    current = evaluate(wanted.length > 0 ? wanted : [seed.scale], midFactor, 10, seeds)
    // 种子失配（换了段素材/姿势突跳）就退回全图粗搜，别把上一帧的答案硬套上来。
    if (current && current.score < 0.6) current = undefined
  }
  if (!current) {
    current = evaluate(coarseScales.length > 0 ? coarseScales : grid, factor0, 0, undefined)
  }
  if (!current) {
    throw new Error(
      `尺度 ${grid[0]}~${grid[grid.length - 1]} 全都不行：模板缩放后放不进 ${frame.width}x${frame.height} 的帧`,
    )
  }

  // 第二段：尺度细定（粗定值 ± 粗步长），平移在候选点 ±10 里精修。
  const fineScales = grid.filter((value) => Math.abs(value - current!.scale) <= coarseStep + 1e-9)
  const refined = evaluate(fineScales.length > 0 ? fineScales : [current.scale], midFactor, 10, current.positions)
  if (refined) current = refined

  // 第三段：原分辨率收尾，平移 ±2px（上一段已把误差压到 1 个粗像素内）；
  // 尺度窗口比"±2 步长"宽一档：粗层的尺度分辨率受降采样后的模板像素数限制
  // （28px 模板在 1/2 层上只有 ±3.5% 的分辨力），窗口太窄会把真值卡在外面。
  const lastScales = grid.filter(
    (value) => Math.abs(value - current!.scale) <= Math.max(3 * Math.max(userStep, 0.005), coarseStep) + 1e-9,
  )
  const finalStage = evaluate(lastScales.length > 0 ? lastScales : [current.scale], 1, 2, current.positions)
  let atFullRes = finalStage !== undefined
  if (finalStage) current = finalStage

  // 尺度峰是平的：用最终那段的分值曲线做三点抛物线插值，把"总是差半格"的系统误差压下去；
  // 插出来的值不落在网格上，所以必须**重新算一次位置**，否则 dx/dy 与报出去的 scale 不自洽。
  const peak = refineScaleParabola(current.curve)
  if (peak !== undefined && Math.abs(peak - current.scale) > 1e-6) {
    const polished = evaluate([round4(peak)], 1, 2, current.positions)
    if (polished && polished.score >= current.score - 0.02) {
      current = polished
      atFullRes = true
    }
  }

  // 平移的亚像素修正：NCC 峰在 x/y 方向同样是平的，三点抛物线把 ±1px 的整数误差压到
  // ±0.2px（缩小到 1/4 分辨率之后，1 个粗像素就是 4 个原像素，不修就会偏出去）。
  // 注意只修"参与 dx/dy 计算的位置"；perTemplate 里报的仍是整数像素（那是"模板左上角"）。
  const refinedPositions = current.positions.map((position, index) => {
    if (!atFullRes) return position
    const tpl = resampleGray(templates[index]!.gray, current!.scale)
    const base = { x: Math.round(position.x), y: Math.round(position.y) }
    const center = nccScoreAt(frameGray, tpl, base.x, base.y)
    if (center === undefined) return position
    const axis = (dx: number, dy: number): number => nccScoreAt(frameGray, tpl, base.x + dx, base.y + dy) ?? center
    return {
      x: base.x + parabolaOffset(axis(-1, 0), center, axis(1, 0)),
      y: base.y + parabolaOffset(axis(0, -1), center, axis(0, 1)),
    }
  })

  // 把每个模板的命中位置换算成"参考图坐标 → 目标图坐标"的平移量：t_i = m_i − origin_i × scale。
  const translations = refinedPositions.map((position, index) => {
    const origin = templates[index]!.origin
    return { x: position.x - origin.x * current!.scale, y: position.y - origin.y * current!.scale }
  })
  let sumWeight = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < translations.length; i++) {
    const weight = templates[i]!.weight
    dx += translations[i]!.x * weight
    dy += translations[i]!.y * weight
    sumWeight += weight
  }
  if (sumWeight > 0) {
    dx /= sumWeight
    dy /= sumWeight
  }
  let residual = 0
  for (let i = 1; i < translations.length; i++) {
    residual = Math.max(
      residual,
      Math.hypot(translations[i]!.x - translations[0]!.x, translations[i]!.y - translations[0]!.y),
    )
  }

  return {
    scale: round4(current.scale),
    dx: round4(dx),
    dy: round4(dy),
    score: round4(current.score),
    residualPx: round4(residual),
    perTemplate: current.positions.map((position, index) => ({
      score: round4(current!.scores[index] ?? 0),
      x: Math.round(position.x),
      y: Math.round(position.y),
    })),
  }
}

// ─────────────────────────────── 任务 3：剪影拟合 ───────────────────────────────

export interface SilhouetteFitOptions {
  mask?: 'raw' | 'body-core'
  scale?: ScaleRange
  alphaThreshold?: number
}

export interface SilhouetteFrameFit {
  iou: number
  scale: number
  dx: number
  dy: number
  reason?: string
}

const maskCache = new WeakMap<RgbaImage, Map<string, MaskImage>>()

/** alpha 阈值 → 二值掩膜；`body-core` 再取最大连通域并腐蚀 1px（去特效/去手/去抗锯齿边）。 */
export function maskFromAlpha(
  image: RgbaImage,
  options: { threshold?: number; mode?: 'raw' | 'body-core' } = {},
): MaskImage {
  const threshold = clampNumber(Number(options.threshold ?? 32), 0, 255)
  const mode = options.mode ?? 'body-core'
  const key = `${mode}:${threshold}`
  let bucket = maskCache.get(image)
  if (!bucket) {
    bucket = new Map()
    maskCache.set(image, bucket)
  }
  const hit = bucket.get(key)
  if (hit) return hit
  const data = new Uint8Array(image.width * image.height)
  for (let i = 0, p = 3; i < data.length; i++, p += 4) {
    data[i] = image.rgba[p]! > threshold ? 1 : 0
  }
  let mask: MaskImage = { width: image.width, height: image.height, data }
  if (mode === 'body-core') mask = erodeMask(largestComponent(mask), 1)
  bucket.set(key, mask)
  return mask
}

/** 4 邻域连通域，取面积最大的那一块（其余清零）。 */
export function largestComponent(mask: MaskImage): MaskImage {
  const { width, height, data } = mask
  const out = new Uint8Array(width * height)
  const visited = new Uint8Array(width * height)
  const stack = new Int32Array(width * height)
  let bestCount = 0
  let bestSeed = -1
  for (let start = 0; start < data.length; start++) {
    if (data[start] !== 1 || visited[start] === 1) continue
    let top = 0
    let count = 0
    stack[top++] = start
    visited[start] = 1
    while (top > 0) {
      const index = stack[--top]!
      count++
      const x = index % width
      const y = (index - x) / width
      if (x > 0) {
        const left = index - 1
        if (data[left] === 1 && visited[left] === 0) {
          visited[left] = 1
          stack[top++] = left
        }
      }
      if (x + 1 < width) {
        const right = index + 1
        if (data[right] === 1 && visited[right] === 0) {
          visited[right] = 1
          stack[top++] = right
        }
      }
      if (y > 0) {
        const up = index - width
        if (data[up] === 1 && visited[up] === 0) {
          visited[up] = 1
          stack[top++] = up
        }
      }
      if (y + 1 < height) {
        const down = index + width
        if (data[down] === 1 && visited[down] === 0) {
          visited[down] = 1
          stack[top++] = down
        }
      }
    }
    if (count > bestCount) {
      bestCount = count
      bestSeed = start
    }
  }
  if (bestSeed < 0) return { width, height, data: out }
  let top = 0
  stack[top++] = bestSeed
  out[bestSeed] = 1
  while (top > 0) {
    const index = stack[--top]!
    const x = index % width
    const y = (index - x) / width
    if (x > 0 && data[index - 1] === 1 && out[index - 1] === 0) {
      out[index - 1] = 1
      stack[top++] = index - 1
    }
    if (x + 1 < width && data[index + 1] === 1 && out[index + 1] === 0) {
      out[index + 1] = 1
      stack[top++] = index + 1
    }
    if (y > 0 && data[index - width] === 1 && out[index - width] === 0) {
      out[index - width] = 1
      stack[top++] = index - width
    }
    if (y + 1 < height && data[index + width] === 1 && out[index + width] === 0) {
      out[index + width] = 1
      stack[top++] = index + width
    }
  }
  return { width, height, data: out }
}

/** 4 邻域腐蚀 `iterations` 次（边界外当作空，所以贴图的边会被削掉——这是想要的）。 */
export function erodeMask(mask: MaskImage, iterations = 1): MaskImage {
  let current = mask
  for (let round = 0; round < Math.max(0, Math.round(iterations)); round++) {
    const { width, height, data } = current
    const out = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x
        if (data[index] !== 1) continue
        if (x === 0 || y === 0 || x + 1 === width || y + 1 === height) continue
        if (
          data[index - 1] === 1 &&
          data[index + 1] === 1 &&
          data[index - width] === 1 &&
          data[index + width] === 1
        ) {
          out[index] = 1
        }
      }
    }
    current = { width, height, data: out }
  }
  return current
}

/**
 * 二值掩膜的重采样。
 *
 * 降采样用"覆盖块里前景占一半以上"（保面积，剪影 IoU 对面积敏感）；
 * 升采样用最近邻（二值图插值会造出 0.5 这种没有意义的中间值）。
 */
export function resampleMask(mask: MaskImage, scale: number): MaskImage {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(`重采样比例必须是正数（收到 ${scale}）`)
  if (Math.abs(scale - 1) < 1e-9) return mask
  const w = Math.max(1, Math.round(mask.width * scale))
  const h = Math.max(1, Math.round(mask.height * scale))
  const data = new Uint8Array(w * h)
  const sx = mask.width / w
  const sy = mask.height / h
  if (scale > 1) {
    // 升采样：最近邻（中心对齐）
    for (let y = 0; y < h; y++) {
      const yy = clampNumber(Math.round((y + 0.5) * sy - 0.5), 0, mask.height - 1)
      for (let x = 0; x < w; x++) {
        const xx = clampNumber(Math.round((x + 0.5) * sx - 0.5), 0, mask.width - 1)
        data[y * w + x] = mask.data[yy * mask.width + xx]!
      }
    }
    return { width: w, height: h, data }
  }
  // 降采样：块内过半
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy)
    const y1 = Math.max(y0 + 1, Math.min(mask.height, Math.floor((y + 1) * sy)))
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx)
      const x1 = Math.max(x0 + 1, Math.min(mask.width, Math.floor((x + 1) * sx)))
      let on = 0
      let total = 0
      for (let yy = y0; yy < y1; yy++) {
        const row = yy * mask.width
        for (let xx = x0; xx < x1; xx++) {
          total++
          if (mask.data[row + xx] === 1) on++
        }
      }
      data[y * w + x] = total > 0 && on * 2 >= total ? 1 : 0
    }
  }
  return { width: w, height: h, data }
}

function downsampleMask(mask: MaskImage, factor: number): MaskImage {
  const f = Math.max(1, Math.round(factor))
  return f === 1 ? mask : resampleMask(mask, 1 / f)
}

/** 掩膜面积 + 质心（质心用于对齐初值：姿势差大时比 bbox 稳）。 */
function maskStats(points: MaskPoints): { cx: number; cy: number; area: number } {
  let sx = 0
  let sy = 0
  for (let i = 0; i < points.count; i++) {
    sx += points.xs[i]!
    sy += points.ys[i]!
  }
  const area = points.count
  return { cx: area > 0 ? sx / area : 0, cy: area > 0 ? sy / area : 0, area }
}

/**
 * 前景点抽样（粗搜用）。
 *
 * 为什么可以抽样：IoU 的搜索只需要"哪个偏移更好"的排序，不需要绝对值——**最终报的 IoU
 * 一定用全量点在原分辨率算一次**。不抽的话 24 帧 × 7 档尺度的粗搜要跑十几秒。
 *
 * 注意 `area` **保持全量值**：`iouAt` 里 `area / count` 就是抽样倍率，用它把稀疏交集
 * 还原回全量（`area === count` 的全量点表倍率恒为 1）。曾经把 `area` 也按比例缩了，
 * 结果稀疏点表的交集被"缩两次"，粗搜的 IoU 直接从 0.98 掉到 0.33，尺度全判错。
 */
export function sparsifyPoints(points: MaskPoints, stride: number): MaskPoints {
  const step = Math.max(1, Math.round(stride))
  if (step === 1 || points.count === 0) return points
  const count = Math.floor(points.count / step)
  if (count === 0) return points
  const xs = new Int32Array(count)
  const ys = new Int32Array(count)
  for (let i = 0; i < count; i++) {
    xs[i] = points.xs[i * step]!
    ys[i] = points.ys[i * step]!
  }
  return { xs, ys, count, area: points.area }
}

/** 点表 -> 抽样到大约 `target` 个点（连 1/1 都超时才抽）。 */
function pointsCapped(points: MaskPoints, target: number): MaskPoints {
  if (points.count <= target) return points
  return sparsifyPoints(points, Math.ceil(points.count / target))
}

/** 在给定偏移处算 IoU：`交 / (模板面积 + 目标面积 − 交)`。只遍历模板前景点。 */
export function iouAt(
  target: MaskImage,
  points: MaskPoints,
  offsetX: number,
  offsetY: number,
  targetArea: number,
): number {
  let inter = 0
  for (let i = 0; i < points.count; i++) {
    const x = points.xs[i]! + offsetX
    const y = points.ys[i]! + offsetY
    if (x < 0 || y < 0 || x >= target.width || y >= target.height) continue
    if (target.data[y * target.width + x] === 1) inter++
  }
  // 抽样点表（area ≠ count）时按比例还原交集；全量点表时这个系数恒为 1。
  const scale = points.count > 0 ? points.area / points.count : 1
  const intersect = inter * scale
  const union = points.area + targetArea - intersect
  return union > 0 ? intersect / union : 0
}

interface Offset {
  x: number
  y: number
}

function bestOffsetAround(
  target: MaskImage,
  points: MaskPoints,
  targetArea: number,
  center: Offset,
  radius: number,
): { iou: number; offset: Offset } {
  let best: { iou: number; offset: Offset } = {
    iou: iouAt(target, points, center.x, center.y, targetArea),
    offset: center,
  }
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue
      const iou = iouAt(target, points, center.x + dx, center.y + dy, targetArea)
      if (iou > best.iou) best = { iou, offset: { x: center.x + dx, y: center.y + dy } }
    }
  }
  return best
}

/**
 * 单帧的剪影拟合。
 *
 * 粗搜在降采样分辨率（1/3~1/4，按帧高决定）：按尺度网格逐档重采样参考剪影，
 * 用"质心对齐"当初始平移，在 ±8（该层像素）内找 IoU 峰值；最优的那一档再回原分辨率
 * ±4px 精修，**最终报的 IoU 是原分辨率用全量点算出来的**——不然报的是估分，不是结论。
 *
 * 为什么要抽样：交集的代价与剪影的前景点数成正比。粗搜把点表抽到 ~4k（只用于排序），
 * 原分辨率精修抽到 ~30k，最后在赢家位置上用全量点算一次真实 IoU。不抽的话
 * 24 帧 × 7 档尺度会跑到十几秒（性能回归测试钉的就是这条）。
 */
export function fitSilhouetteFrame(
  reference: RgbaImage,
  frame: RgbaImage,
  options: SilhouetteFitOptions = {},
): SilhouetteFrameFit {
  const mode = options.mask === 'raw' ? 'raw' : 'body-core'
  const threshold = options.alphaThreshold
  const refMask = maskFromAlpha(reference, { ...(threshold === undefined ? {} : { threshold }), mode })
  const frameMask = maskFromAlpha(frame, { ...(threshold === undefined ? {} : { threshold }), mode })
  const refPointsFull = maskPoints(refMask)
  const framePointsFull = maskPoints(frameMask)
  if (refPointsFull.area === 0) {
    return { iou: 0, scale: 1, dx: 0, dy: 0, reason: '参考帧的剪影是空的（alpha 阈值以上的像素为 0）' }
  }
  if (framePointsFull.area === 0) {
    return { iou: 0, scale: 1, dx: 0, dy: 0, reason: '目标帧的剪影是空的（没抠图？）' }
  }
  const grid = scaleGrid(options.scale, { min: 0.85, max: 1.15, step: 0.05 }, 9)

  const factor = Math.min(4, Math.max(1, Math.floor(Math.min(frame.width, frame.height) / 64)))
  const refSmall = downsampleMask(refMask, factor)
  const frameSmall = downsampleMask(frameMask, factor)
  const frameSmallPoints = maskPoints(frameSmall)
  const frameSmallStats = maskStats(frameSmallPoints)

  let best: { iou: number; scale: number; offset: Offset } | undefined
  for (const scale of grid) {
    const scaled = resampleMask(refSmall, scale)
    // **不要因为"模板比帧大"就跳过这一档**：角色通常占满画幅，放大 1.05 倍就"放不进"了，
    // 跳过等于把所有 >1 的尺度全部否掉（实测真值 1.10 会退回 1.00）。让 iouAt 自己惩罚
    // 越界部分（越界 = 不相交），那才是这件事的正确语义。
    const full = maskPoints(scaled)
    if (full.area === 0) continue
    const points = pointsCapped(full, 4000)
    const stats = maskStats(full)
    const center: Offset = {
      x: Math.round(frameSmallStats.cx - stats.cx),
      y: Math.round(frameSmallStats.cy - stats.cy),
    }
    const hit = bestOffsetAround(frameSmall, points, frameSmallPoints.area, center, 8)
    if (!best || hit.iou > best.iou) best = { iou: hit.iou, scale, offset: hit.offset }
  }
  if (!best) {
    return { iou: 0, scale: 1, dx: 0, dy: 0, reason: '尺度网格里没有一档能算出剪影（参考帧的掩膜是空的？）' }
  }
  if (best.iou < 0.5) {
    // 兜底：质心种子在大摆幅/长条姿势上会偏，做一次更粗分辨率的全图扫描（只在失败时付这笔钱）。
    const coarse = downsampleMask(refMask, 8)
    const target = downsampleMask(frameMask, 8)
    const targetPoints = maskPoints(target)
    const scaled = resampleMask(coarse, best.scale)
    const points = pointsCapped(maskPoints(scaled), 4000)
    if (points.area > 0 && scaled.width <= target.width && scaled.height <= target.height) {
      let sweep: { iou: number; offset: Offset } | undefined
      for (let y = 0; y + scaled.height <= target.height; y += 2) {
        for (let x = 0; x + scaled.width <= target.width; x += 2) {
          const iou = iouAt(target, points, x, y, targetPoints.area)
          if (!sweep || iou > sweep.iou) sweep = { iou, offset: { x: x * 2, y: y * 2 } }
        }
      }
      if (sweep) best = { iou: sweep.iou, scale: best.scale, offset: sweep.offset }
    }
  }

  // 原分辨率精搜：先在 ±半个粗步长的尺度上各搜一次位置（抽样找位置），
  // 再在赢家位置上用**全量点**算真实 IoU——报的 IoU 必须是结论，不是估分。
  // 为什么非要在全分辨率上再扫一遍尺度：粗层的尺度分辨力被降采样卡住（1/4 层上 1px = 4 个原像素），
  // 而 IoU 曲面在尺度方向很平，不插值就只能报到网格步长那么大（±0.05 的圆圈会明显错）。
  const gridStep = grid.length > 1 ? grid[1]! - grid[0]! : 0.05
  const probe = (scale: number, center: Offset, radius: number): {
    iou: number
    offset: Offset
    full: MaskPoints
  } | undefined => {
    if (!(scale > 0.1) || scale > 4) return undefined
    const scaled = resampleMask(refMask, scale)
    // 同上：比帧大不算"不能算"，越界部分在 IoU 里自然吃亏。
    const full = maskPoints(scaled)
    if (full.area === 0) return undefined
    const hit = bestOffsetAround(frameMask, pointsCapped(full, 30000), framePointsFull.area, center, radius)
    return { iou: hit.iou, offset: hit.offset, full }
  }
  const centerFull: Offset = { x: best.offset.x * factor, y: best.offset.y * factor }
  const sweep: Array<{ scale: number; iou: number; offset: Offset; full: MaskPoints }> = []
  for (let k = -2; k <= 2; k++) {
    const found = probe(round4(best.scale + (k * gridStep) / 2), centerFull, 3)
    if (found) sweep.push({ scale: round4(best.scale + (k * gridStep) / 2), ...found })
  }
  if (sweep.length === 0) {
    const fallback = probe(best.scale, centerFull, 4)
    if (!fallback) {
      return { iou: 0, scale: 1, dx: 0, dy: 0, reason: '原分辨率上算不出剪影（参考帧的掩膜是空的？）' }
    }
    sweep.push({ scale: best.scale, ...fallback })
  }
  sweep.sort((a, b) => b.iou - a.iou)
  let winner = sweep[0]!
  // 尺度方向插一次值：IoU 峰是平的，网格点会系统性地差半格。
  const peak = refineScaleParabola(sweep.map((one) => ({ scale: one.scale, score: one.iou })))
  if (peak !== undefined && Math.abs(peak - winner.scale) > 1e-6) {
    const polished = probe(round4(peak), winner.offset, 2)
    if (polished && polished.iou >= winner.iou - 0.005) {
      winner = { scale: round4(peak), ...polished }
    }
  }
  const exact = iouAt(frameMask, winner.full, winner.offset.x, winner.offset.y, framePointsFull.area)
  return {
    iou: round4(exact),
    scale: round4(winner.scale),
    dx: winner.offset.x,
    dy: winner.offset.y,
  }
}

// ─────────────────────────────── 置信度分档 ───────────────────────────────

export type Confidence = 'high' | 'medium' | 'low'

/**
 * 特征反推的置信度。
 *
 * 三档不是为了好看，是为了让调用方知道"这个锚点能不能直接用"：
 * `score≥0.90 且 residual<2px` = 两个特征说的是同一件事，锚点可以拓印；
 * 0.80~0.90 = 能用但要拿语义点复核；更低就别用了。
 */
export function featureConfidence(score: number, residualPx: number): { confidence: Confidence; reason?: string } {
  if (score >= 0.9 && residualPx < 2) return { confidence: 'high' }
  if (score >= 0.9) {
    return {
      confidence: 'medium',
      reason: `两个模板各自反推的平移差 ${round4(residualPx)}px ≥ 2px：特征可能被遮挡/形变，锚点要拿语义点复核`,
    }
  }
  if (score >= 0.8) {
    return {
      confidence: 'medium',
      reason: `分值 ${round4(score)} 落在 0.80~0.90：与语义点交叉验证，差 >3px 以语义点为准`,
    }
  }
  return { confidence: 'low', reason: `分值 ${round4(score)} < 0.80：特征没对上，别用这个结果` }
}

/**
 * 剪影拟合的三档（skill 里那张表：IoU 只允许决定"能不能拓印锚点"）。
 * 中间档**只采用 scale**，锚点必须走语义点——这一条写进返回值，别让调用方猜。
 */
export function silhouetteConfidence(iou: number): {
  confidence: Confidence
  anchorSource: 'silhouette' | 'semantic-required' | null
  reason?: string
} {
  if (iou >= 0.9) return { confidence: 'high', anchorSource: 'silhouette' }
  if (iou >= 0.75) {
    return {
      confidence: 'medium',
      anchorSource: 'semantic-required',
      reason: `IoU ${round4(iou)} 在 0.75~0.90：只采用 scale，锚点必须走语义点（transferredAnchor 仅供参考）`,
    }
  }
  return {
    confidence: 'low',
    anchorSource: null,
    reason: `IoU ${round4(iou)} < 0.75：这段动画里没有姿势接近的帧，剪影只作参考，锚点全程走语义点`,
  }
}

// ─────────────────────────────── 锚点换算 ───────────────────────────────

/**
 * 把参考帧上的归一化锚点搬到目标帧。
 *
 * 口径与 `sprite_get_anchor` / `meta.json` 完全一致：`anchorX/anchorY ∈ 0~1`，
 * `anchorY` 是 **y-from-bottom**（0=帧底、1=帧顶）。所以内部先换成"像素 + 左上原点"，
 * 走完 `p_target = p_ref × scale + (dx, dy)` 再换回来；两个口径都给，消费端不用自己减。
 */
export function transferAnchor(input: {
  anchorX: number
  anchorY: number
  refWidth: number
  refHeight: number
  scale: number
  dx: number
  dy: number
  width: number
  height: number
}): { anchorX: number; anchorY: number; anchorYTopDown: number } {
  const refX = clampNumber(input.anchorX, 0, 1) * input.refWidth
  const refY = (1 - clampNumber(input.anchorY, 0, 1)) * input.refHeight
  const targetX = refX * input.scale + input.dx
  const targetY = refY * input.scale + input.dy
  const anchorX = input.width > 0 ? targetX / input.width : 0
  const anchorY = input.height > 0 ? 1 - targetY / input.height : 0
  return {
    anchorX: round4(anchorX),
    anchorY: round4(anchorY),
    anchorYTopDown: round4(1 - anchorY),
  }
}
