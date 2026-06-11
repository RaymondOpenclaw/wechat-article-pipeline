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
    id: "content_completion",
    name: "内容完整度补全",
    level: "core",
    responsibility: "在文章成稿前补齐背景、概念、逻辑桥梁、读者疑问和建议大纲，同时标出不能编造的事实边界。",
    entrypoints: ["completeArticleInformation()", "POST /api/workflows/run-step"],
    outputs: ["content-brief artifact", "missingInfo", "safeSupplements", "suggestedOutline"]
  },
  {
    id: "editor_review",
    name: "文章编辑审稿",
    level: "core",
    responsibility: "以专业公众号编辑身份检查成稿是否读懂原文、逻辑通顺、观点忠实，未通过时暂停后续配图、归档和上传。",
    entrypoints: ["reviewArticleDraft()", "POST /api/workflows/run-step"],
    outputs: ["editor-review artifact", "scores", "issues", "recommendedEdits"]
  },
  {
    id: "formal_illustration_engine",
    name: "ASCII 转 image2 正式插画",
    level: "core",
    responsibility: "在成稿插入 ASCII sketch 后暂停确认，再调用 image2 生成正式插画，替换回正文原位置并进入上传映射。",
    entrypoints: ["generateFormalIllustrations()", "POST /api/workflows/run-step"],
    outputs: ["formal illustration images", "FORMAL_ILLUSTRATION placeholders", "image prompt records"]
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
      contentCompletionRequiredBeforeTransform: true,
      formalIllustrationConfirmationRequired: true,
      editorApprovalRequiredBeforeVisual: true,
      nodeLevelAudit: true,
      editableNodes: ["transform", "visual"],
      localArchiveRequiredBeforeUpload: true
    }
  };
}
