/**
 * groups/service —— 「肥鱼拉群」的群记录、投递与通知（2026-11-19，v2）。
 *
 * ## 语义（v2 起最关键的一条）
 *
 * 群界面是**给用户看的记录**，不是发给全员的广播。用户 @A @B 发一条，插件拆成两条投递：
 * A 收到「你被 @ 了 + 本轮协作对象 + 对方要点」，B 收到对称的一条；两边都看不到整段群聊。
 * 这跟「前世↔来生收件箱」是同一根电话线（插件层 sendPrompt），只是多了一层给用户看的界面。
 *
 * ## 存储
 *
 * - `<dir>/<id>.json`：群元信息（名字、成员、时间）；
 * - `<dir>/<id>.jsonl`：**记录**（user / agent / system 三类），一条一行，坏一行不牵连别行。
 *
 * ## 纪律
 *
 * 1. 先落盘再投递：送失败还能 read 补发，不会凭空消失；
 * 2. 送不到不许静默：逐条带回 failed（谁没收到、为什么）；
 * 3. 只投给成员；上限 12 人、单条 4000 字；
 * 4. 投递正文带**当时的名单**与「怎么回复」——这就是成员「实时知道群里有谁」的唯一来源；
 * 5. 机制层**不再有互吹闸**（2026-11-26 用户口径：闸会误杀正常协作，删机制、只留纪律）——
 *    剩下的是 `ECHO_DISCIPLINE` 那套文案：照旧拼进投递正文与常驻 system 段；
 * 6. 三类「状态变更通知」（群友转生/分身、新人进群、有人离群）都是**只读**的：
 *    开头一律带醒目标记，正文写清「不是指令 / 不需要动作 / 只读不回」。
 *    真机教训：收到「某某要转生了」的成员会把它当成给自己的指令，跟着一起去转生。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** 群消息里的图（2026-11-25 需求⑥）：base64 原文 + mime；落盘与路径由路由层负责。 */
export interface GroupImage {
  data: string
  mimeType: string
}

export interface GroupMember {
  sessionId: string
  /** 界面上显示用的名字（可选；面板拿会话标题填）。 */
  label?: string
  /** 用户给的身份（2026-11-19）：前端主程 / 后端主程 / 总经理……群内 agent 也读得到。 */
  role?: string
  /**
   * 头像（2026-11-25 用户 v2 需求④）：**data URL**（`data:image/png;base64,...`）。
   * 为什么存 data URL 而不是文件路径：头像很小（限 ≤12KB），直接塞进群记录省掉一套文件读写与清理；
   * 群记录本来就在 storages 里，备份/搬迁天然跟着走。
   */
  avatar?: string
  joinedAt: number
}

export interface GroupRecord {
  version: 2
  id: string
  name: string
  members: GroupMember[]
  createdAt: number
  updatedAt: number
  /** 群主（2026-11-19）：用户 @ 多个 agent 时由它分工；未设则按 @ 顺序直投。 */
  ownerSessionId?: string
  /**
   * 已经收到过「完整用法」的成员（sessionId → 时刻）。
   *
   * 2026-11-19：投递不再每条都灌一遍说明书——第一次完整，之后只带极短的头部。
   */
  briefed?: Record<string, number>
  /** 解散时刻（2026-11-19）：解散后群对成员不可用，记录保留给用户看。 */
  dissolvedAt?: number
}

export type EntryKind = 'user' | 'agent' | 'system'

export interface GroupEntry {
  at: number
  kind: EntryKind
  /** user = 'user'；agent = 发起它的会话 id。 */
  from: string
  /** 这条 @ 了谁（空 = 只说给用户看，不投递）。 */
  targets?: string[]
  text: string
  /** 给用户看的摘要（agent 回复才有）：首行「摘要：…」，解析不到取前 25 字。 */
  summary?: string
  /**
   * 这条投递被丢掉的标记。**字段保留、只读不写**（2026-11-26）。
   *
   * 互吹闸已经整个拆掉（机制层闸会误杀正常协作），但历史 jsonl 里还留着 `skipped: 'echo-gate'`
   * 这种行：读的时候必须能原样读出来、不许因为多了这个字段就报错，所以这个可选字段留着。
   */
  skipped?: string
}

export interface GroupsDeps {
  /** 群目录（`<dshHome>/storages/dsh-remote-dafeiyu/groups`）。 */
  dir: string
  /**
   * 群聊纪律是否已作为**常驻 system 段**挂上（2026-11-24 方案 A）。
   * true ⇒ 消息尾巴精简成一行（纪律已在系统提示里）；
   * false / 未提供 ⇒ 走老路：每条带完整纪律（宁多花 token，也不赌它没挂上）。
   */
  sectionReady?: () => boolean
  /** 群主分工的等待上限（毫秒，默认 90 秒）：超时降级为直投被 @ 的人。 */
  dispatchTimeoutMs?: number
  /** 同一对会话之间的投递冷却（毫秒，默认 60 秒）：防来回刷屏。 */
  cooldownMs?: number
  /** 把一段文本送进某个会话（插件层 sendPrompt）。 */
  /**
   * 把一段文本（可带图）送进某个会话。
   *
   * images 是**可选**：老宿主/老载具不带图时行为与以前完全一样；
   * 带图时投递方（index.ts 的 deliver）要把它转成内核认的 attachment 块。
   */
  deliver: (
    sessionId: string,
    text: string,
    images?: ReadonlyArray<GroupImage>,
  ) => Promise<{ ok: boolean; message?: string }>
  /** 会话标题（可注入；用于名单里显示名字，拿不到就用短号）。 */
  titleOf?: (sessionId: string) => string | undefined
  now?: () => number
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
}

export interface DeliveryResult {
  sessionId: string
  ok: boolean
  message?: string
  /**
   * 这次投递没真送出去的原因（历史遗留：旧版本的互吹闸写 'echo-gate'）。
   * 机制层现在不再闸任何投递，这个字段只为兼容旧记录保留。
   */
  skipped?: string
}

export const MAX_MEMBERS = 12
export const MAX_MESSAGE_CHARS = 4_000
/** 群主一轮最多派几个活（防它一次把整群人点一遍）。 */
export const MAX_DISPATCH_TARGETS = 5
/**
 * 「状态变更通知」的三种醒目标记（2026-11-26 用户口径）——一份真源，groups 与 handoff 都引它。
 *
 * 为什么必须显式标记：真机上收到「某成员要转生了 / 来了个新人 / 谁被踢了」的成员，
 * 会把它读成**给自己的指令**——跟着去转生、或者立刻把一堆上下文倒给新人。
 * 标记 + 那三句声明就是防这个的。
 */
