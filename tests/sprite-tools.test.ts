/**
 * sprite-tools.test —— 工具层判据（不需要浏览器）。
 *
 * 这一层钉的是评审文档里 P1（参数被静默丢弃）和 C1（语义要自解释）：
 * - 页面能调的每个参数，工具层都必须原样转给 service（`.57` 之前 `mode` 就被白名单吞了）；
 * - 传了但没被识别的键必须能算进 `ignored`（不允许静默忽略）；
 * - 20 个工具的形状（名字、必填项、超时）是稳定契约。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTools, ignoredKeysOf, keyParamsOf, prepareLoopOf } from '../src/sprite/tools.js'
import { SPRITE_GUIDE, SPRITE_GUIDANCE } from '../src/sprite/guide.js'
import type { SpriteService } from '../src/sprite/service.js'

/** 只记录调用的空壳 service：工具层的行为判据不需要真跑浏览器。 */
function stubService() {
  const calls: Array<{ name: string; args: unknown }> = []
  const record = (name: string) => async (args: unknown) => {
    calls.push({ name, args })
    return { ok: true, marker: name } as never
  }
  const service = {
    prepare: record('prepare'),
    loopScan: record('loopScan'),
    probeColor: record('probeColor'),
    keyPreview: record('keyPreview'),
    keyApply: record('keyApply'),
    measure: record('measure'),
    scaleTo: record('scaleTo'),
    getAnchor: record('getAnchor'),
    setAnchorPx: record('setAnchorPx'),
    cleanup: record('cleanup'),
    exportSheet: record('exportSheet'),
    baseline: record('baseline'),
    autotune: async () => ({ ok: true, params: {}, trace: [], reachedGoal: true }),
    batch: record('batch'),
    auto: record('auto'),
    stop: async () => undefined,
    busy: false,
  } as unknown as SpriteService
  return { service, calls }
}

test('keyParamsOf：两档参数全都转得过去（P1：一个都不许被白名单吞掉）', () => {
  const params = keyParamsOf({
    mode: 'advanced',
    colorHex: '#86AF51',
    intensity: 85,
    feather: 20,
    cleanup: 30,
    softness: 100,
    despill: 70,
    greenToAlpha: 25,
    aggressive: true,
    autoPlate: false,
    advIntensity: 90,
    advFeather: 10,
  })
  assert.deepEqual(params, {
    mode: 'advanced',
    colorHex: '#86AF51',
    intensity: 85,
    feather: 20,
    cleanup: 30,
    softness: 100,
    despill: 70,
    greenToAlpha: 25,
    aggressive: true,
    autoPlate: false,
    advIntensity: 90,
    advFeather: 10,
  })
})

test('keyParamsOf：类型不对的值不再"带默认值蒙混过关"', () => {
  const params = keyParamsOf({ mode: 'weird', intensity: 'high', aggressive: 'yes', colorHex: '   ' })
  assert.deepEqual(params, {}, '非法值一律不进参数，别拿默认值顶上')
})

test('ignoredKeysOf：不认识的键要能被算出来（不能静默丢弃）', () => {
  assert.deepEqual(ignoredKeysOf({ mode: 'advanced', frame: 0, nonsense: 1 }), ['nonsense'])
})

test('20 个工具的名字与必填项是稳定契约', () => {
  const { service } = stubService()
  const tools = buildTools(service)
  const byName = new Map(tools.map((tool) => [String(tool.name), tool]))
  // 2026-11-13：加了三个像素搜索原语（match / feature_fit / silhouette_fit）与一致性自检（verify），14 → 18；
  // 同一天最后一批加了准绳图 sprite_baseline（成品实测 measured / overflow 核对图），18 → 19。
  // 同一天再补循环闭合的扫描原语 sprite_loop_scan（自相关测周期），19 → 20。
  assert.equal(byName.size, 20)
  const required: Record<string, string[]> = {
    sprite_prepare: ['videoPath'],
    sprite_batch: ['outRoot', 'items'],
    sprite_auto: ['videoPath'],
    // 这三个没有"合理解法"的默认值：不给模板/矩形就只能瞎猜，所以必须点名。
    sprite_match: ['templateRect'],
    sprite_feature_fit: ['templates'],
    // 准绳图没有路径就什么也排不出来（meta 是配套自动找的，不在这里点名）。
    sprite_baseline: ['paths'],
  }
  for (const [name, fields] of Object.entries(required)) {
    const params = byName.get(name)!.parameters as { required?: string[] }
    assert.deepEqual(params.required, fields, `${name} 的必填项变了`)
  }
  // 其它工具都不该有必填项（全是可选参数，避免"少传一个就报错"）
  for (const [name, tool] of byName) {
    if (required[name]) continue
    const params = tool.parameters as { required?: string[] }
    assert.equal(params.required, undefined, `${name} 不该有必填项`)
  }
  for (const tool of tools) {
    assert.equal(typeof tool.execute, 'function', `${String(tool.name)} 缺 execute`)
    assert.equal(typeof tool.timeoutMs, 'number', `${String(tool.name)} 缺 timeoutMs`)
    assert.ok(String(tool.description).length > 20, `${String(tool.name)} 的描述太短：语义要能自解释（C1）`)
  }
})

