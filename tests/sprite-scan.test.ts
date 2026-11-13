/**
 * sprite-scan.test —— measure 新增扫描原语（P2-5）的判据。
 *
 * 为什么这么拆：像素只在浏览器里（页面 `assets/sprite/sprite-tool.html` 的 measure 里跑），
 * Node 侧测不到 canvas。所以把逻辑做成三份等价物：
 *   1. `src/sprite/scan.ts` —— 纯函数、可单测的**参考实现**；
 *   2. `tools.ts` 的 JSON Schema —— enum 从 `types.ts` 的约定里取；
 *   3. 页面里的 `spriteScanPrimitives()` —— 真正跑的那份（源码夹在 BEGIN/END 注释之间）。
 * 本文件后半段把第 3 份的源码抠出来，跟第 1 份喂**同一批向量 + 同一个像素源**做 parity，
 * 任何一边改了算法而另一边没跟上，这里就会红。
 *
 * 用例里的几何照着评审文档的场景做：白（发带）在上、蓝（头发）在下，交界在 187，
 * 中间在 120~123 埋了一条 4 行的"呆毛"干扰带——没有 minRun 就会认错，这正是上一轮的坑。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  channelValue,
  compareOp,
  findBoundary,
  normalizeProbe,
  resolveColumnRange,
  scanHorizontal,
  type ScanPixelSource,
} from '../src/sprite/scan.js'
import { SCAN_CHANNELS, SCAN_OPS } from '../src/sprite/types.js'
import { buildTools } from '../src/sprite/tools.js'
import type { SpriteService } from '../src/sprite/service.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PAGE = path.join(ROOT, 'assets', 'sprite', 'sprite-tool.html')

/** 场景：720x601；y<=186 白（b-r≈3），y>=187 蓝（b-r≈140），y=120~123 埋一条 4 行蓝呆毛。 */
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

test('channelValue：r/g/b/alpha/luma/blue-minus-red/saturation 的定义与口径', () => {
  const rgba: [number, number, number, number] = [100, 150, 200, 255]
  assert.equal(channelValue(rgba, 'r'), 100)
  assert.equal(channelValue(rgba, 'g'), 150)
  assert.equal(channelValue(rgba, 'b'), 200)
  assert.equal(channelValue(rgba, 'alpha'), 255)
  assert.equal(channelValue(rgba, 'luma'), 0.299 * 100 + 0.587 * 150 + 0.114 * 200)
  assert.equal(channelValue(rgba, 'blue-minus-red'), 100)
  assert.equal(channelValue(rgba, 'saturation'), 100)
  assert.ok(Number.isNaN(channelValue(rgba, 'hue')), '未知通道给 NaN，不能瞎猜一个数')
})

test('channelValue whiteness：低饱和(<25) 且 luma>210 才算白，肤色必须被排除', () => {
  const white: [number, number, number, number] = [255, 255, 255, 255]
  const skin: [number, number, number, number] = [240, 220, 207, 255]
  const lightGray: [number, number, number, number] = [230, 230, 230, 255]
  const darkWhite: [number, number, number, number] = [205, 205, 208, 255]
  assert.equal(channelValue(white, 'whiteness'), 255, '纯白：低饱和 + luma 255 → 返回 luma')
  assert.equal(channelValue(skin, 'whiteness'), 0, '肤色 (240,220,207)：饱和度 33 → 不是白（r,g,b>200 就会漏）')
  assert.ok(Math.abs(channelValue(lightGray, 'whiteness') - 230) < 1e-9, '浅灰：饱和度 0、luma 230 → 算白')
  assert.equal(channelValue(darkWhite, 'whiteness'), 0, '深白：低饱和但 luma 205 < 210 → 不算白')
  // 判据的两种等价写法：>0（有没有白）与 >210（亮度门槛）都必须把肤色挡在外面
  assert.equal(compareOp(channelValue(skin, 'whiteness'), '>', 0), false)
  assert.equal(compareOp(channelValue(skin, 'whiteness'), '>', 210), false)
  assert.equal(compareOp(channelValue(white, 'whiteness'), '>', 210), true)
})

