/**
 * sprite/orphans —— 无头浏览器的「孤儿」治理。
 *
 * 为什么单独一个模块：2026-11-12 下午宿主连续崩了几次，重启后后台残留一堆
 * `msedge --headless`。旧逻辑只有一条回收路径——`touch()` 的 30 分钟空闲定时器；
 * 宿主被强杀时父进程没了，没人再调 `recycle`，于是下一个会话又 spawn 一个新的，越攒越多。
 * 每个孤儿各占一个本地端口和一份 profile，最后把一次 `sprite_cleanup` 拖到 240 秒超时。
 *
 * 三条判据（**都按"连接/父进程没了"判断，绝不按运行时长**）：
 *   1. `startParentWatchdog`：子进程旁边挂一个看门狗，父进程一消失就把整棵树 kill 掉；
 *   2. `killProcessTree`：正常关闭路径**无条件**杀整棵树（旧的 `child.kill()` 只杀 broker，
 *      Edge 的 renderer/gpu 子进程会留下）；
 *   3. `sweepOrphanBrowsers`：宿主启动时扫一遍本插件的浏览器，**只杀父进程已经不在的那些**。
 *
 * ⚠️ 为什么不按时长杀：一条完整流水线里 `export` 单步就要 30~90 秒抠 48 帧，
 * 固定超时会误杀正在干活的会话。这是需求文档里特别标注的红线。
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** 本插件临时 profile 目录的前缀（`mkdtempSync(join(tmpdir(), 'drc-sprite-'))`）。 */
export const SPRITE_PROFILE_PREFIX = 'drc-sprite-'

/**
 * 这条命令行是不是**本插件**起的无头浏览器？
 *
 * 只认自己的 profile 目录，绝不通用地杀 msedge —— 用户可能同时开着正常的 Edge。
 * 纯函数，便于单测（这条判据一旦写宽，就会误伤用户正在用的浏览器）。
 */
export function isOurSpriteBrowserCommandLine(cmdline: string | undefined | null): boolean {
  if (typeof cmdline !== 'string' || cmdline === '') return false
  // 必须是无头模式：不能误判成用户正常的 Edge 窗口
  if (!/--headless/i.test(cmdline)) return false
  return cmdline.includes(`--user-data-dir=`) && cmdline.includes(SPRITE_PROFILE_PREFIX)
}

/** 进程还活着吗（`process.kill(pid, 0)` 在 Windows 上也能用来探测存在性）。 */
export function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * 杀掉整棵进程树。
 *
 * 为什么不用 `child.kill()`：那只杀直接子进程（Edge 的 broker），
 * renderer / gpu / utility 这些孙进程会留下来继续占端口和 profile。
 */
export function killProcessTree(pid: number, log?: (message: string, fields?: Record<string, string | number>) => void): void {
  if (!Number.isInteger(pid) || pid <= 0) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        // 同 browser.ts 的理由：子进程别继承宿主的工作目录（会把安装目录钉住，导致 DSH 自更新失败）
        cwd: os.tmpdir(),
      }).on('error', () => undefined)
      return
    } catch {
      /* 退回 process.kill */
    }
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    log?.('杀进程失败（可能已经退出）', { pid })
  }
}

/**
 * 看门狗：父进程（插件宿主）一旦消失，就把浏览器整棵树杀掉。
 *
 * 实现取向说明：
 * - **不用 node 起看门狗**：DSH 宿主的 `process.execPath` 是 Electron 本体，
 *   靠 `ELECTRON_RUN_AS_NODE` 让它当 node 用是有前提的（打包时可能关掉这个 fuse）；
 *   一旦不生效就会**再拉起一个 DSH 窗口**，比孤儿还糟。
 * - **也不用 cmd 批处理**：实测在 `detached + stdio:ignore` 下，批处理里的 `|` 管道会挂死，
 *   `findstr` 的引号转义在不同上下文里表现不一致（两种写法都翻过车，见下面的探针记录）。
 *   PowerShell 的 `Get-Process` / `taskkill` 语义稳定，代价只是多一个常驻小进程。
 *
 * ⚠️ 判据是「父进程没了」，**不是**「跑了多久」——一条流水线里 export 单步就要 30~90 秒，
 * 按时间硬杀会把正在干活的会话打死。
 */
