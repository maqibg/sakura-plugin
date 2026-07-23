import fs from "node:fs/promises"
import path from "node:path"

import { plugindata } from "./path.js"

export const IMAGE_CACHE_DIR = path.join(plugindata, "tmp")

const IMAGE_CACHE_FILE_PATTERN = /^img_\d+_[a-z0-9]+\.(?:png|jpe?g|webp|gif)$/i

export async function clearImageCache(cacheDir = IMAGE_CACHE_DIR) {
  let entries
  try {
    entries = await fs.readdir(cacheDir, { withFileTypes: true })
  } catch (error) {
    if (error.code === "ENOENT") return { deletedCount: 0, reclaimedBytes: 0 }
    throw error
  }

  let deletedCount = 0
  let reclaimedBytes = 0

  for (const entry of entries) {
    if (!entry.isFile() || !IMAGE_CACHE_FILE_PATTERN.test(entry.name)) continue

    const filePath = path.join(cacheDir, entry.name)
    try {
      const stat = await fs.stat(filePath)
      await fs.unlink(filePath)
      deletedCount++
      reclaimedBytes += stat.size
    } catch (error) {
      // 文件可能在扫描后被其他清理任务删除，此时可视为已经清理。
      if (error.code !== "ENOENT") throw error
    }
  }

  return { deletedCount, reclaimedBytes }
}
