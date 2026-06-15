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
      sampleType: item.sampleType || "published",
      revisionOf: item.revisionOf || "",
      weight: Number(item.weight || 1),
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
      sampleType: article.metadata.sampleType || "published",
      revisionOf: article.metadata.revisionOf || "",
      weight: Number(article.metadata.weight || 1),
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
  const sample = [...articles]
    .sort((a, b) => sampleWeight(b) - sampleWeight(a))
    .slice(0, 8)
    .map((article, index) => `#${index + 1} ${article.title}\n样本类型：${article.sampleType || "published"}；权重：${sampleWeight(article)}${article.revisionOf ? `；作者校改自：${article.revisionOf}` : ""}\n${article.text.slice(0, 2200)}`)
    .join("\n\n---\n\n");
  const fallback = () => heuristicProfile(articles, profileName);
  return aiClient.json(
    "你是中文公众号写作风格分析师。只输出 JSON，不要复制原文长句。",
    `请从这些历史公众号文章中抽取作者写作特征。author_revision 是作者亲自改过的高权重样本，应重点分析作者主动新增、删除和保留的表达。输出字段：profileName, articleCount, titlePatterns, openingPatterns, paragraphRhythm, signaturePhrases, argumentStyles, closingPatterns, voiceTone, sentencePatterns, formattingPatterns, evidencePreferences, humorStyle, editingPreferences, fidelityRules, bannedExpressions, visualStyle, sourceUrls, updatedAt。\n\n${sample}`,
    fallback
  );
}

function heuristicProfile(articles, profileName) {
  const titles = articles.map((article) => article.title).filter(Boolean);
  const allText = articles.map((article) => article.text).join("\n");
  const paragraphs = allText.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  const revisionText = articles.filter((article) => article.sampleType === "author_revision").map((article) => article.text).join("\n");
  const shortLineRatio = lineRatio(revisionText || allText, (line) => line.length <= 24);
  const avgLength = paragraphs.length
    ? Math.round(paragraphs.reduce((sum, item) => sum + item.length, 0) / paragraphs.length)
    : 80;
  const signaturePhrases = extractFrequentPhrases(allText);
  return {
    profileName,
    articleCount: articles.length,
    titlePatterns: inferTitlePatterns(titles),
    openingPatterns: ["从最近发生的真实对话、课程或观察切入", "连续短句交代触发场景，再命名核心概念", "不急着先讲大道理"],
    paragraphRhythm: shortLineRatio >= 0.55
      ? "一行一个意思，大量 8-30 字短段落；关键判断单独成行，连续排比形成手机阅读节奏"
      : `平均段落约 ${avgLength} 字，适合移动端短段落阅读`,
    signaturePhrases,
    argumentStyles: ["先讲亲历或具体行业现象，再命名一个概念", "用三段式分类展开核心判断", "保留真实项目、岗位和行业术语增强现场感", "先给锋利判断，再补一段平衡视角", "结尾用平行句完成认知升级"],
    closingPatterns: ["回扣文章核心概念", "用三组平行转向句收束", "最后用两到三行短句留下明确判断"],
    voiceTone: ["第一人称现场感", "口语直接，不端着", "有一点自嘲和职场黑色幽默", "判断锋利但不把话说绝"],
    sentencePatterns: ["允许不完整句和名词短语单独成段", "多用重复、排比和递进", "少用首先、其次、综上等论文式连接词", "抽象判断后紧跟真实岗位或项目例子"],
    formattingPatterns: ["一行一个观点或画面", "小标题采用“主题：直接判断”", "重点问句和金句单独成段", "列表优先使用连续短行而非长段解释"],
    evidencePreferences: ["优先作者亲历、连麦对话和身边观察", "保留具体岗位、项目名、PPT、KPI、ROI 等行业语汇", "涉及具体公司项目结果时标记核实，不替作者扩大结论"],
    humorStyle: ["可少量使用当牛马、苟着、砸钱凑故事等熟人式职场口语", "幽默用于降低说教感，不连续玩梗"],
    editingPreferences: ["不要把短句合并成长段", "不要为了完整而补充过多正确但无现场感的解释", "保留作者的具体例子、情绪力度和不完全对称的口语节奏", "修正错字和歧义，但不过度书面化"],
    fidelityRules: ["作者亲自校改稿权重高于 AI 初稿和普通历史文章", "不新增作者没有提供的数据、人物评价和项目结论", "具体项目或人物判断在发布前应提醒作者核实", "保留核心立场，同时让读者能看懂上下文"],
    bannedExpressions: ["众所周知", "毋庸置疑", "赋能", "在这个快速变化的时代", "值得注意的是", "不难发现", "综上所述"],
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
    images: Array.isArray(article.images) ? article.images : [],
    sampleType: article.sampleType || "published",
    revisionOf: article.revisionOf || "",
    weight: sampleWeight(article)
  };
}

function sampleWeight(article) {
  const explicit = Number(article?.weight || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return article?.sampleType === "author_revision" ? 3 : 1;
}

function lineRatio(text, predicate) {
  const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return 0;
  return lines.filter(predicate).length / lines.length;
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
    if (title.includes("，") || title.includes(",")) patterns.add("前半句呈现变化，后半句命名趋势或给出判断");
    if (title.length <= 16) patterns.add("短标题，直接给观点");
    if (/\d/.test(title)) patterns.add("数字清单式标题");
  }
  if (!patterns.size) patterns.add("观点明确、避免标题党");
  return [...patterns];
}

function extractFrequentPhrases(text) {
  const candidates = ["其实", "换句话说", "更重要的是", "说到底", "问题在于", "也就是说", "我更愿意", "越来越", "真正", "只是", "特别是", "依然", "可能"];
  return candidates.filter((phrase) => text.includes(phrase)).slice(0, 8);
}
