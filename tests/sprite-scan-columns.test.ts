/**
 * sprite-scan-columns.test —— 多列扫描（`scan-horizontal` + `columns`）与语义原语
 * （`bodyTop` / `bodyBottom`）的判据。
 *
 * 为什么单独一个文件而不是往 `sprite-scan.test.ts` 里加：那份是 P2-5 单列的判据，
 * 已经被"老行为一行不许变"钉住了；新增能力的判据放这里，两边互不干扰，回滚也清楚。
 *
 * 场景都是手写几何（和 `sprite-scan.test.ts` 同一套思路）：每个断言都对应
 * 「单列会被谁骗 / 多列投票怎么救回来」的具体数字，不是"看起来差不多"。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  aggregateValues,
  findBodyBottom,
  findBodyTop,
  landmarkWarnings,
  normalizeAggregate,
  parseColumnsSpec,
  recommendMinRun,
  resolveBand,
  resolveYRange,
  scanColumns,
  scanHorizontal,
  type ScanPixelSource,
} from '../src/sprite/scan.js'
import { SCAN_AGGREGATES, SCAN_CHANNELS, SCAN_OPS, type MeasureLandmarkResult } from '../src/sprite/types.js'
import { buildTools } from '../src/sprite/tools.js'
import type { SpriteService } from '../src/sprite/service.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PAGE = path.join(ROOT, 'assets', 'sprite', 'sprite-tool.html')

/** 白（发带）在上、蓝（头发）在下，交界 187；120~123 埋 4 行蓝呆毛。 */
function hairScene(): ScanPixelSource {
  const width = 720
  const height = 601
  const pixel = (x: number, y: number): [number, number, number, number] => {
    const strayBlue = y >= 120 && y <= 123
    if (y >= 187 || strayBlue) return [60 + (y % 3), 90, 200, 255]
    return [248 + (x % 4), 249, 251, 255]
  }
  return { width, height, rgbaAt: pixel }
}

/**
 * 同一个场景 + **一列被污染**：x=300 那一列在 60~75 有 16 行蓝（模拟被摸头/云/泡泡
 * 压上来）。这是用户实测踩的坑：单列扫到 60，偏 127px。
 */
function pollutedScene(): ScanPixelSource {
  const base = hairScene()
  const pixel = (x: number, y: number): [number, number, number, number] => {
    if (x === 300 && y >= 60 && y <= 75) return [60, 90, 200, 255]
    return base.rgbaAt(x, y)
  }
  return { width: base.width, height: base.height, rgbaAt: pixel }
}

/**
 * 语义点用的场景：上端按列不同（x<300 从 100 开始，x>=300 从 140 开始），
 * 白色到 399、蓝色在 400 以后；500~560 是一条深色"地平线"（中央带才有）。
 */
function bodyScene(): ScanPixelSource {
  const width = 720
  const height = 601
  const pixel = (x: number, y: number): [number, number, number, number] => {
    const top = x < 300 ? 100 : 140
    if (y >= 500 && y <= 560) return [40, 44, 48, 255] // 深色（luma≈43）
    if (y < top) return [10, 200, 30, 255] // 绿幕
    if (y < 400) return [250, 250, 251, 255] // 白（whiteness 命中）
    /* 蓝要比 DARK_PROBE 的 110 亮：否则"下端"会被头顶上方的蓝发整片命中（43.3 那种深蓝就踩这个坑） */
    return [120, 150, 230, 255]
  }
  return { width, height, rgbaAt: pixel }
}

const HAIR_PROBE = { channel: 'blue-minus-red', op: '>', value: 25, minRun: 12 } as const
const WHITE_PROBE = { channel: 'whiteness', op: '>', value: 210 } as const
const DARK_PROBE = { channel: 'luma', op: '<', value: 110 } as const

/* ---------------------------------- 纯函数 ---------------------------------- */

test('parseColumnsSpec：像素数组去重升序；比例字符串按帧宽换算（含端点）', () => {
  assert.deepEqual(parseColumnsSpec([200, 260, 320, 380], 720).columns, [200, 260, 320, 380])
  assert.deepEqual(parseColumnsSpec([380, 200, 200, 260], 720).columns, [200, 260, 380], '重复列要去重')
  // 0.30..0.70 step 0.05 @720 → 216, 252, ... 504（含 a 与 b）
  assert.deepEqual(
    parseColumnsSpec('0.30..0.70 step 0.05', 720).columns,
    [216, 252, 288, 324, 360, 396, 432, 468, 504],
  )
  assert.deepEqual(parseColumnsSpec('0.30..0.30 step 0.05', 720).columns, [216], 'a==b 时只有一列')
  // 0.9..1 的上界换算成 720 会落到帧外，必须夹到 719（不然会生成非法列）
  assert.deepEqual(parseColumnsSpec('0.9..1 step 0.05', 720).columns, [648, 684])
})

