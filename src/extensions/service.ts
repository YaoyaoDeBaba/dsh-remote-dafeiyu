/**
 * extensions/service — 「扩展列表」的状态读取、改动计划、落盘与 pnpm。
 *
 * 分三层，越往下越"纯"：
 *
 * 1. `readExtensionStatus` / `planAction` 是**只读 + 纯函数**：给 profile 目录和 spec，
 *    回答"现在什么状态""点这个按钮要对 package.json 改什么"。判据钉的是这一层；
 * 2. `applyAction` 才碰盘：**备份 → 原子写（临时文件 + rename）→ 写后校验 → 失败回滚**，
 *    然后（只有 install / uninstall）跑 `pnpm install`；
 * 3. 文件系统与 pnpm 都是**注入**的（`FsLike` / `PnpmRunner`）：真实的 `pnpm install`
 *    会改 profile、动 node_modules，判据里绝不能真跑一次。
 *
 * ## profile 里两个决定"插件是否生效"的位置
 *
 * - `dependencies`：装了哪些包（值形如 `git+<url>#<sha>`）；
 * - `dsh.profile.bundles`：**哪些被启用**——不在这个数组里就不加载。
 *
 * 「禁用」只动 bundles（依赖与 node_modules 都留着，随时能启用回去）；「卸载」两处都动。
 * 任何改动都要重启 DSH 才生效，所以回执里 `needsRestart` 恒为 true，界面必须说出来。
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { dependencyOf, EXTENSIONS, findExtension, type ExtensionSpec } from './registry.js'

export type Log = (message: string, fields?: Record<string, string | number | boolean | undefined>) => void

/** 四种动作。字符串值同时也是路由与面板传的那个 `action`。 */
export type ExtensionAction = 'install' | 'enable' | 'disable' | 'uninstall'

export const EXTENSION_ACTIONS: readonly ExtensionAction[] = ['install', 'enable', 'disable', 'uninstall']

export function isExtensionAction(value: unknown): value is ExtensionAction {
  return typeof value === 'string' && (EXTENSION_ACTIONS as readonly string[]).includes(value)
}

/** 一个扩展在设置页上的样子。`needsRestart` 由调用方告诉它（本次运行里刚改过）。 */
export interface ExtensionStatus {
  id: string
  label: string
  description: string
  installed: boolean
  enabled: boolean
  version?: string
  needsRestart?: boolean
}

/** 动作对 profile 的改动（纯数据，`planAction` 的返回值）。 */
export interface PlanWrites {
  /** 写 `dependencies[packageName] = git+<gitUrl>#<commit>`。 */
  addDependency?: string
  /** 删 `dependencies[packageName]`。 */
  removeDependency?: boolean
  /** 把包名加进 `dsh.profile.bundles`。 */
  addBundle?: boolean
  /** 从 `dsh.profile.bundles` 里移除包名（依赖保留）。 */
  removeBundle?: boolean
}

export type PlanResult = { changed: true; writes: PlanWrites; runPnpm: boolean } | { changed: false; message: string }

export interface ApplyResult {
  ok: boolean
  changed: boolean
  needsRestart: boolean
  message?: string
  version?: string
}

// ── 文件系统（注入）──────────────────────────────────────────────────

/** 只用到这五个调用：判存在、读、写、原子换名、（错误路径上）删临时文件。 */
export interface FsLike {
  existsSync(file: string): boolean
  readFileSync(file: string, encoding: 'utf8'): string
  writeFileSync(file: string, data: string, encoding: 'utf8'): void
  renameSync(from: string, to: string): void
  unlinkSync?(file: string): void
}

export const nodeFs: FsLike = {
  existsSync: (file) => existsSync(file),
  // 包一层而不是直接传引用：node 的 readFileSync 是重载，直接传会被 TS 判成 Buffer 那个签名。
  readFileSync: (file, encoding) => readFileSync(file, encoding),
  writeFileSync: (file, data, encoding) => writeFileSync(file, data, encoding),
  renameSync: (from, to) => renameSync(from, to),
  unlinkSync: (file) => unlinkSync(file),
}

