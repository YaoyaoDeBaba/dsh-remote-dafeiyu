/**
 * 抠图质量分析器（`src/sprite/*`）的判据。
 *
 * 测试素材全部在本地手写编码：IHDR + IDAT（zlib deflate）+ IEND。
 * 为什么不用现成图片：每个判据都要求像素级精确的预期值，现成素材的
 * bbox / 覆盖率会随编码工具变化，断言只会变成"看起来差不多"。
 *
 * 覆盖三类边界：只有主体 / 全透明 / 全不透明；边缘偏绿 vs 不偏绿；
 * 解码器支持的 RGB 与 filter 1~4；以及不支持的格式必须抛错而不是返回垃圾。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deflateSync } from 'node:zlib'
import { analyzeSpritePng } from '../src/sprite/analyze.js'
import { decodePng } from '../src/sprite/png.js'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBytes = Buffer.from(type, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0)
  return Buffer.concat([length, typeBytes, data, crc])
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** 按 PNG 规范把一行原始字节变成「加上 filter 之后」的字节。 */
function applyFilter(filter: number, row: Buffer, prev: Buffer, bpp: number): Buffer {
  const out = Buffer.alloc(row.length)
  for (let i = 0; i < row.length; i++) {
    const x = row[i]!
    const a = i >= bpp ? row[i - bpp]! : 0
    const b = prev[i]!
    const c = i >= bpp ? prev[i - bpp]! : 0
    let value: number
    switch (filter) {
      case 0:
        value = x
        break
      case 1:
        value = x - a
        break
      case 2:
        value = x - b
        break
      case 3:
        value = x - ((a + b) >> 1)
        break
      case 4:
        value = x - paeth(a, b, c)
        break
      default:
        throw new Error(`测试编码器不支持 filter ${filter}`)
    }
    out[i] = value & 0xff
  }
  return out
}

/** 手写编码一张 PNG。rgba 始终是 4 通道，colorType=2 时丢掉 alpha。 */
function encodePng(
  width: number,
  height: number,
  rgba: Buffer,
  options: { colorType?: 6 | 2; filters?: number[] } = {},
): Buffer {
  const colorType = options.colorType ?? 6
  const channels = colorType === 6 ? 4 : 3
  const stride = width * channels
  const filters = options.filters ?? [0]
  if (rgba.length !== width * height * 4) throw new Error('测试用 RGBA 长度不对')

  const raw = Buffer.alloc((stride + 1) * height)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(stride)
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4
      for (let c = 0; c < channels; c++) row[x * channels + c] = rgba[src + c]!
    }
    const filter = filters[y % filters.length]!
    const lineStart = y * (stride + 1)
    raw[lineStart] = filter
    applyFilter(filter, row, prev, channels).copy(raw, lineStart + 1)
    prev = row
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // 位深
  ihdr[9] = colorType
  ihdr[10] = 0 // 压缩方式
  ihdr[11] = 0 // 过滤方式
  ihdr[12] = 0 // 非隔行

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** 只有 IHDR + IEND 的「文件」，用来测不支持的格式（解码器在 IHDR 就该拒绝）。 */
function headerOnlyPng(options: { colorType: number; bitDepth: number; interlace: number }): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(2, 0)
  ihdr.writeUInt32BE(2, 4)
  ihdr[8] = options.bitDepth
  ihdr[9] = options.colorType
  ihdr[12] = options.interlace
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IEND', Buffer.alloc(0))])
}

function blank(width: number, height: number, fill: [number, number, number, number] = [0, 0, 0, 0]): Buffer {
  const canvas = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) canvas.set(fill, i * 4)
  return canvas
}

function setPixel(
  canvas: Buffer,
  width: number,
  x: number,
  y: number,
  color: [number, number, number, number],
): void {
  canvas.set(color, (y * width + x) * 4)
}

