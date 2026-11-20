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
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
    inject: async (sessionId, text) => {
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
    // 缺口等待的三条窗口压到几十毫秒：判据里不能真等 90 秒
    gapGraceMs: 30,
    gapQuietMs: 30,
    gapMaxMs: 400,
    ...over,
  }
  return { deps, calls }
}

/**
 * 群交接的假实现（2026-11-20 S1/S4/S5/S6/S7）。
 *
 * 这里只记「被调了什么、谁收的」，不模拟群服务本身——那由 groups 自己的判据管；
 * 这一层要钉的是**转生流程有没有按顺序、按身份把它用对**。
 */
interface HandoverCall {
  kind: 'locate' | 'post' | 'invite' | 'setRole' | 'setOwner' | 'remove'
  groupId?: string
  sessionId?: string
  ids?: string[]
  role?: string
  text?: string
  to?: string[]
}

function fakeGroupHandover(options: {
  isOwner?: boolean
  role?: string
  /** 群里除自己以外的人（群主时是"全员"，普通成员时第一个是群主）。 */
  others?: string[]
  /** 模拟"这个会话不在任何群里"。 */
  absent?: boolean
  /** 让某一环炸掉，验证失败不吞掉整条转生。 */
  throwOn?: 'invite' | 'post' | 'remove'
} = {}): { handover: NonNullable<HandoffDeps['groupHandover']>; calls: HandoverCall[] } {
  const isOwner = options.isOwner ?? true
  const others = options.others ?? ['session-owner', 'session-b']
  const groupName = '反向联调'
  const calls: HandoverCall[] = []
  const handover: NonNullable<HandoffDeps['groupHandover']> = {
    locate: (sessionId) => {
      calls.push({ kind: 'locate', sessionId })
      if (options.absent === true) return undefined
      return {
        groupId: 'group-1',
        groupName,
        isOwner,
        ...(options.role === undefined ? {} : { role: options.role }),
        // 群主发全员、普通成员只发群主：S1/S6 唯一的分歧点
        recipients: isOwner ? [...others] : [others[0]!],
      }
    },
    post: async (groupId, sessionId, text, to) => {
      calls.push({ kind: 'post', groupId, sessionId, text, ...(to === undefined ? {} : { to }) })
      if (options.throwOn === 'post') throw new Error('投递炸了')
      return { ok: true }
    },
    invite: async (groupId, ids) => {
      calls.push({ kind: 'invite', groupId, ids })
      if (options.throwOn === 'invite') throw new Error('群满了')
      return { ok: true }
    },
    setRole: (groupId, sessionId, role) => {
      calls.push({ kind: 'setRole', groupId, sessionId, role })
    },
    setOwner: (groupId, sessionId) => {
      calls.push({ kind: 'setOwner', groupId, sessionId })
    },
    remove: (groupId, sessionId) => {
      calls.push({ kind: 'remove', groupId, sessionId })
      if (options.throwOn === 'remove') throw new Error('退群炸了')
    },
  }
  return { handover, calls }
}

const GOOD_DOC = "# 交接\n\n## 目标\n把交接文档写全。\n## 现状（做到哪一步）\n判据已过。\n## 已完成（不要重做）\n- 交接指令重写：src/handoff/prompt.ts:120\n## 未完成 / 下一步\n- 打开 src/handoff/service.ts 跑 node --test dist/tests/handoff.test.js，全绿算完成\n## 等用户拍板\n无\n## 后台在跑\n无\n## 边界（不要碰的东西）\n无\n## 长期记忆要点\n- 2026-11-17 交接文档在 D:/handoff/x.md\n## 关键决定与理由\n补写用打回，而不是重发整份指令。\n## 坑与教训（踩过的坑、被否掉的方案）\n无\n## 工作区与版本\n分支 release-main，脏文件 0。\n## 相关文件\nC:/work/proj/src/handoff/prompt.ts\n\nDAFEIYU_HANDOFF_OK: D:/handoff/x.md"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))


