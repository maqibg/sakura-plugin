import assert from "node:assert/strict"
import test from "node:test"

import { ChatCompatibleImageAdapter } from "../lib/AIUtils/ChatCompatibleImageAdapter.js"

function createAdapter(overrides = {}) {
  return new ChatCompatibleImageAdapter({
    api: "test-key",
    baseURL: "https://vendor.example/v1/",
    model: "vendor-image-model",
    chatProfile: "content-parts",
    timeout: 1,
    ...overrides,
  })
}

test("chat-compatible 要求显式配置 content-parts profile", () => {
  assert.throws(
    () => createAdapter({ chatProfile: undefined }),
    /必须配置 chatProfile: content-parts/,
  )
})

test("chat-compatible 固定调用非流式 chat/completions", async t => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })

  let request
  globalThis.fetch = async (url, init) => {
    request = { url, init, body: JSON.parse(init.body) }
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: [{ type: "image_url", image_url: { url: "https://cdn.example/result.png" } }],
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } })
  }

  const result = await createAdapter().generate("draw a cat", ["https://cdn.example/input.jpg"])

  assert.equal(request.url, "https://vendor.example/v1/chat/completions")
  assert.equal(request.init.method, "POST")
  assert.equal(request.body.stream, false)
  assert.deepEqual(request.body.modalities, ["text", "image"])
  assert.deepEqual(request.body.messages[0].content, [
    { type: "text", text: "draw a cat" },
    { type: "image_url", image_url: { url: "https://cdn.example/input.jpg" } },
  ])
  assert.deepEqual(result, [{ url: "https://cdn.example/result.png" }])
})

test("chat-compatible 只从 content 图片分片解析 URL 和 Base64", async t => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })

  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: [
          { type: "text", text: "ignored" },
          { type: "image", data: "AQID", mime_type: "image/webp" },
          { type: "image_generation", result: "data:image/jpeg;base64,BAUG" },
        ],
      },
    }],
  }), { status: 200, headers: { "content-type": "application/json" } })

  const result = await createAdapter().generate("draw")
  assert.deepEqual(result, [
    { dataUrl: "data:image/webp;base64,AQID" },
    { dataUrl: "data:image/jpeg;base64,BAUG" },
  ])
})

test("chat-compatible 不把普通文本响应当作生图成功", async t => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })

  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: [{ type: "text", text: "cannot generate" }] } }],
  }), { status: 200, headers: { "content-type": "application/json" } })

  await assert.rejects(
    createAdapter().generate("draw"),
    /未找到 choices\[\]\.message\.content\[\] 图片分片/,
  )
})

test("chat-compatible 拒绝通用 Images 参数", async () => {
  await assert.rejects(
    createAdapter().generate("draw", [], { size: "1024x1024", n: 2 }),
    /不支持参数: size, n/,
  )
})
