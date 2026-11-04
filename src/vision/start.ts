/**
 * vision/start — 宿主侧接线：软探测 `webServer` 挂三条路由、provide 服务、可选注册工具/提示词段。
 *
 * 与 `pill/start.ts` 同一条纪律：
 * 1. **不写 `inject:` 闸门**：这一半挂不上，远控/人设一行都不受影响。
 * 2. `stop()` 幂等；注销抛错只吞不抛。
 * 3. 任何失败都写进 `probe` + 一行日志，不静默。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { registerVisionRoutes } from './routes.js'
import { createVisionService, type VisionService } from './service.js'

interface LooseContext {
  get?<T>(name: string, optional: true): T | undefined
  inject?(names: string[], callback: (scoped: unknown) => void): unknown
  provide?(name: string, value: unknown): unknown
}

interface Registerable {
  register(route: { kind: 'exact'; path: string; handler: (request: IncomingMessage, response: ServerResponse) => unknown }): () => void
}

export interface VisionHandle {
  stop(): void
  readonly probe: Record<string, string>
  readonly available: boolean
  readonly service: VisionService
}

/** 识图服务名：工具/别的插件软探测用。 */
export const VISION_SERVICE_NAME = 'dafeiyuVision'

/** 提示词段：告诉模型「有识图能力、图片描述会以文本出现」。 */
const GUIDANCE = [
  '## 识图能力（识图已开启）',
  '你可以调用 `recognize_image` 工具：给一张本地图片的绝对路径，它会把图片交给外挂视觉模型，返回文本描述（含逐字转录）。用户说「看看这张图 / 这个截图」并给出路径时用它。',
  '用户如果把图片直接贴进聊天，你会收到一条以「【图片识别】」开头的文本——那是别人替你看过的结果，直接基于它回答，**不要声称你看到了原图**。',
].join('\n')

