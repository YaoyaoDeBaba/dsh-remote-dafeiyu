/**
 * websearch/webai/driver —— 网页版搜索的 CDP 驱动（**零新增依赖**）。
 *
 * 与识图插件 `vision/web/driver.ts` 同一套骨架，但这里刻意**瘦**了一截：
 *
 * - 不做登录窗（本能力不负责登录，未登录就抛中文错让人去识图插件里登）；
 * - 只起无头实例（默认），复用识图那份 profile —— 用户登一次，识图与搜索都能用；
 * - 不下载文件、不塞图，只要「导航 + 求值 + 打字 + 截图」这几手。
 *
 * CDP 走宿主 Node 22+ 的全局 `WebSocket`：**不引 ws / playwright / puppeteer**，
 * 拿不到就报清楚（比为一个只在老 Node 上才有用的依赖扩包划算）。
 *
 * 进程纪律（照 sprite / vision 的老账）：
 * - 子进程 `stdio: ignore`、`cwd` 钉在 profile 目录（别站进安装路径，否则自更新换不掉目录）；
 * - 关闭时**杀整棵树**：`child.kill()` 只杀 broker，会留一堆 renderer 占端口；
 * - 父进程消失 → 看门狗杀树（宿主崩了不许留孤儿浏览器）；
 * - 关之前先 `Browser.close`（cookie 要落盘才留得住登录态）。
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { WebAiError, type WebAiLog } from './types.js'

export interface CdpClient {
  readonly port: number
  /** 页面里求值（awaitPromise + returnByValue），异常抛错。 */
  evaluate<T>(expression: string, timeoutMs?: number): Promise<T>
  /** 裸 CDP 调用（Network.* / Input.* / Page.*）。 */
  call<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T>
  /** 导航并等 `readyState === 'complete'`（等不到不抛，交给后续判据）。 */
  goto(url: string, timeoutMs?: number): Promise<void>
  /** 截图落盘（出错留证据用；写不进去不抛）。 */
  screenshot(file: string): Promise<void>
  close(): Promise<void>
}

export interface LaunchWebAiOptions {
  /** 浏览器 profile 目录（必须持久：登录态全靠它）。 */
  profileDir: string
  /** 默认无头。 */
  headless?: boolean
  /** 显式可执行文件；不给就按常见路径 + 环境变量找。 */
  executable?: string
  readyTimeoutMs?: number
  /** 起之前先杀掉占着这个 profile 的浏览器（默认 true）。 */
  killStale?: boolean
  log?: WebAiLog
}

/** 浏览器探测的注入项（判据用假 `exists` 就能钉住，不碰磁盘）。 */
export interface BrowserLookupOptions {
  explicit?: string
  env?: NodeJS.ProcessEnv
  exists?: (file: string) => boolean
  candidates?: string[]
}

export type BrowserLookup = { ok: true; exe: string } | { ok: false; reason: string }

/** 常见安装路径（按平台给；判据里也会用这份列表，所以它是纯数据）。 */
export function browserCandidates(platform: NodeJS.Platform = process.platform): string[] {
  if (platform === 'win32') {
    return [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ]
  }
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ]
  }
  return ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge']
}

/** 找不到浏览器时给用户看的中文原因（**能直接照做**）。 */
export function browserMissingReason(): string {
  return '找不到 Edge/Chrome（找过常见安装路径）：装一个 Edge，或用环境变量 DAFEIYU_WEBAI_BROWSER 指定 msedge.exe 的完整路径'
}

/** 环境变量名：先认自己的，后退回识图插件那一个（用户只配一次）。 */
export const BROWSER_ENV_KEYS: readonly string[] = ['DAFEIYU_WEBAI_BROWSER', 'DAFEIYU_WEBVISION_BROWSER']

/**
 * 找浏览器。找不到**不抛**，返回中文原因让上层抛（这样判据能直接断言那句话）。
 *
 * 显式参数 > 环境变量 > 常见路径；环境变量指到一个不存在的文件时**直接报它**，
 * 不要悄悄滑到下一档——不然用户改了变量还以为生效了。
 */
