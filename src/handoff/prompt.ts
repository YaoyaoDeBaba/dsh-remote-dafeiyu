/**
 * handoff/prompt —— 「一键转生 / 一键分身」的**两段文本**。
 *
 * 为什么是两段：
 * 1. `injection` 发给**当前这个**会话（它的上下文里才有全部经过）；
 * 2. `firstPrompt` 发给**新建的**那个会话（它只看得见交接文档）。
 *
 * 关键判断：转生/分身的总结**必须由当事人自己写**。让另一个模型去读几十 MB 的日志重写，
 * 又贵又会丢掉"当时为什么这么定"的那点手感。所以注入的是一份写作指令，不是一份分析任务。
 *
 * 另一条纪律：交接文档里「已完成，不要重做」比「目标」更重要——接手者最容易犯的错
 * 不是看不懂目标，而是把已经干完的活重干一遍。
 */

export type HandoffKind = 'rebirth' | 'branch'

/** 交接文档写完后，模型必须单独输出这一行；插件靠它在等文件的同时确认"真写完了"。 */
export const HANDOFF_MARKER = 'DAFEIYU_HANDOFF_OK'

export interface HandoffPlan {
  kind: HandoffKind
  /** 交接文档的绝对路径（插件指定，模型照抄）。 */
  filePath: string
  /** 分身必填：分支要干的活（用户原文）。 */
  note?: string
  /** 分身选填：边界（别碰什么）。 */
  boundary?: string
}

const sharedTail = (filePath: string): string => `
写完后**单独一行**输出：${HANDOFF_MARKER}: ${filePath}
如果你写不了文件（没有写工具 / 被沙箱拒绝），就明说原因，别假装写完了。
除此之外不要改任何其它文件，也不要顺手开始新的开发工作。`

const rebirthSections = `## 目标
## 现状（做到哪一步）
## 已完成（不要重做）
## 未完成 / 下一步
## 关键决定与理由
## 坑与教训（踩过的坑、被否掉的方案）
## 相关文件`

const branchSections = `## 本体背景（当前这条会话在干什么）
## 交接给分身的长期记忆要点
## 分支任务（这次要干的新分支）
## 边界（不要碰的东西）
## 关键决定与理由
## 坑与教训（踩过的坑、被否掉的方案）
## 相关文件`

/** 发给当前会话的写作指令。 */
export function buildInjection(plan: HandoffPlan): string {
  const title = plan.kind === 'rebirth' ? '一键转生' : '一键分身'
  const who = plan.kind === 'rebirth'
    ? '这条会话马上会因为上下文超载而「转生」：你的活要交给**下一位接手的会话**继续做。'
    : '这条会话要「分身」出一条新的分支会话，去做**另一条分支**的活；本体这条会话继续干原来的事。'
  const extra = plan.kind === 'branch'
    ? `\n【分支任务（用户给的原文，必须原样写进文档的「分支任务」小节）】\n${String(plan.note ?? '').trim()}\n` +
      (String(plan.boundary ?? '').trim()
        ? `\n【边界（用户指定，写进「边界（不要碰的东西）」小节）】\n${String(plan.boundary ?? '').trim()}\n`
        : '')
    : (String(plan.note ?? '').trim()
      ? `\n【用户补充的交接重点（一定要覆盖到）】\n${String(plan.note ?? '').trim()}\n`
      : '')

  return `【大肥鱼插件·${title}】
${who}
请你现在写一份**交接文档**，交给接手者。别写客套话，写能直接照着干的东西。

1) 用写文件工具写到这个绝对路径（照抄，不要改路径）：
${plan.filePath}

2) 文档用 Markdown，包含这些小节（没有内容的写"无"）：
${plan.kind === 'rebirth' ? rebirthSections : branchSections}
${extra}
3) 另外调用 record_memory 记 1~5 条**长期有效**的事实（每条一句、自包含、别记流水账）；
   已经在记忆里的不要重复记。
${sharedTail(plan.filePath)}`
}

/** 发给新会话的第一句：「读文档 → 报到 → 停」，不许开工。 */
export function buildFirstPrompt(plan: HandoffPlan): string {
  const intro = plan.kind === 'rebirth'
    ? '上一个会话因为上下文超载已经转生，你是接手者。'
    : '本体那条会话还在继续原来的工作；你是它的**分身**，负责一条独立的分支任务。'
  const caution = plan.kind === 'rebirth'
    ? '不要修改任何文件，也不要开工。'
    : '本体正在另一条会话里干活：不要碰交接文档「边界」里列出的东西，也不要修改任何文件、不要开工。'
  return `${intro}交接文档在这里：

${plan.filePath}

请先完整读它，然后**只做一件事：向我报到**——
1. 用三五行复述你理解的现状（做到哪一步、还有哪些没做）；
2. 说清你打算做的第一步。

${caution}等我点头再动手。`
}

/** 交接文档文件名：`转生-<会话短 id>-<时间戳>.md`。 */
export function handoffFileName(kind: HandoffKind, sessionId: string, at: Date): string {
  const short = sessionId.replace(/^session-/, '').slice(0, 8) || 'unknown'
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp =
    `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}` +
    `-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
  return `${kind === 'rebirth' ? '转生' : '分身'}-${short}-${stamp}.md`
}