// ── profile 的读 ─────────────────────────────────────────────────────

export type ProfileRead =
  | { kind: 'ok'; file: string; text: string; doc: Record<string, unknown> }
  | { kind: 'missing'; file: string }
  | { kind: 'broken'; file: string; message: string }

export function profilePackageFile(profileDir: string): string {
  return path.join(profileDir, 'package.json')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/** 读 profile 的 package.json。**坏 JSON 不当空对象**——后面 apply 会拒绝写坏文件。 */
export function readProfilePackage(profileDir: string, fs: FsLike = nodeFs): ProfileRead {
  const file = profilePackageFile(profileDir)
  if (!fs.existsSync(file)) return { kind: 'missing', file }
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (error) {
    return { kind: 'broken', file, message: `读不出来：${String((error as Error)?.message ?? error).slice(0, 160)}` }
  }
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { kind: 'broken', file, message: '内容不是 JSON 对象' }
    }
    return { kind: 'ok', file, text, doc: parsed as Record<string, unknown> }
  } catch (error) {
    return { kind: 'broken', file, message: `不是合法 JSON：${String((error as Error)?.message ?? error).slice(0, 160)}` }
  }
}

/** `dsh.profile.bundles` 的只读视图（结构不对就当空表，不来抛）。 */
export function bundlesOf(doc: Record<string, unknown>): string[] {
  const profile = asRecord(asRecord(doc.dsh).profile)
  const bundles = profile.bundles
  return Array.isArray(bundles) ? bundles.filter((name): name is string => typeof name === 'string') : []
}

function dependenciesOf(doc: Record<string, unknown>): Record<string, unknown> {
  return asRecord(doc.dependencies)
}

/** 包里 `package.json` 的路径（`node_modules/<pkg>/package.json`，认 scope）。 */
export function installedPackageFile(profileDir: string, packageName: string): string {
  return path.join(profileDir, 'node_modules', ...packageName.split('/'), 'package.json')
}

function readInstalledVersion(profileDir: string, spec: ExtensionSpec, fs: FsLike): string | undefined {
  const file = installedPackageFile(profileDir, spec.packageName)
  if (!fs.existsSync(file)) return undefined
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    const version = asRecord(parsed).version
    return typeof version === 'string' && version !== '' ? version : undefined
  } catch {
    // 装的包 package.json 坏了：不影响"装没装"的判断（文件在就是装了），只是报不出版本。
    return undefined
  }
}

/**
 * 一个扩展现在什么状态。
 *
 * - `installed` = `dependencies` 里有它 **且** `node_modules/<pkg>/package.json` 存在
 *   （只写依赖但没装成 = 没装：`pnpm install` 失败过的那种现场，界面要给「安装」而不是「启用」）；
 * - `enabled` = `dsh.profile.bundles` 里有它（不在就**不加载**，这就是"装了但禁用"）；
 * - `version` 从**装上的那个包**读，不从 dependencies 的 git 串猜。
 */
export function readExtensionStatus(
  profileDir: string,
  spec: ExtensionSpec,
  options: { fs?: FsLike; pendingRestart?: ReadonlySet<string> } = {},
): ExtensionStatus {
  const fs = options.fs ?? nodeFs
  const read = readProfilePackage(profileDir, fs)
  const doc = read.kind === 'ok' ? read.doc : {}
  const hasDependency = typeof dependenciesOf(doc)[spec.packageName] === 'string'
  const installed = hasDependency && fs.existsSync(installedPackageFile(profileDir, spec.packageName))
  const enabled = bundlesOf(doc).includes(spec.packageName)
  const status: ExtensionStatus = {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    installed,
    enabled,
  }
  const version = installed ? readInstalledVersion(profileDir, spec, fs) : undefined
  if (version !== undefined) status.version = version
  if (options.pendingRestart?.has(spec.id) === true) status.needsRestart = true
  return status
}

