/**
 * compat —— 插件与**宿主版本**的兼容判据（2026-11-17）。
 *
 * ## 为什么要有它
 *
 * 真机事故：宿主跑到 0.2.2-rc.3，而插件侧只验证到 0.2.1-rc.5，中间那次崩溃就是版本错位。
 * 插件没有权力阻止别的插件加载（内核不给 pre-load 钩子），所以防线放在两个能控的地方：
 *   ① **安装时**：从 UI 装扩展时核对宿主版本，明确不兼容就拒绝安装；
 *   ② **登记时**：住客来领房间时按版本判级，不兼容的房间不进设置页 tabs，并给出可读提示。
 *
 * ## 为什么分两档而不是一刀切
 *
 * rc 之间大量改动是「能跑但细节变了」。一刀切停用会把本来能用的包也停掉，用户会被误伤到不敢升级。
 * 所以：
 *   - `block`：宿主低于我们声明的下限 —— 明确不兼容，拦。
 *   - `warn` ：宿主高于我们验证过的上限（或根本读不到版本）—— 能跑，但要告诉用户「没验证过」。
 *   - `ok`   ：落在验证区间内。
 *
 * ⚠️ 这张表是**手写的**，每次发版/升级宿主都要顺手更新 `testedHost`。别指望包自报的 `engines`：
 * 那东西会过期，而且安装器写进去之后没人回头改。
 */

export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  /** 预发布标记（rc / beta）；没有就是正式版。 */
  prerelease?: { tag: string; num: number }
}

/** 解析 `0.2.2-rc.3` 这种形状；解析不了返回 undefined（调用方按「读不到」处理）。 */
export function parseVersion(input: string | undefined): ParsedVersion | undefined {
  if (typeof input !== 'string') return undefined
  const text = input.trim().replace(/^v/i, '')
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([A-Za-z]+)\.?(\d+)?)?/.exec(text)
  if (match === null) return undefined
  const parsed: ParsedVersion = {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
  if (match[4] !== undefined) parsed.prerelease = { tag: match[4], num: match[5] === undefined ? 0 : Number(match[5]) }
  return parsed
}

/** 比较两个版本；a 低于 b 返回 -1，相等 0，高于 1。解析不了的按「最低」处理。 */
export function compareVersions(a: string | undefined, b: string | undefined): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (left === undefined && right === undefined) return 0
  if (left === undefined) return -1
  if (right === undefined) return 1
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1
  }
  if (left.prerelease === undefined && right.prerelease === undefined) return 0
  // 预发布版**低于**同号的正式版（0.2.2-rc.3 < 0.2.2）
  if (left.prerelease === undefined) return 1
  if (right.prerelease === undefined) return -1
  if (left.prerelease.tag !== right.prerelease.tag) return left.prerelease.tag < right.prerelease.tag ? -1 : 1
  if (left.prerelease.num === right.prerelease.num) return 0
  return left.prerelease.num < right.prerelease.num ? -1 : 1
}

export type CompatLevel = 'ok' | 'warn' | 'block'

export interface CompatEntry {
  packageName: string
  label: string
  /** 宿主下限：低于它就明确不兼容。 */
  minHost: string
  /** 真机验证过的宿主上限：高于它只是「没验证过」。 */
  testedHost: string
}

/**
 * 兼容表（**每次发版 / 每次升宿主都要回头改**）。
 *
 * 2026-11-17 实测：五个包在 0.2.2-rc.3 上装、跑、测试全绿 ⇒ testedHost 记到 0.2.2-rc.3。
 */
export const COMPAT: readonly CompatEntry[] = [
  { packageName: 'dsh-remote-dafeiyu', label: '本体', minHost: '0.2.1', testedHost: '0.2.2-rc.3' },
  { packageName: 'dsh-avatar-dafeiyu', label: '形象', minHost: '0.2.1', testedHost: '0.2.2-rc.3' },
  { packageName: 'dsh-vision-dafeiyu', label: '识图 / 小云雀', minHost: '0.2.1', testedHost: '0.2.2-rc.3' },
  { packageName: 'dsh-dev-kit-dafeiyu', label: '序列帧', minHost: '0.2.1', testedHost: '0.2.2-rc.3' },
  { packageName: 'dsh-selfloop', label: '肥鱼自治', minHost: '0.2.1', testedHost: '0.2.2-rc.3' },
]

/** 房间 id → 归属包（住客领房时用；没有的工具箱房间返回 undefined）。 */
export const ROOM_PACKAGES: Readonly<Record<string, string>> = {
  avatar: 'dsh-avatar-dafeiyu',
  vision: 'dsh-vision-dafeiyu',
  xyq: 'dsh-vision-dafeiyu',
  sprite: 'dsh-dev-kit-dafeiyu',
}

