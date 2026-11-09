/**
 * xyq/guidance — 小云雀工具的使用提示（唯一一份：注入与推送共用）。
 */
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
