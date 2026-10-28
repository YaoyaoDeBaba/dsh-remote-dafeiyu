/**
 * service — 备份功能的 orchestration：分类 → 铺树 → 提交推送 → 写状态。
 *
 * ## 仓库怎么用（单写者模型）
 *
 * 这个功能只有"本机"一个写者，所以不需要合并逻辑，用**两份独立工作副本**最省心：
 *
 * - `work/hot` 跟踪 `latest` 分支：每轮 `fetch` → `reset --hard` → 覆盖文件 → `commit` → `push --force`
 * - `work/archive` 跟踪 `archive` 分支：同上，但**只加文件**（本地从远端 reset 之后只增），
 *   推的时候同样是 force —— 因为单写者下"远端 archive = 我上次推的那份"，
 *   force 等价于追加；换来的是彻底不用处理 rebase/冲突。
 *
 * 为什么不 `git clone`：`latest` 是孤儿分支、`archive` 可能还不存在，
 * `clone --branch` 在这两种情况下都会失败；`init + fetch + reset --hard` 三条路都能容错。
 *
 * ## 失败语义
 *
 * 任何一步失败都**不改**仓库状态（本地工作副本可能脏，但下一轮会 reset 掉），
 * 只把原因写进 `status.json` 与返回值。备份失败绝不许影响远控主链路。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_BACKUP_CONFIG,
  backupDir,
  normalizeConfig,
  readBackupConfig,
  readToken,
  redactToken,
  statusFile,
  workDir,
  writeBackupConfig,
  writeToken,
  type BackupConfig,
} from './config.js'
import { briefGitError, gitAvailable, runGit, type GitResult } from './git.js'
import {
  archivedKeysFromLsTree,
  buildArchiveTree,
  buildHotTree,
  classify,
  copyTree,
  findProfileDir,
  resetDir,
  scanSessions,
  type Manifest,
  type SessionEntry,
} from './pack.js'
import { writeSecure } from '../platform/secure-file.js'

export interface BackupStatus {
  enabled: boolean
  repoUrl: string
  intervalHours: number
  idleDays: number
  gitAvailable: boolean
  tokenSet: boolean
  tokenShape: string
  running: boolean
  lastRunAt: string | null
  lastResult: 'ok' | 'failed' | 'skipped' | null
  lastError: string
  lastHotCount: number
  lastHotBytes: number
  lastArchivedCount: number
  lastCommit: string
  lastDurationMs: number
  nextRunAt: string | null
  /** 配置读盘时发现的问题（坏 JSON 之类）。 */
  configProblem: string
  /** 恢复流程的状态。 */
  restore: { running: boolean; lastAt: string | null; lastResult: string; lastMessage: string }
}

export type SaveResult =
  | { ok: true; config: BackupConfig }
  | { ok: false; field: string; error: string }

export interface RunResult {
  ok: boolean
  reason: string
  hotCount: number
  hotBytes: number
  archivedCount: number
  commit: string
  durationMs: number
}

export interface BackupDeps {
  /** `~/.dsh`。 */
  dshHome: string
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
  /** 用来测：默认 `Date.now`。 */
  now?: () => number
  /** 定时器工厂（测试注入假时钟；默认真 setTimeout）。 */
  setTimer?: (fn: () => void, ms: number) => { cancel(): void }
}

const PACKAGE_NAMES = ['dsh-remote-dafeiyu', '@dsh-remote/plugin']

export class BackupService {
  private config: BackupConfig
  private configProblem = ''
  private timer: { cancel(): void } | undefined
  private running = false
  private status: BackupStatus
  private restoreState = { running: false, lastAt: null as string | null, lastResult: '', lastMessage: '' }
  private readonly now: () => number
  private readonly setTimer: (fn: () => void, ms: number) => { cancel(): void }

  constructor(private readonly deps: BackupDeps) {
    this.now = deps.now ?? (() => Date.now())
    this.setTimer = deps.setTimer ?? defaultTimer
    const loaded = readBackupConfig(deps.dshHome)
    this.config = loaded.config
    this.configProblem = loaded.problem ?? ''
    this.status = {
      enabled: this.config.enabled,
      repoUrl: this.config.repoUrl,
      intervalHours: this.config.intervalHours,
      idleDays: this.config.idleDays,
      gitAvailable: false,
      tokenSet: false,
      tokenShape: '',
      running: false,
      lastRunAt: null,
      lastResult: null,
      lastError: '',
      lastHotCount: 0,
      lastHotBytes: 0,
      lastArchivedCount: 0,
      lastCommit: '',
      lastDurationMs: 0,
      nextRunAt: null,
      configProblem: this.configProblem,
      restore: { running: false, lastAt: null, lastResult: '', lastMessage: '' },
    }
  }

