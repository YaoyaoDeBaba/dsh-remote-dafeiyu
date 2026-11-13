/**
 * sprite/scan —— measure 的通用扫描原语（纯函数，零业务语义）。
 *
 * 为什么要单独一层（评审文档 P2-5）：原来的 landmarks 只有 `scan-vertical`，
 * 它只会找「第一个 alpha > 阈值的行」。像「白色发带结束、蓝色头发开始」这种
 * **颜色交界**不是 alpha 边界，调用方只能自己写脚本量（上一轮就量错了 90px）。
 *
 * 这里把「通道条件」拆成这几件事：
 * 1. `channelValue` —— 一个像素在某通道上的标量（r/g/b/alpha/luma/blue-minus-red/saturation/whiteness）；
 * 2. `scanHorizontal`（landmark type `scan-horizontal`）—— 沿某一列从 fromY 往 toY 扫，
 *    找第一个「连续满足条件且长度 >= minRun」的 run；
 * 3. `findBoundary`（landmark type `boundary`）—— A 条件连续段结束、紧接 B 条件连续段的交界行；
 * 4. `scanColumns`（`scan-horizontal` + `columns`）—— **多列**各扫一遍再投票（min/max/median/mode）。
 *    单列必被局部干扰骗（呆毛偏 84px、被摸头时取到手背偏 80px、云/泡泡这类特效偏 30px），
 *    多列投票能把叛变的少数投掉，`perColumn` 还能指名道姓说是哪几列；
 * 5. `findBodyTop` / `findBodyBottom`（landmark type `bodyTop` / `bodyBottom`）—— 语义原语：
 *    只描述「身高上端/下端」这个**概念**，用哪个像素路标由调用方给条件决定。
 *    上端 = 多列带扫描 + min；下端 = 中央带里从下往上的**行扫描**（方向与列扫描相反）。
 *    这里一个素材词都不许出现（"发带""鞋底"之类），否则换个素材就全错。
 *
 * 条件全部由调用方给（`probe` / `a` / `b`），工具本身不知道"头发""发带"是什么。
 *
 * ★ 三处必须等价，`tests/sprite-scan.test.ts`（老原语）与
 *   `tests/sprite-scan-columns.test.ts`（多列 + 语义原语）会把第 3 处的源码抠出来跟本模块
 *   跑同一批向量做 parity 校验：
 *   1. 这里（工具层契约、类型、测试）；
 *   2. `tools.ts` 的 JSON Schema（enum 从这里取）；
 *   3. `assets/sprite/sprite-tool.html` 里的 `spriteScanPrimitives()`（像素只在浏览器里，
 *      真正跑测量的是那一份）。
 *
 * 坐标口径与 measure 一致：帧原始像素、左上原点、行列都是**含端点**的整数。
 */
import type {
  MeasureColumnHit,
  MeasureLandmarkResult,
  MeasureScanChannel,
  MeasureScanOp,
  MeasureScanProbe,
  ScanAggregate,
} from './types.js'
import { SCAN_AGGREGATES, SCAN_CHANNELS, SCAN_OPS } from './types.js'

/** 阈值"果断程度"的归一化尺度：通道差/亮度差超过 255 的四分之一就算笃定。 */
const MARGIN_SCALE = 63.75

/**
 * 一次多列扫描最多允许几列。
 * 为什么要上限：`"0.30..0.70 step 0.001"` 在 1920 宽的帧上会生成 769 列，
 * 每列都要跑一遍逐行扫描（O(列数×行数)），调用方按错比例写就会卡住整次 measure。
 * 报错比默默截断好——截断后聚合出来的值看着正常，但采样分布已经不是你要的了。
 */
export const MAX_SCAN_COLUMNS = 200

/** `minRun` 推荐值的下限（像素）。帧再小也不建议低于 8 行，否则细附属物一定骗得过来。 */
const MIN_RUN_FLOOR = 8

/**
 * `whiteness` 的两个判据（实测依据：Q 版鲸鱼娘的白发带 vs 肤色）。
 *
 * 只看亮度不行：肤色 `(240,220,207)` 的 luma≈222，`r,g,b>200` 的老写法会让它全通过，
 * 头顶线就直接穿到额头上了。肤色的问题是"不够灰"——它是暖色，饱和度 33；
 * 白发带 `(248,249,251)` 饱和度只有 3。所以用 **饱和度 < 25** 挡住暖色，
 * 再要求 **luma > 210** 挡住浅灰/深白（比如 205 那种"亮但不够亮"的灰）。
 */
