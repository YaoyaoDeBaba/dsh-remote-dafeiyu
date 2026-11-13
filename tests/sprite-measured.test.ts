/**
 * sprite-measured.test —— 三个 P0 的判据（下游实测反馈，带证据）：
 *
 * - **P0-1**：`sprite_auto` 导出后 `anchorWritten:false` ⇒ meta 里是页面默认锚点（下游读到 0.5/0，横向偏 20~40px）；
 *   现在 ①传锚点 ⇒ `anchorWritten:true` 且值正确，②不传 ⇒ **必有**告警；
 * - **P0-2**：`targetCharHeight` 与 `measured` 不收敛（262→245 / 275→267 / 294→295）⇒ export 现在
 *   量完**校正一次再导一次**（只一次），⑤ 6% 偏差一次导出后 |after−target|/target ≤ 1%；
 * - **P1-5**：`measured` 只有 bbox 口径（bbox 339~357 vs 语义 316~317）⇒ 现在并排给
 *   `bboxHeight/semanticHeight/basis`，③ span⇒semantic，④ 猜得到⇒guessed、猜不到⇒bbox。
 *
 * 为什么不跑真机：像素只在浏览器里，这一层的根因全是"页面回了什么、宿主怎么处理"，
 * 所以用**页面桩**（形状照抄 `assets/sprite/sprite-tool.html` 的 scaleTo / buildSheetDataURL /
 * setAnchor / getAnchor）喂进去，导出的是**真 PNG**（`encodePng`）再被 `runExportPass` 自己解回来量。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { encodePng } from '../src/sprite/encode.js'
import {
  anchorNotWrittenWarning,
  CORRECTION_ABS_TOLERANCE_PX,
  correctionFactorOf,
  correctionResidualWarning,
} from '../src/sprite/guard.js'
import { createImage, measureSheet } from '../src/sprite/contact.js'
import { guessSemanticHeight, resolveMeasuredBasis } from '../src/sprite/semantic.js'
import { buildExportMeta, correctOnce, runExportPass, type BridgeCall, type ExportPassArgs } from '../src/sprite/service.js'
import type { RgbaImage } from '../src/sprite/match.js'

const CELL_W = 180
const CELL_H = 420
const BODY_W = 60
const BODY_X = 34

/** 一格里的"角色"：顶部一段非白的"呆毛"、接着白带（whiteness 判据）、中灰身体、下端深色鞋底（luma<110）。 */
interface CellLook {
  /** 成品内容高 = round(achievedPx × gap)：模拟「包围盒与语义身高差 6%」。 */
  gap?: number
  /** 顶部非白区占内容高的比例（让"身高上端"落在包围盒顶下面 ⇒ 语义身高 < bbox）。 */
  capRatio?: number
  /** 白带占比（0 = 没有白带 ⇒ 猜不到上端）。 */
  whiteRatio?: number
  /** 下端深色鞋底占比（0 = 没有鞋底）。 */
  soleRatio?: number
}

interface StubOptions extends CellLook {
  cols?: number
  rows?: number
  frames?: number
  /** 页面当前的归一化锚点（不传 anchorX/Y 时就落这个进 meta）。 */
  anchor?: { x: number; y: number }
}

interface PageStub {
  call: BridgeCall
  /** 每次 scaleTo 请求的 charHeightPx（用来断言"只重导了一次"）。 */
  requests: Array<number | null>
  buildCount: () => number
  anchor: { x: number; y: number }
}

function fillRect(image: RgbaImage, x0: number, y0: number, w: number, h: number, rgba: [number, number, number, number]): void {
  for (let y = y0; y < y0 + h; y++) {
    if (y < 0 || y >= image.height) continue
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || x >= image.width) continue
      const i = (y * image.width + x) * 4
      image.rgba[i] = rgba[0]
      image.rgba[i + 1] = rgba[1]
      image.rgba[i + 2] = rgba[2]
      image.rgba[i + 3] = rgba[3]
    }
  }
}

const GRAY: [number, number, number, number] = [128, 128, 128, 255]
const WHITE: [number, number, number, number] = [250, 250, 252, 255]
const DARK: [number, number, number, number] = [20, 20, 22, 255]

