/**
 * websearch/start —— 联网搜索的接线（2026-11-20 第二版：多了设置页那两条路由）。
 *
 * 两块**各自独立**软探测，一块挂了另一块照常：
 *
 * - `tools`：没挂上 = 模型手上没这几个工具；
 * - `webServer`：没挂上 = 设置页「搜索」栏打不开（工具仍然能用，token 只能靠环境变量）。
 *
 * 与 groups/start.ts 同一套纪律：500ms × 60 拍等晚到服务，失败只写 probe + 一行中文日志，
 * 绝不把远控主链路带下去；stop 幂等。
 *
 * ## 配置从哪儿来（为什么这个文件要碰 user-config）
 *
 * 两个 token 属于"用户在设置页填的用户凭据"，落盘在 `user-config.json`（与「进阶」栏同一份）。
 * 读盘只能发生在 node 侧，所以这里读出来**注入**给 `tools.ts`（那边是纯函数域，
 * 不认 `node:fs`），读不到就让工具回退环境变量。
 *
 * 写盘一律走 `saveUserOverrides`（**先重读再合并**）：这份文件和「进阶」栏是两个写入方，
 * 拿内存快照合并会把对方刚写的东西盖回旧值。
 *
 * ## 为什么要单独记一个 fetch 探针
 *
 * 工具全都要发 HTTP，而「本机 Node 没有全局 fetch」这个故障在日志里长得跟「网不通」一模一样——
 * 先把这条判掉，排错少走一天。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { DEFAULT_CONFIG } from '../shell/config.js'
import {
  resolveUserConfigFile,
  readUserConfig,
  saveUserOverrides,
  normalizeUserOverrides,
  type UserOverrides,
  type WebsearchOverrides,
} from '../shell/user-config.js'
import { buildExtraTools } from './extra.js'
import { buildWebsearchTools, type WebsearchToolDeps, type WebAiEngine } from './tools.js'
import { createWebAiService, type WebAiService } from './webai/service.js'
import { readWebsearchSkillBody } from './skill.js'
import { runProbe } from './probe.js'
import {
  buildConfigView,
  websearchHandlers,
  type WebsearchConfigView,
  type WebsearchRouteDeps,
} from './routes.js'

interface LooseContext {
  get?<T>(name: string, optional: true): T | undefined
  inject?(names: string[], callback: (scoped: unknown) => void): unknown
}

interface Registerable {
  register(route: {
    kind: 'exact'
    path: string
    handler: (request: IncomingMessage, response: ServerResponse) => unknown
  }): () => void
}

export interface WebsearchHandle {
  stop(): void
  readonly probe: Record<string, string>
}

export interface WebsearchStartInput {
  /** 包根目录（读 assets/skills/dafeiyu-websearch/SKILL.md）。 */
  packageRoot: string
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
  /**
   * `user-config.json` 的真实路径（`index.ts` 已经算好那一份，**应当传进来**）。
   *
   * 不传就退回默认位置 `~/.dsh/dsh-remote-control/user-config.json`——绝大多数用户
   * 就是这一份，只有手改过 `statusFile` 的自部署才和「进阶」栏不是同一个文件。
   * 留这个口子而不是在这里重新推一遍路径：路径只有一个真源（`shell/config.ts`）。
   */
  userConfigFile?: string
  /** 落盘时间戳（判据要固定它）；默认 `Date.now`。 */
  now?: () => number
  /**
   * DSH 家目录。
   *
   * 用途只有一个：`web_search_fy(engine='doubao')` 要复用**识图插件那份登录 profile**
   * （`<dshHome>/storages/dsh-remote-dafeiyu/webvision`）——用户登一次，识图和搜索都能用。
   * 不传 = 网页豆包引擎不可用（probe.webai 写原因），bing/sogou 两条引擎照常。
   */
  dshHome?: string
}