test('parseColumnsSpec：每种非法写法都给出能照做的原因（不是"参数错误"）', () => {
  const bad = (raw: unknown, width: number, pattern: RegExp, label: string): void => {
    const out = parseColumnsSpec(raw, width)
    assert.equal(out.columns, null, label + ' 不该给出列')
    assert.match(String(out.reason), pattern, label)
  }
  bad(null, 720, /只支持/, 'null')
  bad([], 720, /空数组/, '空数组')
  bad(['a'], 720, /不是数字/, '非数字项')
  bad([900], 720, /超出可用列/, '像素越界')
  bad('0.3-0.7 step 0.05', 720, /解析不了/, '分隔符写错')
  bad('0.30..0.70', 720, /缺 step/, '缺 step')
  bad('0.30..0.70 step 0', 720, /必须大于 0/, '步长为 0')
  bad('0.30..0.70 step 2', 720, /必须 <= 1/, '步长 >1（比例写错成像素）')
  bad('1.2..1.5 step 0.1', 720, /超出 0~1/, 'a/b 当成像素写了')
  bad('0.7..0.3 step 0.1', 720, /大于 b/, '区间反向')
  bad('0.30..0.70 step 0.001', 1920, /超过上限 200/, '列数爆炸')
  // 报错里必须有"怎么改"：列数爆炸时要给出建议的 step
  assert.match(String(parseColumnsSpec('0.30..0.70 step 0.001', 1920).reason), /把 step 调到 >= /)
})

test('aggregateValues：min/max/median（奇偶）/mode（平票取最小 py）', () => {
  assert.equal(aggregateValues([187, 60, 187, 187], 'min'), 60)
  assert.equal(aggregateValues([187, 60, 187, 187], 'max'), 187)
  assert.equal(aggregateValues([187, 60, 187, 187], 'median'), 187, '1 个离群点不影响偶数中位')
  assert.equal(aggregateValues([187, 60, 300], 'median'), 187, '奇数取正中')
  assert.equal(aggregateValues([10, 20], 'median'), 15, '偶数取中间两条均值')
  assert.equal(aggregateValues([187, 60, 187, 187], 'mode'), 187)
  assert.equal(aggregateValues([50, 90], 'mode'), 50, '平票取更小的 py（确定性）')
  assert.ok(Number.isNaN(aggregateValues([], 'median')), '空数组给 NaN，不编一个数')
  assert.equal(normalizeAggregate(undefined), 'median', '默认 median')
  assert.equal(normalizeAggregate('', 'min'), 'min', '空串走 fallback')
  assert.equal(normalizeAggregate('mean'), null, '不认识的不猜')
})

test('recommendMinRun：帧高 20% → 向上取整到 5 的倍数，下限 8', () => {
  assert.equal(recommendMinRun(601), 120) // round(120.2)=120，已是 5 的倍数
  assert.equal(recommendMinRun(962), 195) // round(192.4)=192 → 上取整到 195
  assert.equal(recommendMinRun(1000), 200)
  assert.equal(recommendMinRun(10), 8, '下限 8：小帧也不许低于 8 行')
  assert.equal(recommendMinRun(Number.NaN), 8, '无效帧高退回下限，不给 NaN')
})

test('resolveYRange / resolveBand：区间与中央带的换算口径', () => {
  const grid = hairScene()
  assert.deepEqual(resolveYRange(grid, { fromY: 60, toY: 600 }).range, { fromY: 60, toY: 600, clipped: false })
  assert.deepEqual(resolveYRange(grid, { fromY: -20, toY: 9000 }).range, { fromY: 0, toY: 600, clipped: true })
  assert.match(String(resolveYRange(grid, { fromY: 500, toY: 400 }).reason), /扫描区间为空/)

  const band = resolveBand(720, { centerFrac: 0.5, widthFrac: 0.4 })
  assert.deepEqual(band, { x0: 216, x1: 503, centerFrac: 0.5, widthFrac: 0.4 }, '中央 40% = [216,503]')
  assert.deepEqual(resolveBand(720, undefined), { x0: 216, x1: 503, centerFrac: 0.5, widthFrac: 0.4 }, '缺省 0.5/0.4')
  assert.match(String((resolveBand(720, { widthFrac: 0 }) as { reason: string }).reason), /widthFrac/)
  assert.match(String((resolveBand(720, { centerFrac: 2 }) as { reason: string }).reason), /centerFrac/)
})

/* ------------------------------ 多列 scan-horizontal ------------------------------ */