export function startParentWatchdog(options: {
  browserPid: number
  parentPid: number
  profileDir: string
  log?: (message: string, fields?: Record<string, string | number>) => void
}): void {
  const { browserPid, parentPid, profileDir } = options
  if (process.platform !== 'win32') return
  if (!Number.isInteger(browserPid) || browserPid <= 0 || !Number.isInteger(parentPid) || parentPid <= 0) return
  try {
    const scriptPath = path.join(profileDir, 'watchdog.ps1')
    const script = [
      '$ErrorActionPreference = "SilentlyContinue"',
      `$parentPid = ${parentPid}`,
      `$browserPid = ${browserPid}`,
      'while ($true) {',
      '  Start-Sleep -Seconds 10',
      '  $parent = Get-Process -Id $parentPid -ErrorAction SilentlyContinue',
      '  $browser = Get-Process -Id $browserPid -ErrorAction SilentlyContinue',
      // 浏览器自己退了（正常关闭）就收工，别常驻
      '  if (-not $browser) { break }',
      // 父进程没了 → 孤儿：整棵树杀掉
      '  if (-not $parent) {',
      '    & taskkill.exe /PID $browserPid /T /F 2>$null | Out-Null',
      '    break',
      '  }',
      '}',
      '',
    ].join('\r\n')
    writeFileSync(scriptPath, script, 'utf8')
    const watcher = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      {
        stdio: 'ignore',
        windowsHide: true,
        // ⚠️ **不能**用 `detached: true`：实测在 Windows 上让 powershell.exe 以 detached 方式起，
        // 它会「立刻以退出码 0 结束、一行都不执行」（无控制台初始化失败）。
        // 不 detached 也照样能活过父进程被强杀——Windows 不会自动杀子进程，那正是我们要的。
        detached: false,
        // 同 browser.ts：子进程别把安装目录当 cwd（会让 DSH 自更新改名失败）
        cwd: os.tmpdir(),
      },
    )
    watcher.unref()
  } catch (error) {
    // 看门狗起不来不影响主流程：还有启动清理和正常关闭两条路兜着。
    options.log?.('看门狗没起来（不影响使用）', { message: String((error as Error)?.message ?? error).slice(0, 120) })
  }
}

/**
 * 找出本插件起的浏览器进程（含它们的父 PID），用于启动清理。
 *
 * 只查不杀，判断留给调用方——因为"该不该杀"的判据是**父进程还在不在**，
 * 而这件事只有 Node 侧好判断（`process.kill(pid, 0)`）。
 */
export async function listOurSpriteBrowsers(): Promise<Array<{ pid: number; ppid: number }>> {
  if (process.platform !== 'win32') return []
  try {
    const out = await new Promise<string>((resolve) => {
      const ps = spawn(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" -ErrorAction SilentlyContinue | " +
            'ForEach-Object { if ($_.CommandLine -match "--headless" -and $_.CommandLine -match "--user-data-dir=.*drc-sprite-") ' +
            '{ "$($_.ProcessId)|$($_.ParentProcessId)" } }',
        ],
        { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, cwd: os.tmpdir() },
      )
      let text = ''
      ps.stdout?.on('data', (chunk: Buffer) => {
        text += chunk.toString('utf8')
      })
      ps.on('error', () => resolve(''))
      ps.on('close', () => resolve(text))
    })
    const rows: Array<{ pid: number; ppid: number }> = []
    for (const line of out.split(/\r?\n/)) {
      const m = /^(\d+)\|(\d+)$/.exec(line.trim())
      if (!m) continue
      rows.push({ pid: Number(m[1]), ppid: Number(m[2]) })
    }
    return rows
  } catch {
    return []
  }
}

/**
 * 启动清理：只杀**父进程已经不在**的那些浏览器。
 *
 * 为什么不杀全部：用户可能同时开着第二个 DSH 实例，那边的浏览器父进程还活着；
 * 无差别清理会把人家正在跑的流水线打死。孤儿 = 父进程没了，这个判据不误伤。
 */
export async function sweepOrphanBrowsers(
  log?: (message: string, fields?: Record<string, string | number>) => void,
): Promise<number> {
  const rows = await listOurSpriteBrowsers()
  if (rows.length === 0) return 0
  let killed = 0
  const seen = new Set<number>()
  for (const row of rows) {
    if (seen.has(row.pid)) continue
    seen.add(row.pid)
    // 自己的父进程还活着 → 不是孤儿，别碰
    if (processAlive(row.ppid)) continue
    killProcessTree(row.pid, log)
    killed += 1
  }
  if (killed > 0) log?.('清掉残留的无头浏览器', { count: killed })
  return killed
}
