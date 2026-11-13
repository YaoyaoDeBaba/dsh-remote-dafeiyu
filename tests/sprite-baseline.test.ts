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
    // P2-7：底色默认**按主体亮度自适应**了——这格的 OPAQUE 亮度 123（<128，偏暗）→ 浅底。
    // 旧断言写的是固定的 #202030，那是"深底糊掉浅色角色"的成因，所以改断言而不是改实现。
    assert.deepEqual(at(0, 0), [0xf2, 0xf2, 0xf5, 255], '深色主体 → 自适应浅底 #f2f2f5')
    assert.equal(result.background?.hex, '#f2f2f5')
    assert.equal(result.background?.meanLuma, 123)
    assert.equal(result.background?.adaptive, true)
    assert.match(String(result.background?.reason), /偏暗/)
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

/** 2×2 格（每格 10×10）的图集：四格内容高 9 / 5 / 5 / 3。 */
function makeLadderSheet(): { width: number; height: number; rgba: Uint8Array } {
  const sheet = createImage(20, 20)
  const fill = (x0: number, y0: number, x1: number, y1: number): void => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sheet.rgba.set(OPAQUE, (y * 20 + x) * 4)
  }
  fill(2, 0, 8, 9) // 第 0 格：y0..8 → 高 9
  fill(12, 2, 18, 7) // 第 1 格：y2..6 → 高 5
  fill(2, 12, 8, 17) // 第 2 格：y12..16（格子 y10..19，格内 y2..6）→ 高 5
  fill(12, 14, 18, 17) // 第 3 格：格内 y4..6 → 高 3
  return sheet
}

function writeLadderSheet(dir: string, folder: string, name: string, metaBody: string): string {
  const target = path.join(dir, folder)
  mkdirSync(target, { recursive: true })
  const png = path.join(target, `${name}_2x2.png`)
  writeFileSync(png, encodePng(makeLadderSheet()))
  writeFileSync(path.join(target, `${name}_2x2.meta.json`), metaBody, 'utf8')
  return png
}

const LADDER_META = meta({ cols: 2, rows: 2 })

test('P2-6：cellIndex="tallest"/"median" 能选中不同的格子，并在返回里说明用了哪一格', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-sprite-baseline-'))
  const service = serviceOf(dir)
  try {
    const png = writeLadderSheet(dir, 'idle', 'idle', LADDER_META)

    const tallest = await service.baseline({ paths: [png], cellIndex: 'tallest' })
    assert.equal(tallest.cellIndexUsed?.mode, 'tallest')
    assert.equal(tallest.cellIndexUsed?.perItem[0]?.cellIndex, 0, 'bbox 最高的就是第 0 格（高 9）')
    assert.equal(tallest.items![0]!.cellIndex, 0, 'items 里也要带上实际用的格号')
    assert.equal(tallest.items![0]!.charHeightPx, 9)
    assert.match(tallest.warnings.join('\n'), /cellIndex=tallest/)

    const median = await service.baseline({ paths: [png], cellIndex: 'median' })
    assert.equal(median.cellIndexUsed?.mode, 'median')
    assert.equal(median.cellIndexUsed?.perItem[0]?.cellIndex, 1, '高 9/5/5/3 的中位数是 5 → 第 1 格（同分取序号小的）')
    assert.equal(median.items![0]!.charHeightPx, 5)

    // 不传就还是第 0 格（向后兼容）
    const fixed = await service.baseline({ paths: [png] })
    assert.equal(fixed.cellIndexUsed?.mode, 'fixed')
    assert.equal(fixed.items![0]!.cellIndex, 0)
    assert.equal(fixed.items![0]!.charHeightPx, 9)

    await assert.rejects(() => service.baseline({ paths: [png], cellIndex: 'first' as never }), /cellIndex 只能是格号/)
  } finally {
    await service.stop().catch(() => undefined)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('P2-7：background 不给就自适应；给了就用给的（显式值永远赢）', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-sprite-baseline-'))
  const service = serviceOf(dir)
  try {
    const png = writeSheet(dir, 'idle', 'idle')
    const forced = await service.baseline({ paths: [png], background: '#101018' })
    assert.deepEqual(forced.background, { hex: '#101018', meanLuma: 123, adaptive: false })
    const decoded = decodePng(readFileSync(forced.path!))
    const at00 = [decoded.rgba[0]!, decoded.rgba[1]!, decoded.rgba[2]!, decoded.rgba[3]!]
    assert.deepEqual(at00, [0x10, 0x10, 0x18, 255], '传了 background 就必须用传的')
    assert.doesNotMatch(forced.warnings.join('\n'), /底色自适应/)
  } finally {
    await service.stop().catch(() => undefined)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('P2-8：一组里锚点口径混用 → 点名警告；anchorY 与 anchorYTopDown 对不上 → 点名警告', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-sprite-baseline-'))
  const service = serviceOf(dir)
  try {
    const bottom = writeSheet(dir, 'bottom', 'bottom', meta({ name: 'bottom', anchorY: 0.5 }))
    const top = writeSheet(
      dir,
      'top',
      'top',
      meta({ name: 'top', anchorY: 0.5, anchorConvention: 'y-from-top' }),
    )
    const mixed = await service.baseline({ paths: [bottom, top] })
    const mixedText = mixed.warnings.join('\n')
    assert.match(mixedText, /锚点口径混用/)
    assert.match(mixedText, /y-from-top: top_2x1\.png/)
    assert.match(mixedText, /y-from-bottom: bottom_2x1\.png/)
    assert.match(mixedText, /口径疑似不一致，画出来的地平线可能整体偏移/)

    // 单条自己两个字段对不上（8 条老 meta 踩的那个坑）
    const bad = writeSheet(
      dir,
      'bad',
      'bad',
      meta({ name: 'bad', anchorY: 0.8, anchorYTopDown: 0.8 }),
    )
    const mismatch = await service.baseline({ paths: [bad] })
    const mismatchText = mismatch.warnings.join('\n')
    assert.match(mismatchText, /bad_2x1\.png 的 anchorY=0\.8/)
    assert.match(mismatchText, /anchorYTopDown=0\.8/)
    assert.match(mismatchText, /口径疑似不一致，画出来的地平线可能整体偏移/)
  } finally {
    await service.stop().catch(() => undefined)
    rmSync(dir, { recursive: true, force: true })
  }
})
