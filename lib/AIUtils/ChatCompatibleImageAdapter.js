function parseApiError(body) {
  try {
    const err = JSON.parse(body)
    return err.error?.message || err.detail || err.message || body
  } catch {
    return body
  }
}

const UNSUPPORTED_OPTIONS = ["size", "quality", "outputFormat", "moderation", "n"]

export class ChatCompatibleImageAdapter {
  constructor(config) {
    if (config.chatProfile !== "content-parts") {
      throw new Error("chat-compatible 渠道必须配置 chatProfile: content-parts")
    }

    this.apiKey = config.api
    this.baseURL = (config.baseURL || "").replace(/\/+$/, "")
    this.model = config.model
    this.timeout = (config.timeout || 5) * 60000
  }

  async generate(prompt, imageUrls = [], options = {}) {
    const unsupported = UNSUPPORTED_OPTIONS.filter(key => options[key] !== undefined)
    if (unsupported.length > 0) {
      throw new Error(`chat-compatible 模式不支持参数: ${unsupported.join(", ")}`)
    }

    const content = [
      { type: "text", text: prompt },
      ...imageUrls.map(url => ({ type: "image_url", image_url: { url } })),
    ]
    const body = {
      model: this.model,
      messages: [{ role: "user", content }],
      modalities: ["text", "image"],
      stream: false,
    }

    const payload = await this._fetch(body)
    return this._extractImages(payload)
  }

  async _fetch(body) {
    const endpoint = "chat/completions"
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await fetch(`${this.baseURL}/${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(`[${endpoint}] HTTP ${res.status}: ${parseApiError(text)}`)
      }

      return await res.json()
    } catch (err) {
      if (err.name === "AbortError") {
        const minutes = Math.round(this.timeout / 60000)
        throw new Error(`[${endpoint}] 请求超时 (${minutes}分钟)`)
      }
      if (err.message?.startsWith(`[${endpoint}]`)) throw err
      throw new Error(`[${endpoint}] 网络错误: ${err.message}`)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  _extractImages(payload) {
    const images = []
    const choices = Array.isArray(payload?.choices) ? payload.choices : []

    for (const choice of choices) {
      const content = choice?.message?.content
      if (!Array.isArray(content)) continue

      for (const part of content) {
        if (!["image_url", "image", "image_generation"].includes(part?.type)) continue
        const value = this._extractPartValue(part)
        if (!value) continue

        if (/^https?:\/\//i.test(value)) {
          images.push({ url: value })
        } else if (/^data:image\//i.test(value)) {
          images.push({ dataUrl: value })
        } else {
          const mime = this._extractMime(part)
          images.push({ dataUrl: `data:${mime};base64,${value}` })
        }
      }
    }

    if (images.length === 0) {
      throw new Error("chat-compatible 返回格式不符合约定：未找到 choices[].message.content[] 图片分片")
    }

    return images
  }

  _extractPartValue(part) {
    const imageUrl = part.image_url
    if (typeof imageUrl === "string") return imageUrl.trim()
    if (typeof imageUrl?.url === "string") return imageUrl.url.trim()

    for (const value of [part.url, part.data, part.b64_json, part.result]) {
      if (typeof value === "string" && value.trim()) return value.trim()
    }
    return ""
  }

  _extractMime(part) {
    const mime = part.mime_type || part.mimeType || part.image_url?.mime_type
    return typeof mime === "string" && /^image\/[a-z0-9.+-]+$/i.test(mime)
      ? mime.toLowerCase()
      : "image/png"
  }
}
