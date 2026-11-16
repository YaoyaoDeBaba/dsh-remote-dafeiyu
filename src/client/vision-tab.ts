/**
 * vision-tab — 设置页「肥鱼识图」分栏（2026-11-16 从「人设」分栏里抽出来独立成栏）。
 *
 * 为什么要独立：识图是**外挂模型配置 + 一次试跑**，跟"我是什么人、记得什么"没关系。
 * 之前它挂在人设分栏里（`dafeiyu-page.ts` 的 persona 分支 `extras.push(...)`），
 * 找"识图为什么不出结果"要翻进人设那一栏，是这一轮重排要解决的问题之一。
 *
 * 栏内四块（顺序照已批准的结构）：
 *
 * | # | 块 | 数据来源 |
 * |---|---|---|
 * | ① | 状态：就绪否 / 模型名 / 协议 /（最近一次） | `GET /api/dsh-remote-dafeiyu/vision/config` |
 * | ② | 模型配置（沿用 `buildVisionPanel()` 那块） | 同上 + 三条写路由 |
 * | ③ | 试一张：选本地图片 → POST 识图 → 结果 + 复制 | `POST .../vision/recognize` |
 * | ④ | 最近几次 | **宿主没有历史接口，这一轮不做**（卡里如实写一句） |
 *
 * ## 「最近一次」那一行为什么多数时候不出现
 *
 * 宿主的 `/vision/config` 现在回的是 `toView(config)`（`src/vision/config.ts:68-81`）：
 * enabled/apiBase/model/protocol/prompt/timeoutMs/requestTemplate/responsePath/apiKeySet/apiKeyHint
 * —— **没有"上次什么时候、成功没成功"这一类字段**，宿主也没有记过（`service.recognize()`
 * 不落调用记录）。所以这里按"宿主给了才画"处理（认 `lastCallAt` / `lastOk` / `lastError` /
 * `lastMs` 这几个名字），**不给就整行不画**——凭空写一句"最近一次：成功"是假数据。
 * 真要看"能不能用"，下面「试一张」跑一次就是权威答案。
 *
 * ## 「最近几次」为什么是空的
 *
 * 同上：宿主没有任何"识图历史"接口（只有三条：config / recognize / models）。
 * 卡留着是让用户知道"这里将来会有什么"，但**不编记录**，并写清为什么没有。
 */
import { VISION_BASE, VISION_RECOGNIZE_ROUTE, callJson } from './host-api.js'
import { buildVisionPanel, fileToBase64, protocolLabel, type VisionConfigView } from './vision-panel.js'
import {
  button,
  card,
  columnStyle,
  hintStyle,
  kv,
  kvGrid,
  notesStyle,
  quoteStyle,
  rowStyle,
  tag,
  type CreateElement,
  type TagTone,
} from './panel-kit.js'

type Hooks = {
  useState?: <S>(initial: S) => [S, (next: S) => void]
  useEffect?: (effect: () => void | (() => void), deps?: unknown[]) => void
}

export interface VisionTabDeps {
  createElement: CreateElement
  hooks: Hooks
}

/** 宿主 `/vision/config` 回答里**可能**带的"最近一次调用"字段（现在不带，见文件头）。 */
interface LastCallView {
  at?: string
  ok?: boolean
  ms?: number
  error?: string
}

/** 把宿主回答里"最近一次"那一组字段读出来；一个都没给就返回 `undefined`（⇒ 不画那一行）。 */
function readLastCall(config: Record<string, unknown>): LastCallView | undefined {
  const at = typeof config.lastCallAt === 'string' ? config.lastCallAt : undefined
  const ok = typeof config.lastOk === 'boolean' ? config.lastOk : undefined
  const ms = typeof config.lastMs === 'number' ? config.lastMs : undefined
  const error = typeof config.lastError === 'string' ? config.lastError : undefined
  if (at === undefined && ok === undefined && ms === undefined && error === undefined) return undefined
  return { at, ok, ms, error }
}

const fmtMs = (ms: number | undefined): string =>
  typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? `${(ms / 1000).toFixed(1)}s` : ''

const fmtSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '大小未知'
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * 「肥鱼识图」整栏。宿主没给 `useState` 时返回 `undefined`（调用方画一行降级说明）。
 *
 * 四块各自是独立组件（各自读配置 / 各自管试跑状态）：试跑失败不许把配置块也弄成错误态。
 */
