/**
 * subagents-archive-route.test —— 归档写路由的「失败必须显形」。
 *
 * ## 这条为什么存在（2026-11-13）
 *
 * 用户点「归档」没反应。日志里的真相是一条链路断成了三截：
 *
 * 1. 路由失败回 **207** 但**顶层没有 `message`**、一行日志都不写
 *    （`src/subagents/routes.ts` 那段 `json(response, failed === 0 ? 200 : 207, { ok, results })`）；
 * 2. 客户端只读 `answer.message`（`client/subagent-panel.ts` 的 `new Error(answer.message || '归档失败')`），
 *    而精确原因在 `results[0].message` —— 从那以后**再没人读过它**；
 * 3. 宿主日志里也查不到：既没有"哪一条失败了"，也没有内核的原话。
 *
 * 也就是说，一件"失败了"的事，在三处都长得像"什么都没发生"。
 * 这里钉住前两处（第三处靠 client 侧的 `results[].message` 兜底，见 subagent-panel.ts）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { subagentsArchiveHandler, type SubagentRouteDeps } from '../src/subagents/routes.js'
import type { SubagentsConfig } from '../src/subagents/config.js'

const CONFIG: SubagentsConfig = {
  version: 1,
  enabled: true,
  guidance: true,
  idleWarnMs: 2 * 60 * 60 * 1000,
  mode: 'foreman',
}
const HEADERS = { host: '127.0.0.1:19387', 'x-drc-pair': '1' }

/** 假请求：只带这一层真正读的几个字段（method / headers / on）。 */
function request(headers: Record<string, string> = HEADERS, body = ''): IncomingMessage {
  const listeners = new Map<string, Array<(chunk?: unknown) => void>>()
  const req = {
    method: 'POST',
    url: '/',
    headers,
    on: (event: string, handler: (chunk?: unknown) => void) => {
      const list = listeners.get(event) ?? []
      list.push(handler)
      listeners.set(event, list)
      return req
    },
  } as unknown as IncomingMessage
  queueMicrotask(() => {
    for (const handler of listeners.get('data') ?? []) handler(Buffer.from(body))
    for (const handler of listeners.get('end') ?? []) handler()
  })
  return req
}

function response(): {
  res: ServerResponse
  reply: () => { status: number; body: string }
} {
  let status = 0
  let body = ''
  const res = {
    writeHead: (code: number) => {
      status = code
    },
    end: (chunk?: unknown) => {
      body = typeof chunk === 'string' ? chunk : ''
    },
    setHeader: () => undefined,
  } as unknown as ServerResponse
  return { res, reply: () => ({ status, body }) }
}

function deps(
  archive: SubagentRouteDeps['archive'],
): SubagentRouteDeps & { logs: Array<{ message: string; fields?: Record<string, unknown> }> } {
  const logs: Array<{ message: string; fields?: Record<string, unknown> }> = []
  return {
    list: async () => [],
    archive,
    config: { read: () => CONFIG, write: () => CONFIG },
    log: (message, fields) => void logs.push({ message, fields: fields as Record<string, unknown> | undefined }),
    logs,
  }
}

test('归档失败：207 里要有**顶层 message**，并写一行中文日志（否则用户只看到"没反应"）', async () => {
  const d = deps(async (sessionId) => {
    if (sessionId === 'agent-1') {
      return { ok: false, message: "cannot archive session 'agent-1': hold no such session" }
    }
    return { ok: true }
  })
  const { res, reply } = response()
  await subagentsArchiveHandler(d)(request(HEADERS, JSON.stringify({ ids: ['ok-one', 'agent-1'] })), res)
  const got = reply()
  assert.equal(got.status, 207, '部分失败仍然是 207')
  const answer = JSON.parse(got.body) as {
    ok: boolean
    message?: string
    results: Array<{ sessionId: string; ok: boolean; message?: string }>
  }
  assert.equal(answer.ok, false)
  assert.equal(typeof answer.message, 'string', '顶层必须有 message：客户端只读这一格')
  assert.match(String(answer.message), /1\/2/, '要说清成功几个、失败几个')
  assert.match(String(answer.message), /hold no such session/, '顶层 message 里要带内核的原话（否则还是不知道为啥）')
  assert.equal(answer.results[0]!.ok, true)
  assert.equal(answer.results[1]!.ok, false)
  assert.match(String(answer.results[1]!.message), /hold no such session/, '逐条结果里的原因照旧保留')

  const failure = d.logs.find((row) => row.message === '子代理归档失败')
  assert.ok(failure, '必须写一行日志：宿主日志是唯一能事后复查的地方')
  assert.equal(failure.fields?.sessionId, 'agent-1', '日志里要能看出是哪一条失败了')
  assert.match(String(failure.fields?.message), /hold no such session/, '日志要带内核原话')
  assert.equal(d.logs.filter((row) => row.message === '子代理归档失败').length, 1, '成功的那条不该刷一条失败日志')
})

test('归档全部成功：200、ok:true，且不带 message 键（别让客户端误判成失败）', async () => {
  const d = deps(async () => ({ ok: true }))
  const { res, reply } = response()
  await subagentsArchiveHandler(d)(request(HEADERS, JSON.stringify({ ids: ['a', 'b'] })), res)
  const got = reply()
  assert.equal(got.status, 200)
  const answer = JSON.parse(got.body) as Record<string, unknown>
  assert.equal(answer.ok, true)
  assert.equal('message' in answer, false, '成功时不带 message：客户端按 ok 判，别多一个字段')
  assert.equal(d.logs.length, 0, '成功路径不写失败日志')
})

test('归档抛异常：也要变成该条的 message（不是整条路由 500 把原因吞掉）', async () => {
  const d = deps(async () => {
    throw new Error('kernel exploded')
  })
  const { res, reply } = response()
  await subagentsArchiveHandler(d)(request(HEADERS, JSON.stringify({ sessionId: 'x' })), res)
  const got = reply()
  assert.equal(got.status, 207)
  const answer = JSON.parse(got.body) as { message?: string; results: Array<{ message?: string }> }
  assert.match(String(answer.message ?? ''), /kernel exploded/)
  assert.match(String(answer.results[0]!.message ?? ''), /kernel exploded/)
})
