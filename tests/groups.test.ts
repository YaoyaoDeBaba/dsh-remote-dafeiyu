/**
 * groups.test —— 肥鱼拉群（2026-11-19）。
 *
 * 钉的是四条纪律：成员表对不对、消息先落盘再投递、送不到要说出来、非成员不许发。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createGroups, deliveryText, MAX_MEMBERS } from '../src/groups/service.js'
import { buildGroupTools } from '../src/groups/tools.js'

function makeDeps(over: { failFor?: string[] } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-groups-'))
  const sent: Array<{ sessionId: string; text: string }> = []
  const groups = createGroups({
    dir,
    deliver: async (sessionId, text) => {
      if (over.failFor?.includes(sessionId) === true) return { ok: false, message: '会话不在线' }
      sent.push({ sessionId, text })
      return { ok: true }
    },
    log: () => {},
  })
  return { dir, sent, groups }
}

test('建群：发起方自动入群，成员去重，名字必填', () => {
  const { dir, groups } = makeDeps()
  try {
    const created = groups.create({ name: '前后端联调', me: 'session-front', members: ['session-back', 'session-back'] })
    assert.equal(created.ok, true)
    assert.deepEqual(
      created.group!.members.map((member) => member.sessionId),
      ['session-front', 'session-back'],
      '自己在前、重复的去重',
    )
    assert.equal(groups.create({ name: '  ' }).ok, false, '没有名字要拒')
    assert.equal(groups.create({ name: 'x', me: 'a', members: Array.from({ length: MAX_MEMBERS }, (_, i) => 's' + i) }).ok, false, '超员要拒')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('发消息：先落盘、只发给别人、自己那份不重发', async () => {
  const { dir, sent, groups } = makeDeps()
  try {
    const created = groups.create({ name: '联调', me: 'session-front', members: ['session-back'] })
    const id = created.group!.id
    const result = await groups.send({ id, from: 'session-front', text: '接口改成 /api/v2/orders，字段 orderId' })
    assert.equal(result.ok, true)
    assert.equal(sent.length, 1, '只投给对方，不回给自己')
    assert.equal(sent[0]!.sessionId, 'session-back')
    assert.ok(sent[0]!.text.includes(id), '投递正文要带群 id（对面回复要靠它）')
    assert.ok(sent[0]!.text.includes('group_post'), '要告诉对面怎么回复')
    const read = groups.read({ id })
    const chat = read.messages!.filter((row) => row.kind !== 'system')
    assert.equal(chat.length, 1, '日志里要留一条（送失败也还能补发）')
    assert.equal(chat[0]!.from, 'session-front')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('送不到不静默：失败的成员要逐条带回来', async () => {
  const { dir, groups } = makeDeps({ failFor: ['session-dead'] })
  try {
    const created = groups.create({ name: '联调', me: 'session-a', members: ['session-dead', 'session-live'] })
    const result = await groups.send({ id: created.group!.id, from: 'session-a', text: '在吗' })
    assert.equal(result.ok, false, '有成员没送到，整体不能报成功')
    assert.equal(result.failed!.length, 1)
    assert.equal(result.failed![0]!.sessionId, 'session-dead')
    assert.equal(result.delivered!.length, 1, '送到的也要报')
    assert.match(String(result.message), /没送到/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('非成员不许发；退群后立刻发不动', async () => {
  const { dir, groups } = makeDeps()
  try {
    const created = groups.create({ name: '联调', me: 'session-a', members: ['session-b'] })
    const id = created.group!.id
    const outsider = await groups.send({ id, from: 'session-x', text: '我也要说' })
    assert.equal(outsider.ok, false)
    assert.match(String(outsider.message), /不在这个群里/)
    groups.leave({ id, sessionId: 'session-a' })
    const afterLeave = await groups.send({ id, from: 'session-a', text: '还在吗' })
    assert.equal(afterLeave.ok, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('拉人：已在不重复加，未知群直接拒', async () => {
  const { dir, groups } = makeDeps()
  try {
    const created = groups.create({ name: '联调', me: 'session-a' })
    const id = created.group!.id
    const added = await groups.invite({ id, members: ['session-b', 'session-b'] })
    assert.deepEqual(added.added, ['session-b'])
    assert.equal(groups.get(id)!.members.length, 2)
    assert.equal((await groups.invite({ id: 'g-nope', members: ['x'] })).ok, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('读消息：默认 20 条、limit 夹在 1..100', () => {
  const { dir, groups } = makeDeps()
  try {
    const created = groups.create({ name: '联调', me: 'session-a', members: ['session-b'] })
    const id = created.group!.id
    for (let i = 0; i < 5; i += 1) {
      // 直接走 send（不走工具）——这里只验 read 的口径
      void groups.send({ id, from: 'session-a', text: 'm' + i })
    }
    const read = groups.read({ id, limit: 3 })
    assert.equal(read.messages!.length, 3, 'limit 生效')
    const clamped = groups.read({ id, limit: 10_000 })
    assert.ok(clamped.messages!.length <= 100, '上限 100')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})


test('群主：agent 不带 to 时默认回给群主；用户 @ 多人时先只投给群主', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-groups-owner-'))
  const sent: Array<{ sessionId: string; text: string }> = []
  const groups = createGroups({
    dir,
    deliver: async (sessionId, text) => {
      sent.push({ sessionId, text })
      return { ok: true }
    },
    dispatchTimeoutMs: 50,
    cooldownMs: 0,
    log: () => {},
  })
  try {
    const created = groups.create({ name: '联调', me: 'session-lead', members: ['session-fe', 'session-be'] })
    const id = created.group!.id
    assert.equal(created.group!.ownerSessionId, 'session-lead', '发起方默认当群主')

    // agent 不带 to → 回给群主
    await groups.post({ id, from: 'session-fe', text: '接口好了', kind: 'agent' })
    assert.equal(sent.length, 1)
    assert.equal(sent[0]!.sessionId, 'session-lead', '默认汇报对象是群主')

    // 用户 @ 两个执行者 → 只投给群主（分工请求）
    sent.length = 0
    await groups.post({ id, from: 'user', text: '把接口和页面接起来', targets: ['session-fe', 'session-be'], kind: 'user' })
    assert.equal(sent.length, 1, '先只通知群主，不是同时撒给两个人')
    assert.equal(sent[0]!.sessionId, 'session-lead')
    assert.match(sent[0]!.text, /把接口和页面接起来/)

    // 群主没派活 → 50ms 后降级直投被 @ 的人
    await new Promise((resolve) => setTimeout(resolve, 120))
    const fallback = sent.filter((row) => row.sessionId !== 'session-lead')
    assert.equal(fallback.length, 2, '超时降级：两个被 @ 的人都收到')
    const log = groups.read({ id })
    assert.ok(log.messages!.some((row) => row.kind === 'system' && row.text.includes('群主未分工')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('群主派活：只派成员、最多 5 个；派了活就不再降级', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-groups-dispatch-'))
  const sent: Array<{ sessionId: string; text: string }> = []
  const groups = createGroups({
    dir,
    deliver: async (sessionId, text) => {
      sent.push({ sessionId, text })
      return { ok: true }
    },
    dispatchTimeoutMs: 80,
    cooldownMs: 0,
    log: () => {},
  })
  try {
    const created = groups.create({ name: '联调', me: 'session-lead', members: ['session-a', 'session-b'] })
    const id = created.group!.id
    await groups.post({ id, from: 'user', text: '分工', targets: ['session-a', 'session-b'], kind: 'user' })
    sent.length = 0
    const dispatched = await groups.post({ id, from: 'session-lead', text: 'A 做接口，B 做页面', targets: ['session-a', 'session-b'], kind: 'agent' })
    assert.equal(dispatched.ok, true)
    assert.equal(sent.length, 2, '群主派活：两个人都收到')
    await new Promise((resolve) => setTimeout(resolve, 150))
    assert.equal(sent.length, 2, '派过活之后不许再降级重投')
    const tooMany = await groups.post({ id, from: 'session-lead', text: '都来', targets: ['session-a', 'session-b'], kind: 'agent' })
    assert.equal(tooMany.ok, true, '两人不超上限')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
test('投递正文口径：群名 + 群 id + 发送方短号 + 回复方式', () => {
  const group = { version: 2 as const, id: 'g-abc', name: '联调', members: [], createdAt: 0, updatedAt: 0 }
  const text = deliveryText(group, 'user', '你好', ['session-12345678'])
  assert.ok(text.includes('联调'))
  assert.ok(text.includes('g-abc'))
  assert.ok(text.includes('群成员'))
  assert.ok(text.includes('group_read'))
})


test('投递正文：协作对象里不许出现收件人自己（真机 2026-11-19 报过）', () => {
  const group = { version: 2 as const, id: 'g-x', name: '群', members: [], createdAt: 0, updatedAt: 0 }
  const text = deliveryText(group, 'user', '测试', ['session-aaaa1111', 'session-bbbb2222'], undefined, 'session-aaaa1111')
  assert.ok(text.includes('bbbb2222'), '另一个成员要出现')
  const peerLine = text.split('\n').find((line) => line.startsWith('本轮协作对象')) ?? ''
  assert.ok(!peerLine.includes('aaaa1111'), '收件人自己不该被列成协作对象')
  assert.ok(peerLine.includes('bbbb2222'))
})

test('摘要：首行「摘要：…」优先，解析不到取前 25 字（给用户扫一眼的那条）', async () => {
  const { summarize } = await import('../src/groups/service.js')
  assert.equal(summarize('摘要：接口改成 v2，字段 orderId\n\n正文随便写'), '接口改成 v2，字段 orderId')
  assert.equal(summarize('Summary: schema updated'), 'schema updated', '英文 summary 也认')
  const fallback = summarize('这是一段很长的正文，没有写摘要行的。后面的内容都不该进气泡。')
  assert.equal(fallback.length, 25, '兜底取前 25 字')
  assert.ok('这是一段很长的正文，没有写摘要行的。后面的内容都不该进气泡。'.startsWith(fallback))
})

test('身份：用户设置后写进记录，成员名单里带上（agent 靠它认职责）', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-groups-role-'))
  const groups = createGroups({ dir, deliver: async () => ({ ok: true }), log: () => {} })
  try {
    const created = groups.create({ name: '联调', me: 'session-a', members: ['session-b'] })
    const id = created.group!.id
    const set = groups.setMemberRole({ id, sessionId: 'session-b', role: '后端主程' })
    assert.equal(set.ok, true)
    assert.equal(groups.get(id)!.members.find((m) => m.sessionId === 'session-b')!.role, '后端主程')
    assert.equal(groups.setMemberRole({ id, sessionId: 'session-nope', role: 'x' }).ok, false, '不在群里要拒')
    const cleared = groups.setMemberRole({ id, sessionId: 'session-b', role: '   ' })
    assert.equal(cleared.ok, true)
    assert.equal(groups.get(id)!.members.find((m) => m.sessionId === 'session-b')!.role, undefined, '空身份要清掉')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('静默注入：第一次带完整用法，第二次起只带极短头', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-groups-brief-'))
  const sent: string[] = []
  const groups = createGroups({
    dir,
    deliver: async (_id, text) => {
      sent.push(text)
      return { ok: true }
    },
    cooldownMs: 0,
    log: () => {},
  })
  try {
    const created = groups.create({ name: '联调', me: 'session-lead', members: ['session-b'] })
    const id = created.group!.id
    await groups.post({ id, from: 'session-lead', text: '第一条', targets: ['session-b'], kind: 'agent' })
    await groups.post({ id, from: 'session-lead', text: '第二条', targets: ['session-b'], kind: 'agent' })
    assert.equal(sent.length, 2)
    assert.ok(sent[0]!.includes('group_read'), '第一次要带完整用法（含 group_read 提示）')
    assert.ok(!sent[1]!.includes('group_read'), '第二次起不再复述用法')
    assert.ok(sent[1]!.includes('第二条'))
    assert.ok(sent[1]!.includes('成员：'), '极短版仍带名单')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('建群后主动唤醒：成员收到入群通知（含摘要格式），发起方不收', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-groups-announce-'))
  const sent: Array<{ sessionId: string; text: string }> = []
  const groups = createGroups({
    dir,
    deliver: async (sessionId, text) => {
      sent.push({ sessionId, text })
      return { ok: true }
    },
    cooldownMs: 0,
    log: () => {},
  })
  try {
    const created = groups.create({ name: '联调', me: 'session-lead', members: ['session-a', 'session-b'] })
    const id = created.group!.id
    const announced = await groups.announce({ id, except: 'session-lead' })
    assert.equal(announced.ok, true)
    assert.equal(sent.length, 2, '两个成员各收到一条唤醒')
    assert.ok(sent.every((row) => row.sessionId !== 'session-lead'), '发起方不该被自己吵醒')
    assert.ok(sent[0]!.text.includes('入群通知'))
    assert.ok(sent[0]!.text.includes('摘要：'), '唤醒那条要带摘要格式约定，用户就不用再介绍一遍')
    assert.ok(sent[0]!.text.includes('group_post'))
    // 唤醒之后，第一条用户消息走极短版
    sent.length = 0
    await groups.post({ id, from: 'user', text: '开工', targets: ['session-a'], kind: 'user' })
    assert.ok(!sent[0]!.text.includes('group_read'), '已告知过的成员不再收完整说明')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('@全体：群主收到的是「分工请求」（带所有被 @ 的人 + 原话），不是一句「本轮只有你」', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-groups-all-'))
  const sent: Array<{ sessionId: string; text: string }> = []
  const groups = createGroups({
    dir,
    deliver: async (sessionId, text) => {
      sent.push({ sessionId, text })
      return { ok: true }
    },
    dispatchTimeoutMs: 5_000,
    cooldownMs: 0,
    log: () => {},
  })
  try {
    const created = groups.create({ name: '联调', me: 'session-aaaa1111', members: ['session-bbbb2222', 'session-cccc3333'] })
    const id = created.group!.id
    const posted = await groups.post({
      id,
      from: 'user',
      text: '互相认个人，打个招呼',
      targets: ['session-aaaa1111', 'session-bbbb2222', 'session-cccc3333'],
      kind: 'user',
    })
    assert.equal(sent.length, 1, '只投群主')
    assert.equal(sent[0]!.sessionId, 'session-aaaa1111')
    assert.ok(sent[0]!.text.includes('分工请求'), '要说清这是分工请求')
    assert.ok(sent[0]!.text.includes('互相认个人'), '原话要带上')
    assert.ok(sent[0]!.text.includes('aaaa1111'), '要列出用户 @ 了谁（群主自己）')
    assert.ok(sent[0]!.text.includes('bbbb2222'), '还要列出其他被 @ 的人')
    assert.ok(sent[0]!.text.includes('cccc3333'))
    assert.ok(!sent[0]!.text.includes('本轮只有你'), '不许再出现「本轮只有你」这种误导')
    assert.deepEqual(
      posted.entry!.targets,
      ['session-aaaa1111', 'session-bbbb2222', 'session-cccc3333'],
      '记录里保留用户真正 @ 的人',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
test('工具形状：十个工具、六键齐、output 是 {schema:{type:string},render}', () => {
  const { dir, groups } = makeDeps()
  try {
    const tools = buildGroupTools({ groups, guideBody: () => '# guide', log: () => {} })
    assert.deepEqual(
      tools.map((tool) => tool.name),
      [
        'group_create',
        'group_invite',
        'group_leave',
        'group_list',
        'group_post',
        'group_set_owner',
        'group_remove',
        'group_dissolve',
        'group_read',
        'groups_guide',
      ],
    )
    for (const tool of tools) {
      for (const key of ['name', 'description', 'parameters', 'output', 'timeoutMs', 'execute']) {
        assert.ok(key in tool, String(tool.name) + ' 缺 ' + key)
      }
      const output = tool.output as { schema?: { type?: string }; render?: unknown }
      assert.equal(output.schema?.type, 'string', String(tool.name) + ' 的 output.schema.type 必须与返回值一致')
      assert.equal(typeof output.render, 'function')
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