/**
 * 页面桩：`scaleTo` 照抄页面的口径（`achievedPx = round(sourcePx × applied/100)`，缩放上限 300%），
 * `buildSheetDataURL` 拼一张真 PNG（每格画一个 BODY_W 宽的角色，内容高 = achievedPx × gap）。
 */
function pageStub(options: StubOptions = {}): PageStub {
  const cols = options.cols ?? 2
  const rows = options.rows ?? 1
  const frames = options.frames ?? 2
  const gap = options.gap ?? 1
  const capRatio = options.capRatio ?? 0.08
  const whiteRatio = options.whiteRatio ?? 0.15
  const soleRatio = options.soleRatio ?? 0.08
  const anchor = { x: options.anchor?.x ?? 0.5, y: options.anchor?.y ?? 0 }
  const requests: Array<number | null> = []
  let builds = 0
  let achievedPx = 0

  const page: Record<string, (...args: unknown[]) => unknown> = {
    /* 页面的真实返回形状：scale 是**百分比**（100 = 1:1），achievedPx 是参数回显 */
    scaleTo: (raw: unknown) => {
      const o = (raw ?? {}) as { charHeightPx?: number; span?: { fromY: number; toY: number } }
      const sourcePx = o.span ? Math.abs(Math.round(o.span.toY) - Math.round(o.span.fromY)) + 1 : CELL_H
      const requested = typeof o.charHeightPx === 'number' ? o.charHeightPx : null
      requests.push(requested)
      const wanted = requested === null ? 100 : (requested * 100) / sourcePx
      const applied = Math.min(300, Math.max(1, wanted))
      achievedPx = Math.round((sourcePx * applied) / 100)
      return {
        ok: true,
        scale: applied,
        wantedScale: wanted,
        clamped: Math.abs(applied - wanted) > 0.01,
        sourcePx,
        achievedPx,
        cellW: CELL_W,
        cellH: CELL_H,
        auto: false,
      }
    },
    setAnchor: (raw: unknown) => {
      const o = (raw ?? {}) as { x?: number; y?: number }
      if (typeof o.x === 'number') anchor.x = o.x
      if (typeof o.y === 'number') anchor.y = o.y
      return { ok: true, x: anchor.x, y: anchor.y }
    },
    getAnchor: () => ({
      ok: true,
      anchorX: anchor.x,
      anchorY: anchor.y,
      convention: 'y-from-bottom',
      pixels: { x: Math.round(anchor.x * CELL_W), y: Math.round(anchor.y * CELL_H) },
      frameWidth: CELL_W,
      frameHeight: CELL_H,
    }),
    buildSheetDataURL: (raw: unknown) => {
      const o = (raw ?? {}) as { cols?: number; rows?: number }
      const outCols = Math.max(1, Math.floor(o.cols ?? cols))
      const outRows = Math.max(1, Math.floor(o.rows ?? rows))
      const sheet = createImage(outCols * CELL_W, outRows * CELL_H)
      const contentH = Math.max(6, Math.round(achievedPx * gap))
      const capH = Math.max(0, Math.round(contentH * capRatio))
      const whiteH = Math.max(0, Math.round(contentH * whiteRatio))
      const soleH = Math.max(0, Math.round(contentH * soleRatio))
      const count = Math.min(frames, outCols * outRows)
      for (let i = 0; i < count; i++) {
        const ox = (i % outCols) * CELL_W
        const oy = Math.floor(i / outCols) * CELL_H
        fillRect(sheet, ox + BODY_X, oy, BODY_W, contentH, GRAY)
        if (whiteH > 0) fillRect(sheet, ox + BODY_X, oy + capH, BODY_W, whiteH, WHITE)
        if (soleH > 0) fillRect(sheet, ox + BODY_X, oy + contentH - soleH, BODY_W, soleH, DARK)
      }
      builds++
      const png = encodePng(sheet)
      return {
        ok: true,
        dataURL: `data:image/png;base64,${png.toString('base64')}`,
        mime: 'image/png',
        meta: {},
        width: sheet.width,
        height: sheet.height,
      }
    },
  }

  const call: BridgeCall = async <T,>(name: string, ...args: unknown[]): Promise<T> => {
    const fn = page[name]
    if (!fn) throw new Error(`页面桩没有 ${name}`)
    return fn(...args) as T
  }
  return { call, requests, buildCount: () => builds, anchor }
}