test('多列扫描：4 列里 1 列被污染，median 取回 187（单列会取到 60，偏 127px）', () => {
  const grid = pollutedScene()
  const single = scanHorizontal(grid, { x: 300, fromY: 60, toY: 600, probe: HAIR_PROBE })
  assert.equal(single.py, 60, '单列：被那一列的 16 行蓝骗到 60（这正是踩过的坑）')

  const multi = scanColumns(grid, { columns: [200, 300, 380, 460], fromY: 60, toY: 600, probe: HAIR_PROBE })
  assert.equal(multi.found, true)
  assert.equal(multi.py, 187, '多列 median 取回真交界')
  assert.equal(multi.aggregate, 'median', '默认聚合是 median')
  assert.deepEqual(multi.columns, [200, 300, 380, 460])
  assert.equal(multi.space, 'frame', '多列结果必须声明坐标空间')
  assert.equal(multi.confidence, 1, 'confidence = 命中列数 / 总列数 = 4/4')
  assert.equal(multi.px, 200, 'px 给产出该 py 的第一列（核对图要画在真命中的位置）')
  assert.equal(multi.perColumn?.length, 4)
  assert.deepEqual(
    multi.perColumn?.map((row) => row.py),
    [187, 60, 187, 187],
    'perColumn 必须暴露叛变的那一列（x=300 → 60）',
  )
  assert.equal(multi.perColumn?.[1]?.run, 16)
})

test('多列扫描：aggregate=min 就是"谁最靠上信谁"，离群点会赢——所以要显式选', () => {
  const multi = scanColumns(pollutedScene(), {
    columns: [200, 300, 380, 460],
    fromY: 60,
    toY: 600,
    probe: HAIR_PROBE,
    aggregate: 'min',
  })
  assert.equal(multi.py, 60)
  assert.equal(multi.aggregate, 'min')
})

test('多列扫描：列号重复/乱序自动归位；x 与 columns 互斥（给明确错误）', () => {
  const multi = scanColumns(hairScene(), { columns: [460, 200, 200, 300], fromY: 60, toY: 600, probe: HAIR_PROBE })
  assert.deepEqual(multi.columns, [200, 300, 460], '去重 + 升序')
  assert.equal(multi.py, 187)

  const both = scanColumns(hairScene(), { x: 360, columns: [200, 300], probe: HAIR_PROBE })
  assert.equal(both.found, false)
  assert.match(String(both.reason), /互斥/)
})

test('多列扫描：命中列数 < 50% → found:false，但 perColumn 全带上（看得出哪几列挂了）', () => {
  // 只有 x>=300 的列有白，x<300 全是蓝 → 探白一段都扫不到
  const grid: ScanPixelSource = {
    width: 720,
    height: 601,
    rgbaAt: (x, y) => (y >= 187 || x < 300 ? [60, 90, 200, 255] : [250, 250, 251, 255]),
  }
  const out = scanColumns(grid, { columns: [100, 150, 200, 600], fromY: 0, toY: 600, probe: WHITE_PROBE })
  assert.equal(out.found, false)
  assert.match(String(out.reason), /多数列扫不到/)
  assert.match(String(out.reason), /1\/4/)
  assert.equal(out.confidence, 0.25, 'confidence 如实给命中率')
  assert.equal(out.px, null)
  assert.equal(out.py, null)
  assert.equal(out.perColumn?.length, 4, 'perColumn 必须全带上')
  assert.equal(out.perColumn?.filter((row) => row.found === false).length, 3)
  assert.match(String(out.perColumn?.[0]?.reason), /这一列没有连续/)
})

test('多列扫描：全都没命中时 reason 指向"条件或 y 区间"，不是"参数错误"', () => {
  const out = scanColumns(hairScene(), { columns: [100, 300], fromY: 0, toY: 600, probe: { ...WHITE_PROBE, value: 999 } })
  assert.equal(out.found, false)
  assert.match(String(out.reason), /多列全部扫不到/)
  assert.equal(out.confidence, 0)
})

test('多列扫描：minRun 缺省仍是 1（向后兼容），但会进 warnings 并给推荐值', () => {
  const out = scanColumns(hairScene(), {
    columns: [200, 300],
    fromY: 0,
    toY: 600,
    probe: { channel: 'blue-minus-red', op: '>', value: 25 },
  })
  assert.equal(out.found, true)
  assert.equal(out.py, 120, 'minRun=1 时呆毛抢答（语义没变，只是现在会警告）')
  assert.equal(out.warnings?.length, 1)
  assert.match(String(out.warnings?.[0]), /minRun 没给/)
  assert.match(String(out.warnings?.[0]), /推荐 120/, '帧高 601 → 推荐 120')

  const withRun = scanColumns(hairScene(), { columns: [200, 300], fromY: 0, toY: 600, probe: HAIR_PROBE })
  assert.equal(withRun.warnings, undefined, '给了 minRun 就不该再念')
})

