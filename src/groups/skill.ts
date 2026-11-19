/**
 * groups/skill —— 读「拉群」那份 skill 正文（单一真源）。
 *
 * 工具 groups_guide 与 assets/skills/dafeiyu-groups/SKILL.md 是同一份正文：
 * 那边改了这边自动跟着变，不用手工同步两份文案。
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const GROUPS_SKILL_NAME = 'dafeiyu-groups'

/** 读 skill 正文；读不到时给一段最小可用的兜底（绝不让工具抛）。 */
export function readGroupsSkillBody(skillDir: string): string {
  try {
    const file = path.join(skillDir, 'SKILL.md')
    if (existsSync(file)) {
      const text = readFileSync(file, 'utf8')
      if (text.trim() !== '') return text
    }
  } catch {
    /* 走兜底 */
  }
  return [
    '# 肥鱼拉群（兜底说明）',
    '',
    '群是给用户看的记录；你看不到群里的整段消息，只收到被 @ 的那条。',
    '同步结论用 group_post(groupId, text)，点名用 to；补上下文用 group_read。',
  ].join('\n')
}
