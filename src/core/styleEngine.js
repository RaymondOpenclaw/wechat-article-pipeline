import path from "node:path";
import { ensureDir, writeJson } from "../utils/files.js";
import { historyInboxPath, loadStyleProfile, profilePath, refreshStyleProfile } from "./styleProfile.js";

export function styleArtifactsDir(cwd, profileName = "default") {
  return path.join(cwd, "profiles", profileName);
}

export function stylePromptPath(cwd, profileName = "default") {
  return path.join(styleArtifactsDir(cwd, profileName), "style-prompt.md");
}

export function styleSkillPath(cwd, profileName = "default") {
  return path.join(styleArtifactsDir(cwd, profileName), "STYLE_SKILL.md");
}

export async function refreshStyleArtifacts({ cwd = process.cwd(), profileName = "default", aiClient } = {}) {
  const result = await refreshStyleProfile({ cwd, profileName, aiClient });
  return writeStyleArtifacts({ cwd, profileName, profile: result.profile, articles: result.articles, failures: result.failures });
}

export async function inspectStyleEngine({ cwd = process.cwd(), profileName = "default" } = {}) {
  const profile = await loadStyleProfile(cwd, profileName);
  return {
    profile,
    inboxPath: historyInboxPath(cwd, profileName),
    profilePath: profilePath(cwd, profileName),
    stylePromptPath: stylePromptPath(cwd, profileName),
    styleSkillPath: styleSkillPath(cwd, profileName)
  };
}

export async function writeStyleArtifacts({ cwd = process.cwd(), profileName = "default", profile, articles = [], failures = [] } = {}) {
  if (!profile) throw new Error("Style profile is required before writing style artifacts.");
  const dir = styleArtifactsDir(cwd, profileName);
  await ensureDir(dir);
  const prompt = buildStylePrompt(profile);
  const skill = buildStyleSkill(profile, prompt);
  const manifest = {
    profileName,
    articleCount: profile.articleCount || articles.length || 0,
    stylePromptPath: stylePromptPath(cwd, profileName),
    styleSkillPath: styleSkillPath(cwd, profileName),
    failures,
    updatedAt: new Date().toISOString()
  };
  await Promise.all([
    BunSafeWrite(stylePromptPath(cwd, profileName), prompt),
    BunSafeWrite(styleSkillPath(cwd, profileName), skill),
    writeJson(path.join(dir, "style-artifacts.json"), manifest)
  ]);
  return {
    profile,
    articles,
    failures,
    inboxPath: historyInboxPath(cwd, profileName),
    ...manifest
  };
}

export function buildStylePrompt(profile) {
  return [
    "# 个人公众号写作风格约束提示词",
    "",
    "你正在按照作者历史文章提炼出的风格写公众号文章。请迁移结构、节奏、表达偏好和论证习惯，不要复制历史文章原句。",
    "",
    `- 标题结构：${list(profile.titlePatterns)}`,
    `- 开头方式：${list(profile.openingPatterns)}`,
    `- 段落节奏：${profile.paragraphRhythm || "短段落，适合手机阅读"}`,
    `- 高频表达：${list(profile.signaturePhrases)}`,
    `- 论证方式：${list(profile.argumentStyles)}`,
    `- 结尾习惯：${list(profile.closingPatterns)}`,
    `- 禁用表达：${list(profile.bannedExpressions)}`,
    `- 视觉气质：${profile.visualStyle || "干净、克制、信息密度适中"}`,
    "",
    "执行要求：",
    "1. 保留用户原始观点和事实，不新增未经支持的案例。",
    "2. 优先让文章读起来像作者本人，而不是通用 AI 总结。",
    "3. 适配微信公众号手机阅读：短段落、清晰小标题、重点句、引用块、行动清单。",
    "4. 风格迁移只迁移表达习惯和结构偏好，不照搬历史文章句子。"
  ].join("\n");
}

export function buildStyleSkill(profile, prompt) {
  return [
    "---",
    `name: ${profile.profileName || "wechat-author-style"}`,
    "description: Apply the author's extracted WeChat writing style to new article drafts.",
    "agent_created: true",
    "---",
    "",
    "# 公众号个人写作风格 Skill",
    "",
    "## 使用场景",
    "",
    "当需要把用户给出的想法、课程记录、口语稿或文章草稿改写成公众号文章时，先加载本 skill。",
    "",
    "## 风格约束",
    "",
    prompt,
    "",
    "## 输出要求",
    "",
    "- 输出公众号成稿，而不是摘要。",
    "- 每篇文章必须包含标题、摘要、正文 HTML、改动说明。",
    "- 文章要让读者看得舒服、有收获，并有自然的点赞/转发理由。"
  ].join("\n");
}

function list(value) {
  return Array.isArray(value) && value.length ? value.join("；") : "暂无，按克制、清晰、自然的公众号表达处理";
}

async function BunSafeWrite(filePath, content) {
  const fs = await import("node:fs/promises");
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${content}\n`, "utf8");
}
