/**
 * sprite-baseline.test —— 准绳图（任务 D）的判据：**服务层**这一层（读图 + 找 meta + 落盘）。
 *
 * 为什么不是只测 `composeBaseline`：这一层最容易出的错是"找不对 meta"和"输出路径不对"——
 * 前者会让整张准绳图对歪（却返回 ok:true），后者让人找不到文件。所以这里真的往临时目录里
 * 写图集 + meta，再让 service 跑一遍、把输出 PNG 解回来量。
 * 不需要浏览器：`baseline()` 只碰文件系统。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createImage } from '../src/sprite/contact.js'
import { encodePng } from '../src/sprite/encode.js'
import { decodePng } from '../src/sprite/png.js'
import { commonParentDir, createSpriteService, metaPathCandidates } from '../src/sprite/service.js'

const OPAQUE: [number, number, number, number] = [220, 90, 40, 255]

/** 造一张 2×1 格（每格 10×10）的图集：第 0 格内容 y∈[2,8)，第 1 格 y∈[4,8)。 */
function makeSheet(): { width: number; height: number; rgba: Uint8Array } {
  const sheet = createImage(20, 10)
  for (let y = 2; y < 8; y++) for (let x = 3; x < 7; x++) sheet.rgba.set(OPAQUE, (y * 20 + x) * 4)
  for (let y = 4; y < 8; y++) for (let x = 13; x < 17; x++) sheet.rgba.set(OPAQUE, (y * 20 + x) * 4)
  return sheet
}

function meta(over: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      name: 'idle',
      cols: 2,
      rows: 1,
      cellWidth: 10,
      cellHeight: 10,
      anchorX: 0.5,
      anchorY: 0.5,
      anchorConvention: 'y-from-bottom',
      ...over,
    },
    null,
    2,
  )
}

/** 在临时目录里准备一张图集 + 一份 meta，返回图集绝对路径。 */
function writeSheet(dir: string, folder: string, name: string, metaBody = meta()): string {
  const target = path.join(dir, folder)
  mkdirSync(target, { recursive: true })
  const png = path.join(target, `${name}_2x1.png`)
  writeFileSync(png, encodePng(makeSheet()))
  writeFileSync(path.join(target, `${name}_2x1.meta.json`), metaBody, 'utf8')
  return png
}

function serviceOf(dir: string) {
  return createSpriteService({ toolHtmlPath: path.join(dir, 'nope.html'), outDir: dir, log: () => {} })
}

test('metaPathCandidates：先找 <stem>.meta.json，再退回 <stem>.json', () => {
  assert.deepEqual(metaPathCandidates('D:\\out\\idle\\idle_8x6.png'), [
    'D:\\out\\idle\\idle_8x6.meta.json',
    'D:\\out\\idle\\idle_8x6.json',
  ])
})

test('commonParentDir：多张图集落在同一个根 → 用那个根；单张 → 用它所在目录', () => {
  const root = path.resolve('D:\\out')
  assert.equal(commonParentDir([path.join(root, 'idle', 'a.png'), path.join(root, 'walk', 'b.png')]), root)
  assert.equal(commonParentDir([path.join(root, 'idle', 'a.png'), path.join(root, 'idle', 'b.png')]), path.join(root, 'idle'))
  assert.equal(commonParentDir([path.join(root, 'idle', 'a.png')]), path.join(root, 'idle'))
})