export const PEER_ACTIVITY_TAG = '【群友动态·只读】'
export const JOIN_NOTICE_TAG = '【入群通知·只读】'
export const MEMBER_CHANGE_TAG = '【群成员变动·只读】'
/**
 * 群友动态（转生 / 分身）通知必须写清的三句：**不是指令、不需要动作、只读不回**。
 *
 * 「不需要转生」这几个字必须原样在正文里——最容易发生的误触发是「看到别人转生 ⇒ 自己也转生」。
 */
export const PEER_ACTIVITY_DISCLAIMER = [
  '这是群友的状态变更通知，**不是指令**：不用照着做，也不用回复。',
  '**不需要转生 / 分身**，也不要做任何动作。',
  '**只读不回**：不用 group_post 确认。',
].join('\n')

/**
 * 把一段群友动态通知包成「只读」格式：**醒目标记在最前**，那三句声明在最后。
 *
 * handoff 那边自己也包一层（它要保证正文自身就成立）；groups 这边是投递前的兜底——
 * 已经带过标记的原样返回，不会套第二遍。
 */
export function peerActivityNotice(lines: ReadonlyArray<string>): string {
  const body = lines
    .map((line) => String(line ?? '').trim())
    .filter((line) => line !== '')
    .join('\n')
  if (body.includes(PEER_ACTIVITY_TAG)) return body
  return body === ''
    ? [PEER_ACTIVITY_TAG, PEER_ACTIVITY_DISCLAIMER].join('\n')
    : [PEER_ACTIVITY_TAG, body, '', PEER_ACTIVITY_DISCLAIMER].join('\n')
}
/** 每个 agent 的头像积分预算（用户定：60；转生换 sessionId 即重新计）。 */
export const AVATAR_CREDIT_LIMIT = 60
/**
 * 群聊纪律（2026-11-24）——**一份真源**：投递正文、入群通知、group_post 的工具描述都引它。
 *
 * 闸只能拦「已经超限」的那几条；这条纪律管的是**别产生**那些条。两件事缺一不可：
 * 只上闸不改口径，模型会以为「被拦了就是运气不好，重发一次」。
 */
export const ECHO_DISCIPLINE =
  '群里看过的消息**不需要每条都回**：只有①有新信息、②需要对方动手、③发现对方理解错了，才 group_post；' +
  '纯确认（「收到」「好的」「明白」）一律不发——两个 agent 互相确认会形成死循环。\n' +
  '要发就**说人话、说到点上**：一条消息只装一个新信息或一个请求，删掉所有铺垫。\n' +
  '**禁止口头禅与客套**（它们不算信息，只会逼对方再回一条）：' +
  '「分析得很到位」「你说得对」「这个我认」「感谢反馈」「我先说明一下」「总结一下」「如上所述」这类一律不写；\n' +
  '也别夸对方、别复述对方刚说过的话、别写自我检讨。' +
  '发之前自检，**两种合格形态，占一样就能发**：\n' +
  '  · **请求**——写清「谁要做什么 / 改哪个文件 / 怎么算完成」；\n' +
  '  · **结果**——给出可核对的新信息：结论、数值、判据通过数、版本/commit、状态变化（带上时间和来源）。\n' +
  '两样都拿不出来的（只剩感受、复述、客套、确认），才是不该发的那条。' +
  '结果回复**不用**硬凑「改哪个文件」——报了结论和数字就够。\n' +
  '**首选形态：产物落盘 + 一句话**（2026-11-24）：把结论写进文件，群里只发 `· <文件路径> · <判据> · <结论一行>`，' +
  '对方按需读文件、不逐条回帖——既不占确认预算，也省掉一半往返。' +
  '前提：双方共享文件系统；**跨机**（对方读不到你的盘）就改成「贴关键 3~5 行 + 路径」。' +
  '注意：决策、否决理由、在等谁拍板**没有产物可落盘**，这类仍要直接写在群里。\n' +
  '**互聊刷屏期间不要去征询用户意见**（2026-11-25 用户定的）：群里正热闹时你问的那句话用户根本看不到，' +
  '只会白白打断协作。等这一轮安静下来，再把**结果 + 待用户拍板的项**一起汇报（一次说完，别一条条问）。'
/** 极短头部用的两行版（第二次起不再复述整段纪律）。 */
export const ECHO_DISCIPLINE_BRIEF =
  '只回有价值的：有新信息 / 要对方动手 / 对方理解错了才 group_post；「收到」「好的」这类确认别发。' +
  '说人话、说到点上：一条只装一个新信息或一个请求，不写客套与口头禅（「分析得很到位」「这个我认」「感谢反馈」），' +
  '也不夸对方、不复述、不自我检讨。' +
  '发之前占一样：请求（谁做什么/改哪/怎么算完）或结果（结论+数字/判据/版本）。结果回复不用硬凑文件。'

/**
 * 把 data URL 图落盘（2026-11-25 需求⑥）。
 *
 * 三条限制照用户口径：**最多 3 张、单张 ≤5MB**；超出直接拒（宁可不发，也别把群记录/上下文撑爆）。
 * 返回：给 agent 的绝对路径列表 + 给 deliver 的 base64 列表。
 */
/** 群图片落盘根目录（`<groups 目录>/images`）：createGroups 时绑定一次。 */
let imagesRoot = ''
function imagesDirRoot(): string {
  return imagesRoot
}

function saveImages(
  groupId: string,
  images: ReadonlyArray<string> | undefined,
): { ok: true; paths: string[]; images: GroupImage[] } | { ok: false; message: string } {
  const list = (images ?? []).filter((one) => typeof one === 'string' && one.trim() !== '')
  if (list.length === 0) return { ok: true, paths: [], images: [] }
  if (list.length > 3) return { ok: false, message: '一条消息最多带 3 张图。' }
  const dir = path.join(imagesDirRoot(), groupId)
  ensureDir(dir)
  const paths: string[] = []
  const out: GroupImage[] = []
  for (const [index, raw] of list.entries()) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(raw).trim())
    if (match === null) return { ok: false, message: '第 ' + (index + 1) + ' 张不是 png/jpeg/webp 的 data URL' }
    const mimeType = match[1]!
    const base64 = match[2]!.replace(/\s+/g, '')
    const bytes = Math.floor((base64.length * 3) / 4)
    if (bytes > 5 * 1024 * 1024) return { ok: false, message: '第 ' + (index + 1) + ' 张超过 5MB' }
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
    const file = path.join(dir, Date.now() + '-' + index + '.' + ext)
    try {
      writeFileSync(file, Buffer.from(base64, 'base64'))
    } catch (error) {
      return { ok: false, message: '图片落盘失败：' + String((error as Error)?.message ?? error).slice(0, 120) }
    }
    paths.push(file)
    out.push({ data: base64, mimeType })
  }
  return { ok: true, paths, images: out }
}

function ensureDir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* 写的时候还会再失败一次，由调用方报 */
  }
}

function safeId(id: string): string {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '_')
}

function groupPath(dir: string, id: string): string {
  return path.join(dir, safeId(id) + '.json')
}