export function buildVisionTab(deps: VisionTabDeps): (() => unknown) | undefined {
  const { createElement: h, hooks } = deps
  const useState = hooks.useState
  const useEffect = hooks.useEffect
  if (typeof useState !== 'function') return undefined
  /*
   * 守卫之后的别名：下面的组件是 `function` 声明（会被提升），TypeScript 对提升的函数
   * 不保留"`useState` 存在"这层收敛（它不敢断言调用时一定过了守卫）。取一个非可选的
   * 别名，类型就干净了，也不必到处写 `!`。
   */
  const useS: <S>(initial: S) => [S, (next: S) => void] = useState

  // ② 模型配置：宿主没给 hooks 时那块自己返回 undefined，这里就不放它。
  const configBlock = buildVisionPanel({ createElement: h, hooks, bare: true })

  /** ① 状态。 */
  function VisionStatusCard(): unknown {
    const [cfg, setCfg] = useS<VisionConfigView | null>(null)
    const [status, setStatus] = useS<string>('正在读取识图配置…')

    const load = async (): Promise<void> => {
      try {
        const result = await callJson(`${VISION_BASE}/config`, undefined)
        const config = result.config
        if (result.ok === true && config !== null && typeof config === 'object') {
          setCfg(config as VisionConfigView)
          setStatus('已载入')
        } else {
          setCfg(null)
          setStatus(`读取失败：${String(result.error ?? '宿主没有返回配置')}`)
        }
      } catch (error) {
        setCfg(null)
        setStatus(`读取失败：${String((error as Error)?.message ?? error)}`)
      }
    }

    useEffect?.(() => {
      void load()
    }, [])

    if (cfg === null) {
      // 读不到就给一颗重读（宿主没给 `useEffect` 时这份面板不会自己重试，停在"正在读取"最差）
      return card(h, '状态', [
        h('p', { style: notesStyle, children: status }),
        h('div', { style: rowStyle, children: [button(h, '重新读取', () => void load())] }),
      ])
    }

    const ready = cfg.enabled === true && cfg.apiKeySet === true
    const tone: TagTone = cfg.enabled !== true ? 'off' : ready ? 'ok' : 'warn'
    const readyText = cfg.enabled !== true ? '未开启' : ready ? '已就绪' : '缺密钥'
    const rows: unknown[] = [
      kv(h, '外挂视觉模型', tag(h, readyText, tone)),
      kv(h, '模型名', cfg.model === '' ? '（没填）' : cfg.model),
      kv(h, '协议', protocolLabel(cfg.protocol)),
    ]
    // 宿主没记过"最近一次"（见文件头）⇒ 这一行**不画**，不写假话。
    const last = readLastCall(cfg as unknown as Record<string, unknown>)
    if (last !== undefined) {
      const parts = [last.ok === true ? '成功' : last.ok === false ? '失败' : '已调用']
      if (last.at !== undefined) parts.push(last.at)
      if (fmtMs(last.ms) !== '') parts.push(`用时 ${fmtMs(last.ms)}`)
      if (last.error !== undefined && last.error !== '') parts.push(`原因：${last.error}`)
      rows.push(kv(h, '最近一次', parts.join(' · ')))
    }
    return card(h, '状态', [
      kvGrid(h, rows),
      h('p', {
        style: hintStyle,
        children: cfg.enabled === true
          ? '聊天页右下角那颗鲸鱼按钮，选图就发给这个模型。'
          : '先在下面「模型配置」里填好接口地址与密钥，再打开开关。',
      }),
    ])
  }

  /** ③ 试一张：选图即识别（与聊天页那颗鲸鱼按钮同一档行为），结果可复制。 */
  function VisionTryCard(): unknown {
    const [picked, setPicked] = useS<string>('')
    const [busy, setBusy] = useS<boolean>(false)
    const [note, setNote] = useS<string>('')
    const [text, setText] = useS<string>('')
    /** 上一次选的文件：那颗「识别」按钮重试用它（选完会自动跑一次）。 */
    const [file, setFile] = useS<File | null>(null)

    const recognize = async (target: File): Promise<void> => {
      setBusy(true)
      setNote('识别中…（大图可能要十几秒）')
      const started = Date.now()
      try {
        const imageBase64 = await fileToBase64(target)
        const result = await callJson(
          VISION_RECOGNIZE_ROUTE,
          { imageBase64, mime: target.type === '' ? 'image/png' : target.type },
          120_000,
        )
        if (result.ok === true && typeof result.text === 'string') {
          setText(result.text)
          // 用时只进这一句（不进状态卡）：它是"这一次试跑"的观测，不是宿主记下的历史。
          setNote(`识别完成 · 用时 ${fmtMs(Date.now() - started)}`)
        } else {
          setText('')
          // 宿主那条路由把中文原因放在 `error`（缺密钥 / 上游 502 / 超时都在这里）。
          setNote(`识别失败：${String(result.error ?? '宿主没有返回原因')}`)
        }
      } catch (error) {
        setText('')
        setNote(`识别失败：${String((error as Error)?.message ?? error)}`)
      } finally {
        setBusy(false)
      }
    }

    const pick = (event: { target?: { files?: ArrayLike<File> | null } }): void => {
      const chosen = event?.target?.files?.[0]
      if (!chosen) return
      setFile(chosen)
      setPicked(`${chosen.name} · ${fmtSize(chosen.size)}`)
      void recognize(chosen)
    }

    const copy = async (): Promise<void> => {
      if (text === '') {
        setNote('还没有识别结果')
        return
      }
      try {
        await navigator.clipboard.writeText(text)
        setNote('已复制')
      } catch {
        setNote('复制失败：请手动选中结果复制')
      }
    }

    const retry = (): void => {
      if (file === null) {
        setNote('先选一张图片')
        return
      }
      void recognize(file)
    }

    return card(h, '试一张', [
      h('p', { style: notesStyle, children: '选一张本地图片，发给上面那个外挂模型看。结果只显示在这里，不会注入会话（要注入就点聊天页那颗鲸鱼按钮）。' }),
      h('div', {
        style: rowStyle,
        children: [
          h('input', {
            type: 'file',
            accept: 'image/*',
            disabled: busy,
            onChange: (event: Event) => pick(event as unknown as { target?: { files?: ArrayLike<File> | null } }),
          }),
          button(h, '识别', retry, { disabled: busy || file === null }),
          button(h, '复制结果', () => void copy(), { disabled: text === '' }),
        ],
      }),
      picked === '' ? null : h('p', { style: hintStyle, children: `已选：${picked}` }),
      note === '' ? null : h('p', { style: notesStyle, children: note }),
      text === '' ? null : h('pre', { style: quoteStyle, children: text }),
      h('p', { style: hintStyle, children: '最近几次：宿主还没有识图历史接口，这一版记不下来（每次试的结果就在上面）。' }),
    ])
  }

  /** ④ 最近几次：宿主没有历史接口 ⇒ 只有一句说明，不编记录（见文件头）。 */
  function VisionHistoryCard(): unknown {
    return card(h, '最近几次', [
      h('p', {
        style: notesStyle,
        children: '这一版宿主只提供「读配置 / 识别 / 列模型」三条路由，没有保存过识别历史，所以这里暂时没有记录可列。',
      }),
      h('p', {
        style: hintStyle,
        children: '要接它需要在宿主侧加一条「列举最近调用」的只读路由（本轮不做，见交付报告）。',
      }),
    ])
  }

  return function VisionTab(): unknown {
    const children: unknown[] = [h(VisionStatusCard, {})]
    /*
     * ⚠️ `data-block` 是给判据用的**结构标记**（不是样式）：`tests/client-bundle.test.ts` 靠它
     * 断言"识图配置块只挂在肥鱼识图栏、没有回到人设栏"。
     * 它必须落在**一个真节点**上（而不是组件元素的 props 上）：判据会把这棵树渲染一层，
     * 组件元素会被替换成它的返回值，挂在元素上的 props 那时就没了。
     */
    if (configBlock) children.push(card(h, '模型配置', [h('div', { 'data-block': 'vision-config', children: [h(configBlock, {})] })]))
    children.push(h(VisionTryCard, {}), h(VisionHistoryCard, {}))
    return h('div', { 'data-panel': 'vision', style: columnStyle, children })
  }
}