/** 整张表（白名单里每一条都问一遍）。 */
export function readExtensions(
  profileDir: string,
  options: { fs?: FsLike; pendingRestart?: ReadonlySet<string>; specs?: readonly ExtensionSpec[] } = {},
): ExtensionStatus[] {
  return (options.specs ?? EXTENSIONS).map((spec) =>
    readExtensionStatus(profileDir, spec, { fs: options.fs, pendingRestart: options.pendingRestart }),
  )
}

// ── 计划（纯函数）────────────────────────────────────────────────────

/**
 * 点一个按钮 → 要对 profile 做哪些改动。**纯函数**：没有 fs、没有网络，判据直接钉这张表。
 *
 * | action      | dependencies                  | bundles           | pnpm |
 * |-------------|-------------------------------|-------------------|------|
 * | `install`   | 写入 `git+url#sha`            | 加                | 跑   |
 * | `enable`    | 不动                          | 加                | 不跑 |
 * | `disable`   | **不动**（文件都还留着）      | 移除              | 不跑 |
 * | `uninstall` | 移除                          | 移除              | 跑   |
 *
 * 幂等：已经处于目标状态 → `{changed:false, message:'已经是这个状态'}`（不报错、不静默）。
 * `install` 的目标状态是"装了**且**启用"：装了但禁用时点安装 = 补上 bundle（不改依赖）。
 *
 * 不认的动作直接 `throw`：路由那层先用 `isExtensionAction` 挡一次，走到这里是编程错误。
 */
export function planAction(spec: ExtensionSpec, action: ExtensionAction, status: ExtensionStatus): PlanResult {
  switch (action) {
    case 'install': {
      if (status.installed && status.enabled) return { changed: false, message: '已经是这个状态' }
      // 依赖每次都按白名单重钉一次 sha：装着的可能还是旧 commit（扩展升级走的就是这条路）。
      return { changed: true, writes: { addDependency: dependencyOf(spec), addBundle: true }, runPnpm: true }
    }
    case 'enable': {
      if (!status.installed) return { changed: false, message: '还没安装，先点安装' }
      if (status.enabled) return { changed: false, message: '已经是这个状态' }
      return { changed: true, writes: { addBundle: true }, runPnpm: false }
    }
    case 'disable': {
      if (!status.enabled) return { changed: false, message: '已经是这个状态' }
      return { changed: true, writes: { removeBundle: true }, runPnpm: false }
    }
    case 'uninstall': {
      if (!status.installed && !status.enabled) return { changed: false, message: '已经是这个状态' }
      return { changed: true, writes: { removeDependency: true, removeBundle: true }, runPnpm: true }
    }
    default:
      throw new Error(`不支持的动作：${String(action)}`)
  }
}

function cloneDoc(doc: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(doc)) as Record<string, unknown>
}

/** 把计划里的改动落到一份**新** doc 上（不改入参）。 */
export function applyWrites(
  doc: Record<string, unknown>,
  writes: PlanWrites,
  spec: ExtensionSpec,
): Record<string, unknown> {
  const next = cloneDoc(doc)
  if (writes.addDependency !== undefined || writes.removeDependency === true) {
    const dependencies = { ...asRecord(next.dependencies) }
    if (writes.removeDependency === true) delete dependencies[spec.packageName]
    if (writes.addDependency !== undefined) dependencies[spec.packageName] = writes.addDependency
    next.dependencies = dependencies
  }
  if (writes.addBundle === true || writes.removeBundle === true) {
    const dsh = { ...asRecord(next.dsh) }
    const profile = { ...asRecord(dsh.profile) }
    const current = bundlesOf(next).filter((name) => name !== spec.packageName)
    if (writes.removeBundle !== true && writes.addBundle === true) current.push(spec.packageName)
    profile.bundles = current
    dsh.profile = profile
    next.dsh = dsh
  }
  return next
}