export function startWebsearch(ctx: LooseContext, input: WebsearchStartInput): WebsearchHandle {
  const probe: Record<string, string> = {}
  const skillDir = path.join(input.packageRoot, 'assets', 'skills', 'dafeiyu-websearch')
  const configFile = input.userConfigFile ?? resolveUserConfigFile(DEFAULT_CONFIG.statusFile)
  const now = input.now ?? ((): number => Date.now())

  let toolsRegistered = false
  let stopped = false
  let toolTimer: ReturnType<typeof setInterval> | undefined
  const disposers: Array<() => void> = []

  probe.fetch = typeof (globalThis as { fetch?: unknown }).fetch === 'function' ? 'ok' : 'none'
  if (probe.fetch === 'none') {
    input.log('这台机器的 Node 没有全局 fetch：联网搜索只能返回 guide，工具会报中文错（远控不受影响）')
  }

  /** 设置页写下的那两枚 token（每次现读：用户在页面上保存完，下一次工具调用就要生效）。 */
  const readTokens = (): WebsearchOverrides => {
    try {
      return readUserConfig(configFile, input.log).websearch ?? {}
    } catch {
      return {}
    }
  }
  /** 环境变量那一层（只在配置文件没填时兜底）。 */
  const envTokens = (): WebsearchOverrides => ({
    githubToken: (process.env.GITHUB_TOKEN ?? process.env.DSH_GITHUB_TOKEN ?? '').trim(),
    openAlexKey: (process.env.OPENALEX_API_KEY ?? process.env.DSH_OPENALEX_API_KEY ?? '').trim(),
  })

  /**
   * 网页豆包引擎（`web_search_fy(engine='doubao')` 的落点）：懒创建。
   *
   * 第一次真用它才起浏览器；起不来只写 probe.webai + 一行中文日志，
   * **绝不把 bing/sogou 一起带走**（与 tools / webServer 两块软探测同一纪律）。
   * profile 与识图插件共用，登录一次两边都能用。
   */
  let webAi: WebAiService | undefined
  let webAiFailure = ''
  const ensureWebAi = (): WebAiService => {
    if (webAi !== undefined) return webAi
    if (webAiFailure !== '') throw new Error(webAiFailure)
    const home = String(input.dshHome ?? '').trim()
    if (home === '') {
      webAiFailure = '网页豆包引擎不可用：没有拿到 dshHome，找不到识图那份登录 profile（改用 engine=auto）'
      probe.webai = 'no dshHome'
      throw new Error(webAiFailure)
    }
    try {
      webAi = createWebAiService({
        log: input.log,
        profileRoot: path.join(home, 'storages', 'dsh-remote-dafeiyu', 'webvision'),
      })
      probe.webai = 'ready'
      return webAi
    } catch (error) {
      const reason = String((error as Error)?.message ?? error).slice(0, 160)
      webAiFailure = '网页豆包引擎起不来：' + reason
      probe.webai = 'start failed: ' + reason.slice(0, 80)
      input.log('网页豆包引擎起不来（bing/sogou 两条引擎不受影响）', { message: reason.slice(0, 200) })
      throw new Error(webAiFailure)
    }
  }
  const webAiEngine: WebAiEngine = {
    search: (query, options) => ensureWebAi().search(query, options),
  }
  probe.webai = 'lazy（第一次 engine=doubao 才起浏览器）'

  const toolDeps: WebsearchToolDeps = {
    guideBody: () => readWebsearchSkillBody(skillDir),
    log: input.log,
    readConfig: readTokens,
    webAi: webAiEngine,
  }

  const acceptTools = (value: unknown, via: string): boolean => {
    if (toolsRegistered) return true
    if (!value || typeof value !== 'object') return false
    const host = value as { register?: (definition: Record<string, unknown>) => unknown }
    if (typeof host.register !== 'function') {
      probe.tools = 'object without register()'
      return false
    }
    try {
      /*
       * 核心五个（web_search_fy / paper_search / paper_read / repo_search / websearch_guide）
       * + 三个定向检索（code_search / graphics_papers / hn_search）。
       * extra 那几个是独立文件、零依赖，由这里合并注册——它的作者没碰本文件，避免抢同一个文件。
       */
      const definitions = [...buildWebsearchTools(toolDeps), ...buildExtraTools()]
      for (const definition of definitions) host.register(definition)
      toolsRegistered = true
      probe.tools = via + ':' + definitions.length
      return true
    } catch (error) {
      probe.tools = 'register threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
      return false
    }
  }

  // tools 是晚到服务：先试一次，再 500ms × 60 拍
  const tryToolsOnce = (via: string): boolean => {
    let value: unknown
    try {
      value = ctx.get?.('tools', true)
    } catch (error) {
      probe.tools = 'get threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
      return false
    }
    return acceptTools(value, via)
  }
  tryToolsOnce('via get')
  if (!toolsRegistered) {
    let attempts = 0
    try {
      toolTimer = setInterval(() => {
        attempts += 1
        if (stopped || toolsRegistered) {
          if (toolTimer !== undefined) clearInterval(toolTimer)
          return
        }
        if (tryToolsOnce('via poll')) {
          if (toolTimer !== undefined) clearInterval(toolTimer)
          return
        }
        if (attempts >= 60) {
          if (toolTimer !== undefined) clearInterval(toolTimer)
          probe.tools = (probe.tools ?? 'none') + ' (poll gave up after ' + attempts + ')'
          input.log('联网搜索工具没挂上：等了 30 秒没等到 tools（远控不受影响）')
        }
      }, 500)
    } catch (error) {
      probe.tools = 'poll threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
    }
  }

  /* ── 设置页那两条路由 ─────────────────────────────────────────────── */

  /**
   * 落盘：**空串 = 清除这一项**，没点名的项保持盘上的值。
   *
   * 校验用 `normalizeUserOverrides`（与「进阶」栏同一份规则：trim、长度、不许带空白），
   * 归一会把空串变成 `undefined`（"用户要删掉它"），再由 `saveUserOverrides` 合并落盘。
   */
  const saveConfig = (patch: WebsearchOverrides): { ok: true } | { ok: false; message: string } => {
    const normalized = normalizeUserOverrides({ websearch: patch })
    if (!normalized.ok) return { ok: false, message: normalized.error }
    const saved = saveUserOverrides(configFile, { websearch: normalized.value.websearch ?? {} }, now(), input.log)
    if (!saved.ok) return { ok: false, message: saved.error }
    const kept = saved.value.websearch ?? {}
    input.log('联网搜索 token 写入', {
      githubTokenSet: typeof kept.githubToken === 'string',
      openAlexKeySet: typeof kept.openAlexKey === 'string',
    })
    return { ok: true }
  }

  const view = (): WebsearchConfigView => buildConfigView(readTokens(), envTokens())

  /**
   * 「测一下」：现建一份工具表（带同一套 deps，含刚保存的 token），真跑一次。
   * 每次点都重建而不是复用 `acceptTools` 里那份：那一份的 `register` 已经交给宿主，
   * 而且 web_search_fy 有 5 分钟缓存——"测一下"必须打真网，不许吃到缓存。
   */
  const probeUpstream = (kind: 'github' | 'arxiv' | 'web') =>
    runProbe([...buildWebsearchTools({ ...toolDeps, cache: undefined }), ...buildExtraTools()], kind)

  const routeDeps: WebsearchRouteDeps = {
    view,
    save: saveConfig,
    probe: probeUpstream,
    log: input.log,
  }

  let web: Registerable | undefined
  let routesOn = false
  let routeTimer: ReturnType<typeof setInterval> | undefined
  const tryRoutes = (): void => {
    if (routesOn || stopped || !web) return
    routesOn = true
    try {
      for (const route of websearchHandlers(routeDeps)) {
        disposers.push(web.register({ kind: 'exact', path: route.path, handler: route.handler }))
      }
      probe.routes = 'registered'
    } catch (error) {
      probe.routes = 'register threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
      routesOn = false
      input.log('联网搜索的配置路由挂不上（工具照常可用，只是设置页那一栏打不开）', { message: probe.routes })
    }
  }
  const acceptWeb = (value: unknown, via: string): void => {
    if (!value || typeof value !== 'object') return
    if (typeof (value as Registerable).register !== 'function') {
      probe.webServer = 'object without register()'
      return
    }
    web = value as Registerable
    probe.webServer = via
    tryRoutes()
  }
  try {
    const found = ctx.get?.('webServer', true)
    if (found) acceptWeb(found, 'via get')
    else probe.webServer = 'none'
  } catch (error) {
    probe.webServer = 'get threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
  }
  try {
    ctx.inject?.(['webServer'], ((...args: unknown[]) => {
      /*
       * 回调给的东西**不保证是服务本身**（有的宿主把 ctx 传回来，有的一个参数都不给）。
       * 所以逐个候选试：显式参数 → 参数里的 ctx → 我们自己手里的 ctx
       * （groups/start.ts 2026-11-19 就是漏了这条候选，webServer 晚到时一条路由都没挂上）。
       */
      try {
        for (const candidate of [...args, ctx]) {
          const fromGet = (candidate as { get?: (name: string, optional: true) => unknown })?.get?.('webServer', true)
          if (fromGet) {
            acceptWeb(fromGet, 'via inject')
            if (routesOn) return
          }
          acceptWeb(candidate, 'via inject')
          if (routesOn) return
        }
      } catch {
        /* inject 回调里的异常不许冒 */
      }
    }) as never)
  } catch {
    /* 没有 inject 就算了：probe 里已经有 webServer 的状态 */
  }
  // 两条路都没成 → 500ms × 60 拍再等它一次（webServer 比 tools 还可能晚到）
  if (!routesOn) {
    let attempts = 0
    try {
      routeTimer = setInterval(() => {
        attempts += 1
        if (stopped || routesOn) {
          if (routeTimer !== undefined) clearInterval(routeTimer)
          return
        }
        try {
          const found = ctx.get?.('webServer', true)
          if (found) acceptWeb(found, 'via poll')
        } catch (error) {
          probe.webServer = 'poll threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
        }
        if (routesOn) {
          if (routeTimer !== undefined) clearInterval(routeTimer)
          return
        }
        if (attempts >= 60) {
          if (routeTimer !== undefined) clearInterval(routeTimer)
          probe.webServer = (probe.webServer ?? 'none') + ' (poll gave up after ' + attempts + ')'
          input.log('联网搜索的配置路由没挂上：等了 30 秒没等到 webServer（工具/远控都不受影响）')
        }
      }, 500)
    } catch (error) {
      probe.webServer = 'poll threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
    }
  }

  return {
    probe,
    stop(): void {
      stopped = true
      try {
        if (toolTimer !== undefined) clearInterval(toolTimer)
      } catch {
        /* 停机不许抛 */
      }
      try {
        if (routeTimer !== undefined) clearInterval(routeTimer)
      } catch {
        /* 停机不许抛 */
      }
      try {
        webAi?.stop()
      } catch {
        /* 停机不许抛 */
      }
      for (const dispose of disposers.splice(0)) {
        try {
          dispose()
        } catch {
          /* 注销不许抛 */
        }
      }
    },
  }
}
