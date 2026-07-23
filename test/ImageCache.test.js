import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { clearImageCache } from "../lib/ImageCache.js"

test("图片缓存清理只删除插件生成的临时图片", async t => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "sakura-image-cache-"))
  t.after(() => fs.rm(cacheDir, { recursive: true, force: true }))

  await fs.writeFile(path.join(cacheDir, "img_100_abc123.png"), Buffer.alloc(10))
  await fs.writeFile(path.join(cacheDir, "img_200_def456.jpg"), Buffer.alloc(20))
  await fs.writeFile(path.join(cacheDir, "keep.txt"), "不要删除")
  await fs.mkdir(path.join(cacheDir, "nested"))
  await fs.writeFile(path.join(cacheDir, "nested", "img_300_ghi789.webp"), Buffer.alloc(30))

  const result = await clearImageCache(cacheDir)

  assert.deepEqual(result, { deletedCount: 2, reclaimedBytes: 30 })
  assert.deepEqual((await fs.readdir(cacheDir)).sort(), ["keep.txt", "nested"])
  assert.deepEqual(await fs.readdir(path.join(cacheDir, "nested")), ["img_300_ghi789.webp"])
})

test("图片缓存目录不存在时返回空结果", async () => {
  const cacheDir = path.join(os.tmpdir(), `sakura-image-cache-missing-${Date.now()}`)
  assert.deepEqual(await clearImageCache(cacheDir), { deletedCount: 0, reclaimedBytes: 0 })
})