/** 写后校验：文件里真的出现了计划要的样子吗？返回中文原因，undefined = 通过。 */
export function verifyWrites(
  doc: Record<string, unknown>,
  writes: PlanWrites,
  spec: ExtensionSpec,
): string | undefined {
  if (writes.addDependency !== undefined) {
    const value = dependenciesOf(doc)[spec.packageName]
    if (value !== writes.addDependency) return `dependencies.${spec.packageName} 没写进去`
  }
  if (writes.removeDependency === true && spec.packageName in dependenciesOf(doc)) {
    return `dependencies.${spec.packageName} 没删掉`
  }
  const bundles = bundlesOf(doc)
  if (writes.addBundle === true && !bundles.includes(spec.packageName)) return 'bundles 里没加上它'
  if (writes.removeBundle === true && bundles.includes(spec.packageName)) return 'bundles 里没移除它'
  return undefined
}

// ── 落盘：备份 → 原子写 → 写后校验 → 失败回滚 ───────────────────────

export interface WriteOutcome {
  ok: boolean
  message?: string
  /** 出错时是否已经把原文件恢复回去（true = 盘上还是原来那份）。 */
  rolledBack?: boolean
}

function restoreFile(file: string, originalText: string, fs: FsLike): boolean {
  try {
    const tmp = `${file}.dafeiyu-restore-${Date.now()}.tmp`
    fs.writeFileSync(tmp, originalText, 'utf8')
    fs.renameSync(tmp, file)
    return true
  } catch {
    // 换名这条路也炸了（目录权限/句柄占用）：直接原地写，至少别把文件留在半截状态。
    try {
      fs.writeFileSync(file, originalText, 'utf8')
      return true
    } catch {
      return false
    }
  }
}

/**
 * 把 doc 写到 profile 的 package.json，全程按"写到一半断电也不能留坏文件"来做：
 *
 * 1. **备份**：原文本先落到 `<file>.bak`（进程被 kill 掉也能人工找回）；
 * 2. **原子写**：写同目录的 `<file>.dafeiyu-<ts>.tmp`，再 `rename` 覆盖目标
 *    （同卷 rename 是原子的：读者要么看到旧全文，要么看到新全文，看不到半截）；
 * 3. **写后校验**：读回、`JSON.parse`、再比一遍计划（`verifyWrites`）；
 * 4. **失败回滚**：任何一步抛错都把原文本写回去，临时文件清掉，返回中文原因。
 */
export function writeProfilePackage(
  file: string,
  nextDoc: Record<string, unknown>,
  originalText: string,
  writes: PlanWrites,
  spec: ExtensionSpec,
  fs: FsLike = nodeFs,
): WriteOutcome {
  const text = `${JSON.stringify(nextDoc, null, 2)}\n`
  const tmp = `${file}.dafeiyu-${Date.now()}.tmp`
  try {
    // ① 备份（备份失败就别写了：没有回头路的写盘不值当）
    try {
      fs.writeFileSync(`${file}.bak`, originalText, 'utf8')
    } catch (error) {
      return { ok: false, message: `备份失败，没有动 profile：${String((error as Error)?.message ?? error).slice(0, 160)}` }
    }
    // ② 原子写
    fs.writeFileSync(tmp, text, 'utf8')
    fs.renameSync(tmp, file)
    // ③ 写后校验
    let parsed: unknown
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (error) {
      const restored = restoreFile(file, originalText, fs)
      try {
        fs.unlinkSync?.(tmp)
      } catch {
        /* 临时文件删不掉不影响回滚结论 */
      }
      return {
        ok: false,
        rolledBack: restored,
        message: `写后读不回来（${String((error as Error)?.message ?? error).slice(0, 120)}）${restored ? '，已回滚' : '，回滚也失败了，请看 package.json.bak'}`,
      }
    }
    const mismatch = verifyWrites(asRecord(parsed), writes, spec)
    if (mismatch !== undefined) {
      const restored = restoreFile(file, originalText, fs)
      return {
        ok: false,
        rolledBack: restored,
        message: `写后校验失败：${mismatch}${restored ? '，已回滚' : '，回滚也失败了，请看 package.json.bak'}`,
      }
    }
    return { ok: true }
  } catch (error) {
    const restored = restoreFile(file, originalText, fs)
    try {
      fs.unlinkSync?.(tmp)
    } catch {
      /* 同上 */
    }
    return {
      ok: false,
      rolledBack: restored,
      message: `写 profile 失败：${String((error as Error)?.message ?? error).slice(0, 160)}${restored ? '（已回滚）' : '（回滚也失败了，请看 package.json.bak）'}`,
    }
  }
}

