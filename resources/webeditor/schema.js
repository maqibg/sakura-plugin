console.log("[Schema] 开始加载配置定义...")

const configSchema = {
  categories: [
    {
      name: "AI渠道",
      icon: "🤖",
      configs: ["Channels"],
    },
    {
      name: "AI人设",
      icon: "🎭",
      configs: ["roles"],
    },
    {
      name: "AI设定",
      icon: "💬",
      configs: ["AI"],
    },
    {
      name: "图片功能",
      icon: "🖼️",
      configs: ["ImageChannels", "EditImage", "r18"],
    },
    {
      name: "其他",
      icon: "⚙️",
      configs: ["webeditor"],
    },
  ],

  configNames: {
    AI: "AI对话",
    Channels: "AI渠道",
    EditImage: "修图设置",
    ImageChannels: "修图渠道",
    r18: "R18图片",
    roles: "AI人设",
    webeditor: "配置面板",
  },

  fields: {
    Groups: { label: "启用群", type: "groupSelect", help: "选择启用此功能的群聊" },
    groups: { label: "启用群", type: "groupSelect", help: "选择启用此功能的群聊" },
    name: { label: "名称", type: "text" },
    description: { label: "描述", type: "textarea" },
    title: { label: "标题", type: "text" },

    "roles.roles": {
      label: "人设列表",
      type: "array",
      itemType: "object",
      titleField: "name",
      schema: {
        name: { label: "人设名称", type: "text", required: true },
        prompt: { label: "设定内容", type: "textarea", required: true },
      },
    },

    "r18.enable": { label: "启用群", type: "groupSelect", help: "影响所有图片功能" },

    // ---- ImageChannels ----
    "ImageChannels.openai": {
      label: "修图渠道",
      type: "array",
      itemType: "object",
      help: "配置修图 API 渠道，可添加多个",
      schema: {
        name: { label: "渠道名称", type: "text", required: true },
        baseURL: { label: "API地址", type: "text", required: true },
        api: { label: "API Key", type: "text", required: true },
        model: { label: "模型", type: "text", required: true },
        apiMode: {
          label: "API模式",
          type: "select",
          required: true,
          help: "images/chat-compatible/secondApi",
          options: [
            { label: "images（图片API）", value: "images" },
            { label: "chat-compatible（厂商扩展）", value: "chat-compatible" },
            { label: "2API（自建代理）", value: "secondApi" },
          ],
        },
        chatProfile: {
          label: "Chat适配规格",
          type: "select",
          help: "chat-compatible 模式必填",
          options: [
            { label: "content-parts（图片分片）", value: "content-parts" },
          ],
        },
      },
    },

    // ---- EditImage ----
    EditImage: {
      label: "修图设置",
      type: "object",
      help: "修图功能配置，渠道在「修图渠道」中设置",
      schema: {
        channel: { label: "使用渠道", type: "text", required: true, help: "对应修图渠道中的名称，|分隔可故障转移" },
        concurrency: { label: "全局并发限制", type: "number", required: false, help: "0=无限制" },
        timeout: { label: "超时(分钟)", type: "number", help: "默认5，最大120" },
        userLock: { label: "用户锁", type: "boolean", help: "防重复触发" },
        moderation: { label: "内容审核", type: "select", options: [{ label: "auto", value: "auto" }, { label: "low", value: "low" }] },
        defaultSize: { label: "默认尺寸", type: "text", help: "1024x1024" },
        defaultQuality: { label: "默认质量", type: "text", help: "auto/low/medium/high" },
        defaultFormat: { label: "默认格式", type: "text", help: "png/jpeg/webp" },
        defaultModeration: { label: "默认审核", type: "text", help: "auto/low" },
        requirePermission: { label: "需要权限", type: "boolean" },
        whitelist: { label: "白名单群", type: "groupSelect", help: "填空不限制" },
        blacklist: { label: "黑名单群", type: "groupSelect", help: "这些群禁止使用" },
        tasks: {
          label: "修图提示词",
          type: "array",
          itemType: "object",
          titleField: "trigger",
          schema: {
            trigger: { label: "触发词", type: "text", required: true },
            prompt: { label: "描述", type: "text", required: true },
          },
        },
      },
    },

    // ---- Channels (AI) ----
    "Channels.openai": {
      label: "OpenAI",
      type: "array",
      itemType: "object",
      help: "OpenAI 兼容 API 渠道（支持 OpenAI、DeepSeek、自建服务等）",
      schema: {
        name: { label: "渠道名称", type: "text", required: true },
        baseURL: { label: "API地址", type: "text", required: true },
        model: { label: "模型名称", type: "text", required: true },
        api: { label: "API Key", type: "textarea", help: "支持多个apikey轮询，一行一个", required: true },
      },
    },

    // ---- AI ----
    "AI.profiles": {
      label: "角色配置",
      type: "array",
      itemType: "object",
      help: "配置不同的人格和其设定，可新增或删除角色",
      schema: {
        prefix: { label: "触发前缀", type: "text", required: true, help: "用于触发该角色的命令前缀" },
        name: { label: "角色名称", type: "roleSelect", required: true, help: "选择已有的AI人设" },
        Channel: { label: "渠道", type: "channelSelect", required: true, help: "使用的渠道名称" },
        GroupContext: { label: "启用群聊上下文", type: "boolean" },
        History: { label: "启用历史记录", type: "boolean" },
        Tool: { label: "启用工具", type: "boolean" },
      },
    },
    "AI.groupContextLength": { label: "群聊上下文长度", type: "number", min: 1 },
    "AI.enableUserLock": { label: "用户锁", type: "boolean", help: "防消息并发" },
    "AI.requirePermission": { label: "需要权限", type: "boolean", help: "仅权限列表用户可触发" },
    "AI.toolschannel": { label: "工具渠道", type: "channelSelect" },
    "AI.appschannel": { label: "应用渠道", type: "channelSelect" },
    "AI.defaultchannel": { label: "默认渠道", type: "channelSelect" },

    // ---- webeditor ----
    "webeditor.port": { label: "端口", type: "number", min: 1024, max: 65535 },
    "webeditor.password": { label: "登录密码", type: "text" },

    // ---- generic ----
    enabled: { label: "启用", type: "boolean" },
    port: { label: "端口", type: "number", min: 1024, max: 65535 },
    baseURL: { label: "API地址", type: "text" },
    api: { label: "API密钥", type: "text" },
    Channel: { label: "使用渠道", type: "text" },
    channel: { label: "使用渠道", type: "text" },
    prompt: { label: "提示词", type: "text" },
    trigger: { label: "触发词", type: "text" },
    Prompt: { label: "预设提示词", type: "textarea" },
    stream: { label: "流式输出", type: "boolean" },
  },
}

function getFieldSchema(key) {
  return configSchema.fields[key] || { label: key, type: "text" }
}

function getConfigName(configKey) {
  return configSchema.configNames[configKey] || configKey
}

function getCategories() {
  return configSchema.categories
}

window.configSchema = configSchema
window.getFieldSchema = getFieldSchema
window.getConfigName = getConfigName
window.getCategories = getCategories

console.log("[Schema] 配置定义加载完成，已暴露到 window 对象")
console.log("[Schema] 分类数量:", configSchema.categories.length)
