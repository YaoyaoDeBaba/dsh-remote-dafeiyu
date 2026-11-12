/**
 * subagents-archive.test —— 包工头的「主动归档」能力。
 *
 * 两件事必须钉住：
 * 1. 提示词里真的写了触发点和判据（否则模型不知道什么时候该清点）；
 * 2. 工具真的能归档、能批量、失败要逐条报原因（否则"归档了但没人知道没成功"）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FOREMAN_GUIDANCE, HANDS_ON_GUIDANCE } from '../src/subagents/guidance.js'
import { buildSubagentTools } from '../src/subagents/tools.js'

type ToolDef = {
  name: string
  description: string
  parameters: { properties: Record<string, unknown>; required?: string[] }
  execute: (args: unknown) => Promise<string>
}

function toolOf(defs: Array<Record<string, unknown>>): ToolDef {
  const found = defs.find((d) => d.name === 'subagent_archive')
  assert.ok(found, '必须注册 subagent_archive 工具')
  return found as unknown as ToolDef
}

const noop = (): void => undefined

test('包工头提示词写清了两个触发点与归档判据', () => {
  for (const token of ['list_agents', 'subagent_archive', '收到子代理的返回', '派出新的子代理', '不该归档', '载入历史']) {
    assert.ok(FOREMAN_GUIDANCE.includes(token), `包工头提示词缺少 ${token}`)
  }
})

test('亲力亲为模式也提一句归档（不然闲置子代理没人收）', () => {
  assert.ok(HANDS_ON_GUIDANCE.includes('subagent_archive'))
})

test('没有归档能力时不注册工具（宁可没有，也不给一个必然失败的工具）', () => {
  assert.deepEqual(buildSubagentTools({ log: noop }), [])
})

test('批量归档：逐条调内核、去重、空 id 自动跳过', async () => {
  const calls: Array<{ id: string; archived: boolean }> = []
  const tools = buildSubagentTools({
    log: noop,
    archive: async (id, archived) => {
      calls.push({ id, archived })
      return { ok: true }
    },
  })
  const tool = toolOf(tools)
  const raw = await tool.execute({ ids: ['a', 'b', 'a', '  ', ''], reason: '这轮验收完了' })
  const result = JSON.parse(raw) as { ok: boolean; done: string[]; action: string }
  assert.equal(result.ok, true)
  assert.deepEqual(result.done, ['a', 'b'], '重复与空字符串要被剔掉')
  assert.deepEqual(calls, [
    { id: 'a', archived: true },
    { id: 'b', archived: true },
  ])
})

test('单条失败不拖垮整批，且原因要能照做', async () => {
  const tools = buildSubagentTools({
    log: noop,
    archive: async (id) => {
      if (id === 'running-one') return { ok: false, message: 'session is running' }
      return { ok: true }
    },
  })
  const tool = toolOf(tools)
  const result = JSON.parse(await tool.execute({ ids: ['ok-one', 'running-one'] })) as {
    ok: boolean
    done: string[]
    failed: Array<{ id: string; error: string }>
  }
  assert.equal(result.ok, false)
  assert.deepEqual(result.done, ['ok-one'])
  assert.equal(result.failed[0]!.id, 'running-one')
  assert.match(result.failed[0]!.error, /还在跑/)
})

test('内核抛异常也要变成逐条失败，而不是把工具调用炸掉', async () => {
  const tools = buildSubagentTools({
    log: noop,
    archive: async () => {
      throw new Error('boom')
    },
  })
  const tool = toolOf(tools)
  const result = JSON.parse(await tool.execute({ ids: ['x'] })) as { ok: boolean; failed: Array<{ error: string }> }
  assert.equal(result.ok, false)
  assert.match(result.failed[0]!.error, /boom/)
})

test('unarchive:true 走取消归档（误收了要能放回来）', async () => {
  const calls: Array<{ id: string; archived: boolean }> = []
  const tools = buildSubagentTools({
    log: noop,
    archive: async (id, archived) => {
      calls.push({ id, archived })
      return { ok: true }
    },
  })
  const tool = toolOf(tools)
  const result = JSON.parse(await tool.execute({ ids: ['a'], unarchive: true })) as { action: string }
  assert.equal(result.action, 'unarchive')
  assert.deepEqual(calls, [{ id: 'a', archived: false }])
})

test('ids 为空时给出可照做的报错，而不是静默成功', async () => {
  const tools = buildSubagentTools({ log: noop, archive: async () => ({ ok: true }) })
  const tool = toolOf(tools)
  const result = JSON.parse(await tool.execute({ ids: [] })) as { ok: boolean; error: string }
  assert.equal(result.ok, false)
  assert.match(result.error, /list_agents/)
})
