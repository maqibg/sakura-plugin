import sharp from "sharp"

const OUTPUT_MIME_TYPES = {
  png: "image/png",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  webp: "image/webp",
}

const INPUT_IMAGE_TYPES = {
  png: { mime: "image/png", extension: "png" },
  jpeg: { mime: "image/jpeg", extension: "jpg" },
  jpg: { mime: "image/jpeg", extension: "jpg" },
  webp: { mime: "image/webp", extension: "webp" },
}

const ALLOWED_IMAGE_OPTIONS = {
  size: ["auto", "1024x1024", "1536x1024", "1024x1536"],
  quality: ["auto", "low", "medium", "high"],
  outputFormat: ["png", "jpeg", "jpg", "webp"],
  moderation: ["auto", "low"],
}

const API_ENDPOINT_SUFFIXES = ["/chat/completions", "/images/generations", "/images/edits", "/responses"]

function parseApiError(body) {
  try {
    const err = JSON.parse(body)
    return err.error?.message || err.detail || err.message || body
  } catch {
    return body
  }
}

class ImageAPIError extends Error {
  constructor(message, status, endpoint, code) {
    const ctx = endpoint ? `[${endpoint}] ` : ""
    const http = status >= 400 ? `HTTP ${status}: ` : ""
    super(`${ctx}${http}${message}`)
    this.name = "ImageAPIError"
    this.status = status
    this.endpoint = endpoint
    this.code = code
  }
}

function normalizeBaseURL(value) {
  const raw = String(value || "https://api.openai.com/v1").trim().replace(/\/+$/, "")
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(`修图渠道 baseURL 无效: ${raw || "(空)"}`)
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("修图渠道 baseURL 仅支持 http:// 或 https://")
  }
  if (parsed.search || parsed.hash) {
    throw new Error("修图渠道 baseURL 不能包含查询参数或 # 片段")
  }

  const pathname = parsed.pathname.replace(/\/+$/, "").toLowerCase()
  const endpoint = API_ENDPOINT_SUFFIXES.find(suffix => pathname.endsWith(suffix))
  if (endpoint) {
    throw new Error(`修图渠道 baseURL 应填写 API 根地址，不能包含 ${endpoint}`)
  }
  return raw
}

export class OpenAIImageClient {
  constructor(config) {
    this.apiKey = config.api
    this.baseURL = normalizeBaseURL(config.baseURL)
    this.model = config.model || "gpt-image-1"
    this.timeout = (config.timeout || 5) * 60000
    this.defaultSize = config.defaultSize || "1024x1024"
    this.defaultQuality = config.defaultQuality || "auto"
    this.defaultFormat = config.defaultFormat || "png"
    this.defaultModeration = config.defaultModeration || "auto"
  }

  async generate(prompt, options = {}) {
    const { size, quality, n, outputFormat, moderation, sendOutputFormat } = this._normalize(options)
    const body = {
      model: this.model,
      prompt,
      n,
    }
    if (size !== "auto") body.size = size
    if (quality !== "auto") body.quality = quality
    if (sendOutputFormat) body.output_format = outputFormat
    if (moderation !== "auto") body.moderation = moderation

    const res = await this._fetch("images/generations", body)
    return this._extractImages(res, outputFormat, "images/generations")
  }

  async edit(prompt, imageUrls, options = {}) {
    const { size, quality, n, outputFormat, moderation, sendOutputFormat } = this._normalize(options)
    const formData = new FormData()
    formData.append("model", this.model)
    formData.append("prompt", prompt)
    if (size !== "auto") formData.append("size", size)
    if (quality !== "auto") formData.append("quality", quality)
    if (sendOutputFormat) formData.append("output_format", outputFormat)
    if (moderation !== "auto") formData.append("moderation", moderation)
    if (n > 1) formData.append("n", String(n))

    for (let i = 0; i < imageUrls.length; i++) {
      const blob = await this._urlToBlob(imageUrls[i])
      const extension = this._getInputExtension(blob.type)
      formData.append("image[]", blob, `input-${i + 1}.${extension}`)
    }

    const res = await this._fetchMultipart("images/edits", formData)
    return this._extractImages(res, outputFormat, "images/edits")
  }

  async generateSimple(prompt, options = {}) {
    const size = options.size || this.defaultSize
    const n = this._validateCount(options.n ?? 1)
    const body = { model: this.model, prompt, size, n }

    const res = await this._fetch("images/generations", body)
    return this._extractImages(res, "png", "images/generations")
  }

  async editSimple(prompt, imageUrls, options = {}) {
    const n = this._validateCount(options.n ?? 1)
    const formData = new FormData()
    formData.append("model", this.model)
    formData.append("prompt", prompt)
    if (n > 1) formData.append("n", String(n))

    for (let i = 0; i < imageUrls.length; i++) {
      const blob = await this._urlToBlob(imageUrls[i])
      const extension = this._getInputExtension(blob.type)
      formData.append("image", blob, `input-${i + 1}.${extension}`)
    }

    const res = await this._fetchMultipart("images/edits", formData)
    return this._extractImages(res, "png", "images/edits")
  }

