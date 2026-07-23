import lodash from "lodash"
import setting from "./lib/setting.js"
import { clearImageCache as clearImageCacheFiles } from "./lib/ImageCache.js"

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
        // ==================== AI 渠道 ====================
        {
          label: "AI渠道",
          component: "SOFT_GROUP_BEGIN",
        },
        {
          field: "Channels.openai",
          label: "OpenAI 渠道",
          bottomHelpMessage: "支持 OpenAI、DeepSeek、自建服务等 OpenAI 兼容 API",
          component: "GSubForm",
          required: false,
          componentProps: {
            multiple: true,
            schemas: [
              { field: "name", label: "渠道名称", component: "Input", required: true },
              { field: "baseURL", label: "API地址", component: "Input", required: true },
              { field: "model", label: "模型名称", component: "Input", required: true },
              { field: "api", label: "API Key", component: "InputTextArea", required: true, bottomHelpMessage: "多个apikey一行一个" },
            ],
          },
        },

        // ==================== AI 设定 ====================
        {
          label: "AI设定",
          component: "SOFT_GROUP_BEGIN",
        },
        {
          field: "AI.profiles",
          label: "角色配置",
          component: "GSubForm",
          required: true,
          bottomHelpMessage: "配置不同的人格和其设定",
          componentProps: {
            multiple: true,
            schemas: [
              { field: "name", label: "角色名称", component: "Input", required: true },
              { field: "prefix", label: "触发前缀", component: "Input", required: true, bottomHelpMessage: "如 - 代表用 -开头触发" },
              { field: "Channel", label: "渠道", component: "Input", required: true, bottomHelpMessage: "对应AI渠道中的名称" },
              { field: "Prompt", label: "预设提示词", component: "InputTextArea", required: true },
              { field: "GroupContext", label: "启用群聊上下文", component: "Switch", required: true },
              { field: "History", label: "启用历史记录", component: "Switch", required: true },
              { field: "Tool", label: "启用工具", component: "Switch", required: true },
            ],
          },
        },
        { field: "AI.groupContextLength", label: "群聊上下文长度", component: "InputNumber", required: true, componentProps: { min: 1 } },
        { field: "AI.enableUserLock", label: "用户锁", component: "Switch", required: true, bottomHelpMessage: "防消息并发" },
        { field: "AI.toolschannel", label: "工具渠道", component: "Input", required: false },
        { field: "AI.appschannel", label: "应用渠道", component: "Input", required: false },
        { field: "AI.defaultchannel", label: "默认渠道", component: "Input", required: false },

        // ==================== 修图渠道 ====================
        {
          label: "修图渠道",
          component: "SOFT_GROUP_BEGIN",
        },
        {
          field: "ImageChannels.openai",
          label: "修图渠道",
          component: "GSubForm",
          required: false,
          bottomHelpMessage: "可添加多个修图API渠道",
          componentProps: {
            multiple: true,
            schemas: [
              { field: "name", label: "渠道名称", component: "Input", required: true },
              { field: "baseURL", label: "API地址", component: "Input", required: true },
              { field: "api", label: "API Key", component: "Input", required: true },
              { field: "model", label: "模型", component: "Input", required: true },
              {
                field: "apiMode",
                label: "API模式",
                component: "Select",
                required: true,
                bottomHelpMessage: "images/chat-compatible/secondApi",
                componentProps: {
                  options: [
                    { label: "images（图片API）", value: "images" },
                    { label: "chat-compatible（厂商扩展）", value: "chat-compatible" },
                    { label: "2API（自建代理）", value: "secondApi" },
                  ],
                },
              },
              {
                field: "chatProfile",
                label: "Chat适配规格",
                component: "Select",
                required: false,
                bottomHelpMessage: "chat-compatible 模式必填",
                componentProps: {
                  options: [
                    { label: "content-parts（图片分片）", value: "content-parts" },
                  ],
                },
              },
            ],
          },
        },

        // ==================== 修图设置 ====================
        {
          label: "修图设置",
          component: "SOFT_GROUP_BEGIN",
        },
        {
          field: "EditImage.channel",
          label: "使用渠道",
          component: "Input",
          required: true,
          bottomHelpMessage: "| 分隔可故障转移",
        },
        { field: "EditImage.concurrency", label: "全局并发限制", component: "InputNumber", required: false, bottomHelpMessage: "0=无限制", componentProps: { min: 0, max: 50 } },
        { field: "EditImage.timeout", label: "超时(分钟)", component: "InputNumber", required: false, bottomHelpMessage: "默认5，最大120", componentProps: { min: 1, max: 120 } },
        { field: "EditImage.userLock", label: "用户锁", component: "Switch", required: false, bottomHelpMessage: "默认开启" },
        {
          field: "EditImage.moderation",
          label: "内容审核",
          component: "Select",
          required: false,
          componentProps: { options: [{ label: "auto（正常）", value: "auto" }, { label: "low（放宽）", value: "low" }] },
        },
        { field: "EditImage.defaultSize", label: "默认尺寸", component: "Input", required: false },
        { field: "EditImage.defaultQuality", label: "默认质量", component: "Input", required: false },
        { field: "EditImage.defaultFormat", label: "默认格式", component: "Input", required: false },
        { field: "EditImage.defaultModeration", label: "默认审核", component: "Input", required: false },
        { field: "EditImage.requirePermission", label: "需要权限", component: "Switch", required: false },
        { field: "EditImage.whitelist", label: "白名单群", component: "GSelectGroup", required: false, componentProps: { multiple: true } },
        { field: "EditImage.blacklist", label: "黑名单群", component: "GSelectGroup", required: false, componentProps: { multiple: true } },
        {
          field: "EditImage.tasks",
          label: "修图提示词",
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

        // ==================== 其他 ====================
        {
          label: "其他",
          component: "SOFT_GROUP_BEGIN",
        },
        {
          label: "web编辑器",
          component: "Divider",
        },
        { field: "webeditor.port", label: "端口", component: "InputNumber", required: true, componentProps: { min: 1, max: 65535 } },
        { field: "webeditor.password", label: "密码", component: "Input", required: true },
        {
          label: "图片缓存",
          bottomHelpMessage: "仅清理插件 data/tmp 目录中生成或下载的临时图片，不影响配置和其他数据",
          component: "GButtons",
          componentProps: {
            buttons: [
              {
                label: "一键清理图片缓存",
                action: "clearImageCache",
                danger: true,
                icon: "ant-design:delete-outlined",
                confirm: {
                  title: "确认清理图片缓存",
                  content: "确定要清理已下载和生成的临时图片吗？",
                  okText: "清理",
                  cancelText: "取消",
                },
              },
            ],
          },
        },
      ],

      actions: {
        async clearImageCache(_args, { Result }) {
          try {
            const result = await clearImageCacheFiles()
            const message = result.deletedCount > 0
              ? `已清理 ${result.deletedCount} 张图片缓存`
              : "图片缓存已经是空的"
            return Result.ok(result, message)
          } catch (error) {
            const log = global.logger || console
            log.error(`[sakura-plugin] Guoba 清理图片缓存失败: ${error.message}`)
            return Result.error(`清理图片缓存失败: ${error.message}`)
          }
        },
      },

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