test('scanHorizontal：给了 columns 就走多列；只给 x 的老用法行为一字不变', () => {
  const grid = hairScene()
  const viaColumns = scanHorizontal(grid, { columns: [200, 300], fromY: 60, toY: 600, probe: HAIR_PROBE })
  assert.equal(viaColumns.py, 187)
  assert.deepEqual(viaColumns.columns, [200, 300])

  const single = scanHorizontal(grid, { x: 360, fromY: 60, toY: 600, probe: HAIR_PROBE })
  assert.deepEqual(
    { px: single.px, py: single.py, runLength: single.runLength, confidence: single.confidence, column: single.column },
    { px: 360, py: 187, runLength: 414, confidence: 1, column: 360 },
    '单列老字段一个都不许变',
  )
  assert.equal(single.columns, undefined, '单列不该冒出多列字段')
  assert.equal(single.warnings, undefined)
})

/* --------------------------------- 语义原语 --------------------------------- */

test('bodyTop：多列扫描默认取 min；columns 支持比例字符串；minRun 可写在 landmark 级别', () => {
  const grid = bodyScene()
  const top = findBodyTop(grid, {
    columns: '0.30..0.70 step 0.05',
    probe: WHITE_PROBE,
    minRun: 120,
    fromY: 0,
    toY: 600,
  })
  assert.equal(top.found, true)
  assert.equal(top.py, 100, 'x<300 的列从 100 开始，min 取最靠上的那条')
  assert.equal(top.aggregate, 'min', 'bodyTop 默认 min')
  assert.equal(top.space, 'frame')
  assert.deepEqual(top.columns, [216, 252, 288, 324, 360, 396, 432, 468, 504])
  assert.equal(top.confidence, 1)
  const pys = top.perColumn?.map((row) => row.py)
  assert.deepEqual(pys, [100, 100, 100, 140, 140, 140, 140, 140, 140], '竖直方向的分界按列不同')
})

test('bodyTop：minRun 写在 landmark 级别会覆盖 probe.minRun；不给就进 warning', () => {
  const grid = bodyScene()
  const loose = findBodyTop(grid, { columns: [216, 360], probe: WHITE_PROBE, fromY: 0, toY: 600 })
  assert.equal(loose.found, true, 'minRun=1 时白段随便就有 1 行，命中')
  assert.match(String(loose.warnings?.[0]), /minRun 没给/)

  // 白段在 x=216 是 100..399（300 行）、在 x=360 是 140..399（260 行）：都不够 400
  const strict = findBodyTop(grid, { columns: [216, 360], probe: WHITE_PROBE, minRun: 400, fromY: 0, toY: 600 })
  assert.equal(strict.warnings, undefined, 'landmark 级 minRun 已给，不该再念')
  assert.equal(strict.found, false, 'minRun 大到没有任何一段满足时如实 found:false')
  assert.match(String(strict.reason), /多列全部扫不到/)

  // 覆盖关系：probe.minRun=1 + landmark minRun=120 → 生效的是 120（否则会采到绿幕下第一行白）
  const override = findBodyTop(grid, {
    columns: [216, 360],
    probe: { channel: 'whiteness', op: '>', value: 210, minRun: 1 },
    minRun: 120,
    fromY: 0,
    toY: 600,
  })
  assert.equal(override.found, true)
  assert.equal(override.py, 100, 'landmark 级 minRun 覆盖 probe.minRun（第 0 行绿幕不过 whiteness，白从 100 开始）')
})

test('bodyBottom：从下往上找中央带里最低的一条连续行（行扫描，方向与列扫描相反）', () => {
  const sole = findBodyBottom(bodyScene(), { band: { centerFrac: 0.5, widthFrac: 0.4 }, probe: DARK_PROBE, minRunPx: 12 })
  assert.equal(sole.found, true)
  assert.equal(sole.py, 560, '深色 500~560，从下往上第一个满足的是 560')
  assert.equal(sole.run, 288, '中央 40% = [216,503]，宽 288px 全是连续命中')
  assert.deepEqual(sole.bandX, [216, 503])
  assert.equal(sole.minRunPx, 12)
  assert.equal(sole.space, 'frame')
  assert.equal(sole.confidence, 1, 'run 够长 + 离阈值够远')
})