export function resolveBrowser(options: BrowserLookupOptions = {}): BrowserLookup {
  const exists = options.exists ?? ((file: string) => existsSync(file))
  const env = options.env ?? process.env
  const explicit = String(options.explicit ?? '').trim()
  if (explicit !== '') {
    if (exists(explicit)) return { ok: true, exe: explicit }
    return {
      ok: false,
      reason: '指定的浏览器不存在：' + explicit + '（改成一个真实存在的 msedge.exe / chrome.exe 路径）',
    }
  }
  for (const key of BROWSER_ENV_KEYS) {
    const value = String(env[key] ?? '').trim()
    if (value === '') continue
    if (exists(value)) return { ok: true, exe: value }
    return {
      ok: false,
      reason: '环境变量 ' + key + ' 指的浏览器不存在：' + value + '（改成真实路径，或删掉这个变量）',
    }
  }
  for (const candidate of options.candidates ?? browserCandidates()) {
    if (exists(candidate)) return { ok: true, exe: candidate }
  }
  return { ok: false, reason: browserMissingReason() }
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 整棵树 kill：Windows 上 `taskkill /T /F`，其它平台退化成 kill 进程组。 */
function killTree(pid: number, log: WebAiLog): void {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    } else {
      process.kill(-pid, 'SIGKILL')
    }
  } catch (error) {
    log('杀浏览器进程树失败', { pid, reason: String((error as Error)?.message ?? error) })
  }
}

/**
 * 杀掉**用着这个 profile 的浏览器进程**。
 *
 * 同一个 `--user-data-dir` 只能有一个实例：已经有一个（多半是上次搜索/识图留下的无头实例）占着时，
 * 新起的进程会把请求交给它然后**自己退出**，CDP 永远等不到 page target——表现是"浏览器起不来"，
 * 而报错完全不指向真正原因。判据是命令行里含 `--user-data-dir=<这个 profile>`，只杀匹配的。
 */
export async function killBrowsersUsingProfile(profileDir: string, log: WebAiLog): Promise<number> {
  if (!existsSync(profileDir)) return 0
  try {
    if (process.platform === 'win32') {
      const escaped = profileDir.replace(/'/g, "''")
      const script = [
        "$target = '" + escaped + "'",
        "$hit = Get-CimInstance Win32_Process -Filter \"Name='msedge.exe' OR Name='chrome.exe'\" |",
        '  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($target) }',
        '$n = 0',
        'foreach ($p in $hit) { try { taskkill /PID $p.ProcessId /T /F 2>$null | Out-Null; $n++ } catch { } }',
        'Write-Output $n',
      ].join('\n')
      const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        timeout: 15_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      const killed = Number.parseInt(String(out).trim(), 10)
      if (Number.isFinite(killed) && killed > 0) log('清掉了占着 profile 的浏览器进程', { profileDir, killed })
      return Number.isFinite(killed) ? killed : 0
    }
    execFileSync('pkill', ['-f', profileDir], { stdio: 'ignore', timeout: 10_000 })
    return 1
  } catch {
    /* 没匹配到会返回非 0；清理失败不影响主流程 */
    return 0
  }
}

/** 父进程消失就杀浏览器（宿主崩溃后别留孤儿窗口/端口）。 */
function startParentWatchdog(browserPid: number, log: WebAiLog): NodeJS.Timeout {
  const timer = setInterval(() => {
    try {
      process.kill(browserPid, 0)
    } catch {
      clearInterval(timer)
      return
    }
    if (process.ppid === 1) {
      clearInterval(timer)
      killTree(browserPid, log)
    }
  }, 5_000)
  timer.unref?.()
  return timer
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => (port > 0 ? resolve(port) : reject(new Error('拿不到空闲端口'))))
    })
  })
}

function getJson(url: string, timeoutMs = 2_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch (error) {
          reject(error)
        }
      })
    })
    request.on('timeout', () => request.destroy(new Error('CDP 探测超时')))
    request.on('error', reject)
  })
}

interface PageTarget {
  type?: string
  url?: string
  webSocketDebuggerUrl?: string
}

