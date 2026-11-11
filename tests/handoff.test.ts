/**
 * handoff.test — 「一键转生 / 一键分身」的判据。
 *
 * 这一层钉的是**四步的每一步都不能静默**：
 *   ① 注入的写作指令必须点名文件路径 + 固定标记（否则插件永远等不到）；
 *   ② 分身没写分支任务必须当场拒绝（不然分身不知道该去干什么）；
 *   ③ 交接文档没落盘就**绝不**建新会话（多一条空会话比一次失败更难解释）；
 *   ④ 首句必须是「报到 → 停」，不是「开工」。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  HANDOFF_MARKER,
  buildFirstPrompt,
  buildInjection,
  handoffFileName,
  type HandoffPlan,
} from '../src/handoff/prompt.js'
import { createHandoffService, type HandoffDeps } from '../src/handoff/service.js'
import {
  HANDOFF_SELF_ROUTE,
  HANDOFF_START_ROUTE,
  HANDOFF_STATUS_ROUTE,
  handoffSelfHandler,
  handoffStartHandler,
  handoffStatusHandler,
  type HandoffRouteDeps,
} from '../src/handoff/routes.js'

const PLAN: HandoffPlan = { kind: 'rebirth', filePath: 'D:\\dafeiyu-market\\handoff\\转生-abc-20261111-170000.md' }

interface Reply {
  status: number
  body: string
}

function response(): { res: ServerResponse; reply: () => Reply } {
  const captured: Reply = { status: 0, body: '' }
  const res = {
    writeHead(status: number) {
      captured.status = status
      return res
    },
    end(chunk?: unknown) {
      captured.body = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : ''
      return res
    },
  } as unknown as ServerResponse
  return { res, reply: () => captured }
}

function request(method: string, headers: Record<string, string> = {}, url = '/', body?: string): IncomingMessage {
  const stream = new PassThrough()
  const req = stream as unknown as IncomingMessage & { method?: string; url?: string; headers?: unknown }
  Object.assign(req, { method, url, headers })
  // 路由在 attach 监听之后才收数据：写到下一个 tick，避免监听器还没挂上就 end。
  setTimeout(() => {
    if (body !== undefined) stream.write(Buffer.from(body, 'utf8'))
    stream.end()
  }, 0)
  return req
}

const LOOPBACK = { host: '127.0.0.1:19387', 'x-drc-pair': '1' }

function fakeDeps(over: Partial<HandoffDeps> = {}) {
  const calls = {
    injected: [] as Array<{ sessionId: string; text: string }>,
    created: [] as Array<{ workspace?: string }>,
    prompts: [] as Array<{ sessionId: string; text: string }>,
  }
  const deps: HandoffDeps = {
    handoffDir: 'D:\\dafeiyu-market\\handoff',
    dshHome: 'C:\\Users\\x\\.dsh',
    log: () => {},
    inject: (sessionId, text) => {
      calls.injected.push({ sessionId, text })
      return { ok: true }
    },
    newSession: async (args) => {
      calls.created.push(args)
      return { ok: true, sessionId: 'session-new-1' }
    },
    sendPrompt: async (sessionId, text) => {
      calls.prompts.push({ sessionId, text })
      return { ok: true }
    },
    sessionCwd: async () => 'C:\\work\\proj',
    pollMs: 5,
    timeoutMs: 400,
    ...over,
  }
  return { deps, calls }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test('注入指令：点名文件路径与固定标记，转生强调「已完成不要重做」', () => {
  const text = buildInjection(PLAN)
  assert.ok(text.includes(PLAN.filePath), '必须给出绝对路径，模型照抄')
  assert.ok(text.includes(HANDOFF_MARKER), '必须约定完成标记，否则插件只能等超时')
  assert.ok(text.includes('## 已完成（不要重做）'), '接手者最容易犯的错是把干完的活重干一遍')
  assert.ok(text.includes('record_memory'), '顺手写长期记忆是这套流程的一半价值')
})

test('注入指令：分身必须把用户原文与边界原样带进去', () => {
  const text = buildInjection({
    kind: 'branch',
    filePath: 'D:\\h\\分身-x.md',
    note: '把远控的断线重连改成指数退避',
    boundary: '不要碰 src/client.js',
  })
  assert.ok(text.includes('把远控的断线重连改成指数退避'), '分支任务必须原文进指令')
  assert.ok(text.includes('不要碰 src/client.js'), '边界必须原文进指令')
  assert.ok(text.includes('## 边界（不要碰的东西）'))
})

test('首句：只报到，不开工', () => {
  const text = buildFirstPrompt(PLAN)
  assert.ok(text.includes(PLAN.filePath))
  assert.match(text, /报到/)
  assert.match(text, /不要修改任何文件/)
  assert.ok(!/直接开工[\s\S]*不要报到/.test(text))
})

test('文件名：带种类前缀、会话短 id、时间戳，两个种类不撞名', () => {
  const at = new Date(2026, 10, 11, 17, 0, 0)
  const a = handoffFileName('rebirth', 'session-0055168b-b31c', at)
  const b = handoffFileName('branch', 'session-0055168b-b31c', at)
  assert.match(a, /^转生-0055168b-20261111-170000\.md$/)
  assert.match(b, /^分身-0055168b-20261111-170000\.md$/)
})

test('作业：交接文档落盘后才建会话，并把首句发进去', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-handoff-'))
  try {
    const { deps, calls } = fakeDeps({ handoffDir: dir })
    const service = createHandoffService(deps)
    const started = await service.start('rebirth', 'session-abc')
    assert.equal(started.ok, true)
    const jobId = started.jobId!
    assert.equal(calls.injected.length, 1, '先注入写作指令')
    const job0 = service.status(jobId)!
    assert.equal(job0.status, 'waiting')
    assert.equal(calls.created.length, 0, '交接还没写就建会话 = 多一条空会话')

    writeFileSync(job0.filePath, `## 目标\n做完了不少事\n\n${HANDOFF_MARKER}: ${job0.filePath}\n`, 'utf8')
    await wait(120)
    const job = service.status(jobId)!
    assert.equal(job.status, 'done', String(job.message ?? ''))
    assert.equal(calls.created.length, 1)
    assert.equal(calls.created[0]!.workspace, 'C:\\work\\proj', '新会话必须落回当前会话的目录，否则 GUI 列表里看不见')
    assert.equal(calls.prompts.length, 1)
    assert.ok(calls.prompts[0]!.text.includes(job.filePath))
    assert.equal(job.newSessionId, 'session-new-1')
    service.stop()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('作业：等不到交接文档就失败，且绝不建会话', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-handoff-'))
  try {
    const { deps, calls } = fakeDeps({ handoffDir: dir, timeoutMs: 80 })
    const service = createHandoffService(deps)
    const started = await service.start('rebirth', 'session-abc')
    await wait(200)
    const job = service.status(started.jobId!)!
    assert.equal(job.status, 'failed')
    assert.match(String(job.message), /还没等到交接文档/)
    assert.equal(calls.created.length, 0, '失败绝不能留一条空会话')
    service.stop()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('作业：分身缺分支任务当场拒绝，不注入也不建作业', async () => {
  const { deps, calls } = fakeDeps()
  const service = createHandoffService(deps)
  const started = await service.start('branch', 'session-abc', '   ')
  assert.equal(started.ok, false)
  assert.match(String(started.message), /分支任务/)
  assert.equal(calls.injected.length, 0)
  service.stop()
})

test('作业：注入失败要说清楚（会话不在线），不留等待中的僵尸作业', async () => {
  const { deps } = fakeDeps({ inject: () => ({ ok: false, message: '这个会话现在没有活着的 agent' }) })
  const service = createHandoffService(deps)
  const started = await service.start('rebirth', 'session-abc')
  assert.equal(started.ok, false)
  assert.match(String(started.message), /没有活着的 agent/)
  assert.equal(service.list().length, 0)
  service.stop()
})

test('作业：首句发不出去时，状态要说明"会话已建但首句没发成"', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-handoff-'))
  try {
    const { deps, calls } = fakeDeps({
      handoffDir: dir,
      sendPrompt: async () => ({ ok: false, message: '会话不在线' }),
    })
    const service = createHandoffService(deps)
    const started = await service.start('rebirth', 'session-abc')
    const job0 = service.status(started.jobId!)!
    writeFileSync(job0.filePath, `# 交接\n${HANDOFF_MARKER}\n`, 'utf8')
    await wait(120)
    const job = service.status(started.jobId!)!
    assert.equal(job.status, 'failed')
    assert.match(String(job.message), /首句没发出去/)
    assert.equal(calls.created.length, 1, '会话已经建了，不假装没建')
    assert.equal(job.newSessionId, 'session-new-1')
    service.stop()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

function routeDeps(over: Partial<HandoffRouteDeps> = {}): HandoffRouteDeps {
  return {
    start: async () => ({ ok: true, jobId: 'job-1' }),
    status: () => undefined,
    list: () => [],
    selfCheck: (sessionId, cwd) => ({
      ok: true,
      handoffDir: 'D:\\h',
      handoffDirReady: true,
      sessionId,
      ...(cwd ? { cwd } : {}),
      logBytes: 42,
      overloadBytes: 15 * 1024 * 1024,
      overloaded: false,
      memoryEntries: 3,
    }),
    sessionCwd: async () => 'C:\\work\\proj',
    log: () => {},
    ...over,
  }
}

test('路由：写操作缺 x-drc-pair 一律 403（跨站判据不能只靠 Origin）', async () => {
  const handler = handoffStartHandler(routeDeps())
  const { res, reply } = response()
  await handler(request('POST', { host: '127.0.0.1:19387' }, HANDOFF_START_ROUTE, '{"kind":"rebirth","sessionId":"s1"}'), res)
  assert.equal(reply().status, 403)
  assert.match(reply().body, /x-drc-pair/)
})

test('路由：start 把 kind/note/boundary 传下去；非 branch 的 kind 只可能是 rebirth', async () => {
  const seen: Array<{ kind: string; sessionId: string; note?: string; boundary?: string }> = []
  const handler = handoffStartHandler(
    routeDeps({
      start: async (kind, sessionId, note, boundary) => {
        seen.push({ kind, sessionId, note, boundary })
        return { ok: true, jobId: 'job-1' }
      },
    }),
  )
  const { res, reply } = response()
  await handler(
    request('POST', LOOPBACK, HANDOFF_START_ROUTE, JSON.stringify({ kind: 'branch', sessionId: 's1', note: '干活', boundary: '别碰 x' })),
    res,
  )
  assert.equal(reply().status, 200)
  assert.deepEqual(seen[0], { kind: 'branch', sessionId: 's1', note: '干活', boundary: '别碰 x' })

  const { res: res2, reply: reply2 } = response()
  await handoffStartHandler(routeDeps())(request('POST', LOOPBACK, HANDOFF_START_ROUTE, '{"kind":"??","sessionId":"s1"}'), res2)
  assert.equal(reply2().status, 200, '认不出的 kind 退回 rebirth，不该 500')
})

test('路由：start 失败回 400 并把原因带给面板', async () => {
  const handler = handoffStartHandler(
    routeDeps({ start: async () => ({ ok: false, message: '分身必须写清楚分支任务' }) }),
  )
  const { res, reply } = response()
  await handler(request('POST', LOOPBACK, HANDOFF_START_ROUTE, '{"kind":"branch","sessionId":"s1"}'), res)
  assert.equal(reply().status, 400)
  assert.match(reply().body, /分支任务/)
})

test('路由：self 回自检数据；status 没 jobId 时回最近列表', async () => {
  const { res, reply } = response()
  await handoffSelfHandler(routeDeps())(request('GET', { host: '127.0.0.1:19387' }, `${HANDOFF_SELF_ROUTE}?sessionId=session-1`), res)
  assert.equal(reply().status, 200)
  const self = JSON.parse(reply().body) as { ok: boolean; cwd?: string; overloaded: boolean }
  assert.equal(self.ok, true)
  assert.equal(self.cwd, 'C:\\work\\proj')

  const { res: res2, reply: reply2 } = response()
  handoffStatusHandler(routeDeps())(request('GET', { host: '127.0.0.1:19387' }, HANDOFF_STATUS_ROUTE), res2)
  assert.equal(reply2().status, 200)
  assert.match(reply2().body, /jobs/)

  // 只读路由的 Host 判据同样生效：非环回一律 403（Origin 缺席可以放过，Host 不行）
  const { res: res3, reply: reply3 } = response()
  await handoffSelfHandler(routeDeps())(request('GET', { host: 'evil.example.com' }, `${HANDOFF_SELF_ROUTE}?sessionId=s1`), res3)
  assert.equal(reply3().status, 403)
})