function logPath(dir: string, id: string): string {
  return path.join(dir, safeId(id) + '.jsonl')
}

/** 会话短号：投递正文与界面都用它，别把整串 uuid 塞进别人上下文。 */
export function shortId(sessionId: string): string {
  return String(sessionId).replace(/^session-/, '').slice(0, 8)
}

export function readGroup(dir: string, id: string): GroupRecord | undefined {
  try {
    const parsed = JSON.parse(readFileSync(groupPath(dir, id), 'utf8')) as Partial<GroupRecord>
    if (typeof parsed?.id !== 'string' || typeof parsed.name !== 'string' || !Array.isArray(parsed.members)) {
      return undefined
    }
    return {
      version: 2,
      id: parsed.id,
      name: parsed.name,
      members: parsed.members,
      createdAt: Number(parsed.createdAt ?? 0),
      updatedAt: Number(parsed.updatedAt ?? 0),
      ...(typeof parsed.ownerSessionId === 'string' && parsed.ownerSessionId.trim() !== '' ? { ownerSessionId: parsed.ownerSessionId.trim() } : {}),
      ...(parsed.briefed !== null && typeof parsed.briefed === 'object' ? { briefed: parsed.briefed as Record<string, number> } : {}),
      ...(Number(parsed.dissolvedAt ?? 0) > 0 ? { dissolvedAt: Number(parsed.dissolvedAt) } : {}),
    }
  } catch {
    return undefined
  }
}

