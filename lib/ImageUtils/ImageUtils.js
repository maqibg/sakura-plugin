import axios from "axios"
import sharp from "sharp"

export async function downloadImage(imageUrl) {
  if (!imageUrl) {
    logger.warn(`未提供图片 URL.`)
    return false
  }
  logger.info(`下载图片: ${imageUrl}`)

  try {
    const imageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 60000,
    })

    return Buffer.from(imageResponse.data)
  } catch (error) {
    logger.error(
      `下载图片时出错: ${error.message}, 状态码: ${error.response ? error.response.status : "未知"}`,
    )
    return false
  }
}

export async function FlipImage(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") {
    logger.warn("翻转图片失败：未提供有效的图片URL。")
    return false
  }

  try {
    const imageBuffer = await downloadImage(imageUrl)
    if (!imageBuffer) {
      return false
    }
    const flippedImageBuffer = await sharp(imageBuffer).flip().toBuffer()
    return flippedImageBuffer
  } catch (error) {
    logger.error(`使用 sharp 翻转图片失败: ${error}`)
    return false
  }
}