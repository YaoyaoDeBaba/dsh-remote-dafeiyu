/**
 * sprite/png —— 最小 PNG 解码器，只服务于抠图质量分析。
 *
 * 为什么自己写：宿主侧不准引第三方图像库，而分析只关心「每个像素的 RGBA 是多少」，
 * 不需要走完整 PNG 规范。超出支持范围就明确报错，绝不猜着解——返回垃圾像素
 * 会让后面的 bbox / coverage 判据全部失真，比直接失败更难查。
 *
 * 支持：8-bit、颜色类型 6（RGBA）/ 2（RGB，补 alpha=255）、非隔行、filter 0~4。
 * 不支持：16-bit、调色板（颜色类型 3）、隔行（Adam7）。
 */
import { inflateSync } from 'node:zlib'

export interface DecodedPng {
  width: number
  height: number
  /** 行优先、每像素 4 字节（RGBA）。 */
  rgba: Uint8Array
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * 解压后体积上限：超过它多半是解压炸弹，或者根本不是能拿来分析的图。
 * 256MB 足够装下 8192×8192 的 RGBA。
 */
const MAX_RAW_BYTES = 256 * 1024 * 1024

/** PNG 的 Paeth 预测器（filter 4）。规则照规范写，不做任何近似。 */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/**
 * 解码 PNG。
 * @throws 格式不受支持 / 数据不完整 / 解压失败时抛错，错误信息说明「哪里不支持、下一步怎么办」。
 */
export function decodePng(png: Buffer): DecodedPng {
  if (png.length < 8 || !png.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('不是 PNG 文件：文件头签名不对')
  }

  let width = 0
  let height = 0
  let colorType = 0
  let sawHeader = false
  let sawEnd = false
  const idat: Buffer[] = []

  // 逐块扫描：只认 IHDR / IDAT / IEND，其余块（tEXt、gAMA 之类）对像素没有影响，跳过。
  let offset = 8
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('latin1', offset + 4, offset + 8)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > png.length) {
      throw new Error(`PNG 数据块 ${type} 越界：声明 ${length} 字节，文件里不够（文件被截断？）`)
    }
    const data = png.subarray(dataStart, dataEnd)

    if (type === 'IHDR') {
      if (length !== 13) throw new Error(`PNG 的 IHDR 长度应为 13，实际 ${length}`)
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const bitDepth = data[8]!
      colorType = data[9]!
      const compression = data[10]!
      const filterMethod = data[11]!
      const interlace = data[12]!

      // 宽高为 0 的图没有像素坐标，后面所有比例都除不了，直接拒绝。
      if (width === 0 || height === 0) throw new Error('PNG 宽或高为 0，不是有效图片')
      if (compression !== 0) throw new Error(`不支持 PNG 压缩方式 ${compression}（只支持 0=deflate）`)
      if (filterMethod !== 0) throw new Error(`不支持 PNG 过滤方式 ${filterMethod}（只支持 0）`)
      if (bitDepth !== 8) throw new Error(`不支持 ${bitDepth}-bit 的 PNG（只支持 8-bit，先用图像工具转成 8-bit）`)
      if (colorType !== 6 && colorType !== 2) {
        throw new Error(
          `不支持颜色类型 ${colorType} 的 PNG（只支持 6=RGBA / 2=RGB；调色板图请先转成 RGBA）`,
        )
      }
      if (interlace !== 0) {
        throw new Error(`不支持隔行（Adam7）PNG（隔行=${interlace}），请先转成非隔行再分析`)
      }
      sawHeader = true
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      sawEnd = true
      break
    }
    // 每个块后面固定 4 字节 CRC。这里不做 CRC 校验：解压长度与 filter 检查已经能挡住坏数据，
    // 而 CRC 需要自己查表算，对「分析抠图质量」没有额外价值。
    offset = dataEnd + 4
  }

  if (!sawHeader) throw new Error('PNG 缺少 IHDR 数据块：不是完整的 PNG')
  if (!sawEnd) throw new Error('PNG 缺少 IEND 数据块：文件不完整')
  if (idat.length === 0) throw new Error('PNG 缺少 IDAT 数据块：没有像素数据')

  const channels = colorType === 6 ? 4 : 3
  const stride = width * channels
  // 每条扫描行前面有 1 字节 filter 标记。
  const expected = height * (stride + 1)
  if (!Number.isSafeInteger(expected) || expected > MAX_RAW_BYTES) {
    throw new Error(`PNG 解压后数据过大（期望 ${expected} 字节），超过上限 ${MAX_RAW_BYTES} 字节`)
  }

  let raw: Buffer
  try {
    raw = inflateSync(Buffer.concat(idat))
  } catch (error) {
    throw new Error(`PNG 像素数据解压失败：${String((error as Error)?.message ?? error)}`)
  }
  if (raw.length !== expected) {
    throw new Error(`PNG 像素数据长度不对：期望 ${expected} 字节，实际 ${raw.length} 字节（位深或隔行声明与实际不符？）`)
  }

  const rgba = new Uint8Array(width * height * 4)
  let prev = new Uint8Array(stride) // 上一行「还原后」的字节，filter 2/3/4 都要用
  for (let y = 0; y < height; y++) {
    const lineStart = y * (stride + 1)
    const filter = raw[lineStart]!
    if (filter > 4) throw new Error(`不支持 PNG 行过滤类型 ${filter}（第 ${y} 行；合法值 0~4）`)

    const line = raw.subarray(lineStart + 1, lineStart + 1 + stride)
    const cur = new Uint8Array(stride)
    for (let i = 0; i < stride; i++) {
      const x = line[i]!
      const a = i >= channels ? cur[i - channels]! : 0 // 左邻（Sub / Average / Paeth）
      const b = prev[i]! // 上邻
      const c = i >= channels ? prev[i - channels]! : 0 // 左上邻
      let value: number
      switch (filter) {
        case 0: // None
          value = x
          break
        case 1: // Sub
          value = x + a
          break
        case 2: // Up
          value = x + b
          break
        case 3: // Average
          value = x + ((a + b) >> 1)
          break
        default: // Paeth（0~4 之外前面已拦掉）
          value = x + paeth(a, b, c)
          break
      }
      cur[i] = value & 0xff
    }

    // 统一摊平成 RGBA：RGB 图补 alpha=255，这样分析层不用关心颜色类型。
    const outBase = y * width * 4
    if (channels === 4) {
      rgba.set(cur, outBase)
    } else {
      for (let x = 0; x < width; x++) {
        const src = x * 3
        const dst = outBase + x * 4
        rgba[dst] = cur[src]!
        rgba[dst + 1] = cur[src + 1]!
        rgba[dst + 2] = cur[src + 2]!
        rgba[dst + 3] = 255
      }
    }
    prev = cur
  }

  return { width, height, rgba }
}