export const WHITENESS_MAX_SATURATION = 25
export const WHITENESS_MIN_LUMA = 210

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
  /** 多列模式：像素数组或 `"a..b step s"` 比例字符串（与 `x` 互斥）。 */
  columns?: unknown
  /** min | max | median | mode，默认 median。 */
  aggregate?: unknown
}

export interface BoundaryRequest {
  x?: unknown
  fromY?: unknown
  toY?: unknown
  a?: unknown
  b?: unknown
}

export interface BodyTopRequest {
  x?: unknown
  columns?: unknown
  fromY?: unknown
  toY?: unknown
  probe?: unknown
  /** 等价于 `probe.minRun`；这里给就覆盖它（需求里的写法是 landmark 级别的 minRun）。 */
  minRun?: unknown
  aggregate?: unknown
}

export interface BodyBottomRequest {
  fromY?: unknown
  toY?: unknown
  probe?: unknown
  band?: unknown
  minRunPx?: unknown
}

/** 帧尺寸（多列 / 行扫描都要用）；无效返回 null。 */
interface FrameDims {
  width: number
  height: number
}

function frameDimsOf(grid: ScanPixelSource | null | undefined): FrameDims | null {
  const width = grid ? toNum(grid.width) : Number.NaN
  const height = grid ? toNum(grid.height) : Number.NaN
  if (Number.isNaN(width) || Number.isNaN(height) || width <= 0 || height <= 0) return null
  return { width, height }
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
    /* 白 = 低饱和 + 高亮度：够白返回 luma（亮度仍可当阈值用），不够白返回 0
       （0 永远过不了 `op:">", value:0`，也就不会被 `>` 阈值误判成白）。 */
    case 'whiteness': {
      const saturation = Math.max(r, g, b) - Math.min(r, g, b)
      const luma = 0.299 * r + 0.587 * g + 0.114 * b
      return saturation < WHITENESS_MAX_SATURATION && luma > WHITENESS_MIN_LUMA ? luma : 0
    }
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
  const dims = frameDimsOf(grid)
  if (!dims) return { range: null, reason: '帧尺寸无效（width/height 必须为正）' }
  const x = Math.round(toNum(req ? req.x : undefined))
  if (Number.isNaN(x)) return { range: null, reason: '缺少可用列号 x（要量哪一列）' }
  if (x < 0 || x > dims.width - 1) {
    return { range: null, reason: 'x=' + x + ' 超出可用列 [0,' + (dims.width - 1) + ']' }
  }
  const yOut = resolveYRange(grid, req)
  if (!yOut.range) return { range: null, ...(yOut.reason ? { reason: yOut.reason } : {}) }
  return { range: { x, fromY: yOut.range.fromY, toY: yOut.range.toY, clipped: yOut.range.clipped } }
}

/**
 * y 区间校验（单列 / 多列 / 行扫描共用）：超出帧的部分裁掉并标 `clipped`，
 * 整段落在帧外则给原因（那种"扫了个寂寞"必须显形，不能返回一个空区间的假阴性）。
 */
export function resolveYRange(
  grid: ScanPixelSource,
  req: { fromY?: unknown; toY?: unknown } | null | undefined,
): { range: { fromY: number; toY: number; clipped: boolean } | null; reason?: string } {
  const dims = frameDimsOf(grid)
  if (!dims) return { range: null, reason: '帧尺寸无效（width/height 必须为正）' }
  const height = dims.height
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
  return { range: { fromY: y0, toY: y1, clipped: y0 !== fromY || y1 !== toY } }
}

const condText = (probe: NormalizedProbe): string =>
  probe.channel + ' ' + probe.op + ' ' + String(probe.value)

/** 合法写法的说明：所有报错都带上它，调用方照着改一遍就能跑。 */
const COLUMNS_SYNTAX_HINT =
  '合法写法只有两种：像素数组 [200,260,320,380]；或比例字符串 "0.30..0.70 step 0.05"' +
  '（a / b / step 三个数都是**帧宽的比例**，不是像素；step 必须写，不能省）'