// ── 宿主自带的 pnpm ─────────────────────────────────────────────────

export interface PnpmRunInput {
  profileDir: string
  timeoutMs?: number
}

export interface PnpmRunOutput {
  ok: boolean
  /** 已经成句的中文结论（失败时**带 stderr 尾巴**，不许只说"失败"）。 */
  message: string
  timedOut?: boolean
  code?: number | null
}

export type PnpmRunner = (input: PnpmRunInput) => Promise<PnpmRunOutput>

export const PNPM_TIMEOUT_MS = 300_000

/**
 * 找宿主的运行时目录（里面是 `dependencies/node` 与 `dependencies/pnpm`）。
 *
 * 三道来源，先到先得：`DSH_RUNTIME_DIR`（显式）→ `DSH_INSTALL_DIR` 往上找到 `resources`
 * → Electron 的 `process.resourcesPath`。再用 `<dir>/dependencies/pnpm/bin/pnpm.mjs`
 * 判它是不是真的运行时（不看版本文件：目录名会变，文件在才算数）。
 */
export function resolveRuntimeDir(
  env: Record<string, string | undefined> = process.env,
  options: { resourcesPath?: string; exists?: (file: string) => boolean } = {},
): string | undefined {
  const exists = options.exists ?? existsSync
  const hasPnpm = (dir: string): boolean => exists(path.join(dir, 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'))
  const candidates: string[] = []
  const explicit = (env.DSH_RUNTIME_DIR ?? '').trim()
  if (explicit !== '') candidates.push(explicit)
  const installDir = (env.DSH_INSTALL_DIR ?? '').trim()
  if (installDir !== '') {
    // 形如 `…\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh`：一路往上,遇到 resources 就停。
    let current = installDir
    for (let depth = 0; depth < 8; depth += 1) {
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
      if (path.basename(current).toLowerCase() === 'resources') {
        candidates.push(path.join(current, 'runtime', 'primary-runtime'), path.join(current, 'runtime'))
        break
      }
    }
  }
  const resources = (options.resourcesPath ?? (process as { resourcesPath?: string }).resourcesPath ?? '').trim()
  if (resources !== '') candidates.push(path.join(resources, 'runtime', 'primary-runtime'), path.join(resources, 'runtime'))
  for (const dir of candidates) if (hasPnpm(dir)) return dir
  return undefined
}

/** 把 stderr 尾巴收成一句能读的东西（换行压成 ` / `，最多 600 字）。 */
export function summarizePnpmFailure(options: {
  code?: number | null
  timedOut?: boolean
  stderr?: string
  stdout?: string
  timeoutMs?: number
}): string {
  const tail = (text: string | undefined): string =>
    String(text ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .slice(-12)
      .join(' / ')
      .slice(-600)
  const detail = tail(options.stderr) || tail(options.stdout) || '（pnpm 没输出任何东西）'
  if (options.timedOut === true) {
    return `pnpm 超时（${Math.round((options.timeoutMs ?? PNPM_TIMEOUT_MS) / 1000)}s）：${detail}`
  }
  return `pnpm 失败（退出码 ${options.code === null || options.code === undefined ? '未知' : options.code}）：${detail}`
}

/** 真跑 `pnpm install`（超时 300s，超时就杀）。只在 install / uninstall 上走这条路。 */
export function runPnpmInstall(input: PnpmRunInput): Promise<PnpmRunOutput> {
  const timeoutMs = input.timeoutMs ?? PNPM_TIMEOUT_MS
  const runtimeDir = resolveRuntimeDir(process.env)
  if (runtimeDir === undefined) {
    return Promise.resolve({ ok: false, message: '找不到宿主自带的 pnpm（运行时目录未定位），没法安装；请用桌面版安装器重装后再试' })
  }
  const pnpmScript = path.join(runtimeDir, 'dependencies', 'pnpm', 'bin', 'pnpm.mjs')
  const nodeExe = path.join(runtimeDir, 'dependencies', 'node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
  const useBundledNode = existsSync(nodeExe)
  // 没有自带 node 就借当前进程的可执行文件（Electron 主进程要开 ELECTRON_RUN_AS_NODE 才当 node 用）
  const command = useBundledNode ? nodeExe : process.execPath
  const env = useBundledNode ? { ...process.env } : { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  return new Promise((resolve) => {
    let settled = false
    let stderr = ''
    let stdout = ''
    const finish = (output: PnpmRunOutput): void => {
      if (settled) return
      settled = true
      resolve(output)
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(command, [pnpmScript, 'install', '--no-audit', '--no-fund'], {
        cwd: input.profileDir,
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      finish({ ok: false, message: `pnpm 起不来：${String((error as Error)?.message ?? error).slice(0, 200)}` })
      return
    }
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* 已经退了 */
      }
      finish({ ok: false, timedOut: true, message: summarizePnpmFailure({ timedOut: true, stderr, stdout, timeoutMs }) })
    }, timeoutMs)
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-16_000)
    })
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = (stdout + chunk.toString('utf8')).slice(-16_000)
    })
    child.on('error', (error: Error) => {
      clearTimeout(timer)
      finish({ ok: false, message: `pnpm 起不来：${String(error.message ?? error).slice(0, 200)}` })
    })
    child.on('close', (code: number | null) => {
      clearTimeout(timer)
      if (code === 0) finish({ ok: true, message: 'pnpm install 完成', code })
      else finish({ ok: false, code, message: summarizePnpmFailure({ code, stderr, stdout }) })
    })
  })
}