function passArgs(stub: PageStub, extra: Partial<ExportPassArgs> = {}): ExportPassArgs {
  return { call: stub.call, cols: 2, rows: 1, format: 'png', ...extra }
}

/* ─────────────────────────── ① P0-1：锚点写进 meta ─────────────────────────── */

test('P0-1 ①：传了 anchorX/anchorY ⇒ anchorWritten:true，meta 里的值就是传进去的那个', async () => {
  const stub = pageStub({ anchor: { x: 0.5, y: 0 } })
  const pass = await runExportPass(passArgs(stub, { anchorX: 0.4164, anchorY: 0.9375 }))

  assert.equal(pass.anchorWritten, true)
  assert.deepEqual(stub.requests, [null], '没给目标身高时不该反推缩放（requests 里是 null）')
  assert.equal(pass.anchor.anchorX, 0.4164)
  assert.equal(pass.anchor.anchorY, 0.9375)
  assert.equal(
    pass.warnings.some((one) => one.includes('锚点没写进 meta')),
    false,
    '写进去了就不该有那条告警',
  )

  const meta = JSON.parse(
    JSON.stringify(
      buildExportMeta({
        built: pass.built,
        name: 'Idle',
        format: 'png',
        cellWidth: pass.cellWidth,
        cellHeight: pass.cellHeight,
        anchor: pass.anchor,
        anchorWritten: pass.anchorWritten,
        fps: 12,
        scaled: pass.scaled,
        appliedParams: null,
        generatedAt: '2026-11-13T00:00:00.000Z',
      }),
    ),
  ) as Record<string, unknown>
  assert.equal(meta.anchorWritten, true)
  assert.equal(meta.anchorX, 0.4164)
  assert.equal(meta.anchorY, 0.9375)
  assert.equal(meta.anchorYTopDown, 0.0625)
})

/* ─────────────────────────── ② P0-1：没传锚点必须告警 ─────────────────────────── */

test('P0-1 ②：没传锚点 ⇒ 必有"锚点没写进 meta"的告警（下游会读到默认 0.5/0）', async () => {
  const stub = pageStub({ anchor: { x: 0.5, y: 0 } })
  const pass = await runExportPass(passArgs(stub))
  assert.equal(pass.anchorWritten, false, '没传就不许假装写了')
  const warning = pass.warnings.find((one) => one.includes('锚点没写进 meta'))
  assert.ok(warning, `必须有那条告警，实际 warnings：${pass.warnings.join(' | ')}`)
  assert.match(String(warning), /anchorWritten:false/)
  assert.match(String(warning), /0\.5\/0/, '要点名"下游会读到默认 0.5/0"')
  assert.match(String(warning), /sprite_set_anchor/)
  // 文案与纯函数是同一份（不许两处各写一句然后漂）
  assert.equal(String(warning), anchorNotWrittenWarning({ anchorX: 0.5, anchorY: 0 }))
})

/* ─────────────────────────── ③ 给了 span ⇒ semantic ─────────────────────────── */

test('span 给了 ⇒ basis:"semantic" 且 semanticHeight ≈ (toY−fromY+1) × 实际缩放比', async () => {
  const stub = pageStub({ gap: 0.94, whiteRatio: 0.12, soleRatio: 0.08 })
  const span = { fromY: 100, toY: 440 } // 341px
  const pass = await runExportPass(passArgs(stub, { span, charHeightPx: 300 }))
  assert.ok(pass.measured, 'png 导出必须有成品实测')
  const measured = pass.measured
  assert.equal(measured.basis, 'semantic')
  const expected = Math.round((341 * pass.scaled.achievedPx) / pass.scaled.sourcePx)
  assert.equal(measured.semanticHeight, expected, 'semanticHeight = span 长度 × 实际缩放比')
  assert.equal(measured.charHeightPx, expected, 'charHeightPx 跟着语义口径走')
  assert.equal(measured.bboxHeight, Math.round(300 * 0.94), 'bboxHeight 永远是真实包围盒（这里比语义小 6%）')
  assert.ok(
    Math.abs(measured.semanticHeight! - measured.bboxHeight!) / measured.bboxHeight! > 0.05,
    '夹具要能体现 bbox 与语义身高的差（否则这条判据证明不了任何事）',
  )
  assert.equal(stub.buildCount(), 1, 'span + 已达标时不许重导')
})