/**
 * `minRun` 的推荐值：帧高 20%，向上取整到 5 的倍数，下限 8。
 *
 * 为什么是帧高 20%：呆毛/发丝/叹号这类附属物通常只占几行到几十行，而"主体某一段"
 * 在竖向上一般超过身高的两成。定值（比如 12）在 480p 与 1080p 上含义差一倍。
 * **只用于 warning 里给建议，绝不偷偷应用**——缺省语义必须保持 1（向后兼容）。
 */
export function recommendMinRun(frameHeight: number): number {
  const height = toNum(frameHeight)
  /* 帧高无效时不编一个数：直接给下限（"按 8 行起算"），调用方也好判断自己在跟什么比 */
  if (!Number.isFinite(height) || height <= 0) return MIN_RUN_FLOOR
  const raw = Math.round(height * 0.2)
  return Math.max(MIN_RUN_FLOOR, Math.ceil(raw / 5) * 5)
}

/** 聚合方式收敛：缺省给 `fallback`；不认识的返回 null（由调用方报错，不猜）。 */
export function normalizeAggregate(raw: unknown, fallback: ScanAggregate = 'median'): ScanAggregate | null {
  if (raw === undefined || raw === null || raw === '') return fallback
  const text = typeof raw === 'string' ? raw.trim() : ''
  return (SCAN_AGGREGATES as readonly string[]).includes(text) ? (text as ScanAggregate) : null
}

/**
 * 多列投票的聚合。**只用命中的列**（没命中的列不代表"更靠上/更靠下"，不能当 0 用）。
 * - `median`：奇数取中位；偶数取中间两条的均值再四舍五入（确定性，不随列序变）。
 * - `mode`：出现最多的 py；平票取**最小**的 py（同样为了确定性）。
 */
export function aggregateValues(values: readonly number[], aggregate: string): number {
  if (!values.length) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  switch (aggregate) {
    case 'min':
      return sorted[0]!
    case 'max':
      return sorted[sorted.length - 1]!
    case 'median': {
      const n = sorted.length
      if (n % 2 === 1) return sorted[(n - 1) / 2]!
      return Math.round((sorted[n / 2 - 1]! + sorted[n / 2]!) / 2)
    }
    case 'mode': {
      const counts = new Map<number, number>()
      for (const value of sorted) counts.set(value, (counts.get(value) || 0) + 1)
      let best = sorted[0]!
      let bestCount = 0
      /* 按升序遍历 + 严格大于：平票时留在更小的 py 上 */
      for (const value of sorted) {
        const count = counts.get(value) || 0
        if (count > bestCount) {
          best = value
          bestCount = count
        }
      }
      return best
    }
    default:
      return Number.NaN
  }
}

/**
 * 解析 `columns`：像素数组，或 `"a..b step s"`（三个数都是帧宽比例）。
 *
 * 为什么字符串形式要单独做纯函数：比例→像素的换算（取整、含端点、去重、上限）
 * 每一条都能写错，而错了以后聚合值看着仍然"像那么回事"，最难查。
 * 所以每条非法输入都给**能照做**的原因，不做静默兜底。
 */