  /** 当前状态（每次现算 token/git 两项，剩下是缓存的上次结果）。 */
  snapshot(): BackupStatus {
    const token = readToken(this.deps.dshHome)
    this.status.tokenSet = token !== ''
    this.status.tokenShape = redactToken(token)
    this.status.gitAvailable = gitAvailable()
    this.status.enabled = this.config.enabled
    this.status.repoUrl = this.config.repoUrl
    this.status.intervalHours = this.config.intervalHours
    this.status.idleDays = this.config.idleDays
    this.status.running = this.running
    this.status.configProblem = this.configProblem
    this.status.restore = { ...this.restoreState }
    return { ...this.status }
  }

  /** 当前配置（设置页铺表单用；token 不在这里）。 */
  currentConfig(): BackupConfig {
    return { ...this.config }
  }

  /** 设置页保存配置。返回 error 时调用方回 400（字段名一起给出去）。 */
  saveConfig(patch: Partial<Record<keyof BackupConfig, unknown>>): SaveResult {
    const normalized = normalizeConfig(patch, this.config)
    if (!normalized.ok) return normalized
    if (!writeBackupConfig(this.deps.dshHome, normalized.value)) {
      return { ok: false, field: 'file', error: '配置写不进去（目录权限？）' }
    }
    this.config = normalized.value
    this.configProblem = ''
    this.schedule()
    this.deps.log('备份配置已保存', {
      enabled: this.config.enabled,
      intervalHours: this.config.intervalHours,
      idleDays: this.config.idleDays,
    })
    return { ok: true, config: this.config }
  }

  /** 写 / 清 token（空串 = 清掉）。 */
  setToken(token: string): { ok: boolean; error?: string } {
    if (token !== '' && (token.length < 8 || /\s/.test(token))) {
      return { ok: false, error: 'token 太短或含空白字符' }
    }
    if (!writeToken(this.deps.dshHome, token)) return { ok: false, error: 'token 写不进去' }
    this.deps.log('备份 token 已更新', { tokenSet: token !== '' })
    return { ok: true }
  }

  /** 起定时器（关闭状态不排期）。重复调用是安全的。 */
  start(): void {
    this.schedule()
  }

  stop(): void {
    if (this.timer) {
      this.timer.cancel()
      this.timer = undefined
    }
  }

  private schedule(): void {
    if (this.timer) {
      this.timer.cancel()
      this.timer = undefined
    }
    this.status.nextRunAt = null
    if (!this.config.enabled || this.config.intervalHours <= 0) return
    const ms = this.config.intervalHours * 60 * 60 * 1000
    const nextAt = new Date(this.now() + ms).toISOString()
    this.status.nextRunAt = nextAt
    this.timer = this.setTimer(() => {
      this.timer = undefined
      void this.runOnce('定时')
      this.schedule()
    }, ms)
    // 定时器不许把事件循环钉住（headless 跑法会白等）。
    const handle = this.timer as unknown as { unref?: () => void }
    if (typeof handle.unref === 'function') handle.unref()
  }

