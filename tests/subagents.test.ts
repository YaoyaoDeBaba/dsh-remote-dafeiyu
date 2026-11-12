/**
 * subagents.test — 子代理监视器的数据层（`KernelPort.listSubagents`）。
 *
 * 这一层钉的是"监视器上那些数从哪来、缺数据时怎么降级"：
 * 名称/简述 = 官方 `subagent` 工具的 description（`名称｜简述`，catalog label）；
 * 任务 = 子会话日志里第一条**人写的**用户消息（跳过系统注入）；
 * 运行态 = `agents.get()`；工作时间 = `turn` 时间差；闲置 = 现在 − 最后一条事件。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServicesKernel, type ServicesBundle } from '../src/platform/carrier-services.js'
import { readSubagentsConfig, writeSubagentsConfig } from '../src/subagents/config.js'
import { createGuidancePusher } from '../src/subagents/pusher.js'
import { startSubagents } from '../src/subagents/start.js'
import { emitSubagentChange, resetSubagentBusGate, resetSubagentBusState, setSubagentBusGate, subagentBus } from '../src/subagents/bus.js'
import { streamClients } from '../src/subagents/routes.js'

const NOW = 1_800_000_000_000

function services(options: { withQuery?: boolean; running?: string[] } = {}): ServicesBundle {
  const running = new Set(options.running ?? ['child-run'])
  const bundle: Record<string, unknown> = {
    agents: {
      get: (id: string) => (running.has(id) ? { status: 'running' } : { status: 'idle' }),
    },
    sessions: {
      list: () => [
        { id: 'child-run', createdAt: NOW - 600_000 },
        { id: 'child-idle', createdAt: NOW - 3_600_000 },
      ],
    },
    subagents: {
      listChildren: (parentId: string) =>
        Promise.resolve(parentId === 'session-p'
          ? [
              { id: 'child-run', label: '渲染合批｜升级 VFX 批次合并并跑通验收' },
              { id: 'child-idle', label: '没按格式写的名字' },
            ]
          : []),
      listDescendants: (parentId: string) =>
        Promise.resolve(parentId === 'session-p'
          ? [
              { id: 'child-run', label: '渲染合批｜升级 VFX 批次合并并跑通验收' },
              { id: 'child-idle', label: '没按格式写的名字' },
              { id: 'grandchild-1', label: '孙子｜第三层' },
            ]
          : []),
    },
  }
  if (options.withQuery !== false) {
    bundle.sessionQuery = {
      listSessions: () =>
        Promise.resolve([
          { header: { id: 'session-p', createdAt: NOW - 7_200_000 } },
          { header: { id: 'child-run', parentSession: 'session-p', delegationDepth: 1, createdAt: NOW - 600_000 } },
          { header: { id: 'child-idle', parentSession: 'session-p', delegationDepth: 1, createdAt: NOW - 3_600_000 } },
          { header: { id: 'other', createdAt: NOW - 1000 } },
        ]),
      readTitleSnapshots: (ids: string[]) =>
        Promise.resolve(ids.map((id) => ({ sessionId: id, status: 'fulfilled', value: { title: { title: '标题 ' + id } } }))),
      readSession: (id: string) =>
        Promise.resolve({
          events:
            id === 'child-run'
              ? [
                  {
                    type: 'user/message',
                    time: NOW - 600_000,
                    data: { content: [{ type: 'text', text: 'The working directory changed from "C:\\x" to "E:\\y".' }] },
                  },
                  { type: 'user/message', time: NOW - 600_000, data: { content: [{ type: 'text', text: '把 E:\\a.cs 的循环改成 for' }] } },
                  { type: 'turn/start', time: NOW - 590_000, data: { turn: 1 } },
                  { type: 'tool/call', time: NOW - 500_000, data: {} },
                  { type: 'turn/end', time: NOW - 120_000, data: { turn: 1, reason: { kind: 'completed' } } },
                  { type: 'turn/start', time: NOW - 60_000, data: { turn: 2 } },
                ]
              : [
                  { type: 'user/message', time: NOW - 3_600_000, data: { content: [{ type: 'text', text: '整理文档' }] } },
                  { type: 'turn/start', time: NOW - 3_590_000, data: { turn: 1 } },
                  { type: 'turn/end', time: NOW - 3_000_000, data: { turn: 1 } },
                ],
        }),
    }
  }
  return bundle as unknown as ServicesBundle
}

function kernel(bundle: ServicesBundle) {
  const clock = {
    now: () => NOW,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
    clearTimeout: (handle: number) => clearTimeout(handle as unknown as NodeJS.Timeout),
  }
  return createServicesKernel(bundle, { clock, log: () => {} })
}

test('listSubagents：按 parentSession 找直接子级，running 排前面', async () => {
  const port = kernel(services())
  const rows = await port.listSubagents!('session-p')
  assert.equal(rows.length, 2, '只列直接子级（other 不是它的孩子）')
  assert.deepEqual(rows.map((row) => row.id), ['child-run', 'child-idle'], 'running 的必须排前面')
  assert.equal(rows[0]!.status, 'running')
  assert.equal(rows[1]!.status, 'idle')
})

test('listSubagents：名称/简述来自官方 label，任务跳过系统注入', async () => {
  const port = kernel(services())
  const rows = await port.listSubagents!('session-p')
  const run = rows.find((row) => row.id === 'child-run')!
  const idle = rows.find((row) => row.id === 'child-idle')!
  assert.equal(run.name, '渲染合批', '名称取 label 里 ｜ 左边')
  assert.equal(run.summary, '升级 VFX 批次合并并跑通验收', '简述取 ｜ 右边')
  assert.equal(run.naming, 'ok')
  assert.equal(idle.naming, 'fallback', '没按格式写的 label 要标记出来（端上显示 子代理N）')
  assert.equal(idle.name, undefined, '不合规的名字不往外带')
  assert.equal(idle.summary, undefined, '不合规也不带简述')
  assert.equal(run.task, undefined, '任务正文不再下发（界面只显示简述）')
  assert.equal(typeof run.runningMs, 'number', 'running 时必须给本轮运行时长')
})

test('listSubagents：工作时长/闲置时长/标题仍然照旧', async () => {
  const port = kernel(services())
  const rows = await port.listSubagents!('session-p')
  const run = rows.find((row) => row.id === 'child-run')!
  const idle = rows.find((row) => row.id === 'child-idle')!
  assert.equal(run.title, undefined, '标题也不下发，避免带出指令内容')
  assert.equal(run.workMs, 0, '不再读日志：工作时长只由事件流累计（此用例没有事件）')
  assert.equal(Math.round(run.idleMs / 1000), 600, '没有事件时闲置时间按创建时间兜底')
  assert.equal(idle.workMs, 0, '空闲子代理也不读日志')
})

test('listSubagents：descendants=true 才递归，默认只一层', async () => {
  const bundle = services()
  ;(bundle.subagents as Record<string, unknown>).listChildren = (parentId: string) =>
    Promise.resolve(parentId === 'session-p' ? [{ id: 'child-1', createdAt: NOW }] : [])
  ;(bundle.subagents as Record<string, unknown>).listDescendants = () =>
    Promise.resolve([{ id: 'child-1' }, { id: 'grandchild-1' }])
  ;(bundle.sessionQuery as { listSessions: () => Promise<unknown> }).listSessions = () =>
    Promise.resolve([
      { header: { id: 'session-p', createdAt: NOW } },
      { header: { id: 'child-1', parentSession: 'session-p', delegationDepth: 1, createdAt: NOW } },
      { header: { id: 'grandchild-1', parentSession: 'child-1', delegationDepth: 2, createdAt: NOW } },
    ])
  const port = kernel(bundle)
  assert.deepEqual((await port.listSubagents!('session-p')).map((row) => row.id), ['child-1'])
  assert.deepEqual(
    (await port.listSubagents!('session-p', { descendants: true })).map((row) => row.id).sort(),
    ['child-1', 'grandchild-1'],
  )
})

test('listSubagents：catalog 在时没有 sessionQuery 也能列（不再要求全量列表）', async () => {
  const port = kernel(services({ withQuery: false }))
  const rows = await port.listSubagents!('session-p')
  assert.equal(rows.length, 2, 'catalog 直接给出成员，不需要 sessionQuery')
})

test('listSubagents：catalog 和 sessionQuery 都没有时明确抛错', async () => {
  const bundle = services({ withQuery: false })
  delete (bundle as Record<string, unknown>).subagents
  const port = kernel(bundle)
  await assert.rejects(() => port.listSubagents!('session-p'), /listSessions/)
})

test('listSubagents：没有子代理就是空数组（不抛）', async () => {
  const port = kernel(services())
  assert.deepEqual(await port.listSubagents!('other'), [])
})

test('listSubagents：catalog 明确回空数组时不再拉全量会话头（防止每刷新一次扫一遍全量）', async () => {
  const bundle = services()
  let scans = 0
  const query = bundle.sessionQuery as { listSessions: () => Promise<unknown> }
  const original = query.listSessions
  query.listSessions = () => {
    scans += 1
    return original()
  }
  const port = kernel(bundle)
  await port.listSubagents!('other')
  await port.listSubagents!('other')
  assert.equal(scans, 0, '投影说"没有子代理"就是没有，不要退回拉全量会话')
  // 反过来：catalog 方法整个缺失时该退回全量扫描（老宿主）
  const bundleNoCatalog = services()
  delete (bundleNoCatalog as Record<string, unknown>).subagents
  let fallbackScans = 0
  const q2 = bundleNoCatalog.sessionQuery as { listSessions: () => Promise<unknown> }
  const o2 = q2.listSessions
  q2.listSessions = () => {
    fallbackScans += 1
    return o2()
  }
  const port2 = kernel(bundleNoCatalog)
  await port2.listSubagents!('session-p')
  assert.equal(fallbackScans, 1, '没有 catalog 的宿主仍然要靠全量会话头找成员')
})

test('listSubagents：已归档的默认不下发，显式 includeArchived 才带 archived 标记并排在最后', async () => {
  const bundle = services()
  ;(bundle as Record<string, unknown>).workspaceRegistry = { archivedSessionIds: ['child-idle'] }
  const port = kernel(bundle)
  const byDefault = await port.listSubagents!('session-p')
  assert.deepEqual(byDefault.map((row) => row.id), ['child-run'], '归档的子代理默认就不该出现（手机端不用改就看不见）')
  const rows = await port.listSubagents!('session-p', { includeArchived: true })
  const idle = rows.find((row) => row.id === 'child-idle')!
  const run = rows.find((row) => row.id === 'child-run')!
  assert.equal(idle.archived, true, '归档了就要报出来，端上才能隐藏/标记')
  assert.equal(idle.status, 'idle', 'status 仍是 running|idle，不塞新枚举值（老客户端会认不出）')
  assert.equal(run.archived, undefined, '没归档的不带这个字段')
  assert.deepEqual(rows.map((row) => row.id), ['child-run', 'child-idle'], '归档的垫底')
})

test('listSubagents：archivedSessionIds 给成 Set 也要认（形状差异不能悄悄退回空表）', async () => {
  const bundle = services()
  ;(bundle as Record<string, unknown>).workspaceRegistry = { archivedSessionIds: new Set(['child-run']) }
  const port = kernel(bundle)
  const rows = await port.listSubagents!('session-p', { includeArchived: true })
  assert.equal(rows.find((row) => row.id === 'child-run')!.archived, true)
})

test('SSE 桥：总线变化写给订阅者，停机后不再写', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-subagents-bus-'))
  const written: string[] = []
  const fake = { write: (chunk: string) => void written.push(chunk), end: () => undefined } as never
  let handle: { stop(): void } | undefined
  try {
    handle = startSubagents({} as never, {
      dshHome: dir,
      list: async () => [],
      log: () => {},
    })
    streamClients.add(fake)
    emitSubagentChange()
    await new Promise((resolve) => setTimeout(resolve, 600))
    assert.ok(written.length > 0, 'emitSubagentChange 之后订阅者必须收到一条 SSE 数据')
    assert.match(written[0]!, /data: change/)
    handle.stop()
    const before = written.length
    emitSubagentChange()
    await new Promise((resolve) => setTimeout(resolve, 600))
    assert.equal(written.length, before, '停机后不许再往旧订阅者写')
  } finally {
    streamClients.delete(fake)
    try {
      handle?.stop()
    } catch {
      /* ignore */
    }
    rmSync(dir, { recursive: true, force: true })
  }
})