function close(actual: number, expected: number, label: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}：期望 ${expected}，实际 ${actual}`)
}

const RED: [number, number, number, number] = [220, 30, 30, 255]

test('中间方块：bbox / coverage / bgResidual / 直方图 都对得上', () => {
  const canvas = blank(32, 32)
  for (let y = 12; y <= 19; y++) for (let x = 12; x <= 19; x++) setPixel(canvas, 32, x, y, RED)

  const stats = analyzeSpritePng(encodePng(32, 32, canvas))
  assert.equal(stats.width, 32)
  assert.equal(stats.height, 32)
  assert.deepEqual(stats.bbox, { x: 12, y: 12, w: 8, h: 8 })
  assert.equal(stats.subjectCoverage, 1)
  assert.equal(stats.bgResidual, 0) // 主体离四边都超过 band=4
  assert.equal(stats.edgeGreen, 0)
  assert.deepEqual(stats.alphaHistogram, [960 / 1024, 0, 0, 64 / 1024])
})

test('bbox 内有个透明洞：coverage 如实下降', () => {
  const canvas = blank(32, 32)
  for (let y = 12; y <= 19; y++) for (let x = 12; x <= 19; x++) setPixel(canvas, 32, x, y, RED)
  setPixel(canvas, 32, 13, 13, [0, 0, 0, 0]) // 洞

  const stats = analyzeSpritePng(encodePng(32, 32, canvas))
  assert.deepEqual(stats.bbox, { x: 12, y: 12, w: 8, h: 8 })
  close(stats.subjectCoverage, 63 / 64, 'subjectCoverage')
  assert.equal(stats.bgResidual, 0)
})

test('全透明图：bbox 为 null，bgResidual 和 coverage 都是 0', () => {
  const stats = analyzeSpritePng(encodePng(4, 5, blank(4, 5)))
  assert.equal(stats.bbox, null)
  assert.equal(stats.bgResidual, 0)
  assert.equal(stats.subjectCoverage, 0)
  assert.equal(stats.edgeGreen, 0)
  assert.deepEqual(stats.alphaHistogram, [1, 0, 0, 0])
})

test('全不透明图：bbox 铺满整图，bgResidual 与 coverage 都是 1', () => {
  const stats = analyzeSpritePng(encodePng(4, 5, blank(4, 5, RED)))
  assert.deepEqual(stats.bbox, { x: 0, y: 0, w: 4, h: 5 })
  assert.equal(stats.bgResidual, 1)
  assert.equal(stats.subjectCoverage, 1)
  assert.equal(stats.edgeGreen, 0) // 环被图边界裁空
  assert.deepEqual(stats.alphaHistogram, [0, 0, 0, 1])
})

test('边框带里的角落残渣：按带宽面积精确计入 bgResidual（>0）', () => {
  // 64×64 的 band = 4：带像素 = 64² - 56² = 960。残渣 3×3 全落在左上角带内 ⇒ 9/960。
  const canvas = blank(64, 64)
  for (let y = 24; y <= 39; y++) for (let x = 24; x <= 39; x++) setPixel(canvas, 64, x, y, RED)
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) setPixel(canvas, 64, x, y, [90, 60, 30, 255])

  const stats = analyzeSpritePng(encodePng(64, 64, canvas))
  close(stats.bgResidual, 9 / 960, 'bgResidual')
  assert.ok(stats.bgResidual > 0)
  // bbox 与 bgResidual 用同一个 alpha 阈值：残渣必然被 bbox 包进去，
  // 所以「残渣 > 0」与「bbox 不动」在定义上互斥，这里钉住真实的扩张结果。
  assert.deepEqual(stats.bbox, { x: 1, y: 1, w: 39, h: 39 })
})

test('干净图：边框带全透明，bgResidual 严格为 0', () => {
  const canvas = blank(64, 64)
  for (let y = 24; y <= 39; y++) for (let x = 24; x <= 39; x++) setPixel(canvas, 64, x, y, RED)

  const stats = analyzeSpritePng(encodePng(64, 64, canvas))
  assert.equal(stats.bgResidual, 0)
  assert.deepEqual(stats.bbox, { x: 24, y: 24, w: 16, h: 16 })
  assert.equal(stats.subjectCoverage, 1)
})

test('边缘环偏绿：edgeGreen 报出来；同图不偏绿时为 0', () => {
  const green = blank(32, 32, [0, 200, 0, 16]) // alpha 16 < 阈值，不撑大 bbox，但颜色仍是绿的
  for (let y = 12; y <= 19; y++) for (let x = 12; x <= 19; x++) setPixel(green, 32, x, y, RED)

  const stats = analyzeSpritePng(encodePng(32, 32, green))
  assert.deepEqual(stats.bbox, { x: 12, y: 12, w: 8, h: 8 })
  close(stats.edgeGreen, 1, 'edgeGreen')
  assert.equal(stats.bgResidual, 0) // alpha 16 不参与残渣统计

  const clean = blank(32, 32, [0, 0, 0, 16])
  for (let y = 12; y <= 19; y++) for (let x = 12; x <= 19; x++) setPixel(clean, 32, x, y, RED)
  assert.equal(analyzeSpritePng(encodePng(32, 32, clean)).edgeGreen, 0)
})

test('直方图分档：32 / 128 / 192 归入低一档，四档和为 1', () => {
  const canvas = blank(1, 8)
  const alphas = [0, 32, 33, 128, 129, 192, 193, 255]
  alphas.forEach((alpha, y) => setPixel(canvas, 1, 0, y, [10, 10, 10, alpha]))

  const stats = analyzeSpritePng(encodePng(1, 8, canvas))
  assert.deepEqual(stats.alphaHistogram, [0.25, 0.25, 0.25, 0.25])
  close(stats.alphaHistogram.reduce((sum, value) => sum + value, 0), 1, '直方图总和')
  assert.deepEqual(stats.bbox, { x: 0, y: 2, w: 1, h: 6 }) // alpha>32 的才是主体
  // 1×8 的短边小于 2*band，整图都在带里：6 个不透明像素全部计入，这是小图分不出背景的如实读数。
  close(stats.bgResidual, 6 / 8, 'bgResidual')
})

test('alphaCut 可调：阈值抬高到 50 后 40 的像素不再算主体', () => {
  const canvas = blank(3, 3)
  setPixel(canvas, 3, 1, 1, [200, 10, 10, 40])
  const png = encodePng(3, 3, canvas)

  assert.deepEqual(analyzeSpritePng(png).bbox, { x: 1, y: 1, w: 1, h: 1 })
  close(analyzeSpritePng(png).bgResidual, 1 / 9, '默认阈值下的残渣（3×3 全在带内）')
  const strict = analyzeSpritePng(png, { alphaCut: 50 })
  assert.equal(strict.bbox, null)
  assert.equal(strict.bgResidual, 0)
  assert.equal(strict.subjectCoverage, 0)
  assert.deepEqual(strict.alphaHistogram, [8 / 9, 1 / 9, 0, 0])

  assert.throws(() => analyzeSpritePng(png, { alphaCut: 300 }), /alphaCut/)
})

test('RGB（颜色类型 2）解码时补 alpha=255，按全不透明处理', () => {
  const stats = analyzeSpritePng(encodePng(4, 4, blank(4, 4, [10, 20, 30, 7]), { colorType: 2 }))
  assert.deepEqual(stats.bbox, { x: 0, y: 0, w: 4, h: 4 })
  assert.equal(stats.subjectCoverage, 1)
  assert.deepEqual(stats.alphaHistogram, [0, 0, 0, 1])
})

test('filter 1~4 都能还原出原始像素', () => {
  const width = 6
  const height = 5
  const canvas = blank(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      setPixel(canvas, width, x, y, [(x * 37 + y * 11) & 0xff, (x * 13 + y * 53) & 0xff, (x * 71) & 0xff, (x * 29 + y * 17) & 0xff])
    }
  }
  // 每行换一种 filter，确保 0 之外的 1/2/3/4 都真的被走过。
  const decoded = decodePng(encodePng(width, height, canvas, { filters: [1, 2, 3, 4, 0] }))
  assert.equal(decoded.width, width)
  assert.equal(decoded.height, height)
  assert.deepEqual(Buffer.from(decoded.rgba), canvas)
})

test('不支持的格式：颜色类型 3 抛错，信息里说「不支持」', () => {
  const png = headerOnlyPng({ colorType: 3, bitDepth: 8, interlace: 0 })
  assert.throws(() => decodePng(png), /不支持/)
  assert.throws(() => decodePng(png), /颜色类型/)
})

test('不支持的格式：16-bit 与隔行都明确报错', () => {
  assert.throws(() => decodePng(headerOnlyPng({ colorType: 6, bitDepth: 16, interlace: 0 })), /不支持/)
  assert.throws(() => decodePng(headerOnlyPng({ colorType: 6, bitDepth: 8, interlace: 1 })), /隔行/)
})

test('不是 PNG 签名：直接拒绝，不当成图片解', () => {
  assert.throws(() => decodePng(Buffer.from('not a png at all')), /PNG/)
})
