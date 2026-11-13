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

// ── 2026-11-13：「母体收不掉」那次事故 ────────────────────────────────────────
//
// `list_agents` 显示的是**名字/路径**（内核 `list-agents.ts` 用 `entry.path ?? entry.id`），
// 而工具描述原来写"ids 就是 list_agents 里显示的那个 id"⇒ 模型把 `agent-1` 当 id 传
// ⇒ 内核回 `cannot archive session 'agent-1': … hold no such session`。
// 日志实证：同一次批量归档 9 个 UUID 成功、7 个名字全灭。
// 下面五条钉住：描述要写清两条都认、名字要能换成真 id、换不成就得说"这是名字不是 id"。

test('工具描述写清「名字/路径也认」，并提示 one-shot 只能去面板收', () => {
  const tool = toolOf(buildSubagentTools({ log: noop, archive: async () => ({ ok: true }) }))
  const ids = tool.parameters.properties['ids'] as { description?: string } | undefined
  const text = String(ids?.description ?? '')
  assert.ok(text !== '', 'ids 必须有描述：这个字段写错，模型就会把名字当 id')
  assert.match(text, /名字/, '要写明可以给 list_agents 里显示的名字/路径')
  assert.match(text, /UUID/, '也要写明 UUID 照收')
  assert.match(text, /one-shot/, '面板里有、内核列表里没有的那类要指去面板')
})

test('名字当 id：内核说没有这条会话时，文案必须说「这是名字不是 id」', async () => {
  const tools = buildSubagentTools({
    log: noop,
    archive: async () => ({
      ok: false,
      message: "cannot archive session 'agent-1': this client and session store hold no such session",
    }),
  })
  const tool = toolOf(tools)
  const result = JSON.parse(await tool.execute({ ids: ['agent-1'] })) as {
    ok: boolean
    failed: Array<{ id: string; error: string }>
    note: string
  }
  assert.equal(result.ok, false)
  assert.equal(result.failed[0]!.id, 'agent-1')
  assert.match(result.failed[0]!.error, /这是名字不是 id/, '必须点明"名字不是 id"，否则模型会继续重试同一个名字')
  assert.match(result.failed[0]!.error, /UUID/, '还要告诉它改用 UUID')
  assert.match(result.note, /one-shot/, '面板里有、内核列表里没有的那类要指去面板')
})

test('名字当 id：有 resolveName 时先归档，报"没这条会话"就换成真 id 再试一次', async () => {
  const archivedCalls: string[] = []
  const resolveCalls: Array<{ agent: unknown; name: string; signal?: AbortSignal }> = []
  const tools = buildSubagentTools({
    log: noop,
    archive: async (id) => {
      archivedCalls.push(id)
      if (id === 'agent-1') return { ok: false, message: "hold no such session: 'agent-1'" }
      return { ok: true }
    },
    resolveName: async (agent, name, signal) => {
      resolveCalls.push({ agent, name, signal })
      return name === 'agent-1' ? 'ses-uuid-1' : undefined
    },
  })
  const tool = toolOf(tools)
  const signal = new AbortController().signal
  const agent = { id: 'lead' }
  const raw = await (tool.execute as unknown as (a: unknown, b: unknown) => Promise<string>)(
    { ids: ['agent-1'] },
    { agent, signal },
  )
  const result = JSON.parse(raw) as {
    ok: boolean
    done: string[]
    resolved: Array<{ given: string; id: string }>
    failed: unknown[]
  }
  assert.equal(result.ok, true, '换成 UUID 之后必须归档成功')
  assert.deepEqual(result.done, ['ses-uuid-1'], 'done 里给的是真 id')
  assert.deepEqual(result.resolved, [{ given: 'agent-1', id: 'ses-uuid-1' }], '要告诉模型"我替你换了个 id"')
  assert.deepEqual(archivedCalls, ['agent-1', 'ses-uuid-1'], '先按原值试，再按解析出来的 id 试')
  assert.deepEqual(resolveCalls.map((row) => row.name), ['agent-1'])
  assert.equal(resolveCalls[0]!.agent, agent, 'execute 的第二个参数（exec）必须真的用上：解析要按发起的 agent 来')
  assert.equal(resolveCalls[0]!.signal, signal, 'signal 也要传下去（这一轮取消时解析不该继续跑）')
})

test('名字解析不出来（resolveName 回 undefined）时，仍然要说「这是名字不是 id」', async () => {
  const tools = buildSubagentTools({
    log: noop,
    archive: async () => ({ ok: false, message: 'hold no such session' }),
    resolveName: async () => undefined,
  })
  const tool = toolOf(tools)
  const result = JSON.parse(
    await (tool.execute as unknown as (a: unknown, b: unknown) => Promise<string>)({ ids: ['agent-9'] }, { agent: {} }),
  ) as { ok: boolean; failed: Array<{ error: string }> }
  assert.equal(result.ok, false)
  assert.match(result.failed[0]!.error, /这是名字不是 id/)
  assert.match(result.failed[0]!.error, /UUID/)
})

test('UUID 照旧直通：解析器一次都不该被叫（别给正常路径加成本）', async () => {
  let resolved = 0
  const tools = buildSubagentTools({
    log: noop,
    archive: async () => ({ ok: true }),
    resolveName: async () => {
      resolved += 1
      return 'x'
    },
  })
  const tool = toolOf(tools)
  const result = JSON.parse(await tool.execute({ ids: ['ses-uuid-2'] })) as { ok: boolean; done: string[] }
  assert.equal(result.ok, true)
  assert.deepEqual(result.done, ['ses-uuid-2'])
  assert.equal(resolved, 0, '能按原值归档成功的，不要多问一次解析器')
})