// ── 动作 ────────────────────────────────────────────────────────────

const ACTION_VERB: Record<ExtensionAction, string> = {
  install: '已安装',
  enable: '已启用',
  disable: '已禁用',
  uninstall: '已卸载',
}

/**
 * 执行一个动作。顺序是 `计划 → 落盘（失败就停）→ pnpm（失败就把文件回滚）→ 上报`。
 *
 * 为什么 pnpm 失败要回滚文件：`install` 已经把依赖与 bundle 写进去了，但包装不上——
 * 重启之后宿主会去加载一个不存在的 bundle。宁可回到"没装"，让用户再点一次。
 *
 * 回执统一 `{ ok, changed, needsRestart, message?, version? }`：**改过的都要重启才生效**，
 * 这条信息必须传给界面，不能让用户以为点完就好了。
 */
export async function applyAction(
  profileDir: string,
  spec: ExtensionSpec,
  action: ExtensionAction,
  options: { fs?: FsLike; runPnpm?: PnpmRunner; log?: Log; pendingRestart?: Set<string>; timeoutMs?: number } = {},
): Promise<ApplyResult> {
  const fs = options.fs ?? nodeFs
  const read = readProfilePackage(profileDir, fs)
  if (read.kind === 'missing') {
    return { ok: false, changed: false, needsRestart: false, message: `找不到 profile 的 package.json（${read.file}）` }
  }
  if (read.kind === 'broken') {
    return { ok: false, changed: false, needsRestart: false, message: `profile 的 package.json 读不出来：${read.message}（先修好它，这里不覆盖坏文件）` }
  }
  const status = readExtensionStatus(profileDir, spec, { fs })
  let plan: PlanResult
  try {
    plan = planAction(spec, action, status)
  } catch (error) {
    return { ok: false, changed: false, needsRestart: false, message: String((error as Error)?.message ?? error) }
  }
  if (!plan.changed) {
    // 幂等：不报错也不静默（回一句"已经是这个状态"，界面照常显示）
    return { ok: true, changed: false, needsRestart: false, message: plan.message }
  }
  const nextDoc = applyWrites(read.doc, plan.writes, spec)
  const written = writeProfilePackage(read.file, nextDoc, read.text, plan.writes, spec, fs)
  if (!written.ok) {
    options.log?.('扩展 profile 写入失败', { id: spec.id, action, message: written.message ?? '' })
    return { ok: false, changed: false, needsRestart: false, message: written.message }
  }
  if (plan.runPnpm) {
    const runner = options.runPnpm ?? runPnpmInstall
    const result = await runner({ profileDir, timeoutMs: options.timeoutMs ?? PNPM_TIMEOUT_MS })
    if (!result.ok) {
      const restored = restoreFile(read.file, read.text, fs)
      options.log?.('扩展 pnpm 失败，profile 已回滚', { id: spec.id, action, message: result.message })
      return {
        ok: false,
        changed: false,
        needsRestart: false,
        message: `${result.message}${restored ? '（profile 已回滚）' : '（profile 回滚失败，请看 package.json.bak）'}`,
      }
    }
  }
  options.pendingRestart?.add(spec.id)
  const after = readExtensionStatus(profileDir, spec, { fs, pendingRestart: options.pendingRestart })
  options.log?.('扩展动作完成（需重启生效）', { id: spec.id, action, version: after.version ?? '' })
  return {
    ok: true,
    changed: true,
    needsRestart: true,
    message: `${ACTION_VERB[action]}「${spec.label}」，重启 DSH 后生效`,
    version: after.version,
  }
}