export interface CompatVerdict {
  level: CompatLevel
  /** 给用户看的一句话（ok 时是空串）。 */
  message: string
}

export function entryOf(packageName: string): CompatEntry | undefined {
  return COMPAT.find((entry) => entry.packageName === packageName)
}

/** 判一个包在给定宿主版本下能不能用。 */
export function verdictFor(host: string | undefined, entry: CompatEntry | undefined): CompatVerdict {
  if (entry === undefined) return { level: 'warn', message: '这个包不在兼容表里：没验证过，能用但别当成有保障。' }
  if (parseVersion(host) === undefined) {
    return { level: 'warn', message: '读不到宿主版本，无法判断兼容性（按未验证处理）。' }
  }
  if (compareVersions(host, entry.minHost) < 0) {
    return {
      level: 'block',
      message: entry.label + ' 要求宿主 ≥ ' + entry.minHost + '，当前是 ' + String(host) + '：装上也跑不起来，先升宿主。',
    }
  }
  if (compareVersions(host, entry.testedHost) > 0) {
    return {
      level: 'warn',
      message: entry.label + ' 只在 ' + entry.testedHost + ' 及以下验证过，当前宿主 ' + String(host) + ' 更新：能用，但遇到怪问题先怀疑版本错位。',
    }
  }
  return { level: 'ok', message: '' }
}

export interface CompatFs {
  existsSync(file: string): boolean
  readFileSync(file: string, encoding: 'utf8'): string
  readdirSync?(dir: string): string[]
}

/**
 * 读宿主版本。
 *
 * 插件侧没有「宿主版本」这个服务（探过，没有），所以从 profile 装好的宿主包里读：
 * 先认几个确定的包名，再退化成扫 `@deepseek-ai/dsh-*` 取出现过最多的那个版本。
 * 读不到就返回 undefined —— 上层按「未验证」处理，不许假装 0.0.0。
 */
export function detectHostVersion(profileDir: string, fs: CompatFs): string | undefined {
  const roots = ['dsh-app-boot', 'dsh-official-bundles', 'dsh-base']
  for (const name of roots) {
    const file = [profileDir, 'node_modules', '@deepseek-ai', name, 'package.json'].join('\\')
    const version = readPackageVersion(file, fs)
    if (version !== undefined) return version
  }
  const scopeDir = [profileDir, 'node_modules', '@deepseek-ai'].join('\\')
  if (typeof fs.readdirSync !== 'function') return undefined
  let names: string[] = []
  try {
    names = fs.readdirSync(scopeDir)
  } catch {
    return undefined
  }
  const counts = new Map<string, number>()
  for (const name of names) {
    if (!name.startsWith('dsh-')) continue
    const version = readPackageVersion([scopeDir, name, 'package.json'].join('\\'), fs)
    if (version === undefined) continue
    counts.set(version, (counts.get(version) ?? 0) + 1)
  }
  let best: string | undefined
  let bestCount = 0
  for (const [version, count] of counts) {
    if (count > bestCount) {
      best = version
      bestCount = count
    }
  }
  return best
}

function readPackageVersion(file: string, fs: CompatFs): string | undefined {
  try {
    if (!fs.existsSync(file)) return undefined
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { version?: unknown }
    return typeof parsed?.version === 'string' && parsed.version.trim() !== '' ? parsed.version.trim() : undefined
  } catch {
    return undefined
  }
}

export interface CompatReport {
  host?: string
  packages: Array<{ packageName: string; label: string; level: CompatLevel; message: string }>
  /** 不该出现在设置页的房间（宿主太低）。 */
  blockedRooms: string[]
  /** 能出现但要提示「没验证过」的房间。 */
  warnRooms: string[]
}

/** 一次性算出整张兼容报告（安装器与房间登记都用它）。 */
export function buildCompatReport(profileDir: string, fs: CompatFs): CompatReport {
  const host = detectHostVersion(profileDir, fs)
  const packages = COMPAT.map((entry) => {
    const verdict = verdictFor(host, entry)
    return { packageName: entry.packageName, label: entry.label, level: verdict.level, message: verdict.message }
  })
  const levelOf = (packageName: string): CompatLevel =>
    packages.find((row) => row.packageName === packageName)?.level ?? 'warn'
  const blockedRooms: string[] = []
  const warnRooms: string[] = []
  for (const [room, packageName] of Object.entries(ROOM_PACKAGES)) {
    const level = levelOf(packageName)
    if (level === 'block') blockedRooms.push(room)
    else if (level === 'warn') warnRooms.push(room)
  }
  return { host, packages, blockedRooms, warnRooms }
}
