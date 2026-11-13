/**
 * sprite/encode —— 最小 PNG **编码器**（8-bit RGBA、非隔行、filter 全 0）。
 *
 * 为什么自己写：宿主侧不准引第三方图像库；而"成品实测"（`measured`）与准绳图都要把
 * **宿主算出来的像素**落成一张真图。没有编码器就只能让页面去拼，可页面拼完再解回来量，
 * 就答不了「导出成功 ≠ 结果正确」这个问题——量到的还是页面自己说的数。
 *
 * 三条纪律：
 * 1. 与 `png.ts` 的 `decodePng` **严格往返**：`decodePng(encodePng(x)).rgba` 逐字节等于 `x.rgba`
 *    （`tests/sprite-encode.test.ts` 钉死 1×1 / 奇数宽 / 全透明 / 全不透明四种）；
 * 2. 每次输出只用一个 IDAT、每行 filter 0：不做预测量优化，换的是"任何位深/滤波器组合都不会
 *    在往返里漂"的可预测性——这张图的用途是**对账**，不是省磁盘；
 * 3. 编码不了就抛中文错误，不返回半张图（长度不对的 RGBA 落盘后只会得到偏移的像素）。
 */
import { deflateSync } from 'node:zlib'
import type { RgbaImage } from './match.js'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * 单个 RGB 通道的最大字节数（约等于 12800×12800 的 RGBA）。
 * 超过它基本只能是"尺寸算错了"，让 Buffer 直接 OOM 不如在这里说清楚。
 */
export const MAX_RGBA_BYTES = 512 * 1024 * 1024

/** CRC-32 查表（PNG 用的是标准 CRC-32：多项式 0xEDB88320，初值/终值异或 0xFFFFFFFF）。 */
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

/** 标准 CRC-32（PNG 每个块尾部那 4 字节就是 type+data 的这个值）。导出给测试钉死。 */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** 一个 PNG 块：长度(4) + 类型(4) + 数据 + CRC(4)。 */
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBytes = Buffer.from(type, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0)
  return Buffer.concat([length, typeBytes, data, crc])
}

function assertImage(image: RgbaImage): { width: number; height: number; rgba: Uint8Array } {
  if (!image || typeof image !== 'object') throw new Error('encodePng 需要一个 {width,height,rgba} 对象')
  const width = Number(image.width)
  const height = Number(image.height)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`encodePng 的宽高必须是正整数，收到 ${String(image.width)}×${String(image.height)}`)
  }
  const rgba = image.rgba
  if (!(rgba instanceof Uint8Array)) throw new Error('encodePng 的 rgba 必须是 Uint8Array')
  const expected = width * height * 4
  if (!Number.isSafeInteger(expected) || expected > MAX_RGBA_BYTES) {
    throw new Error(`encodePng 的像素量过大（${width}×${height}×4=${expected} 字节），上限 ${MAX_RGBA_BYTES}`)
  }
  if (rgba.length !== expected) {
    throw new Error(`encodePng 的 rgba 长度不对：${width}×${height}×4 应为 ${expected}，实际 ${rgba.length}`)
  }
  return { width, height, rgba }
}

/**
 * 编码成 PNG。
 *
 * 输出规格固定：颜色类型 6（RGBA）、位深 8、非隔行、每行 filter 0、单个 IDAT。
 * 正好落在 `decodePng` 的支持面内，所以往返是无损的。
 */
export function encodePng(image: RgbaImage): Buffer {
  const { width, height, rgba } = assertImage(image)
  const stride = width * 4
  // 每行前面 1 字节 filter 标记（全 0 = None），所以是 (stride + 1) × height。
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const lineStart = y * (stride + 1)
    raw[lineStart] = 0
    for (let i = 0; i < stride; i++) raw[lineStart + 1 + i] = rgba[y * stride + i]!
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // 位深
  ihdr[9] = 6 // 颜色类型 6 = RGBA
  ihdr[10] = 0 // 压缩方式 0 = deflate
  ihdr[11] = 0 // 过滤方式 0
  ihdr[12] = 0 // 非隔行

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