test('参数描述里写清了"哪一档生效"（C1/C2）', () => {
  const { service } = stubService()
  const preview = buildTools(service).find((tool) => tool.name === 'sprite_key_preview')!
  const props = (preview.parameters as { properties: Record<string, { description?: string }> }).properties
  assert.match(String(props.softness?.description), /advanced/)
  assert.match(String(props.feather?.description), /classic/)
  assert.match(String(props.autoPlate?.description), /apply/)
})

test('工具真的把参数转给了 service（防止"schema 有、实现没接"）', async () => {
  const { service, calls } = stubService()
  const tools = new Map(buildTools(service).map((tool) => [String(tool.name), tool]))
  await (tools.get('sprite_key_apply')!.execute as (args: unknown) => Promise<unknown>)({
    mode: 'advanced',
    colorHex: '#95C469',
    softness: 100,
    autoPlate: true,
  })
  const applied = calls.find((call) => call.name === 'keyApply')!
  assert.deepEqual(applied.args, { mode: 'advanced', colorHex: '#95C469', softness: 100, autoPlate: true })

  await (tools.get('sprite_key_preview')!.execute as (args: unknown) => Promise<unknown>)({ frame: 3, intensity: 70 })
  const preview = calls.find((call) => call.name === 'keyPreview')!
  assert.deepEqual(preview.args, { intensity: 70, frame: 3 })
})

test('sprite_export 的调参都能转到 service（命名/格式/物理量）', async () => {
  const { service, calls } = stubService()
  const exportTool = buildTools(service).find((tool) => tool.name === 'sprite_export')!
  await (exportTool.execute as (args: unknown) => Promise<unknown>)({
    cols: 8,
    rows: 6,
    charHeightPx: 300,
    span: { fromY: 194, toY: 1021 },
    outDir: 'D:\\out',
    fileName: 'Idle_8x6.webp',
    dirPerAction: true,
    overwrite: false,
    format: 'webp',
    quality: 0.85,
    name: 'Idle',
  })
  const exported = calls.find((call) => call.name === 'exportSheet')!
  assert.deepEqual(exported.args, {
    cols: 8,
    rows: 6,
    charHeightPx: 300,
    span: { fromY: 194, toY: 1021 },
    outDir: 'D:\\out',
    fileName: 'Idle_8x6.webp',
    dirPerAction: true,
    overwrite: false,
    format: 'webp',
    quality: 0.85,
    name: 'Idle',
  })
})

test('sprite_export 的 debugOverlay 与 sprite_baseline 的入参都能过到 service', async () => {
  const { service, calls } = stubService()
  const tools = new Map(buildTools(service).map((tool) => [String(tool.name), tool]))

  await (tools.get('sprite_export')!.execute as (args: unknown) => Promise<unknown>)({
    name: 'Idle',
    debugOverlay: true,
  })
  const exported = calls.find((call) => call.name === 'exportSheet')!
  assert.deepEqual(exported.args, { name: 'Idle', debugOverlay: true })

  await (tools.get('sprite_baseline')!.execute as (args: unknown) => Promise<unknown>)({
    paths: ['D:\\out\\idle\\idle_8x6.png', 'D:\\out\\walk\\walk_8x6.png'],
    cellIndex: 2,
    gap: 12,
    background: '#101018',
    padding: 6,
    outDir: 'D:\\out',
  })
  const baseline = calls.find((call) => call.name === 'baseline')!
  assert.deepEqual(baseline.args, {
    paths: ['D:\\out\\idle\\idle_8x6.png', 'D:\\out\\walk\\walk_8x6.png'],
    cellIndex: 2,
    gap: 12,
    background: '#101018',
    padding: 6,
    outDir: 'D:\\out',
  })
})

test('sprite_loop_scan 的参数能过到 service；不传就一个都不编默认值', async () => {
  const { service, calls } = stubService()
  const scan = new Map(buildTools(service).map((tool) => [String(tool.name), tool])).get('sprite_loop_scan')!
  await (scan.execute as (args: unknown) => Promise<unknown>)({
    preFps: 20.945,
    minPeriodSec: 1.2,
    targetMultiples: [24, 48],
    mask: 'none',
  })
  assert.deepEqual(calls.find((call) => call.name === 'loopScan')!.args, {
    preFps: 20.945,
    minPeriodSec: 1.2,
    targetMultiples: [24, 48],
    mask: 'none',
  })
  // 全空：工具层不许自己塞 {minPeriodSec:2} 之类的默认值——默认值只许有一处（service），
  // 两处各写一套就是下一次"schema 说有、service 没转"的起点。
  await (scan.execute as (args: unknown) => Promise<unknown>)({})
  assert.deepEqual(calls.filter((call) => call.name === 'loopScan').at(-1)!.args, {})
})

