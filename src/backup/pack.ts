/**
 * pack — 把 `~/.dsh` 里的"工作记忆"扫出来、分成热/冷、铺成一个可提交的目录树。
 *
 * ## 布局（就是备份仓库里的样子）
 *
 * ```
 * latest/                                    ← 一个提交，只留最新
 *   sessions/<slug>/session-<id>/session.v4.jsonl.zstd
 *   storages/*.json
 *   profiles/<name>/package.json
 *   profiles/<name>/cordis.patch.yml
 *   attachments/**                            （可选）
 *   MANIFEST.json
 * archive/<slug>/session-<id>/session.v4.jsonl.zstd   ← 只增不改
 * ```
 *
 * 结构**与本地一模一样**，恢复时就是"拷回去"，不需要任何转换逻辑——
 * 转换逻辑是这类工具里最容易写错、也最难测的一块。
 *
 * ## 为什么要排除那几个东西
 *
 * `node_modules` / `dsh-runtimes` 是运行时（几百 MB，装回来就有）；
 * `.credentials.yaml` 是明文 API key；`dsh-remote-control/*` 是配对密钥。
 * 这三样进仓库等于把凭据交给 Git 托管平台。
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import path from 'node:path'

export interface SessionEntry {
  /** 工作区目录名（`--E-MonSlayer--` 这种，由本地绝对路径编码而来）。 */
  slug: string
  /** 会话目录名（`session-<uuid>`）。 */
  dirName: string
  /** 文件名（`session.v4.jsonl.zstd`）。 */
  fileName: string
  /** 绝对路径。 */
  file: string
  /** 相对 `sessions/` 的路径（`<slug>/<dirName>/<fileName>`）。 */
  relPath: string
  mtimeMs: number
  size: number
}

/** 扫 `~/.dsh/sessions`：`<slug>/<session-dir>/<file>`，只认会话文件。 */
export function scanSessions(sessionsRoot: string): SessionEntry[] {
  const entries: SessionEntry[] = []
  for (const slug of safeDirs(sessionsRoot)) {
    const slugDir = path.join(sessionsRoot, slug)
    for (const dirName of safeDirs(slugDir)) {
      const sessionDir = path.join(slugDir, dirName)
      for (const fileName of safeFiles(sessionDir)) {
        if (!isSessionFile(fileName)) continue
        const file = path.join(sessionDir, fileName)
        let stat
        try {
          stat = statSync(file)
        } catch {
          continue
        }
        entries.push({
          slug,
          dirName,
          fileName,
          file,
          relPath: path.posix.join(slug, dirName, fileName),
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        })
      }
    }
  }
  return entries.sort((left, right) => left.relPath.localeCompare(right.relPath))
}

/** 会话文件名：`session.<vN>.jsonl[.zstd]`（版本号是宿主内部格式，别写死 v4）。 */
function isSessionFile(fileName: string): boolean {
  return /^session(\.[A-Za-z0-9]+)?\.jsonl(\.zstd)?$/.test(fileName)
}

function safeDirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

function safeFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

export interface ClassifyInput {
  sessions: SessionEntry[]
  nowMs: number
  idleDays: number
  /** 归档分支里**已经有**的会话（`<slug>/<dirName>`），这些不再进热快照。 */
  archived: Set<string>
}

export interface ClassifyResult {
  /** 进热快照：没归档过，且最近 idleDays 天内动过。 */
  hot: SessionEntry[]
  /** 该归档：没归档过，且已冷却。 */
  cooling: SessionEntry[]
  /** 已经归档过、这轮也不热的（不再参与任何上传）。 */
  resting: SessionEntry[]
  /** 已归档过、**又**被写过的（续聊复活）：热快照带上最新版，归档分支里那份旧快照不动。 */
  revived: SessionEntry[]
}

export function sessionKey(entry: Pick<SessionEntry, 'slug' | 'dirName'>): string {
  return `${entry.slug}/${entry.dirName}`
}

/**
 * 三分类 + 一条复活规则。
 *
 * 复活规则（讨论时定的）：已在 `archive` 的会话又被写了 ⇒ 热快照带上最新版；
 * 归档分支**不覆盖**（只增不改），恢复时热的那份覆盖旧的即可。
 */
