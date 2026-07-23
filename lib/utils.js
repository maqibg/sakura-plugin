import adapter from "./adapter.js"
import fs from "node:fs"
import YAML from "yaml"
import { _path } from "./path.js"
import sharp from "sharp"
import { IMAGE_CACHE_DIR } from "./ImageCache.js"

/**
 * 将图片 URL 转换为 base64 格式（自动将 GIF 转为 PNG）
 * @param {string} imageUrl - 图片 URL
 * @returns {Promise<object|null>} { base64, mimeType } 或 null
 */
export async function urlToBase64(imageUrl) {
  try {
    const response = await fetch(imageUrl)
    if (!response.ok) {
      logger.warn(`下载图片失败: ${response.status}`)
      return null
    }
    const arrayBuffer = await response.arrayBuffer()
    let buffer = Buffer.from(arrayBuffer)
    let mimeType = response.headers.get("content-type") || "image/jpeg"

    if (mimeType === "image/gif") {
      buffer = await sharp(buffer).toFormat("png").toBuffer()
      mimeType = "image/png"
    }

    const base64 = buffer.toString("base64")
    return { base64, mimeType }
  } catch (error) {
    logger.error(`转换图片为 base64 失败: ${error.message}`)
    return null
  }
}

export async function makeForwardMsg(e, messagesWithSender = [], dec = "") {
  if (!Array.isArray(messagesWithSender)) {
    messagesWithSender = [
      {
        text: String(messagesWithSender),
        senderId: e.user_id,
        senderName: e.sender?.card || e.sender?.nickname || e.user_id,
      },
    ]
  }

  const messages = []
  for (const item of messagesWithSender) {
    if (!item || !item.text) {
      continue
    }

    let currentSenderId = item.senderId
    let currentSenderName = item.senderName

    if (e.isGroup && currentSenderId) {
      try {
        let info

        try {
          info = await e.group.pickMember(currentSenderId).getInfo(true)
        } catch {
          info = (await e.group.pickMember(Number(currentSenderId))).info
        }

        currentSenderName = info?.card || info?.nickname || currentSenderId
      } catch (err) {
        logger.error(`获取群成员 ${currentSenderId} 信息失败:`, err)
      }
    }

    messages.push({
      user_id: currentSenderId,
      nickname: currentSenderName,
      message: item.text,
    })
  }

  if (adapter === 0) {
    let forwardMsg = messages.map(m => ({
      user_id: m.user_id,
      nickname: m.nickname,
      message: m.message,
    }))
    try {
      if (e?.group?.makeForwardMsg) {
        forwardMsg = await e.group.makeForwardMsg(forwardMsg)
      } else if (e?.friend?.makeForwardMsg) {
        forwardMsg = await e.friend.makeForwardMsg(forwardMsg)
      } else {
        return messages.map(m => m.message).join("\n")
      }

      if (dec) {
        if (typeof forwardMsg.data === "object") {
          let detail = forwardMsg.data?.meta?.detail
          if (detail) {
            detail.news = [{ text: dec }]
          }
        } else {
          forwardMsg.data = forwardMsg.data
            .replace(/\n/g, "")
            .replace(/<title color="#777777" size="26">(.+?)<\/title>/g, "___")
            .replace(/___+/, `<title color="#777777" size="26">${dec}</title>`)
        }
      }
      return await e.reply(forwardMsg)
    } catch (err) {}
  } else {
    const forwardData = {
      messages: messages,
      summary: "聊天记录",
      source: "喵",
      prompt: "可爱",
      news: [{ text: dec || "里面有你想要的" }],
    }

    try {
      if (e?.group?.sendForwardMsg) {
        return await e.group.sendForwardMsg(forwardData)
      } else if (e?.friend?.sendForwardMsg) {
        return await e.friend.sendForwardMsg(forwardData)
      }
    } catch (err) {
      logger.error("发送转发消息时出错:", err)
    }
  }
}

