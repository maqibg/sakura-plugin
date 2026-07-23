import assert from "node:assert/strict"
import test from "node:test"

import sharp from "sharp"

import { OpenAIImageClient } from "../lib/AIUtils/OpenAIImageClient.js"

function createClient() {
  return new OpenAIImageClient({
    api: "test-key",
    baseURL: "https://api.example/v1",
    model: "image-model",
  })
}

test("Images 默认请求省略 auto 和默认 PNG 字段", async () => {
  const client = createClient()
  let requestBody
  client._fetch = async (path, body) => {
    assert.equal(path, "images/generations")
    requestBody = body
    return { data: [{ b64_json: "AQID" }] }
  }

  await client.generate("draw")
  assert.deepEqual(requestBody, {
    model: "image-model",
    prompt: "draw",
    n: 1,
    size: "1024x1024",
  })
})

test("Images 只发送显式非默认参数并把 jpg 规范为 jpeg", async () => {
  const client = createClient()
  let requestBody
  client._fetch = async (_path, body) => {
    requestBody = body
    return { data: [{ b64_json: "AQID" }] }
  }

  const result = await client.generate("draw", {
    size: "auto",
    quality: "high",
    outputFormat: "jpg",
    moderation: "low",
    n: 2,
  })

  assert.deepEqual(requestBody, {
    model: "image-model",
    prompt: "draw",
    n: 2,
    quality: "high",
    output_format: "jpeg",
    moderation: "low",
  })
  assert.deepEqual(result, [{ dataUrl: "data:image/jpeg;base64,AQID" }])
})

test("Images 在请求前拒绝无效参数", async () => {
  const cases = [
    [{ size: "114x514" }, /不支持的图片尺寸/],
    [{ quality: "very-good" }, /不支持的图片质量/],
    [{ outputFormat: "jpeg2000" }, /不支持的图片格式/],
    [{ moderation: "off" }, /不支持的图片审核/],
    [{ n: 0 }, /图片数量必须是 1-10 的整数/],
    [{ n: 1.5 }, /图片数量必须是 1-10 的整数/],
  ]

  for (const [options, expected] of cases) {
    await assert.rejects(createClient().generate("draw", options), expected)
  }
  await assert.rejects(createClient().generateSimple("draw", { n: 11 }), /图片数量必须是 1-10 的整数/)
})

test("Images 拒绝带具体端点的 baseURL", () => {
  assert.throws(
    () => createClientWithBaseURL("https://api.example/v1/chat/completions"),
    /baseURL 应填写 API 根地址/,
  )
  assert.throws(
    () => createClientWithBaseURL("https://api.example/v1/images/generations"),
    /baseURL 应填写 API 根地址/,
  )
})

function createClientWithBaseURL(baseURL) {
  return new OpenAIImageClient({ api: "test-key", baseURL, model: "image-model" })
}

test("Images Base64 结果使用 output_format 对应的 MIME", () => {
  const client = createClient()
  const payload = { data: [{ b64_json: "AQID" }] }

  assert.deepEqual(client._extractImages(payload, "png"), [
    { dataUrl: "data:image/png;base64,AQID" },
  ])
  assert.deepEqual(client._extractImages(payload, "jpeg"), [
    { dataUrl: "data:image/jpeg;base64,AQID" },
  ])
  assert.deepEqual(client._extractImages(payload, "webp"), [
    { dataUrl: "data:image/webp;base64,AQID" },
  ])
})

test("Images 明确区分空 data 和无有效图片字段", () => {
  const client = createClient()
  assert.throws(() => client._extractImages({ data: [] }), /data 为空/)
  assert.throws(() => client._extractImages({ data: [{ revised_prompt: "draw" }] }), /没有有效的 b64_json 或 url/)
  assert.deepEqual(client._extractImages({ data: [{ url: "data:image/png;base64,AQID" }] }), [
    { dataUrl: "data:image/png;base64,AQID" },
  ])
})

test("Images 将成功状态下的非 JSON 响应标记为协议错误", async () => {
  const client = createClient()
  await assert.rejects(
    client._parseJsonResponse(new Response("<html>bad gateway</html>", { status: 200 }), "images/generations"),
    error => error.code === "INVALID_JSON" && /接口返回了无效 JSON/.test(error.message),
  )
})

test("Images 编辑保留 JPEG 输入的 MIME 和文件扩展名", async () => {
  const client = createClient()
  const jpeg = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "white" },
  }).jpeg().toBuffer()
  const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`

  client._fetchMultipart = async (path, formData) => {
    assert.equal(path, "images/edits")
    const file = formData.get("image[]")
    assert.equal(file.type, "image/jpeg")
    assert.equal(file.name, "input-1.jpg")
    return { data: [{ url: "https://cdn.example/result.png" }] }
  }

  const result = await client.edit("edit", [dataUrl])
  assert.deepEqual(result, [{ url: "https://cdn.example/result.png" }])
})

test("Images 编辑将 GIF 输入转换为 PNG", async () => {
  const client = createClient()
  const gif = await sharp({
    create: { width: 1, height: 1, channels: 4, background: "white" },
  }).gif().toBuffer()
  const blob = await client._urlToBlob(`data:image/gif;base64,${gif.toString("base64")}`)

  assert.equal(blob.type, "image/png")
  assert.equal((await sharp(Buffer.from(await blob.arrayBuffer())).metadata()).format, "png")
})
