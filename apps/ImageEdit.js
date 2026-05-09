import { OpenAIImageClient } from "../lib/AIUtils/OpenAIImageClient.js"
import { getImg, bufferToFile } from "../lib/utils.js"
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

  checkAccess(e) {
    if (!e.group_id) return true

    const whitelist = (this.task?.whitelist || []).map(String)
    const blacklist = (this.task?.blacklist || []).map(String)
    const groupId = String(e.group_id)

    if (blacklist.length > 0 && blacklist.includes(groupId)) {
      return false
    }

    if (whitelist.length > 0 && !whitelist.includes(groupId)) {
      return false
    }

    return true
  }

  async dispatchHandler(e) {
    if (!e.msg) return false

    if (!this.checkAccess(e)) return false
    if (!this.checkPermission(e)) return false

    const userLock = this.task?.userLock !== false
    const lockKey = userLock
      ? (e.isGroup
          ? `sakura:imageedit:lock:${e.group_id}:${e.user_id}`
          : `sakura:imageedit:lock:private:${e.user_id}`)
      : null

    if (lockKey) {
      if (await redis.get(lockKey)) {
        logger.info(`[ImageEdit] 用户 ${e.user_id} 的上一条生图仍在处理中，本次触发已忽略。`)
        return false
      }
      await redis.set(lockKey, "1", { EX: 120 })
    }

    try {
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
    } finally {
      if (lockKey) await redis.del(lockKey)
    }
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
      const stream = imageConfig.stream !== false
      let results

      if (apiMode === "chat") {
        const chatResult = await client.generateWithChat(promptText, imageUrls, { ...options, stream })

        if (chatResult.stream) {
          const images = await this._processChatStream(e, chatResult)
          if (images.length === 0) return true
          results = images
        } else {
          results = chatResult
        }
      } else if (apiMode === "responses") {
        results = await client.generateWithResponses(promptText, imageUrls, options)
      } else if (hasImage) {
        results = await client.edit(promptText, imageUrls, options)
      } else {
        results = await client.generate(promptText, options)
      }

      if (results && results.length > 0) {
        for (const img of results) {
          if (img.text) {
            await this.reply(img.text)
          } else if (img.dataUrl) {
            const b64 = img.dataUrl.split(",")[1]
            await this.reply(segment.image(await bufferToFile(Buffer.from(b64, "base64"))))
          } else if (img.url) {
            await this.reply(segment.image(img.url))
          }
        }
      } else {
        await this.reply("生成失败，未返回有效内容", true, { recallMsg: 10 })
      }
    } catch (error) {
      logger.error(`图片生成失败:`, error)
      await this.reply(`创作失败: ${error.message}`, true, { recallMsg: 10 })
    }

    return true
  }

  async _processChatStream(e, chatResult) {
    const { stream, controller } = chatResult
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    const images = []
    let textBuffer = ""
    let lastReplyTime = Date.now()

    const extractImages = (content) => {
      if (!Array.isArray(content)) return
      for (const part of content) {
        if (part.type === "image_url" && part.image_url?.url) {
          images.push({ url: part.image_url.url })
        } else if (part.type === "image" || part.type === "image_generation") {
          if (part.image_url?.url) images.push({ url: part.image_url.url })
          if (part.data) images.push({ dataUrl: part.data })
        } else if (part.inline_data?.data) {
          images.push({ dataUrl: `data:${part.inline_data.mime_type || "image/png"};base64,${part.inline_data.data}` })
        }
      }
    }

    const flushText = async () => {
      if (textBuffer.trim()) {
        await e.reply(textBuffer.trim(), true)
        textBuffer = ""
        lastReplyTime = Date.now()
      }
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const data = line.slice(6).trim()
          if (data === "[DONE]") continue

          try {
            const json = JSON.parse(data)
            const choice = json.choices?.[0]
            if (!choice) continue

            // Check final message first (some providers put image in final chunk)
            if (choice.message?.content) {
              extractImages(choice.message.content)
            }

            // Check delta
            const delta = choice.delta
            if (delta?.content) {
              if (Array.isArray(delta.content)) {
                extractImages(delta.content)
                const textPart = delta.content.find(p => p.type === "text")
                if (textPart?.text) textBuffer += textPart.text
              } else if (typeof delta.content === "string") {
                textBuffer += delta.content
              }
            }

            // Check for image in other delta fields (some providers)
            if (delta?.image) {
              if (delta.image.url) images.push({ url: delta.image.url })
              if (delta.image.data) images.push({ dataUrl: delta.image.data })
            }
          } catch {}
        }

        if (textBuffer && Date.now() - lastReplyTime > 2000) {
          await flushText()
        }
      }
    } finally {
      try { controller.abort() } catch {}
    }

    await flushText()

    return images
  }
}