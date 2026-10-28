/**
 * config — 备份功能的配置与落盘（`~/.dsh/dsh-backup-git/`）。
 *
 * ## 为什么另开一套配置文件，而不是塞进 cordis.patch.yml 的那份 patch
 *
 * 1. 那一份的键由宿主 schema 校验，**多一个未知键就可能整行不激活**——插件静默不加载
 *    这个坑 2026-10-28 已经踩过一次（`cordis.patch.yml` 的 `name` 写成旧包名）。
 * 2. 设置页要能改，改完不该要求重启 DSH；patch 是启动期读一次的。
 * 3. token 是凭据级的东西，放进 `cordis.patch.yml`（会被贴进工单）不合适。
 *
 * 所以：**默认值在代码里，用户改动写 `config.json`（0600），token 单独一个文件**。
 * 插件启动时读一次；设置页保存后立刻生效（调度器下一拍用新配置）。
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { writeSecure, ensureSecureDir } from '../platform/secure-file.js'

export interface BackupConfig {
  /** 总开关。默认 off：装完插件不会自己去推任何东西。 */
  enabled: boolean
  /** 远端仓库地址（`https://github.com/u/r.git`）。空 = 没配好，什么都不做。 */
  repoUrl: string
  /** 每几小时跑一次。0 = 只手动。 */
  intervalHours: number
  /** 会话多久没动算"冷却"（天）。 */
  idleDays: number
  /** 热快照分支（每次 force push，只留一份）。 */
  latestBranch: string
  /** 冷归档分支（只增不改）。 */
  archiveBranch: string
  /** 要不要带上 `~/.dsh/attachments`。 */
  includeAttachments: boolean
  /**
   * 恢复时把现有目录备份成什么后缀（`sessions.before-restore-<时间戳>`）。
   * 留成配置是为了测试能钉死它。
   */
  restoreBackupSuffix: string
}

export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  enabled: false,
  repoUrl: '',
  intervalHours: 8,
  idleDays: 15,
  latestBranch: 'latest',
  archiveBranch: 'archive',
  includeAttachments: true,
  restoreBackupSuffix: 'before-restore',
}

/** 备份功能自己的目录：`~/.dsh/dsh-backup-git`（与远控的 `dsh-remote-control` 平级）。 */
export function backupDir(dshHome: string): string {
  return path.join(dshHome, 'dsh-backup-git')
}

export function configFile(dshHome: string): string {
  return path.join(backupDir(dshHome), 'config.json')
}

export function credentialFile(dshHome: string): string {
  return path.join(backupDir(dshHome), 'credential.json')
}

export function statusFile(dshHome: string): string {
  return path.join(backupDir(dshHome), 'status.json')
}

export function workDir(dshHome: string): string {
  return path.join(backupDir(dshHome), 'work')
}

export interface ReadConfigResult {
  config: BackupConfig
  /** 盘上有文件但读不动时的原因（读不动就退回默认值，绝不猜）。 */
  problem?: string
}

/** 读配置。文件不存在 = 全默认；坏 JSON / 坏字段 = 默认值 + problem。 */
export function readBackupConfig(dshHome: string): ReadConfigResult {
  const file = configFile(dshHome)
  if (!existsSync(file)) return { config: { ...DEFAULT_BACKUP_CONFIG } }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    return {
      config: { ...DEFAULT_BACKUP_CONFIG },
      problem: `config.json 读不动：${String((error as Error)?.message ?? error).slice(0, 120)}`,
    }
  }
  const normalized = normalizeConfig(patchOf(parsed))
  if (!normalized.ok) {
    return {
      config: { ...DEFAULT_BACKUP_CONFIG },
      problem: `config.json 有问题：${normalized.field} ${normalized.error}`,
    }
  }
  return { config: normalized.value }
}

/** 只把**认识的键**取出来（未知键忽略，不报错：新版本写下的旧插件读得到）。 */
function patchOf(raw: unknown): Partial<Record<keyof BackupConfig, unknown>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const source = raw as Record<string, unknown>
  const patch: Partial<Record<keyof BackupConfig, unknown>> = {}
  for (const key of Object.keys(DEFAULT_BACKUP_CONFIG) as Array<keyof BackupConfig>) {
    if (key in source) patch[key] = source[key]
  }
  return patch
}

export type NormalizeResult =
  | { ok: true; value: BackupConfig }
  | { ok: false; field: string; error: string }

/**
 * 校验并合成一份完整配置（设置页 POST 与读盘共用同一个口）。
 * 规则刻意保守：宁可拒绝，也不写一份"看着存上了、实际不生效"的配置。
 */