export function classify(input: ClassifyInput): ClassifyResult {
  const cutoff = input.nowMs - input.idleDays * 24 * 60 * 60 * 1000
  const hot: SessionEntry[] = []
  const cooling: SessionEntry[] = []
  const resting: SessionEntry[] = []
  const revived: SessionEntry[] = []
  for (const entry of input.sessions) {
    const archived = input.archived.has(sessionKey(entry))
    const isCool = entry.mtimeMs < cutoff
    if (archived) {
      if (isCool) resting.push(entry)
      else revived.push(entry)
      continue
    }
    if (isCool) cooling.push(entry)
    else hot.push(entry)
  }
  // 复活的那批也要进热快照。
  return { hot: [...hot, ...revived], cooling, resting, revived }
}

export interface Manifest {
  format: 1
  plugin: string
  /**
   * 这一份快照"对应到哪个时刻"——取热会话里**最新的 mtime**，不是"这轮什么时候跑的"。
   *
   * ⚠️ 这里必须是**内容的函数**：`publish` 靠"内容没变就不提交"来避免每 8 小时一个空提交，
   * 一旦塞进墙钟时间，那条判据就永远判不出来（真机上是"仓库里全是空提交"）。
   * "这轮什么时候跑的"属于 `status.json`（`lastRunAt`），不属于快照内容。
   */
  snapshotAt: string
  hostname: string
  hotCount: number
  hotBytes: number
  sessions: Array<{ key: string; size: number; mtime: string; sha256: string }>
  storages: string[]
  profiles: string[]
  attachments: { count: number; bytes: number } | null
}

export interface BuildHotInput {
  /** 备份根的暂存目录（会被清空重写）。 */
  stagingDir: string
  /** `~/.dsh/sessions`。 */
  sessionsRoot: string
  /** `~/.dsh/storages`。 */
  storagesDir: string
  /** 找到的 profile 目录（可能为空 = 没有 profile 配置可备）。 */
  profileDir: string
  attachmentsDir: string
  includeAttachments: boolean
  hot: SessionEntry[]
  nowMs: number
}

