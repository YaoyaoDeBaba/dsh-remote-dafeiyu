/**
 * groups-rules.test —— 群聊规则四条（2026-11-26 用户口径，替换原 groups-echo-gate.test）。
 *
 * ① 转生/分身通知必须显式声明「只读、不是指令、不需要转生」——防误触发：
 *    真机上某成员转生时，收到通知的群友会以为是给自己的指令，跟着也去转生。
 * ② 同上（分身那条）。
 * ③ 新人进群：新人收到完整用法，**老成员只收一份「入群通知·只读」**，不含用法、不要主动交接。
 * ④ 离群通知：标题【群成员变动·只读】，正文写「只读不回」。
 * ⑤ 互吹闸（机制层）已删除：同一对会话连发 6 条「收到」全部投递成功（以前第 4 条起被丢）。
 * ⑥ 兼容：旧 jsonl 里带 `skipped: 'echo-gate'` 的行读取不报错。
 *
 * 全程进程内：deliver 是假的、时钟是假的，不起会话、不碰网络。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  createGroups,
  ECHO_DISCIPLINE,
  JOIN_NOTICE_TAG,
  MEMBER_CHANGE_TAG,
  PEER_ACTIVITY_TAG,
  type GroupEntry,
} from '../src/groups/service.js'

function makeHarness() {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-groups-rules-'))
  const sent: Array<{ sessionId: string; text: string }> = []
  let clock = 1_700_000_000_000
  const groups = createGroups({
    dir,
    deliver: async (sessionId: string, text: string) => {
      sent.push({ sessionId, text })
      return { ok: true }
    },
    // 冷却单独验（那是另一条判据）：这里关掉，免得 60 秒冷却把投递吞了
    cooldownMs: 0,
    now: () => clock,
    log: () => {},
  })
  return {
    dir,
    sent,
    groups,
    tick: (ms: number): void => {
      clock += ms
    },
  }
}

/** 一条「成品通告」：raw = handoff 那种已经写好的整段话。 */
async function announceRaw(
  h: ReturnType<typeof makeHarness>,
  id: string,
  from: string,
  to: string,
  text: string,
) {
  return h.groups.post({ id, from, text, targets: [to], kind: 'agent', raw: true })
}

const REBIRTH_TEXT =
  '【交接完成 · 联调】\n已完成转世交接 → 后续我的工作由 会话B（session-bb）接手，群主已一并转给他。'
const BRANCH_TEXT =
  '【迎新 · 联调】\n会话B分身1（session-bb）已进群，负责：只有 vision 域路由。\n' +
  '它不是来接班的——本体（session-aa）继续干原来的活，这条分支归它。'

