/**
 * git — 对系统 `git` 的一层薄封装（备份功能唯一的对外依赖）。
 *
 * ## 为什么用子进程而不是打包一个 git 实现
 *
 * 打包 `isomorphic-git` 会让 bundle 胖几 MB，而它照样要处理凭据管理器、按仓库配置的
 * `http.proxy`、`core.autocrlf` 这些**本机才有**的东西。用户装了 DSH 就大概率有 git
 * （以 `github:` 地址装插件本身就是 git 在干活），直接用系统的最省事。
 *
 * ## 三条纪律
 *
 * 1. **绝不交互**：`GIT_TERMINAL_PROMPT=0` + `GCM_INTERACTIVE=never`。备份是后台定时任务，
 *    一旦卡在"请输入用户名"上，那根子进程会把事件循环钉住，整个插件的定时器都不再走。
 * 2. **一定带超时**：`spawnSync` 的 `timeout`，超时按失败处理（网络烂的时候 git 能吊十几分钟）。
 * 3. **输出有上限**：`maxBuffer` 32 MB，`git ls-tree` 在几千个会话时输出也就几百 KB，
 *    但 `git push` 的进度行可能很长；超了宁可截断/失败，也别把宿主内存吃光。
 */
import { spawnSync } from 'node:child_process'

export interface GitResult {
  /** 退出码；-1 = 起不来（git 不在 PATH / 被超时杀掉）。 */
  code: number
  stdout: string
  stderr: string
  /** 超时被杀。 */
  timedOut: boolean
}

export interface RunGitOptions {
  cwd: string
  /** 额外环境变量（`GIT_ASKPASS`、token 注入等）。 */
  env?: Record<string, string>
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_BUFFER = 32 * 1024 * 1024

/** 不交互、不弹凭据助手、UTF-8 输出。 */
function baseEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // 后台任务不许等人：没有终端可问，问了就是挂死。
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
    // 中文路径/分支名不出乱码；提交信息由我们自己拼。
    LC_ALL: 'C.UTF-8',
    ...extra,
  }
}

export function runGit(args: string[], options: RunGitOptions): GitResult {
  const result = spawnSync('git', args, {
    cwd: options.cwd,
    env: baseEnv(options.env),
    encoding: 'utf8',
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
  })
  const timedOut = (result.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT'
  return {
    code: typeof result.status === 'number' ? result.status : -1,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
    timedOut,
  }
}

/** git 在不在（决定备份卡片是"能用"还是"请先装 git"）。缓存一次结果。 */
let cachedAvailability: boolean | undefined

export function gitAvailable(): boolean {
  if (cachedAvailability !== undefined) return cachedAvailability
  const probe = runGit(['--version'], { cwd: process.cwd(), timeoutMs: 10_000 })
  cachedAvailability = probe.code === 0 && /\bgit version\b/.test(probe.stdout)
  return cachedAvailability
}

/** 只给测试用：把探测结果清掉。 */
export function resetGitAvailability(): void {
  cachedAvailability = undefined
}

/** 把 git 的输出裁成一行能放进 status.json / 设置页的短句。 */
export function briefGitError(result: GitResult, limit = 300): string {
  const raw = (result.stderr || result.stdout || '').trim()
  if (result.timedOut) return 'git 超时（进程已被杀掉）'
  if (result.code === -1) return raw === '' ? 'git 起不来（不在 PATH？）' : raw.slice(0, limit)
  const line = raw.split('\n').filter((entry) => entry.trim() !== '').slice(-2).join(' / ')
  return line.slice(0, limit)
}
