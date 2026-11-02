/**
 * 看图（`cmd.file_image` 的实现体）：分块、边界、拒收口径。
 *
 * 这些判据守的是三件在真机上会直接翻车的事：
 *   1. **首块不许失败**：手机第一次请求不带 offset，缺省必须是 0；
 *   2. **最后一块必须没有 `next`**：给了 next 手机就会再要一轮，空转到底；
 *   3. **非图片不许读**：这条命令只读扩展名白名单里的东西（它是唯一一道闸）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { IMAGE_CHUNK_BYTES, MAX_IMAGE_BYTES, readImageChunk } from '../src/core/file-image.js'

async function withTemp(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'dsh-img-'))
  try {
    await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('小图：一次读完，不带 next，名字只给 basename（不泄露主机目录）', async () => {
  await withTemp(async (dir) => {
    const file = path.join(dir, 'preview.png')
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5])
    await writeFile(file, bytes)

    const result = await readImageChunk(file, undefined)
    assert.equal(result.ok, true)
    assert.ok(result.ok)
    assert.equal(result.chunk.name, 'preview.png')
    assert.equal(result.chunk.mime, 'image/png')
    assert.equal(result.chunk.size, bytes.length)
    assert.equal(result.chunk.offset, 0)
    assert.equal(result.chunk.next, undefined, '最后一块不许带 next：带了手机就再要一轮')
    assert.deepEqual(Buffer.from(result.chunk.data, 'base64'), bytes)
  })
})

test('大图：按 IMAGE_CHUNK_BYTES 切片，逐块拼回去必须与原文逐字节相同', async () => {
  await withTemp(async (dir) => {
    const file = path.join(dir, 'big.jpg')
    const size = IMAGE_CHUNK_BYTES * 2 + 1234
    const bytes = Buffer.allocUnsafe(size)
    for (let i = 0; i < size; i += 1) bytes[i] = i % 251
    await writeFile(file, bytes)

    const collected: Buffer[] = []
    let offset: number | undefined
    let rounds = 0
    for (;;) {
      const result = await readImageChunk(file, offset)
      assert.equal(result.ok, true)
      assert.ok(result.ok)
      assert.equal(result.chunk.mime, 'image/jpeg')
      collected.push(Buffer.from(result.chunk.data, 'base64'))
      rounds += 1
      if (result.chunk.next === undefined) break
      offset = result.chunk.next
      assert.ok(rounds < 10, '分块数不对：next 算错了会无限循环')
    }
    assert.equal(rounds, 3, '2 整块 + 1 尾块')
    assert.deepEqual(Buffer.concat(collected), bytes)
  })
})

test('越界 offset 当收尾（回空块、不带 next），不报错', async () => {
  await withTemp(async (dir) => {
    const file = path.join(dir, 'a.webp')
    await writeFile(file, Buffer.from([1, 2, 3]))
    const result = await readImageChunk(file, 999)
    assert.equal(result.ok, true)
    assert.ok(result.ok)
    assert.equal(result.chunk.data, '')
    assert.equal(result.chunk.next, undefined)
  })
})

test('拒收口径：相对路径 / 白名单外扩展名 / 目录 / 空文件 / 不存在，都要给人话', async () => {
  await withTemp(async (dir) => {
    const text = path.join(dir, 'note.txt')
    await writeFile(text, 'hello')
    const empty = path.join(dir, 'empty.png')
    await writeFile(empty, '')
    const sub = path.join(dir, 'folder.png')
    await mkdir(sub)

    const cases: Array<[unknown, RegExp]> = [
      ['', /没有给图片路径/],
      ['preview.png', /绝对路径/],
      [text, /扩展名/],
      [sub, /不是文件/],
      [empty, /空的/],
      [path.join(dir, 'nope.png'), /找不到/],
    ]
    for (const [input, pattern] of cases) {
      const result = await readImageChunk(input, 0)
      assert.equal(result.ok, false, `这个输入本该被拒：${String(input)}`)
      assert.ok(!result.ok)
      assert.match(result.message, pattern)
    }
  })
})

test('上限就是 20MB（消息里的数字与常量必须一致，否则用户看到的是假上限）', () => {
  assert.equal(MAX_IMAGE_BYTES, 20 * 1024 * 1024)
  // 单块必须小到能塞进中继的 1MB 帧：256KB → base64 341KB → 密封 455KB。
  assert.equal(IMAGE_CHUNK_BYTES, 256 * 1024)
})
