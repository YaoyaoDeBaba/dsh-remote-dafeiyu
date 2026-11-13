# 抠图参数：哪一档生效、怎么调

| 参数 | classic | advanced | 语义 | 建议初值 |
|---|---|---|---|---|
| `colorHex` | ✅ | ✅ | 键色（**必须实测**，别写 #00FF00） | 用 `probe_color` 的结果 |
| `intensity` | ✅ | ✅ | 越大抠得越狠 | 75~85 |
| `feather` | ✅ | — | alpha 羽化半径 | 20 |
| `cleanup` | ✅ | — | 去色溢出 | 30 |
| `softness` | — | ✅ | 软边宽度 | 100 |
| `despill` | — | ✅ | 去绿边强度 | 70 |
| `aggressive` | — | ✅ | 主体轮廓也去绿 | true |
| `greenToAlpha` | — | ✅ | 残绿转透明（>0 走两步法） | 25（特效半透明素材按 0→25→50→75 逐档试） |
| `autoPlate` | — | ✅ | 自动背景板（**只在 key_apply 生效**，preview 看不出） | 背景斑驳时 true |
| `maskMode` | ✅ | ✅ | 水印探测档：`auto`=严格判据→四角兜底；`corner`=直接四角扫 | 默认 `auto` |

**传了不生效档的参数不会报错，但会出现在返回的 `ignored[]` 里** —— 看到 `ignored` 非空就说明选错档了。

## 判断"抠干净了没有"的三个数（`key_apply` 的 `stats`）

| 指标 | 期望 | 超标说明 |
|---|---|---|
| `bgResidual` | < 0.01 | 背景没吃干净 |
| `subjectCoverage` | > 0.98 | 主体被抠掉了一块 |
| `edgeGreen` | < 0.10 | 边缘残留绿 |

`worst` 是**抽样帧里最差的那一帧**（第 0 帧干净不代表整段干净）。

## 调参顺序（别乱试）

1. 先 `probe_color` 拿准键色（`spread` < 0.05 才动手）；
2. 直接上 `advanced`（border 更干净），`intensity` 从 80 起；
3. 只剩边绿 → 加 `greenToAlpha`（25 → 50，不要一次给 300）；
4. 背景斑驳/渐变 → `autoPlate: true`；
5. 仍不收敛 → `sprite_autotune`（最多 6 轮），别再手工试。
