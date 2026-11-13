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
| `scan-horizontal` | `x`（单列）**或** `columns`（多列）, `fromY, toY, probe, aggregate?` | 沿列找**满足颜色条件且连续 ≥minRun 行**的段 |
| `boundary` | `x, fromY, toY, a, b` | A 色段结束、紧接 B 色段的那一行 |
| **`bodyTop`** | `columns, probe, minRun, fromY, toY` | 语义原语：身高**上端**。多列扫 + 聚合（默认 `min`） |
| **`bodyBottom`** | `band{centerFrac,widthFrac}, probe, minRunPx, fromY, toY` | 语义原语：身高**下端**。**行扫描**：从下往上找"中央带内连续 ≥minRunPx 像素满足条件"的最低行 |

`probe` 形状：`{ channel, op, value, minRun? }`

- `channel`：`r` `g` `b` `alpha` `luma`(0.299r+0.587g+0.114b) `blue-minus-red` `saturation`(max−min) `whiteness`(**低饱和 <25 且 luma >210**，用来排除肤色)
- `op`：`>` `>=` `<` `<=`
- `minRun`：连续多少行才算数，**默认 1**

> **`minRun` 是防呆的核心**：不给它，语义就是"第一个交界"，一根 4 行高的呆毛就能把你骗走。
> 量"某个色块从哪开始"时，**永远显式给 minRun**。缺省时返回里会给一条 warning + **推荐值**（`round(帧高×0.2)` 向上取整到 5 的倍数，下限 8），照它给就行。

### 多列扫描（2026-11-13 新增，量语义点默认走这条）

单列一定会被局部干扰骗（呆毛偏 84px、被摸头时取到手背偏 80px、特效偏 30px）。所以：

```jsonc
{ "id":"hairTop", "type":"scan-horizontal",
  "columns": [200,260,320,380],          // 源帧像素；与 x 互斥
  // 或 "0.30..0.70 step 0.05" ← 这三个数是**帧宽的比例**，工具内部 ×帧宽
  "fromY": 60, "toY": 600,
  "probe": { "channel":"whiteness", "op":">", "value":210, "minRun":120 },
  "aggregate": "median" }                 // min|max|median|mode，默认 median
```

返回：`py`（聚合值）、`confidence`（命中列数/总列数）、`perColumn:[{x,found,py,run,reason?}]`、`aggregate`、`space:"frame"`。

- 命中率 **<50% → `found:false`**（"多数列扫不到"），`perColumn` 仍然全给，让你看出是哪几列挂了；
- 聚合**只用命中的列**；
- `aggregate` 怎么选：求"最高的开始点"用 `min`；有离群干扰时用 `median`（默认）；`mode` 用于离散且重复度高的边界。

扫不到不会抛异常：返回 `{found:false, reason:"…"}`，其余 landmark 照常给出。
所有测量值都带 `space:"frame"`（源帧坐标），换算到格子见 `coordinates.md`。

## 遮挡/异常告警

- `sprite_key_apply`：画面四边各取 2%（至少 4px）的带，**不透明比例 >5%** → `warnings` 里出「画面边缘有主体/道具压边（可能是手或特效）」；
- `sprite_measure`：同一次调用里 `bodyTop` 与 `bodyBottom` 都量到时，若 `confidence<0.6` 或某端逐列 `py` 极差 > 帧高 10%（或上下端认反）→ `warnings` 里出「疑似被遮挡/形变」。
- `sprite_batch` / `sprite_auto` 会把这些 warnings 透传到最终结果——**一条龙最容易"绿着交出烂图"**，看结果时先看 `warnings`。