/* ─────────────────────────── ④ 没 span：猜得到 / 猜不到 ─────────────────────────── */

test('没给 span ⇒ 猜得到时 basis:"guessed" 并 warning"语义身高是猜的"', async () => {
  const stub = pageStub({ whiteRatio: 0.12, soleRatio: 0.08 })
  const pass = await runExportPass(passArgs(stub, { charHeightPx: 200 }))
  const measured = pass.measured!
  assert.equal(measured.basis, 'guessed')
  assert.match(pass.warnings.join('\n'), /语义身高是猜的/)
  // 白带占了内容高的 12% ⇒ 语义身高（白带下沿→鞋底）比包围盒矮约 12%
  assert.ok(measured.semanticHeight! < measured.bboxHeight!, '语义身高应当比 bbox 矮')
  assert.equal(measured.charHeightPx, measured.semanticHeight, 'guessed 时 charHeightPx 采用语义身高')
})

test('没给 span 且猜不到 ⇒ basis:"bbox" 并 warning"与语义身高可能差 4~6%"', async () => {
  const stub = pageStub({ whiteRatio: 0, soleRatio: 0 }) // 纯灰块：上端 whiteness 一条都不命中
  const pass = await runExportPass(passArgs(stub, { charHeightPx: 200 }))
  const measured = pass.measured!
  assert.equal(measured.basis, 'bbox')
  assert.equal(measured.semanticHeight, null)
  assert.equal(measured.charHeightPx, measured.bboxHeight)
  assert.match(pass.warnings.join('\n'), /口径是 bbox/)
  assert.match(pass.warnings.join('\n'), /4~6%/)
  assert.match(pass.warnings.join('\n'), /语义身高没猜出来/, '要说明为什么没有语义身高')
})

/* ─────────────────────────── ⑤ P0-2：一次导出就收敛 ─────────────────────────── */

test('P0-2 ⑤：target 与 bbox 差 6% ⇒ 一次闭环后 |after−target|/target ≤ 1% 且 passes:1', async () => {
  const stub = pageStub({ gap: 0.94, whiteRatio: 0, soleRatio: 0 }) // bbox 口径（猜不到语义身高）
  const target = 200
  const first = await runExportPass(passArgs(stub, { charHeightPx: target }))
  assert.equal(first.measured?.charHeightPx, 188, '第一遍：bbox 比目标小 6%（200×0.94）')

  const outcome = await correctOnce({
    first,
    target,
    format: 'png',
    run: (requested) => runExportPass(passArgs(stub, { charHeightPx: requested })),
  })
  const correction = outcome.correction
  assert.ok(correction, '偏 6% 必须闭环')
  assert.equal(correction.passes, 1)
  assert.equal(correction.basis, 'bbox')
  assert.equal(correction.before, 188)
  assert.equal(correction.target, target)
  assert.ok(
    Math.abs(correction.after - target) / target <= 0.01,
    `after=${correction.after} 与 target=${target} 差超过 1%`,
  )
  assert.equal(outcome.pass.measured?.charHeightPx, correction.after, '回执里的 after 就是最终交付那一遍的实测')
  // 只导了两次（第一遍 + 一次校正），没有第三遍
  assert.equal(stub.requests.length, 2, `只许重导一次，实际请求了 ${stub.requests.length} 次：${stub.requests.join(',')}`)
  assert.equal(stub.buildCount(), 2)
  assert.ok((stub.requests[1] ?? 0) > target, '第二遍请求的目标必须比原来的大（低估就该往上修）')
})

test('P0-2 ⑤b：guessed 口径也能一次收敛（比例型偏差）', async () => {
  const stub = pageStub({ gap: 0.94, whiteRatio: 0.12, soleRatio: 0.08 })
  const target = 200
  const first = await runExportPass(passArgs(stub, { charHeightPx: target }))
  assert.equal(first.measured?.basis, 'guessed')
  const outcome = await correctOnce({
    first,
    target,
    format: 'png',
    run: (requested) => runExportPass(passArgs(stub, { charHeightPx: requested })),
  })
  assert.equal(outcome.correction?.passes, 1)
  assert.equal(outcome.correction?.basis, 'guessed')
  const after = outcome.correction!.after
  assert.ok(Math.abs(after - target) / target <= 0.01, `after=${after} / target=${target} 超过 1%`)
  assert.equal(stub.requests.length, 2)
})