export function listGroups(dir: string): GroupRecord[] {
  try {
    const out: GroupRecord[] = []
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue
      const group = readGroup(dir, file.replace(/\.json$/, ''))
      if (group !== undefined) out.push(group)
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

/** 名单一行：`名字(身份)`，agent 靠它猜出各人职责。 */
export function rosterLine(group: GroupRecord, titleOf?: (sessionId: string) => string | undefined): string {
  return group.members
    .map((member) => {
      const title = member.label ?? titleOf?.(member.sessionId)?.trim()
      const name = title !== undefined && title !== '' ? title : shortId(member.sessionId)
      const crown = group.ownerSessionId === member.sessionId ? '👑' : ''
      const role = typeof member.role === 'string' && member.role.trim() !== '' ? '（' + member.role.trim() + '）' : ''
      return crown + name + role
    })
    .join('、')
}

/**
 * 从一段回复里取摘要（2026-11-19）。
 *
 * 约定写在 skill 里：回复首行写 `摘要：一句话`。解析不到就取正文前 25 个字兜底——
 * 群里那条气泡是给用户扫一眼的，全文仍然留在记录里（点开能看）。
 */
export function summarize(text: string): string {
  const raw = String(text ?? '')
  const firstLine = raw.split(/\r?\n/).map((line) => line.trim()).find((line) => line !== '') ?? ''
  const matched = /^(?:摘要|summary)\s*[:：]\s*(.+)$/i.exec(firstLine)
  if (matched !== null) {
    const summary = matched[1]!.trim()
    if (summary !== '') return summary.slice(0, 120)
  }
  const flat = raw.replace(/\s+/g, ' ').trim()
  return flat.slice(0, 25)
}

/** 投递给被 @ 的成员的那段话：只带他需要知道的（看不到整段群聊）。 */
export function deliveryText(
  group: GroupRecord,
  from: string,
  text: string,
  others: string[],
  titleOf?: (sessionId: string) => string | undefined,
  /** 这条是投给谁的：协作对象要把它排除掉（不能把自己列成自己的协作对象）。 */
  recipient?: string,
  /** 第二次及以后：只带极短头部，不再复述工具用法（2026-11-19）。 */
  brief?: boolean,
  /** 纪律已经是常驻 system 段了：尾巴可以精简（2026-11-24 方案 A）。 */
  sectionReady?: boolean,
): string {
  const peers = others
    .filter((sessionId) => sessionId !== from && sessionId !== recipient)
    .map((sessionId) => titleOf?.(sessionId)?.trim() || shortId(sessionId))
  const ownerLabel = group.ownerSessionId === undefined ? '' : titleOf?.(group.ownerSessionId)?.trim() || shortId(group.ownerSessionId)
  // 段已常驻 ⇒ 不论第几次都只带一行；段没挂上 ⇒ 老老实实带全文（老方法）。
  if (brief === true || sectionReady === true) {
    return [
      '【群 ' + group.name + ' · 来自 ' + (from === 'user' ? '用户' : shortId(from)) + '】',
      text.trim(),
      '成员：' + rosterLine(group, titleOf) + (ownerLabel === '' ? '' : '｜群主 ' + ownerLabel),
      ECHO_DISCIPLINE_BRIEF,
    ].join('\n')
  }
  return [
    '【群 ' + group.name + ' · ' + group.id + ' · 来自 ' + (from === 'user' ? '用户' : shortId(from)) + '】',
    text.trim(),
    '',
    '群成员：' + rosterLine(group, titleOf) + (ownerLabel === '' ? '' : '｜群主 ' + ownerLabel),
    peers.length > 0 ? '本轮协作对象：' + peers.join('、') : '本轮只有你。',
    ECHO_DISCIPLINE,
    '你看不到群里的整段记录（插件只投给你被 @ 的部分）。要说点什么就调 group_post：groupId=' +
      group.id +
      '，text 写正文；要直接找某个成员，把 to 填成对方的短号或会话 id。',
    group.ownerSessionId === undefined
      ? '想看最近记录用 group_read(groupId=' + group.id + ')。'
      : '汇报对象：群主 ' + (titleOf?.(group.ownerSessionId)?.trim() || shortId(group.ownerSessionId)) +
        '（你的 group_post 不带 to 时默认回给群主）；想看最近记录用 group_read(groupId=' + group.id + ')。',
  ].join('\n')
}

/**
 * 入群通知 · **新成员本人**（2026-11-26 用户口径）：保留完整的用法说明。
 *
 * 新人（和刚被唤醒的成员）只收到这一份：怎么 group_post、摘要格式、群主是谁、指南在哪。
 */
export function joinNoticeForNewcomer(group: GroupRecord, titleOf?: (sessionId: string) => string | undefined): string {
  const owner = group.ownerSessionId === undefined ? '' : titleOf?.(group.ownerSessionId)?.trim() || shortId(group.ownerSessionId)
  return [
    '【入群通知 · ' + group.name + ' · ' + group.id + '】',
    '你被拉进这个群了（这是一次唤醒：不用等用户再喊你）。',
    '群成员：' + rosterLine(group, titleOf) + (owner === '' ? '' : '｜群主 ' + owner + '（用户 @ 多人时由群主分工）'),
    '',
    '用法（之后的消息只带极短头部，这份说明不再重复；忘了可以调 groups_guide）：',
    '· 有人 @ 你时你会收到一条独立消息，带「本轮协作对象」——你看不到群里的其他消息；',
    '· 回复用 group_post(groupId=' + group.id + ', text=...)，**首行写「摘要：一句话」**（群里只显示摘要，全文点开才看）；',
    '· 不带 to 时默认回给群主（汇报对象）；to 可以填对方短号或会话 id；',
    '· ' + ECHO_DISCIPLINE,
    '· 想看最近记录用 group_read(groupId=' + group.id + ')。',
    '· 如果你的工具列表里没有 group_*（老会话），用 HTTP 兜底：把你自己的会话 id 和正文 POST 到',
    '  <DSH Web GUI 的 origin>/plugins/dafeiyu-groups/agent-post（本机回环，带 x-drc-pair: 1；',
    '  body = {"groupId":"' + group.id + '","sessionId":"<你的会话id>","text":"…"}）。读用 agent-read。',
    '',
    '如果你现在正忙，先把这条记下；有空再回。知道有这个群、知道怎么回就够了。',
  ].join('\n')
}

/**
 * 入群通知 · **老成员**（2026-11-26 用户口径）：标题带「·只读」，正文一句话。
 *
 * 真机现象：老人一收到「新人进群」就主动开交接，倒一堆上下文过去，新人反而被淹没。
 * 所以这份通知**不带用法、不带分工请求**——等新人自己判断缺什么来问，再来答。
 */
export function joinNoticeForVeteran(
  group: GroupRecord,
  subject: string,
  titleOf?: (sessionId: string) => string | undefined,
): string {
  const who = titleOf?.(subject)?.trim() || shortId(subject)
  return [
    JOIN_NOTICE_TAG,
    '【群 ' + group.name + ' · ' + group.id + '】',
    '新成员 ' + who + ' 已入群。**你不需要主动交接**；等新人自己判断缺什么来问你，再来答。',
    '只读不回：不用回复、也不用确认。',
  ].join('\n')
}

/**
 * 成员变动通知（发给**留下的人**）：谁进来了 / 谁走了（2026-11-26 改「只读」口径）。
 *
 * · 「加入」= 老成员那份只读入群通知；
 * · 「离开」= 标题【群成员变动·只读】，并写明「这是他/她的状态变更，只读不回，不用确认、不用补位」——
 *   否则群里会刷一片「收到」。
 */
export function memberNotice(group: GroupRecord, subject: string, action: '加入' | '离开', titleOf?: (sessionId: string) => string | undefined): string {
  const who = titleOf?.(subject)?.trim() || shortId(subject)
  if (action === '加入') return joinNoticeForVeteran(group, subject, titleOf)
  return [
    MEMBER_CHANGE_TAG,
    '【群 ' + group.name + ' · ' + group.id + '】',
    who + ' 离开了本群（被移出，或自己退群）。',
    '这是他/她的状态变更，**只读不回**：不用确认、不用补位。',
    '现在的成员：' + rosterLine(group, titleOf),
  ].join('\n')
}

/**
 * 「分工请求」：用户一次 @ 多个人时，投给群主的那条（2026-11-20）。
 *
 * 之前的实现只把 targets 换成群主，正文还是原话——于是群主看到的是「本轮只有你」，
 * 既不知道用户 @ 了谁，也不知道自己被要求分工（真机报的正是这个）。
 */
export function dispatchText(
  group: GroupRecord,
  asked: string[],
  text: string,
  titleOf?: (sessionId: string) => string | undefined,
): string {
  const names = asked.map((id) => {
    const title = titleOf?.(id)?.trim()
    return title !== undefined && title !== '' ? title : shortId(id)
  })
  return [
    '【分工请求 · ' + group.name + ' · ' + group.id + '】',
    '用户 @ 了：' + names.join('、'),
    '',
    '原话：' + text.trim(),
    '',
    '你来安排分工：用 group_post(groupId=' + group.id + '，text=...，to=[...]) 派活（一轮最多 5 个）。',
    '派完在群里回一条摘要（首行「摘要：…」）。',
    '90 秒内没人派活，系统会直接把原话投给他们，并记一笔「群主未分工」。',
  ].join('\n')
}

/** 群不可用（解散 / 被移出）时给受影响会话的告知。 */
export function unavailableNotice(group: GroupRecord, reason: 'dissolved' | 'removed'): string {
  return [
    '【群 ' + group.name + ' · ' + group.id + '】',
    reason === 'dissolved'
      ? '这个群已经解散，**对你不再可用**：别再往这里发消息，也不需要再等群里的其他通知。'
      : '你已经被移出这个群，**本群对你不再可用**：别再往这里发消息，后续别再引用这里的结论。',
    '如果你还有没同步完的事情，直接问用户。',
  ].join('\n')
}

export function createGroups(deps: GroupsDeps) {
  const now = deps.now ?? (() => Date.now())
  const titleOf = deps.titleOf
  // 群图片落在 `<groups 目录>/images/<群id>/`（saveImages 是模块级函数，靠这个指针拿根目录）
  imagesRoot = path.join(deps.dir, 'images')

  const save = (group: GroupRecord): boolean => {
    ensureDir(deps.dir)
    try {
      writeFileSync(groupPath(deps.dir, group.id), JSON.stringify(group, null, 2) + '\n', 'utf8')
      return true
    } catch {
      return false
    }
  }

  const append = (id: string, entry: GroupEntry): void => {
    try {
      ensureDir(deps.dir)
      appendFileSync(logPath(deps.dir, id), JSON.stringify(entry) + '\n', 'utf8')
    } catch {
      /* 记录写不进去：投递照做，read 时少一条 */
    }
  }

  const newId = (at: number): string => {
    const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.()
    return 'g-' + (uuid ?? String(at) + Math.random().toString(36).slice(2, 8)).replace(/-/g, '').slice(0, 10)
  }

  /*
   * 互吹闸（机制层）已于 2026-11-26 整个拆掉（用户口径：它把正常协作也误杀了）。
   * 现在只剩两样：上面的投递冷却，以及 ECHO_DISCIPLINE 那套**纪律文案**
   * （照旧拼进投递正文与常驻 system 段；纪律管「别产生那些消息」，机制不再丢投递）。
   * GroupEntry.skipped / DeliveryResult.skipped 字段保留，只为读得懂历史 jsonl。
   */

  const deliverEach = async (
    group: GroupRecord,
    from: string,
    text: string,
    targets: string[],
    /** true = 原样投递（分工请求这种已经写好的整段话），不再套普通投递头。 */
    raw = false,
    /** 随这条消息一起发的图（2026-11-25 需求⑥）：原样交给 deliver，由它转成内核 attachment。 */
    images?: ReadonlyArray<GroupImage>,
  ): Promise<DeliveryResult[]> => {
    // 纪律是否已常驻为 system 段：决定这次尾巴的精简程度（2026-11-24 方案 A）
    const sectionReady = deps.sectionReady?.() === true
    const out: DeliveryResult[] = []
    for (const target of targets) {
      if (target === from) continue
      if (!group.members.some((member) => member.sessionId === target)) continue
      /*
       * ① 冷却：只防「成员 ↔ 成员」来回刷屏（2026-11-20 真机：群主刚派完活回一句，被 60 秒冷却吞了）。
       *
       * 群主是调度通道——它和成员之间的往返是主链路，不能被节流；
       * 真正有死循环风险的是「A ↔ B 互回」，那里留着冷却。
       */
      const ownerInvolved =
        group.ownerSessionId !== undefined && (from === group.ownerSessionId || target === group.ownerSessionId)
      const key = group.id + '|' + from + '|' + target
      const last = lastDeliveryAt.get(key)
      if (!ownerInvolved && last !== undefined && now() - last < cooldownMs) {
        out.push({ sessionId: target, ok: true, message: '冷却中（' + Math.round(cooldownMs / 1000) + ' 秒内已投过一次），本次跳过' })
        continue
      }
      lastDeliveryAt.set(key, now())
      // 每个收件人一份正文：协作对象里不能出现他自己；第二次起只带极短头部。
      const brief = group.briefed?.[target] !== undefined
      const body = raw
        ? text
        : deliveryText(group, from, text, targets, titleOf, target, brief, sectionReady)
      const result = await deps.deliver(target, body, images).catch((error: unknown) => ({
        ok: false,
        message: String((error as Error)?.message ?? error),
      }))
      out.push({
        sessionId: target,
        ok: result.ok === true,
        ...(result.ok === true || result.message === undefined ? {} : { message: String(result.message).slice(0, 160) }),
      })
      // 投成功就记一笔"这个成员已经知道怎么用了"，之后改投极短版本
      if (result.ok === true) {
        group.briefed = { ...(group.briefed ?? {}), [target]: now() }
        save(group)
      }
    }
    return out
  }

  /** 取群并判"还活着"。解散后的群对写入一律拒。 */
  const live = (id: string): { group?: GroupRecord; message?: string } => {
    const group = readGroup(deps.dir, String(id ?? '').trim())
    if (group === undefined) return { message: '没有这个群（id 可能不对）。' }
    if (group.dissolvedAt !== undefined) return { message: '这个群已经解散了，用不了。' }
    return { group }
  }

  /*
   * 群主分工的降级计时器 & 投递冷却（2026-11-19）。
   *
   * - 降级：用户 @ 多人后只投给群主；群主 90 秒没派活就直投被 @ 的人，并记一笔
   *   「群主未分工，本轮并行处理」——不能让整轮挂在群主身上；
   * - 冷却：同一对会话 60 秒内只投一次，防 A↔B 来回刷。
   */
  const dispatchTimeoutMs = deps.dispatchTimeoutMs ?? 90_000
  const cooldownMs = deps.cooldownMs ?? 60_000
  const pendingDispatch = new Map<string, ReturnType<typeof setTimeout>>()
  const lastDeliveryAt = new Map<string, number>()

  const cancelDispatch = (id: string): void => {
    const timer = pendingDispatch.get(id)
    if (timer === undefined) return
    try {
      clearTimeout(timer)
    } catch {
      /* 清不掉也不影响 */
    }
    pendingDispatch.delete(id)
  }

  const armDispatch = (group: GroupRecord, targets: string[], text: string): void => {
    cancelDispatch(group.id)
    const timer = setTimeout(() => {
      pendingDispatch.delete(group.id)
      void (async () => {
        const fresh = readGroup(deps.dir, group.id)
        if (fresh === undefined || fresh.dissolvedAt !== undefined) return
        append(fresh.id, { at: now(), kind: 'system', from: 'system', text: '群主未分工，本轮并行处理' })
        const results = await deliverEach(fresh, 'user', text, targets)
        deps.log('群主未分工，降级直投', {
          id: fresh.id,
          targets: targets.length,
          failed: results.filter((row) => !row.ok).length,
        })
      })()
    }, dispatchTimeoutMs)
    try {
      ;(timer as { unref?: () => void }).unref?.()
    } catch {
      /* 环境没有 unref 就算了 */
    }
    pendingDispatch.set(group.id, timer)
  }

  /** 给全体成员发一段话（送给不到的记进结果）。 */
  const notifyAll = async (group: GroupRecord, subject: string, text: string): Promise<DeliveryResult[]> => {
    const results: DeliveryResult[] = []
    for (const member of group.members) {
      if (member.sessionId === subject) continue
      const result = await deps.deliver(member.sessionId, text).catch((error: unknown) => ({
        ok: false,
        message: String((error as Error)?.message ?? error),
      }))
      results.push({
        sessionId: member.sessionId,
        ok: result.ok === true,
        ...(result.ok === true || result.message === undefined ? {} : { message: String(result.message).slice(0, 160) }),
      })
    }
    return results
  }

  return {
    /** 建群：发起方自动入群（除非给了 includeMe:false），可顺手带几个成员。 */
    create(input: { name: string; members?: string[]; me?: string; includeMe?: boolean; owner?: string }): {
      ok: boolean
      group?: GroupRecord
      message?: string
    } {
      const name = String(input.name ?? '').trim().slice(0, 40)
      if (name === '') return { ok: false, message: '群要有个名字（name）。' }
      const at = now()
      const ids: string[] = []
      const push = (id: string): void => {
        const trimmed = String(id ?? '').trim()
        if (trimmed !== '' && !ids.includes(trimmed)) ids.push(trimmed)
      }
      if (input.includeMe !== false && typeof input.me === 'string' && input.me.trim() !== '') push(input.me)
      for (const id of input.members ?? []) push(id)
      if (ids.length === 0) return { ok: false, message: '群里至少要有一个人（发起方）。' }
      if (ids.length > MAX_MEMBERS) return { ok: false, message: '一个群最多 ' + MAX_MEMBERS + ' 个会话。' }
      const group: GroupRecord = {
        version: 2,
        id: newId(at),
        name,
        members: ids.map((sessionId) => {
          const label = titleOf?.(sessionId)?.trim()
          return { sessionId, joinedAt: at, ...(label ? { label } : {}) }
        }),
        createdAt: at,
        updatedAt: at,
        // 群主：显式指定的优先，否则发起方（或群里第一个人）当群主。
        ...((): { ownerSessionId?: string } => {
          const want = String(input.owner ?? '').trim()
          if (want !== '' && ids.includes(want)) return { ownerSessionId: want }
          return ids.length > 0 ? { ownerSessionId: ids[0]! } : {}
        })(),
      }
      if (!save(group)) return { ok: false, message: '群没落盘（目录不可写）。' }
      append(group.id, { at, kind: 'system', from: 'system', text: '建群：' + group.name + '（' + group.members.length + ' 人）' })
      deps.log('建群', { id: group.id, members: group.members.length })
      return { ok: true, group }
    },

    /** 拉人进群：加成员 + 给每个新成员发入群通知（带名单与用法）。 */
    async invite(input: { id: string; members: string[] }): Promise<{
      ok: boolean
      group?: GroupRecord
      added?: string[]
      notified?: DeliveryResult[]
      message?: string
    }> {
      const group = readGroup(deps.dir, String(input.id ?? '').trim())
      if (group === undefined) return { ok: false, message: '没有这个群（id 可能不对）。' }
      const added: string[] = []
      for (const raw of input.members ?? []) {
        const id = String(raw ?? '').trim()
        if (id === '' || group.members.some((member) => member.sessionId === id)) continue
        if (group.members.length >= MAX_MEMBERS) break
        const label = titleOf?.(id)?.trim()
        group.members.push({ sessionId: id, joinedAt: now(), ...(label ? { label } : {}) })
        added.push(id)
      }
      group.updatedAt = now()
      if (!save(group)) return { ok: false, message: '成员没写进去（目录不可写）。' }
      if (added.length === 0) return { ok: true, group, added }
      const notified: DeliveryResult[] = []
      for (const id of added) {
        // 新成员收到入群须知（名单 + 用法）；**其余全体**收到一份「入群通知·只读」
        // （原来这里是「XX 加入了本群」的一句话，老成员一看就去交接，2026-11-26 改掉）。
        const joined = await deps.deliver(id, joinNoticeForNewcomer(group, titleOf)).catch((error: unknown) => ({
          ok: false,
          message: String((error as Error)?.message ?? error),
        }))
        notified.push({
          sessionId: id,
          ok: joined.ok === true,
          ...(joined.ok === true || joined.message === undefined ? {} : { message: String(joined.message).slice(0, 160) }),
        })
        const others = await notifyAll(group, id, memberNotice(group, id, '加入', titleOf))
        notified.push(...others)
        append(group.id, { at: now(), kind: 'system', from: 'system', text: shortId(id) + ' 加入了本群' })
      }
      return { ok: true, group, added, notified }
    },

    /** 退群。 */
    leave(input: { id: string; sessionId: string }): { ok: boolean; message?: string } {
      const group = readGroup(deps.dir, String(input.id ?? '').trim())
      if (group === undefined) return { ok: false, message: '没有这个群。' }
      const before = group.members.length
      group.members = group.members.filter((member) => member.sessionId !== input.sessionId)
      group.updatedAt = now()
      if (!save(group)) return { ok: false, message: '没保存成功（目录不可写）。' }
      if (before !== group.members.length) {
        append(group.id, { at: now(), kind: 'system', from: 'system', text: shortId(input.sessionId) + ' 退出了群' })
      }
      return before === group.members.length ? { ok: true, message: '本来就不在群里。' } : { ok: true }
    },

    /**
     * 主动唤醒成员（2026-11-19）：建群之后要把「你进群了」推给每个成员。
     *
     * 为什么不能等用户的第一条群消息：agent 空闲时不会自己去看什么——
     * 用户不说一句，它就不知道自己被拉进群了。所以建群/加人之后立刻推一次入群通知
     * （带用法），并把成员标成已告知，之后的消息走极短版。
     */
    async announce(input: { id: string; except?: string }): Promise<{ ok: boolean; notified?: DeliveryResult[]; message?: string }> {
      const alive = live(input.id)
      if (alive.group === undefined) return { ok: false, message: alive.message }
      const group = alive.group
      const notified: DeliveryResult[] = []
      for (const member of group.members) {
        if (member.sessionId === input.except) continue
        const result = await deps.deliver(member.sessionId, joinNoticeForNewcomer(group, titleOf)).catch((error: unknown) => ({
          ok: false,
          message: String((error as Error)?.message ?? error),
        }))
        notified.push({
          sessionId: member.sessionId,
          ok: result.ok === true,
          ...(result.ok === true || result.message === undefined ? {} : { message: String(result.message).slice(0, 160) }),
        })
        if (result.ok === true) {
          group.briefed = { ...(group.briefed ?? {}), [member.sessionId]: now() }
          save(group)
        }
      }
      return { ok: notified.every((row) => row.ok), notified }
    },

    /**
     * 改群名（2026-11-25 用户 v2 需求⑤）。
     *
     * 规则：1~40 字、去首尾空白、不允许空串；改完写一条 system 记录（群里能看到谁改的），
     * 并**给所有成员投一条极短通知**——否则群成员的消息头里还是旧群名，对不上。
     */
    renameGroup(input: { id: string; name: string; by?: string }): { ok: boolean; group?: GroupRecord; message?: string } {
      const alive = live(input.id)
      if (alive.group === undefined) return { ok: false, message: alive.message }
      const group = alive.group
      const next = String(input.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
      if (next === '') return { ok: false, message: '群名不能为空' }
      if (next === group.name) return { ok: true, group }
      const before = group.name
      group.name = next
      group.updatedAt = now()
      save(group)
      append(group.id, {
        at: now(),
        kind: 'system',
        from: 'system',
        text: '群名：「' + before + '」→「' + next + '」' + (input.by === undefined ? '' : '（' + shortId(input.by) + '）'),
      })
      return { ok: true, group }
    },

    /** 设置某个成员的身份（用户可在面板改；agent 走 group_set_role 工具，权限由调用方把关）。 */
    setMemberRole(input: { id: string; sessionId: string; role: string }): { ok: boolean; group?: GroupRecord; message?: string } {
      const alive = live(input.id)
      if (alive.group === undefined) return { ok: false, message: alive.message }
      const group = alive.group
      const member = group.members.find((row) => row.sessionId === input.sessionId) ??
        group.members.find((row) => shortId(row.sessionId) === String(input.sessionId ?? '').trim())
      if (member === undefined) return { ok: false, message: '这个人不在群里。' }
      const role = String(input.role ?? '').trim().slice(0, 20)
      if (role === '') delete member.role
      else member.role = role
      group.updatedAt = now()
      save(group)
      append(group.id, {
        at: now(),
        kind: 'system',
        from: 'system',
        text: shortId(member.sessionId) + (role === '' ? ' 的身份已清空' : ' 的身份设为「' + role + '」'),
      })
      return { ok: true, group }
    },

    /**
     * 头像积分记账（2026-11-25 需求④）：**每个 agent 60 积分**，记在本群目录的 `avatar-budget.json`。
     *
     * 口径（用户定的）：① 不结转、按 sessionId 记；② agent 转生后是新 sessionId ⇒ 自然重新计 60；
     * ③ 这是**软预算**——真正的停止条件是 xyq 账号余额不足（agent 先查 xyq_balance）；
     * ④ 小云雀账号每月 28 日重置，临近重置那几天把余额花掉是允许的。
     */
    spendAvatarCredits(input: { sessionId: string; credits: number }): {
      ok: boolean
      used: number
      limit: number
      message?: string
    } {
      const limit = AVATAR_CREDIT_LIMIT
      const id = String(input.sessionId ?? '').trim()
      const spend = Math.max(0, Math.round(Number(input.credits) || 0))
      if (id === '') return { ok: false, used: 0, limit, message: '缺少 sessionId' }
      const file = path.join(deps.dir, 'avatar-budget.json')
      let map: Record<string, number> = {}
      try {
        map = JSON.parse(readFileSync(file, 'utf8')) as Record<string, number>
      } catch {
        map = {}
      }
      const used = Number(map[id] ?? 0)
      if (spend > 0 && used + spend > limit) {
        return {
          ok: false,
          used,
          limit,
          message: '头像积分预算用完（' + used + '/' + limit + '）：别再加码，换更省的尺寸/档位，或就此收手',
        }
      }
      if (spend > 0) {
        map[id] = used + spend
        try {
          writeFileSync(file, JSON.stringify(map, null, 2) + '\n', 'utf8')
        } catch {
          /* 记账写不进去不阻断：软预算，别为了记账把功能搞挂 */
        }
      }
      return { ok: true, used: map[id] ?? used, limit }
    },

    /**
     * 设置成员头像（2026-11-25 需求④）。
     *
     * 只接受 data URL 且 ≤12KB——面板里是个 <img src>，直接内联最省事；超大图会让群记录膨胀，直接拒。
     * 传空串 = 清空头像。
     */
    setMemberAvatar(input: {
      id: string
      sessionId: string
      avatar: string
    }): { ok: boolean; group?: GroupRecord; message?: string } {
      const alive = live(input.id)
      if (alive.group === undefined) return { ok: false, message: alive.message }
      const group = alive.group
      const member = group.members.find((row) => row.sessionId === input.sessionId) ??
        group.members.find((row) => shortId(row.sessionId) === String(input.sessionId ?? '').trim())
      if (member === undefined) return { ok: false, message: '这个人不在群里。' }
      const avatar = String(input.avatar ?? '').trim()
      if (avatar === '') {
        delete member.avatar
      } else {
        if (!/^data:image\/(png|jpeg|webp);base64,/.test(avatar)) {
          return { ok: false, message: '头像必须是 data:image/png|jpeg|webp 的 base64 data URL' }
        }
        if (avatar.length > 12_000) return { ok: false, message: '头像太大（>12KB）：请压缩到 128×128 左右' }
        member.avatar = avatar
      }
      group.updatedAt = now()
      save(group)
      append(group.id, {
        at: now(),
        kind: 'system',
        from: 'system',
        text: shortId(member.sessionId) + (avatar === '' ? ' 清空了头像' : ' 换了头像'),
      })
      return { ok: true, group }
    },

    /** 指定 / 更换群主（必须是群成员）。 */
    setOwner(input: { id: string; sessionId: string }): { ok: boolean; group?: GroupRecord; message?: string } {
      const alive = live(input.id)
      if (alive.group === undefined) return { ok: false, message: alive.message }
      const group = alive.group
      const target = String(input.sessionId ?? '').trim()
      const member = group.members.find((row) => row.sessionId === target) ??
        group.members.find((row) => shortId(row.sessionId) === target)
      if (member === undefined) return { ok: false, message: '群主必须是群成员。' }
      group.ownerSessionId = member.sessionId
      group.updatedAt = now()
      save(group)
      append(group.id, { at: now(), kind: 'system', from: 'system', text: shortId(member.sessionId) + ' 成为群主' })
      return { ok: true, group }
    },

    /** 把某个成员移出群：通知他本人「不再可用」，通知剩下的人「XX 离开了本群」。 */
    async remove(input: { id: string; sessionId: string }): Promise<{
      ok: boolean
      group?: GroupRecord
      notified?: DeliveryResult[]
      message?: string
    }> {
      const alive = live(input.id)
      if (alive.group === undefined) return { ok: false, message: alive.message }
      const group = alive.group
      const subject = String(input.sessionId ?? '').trim()
      if (!group.members.some((member) => member.sessionId === subject)) {
        return { ok: false, message: '这个会话不在群里。' }
      }
      group.members = group.members.filter((member) => member.sessionId !== subject)
      group.updatedAt = now()
      save(group)
      append(group.id, { at: now(), kind: 'system', from: 'system', text: shortId(subject) + ' 被移出了本群' })
      const notified: DeliveryResult[] = []
      const kicked = await deps.deliver(subject, unavailableNotice(group, 'removed')).catch((error: unknown) => ({
        ok: false,
        message: String((error as Error)?.message ?? error),
      }))
      notified.push({ sessionId: subject, ok: kicked.ok === true, ...(kicked.message === undefined ? {} : { message: kicked.message }) })
      const others = await notifyAll(group, subject, memberNotice(group, subject, '离开', titleOf))
      notified.push(...others)
      return { ok: true, group, notified }
    },

    /** 解散群：通知全体「本群已解散、不再可用」，记录保留给用户看。 */
    async dissolve(input: { id: string }): Promise<{
      ok: boolean
      group?: GroupRecord
      notified?: DeliveryResult[]
      message?: string
    }> {
      const alive = live(input.id)
      if (alive.group === undefined) return { ok: false, message: alive.message }
      const group = alive.group
      group.dissolvedAt = now()
      group.updatedAt = group.dissolvedAt
      save(group)
      append(group.id, { at: group.dissolvedAt, kind: 'system', from: 'system', text: '群已解散' })
      const notified: DeliveryResult[] = []
      for (const member of group.members) {
        const result = await deps.deliver(member.sessionId, unavailableNotice(group, 'dissolved')).catch((error: unknown) => ({
          ok: false,
          message: String((error as Error)?.message ?? error),
        }))
        notified.push({
          sessionId: member.sessionId,
          ok: result.ok === true,
          ...(result.ok === true || result.message === undefined ? {} : { message: String(result.message).slice(0, 160) }),
        })
      }
      return { ok: true, group, notified }
    },

    /**
     * 一条群消息：`kind:'user'` 是用户在界面上发的（targets = 他 @ 的人），
     * `kind:'agent'` 是某个成员用 group_post 发的。**只投给 targets**。
     */
    async post(input: {
      id: string
      from: string
      text: string
      targets?: string[]
      kind?: EntryKind
      /** true = 原样投递（转生预告/交接完成这种已写好的整段话），不套普通投递头。 */
      raw?: boolean
      /**
       * 随消息一起发的图（2026-11-25 需求⑥）：**data URL 数组**，最多 3 张、单张 ≤5MB。
       *
       * 服务端负责：解码 → 落盘到 `<群目录>/images/<群id>/<时间戳>-<n>.<ext>` → 把路径追加进正文
       * （agent 侧「当文件用」靠这一行）→ 再把 base64 交给 deliver 转成内核 attachment（「看得到」靠这块）。
       */
      images?: ReadonlyArray<string>
    }): Promise<{
      ok: boolean
      entry?: GroupEntry
      delivered?: DeliveryResult[]
      failed?: DeliveryResult[]
      message?: string
    }> {
      const alive = live(input.id)
      if (alive.group === undefined) return { ok: false, message: alive.message ?? '没有这个群（先 group_create）。' }
      const group = alive.group
      const rawText = String(input.text ?? '').trim()
      const hasImages = Array.isArray(input.images) && input.images.length > 0
      // 只发图（2026-11-25）：正文可以空，给个占位，别把带图消息判成空消息
      const text = rawText === '' && hasImages ? '（图片）' : rawText
      if (text === '') return { ok: false, message: '消息不能是空的。' }
      if (text.length > MAX_MESSAGE_CHARS) return { ok: false, message: '单条最多 ' + MAX_MESSAGE_CHARS + ' 字，拆开发。' }
      const kind: EntryKind = input.kind === 'user' ? 'user' : input.kind === 'system' ? 'system' : 'agent'
      const from = String(input.from ?? '').trim()
      if (kind === 'agent' && !group.members.some((member) => member.sessionId === from)) {
        return { ok: false, message: '你不在这个群里（先 group_invite 把自己加进去）。' }
      }
      const asked = (input.targets ?? [])
        .map((id) => String(id ?? '').trim())
        .filter((id) => id !== '' && group.members.some((member) => member.sessionId === id))
      const owner = group.ownerSessionId

      /*
       * 群主分工（2026-11-19）：
       * 用户一次 @ 多个人时，**不直接撒给所有人**，而是只投给群主 + 一句「你来分工」；
       * 群主用 group_post(to=[...]) 派活。超时没派活就降级为直投被 @ 的人。
       *
       * agent 侧：不带 to 时默认回给群主（汇报对象），这样一轮里消息路径是
       * 「群主 → 成员」与「成员 → 群主」，不会 A↔B 来回刷。
       */
      /*
       * 用户一次 @ 多个人 ⇒ 只投群主，而且投的是**分工请求**（不是原话）：
       * 群主得知道「用户 @ 了谁」和「我被要求分工」，否则它看到的就是一句「本轮只有你」。
       */
      const isDispatch = kind === 'user' && owner !== undefined && asked.length >= 2
      let targets = asked
      let body = text
      if (isDispatch) {
        targets = [owner]
        body = dispatchText(group, asked, text, titleOf)
      } else if (kind === 'agent' && asked.length === 0 && owner !== undefined && owner !== from) {
        targets = [owner]
      }
      // raw 是「成品整段话」（转生预告/交接完成），不是派活，不该受派活个数上限约束。
      if (kind === 'agent' && from === owner && targets.length > MAX_DISPATCH_TARGETS && input.raw !== true) {
        return { ok: false, message: '群主一次最多派 ' + MAX_DISPATCH_TARGETS + ' 个活：拆成几轮。' }
      }

      const entry: GroupEntry = {
        at: now(),
        kind,
        from,
        // 记录里写用户真正 @ 的人（群里要能看出 @全体），投递才用 owner-only 的 targets
        ...(asked.length > 0 ? { targets: asked } : {}),
        text,
        ...(kind === 'agent' ? { summary: summarize(text) } : {}),
      }
      append(group.id, entry)
      group.updatedAt = now()
      save(group)

      // 群主派了活 ⇒ 取消这一轮的降级计时器
      if (kind === 'agent' && from === owner && targets.length > 0) cancelDispatch(group.id)
      // 用户 @ 多人 ⇒ 起一个降级计时器（超时直投被 @ 的人）
      if (isDispatch) armDispatch(group, asked, text)

      if (targets.length === 0) return { ok: true, entry }
      /* 图：解码 + 落盘 + 在正文末尾给路径（「看到」靠 attachment，「当文件用」靠这行路径）。 */
      const saved = saveImages(group.id, input.images)
      if (saved.ok !== true) return { ok: false, message: saved.message }
      const bodyWithFiles =
        saved.paths.length === 0
          ? body
          : body + '\n\n附件（已落盘，可直接读）:\n' + saved.paths.map((one) => '· ' + one).join('\n')
      /*
       * 成品通告（raw：转生/分身广播、交接完成）一律按「群友动态·只读」发（2026-11-26 用户口径）。
       *
       * 收件人最容易犯的错是把这类通知读成**给自己的指令**（看到别人转生，自己跟着也转）。
       * handoff 那边自己也包了一层；这里是投递前的最后一道兜底——已带标记就不再套第二遍。
       * 分工请求（isDispatch）是**真指令**，不能套这个头。
       */
      const outgoing = input.raw === true && !isDispatch ? peerActivityNotice([bodyWithFiles]) : bodyWithFiles
      const results = await deliverEach(
        group,
        kind === 'user' ? 'user' : from,
        outgoing,
        targets,
        isDispatch || input.raw === true,
        saved.images,)
      const failed = results.filter((row) => !row.ok)
      deps.log('群投递', { id: group.id, targets: targets.length, failed: failed.length })
      return {
        ok: failed.length === 0,
        entry,
        delivered: results.filter((row) => row.ok),
        failed,
        ...(failed.length === 0
          ? {}
          : { message: '有 ' + failed.length + ' 个成员没送到（可能已归档或宿主不支持发消息），清单在 failed 里。' }),
      }
    },

    /** 兼容旧调用：发一条给群里其他所有人（等价于 post 且 targets = 全部其他人）。 */
    async send(input: { id: string; from: string; text: string }) {
      const group = readGroup(deps.dir, String(input.id ?? '').trim())
      if (group === undefined) return { ok: false as const, message: '没有这个群（先 group_create）。' }
      const targets = group.members.map((member) => member.sessionId).filter((id) => id !== input.from)
      return this.post({ id: input.id, from: input.from, text: input.text, targets, kind: 'agent' })
    },

    /** 读最近的记录（默认 20，上限 100）。 */
    read(input: { id: string; limit?: number }): { ok: boolean; messages?: GroupEntry[]; message?: string } {
      const group = readGroup(deps.dir, String(input.id ?? '').trim())
      if (group === undefined) return { ok: false, message: '没有这个群。' }
      const limit = Math.min(100, Math.max(1, Math.round(Number(input.limit ?? 20) || 20)))
      const file = logPath(deps.dir, group.id)
      if (!existsSync(file)) return { ok: true, messages: [] }
      try {
        const lines = readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '')
        const messages: GroupEntry[] = []
        for (const line of lines.slice(-limit)) {
          try {
            const parsed = JSON.parse(line) as GroupEntry
            if (typeof parsed?.text === 'string' && typeof parsed.from === 'string') messages.push(parsed)
          } catch {
            /* 坏一行跳过 */
          }
        }
        return { ok: true, messages }
      } catch {
        return { ok: false, message: '日志读不出来。' }
      }
    },

    list: () => listGroups(deps.dir),
    get: (id: string) => readGroup(deps.dir, id),
  }
}

export type Groups = ReturnType<typeof createGroups>