export function parseColumnsSpec(
  raw: unknown,
  frameWidth: number,
): { columns: number[] | null; reason?: string } {
  const width = toNum(frameWidth)
  if (Number.isNaN(width) || width <= 0) return { columns: null, reason: '帧宽无效（width 必须为正）' }

  if (Array.isArray(raw)) {
    if (raw.length === 0) return { columns: null, reason: 'columns 是空数组（至少要一列）' }
    const out: number[] = []
    for (let i = 0; i < raw.length; i++) {
      const value = Math.round(toNum(raw[i]))
      if (Number.isNaN(value)) {
        return { columns: null, reason: 'columns[' + i + '] 不是数字（收到 ' + String(raw[i]) + '）' }
      }
      if (value < 0 || value > width - 1) {
        return {
          columns: null,
          reason: 'columns[' + i + ']=' + value + ' 超出可用列 [0,' + (width - 1) + ']（这里是**像素**；要按比例写请用字符串形式）',
        }
      }
      out.push(value)
    }
    const uniq = [...new Set(out)].sort((a, b) => a - b)
    if (uniq.length > MAX_SCAN_COLUMNS) {
      return { columns: null, reason: 'columns 去重后还有 ' + uniq.length + ' 列，超过上限 ' + MAX_SCAN_COLUMNS }
    }
    return { columns: uniq }
  }

  if (typeof raw === 'string') {
    const text = raw.trim()
    if (text === '') return { columns: null, reason: 'columns 是空字符串。' + COLUMNS_SYNTAX_HINT }
    const match = /^([0-9]*\.?[0-9]+)\.\.([0-9]*\.?[0-9]+)(?:\s*step\s*([0-9]*\.?[0-9]+))?$/.exec(text)
    if (!match) return { columns: null, reason: 'columns 解析不了：' + text + '。' + COLUMNS_SYNTAX_HINT }
    if (match[3] === undefined) {
      return { columns: null, reason: 'columns 字符串缺 step（不知道隔多少列）；' + COLUMNS_SYNTAX_HINT }
    }
    const a = Number(match[1])
    const b = Number(match[2])
    const step = Number(match[3])
    if (![a, b, step].every((value) => Number.isFinite(value))) {
      return { columns: null, reason: 'columns 里的数字解析失败。' + COLUMNS_SYNTAX_HINT }
    }
    if (a < 0 || b < 0 || a > 1 || b > 1) {
      return {
        columns: null,
        reason: 'a=' + a + ' / b=' + b + ' 超出 0~1：字符串里的三个数是**帧宽的比例**，不是像素（像素请用数组形式）',
      }
    }
    if (a > b) {
      return { columns: null, reason: 'a=' + a + ' 大于 b=' + b + '，区间为空（写成 "小..大 step s"）' }
    }
    if (!(step > 0)) return { columns: null, reason: 'step=' + step + ' 必须大于 0（按比例解释，通常 0.02~0.1）' }
    if (step > 1) return { columns: null, reason: 'step=' + step + ' 大于 1：step 也是**帧宽的比例**，必须 <= 1' }

    const startPx = Math.min(width - 1, Math.max(0, Math.round(a * width)))
    const endPx = Math.min(width - 1, Math.max(0, Math.round(b * width)))
    const stepPx = Math.max(1, Math.round(step * width))
    const span = endPx - startPx
    if (span < 0) return { columns: null, reason: '换算成像素后区间为空（a/b 四舍五入到同一列？请把 a..b 拉开）' }
    const estimate = Math.floor(span / stepPx) + 1
    if (estimate > MAX_SCAN_COLUMNS) {
      const minStepPx = Math.ceil(span / (MAX_SCAN_COLUMNS - 1))
      const minStep = Math.ceil((minStepPx / width) * 1000) / 1000
      return {
        columns: null,
        reason:
          '按 step=' + step + ' 会扫 ' + estimate + ' 列，超过上限 ' + MAX_SCAN_COLUMNS +
          '（帧宽 ' + width + '，每步 ' + stepPx + 'px）；把 step 调到 >= ' + minStep + ' 再来',
      }
    }
    const out: number[] = []
    for (let x = startPx; x <= endPx; x += stepPx) out.push(x)
    return { columns: out }
  }

  return { columns: null, reason: 'columns 只支持「像素数组」或「"a..b step s" 比例字符串」（收到 ' + String(raw) + '）。' + COLUMNS_SYNTAX_HINT }
}

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

/** 一列上的命中的 run（`scan-horizontal` / `bodyTop` 共用）。 */
interface ColumnRun {
  start: number
  run: number
  firstValue: number
}

/** 沿一列从 fromY 往 toY 找**第一个**连续满足 probe 且长度 >= minRun 的 run；找不到返回 null。 */
function columnRunOf(
  grid: ScanPixelSource,
  x: number,
  fromY: number,
  toY: number,
  probe: NormalizedProbe,
): ColumnRun | null {
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
    const run = y - start
    if (run >= probe.minRun) {
      return { start, run, firstValue: channelValue(grid.rgbaAt(x, start), probe.channel) }
    }
    /* run 太短不算数：从它后面继续找第一个够长的（minRun 的语义就是"够长"） */
  }
  return null
}

/**
 * landmark type `scan-horizontal`：沿列 x 从 fromY 往 toY 扫，**向下**找第一个
 * 满足 probe 且连续长度 >= minRun 的 run。
 *
 * （类型名沿用需求文档的写法；轴向是"列内竖直扫"。不叫 scan-vertical 是为了不跟
 * 老原语「第一个 alpha > 阈值」混为一谈。）
 *
 * 给了 `columns` 就走多列投票（`scanColumns`）。只给 `x` 的老用法**行为一行没变**：
 * 走的还是这条单列路径。
 */
