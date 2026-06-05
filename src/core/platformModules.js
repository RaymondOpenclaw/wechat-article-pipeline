export const PLATFORM_MODULES = [
  {
    id: "article_workflow",
    name: "微信公众号文章生成主流程",
    level: "main",
    responsibility: "把输入想法或草稿转成可审、可改、可上传的公众号文章工作流。",
    entrypoints: ["POST /api/workflows/create", "POST /api/workflows/run-step", "POST /api/workflows/update-node"],
    outputs: ["workflow.json", "article.md", "article.html", "article.json"]
  },
  {
    id: "style_library",
    name: "历史文章风格分析与沉淀",
    level: "secondary",
    responsibility: "录入历史文章，持久化本地，提炼个人写作特征，并生成 prompt 与 STYLE_SKILL.md。",
    entrypoints: ["POST /api/profile/import-links", "POST /api/profile/import-text", "POST /api/profile/refresh", "GET /api/style-library"],
    outputs: ["raw-history.json", "style-profile.json", "style-prompt.md", "STYLE_SKILL.md"]
  },
  {
    id: "wechat_formatter",
    name: "微信兼容排版器",
    level: "core",
    responsibility: "将文章 HTML 清洗为微信公众号兼容的内联样式，并优化手机阅读节奏。",
    entrypoints: ["formatWechatHtml()"],
    outputs: ["wechat-compatible-html"]
  },
  {
    id: "visual_engine",
    name: "配图 Brief 与图片生成",
    level: "core",
    responsibility: "从文章结构生成封面与正文配图 brief，调用 Agnes 或 OpenAI-compatible 图片模型生成图片。",
    entrypoints: ["createVisualBrief()", "generateImages()"],
    outputs: ["cover.png", "inline images", "images.json"]
  },
  {
    id: "draft_upload",
    name: "微信公众号草稿上传",
    level: "core",
    responsibility: "上传封面永久素材、正文图片，并创建微信公众号草稿箱草稿；上传前必须确认。",
    entrypoints: ["uploadProcessedArticleWithStrategy()"],
    outputs: ["media_id", "upload log"]
  },
  {
    id: "secure_config",
    name: "安全与迁移配置",
    level: "secondary",
    responsibility: "本地密文保存公众号凭据和云主机登录信息，支持迁移时复制 secure 目录恢复调用能力。",
    entrypoints: ["GET /api/secrets/status", "POST /api/secrets/import-local"],
    outputs: ["data/secure/secrets.enc.json", "data/secure/master.key"]
  }
];

export function getPlatformArchitecture() {
  return {
    version: "0.2.0-upgrade",
    mainFlow: PLATFORM_MODULES.find((module) => module.id === "article_workflow"),
    secondaryMenus: PLATFORM_MODULES.filter((module) => module.level === "secondary"),
    coreEngines: PLATFORM_MODULES.filter((module) => module.level === "core"),
    workflowPolicy: {
      confirmationRequiredBeforeUpload: true,
      nodeLevelAudit: true,
      editableNodes: ["transform", "visual"],
      localArchiveRequiredBeforeUpload: true
    }
  };
}
