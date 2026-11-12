/**
 * sprite/browser —— 拉一个无头 Edge/Chrome，用 CDP 当"手"。
 *
 * 为什么必须借浏览器：抽帧要解码 MP4/WebM/MOV（含 ffmpeg wasm 那条路），Node 侧没有现成解码器。
 * 工具本身是纯前端单文件，所以"把它跑起来"最省事的办法就是给它一个浏览器。
 *
 * 为什么用 CDP `Runtime.evaluate` 而不是模拟点击：套件里那套按钮交互在无头环境下不可靠
 * （取色按钮会状态失步、文件输入重复设置同一文件不触发 change），而 `Runtime.evaluate`
 * 直接调页面里的 bridge 函数，稳定且快得多。
 *
 * 进程纪律：
 * - 子进程 **stdio 全部 ignore**（宿主的管道被占满会拖慢整个 shell 层）；
 * - 空闲超时就关（默认 5 分钟），停机时无条件关；
 * - 用户数据目录放在临时目录，每次启动一份——否则复用旧 profile 会带上一堆历史标签页。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { WebSocket } from 'ws'

export interface CdpSession {
  /** 在页面里求值（awaitPromise + returnByValue），超时抛错。 */
  evaluate<T>(expression: string, timeoutMs?: number): Promise<T>
  /** 当前页地址（URL 过滤用：下载页会把 target 顶掉，这里不做多 target 管理）。 */
  readonly pageUrl: string
  /** 关浏览器并清理临时目录（幂等）。 */
  close(): Promise<void>
}

export interface LaunchOptions {
  /** 工具页地址（插件自己的静态路由）。 */
  toolUrl: string
  /** 显式指定浏览器可执行文件；不给就按常见路径找。 */
  executable?: string
  /** 等页面就绪的上限。 */
  readyTimeoutMs?: number
  /**
   * 判定"页面就绪"的表达式（要返回布尔）。默认等 bridge 挂上；
   * 给冒烟测试留一个口子，不然驱动本身没法单独验。
   */
  readyExpression?: string
  log?: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
}

/** 常见浏览器路径（Windows）。找不到就让调用方报清楚。 */
export function findBrowser(explicit?: string): string | undefined {
  if (explicit) return existsSync(explicit) ? explicit : undefined
  const env = (process.env.DAFEIYU_SPRITE_BROWSER ?? '').trim()
  if (env !== '') return existsSync(env) ? env : undefined
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]
  return candidates.find((candidate) => existsSync(candidate))
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

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface PageTarget {
  id?: string
  type?: string
  url?: string
  webSocketDebuggerUrl?: string
}

/**
 * 启动浏览器并连上第一个 page target，导航到工具页，等 `document.readyState === 'complete'`。
 *
 * 只认"第一个 page"是不够的（下载页会顶掉 target），所以我们**只开一个标签页**并自己导航，
 * 让 target 集合从头到尾就一个。
 */
