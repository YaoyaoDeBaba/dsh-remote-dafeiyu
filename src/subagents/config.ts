/**
 * subagents/config — 派活助手（子代理监视器）的配置。
 *
 * 落 `storages/dsh-remote-dafeiyu/subagents.json`（与识图/记忆同一层目录）：
 *   { version: 1, enabled, guidance, idleWarnMs }
 *
 * - `guidance`：是否向模型注入「名称｜简述」的派活规范提示段（重启后生效）；
 * - `idleWarnMs`：闲置多久算“太久”（PC/手机面板标黄与「一键归档闲置」都用它）。
 *
 * 读不认识的内容一律回落到默认值（**绝不抛**）：这是设置页的读路径，配错不该让整页崩。
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveDshHome } from '../memory/service.js'

export interface SubagentsConfig {
  version: 1
  enabled: boolean
  guidance: boolean
  /** 闲置阈值（毫秒），默认 2 小时。 */
  idleWarnMs: number
}

const DEFAULT_CONFIG: SubagentsConfig = { version: 1, enabled: true, guidance: true, idleWarnMs: 2 * 60 * 60 * 1000 }
const MIN_IDLE = 5 * 60 * 1000
const MAX_IDLE = 7 * 24 * 60 * 60 * 1000

export function resolveSubagentsConfigFile(dshHome = resolveDshHome(process.env)): string {
  return path.join(dshHome, 'storages', 'dsh-remote-dafeiyu', 'subagents.json')
}

/** 把任意输入归一成合法配置（夹阈值、缺省补默认）。 */
export function normalizeSubagentsConfig(raw: unknown): SubagentsConfig {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const idle = typeof value.idleWarnMs === 'number' && Number.isFinite(value.idleWarnMs) ? value.idleWarnMs : DEFAULT_CONFIG.idleWarnMs
  return {
    version: 1,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_CONFIG.enabled,
    guidance: typeof value.guidance === 'boolean' ? value.guidance : DEFAULT_CONFIG.guidance,
    idleWarnMs: Math.min(MAX_IDLE, Math.max(MIN_IDLE, Math.round(idle))),
  }
}

export function readSubagentsConfig(file: string): SubagentsConfig {
  try {
    const text = fs.readFileSync(file, 'utf8')
    return normalizeSubagentsConfig(JSON.parse(text))
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function writeSubagentsConfig(file: string, patch: unknown): SubagentsConfig {
  const next = normalizeSubagentsConfig({ ...readSubagentsConfig(file), ...(patch as Record<string, unknown>) })
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, file)
  } catch {
    /* 写失败：返回归一后的配置，设置页能看出没落地（下次读还是旧值） */
  }
  return next
}

export { DEFAULT_CONFIG as DEFAULT_SUBAGENTS_CONFIG }
