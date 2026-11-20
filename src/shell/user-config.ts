/**
 * user-config — 设置页「进阶」那一栏写下的自定义项（自部署地址 / 自己的 token）。
 *
 * ## 为什么是一个**独立的落盘文件**，而不是直接改 `cordis.patch.yml`
 *
 * 用户的 profile 里那份 patch 是**宿主与别的插件共用的**、而且是有注释的 YAML：
 * 让一个网页表单去改它，等于让"点一下保存"变成一次会吃掉注释、写坏别人配置的改写。
 * 本文件是**我们自己的**一个 JSON，坏了也只坏我们这一半。
 *
 * ## 它在配置优先级里的位置
 *
 * `环境变量 > patch 注入 > 本文件 > 默认值`（`readConfig` 的第三个入参）。
 *
 * - 排在 patch **之下**：手写 `cordis.patch.yml` 的人（自部署的常态）仍然说了算，
 *   一个网页表单不许悄悄盖掉他自己写下的那一行。
 * - 排在默认值**之上**：装完就能用的默认值是官方中继，自部署的人在设置页改一次就生效。
 *
 * ⚠️ 被 patch 盖掉时**不能静默**：设置页读回来的回答里带 `source`，
 * 那一栏会写明"当前由 patch 决定"，否则用户会以为"保存没生效"（而其实是生效了、被压住了）。
 *
 * ## 联网搜索那两个 token（2026-11-20）的优先级**相反**
 *
 * `websearch.githubToken` / `websearch.openAlexKey` 是**纯用户凭据**：它们只决定"这台机器
 * 能调多少额度"，不决定主机连哪台中继、也不参与配对。所以优先级是
 * `配置文件 > 环境变量`（见 `websearch/tools.ts` 的 `readGitHubToken`）。
 *
 * 反过来的后果是这一栏最贵的故障：用户在设置页填了 token、页面上写着"已配置"，
 * 工具却还在用环境变量里那枚旧凭据（或压根没有）——"保存了却没生效"，而日志里一切正常。
 *
 * ## 三条纪律
 *
 * 1. **落盘走 `platform/secure-file.ts`**（0600 + 原子写 + fsync）——文件里可能有 token。
 * 2. **读不认识的内容一律降级成"没有自定义"**，绝不抛：`apply()` 不许向外抛。
 * 3. **写进去之前先校验**（scheme / 长度），并且**空串 = 删掉这一项**
 *    （"清空输入框再保存"必须能把一项恢复成默认，否则表单没有退路）。
 */
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { writeSecure } from '../platform/secure-file.js'
import { dataDir } from '../platform/paths.js'

/**
 * 自定义项：中继那两项 + 联网搜索那两个 token。其余配置属于"改代码/patch 的人"，不属于设置页。
 *
 * ⚠️ 取值 `undefined` 表示**"用户要删掉这一项"**（清空输入框再保存），它只在
 * "表单 → 归一 → 落盘"这条路上有意义：落盘时 `JSON.stringify` 会丢掉这些键，
 * 而 `readConfig` 也会把它们滤掉（见那里的注释）。**从盘上读出来的对象里不会有它**。
 */
export interface UserOverrides {
  serverUrl?: string | undefined
  hostToken?: string | undefined
  /** 联网搜索的两个 token（见下面的 `WebsearchOverrides`）。 */
  websearch?: WebsearchOverrides | undefined
}

/**
 * 联网搜索的两个凭据（2026-11-20）。
 *
 * 与上面两项同一套"key 在 = 用户动过它 / 空串 = 删掉这一项"的语义（见
 * `normalizeUserOverrides` 的注释），只是**再套一层**：清空其中一枚不该把另一枚一起丢掉。
 *
 * 优先级：**配置文件 > 环境变量**（理由见文件头）。工具侧读它的是
 * `websearch/tools.ts` 的 `readGitHubToken` / `readOpenAlexKey`；写入的是
 * `websearch/routes.ts` 那两条路由（设置页「搜索」栏）。
 */
export interface WebsearchOverrides {
  githubToken?: string | undefined
  openAlexKey?: string | undefined
}

/** 落盘文件名。与 `status.json` / 密钥簿同目录。 */
const USER_CONFIG_FILE = 'user-config.json'

/** token 输入框的上限：够长（48 位是认领的形状，运维自己的可能更长），又能拦住整段粘贴。 */
const MAX_TOKEN_INPUT = 256

/**
 * 第三方凭据（GitHub PAT / OpenAlex key）的上限。
 *
 * GitHub 现在的细粒度 PAT（`github_pat_…`）约 90 字符，OpenAlex 的 key 约 30；
 * 512 已经宽到离谱，但比"整段粘贴进来的东西"窄得多——拦的是把整份配置文件贴进输入框。
 */
const MAX_SECRET_INPUT = 512

export type LogFn = (message: string, fields?: Record<string, string | number | boolean | undefined>) => void

/** 落点：`status.json` 同目录（`statusFile` 为空时退到运行时数据目录）。 */
export function resolveUserConfigFile(statusFile: string): string {
  const base = statusFile ? path.dirname(statusFile) : dataDir()
  return path.join(base, USER_CONFIG_FILE)
}

