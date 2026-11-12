/**
 * sprite/scan —— measure 的通用扫描原语（纯函数，零业务语义）。
 *
 * 为什么要单独一层（评审文档 P2-5）：原来的 landmarks 只有 `scan-vertical`，
 * 它只会找「第一个 alpha > 阈值的行」。像「白色发带结束、蓝色头发开始」这种
 * **颜色交界**不是 alpha 边界，调用方只能自己写脚本量（上一轮就量错了 90px）。
 *
 * 这里把「通道条件」拆成三件事：
 * 1. `channelValue` —— 一个像素在某通道上的标量（r/g/b/alpha/luma/blue-minus-red/saturation）；
 * 2. `scanHorizontal`（landmark type `scan-horizontal`）—— 沿某一列从 fromY 往 toY 扫，
 *    找第一个「连续满足条件且长度 >= minRun」的 run；
 * 3. `findBoundary`（landmark type `boundary`）—— A 条件连续段结束、紧接 B 条件连续段的交界行。
 *
 * 条件全部由调用方给（`probe` / `a` / `b`），工具本身不知道"头发""发带"是什么。
 *
 * ★ 三处必须等价，`tests/sprite-scan.test.ts` 会把第 3 处的源码抠出来跟本模块
 *   跑同一批向量做 parity 校验：
 *   1. 这里（工具层契约、类型、测试）；
 *   2. `tools.ts` 的 JSON Schema（enum 从这里取）；
 *   3. `assets/sprite/sprite-tool.html` 里的 `spriteScanPrimitives()`（像素只在浏览器里，
 *      真正跑测量的是那一份）。
 *
 * 坐标口径与 measure 一致：帧原始像素、左上原点、行列都是**含端点**的整数。
 */
import type {
  MeasureLandmarkResult,
  MeasureScanChannel,
  MeasureScanOp,
  MeasureScanProbe,
} from './types.js'
import { SCAN_CHANNELS, SCAN_OPS } from './types.js'

/** 阈值"果断程度"的归一化尺度：通道差/亮度差超过 255 的四分之一就算笃定。 */
const MARGIN_SCALE = 63.75

/** 调用方给的像素来源：只要求能按 (x,y) 取一个 [r,g,b,a]。 */
export interface ScanPixelSource {
  width: number
  height: number
  rgbaAt(x: number, y: number): [number, number, number, number]
}

export interface NormalizedProbe {
  channel: MeasureScanChannel
  op: MeasureScanOp
  value: number
  minRun: number
}

export interface ColumnRange {
  x: number
  fromY: number
  toY: number
  /** 调用方给的 y 区间被帧边界裁过。 */
  clipped: boolean
}

export interface ScanColumnRequest {
  x?: unknown
  fromY?: unknown
  toY?: unknown
  probe?: unknown
}

export interface BoundaryRequest {
  x?: unknown
  fromY?: unknown
  toY?: unknown
  a?: unknown
  b?: unknown
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value)
const round3 = (value: number): number => Math.round(value * 1000) / 1000

/** 宽松数字解析：数字直接用，纯数字字符串也收（JSON 里常见），其余 NaN。 */
function toNum(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : Number.NaN
  }
  return Number.NaN
}

/** 一个像素在某通道上的标量；未知通道返回 NaN（由 `compareOp` 判成"不满足"）。 */
export function channelValue(rgba: readonly number[], channel: string): number {
  const r = Number(rgba[0])
  const g = Number(rgba[1])
  const b = Number(rgba[2])
  const a = Number(rgba[3])
  switch (channel) {
    case 'r': return r
    case 'g': return g
    case 'b': return b
    case 'alpha': return a
    case 'luma': return 0.299 * r + 0.587 * g + 0.114 * b
    case 'blue-minus-red': return b - r
    case 'saturation': return Math.max(r, g, b) - Math.min(r, g, b)
    default: return Number.NaN
  }
}

/** 条件求值。`value` 不是有限数或 op 不认识一律 false（宁可不命中，也不抛异常）。 */
export function compareOp(value: number, op: string, target: number): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(target)) return false
  switch (op) {
    case '>': return value > target
    case '>=': return value >= target
    case '<': return value < target
    case '<=': return value <= target
    default: return false
  }
}