test('subagents config：阈值夹取、读写回环、坏 JSON 回落默认', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-subagents-cfg-'))
  const file = path.join(dir, 'subagents.json')
  try {
    const fallback = readSubagentsConfig(file)
    assert.equal(fallback.idleWarnMs, 2 * 60 * 60 * 1000, '缺文件时默认 2 小时')
    assert.equal(fallback.guidance, true)
    assert.equal(fallback.mode, 'foreman', '默认包工头模式')

    const written = writeSubagentsConfig(file, { idleWarnMs: 1000, guidance: false })
    assert.equal(written.idleWarnMs, 5 * 60 * 1000, '阈值低于 5 分钟要夹到下限')
    assert.equal(written.guidance, false)
    assert.equal(readSubagentsConfig(file).guidance, false, '写进去的要读得回来')

    writeSubagentsConfig(file, { idleWarnMs: 999 * 60 * 60 * 1000 })
    assert.equal(readSubagentsConfig(file).idleWarnMs, 7 * 24 * 60 * 60 * 1000, '超过 7 天夹到上限')

    writeFileSync(file, '{oops', 'utf8')
    assert.equal(readSubagentsConfig(file).idleWarnMs, 2 * 60 * 60 * 1000, '坏 JSON 绝不能抛，回落默认')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})