test('compareOp：四种比较；非有限数/未知 op 一律 false（不抛异常）', () => {
  assert.equal(compareOp(26, '>', 25), true)
  assert.equal(compareOp(25, '>', 25), false)
  assert.equal(compareOp(25, '>=', 25), true)
  assert.equal(compareOp(24, '<', 25), true)
  assert.equal(compareOp(25, '<=', 25), true)
  assert.equal(compareOp(Number.NaN, '>', 0), false)
  assert.equal(compareOp(1, '==', 1), false)
})

test('normalizeProbe：条件合法性与原因（channel / op / value / minRun 默认 1）', () => {
  assert.deepEqual(normalizeProbe({ channel: 'blue-minus-red', op: '>', value: 25, minRun: 12 }).probe, {
    channel: 'blue-minus-red',
    op: '>',
    value: 25,
    minRun: 12,
  })
  assert.equal(normalizeProbe({ channel: 'blue-minus-red', op: '>' }).probe, null)
  assert.match(String(normalizeProbe({ channel: 'blue-minus-red', op: '>' }).reason), /value/)

  assert.equal(normalizeProbe(null).probe, null)
  assert.match(String(normalizeProbe(null).reason), /probe 缺失/)

  assert.equal(normalizeProbe({ channel: 'hue', op: '>', value: 1 }).probe, null)
  assert.match(String(normalizeProbe({ channel: 'hue', op: '>', value: 1 }).reason), /channel 不支持/)
  assert.equal(normalizeProbe({ channel: 'r', op: '!=', value: 1 }).probe, null)
  assert.match(String(normalizeProbe({ channel: 'r', op: '!=', value: 1 }).reason), /op 不支持/)

  // minRun 缺省 1；0 / 负数 / 小数被收敛到 >= 1 的整数
  assert.equal(normalizeProbe({ channel: 'r', op: '>', value: 0 }).probe?.minRun, 1)
  assert.equal(normalizeProbe({ channel: 'r', op: '>', value: 0, minRun: 0 }).probe?.minRun, 1)
  assert.equal(normalizeProbe({ channel: 'r', op: '>', value: 0, minRun: 4.6 }).probe?.minRun, 5)
  // 通道/op 的值宽松解析：纯数字字符串收，别的 NaN
  assert.equal(normalizeProbe({ channel: 'r', op: '>', value: '25' }).probe?.value, 25)
})

test('resolveColumnRange：越界/空区间给原因，不裁成"看起来对"的值', () => {
  const grid = hairScene()
  assert.deepEqual(resolveColumnRange(grid, { x: 360, fromY: 60, toY: 600 }).range, {
    x: 360,
    fromY: 60,
    toY: 600,
    clipped: false,
  })
  // y 区间被帧边界裁过 → clipped，且保留真实生效区间
  assert.deepEqual(resolveColumnRange(grid, { x: 10, fromY: -20, toY: 9000 }).range, {
    x: 10,
    fromY: 0,
    toY: 600,
    clipped: true,
  })
  assert.match(String(resolveColumnRange(grid, { x: 720, fromY: 0, toY: 600 }).reason), /超出可用列/)
  assert.match(String(resolveColumnRange(grid, { x: -1, fromY: 0, toY: 600 }).reason), /超出可用列/)
  assert.match(String(resolveColumnRange(grid, { fromY: 0, toY: 600 }).reason), /缺少可用列号 x/)
  assert.match(String(resolveColumnRange(grid, { x: 1, fromY: 500, toY: 400 }).reason), /扫描区间为空/)
  assert.match(String(resolveColumnRange(grid, { x: 1, fromY: 700, toY: 900 }).reason), /整段落在帧外/)
  // 缺省 fromY/toY = 整列
  assert.deepEqual(resolveColumnRange(grid, { x: 0 }).range, { x: 0, fromY: 0, toY: 600, clipped: false })
})

test('scan-horizontal：量到「白→蓝」交界 187（评审文档的 hairTop 场景，手工标注 187）', () => {
  const hit = scanHorizontal(hairScene(), {
    x: 360,
    fromY: 60,
    toY: 600,
    probe: { channel: 'blue-minus-red', op: '>', value: 25, minRun: 12 },
  })
  assert.equal(hit.found, true)
  assert.equal(hit.px, 360)
  assert.equal(hit.py, 187, '命中行必须是 187（呆毛在 120~123，只有 4 行，达不到 minRun=12）')
  assert.equal(Math.abs(Number(hit.py) - 187) <= 2, true, '验收口径：与手工标注差 <= 2px')
  assert.equal(hit.runLength, 414, '187..600 共 414 行连续蓝')
  assert.equal(hit.runStart, 187)
  assert.equal(hit.runEnd, 600)
  assert.equal(hit.confidence, 1, 'run 够长 + 离阈值够远 → 1')
  assert.equal(hit.channel, 'blue-minus-red')
  assert.equal(hit.threshold, 25)
  assert.equal(hit.column, 360)
})