/**
 * 校验并归一一份**来自表单**的输入。返回 error 时不写盘，由路由回 400 + 那句话。
 *
 * ## 两个语义都靠"**key 在不在**"表达
 *
 * - **key 不在** = 表单没提交这一项 ⇒ 调用方保持原值（"只改地址、口令不动"是常态）；
 * - **key 在而取值为空串** = 用户**清空**了它 ⇒ 返回值里这一项是 `undefined`（"删掉它"）。
 *
 * ⚠️ 所以判"在不在"必须用 `in`，**不能用 `!== undefined`**：后者把
 * `{ serverUrl: '' }`（用户清空了地址）与 `{}`（没提交地址）判成同一件事，
 * 于是"恢复默认"那颗按钮会**静默什么都不做**（第一版就这么写的，判据当场抓出来）。
 */
export function normalizeUserOverrides(input: {
  serverUrl?: unknown
  hostToken?: unknown
  websearch?: unknown
}): { ok: true; value: UserOverrides } | { ok: false; field: string; error: string } {
  const value: UserOverrides = {}
  if ('serverUrl' in input) {
    if (typeof input.serverUrl !== 'string') return { ok: false, field: 'serverUrl', error: 'must be a string' }
    const trimmed = input.serverUrl.trim()
    if (trimmed === '') {
      value.serverUrl = undefined
    } else {
      // 与 `config.ts` 的 `wsUrl` 同一条判据：这里放行了，validateConfig 那边也是 error。
      if (!/^wss?:\/\/.+/.test(trimmed)) {
        return { ok: false, field: 'serverUrl', error: 'must start with ws:// or wss://' }
      }
      value.serverUrl = trimmed
    }
  }
  if ('hostToken' in input) {
    if (typeof input.hostToken !== 'string') return { ok: false, field: 'hostToken', error: 'must be a string' }
    const trimmed = input.hostToken.trim()
    if (trimmed === '') {
      value.hostToken = undefined
    } else {
      if (trimmed.length > MAX_TOKEN_INPUT) {
        return { ok: false, field: 'hostToken', error: `must be at most ${MAX_TOKEN_INPUT} characters` }
      }
      value.hostToken = trimmed
    }
  }
  if ('websearch' in input) {
    /**
     * 嵌套那一层：`websearch` 本身必须是对象（数组也是 `typeof 'object'`，显式挡掉）。
     *
     * 语义与顶层完全一致，只是作用域收窄：`{ websearch: { githubToken: '' } }` 表示
     * "用户清空了 GitHub token"，**不动** openAlexKey；所以这里的返回值也只带被点过名的键
     * （`{ githubToken: undefined }`），由调用方按 key 在不在去合并。
     */
    const raw = input.websearch
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, field: 'websearch', error: '必须是一个对象（{ githubToken, openAlexKey }）' }
    }
    const record = raw as { githubToken?: unknown; openAlexKey?: unknown }
    const nested: WebsearchOverrides = {}
    for (const field of ['githubToken', 'openAlexKey'] as const) {
      if (!(field in record)) continue
      const one = record[field]
      if (typeof one !== 'string') {
        return { ok: false, field: 'websearch.' + field, error: '必须是字符串' }
      }
      const trimmed = one.trim()
      if (trimmed === '') {
        nested[field] = undefined
        continue
      }
      if (trimmed.length > MAX_SECRET_INPUT) {
        return { ok: false, field: 'websearch.' + field, error: `不能超过 ${MAX_SECRET_INPUT} 个字符` }
      }
      // 中间带空白/控制字符 = 多半把整段配置或带引号的 JSON 贴进来了：这类输入拿去发请求只会 401。
      if (/[\s\u0000-\u001f]/.test(trimmed)) {
        return { ok: false, field: 'websearch.' + field, error: '中间不能有空白或控制字符（只贴 token 本身，别带引号/换行）' }
      }
      nested[field] = trimmed
    }
    value.websearch = nested
  }
  return { ok: true, value }
}

/**
 * 读盘上的自定义项。**读不到 / 坏了 / 形状不对一律当"没有"**，绝不抛。
 *
 * 逐项判而不是整份丢弃：一份文件里 `serverUrl` 写对了、`hostToken` 被手改成数字，
 * 正确的做法是"用对的那一项、忽略错的那一项"，并把错的那一项记出来。
 */