test('guidance pusher：逐个注入在线会话，单个失败不影响其它', async () => {
  const injected: Array<{ id?: unknown; content: Array<{ text: string }> }> = []
  const fakeAgents = {
    list: () => [
      { id: 'a', inject: (message: { id?: unknown; content: Array<{ text: string }> }) => void injected.push(message) },
      { id: 'b' }, // 没有 inject
      { id: 'c', inject: () => { throw new Error('boom') } },
    ],
  }
  const push = createGuidancePusher(() => fakeAgents)
  const result = await push('## 规范正文', '派活规范')
  assert.equal(result.total, 3)
  assert.equal(result.pushed, 1)
  assert.equal(result.failed, 2)
  assert.equal(injected.length, 1)
  assert.equal(typeof injected[0]!.id, 'string', '注入消息必须带 id（缺 id 会把会话历史写坏）')
  assert.ok(String(injected[0]!.id).length > 8, 'id 不能是空串')
  assert.match(injected[0]!.content[0]!.text, /系统推送/)
  assert.match(injected[0]!.content[0]!.text, /规范正文/)

  const second = await push('第二段', '再次推送')
  assert.equal(second.pushed, 1)
  assert.notEqual(injected[0]!.id, injected[1]!.id, '两次推送的 id 必须不同')
})

