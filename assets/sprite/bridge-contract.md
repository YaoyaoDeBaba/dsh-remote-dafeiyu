# `window.__spriteAgent` 扩展契约（v2）

> 这份文件是**接口契约**：页面桥接（`assets/sprite/bridge.js`）按它实现，宿主侧
> `src/sprite/service.ts` 按它调用。任何一方改签名都要同步改这里。
>
> 现有 v1 函数（`loadVideoBase64 / setRange / extract / pickBgColor / keyParams /
> setKeyParams / keyPreview / keyApply / maskDataURL / setMaskRect / applyMask /
> computeTrim / applyTrim / measureScale / setAnchor / buildSheet / sheetMeta /
> frameDataURL`）**签名不变**，只新增下面这些。

## 通用约定

- 全部 `async`，返回**纯 JSON**（不得含 canvas / ImageData / 函数）。
- 成功 `{ ok: true, ... }`；失败 `{ ok: false, error: '<中文原因>' }`。
- 内联注释写清依赖的内部符号；找不到落点时返回 `{ok:false,error:'未接通: <符号>'}`，不许编造。
- 像素坐标一律「帧原始像素空间、左上原点、右/下开区间」。

## 1. `loadVideoUrl(url, name)`

不经过 base64 的导入通道：页面自己 `fetch(url)` → `Blob` → `File` → 塞进文件输入框 → 触发 change。

```
返回 { ok, name, bytes, duration, width, height }
```

## 2. `keyState()`

```
返回 { ok, enabled, mode: 'classic'|'advanced', keyedCount, frameCount,
       params: { colorHex, intensity, softness, despill, greenToAlpha, aggressive, autoPlate, feather, cleanup } }
```

用途：宿主在 `export` 前断言 `keyedCount > 0`（缓存被 preview 清空时**必须报错**，不能悄悄拼原帧）。

## 3. `probeColor({ frame?, bandPx? })`

从帧的四边带采样背景色（**这是 agent 唯一可靠的取色方式**）。

```
返回 { ok, keyColor: '#RRGGBB', spread: number,   // spread = 各边中位色的最大通道差 / 255，0~1
       samples: [{ edge:'left'|'right'|'top'|'bottom', rgb:[r,g,b], alphaRatio:number }],
       rejected: string[] }                        // 前景占比过高被剔除的边
```

规则：每条边取 `bandPx`（默认 `max(4, round(min(w,h)*0.03))`）宽的带；带内按 alpha 与亮度取
中位色；`alphaRatio`（不透明占比）> 0.5 的边视为「主体压边」，剔除；至少保留 1 条边。

## 4. `measure({ frame?, alphaThreshold?, landmarks? })`

`frame` 可以是数字（默认 0）或 `'all'`。

```
返回 { ok, frame, width, height,
       alphaBBox: { x0, y0, x1, y1 },          // x1/y1 开区间
       contentHeight, contentWidth,
       perFrameSpread?: { frames, topY:{min,max}, soleY:{min,max},
                          bboxUnion:{x0,y0,x1,y1} },     // 仅 frame:'all'
       landmarks?: [{ id, px, py, confidence }] }
```

- `topY` = 该帧 alphaBBox 的 `y0`；`soleY` = `y1 - 1`。
- `landmarks` 支持三类，全部**与业务无关**：
  - `{ id, type:'bbox-top'|'bbox-bottom'|'bbox-left'|'bbox-right' }` → 对应边界值，`confidence: 1`；
  - `{ id, type:'point', x, y }` → 原样回显，`confidence: 1`；
  - `{ id, type:'scan-vertical', x, fromY?, toY?, alphaThreshold? }` → 沿该列从 `fromY` 往下找第一个
    alpha > 阈值行，`confidence` 按该列 alpha 连续性给（找不到 → `px/py: null, confidence: 0`）。

## 5. `overlay({ frame?, lines?, texts?, pixelScale? })`

把若干条线/文字画到该帧的**副本**上，返回 PNG dataURL（宿主落到 `_debug/`，agent 拿它当眼睛）。

```
返回 { ok, dataURL, width, height }
lines: [{ x0, y0, x1, y1, color?, label? }]
texts: [{ x, y, text, color? }]
```

