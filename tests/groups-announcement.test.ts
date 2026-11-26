/**
 * groups-announcement.test —— 群公告（2026-11-26 用户需求）。
 *
 * 用户原话：「给群聊增加『群公告』。群公告带在群聊的消息尾巴里。原因：群员经常行为越界，
 * 我想把规矩写在群公告里。」
 *
 * 七条判据：
 *  ① 设置后群记录里带 announcement（空串 = 清除，字段不留空），并写一条 system 记录；
 *  ② 公告强度与尾巴同档：**完整版**含全文（或末尾片段），**精简版**只含前 60 字 + 「group_read」提示、
 *     不含完整尾部；两档都紧跟在成员表那行之后；
 *  ③ 没有公告时两版正文都**不含**「【群公告】」（不许出现空标题）；
 *  ④ 新人入群通知带公告，老成员那份只读通知**不带**（保持只读语义）；
 *  ⑤ 超 500 字被截断到 500 且不报错（尾巴里也是 500，不溢出）；
 *  ⑥ 旧群记录（无该字段 / 字段是怪类型）读取不炸、投递正常，之后还能设公告；
 *  ⑦ 路由 /groups/announcement 真的挂上了，且与其它写路由同一套守卫（没 x-drc-pair 就 403）。
 *
 * 全程进程内：deliver 是假的、不起会话、不碰网络（第 ⑦ 条用假的 req/res 对打）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  announcementBlock,
  createGroups,
  JOIN_NOTICE_TAG,
  joinNoticeForNewcomer,
  joinNoticeForVeteran,
  MAX_ANNOUNCEMENT_CHARS,
  normalizeAnnouncement,
  readGroup,
} from '../src/groups/service.js'
import { groupsHandlers, GROUPS_ANNOUNCEMENT_ROUTE } from '../src/groups/routes.js'

function makeHarness() {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-groups-anno-'))
  const sent: Array<{ sessionId: string; text: string }> = []
  const groups = createGroups({
    dir,
    deliver: async (sessionId: string, text: string) => {
      sent.push({ sessionId, text })
      return { ok: true }
    },
    // 冷却单独验（那是另一条判据）：这里关掉，免得 60 秒冷却把投递吞了
    cooldownMs: 0,
    log: () => {},
  })
  return { dir, sent, groups }
}

/** 成员表那行的下标（两档正文的行首不同：full 是「群成员：」，brief 是「成员：」）。 */
function rosterIndex(lines: string[]): number {
  return lines.findIndex((line) => /^(?:群)?成员：/.test(line))
}

const RULES = '只说结论，别写客套；改动先报路径；不许替别人转生'