test('guidance pusher：agents 服务缺失时 total=0 不抛', async () => {
  const push = createGuidancePusher(() => undefined)
  const result = await push('x', 'y')
  assert.equal(result.total, 0)
  assert.equal(result.pushed, 0)
})

// ── 2026-11-12 性能优化：catalog 缓存 与 总线去重 ──────────────────────────────
//
// 背景（实测）：`subagents.listChildren()` 在"父会话没有活的子代理"时不会返回，
// 一路耗到 4000ms 超时，随后退回 `sessionQuery.listSessions()` 再耗最多 2000ms。
// 也就是**一次刷新 4~6 秒**，而它当时被 SSE 以 2.5 次/秒触发。下面几条钉住修复。

/** 可推进的时钟：TTL 相关的用例必须能控制"现在几点"。 */
function kernelWithClock(bundle: ServicesBundle, state: { now: number }) {
  const clock = {
    now: () => state.now,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
    clearTimeout: (handle: number) => clearTimeout(handle as unknown as NodeJS.Timeout),
  }
  return createServicesKernel(bundle, { clock, log: () => {} })
}

test('catalog 缓存：2 秒内重复刷新只打一次 listChildren（4 秒的超时不能每次都交）', async () => {
  const bundle = services()
  const inner = (bundle as unknown as { subagents: { listChildren: (id: string) => Promise<unknown> } }).subagents
  let calls = 0
  const raw = inner.listChildren.bind(inner)
  inner.listChildren = (id: string) => {
    calls += 1
    return raw(id)
  }
  const state = { now: NOW }
  const port = kernelWithClock(bundle, state)

  await port.listSubagents!('session-p')
  assert.equal(calls, 1, '第一次必须真的去问 catalog')

  state.now += 500
  await port.listSubagents!('session-p')
  assert.equal(calls, 1, '2 秒内是缓存窗口，不该再问一次')

  state.now += 3_000
  await port.listSubagents!('session-p')
  assert.equal(calls, 2, '过期之后必须重新取，否则新建的子代理永远不出现')
})

