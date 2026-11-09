/**
 * xyq.test — 小云雀模块：配置归一、鉴权过期提示、生成/轮询、预算拦截。
 *
 * 这一层不碰真 CLI：`run` 是注入的假执行器，按命令名返回预置 JSON。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createXyqService } from '../src/xyq/service.js'
import { normalizeXyqConfig, readXyqConfig, writeXyqConfig, viewXyqConfig } from '../src/xyq/config.js'

function tempConfigFile(): { file: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-xyq-'))
  return { file: path.join(dir, 'xyq.json'), cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

type Answer = { stdout?: string; stderr?: string; code?: number; timedOut?: boolean }

function serviceWith(answers: Record<string, Answer | Answer[]>, options: { config?: Record<string, unknown> } = {}) {
  const { file, cleanup } = tempConfigFile()
  writeFileSync(file, JSON.stringify({ accessKey: 'ak-test', ...(options.config ?? {}) }), 'utf8')
  const queues = new Map<string, Answer[]>()
  for (const [command, value] of Object.entries(answers)) queues.set(command, Array.isArray(value) ? [...value] : [value])
  const calls: string[][] = []
  const service = createXyqService({
    configFile: file,
    resolveCli: async () => 'cli',
    sleep: async () => undefined,
    pollIntervalMs: 0,
    videoTimeoutMs: 5_000,
    imageTimeoutMs: 5_000,
    log: () => {},
    run: async (args) => {
      calls.push(args)
      const queue = queues.get(args[1] ?? '')
      const answer = queue && queue.length > 0 ? queue.shift()! : { stderr: 'unexpected command' }
      return {
        code: answer.code ?? 0,
        stdout: answer.stdout ?? '',
        stderr: answer.stderr ?? '',
        timedOut: answer.timedOut ?? false,
      }
    },
  })
  return { service, calls, file, cleanup }
}

test('xyq config：默认值、夹取、密钥脱敏', () => {
  const normalized = normalizeXyqConfig({ idle: true, budget: { images: -5, videos: 999, maxVideoSeconds: 100 }, freedom: 'nope' })
  assert.equal(normalized.budget.images, 0, '负数夹到 0')
  assert.equal(normalized.budget.videos, 50, '超过上限夹到 50')
  assert.equal(normalized.budget.maxVideoSeconds, 30)
  assert.equal(normalized.freedom, 'explicit', '不认识的值回落 explicit')
  assert.equal(normalized.defaultVideoModel, 'Seedance_2.0_mini_lite')

  const view = viewXyqConfig({ ...normalized, accessKey: 'ak-1234567890' })
  assert.equal(view.accessKeySet, true)
  assert.equal(view.accessKeyHint, '…7890')
  assert.equal('accessKey' in view, false, '设置页回包绝不能带密钥原文')
})

test('xyq：没填 Access Key 时给出可照做的提示', async () => {
  const { file, cleanup } = tempConfigFile()
  writeFileSync(file, JSON.stringify({}), 'utf8')
  const service = createXyqService({
    configFile: file,
    resolveCli: async () => 'cli',
    sleep: async () => undefined,
    log: () => {},
    run: async () => ({ code: 0, stdout: '', stderr: '', timedOut: false }),
  })
  try {
    const result = await service.generateVideo({ prompt: '鲸鱼娘待机' })
    assert.equal(result.ok, false)
    assert.match(String(result.message), /Access Key/, '要指向设置 Access Key')
  } finally {
    cleanup()
  }
})

test('xyq：鉴权失败（Key 过期）明确提示去官网更新', async () => {
  const { service, cleanup } = serviceWith({
    'generate-video': { stderr: '未找到可用的小云雀登录凭证；请先运行 pippit-tool-cli login' },
  })
  try {
    const result = await service.generateVideo({ prompt: '鲸鱼娘待机' })
    assert.equal(result.ok, false)
    assert.match(String(result.message), /已过期或无效/)
    assert.match(String(result.message), /CLI\/API/)
  } finally {
    cleanup()
  }
})

test('xyq：视频生成提交→轮询→拿到本地文件，并消耗额度', async () => {
  const { service, calls, cleanup } = serviceWith(
    {
      'generate-video': { stdout: JSON.stringify({ thread_id: 't1', run_id: 'r1', web_thread_link: 'https://x' }) },
      'query-result': [
        { stdout: JSON.stringify({ status: 'running', completed: false }) },
        { stdout: JSON.stringify({ status: 'succeeded', completed: true, videos: [{ output_path: 'D:/out/a.mp4' }] }) },
      ],
    },
    { config: { budget: { images: 10, videos: 1, maxVideoSeconds: 10 } } },
  )
  try {
    const first = await service.generateVideo({ prompt: '鲸鱼娘待机', duration: 4, ratio: '1:1', images: ['D:/ref.png'], sessionKey: 's1' })
    assert.equal(first.ok, true)
    assert.deepEqual(first.files, ['D:/out/a.mp4'])
    const videoCall = calls.find((args) => args[1] === 'generate-video')!
    assert.ok(videoCall.includes('--duration') && videoCall.includes('4'))
    assert.ok(videoCall.includes('--image') && videoCall.includes('D:/ref.png'))
    assert.ok(videoCall.includes('--task-type') && videoCall.includes('reference'))

    const second = await service.generateVideo({ prompt: '再来一条', sessionKey: 's1' })
    assert.equal(second.ok, false, '单会话视频上限 1 条，第二条要被拦下')
    assert.match(String(second.message), /额度已用完/)
  } finally {
    cleanup()
  }
})

test('xyq：时长被设置上限截断；状态/余额/模型解析正确', async () => {
  const { service, calls, cleanup } = serviceWith(
    {
      status: { stdout: JSON.stringify({ logged_in: true, source: 'environment' }) },
      'get-credit-balance': { stdout: JSON.stringify({ total_remain_amount: '275' }) },
      model: { stdout: JSON.stringify({ models: [{ key: 'Seedance_2.0_mini_lite', name: 'Seedance 2.0 Mini 体验版' }] }) },
      'generate-video': { stdout: JSON.stringify({ thread_id: 't', run_id: 'r' }) },
      'query-result': { stdout: JSON.stringify({ status: 'succeeded', videos: [{ output_path: 'D:/out/b.mp4' }] }) },
    },
    { config: { budget: { images: 10, videos: 2, maxVideoSeconds: 8 } } },
  )
  try {
    const status = await service.status()
    assert.equal(status.ok, true)
    assert.equal(status.loggedIn, true)
    assert.equal((await service.balance()).totalRemain, '275')
    assert.equal((await service.models('video')).models?.[0]?.key, 'Seedance_2.0_mini_lite')

    await service.generateVideo({ prompt: 'x', duration: 30, sessionKey: 's2' })
    const call = calls.find((args) => args[1] === 'generate-video')!
    assert.equal(call[call.indexOf('--duration') + 1], '8', '时长必须被设置上限截断')
  } finally {
    cleanup()
  }
})
