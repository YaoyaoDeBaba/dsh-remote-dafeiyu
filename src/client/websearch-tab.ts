/**
 * client/websearch-tab —— 设置页「搜索」那一栏（2026-11-20）。
 *
 * 两件事：填 GitHub token / OpenAlex key，以及"测一下现在能不能用"。
 *
 * ## 三条与这一栏的设计绑定的取舍
 *
 * 1. **输入框永远留空**，已配置时只在旁边显示 `已配置（…abcd）`。
 *    把真 token 填回输入框（哪怕 `type=password`）等于让它多活一份内存副本、
 *    也多一次"被 Inspector / 截屏看到"的机会——而这一栏的用途只有"换一枚"与"删掉"。
 * 2. **保存只提交用户真的填了的那一格**（key 不在 = 不动）：另一格还是空的，
 *    不许被服务端读成"请删掉它"。
 * 3. **「清除」是两个一起删**（这两枚都是可选的第三方凭据，没有"只删一半"的场景），
 *    并且明确说出来——比"清空输入框再点保存"少一步猜。
 *
 * 数据走宿主两条回环路由（`websearch/routes.ts`），写请求带 `x-drc-pair`：
 * 桌面宿主转发时会删掉 `origin`，只靠 Origin 判据在真机上不成立。
 */
import { resolveHostUrl } from './host-url.js'
import { button, card, fieldGroupStyle, fieldStyle, hintStyle, labelStyle } from './panel-kit.js'
import type { CreateElement } from './pill.js'

type Hooks = {
  useState?: <S>(initial: S) => [S, (next: S) => void]
  useEffect?: (effect: () => void | (() => void), deps?: unknown[]) => void
}

const CONFIG_ROUTE = '/api/dsh-remote-dafeiyu/websearch/config'
const TEST_ROUTE = '/api/dsh-remote-dafeiyu/websearch/test'

/** 宿主下发的视图（`websearch/routes.ts` 的 `WebsearchConfigView`，这里只读用得到的几个键）。 */
interface ConfigView {
  githubToken?: string
  openAlexKey?: string
  githubTokenSet?: boolean
  openAlexKeySet?: boolean
  githubTokenSource?: string
  openAlexKeySource?: string
}

/** 一次调用：GET 带不带 body 都能走同一条路（读请求也带 `x-drc-pair`，写路由才校验它）。 */
async function call(route: string, body?: unknown): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(
      resolveHostUrl(route),
      body === undefined
        ? { method: 'GET', headers: { 'x-drc-pair': '1' } }
        : { method: 'POST', headers: { 'content-type': 'application/json', 'x-drc-pair': '1' }, body: JSON.stringify(body) },
    )
    return (await response.json()) as Record<string, unknown>
  } catch {
    // 拉不到就安静降级：这一栏画不出来，别让设置页弹一个未捕获的 Promise
    return { ok: false }
  }
}

/** 「来自哪一层」那句话。说不清（服务端没给）就不画，别编。 */
function sourceText(value: unknown): string {
  if (value === 'config') return '来自设置页'
  if (value === 'env') return '来自环境变量'
  return ''
}

