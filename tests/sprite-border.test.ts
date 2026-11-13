/**
 * sprite-border.test —— 「画面边缘压边」告警（C 系列：遮挡/异常不许一路绿灯）的判据。
 *
 * 为什么单独测：`bgResidual` 那条带子是短边 6%（判"背景残渣"），压边这条是 2%
 * （判"主体贴着画框"）。两个数容易被人"顺手统一"，一统一就会一边失效——
 * 所以这里把两个带宽都钉住，并且用精确的像素计数验证比例。
 *
 * 测试素材全部手写编码（IHDR + IDAT + IEND，filter 0），不依赖任何图片文件。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { analyzeSpritePng, borderBandWidth, borderOpaqueRatio, borderOpaqueWarning } from '../src/sprite/analyze.js'
import { buildTools } from '../src/sprite/tools.js'
import type { SpriteService } from '../src/sprite/service.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
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

/** 手写编码 RGBA PNG（filter 0：够用，且让像素值逐字节可控）。 */
function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.subarray(y * stride, (y + 1) * stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function canvas(width: number, height: number, fill: [number, number, number, number] = [0, 0, 0, 0]): Buffer {
  const buf = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) buf.set(fill, i * 4)
  return buf
}

const RED: [number, number, number, number] = [220, 30, 30, 255]

test('borderBandWidth：短边 2%、至少 4px（与 bgResidual 的 6% 是两条带）', () => {
  assert.equal(borderBandWidth(720, 601), 12) // round(601*0.02)=12
  assert.equal(borderBandWidth(200, 100), 4, '短边 2% 小于 4 → 下限 4')
  assert.equal(borderBandWidth(64, 64), 4)
  assert.throws(() => borderBandWidth(0, 10), /正的宽高/)
  // 同尺寸下两条带宽必须不同：混用会让一侧失效
  const residualBand = Math.max(4, Math.round(Math.min(720, 601) * 0.06)) // analyze 内部口径
  assert.notEqual(borderBandWidth(720, 601), residualBand)
})

test('borderOpaqueRatio：背景全透明 → 0；整幅不透明 → 1；比例按带内像素精确算', () => {
  const clean = canvas(64, 64)
  for (let y = 24; y <= 39; y++) for (let x = 24; x <= 39; x++) clean.set(RED, (y * 64 + x) * 4)
  const cleanShot = borderOpaqueRatio(encodePng(64, 64, clean))
  assert.equal(cleanShot.bandPx, 4)
  assert.equal(cleanShot.pixels, 64 * 64 - 56 * 56, '带宽 4：960 个带内像素')
  assert.equal(cleanShot.opaque, 0)
  assert.equal(cleanShot.ratio, 0)

  const full = borderOpaqueRatio(encodePng(4, 5, canvas(4, 5, RED)))
  assert.equal(full.ratio, 1)
  assert.equal(full.pixels, 20, '4×5 的整幅都落在带里（小图分不出背景，如实报）')

  // 最上面 4 行全不透明（顶带 4×64=256 个像素）→ 256/960
  const pressed = canvas(64, 64)
  for (let y = 0; y <= 3; y++) for (let x = 0; x < 64; x++) pressed.set(RED, (y * 64 + x) * 4)
  const pressedShot = borderOpaqueRatio(encodePng(64, 64, pressed))
  assert.equal(pressedShot.opaque, 256)
  assert.ok(Math.abs(pressedShot.ratio - 256 / 960) < 1e-9)
})

test('borderOpaqueRatio：alphaCut 可调；非法 alphaCut/bandPx 直接抛错', () => {
  const semi = canvas(32, 32)
  for (let i = 0; i < 32 * 4; i++) semi.set([10, 10, 10, 40], i * 4) // 顶带全半透明
  const png = encodePng(32, 32, semi)
  assert.ok(borderOpaqueRatio(png).ratio > 0, 'alpha 40 > 32 算不透明')
  assert.equal(borderOpaqueRatio(png, { alphaCut: 50 }).ratio, 0, '阈值抬到 50 就不算了')
  assert.throws(() => borderOpaqueRatio(png, { alphaCut: 300 }), /alphaCut/)
  assert.throws(() => borderOpaqueRatio(png, { bandPx: 0 }), /bandPx/)
})

test('borderOpaqueWarning：> 5% 才报，文案点明"可能是手或特效"并给出比例与带宽', () => {
  assert.equal(borderOpaqueWarning({ ratio: 0.03, bandPx: 12 }), null, '3% 不报')
  assert.equal(borderOpaqueWarning({ ratio: 0.05, bandPx: 12 }), null, '正好 5% 不报（要 > 5%）')

  const text = String(borderOpaqueWarning({ ratio: 0.2667, bandPx: 4 }, 3))
  assert.match(text, /画面边缘有主体\/道具压边（可能是手或特效）/)
  assert.match(text, /第 3 帧/)
  assert.match(text, /26\.7%/)
  assert.match(text, /带宽 4px/)

  const custom = String(borderOpaqueWarning({ ratio: 0.2, bandPx: 8 }, undefined, 0.1))
  assert.match(custom, /20%/)
  assert.match(custom, /> 10%/, '阈值可覆盖，文案里报的是实际阈值')
})

test('分析器与压边口径互不干扰：主体贴边时 bgResidual 只升一点，压边比例直接翻红', () => {
  // 32×32、band 都是 4：顶带压满 → 4×32=128 个不透明像素 / 448 个带内像素
  const pressed = canvas(32, 32)
  for (let y = 0; y <= 3; y++) for (let x = 0; x < 32; x++) pressed.set(RED, (y * 32 + x) * 4)
  const png = encodePng(32, 32, pressed)
  const stats = analyzeSpritePng(png)
  const border = borderOpaqueRatio(png)
  assert.ok(Math.abs(border.ratio - 128 / 448) < 1e-9, '压边比例按带内像素精确算')
  assert.ok(stats.bgResidual > 0, '两种口径都能看见压边，但阈值与带宽不同（6% vs 2%）')
  assert.match(String(borderOpaqueWarning(border)), /压边/)
})

test('key_apply 的 description 与 service 都接上了压边告警（不许悄悄写进日志了事）', () => {
  const service = {} as unknown as SpriteService
  const apply = buildTools(service).find((tool) => tool.name === 'sprite_key_apply')!
  assert.match(String(apply.description), /warnings/)
  assert.match(String(apply.description), /压边/)

  const source = readFileSync(path.join(ROOT, 'src', 'sprite', 'service.ts'), 'utf8')
  assert.ok(source.includes('borderOpaqueRatio('), 'keyApply 采样时必须真的算压边比例')
  assert.ok(source.includes('borderOpaqueWarning('), 'keyApply 必须把压边转成 warnings 文案')
  assert.match(source, /warnings\.push\(edgeWarning\)/, '压边告警必须进返回的 warnings')
})
