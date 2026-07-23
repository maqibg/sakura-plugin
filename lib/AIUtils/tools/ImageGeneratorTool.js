import { OpenAIImageClient } from "../OpenAIImageClient.js"
import { AbstractTool } from "./AbstractTool.js"
import Setting from "../../setting.js"
import { dataUrlToFile, imageUrlToFile } from "../../utils.js"

export class ImageGeneratorTool extends AbstractTool {
  name = "ImageGenerator"

  parameters = {
    properties: {
      prompt: {
        type: "string",
        description: "用于生成或修改图片的英文描述性文字，请将描述性文字翻译为英文",
      },
      seq: {
        type: "array",
        items: { type: "integer" },
        description: "图片或动画表情的消息seq",
      },
      size: {
        type: "string",
        description: "图片尺寸，可选值: 1024x1024, 1536x1024, 1024x1536, auto",
        enum: ["1024x1024", "1536x1024", "1024x1536", "auto"],
      },
    },
    required: ["prompt"],
  }

  description = "当你需要根据描述生成图片或者在提供一张图片的基础上生成新的内容时使用"

  func = async function (opts, e) {
    let { prompt, seq, size } = opts
    size = size || "1024x1024"
    let imageUrls = []

    if (seq) {
      const seqList = Array.isArray(seq) ? seq : [seq]
      for (const s of seqList) {
        try {
          const history = await e.group.getChatHistory(s, 1)
          if (history && history.length > 0) {
            const targetMsg = history[0]
            let hasImage = false
            for (const msgPart of targetMsg.message) {
              if (msgPart.type === "image") {
                imageUrls.push(msgPart.url)
                hasImage = true
              }
            }
            if (hasImage && e.isGroup && typeof e.group?.setMsgEmojiLike === "function") {
              await e.group.setMsgEmojiLike(targetMsg.message_id, "128076")
            }
          }
        } catch (err) {
          logger.error(`获取消息 seq: ${s} 失败: ${err}`)
        }
      }
    }

    if (!prompt) {
      return "你必须提供一个用于生成图片的描述。"
    }

    try {
      const imageConfig = Setting.getConfig("EditImage")

      if (!imageConfig || !imageConfig.api) {
        throw new Error("配置错误：未在 'EditImage' 配置中找到有效的 API Key。")
      }

      const client = new OpenAIImageClient(imageConfig)
      let results

      if (imageUrls.length > 0) {
        results = await client.edit(prompt, imageUrls, { size })
      } else {
        results = await client.generate(prompt, { size })
      }

      if (results && results.length > 0) {
        const img = results[0]
        if (img.dataUrl) {
          await e.reply(segment.image(await dataUrlToFile(img.dataUrl)))
        } else if (img.url) {
          const timeoutMs = (imageConfig.timeout || 5) * 60000
          await e.reply(segment.image(await imageUrlToFile(img.url, { timeoutMs })))
        }
        return `已成功生成并发送图片，禁止回复[图片]`
      } else {
        return "图片生成失败，未返回有效数据。"
      }
    } catch (error) {
      logger.error("图片生成失败:", error)
      if (imageUrls.length > 0 && error.message?.includes("Could not load image")) {
        return `图片生成失败，可能是由于提供的图片无法访问或格式不受支持。错误信息: ${error.message}`
      }
      return `图片生成失败，错误信息: ${error.message}`
    }
  }
}
