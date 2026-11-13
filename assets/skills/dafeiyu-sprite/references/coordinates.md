# 坐标空间：源帧 / 裁剪框 / 格子

## 三个空间

| 空间 | 是什么 | 谁在用 |
|---|---|---|
| `frame` | 抽出来的原始帧（例如 720×966） | `measure` / `scan` / 模板匹配 **默认都在这** |
| `crop` | `cleanup` 之后的裁剪框（`box`） | `trim` 的结果，图集按它切 |
| `cell` | 输出图集的一格（例如 287×386） | 运行时按格子画；锚点是**相对格子**的归一化值 |

## 换算（单向链，别跳步）

```
源帧 px ──(−box.x, −box.y)──> 裁剪框 px ──(×scale)──> 格子 px ──(/cellW, cellH)──> 归一化 0~1
```

- `scale` 来自 `sprite_scale_to` / `sprite_export` 的返回（例：43.48% = 0.4348）；
- `box` 来自 `sprite_cleanup` 的返回；
- `cellW / cellH` 来自 `meta.cellWidth / cellHeight`（整数，且 `cellWidth*cols === sheetWidth`）。

## 三条铁律

1. **一切测量在源分辨率做**。缩放 0.35~0.5 时，格子上 1px 误差 ≈ 源帧 2~3px；
2. **归一化锚点是相对输出格子**的；而 `span`、`landmarks` 的 `py` 是**相对源帧**的。混用必错；
3. 报数时带 `space`，读数是 `frame` 还是 `cell` 必须写明——没有标签的数一律当可疑。

## 常见错法

| 错法 | 后果 |
|---|---|
| 拿源帧 px 直接当格子 px 传给 `set_anchor` | 锚点被夹到边界（因为格子比源帧小） |
| 用裁剪前的坐标算归一化 | 整体偏移 `box.x/box.y × scale` |
| 拿 `span`（源帧）去算锚点归一化 | 差一个 `scale` 因子 |
