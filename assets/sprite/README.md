# 序列帧精灵图工具 · 页面内 agent 桥接层

给 `window.__spriteAgent` 这套函数接口留的说明书。目的是让外部程序（无头浏览器的 CDP
`Runtime.evaluate`）**直接调函数**走完整条流水线，而不是去模拟点击一堆按钮。

| 文件 | 作用 |
| --- | --- |
| `bridge.js` | 插进工具页主模块内部的桥接代码（**不能**单独当全局脚本用） |
| `sprite-tool.html` | 打补丁后的成品页，`src/sprite/start.ts` 默认就托管这个文件 |
| `../scripts/patch-sprite-tool.mjs` | 打补丁脚本（幂等、自检、找不到插入点就报错退出） |

## 1. 上游工具

- 原始路径：`E:\MonSlayer\序列帧精灵图工具.html`
- 大小：171,682 B（167.7 KB），3,973 行
- 结构：单文件、四段 `<script>`。真正的主逻辑是第 3 段的 **`script[type=module]`**（从 `<script type="module">` 开始，
  到文件末尾的闭合标签结束）。这一段是 module 作用域——没有 IIFE，但顶层 `const state = {…}` /
  `function buildSheet()` 一样**不挂 window**，所以桥接必须插在这一段里面。
- 抠图走 `/api/key`；页面自带的离线垫片（第 2 段 `shim.js`）把 `window.fetch` 接管成本地
  `window.SheetKey` 计算，因此 `requestKey()` 在纯前端、没有 Unity 宿主的场景下也能用。

## 2. 插入点

- 位置：主模块内部**末尾**，模块闭合标签 `</script>` 之前。
- 定位：原文件第 **3971** 行（闭合标签那一行）；插入后代码落在第 3970 行
  `$('statusText').textContent = '就绪 — 导入素材开始';` 之后、第 3971 行的闭合标签之前。
- 包裹标记（幂等判据，整份 HTML 里必须只出现一次）：

  ```
  /* ==== SPRITE-AGENT-BRIDGE v1 ==== */      ← 起始
  /* ==== /SPRITE-AGENT-BRIDGE ==== */        ← 结束
  ```

- 选这里的理由：主模块之外拿不到 `state` / `buildSheet` / `requestKey`；
  而所有初始化（`updateKeyColorUI()` / `bindEvents()` / `renderAnchorPreview()`）都已经跑完，
  桥接挂上去就能立刻用。

## 3. 桥接依赖的内部符号

同一 module 作用域里的这些符号，缺一个对应函数就会 `{ok:false}`（打包脚本还会在插入前预检前 5 项）：

- **状态**：`state`（`source / conv / frames / selected / key / keyed / mask / masked / trim / measure / anchor / out`）
- **DOM / 提示**：`$`、`toast`、`setBusy`、`setProgress`
- **导入抽帧**：`handleFile`、`updateConvUI`、`updateTabs`、`generateFrames`、`renderThumbnails`、`updateSelCount`
- **帧数据**：`getSelectedIndices`、`getSelectedFrames`、`effectiveFrame`、`getCropRect`、`getTrimBBox`、
  `buildProcessedFrame`、`alphaBBox`、`refreshEditPreviews`、`showPreviewBox`、`syncThumbSel`
- **抠图**：`keyHex`、`keyRequestParams`、`requestKey`、`loadCanvasFromDataUrl`、`updateKeyColorUI`、
  `updateKeyModeVisibility`、`onKeyParamChange`、`renderKeyResult`、`renderKeySource`、`showMaskInto`
- **去水印**：`applyRectMask`、`renderMaskPreview`、`onMaskRectChange`、`updateMaskInfo`、`clearMask`
- **裁剪**：`computeTrimCore`、`applyTrimResult`
- **输出**：`buildSheet`、`currentMeta`、`renderSheetPreview`、`renderRuler`、`applyOutScale`、
  `updateMeasureInfo`、`updateMeasureButtons`、`refreshOutput`
