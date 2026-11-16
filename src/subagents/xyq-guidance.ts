/**
 * subagents/xyq-guidance —— 「小云雀」那段提示词的**推送源**（本体侧唯一剩下的那一小块）。
 *
 * ## 为什么这里还留着一份小云雀的东西（2026-11-16）
 *
 * 小云雀的能力（4 个工具 + 三条路由 + 设置页那一栏）整块搬去了独立包
 * `dsh-vision-dafeiyu`。但「把这段提示词推进某个会话」这件事是**派活助手**的功能
 * （`/api/dsh-remote-dafeiyu/guidance/push` 的 `which: 'subagent' | 'xyq' | 'both'`），
 * 那条路由、那个面板、那个推送器都还在本体里。
 *
 * ⇒ 本体只需要两样东西：**那段正文**，以及设置里 `freedom` 那一格（决定正文最后一句
 * 的松紧）。都从 `storages/dsh-remote-dafeiyu/xyq.json` 读——**同一份文件**，
 * 由 vision 包写。这里**只读**，不碰 `accessKey`（密钥只在 vision 包与 CLI 之间流转）。
 *
 * ⚠️ 这段正文与 vision 包里那份是同一份语义。真要改文案，两边都得改——这是拆包留下的
 * 已知代价；别为此把整份 config 再抄回来。
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveDshHome } from '../memory/service.js'

/** 与小云雀包共用同一份配置文件名（本文件只读 `freedom`）。 */
export function resolveXyqConfigFile(dshHome = resolveDshHome(process.env)): string {
  return path.join(dshHome, 'storages', 'dsh-remote-dafeiyu', 'xyq.json')
}

/** 读 `freedom`（`explicit` 默认）。文件坏了/没有都退到默认，**不抛**。 */
export function readXyqFreedom(file: string): 'explicit' | 'budgeted' | 'open' {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { freedom?: unknown }
    return raw?.freedom === 'budgeted' || raw?.freedom === 'open' ? raw.freedom : 'explicit'
  } catch {
    return 'explicit'
  }
}

/** 小云雀工具的使用提示（推送用；注入由 vision 包自己负责）。 */
export function xyqGuidance(freedom: string): string {
  const lines = [
    '## 小云雀（图片 / 视频生成）',
    '本机接入了小云雀官方 CLI，提供 `generate_image`、`generate_video`、`xyq_balance`、`xyq_models` 四个工具。',
    '使用顺序：先 `xyq_models` 查模型 → `xyq_balance` 看积分 → 生成 → 把工具返回的**本地文件绝对路径**告诉用户。',
    '成本：视频按时长计费（Seedance 2.0 Mini 体验版约 4 积分/秒），图片按张计费；时长会被设置里的上限截断。',
  ]
  if (freedom === 'explicit') lines.push('调用约束：**只有用户明确要求生成图片/视频时才能调用**；不要为了“省事”自行生成。')
  else if (freedom === 'budgeted') lines.push('调用约束：开发任务需要素材时可以自行调用，但必须受设置里的额度与时长上限约束；用完就停，不要重复生成。')
  else lines.push('调用约束：额度已放开，自行判断是否生成；仍然不要重复生成同一个素材。')
  lines.push('Access Key 过期/无效时工具会报错，把原文转告用户，让他去小云雀官网 ⚡CLI/API → API 更新。')
  return lines.join('\n')
}