  _normalize(opts) {
    const size = String(opts.size ?? this.defaultSize).trim().toLowerCase()
    const quality = String(opts.quality ?? this.defaultQuality).trim().toLowerCase()
    const rawOutputFormat = String(opts.outputFormat ?? this.defaultFormat).trim().toLowerCase()
    const outputFormat = rawOutputFormat === "jpg" ? "jpeg" : rawOutputFormat
    const moderation = String(opts.moderation ?? this.defaultModeration).trim().toLowerCase()
    const n = this._validateCount(opts.n ?? 1)

    this._validateEnum("尺寸", size, ALLOWED_IMAGE_OPTIONS.size)
    this._validateEnum("质量", quality, ALLOWED_IMAGE_OPTIONS.quality)
    this._validateEnum("格式", rawOutputFormat, ALLOWED_IMAGE_OPTIONS.outputFormat)
    this._validateEnum("审核", moderation, ALLOWED_IMAGE_OPTIONS.moderation)
    return {
      size,
      quality,
      n,
      outputFormat,
      moderation,
      sendOutputFormat: opts.outputFormat != null || outputFormat !== "png",
    }
  }

  _validateEnum(label, value, allowed) {
    if (!allowed.includes(value)) {
      throw new Error(`不支持的图片${label}: ${value || "(空)"}，可选值: ${allowed.join(", ")}`)
    }
  }

  _validateCount(value) {
    if (!Number.isInteger(value) || value < 1 || value > 10) {
      throw new Error("图片数量必须是 1-10 的整数")
    }
    return value
  }

  async _fetch(path, body) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await fetch(`${this.baseURL}/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      return await this._parseJsonResponse(res, path)
    } catch (err) {
      if (err instanceof ImageAPIError) throw err
      if (err.name === "AbortError") {
        const minutes = Math.round(this.timeout / 60000)
        throw new ImageAPIError(`请求超时 (${minutes}分钟)`, 408, path, "TIMEOUT")
      }
      const message = err instanceof Error ? err.message : String(err)
      throw new ImageAPIError(`网络错误: ${message}`, 0, path, "NETWORK_ERROR")
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async _fetchMultipart(path, formData) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await fetch(`${this.baseURL}/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: formData,
        signal: controller.signal,
      })

      return await this._parseJsonResponse(res, path)
    } catch (err) {
      if (err instanceof ImageAPIError) throw err
      if (err.name === "AbortError") {
        const minutes = Math.round(this.timeout / 60000)
        throw new ImageAPIError(`请求超时 (${minutes}分钟)`, 408, path, "TIMEOUT")
      }
      const message = err instanceof Error ? err.message : String(err)
      throw new ImageAPIError(`网络错误: ${message}`, 0, path, "NETWORK_ERROR")
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async _parseJsonResponse(res, path) {
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      const message = parseApiError(text) || res.statusText || "请求失败"
      throw new ImageAPIError(message, res.status, path, "HTTP_ERROR")
    }

    try {
      return await res.json()
    } catch (err) {
      throw new ImageAPIError(`接口返回了无效 JSON: ${err.message}`, res.status, path, "INVALID_JSON")
    }
  }

  _extractImages(payload, outputFormat = "png", endpoint = "images/generations") {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.data)) {
      throw new ImageAPIError("返回格式无效：data 必须是数组", 0, endpoint, "INVALID_RESPONSE")
    }
    if (payload.data.length === 0) {
      throw new ImageAPIError("返回的 data 为空", 0, endpoint, "INVALID_RESPONSE")
    }

    const mime = OUTPUT_MIME_TYPES[String(outputFormat).toLowerCase()] || "image/png"
    const images = payload.data.map(item => {
      if (typeof item?.b64_json === "string" && item.b64_json.trim()) {
        return { dataUrl: `data:${mime};base64,${item.b64_json.trim()}` }
      }
      if (typeof item?.url === "string" && item.url.trim()) {
        const url = item.url.trim()
        return /^data:image\//i.test(url) ? { dataUrl: url } : { url }
      }
      return null
    }).filter(Boolean)

    if (images.length === 0) {
      throw new ImageAPIError("返回了 data，但其中没有有效的 b64_json 或 url", 0, endpoint, "INVALID_RESPONSE")
    }
    return images
  }

  async _urlToBlob(url) {
    if (url.startsWith("data:")) {
      const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(url)
      if (!match) throw new Error("图片 Data URL 格式无效，仅支持 Base64 编码")
      return this._toSupportedImageBlob(Buffer.from(match[2], "base64"))
    }

    const res = await fetch(url)
    if (!res.ok) throw new Error(`下载图片失败: ${res.statusText}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    return this._toSupportedImageBlob(buffer)
  }

  async _toSupportedImageBlob(buffer) {
    try {
      const metadata = await sharp(buffer).metadata()
      const imageType = INPUT_IMAGE_TYPES[metadata.format]
      if (imageType) {
        return new Blob([buffer], { type: imageType.mime })
      }

      const pngBuffer = await sharp(buffer).png().toBuffer()
      return new Blob([pngBuffer], { type: "image/png" })
    } catch (err) {
      throw new Error(`图片格式不受支持或内容已损坏: ${err.message}`)
    }
  }

  _getInputExtension(mime) {
    return Object.values(INPUT_IMAGE_TYPES).find(item => item.mime === mime)?.extension || "png"
  }
}