`pixelScale` 默认 1（>1 时先放大再画，给大图用）。

## 6. `getAnchor()` / `setAnchorPx({ x?, y?, convention? })`

```
getAnchor() → { ok, anchorX, anchorY, convention: 'y-from-bottom',
                pixels: { x, y }, frameWidth, frameHeight }
setAnchorPx({ x?, y?, convention? }) → { ok, anchorX, anchorY, convention, pixels:{x,y} }
```

- 工具内部是 `y-from-bottom`（0 = 帧底）。`pixels.y` 是**从帧底往上**量的像素数。
- `convention: 'y-from-top'` 时把入参 `y` 当「从顶往下」解释，内部照样存归一化值；
  返回里 `convention` 原样回显（让调用方自己知道口径）。
- `setAnchorPx` 必须同时更新 `state.anchor` 与 UI（`renderAnchorPreview`），并在返回后让
  `getAnchor()` 能读回同一组值（闭环）。

## 7. `scaleTo({ charHeightPx?, targetCellHeight?, span? })`

```
返回 { ok, scale, wantedScale, clamped, sourcePx, achievedPx, cellW, cellH, frameW, frameH }
```

- `span: { fromY, toY }`（帧像素，含端点）→ `sourcePx = |toY - fromY| + 1`；
- `charHeightPx` → `wantedScale = charHeightPx / sourcePx * 100`（夹到 1~300）；
- `targetCellHeight` → 旧语义（整格高），兼容用；
- 三者都不给 → 用首帧 alphaBBox 的高（即 v1 `measureScale` 行为，返回里 `auto: true`）。

## 8. `trim({ mode?, pad?, alphaThreshold? })`

重新计算并**应用**裁剪框（对应现有 `computeTrim`/`applyTrim` 两步合一，但可指定策略）。

```
返回 { ok, box:{x,y,w,h}, mode:'union'|'first-frame', pad:{top,bottom,left,right},
       alphaThreshold, unionFrames, firstFrameBox?:{x,y,w,h} }
```

- `union`（默认，= 现状）：48 帧 alpha 并集；
- `first-frame`：只按第 0 帧的 alphaBBox + `pad`（防截肢用 `pad` 补），**格子稳定**，
  适合「有漂浮特效/残留」的素材；
- `pad` 默认 `{top:2,bottom:2,left:2,right:2}`，必须在返回里回显（P17：结果差 2px 要能对账）。

## 9. `detectWatermark({ frames?, maxRects? })`

固定角标检测：多帧对比，找「颜色几乎不变 + 不透明 + 不在主体 bbox 内」的角落区域。

```
返回 { ok, rects:[{ x, y, w, h, corner:'tl'|'tr'|'bl'|'br', confidence }], sampled }
```

`confidence` = 该区域在采样帧里的稳定比例；低于 0.8 的建议调用方别用。

## 10. `buildSheetDataURL({ cols?, rows?, format?, quality? })`

```
返回 { ok, dataURL, mime: 'image/png'|'image/webp', meta, width, height }
```

`format: 'webp'` 时在页面里用 `canvas.toBlob('image/webp', quality)` 编码（quality 默认 0.9，
范围 0~1）。**不得**为了编码改动画布内容。

## 11. `keyedDataURL({ frame })`（v2 追加，2026-11-11）

把**已抠图**的那一帧（`state.keyed` 里的 canvas）导出成 PNG dataURL，**不碰任何参数**。

```
返回 { ok, dataURL, frame, width, height }
keyedCount === 0 时返回 { ok:false, error:'还没有抠图结果，先 keyApply()' }
```

用途：宿主要算"最差帧"指标（B6）。**绝不能用 `keyPreview` 代替**——`keyPreview` 会先
`setKeyParams`，而那条路会 `onKeyParamChange()` 清空 keyed 缓存（正是 P2 那个坑）。

## 12. 兼容性

- 以上函数全部**新增**；v1 的 18 个函数行为保持不变（`measureScale` 保留，内部可转发到 `scaleTo`）。
- `keyApply` 的返回补 `appliedParams`（真正生效的那份）与 `keyedCount`。
- `keyPreview` 的返回补 `appliedParams`。