test('sprite_loop_scan 的描述写清了前置条件与"不改会话状态"', () => {
  const { service } = stubService()
  const scan = buildTools(service).find((tool) => tool.name === 'sprite_loop_scan')!
  const description = String(scan.description)
  assert.match(description, /不改会话状态/)
  assert.match(description, /24/)
  assert.match(description, /closureScore/)
  assert.match(description, /confidence/)
  // 扫描原语不该有必填项（会话里的帧就够了）
  assert.equal((scan.parameters as { required?: string[] }).required, undefined)
})

test('sprite_prepare 的 loop 是显式开关：不传时入参与以前一模一样', async () => {
  const { service, calls } = stubService()
  const prepare = new Map(buildTools(service).map((tool) => [String(tool.name), tool])).get('sprite_prepare')!
  const run = (args: unknown): Promise<unknown> => (prepare.execute as (a: unknown) => Promise<unknown>)(args)

  await run({ videoPath: 'D:\\v.mp4' })
  assert.deepEqual(calls.at(-1)!.args, { videoPath: 'D:\\v.mp4' }, '不传 loop 时连键都不许出现（向后兼容）')

  await run({ videoPath: 'D:\\v.mp4', fps: 12, loop: { targetFrames: 24, minPeriodSec: 1.2, targetMultiples: [24], mask: 'body-core' } })
  assert.deepEqual(calls.at(-1)!.args, {
    videoPath: 'D:\\v.mp4',
    fps: 12,
    loop: { targetFrames: 24, minPeriodSec: 1.2, targetMultiples: [24], mask: 'body-core' },
  })

  // 空的 loop:{} 也算"传了"（要走循环流程），不能被当成 falsy 吞掉。
  await run({ videoPath: 'D:\\v.mp4', loop: {} })
  assert.deepEqual(calls.at(-1)!.args, { videoPath: 'D:\\v.mp4', loop: {} })

  // loop 子对象里不认识的键要显形（顶层有 ignoredKeysOf，子对象不能断档）。
  const out = String(await run({ videoPath: 'D:\\v.mp4', loop: { targetFrames: 24, nonsense: 1 } }))
  assert.match(out, /ignoredLoop/)
  assert.match(out, /nonsense/)
})

test('prepareLoopOf：只收认得的键，类型不对的不进参数', () => {
  assert.deepEqual(prepareLoopOf({ targetFrames: 24, mask: 'none' }).loop, { targetFrames: 24, mask: 'none' })
  assert.deepEqual(prepareLoopOf({ targetFrames: '24', mask: 'weird', minPeriodSec: Number.NaN }), {
    loop: {},
    ignored: [],
  })
  assert.deepEqual(prepareLoopOf({ nonsense: 1, targetMultiples: [24, 'x', 48] }), {
    loop: { targetMultiples: [24, 48] },
    ignored: ['nonsense'],
  })
  assert.deepEqual(prepareLoopOf(undefined), { loop: {}, ignored: [] }, 'loop:{} 与 loop:null 都当成"传了但要默认"')
})

test('sprite_export 的 loop 开关能过到 service，不传时也不出现 loop 键', async () => {
  const { service, calls } = stubService()
  const exportTool = buildTools(service).find((tool) => tool.name === 'sprite_export')!
  const run = (args: unknown): Promise<unknown> => (exportTool.execute as (a: unknown) => Promise<unknown>)(args)
  await run({ name: 'Idle' })
  assert.deepEqual(calls.at(-1)!.args, { name: 'Idle' })
  await run({ name: 'Idle', loop: true })
  assert.deepEqual(calls.at(-1)!.args, { name: 'Idle', loop: true })
  assert.match(String(exportTool.description), /loopCheck/)
})

test('sprite_export 描述里写清了"measured 才是成品实测"（否则模型还是只信 achievedPx）', () => {  const { service } = stubService()
  const exportTool = buildTools(service).find((tool) => tool.name === 'sprite_export')!
  const description = String(exportTool.description)
  assert.match(description, /measured/)
  assert.match(description, /参数回显/)
  assert.match(description, /sheet-rgba/)
})