/** 把热会话 + storages + profile 配置铺进 staging 目录，返回清单。 */
export function buildHotTree(input: BuildHotInput): Manifest {
  const staging = path.join(input.stagingDir, 'latest')
  resetDir(staging)

  const sessionList: Manifest['sessions'] = []
  for (const entry of input.hot) {
    const target = path.join(staging, 'sessions', entry.relPath)
    mkdirSync(path.dirname(target), { recursive: true })
    copyFileSync(entry.file, target)
    sessionList.push({
      key: sessionKey(entry),
      size: entry.size,
      mtime: new Date(entry.mtimeMs).toISOString(),
      sha256: sha256Of(entry.file),
    })
  }

  const storages = copyFlat(input.storagesDir, path.join(staging, 'storages'))

  const profiles: string[] = []
  if (input.profileDir !== '') {
    const target = path.join(staging, 'profiles', path.basename(input.profileDir))
    for (const name of ['package.json', 'cordis.patch.yml', 'cordis.yml', 'pnpm-workspace.yaml']) {
      const source = path.join(input.profileDir, name)
      if (!existsSync(source)) continue
      mkdirSync(target, { recursive: true })
      copyFileSync(source, path.join(target, name))
      profiles.push(name)
    }
  }

  let attachments: Manifest['attachments'] = null
  if (input.includeAttachments) {
    const counted = copyTree(input.attachmentsDir, path.join(staging, 'attachments'))
    if (counted.count > 0) attachments = counted
  }

  const newestMtime = input.hot.reduce((max, entry) => Math.max(max, entry.mtimeMs), 0)
  const manifest: Manifest = {
    format: 1,
    plugin: 'dsh-remote-dafeiyu',
    snapshotAt: new Date(newestMtime > 0 ? newestMtime : input.nowMs).toISOString(),
    hostname: safeHostname(),
    hotCount: sessionList.length,
    hotBytes: sessionList.reduce((sum, entry) => sum + entry.size, 0),
    sessions: sessionList,
    storages,
    profiles,
    attachments,
  }
  writeFileSync(path.join(staging, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifest
}

export interface ArchiveResult {
  /** 成功铺进归档目录的会话数。 */
  written: number
  bytes: number
  keys: string[]
}

/** 把冷却会话铺到 `archive/<slug>/<dirName>/<fileName>`（只增不改，已存在就跳过）。 */
export function buildArchiveTree(stagingDir: string, cooling: SessionEntry[]): ArchiveResult {
  const root = path.join(stagingDir, 'archive')
  let written = 0
  let bytes = 0
  const keys: string[] = []
  for (const entry of cooling) {
    const target = path.join(root, entry.relPath)
    if (existsSync(target)) continue
    mkdirSync(path.dirname(target), { recursive: true })
    copyFileSync(entry.file, target)
    written += 1
    bytes += entry.size
    keys.push(sessionKey(entry))
  }
  return { written, bytes, keys }
}

/** 清空并重建一个目录（暂存目录专用：里面只有我们自己铺的东西）。 */
export function resetDir(dir: string): void {
  try {
    rmrf(dir)
  } catch {
    /* 删不掉就往上铺（同名文件会被覆盖） */
  }
  mkdirSync(dir, { recursive: true })
}

function rmrf(dir: string): void {
  if (!existsSync(dir)) return
  rmSync(dir, { recursive: true, force: true })
}

function copyFlat(sourceDir: string, targetDir: string): string[] {
  if (!existsSync(sourceDir)) return []
  const names: string[] = []
  for (const name of safeFiles(sourceDir)) {
    if (!/\.json$/.test(name)) continue
    mkdirSync(targetDir, { recursive: true })
    copyFileSync(path.join(sourceDir, name), path.join(targetDir, name))
    names.push(name)
  }
  return names
}

export interface CopyCount {
  count: number
  bytes: number
}

/** 递归拷贝目录（附件用）。不跟随符号链接，避免把别处的东西拖进来。 */
export function copyTree(sourceDir: string, targetDir: string): CopyCount {
  const total: CopyCount = { count: 0, bytes: 0 }
  if (!existsSync(sourceDir)) return total
  walk(sourceDir, targetDir, total)
  return total
}

function walk(sourceDir: string, targetDir: string, total: CopyCount): void {
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name)
    const target = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      walk(source, target, total)
      continue
    }
    if (!entry.isFile()) continue
    let size = 0
    try {
      size = statSync(source).size
    } catch {
      continue
    }
    mkdirSync(targetDir, { recursive: true })
    copyFileSync(source, target)
    total.count += 1
    total.bytes += size
  }
}

function sha256Of(file: string): string {
  try {
    return createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16)
  } catch {
    return ''
  }
}

function safeHostname(): string {
  try {
    return hostname()
  } catch {
    return 'unknown'
  }
}

/**
 * 找 profile 目录：`~/.dsh/profiles/*` 里，`package.json` 的 `dsh.profile.bundles`
 * 含本插件的那一个（取最近改动的）。找不到就返回空串（配置就不备了，其余照常）。
 */
export function findProfileDir(profilesRoot: string, packageNames: string[]): string {
  if (!existsSync(profilesRoot)) return ''
  let best = { dir: '', mtimeMs: 0 }
  for (const name of safeDirs(profilesRoot)) {
    const dir = path.join(profilesRoot, name)
    const manifest = path.join(dir, 'package.json')
    if (!existsSync(manifest)) continue
    try {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as {
        dsh?: { profile?: { bundles?: unknown } }
      }
      const bundles = Array.isArray(parsed.dsh?.profile?.bundles) ? (parsed.dsh.profile.bundles as unknown[]) : []
      if (!bundles.some((entry) => typeof entry === 'string' && packageNames.includes(entry))) continue
      const mtimeMs = statSync(manifest).mtimeMs
      if (mtimeMs > best.mtimeMs) best = { dir, mtimeMs }
    } catch {
      continue
    }
  }
  return best.dir
}

/** 归档分支里已有哪些会话：`git ls-tree -r --name-only archive` 的输出 → Set。 */
export function archivedKeysFromLsTree(stdout: string): Set<string> {
  const keys = new Set<string>()
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const parts = trimmed.split('/')
    if (parts.length < 3) continue
    keys.add(`${parts[0]}/${parts[1]}`)
  }
  return keys
}