/** 把调用方的 probe 收敛成可执行条件；不合法时给原因而不是抛异常。 */
export function normalizeProbe(raw: unknown): { probe: NormalizedProbe | null; reason?: string } {
  if (!raw || typeof raw !== 'object') {
    return { probe: null, reason: 'probe 缺失：要 {channel, op, value}（可选 minRun）' }
  }
  const spec = raw as Partial<MeasureScanProbe>
  const channel = typeof spec.channel === 'string' ? spec.channel.trim() : ''
  if (!(SCAN_CHANNELS as readonly string[]).includes(channel)) {
    return { probe: null, reason: 'channel 不支持：' + (channel || '(空)') + '（可用 ' + SCAN_CHANNELS.join(' / ') + '）' }
  }
  const op = typeof spec.op === 'string' ? spec.op.trim() : ''
  if (!(SCAN_OPS as readonly string[]).includes(op)) {
    return { probe: null, reason: 'op 不支持：' + (op || '(空)') + '（可用 ' + SCAN_OPS.join(' ') + '）' }
  }
  const value = toNum(spec.value)
  if (Number.isNaN(value)) {
    return { probe: null, reason: 'value 必须是数字（收到 ' + String(spec.value) + '）' }
  }
  const minRun = Number.isNaN(toNum(spec.minRun)) ? 1 : Math.max(1, Math.round(toNum(spec.minRun)))
  return { probe: { channel: channel as MeasureScanChannel, op: op as MeasureScanOp, value, minRun } }
}

/** 列号 + y 区间校验：越界不裁剪成"看起来对"的值，直接给原因。 */
export function resolveColumnRange(
  grid: ScanPixelSource,
  req: { x?: unknown; fromY?: unknown; toY?: unknown } | null | undefined,
): { range: ColumnRange | null; reason?: string } {
  const width = grid ? toNum(grid.width) : Number.NaN
  const height = grid ? toNum(grid.height) : Number.NaN
  if (Number.isNaN(width) || Number.isNaN(height) || width <= 0 || height <= 0) {
    return { range: null, reason: '帧尺寸无效（width/height 必须为正）' }
  }
  const x = Math.round(toNum(req ? req.x : undefined))
  if (Number.isNaN(x)) return { range: null, reason: '缺少可用列号 x（要量哪一列）' }
  if (x < 0 || x > width - 1) {
    return { range: null, reason: 'x=' + x + ' 超出可用列 [0,' + (width - 1) + ']' }
  }
  const fromRaw = toNum(req ? req.fromY : undefined)
  const toRaw = toNum(req ? req.toY : undefined)
  const fromY = Number.isNaN(fromRaw) ? 0 : Math.round(fromRaw)
  const toY = Number.isNaN(toRaw) ? height - 1 : Math.round(toRaw)
  if (toY < fromY) {
    return { range: null, reason: 'toY(' + toY + ') 小于 fromY(' + fromY + ')，扫描区间为空' }
  }
  if (fromY > height - 1 || toY < 0) {
    return { range: null, reason: '扫描区间 y=[' + fromY + ',' + toY + '] 整段落在帧外（帧高 ' + height + '）' }
  }
  const y0 = Math.max(0, fromY)
  const y1 = Math.min(height - 1, toY)
  return { range: { x, fromY: y0, toY: y1, clipped: y0 !== fromY || y1 !== toY } }
}

const condText = (probe: NormalizedProbe): string =>
  probe.channel + ' ' + probe.op + ' ' + String(probe.value)

const notFound = (reason?: string): MeasureLandmarkResult => ({
  found: false,
  px: null,
  py: null,
  confidence: 0,
  reason: reason || '未命中',
})

/**
 * run 的可信度（0~1）：长度占 60%（run 有 3 倍 minRun 长就算稳），
 * 首个命中像素离阈值多远占 40%（差得越多越不像噪声）。
 */
function confidenceOf(runLength: number, minRun: number, firstValue: number, threshold: number): number {
  const lengthScore = clamp01(runLength / Math.max(1, 3 * minRun))
  const marginScore = clamp01(Math.abs(firstValue - threshold) / MARGIN_SCALE)
  return round3(clamp01(0.6 * lengthScore + 0.4 * marginScore))
}

/**
 * landmark type `scan-horizontal`：沿列 x 从 fromY 往 toY 扫，**向下**找第一个
 * 满足 probe 且连续长度 >= minRun 的 run。
 *
 * （类型名沿用需求文档的写法；轴向是"列内竖直扫"。不叫 scan-vertical 是为了不跟
 * 老原语「第一个 alpha > 阈值」混为一谈。）
 */
