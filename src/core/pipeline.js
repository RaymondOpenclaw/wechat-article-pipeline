import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { readArticle } from "./articleReader.js";
import { AiClient } from "./aiClient.js";
import { loadStyleProfile } from "./styleProfile.js";
import { completeArticleInformation } from "./contentCompleter.js";
import { transformArticle } from "./articleTransformer.js";
import { createVisualBrief } from "./visualBrief.js";
import { generateImages } from "./imageGenerator.js";
import { ensureDir, writeJson, slugify } from "../utils/files.js";
import { replaceImagePlaceholderHtml } from "../utils/html.js";

export async function processArticle(filePath, { cwd = process.cwd(), config = null, aiClient = new AiClient() } = {}) {
  const resolvedConfig = config || await loadConfig(cwd);
  const input = await readArticle(filePath);
  const styleProfile = resolvedConfig.useHistoryStyle
    ? await loadStyleProfile(cwd, resolvedConfig.profileName)
    : null;
  const contentBrief = await completeArticleInformation(input, { styleProfile, config: resolvedConfig, aiClient });
  const transformed = await transformArticle(input, { styleProfile, contentBrief, config: resolvedConfig, aiClient });
  const visualBrief = await createVisualBrief(transformed, { config: resolvedConfig, aiClient });
  const images = resolvedConfig.image?.enabled
    ? await generateImages(visualBrief, transformed, { cwd, config: resolvedConfig, aiClient })
    : [];
  const processed = {
    ...transformed,
    contentBrief,
    visualBrief,
    images
  };
  const taskPath = await saveTask(cwd, processed);
  const archive = await saveArticleArchive(cwd, processed);
  return {
    ...processed,
    taskPath,
    archive
  };
}

export async function saveTask(cwd, processedArticle) {
  const fileName = `${Date.now()}-${slugify(processedArticle.title)}.json`;
  const filePath = path.join(cwd, "data", "tasks", fileName);
  await writeJson(filePath, processedArticle);
  return filePath;
}

export async function saveArticleArchive(cwd, processedArticle) {
  const stamp = timestampForPath(new Date());
  const dirName = `${stamp}-${slugify(processedArticle.title)}`;
  const dirPath = path.join(cwd, "data", "articles", dirName);
  await ensureDir(dirPath);
  const markdownPath = path.join(dirPath, "article.md");
  const htmlPath = path.join(dirPath, "article.html");
  const jsonPath = path.join(dirPath, "article.json");
  const imagesPath = path.join(dirPath, "images.json");
  await Promise.all([
    writeArticleMarkdown(markdownPath, processedArticle),
    writeArticleHtml(htmlPath, processedArticle),
    writeJson(jsonPath, processedArticle),
    writeJson(imagesPath, processedArticle.images || [])
  ]);
  return {
    dirPath,
    markdownPath,
    htmlPath,
    jsonPath,
    imagesPath,
    savedAt: new Date().toISOString()
  };
}

async function writeArticleMarkdown(filePath, article) {
  await ensureDir(path.dirname(filePath));
  const frontmatter = [
    "---",
    `title: ${article.title}`,
    `digest: ${article.digest}`,
    `createdAt: ${article.createdAt}`,
    "---",
    ""
  ].join("\n");
  await fs.writeFile(filePath, `${frontmatter}${article.markdown}\n`, "utf8");
}

async function writeArticleHtml(filePath, article) {
  await ensureDir(path.dirname(filePath));
  let content = article.html;
  (article.images || [])
    .filter((image) => image.kind === "inline")
    .forEach((image, index) => {
      const imgHtml = `<p style="margin:22px 0;text-align:center;"><img src="${escapeHtml(image.localPath)}" alt="" style="max-width:100%;height:auto;border-radius:8px;" /></p>`;
      content = replaceImagePlaceholderHtml(content, index + 1, imgHtml);
    });
  content = content.replace(/\{\{INLINE_IMAGE_\d+\}\}/g, "");
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(article.title)}</title>
</head>
<body>
${content}
</body>
</html>
`;
  await fs.writeFile(filePath, html, "utf8");
}

function timestampForPath(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
