# sprite_* 工具速查（入参 / 返回 / 什么时候用）

> 全部返回 JSON。**先 apply 再 export**：`sprite_key_preview` 会清空抠图缓存，export 前必须重新 apply（工具会直接报错，不会闷声出绿底图）。

## 一次性跑完

| 工具 | 用途 |
|---|---|
| `sprite_auto` | 一段素材一条龙：prepare→自动采色→measure→autotune→apply→cleanup→export，返回 `stages`（出问题先看它） |
| `sprite_batch` | 多段素材批量，`items[]` 每项一个 action，单条失败不影响其它条 |

## 六步原语

| 工具 | 关键入参 | 关键返回 |
|---|---|---|
| `sprite_prepare` | `videoPath, start=0, end=4, fps=12` | `frames, width, height, transport`（`http` = 本地直传，快） |
| `sprite_probe_color` | `frame=0, bandPx?` | `keyColor, spread, samples`（**spread<0.05 才可用**） |
| `sprite_measure` | `frame（或 "all"）, source:"keyed"\|"raw", landmarks[], overlay` | `alphaBBox, contentHeight, perFrameSpread, landmarks, overlayPath` |
| `sprite_key_apply` | `mode:"classic"\|"advanced"`, `colorHex`, `intensity`, `feather/cleanup`（经典）, `softness/despill/aggressive/greenToAlpha/autoPlate`（高级） | `keyedCount, stats, worst, appliedParams, ignored[]` |
| `sprite_cleanup` | `maskRect:"auto"\|Rect\|null, maskMode:"auto"\|"corner", trim:{mode,pad,alphaThreshold}` | `box, maskRect, watermarkCandidates[], warnings` |
| `sprite_export` | `cols, rows, charHeightPx + span`（推荐）或 `targetHeight`, `format:"png"\|"webp"`, `name, outDir, fileName, metaName, dirPerAction` | 文件路径 + `meta`（见下） |

## 缩放与锚点

| 工具 | 说明 |
|---|---|
| `sprite_scale_to` | 按**目标物理量**反推缩放：`charHeightPx` + `span{fromY,toY}`（推荐）；或 `targetCellHeight`（旧语义）。返回 `scale, achievedPx, clamped, cellW, cellH` |
| `sprite_get_anchor` | 读当前锚点：`anchorX, anchorY, convention(y-from-bottom), pixels` |
| `sprite_set_anchor` | 按**像素**设锚点：`{x, y, convention:"y-from-bottom"\|"y-from-top"}`；设置后 get_anchor 能读回同一组值 |

> `sprite_export` 也接受 `anchorX/anchorY`（归一化），语义与 `set_anchor` 等价。

## meta 里有什么

```
name, cols, rows, cellWidth, cellHeight,          // 整数；保证 cellWidth*cols === sheetWidth
width, height, sheetWidth, sheetHeight,
anchorX, anchorY, anchorConvention, anchorYTopDown,  // 两个口径都给，别自己换算
anchorWritten,                                     // 这次导出到底有没有写入锚点
scale, charHeightPx, fps, appliedParams, generatedAt
```

## measure 的 landmarks（十种）

| type | 字段 | 含义 |
|---|---|---|
| `bbox-top/bottom/left/right` | — | alpha 包围盒 |
| `point` | `x,y` | 原样回显（在核对图上打点） |
| `scan-vertical` | `x, fromY, toY` | 沿列找第一个 `alpha > 阈值` 的行 |
| `scan-horizontal` | `x, fromY, toY, probe` | 沿列找第一个**满足颜色条件且连续 ≥minRun 行**的段 |
| `boundary` | `x, fromY, toY, a, b` | A 色段结束、紧接 B 色段的那一行 |

`probe` 形状：`{ channel, op, value, minRun? }`

- `channel`：`r` `g` `b` `alpha` `luma`(0.299r+0.587g+0.114b) `blue-minus-red` `saturation`(max−min) `whiteness`(**低饱和 <25 且 luma >210**，用来排除肤色)
- `op`：`>` `>=` `<` `<=`
- `minRun`：连续多少行才算数，**默认 1**

> **`minRun` 是防呆的核心**：不给它，语义就是"第一个交界"，一根 4 行高的呆毛就能把你骗走。
> 量"某个色块从哪开始"时，**永远显式给 minRun**（推荐按帧高的 15%~25% 推）。

扫不到不会抛异常：返回 `{found:false, reason:"…"}`，其余 landmark 照常给出。