export function scanHorizontal(
  grid: ScanPixelSource,
  req: ScanColumnRequest | null | undefined,
): MeasureLandmarkResult {
  const raw = req || {}
  const probeOut = normalizeProbe(raw.probe)
  const probe = probeOut.probe
  if (!probe) return notFound(probeOut.reason)
  const rangeOut = resolveColumnRange(grid, raw)
  const range = rangeOut.range
  if (!range) return notFound(rangeOut.reason)

  const { x, fromY, toY, clipped } = range
  const matches = (y: number): boolean =>
    compareOp(channelValue(grid.rgbaAt(x, y), probe.channel), probe.op, probe.value)

  let y = fromY
  while (y <= toY) {
    if (!matches(y)) {
      y++
      continue
    }
    const start = y
    while (y <= toY && matches(y)) y++
    const runLength = y - start
    if (runLength >= probe.minRun) {
      const firstValue = channelValue(grid.rgbaAt(x, start), probe.channel)
      const result: MeasureLandmarkResult = {
        found: true,
        px: x,
        py: start,
        value: start,
        confidence: confidenceOf(runLength, probe.minRun, firstValue, probe.value),
        runLength,
        runStart: start,
        runEnd: y - 1,
        channel: probe.channel,
        op: probe.op,
        threshold: probe.value,
        column: x,
        fromY,
        toY,
      }
      if (clipped) result.clipped = true
      return result
    }
    /* run 太短不算数：从它后面继续找第一个够长的（minRun 的语义就是"够长"） */
  }
  return notFound(
    '在 y=[' + fromY + ',' + toY + '] 没找到满足「' + condText(probe) +
      '」且连续 >= ' + probe.minRun + ' 行的 run',
  )
}

/**
 * landmark type `boundary`：找「A 条件连续段结束、紧接 B 条件连续段」的那一行。
 *
 * 返回的 `py` 是 **B 段的第一行**（也就是交界线），`aEnd = py - 1` 是 A 段的最后一行。
 * `runLength` 是 A 段 + B 段的合计连续行数。
 */
export function findBoundary(
  grid: ScanPixelSource,
  req: BoundaryRequest | null | undefined,
): MeasureLandmarkResult {
  const raw = req || {}
  const aOut = normalizeProbe(raw.a)
  const a = aOut.probe
  if (!a) return notFound('a 段条件无效：' + aOut.reason)
  const bOut = normalizeProbe(raw.b)
  const b = bOut.probe
  if (!b) return notFound('b 段条件无效：' + bOut.reason)

  const rangeOut = resolveColumnRange(grid, raw)
  const range = rangeOut.range
  if (!range) return notFound(rangeOut.reason)
  const { x, fromY, toY, clipped } = range
  const rows = toY - fromY + 1
  const aHit = new Uint8Array(rows)
  const bHit = new Uint8Array(rows)
  for (let y = fromY; y <= toY; y++) {
    const rgba = grid.rgbaAt(x, y)
    aHit[y - fromY] = compareOp(channelValue(rgba, a.channel), a.op, a.value) ? 1 : 0
    bHit[y - fromY] = compareOp(channelValue(rgba, b.channel), b.op, b.value) ? 1 : 0
  }

  for (let y = fromY + 1; y <= toY; y++) {
    const k = y - fromY
    if (!bHit[k] || !aHit[k - 1]) continue
    let aRun = 0
    for (let i = k - 1; i >= 0 && aHit[i]; i--) aRun++
    let bRun = 0
    for (let i = k; i < rows && bHit[i]; i++) bRun++
    if (aRun < a.minRun || bRun < b.minRun) continue

    const aEnd = y - 1
    const aStart = y - aRun
    const bEnd = y + bRun - 1
    const marginA = clamp01(Math.abs(channelValue(grid.rgbaAt(x, aEnd), a.channel) - a.value) / MARGIN_SCALE)
    const marginB = clamp01(Math.abs(channelValue(grid.rgbaAt(x, y), b.channel) - b.value) / MARGIN_SCALE)
    const lengthScore = clamp01(Math.min(aRun, bRun) / Math.max(1, 3 * Math.max(a.minRun, b.minRun)))
    const result: MeasureLandmarkResult = {
      found: true,
      px: x,
      py: y,
      value: y,
      confidence: round3(clamp01(0.5 * lengthScore + 0.25 * marginA + 0.25 * marginB)),
      runLength: aRun + bRun,
      aRun,
      bRun,
      aStart,
      aEnd,
      bEnd,
      channel: b.channel,
      op: b.op,
      threshold: b.value,
      aChannel: a.channel,
      bChannel: b.channel,
      column: x,
      fromY,
      toY,
    }
    if (clipped) result.clipped = true
    return result
  }
  return notFound(
    '在 y=[' + fromY + ',' + toY + '] 没找到「' + condText(a) + ' 段结束、紧接 ' +
      condText(b) + ' 段」的交界（a 连续 >= ' + a.minRun + ' 行、b 连续 >= ' + b.minRun + ' 行）',
  )
}