export function scanHorizontal(
  grid: ScanPixelSource,
  req: ScanColumnRequest | null | undefined,
): MeasureLandmarkResult {
  const raw = req || {}
  if (raw.columns !== undefined && raw.columns !== null) return scanColumns(grid, raw)

  const probeOut = normalizeProbe(raw.probe)
  const probe = probeOut.probe
  if (!probe) return notFound(probeOut.reason)
  const rangeOut = resolveColumnRange(grid, raw)
  const range = rangeOut.range
  if (!range) return notFound(rangeOut.reason)

  const { x, fromY, toY, clipped } = range
  const hit = columnRunOf(grid, x, fromY, toY, probe)
  if (hit) {
    const result: MeasureLandmarkResult = {
      found: true,
      px: x,
      py: hit.start,
      value: hit.start,
      confidence: confidenceOf(hit.run, probe.minRun, hit.firstValue, probe.value),
      runLength: hit.run,
      runStart: hit.start,
      runEnd: hit.start + hit.run - 1,
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
  return notFound(
    '在 y=[' + fromY + ',' + toY + '] 没找到满足「' + condText(probe) +
      '」且连续 >= ' + probe.minRun + ' 行的 run',
  )
}

/**
 * `scan-horizontal` 的**多列**形态（也支撑 `bodyTop`）：同一批列各自扫一遍，再按
 * `aggregate`（min/max/median/mode）投票。
 *
 * 为什么需要它：单列必被局部干扰骗到——呆毛让结果偏 84px、被摸头时取到手背偏 80px、
 * 云/感叹号/泡泡这类特效偏 30px。同一套条件在 4~8 列上一般只有 1~2 列被污染，
 * 投票（尤其是 min/median）就能把它们投掉；而且 `perColumn` 会暴露哪几列叛变。
 *
 * 口径：
 * - `confidence` = 命中列数 / 总列数（0~1）；聚合**只用命中**的列；
 * - 命中率 < 50% 判 `found:false` + reason（多列都扫不到，说明条件本身错了），
 *   但 `perColumn` 全带上，一眼看出是哪几列挂的；
 * - `px` 给"产出这个 py 的那一列"，让核对图能画在真命中的位置上；
 * - `minRun` 缺省仍是 1（向后兼容），但会进 `warnings` 并给出推荐值。
 */
export function scanColumns(
  grid: ScanPixelSource,
  req: ScanColumnRequest | null | undefined,
): MeasureLandmarkResult {
  const raw = req || {}
  if (raw.columns !== undefined && raw.columns !== null && raw.x !== undefined && raw.x !== null) {
    return notFound(
      'columns 与 x 互斥：二选一。给 x = 单列老用法（行为不变），给 columns = 多列投票；' +
        '不会替你挑一个（猜错了就是几十 px 的系统性偏移）',
    )
  }

  const probeOut = normalizeProbe(raw.probe)
  const probe = probeOut.probe
  if (!probe) return notFound(probeOut.reason)

  const dims = frameDimsOf(grid)
  if (!dims) return notFound('帧尺寸无效（width/height 必须为正）')

  const aggregate = normalizeAggregate(raw.aggregate)
  if (!aggregate) {
    return notFound('aggregate 不支持：' + String(raw.aggregate) + '（可用 ' + SCAN_AGGREGATES.join(' / ') + '）')
  }

  const columnsOut = parseColumnsSpec(raw.columns, dims.width)
  const columns = columnsOut.columns
  if (!columns) return notFound(columnsOut.reason)

  const yOut = resolveYRange(grid, raw)
  const yRange = yOut.range
  if (!yRange) return notFound(yOut.reason)
  const { fromY, toY, clipped } = yRange

  const rawProbe = (raw.probe && typeof raw.probe === 'object') ? (raw.probe as { minRun?: unknown }) : null
  const warnings: string[] = []
  if (!rawProbe || Number.isNaN(toNum(rawProbe.minRun))) {
    warnings.push(
      'minRun 没给，按帧高 20% 推荐 ' + recommendMinRun(dims.height) +
        '（当前按 1 算：任何细长附属物都会抢答，多列投票也救不回"列列都错"）',
    )
  }

  const perColumn: MeasureColumnHit[] = []
  const pys: number[] = []
  const repOf = new Map<number, number>()
  for (const x of columns) {
    const hit = columnRunOf(grid, x, fromY, toY, probe)
    if (!hit) {
      perColumn.push({
        x,
        found: false,
        py: null,
        run: null,
        reason: '这一列没有连续 >= ' + probe.minRun + ' 行的「' + condText(probe) + '」',
      })
      continue
    }
    perColumn.push({
      x,
      found: true,
      py: hit.start,
      run: hit.run,
      confidence: confidenceOf(hit.run, probe.minRun, hit.firstValue, probe.value),
    })
    pys.push(hit.start)
    if (!repOf.has(hit.start)) repOf.set(hit.start, x)
  }

  const total = columns.length
  const hits = pys.length
  const confidence = total === 0 ? 0 : round3(hits / total)
  const base: MeasureLandmarkResult = {
    found: false,
    px: null,
    py: null,
    confidence,
    aggregate,
    columns,
    perColumn,
    space: 'frame',
    channel: probe.channel,
    op: probe.op,
    threshold: probe.value,
    fromY,
    toY,
  }
  if (warnings.length) base.warnings = warnings
  if (clipped) base.clipped = true

  if (hits === 0) {
    base.reason = '多列全部扫不到（0/' + total + ' 列命中）：条件或 y 区间大概率不对，先看 perColumn 的 reason'
    return base
  }
  if (hits / total < 0.5) {
    base.reason = '多数列扫不到（' + hits + '/' + total + ' 列命中，命中率 ' + Math.round((hits / total) * 100) + '% < 50%）：先确认 probe 条件对这批列是否成立，再谈聚合'
    return base
  }

  const py = aggregateValues(pys, aggregate)
  const repX = repOf.get(py) ?? columns[0]!
  return { ...base, found: true, px: repX, py, value: py, column: repX }
}

/**
 * landmark type `bodyTop`：语义是「身高上端」。
 *
 * 工具**不写死任何素材路标**（不许出现"发带/帽檐"这类词）：它只做
 * 「调用方给条件 → 多列带扫描 → 取 min」这一件事。上端取 min 的理由：
 * 附属物（呆毛、挑起来的发丝）只会让某几列的结果**偏上**，min 是"最先出现主体"的那一列，
 * 恰好多列时反而不稳；所以 `aggregate` 仍可覆盖（默认 min）。
 *
 * `minRun` 可以写在 landmark 级别（需求里的写法），会合并进 `probe.minRun` 并覆盖它。
 */
export function findBodyTop(
  grid: ScanPixelSource,
  req: BodyTopRequest | null | undefined,
): MeasureLandmarkResult {
  const raw = req || {}
  const topMinRun = toNum(raw.minRun)
  let probeOut: unknown = raw.probe
  if (!Number.isNaN(topMinRun)) {
    const baseProbe = (raw.probe && typeof raw.probe === 'object') ? { ...(raw.probe as Record<string, unknown>) } : {}
    probeOut = { ...baseProbe, minRun: Math.max(1, Math.round(topMinRun)) }
  }
  const result = scanColumns(grid, {
    ...raw,
    probe: probeOut,
    aggregate: raw.aggregate === undefined ? 'min' : raw.aggregate,
  })
  return result
}

/** 中央竖带（`bodyBottom` 的 `band`），换算成帧内列区间。 */
export function resolveBand(
  frameWidth: number,
  band: unknown,
): { x0: number; x1: number; centerFrac: number; widthFrac: number } | { reason: string } {
  const width = toNum(frameWidth)
  if (Number.isNaN(width) || width <= 0) return { reason: '帧宽无效（width 必须为正）' }
  const spec = (band && typeof band === 'object') ? (band as { centerFrac?: unknown; widthFrac?: unknown }) : {}
  const centerFrac = Number.isNaN(toNum(spec.centerFrac)) ? 0.5 : toNum(spec.centerFrac)
  const widthFrac = Number.isNaN(toNum(spec.widthFrac)) ? 0.4 : toNum(spec.widthFrac)
  if (!(centerFrac >= 0 && centerFrac <= 1)) return { reason: 'band.centerFrac=' + centerFrac + ' 必须落在 0~1（帧宽比例）' }
  if (!(widthFrac > 0 && widthFrac <= 1)) return { reason: 'band.widthFrac=' + widthFrac + ' 必须落在 (0,1]（帧宽比例）' }
  const half = widthFrac / 2
  const leftFrac = centerFrac - half
  const x0 = Math.max(0, Math.round(leftFrac * width))
  const x1 = Math.min(width - 1, Math.round((centerFrac + half) * width) - 1)
  if (x1 < x0) return { reason: 'band 换算后是空区间（x0=' + x0 + ' > x1=' + x1 + '）：widthFrac 太小或 centerFrac 贴边' }
  return { x0, x1, centerFrac, widthFrac }
}

/**
 * 行扫描：在一行里找**最长的连续命中段**（与列扫描方向相反）。
 *
 * 返回最长段的长度、起止列，以及**段中点那个像素**的通道值——后者用来算"离阈值多远"
 * 的可信度，取中点而不是端点，是为了不被抗锯齿的单像素误伤。
 */
function rowRunOf(
  grid: ScanPixelSource,
  y: number,
  x0: number,
  x1: number,
  probe: NormalizedProbe,
): { run: number; startX: number; endX: number; midValue: number } {
  let best = 0
  let bestStart = x0
  let x = x0
  while (x <= x1) {
    const value = channelValue(grid.rgbaAt(x, y), probe.channel)
    if (!compareOp(value, probe.op, probe.value)) {
      x++
      continue
    }
    const start = x
    while (x <= x1 && compareOp(channelValue(grid.rgbaAt(x, y), probe.channel), probe.op, probe.value)) x++
    const run = x - start
    if (run > best) {
      best = run
      bestStart = start
    }
  }
  if (best === 0) return { run: 0, startX: x0, endX: x0, midValue: Number.NaN }
  const endX = bestStart + best - 1
  const midX = bestStart + Math.floor((best - 1) / 2)
  return { run: best, startX: bestStart, endX, midValue: channelValue(grid.rgbaAt(midX, y), probe.channel) }
}

/**
 * landmark type `bodyBottom`：语义是「身高下端」。
 *
 * 从 toY **往上**找第一个「中央带里存在连续 >= minRunPx 个满足条件的像素」的行，
 * 也就是最低的那条符合条件的地平线。方向与列扫描相反，所以单独一个原语。
 *
 * 用"行内连续像素数"而不是"这一行有多少个命中像素"：后者会被散落的阴影/碎屑满足，
 * 前者要求是**一整条连续段**，才像"底边"。
 */
export function findBodyBottom(
  grid: ScanPixelSource,
  req: BodyBottomRequest | null | undefined,
): MeasureLandmarkResult {
  const raw = req || {}
  const probeOut = normalizeProbe(raw.probe)
  const probe = probeOut.probe
  if (!probe) return notFound(probeOut.reason)

  const dims = frameDimsOf(grid)
  if (!dims) return notFound('帧尺寸无效（width/height 必须为正）')

  const bandOut = resolveBand(dims.width, raw.band)
  if ('reason' in bandOut) return notFound(bandOut.reason)
  const { x0, x1 } = bandOut

  const yOut = resolveYRange(grid, raw)
  const yRange = yOut.range
  if (!yRange) return notFound(yOut.reason)
  const { fromY, toY, clipped } = yRange

  const minRunPx = Number.isNaN(toNum(raw.minRunPx)) ? 1 : Math.max(1, Math.round(toNum(raw.minRunPx)))

  const warnings: string[] = []
  if (Number.isNaN(toNum(raw.minRunPx))) {
    warnings.push('minRunPx 没给，按 1 算：整条判据形同没有，散落的阴影也能满足，实际用必须给')
  }

  for (let y = toY; y >= fromY; y--) {
    const row = rowRunOf(grid, y, x0, x1, probe)
    if (row.run < minRunPx) continue
    const lengthScore = clamp01(row.run / Math.max(1, 2 * minRunPx))
    const marginScore = clamp01(Math.abs(row.midValue - probe.value) / MARGIN_SCALE)
    const result: MeasureLandmarkResult = {
      found: true,
      px: row.startX + Math.floor((row.run - 1) / 2),
      py: y,
      value: y,
      confidence: round3(clamp01(0.6 * lengthScore + 0.4 * marginScore)),
      run: row.run,
      runLength: row.run,
      bandX: [x0, x1],
      minRunPx,
      channel: probe.channel,
      op: probe.op,
      threshold: probe.value,
      fromY,
      toY,
      space: 'frame',
    }
    if (warnings.length) result.warnings = warnings
    if (clipped) result.clipped = true
    return result
  }
  const miss = notFound(
    '在 y=[' + fromY + ',' + toY + '] 的中央带 x=[' + x0 + ',' + x1 + '] 里，没有一行存在连续 >= ' +
      minRunPx + ' 个「' + condText(probe) + '」的像素',
  )
  miss.bandX = [x0, x1]
  miss.minRunPx = minRunPx
  miss.space = 'frame'
  if (warnings.length) miss.warnings = warnings
  if (clipped) miss.clipped = true
  return miss
}

/** 一次 measure 里同时量到上下端时，各自的异常证据（给 `landmarkWarnings` 用）。 */
function spreadOfColumn(mark: MeasureLandmarkResult): { spread: number; hits: number; total: number } {
  const list = Array.isArray(mark.perColumn) ? mark.perColumn : []
  const pys = list.filter((row) => row && row.found === true && typeof row.py === 'number').map((row) => Number(row.py))
  const total = list.length
  if (pys.length === 0) return { spread: 0, hits: 0, total }
  return { spread: Math.max(...pys) - Math.min(...pys), hits: pys.length, total }
}

/**
 * 「别一路绿灯」的交叉校验：一次 measure 里同时量出 `bodyTop` 与 `bodyBottom` 时，
 * 若某一端置信度 < 0.6，或某端各列 py 极差 > 帧高 10%，就报警。
 *
 * 为什么只看这两个信号：
 * - 极差大 = 各列看到的东西不一样（手挡住了、特效压上来了、姿态把形变拉偏了）；
 * - 置信度低 = 命中的 run 太短或离阈值太近（跟背景/肤色在边缘上打架）。
 * 两者都在**同一次调用内**可算，不需要历史状态。
 *
 * **不跟同批帧的中位数比较**：那要跨调用/跨帧保存状态（"这批"是谁、哪一帧算基准），
 * 而 measure 是无状态的单次查询。这件事留给以后的 `sprite_verify`（能一次看到整批）。
 */
export function landmarkWarnings(
  landmarks: ReadonlyArray<MeasureLandmarkResult> | null | undefined,
  frameHeight: number,
): string[] {
  const list = Array.isArray(landmarks) ? landmarks : []
  const top = list.find((mark) => mark && mark.type === 'bodyTop' && mark.found === true)
  const bottom = list.find((mark) => mark && mark.type === 'bodyBottom' && mark.found === true)
  if (!top || !bottom) return []

  const height = toNum(frameHeight)
  const heightPx = Number.isFinite(height) && height > 0 ? Math.round(height) : 0
  const texts: string[] = []

  const parts: Array<{ name: string; mark: MeasureLandmarkResult }> = [
    { name: 'bodyTop', mark: top },
    { name: 'bodyBottom', mark: bottom },
  ]
  for (const { name, mark } of parts) {
    const spread = spreadOfColumn(mark)
    const ratio = spread.total > 0 ? Math.round((spread.hits / spread.total) * 100) : null
    const hitText = ratio === null ? '' : '，命中率 ' + spread.hits + '/' + spread.total + '（' + ratio + '%）'
    if (heightPx > 0 && spread.total > 0 && spread.spread > heightPx * 0.1) {
      texts.push(
        name + ' 各列 py 极差 ' + spread.spread + 'px = 帧高 ' +
          Math.round((spread.spread / heightPx) * 100) + '%（> 10%）' + hitText,
      )
    }
    const confidence = Number(mark.confidence)
    if (!(confidence >= 0.6)) {
      texts.push(name + ' 置信度 ' + (Number.isFinite(confidence) ? confidence : 0) + ' < 0.6' + hitText)
    }
  }

  const topPy = Number(top.py)
  const bottomPy = Number(bottom.py)
  let heightText = ''
  if (Number.isFinite(topPy) && Number.isFinite(bottomPy)) {
    const bodyHeight = bottomPy - topPy
    if (bodyHeight <= 0) texts.push('下端 py=' + bottomPy + ' 不在上端 py=' + topPy + ' 之下（上下端可能认反了）')
    else heightText = '（身高 ' + bodyHeight + 'px）'
  }

  /* 只有"极差过大 / 置信度低 / 上下端认反"算异常；两者都干净时就不出声。 */
  if (texts.length === 0) return []
  return ['疑似被遮挡/形变：' + texts.join('；') + heightText]
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
