import OpenAI from "openai"
import { buildGroupPrompt } from "./GroupContext.js"
import { getToolsSchema } from "./tools/tools.js"
import Setting from "../setting.js"

const channelApiKeyIndex = new Map()

function adjustSchemaCase(schema, toUpper = false) {
  const adjust = obj => {
    if (typeof obj === "object" && obj !== null) {
      for (let key in obj) {
        if (key === "type" && typeof obj[key] === "string") {
          obj[key] = toUpper ? obj[key].toUpperCase() : obj[key].toLowerCase()
        } else {
          adjust(obj[key])
        }
      }
    }
  }
  const copied = JSON.parse(JSON.stringify(schema))
  copied.forEach(tool => adjust(tool.parameters))
  return copied
}

function processQueryParts(queryParts) {
  if (!queryParts || queryParts.length === 0) return queryParts

  return queryParts.map(part => {
    if (part.text) {
      return { type: "text", text: part.text }
    }
    if (part.inlineData) {
      const { mimeType, data } = part.inlineData
      return {
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${data}` },
      }
    }
    if (part.image_url) {
      return part
    }
    return part
  })
}

async function buildMessages(channel, e, queryParts, presetPrompt, enableGroupContext, historyContents = []) {
  let messages = []

  let fullSystemInstructionText = ""
  if (presetPrompt && presetPrompt.trim()) {
    fullSystemInstructionText += presetPrompt.trim()
  }

  let groupContextOptions = { sender: e.sender }
  let shouldEnableGroupContext = false

  if (typeof enableGroupContext === "object" && enableGroupContext !== null) {
    shouldEnableGroupContext = true
    if (enableGroupContext.noHeader) {
      delete groupContextOptions.sender
    }
  } else if (enableGroupContext === true) {
    shouldEnableGroupContext = true
  }

  if (shouldEnableGroupContext && e.isGroup) {
    const systemPromptWithContext = await buildGroupPrompt(e.group_id, groupContextOptions)
    if (systemPromptWithContext.trim()) {
      if (fullSystemInstructionText) fullSystemInstructionText += "\n"
      fullSystemInstructionText += systemPromptWithContext.trim()
    }
  }

  if (fullSystemInstructionText) {
    messages.push({ role: "system", content: fullSystemInstructionText })
  }

  if (historyContents.length > 0) {
    for (const item of historyContents) {
      if (item.role === "user" || item.role === "model") {
        const role = item.role === "model" ? "assistant" : "user"
        const textParts = item.parts.filter(p => p.text).map(p => p.text)
        const content = textParts.join("")
        const tool_calls = item.parts
          .filter(part => part.functionCall)
          .map(part => ({
            id: part.functionCall.id,
            type: "function",
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args),
            },
          }))
        let message = { role }
        if (content) message.content = content
        if (tool_calls.length > 0) message.tool_calls = tool_calls
        if (message.content || (message.tool_calls && message.tool_calls.length > 0)) {
          messages.push(message)
        }
      } else if (item.role === "function") {
        for (const part of item.parts) {
          if (part.functionResponse && part.functionResponse.id) {
            messages.push({
              role: "tool",
              tool_call_id: part.functionResponse.id,
              name: part.functionResponse.name,
              content: JSON.stringify(part.functionResponse.response),
            })
          }
        }
      }
    }
  }

  if (queryParts && queryParts.length > 0) {
    const processed = processQueryParts(queryParts)
    if (processed.length === 1 && processed[0].type === "text") {
      messages.push({ role: "user", content: processed[0].text })
    } else {
      messages.push({ role: "user", content: processed })
    }
  }

  return messages
}

async function callOpenAI(channel, messages, enableTools) {
  const apiKeys = typeof channel.api === "string" && channel.api.includes("\n")
    ? channel.api.split("\n").map(k => k.trim()).filter(Boolean)
    : Array.isArray(channel.api)
      ? channel.api
      : [channel.api]

  let apiKey
  if (Array.isArray(apiKeys) && apiKeys.length > 0) {
    const channelName = channel.name
    let currentIndex = channelApiKeyIndex.get(channelName) || 0
    if (currentIndex >= apiKeys.length) currentIndex = 0
    apiKey = apiKeys[currentIndex]
    channelApiKeyIndex.set(channelName, (currentIndex + 1) % apiKeys.length)
  } else {
    throw new Error("无效的 API Key 配置")
  }

  const openai = new OpenAI({ apiKey, baseURL: channel.baseURL })

  const requestPayload = {
    model: channel.model,
    messages,
    stream: false,
  }

  if (enableTools) {
    const toolsSchema = getToolsSchema()
    if (toolsSchema && toolsSchema.length > 0) {
      requestPayload.tools = adjustSchemaCase(toolsSchema, false).map(tool => ({
        type: "function",
        function: tool,
      }))
      requestPayload.tool_choice = "auto"
    }
  }

  const completion = await openai.chat.completions.create(requestPayload)
  const message = completion.choices[0]?.message
  const extractedText = message?.content || ""
  const toolCallsArr = message?.tool_calls || []

  if (!extractedText && toolCallsArr.length === 0) {
    throw new Error("API 未返回任何内容")
  }

  const functionCalls = toolCallsArr
    .map(tc => {
      try {
        return { id: tc.id, name: tc.function.name, args: JSON.parse(tc.function.arguments) }
      } catch {
        return null
      }
    })
    .filter(Boolean)

  return { text: extractedText, functionCalls }
}

export async function getAI(channelName, e, queryParts, presetPrompt, enableGroupContext, enableTools, historyContents = []) {
  const channelsConfig = Setting.getConfig("Channels")
  const aiConfig = Setting.getConfig("AI")
  const defaultChannelName = aiConfig?.defaultchannel

  if (!channelsConfig || typeof channelsConfig !== "object") {
    return "配置错误：未找到 'Channels' 配置文件或其格式不正确。"
  }

  const openaiList = channelsConfig.openai || []
  const channelConfig = openaiList.find(c => c.name === channelName)

  if (!channelConfig) {
    if (channelName !== defaultChannelName) {
      logger.warn(`渠道 "${channelName}" 未找到，尝试回退到 '${defaultChannelName}' 渠道。`)
      return getAI(defaultChannelName, e, queryParts, presetPrompt, enableGroupContext, enableTools, historyContents)
    }
    return `渠道错误：未找到名为 "${channelName}" 的可用渠道。`
  }

  logger.info(`正在使用渠道 "${channelName}"`)

  try {
    const messages = await buildMessages(channelConfig, e, queryParts, presetPrompt, enableGroupContext, historyContents)
    return await callOpenAI(channelConfig, messages, enableTools)
  } catch (error) {
    const errorMsg = `API 调用失败: ${error.message}`
    logger.error(errorMsg, error)

    if (channelName !== defaultChannelName) {
      logger.info(`渠道 "${channelName}" 失败，尝试回退到 '${defaultChannelName}' 渠道。`)
      return getAI(defaultChannelName, e, queryParts, presetPrompt, enableGroupContext, enableTools, historyContents)
    }
    return errorMsg
  }
}