test('P0-2 兜底：重导一次仍超容差 ⇒ 停止并写明"校正一次后仍差 N%"（附两个数）', async () => {
  const stub = pageStub({ gap: 0.94, whiteRatio: 0, soleRatio: 0 })
  const first = await runExportPass(passArgs(stub, { charHeightPx: 200 }))
  // 故意让"第二遍"不准：页面把缩放钳在 100%（模拟撞上限/页面不听话）
  const outcome = await correctOnce({
    first,
    target: 600,
    format: 'png',
    run: async () => ({ ...first, warnings: [...first.warnings] }),
  })
  assert.equal(outcome.correction?.passes, 1, '只校正一次')
  const residual = outcome.pass.warnings.find((one) => one.includes('校正一次后仍差'))
  assert.ok(residual, `必须有兜底告警，实际：${outcome.pass.warnings.join(' | ')}`)
  assert.match(String(residual), /目标 600px/)
  assert.match(String(residual), /实测 188px/)
  assert.match(String(residual), /不再重导/)
})

/* ─────────────────────────── ⑥ correction:false ⇒ 不重导 ─────────────────────────── */

test('P0-2 ⑥：correction:false 时不重导、返回里没有 correction（向后兼容）', async () => {
  const stub = pageStub({ gap: 0.94, whiteRatio: 0, soleRatio: 0 })
  const first = await runExportPass(passArgs(stub, { charHeightPx: 200 }))
  let ran = 0
  const outcome = await correctOnce({
    first,
    target: 200,
    format: 'png',
    correctionEnabled: false,
    run: async (requested) => {
      ran++
      return runExportPass(passArgs(stub, { charHeightPx: requested }))
    },
  })
  assert.equal(ran, 0, '关掉闭环就不许再导')
  assert.equal(outcome.correction, undefined, '关掉时不出现 correction（返回形状与旧版一致）')
  assert.equal(outcome.pass, first)
  assert.equal(stub.buildCount(), 1)
})

test('本来就在容差内 ⇒ passes:0，也不重导', async () => {
  const stub = pageStub({ gap: 1, whiteRatio: 0, soleRatio: 0 })
  const first = await runExportPass(passArgs(stub, { charHeightPx: 200 }))
  const outcome = await correctOnce({
    first,
    target: 200,
    format: 'png',
    run: () => assert.fail('已在容差内，不该重导'),
  })
  assert.deepEqual(outcome.correction, { passes: 0, basis: 'bbox', before: 200, after: 200, target: 200 })
  assert.equal(stub.requests.length, 1)
})

/* ─────────────────────────── 纯判据：系数 / 残差 / 口径 ─────────────────────────── */

test('correctionFactorOf：偏超过 1%/2px 才给系数，容差内回 null', () => {
  assert.equal(correctionFactorOf(undefined, 200), null, '没目标就不闭环')
  assert.equal(correctionFactorOf(200, 0), null, '量不出身高就不闭环（不许除 0）')
  assert.equal(correctionFactorOf(200, 199), null, '1px 差在绝对容差内')
  assert.equal(correctionFactorOf(262, 262.9), null, '0.34% 在相对容差内')
  assert.ok(Math.abs((correctionFactorOf(262, 245) ?? 0) - 262 / 245) < 1e-9, '系数 = target/measured')
  assert.equal(CORRECTION_ABS_TOLERANCE_PX, 2)
})

test('correctionResidualWarning：超容差给中文百分比，容差内回 null', () => {
  assert.equal(correctionResidualWarning(262, 261), null)
  const text = String(correctionResidualWarning(262, 245))
  assert.match(text, /校正一次后仍差 6\.5%/)
  assert.match(text, /目标 262px/)
  assert.match(text, /实测 245px/)
})