export function normalizeConfig(
  patch: Partial<Record<keyof BackupConfig, unknown>>,
  base: BackupConfig = DEFAULT_BACKUP_CONFIG,
): NormalizeResult {
  const next: BackupConfig = { ...base }

  if ('enabled' in patch) {
    if (typeof patch.enabled !== 'boolean') return { ok: false, field: 'enabled', error: '要布尔值' }
    next.enabled = patch.enabled
  }

  if ('repoUrl' in patch) {
    const raw = typeof patch.repoUrl === 'string' ? patch.repoUrl.trim() : undefined
    if (raw === undefined) return { ok: false, field: 'repoUrl', error: '要字符串' }
    if (raw !== '' && !looksLikeRepoUrl(raw)) {
      return { ok: false, field: 'repoUrl', error: '要 https:// 开头的仓库地址，或 git@host:owner/repo.git' }
    }
    next.repoUrl = raw
  }

  if ('intervalHours' in patch) {
    const value = asNumber(patch.intervalHours)
    // 上限 168 小时（一周）：再长就不叫"定时"了；0 表示只手动。
    if (value === undefined || !Number.isFinite(value) || value < 0 || value > 168) {
      return { ok: false, field: 'intervalHours', error: '要在 0–168 之间（0 = 只手动备份）' }
    }
    next.intervalHours = value
  }

  if ('idleDays' in patch) {
    const value = asNumber(patch.idleDays)
    if (value === undefined || !Number.isFinite(value) || value < 1 || value > 3650) {
      return { ok: false, field: 'idleDays', error: '要在 1–3650 天之间' }
    }
    next.idleDays = Math.round(value)
  }

  for (const key of ['latestBranch', 'archiveBranch'] as const) {
    if (!(key in patch)) continue
    const value = typeof patch[key] === 'string' ? (patch[key] as string).trim() : ''
    if (value === '' || !/^[\w./-]{1,120}$/.test(value) || value.startsWith('-') || value.includes('..')) {
      return { ok: false, field: key, error: '要合法的分支名（字母数字 . _ - /，不能以 - 开头）' }
    }
    next[key] = value
  }
  if (next.latestBranch === next.archiveBranch) {
    return { ok: false, field: 'archiveBranch', error: '两个分支不能同名' }
  }

  if ('includeAttachments' in patch) {
    if (typeof patch.includeAttachments !== 'boolean') {
      return { ok: false, field: 'includeAttachments', error: '要布尔值' }
    }
    next.includeAttachments = patch.includeAttachments
  }

  if ('restoreBackupSuffix' in patch) {
    const value = typeof patch.restoreBackupSuffix === 'string' ? patch.restoreBackupSuffix.trim() : ''
    if (value === '' || !/^[\w.-]{1,40}$/.test(value)) {
      return { ok: false, field: 'restoreBackupSuffix', error: '要合法的后缀（字母数字 . _ -）' }
    }
    next.restoreBackupSuffix = value
  }

  // 打开开关却没配仓库：拒绝，别让用户对着"已启用"发呆。
  if (next.enabled && next.repoUrl === '') {
    return { ok: false, field: 'repoUrl', error: '启用备份必须先填仓库地址' }
  }

  return { ok: true, value: next }
}

function asNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw.trim())
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/** `https://…`（可带 `.git`）、`git@host:owner/repo` 这种 scp 形态，以及 `file://` 本地仓库。 */
function looksLikeRepoUrl(raw: string): boolean {
  if (/^git@[^:]+:[^\s]+$/.test(raw)) return true
  // 本地裸仓库（离线部署、测试装置）：`file:///D:/backup.git`。git 自己完全认这种远端。
  if (/^file:\/\/\/?[^\s]+$/i.test(raw)) return true
  if (!/^https?:\/\//i.test(raw)) return false
  try {
    const url = new URL(raw)
    return url.hostname.includes('.') && url.pathname.split('/').filter((part) => part !== '').length >= 2
  } catch {
    return false
  }
}

/** 落盘配置（0600）。返回 false = 写不进去（调用方据此回 500 而不是假装成功）。 */
export function writeBackupConfig(dshHome: string, config: BackupConfig): boolean {
  try {
    ensureSecureDir(backupDir(dshHome))
    writeSecure(configFile(dshHome), `${JSON.stringify(config, null, 2)}\n`)
    return true
  } catch {
    return false
  }
}

/** 读 token（没有就是空串）。**绝不进日志、绝不进 GET 的回答**。 */
export function readToken(dshHome: string): string {
  const file = credentialFile(dshHome)
  if (!existsSync(file)) return ''
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { token?: unknown }
    return typeof parsed.token === 'string' ? parsed.token.trim() : ''
  } catch {
    return ''
  }
}

export function writeToken(dshHome: string, token: string): boolean {
  try {
    ensureSecureDir(backupDir(dshHome))
    writeSecure(credentialFile(dshHome), `${JSON.stringify({ token }, null, 2)}\n`)
    return true
  } catch {
    return false
  }
}

export function clearToken(dshHome: string): boolean {
  return writeToken(dshHome, '')
}

/** token 的脱敏形态（`gho_abcd…wxyz(40)`）——排错时判断"是不是拿错了那一枚"。 */
export function redactToken(token: string): string {
  if (token === '') return ''
  if (token.length <= 12) return `${token.slice(0, 2)}…(${token.length})`
  return `${token.slice(0, 6)}…${token.slice(-4)}(${token.length})`
}
