/**
 * vision/protocols — 四种协议怎么发、怎么取回文本。**纯函数**，判据直接钉这里。
 *
 * 协议差异全部收在 `buildRequest` / `extractText` 两个函数里；识图主流程（`service.ts`）
 * 不认识任何一家 API 的形状。新增一家 = 加一个 case，不动别处。
 */
import { resolveProtocol, type VisionConfig } from './config.js'

export interface ImageInput {
  base64: string
  mime: string
  /** 单次识图指令，覆盖配置里的默认 prompt。 */
  prompt?: string
}

export interface PreparedRequest {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: string
  /** 解析响应：返回识别文本（可能为空串，由调用方判断）。 */
  extract: (json: unknown) => string
}

export class VisionError extends Error {
  readonly status: number
  constructor(message: string, status = 0) {
    super(message)
    this.name = 'VisionError'
    this.status = status
  }
}

function trimBase(base: string): string {
  return String(base ?? '').replace(/\/+$/, '')
}

function promptOf(config: VisionConfig, image: ImageInput): string {
  const custom = typeof image.prompt === 'string' ? image.prompt.trim() : ''
  return custom !== '' ? custom : config.prompt
}

function deepGet(value: unknown, path: string[]): unknown {
  let cursor: unknown = value
  for (const key of path) {
    if (cursor === null || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[key]
  }
  return cursor
}

/** 把 `choices.0.message.content` 这种点号路径拆开；纯数字段转下标。 */
export function splitPath(path: string): string[] {
  return String(path ?? '')
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '')
}

/** 从响应 JSON 取文本：兼容「字符串」与「内容数组」两种常见形状。 */
export function textFrom(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    const parts: string[] = []
    for (const item of value) {
      if (typeof item === 'string') {
        parts.push(item)
      } else if (item && typeof item === 'object') {
        const text = (item as Record<string, unknown>).text
        if (typeof text === 'string') parts.push(text)
      }
    }
    return parts.join('\n').trim()
  }
  return ''
}

/** `{model:…,messages:[…]}` 这类 OpenAI Chat 请求体，把图片内嵌成 data URL。 */
function openAiChatBody(config: VisionConfig, image: ImageInput): string {
  return JSON.stringify({
    model: config.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: promptOf(config, image) },
          { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.base64}` } },
        ],
      },
    ],
    max_tokens: 2048,
  })
}

export function buildRequest(config: VisionConfig, image: ImageInput): PreparedRequest {
  const base = trimBase(config.apiBase)
  const protocol = resolveProtocol(config)
  const json: Record<string, string> = { 'content-type': 'application/json' }
  if (config.apiKey) json.Authorization = `Bearer ${config.apiKey}`

  if (protocol === 'openai-chat') {
    return {
      url: `${base}/chat/completions`,
      method: 'POST',
      headers: json,
      body: openAiChatBody(config, image),
      extract: (body) => {
        const content = deepGet(body, ['choices', '0', 'message', 'content'])
        const text = textFrom(content)
        if (text === '') throw new VisionError('识图模型返回了空内容（检查模型名/协议是否匹配）')
        return text
      },
    }
  }

  if (protocol === 'openai-responses') {
    return {
      url: `${base}/responses`,
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        model: config.model,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: promptOf(config, image) },
              { type: 'input_image', image_url: `data:${image.mime};base64,${image.base64}` },
            ],
          },
        ],
      }),
      extract: (body) => {
        const output = deepGet(body, ['output'])
        const text = Array.isArray(output)
          ? output
              .map((item) => (item && typeof item === 'object' ? textFrom((item as Record<string, unknown>).content) : ''))
              .filter((line) => line !== '')
              .join('\n')
              .trim()
          : ''
        if (text === '') throw new VisionError('识图模型返回了空内容（检查模型名/协议是否匹配）')
        return text
      },
    }
  }

  if (protocol === 'anthropic') {
    const url = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`
    return {
      url,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        ...(config.apiKey ? { 'x-api-key': config.apiKey } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptOf(config, image) },
              { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.base64 } },
            ],
          },
        ],
      }),
      extract: (body) => {
        const text = textFrom(deepGet(body, ['content']))
        if (text === '') throw new VisionError('识图模型返回了空内容（检查模型名/协议是否匹配）')
        return text
      },
    }
  }

  if (protocol === 'gemini') {
    const root = base.endsWith('/v1beta') || base.endsWith('/v1') ? base : `${base}/v1beta`
    return {
      url: `${root}/models/${encodeURIComponent(config.model)}:generateContent`,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.apiKey ? { 'x-goog-api-key': config.apiKey } : {}),
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptOf(config, image) },
              { inline_data: { mime_type: image.mime, data: image.base64 } },
            ],
          },
        ],
      }),
      extract: (body) => {
        const text = textFrom(deepGet(body, ['candidates', '0', 'content', 'parts']))
        if (text === '') throw new VisionError('识图模型返回了空内容（检查模型名/协议是否匹配）')
        return text
      },
    }
  }

  // custom：模板 + 路径，交给用户自己适配长尾接口
  const template = config.requestTemplate.trim()
  if (template === '') throw new VisionError('自定义协议需要在设置页填写请求模板（requestTemplate）')
  const dataUrl = `data:${image.mime};base64,${image.base64}`
  const body = template
    .replaceAll('{{model}}', JSON.stringify(config.model))
    .replaceAll('{{prompt}}', JSON.stringify(promptOf(config, image)))
    .replaceAll('{{image}}', JSON.stringify(image.base64))
    .replaceAll('{{dataUrl}}', JSON.stringify(dataUrl))
    .replaceAll('{{mime}}', JSON.stringify(image.mime))
  const responsePath = config.responsePath.trim()
  if (responsePath === '') throw new VisionError('自定义协议需要在设置页填写响应路径（responsePath）')
  return {
    url: base,
    method: 'POST',
    headers: json,
    body,
    extract: (raw) => {
      const text = textFrom(deepGet(raw, splitPath(responsePath)))
      if (text === '') throw new VisionError(`响应里按 ${responsePath} 取不到文本（检查响应路径）`)
      return text
    },
  }
}