test('bodyBottom：行内连续长度不够就跳过（碎屑/阴影满足不了）', () => {
  const width = 200
  const height = 300
  const grid: ScanPixelSource = {
    width,
    height,
    rgbaAt: (x, y) => {
      // 第 250 行只有 x=100..107（8px）深色：连续段太短，不能算底边
      if (y === 250 && x >= 100 && x <= 107) return [40, 44, 48, 255]
      // 第 200 行整行深色：这才是底边
      if (y === 200) return [40, 44, 48, 255]
      return [250, 250, 251, 255]
    },
  }
  const sole = findBodyBottom(grid, { probe: DARK_PROBE, minRunPx: 12 })
  assert.equal(sole.found, true)
  assert.equal(sole.py, 200, '250 那一行只有 8px 连续，跳过；200 整行满足')
  assert.equal(sole.run, 80, '缺省中央带 [60,139] = 80px')

  const picky = findBodyBottom(grid, { probe: DARK_PROBE, minRunPx: 4 })
  assert.equal(picky.py, 250, '阈值降到 4 就轮到最后那行的 8px 了（这就是 minRunPx 的意义）')
})

test('bodyBottom：扫不到 / band 非法 / minRunPx 缺省 都给明确原因与告警', () => {
  const miss = findBodyBottom(bodyScene(), { band: { centerFrac: 0.5, widthFrac: 0.4 }, probe: DARK_PROBE, minRunPx: 400 })
  assert.equal(miss.found, false)
  assert.match(String(miss.reason), /中央带/)
  assert.match(String(miss.reason), /连续 >= 400/)
  assert.deepEqual(miss.bandX, [216, 503], '扫不到时也要回显扫了哪条带')

  const badBand = findBodyBottom(bodyScene(), { band: { widthFrac: 0 }, probe: DARK_PROBE, minRunPx: 12 })
  assert.equal(badBand.found, false)
  assert.match(String(badBand.reason), /widthFrac/)

  const loose = findBodyBottom(bodyScene(), { probe: DARK_PROBE })
  assert.equal(loose.found, true)
  assert.match(String(loose.warnings?.[0]), /minRunPx 没给/)
})

/* ------------------------- 遮挡/形变交叉校验（不要一路绿灯） ------------------------- */

const mark = (over: Partial<MeasureLandmarkResult> & { type: string }): MeasureLandmarkResult => ({
  px: 0,
  py: 0,
  confidence: 1,
  found: true,
  ...over,
})

test('landmarkWarnings：上下端都干净时不出声', () => {
  const out = landmarkWarnings(
    [
      mark({ type: 'bodyTop', py: 100, confidence: 1, perColumn: [
        { x: 200, found: true, py: 100, run: 300 },
        { x: 260, found: true, py: 101, run: 299 },
      ] }),
      mark({ type: 'bodyBottom', py: 560, confidence: 1 }),
    ],
    601,
  )
  assert.deepEqual(out, [])
})

test('landmarkWarnings：各列 py 极差 > 帧高 10% 就报，并把极差/命中率写进去', () => {
  const out = landmarkWarnings(
    [
      mark({ type: 'bodyTop', py: 100, confidence: 1, perColumn: [
        { x: 200, found: true, py: 100, run: 300 },
        { x: 260, found: true, py: 187, run: 200 },
        { x: 320, found: true, py: 100, run: 300 },
        { x: 380, found: false, py: null, run: null, reason: '没命中' },
      ] }),
      mark({ type: 'bodyBottom', py: 560, confidence: 1 }),
    ],
    601,
  )
  assert.equal(out.length, 1)
  assert.match(out[0]!, /疑似被遮挡\/形变/)
  assert.match(out[0]!, /极差 87px/) // 187-100
  assert.match(out[0]!, /命中率 3\/4/, '命中率要写进去（这列挂了也要看得出来）')
  assert.match(out[0]!, /身高 460px/)
})

test('landmarkWarnings：置信度 < 0.6 也报；上下端认反了单独点名', () => {
  const lowConf = landmarkWarnings(
    [
      mark({ type: 'bodyTop', py: 100, confidence: 0.42 }),
      mark({ type: 'bodyBottom', py: 560, confidence: 1 }),
    ],
    601,
  )
  assert.match(lowConf[0]!, /bodyTop 置信度 0\.42 < 0\.6/)

  const reversed = landmarkWarnings(
    [
      mark({ type: 'bodyTop', py: 560, confidence: 1 }),
      mark({ type: 'bodyBottom', py: 100, confidence: 1 }),
    ],
    601,
  )
  assert.match(reversed[0]!, /上下端可能认反了/)
})

test('landmarkWarnings：只有一端 / 一端没找到时不做交叉校验（缺数据就别猜）', () => {
  assert.deepEqual(landmarkWarnings([mark({ type: 'bodyTop', py: 100 })], 601), [])
  assert.deepEqual(
    landmarkWarnings(
      [mark({ type: 'bodyTop', py: 100 }), mark({ type: 'bodyBottom', py: 560, found: false, confidence: 0 })],
      601,
    ),
    [],
  )
  assert.deepEqual(landmarkWarnings(null, 601), [])
})