/** 路由与面板共用的一层：列表 + 动作（白名单在这里挡一次，路由不用重复判）。 */
export interface ExtensionsService {
  readonly profileDir: string
  list(): ExtensionStatus[]
  act(id: string, action: unknown): Promise<ApplyResult>
}

export function createExtensionsService(deps: {
  profileDir: string
  log: Log
  fs?: FsLike
  runPnpm?: PnpmRunner
  timeoutMs?: number
  /** 本次运行里改过的 id：决定状态里的 `needsRestart`（重启后这个集合是空的，正好）。 */
  pendingRestart?: Set<string>
}): ExtensionsService {
  const fs = deps.fs ?? nodeFs
  const pendingRestart = deps.pendingRestart ?? new Set<string>()
  return {
    profileDir: deps.profileDir,
    list(): ExtensionStatus[] {
      return readExtensions(deps.profileDir, { fs, pendingRestart })
    },
    async act(id: string, action: unknown): Promise<ApplyResult> {
      const spec = findExtension(id)
      if (!spec) {
        // 白名单之外一律拒：这条是"点一下装插件 = 远程代码执行"的唯一门。
        return { ok: false, changed: false, needsRestart: false, message: `不在白名单里：${String(id ?? '').slice(0, 80)}` }
      }
      if (!isExtensionAction(action)) {
        return { ok: false, changed: false, needsRestart: false, message: `不支持的动作：${String(action ?? '').slice(0, 40)}` }
      }
      return applyAction(deps.profileDir, spec, action, {
        fs,
        runPnpm: deps.runPnpm,
        log: deps.log,
        pendingRestart,
        timeoutMs: deps.timeoutMs,
      })
    },
  }
}

/**
 * profile 目录：`DSH_PROFILE_DIR` 说了算；没有就按 `DSH_PROFILE`（默认 `desktop`）拼到
 * `<dshHome>/profiles/` 下面。**不猜别的路径**——猜错就会去改别人的 profile。
 */
export function resolveProfileDir(
  env: Record<string, string | undefined> = process.env,
  dshHome: string,
): string {
  const explicit = (env.DSH_PROFILE_DIR ?? '').trim()
  if (explicit !== '') return explicit
  const profile = (env.DSH_PROFILE ?? '').trim() || 'desktop'
  return path.join(dshHome, 'profiles', profile)
}
