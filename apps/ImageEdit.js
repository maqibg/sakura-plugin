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
    if (!e.group_id) return { ok: true }
    const whitelist = (this.task?.whitelist || []).map(String)
    const blacklist = (this.task?.blacklist || []).map(String)
    const groupId = String(e.group_id)
    if (blacklist.length > 0 && blacklist.includes(groupId)) {
      return { ok: false, reason: "本群已被禁止使用生图功能" }
    }
    if (whitelist.length > 0 && !whitelist.includes(groupId)) {
      return { ok: false, reason: "本群不在生图白名单中" }
    }
    return { ok: true }
  }

  async dispatchHandler(e) {
    if (!e.msg) return false

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
      if (/^#?生图/.test(e.msg)) {
        const access = this.checkAccess(e)
        if (!access.ok) {
          if (access.reason) this.reply(access.reason, true, { recallMsg: 10 })
          return true
        }
        if (!this.checkPermission(e)) {
          this.reply("你没有使用生图功能的权限", true, { recallMsg: 10 })
          return true
        }
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

  // #参数名（值） or #参数名(值) — supports Chinese & English parens
  parseArgs(msg) {
    const paramRe = /#(尺寸|质量|格式|审核)[（(]([^）)]+)[）)]/gi
    const params = {}
    let promptText = msg

    let m
    while ((m = paramRe.exec(msg)) !== null) {
      const key = m[1]
      const value = m[2].trim()
      switch (key) {
        case "尺寸": params.size = value; break
        case "质量": params.quality = value; break
        case "格式": params.outputFormat = value; break
        case "审核": params.moderation = value; break
      }
      promptText = promptText.replace(m[0], "")
    }

    return { ...params, promptText: promptText.trim() }
  }

  async editImageHandler(e) {
    const rawMsg = e.msg.replace(/^#?生图/, "").trim()
    const { size, quality, outputFormat, moderation, promptText } = this.parseArgs(rawMsg)
    const imageUrls = await getImg(e, true)

    if (!promptText) {
      await this.reply("请告诉我你想生成什么图片哦~", true, { recallMsg: 10 })
      return true
    }

    return this._processAndCallAPI(e, promptText, imageUrls, { size, quality, outputFormat, moderation })
  }

  async dynamicImageHandler(e, matchedTask, match) {
    const imageUrls = await getImg(e, true)
    if (!imageUrls || imageUrls.length === 0) return false

    const matchedStr = match[0]
    const remainingMsg = e.msg.slice(matchedStr.length).trim()
    const { size, quality, outputFormat, moderation, promptText: userPrompt } = this.parseArgs(remainingMsg)

    let finalPrompt = matchedTask.prompt || ""
    if (finalPrompt && match) {
      finalPrompt = finalPrompt.replace(/\$(\d+)/g, (_, index) => match[index] || "")
    }
    if (userPrompt) {
      finalPrompt = finalPrompt ? `${finalPrompt} ${userPrompt}` : userPrompt
    }

    return this._processAndCallAPI(e, finalPrompt, imageUrls, { size, quality, outputFormat, moderation })
  }

  _getChannels() {
    const config = this.task
    const rawChannel = config?.channel || "default"
    const names = rawChannel.split("|").map(s => s.trim()).filter(Boolean)
    const channelsConfig = Setting.getConfig("ImageChannels")
    const channelList = channelsConfig?.openai || []

    const results = []
    for (const name of names) {
      const ch = channelList.find(c => c.name === name)
      if (ch) {
        results.push({ ...config, ...ch })
      } else {
        logger.warn(`[ImageEdit] 渠道 "${name}" 未找到，已跳过`)
      }
    }

    if (results.length === 0) {
      const allNames = channelList.map(c => c.name).join(", ") || "(无)"
      throw new Error(`修图渠道均不可用，配置: ${rawChannel}，现有: ${allNames}`)
    }

    return results
  }

  async _processAndCallAPI(e, promptText, imageUrls, options = {}) {
    if (e.isGroup && typeof e.group?.setMsgEmojiLike === "function") {
      await e.group.setMsgEmojiLike(e.message_id, "124")
    } else {
      await this.reply("🎨 正在进行生成, 请稍候...", false, { recallMsg: 10 })
    }

    const channels = this._getChannels()
    const hasImage = imageUrls && imageUrls.length > 0
    let lastError = null

    for (let i = 0; i < channels.length; i++) {
      const imageConfig = channels[i]
      const chName = imageConfig.name || `渠道${i + 1}`

      if (i > 0) {
        logger.info(`[ImageEdit] 切换到渠道 "${chName}" (${i + 1}/${channels.length})`)
        await this.reply(`⏳ 主渠道不可用，正在尝试备用渠道 "${chName}"...`, true, { recallMsg: 10 })
      }

      try {
        const client = new OpenAIImageClient(imageConfig)
        const apiMode = imageConfig.apiMode || "images"
        const stream = imageConfig.stream !== false
        let results

        if (apiMode === "secondApi") {
          results = hasImage
            ? await client.editSimple(promptText, imageUrls, options)
            : await client.generateSimple(promptText, options)
        } else if (apiMode === "chat") {
          const chatResult = await client.generateWithChat(promptText, imageUrls, { ...options, stream })
          if (chatResult.stream) {
            const images = await this._processChatStream(e, chatResult)
            if (images.length > 0) {
              results = images
            } else {
              logger.info("[ImageEdit] 流式未返回图片，尝试非流式重试...")
              const retry = await client.generateWithChat(promptText, imageUrls, { ...options, stream: false })
              results = Array.isArray(retry) ? retry : []
            }
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
          return true
        }

        lastError = new Error(`渠道 "${chName}" 未返回有效内容`)
      } catch (err) {
        lastError = err
        logger.warn(`[ImageEdit] 渠道 "${chName}" 失败: ${err.message}`)
      }
    }

    const errMsg = lastError?.message || "所有渠道均失败"
    logger.error(`图片生成失败:`, lastError)
    await this.reply(`生成失败: ${errMsg}${channels.length > 1 ? ` (已尝试 ${channels.length} 个渠道)` : ""}`, true, { recallMsg: 10 })
    return true
  }
}