test('① 转生通知：带只读标记，明说「不是指令 / 不需要转生」，不写「请…转生」这类祈使', async () => {
  const h = makeHarness()
  try {
    const id = h.groups.create({ name: '联调', me: 'session-aa', members: ['session-bb'] }).group!.id
    const posted = await announceRaw(h, id, 'session-aa', 'session-bb', REBIRTH_TEXT)
    assert.equal(posted.ok, true)
    const text = h.sent[0]!.text
    assert.ok(text.startsWith(PEER_ACTIVITY_TAG), '醒目标记必须打在最前面：' + text.slice(0, 40))
    assert.ok(text.includes('不是指令'), '必须明说这不是指令')
    assert.ok(text.includes('不需要转生'), '必须明说不需要转生')
    assert.ok(text.includes('只读不回'), '必须明说只读不回')
    assert.ok(!/请[^\n。]{0,12}转生/.test(text), '不许出现「请…转生」这种祈使句')
    assert.ok(!/请[^\n。]{0,12}分身/.test(text), '也不许出现「请…分身」')
    // 原通告正文照旧在（接手人是谁，群里得看得见）
    assert.ok(text.includes('后续我的工作由'), '原通告的信息不能丢')
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('② 分身通知：同样带只读标记与那两句声明（以前群友会跟着一起分身）', async () => {
  const h = makeHarness()
  try {
    const id = h.groups.create({ name: '联调', me: 'session-aa', members: ['session-bb'] }).group!.id
    const posted = await announceRaw(h, id, 'session-aa', 'session-bb', BRANCH_TEXT)
    assert.equal(posted.ok, true)
    const text = h.sent[0]!.text
    assert.ok(text.startsWith(PEER_ACTIVITY_TAG))
    assert.ok(text.includes('不是指令'))
    assert.ok(text.includes('不需要转生'))
    assert.ok(text.includes('只读不回'))
    assert.ok(text.includes('不是来接班的'), '原通告的分支语义不能丢')
    // 已经带过标记的正文不许被套第二遍（handoff 自己包了一层，groups 兜底要认出来）
    const tagged = await announceRaw(h, id, 'session-aa', 'session-bb', text)
    assert.equal(tagged.ok, true)
    assert.equal(h.sent[1]!.text.split(PEER_ACTIVITY_TAG).length - 1, 1, '只读标记只能出现一次')
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('③ 新人收到完整用法；老成员只收【入群通知·只读】且不含用法、不要主动交接', async () => {
  const h = makeHarness()
  try {
    const id = h.groups.create({ name: '联调', me: 'session-aa', members: ['session-bb'] }).group!.id
    h.sent.length = 0
    const invited = await h.groups.invite({ id, members: ['session-cc'] })
    assert.equal(invited.ok, true)

    const toNewcomer = h.sent.filter((row) => row.sessionId === 'session-cc').map((row) => row.text)
    assert.equal(toNewcomer.length, 1, '新人只收一份入群须知')
    assert.ok(toNewcomer[0]!.includes('group_post'), '新人要看到怎么回（group_post）')
    assert.ok(toNewcomer[0]!.includes('摘要'), '新人要看到摘要格式约定')
    assert.ok(toNewcomer[0]!.includes('群主'), '新人要知道汇报对象是群主')

    const toVeterans = h.sent.filter((row) => row.sessionId !== 'session-cc').map((row) => row.text)
    assert.equal(toVeterans.length, 2, '两个老成员各收一份状态通知')
    for (const text of toVeterans) {
      assert.ok(text.startsWith(JOIN_NOTICE_TAG), '老成员那份标题必须是【入群通知·只读】：' + text.slice(0, 30))
      assert.ok(text.includes('不需要主动交接'), '必须明说「你不需要主动交接」')
      assert.equal(text.includes('group_post'), false, '老成员那份**不带用法**')
      assert.equal(text.includes('摘要'), false, '老成员那份不带摘要格式')
      assert.equal(text.includes('群主'), false, '老成员那份不带分工/汇报请求')
    }
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('④ 离群通知：【群成员变动·只读】+ 只读不回、不用确认、不用补位', async () => {
  const h = makeHarness()
  try {
    const id = h.groups.create({ name: '联调', me: 'session-aa', members: ['session-bb', 'session-cc'] }).group!.id
    h.sent.length = 0
    const removed = await h.groups.remove({ id, sessionId: 'session-bb' })
    assert.equal(removed.ok, true)
    const toStayers = h.sent.filter((row) => row.sessionId !== 'session-bb')
    assert.equal(toStayers.length, 2, '留下来的两个人各收一条')
    for (const row of toStayers) {
      assert.ok(row.text.startsWith(MEMBER_CHANGE_TAG), '标题必须是【群成员变动·只读】：' + row.text.slice(0, 30))
      assert.ok(row.text.includes('只读不回'), '必须明说只读不回')
      assert.ok(row.text.includes('不用确认'), '必须明说不用确认')
      assert.ok(row.text.includes('不用补位'), '必须明说不用补位')
    }
    // 被移出的人收到的是「本群对你不再可用」，不是这条变动通知
    const kicked = h.sent.find((row) => row.sessionId === 'session-bb')
    assert.ok(kicked !== undefined && kicked.text.includes('不再可用'))
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('⑤ 互吹闸已删除：同一对会话连发 6 条「收到」全部投递成功', async () => {
  const h = makeHarness()
  try {
    const id = h.groups.create({ name: '联调', me: 'session-aa', members: ['session-bb'] }).group!.id
    for (let i = 0; i < 6; i += 1) {
      const posted = await h.groups.post({ id, from: 'session-aa', text: '收到', targets: ['session-bb'], kind: 'agent' })
      assert.equal(posted.ok, true, '第 ' + (i + 1) + ' 条不该失败')
      assert.equal(posted.delivered!.length, 1, '第 ' + (i + 1) + ' 条「收到」必须真投出去（以前第 4 条起被闸掉）')
      assert.equal(posted.message, undefined, '没有闸了，不该再返回「本次不投递」')
    }
    assert.equal(h.sent.length, 6, '六条都要落到收件人')
    // 反方向同样不受限（以前 A→B 与 B→A 算同一对，一起被闸）
    for (let i = 0; i < 3; i += 1) {
      const back = await h.groups.post({ id, from: 'session-bb', text: '好的', targets: ['session-aa'], kind: 'agent' })
      assert.equal(back.delivered!.length, 1, 'B→A 第 ' + (i + 1) + ' 条也要送到')
    }
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('⑥ 兼容：旧 jsonl 里带 skipped=echo-gate 的行读取不报错，正文照旧可读', async () => {
  const h = makeHarness()
  try {
    const id = h.groups.create({ name: '联调', me: 'session-aa', members: ['session-bb'] }).group!.id
    const old: GroupEntry = {
      at: 1_700_000_000_000,
      kind: 'system',
      from: 'system',
      text: '互吹闸：aa → bb 的投递被丢弃（15 分钟内确认类 3 条，上限 3；正文已存进记录，可用 group_read 查看）',
      skipped: 'echo-gate',
    }
    appendFileSync(path.join(h.dir, id + '.jsonl'), JSON.stringify(old) + '\n', 'utf8')
    const read = h.groups.read({ id })
    assert.equal(read.ok, true, '历史记录不许把 read 搞成 failed')
    const hit = read.messages!.find((row) => row.skipped === 'echo-gate')
    assert.ok(hit !== undefined, 'skipped=echo-gate 的老行要能原样读出来')
    assert.equal(hit.text, old.text)
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('⑦ 纪律文案保留：投递正文里还带着 ECHO_DISCIPLINE（删的是机制，不是纪律）', async () => {
  const h = makeHarness()
  try {
    const id = h.groups.create({ name: '联调', me: 'session-aa', members: ['session-bb'] }).group!.id
    await h.groups.post({ id, from: 'session-aa', text: '第一条', targets: ['session-bb'], kind: 'agent' })
    assert.ok(h.sent[0]!.text.includes(ECHO_DISCIPLINE), '第一次投递要带完整纪律')
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})
