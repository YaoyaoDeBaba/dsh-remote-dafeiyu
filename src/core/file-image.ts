/**
 * 看图：把主机上一张图片的**一条分块**读出来（`cmd.file_image` 的实现体）。
 *
 * ## 为什么是分块
 *
 * 中继单帧硬上限 1MB，而帧在线上是 `JSON → secretbox → base64`（≈1.33 倍），
 * 也就是一帧里能装下的原图约 580KB。Unity 的静态预览图常见 1~3MB，
 * 一条命令回整张必然被中继掐断整条连接（WS 1009）—— 用户看到的是"点一下图，App 掉线"。
 *
 * 分块是唯一不往插件里塞图片编解码库（sharp 之类）就能解决的办法：
 * 手机从 offset=0 一直取到 `next` 为空，本地拼成 Blob 再显示。
 *
 * ## 口径
 *
 * - **只读**：这辈子不写、不删、不改名。
 * - **只认图片**：扩展名白名单之外一律拒（这是唯一一道闸，读完就原样发给手机）。
 * - **单文件 20MB 封顶**：再大就不是"看张效果图"了。
 * - 不解析像素、不校验内容：校验内容要解码，那正是本项目刻意不引入的东西。
 */
import { open, stat } from 'node:fs/promises'
import path from 'node:path'

/** 一条分块的原始字节数。256KB → base64 约 341KB → 密封帧约 455KB，离 1MB 上限还有一倍余量。 */
export const IMAGE_CHUNK_BYTES = 256 * 1024

/** 单文件上限。超过就不是"看一张效果图"了。 */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

/** 扩展名 → MIME。白名单本身就是这道闸：表外的扩展名一律不读。 */
export const IMAGE_MIME: Readonly<Record<string, string>> = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
})

/** 一条分块（就是 `ev.result.data` 的全部字段）。 */
export interface ImageChunk {
  /** 文件名（只给手机显示用，不回整条路径 —— 手机上不需要知道主机目录结构）。 */
  name: string
  mime: string
  /** 整个文件多少字节。 */
  size: number
  /** 这一块从第几字节开始。 */
  offset: number
  /** 下一块的 offset；没有下一块时**不出现**（不是 0、不是 -1）。 */
  next?: number
  /** 这一块的 base64（标准表、带 padding、无空白）。 */
  data: string
}

export type ImageChunkResult = { ok: true; chunk: ImageChunk } | { ok: false; message: string }

function fail(message: string): ImageChunkResult {
  return { ok: false, message }
}

/**
 * 读一块图片。`offset` 缺省/非法都当 0 处理（协议层已经卡过一次，这里是第二道）。
 *
 * 返回值里的 `message` 是**直接给用户看的中文**：手机把它原样 toast 出来，
 * 所以不写 errno、不写英文堆栈。
 */
export async function readImageChunk(rawPath: unknown, rawOffset: unknown): Promise<ImageChunkResult> {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    return fail('没有给图片路径')
  }
  const requested = rawPath.trim()
  if (requested.includes('\0')) return fail('路径里有非法字符')
  if (!path.isAbsolute(requested)) {
    return fail('要给绝对路径（例如 E:\\项目\\Preview.png），相对路径在这边无法确定基准目录')
  }
  const ext = path.extname(requested).toLowerCase()
  const mime = IMAGE_MIME[ext]
  if (mime === undefined) {
    return fail(`这个扩展名不支持看图（${ext === '' ? '没有扩展名' : ext}），只支持 png / jpg / jpeg / webp / gif / bmp`)
  }
  const offset = typeof rawOffset === 'number' && Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0

  let info
  try {
    info = await stat(requested)
  } catch (error) {
    const code = (error as { code?: string } | undefined)?.code
    if (code === 'ENOENT') return fail(`主机上找不到这个文件：${path.basename(requested)}`)
    if (code === 'EACCES' || code === 'EPERM') return fail(`没有权限读这个文件：${path.basename(requested)}`)
    return fail(`读不到这个文件：${path.basename(requested)}`)
  }
  if (!info.isFile()) return fail('这个路径不是文件（可能是目录）')
  if (info.size <= 0) return fail('这个文件是空的')
  if (info.size > MAX_IMAGE_BYTES) {
    return fail(`图片太大（${Math.round(info.size / 1024 / 1024)}MB，上限 ${MAX_IMAGE_BYTES / 1024 / 1024}MB），先压小一点`)
  }
  // 越界的 offset 不报错：那正是"手机已经把最后一块收完了"的正常收尾。
  if (offset >= info.size) {
    return { ok: true, chunk: { name: path.basename(requested), mime, size: info.size, offset, data: '' } }
  }

  const length = Math.min(IMAGE_CHUNK_BYTES, info.size - offset)
  const buffer = Buffer.allocUnsafe(length)
  let handle
  try {
    handle = await open(requested, 'r')
  } catch (error) {
    const code = (error as { code?: string } | undefined)?.code
    if (code === 'EACCES' || code === 'EPERM') return fail(`没有权限读这个文件：${path.basename(requested)}`)
    return fail(`打不开这个文件：${path.basename(requested)}`)
  }
  try {
    const { bytesRead } = await handle.read(buffer, 0, length, offset)
    if (bytesRead <= 0) return fail('读到 0 字节（文件可能正在被写入或已删除）')
    const next = offset + bytesRead < info.size ? offset + bytesRead : undefined
    return {
      ok: true,
      chunk: {
        name: path.basename(requested),
        mime,
        size: info.size,
        offset,
        ...(next === undefined ? {} : { next }),
        data: buffer.subarray(0, bytesRead).toString('base64'),
      },
    }
  } catch {
    return fail('读这个文件时出错了')
  } finally {
    await handle.close().catch(() => {})
  }
}
