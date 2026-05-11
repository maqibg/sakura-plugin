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
      configs: ["EditImage", "r18"],
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
    EditImage: "修图",
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

    EditImage: {
      label: "修图API配置",
      type: "object",
      help: "配置 OpenAI 兼容的图片生成 API（gpt-image-2 等）",
      schema: {
        model: { label: "模型名称", type: "text", required: true },
        api: { label: "API Key", type: "text", required: true },
        baseURL: {
          label: "API地址",
          type: "text",
          required: false,
          help: "默认 https://api.openai.com/v1",
        },
        apiMode: {
          label: "API模式",
          type: "select",
          required: false,
          help: "images=/v1/images, responses=/v1/responses",
          options: [
            { label: "images（图片API）", value: "images" },
            { label: "responses（新版）", value: "responses" },
          ],
        },
        userLock: { label: "用户锁", type: "boolean", required: false, help: "默认开启，防止重复触发" },
        timeout: { label: "超时(分钟)", type: "number", required: false, help: "默认5，最大120" },
        moderation: {
          label: "内容审核",
          type: "select",
          required: false,
          help: "auto=正常审核, low=放宽（二次元/艺术类）",
          options: [
            { label: "auto（正常）", value: "auto" },
            { label: "low（放宽）", value: "low" },
          ],
        },
        requirePermission: { label: "需要权限", type: "boolean", required: false },
        whitelist: { label: "白名单群", type: "groupSelect", required: false, help: "填空不限制" },
        blacklist: { label: "黑名单群", type: "groupSelect", required: false, help: "这些群禁止使用" },
        defaultSize: { label: "默认尺寸", type: "text", required: false, help: "1024x1024" },
        defaultQuality: { label: "默认质量", type: "text", required: false, help: "auto/low/medium/high" },
        defaultFormat: { label: "默认格式", type: "text", required: false, help: "png/jpeg/webp" },
        defaultModeration: { label: "默认审核", type: "text", required: false, help: "auto/low" },
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
    "EditImage.model": { label: "模型名称", type: "text", required: true },
    "EditImage.api": { label: "API Key", type: "text", required: true },
    "EditImage.baseURL": { label: "API地址", type: "text", required: false },
    "EditImage.apiMode": {
      label: "API模式",
      type: "select",
      required: false,
      help: "images/chat/responses 三种模式",
      options: [
        { label: "images（图片API）", value: "images" },
        { label: "chat（对话生图）", value: "chat" },
        { label: "responses（新版）", value: "responses" },
      ],
    },
    "EditImage.timeout": { label: "超时(分钟)", type: "number", required: false, help: "默认5" },
    "EditImage.defaultSize": { label: "默认尺寸", type: "text", required: false, help: "1024x1024/1536x1024/1024x1536" },
    "EditImage.defaultQuality": {
      label: "默认质量",
      type: "select",
      required: false,
      options: [
        { label: "auto", value: "auto" },
        { label: "low", value: "low" },
        { label: "medium", value: "medium" },
        { label: "high", value: "high" },
      ],
    },
    "EditImage.defaultFormat": {
      label: "默认格式",
      type: "select",
      required: false,
      options: [
        { label: "png", value: "png" },
        { label: "jpeg", value: "jpeg" },
        { label: "webp", value: "webp" },
      ],
    },
    "EditImage.defaultModeration": {
      label: "默认审核",
      type: "select",
      required: false,
      options: [
        { label: "auto（正常）", value: "auto" },
        { label: "low（放宽）", value: "low" },
      ],
    },
    "EditImage.userLock": { label: "用户锁", type: "boolean", required: false },
    "EditImage.moderation": {
      label: "内容审核",
      type: "select",
      required: false,
      help: "auto=正常, low=放宽",
      options: [
        { label: "auto（正常）", value: "auto" },
        { label: "low（放宽）", value: "low" },
      ],
    },
    "EditImage.requirePermission": { label: "需要权限", type: "boolean" },
    "EditImage.whitelist": { label: "白名单群", type: "groupSelect", help: "填空不限制" },
    "EditImage.blacklist": { label: "黑名单群", type: "groupSelect", help: "这些群禁止使用" },
    "EditImage.secondApi": {
      label: "2API渠道",
      type: "object",
      help: "自建代理服务，#2生图 触发，不支持 quality/format/moderation",
      schema: {
        enabled: { label: "启用", type: "boolean" },
        baseURL: { label: "API地址", type: "text", required: true },
        api: { label: "API Key", type: "text", required: true },
        model: { label: "模型", type: "text", help: "默认 gpt-image-2" },
      },
    },
    "EditImage.secondApi.enabled": { label: "启用2API", type: "boolean" },
    "EditImage.secondApi.baseURL": { label: "2API地址", type: "text" },
    "EditImage.secondApi.api": { label: "2API Key", type: "text" },
    "EditImage.secondApi.model": { label: "2API模型", type: "text" },
    "EditImage.tasks": {
      label: "修图触发词",
      type: "array",
      itemType: "object",
      titleField: "trigger",
      schema: {
        trigger: { label: "触发词", type: "text", required: true },
        prompt: { label: "提示词", type: "text", required: true },
      },
    },

    "Channels.openai": {
      label: "OpenAI",
      type: "array",
      itemType: "object",
      help: "OpenAI 兼容 API 渠道（支持 OpenAI、DeepSeek、自建服务等）",
      schema: {
        name: { label: "渠道名称", type: "text", required: true },
        baseURL: { label: "API地址", type: "text", required: true },
        model: { label: "模型名称", type: "text", required: true },
        api: {
          label: "API Key",
          type: "textarea",
          help: "支持多个apikey轮询，一行一个",
          required: true,
        },
      },
    },

    "AI.profiles": {
      label: "角色配置",
      type: "array",
      itemType: "object",
      help: "配置不同的人格和其设定，可新增或删除角色",
      schema: {
        prefix: {
          label: "触发前缀",
          type: "text",
          required: true,
          help: "用于触发该角色的命令前缀",
        },
        name: {
          label: "角色名称",
          type: "roleSelect",
          required: true,
          help: "选择已有的AI人设",
        },
        Channel: {
          label: "渠道",
          type: "channelSelect",
          required: true,
          help: "使用的渠道名称，必须与上方渠道配置中的名称一致",
        },
        GroupContext: { label: "启用群聊上下文", type: "boolean" },
        History: { label: "启用历史记录", type: "boolean" },
        Tool: { label: "启用工具", type: "boolean" },
      },
    },
    "AI.groupContextLength": { label: "群聊上下文长度", type: "number", min: 1 },
    "AI.enableUserLock": {
      label: "是否启用用户锁",
      type: "boolean",
      help: "启用后，每个用户处理完当前消息前，不会处理该用户的后续消息，直到当前消息处理完毕",
    },
    "AI.requirePermission": {
      label: "需要权限",
      type: "boolean",
      help: "启用后，只有在权限列表中的用户才能触发",
    },
    "AI.toolschannel": {
      label: "工具渠道",
      type: "channelSelect",
      help: "用于AI工具的渠道",
    },
    "AI.appschannel": {
      label: "应用渠道",
      type: "channelSelect",
      help: "用于杂项功能的渠道",
    },
    "AI.defaultchannel": {
      label: "默认渠道",
      type: "channelSelect",
      help: "当指定渠道不可用时使用的备用渠道",
    },
    profiles: {
      label: "角色配置",
      type: "array",
      itemType: "object",
      schema: {
        name: { label: "角色名称", type: "text", required: true },
        prefix: { label: "触发前缀", type: "text", required: true },
        Channel: { label: "使用渠道", type: "text", required: true },
        Prompt: { label: "预设提示词", type: "textarea", required: true },
        GroupContext: { label: "启用群聊上下文", type: "boolean" },
        History: { label: "启用历史记录", type: "boolean" },
        Tool: { label: "启用工具", type: "boolean" },
      },
    },
    groupContextLength: { label: "群聊上下文长度", type: "number", min: 1 },
    enableUserLock: { label: "启用用户锁", type: "boolean", help: "防止用户消息并发处理" },

    "webeditor.port": {
      label: "端口号",
      type: "number",
      help: "sakura服务端口.修改完需重启生效",
      min: 1024,
      max: 65535,
    },
    "webeditor.password": {
      label: "登录密码",
      type: "text",
      help: "sakura登录密码，修改后需重启生效",
    },

    "Channels.xxx": {
      label: "渠道项",
      type: "array",
      itemType: "object",
      schema: {
        name: { label: "名称", type: "text" },
        model: { label: "模型", type: "text" },
        api: { label: "API Key", type: "text" },
      },
    },

    port: { label: "端口", type: "number", min: 1024, max: 65535 },
    baseURL: { label: "API地址", type: "text" },
    api: { label: "API密钥", type: "textarea" },
    reg: { label: "触发词", type: "text" },
    prompt: { label: "提示词", type: "text" },
    cmd: { label: "命令", type: "text" },
    desc: { label: "说明", type: "text" },
    prefix: { label: "触发前缀", type: "text" },
    GroupContext: { label: "群聊上下文", type: "boolean" },
    History: { label: "历史记录", type: "boolean" },
    Tool: { label: "启用工具", type: "boolean" },
    commands: { label: "命令列表", type: "array", itemType: "object" },
    sourceGroupIds: { label: "来源群", type: "groupSelect" },
    targetGroupIds: { label: "目标群", type: "groupSelect" },
    Channel: { label: "使用渠道", type: "text" },
    Prompt: { label: "预设提示词", type: "textarea" },
    enable: { label: "启用", type: "boolean" },
  },
}

function getFieldSchema(key) {
  if (configSchema.fields[key]) {
    return configSchema.fields[key]
  }
  return { label: key, type: "text" }
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