test('resolveMeasuredBasis：三条优先级与各自的 warning，一个都不能少', () => {
  const semantic = resolveMeasuredBasis({ bboxHeight: 339, span: { fromY: 0, toY: 315 }, ratio: 1 })
  assert.equal(semantic.basis, 'semantic')
  assert.equal(semantic.semanticHeight, 316)
  assert.equal(semantic.charHeightPx, 316, 'semantic 时 charHeightPx 用语义身高')
  assert.equal(semantic.bboxHeight, 339, 'bboxHeight 永远并排给出来')
  assert.deepEqual(semantic.warnings, [], 'span 是最可信的口径，不该有噪音告警')

  const guessed = resolveMeasuredBasis({ bboxHeight: 339, guessedHeight: 316 })
  assert.equal(guessed.basis, 'guessed')
  assert.equal(guessed.charHeightPx, 316)
  assert.match(guessed.warnings.join('\n'), /语义身高是猜的/)

  const bbox = resolveMeasuredBasis({ bboxHeight: 339, guessedHeight: null, guessReason: '上端没猜出来' })
  assert.equal(bbox.basis, 'bbox')
  assert.equal(bbox.semanticHeight, null)
  assert.equal(bbox.charHeightPx, 339)
  assert.match(bbox.warnings.join('\n'), /口径是 bbox/)
  assert.match(bbox.warnings.join('\n'), /上端没猜出来/)

  // auto/batch 的 span 是 alphaBBox：基准仍是真实 bbox（与以前一致），语义身高只作参考
  const bboxSpan = resolveMeasuredBasis({ bboxHeight: 339, span: { fromY: 0, toY: 338 }, spanBasis: 'bbox', ratio: 0.5, guessedHeight: 316 })
  assert.equal(bboxSpan.basis, 'bbox', 'spanBasis:bbox 时不许谎称 semantic')
  assert.equal(bboxSpan.charHeightPx, 339)
  assert.equal(bboxSpan.semanticHeight, 316, '语义身高（猜的）照样给下游')
  assert.match(bboxSpan.warnings.join('\n'), /口径是 bbox/)

  // 给了语义 span 却算不出缩放比：不许编一个"语义身高"
  const noRatio = resolveMeasuredBasis({ bboxHeight: 339, span: { fromY: 0, toY: 315 } })
  assert.equal(noRatio.basis, 'bbox')
  assert.match(noRatio.warnings.join('\n'), /算不出缩放比/)
})

test('guessSemanticHeight：上端落在白带第一行、下端落在鞋底最后一行；纯灰块猜不到要给 reason', () => {
  const sheet = createImage(CELL_W, CELL_H)
  const contentH = 200
  fillRect(sheet, BODY_X, 0, BODY_W, contentH, GRAY)
  fillRect(sheet, BODY_X, 16, BODY_W, 30, WHITE) // 白玉带：头顶那 16 行不是白的
  fillRect(sheet, BODY_X, contentH - 16, BODY_W, 16, DARK)
  const guess = guessSemanticHeight(sheet)
  assert.equal(guess.ok, true, `应当猜得到，实际：${guess.reason}`)
  assert.equal(guess.topY, 16, '上端 = 第一条够长的白色带（呆毛/高光因此不算身高上端）')
  // body-core 掩膜会腐蚀掉最外一圈（去抗锯齿边）⇒ 下端允许比真实鞋底高 1~2px
  assert.ok(Math.abs(guess.bottomY! - (contentH - 1)) <= 2, `下端=${guess.bottomY}，真实鞋底=${contentH - 1}`)
  assert.ok(Math.abs(guess.height! - (contentH - 16)) <= 2)

  const flat = createImage(CELL_W, CELL_H)
  fillRect(flat, BODY_X, 0, BODY_W, contentH, GRAY)
  const miss = guessSemanticHeight(flat)
  assert.equal(miss.ok, false)
  assert.equal(miss.height, null)
  assert.match(String(miss.reason), /上端没猜出来/)
})

test('measured 的口径只由 measureSheet + resolveMeasuredBasis 决定（contact 先如实标 bbox）', () => {
  const sheet = createImage(CELL_W, CELL_H)
  fillRect(sheet, BODY_X, 0, BODY_W, 100, GRAY)
  const raw = measureSheet(sheet, { cols: 1, rows: 1, cellWidth: CELL_W, cellHeight: CELL_H })
  assert.equal(raw.basis, 'bbox', 'measureSheet 只量了包围盒，必须如实标 bbox')
  assert.equal(raw.bboxHeight, 100)
  assert.equal(raw.semanticHeight, null)
  assert.equal(raw.charHeightPx, 100)
})