test('catalog 失败要退避 30 秒：一次超时不许变成每次刷新都超时', async () => {
  const bundle = services({ withQuery: false })
  const inner = (bundle as unknown as { subagents: Record<string, unknown> }).subagents
  let calls = 0
  inner.listChildren = () => {
    calls += 1
    return Promise.reject(new Error('listChildren 超时'))
  }
  const state = { now: NOW }
  const port = kernelWithClock(bundle, state)

  await port.listSubagents!('session-p').catch(() => undefined)
  assert.equal(calls, 1)

  state.now += 1_000
  await port.listSubagents!('session-p').catch(() => undefined)
  assert.equal(calls, 1, '失败结果要缓存 30 秒：这条路径每次都要 4 秒，不能 2 秒就重试')

  state.now += 40_000
  await port.listSubagents!('session-p').catch(() => undefined)
  assert.equal(calls, 2, '退避期过了才许再试一次')
})

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

test('总线：相同载荷不发第二帧（没变化就不推，这是 dsh-agent-team 的核心纪律）', async () => {
  resetSubagentBusState()
  setSubagentBusGate(() => true)
  const seen: string[] = []
  const listener = (payload: string): void => void seen.push(payload)
  subagentBus.on('change', listener)
  try {
    emitSubagentChange('{"s":{"p":[1,0]}}')
    await settle(600)
    emitSubagentChange('{"s":{"p":[1,0]}}')
    await settle(600)
    assert.deepEqual(seen, ['{"s":{"p":[1,0]}}'], '状态没变就不该再唤醒客户端')
  } finally {
    subagentBus.removeListener('change', listener)
    resetSubagentBusGate()
    resetSubagentBusState()
  }
})

test('总线：窗口内合并成最后一帧（中间态可以丢，最后态不能丢）', async () => {
  resetSubagentBusState()
  setSubagentBusGate(() => true)
  const seen: string[] = []
  const listener = (payload: string): void => void seen.push(payload)
  subagentBus.on('change', listener)
  try {
    emitSubagentChange('{"s":{"p":[1,0]}}')
    emitSubagentChange('{"s":{"p":[2,0]}}')
    emitSubagentChange('{"s":{"p":[3,0]}}')
    await settle(600)
    assert.deepEqual(seen, ['{"s":{"p":[3,0]}}'], '只发最后一次；发中间态会让界面停在旧值')
  } finally {
    subagentBus.removeListener('change', listener)
    resetSubagentBusGate()
    resetSubagentBusState()
  }
})

test('总线：一条 SSE 连接都没有时连定时器都不排', async () => {
  resetSubagentBusState()
  setSubagentBusGate(() => false)
  const seen: string[] = []
  const listener = (payload: string): void => void seen.push(payload)
  subagentBus.on('change', listener)
  try {
    emitSubagentChange('{"s":{"p":[1,0]}}')
    await settle(600)
    assert.equal(seen.length, 0, '没人在听就别干活')
  } finally {
    subagentBus.removeListener('change', listener)
    resetSubagentBusGate()
    resetSubagentBusState()
  }
})
