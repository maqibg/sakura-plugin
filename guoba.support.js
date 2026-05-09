import lodash from "lodash"
import setting from "./lib/setting.js"

export function supportGuoba() {
  return {
    pluginInfo: {
      name: "sakura-plugin",
      title: "sakura-plugin",
      description: "一个简单插件",
      author: "@suzuka",
      authorLink: "https://github.com/suzuka-suzuka",
      link: "https://github.com/suzuka-suzuka/sakura-plugin",
      isV3: true,
      isV2: false,
      showInMenu: "auto",
      icon: "twemoji:cherry-blossom",
    },

    configInfo: {
      schemas: [
        {
          label: "AI渠道",
          component: "SOFT_GROUP_BEGIN",
        },
        {
          field: "Channels.openai",
          label: "OpenAI 兼容渠道",
          bottomHelpMessage: "支持 OpenAI、DeepSeek、自建服务等 OpenAI 兼容 API。",
          component: "GSubForm",
          required: false,
          componentProps: {
            multiple: true,
            schemas: [
              { field: "name", label: "渠道名称", component: "Input", required: true },
              { field: "baseURL", label: "API地址", component: "Input", required: true },
              { field: "model", label: "模型名称", component: "Input", required: true },
              {
                field: "api",
                label: "API Key",
                component: "InputTextArea",
                required: true,
                bottomHelpMessage: "支持多个apikey轮询，一行一个",
              },
            ],
          },
        },
        {
          label: "AI设定",
          component: "SOFT_GROUP_BEGIN",
        },
        {
          field: "AI.profiles",
          label: "角色配置",
          bottomHelpMessage: "配置不同的人格和其设定，可新增或删除角色。",
          component: "GSubForm",
          required: true,
          componentProps: {
            multiple: true,
            schemas: [
              { field: "name", label: "角色名称", component: "Input", required: true },
              {
                field: "prefix",
                label: "触发前缀",
                component: "Input",
                required: true,
                bottomHelpMessage: "用于触发该角色的命令前缀",
              },
              {
                field: "Channel",
                label: "渠道",
                component: "Input",
                required: true,
                bottomHelpMessage: "使用的渠道名称，必须与上方渠道配置中的名称一致",
              },
              {
                field: "Prompt",
                label: "预设提示词",
                component: "InputTextArea",
                required: true,
                bottomHelpMessage: "角色的核心设定",
              },
              { field: "GroupContext", label: "启用群聊上下文", component: "Switch", required: true },
              { field: "History", label: "启用历史记录", component: "Switch", required: true },
              { field: "Tool", label: "启用工具", component: "Switch", required: true },
            ],
          },
        },
        {
          field: "AI.groupContextLength",
          label: "群聊上下文长度",
          component: "InputNumber",
          required: true,
          componentProps: { min: 1 },
        },
        {
          field: "AI.enableUserLock",
          label: "是否启用用户锁",
          component: "Switch",
          required: true,
          bottomHelpMessage:
            "启用后，每个用户处理完当前消息前，不会处理该用户的后续消息，直到当前消息处理完毕",
        },
        {
          field: "AI.toolschannel",
          label: "工具渠道",
          component: "Input",
          required: false,
          bottomHelpMessage: "用于工具功能的AI渠道",
        },
        {
          field: "AI.appschannel",
          label: "应用渠道",
          component: "Input",
          required: false,
          bottomHelpMessage: "用于应用功能的AI渠道",
        },
        {
          field: "AI.defaultchannel",
          label: "默认渠道",
          component: "Input",
          required: false,
          bottomHelpMessage: "当指定渠道不可用时使用的备用渠道",
        },
        {
          label: "图片功能",
          component: "SOFT_GROUP_BEGIN",
        },
        {
          field: "r18.enable",
          label: "r18功能启用群,影响所有图片功能",
          component: "GSelectGroup",
          required: false,
          componentProps: { multiple: true },
        },
        {
          field: "EditImage",
          label: "修图API配置",
          bottomHelpMessage: "配置 OpenAI 兼容的图片生成 API（gpt-image-2 等）",
          component: "GSubForm",
          required: false,
          componentProps: {
            multiple: false,
            schemas: [
              { field: "model", label: "模型名称", component: "Input", required: true },
              { field: "api", label: "API Key", component: "Input", required: true },
              {
                field: "baseURL",
                label: "API地址",
                component: "Input",
                required: false,
                bottomHelpMessage: "默认 https://api.openai.com/v1",
              },
              {
                field: "apiMode",
                label: "API模式",
                component: "Select",
                required: false,
                bottomHelpMessage: "images=/v1/images/edits, responses=/v1/responses",
                componentProps: {
                  options: [
                    { label: "标准 Images API", value: "images" },
                    { label: "Responses API", value: "responses" },
                  ],
                },
              },
              { field: "timeout", label: "超时(秒)", component: "InputNumber", required: false, bottomHelpMessage: "默认300，生图慢时可设置更大值", componentProps: { min: 30, max: 900 } },
              { field: "requirePermission", label: "需要权限", component: "Switch", required: false },
              { field: "whitelist", label: "白名单群", component: "GSelectGroup", required: false, bottomHelpMessage: "只有这些群可以使用，留空不限制", componentProps: { multiple: true } },
              { field: "blacklist", label: "黑名单群", component: "GSelectGroup", required: false, bottomHelpMessage: "这些群禁止使用", componentProps: { multiple: true } },
            ],
          },
        },
        {
          field: "EditImage.tasks",
          label: "修图提示词",
          bottomHelpMessage: "配置自定义图片编辑指令和提示词",
          component: "GSubForm",
          required: false,
          componentProps: {
            multiple: true,
            schemas: [
              { field: "trigger", label: "触发词", component: "Input", required: true },
              { field: "prompt", label: "描述", component: "Input", required: true },
            ],
          },
        },
        {
          label: "web编辑器",
          component: "Divider",
        },
        {
          field: "webeditor.port",
          label: "端口",
          component: "InputNumber",
          required: true,
          componentProps: { min: 1, max: 65535 },
        },
        {
          field: "webeditor.password",
          label: "密码",
          component: "Input",
          required: true,
        },
      ],

      getConfigData() {
        return setting.merge()
      },

      setConfigData(data, { Result }) {
        let config = {}
        for (let [keyPath, value] of Object.entries(data)) {
          lodash.set(config, keyPath, value)
        }
        setting.analysis(config)
        return Result.ok({}, "保存成功~")
      },
    },
  }
}