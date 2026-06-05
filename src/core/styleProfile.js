import path from "node:path";
import { AiClient } from "./aiClient.js";
import { readArticle } from "./articleReader.js";
import { fetchHistoryArticle } from "./historyFetcher.js";
import { ensureDir, listInputFiles, readJson, writeJson } from "../utils/files.js";

export function profilePath(cwd, profileName = "default") {
  return path.join(cwd, "profiles", profileName, "style-profile.json");
}

export function rawHistoryPath(cwd, profileName = "default") {
  return path.join(cwd, "profiles", profileName, "raw-history.json");
}

export function historyInboxPath(cwd, profileName = "default") {
  return path.join(cwd, "profiles", profileName, "inbox");
}

export async function loadStyleProfile(cwd, profileName = "default") {
  return readJson(profilePath(cwd, profileName), null);
}

export async function importHistoryLinks(links, { cwd = process.cwd(), profileName = "default", aiClient = new AiClient() } = {}) {
  const articles = [];
  const failures = [];
  for (const url of links.map((line) => line.trim()).filter(Boolean)) {
    try {
      articles.push(await fetchHistoryArticle(url));
    } catch (error) {
      failures.push({ url, error: error.message });
    }
  }
  if (!articles.length) {
    throw new Error(`No history articles could be imported. First failure: ${failures[0]?.error || "unknown"}`);
  }
  return saveHistoryArticles(articles, { cwd, profileName, aiClient, failures });
}

export async function importHistoryTexts(items, { cwd = process.cwd(), profileName = "default", aiClient = new AiClient() } = {}) {
  const articles = items
    .map((item, index) => ({
      url: "",
      sourcePath: item.sourcePath || "",
      title: item.title || `手动导入文章 ${index + 1}`,
      digest: item.digest || "",
      publishTime: item.publishTime || "",
      text: String(item.text || "").trim(),
      cover: "",
      images: []
    }))
    .filter((article) => article.text);
  if (!articles.length) throw new Error("No history article text was provided.");
  return saveHistoryArticles(articles, { cwd, profileName, aiClient });
}

export async function importHistoryFiles(targetPath, { cwd = process.cwd(), profileName = "default", aiClient = new AiClient() } = {}) {
  const files = await listInputFiles(targetPath);
  const articles = [];
  for (const filePath of files) {
    const article = await readArticle(filePath);
    articles.push({
      url: "",
      sourcePath: filePath,
      title: article.metadata.title || path.basename(filePath, path.extname(filePath)),
      digest: article.metadata.digest || "",
      publishTime: article.metadata.publishTime || article.metadata.date || "",
      text: article.rawText,
      cover: "",
      images: []
    });
  }
  if (!articles.length) throw new Error(`No supported history files found in ${targetPath}`);
  return saveHistoryArticles(articles, { cwd, profileName, aiClient });
}

export async function refreshStyleProfile({ cwd = process.cwd(), profileName = "default", aiClient = new AiClient() } = {}) {
  await ensureDir(historyInboxPath(cwd, profileName));
  const inboxFiles = await safeListInputFiles(historyInboxPath(cwd, profileName));
  if (inboxFiles.length) {
    await importHistoryFiles(historyInboxPath(cwd, profileName), { cwd, profileName, aiClient });
  }
  const raw = await loadRawHistory(cwd, profileName);
  if (!raw.articles.length) {
    throw new Error(`No history articles saved yet. Add links, paste text, or put files into ${historyInboxPath(cwd, profileName)}.`);
  }
  const profile = await buildStyleProfile(raw.articles, { profileName, aiClient });
  await writeJson(profilePath(cwd, profileName), profile);
  return { profile, articles: raw.articles, failures: raw.failures || [], inboxPath: historyInboxPath(cwd, profileName) };
}

export async function saveHistoryArticles(newArticles, { cwd = process.cwd(), profileName = "default", aiClient = new AiClient(), failures = [] } = {}) {
  await ensureDir(historyInboxPath(cwd, profileName));
  const raw = await loadRawHistory(cwd, profileName);
  const merged = mergeArticles(raw.articles, newArticles);
  const allFailures = [...(raw.failures || []), ...failures];
  const profile = await buildStyleProfile(merged, { profileName, aiClient });
  const saved = {
    articles: merged,
    failures: allFailures,
    inboxPath: historyInboxPath(cwd, profileName),
    updatedAt: new Date().toISOString()
  };
  await writeJson(rawHistoryPath(cwd, profileName), saved);
  await writeJson(profilePath(cwd, profileName), profile);
  return {
    profile,
    articles: merged,
    importedArticles: newArticles,
    failures,
    inboxPath: saved.inboxPath
  };
}