test('准绳图：两张图集按锚点对齐到同一条地平线，落在公共父目录的 _debug 下', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-sprite-baseline-'))
  const service = serviceOf(dir)
  try {
    const idle = writeSheet(dir, 'idle', 'idle')
    const walk = writeSheet(dir, 'walk', 'walk', meta({ name: 'walk', anchorY: 0.2 }))
    const result = await service.baseline({ paths: [idle, walk] })

    assert.equal(result.ok, true)
    // 输出根 = 两张图的公共父目录（= 临时目录），落进 _debug/
    assert.equal(path.dirname(path.dirname(result.path!)), dir)
    assert.equal(path.basename(path.dirname(result.path!)), '_debug')
    assert.match(path.basename(result.path!), /^baseline-\d+\.png$/)

    // 尺寸与对齐公式：anchorYPx(idle)=5、anchorYPx(walk)=8 → topSpace=8、bottom=5、padding=4、gap=8
    assert.equal(result.width, 2 * 4 + 10 + 10 + 8)
    assert.equal(result.height, 2 * 4 + 8 + 5)
    assert.equal(result.baselineY, 4 + 8)
    // 两格的锚点都必须落在 baselineY 上
    for (const item of result.items!) {
      assert.equal(item.drawY + item.anchorYPx, result.baselineY, `${item.name} 的锚点没落在地平线上`)
    }
    assert.equal(result.items!.length, 2)
    assert.equal(result.items![0]!.name, 'idle')
    assert.equal(result.items![1]!.name, 'walk')
    // 实测身高是**成品像素**（不是 meta 里的参数回显）：第 0 格内容 y2..7 → 6
    assert.equal(result.items![0]!.charHeightPx, 6)
    // 头顶线 = 各格 (drawY + headTopY) 的中位数：idle 7+2=9、walk 4+2=6 → median 7.5 → 8
    assert.equal(result.items![0]!.drawY + result.items![0]!.headTopY!, 9)
    assert.equal(result.items![1]!.drawY + result.items![1]!.headTopY!, 6)
    assert.equal(result.headTopY, 8)

    // 输出是能解回像素的真 PNG，且地平线那一行是青色
    const decoded = decodePng(readFileSync(result.path!))
    assert.equal(decoded.width, result.width)
    assert.equal(decoded.height, result.height)
    const at = (x: number, y: number): number[] => {
      const i = (y * decoded.width + x) * 4
      return [decoded.rgba[i]!, decoded.rgba[i + 1]!, decoded.rgba[i + 2]!, decoded.rgba[i + 3]!]
    }
    assert.deepEqual(at(decoded.width - 1, result.baselineY!), [0, 0xe5, 0xff, 255], '地平线应是青色')
    assert.deepEqual(at(decoded.width - 1, result.headTopY!), [255, 0, 255, 255], '头顶线应是品红')
    assert.deepEqual(at(0, 0), [0x20, 0x20, 0x30, 255], '底色默认 #202030')
  } finally {
    await service.stop().catch(() => undefined)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('准绳图：没有同名 meta 直接报错（不许猜锚点）', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-sprite-baseline-'))
  const service = serviceOf(dir)
  try {
    const png = path.join(dir, 'lonely_2x1.png')
    writeFileSync(png, encodePng(makeSheet()))
    await assert.rejects(() => service.baseline({ paths: [png] }), /找不到同名 meta\.json/)
  } finally {
    await service.stop().catch(() => undefined)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('准绳图：meta 里缺锚点/格子尺寸要报错，并点名缺哪个字段', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-sprite-baseline-'))
  const service = serviceOf(dir)
  try {
    const png = writeSheet(dir, 'idle', 'idle', meta({ cellWidth: null, anchorY: 'nope' }))
    await assert.rejects(() => service.baseline({ paths: [png] }), /meta 里缺 cellWidth\/anchorY\(0~1\)/)
  } finally {
    await service.stop().catch(() => undefined)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('准绳图：cellIndex 超出网格要报错；<stem>.json 兜底能被找到；y-from-top 口径要翻过来', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-sprite-baseline-'))
  const service = serviceOf(dir)
  try {
    const png = writeSheet(dir, 'idle', 'idle')
    await assert.rejects(() => service.baseline({ paths: [png], cellIndex: 2 }), /超出网格/)

    // 用 <stem>.json 兜底（不是 .meta.json），并且锚点写成 y-from-top：0.2 → y-from-bottom 0.8
    rmSync(path.join(dir, 'idle', 'idle_2x1.meta.json'))
    writeFileSync(
      path.join(dir, 'idle', 'idle_2x1.json'),
      meta({ anchorY: 0.2, anchorConvention: 'y-from-top' }),
      'utf8',
    )
    const result = await service.baseline({ paths: [png], cellIndex: 1, outDir: path.join(dir, 'custom') })
    assert.equal(result.ok, true)
    assert.match(result.path!, /custom[\\/]_debug[\\/]baseline-\d+\.png$/, 'outDir 给了就用它')
    const item = result.items![0]!
    assert.equal(item.anchorY, 0.8, 'y-from-top 0.2 → y-from-bottom 0.8')
    assert.equal(item.anchorYPx, Math.round(0.2 * 10), '锚点行 = round((1−anchorY)×cellH)')
  } finally {
    await service.stop().catch(() => undefined)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('准绳图：空 paths 与不存在的路径都要明确报错', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-sprite-baseline-'))
  const service = serviceOf(dir)
  try {
    await assert.rejects(() => service.baseline({ paths: [] }), /需要 paths/)
    await assert.rejects(() => service.baseline({ paths: [path.join(dir, 'nope.png')] }), /找不到这张图集/)
  } finally {
    await service.stop().catch(() => undefined)
    rmSync(dir, { recursive: true, force: true })
  }
})
