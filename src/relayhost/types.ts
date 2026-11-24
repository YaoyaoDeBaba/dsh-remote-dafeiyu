/**
 * relayhost/types —— 「一键部署本机中继」这一套里**唯一的一份形状**（2026-11-24）。
 *
 * 中继是一个**单文件 release 产物**（`github.com/dsh-remote/relay` 的 `main.js`，ESM，约 1.06 MB）。
 * 本插件只做三件事：把它下下来（带 sha256）、起成子进程（`node relay-<版本>.mjs`）、
 * 等 `/healthz` 说 ok 之后把 `ws://<lan>:<port>` + token 写进插件配置。
 *
 * ## 为什么形状单独一个文件
 *
 * 服务层（`service.ts`）与路由层（`routes.ts`）必须**同一份**：上一轮 cursor 那次事故的形状就是
 * "schema 说支持端口、service 却没转给实现"。设置页那个「一键部署」按钮读的字段名、
 * 判据里断言的字段名，全都以这里为准。
 *
 * ## 三条与用户直接相关的约定
 *
 * 1. `state` 是**唯一**给界面判分支的字段（按钮文案 / 转圈 / 红字都读它）；
 *    `problem` 只在"最近一次失败了"时出现，且**一定是中文**——英文堆栈对用户没有意义。
 * 2. `health` **不许编**：拿不到就是 `undefined`。宁可界面上少一行数字，也不能显示一个假的
 *    "0 台手机在线"。
 * 3. `configured` 回答的是"配置里**已经**是这一套值了吗"，不是"我写过没写过"——
 *    客户端据此提示"需要重启生效"，写失败却报 ok 会让那句提示永远不出现。
 */

/** 本机中继此刻的状态。 */
export interface RelayHostStatus {
  /** not-installed（还没下产物）/ stopped / running / starting / failed */
  state: 'not-installed' | 'stopped' | 'starting' | 'running' | 'failed'
  /** 产物路径与版本（没装就空） */
  bundlePath?: string
  version?: string
  port: number
  bind: string
  /** 运行中时的 /healthz 摘要（拿不到就是 undefined，别编） */
  health?: { ok: boolean; version?: string; hosts?: number; clients?: number; protocolSelf?: number }
  /** 最近一次失败的中文原因（state==='failed' 必有） */
  problem?: string
  /** 一键部署要的对外地址（ws://<lan>:<port>），没探测到时给 ws://127.0.0.1:<port> */
  serverUrl: string
  /** 有没有写进插件配置（serverUrl+hostToken）；客户端据此提示"需要重启生效" */
  configured: boolean
  pid?: number
}

/** 日志口；与本仓其它域同一个签名（`console` 之外的地方都按这个形状传）。 */
export type RelayHostLog = (message: string, fields?: Record<string, string | number | boolean | undefined>) => void

/**
 * 注入面。**全部可注入**：判据不许联网、不许起真进程，所以下载器与 spawn 都是口子。
 *
 * 默认实现就在 `service.ts` 里（真 `fetch` / 真 `child_process.spawn`），接线方一个字都不用传。
 */
export interface RelayHostDeps {
  /** 放产物的目录：`<dshHome>/storages/dsh-remote-dafeiyu/relayhost` */
  dir: string
  /** 下载器（可注入，测试不联网）：返回 Buffer */
  fetchImpl?: (url: string) => Promise<{ ok: boolean; status: number; bytes: Uint8Array | Buffer; message?: string }>
  /** 起进程（可注入，测试不起真进程） */
  spawnImpl?: (args: { command: string; argv: string[]; env: Record<string, string>; cwd: string }) => {
    pid?: number
    kill(): void
  }
  log?: RelayHostLog
  /** 读/写插件 user-config 的两个口子（我接线时传） */
  readConfig?: () => { serverUrl?: string; hostToken?: string }
  writeConfig?: (patch: { serverUrl?: string; hostToken?: string }) => void
  /** 本机局域网 IPv4（探测不到返回 undefined，实现里最多探一次并缓存） */
  lanAddress?: () => string | undefined
  now?: () => number
  /**
   * 产物描述（**可选**，接线方不用传）。
   *
   * 为什么留这个口子：判据要验"哈希对就不重复下载"，而真产物有 1 MB、真实哈希是写死的那一个。
   * 判据里放一个小假产物 + 它自己的 sha256，这条路径才可能在**不联网**的前提下被真的验一遍。
   * 不传就是官方 v0.5.4 那一份（URL / sha256 / 版本号都是常量，见 `service.ts`）。
   */
  bundle?: { url?: string; sha256?: string; version?: string }
}

export interface RelayHostService {
  status(): Promise<RelayHostStatus>
  /** 一键部署：下载（已有就跳过）→ 起进程 → 等 /healthz → 写配置。失败抛中文原因。 */
  deploy(options?: { port?: number; token?: string }): Promise<RelayHostStatus>
  stop(): Promise<RelayHostStatus>
  /** 插件停机时调（释放子进程句柄，不杀别人的进程） */
  dispose(): void
}

/**
 * 工厂在 `service.ts`。这里再导一次，是因为形状块（本文件）与实现块（service）在接线时
 * 往往一起被引：引得到 `createRelayHost` 却引不到类型，或者反过来，都会让接线方去猜。
 * 类型面的边是 type-only，运行期不构成循环依赖。
 */
export { createRelayHost } from './service.js'
