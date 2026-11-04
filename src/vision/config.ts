/**
 * vision — 大肥鱼「看懂图」的宿主侧：外挂视觉模型配置与识图调用。
 *
 * 为什么不自己训练/内置图像能力：DeepSeek 文本模型没有视觉。这一层干的事和社区
 * `dsh-vision` 同一个思路——把图片交给一个**外挂视觉模型**（OpenAI 兼容 /
 * Responses / Anthropic / Gemini / 自定义），拿回文本描述，再让大肥鱼基于描述回答。
 *
 * 纪律：
 * 1. 配置只落自己的存储目录（`~/.dsh/storages/dsh-remote-dafeiyu/vision.json`），
 *    **不碰人设的 `dsh-persona-dafeiyu/`**（那是另一条兼容边界）。
 * 2. API Key 永不回显（`redactKey`），设置页只显示末尾几位。
 * 3. 识图请求在宿主（Node）侧发起：不受浏览器 CORS 限制，也不把 key 发给页面。
 * 4. 任何失败都收敛成带说明的错误，绝不静默吞掉——「识图不上」必须有可查的原因。
 */

/** 协议。`auto` 按 apiBase 猜，猜错时用户可在设置页手动指定。 */
export type VisionProtocol = 'auto' | 'openai-chat' | 'openai-responses' | 'anthropic' | 'gemini' | 'custom'

export interface VisionConfig {
  /** 总开关。关掉时：不注册工具、不注入提示词段、路由只读配置。 */
  enabled: boolean
  /** 识图模型的基础地址（打到 /v1 这一步，具体路径由协议决定）。 */
  apiBase: string
  apiKey: string
  model: string
  protocol: VisionProtocol
  /** 识图提示词（skill）：告诉视觉模型「怎么描述这张图」。 */
  prompt: string
  timeoutMs: number
  /** 仅 `custom`：请求体 JSON 模板（`{{model}}` `{{prompt}}` `{{image}}` `{{dataUrl}}` `{{mime}}`）。 */
  requestTemplate: string
  /** 仅 `custom`：从响应 JSON 取文本的点号路径，如 `choices.0.message.content`。 */
  responsePath: string
}

export const DEFAULT_VISION_PROMPT =
  '你是一名专业的图像识别助手。请仔细观察用户提供的图片，用中文给出详细、结构化的描述：' +
  '① 整体是什么（截图/照片/图表/UI 界面等）；② 关键内容与布局；' +
  '③ 图中所有可见文字逐字转录（代码、报错、按钮文案都不要漏）；' +
  '④ 如果这是屏幕截图，重点描述界面上的报错、弹窗、按钮状态。'

export const DEFAULT_VISION_CONFIG: VisionConfig = {
  enabled: false,
  apiBase: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  protocol: 'auto',
  prompt: DEFAULT_VISION_PROMPT,
  timeoutMs: 60_000,
  requestTemplate: '',
  responsePath: '',
}

/** 设置页看到的配置：key 打码。 */
export interface VisionConfigView extends Omit<VisionConfig, 'apiKey'> {
  apiKeySet: boolean
  apiKeyHint: string
}

/** 只留末尾四位：`sk-…abcd`。空串原样。 */
export function redactKey(key: string): string {
  const value = String(key ?? '')
  if (value === '') return ''
  if (value.length <= 8) return '********'
  return `${value.slice(0, 3)}…${value.slice(-4)}`
}

export function toView(config: VisionConfig): VisionConfigView {
  return {
    enabled: config.enabled,
    apiBase: config.apiBase,
    model: config.model,
    protocol: config.protocol,
    prompt: config.prompt,
    timeoutMs: config.timeoutMs,
    requestTemplate: config.requestTemplate,
    responsePath: config.responsePath,
    apiKeySet: config.apiKey !== '',
    apiKeyHint: redactKey(config.apiKey),
  }
}

const PROTOCOLS: readonly VisionProtocol[] = ['auto', 'openai-chat', 'openai-responses', 'anthropic', 'gemini', 'custom']

function cleanString(value: unknown, fallback: string, max: number): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

/** 把设置页/配置文件来的脏对象规整成合法配置。**不抛**：坏值各自回落默认。 */
export function normalizeVisionConfig(input: unknown, base: VisionConfig = DEFAULT_VISION_CONFIG): VisionConfig {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const protocol = typeof raw.protocol === 'string' && (PROTOCOLS as readonly string[]).includes(raw.protocol)
    ? (raw.protocol as VisionProtocol)
    : base.protocol
  const timeout = typeof raw.timeoutMs === 'number' && Number.isFinite(raw.timeoutMs)
    ? Math.min(Math.max(Math.round(raw.timeoutMs), 5_000), 300_000)
    : base.timeoutMs
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled,
    apiBase: cleanString(raw.apiBase, base.apiBase, 500) || base.apiBase,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey.trim().slice(0, 500) : base.apiKey,
    model: cleanString(raw.model, base.model, 200) || base.model,
    protocol,
    prompt: cleanString(raw.prompt, base.prompt, 4_000) || base.prompt,
    timeoutMs: timeout,
    requestTemplate: cleanString(raw.requestTemplate, base.requestTemplate, 8_000),
    responsePath: cleanString(raw.responsePath, base.responsePath, 200),
  }
}

// ── 按 apiBase 猜协议（与 dsh-vision 同一套判据）──────────────────────
export function detectProtocol(apiBase: string): Exclude<VisionProtocol, 'auto' | 'custom'> {
  const lower = String(apiBase ?? '').toLowerCase()
  if (lower.includes('anthropic')) return 'anthropic'
  if (lower.includes('generativelanguage') || lower.includes('googleapis') || lower.includes('gemini')) return 'gemini'
  if (lower.includes('/responses')) return 'openai-responses'
  return 'openai-chat'
}

export function resolveProtocol(config: VisionConfig): Exclude<VisionProtocol, 'auto'> {
  return config.protocol === 'auto' ? detectProtocol(config.apiBase) : config.protocol
}