- **锚点**：`renderAnchorPreview`
- **接缝**：`window.SheetKey`（由第 2 段垫片使用，桥接间接受益）

内部没有 `extractFrames`、也没有 `measureScale` / `keyApply` / `applyMask` 这些名字——
它们分别是 `generateFrames`、`reverseScale`、`applyKeyToAll`、`applyMaskToAll` 的语义。

## 4. 函数 → 内部落点

| `__spriteAgent.*` | 内部靠什么 |
| --- | --- |
| `loadVideoBase64(b64,name)` | `new File([bytes])` → 写入 `#fileInput.files`（`DataTransfer`）→ 派发 `change` → `handleFile(file)`；`change` 没接住时直接调 `handleFile` 兜底 |
| `setRange(start,end,fps)` | 写 `#convStart` / `#convEnd` / `#convFps`（值不在选项里就补一个 `<option>`）+ `updateConvUI()` |
| `extract()` | `generateFrames()`（判据：`state.frames` 换成新数组） |
| `pickBgColor(idx,x,y)` | `state.frames[idx].getContext('2d').getImageData(x,y,1,1)` → `state.key.color` → `updateKeyColorUI()` → `renderKeyResult()`；**不碰取色按钮/`state.picking`** |
| `keyParams()` | `state.key` + `keyRequestParams()`（`request` 字段就是真发给 `/api/key` 的请求体） |
| `setKeyParams(patch)` | 直接改 `state.key` / `state.key.adv` → `syncKeyUI()` 同步控件 → `onKeyParamChange()`（清 `keyed`/`masked` + 防抖预览 + 刷新编辑页） |
| `keyPreview(idx)` | `requestKey([state.frames[idx]], false)` → 结果 `dataURL` 同时 `showPreviewBox('keyResultBox', …)` 写回界面；**不写入 `state.keyed`**（与「预览」语义一致） |
| `keyApply(indices)` | 等价 `applyKeyToAll`，但帧集合显式：`requestKey(frames, state.key.autoPlate)` → `state.keyed` → `renderThumbnails()` / `updateSelCount()` / `refreshEditPreviews()`；`mask.enabled` 时同步重算 `masked`；`trim.enabled` 时重算 bbox |
| `maskDataURL(idx)` | `effectiveFrame(idx)` 的 alpha 通道当灰度图（与 `showMaskInto` 同一算法）并写回 `#keyResultBox` |
| `setMaskRect(rect)` | 写 `state.mask.rect` + `state.mask.enabled=true` → `onMaskRectChange()` → `renderMaskPreview()` → `updateMaskInfo()`；`null` 走内部 `clearMask()` |
| `applyMask()` | 等价 `applyMaskToAll`：`applyRectMask(keyed[idx] \|\| frames[idx], rect)` → `state.masked` |
| `computeTrim()` | `computeTrimCore(getSelectedFrames())` → `applyTrimResult(u, sel[0], true)` → 读 `state.trim.bbox`；**不自动勾选启用**（和点「计算」按钮一致） |
| `applyTrim()` | 没算过就先 `computeTrim()`，再置 `state.trim.enabled=true` + 勾上 `#trimEnabled` + `refreshEditPreviews()` + `refreshOutput()` |
| `measureScale(bottomY,topY,targetPx)` | 写 `state.measure.top/bottom`（归一化，喂给 `renderRuler` 画线）+ 自己算 `scale = target*100/内容物源高` → `applyOutScale(scale,true)`（内部 `reverseScale()` 要读 `#targetHeight` 输入框，这里绕过） |
| `setAnchor(x,y)` | 写 `state.anchor.x/y` + `renderAnchorPreview()`（**绕过 `setAnchorValue()`，见下**） |
| `buildSheet(cols,rows)` | 写 `#outCols` / `#outRows` → `buildSheet()` → `sheet.toDataURL()` + `currentMeta(r)`；并 `renderRuler()` / `renderAnchorPreview()` / `renderSheetPreview()` 刷新输出页 |
| `sheetMeta()` | `buildSheet()` + `currentMeta(r)`，额外补 `sheetWidth/sheetHeight/cellW/cellH/total` |
| `frameDataURL(idx)` | `state.frames[idx].toDataURL('image/png')`（原始帧，不是抠图结果） |