export async function launchBrowser(options: LaunchOptions): Promise<CdpSession> {
  const log = options.log ?? ((): void => undefined)
  const executable = findBrowser(options.executable)
  if (!executable) {
    throw new Error('找不到 Edge/Chrome：可以用环境变量 DAFEIYU_SPRITE_BROWSER 指定可执行文件路径')
  }
  const port = await freePort()
  const profileDir = mkdtempSync(path.join(os.tmpdir(), 'drc-sprite-'))
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--mute-audio',
    '--hide-scrollbars',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ]
  // ⚠️ `cwd` 必须显式给，不能让它继承宿主的。
  //
  // 2026-11-12 DSH 自更新失败的现场：安装器要把 `D:\FeiYu` 改名成 `D:\FeiYu.old-{GUID}`，
  // MoveFileExW 连续 10 次 `Windows error 32（另一个程序正在使用此文件）` 后放弃——
  // 表现就是"小窗一闪、没有进度条、也不重启"。
  // 目录能被改名要求：**没有进程以它为工作目录**。而无头浏览器是用 spawn 起的子进程，
  // 不给 cwd 就继承 DSH 宿主的工作目录（从 `D:\FeiYu` 启动时就是那个安装目录本身），
  // 于是只要它还没退，安装器就永远换不掉目录。
  // 把它钉在临时 profile 目录里，既不影响功能，也绝不再站进任何安装路径。
  const child: ChildProcess = spawn(executable, args, { stdio: 'ignore', windowsHide: true, cwd: profileDir })

  let closed = false
  const cleanup = async (): Promise<void> => {
    if (closed) return
    closed = true
    try {
      child.kill()
    } catch {
      /* 已经退出 */
    }
    // 给进程一点时间落盘，再删临时 profile（删不掉也不许抛）
    await wait(120)
    try {
      rmSync(profileDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }

  const readyTimeout = options.readyTimeoutMs ?? 20_000
  const deadline = Date.now() + readyTimeout
  let target: PageTarget | undefined
  while (Date.now() < deadline) {
    try {
      const list = (await getJson(`http://127.0.0.1:${port}/json/list`)) as PageTarget[]
      target = list.find((row) => row.type === 'page' && typeof row.webSocketDebuggerUrl === 'string')
      if (target) break
    } catch {
      /* 还没起来 */
    }
    await wait(200)
  }
  if (!target?.webSocketDebuggerUrl) {
    await cleanup()
    throw new Error(`浏览器起来了但没有可用的页面（端口 ${port}，等了 ${Math.round(readyTimeout / 1000)} 秒）`)
  }

  const socket = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false })
  let nextId = 1
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>()

  const send = (method: string, params?: unknown): number => {
    const id = nextId++
    socket.send(JSON.stringify({ id, method, ...(params === undefined ? {} : { params }) }))
    return id
  }
  const call = (method: string, params?: unknown, timeoutMs = 15_000): Promise<unknown> => {
    const id = send(method, params)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`CDP ${method} 超时（${timeoutMs}ms）`))
      }, timeoutMs)
      pending.set(id, { resolve, reject, timer })
    })
  }

  socket.on('message', (raw: Buffer) => {
    let message: { id?: number; result?: unknown; error?: { message?: string } }
    try {
      message = JSON.parse(raw.toString('utf8')) as typeof message
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
  socket.on('close', () => {
    for (const [id, waiter] of pending) {
      pending.delete(id)
      clearTimeout(waiter.timer)
      waiter.reject(new Error('CDP 连接断了（浏览器被关掉？）'))
    }
  })

  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve())
    socket.once('error', (error: Error) => reject(error))
    setTimeout(() => reject(new Error('连不上 CDP WebSocket')), 10_000)
  })

  try {
    await call('Page.enable')
    await call('Runtime.enable')
    await call('Page.navigate', { url: options.toolUrl }, 20_000)
  } catch (error) {
    try {
      socket.close()
    } catch {
      /* ignore */
    }
    await cleanup()
    throw error
  }

  const evaluate = async <T>(expression: string, timeoutMs = 30_000): Promise<T> => {
    const result = (await call(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true, userGesture: false },
      timeoutMs,
    )) as { result?: { value?: unknown }; exceptionDetails?: { text?: string; exception?: { description?: string } } }
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? '页面执行出错'
      throw new Error(detail.slice(0, 400))
    }
    return result.result?.value as T
  }

  // 等页面加载完成 + bridge 就位；bridge 不在就说清楚（可能是静态路由没挂或补丁没打上）。
  const pageDeadline = Date.now() + readyTimeout
  const readyExpression =
    options.readyExpression ??
    "document.readyState === 'complete' && !!(window.__spriteAgent && window.__spriteAgent.ready)"
  let bridged = false
  while (Date.now() < pageDeadline) {
    try {
      bridged = await evaluate<boolean>(readyExpression, 5_000)
      if (bridged) break
    } catch {
      /* 页面还在加载 */
    }
    await wait(300)
  }
  if (!bridged) {
    const state = await evaluate<string>('String(document.readyState) + " @" + location.href', 5_000).catch(() => '读取失败')
    log('序列帧工具页没就绪', { url: options.toolUrl, state })
    try {
      socket.close()
    } catch {
      /* ignore */
    }
    await cleanup()
    throw new Error(`工具页没就绪（${state}）。检查静态路由 /plugins/dafeiyu-sprite/ 与补丁是否打好`)
  }

  return {
    pageUrl: options.toolUrl,
    evaluate,
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
