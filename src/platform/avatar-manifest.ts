/**
 * platform/avatar-manifest —— 虚拟形象**素材契约**的唯一读口。
 *
 * 为什么它在 `platform/` 而不是 `avatar/`（2026-11-16）：
 * 形象功能要拆成独立插件（`dsh-avatar-dafeiyu`），但**手机协议的
 * `cmd.avatar_manifest` / `cmd.avatar_sheet` 是主体在读素材**（sheet 以 base64 走协议，
 * 手机端没有回环 HTTP）。也就是说：形象插件没装，本体仍然要能把素材发给手机。
 *
 * 所以读盘这一层留在本体，`avatar/` 只负责"浏览器面"的两条只读路由与 UI。
 * 两边共用同一份**素材目录契约**（下面 `avatarDir()`），谁写谁读都以它为准：
 *
 *   <DSH_HOME>/storages/dsh-remote-dafeiyu/avatar/
 *     manifest.json                 # { version, states:[{id,label,cols,rows,frames,cellWidth,cellHeight,file,anchorX?,anchorY?}] }
 *     <id>.webp                     # 8×6 图集
 *
 * 目录名刻意**沿用旧包名**：现有素材、序列帧产出、手机协议都用它，
 * 改名的唯一收益是"好看"，代价是迁移 + 三处路径同步改。不值得。
 *
 * ⚠️ 拆包之后这里会与形象包里的同名实现**各存一份**（跨包不能 import）。
 * 这是有意的重复：它是一个 30 行的纯读盘函数，且**契约（目录 + schema）由本文件定义**，
 * 改 schema 必须两边一起改——handover 文档里点名了这一点。
 */
import fs from 'node:fs'
import path from 'node:path'

export interface AvatarState {
  id: string
  label: string
  cols: number
  rows: number
  frames: number
  cellWidth: number
  cellHeight: number
  file: string
  /** 锚点（0~1，y 以格子顶部为 0）；缺省时端上回落 0.5 / 0.955。 */
  anchorX?: number
  anchorY?: number
}

export interface AvatarManifest {
  version: number
  states: AvatarState[]
}

/** 素材目录（三方共用：本体协议层 / 形象插件路由 / 序列帧产出）。 */
export function avatarDir(dshHome: string): string {
  return path.join(dshHome, 'storages', 'dsh-remote-dafeiyu', 'avatar')
}

/** 单条 state 的消毒：形状不对就丢，锚点越界就丢锚点（让端上走兜底，不画出格）。 */
export function sanitizeAvatarState(row: unknown): AvatarState | undefined {
  if (!row || typeof row !== 'object') return undefined
  const value = row as Record<string, unknown>
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0)
  // 锚点是 0~1 的归一化值：非数字 / 越界一律丢弃，让端上走兜底，不会画出格。
  const unit = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : undefined
  const cols = num(value.cols)
  const rows = num(value.rows)
  const frames = num(value.frames)
  const file = typeof value.file === 'string' ? value.file : ''
  if (typeof value.id !== 'string' || cols <= 0 || rows <= 0 || frames <= 0 || file === '') return undefined
  if (path.basename(file) !== file) return undefined
  const anchorX = unit(value.anchorX)
  const anchorY = unit(value.anchorY)
  return {
    id: value.id,
    label: typeof value.label === 'string' && value.label !== '' ? value.label : value.id,
    cols,
    rows,
    frames,
    // 与拆包前保持一致：格子尺寸缺省为 1（端上会按 cols/rows 再算），不在这里猜。
    cellWidth: num(value.cellWidth) || 1,
    cellHeight: num(value.cellHeight) || 1,
    file,
    ...(anchorX !== undefined ? { anchorX } : {}),
    ...(anchorY !== undefined ? { anchorY } : {}),
  }
}

/** 读 manifest。文件不存在 / JSON 坏 / states 为空都返回 `undefined`（由调用方决定怎么降级）。 */
export function loadAvatarManifest(dir: string): AvatarManifest | undefined {
  try {
    const raw = fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return undefined
    const value = parsed as Record<string, unknown>
    const rows = Array.isArray(value.states) ? value.states : []
    const states = rows.map(sanitizeAvatarState).filter((row): row is AvatarState => row !== undefined)
    if (states.length === 0) return undefined
    const version = typeof value.version === 'number' && Number.isFinite(value.version) ? value.version : 1
    return { version, states }
  } catch {
    return undefined
  }
}