## 5. 已知坑（都发生在上游，桥接里绕开了）

1. **`markDirty` 曾经根本没定义**（**2026-11-11 18:50 上游已修**）：原文件里 3 处调用、0 处定义，
   点锚点数字框 / 拖锚点 / 点「确认锚点」都会 `ReferenceError`，把后面的语句（`e.preventDefault()`、
   「✓ 已确认…」提示）一起带崩。
   - 上游现在补上了 `markDirty(reason)` / `clearDirty()` + `#anchorDirtyHint`（卡片上显示「● 未保存」）；
   - 同一轮上游还把 `renderKeyResult` 错误分支里不存在的 `esc(...)` 改成了 `escapeHtml(...)`；
   - 打补丁脚本保留一层**兼容老版本**的守卫：若源文件里找不到 `function markDirty`，就把三处调用改写成
     `typeof markDirty === 'function' && markDirty();`（不新增同名函数声明——同作用域重复声明在严格模式下
     会直接 SyntaxError）。上游修了它就自动跳过，日志会打「源文件已自带 markDirty()，跳过上游兜底」；
   - 桥接的 `setAnchor` 自己写 `state.anchor` + 重画，然后 `typeof` 判过再 `markDirty('代理设锚点')`。
2. **`state.conv` 是摆设**：`generateFrames()` 只读 `#convStart/#convEnd/#convFps` 三个 DOM 值，
   改 `state.conv` 完全没用 → `setRange` 必须写 DOM。
3. **`#convFps` 是 `<select>`**：只有 8/12/16/20/24/30，传别的帧率会被 `value=""` 吞掉 →
   桥接会临时补一个 `<option>` 再选中。
4. **自动背景板只在智能档生效**：垫片里是 `if (body.autoPlate && params.mode === 'advanced')`。
   `keyApply` 会返回 `plateNote` 提示这点，`plateApplied` 只在真算过时为 `true`。
5. **不启用抠图 = 结果不可见**：`effectiveFrame()` 只在 `state.key.enabled` 时用 `state.keyed`，
   所以 `keyApply` 会自动把抠图启用（返回值里 `autoEnabled` 标记），否则拼图还是原帧。
6. **缩放上限 300%**：`applyOutScale()` 夹在 1~300，`measureScale` 遇到目标高度换算超上限时
   `scaleClamped:true` 并给出 `achievedPx`（实测 36px 内容要 128px → 需要 355.56%，只能到 300% / 108px）。
7. **`computeTrim` 的 `box` 是「裁切之后、缩放之前」的像素坐标**（`applyTrimResult` 就写这个空间），
   原帧坐标 = `box + getCropRect()` 的偏移。
8. **`keyPreview` 只预览不落盘**：`state.keyed` 不会被预览污染；要看落盘结果得 `keyApply`。
   `apply` 之后再调一次 `keyPreview(0)` 复核是推荐做法（自动背景板只在 apply 生效）。

## 6. 上游工具更新后怎么重新打补丁