  /**
   * 跑一次备份。
   *
   * 顺序：先归档（只增），再热快照。反过来的话"这一轮新冷却的那个会话"会既在热快照里
   * 又在归档里，多推一次几十 MB。
   */
  async runOnce(reason: string): Promise<RunResult> {
    const started = this.now()
    const empty: RunResult = {
      ok: false,
      reason,
      hotCount: 0,
      hotBytes: 0,
      archivedCount: 0,
      commit: '',
      durationMs: 0,
    }
    if (this.running) return { ...empty, reason: 'already-running' }
    if (!this.config.enabled) return this.finish(empty, '未启用（设置页里打开开关）', started)
    if (this.config.repoUrl === '') return this.finish(empty, '没填仓库地址', started)
    if (!gitAvailable()) return this.finish(empty, '本机没有 git（先装 Git for Windows）', started)

    this.running = true
    this.status.running = true
    try {
      const dirs = this.layout()
      mkdirSync(dirs.base, { recursive: true })

      const archiveRemote = this.fetchBranch(dirs.archiveRepo, this.config.archiveBranch)
      const archivedKeys = archivedKeysFromLsTree(archiveRemote.stdout)
      const sessions = scanSessions(dirs.sessionsRoot)
      const buckets = classify({
        sessions,
        nowMs: this.now(),
        idleDays: this.config.idleDays,
        archived: archivedKeys,
      })

      // ① 归档这一批冷却会话
      let archivedCount = 0
      if (buckets.cooling.length > 0) {
        const staged = buildArchiveTree(dirs.staging, buckets.cooling)
        if (staged.written > 0) {
          const pushed = this.publish(dirs.archiveRepo, this.config.archiveBranch, {
            message: `archive: ${staged.written} 个冷却会话（${new Date(this.now()).toISOString()}）`,
          })
          if (!pushed.ok) return this.finish(empty, `归档推送失败：${pushed.reason}`, started)
          archivedCount = staged.written
        }
      }

      // ② 热快照（force push，只留一份）
      const manifest: Manifest = buildHotTree({
        stagingDir: dirs.staging,
        sessionsRoot: dirs.sessionsRoot,
        storagesDir: dirs.storagesDir,
        profileDir: findProfileDir(dirs.profilesRoot, PACKAGE_NAMES),
        attachmentsDir: dirs.attachmentsDir,
        includeAttachments: this.config.includeAttachments,
        hot: buckets.hot,
        nowMs: this.now(),
      })
      const pushed = this.publish(dirs.hotRepo, this.config.latestBranch, {
        message: `latest: ${manifest.hotCount} 个会话 / ${formatBytes(manifest.hotBytes)}（快照至 ${manifest.snapshotAt}）`,
      })
      if (!pushed.ok) return this.finish(empty, `热快照推送失败：${pushed.reason}`, started)

      const result: RunResult = {
        ok: true,
        reason,
        hotCount: manifest.hotCount,
        hotBytes: manifest.hotBytes,
        archivedCount,
        commit: pushed.commit,
        durationMs: this.now() - started,
      }
      return this.finish(result, '', started)
    } catch (error) {
      return this.finish(empty, `意外错误：${String((error as Error)?.message ?? error).slice(0, 200)}`, started)
    } finally {
      this.running = false
      this.status.running = false
    }
  }

  private finish(result: RunResult, why: string, started: number): RunResult {
    const ok = result.ok
    this.status.lastRunAt = new Date(this.now()).toISOString()
    this.status.lastResult = ok ? 'ok' : why.startsWith('未启用') ? 'skipped' : 'failed'
    this.status.lastError = ok ? '' : why
    if (ok) {
      this.status.lastHotCount = result.hotCount
      this.status.lastHotBytes = result.hotBytes
      this.status.lastArchivedCount = result.archivedCount
      this.status.lastCommit = result.commit
      this.status.lastDurationMs = result.durationMs
    }
    this.writeStatus()
    this.deps.log(ok ? '备份完成' : '备份失败', {
      reason: result.reason,
      hotCount: result.hotCount,
      archivedCount: result.archivedCount,
      error: why,
      tookMs: this.now() - started,
    })
    return { ...result, ok, durationMs: this.now() - started, reason: ok ? result.reason : why }
  }

  private writeStatus(): void {
    try {
      writeSecure(statusFile(this.deps.dshHome), `${JSON.stringify(this.snapshot(), null, 2)}\n`)
    } catch {
      /* 状态写不进去不能影响备份本身 */
    }
  }

  /** 各目录一次算清（不复用 status 那套路径推导：备份的根是 `~/.dsh`）。 */
  private layout() {
    const base = backupDir(this.deps.dshHome)
    return {
      base,
      work: workDir(this.deps.dshHome),
      staging: path.join(base, 'staging'),
      hotRepo: path.join(workDir(this.deps.dshHome), 'hot'),
      archiveRepo: path.join(workDir(this.deps.dshHome), 'archive'),
      sessionsRoot: path.join(this.deps.dshHome, 'sessions'),
      storagesDir: path.join(this.deps.dshHome, 'storages'),
      profilesRoot: path.join(this.deps.dshHome, 'profiles'),
      attachmentsDir: path.join(this.deps.dshHome, 'attachments'),
    }
  }