test('scan-horizontal：minRun 缺省时会被呆毛骗（记录语义，不是 bug）', () => {
  const naive = scanHorizontal(hairScene(), {
    x: 360,
    fromY: 60,
    toY: 600,
    probe: { channel: 'blue-minus-red', op: '>', value: 25 },
  })
  assert.equal(naive.py, 120, 'minRun=1 时第一个蓝 run 就从呆毛开始——所以要给 minRun')
  assert.equal(naive.runLength, 4)
})

test('scan-horizontal：扫不到 / 条件非法 / 越界都回 found:false + reason，不抛异常', () => {
  const grid = hairScene()
  const miss = scanHorizontal(grid, {
    x: 360,
    fromY: 0,
    toY: 100,
    probe: { channel: 'blue-minus-red', op: '>', value: 25 },
  })
  assert.equal(miss.found, false)
  assert.equal(miss.px, null)
  assert.equal(miss.py, null)
  assert.equal(miss.confidence, 0)
  assert.match(String(miss.reason), /没找到/)

  const badProbe = scanHorizontal(grid, { x: 360, fromY: 0, toY: 600, probe: { channel: 'hue', op: '>', value: 1 } })
  assert.equal(badProbe.found, false)
  assert.match(String(badProbe.reason), /channel 不支持/)

  const badColumn = scanHorizontal(grid, { x: 999, fromY: 0, toY: 600, probe: { channel: 'r', op: '>', value: 0 } })
  assert.equal(badColumn.found, false)
  assert.match(String(badColumn.reason), /超出可用列/)
})

test('boundary：白段结束、蓝段开始的交界行 = 187；给了 b.minRun 才跳过呆毛', () => {
  const grid = hairScene()
  const line = findBoundary(grid, {
    x: 360,
    fromY: 60,
    toY: 600,
    a: { channel: 'blue-minus-red', op: '<', value: 10 },
    b: { channel: 'blue-minus-red', op: '>', value: 25, minRun: 12 },
  })
  assert.equal(line.found, true)
  assert.equal(line.py, 187, 'py = B 段第一行（交界线）')
  assert.equal(line.aEnd, 186, 'aEnd = py - 1（A 段最后一行）')
  assert.equal(line.aStart, 124)
  assert.equal(line.aRun, 63)
  assert.equal(line.bRun, 414)
  assert.equal(line.runLength, 477, 'A 段 + B 段合计')
  assert.equal(line.channel, 'blue-minus-red')
  assert.equal(line.aChannel, 'blue-minus-red')
  assert.equal(typeof line.confidence, 'number')
  assert.ok(Number(line.confidence) > 0 && Number(line.confidence) <= 1)

  // 不设 minRun：第一个「白结束→蓝开始」其实是呆毛顶 120（4 行呆毛，这就是上一轮认错的地方）
  const naive = findBoundary(grid, {
    x: 360,
    fromY: 60,
    toY: 600,
    a: { channel: 'blue-minus-red', op: '<', value: 10 },
    b: { channel: 'blue-minus-red', op: '>', value: 25 },
  })
  assert.equal(naive.py, 120)
  assert.equal(naive.bRun, 4)
})

test('boundary：条件非法与扫不到都有明确原因', () => {
  const grid = hairScene()
  const badA = findBoundary(grid, { x: 360, fromY: 0, toY: 600, a: null, b: { channel: 'r', op: '>', value: 0 } })
  assert.equal(badA.found, false)
  assert.match(String(badA.reason), /a 段条件无效/)

  const badB = findBoundary(grid, { x: 360, fromY: 0, toY: 600, a: { channel: 'r', op: '>', value: 0 } })
  assert.equal(badB.found, false)
  assert.match(String(badB.reason), /b 段条件无效/)

  const miss = findBoundary(grid, {
    x: 360,
    fromY: 0,
    toY: 100,
    a: { channel: 'blue-minus-red', op: '<', value: 10 },
    b: { channel: 'blue-minus-red', op: '>', value: 25 },
  })
  assert.equal(miss.found, false)
  assert.match(String(miss.reason), /没找到/)
})