```powershell
# 1. 确认新版本的 5 个锚点符号还在（脚本会自动查，缺了就 exit 1）
Select-String -Path "E:\MonSlayer\序列帧精灵图工具.html" -Pattern 'const state = \{|async function requestKey\(|function buildSheet\(|async function renderKeyResult\(|statusText'

# 2. 重新生成成品页（默认输出仓库里的 assets/sprite/sprite-tool.html）
cd C:\Users\htsd\AppData\Local\Temp\dsh-remote-src
node scripts/patch-sprite-tool.mjs "E:\MonSlayer\序列帧精灵图工具.html"

# 3. 自检：起始标记只出现 1 次
node -e "const fs=require('fs');const h=fs.readFileSync('assets/sprite/sprite-tool.html','utf8');const m='/* ==== SPRITE-AGENT-BRIDGE v1 ==== */';if(h.split(m).length-1!==1)process.exit(1);console.log('ok',h.length)"

# 4. 静态体检：成品页里"被调用但从未定义"的函数名（上游自带工具，2026-11-11 新增）
node "E:\MonSlayer\工具\js-call-check.js" assets\sprite\sprite-tool.html

# 5. 运行时冒烟（需要本机 Edge/Chrome）
node scripts/smoke-sprite-tool.mjs            # 页面 + bridge
node scripts/make-sprite-fixture.mjs          # 生成绿幕素材（可选）
node scripts/smoke-sprite-tool.mjs %TEMP%\sprite-fixture-green.webm   # 抽帧 + 单帧抠图
```

脚本行为：

- **幂等**：输入里已有起始标记 → 只做原样输出，不会再插一遍（标记永远只有 1 次）。
- **失败即退出**：找不到 `script[type=module]`、找不到它的闭合标签、或 5 个锚点符号缺任何一个 → 打印原因 + `exit 1`，
  **不会写出半成品**（负例已验证：三种坏输入都没生成输出文件）。
- **插入后自检**：起始/结束标记各 1 次、总长度增量对得上、`<script` 与 `</script>` 数量不变，任何一条不满足都 `exit 1`。
- 用法：`node scripts/patch-sprite-tool.mjs <原始HTML> [输出路径]`（第四种情况：`bridge.js` 里出现脚本闭合标签字面量也会被拒）。

改桥接只改 `assets/sprite/bridge.js`，然后重跑第 2 步即可（不要手改 `sprite-tool.html`，下次打补丁会被覆盖）。

## 7. 一次实测（无头 Edge + CDP，96×96 绿幕 mp4，2 秒）

```
load      {"ok":true,"name":"greenscreen.mp4","bytes":3020,"kind":"video","duration":2,"width":96,"height":96}
range     {"ok":true,"start":0,"end":1,"fps":12}
extract   {"ok":true,"count":12,"width":96,"height":96}
pick      {"ok":true,"hex":"#00ff02","rgba":"(0,255,2,255)"}
preview   {"ok":true,"dataURL":"data:image/png;base64,…"}      mask {"ok":true,…}
apply     {"ok":true,"frames":12,"plateApplied":false,"keyEnabled":true,"autoEnabled":true}
trim      {"ok":true,"box":{"x":6,"y":28,"w":40,"h":40},"content":{"w":36,"h":36}}
applyTrim {"ok":true,"enabled":true,"box":{"x":6,"y":28,"w":40,"h":40}}
measure   {"ok":true,"scale":300,"wantedScale":355.56,"scaleClamped":true,"sourcePx":36,"achievedPx":108}
anchor    {"ok":true,"x":0.5,"y":0.05}
sheet     {"ok":true,"w":600,"h":600,"cell":[120,120],"meta":{cols:5,rows:5,scale:300,anchorX:0.5,anchorY:0.05}}
meta/frame/maskRect/applyMask/maskNull 全部 ok；错误入参返回 {ok:false,error:…}
```

页面 `Runtime.exceptionThrown` / `console.error` 计数 **0**；UI 同步确认：`#keyColorHex=#00FF00`、
`#keyEnabled` 勾上、`#keyMode=advanced`、`#trimEnabled` 勾上、`#trimInfo` 有内容物尺寸、
`#sheetW/H`/`#cellSize`/`#sheetFrames` 已刷新、锚点数字框 `0.500 / 0.050`、`#sheetPreviewBox` 有 canvas。
