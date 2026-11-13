/**
 * sprite/guide —— 指南的**兜底文案**（2026-11-13 起不再是唯一真源）。
 *
 * 现在唯一真源是 `assets/skills/dafeiyu-sprite/SKILL.md`（+ `references/`）：
 * - 模型通过 DSH 的 skill 目录发现它、按需加载正文；
 * - `sprite_guide` 工具读的也是同一份（见 `skill.ts` 的 `readSpriteSkillBody`）；
 * - 本文件只在**读不到那份文件时**兜底（打包漏了、磁盘坏了），所以刻意写得短。
 *
 * 为什么从"三处都有"收敛成"一处真源 + 兜底"：指南以前改了 A 忘了 B，
 * 结果就是"文档说一套、工具做一套"，每批素材都得重新踩一遍。
 */

/** 给系统提示用的短引导：只写"有这个能力 + 先加载 skill + 三条硬规则"，不复制正文。 */
export const SPRITE_GUIDANCE = [
  '你有「序列帧精灵图」能力：把带绿幕背景的视频转成透明底精灵图（抽帧 → 取色 → 抠背景 → 去水印/裁剪 → 拼图导出）。',
  '**做这类活之前先加载 `dafeiyu-sprite` skill**：它写了量什么、在哪个坐标空间量、量错了怎么自证；',
  '`references/` 里还有工具速查、参数分档表、症状速查、坐标换算。加载不到就调 `sprite_guide`。',
  '',
  '三条硬规则：',
  '- **键色必须实测**（用 `sprite_probe_color`，别拿 #00FF00 硬猜）；',
  '- **先 apply 再 export**：`sprite_key_preview` 会清空抠图缓存，export 前必须重新 apply（工具会直接报错提醒你）；',
  '- 参数分两档（classic / advanced），传了不生效档的参数会出现在返回的 `ignored[]` 里；',
  '- 目标尺寸用 `sprite_scale_to` / `charHeightPx` + `span`（按"角色净高"），别用 bbox 高硬凑。',
  '',
  '判"白色"用 `probe.channel:"whiteness"`（低饱和 <25 且 luma >210），**别用 `r,g,b>200`**——肤色会全部通过。',
].join('\n')

/**
 * `sprite_guide` 的兜底正文。
 *
 * 正常路径读 `SKILL.md`；只有那份文件缺失时才会看到这里。所以它必须"够用"
 * （六步 + 三条硬规则 + 两个最容易踩的坑），但不该试图复刻整篇方法论。
 */
export const SPRITE_GUIDE = `# 序列帧精灵图（兜底速查）

> 完整方法论在 skill \`dafeiyu-sprite\`（\`SKILL.md\` + \`references/\`）。这份是读不到它时的兜底。

## 六步原语

1. \`sprite_prepare\` { videoPath, start=0, end=4, fps=12 } → 帧数/尺寸
2. \`sprite_probe_color\` → \`keyColor\`（**必须实测背景色**，别用 #00FF00 硬猜）
3. \`sprite_measure\` { frame, landmarks, overlay } → \`alphaBBox\` / 核对图
4. \`sprite_key_apply\` { mode, colorHex, intensity … } → 抠图 + \`stats\` + \`worst\`
5. \`sprite_cleanup\` { trim, maskRect:"auto" } → 裁剪框
6. \`sprite_export\` { cols, rows, charHeightPx, span, format } → PNG/webp + meta

一次跑完用 \`sprite_auto\`；多段素材用 \`sprite_batch\`。

## 三条硬规则

- **先 apply 再 export**：\`sprite_key_preview\` 会清空抠图缓存；
- 参数分 classic / advanced 两档，传错档的会出现在 \`ignored[]\`；
- 目标尺寸用 \`charHeightPx\` + \`span\`（角色净高），不要用 bbox 高。

## 两个最容易踩的坑

- 判白色用 \`probe.channel:"whiteness"\`（饱和度 <25 且 luma >210）；\`r,g,b>200\` 会把肤色算成白；
- \`scan-horizontal\` / \`boundary\` 的 \`minRun\` **必须显式给**，否则会被呆毛之类的小色块骗走。

## meta 必带

\`name / cols / rows / cellWidth / cellHeight / charHeightPx / scale / anchorX / anchorY / anchorYTopDown / anchorConvention / fps\`；
\`anchorY\` 是 y-from-bottom，\`anchorYTopDown\` 是顶口径，直接读字段别自己换算。
`