export function startVision(
  ctx: LooseContext,
  deps: { dshHome: string; log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void },
): VisionHandle {
  const service = createVisionService(deps.dshHome)
  const probe: Record<string, string> = {}
  let web: Registerable | undefined
  let unregister: (() => void) | undefined
  let started = false
  let stopped = false

  const tryStart = (): void => {
    if (started || stopped || !web) return
    started = true
    try {
      unregister = registerVisionRoutes(web, { service, log: deps.log })
      probe.routes = 'registered'
    } catch (error) {
      probe.routes = `register threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
      started = false
      deps.log('识图路由注册失败（远控/人设不受影响）', { message: String((error as Error)?.message ?? error).slice(0, 200) })
      return
    }
    deps.log('识图路由已挂上')
  }

  const acceptWeb = (value: unknown, via: string): boolean => {
    if (!value || typeof value !== 'object') return false
    if (typeof (value as Registerable).register !== 'function') {
      probe.webServer = 'object without register()'
      return false
    }
    web = value as Registerable
    probe.webServer = via
    tryStart()
    return true
  }

  const pickFrom = (source: unknown): unknown => {
    if (!source || typeof source !== 'object') return undefined
    const asContext = source as { get?: (n: string, optional: true) => unknown }
    if (typeof asContext.get === 'function') {
      try {
        const got = asContext.get('webServer', true)
        if (got) return got
      } catch {
        /* 这个候选没有该服务 */
      }
    }
    try {
      return (source as Record<string, unknown>)['webServer']
    } catch {
      return undefined
    }
  }

  try {
    const found = ctx.get?.('webServer', true)
    if (found) acceptWeb(found, 'via get')
    else probe.webServer = 'none'
  } catch (error) {
    probe.webServer = `get threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
  }
  try {
    ctx.inject?.(['webServer'], ((...args: unknown[]) => {
      try {
        for (const candidate of [args[0], ...args, ctx]) {
          if (acceptWeb(pickFrom(candidate), 'via inject')) return
        }
        probe.webServer = `${probe.webServer ?? 'none'} (inject fired, empty)`
      } catch (error) {
        probe['injectThrew:webServer'] = String((error as Error)?.message ?? error).slice(0, 160)
      }
    }) as never)
  } catch (error) {
    probe['injectThrew:webServer'] = String((error as Error)?.message ?? error).slice(0, 160)
  }

  // provide：工具/别的插件能软探测到识图服务。
  try {
    ctx.provide?.(VISION_SERVICE_NAME, {
      get enabled(): boolean {
        return service.enabled()
      },
      recognize: (image: { base64: string; mime: string; prompt?: string }) => service.recognize(image),
      describe: () => service.describe(),
    })
    probe.provide = 'ok'
  } catch (error) {
    probe.provide = `threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
  }

  // 提示词段 + 工具：只在**启动时已开启**时注册（关着就别往提示词里塞东西）。
  // 设置页里改开/关，提示词段要重启才生效——设置页有这句说明；路由/工具调用侧永远实时读配置。
  if (service.enabled()) {
    try {
      const systemPrompt = ctx.get?.('systemPrompt', true) as { section?: (definition: { name: string; order: number; text: string }) => unknown } | undefined
      if (systemPrompt && typeof systemPrompt.section === 'function') {
        systemPrompt.section({ name: 'dafeiyu:vision', order: 10100, text: GUIDANCE })
        probe.section = 'registered'
      } else {
        probe.section = 'no-systemPrompt'
      }
    } catch (error) {
      probe.section = `threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
    }
    try {
      const tools = ctx.get?.('tools', true) as
        | { register?: (definition: Record<string, unknown>) => unknown }
        | undefined
      if (tools && typeof tools.register === 'function') {
        tools.register(recognizeImageTool(service))
        probe.tool = 'registered'
      } else {
        probe.tool = 'no-tools'
      }
    } catch (error) {
      probe.tool = `threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
    }
  } else {
    probe.section = 'disabled'
    probe.tool = 'disabled'
  }

  const stop = (): void => {
    if (stopped) return
    stopped = true
    const off = unregister
    unregister = undefined
    try {
      off?.()
    } catch {
      /* 宿主可能已经先一步把 webServer 拆了 */
    }
    if (started) deps.log('识图路由已停')
  }

  return {
    stop,
    probe,
    service,
    get available() {
      return !stopped && started && probe.routes === 'registered'
    },
  }
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
}

function mimeOf(file: string): string {
  const ext = String(file).split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'image/png'
}

/**
 * `recognize_image` 工具（手写 ToolDefinition，零外部依赖——与 dsh-vision 同一套写法）。
 * 工具在执行时**实时**读配置：设置页改了模型不用重启。
 */
function recognizeImageTool(service: VisionService): Record<string, unknown> {
  return {
    name: 'recognize_image',
    description: '把一张本地图片交给外挂视觉模型，返回图片内容的详细文本描述（含文字转录）。用于看截图、照片、图表、UI、报错截图等。',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: '图片文件的绝对路径' },
        prompt: { type: 'string', description: '可选：本次识图的具体指令，覆盖默认识图提示词' },
      },
      required: ['image_path'],
    },
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }],
    },
    timeoutMs: 120_000,
    async execute(args: { image_path?: unknown; prompt?: unknown }): Promise<string> {
      const file = typeof args.image_path === 'string' ? args.image_path : ''
      if (file === '') throw new Error('需要图片的绝对路径（image_path）')
      const { readFile } = await import('node:fs/promises')
      const data = await readFile(file)
      if (data.byteLength === 0) throw new Error(`图片文件是空的：${file}`)
      if (data.byteLength > 20 * 1024 * 1024) throw new Error(`图片太大（>20MB）：${file}`)
      return service.recognize({
        base64: data.toString('base64'),
        mime: mimeOf(file),
        prompt: typeof args.prompt === 'string' ? args.prompt : undefined,
      })
    },
  }
}
