/**
 * xyq/config — 小云雀（CLI）能力的配置。
 *
 * 落 `storages/dsh-remote-dafeiyu/xyq.json`：
 *   { version, enabled, accessKey, defaultVideoModel, defaultVideoDurationSec,
 *     defaultImageModel, budget:{images, videos, maxVideoSeconds},
 *     freedom:'explicit'|'budgeted'|'open' }
 *
 * `accessKey` 是**密钥**：只在宿主进程里读出来、经环境变量交给 CLI，
 * 不写日志、不进设置页回包（回包只说“已设置/未设置”）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveDshHome } from '../memory/service.js'

export type XyqFreedom = 'explicit' | 'budgeted' | 'open'

export interface XyqConfig {
  version: 1
  enabled: boolean
  accessKey: string
  defaultVideoModel: string
  defaultVideoDurationSec: number
  defaultImageModel: string
  budget: { images: number; videos: number; maxVideoSeconds: number }
  freedom: XyqFreedom
}

const DEFAULTS: XyqConfig = {
  version: 1,
  enabled: true,
  accessKey: '',
  defaultVideoModel: 'Seedance_2.0_mini_lite',
  defaultVideoDurationSec: 4,
  defaultImageModel: '',
  budget: { images: 10, videos: 2, maxVideoSeconds: 10 },
  freedom: 'explicit',
}

export function resolveXyqConfigFile(dshHome = resolveDshHome(process.env)): string {
  return path.join(dshHome, 'storages', 'dsh-remote-dafeiyu', 'xyq.json')
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(max, Math.max(min, num))
}

export function normalizeXyqConfig(raw: unknown): XyqConfig {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const budget = value.budget && typeof value.budget === 'object' ? (value.budget as Record<string, unknown>) : {}
  const freedom = value.freedom === 'budgeted' || value.freedom === 'open' ? value.freedom : 'explicit'
  const duration = clampInt(value.defaultVideoDurationSec, 4, 30, DEFAULTS.defaultVideoDurationSec)
  return {
    version: 1,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULTS.enabled,
    accessKey: typeof value.accessKey === 'string' ? value.accessKey.trim() : '',
    defaultVideoModel: typeof value.defaultVideoModel === 'string' && value.defaultVideoModel.trim() !== '' ? value.defaultVideoModel.trim() : DEFAULTS.defaultVideoModel,
    defaultVideoDurationSec: duration,
    defaultImageModel: typeof value.defaultImageModel === 'string' ? value.defaultImageModel.trim() : '',
    budget: {
      images: clampInt(budget.images, 0, 200, DEFAULTS.budget.images),
      videos: clampInt(budget.videos, 0, 50, DEFAULTS.budget.videos),
      maxVideoSeconds: clampInt(budget.maxVideoSeconds, 4, 30, DEFAULTS.budget.maxVideoSeconds),
    },
    freedom,
  }
}

export function readXyqConfig(file: string): XyqConfig {
  try {
    return normalizeXyqConfig(JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch {
    return { ...DEFAULTS, budget: { ...DEFAULTS.budget } }
  }
}

export function writeXyqConfig(file: string, patch: unknown): XyqConfig {
  const next = normalizeXyqConfig({ ...readXyqConfig(file), ...(patch as Record<string, unknown>) })
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, file)
  } catch {
    /* 写失败：返回归一后的配置（设置页能看出没落地） */
  }
  return next
}

/** 设置页看的那一份：**抹掉密钥**，只给是否已设置与尾部提示。 */
export function viewXyqConfig(config: XyqConfig): Record<string, unknown> {
  const key = config.accessKey
  return {
    enabled: config.enabled,
    accessKeySet: key !== '',
    accessKeyHint: key === '' ? '' : `…${key.slice(-4)}`,
    defaultVideoModel: config.defaultVideoModel,
    defaultVideoDurationSec: config.defaultVideoDurationSec,
    defaultImageModel: config.defaultImageModel,
    budget: config.budget,
    freedom: config.freedom,
  }
}

export { DEFAULTS as DEFAULT_XYQ_CONFIG }