  /**
   * 同步一个分支：`init`（缺则建）→ `fetch` → `reset --hard origin/<branch>`。
   * 分支不存在（第一次备份）返回空 stdout，调用方按"空归档"处理。
   */
  private fetchBranch(repo: string, branch: string): GitResult {
    this.prepareRepo(repo)
    const fetched = runGit(['fetch', '--depth', '1', 'origin', branch], {
      cwd: repo,
      env: this.gitEnv(),
    })
    if (fetched.code !== 0) {
      // 分支还不存在：不是错误（第一次备份）。
      if (isMissingRef(fetched)) return { ...fetched, code: 0, stdout: '', stderr: '' }
      return fetched
    }
    const reset = runGit(['reset', '--hard', `origin/${branch}`], { cwd: repo, env: this.gitEnv() })
    if (reset.code !== 0) return reset
    return runGit(['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: repo, env: this.gitEnv() })
  }

  private prepareRepo(repo: string): void {
    mkdirSync(repo, { recursive: true })
    if (!existsSync(path.join(repo, '.git'))) {
      runGit(['init', '-q'], { cwd: repo, env: this.gitEnv() })
      runGit(['config', 'user.name', 'dsh-backup'], { cwd: repo, env: this.gitEnv() })
      runGit(['config', 'user.email', 'dsh-backup@localhost'], { cwd: repo, env: this.gitEnv() })
    }
    // 远端地址每轮对齐（用户可能在设置页改了仓库）。
    const current = runGit(['remote', 'get-url', 'origin'], { cwd: repo, env: this.gitEnv() })
    if (current.code !== 0) {
      runGit(['remote', 'add', 'origin', this.config.repoUrl], { cwd: repo, env: this.gitEnv() })
    } else if (current.stdout.trim() !== this.config.repoUrl) {
      runGit(['remote', 'set-url', 'origin', this.config.repoUrl], { cwd: repo, env: this.gitEnv() })
    }
    // 别让宿主目录里的全局配置（比如 core.hooksPath）掺进来。
    runGit(['config', 'commit.gpgsign', 'false'], { cwd: repo, env: this.gitEnv() })
  }

  /** 把工作副本里的文件提交并推到远端分支（`--force`：单写者模型）。 */
  private publish(repo: string, branch: string, options: { message: string }): { ok: boolean; reason: string; commit: string } {
    // ⚠️ 这里必须自己 prepare：热快照那条路**不走** `fetchBranch`（它每轮整体覆盖，
    // 不需要远端的内容），少了这一句就是 `git ls-files` 在一个不存在的目录里跑，
    // 报错还长得像"git 没装"。真机回归里见过一次，记在这里。
    this.prepareRepo(repo)
    const tracked = runGit(['ls-files'], { cwd: repo, env: this.gitEnv() })
    if (tracked.code !== 0) return { ok: false, reason: briefGitError(tracked), commit: '' }
    const keep = new Set(tracked.stdout.split('\n').map((line) => line.trim()).filter((line) => line !== ''))
    // 清掉工作副本里除 .git 之外的东西（每轮内容整体重铺）。
    clearExceptGit(repo)
    const source = path.join(this.layout().staging, branch === this.config.latestBranch ? 'latest' : 'archive')
    if (!existsSync(source)) return { ok: false, reason: '暂存目录是空的（这一步不该失败）', commit: '' }
    copyTree(source, repo)

    const added = runGit(['add', '-A'], { cwd: repo, env: this.gitEnv() })
    if (added.code !== 0) return { ok: false, reason: briefGitError(added), commit: '' }
    const status = runGit(['status', '--porcelain'], { cwd: repo, env: this.gitEnv() })
    const dirty = status.stdout.trim() !== ''
    if (!dirty && keep.size > 0) {
      // 内容没变：不造空提交（否则每 8 小时一个空提交，仓库全是噪声）。
      const head = runGit(['rev-parse', '--short', 'HEAD'], { cwd: repo, env: this.gitEnv() })
      return { ok: true, reason: '', commit: head.stdout.trim() }
    }
    /**
     * 每一轮都造一个**没有父提交的孤儿提交**（`write-tree` + `commit-tree` 不带 `-p`）。
     *
     * 为什么不用 `git commit`：那会在本地分支上一条条攒下去，`push --force` 推的是整条链
     * ⇒ 远端的 `latest` 也会长出一串历史。"只留最新一份"要的是**仓库里真的只有一份**，
     * 所以内容换一份、历史也换一份。归档分支同理：它的**内容**只增，但历史不必留。
     */
    const tree = runGit(['write-tree'], { cwd: repo, env: this.gitEnv() })
    if (tree.code !== 0) return { ok: false, reason: briefGitError(tree), commit: '' }
    const commitTree = runGit(['commit-tree', tree.stdout.trim(), '-m', options.message], {
      cwd: repo,
      env: this.gitEnv(),
    })
    if (commitTree.code !== 0) return { ok: false, reason: briefGitError(commitTree), commit: '' }
    const commitSha = commitTree.stdout.trim()
    const pushed = runGit(['push', '--force', 'origin', `${commitSha}:refs/heads/${branch}`], {
      cwd: repo,
      env: this.gitEnv(),
      timeoutMs: 20 * 60 * 1000,
    })
    if (pushed.code !== 0) return { ok: false, reason: briefGitError(pushed), commit: '' }
    // 本地 HEAD 跟上（下一轮的 `ls-files` / `rev-parse` 才有东西可看）。
    runGit(['update-ref', 'HEAD', commitSha], { cwd: repo, env: this.gitEnv() })
    return { ok: true, reason: '', commit: commitSha.slice(0, 7) }
  }

  /**
   * git 的环境：token 走 `GIT_ASKPASS`，**不进命令行**。
   * 命令行参数在 Windows 上同用户的进程都看得到；凭据不该出现在那里。
   */
  private gitEnv(): Record<string, string> {
    const token = readToken(this.deps.dshHome)
    if (token === '') return {}
    const helper = this.askpassScript()
    return {
      GIT_ASKPASS: helper,
      DSH_BACKUP_TOKEN: token,
      GIT_TERMINAL_PROMPT: '0',
    }
  }

  private askpassScript(): string {
    const base = backupDir(this.deps.dshHome)
    mkdirSync(base, { recursive: true })
    if (process.platform === 'win32') {
      const file = path.join(base, 'askpass.cmd')
      if (!existsSync(file)) writeFileSync(file, '@echo off\r\n<NUL set /p =%DSH_BACKUP_TOKEN%\r\n', 'utf8')
      return file
    }
    const file = path.join(base, 'askpass.sh')
    if (!existsSync(file)) {
      writeFileSync(file, '#!/bin/sh\nprintf "%s" "$DSH_BACKUP_TOKEN"\n', { encoding: 'utf8', mode: 0o700 })
    }
    return file
  }

  /**
   * 从备份恢复：把 `latest/` 与 `archive/` 解回 `~/.dsh`。
   *
   * **先挪走现有目录**（`<name>.before-restore-<时间戳>`），失败也不删原来的东西；
   * 恢复完提示重启（会话列表是启动期扫盘的）。
   */
  async restore(): Promise<{ ok: boolean; message: string; restoredSessions: number }> {
    if (this.restoreState.running) return { ok: false, message: '正在恢复，别重复点', restoredSessions: 0 }
    if (this.config.repoUrl === '') return { ok: false, message: '没填仓库地址', restoredSessions: 0 }
    if (!gitAvailable()) return { ok: false, message: '本机没有 git', restoredSessions: 0 }
    this.restoreState = { running: true, lastAt: null, lastResult: 'running', lastMessage: '' }
    this.writeStatus()
    try {
      const dirs = this.layout()
      const staging = dirs.staging
      resetDir(staging)
      const latest = this.fetchBranch(dirs.hotRepo, this.config.latestBranch)
      if (latest.code !== 0) return this.restoreDone(false, `拉取失败：${briefGitError(latest)}`)
      copyTree(dirs.hotRepo, path.join(staging, 'latest'))
      const archiveRepoDir = dirs.archiveRepo
      const archive = this.fetchBranch(archiveRepoDir, this.config.archiveBranch)
      let archivedSessions = 0
      if (archive.code === 0 && archive.stdout.trim() !== '') {
        copyTree(archiveRepoDir, path.join(staging, 'archive'))
        archivedSessions = countSessionFiles(path.join(staging, 'archive'))
      }

      const stamp = new Date(this.now()).toISOString().replace(/[:.]/g, '-')
      const sessionsRoot = dirs.sessionsRoot
      const restoreLatest = path.join(staging, 'latest')
      const restoredHot = existsSync(path.join(restoreLatest, 'sessions'))
        ? countSessionFiles(path.join(restoreLatest, 'sessions'))
        : 0
      // 现有目录先挪开（不删：这是用户唯一的现场）。
      for (const name of ['sessions', 'storages', 'attachments'] as const) {
        const target = path.join(this.deps.dshHome, name)
        if (existsSync(target)) {
          renameSync(target, `${target}.${this.config.restoreBackupSuffix}-${stamp}`)
        }
      }
      // 再铺回去：先热（新的覆盖旧的），再归档（只补缺的）。
      mergeTree(path.join(restoreLatest, 'sessions'), sessionsRoot)
      mergeTree(path.join(restoreLatest, 'storages'), path.join(this.deps.dshHome, 'storages'))
      if (existsSync(path.join(restoreLatest, 'attachments'))) {
        mergeTree(path.join(restoreLatest, 'attachments'), path.join(this.deps.dshHome, 'attachments'))
      }
      mergeTree(path.join(staging, 'archive'), sessionsRoot)
      const profiles = path.join(restoreLatest, 'profiles')
      if (existsSync(profiles)) mergeProfiles(profiles, dirs.profilesRoot)
      return this.restoreDone(
        true,
        `恢复了 ${restoredHot} 个热会话 + ${archivedSessions} 个归档会话，重启飞鱼后生效（旧目录已改名为 *-${this.config.restoreBackupSuffix}-${stamp}）`,
      )
    } catch (error) {
      return this.restoreDone(false, `恢复失败：${String((error as Error)?.message ?? error).slice(0, 200)}`)
    }
  }

  private restoreDone(ok: boolean, message: string): { ok: boolean; message: string; restoredSessions: number } {
    this.restoreState = {
      running: false,
      lastAt: new Date(this.now()).toISOString(),
      lastResult: ok ? 'ok' : 'failed',
      lastMessage: message,
    }
    this.writeStatus()
    this.deps.log(ok ? '备份恢复完成' : '备份恢复失败', { message })
    const matched = /恢复了 (\d+)/.exec(message)
    return { ok, message, restoredSessions: matched ? Number(matched[1]) : 0 }
  }
}

/** 默认定时器：`setTimeout` + `unref`（headless 跑法不许被它钉住）。 */
function defaultTimer(fn: () => void, ms: number): { cancel(): void } {
  const handle = setTimeout(fn, ms)
  const unref = (handle as unknown as { unref?: () => void }).unref
  if (typeof unref === 'function') unref.call(handle)
  return { cancel: () => clearTimeout(handle) }
}

/** 远端还没有这个分支（第一次备份）—— `fetch` 的报错文本在各地 git 版本里不一样。 */
function isMissingRef(result: GitResult): boolean {
  const text = `${result.stderr}\n${result.stdout}`.toLowerCase()
  return /couldn't find remote ref|could not find remote ref|unknown revision|no such ref/.test(text)
}

/** 清掉仓库工作副本里除 `.git` 之外的一切。 */
function clearExceptGit(repo: string): void {
  for (const entry of readdirSync(repo, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    const target = path.join(repo, entry.name)
    rmSync(target, { recursive: true, force: true })
  }
}

/** 把 `source` 摊进 `target`（**不覆盖**已存在的文件：归档只补缺）。 */
function mergeTree(source: string, target: string): void {
  if (!existsSync(source)) return
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name)
    const to = path.join(target, entry.name)
    if (entry.isDirectory()) {
      mkdirSync(to, { recursive: true })
      mergeTree(from, to)
      continue
    }
    if (!entry.isFile()) continue
    if (existsSync(to)) continue
    mkdirSync(target, { recursive: true })
    copyFileSync(from, to)
  }
}

/** profile 配置覆盖回去（它是"配置"，不是"记忆"，该覆盖）。 */
function mergeProfiles(source: string, profilesRoot: string): void {
  if (!existsSync(profilesRoot)) return
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const from = path.join(source, entry.name)
    const to = path.join(profilesRoot, entry.name)
    if (!existsSync(to)) continue
    for (const file of readdirSync(from, { withFileTypes: true })) {
      if (!file.isFile()) continue
      copyFileSync(path.join(from, file.name), path.join(to, file.name))
    }
  }
}

function countSessionFiles(root: string): number {
  let count = 0
  const walk = (dir: string): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/^session.*\.jsonl(\.zstd)?$/.test(entry.name)) count += 1
    }
  }
  if (existsSync(root)) walk(root)
  return count
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

/** 只给测试用：清掉一个 `~/.dsh` 下的备份目录。 */
export function resetBackupState(dshHome: string): void {
  rmSync(backupDir(dshHome), { recursive: true, force: true })
}

export { DEFAULT_BACKUP_CONFIG, readBackupConfig, readFileSync, statSync, type SessionEntry }