export async function buildStyleProfile(articles, { profileName = "default", aiClient = new AiClient() } = {}) {
  const sample = articles
    .slice(0, 8)
    .map((article, index) => `#${index + 1} ${article.title}\n${article.text.slice(0, 1800)}`)
    .join("\n\n---\n\n");
  const fallback = () => heuristicProfile(articles, profileName);
  return aiClient.json(
    "你是中文公众号写作风格分析师。只输出 JSON，不要复制原文长句。",
    `请从这些历史公众号文章中抽取作者写作特征，输出字段：profileName, articleCount, titlePatterns, openingPatterns, paragraphRhythm, signaturePhrases, argumentStyles, closingPatterns, bannedExpressions, visualStyle, sourceUrls, updatedAt。\n\n${sample}`,
    fallback
  );
}

function heuristicProfile(articles, profileName) {
  const titles = articles.map((article) => article.title).filter(Boolean);
  const allText = articles.map((article) => article.text).join("\n");
  const paragraphs = allText.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  const avgLength = paragraphs.length
    ? Math.round(paragraphs.reduce((sum, item) => sum + item.length, 0) / paragraphs.length)
    : 80;
  const signaturePhrases = extractFrequentPhrases(allText);
  return {
    profileName,
    articleCount: articles.length,
    titlePatterns: inferTitlePatterns(titles),
    openingPatterns: ["先给出问题或场景，再进入观点", "用短句降低进入门槛"],
    paragraphRhythm: `平均段落约 ${avgLength} 字，适合移动端短段落阅读`,
    signaturePhrases,
    argumentStyles: ["观点先行", "用具体场景承接抽象判断", "段落之间保持连续推进"],
    closingPatterns: ["用开放问题或行动建议收尾"],
    bannedExpressions: ["众所周知", "毋庸置疑", "赋能"],
    visualStyle: "干净、克制、信息密度适中，偏现代公众号内容运营风格",
    sourceUrls: articles.map((article) => article.url).filter(Boolean),
    updatedAt: new Date().toISOString()
  };
}

async function loadRawHistory(cwd, profileName) {
  const raw = await readJson(rawHistoryPath(cwd, profileName), null);
  return {
    articles: Array.isArray(raw?.articles) ? raw.articles : [],
    failures: Array.isArray(raw?.failures) ? raw.failures : []
  };
}

function mergeArticles(existing, incoming) {
  const byKey = new Map();
  for (const article of [...existing, ...incoming]) {
    const key = articleKey(article);
    if (!key) continue;
    byKey.set(key, normalizeHistoryArticle(article));
  }
  return [...byKey.values()];
}

function articleKey(article) {
  if (article.url) return `url:${article.url}`;
  if (article.sourcePath) return `path:${article.sourcePath}`;
  const title = article.title || "";
  const text = article.text || "";
  if (!text) return "";
  return `text:${title}:${text.slice(0, 120)}`;
}

function normalizeHistoryArticle(article) {
  return {
    url: article.url || "",
    sourcePath: article.sourcePath || "",
    title: article.title || "未命名历史文章",
    digest: article.digest || "",
    publishTime: article.publishTime || "",
    text: article.text || "",
    cover: article.cover || "",
    images: Array.isArray(article.images) ? article.images : []
  };
}

async function safeListInputFiles(targetPath) {
  try {
    return await listInputFiles(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function inferTitlePatterns(titles) {
  const patterns = new Set();
  for (const title of titles) {
    if (title.includes("：") || title.includes(":")) patterns.add("主题：判断/解释");
    if (title.includes("？") || title.includes("?")) patterns.add("问题式标题");
    if (title.length <= 16) patterns.add("短标题，直接给观点");
    if (/\d/.test(title)) patterns.add("数字清单式标题");
  }
  if (!patterns.size) patterns.add("观点明确、避免标题党");
  return [...patterns];
}

function extractFrequentPhrases(text) {
  const candidates = ["其实", "换句话说", "更重要的是", "说到底", "问题在于", "也就是说", "我更愿意"];
  return candidates.filter((phrase) => text.includes(phrase)).slice(0, 8);
}