export function readUserConfig(file: string, log?: LogFn): UserOverrides {
  if (!file) return {}
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    // 没写过是常态（绝大多数用户不改这一栏），不记日志。
    return {}
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    log?.('user-config is not JSON, ignoring it', { file: path.basename(file) })
    return {}
  }
  if (!parsed || typeof parsed !== 'object') {
    log?.('user-config has an unknown shape, ignoring it', { file: path.basename(file) })
    return {}
  }
  const record = parsed as { serverUrl?: unknown; hostToken?: unknown; websearch?: unknown }
  /**
   * **逐项判**，而不是整份一起判。
   *
   * 一份文件里 `serverUrl` 写对了、`hostToken` 被手改成数字，正确的做法是
   * "用对的那一项、忽略错的那一项"——整份丢弃会让用户"两个都要重填"。
   *
   * ⚠️ 判"这一项在不在文件里"必须用 `in`，不能靠传 `undefined` 进 `normalizeUserOverrides`：
   * 那个函数的语义是"key 在 = 用户动过它"，传一个 `hostToken: undefined` 的字面量
   * 会被判成"提交了一个不是字符串的东西" ⇒ **一份只有 serverUrl 的文件会被整份拒掉**。
   */
  const value: UserOverrides = {}
  for (const field of ['serverUrl', 'hostToken'] as const) {
    if (!(field in record)) continue
    const one = normalizeUserOverrides({ [field]: record[field] })
    if (!one.ok) {
      log?.('user-config item ignored', { field, reason: one.error })
      continue
    }
    // 空串（用户清空过、文件是手改的）在归一结果里是 `undefined`：**读回来时当它不存在**。
    // 留着它会以"把默认值抹成 undefined"的形式传下去（`readConfig` 里那条注释）。
    const kept = one.value[field]
    if (typeof kept === 'string') value[field] = kept
  }
  /**
   * 联网搜索那两个 token：整块走一次归一（嵌套形状与顶层同源，别在这里再写一份校验）。
   * 只留**真值**——文件里手写成空串的那一项，读回来等于"没有"，否则它会以
   * "把配置抹成空串"的形式传下去。
   */
  if ('websearch' in record) {
    const one = normalizeUserOverrides({ websearch: record.websearch })
    if (!one.ok) {
      log?.('user-config item ignored', { field: 'websearch', reason: one.error })
    } else {
      const nested = one.value.websearch ?? {}
      const kept: WebsearchOverrides = {}
      for (const field of ['githubToken', 'openAlexKey'] as const) {
        const token = nested[field]
        if (typeof token === 'string') kept[field] = token
      }
      if (Object.keys(kept).length > 0) value.websearch = kept
    }
  }
  return value
}

/**
 * **读-改-写**：把一份"补丁"合并进盘上的自定义项，然后落盘。
 *
 * ## 为什么调用方不许自己拼快照
 *
 * `user-config.json` 现在有**两个写入方**：设置页「进阶」（中继地址 / token）与
 * 设置页「搜索」（GitHub / OpenAlex 两个 token）。任何一方拿"自己启动时读到的那份"
 * 去合并，都会在另一方刚保存之后把它写回旧值——用户看到的是"填完 GitHub token，
 * 去改一下自部署地址，token 就没了"。这是数据丢失，不是"可能过期"。
 *
 * 所以合并**只能**发生在读文件之后、写文件之前，且只在这一个函数里。
 *
 * ## 合并语义
 *
 * - 顶层 `serverUrl` / `hostToken`：**key 在**就覆盖（字符串 = 新值，`undefined` = 删掉这一项）；
 * - `websearch` 再下一层：同样"key 在才动"，清空 GitHub 那一枚不会连 openAlexKey 一起删；
 * - patch 里没点名的项一律**保持盘上的值**（"只改地址、口令不动"是常态）。
 */
export function saveUserOverrides(
  file: string,
  patch: UserOverrides,
  now: number,
  log?: LogFn,
): { ok: true; value: UserOverrides } | { ok: false; error: string } {
  const current = readUserConfig(file, log)
  const next: UserOverrides = { ...current }
  for (const field of ['serverUrl', 'hostToken'] as const) {
    if (!(field in patch)) continue
    const value = patch[field]
    if (typeof value === 'string') next[field] = value
    else delete next[field]
  }
  if ('websearch' in patch) {
    const merged: WebsearchOverrides = { ...(current.websearch ?? {}) }
    const incoming = patch.websearch ?? {}
    for (const field of ['githubToken', 'openAlexKey'] as const) {
      if (!(field in incoming)) continue
      const value = incoming[field]
      // 空串在归一那一步已经变成 `undefined`；这里再兜一次，防的是有人绕过归一直接调。
      if (typeof value === 'string' && value !== '') merged[field] = value
      else delete merged[field]
    }
    if (Object.keys(merged).length > 0) next.websearch = merged
    else delete next.websearch
  }
  if (!writeUserConfig(file, next, now, log)) return { ok: false, error: '写不进配置文件（磁盘满了或没权限）' }
  return { ok: true, value: next }
}

/**
 * 写自定义项（0600 + 原子写）。`savedAt` 只用于排错（"这一栏是什么时候改的"）。
 * 写失败返回 false，**不抛**。
 */
export function writeUserConfig(file: string, overrides: UserOverrides, now: number, log?: LogFn): boolean {
  if (!file) return false
  const body = { version: 1, ...overrides, savedAt: now }
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    writeSecure(file, JSON.stringify(body, null, 2) + '\n')
    return true
  } catch (error) {
    log?.('user-config save failed', { message: String((error as Error)?.message ?? error).slice(0, 120) })
    return false
  }
}
