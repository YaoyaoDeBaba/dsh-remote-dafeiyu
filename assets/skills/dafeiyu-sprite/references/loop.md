# 循环闭合：让循环动作首尾无缝

> 适用：**会持续循环播放**的动作（跑、走、待机、呼吸、漂浮）。
> 不适用：**一次性**动作（指点、举手、看图纸、挥手告别）——这类首尾本来就不该闭合，硬闭合会把动作截成半截。

## 问题

AI 生成的"4 秒动画"里通常含 **N 个不完整循环**。播放器播完第 48 帧跳回第 0 帧时：
- 第 48 帧 ≈ 第 0 帧 → 两个相同姿势，**视觉上顿一下**；
- 或差得远 → **跳变**。

正确做法：找出真实周期，按周期截断，**丢掉重复的那一帧**。

## 工具怎么用（三步）

```jsonc
// ① 先按 12fps 抽一版"密"的帧（只用于测周期，不用于交付）
sprite_prepare({ videoPath, start:0, end:4, fps:12 })     // 4s → 48 帧

// ② 扫周期（只读像素，不改会话状态）
sprite_loop_scan({ minPeriodSec: 2, targetMultiples: [24,48] })
→ { periodFrames, periodSec, suggestedFps, targetFrames, confidence, closureScore, scoreCurve }

// ③ 按周期重采 + 导出
sprite_prepare({ videoPath, start:0, end:4, loop:{ targetFrames:24 } })
→ { frames:24, fps:20.57, periodSec:1.167, loopClosed:true }
sprite_export({ cols:8, rows:3, charHeightPx:277, span:{fromY,toY} })
→ { … "loopCheck": { firstLastDiff, adjacentDiff, ok:true } }
```

**为什么不自动**：`loop_scan` 只报数、不改采样率。改采样必须显式调 `prepare({loop})`——否则"我只是想量一下，结果交付物变了"。

## `sprite_loop_scan` 怎么读结果

| 字段 | 怎么用 |
|---|---|
| `periodFrames` / `periodSec` | 真实周期（帧 / 秒） |
| `suggestedFps` / `targetFrames` | 让"周期正好等于 targetFrames 帧"的采样率 |
| `confidence` | `high` 才直接照做；`medium` 要交叉验证；`low` = 动作不严格周期 → 返回里直接给 `suggestedAction:"treat-as-one-shot"`，且 `warnings[0]` 就是"建议按一次性动作处理"（2026-11-13 起不再只藏在 reason 里） |
| `scoreCurve` | 前 5 名。**看第二名与第一名的差距**：`score(L_best) < 0.85×邻居` 才算赢，勉强赢的就是运气 |
| `closureScore` | 末帧vs首帧 ÷ 相邻帧平均差。≈0 = 还有重复帧；明显 >1 = 没闭合 |

## ⚠️ 最容易踩的三个坑

1. **`minPeriodSec` 太大会把真周期过滤成 2 倍**。默认 2 秒 = 12fps 下 L≥24；一段 1.17s 的动作真周期 L=14 会被直接挡在门外，工具报 L=28（2 倍）**且看着很自信**。
   现在这种情况会额外给一条 warning（"周期可能是 2 倍：L=14 的分数与 L=28 接近…把 loop.minPeriodSec 调到 ≤1.17 重扫"）——**看到就调小重扫**。
2. **用整图算差异**：绿幕渐变/压缩噪声会淹没动作差异。工具默认用 `body-core`（最大连通域）掩膜，且**全序列共用第 0 帧那一张**——逐帧各算各的会让"边界变化"冒充动作差异。
3. **对一次性动作做闭合**：`loop` 是显式开关，不按帧数自动触发。挥手告别这类不要加。

## 判定阈值（经验值）

| 指标 | 含义 | 参考 |
|---|---|---|
| `score(L_best)` | 周期处的平均帧差 | < 0.85 × 邻居才算可信 |
| 邻域锐度 | 峰值是否清晰 | >10% 说明周期清晰 |
| `diff(末, 首)` | 闭合度 | 与相邻帧差**同量级**；0 说明重复帧还在 |

闭合判据：`|firstLast − adjacent| / adjacent < 0.5`（`prepare` 与 `export` 共用同一个公式）。

> 对**速度非均匀**的动作（正弦式、折返点正好落在环绕点）这个判据会偏严——实测同一段真闭合素材给过 0.474（勉强 ok）与 0.564（报未闭合）。两个差值都在返回里，能人工判断，不要盲信布尔值。

## 帧数要能被网格整除

导出按 `cols × rows` 排布，24 帧 = 8×3、48 帧 = 8×6。`targetMultiples` 默认 `[24,48]`；给别的数会 warning（"会多出空位"）。

## 性能（实测）

720×966 × 48 帧 × 19 个候选：自相关 48ms（1/4 降采样）、全分辨率复核 21ms、读帧 + 降采样 161ms，合计 **≈260ms**。
真机端到端（480×480 / 24fps / 4s）：预采样 833ms → loopScan 505ms → prepare({loop}) 965ms → export 704ms。