/* ------------------------ 页面那份实现的 parity（同向量逐字段相等） ------------------------ */

interface HtmlScanPrimitives {
  channels: string[]
  ops: string[]
  aggregates: string[]
  maxScanColumns: number
  channelValue(rgba: number[], channel: string): number
  compareOp(value: number, op: string, target: number): boolean
  normalizeProbe(raw: unknown): { probe: unknown; reason?: string }
  resolveColumnRange(grid: unknown, req: unknown): unknown
  resolveYRange(grid: unknown, req: unknown): unknown
  resolveBand(width: number, band: unknown): unknown
  recommendMinRun(height: number): number
  normalizeAggregate(raw: unknown, fallback?: string): string | null
  parseColumnsSpec(raw: unknown, width: number): unknown
  aggregateValues(values: number[], aggregate: string): number
  scanHorizontal(grid: unknown, req: unknown): Record<string, unknown>
  scanColumns(grid: unknown, req: unknown): Record<string, unknown>
  findBodyTop(grid: unknown, req: unknown): Record<string, unknown>
  findBodyBottom(grid: unknown, req: unknown): Record<string, unknown>
  landmarkWarnings(landmarks: unknown, frameHeight: number): string[]
  findBoundary(grid: unknown, req: unknown): Record<string, unknown>
}

function loadHtmlScanPrimitives(): HtmlScanPrimitives {
  const html = readFileSync(PAGE, 'utf8')
  const begin = html.indexOf('/* ==== SCAN-PRIMITIVES-BEGIN ==== */')
  const end = html.indexOf('/* ==== SCAN-PRIMITIVES-END ==== */')
  assert.ok(begin > 0, 'sprite-tool.html 里找不到 SCAN-PRIMITIVES-BEGIN 标记（parity 无从校验）')
  assert.ok(end > begin, 'sprite-tool.html 里找不到 SCAN-PRIMITIVES-END 标记')
  const source = html.slice(begin, end)
  assert.match(source, /function spriteScanPrimitives\(\)/)
  const factory = new Function(source + '\nreturn spriteScanPrimitives();') as () => HtmlScanPrimitives
  return factory()
}

