import sharp from "sharp"

function parseApiError(res, body) {
  try {
    const err = JSON.parse(body)
    return err.error?.message || err.detail || err.message || body
  } catch {
    return body
  }
}

class ImageAPIError extends Error {
  constructor(message, status, endpoint) {
    const ctx = endpoint ? `[${endpoint}] ` : ""
    const code = status ? `HTTP ${status}: ` : ""
    super(`${ctx}${code}${message}`)
    this.name = "ImageAPIError"
    this.status = status
    this.endpoint = endpoint
  }
}

export class OpenAIImageClient {
  constructor(config) {
    this.apiKey = config.api
    this.baseURL = (config.baseURL || "https://api.openai.com/v1").replace(/\/+$/, "")
    this.model = config.model || "gpt-image-1"
    this.timeout = (config.timeout || 5) * 60000
    this.defaultSize = config.defaultSize || "1024x1024"
    this.defaultQuality = config.defaultQuality || "auto"
    this.defaultFormat = config.defaultFormat || "png"
    this.defaultModeration = config.defaultModeration || "auto"
  }

  async generate(prompt, options = {}) {
    const { size, quality, n, outputFormat, moderation } = this._normalize(options)
    const body = {
      model: this.model,
      prompt,
      size,
      quality,
      n,
      output_format: outputFormat,
      moderation,
    }

    const res = await this._fetch("images/generations", body)
    return this._extractImages(res)
  }

  async edit(prompt, imageUrls, options = {}) {
    const { size, quality, n, outputFormat, moderation } = this._normalize(options)
    const formData = new FormData()
    formData.append("model", this.model)
    formData.append("prompt", prompt)
    formData.append("size", size)
    formData.append("output_format", outputFormat)
    formData.append("moderation", moderation)
    if (quality) formData.append("quality", quality)
    if (n > 1) formData.append("n", String(n))

    for (let i = 0; i < imageUrls.length; i++) {
      const blob = await this._urlToBlob(imageUrls[i])
      formData.append("image[]", blob, `input-${i + 1}.png`)
    }

    const res = await this._fetchMultipart("images/edits", formData)
    return this._extractImages(res)
  }

  async generateSimple(prompt, options = {}) {
    const size = options.size || this.defaultSize
    const n = options.n || 1
    const body = { model: this.model, prompt, size, n }

    const res = await this._fetch("images/generations", body)
    return this._extractImages(res)
  }

  async editSimple(prompt, imageUrls, options = {}) {
    const n = options.n || 1
    const formData = new FormData()
    formData.append("model", this.model)
    formData.append("prompt", prompt)
    if (n > 1) formData.append("n", String(n))

    for (let i = 0; i < imageUrls.length; i++) {
      const blob = await this._urlToBlob(imageUrls[i])
      formData.append("image", blob, `input-${i + 1}.png`)
    }

    const res = await this._fetchMultipart("images/edits", formData)
    return this._extractImages(res)
  }

  async generateWithResponses(prompt, imageUrls = [], options = {}) {
    const { size, quality } = this._normalize(options)

    const tool = {
      type: "image_generation",
      action: imageUrls.length > 0 ? "edit" : "generate",
      size,
      output_format: "png",
    }
    if (quality) tool.quality = quality

    let input
    if (imageUrls.length > 0) {
      input = [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          ...imageUrls.map(url => ({ type: "input_image", image_url: url })),
        ],
      }]
    } else {
      input = prompt
    }

    const body = { model: this.model, input, tools: [tool], tool_choice: "required" }

    const res = await this._fetch("responses", body)
    return this._extractResponsesImages(res)
  }

  _normalize(opts) {
    return {
      size: opts.size || this.defaultSize,
      quality: opts.quality || this.defaultQuality,
      n: opts.n || 1,
      outputFormat: opts.outputFormat || this.defaultFormat,
      moderation: opts.moderation || this.defaultModeration,
    }
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

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new ImageAPIError(parseApiError(res, text), res.status, path)
      }

      return await res.json()
    } catch (err) {
      if (err.name === "ImageAPIError") throw err
      if (err.name === "AbortError") {
        const minutes = Math.round(this.timeout / 60000)
        throw new ImageAPIError(`请求超时 (${minutes}分钟)`, 408, path)
      }
      throw new ImageAPIError(`网络错误: ${err.message}`, 0, path)
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

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new ImageAPIError(parseApiError(res, text), res.status, path)
      }

      return await res.json()
    } catch (err) {
      if (err.name === "ImageAPIError") throw err
      if (err.name === "AbortError") {
        const minutes = Math.round(this.timeout / 60000)
        throw new ImageAPIError(`请求超时 (${minutes}分钟)`, 408, path)
      }
      throw new ImageAPIError(`网络错误: ${err.message}`, 0, path)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  _extractImages(payload) {
    const data = payload.data
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("接口未返回图片数据")
    }

    return data.map(item => {
      if (item.b64_json) return { dataUrl: `data:image/png;base64,${item.b64_json}` }
      if (item.url) return { url: item.url }
      return null
    }).filter(Boolean)
  }

  _extractResponsesImages(payload) {
    const output = payload.output
    if (!Array.isArray(output) || output.length === 0) {
      throw new Error("Responses API 未返回数据")
    }

    const images = []
    for (const item of output) {
      if (item.type !== "image_generation_call") continue
      if (typeof item.result === "string" && item.result.trim()) {
        images.push({ dataUrl: item.result })
      }
    }

    if (images.length === 0) {
      throw new Error("Responses API 未返回可用图片")
    }

    return images
  }

  async _urlToBlob(url) {
    if (url.startsWith("data:")) {
      const [header, data] = url.split(",")
      const mime = header.match(/data:([^;]+)/)?.[1] || "image/png"
      const buffer = Buffer.from(data, "base64")
      return new Blob([buffer], { type: mime })
    }

    const res = await fetch(url)
    if (!res.ok) throw new Error(`下载图片失败: ${res.statusText}`)
    let buffer = Buffer.from(await res.arrayBuffer())

    const contentType = res.headers.get("content-type") || "image/png"
    if (contentType.includes("gif")) {
      buffer = await sharp(buffer).png().toBuffer()
    }

    return new Blob([buffer], { type: "image/png" })
  }
}