export function buildWebsearchTab(options: {
  createElement: CreateElement
  hooks?: Hooks
}): ((props?: unknown) => unknown) | undefined {
  const { createElement: h, hooks } = options
  const useState = hooks?.useState
  const useEffect = hooks?.useEffect
  if (typeof useState !== 'function') return undefined

  return (): unknown => {
    const [github, setGithub] = useState<string>('')
    const [openalex, setOpenalex] = useState<string>('')
    const [view, setView] = useState<ConfigView>({})
    const [note, setNote] = useState<string>('')
    const [busy, setBusy] = useState<boolean>(false)

    const reload = async (): Promise<void> => {
      const answer = await call(CONFIG_ROUTE)
      // 只在拿到 ok 时覆盖：拉失败不该把"已配置"擦成空（那会让人以为 token 丢了）
      if (answer.ok === true) setView(answer as ConfigView)
    }
    if (typeof useEffect === 'function') {
      useEffect(() => {
        void reload()
      }, [])
    }

    const save = async (): Promise<void> => {
      const body: Record<string, string> = {}
      if (github.trim() !== '') body.githubToken = github.trim()
      if (openalex.trim() !== '') body.openAlexKey = openalex.trim()
      if (Object.keys(body).length === 0) {
        setNote('两个框都是空的：要保存就先填一格（删掉用「清除」）')
        return
      }
      setNote('正在保存…')
      const answer = await call(CONFIG_ROUTE, body)
      if (answer.ok === true) {
        setGithub('')
        setOpenalex('')
        setView(answer as ConfigView)
        setNote('已保存：下一次工具调用就用新 token（不用重启）')
      } else {
        setNote('保存失败：' + String(answer.message ?? '未知原因'))
      }
    }

    const clear = async (): Promise<void> => {
      setNote('正在清除…')
      const answer = await call(CONFIG_ROUTE, { githubToken: '', openAlexKey: '' })
      if (answer.ok === true) {
        setGithub('')
        setOpenalex('')
        setView(answer as ConfigView)
        setNote('已清除：两个 token 都删掉了，回退环境变量 / 匿名额度')
      } else {
        setNote('清除失败：' + String(answer.message ?? '未知原因'))
      }
    }

    const test = async (): Promise<void> => {
      if (busy) return
      setBusy(true)
      setNote('正在真跑一次 GitHub 仓库检索…')
      const answer = await call(TEST_ROUTE, { kind: 'github' })
      setBusy(false)
      const summary = String(answer.summary ?? answer.message ?? '').trim()
      if (answer.ok === true) {
        setNote('测通了：' + (summary === '' ? '上游有回应' : summary))
      } else {
        setNote('测失败：' + (summary === '' ? '上游没有回应（看看网络 / 代理）' : summary))
      }
    }

    /** 一格：标签 + 密码框 + 右侧"已配置（…abcd）/ 来自哪一层"。 */
    const field = (input: {
      label: string
      placeholder: string
      value: string
      onChange: (next: string) => void
      masked: string
      set: boolean
      source: string
    }): unknown => {
      const status = input.set
        ? [input.masked, sourceText(input.source)].filter((piece) => piece !== '').join('　')
        : '未配置'
      return h('div', {
        style: fieldGroupStyle,
        children: [
          h('label', { style: labelStyle, children: input.label }),
          h('input', {
            type: 'password',
            style: fieldStyle,
            value: input.value,
            placeholder: input.placeholder,
            // 浏览器密码管理器别把这两个当登录口令存下来
            autoComplete: 'off',
            onInput: (event: { target?: { value?: string } }) => input.onChange(String(event.target?.value ?? '')),
          }),
          h('div', {
            style: {
              ...hintStyle,
              color: input.set ? 'var(--dsw-alias-label-secondary, #4b7bec)' : hintStyle.color,
            },
            children: status,
          }),
        ],
      })
    }

    return h('div', {
      'data-panel': 'websearch',
      style: { display: 'flex', flexDirection: 'column', gap: '12px' },
      children: [
        card(h, '搜索的 token', [
          h('p', {
            style: hintStyle,
            children:
              '这两个都可选：不填也能搜，只是额度小。未配 GitHub token 时每小时 60 次，配了是 5000 次；' +
              'OpenAlex 不带 key 是整台机器共享 0.10 美元/天，容易 429。',
          }),
          field({
            label: 'GitHub Token',
            placeholder: 'ghp_… 或 github_pat_…',
            value: github,
            onChange: setGithub,
            masked: String(view.githubToken ?? ''),
            set: view.githubTokenSet === true,
            source: String(view.githubTokenSource ?? ''),
          }),
          field({
            label: 'OpenAlex Key',
            placeholder: 'openalex.org/settings/api 申请',
            value: openalex,
            onChange: setOpenalex,
            masked: String(view.openAlexKey ?? ''),
            set: view.openAlexKeySet === true,
            source: String(view.openAlexKeySource ?? ''),
          }),
          h('div', {
            style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' },
            children: [
              button(h, '保存', () => void save(), { kind: 'primary' }),
              button(h, '清除', () => void clear(), { kind: 'danger' }),
              button(h, '测一下', () => void test(), { kind: 'plain', disabled: busy }),
            ],
          }),
          h('p', {
            style: hintStyle,
            children:
              '输入框永远留空：填一格按「保存」就换掉那一枚，另一格不动；「清除」是两个一起删。' +
              '「测一下」会真搜一次 GitHub（花一次额度），回一行结果或中文错误——它比"看 token 长度"有用：' +
              '抄错一位、被撤销、出口被限流，都只有真发一次请求才看得出来。',
          }),
        ]),
        note === ''
          ? null
          : h('div', {
              style: {
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--dsw-alias-border-l2)',
                background: 'var(--dsw-alias-bg-surface-row, #f7faff)',
                fontSize: '12.5px',
                lineHeight: '1.6',
                color: 'var(--dsw-alias-label-secondary)',
                wordBreak: 'break-word',
              },
              children: note,
            }),
      ],
    })
  }
}