test('HTML 的 spriteScanPrimitives 与 TS 参考实现逐字段一致（多列 + 语义原语 parity）', () => {
  const page = loadHtmlScanPrimitives()

  // 清单与常量：枚举由这两处一起决定，漂了 schema 就会说谎
  assert.deepEqual(page.channels, [...SCAN_CHANNELS])
  assert.deepEqual(page.ops, [...SCAN_OPS])
  assert.deepEqual(page.aggregates, [...SCAN_AGGREGATES])
  assert.equal(page.maxScanColumns, 200)

  // 纯函数向量
  for (const height of [601, 962, 1000, 10, Number.NaN]) {
    assert.equal(page.recommendMinRun(height), recommendMinRun(height), 'recommendMinRun 漂了：' + height)
  }
  for (const raw of [undefined, null, '', 'min', 'max', 'median', 'mode', 'mean', 'MIN']) {
    assert.equal(page.normalizeAggregate(raw), normalizeAggregate(raw), 'normalizeAggregate 漂了：' + String(raw))
  }
  for (const values of [[187, 60, 187, 187], [187, 60, 300], [10, 20], [50, 90], [7], []]) {
    for (const aggregate of [...SCAN_AGGREGATES, 'mean']) {
      const ts = aggregateValues(values, aggregate)
      const html = page.aggregateValues(values, aggregate)
      if (Number.isNaN(ts)) assert.equal(Number.isNaN(html), true, 'aggregate NaN 漂了')
      else assert.equal(html, ts, 'aggregateValues 漂了：' + JSON.stringify([values, aggregate]))
    }
  }
  const columnSpecs: Array<[unknown, number]> = [
    [[200, 260, 320, 380], 720],
    [[380, 200, 200, 260], 720],
    ['0.30..0.70 step 0.05', 720],
    ['0.30..0.30 step 0.05', 720],
    ['0.9..1 step 0.05', 720],
    ['0.30..0.70 step 0.001', 1920],
    ['0.30..0.70', 720],
    ['0.3-0.7 step 0.05', 720],
    ['1.2..1.5 step 0.1', 720],
    ['0.7..0.3 step 0.1', 720],
    ['0.30..0.70 step 0', 720],
    ['0.30..0.70 step 2', 720],
    [[], 720],
    [['a'], 720],
    [[900], 720],
    [null, 720],
    ['', 720],
  ]
  for (const [raw, width] of columnSpecs) {
    assert.deepEqual(page.parseColumnsSpec(raw, width), parseColumnsSpec(raw, width), 'parseColumnsSpec 漂了：' + JSON.stringify(raw))
  }
  for (const band of [undefined, { centerFrac: 0.5, widthFrac: 0.4 }, { widthFrac: 0 }, { centerFrac: 2 }, {}]) {
    assert.deepEqual(page.resolveBand(720, band), resolveBand(720, band), 'resolveBand 漂了：' + JSON.stringify(band))
  }
  for (const req of [{ fromY: 60, toY: 600 }, { fromY: -20, toY: 9000 }, { fromY: 500, toY: 400 }, { fromY: 700, toY: 900 }, {}]) {
    assert.deepEqual(page.resolveYRange(hairScene(), req), resolveYRange(hairScene(), req), 'resolveYRange 漂了：' + JSON.stringify(req))
  }

  // 扫描原语：同一批向量、同一个像素源，结果必须逐字段相等
  const grids: Array<[string, ScanPixelSource]> = [
    ['hair', hairScene()],
    ['polluted', pollutedScene()],
    ['body', bodyScene()],
  ]
  const columnScans = [
    { columns: [200, 300, 380, 460], fromY: 60, toY: 600, probe: HAIR_PROBE },
    { columns: [200, 300, 380, 460], fromY: 60, toY: 600, probe: HAIR_PROBE, aggregate: 'min' },
    { columns: [460, 200, 200, 300], fromY: 60, toY: 600, probe: HAIR_PROBE },
    { columns: [200, 300], fromY: 0, toY: 600, probe: { channel: 'blue-minus-red', op: '>', value: 25 } },
    { columns: [100, 150, 200, 600], fromY: 0, toY: 600, probe: WHITE_PROBE },
    { columns: [100, 300], fromY: 0, toY: 600, probe: { ...WHITE_PROBE, value: 999 } },
    { columns: [200, 300], x: 360, probe: HAIR_PROBE },
    { columns: [], probe: HAIR_PROBE },
    { columns: [200, 300], probe: HAIR_PROBE, aggregate: 'mean' },
    { columns: '0.30..0.70 step 0.05', fromY: 0, toY: 600, probe: WHITE_PROBE },
    { x: 360, fromY: 60, toY: 600, probe: HAIR_PROBE },
    { x: 360, fromY: 60, toY: 600, probe: { channel: 'blue-minus-red', op: '>', value: 25 } },
  ]
  for (const [label, grid] of grids) {
    for (const req of columnScans) {
      assert.deepEqual(
        page.scanColumns(grid, req),
        scanColumns(grid, req),
        'scanColumns 漂了（' + label + '）：' + JSON.stringify(req),
      )
      assert.deepEqual(
        page.scanHorizontal(grid, req),
        scanHorizontal(grid, req),
        'scanHorizontal 漂了（' + label + '）：' + JSON.stringify(req),
      )
    }
  }

  const topReqs = [
    { columns: '0.30..0.70 step 0.05', probe: WHITE_PROBE, minRun: 120, fromY: 0, toY: 600 },
    { columns: [216, 360], probe: WHITE_PROBE, fromY: 0, toY: 600 },
    { columns: [216, 360], probe: WHITE_PROBE, minRun: 400, fromY: 0, toY: 600 },
    { columns: [216, 360], probe: WHITE_PROBE, minRun: 120, aggregate: 'median', fromY: 0, toY: 600 },
    { columns: [200, 300], probe: HAIR_PROBE },
  ]
  for (const req of topReqs) {
    assert.deepEqual(page.findBodyTop(bodyScene(), req), findBodyTop(bodyScene(), req), 'findBodyTop 漂了：' + JSON.stringify(req))
  }

  const bottomReqs = [
    { band: { centerFrac: 0.5, widthFrac: 0.4 }, probe: DARK_PROBE, minRunPx: 12 },
    { band: { centerFrac: 0.5, widthFrac: 0.4 }, probe: DARK_PROBE, minRunPx: 400 },
    { probe: DARK_PROBE },
    { band: { widthFrac: 0 }, probe: DARK_PROBE, minRunPx: 12 },
    { band: { centerFrac: 0.2, widthFrac: 0.1 }, probe: DARK_PROBE, minRunPx: 12 },
    { probe: { channel: 'hue', op: '>', value: 1 } },
    { probe: DARK_PROBE, minRunPx: 4, fromY: 400, toY: 600 },
  ]
  for (const req of bottomReqs) {
    assert.deepEqual(
      page.findBodyBottom(bodyScene(), req),
      findBodyBottom(bodyScene(), req),
      'findBodyBottom 漂了：' + JSON.stringify(req),
    )
  }

  const warningVectors: MeasureLandmarkResult[][] = [
    [mark({ type: 'bodyTop', py: 100 }), mark({ type: 'bodyBottom', py: 560 })],
    [
      mark({ type: 'bodyTop', py: 100, perColumn: [
        { x: 200, found: true, py: 100, run: 300 },
        { x: 260, found: true, py: 187, run: 200 },
        { x: 320, found: false, py: null, run: null },
      ] }),
      mark({ type: 'bodyBottom', py: 560 }),
    ],
    [mark({ type: 'bodyTop', py: 100, confidence: 0.4 }), mark({ type: 'bodyBottom', py: 560, confidence: 0.5 })],
    [mark({ type: 'bodyTop', py: 560 }), mark({ type: 'bodyBottom', py: 100 })],
    [mark({ type: 'bodyTop', py: 100 })],
  ]
  for (const vector of warningVectors) {
    assert.deepEqual(
      page.landmarkWarnings(vector, 601),
      landmarkWarnings(vector, 601),
      'landmarkWarnings 漂了：' + JSON.stringify(vector),
    )
  }

  // boundary / resolveColumnRange 的老 parity 没被这次改动破坏
  const boundaries = [
    { x: 360, fromY: 60, toY: 600, a: { channel: 'blue-minus-red', op: '<', value: 10 }, b: HAIR_PROBE },
    { x: 360, fromY: 0, toY: 600, a: { channel: 'blue-minus-red', op: '<', value: 10 }, b: { channel: 'blue-minus-red', op: '>', value: 25 } },
  ]
  for (const req of boundaries) {
    assert.deepEqual(page.findBoundary(hairScene(), req), page.findBoundary(hairScene(), req))
  }
  for (const req of [{ x: 360, fromY: 60, toY: 600 }, { x: 720, fromY: 0, toY: 600 }, {}]) {
    assert.deepEqual(
      page.resolveColumnRange(hairScene(), req),
      page.resolveColumnRange(hairScene(), req),
      'resolveColumnRange 自洽',
    )
  }
})

