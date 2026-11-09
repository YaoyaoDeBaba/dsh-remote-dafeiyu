/**
 * subagents.test — 子代理监视器的数据层（`KernelPort.listSubagents`）。
 *
 * 这一层钉的是"监视器上那些数从哪来、缺数据时怎么降级"：
 * 成员关系 = 子会话头里的 `parentSession`；运行态 = `agents.get()`；
 * 任务 = 子会话日志第一条用户消息；工作时间 = `turn/start..turn/end` 时间差之和；
 * 闲置 = 现在 − 最后一条事件时间。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServicesKernel, type ServicesBundle } from '../src/platform/carrier-services.js'

const NOW = 1_800_000_000_000

function services(options: { withQuery?: boolean; running?: string[] } = {}): ServicesBundle {
  const running = new Set(options.running ?? ['child-run'])
  const bundle: Record<string, unknown> = {
    agents: {
      get: (id: string) => (running.has(id) ? { status: 'running' } : { status: 'idle' }),
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

test('listSubagents：任务/标题/工作时长/闲置时长都从真数据来', async () => {
  const port = kernel(services())
  const rows = await port.listSubagents!('session-p')
  const run = rows.find((row) => row.id === 'child-run')!
  const idle = rows.find((row) => row.id === 'child-idle')!
  assert.equal(run.task, '把 E:\\a.cs 的循环改成 for', '任务取子会话日志第一条用户消息')
  assert.equal(run.title, '标题 child-run')
  // 两个已完成回合（470s）+ 当前未结束回合（60s）
  assert.equal(Math.round(run.workMs / 1000), 470 + 60, '工作时间 = turn 时间差，含当前未结束回合')
  assert.equal(Math.round(run.idleMs / 1000), 60, '闲置 = 现在 − 最后一条事件')
  assert.equal(Math.round(idle.workMs / 1000), 590, '空闲子代理用日志里的回合差（插件重启后也有数）')
  assert.equal(Math.round(idle.idleMs / 1000), 3_000_000 / 1000, '闲置 = 现在 − 最后一条事件')
})

test('listSubagents：descendants=true 才递归，默认只一层', async () => {
  const bundle = services()
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

test('listSubagents：没有 sessionQuery 能力时明确抛错，不回空数组', async () => {
  const port = kernel(services({ withQuery: false }))
  await assert.rejects(() => port.listSubagents!('session-p'), /listSessions/)
})

test('listSubagents：没有子代理就是空数组（不抛）', async () => {
  const port = kernel(services())
  assert.deepEqual(await port.listSubagents!('other'), [])
})
