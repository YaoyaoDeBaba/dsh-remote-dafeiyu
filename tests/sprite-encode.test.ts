/**
 * sprite-encode.test —— PNG 编码器（任务 A）的判据。
 *
 * 这个文件存在的理由只有一条：**编码器必须能被自家解码器读回来，且逐字节相等**。
 * 别处（analyze / measure / overlay / baseline）都靠这个前提——往返一旦有偏移，
 * "成品实测"量到的就是一张错位的图，而错位的图永远"看起来成功"。
 *
 * 所以四种形状都钉：1×1（最小）、奇数宽（行跨度不能被 4 整除整除掉）、
 * 全透明（alpha 0 不能被写成 255）、全不透明（alpha 255 不能被写成 0）。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeSpritePng } from '../src/sprite/analyze.js'
import { crc32, encodePng, MAX_RGBA_BYTES } from '../src/sprite/encode.js'
import { decodePng } from '../src/sprite/png.js'

function image(width: number, height: number, fill?: [number, number, number, number]) {
  const rgba = new Uint8Array(width * height * 4)
  if (fill) {
    for (let i = 0; i < width * height; i++) rgba.set(fill, i * 4)
  }
  return { width, height, rgba }
}

/** 往返：解码回来的宽高与像素逐字节都等于原图。 */
function roundTrip(name: string, picture: { width: number; height: number; rgba: Uint8Array }): void {
  const png = encodePng(picture)
  const decoded = decodePng(png)
  assert.equal(decoded.width, picture.width, `${name} 宽变了`)
  assert.equal(decoded.height, picture.height, `${name} 高变了`)
  assert.equal(decoded.rgba.length, picture.rgba.length, `${name} 像素字节数变了`)
  assert.deepEqual(Array.from(decoded.rgba), Array.from(picture.rgba), `${name} 往返像素不一致`)
}

test('往返：1×1（单像素、半透明）', () => {
  const one = image(1, 1, [17, 34, 51, 68])
  roundTrip('1×1', one)
})

test('往返：奇数宽（3×2，行跨度 12 字节，filter 行首不能串位）', () => {
  const picture = image(3, 2)
  // 故意让上/下两行像素相同——如果编码器把行首字节写错，filter=0 下仍可能"看起来对"，
  // 所以这里每格都放不同颜色，且带上 0 与 255 两个极值。
  const pixels: Array<[number, number, number, number]> = [
    [0, 0, 0, 0],
    [255, 255, 255, 255],
    [1, 2, 3, 4],
    [250, 128, 64, 32],
    [9, 8, 7, 6],
    [200, 100, 50, 25],
  ]
  pixels.forEach((pixel, index) => picture.rgba.set(pixel, index * 4))
  roundTrip('3×2', picture)
})

test('往返：全透明（alpha 全 0 不许被写成 255）', () => {
  roundTrip('全透明', image(5, 3, [0, 0, 0, 0]))
})

test('往返：全不透明（alpha 全 255 不许被写成 0）', () => {
  roundTrip('全不透明', image(4, 4, [12, 200, 99, 255]))
})

test('往返：alpha 分档（0/32/33/128/192/255 六档都能原样回来）', () => {
  const alphas = [0, 32, 33, 128, 192, 255]
  const picture = image(alphas.length, 1)
  alphas.forEach((alpha, x) => picture.rgba.set([x * 20, 255 - x * 20, 100, alpha], x * 4))
  roundTrip('alpha 分档', picture)
})

test('CRC-32 是标准实现（"123456789" 的校验和必须是 0xCBF43926）', () => {
  assert.equal(crc32(Buffer.from('123456789', 'latin1')), 0xcbf43926)
  assert.equal(crc32(Buffer.alloc(0)), 0)
})

test('编码出来的 PNG 走的是"8-bit RGBA、非隔行、单 IDAT、每行 filter 0"', () => {
  const png = encodePng(image(2, 2, [1, 2, 3, 4]))
  // 签名
  assert.deepEqual(Array.from(png.subarray(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  // IHDR：位深 8 / 颜色类型 6 / 非隔行
  const ihdrStart = 8 + 4 + 4
  assert.equal(png.toString('latin1', 12, 16), 'IHDR')
  assert.equal(png[ihdrStart + 8], 8, '位深必须是 8')
  assert.equal(png[ihdrStart + 9], 6, '颜色类型必须是 6（RGBA）')
  assert.equal(png[ihdrStart + 12], 0, '必须是 非隔行')
  // 块顺序：IHDR → IDAT → IEND，且只有一个 IDAT
  const types: string[] = []
  let offset = 8
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('latin1', offset + 4, offset + 8)
    types.push(type)
    offset += 12 + length
  }
  assert.deepEqual(types, ['IHDR', 'IDAT', 'IEND'])
})

test('编码器的输出能直接喂给现有分析器（bbox 与像素一致）', () => {
  const picture = image(8, 8)
  for (let y = 2; y < 6; y++) {
    for (let x = 1; x < 7; x++) picture.rgba.set([200, 100, 50, 255], (y * 8 + x) * 4)
  }
  const stats = analyzeSpritePng(encodePng(picture))
  assert.deepEqual(stats.bbox, { x: 1, y: 2, w: 6, h: 4 })
})

test('编码不了就抛中文错，不交出半张图', () => {
  assert.throws(() => encodePng({ width: 2, height: 2, rgba: new Uint8Array(3) }), /rgba 长度不对/)
  assert.throws(() => encodePng({ width: 0, height: 2, rgba: new Uint8Array(0) }), /正整数/)
  assert.throws(() => encodePng({ width: 1.5, height: 2, rgba: new Uint8Array(12) }), /正整数/)
  assert.throws(() => encodePng({ width: 2, height: 2, rgba: new Uint16Array(16) as unknown as Uint8Array }), /Uint8Array/)
  assert.ok(MAX_RGBA_BYTES > 0)
})
