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

const NOW = 1_800_000_000_000

function services(options: { withQuery?: boolean; running?: string[] } = {}): ServicesBundle {
  const running = new Set(options.running ?? ['child-run'])
  const bundle: Record<string, unknown> = {
    agents: {
      get: (id: string) => (running.has(id) ? { status: 'running' } : { status: 'idle' }),
    },
    subagents: {
      listChildren: () =>
        Promise.resolve([
          { id: 'child-run', label: '渲染合批｜升级 VFX 批次合并并跑通验收' },
          { id: 'child-idle', label: '没按格式写的名字' },
        ]),
      listDescendants: () =>
        Promise.resolve([
          { id: 'child-run', label: '渲染合批｜升级 VFX 批次合并并跑通验收' },
          { id: 'child-idle', label: '没按格式写的名字' },
          { id: 'grandchild-1', label: '孙子｜第三层' },
        ]),
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
  assert.equal(Math.round(run.workMs / 1000), 470 + 60, '工作时间 = turn 时间差，含当前未结束回合')
  assert.equal(Math.round(run.idleMs / 1000), 60, '闲置 = 现在 − 最后一条事件')
  assert.equal(Math.round(idle.workMs / 1000), 590, '空闲子代理用日志里的回合差')
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


test('subagents config：阈值夹取、读写回环、坏 JSON 回落默认', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-subagents-cfg-'))
  const file = path.join(dir, 'subagents.json')
  try {
    const fallback = readSubagentsConfig(file)
    assert.equal(fallback.idleWarnMs, 2 * 60 * 60 * 1000, '缺文件时默认 2 小时')
    assert.equal(fallback.guidance, true)

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
  const injected: string[] = []
  const fakeAgents = {
    list: () => [
      { id: 'a', inject: (message: { content: Array<{ text: string }> }) => void injected.push(message.content[0]!.text) },
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
  assert.match(injected[0]!, /系统推送/)
  assert.match(injected[0]!, /规范正文/)
})

test('guidance pusher：agents 服务缺失时 total=0 不抛', async () => {
  const push = createGuidancePusher(() => undefined)
  const result = await push('x', 'y')
  assert.equal(result.total, 0)
  assert.equal(result.pushed, 0)
})
