/**
 * sprite-tools.test —— 工具层判据（不需要浏览器）。
 *
 * 这一层钉的是评审文档里 P1（参数被静默丢弃）和 C1（语义要自解释）：
 * - 页面能调的每个参数，工具层都必须原样转给 service（`.57` 之前 `mode` 就被白名单吞了）；
 * - 传了但没被识别的键必须能算进 `ignored`（不允许静默忽略）；
 * - 14 个工具的形状（名字、必填项、超时）是稳定契约。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTools, ignoredKeysOf, keyParamsOf } from '../src/sprite/tools.js'
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
    batch: async () => ({ ok: true, results: [], failures: [] }),
    auto: async () => ({ ok: true, warnings: [], stages: [] }),
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

test('19 个工具的名字与必填项是稳定契约', () => {
  const { service } = stubService()
  const tools = buildTools(service)
  const byName = new Map(tools.map((tool) => [String(tool.name), tool]))
  // 2026-11-13：加了三个像素搜索原语（match / feature_fit / silhouette_fit）与一致性自检（verify），14 → 18；
  // 同一天最后一批加了准绳图 sprite_baseline（成品实测 measured / overflow 核对图），18 → 19。
  assert.equal(byName.size, 19)
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

test('sprite_export 描述里写清了"measured 才是成品实测"（否则模型还是只信 achievedPx）', () => {
  const { service } = stubService()
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