test('① 设置公告：群记录里带着；空串 = 清除（字段不留空）；写 system 记录', () => {
  const h = makeHarness()
  try {
    const id = h.groups.create({ name: '联调', me: 'session-aa', members: ['session-bb'] }).group!.id
    const set = h.groups.setAnnouncement({ id, text: '  ' + RULES + '  ' })
    assert.equal(set.ok, true)
    assert.equal(set.announcement, RULES, '首尾空白要去掉')
    assert.equal(readGroup(h.dir, id)!.announcement, RULES, '要跟着群记录落盘')
    assert.ok(
      h.groups.read({ id }).messages!.some((row) => row.kind === 'system' && row.text.includes('公告已更新（' + RULES.length + ' 字）')),
      'system 记录要写「公告已更新（N 字）」',
    )

    const cleared = h.groups.setAnnouncement({ id, text: '   \n  ' })
    assert.equal(cleared.ok, true)
    assert.equal(cleared.announcement, '')
    assert.equal(readGroup(h.dir, id)!.announcement, undefined, '空串 = 清除，字段不留空值')
    assert.ok(
      h.groups.read({ id }).messages!.some((row) => row.kind === 'system' && row.text.includes('公告已清除')),
      '清除也要留一笔 system 记录',
    )

    assert.equal(h.groups.setAnnouncement({ id: 'g-nope', text: 'x' }).ok, false, '未知群要拒')
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('② 公告跟尾巴同档：完整版带全文，精简版只带前 60 字 + group_read 提示，位置都在成员表之后', async () => {
  const h = makeHarness()
  try {
    const HEAD = '开头：只说结论，别写客套，也别复述别人的话。'
    const MIDDLE = '中间：改动先报路径，结果只报数字，确认类不发，长篇写文件给路径，跨机只贴五行。'
    const TAIL = '结尾：不许替别人转生，也不许转发别人的生成物。'
    const LONG = HEAD + MIDDLE + TAIL
    assert.ok(LONG.indexOf(TAIL) > 60, '尾部必须落在第 60 字之后，判据才有意义（TAIL 起点 ' + LONG.indexOf(TAIL) + '）')

    const id = h.groups.create({ name: '联调', me: 'session-lead', members: ['session-bb'] }).group!.id
    assert.equal(h.groups.setAnnouncement({ id, text: LONG }).ok, true)
    h.sent.length = 0
    await h.groups.post({ id, from: 'session-lead', text: '第一条', targets: ['session-bb'], kind: 'agent' })
    await h.groups.post({ id, from: 'session-lead', text: '第二条', targets: ['session-bb'], kind: 'agent' })
    assert.equal(h.sent.length, 2)

    const full = h.sent[0]!.text
    const brief = h.sent[1]!.text
    // 两档的分辨依据：完整版带「本轮协作对象 / 本轮只有你」那行，极短版没有
    const peerLine = /本轮(?:协作对象|只有你)/
    assert.match(full, peerLine, '第一次是完整版')
    assert.equal(peerLine.test(brief), false, '第二次是极短版')

    // 完整版：公告全文（≤500 字整段带出）
    assert.ok(full.includes('【群公告】' + LONG), '完整版要带公告全文：' + full)
    // 精简版：只留前 60 字 + 指向 group_read 的提示，**不含**完整尾部
    assert.ok(
      brief.includes('【群公告】' + LONG.slice(0, 60) + '……（完整公告见 group_read）'),
      '精简版公告只能是前 60 字 + group_read 提示：' + brief,
    )
    assert.equal(brief.includes('……（完整公告见 group_read）'), true, '精简版要有那句提示')
    assert.equal(brief.includes(TAIL), false, '精简版不许带完整公告的尾部')

    // 两档的位置：紧跟在成员表那行之后
    for (const [name, text] of [['完整版', full], ['极短版', brief]] as Array<[string, string]>) {
      const lines = text.split('\n')
      const rosterAt = rosterIndex(lines)
      const annoAt = lines.findIndex((line) => line.startsWith('【群公告】'))
      assert.ok(rosterAt >= 0, name + '要有成员表那行')
      assert.equal(annoAt, rosterAt + 1, name + '的公告段必须紧跟成员表那行之后：' + text)
    }
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('③ 没有公告：正文里一个字都不出现【群公告】（不许出现空标题）', async () => {
  const h = makeHarness()
  try {
    const id = h.groups.create({ name: '联调', me: 'session-lead', members: ['session-bb'] }).group!.id
    h.sent.length = 0
    await h.groups.post({ id, from: 'session-lead', text: '没有公告的群', targets: ['session-bb'], kind: 'agent' })
    await h.groups.post({ id, from: 'session-lead', text: '第二条', targets: ['session-bb'], kind: 'agent' })
    assert.equal(h.sent.length, 2)
    for (const row of h.sent) assert.equal(row.text.includes('【群公告】'), false, '没公告就不加这一段')
    // 纯函数层面：undefined / 空串 / 空白串 / 非字符串都当没有公告
    assert.equal(announcementBlock(undefined), '')
    assert.equal(announcementBlock({ version: 2, id: 'g-x', name: 'x', members: [], createdAt: 0, updatedAt: 0 }), '')
    assert.equal(normalizeAnnouncement('   '), '')
    assert.equal(normalizeAnnouncement(undefined), '')
    assert.equal(normalizeAnnouncement(42), '')
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('④ 入群通知：新人那份带公告，老成员那份不带（只读语义不变）', async () => {
  const h = makeHarness()
  try {
    const id = h.groups.create({ name: '联调', me: 'session-aa', members: ['session-bb'] }).group!.id
    assert.equal(h.groups.setAnnouncement({ id, text: RULES }).ok, true)
    h.sent.length = 0
    const invited = await h.groups.invite({ id, members: ['session-cc'] })
    assert.equal(invited.ok, true)

    const toNewcomer = h.sent.filter((row) => row.sessionId === 'session-cc')
    assert.equal(toNewcomer.length, 1, '新人只收一份入群须知')
    assert.ok(toNewcomer[0]!.text.includes('【群公告】' + RULES), '新人不该错过规矩')

    const toVeterans = h.sent.filter((row) => row.sessionId !== 'session-cc')
    assert.equal(toVeterans.length, 2, '两个老成员各收一份状态通知')
    for (const row of toVeterans) {
      assert.ok(row.text.startsWith(JOIN_NOTICE_TAG), '老成员那份仍是【入群通知·只读】')
      assert.equal(row.text.includes('【群公告】'), false, '老成员那份不带公告（只读通知不夹带）')
    }

    const group = h.groups.get(id)!
    assert.ok(joinNoticeForNewcomer(group).includes('【群公告】' + RULES), '新人通知纯函数层面也要带')
    assert.equal(joinNoticeForVeteran(group, 'session-cc').includes('【群公告】'), false)
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('⑤ 超 500 字：截断到 500 且不报错（投递尾巴也是 500，不溢出）', async () => {
  const h = makeHarness()
  try {
    const id = h.groups.create({ name: '联调', me: 'session-lead', members: ['session-bb'] }).group!.id
    const long = '规'.repeat(MAX_ANNOUNCEMENT_CHARS + 37)
    const set = h.groups.setAnnouncement({ id, text: long })
    assert.equal(set.ok, true, '超长不报错')
    assert.equal(set.announcement.length, MAX_ANNOUNCEMENT_CHARS)
    assert.equal(h.groups.get(id)!.announcement!.length, MAX_ANNOUNCEMENT_CHARS)

    h.sent.length = 0
    await h.groups.post({ id, from: 'session-lead', text: '超长公告', targets: ['session-bb'], kind: 'agent' })
    const line = h.sent[0]!.text.split('\n').find((row) => row.startsWith('【群公告】'))
    assert.ok(line !== undefined)
    assert.equal(line!.length, '【群公告】'.length + MAX_ANNOUNCEMENT_CHARS, '尾巴里也只带 500 字')
    assert.equal(line!.includes('规'.repeat(MAX_ANNOUNCEMENT_CHARS + 1)), false)
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('⑥ 旧群记录（无 announcement / 字段是怪类型）：读取不炸、投递正常、之后能设公告', async () => {
  const h = makeHarness()
  try {
    const legacy = {
      version: 2,
      id: 'g-old',
      name: '老群',
      members: [
        { sessionId: 'session-aa', joinedAt: 1 },
        { sessionId: 'session-bb', joinedAt: 1 },
      ],
      createdAt: 1,
      updatedAt: 1,
      ownerSessionId: 'session-aa',
    }
    const file = path.join(h.dir, 'g-old.json')
    writeFileSync(file, JSON.stringify(legacy, null, 2) + '\n', 'utf8')
    assert.equal(readGroup(h.dir, 'g-old')?.announcement, undefined, '旧文件没有这个字段就是没有公告')

    h.sent.length = 0
    const posted = await h.groups.post({ id: 'g-old', from: 'session-aa', text: '老群照常发', targets: ['session-bb'], kind: 'agent' })
    assert.equal(posted.ok, true)
    assert.equal(h.sent.length, 1)
    assert.equal(h.sent[0]!.text.includes('【群公告】'), false)

    // 手写 / 老版本 json 里塞个怪值也不许把读逻辑带崩
    writeFileSync(file, JSON.stringify({ ...legacy, announcement: 42 }, null, 2) + '\n', 'utf8')
    assert.equal(readGroup(h.dir, 'g-old')?.announcement, undefined)

    assert.equal(h.groups.setAnnouncement({ id: 'g-old', text: '老群也有规矩了' }).ok, true)
    h.sent.length = 0
    await h.groups.post({ id: 'g-old', from: 'session-aa', text: '设完再来一条', targets: ['session-bb'], kind: 'agent' })
    assert.ok(h.sent[0]!.text.includes('【群公告】老群也有规矩了'), '旧群设完公告后照常带在尾巴里')
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

/** 假 req：data/end 在下一拍推给监听者（readBody 是同步注册的）。 */
function fakeRequest(url: string, body: string, headers: Record<string, string>) {
  const listeners: Record<string, Array<(chunk?: unknown) => void>> = {}
  const request = {
    method: 'POST',
    url,
    headers,
    on(event: string, callback: (chunk?: unknown) => void) {
      listeners[event] = [...(listeners[event] ?? []), callback]
      return request
    },
    destroy() {},
  }
  setTimeout(() => {
    for (const callback of listeners.data ?? []) callback(Buffer.from(body))
    for (const callback of listeners.end ?? []) callback()
  }, 0)
  return request
}

/** 假 res：只收状态码与 body。 */
function fakeResponse() {
  const response = {
    statusCode: 0,
    payload: '',
    writeHead(status: number) {
      response.statusCode = status
      return response
    },
    setHeader() {},
    end(payload?: string) {
      response.payload = String(payload ?? '')
    },
  }
  return response
}

test('⑦ 路由 /groups/announcement 挂上了，且与其它写路由同一套守卫（没 x-drc-pair 就 403）', async () => {
  const h = makeHarness()
  try {
    const id = h.groups.create({ name: '联调', me: 'session-aa', members: ['session-bb'] }).group!.id
    const route = groupsHandlers({ groups: h.groups, log: () => {} }).find((row) => row.path === GROUPS_ANNOUNCEMENT_ROUTE)
    assert.ok(route !== undefined, '公告路由必须挂上')

    const denied = fakeResponse()
    await route!.handler(
      fakeRequest(GROUPS_ANNOUNCEMENT_ROUTE, JSON.stringify({ groupId: id, text: RULES }), { host: '127.0.0.1:1' }) as never,
      denied as never,
    )
    assert.equal(denied.statusCode, 403, '没有 x-drc-pair 一律 403')
    assert.equal(readGroup(h.dir, id)!.announcement, undefined, '被拦下的请求不许写盘')

    const ok = fakeResponse()
    await route!.handler(
      fakeRequest(GROUPS_ANNOUNCEMENT_ROUTE, JSON.stringify({ groupId: id, text: RULES }), {
        host: '127.0.0.1:1',
        'x-drc-pair': '1',
      }) as never,
      ok as never,
    )
    assert.equal(ok.statusCode, 200)
    const payload = JSON.parse(ok.payload) as { ok: boolean; announcement: string }
    assert.equal(payload.ok, true)
    assert.equal(payload.announcement, RULES, '返回体要带 {ok, announcement}')
    assert.equal(readGroup(h.dir, id)!.announcement, RULES)
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})