export async function getImg(e, getAvatar = false, toBase64 = false) {
  if (!e.message || !Array.isArray(e.message)) {
    return null
  }

  let imageUrls = []

  const directImageUrls = e.message
    .filter(segment => segment.type === "image" && segment.url)
    .map(segment => segment.url)

  if (directImageUrls.length > 0) {
    imageUrls = directImageUrls
  } else {
    const replySegment = e.message.find(segment => segment.type === "reply")
    if (adapter === 0 && e.source) {
      let reply
      let seq = e.isGroup ? e.source.seq : e.source.time

      if (e.isGroup) {
        reply = (await e.group.getChatHistory(seq, 1)).pop()?.message
      } else {
        reply = (await e.friend.getChatHistory(seq, 1)).pop()?.message
      }
      if (reply) {
        let i = []
        for (let val of reply) {
          if (val.type === "image") {
            i.push(val.url)
          }
        }
        if (i.length > 0) {
          imageUrls = i
        }
      }
    } else if (replySegment?.id) {
      const message_id = replySegment.id

      try {
        const sourceMessageData = e.isGroup
          ? await e.group.getMsg(message_id)
          : await e.friend.getMsg(message_id)

        const messageSegments = sourceMessageData?.message

        if (messageSegments && Array.isArray(messageSegments)) {
          const repliedImageUrls = messageSegments
            .filter(segment => segment.type === "image" && segment.url)
            .map(segment => segment.url)

          if (repliedImageUrls.length > 0) {
            imageUrls = repliedImageUrls
          }
        }
      } catch (error) {}
    }
  }

  if (imageUrls.length === 0 && getAvatar) {
    const atMsg = e.message.find(msg => msg.type === "at" && msg.qq && !isNaN(msg.qq))
    if (atMsg) {
      imageUrls = [`https://q1.qlogo.cn/g?b=qq&s=640&nk=${atMsg.qq}`]
    }
  }

  if (imageUrls.length === 0) {
    return null
  }

  e.img = imageUrls

  if (toBase64) {
    const base64Results = await Promise.all(
      imageUrls.map((url) => urlToBase64(url))
    )
    return base64Results.filter(Boolean)
  }

  return imageUrls
}

export function Recall(e, message_id, delay = 10) {
  if (!message_id) {
    return false
  }
  setTimeout(() => {
    const target = e.group_id ? e.bot.pickGroup(e.group_id) : e.bot.pickFriend(e.user_id)
    if (target) {
      target.recallMsg(message_id)
    }
  }, delay * 1000)
}

const otherConfigPath = `${_path}/config/config/other.yaml`

export function addBlackList(qq) {
  let config = {}
  try {
    if (fs.existsSync(otherConfigPath)) {
      const file = fs.readFileSync(otherConfigPath, "utf8")
      config = YAML.parse(file)
    }
  } catch (error) {
    logger.error(`[sakura-plugin] 读取配置文件失败: ${otherConfigPath}`, error)
    return false
  }

  if (!config.blackUser) {
    config.blackUser = []
  }

  qq = Number(qq)
  if (isNaN(qq)) return false

  if (!config.blackUser.includes(qq)) {
    config.blackUser.push(qq)
    try {
      fs.writeFileSync(otherConfigPath, YAML.stringify(config), "utf8")
      return true
    } catch (error) {
      logger.error(`[sakura-plugin] 写入配置文件失败: ${otherConfigPath}`, error)
      return false
    }
  }
  return true
}

export function removeBlackList(qq) {
  let config = {}
  try {
    if (fs.existsSync(otherConfigPath)) {
      const file = fs.readFileSync(otherConfigPath, "utf8")
      config = YAML.parse(file)
    }
  } catch (error) {
    logger.error(`[sakura-plugin] 读取配置文件失败: ${otherConfigPath}`, error)
    return false
  }

  if (!config.blackUser) {
    return true
  }

  qq = Number(qq)
  if (isNaN(qq)) return false

  if (config.blackUser.includes(qq)) {
    config.blackUser = config.blackUser.filter(item => item !== qq)
    try {
      fs.writeFileSync(otherConfigPath, YAML.stringify(config), "utf8")
      return true
    } catch (error) {
      logger.error(`[sakura-plugin] 写入配置文件失败: ${otherConfigPath}`, error)
      return false
    }
  }
  return true
}