/* ---------------- 页面那份实现的 parity（同一批向量，结果必须逐字段相等） ---------------- */

interface HtmlScanPrimitives {
  channels: string[]
  ops: string[]
  channelValue(rgba: number[], channel: string): number
  compareOp(value: number, op: string, target: number): boolean
  normalizeProbe(raw: unknown): { probe: unknown; reason?: string }
  resolveColumnRange(
    grid: unknown,
    req: unknown,
  ): { range: { x: number; fromY: number; toY: number; clipped: boolean } | null; reason?: string }
  scanHorizontal(grid: unknown, req: unknown): Record<string, unknown>
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
  /* 页面里跑的就是这段源码：抠出来包一层，拿到同一个工厂 */
  const factory = new Function(source + '\nreturn spriteScanPrimitives();') as () => HtmlScanPrimitives
  return factory()
}

test('HTML 里的 spriteScanPrimitives 与 src/sprite/scan.ts 逐字段一致（parity）', () => {
  const page = loadHtmlScanPrimitives()
  const grid = hairScene()

  // 通道清单与 op 清单要和类型约定一致（schema 的 enum 也是从这里来的）
  assert.deepEqual(page.channels, [...SCAN_CHANNELS])
  assert.deepEqual(page.ops, [...SCAN_OPS])

  for (const channel of [...SCAN_CHANNELS, 'hue']) {
    for (const rgba of [
      [100, 150, 200, 255],
      [0, 0, 0, 0],
      [255, 255, 255, 255],
      [12, 240, 33, 128],
    ]) {
      const tsValue = channelValue(rgba, channel)
      const htmlValue = page.channelValue(rgba, channel)
      if (Number.isNaN(tsValue)) assert.equal(Number.isNaN(htmlValue), true, `${channel} 应为 NaN`)
      else assert.equal(htmlValue, tsValue, `${channel} 的取值漂了`)
    }
  }

  // whiteness 的定值向量：纯白 / 肤色 / 浅灰 / 深白 / 真实白发带 / 蓝发——
  // 两份实现必须给出同一组判据（尤其是肤色那份，绝不能是白）
  for (const rgba of [
    [255, 255, 255, 255],
    [240, 220, 207, 255],
    [230, 230, 230, 255],
    [205, 205, 208, 255],
    [248, 249, 251, 255],
    [60, 90, 200, 255],
  ]) {
    assert.equal(
      page.channelValue(rgba, 'whiteness'),
      channelValue(rgba, 'whiteness'),
      'whiteness 漂了：' + JSON.stringify(rgba),
    )
  }
  for (const op of [...SCAN_OPS, '!=', '==']) {
    const pairs: Array<[number, number]> = [
      [26, 25],
      [25, 25],
      [24, 25],
    ]
    for (const [value, target] of pairs) {
      assert.equal(page.compareOp(value, op, target), compareOp(value, op, target), `op ${op} 漂了`)
    }
  }

  const probes = [
    { channel: 'blue-minus-red', op: '>', value: 25, minRun: 12 },
    { channel: 'blue-minus-red', op: '>', value: 25 },
    { channel: 'hue', op: '>', value: 1 },
    { channel: 'r', op: '!=', value: 1 },
    { channel: 'r', op: '>', value: '25' },
    { channel: 'r', op: '>' },
    null,
  ]
  for (const probe of probes) {
    assert.deepEqual(page.normalizeProbe(probe), normalizeProbe(probe), 'normalizeProbe 漂了：' + JSON.stringify(probe))
  }

  const ranges = [
    { x: 360, fromY: 60, toY: 600 },
    { x: 10, fromY: -20, toY: 9000 },
    { x: 720, fromY: 0, toY: 600 },
    { x: 1, fromY: 500, toY: 400 },
    { x: 1, fromY: 700, toY: 900 },
    { x: 0 },
    {},
  ]
  for (const req of ranges) {
    assert.deepEqual(
      page.resolveColumnRange(grid, req),
      resolveColumnRange(grid, req),
      'resolveColumnRange 漂了：' + JSON.stringify(req),
    )
  }

  const scans = [
    { x: 360, fromY: 60, toY: 600, probe: { channel: 'blue-minus-red', op: '>', value: 25, minRun: 12 } },
    { x: 360, fromY: 60, toY: 600, probe: { channel: 'blue-minus-red', op: '>', value: 25 } },
    { x: 360, fromY: 0, toY: 100, probe: { channel: 'blue-minus-red', op: '>', value: 25 } },
    { x: 360, fromY: 0, toY: 600, probe: { channel: 'hue', op: '>', value: 1 } },
    { x: 999, fromY: 0, toY: 600, probe: { channel: 'r', op: '>', value: 0 } },
    { x: 0, fromY: 100, toY: 200, probe: { channel: 'luma', op: '>=', value: 100 } },
  ]
  for (const req of scans) {
    assert.deepEqual(page.scanHorizontal(grid, req), scanHorizontal(grid, req), 'scanHorizontal 漂了：' + JSON.stringify(req))
  }

  const boundaries = [
    {
      x: 360,
      fromY: 60,
      toY: 600,
      a: { channel: 'blue-minus-red', op: '<', value: 10 },
      b: { channel: 'blue-minus-red', op: '>', value: 25, minRun: 12 },
    },
    {
      x: 360,
      fromY: 60,
      toY: 600,
      a: { channel: 'blue-minus-red', op: '<', value: 10 },
      b: { channel: 'blue-minus-red', op: '>', value: 25 },
    },
    { x: 360, fromY: 0, toY: 600, a: null, b: { channel: 'r', op: '>', value: 0 } },
    {
      x: 360,
      fromY: 0,
      toY: 100,
      a: { channel: 'blue-minus-red', op: '<', value: 10 },
      b: { channel: 'blue-minus-red', op: '>', value: 25 },
    },
  ]
  for (const req of boundaries) {
    assert.deepEqual(page.findBoundary(grid, req), findBoundary(grid, req), 'findBoundary 漂了：' + JSON.stringify(req))
  }
})