test('没有文件工具的前世：给 content 就由插件落盘、直接建新会话（真机 2026-11-20）', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-handoff-content-'))
  const { deps, calls } = fakeDeps({ handoffDir: dir })
  const service = createHandoffService(deps)
  try {
    const started = await service.start('rebirth', 'session-aaaa1111', '接手继续', undefined, GOOD_DOC)
    assert.equal(started.ok, true)
    assert.equal(calls.injected.length, 0, '给了 content 就别再让前世写文档')
    await wait(80)
    assert.equal(calls.created.length, 1, '直接建新会话')
    assert.equal(calls.prompts.length, 1, '首句已投递')
    const job = service.status(started.jobId!)
    assert.equal(job?.status, 'done')
    const files = readdirSync(dir)
    assert.equal(files.filter((f) => f.endsWith('.md')).length, 1, '文档由插件写好了')
  } finally {
    service.stop()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('等不到交接文档也不再判死：兜底建新会话，缺口写进首句', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-handoff-timeout-'))
  const { deps, calls } = fakeDeps({ handoffDir: dir, timeoutMs: 40 })
  const service = createHandoffService(deps)
  try {
    const started = await service.start('rebirth', 'session-bbbb2222', '接手继续')
    assert.equal(started.ok, true)
    await wait(200)
    assert.equal(calls.created.length, 1, '超时也要建会话，不能让用户白点')
    const prompt = calls.prompts[0]?.text ?? ''
    assert.ok(prompt.includes('交接文档缺失'), '缺口要写进首句')
  } finally {
    service.stop()
    rmSync(dir, { recursive: true, force: true })
  }
})
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

test('注入指令：动笔前必须核对现场（工作区 / 后台 / 记忆 / 版本）', () => {
  for (const kind of ['rebirth', 'branch'] as const) {
    const text = buildInjection({ kind, filePath: 'D:\\h\\x.md', ...(kind === 'branch' ? { note: '干活' } : {}) })
    for (const needle of ['git status --short', 'job_list', 'list_agents', 'schedule_list', 'read_memory']) {
      assert.ok(text.includes(needle), `${kind} 缺核对项「${needle}」：凭记忆写就会漏后台任务与半截改动`)
    }
  }
})

test('注入指令：体检暴露的遗漏点必须变成固定小节', () => {
  const rebirth = buildInjection(PLAN)
  for (const heading of ['## 后台在跑', '## 等用户拍板', '## 工作区与版本', '## 长期记忆要点', '## 边界（不要碰的东西）']) {
    assert.ok(rebirth.includes(heading), `转生缺小节「${heading}」：9 份历史交接里 6/9 没写后台任务、7/9 没写工作区`)
  }
  const branch = buildInjection({ kind: 'branch', filePath: 'D:\\h\\y.md', note: '干活', boundary: '别碰 a.ts' })
  assert.ok(branch.includes('## 后台在跑'), '分身也必须写后台任务：本体正在跑的活不许重派')
  assert.ok(branch.includes('归本体'), '分身必须知道哪些后台任务归本体')
  assert.ok(branch.includes('## 工作区与版本'))
})

test('注入指令：含糊话黑名单与写完自查清单都在', () => {
  const text = buildInjection(PLAN)
  assert.ok(text.includes('禁用含糊话'), '没有黑名单，「跑通即可」这类话就还会出现')
  assert.ok(text.includes('跑通即可'), '黑名单要把原话列出来，别只说"别含糊"')
  assert.ok(text.includes('未确认'), '拿不准要写未确认，不许猜')
  assert.ok(text.includes('自查'), '写完必须自查一遍')
  assert.ok(text.includes('importance 3'), '记忆条目要分级，光说"记几条"会全是普通级')
  assert.ok(text.includes('必记一条指针'), '不记交接文档路径，下下次接手就找不到这份文档')
})

test('注入指令：转生也认 boundary（原来整个被丢掉）', () => {
  const text = buildInjection({ kind: 'rebirth', filePath: 'D:\\h\\z.md', boundary: '别碰 src/client.js' })
  assert.ok(text.includes('别碰 src/client.js'), '转生分支曾经把用户填的边界丢掉了：面板有输入框、传进来没人用')
  assert.ok(text.includes('## 边界（不要碰的东西）'))
})

test('首句：要求交接者核对现场并报「文档缺口」', () => {
  const text = buildFirstPrompt(PLAN)
  assert.ok(text.includes('文档缺口'), '接手者不报缺口，漏掉的东西要等开工才发现')
  assert.ok(text.includes('job_list'), '文档说"后台在跑"就要对一下还活着没有')
  assert.ok(text.includes('read_memory'), '接手前先看已经记了什么')
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

    // 2026-11-17：交接文档现在要过结构判据（doc-check），不合格会被打回补写——
    // 这几条测的是「落盘之后怎么建会话」，所以直接给一份合格文档。
    writeFileSync(job0.filePath, GOOD_DOC, 'utf8')
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

test('作业：等不到交接文档 → 兜底建会话（2026-11-20 起不再判死），缺口写进首句', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-handoff-'))
  try {
    const { deps, calls } = fakeDeps({ handoffDir: dir, timeoutMs: 80 })
    const service = createHandoffService(deps)
    const started = await service.start('rebirth', 'session-abc')
    await wait(260)
    const job = service.status(started.jobId!)!
    /*
     * 旧行为是「超时 = failed + 不建会话」，于是「前世没有文件工具」就变成
     * 用户点了转生却什么也没发生。现在改成兜底建会话，并把缺口写进首句。
     */
    assert.match(String(job.message ?? ''), /兜底建新会话|交接完成/)
    assert.equal(calls.created.length, 1, '兜底也必须留一条新会话')
    assert.match(calls.prompts[0]?.text ?? '', /交接文档缺失/)
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

test('作业：投递失败要说清楚（会话不在线），不留等待中的僵尸作业', async () => {
  const { deps } = fakeDeps({ inject: async () => ({ ok: false, message: '这个会话现在接不了指令' }) })
  const service = createHandoffService(deps)
  const started = await service.start('rebirth', 'session-abc')
  assert.equal(started.ok, false)
  assert.match(String(started.message), /接不了指令/)
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
    writeFileSync(job0.filePath, GOOD_DOC, 'utf8')
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

test('群交接：群主转生 → 全员收到预告，转世改名、进群、继承身份、接任群主，最后前世退群', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-handoff-group-owner-'))
  try {
    const { handover, calls } = fakeGroupHandover({ isOwner: true, role: '前端主程', others: ['session-2', 'session-3'] })
    const renamed: Array<{ sessionId: string; title: string }> = []
    const { deps } = fakeDeps({
      handoffDir: dir,
      sessionTitle: async () => '2-3 前端联调',
      renameSession: async (sessionId, title) => {
        renamed.push({ sessionId, title })
        return { ok: true }
      },
      groupHandover: handover,
    })
    const service = createHandoffService(deps)
    const started = await service.start('rebirth', 'session-abc')
    assert.equal(started.ok, true)

    // S1 必须在 start 那一刻就发：转生开始后前世可能已经没有 group_post 了，只能插件代发
    const announce = calls.find((call) => call.kind === 'post')
    assert.ok(announce, '没发转生预告，群友只会看到「这个人突然不回话了」')
    assert.match(String(announce.text), /转生预告/)
    assert.deepEqual(announce.to, ['session-2', 'session-3'], '群主转生 → 预告发全员')

    writeFileSync(service.status(started.jobId!)!.filePath, GOOD_DOC, 'utf8')
    await wait(160)
    const job = service.status(started.jobId!)!
    assert.equal(job.status, 'done', String(job.message ?? ''))

    assert.deepEqual(renamed, [{ sessionId: 'session-new-1', title: '2-3 前端联调转世1' }])
    const invite = calls.find((call) => call.kind === 'invite')
    assert.deepEqual(invite?.ids, ['session-new-1'], '转世要进群，否则它接不到群消息')
    assert.equal(calls.find((call) => call.kind === 'setRole')?.role, '前端主程', '身份要跟着角色走，不能给新人一张白纸')
    assert.deepEqual(
      calls.filter((call) => call.kind === 'setOwner').map((call) => call.sessionId),
      ['session-new-1'],
      '群主转生要把群主交出去，否则分工还得用户手动改',
    )

    // 注意用「【交接完成」：S1 正文里也有「交接完成前这条群照常运作」，只搜「交接完成」会认错
    const donePost = calls.filter((call) => call.kind === 'post').find((call) => /【交接完成/.test(String(call.text)))
    assert.ok(donePost, 'S6 没发：群里不知道后面该 @ 谁')
    assert.deepEqual(donePost.to, ['session-2', 'session-3'], '交接完成也要让全员知道')
    assert.match(String(donePost.text), /new-1/, 'S6 要带转世短号，群友才认得出是谁接手')
    assert.match(String(donePost.text), /群主已一并转给他/)

    const removeAt = calls.findIndex((call) => call.kind === 'remove')
    assert.ok(removeAt > 0, '前世交接完要退群：同一个角色留两个 agent，@ 谁都会答')
    assert.equal(calls[removeAt]!.sessionId, 'session-abc', '退群的是前世，不是转世')
    assert.ok(removeAt > calls.indexOf(donePost), '先广播再退群：反了的话前世已经不在群里，那句 S6 根本发不出去')
    service.stop()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('群交接：普通成员只发群主；序号按 base 累加，再转一次是「转世2」', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-handoff-group-gen-'))
  try {
    const { handover, calls } = fakeGroupHandover({ isOwner: false, role: '后端', others: ['session-owner'] })
    const renamed: string[] = []
    let title = 'X'
    const { deps } = fakeDeps({
      handoffDir: dir,
      sessionTitle: async () => title,
      renameSession: async (_sessionId, next) => {
        renamed.push(next)
        // 真机上改完名，下一次转生读到的就是这个标题
        title = next
        return { ok: true }
      },
      groupHandover: handover,
    })
    const live = createHandoffService(deps)
    try {
      const first = await live.start('rebirth', 'session-abc')
      writeFileSync(live.status(first.jobId!)!.filePath, GOOD_DOC, 'utf8')
      await wait(160)
      assert.equal(live.status(first.jobId!)!.status, 'done')
      const second = await live.start('rebirth', 'session-new-1')
      writeFileSync(live.status(second.jobId!)!.filePath, GOOD_DOC, 'utf8')
      await wait(160)
      assert.equal(live.status(second.jobId!)!.status, 'done', String(live.status(second.jobId!)!.message ?? ''))

      assert.deepEqual(renamed, ['X转世1', 'X转世2'], '前世已叫「转世1」时要先剥后缀再 +1，不能叠成转世1转世1')
      const announces = calls.filter((call) => call.kind === 'post' && /转生预告/.test(String(call.text)))
      assert.equal(announces.length, 2)
      for (const announce of announces) assert.deepEqual(announce.to, ['session-owner'], '普通成员只发群主，别在群里刷两遍')
      assert.equal(calls.filter((call) => call.kind === 'setOwner').length, 0, '前世不是群主就别动群主')
      assert.equal(calls.filter((call) => call.kind === 'setRole').length, 2, '每一世都要继承身份')
      assert.equal(calls.filter((call) => call.kind === 'remove').length, 2)
    } finally {
      live.stop()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('群交接：不在群里就一个群动作都不发，转生照常完成', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-handoff-group-none-'))
  try {
    const { handover, calls } = fakeGroupHandover({ absent: true })
    const { deps } = fakeDeps({
      handoffDir: dir,
      sessionTitle: async () => 'X',
      renameSession: async () => ({ ok: true }),
      groupHandover: handover,
    })
    const service = createHandoffService(deps)
    const started = await service.start('rebirth', 'session-abc')
    writeFileSync(service.status(started.jobId!)!.filePath, GOOD_DOC, 'utf8')
    await wait(160)
    const job = service.status(started.jobId!)!
    assert.equal(job.status, 'done')
    assert.match(String(job.message), /等你点头/)
    assert.ok(!String(job.message).includes('群交接'), '没群的人不该冒出「群交接有遗留」')
    // 只查了归属（S1 一次、收尾一次），其余动作一个都不许发
    assert.deepEqual(calls.map((call) => call.kind), ['locate', 'locate'])
    service.stop()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})


test('S3 缺口闸：转世没提缺口 → 等满 grace 就放行，并把这事写进 job.message', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-gap-none-'))
  try {
    const { handover, calls } = fakeGroupHandover({ isOwner: true, role: '前端主程', others: ['session-2'] })
    const { deps } = fakeDeps({ handoffDir: dir, sessionTitle: async () => 'X', renameSession: async () => ({ ok: true }), groupHandover: handover, gapGraceMs: 40 })
    const service = createHandoffService(deps)
    const started = await service.start('rebirth', 'session-abc')
    writeFileSync(service.status(started.jobId!)!.filePath, GOOD_DOC, 'utf8')
    await wait(260)
    const job = service.status(started.jobId!)!
    assert.equal(job.status, 'done')
    assert.match(String(job.message), /没提缺口/, '要说明它是“没提问”而不是“补齐了”')
    assert.ok(calls.some((call) => call.kind === 'invite'), '放行后仍要拉群')
    service.stop()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('S3 缺口闸：有未答的问题就不许往下走（超时才放行并说明剩几个没答）', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-gap-open-'))
  const inbox = path.join(dir, 'inbox')
  mkdirSync(inbox, { recursive: true })
  try {
    const { handover, calls } = fakeGroupHandover({ isOwner: false, others: ['session-2'] })
    const { deps } = fakeDeps({ handoffDir: dir, sessionTitle: async () => 'X', renameSession: async () => ({ ok: true }), groupHandover: handover, gapGraceMs: 10, gapQuietMs: 10, gapMaxMs: 120 })
    const service = createHandoffService(deps)
    const started = await service.start('rebirth', 'session-abc')
    writeFileSync(service.status(started.jobId!)!.filePath, GOOD_DOC, 'utf8')
    // 转世建出来之后才会去问；这里直接伪造一条“来生提问、前世没答”的线程
    writeFileSync(
      path.join(inbox, 'th1.json'),
      JSON.stringify({ id: 'th1', from: 'session-new-1', to: 'session-abc', question: '为什么这么定？', status: 'open', createdAt: Date.now(), updatedAt: Date.now() }),
      'utf8',
    )
    await wait(400)
    const job = service.status(started.jobId!)!
    assert.equal(job.status, 'done')
    assert.match(String(job.message), /没答/, '要说明还有几个问题没答')
    assert.ok(calls.some((call) => call.kind === 'invite'), '超时也要放行，不许卡死')
    service.stop()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('S3 缺口闸：全答完但没等满安静窗口 → 放行且措辞不许自相矛盾（别说「0 个没答」）', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-gap-answered-'))
  const inbox = path.join(dir, 'inbox')
  mkdirSync(inbox, { recursive: true })
  try {
    const { handover, calls } = fakeGroupHandover({ isOwner: false, others: ['session-2'] })
    const { deps } = fakeDeps({
      handoffDir: dir,
      sessionTitle: async () => 'X',
      renameSession: async () => ({ ok: true }),
      groupHandover: handover,
      gapGraceMs: 10,
      gapQuietMs: 60_000, // 安静窗口设得极大：保证是 max 先到
      gapMaxMs: 80,
    })
    const service = createHandoffService(deps)
    const started = await service.start('rebirth', 'session-abc')
    writeFileSync(service.status(started.jobId!)!.filePath, GOOD_DOC, 'utf8')
    writeFileSync(
      path.join(inbox, 'th2.json'),
      JSON.stringify({ id: 'th2', from: 'session-new-1', to: 'session-abc', question: '为什么？', answer: '因为这样。', status: 'answered', createdAt: Date.now(), updatedAt: Date.now() }),
      'utf8',
    )
    await wait(400)
    const job = service.status(started.jobId!)!
    assert.equal(job.status, 'done')
    assert.match(String(job.message), /已答完/, '答完了就要说答完：' + String(job.message))
    assert.ok(!/0 个问题没答/.test(String(job.message)), '不许出现「0 个问题没答」这种自相矛盾的话')
    assert.ok(calls.some((call) => call.kind === 'invite'), '放行后仍要拉群')
    service.stop()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
test('群交接：某一环抛错只记遗留，不拖垮已经起来的转世，后面两步照走', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-handoff-group-boom-'))
  try {
    const { handover, calls } = fakeGroupHandover({
      isOwner: true,
      role: '前端主程',
      others: ['session-2', 'session-3'],
      throwOn: 'invite',
    })
    const { deps } = fakeDeps({
      handoffDir: dir,
      sessionTitle: async () => 'X',
      renameSession: async () => ({ ok: true }),
      groupHandover: handover,
    })
    const service = createHandoffService(deps)
    const started = await service.start('rebirth', 'session-abc')
    writeFileSync(service.status(started.jobId!)!.filePath, GOOD_DOC, 'utf8')
    await wait(160)
    const job = service.status(started.jobId!)!
    assert.equal(job.status, 'done', '群交接是收尾，新会话已经建好了，不能因此判死')
    assert.match(String(job.message), /群交接有遗留/)
    assert.match(String(job.message), /拉群/, '遗留里要点名是哪一环，不然面板上只有一句「有遗留」')
    /*
     * 拉群失败 ⇒ **不许**宣布交接完成、也**不许**退群（2026-11-20 修）：
     * 否则群里留下「前世已经走了、新人没进来」的空档。改成发一条「交接未完成」，
     * 让前世继续顶着，用户腾位置后再拉。
     */
    assert.ok(
      calls.some((call) => call.kind === 'post' && /【交接未完成/.test(String(call.text))),
      '拉群失败要明说，不能默默不吭声',
    )
    assert.ok(!calls.some((call) => call.kind === 'post' && /【交接完成/.test(String(call.text))), '没进群就别宣布完成')
    assert.ok(!calls.some((call) => call.kind === 'remove'), '没进群就别把前世踢走')
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


test('结构判据：小节齐全、下一步有入口、没有含糊话才算过', async () => {
  const { checkHandoffDoc } = await import('../src/handoff/doc-check.js')
  const good = checkHandoffDoc(GOOD_DOC, 'rebirth')
  assert.equal(good.ok, true, '合格文档不该被打回：' + good.problems.join(' / '))
  const missing = checkHandoffDoc('## 目标\n做点事\n', 'rebirth')
  assert.equal(missing.ok, false)
  assert.ok(missing.problems.some((p) => p.includes('缺这些小节')), '缺小节要点名')
  const vague = checkHandoffDoc(GOOD_DOC.replace('补写用打回，而不是重发整份指令。', '细节见之前对话。'), 'rebirth')
  assert.equal(vague.ok, false, '含糊话必须打回')
  const naked = checkHandoffDoc(
    GOOD_DOC.replace('- 打开 src/handoff/service.ts 跑 node --test dist/tests/handoff.test.js，全绿算完成', '- 把剩下的收尾工作做完'),
    'rebirth',
  )
  assert.equal(naked.ok, false, '下一步没给入口（文件/命令）要打回')
  assert.ok(naked.problems.some((p) => p.includes('没给入口')))
})

test('交接作业：文档结构不合格时打回补写，补好了才建新会话', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-handoff-fix-'))
  try {
    const { deps, calls } = fakeDeps({ handoffDir: dir, timeoutMs: 5_000 })
    const service = createHandoffService(deps)
    const started = await service.start('rebirth', 'session-abc')
    assert.equal(started.ok, true)
    const jobId = started.jobId!
    const job = service.status(jobId)!
    // 第一版：有标记、也够长，但小节缺一大堆 → 必须被打回，不许直接建会话
    writeFileSync(job.filePath, '## 目标\n做点事\n\nDAFEIYU_HANDOFF_OK: ' + job.filePath + '\n', 'utf8')
    await wait(60)
    assert.equal(calls.created.length, 0, '结构不合格时绝不建新会话')
    assert.equal(calls.injected.length, 2, '除了最初那次，还该有一次补写指令')
    assert.ok(calls.injected[1]!.text.includes('待补写'), '补写指令要说明是补写，不是重发整份')
    assert.ok(calls.injected[1]!.text.includes('缺这些小节'), '补写指令要列出缺哪几处')
    assert.equal(service.status(jobId)!.status, 'waiting', '还在等补写，不是失败')
    // 第二版：合格 → 放行
    writeFileSync(job.filePath, GOOD_DOC, 'utf8')
    await wait(150)
    assert.equal(calls.created.length, 1, '补好了就该建新会话')
    assert.equal(service.status(jobId)!.status, 'done')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('收件箱：来生问 → 送进前世；前世答 → 送回给来生；送不到要明说', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-inbox-'))
  try {
    const { createInbox } = await import('../src/handoff/inbox.js')
    const sent: Array<{ sessionId: string; text: string }> = []
    const inbox = createInbox({
      dir,
      deliver: async (sessionId, text) => {
        sent.push({ sessionId, text })
        return { ok: true }
      },
      log: () => {},
    })
    const asked = await inbox.ask({ from: 'session-heir', to: 'session-parent', question: '当初为什么否掉 link: 依赖？' })
    assert.equal(asked.ok, true)
    assert.equal(sent.length, 1, '问题要送进前世会话')
    assert.equal(sent[0]!.sessionId, 'session-parent')
    assert.ok(sent[0]!.text.includes('handoff_answer'), '要告诉前世怎么回答')
    const id = asked.thread!.id
    const answered = await inbox.answer({ id, answer: '因为 sha 会漂，装到的东西不可复现。' })
    assert.equal(answered.ok, true)
    assert.equal(sent.length, 2)
    assert.equal(sent[1]!.sessionId, 'session-heir', '回答要送回给来生')
    assert.ok(sent[1]!.text.includes('因为 sha 会漂'), '回答原文要送到')
    // 前世不在线：不许假装问了
    const offline = createInbox({ dir, deliver: async () => ({ ok: false, message: '会话不在线' }), log: () => {} })
    const failed = await offline.ask({ from: 'session-x', to: 'session-dead', question: '在吗' })
    assert.equal(failed.ok, false)
    assert.ok(String(failed.message ?? '').includes('不在线'), '要说清送不到，去问用户')
    assert.equal(failed.thread!.status, 'undeliverable')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})