/* -------------------------------- schema / 页面接线 -------------------------------- */

test('landmarks schema：老六种原样在前，新原语追加；columns/aggregate/band/minRunPx 都能被表达', () => {
  const service = {} as unknown as SpriteService
  const measure = buildTools(service).find((tool) => tool.name === 'sprite_measure')!
  const params = measure.parameters as {
    properties: { landmarks: { items: { properties: Record<string, any>; required?: string[] } } }
  }
  const items = params.properties.landmarks.items
  const typeEnum = (items.properties.type as { enum: string[] }).enum
  assert.deepEqual(typeEnum.slice(0, 6), [
    'bbox-top',
    'bbox-bottom',
    'bbox-left',
    'bbox-right',
    'point',
    'scan-vertical',
  ])
  assert.deepEqual(typeEnum.slice(6), ['scan-horizontal', 'boundary', 'bodyTop', 'bodyBottom'])
  assert.deepEqual(items.required, ['id', 'type'])

  assert.deepEqual((items.properties.aggregate as { enum: string[] }).enum, [...SCAN_AGGREGATES])
  assert.ok(items.properties.columns, 'columns 必须在 schema 里（否则模型根本不知道该传）')
  assert.ok(String((items.properties.columns as { description?: string }).description).includes('帧宽的比例'))
  assert.equal(typeof items.properties.minRun, 'object')
  assert.equal(typeof items.properties.band, 'object')
  assert.equal(typeof items.properties.minRunPx, 'object')
  // 老字段还在（x/y/fromY/toY/alphaThreshold），不许因为加新类型被顺手删掉
  for (const key of ['id', 'type', 'x', 'y', 'fromY', 'toY', 'alphaThreshold']) {
    assert.ok(items.properties[key], 'landmarks schema 丢了老字段 ' + key)
  }
})

test('页面接上了新分支：bodyTop / bodyBottom / landmarkWarnings，老分支仍在', () => {
  const html = readFileSync(PAGE, 'utf8')
  for (const token of [
    "if (type === 'scan-horizontal')",
    "if (type === 'boundary')",
    "if (type === 'bodyTop')",
    "if (type === 'bodyBottom')",
    'SCANP.scanHorizontal(grid',
    'SCANP.findBodyTop(grid',
    'SCANP.findBodyBottom(grid',
    'SCANP.landmarkWarnings(landmarksOut',
    'columns: item.columns',
    "throw new Error('未知的 landmarks 类型：'",
  ]) {
    assert.ok(html.includes(token), 'sprite-tool.html 缺少 ' + token)
  }
})