test('measure 的 landmarks schema：老六种原样在前，后加 scan-horizontal / boundary', () => {
  const service = {} as unknown as SpriteService
  const measure = buildTools(service).find((tool) => tool.name === 'sprite_measure')!
  const params = measure.parameters as {
    properties: { landmarks: { items: { properties: Record<string, unknown>; required?: string[] } } }
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
  assert.deepEqual(
    typeEnum.slice(6),
    ['scan-horizontal', 'boundary', 'bodyTop', 'bodyBottom'],
    '新原语必须能被 schema 表达',
  )
  assert.deepEqual(items.required, ['id', 'type'])

  const probe = items.properties.probe as { properties: { channel: { enum: string[] }; op: { enum: string[] } } }
  assert.deepEqual(probe.properties.channel.enum, [...SCAN_CHANNELS])
  assert.deepEqual(probe.properties.op.enum, [...SCAN_OPS])
  // boundary 的两段条件跟 probe 同构（只有 description 不同）
  const shape = (schema: unknown): unknown => {
    const entry = schema as { properties: unknown; required?: string[] }
    return { properties: entry.properties, required: entry.required }
  }
  assert.deepEqual(shape(items.properties.a), shape(items.properties.probe))
  assert.deepEqual(shape(items.properties.b), shape(items.properties.probe))

  // 老字段还在（x/y/fromY/toY/alphaThreshold），不许因为加新类型被顺手删掉
  for (const key of ['id', 'type', 'x', 'y', 'fromY', 'toY', 'alphaThreshold']) {
    assert.ok(items.properties[key], 'landmarks schema 丢了老字段 ' + key)
  }
})

test('页面里新分支落在 measure 的 landmarks.map 内，老六种分支仍在', () => {
  const html = readFileSync(PAGE, 'utf8')
  for (const token of [
    "if (type === 'bbox-top')",
    "if (type === 'point')",
    "if (type === 'scan-vertical')",
    "if (type === 'scan-horizontal')",
    "if (type === 'boundary')",
    'SCANP.scanHorizontal(grid',
    'SCANP.findBoundary(grid',
    "throw new Error('未知的 landmarks 类型：'",
  ]) {
    assert.ok(html.includes(token), 'sprite-tool.html 缺少 ' + token)
  }
})