test('sprite_cleanup 的 trim 策略与 maskRect=auto 能过到 service', async () => {
  const { service, calls } = stubService()
  const cleanup = buildTools(service).find((tool) => tool.name === 'sprite_cleanup')!
  await (cleanup.execute as (args: unknown) => Promise<unknown>)({
    maskAuto: true,
    trim: { mode: 'first-frame', pad: { top: 4, bottom: 6 }, alphaThreshold: 40 },
  })
  const call = calls.find((entry) => entry.name === 'cleanup')!
  assert.deepEqual(call.args, {
    maskRect: 'auto',
    trim: { mode: 'first-frame', pad: { top: 4, bottom: 6 }, alphaThreshold: 40 },
  })
})

test('sprite_guide 的正文来自 skill 真源；内置兜底够干活、常驻引导只指路', () => {
  // 2026-11-13：正文搬到 assets/skills/dafeiyu-sprite/（SKILL.md + references），
  // SPRITE_GUIDE 只是读不到那份文件时的兜底，所以这里只验"能干活 + 不重复长文案"。
  assert.ok(SPRITE_GUIDE.includes('sprite_probe_color'))
  assert.ok(SPRITE_GUIDE.includes('y-from-bottom'))
  assert.match(SPRITE_GUIDE, /minRun/)
  assert.ok(SPRITE_GUIDANCE.length < SPRITE_GUIDE.length, '系统提示那一段要短于兜底正文')
  assert.ok(SPRITE_GUIDANCE.includes('dafeiyu-sprite'), '常驻引导必须点名 skill')
})

test('P0-1：sprite_auto / sprite_batch 的锚点与 sprite_export 的 correction 都原样转给 service', async () => {
  const { service, calls } = stubService()
  const tools = new Map(buildTools(service).map((tool) => [String(tool.name), tool]))
  const run = (name: string, args: unknown): Promise<unknown> =>
    (tools.get(name)!.execute as (a: unknown) => Promise<unknown>)(args)

  // ① 传了锚点就必须转到 service.auto（以前 schema 里根本没有这两个键 ⇒ auto 永远 anchorWritten:false）
  await run('sprite_auto', { videoPath: 'D:\\v.mp4', anchorX: 0.4164, anchorY: 0.9375 })
  const auto = calls.find((call) => call.name === 'auto')!
  assert.deepEqual(auto.args, { videoPath: 'D:\\v.mp4', anchorX: 0.4164, anchorY: 0.9375 })

  // 不传时就一个键都不许出现（默认值只许有一处）
  await run('sprite_auto', { videoPath: 'D:\\v.mp4' })
  assert.deepEqual(calls.filter((call) => call.name === 'auto').at(-1)!.args, { videoPath: 'D:\\v.mp4' })

  // ② batch 的每一项也要带得上（否则批量重出的 6 条全是默认锚点）
  await run('sprite_batch', {
    outRoot: 'D:\\out',
    items: [{ videoPath: 'D:\\walk.mp4', action: 'walk', anchorX: 0.4, anchorY: 0.9 }],
  })
  const batch = calls.find((call) => call.name === 'batch')! as { args: { items: Array<Record<string, unknown>> } }
  assert.deepEqual(batch.args.items, [{ videoPath: 'D:\\walk.mp4', action: 'walk', anchorX: 0.4, anchorY: 0.9 }])

  // ③ 闭环开关：不传不出现（默认开），传了原样下去
  await run('sprite_export', { name: 'Idle' })
  assert.deepEqual(calls.filter((call) => call.name === 'exportSheet').at(-1)!.args, { name: 'Idle' })
  await run('sprite_export', { name: 'Idle', correction: false })
  assert.deepEqual(calls.filter((call) => call.name === 'exportSheet').at(-1)!.args, { name: 'Idle', correction: false })
})

test('P0-1/P0-2 的语义写进了工具描述（否则模型还是不知道要传锚点、也不知道会重导一次）', () => {
  const { service } = stubService()
  const byName = new Map(buildTools(service).map((tool) => [String(tool.name), tool]))
  for (const name of ['sprite_auto', 'sprite_batch', 'sprite_export']) {
    const description = String(byName.get(name)!.description)
    assert.match(description, /anchorX/, `${name} 的描述要交代锚点`)
    assert.match(description, /y-from-bottom/, `${name} 的描述要交代 anchorY 口径`)
  }
  const auto = String(byName.get('sprite_auto')!.description)
  assert.match(auto, /correction/, 'auto 会跑闭环，描述要说清回执在哪')
  assert.match(auto, /翻倍|重导一次/, 'auto 要把"重导一次≈翻倍耗时"写明')
  const exported = String(byName.get('sprite_export')!.description)
  assert.match(exported, /semanticHeight/)
  assert.match(exported, /bboxHeight/)
  assert.match(exported, /basis/)
  assert.match(exported, /correction:false/)
})

