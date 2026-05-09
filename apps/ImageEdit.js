import { OpenAIImageClient } from "../lib/AIUtils/OpenAIImageClient.js"
import { getImg } from "../lib/utils.js"
import Setting from "../lib/setting.js"
import cfg from "../../../lib/config/config.js"
import { PermissionManager } from "../lib/PermissionManager.js"

export class EditImage extends plugin {
  constructor() {
    super({
      name: "AI图像编辑",
      dsc: "使用gpt-image-2修改或生成图片",
      event: "message",
      priority: 1135,
      rule: [
        {
          reg: ".*",
          fnc: "dispatchHandler",
          log: false,
        },
      ],
    })
    this.task = Setting.getConfig("EditImage")
  }

  checkPermission(e) {
    if (!this.task?.requirePermission) return true

    const masterQQs = Array.isArray(cfg.masterQQ) ? cfg.masterQQ : [cfg.masterQQ]
    if (!e.group_id) return masterQQs.includes(e.sender.user_id)

    return PermissionManager.hasPermission(e.group_id, e.sender.user_id)
  }

  async dispatchHandler(e) {
    if (!e.msg) return false

    if (!this.checkPermission(e)) return false

    if (/^#生图/.test(e.msg)) {
      return this.editImageHandler(e)
    }

    const tasks = this.task?.tasks || (Array.isArray(this.task) ? this.task : [])
    if (tasks && Array.isArray(tasks)) {
      for (const task of tasks) {
        if (task.trigger) {
          try {
            const reg = new RegExp(task.trigger)
            const match = reg.exec(e.msg)
            if (match && match.index === 0) {
              return this.dynamicImageHandler(e, task, match)
            }
          } catch (error) {
            logger.error(`正则匹配出错: ${task.trigger}`, error)
          }
        }
      }
    }

    return false
  }

  parseArgs(msg) {
    let promptText = msg

    const validSizes = ["1024x1024", "1536x1024", "1024x1536", "auto"]
    const validQualities = ["auto", "low", "medium", "high"]
    const validFormats = ["png", "jpeg", "webp"]

    let size = null
    let quality = null
    let outputFormat = null
    let n = null

    for (const s of validSizes) {
      if (promptText.includes(s)) {
        size = s
        promptText = promptText.replace(s, "").trim()
        break
      }
    }

    for (const q of validQualities) {
      const re = new RegExp(`\\b${q}\\b`, "i")
      if (re.test(promptText)) {
        quality = q.toLowerCase()
        promptText = promptText.replace(re, "").trim()
        break
      }
    }

    for (const f of validFormats) {
      const re = new RegExp(`\\b${f}\\b`, "i")
      if (re.test(promptText)) {
        outputFormat = f.toLowerCase()
        promptText = promptText.replace(re, "").trim()
        break
      }
    }

    const nMatch = promptText.match(/\bx(\d{1,2})\b/i)
    if (nMatch) {
      n = Math.min(Math.max(parseInt(nMatch[1]), 1), 10)
      promptText = promptText.replace(nMatch[0], "").trim()
    }

    return { size, quality, outputFormat, n, promptText }
  }

  async dynamicImageHandler(e, matchedTask, match) {
    const imageUrls = await getImg(e, true)
    if (!imageUrls || imageUrls.length === 0) return false

    const matchedStr = match[0]
    const remainingMsg = e.msg.slice(matchedStr.length).trim()
    const { size, quality, outputFormat, n, promptText: userPrompt } = this.parseArgs(remainingMsg)

    let finalPrompt = matchedTask.prompt || ""
    if (finalPrompt && match) {
      finalPrompt = finalPrompt.replace(/\$(\d+)/g, (_, index) => match[index] || "")
    }
    if (userPrompt) {
      finalPrompt = finalPrompt ? `${finalPrompt} ${userPrompt}` : userPrompt
    }

    return this._processAndCallAPI(e, finalPrompt, imageUrls, { size, quality, outputFormat, n })
  }

  async editImageHandler(e) {
    const msg = e.msg.replace(/^#生图/, "").trim()
    const imageUrls = await getImg(e, true)
    const { size, quality, outputFormat, n, promptText } = this.parseArgs(msg)

    if (!promptText) {
      await this.reply("请告诉我你想如何修改图片哦~", true, { recallMsg: 10 })
      return true
    }

    return this._processAndCallAPI(e, promptText, imageUrls, { size, quality, outputFormat, n })
  }

  async _processAndCallAPI(e, promptText, imageUrls, options = {}) {
    if (e.isGroup && typeof e.group?.setMsgEmojiLike === "function") {
      await e.group.setMsgEmojiLike(e.message_id, "124")
    } else {
      await this.reply("🎨 正在进行创作, 请稍候...", false, { recallMsg: 10 })
    }

    const imageConfig = this.task
    if (!imageConfig || !imageConfig.api) {
      await this.reply("配置错误：未配置 EditImage 的 API Key", true, { recallMsg: 10 })
      return true
    }

    const hasImage = imageUrls && imageUrls.length > 0

    try {
      const client = new OpenAIImageClient(imageConfig)
      const apiMode = imageConfig.apiMode || "images"
      let results

      if (apiMode === "responses") {
        results = await client.generateWithResponses(promptText, imageUrls, options)
      } else if (hasImage) {
        results = await client.edit(promptText, imageUrls, options)
      } else {
        results = await client.generate(promptText, options)
      }

      if (results && results.length > 0) {
        for (const img of results) {
          if (img.base64) {
            await this.reply(segment.image(`base64://${img.base64}`))
          } else if (img.url) {
            await this.reply(segment.image(img.url))
          }
        }
      } else {
        await this.reply("生成失败，未返回有效图片", true, { recallMsg: 10 })
      }
    } catch (error) {
      logger.error(`图片生成失败:`, error)
      await this.reply(`创作失败: ${error.message}`, true, { recallMsg: 10 })
    }

    return true
  }
}