/** 最小 WebSocket 形状（不引 @types/ws，也不依赖 DOM 类型）。 */
interface WebSocketLike {
  readonly readyState?: number
  addEventListener(type: string, listener: (event: never) => void): void
  send(data: string): void
  close(): void
}
interface MessageEventLike {
  data: unknown
}

/**
 * 起浏览器 → 连第一个 page target → 返回可用客户端。
 *
 * 调用方（service.ts）保证**同一个 profile 同一时间只有一个实例**。
 */
export async function launchWebAiBrowser(options: LaunchWebAiOptions): Promise<CdpClient> {
  const log = options.log ?? ((): void => undefined)
  const lookup = resolveBrowser({ explicit: options.executable })
  if (!lookup.ok) throw new WebAiError(lookup.reason, 0)
  const headless = options.headless !== false
  mkdirSync(options.profileDir, { recursive: true })
  if (options.killStale !== false) {
    const killed = await killBrowsersUsingProfile(options.profileDir, log)
    if (killed > 0) await wait(400)
  }
  const port = await freePort()
  const args = [
    headless ? '--headless=new' : '--start-maximized',
    headless ? '--window-size=1920,1080' : '',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--no-service-autorun',
    '--disable-session-crashed-bubble',
    '--hide-crash-restore-bubble',
    '--disable-restore-session-state',
    '--noerrdialogs',
    '--disable-features=Translate,OptimizationHints,msSyncConsent,SigninInterception',
    '--mute-audio',
    '--hide-scrollbars',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + options.profileDir,
    '--lang=zh-CN',
    'about:blank',
  ]
  const child: ChildProcess = spawn(lookup.exe, args, {
    stdio: 'ignore',
    windowsHide: headless,
    cwd: options.profileDir,
  })
  if (typeof child.pid === 'number') startParentWatchdog(child.pid, log)

  let closed = false
  let watchdog: NodeJS.Timeout | undefined
  let socketRef: WebSocketLike | undefined
  /**
   * 关浏览器：**必须优雅关**（cookie 要落盘才留得住登录态）。
   * 先 Browser.close 等它自己退，超时才杀树。
   */
  const cleanup = async (): Promise<void> => {
    if (closed) return
    closed = true
    if (watchdog) clearInterval(watchdog)
    try {
      await Promise.race([
        socketRef !== undefined && socketRef.readyState === 1
          ? (socketRef.send(JSON.stringify({ id: -1, method: 'Browser.close' })), Promise.resolve())
          : Promise.resolve(),
        wait(2_000),
      ])
      for (let i = 0; i < 40; i += 1) {
        if (!child.pid) break
        try {
          process.kill(child.pid, 0)
        } catch {
          break
        }
        await wait(100)
      }
    } catch {
      /* 优雅关失败就退回强杀 */
    }
    if (typeof child.pid === 'number') killTree(child.pid, log)
    await wait(150)
  }

  const readyTimeout = options.readyTimeoutMs ?? 25_000
  const deadline = Date.now() + readyTimeout
  let target: PageTarget | undefined
  const isUsablePage = (row: PageTarget): boolean =>
    row.type === 'page' &&
    typeof row.webSocketDebuggerUrl === 'string' &&
    (row.url === 'about:blank' || /^https?:/i.test(row.url ?? ''))
  while (Date.now() < deadline) {
    try {
      const list = (await getJson('http://127.0.0.1:' + port + '/json/list')) as PageTarget[]
      const rows = Array.isArray(list) ? list : []
      target = rows.find(isUsablePage)
      if (target) break
      if (Date.now() > deadline - readyTimeout / 2) {
        const any = rows.find((row) => row.type === 'page' && typeof row.webSocketDebuggerUrl === 'string')
        if (any) {
          target = any
          break
        }
      }
    } catch {
      /* 还没起来 */
    }
    await wait(200)
  }
  if (!target?.webSocketDebuggerUrl) {
    await cleanup()
    throw new WebAiError(
      '浏览器没起来（端口 ' + port + '，等了 ' + Math.round(readyTimeout / 1000) + ' 秒）：' +
        '多半是这个 profile（' + options.profileDir + '）还被别的 Edge 进程占着——插件已试过自动清理；' +
        '仍失败就手动关掉所有同名窗口再试',
      0,
    )
  }

  const WebSocketCtor = (globalThis as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket
  if (typeof WebSocketCtor !== 'function') {
    await cleanup()
    throw new WebAiError('宿主 Node 版本过低（没有全局 WebSocket，需要 22+）：网页版搜索不可用', 0)
  }

  const socket = new WebSocketCtor(target.webSocketDebuggerUrl)
  socketRef = socket
  let nextId = 1
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>()

  socket.addEventListener('message', (event: MessageEventLike) => {
    let message: { id?: number; result?: unknown; error?: { message?: string } }
    try {
      message = JSON.parse(String(event.data)) as typeof message
    } catch {
      return
    }
    if (typeof message.id !== 'number') return
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    clearTimeout(waiter.timer)
    if (message.error) waiter.reject(new Error(message.error.message ?? 'CDP 错误'))
    else waiter.resolve(message.result)
  })
  socket.addEventListener('close', () => {
    for (const [id, waiter] of pending) {
      pending.delete(id)
      clearTimeout(waiter.timer)
      waiter.reject(new Error('CDP 连接断了（浏览器被关掉？）'))
    }
  })

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve())
    socket.addEventListener('error', () => reject(new Error('连不上 CDP WebSocket')))
    setTimeout(() => reject(new Error('连不上 CDP WebSocket（10s）')), 10_000)
  }).catch(async (error: Error) => {
    await cleanup()
    throw new WebAiError('连不上浏览器的调试端口：' + (error?.message ?? '未知原因'), 0)
  })

  const call = <T = unknown>(method: string, params?: unknown, timeoutMs = 20_000): Promise<T> => {
    const id = nextId++
    socket.send(JSON.stringify({ id, method, params }))
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('CDP ' + method + ' 超时（' + timeoutMs + 'ms）'))
      }, timeoutMs)
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
    })
  }

  const evaluate = async <T>(expression: string, timeoutMs = 30_000): Promise<T> => {
    const result = await call<{
      result?: { value?: unknown }
      exceptionDetails?: { text?: string; exception?: { description?: string } }
    }>('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: false }, timeoutMs)
    if (result?.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? '页面执行出错'
      throw new Error(String(detail).slice(0, 400))
    }
    return result?.result?.value as T
  }

  try {
    await call('Page.enable', {}, 10_000).catch(() => undefined)
    await call('Runtime.enable', {}, 10_000).catch(() => undefined)
    await call('Network.enable', {}, 10_000).catch(() => undefined)
  } catch {
    /* 个别域开不了不影响 evaluate */
  }

  /*
   * 抹掉无头指纹：`--headless=new` 的 UA 带 `HeadlessChrome/`，豆包的风控认这个
   * （识图插件 2026-11-17 实测：带着它发一次请求，服务端把登录态作废）。用浏览器自己的版本号拼。
   */
  if (headless) {
    try {
      const raw = await evaluate<string>('navigator.userAgent', 5_000)
      if (typeof raw === 'string' && raw.includes('HeadlessChrome')) {
        await call('Network.setUserAgentOverride', { userAgent: raw.replace('HeadlessChrome', 'Chrome') }, 5_000)
      }
    } catch {
      /* 抹不掉也继续 */
    }
  }

  return {
    port,
    evaluate,
    call,
    async goto(url, timeoutMs = 40_000) {
      await call('Page.navigate', { url }, timeoutMs).catch(() => undefined)
      const dl = Date.now() + timeoutMs
      while (Date.now() < dl) {
        const state = await evaluate<string>('document.readyState').catch(() => 'loading')
        if (state === 'complete') return
        await wait(300)
      }
    },
    async screenshot(file) {
      try {
        const shot = await call<{ data?: string }>('Page.captureScreenshot', { format: 'png' }, 15_000)
        if (shot?.data) writeFileSync(file, Buffer.from(shot.data, 'base64'))
      } catch {
        /* 截图是证据，不是功能 */
      }
    },
    async close() {
      try {
        socket.close()
      } catch {
        /* ignore */
      }
      await cleanup()
    },
  }
}

/** 供日志用：profile 目录的短名。 */
export function profileName(profileDir: string): string {
  return path.basename(profileDir)
}
