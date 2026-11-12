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

## 二、measure 的 landmarks：八种原语（**别自己写脚本量**）

前六种量的是「alpha 边界」，后两种量的是「颜色条件」——头顶发际线、领口、鞋底这类语义点用后两种。

| type | 需要的字段 | 含义 |
|---|---|---|
| \`bbox-top/bottom/left/right\` | — | alpha 边界（整幅或该帧的包围盒） |
| \`point\` | x, y | 原样回显，只用来在核对图上打点 |
| \`scan-vertical\` | x, fromY, toY | 沿列找**第一个 alpha > 阈值**的行（不认颜色） |
| \`scan-horizontal\` | x, fromY, toY, \`probe\` | 沿列找**第一个满足颜色条件、且连续 ≥ minRun 行**的段 |
| \`boundary\` | x, fromY, toY, \`a\`, \`b\` | A 色段结束、紧接 B 色段的那一行（"白带结束、蓝发开始"） |

\`probe\` / \`a\` / \`b\` 的形状：\`{ channel, op, value, minRun? }\`

- \`channel\`：\`r\` \`g\` \`b\` \`alpha\` \`luma\`（0.299r+0.587g+0.114b）\`blue-minus-red\` \`saturation\`（max−min）
- \`op\`：\`>\` \`>=\` \`<\` \`<=\`
- \`minRun\`：连续多少行才算数，**默认 1**

> **\`minRun\` 是防呆的核心**：不给它，语义就是"第一个交界"，一根 4 行高的呆毛就能把你骗走。
> 实测那条素材：不给 minRun 得到 y=120（呆毛），给 \`b.minRun:12\` 才落到 y=187（真实发带下沿）。
> 量"某个色块从哪开始"时，**永远显式给 minRun**。

扫不到不会抛异常：返回 \`{found:false, reason:"…"}\`，其余 landmark 照常给出。

\`\`\`json
{ "frame": 0, "source": "keyed", "landmarks": [
  { "id": "hairTop", "type": "scan-horizontal", "x": 360, "fromY": 60, "toY": 600,
    "probe": { "channel": "blue-minus-red", "op": ">", "value": 25, "minRun": 12 } },
  { "id": "hairline", "type": "boundary", "x": 360, "fromY": 60, "toY": 600,
    "a": { "channel": "blue-minus-red", "op": "<", "value": 10 },
    "b": { "channel": "blue-minus-red", "op": ">", "value": 25, "minRun": 12 } }
] }
\`\`\`

## 三、参数语义：**哪一档生效**（C2）

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
| \`maskMode\` | ✅（cleanup） | ✅（cleanup） | 水印探测档：\`auto\`=严格判据→四角兜底；\`corner\`=直接四角扫 | 默认 \`auto\` |

> 传了不生效档的参数不会报错，但会出现在返回的 \`ignored\` 里——**看到 ignored 非空就说明你选错档了**。

## 四、症状 → 原因 → 处理（C3）

| 症状 | 大概率原因 | 处理 |
|---|---|---|
| 导出的图 alpha 全 255、背景还是绿的 | 抠图缓存被清（跑过 preview / 改过参数）/ 键色不对 | 重新 \`sprite_key_apply\` 再立刻 \`sprite_export\`（工具现在会直接报错，不会闷声出图） |
| 主体边缘一圈橄榄色 | 经典档去绿不足 | 换 advanced 档，或 \`greenToAlpha\` 加大 |
| 裁剪框莫名变大 | 某帧有残留/漂浮物，并集把它带上了 | 看 \`sprite_measure\` 的 \`perFrameSpread\`；或 \`trim.mode:"first-frame"\` |
| 角色高 ≠ 目标 | 用错了「bbox 高」语义 | 用 \`sprite_scale_to\` 的 \`charHeightPx\` + \`span\` |
| 切动作“瞬移” | 锚点跨素材复用 / 口径不一致 | 每段单独量；看 meta 里的 \`anchorConvention\` |
| 结果差 1~2px | trim pad / alphaThreshold 默认值 | 看 \`sprite_cleanup\` 返回里的 \`pad\` 与 \`alphaThreshold\` |
| webp 导出报“不支持” | 这个浏览器没有 webp 编码 | 换 png，或升级浏览器 |
| \`maskAuto\` 说"未命中" | 角标压在渐变背景上，严格判据的对比度不够 | 看 \`warnings\` 与 \`path\`：\`corner-fallback\` = 已用四角低置信兜底；也可显式 \`maskMode:"corner"\` |
| 报了 \`maskRect\` 但不确定对不对 | 低置信度兜底（confidence < 0.8）会**真的**去遮 | 先 \`maskAuto\` 只拿候选：看 \`watermarkCandidates[].selected\` 与 \`rejectedReason\`，确认没吃掉角色再继续 |
| 取 \`rects[0]\` 结果遮到了 1px 高的残片 | 候选现在**全部**吐出，含 \`selected:false\` 的 | 用 \`selected===true\`，或看 \`selectedCount\` / \`path\` |
| 报"会话已空闲回收" | 超过 5 分钟没操作，帧数据被释放了（**没有 \`extract()\` 这个工具**） | 重新 \`sprite_prepare\`，前面的抠图参数要重来 |
| \`sprite_*\` 突然卡几分钟 | 多半是宿主崩过／被强杀留下的**孤儿无头浏览器**在抢端口和 profile | 重启宿主即可：新版本启动时会自动清掉"父进程已不在"的浏览器；正常关闭也会**整棵进程树**一起收 |

## 五、锚点口径（最容易踩）

- 工具内部与 meta 里的 \`anchorY\` 是 **\`y-from-bottom\`**：0 = 帧底，1 = 帧顶。
- 主流 2D 运行时（Unity/SpriteRenderer）常用 **\`y-from-top\`**：0 = 帧顶。
  两者是 \`1 - anchorY\` 的关系，**meta 里同时给了两个值**：\`anchorY\`（底口径）+ \`anchorYTopDown\`（顶口径），
  还有 \`anchorConvention\` 声明口径——**读字段，别自己换算**（换算错整批锚点那次就是这么来的）。
- 量锚点时优先给**像素**：\`sprite_set_anchor\` { y: <从帧底往上的像素>, convention:"y-from-bottom" }。

## 六、交付物约定

- 默认命名：\`<name>_<cols>x<rows>.<format>\` + \`<同名>.meta.json\`；\`dirPerAction:true\` 时放进 \`<outDir>/<name>/\`。
- meta 必带：\`name\`（= 你传的 name）、网格 \`cols/rows\`、\`cellWidth/cellHeight\`（整数，**保证 \`cellWidth*cols === sheetWidth\`**）、
  \`width/height\` 与 \`sheetWidth/sheetHeight\`、\`anchorX/anchorY\` + \`anchorConvention\` + \`anchorYTopDown\`、
  \`scale\`、\`charHeightPx\`、\`fps\`（来自 prepare 的 fps，形象侧按它播）、\`appliedParams\`。
- 核对图落在 \`<outDir>/_debug/\`，可以直接 \`read_image\` 看。

## 七、自检清单（每批出图前跑一遍）

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

量"发际线/领口/鞋底"这类语义点**别再自己写脚本**：sprite_measure 的 landmarks 支持
scan-horizontal / boundary（带 probe:{channel,op,value,minRun}），显式给 minRun，否则会被呆毛之类的小色块骗走。
meta 里 anchorY（底口径）与 anchorYTopDown（顶口径）**都给了**，直接读，别自己换算。
迭代上限 6 轮或直接用 sprite_autotune；不收敛就明确告诉用户"背景不可抠/需要重拍"，别硬塞烂图。`
