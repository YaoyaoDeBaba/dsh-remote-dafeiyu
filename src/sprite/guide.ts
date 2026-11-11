/**
 * sprite/guide —— 内置指南（`sprite_guide` 工具返回的那篇 markdown）。
 *
 * 为什么要有它：`.57` 之前 agent 要靠读 6000 行工具源码逆推「anchorY 是 0=底还是 0=顶」
 * 「measureScale 量的是 bbox 高还是角色身高」。语义写在这里，就不用在每次调用时靠猜。
 *
 * 三节分别对应评审文档的 C1 / C2 / C3：快速上手、参数语义（哪一档生效）、症状速查。
 */

export const SPRITE_GUIDE = `# 序列帧精灵图：agent 快速上手

## 一、六步原语（最小可用路径）

1. \`sprite_prepare\` { videoPath, start=0, end=4, fps=12 } → 帧数/尺寸
2. \`sprite_probe_color\` { frame=0 } → \`keyColor\`（**别用 #00FF00 硬猜**，每段素材背景色都不一样）
3. \`sprite_measure\` { frame=0, landmarks:[…] } → \`alphaBBox\` / 核对图（\`overlayPath\`）
4. \`sprite_key_apply\` { mode, colorHex, intensity, … } → 抠图 + \`stats\` + \`worst\`
5. \`sprite_cleanup\` { trim:{ mode, pad }, maskRect:"auto" } → 裁剪框（含回显）
6. \`sprite_export\` { cols, rows, charHeightPx, span, format } → PNG/webp + meta

想一次跑完：\`sprite_auto\` { videoPath, targetCharHeight, format }；
多段素材：\`sprite_batch\` { outRoot, items:[…] }。

## 二、参数语义：**哪一档生效**（C2）

| 参数 | 经典档 classic | 智能档 advanced | 语义 | 建议初值 |
|---|---|---|---|---|
| \`colorHex\` | ✅ | ✅ | 键色（**必须实测背景色**） | 用 probe_color 的结果 |
| \`intensity\` | ✅ | ✅ | 越大抠得越狠 | 75~85 |
| \`feather\` | ✅ | — | alpha 羽化半径 | 20 |
| \`cleanup\` | ✅ | — | 去色溢出 | 30 |
| \`softness\` | — | ✅ | 软边宽度 | 100 |
| \`despill\` | — | ✅ | 去绿边强度 | 70 |
| \`aggressive\` | — | ✅ | 主体轮廓也去绿 | true |
| \`greenToAlpha\` | — | ✅ | 残绿转透明（>0 走两步法） | 25 |
| \`autoPlate\` | — | ✅ | 自动背景板（**只 apply 生效**） | 背景斑驳时 true |

> 传了不生效档的参数不会报错，但会出现在返回的 \`ignored\` 里——**看到 ignored 非空就说明你选错档了**。

## 三、症状 → 原因 → 处理（C3）

| 症状 | 大概率原因 | 处理 |
|---|---|---|
| 导出的图 alpha 全 255、背景还是绿的 | 抠图缓存被清（跑过 preview / 改过参数）/ 键色不对 | 重新 \`sprite_key_apply\` 再立刻 \`sprite_export\`（工具现在会直接报错，不会闷声出图） |
| 主体边缘一圈橄榄色 | 经典档去绿不足 | 换 advanced 档，或 \`greenToAlpha\` 加大 |
| 裁剪框莫名变大 | 某帧有残留/漂浮物，并集把它带上了 | 看 \`sprite_measure\` 的 \`perFrameSpread\`；或 \`trim.mode:"first-frame"\` |
| 角色高 ≠ 目标 | 用错了「bbox 高」语义 | 用 \`sprite_scale_to\` 的 \`charHeightPx\` + \`span\` |
| 切动作“瞬移” | 锚点跨素材复用 / 口径不一致 | 每段单独量；看 meta 里的 \`anchorConvention\` |
| 结果差 1~2px | trim pad / alphaThreshold 默认值 | 看 \`sprite_cleanup\` 返回里的 \`pad\` 与 \`alphaThreshold\` |
| webp 导出报“不支持” | 这个浏览器没有 webp 编码 | 换 png，或升级浏览器 |

## 四、锚点口径（最容易踩）

- 工具内部与 meta 里的 \`anchorY\` 是 **\`y-from-bottom\`**：0 = 帧底，1 = 帧顶。
- 主流 2D 运行时（Unity/SpriteRenderer）常用 **\`y-from-top\`**：0 = 帧顶。
  两者是 \`1 - anchorY\` 的关系，**meta 里写了 \`anchorConvention\`，读它，别猜**。
- 量锚点时优先给**像素**：\`sprite_set_anchor\` { y: <从帧底往上的像素>, convention:"y-from-bottom" }。

## 五、交付物约定

- 默认命名：\`<name>_<cols>x<rows>.<format>\` + \`<同名>.meta.json\`；\`dirPerAction:true\` 时放进 \`<outDir>/<name>/\`。
- meta 必带：网格、格子尺寸、\`anchorX/anchorY\` + \`anchorConvention\`、\`scale\`、\`charHeightPx\`、\`appliedParams\`。
- 核对图落在 \`<outDir>/_debug/\`，可以直接 \`read_image\` 看。

## 六、自检清单（每批出图前跑一遍）

1. \`sprite_probe_color\` 的 \`spread\` < 0.05（背景均匀）；
2. \`sprite_key_apply\` 的 \`stats.bgResidual\` < 0.01、\`subjectCoverage\` > 0.98、\`edgeGreen\` < 0.10；
3. \`worst.frame\` 与第 0 帧差距大 → 那一帧有残留，别忽略；
4. \`sprite_export\` 返回的 \`scaleClamped\` 为 false（否则目标尺寸没达到）；
5. meta 的 \`anchorConvention\` 与你的运行时一致。
`

/** 给系统提示用的短引导（进 systemPrompt 段；太长会挤占上下文）。 */
export const SPRITE_GUIDANCE = `你有「序列帧精灵图」能力：把带绿幕背景的视频转成透明底精灵图（抽帧 → 取色 → 抠背景 → 去水印/裁剪 → 拼图导出）。

标准路径：sprite_prepare → sprite_probe_color（**键色必须实测，别用 #00FF00 硬猜**）→ sprite_measure（拿 bbox 与核对图）
→ sprite_key_apply → sprite_cleanup → sprite_export。一次跑完用 sprite_auto；多段素材用 sprite_batch；不确定语义就调 sprite_guide。

三条硬规则：
- **先 apply 再 export**：sprite_key_preview 会清空抠图缓存，export 前必须重新 apply（工具会直接报错提醒你）；
- 参数分两档（classic/advanced），传了不生效档的参数会出现在返回的 ignored 里；
- 目标尺寸用 sprite_scale_to / charHeightPx + span（按"角色净高"），别用 bbox 高硬凑。
迭代上限 6 轮或直接用 sprite_autotune；不收敛就明确告诉用户"背景不可抠/需要重拍"，别硬塞烂图。`