export async function randomEmojiLike(e) {
  const emojiList = [
    { id: "424", name: "续标识" },
    { id: "66", name: "爱心" },
    { id: "318", name: "崇拜" },
    { id: "10024", name: "闪光" },
    { id: "319", name: "比心" },
    { id: "269", name: "暗中观察" },
    { id: "38", name: "敲打" },
    { id: "181", name: "戳一戳" },
    { id: "351", name: "敲打" },
    { id: "350", name: "贴贴" },
    { id: "21", name: "可爱" },
    { id: "34", name: "晕" },
    { id: "270", name: "emm" },
    { id: "352", name: "咦" },
    { id: "49", name: "拥抱" },
    { id: "128513", name: "😁 呲牙" },
    { id: "128514", name: "😂 激动" },
    { id: "128516", name: "😄 高兴" },
    { id: "128522", name: "😊 嘿嘿" },
    { id: "128524", name: "😌 羞涩" },
    { id: "128527", name: "😏 哼哼" },
    { id: "128530", name: "😒 不屑" },
    { id: "128531", name: "😓 汗" },
    { id: "128532", name: "😔 失落" },
    { id: "128536", name: "😘 飞吻" },
    { id: "128538", name: "😚 亲亲" },
    { id: "128540", name: "😜 淘气" },
    { id: "128541", name: "😝 吐舌" },
    { id: "128557", name: "😭 大哭" },
    { id: "128560", name: "😰 紧张" },
    { id: "128563", name: "😳 瞪眼" },
  ]

  const randomEmoji = emojiList[Math.floor(Math.random() * emojiList.length)]
  const emojiId = randomEmoji.id

  try {
    if (e.isGroup) {
      await e.group?.setMsgEmojiLike?.(e.message_id, emojiId)
    } else {
      logger.info(`表情回应仅支持群聊消息`)
    }
  } catch (err) {
    logger.error(`随机表情回应失败: ${err}`)
  }
}

const _tmpDir = IMAGE_CACHE_DIR

const DATA_URL_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
}

const IMAGE_FORMAT_EXTENSIONS = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
  gif: "gif",
}

const MAX_DOWNLOADED_IMAGE_BYTES = 50 * 1024 * 1024

async function readResponseBuffer(response, maxBytes) {
  const contentLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`生成图片文件过大，最大允许 ${Math.floor(maxBytes / 1024 / 1024)}MB`)
  }

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > maxBytes) throw new Error("生成图片文件超过大小限制")
    return buffer
  }

  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new Error(`生成图片文件过大，最大允许 ${Math.floor(maxBytes / 1024 / 1024)}MB`)
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks, total)
}

async function normalizeDownloadedImage(buffer) {
  try {
    const metadata = await sharp(buffer).metadata()
    const extension = IMAGE_FORMAT_EXTENSIONS[metadata.format]
    if (extension) return { buffer, extension }

    return { buffer: await sharp(buffer).png().toBuffer(), extension: "png" }
  } catch (err) {
    throw new Error(`下载内容不是有效图片: ${err.message}`)
  }
}

export async function bufferToFile(buffer, ext = "png") {
  if (!fs.existsSync(_tmpDir)) {
    fs.mkdirSync(_tmpDir, { recursive: true })
  }
  const fileName = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const filePath = `${_tmpDir}/${fileName}`
  fs.writeFileSync(filePath, buffer)
  return `file://${filePath}`
}

export async function dataUrlToFile(dataUrl) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(dataUrl)
  if (!match) throw new Error("图片 Data URL 格式无效，仅支持 Base64 编码")

  const mime = match[1].toLowerCase()
  const extension = DATA_URL_EXTENSIONS[mime]
  if (!extension) throw new Error(`不支持的图片 MIME 类型: ${mime}`)

  const buffer = Buffer.from(match[2], "base64")
  if (buffer.length === 0) throw new Error("图片 Data URL 不包含有效数据")
  return bufferToFile(buffer, extension)
}

export async function imageUrlToFile(imageUrl, options = {}) {
  let parsed
  try {
    parsed = new URL(imageUrl)
  } catch {
    throw new Error("生成图片 URL 格式无效")
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("生成图片 URL 仅支持 http:// 或 https://")
  }

  const timeoutMs = options.timeoutMs ?? 60000
  const maxBytes = options.maxBytes ?? MAX_DOWNLOADED_IMAGE_BYTES
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(parsed, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`下载生成图片失败: HTTP ${response.status} ${response.statusText}`)
    }

    const downloaded = await readResponseBuffer(response, maxBytes)
    const image = await normalizeDownloadedImage(downloaded)
    if (image.buffer.length > maxBytes) throw new Error("转换后的生成图片超过大小限制")
    return bufferToFile(image.buffer, image.extension)
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`下载生成图片超时 (${Math.round(timeoutMs / 1000)}秒)`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}
