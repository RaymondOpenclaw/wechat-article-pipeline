import fs from "node:fs/promises";
import path from "node:path";
import { AiClient } from "./aiClient.js";
import { illustrativePng } from "./imageGenerator.js";
import { ensureDir, slugify } from "../utils/files.js";
import { escapeHtml, formalIllustrationPlaceholder } from "../utils/html.js";

export async function generateFormalIllustrations(article, {
  cwd = process.cwd(),
  config = {},
  aiClient = new AiClient()
} = {}) {
  const asciiIllustrations = Array.isArray(article.asciiIllustrations) ? article.asciiIllustrations : [];
  if (config.formalIllustration?.enabled === false || !asciiIllustrations.length) {
    return {
      ...article,
      formalIllustrations: [],
      changeLog: [
        ...(article.changeLog || []),
        asciiIllustrations.length ? "正式插画生成已关闭，保留 ASCII sketch。" : "未发现 ASCII sketch，无需生成正式插画。"
      ]
    };
  }

  const dir = path.join(cwd, "generated", "images");
  await ensureDir(dir);
  const formalIllustrations = [];
  for (const [index, illustration] of asciiIllustrations.entries()) {
    const number = index + 1;
    const prompt = buildImage2Prompt(article, illustration, number);
    const filePath = path.join(dir, `${slugify(article.title)}-formal-illustration-${number}.png`);
    const { imageBuffer, error } = await requestImage2(aiClient, prompt, config);
    const generator = imageBuffer ? "image2" : "image2-fallback";
    await fs.writeFile(filePath, imageBuffer || illustrativePng("formal-illustration", prompt));
    formalIllustrations.push({
      kind: "formal-illustration",
      index: number,
      prompt,
      localPath: filePath,
      generator,
      error: error?.message || "",
      placeholder: formalIllustrationPlaceholder(number),
      caption: illustration.caption || "",
      asciiSketch: illustration.sketch || ""
    });
  }

  return {
    ...article,
    markdown: replaceMarkdownSketches(article.markdown, asciiIllustrations),
    html: replaceHtmlSketches(article.html, asciiIllustrations),
    formalIllustrations,
    changeLog: [
      ...(article.changeLog || []),
      `使用 image2 将 ${formalIllustrations.length} 个 ASCII sketch 转为正式插画，并保留原正文位置`
    ]
  };
}

async function requestImage2(aiClient, prompt, config) {
  try {
    return {
      imageBuffer: await aiClient.image(prompt, {
        model: config.formalIllustration?.model || process.env.IMAGE2_MODEL || "gpt-image-1",
        size: config.formalIllustration?.size || "1024x1024",
        quality: config.formalIllustration?.quality || "",
        outputFormat: config.formalIllustration?.outputFormat || ""
      }),
      error: null
    };
  } catch (error) {
    return { imageBuffer: null, error };
  }
}

export function buildImage2Prompt(article, illustration, index) {
  return [
    "Create a refined editorial illustration for a WeChat article.",
    "Use the ASCII sketch as composition guidance, but render it as a polished bitmap illustration.",
    "No readable text, no Chinese characters, no labels, no UI screenshots.",
    "The image should feel calm, professional, and suitable for mobile reading.",
    "Style: clean modern editorial illustration, human warmth, clear metaphor, soft depth, balanced negative space.",
    `Article title: ${article.title || ""}`,
    `Article digest: ${article.digest || ""}`,
    `Illustration ${index} caption: ${illustration.caption || ""}`,
    "ASCII sketch:",
    illustration.sketch || ""
  ].join("\n");
}

export function replaceMarkdownSketches(markdown, illustrations) {
  let output = String(markdown || "");
  for (const [index, illustration] of illustrations.entries()) {
    const placeholder = formalIllustrationPlaceholder(index + 1);
    const caption = illustration.caption ? `_${illustration.caption}_` : "";
    const imageBlock = `![${markdownAlt(illustration.caption || `插画 ${index + 1}`)}](${placeholder})`;
    const exactBlock = [
      "```text",
      illustration.sketch,
      "```",
      caption
    ].filter((line) => line !== "").join("\n");
    if (output.includes(exactBlock)) {
      output = output.replace(exactBlock, imageBlock);
      continue;
    }
    output = output.replace(asciiCodeFencePattern(illustration.sketch), imageBlock);
  }
  return output;
}

export function replaceHtmlSketches(html, illustrations) {
  let output = String(html || "");
  for (const [index, illustration] of illustrations.entries()) {
    const placeholder = formalIllustrationPlaceholder(index + 1);
    const captionHtml = illustration.caption
      ? `<p style="margin:8px 0 18px;font-size:13px;line-height:1.8;color:#687782;">${escapeHtml(illustration.caption)}</p>`
      : "";
    const escapedSketch = escapeRegExp(escapeHtml(illustration.sketch || ""));
    const escapedCaption = illustration.caption ? escapeRegExp(captionHtml) : "";
    const exactPattern = new RegExp(
      `<pre\\b[^>]*data-role=["']ascii-illustration["'][^>]*>\\s*${escapedSketch}\\s*<\\/pre>\\s*${escapedCaption}`,
      "g"
    );
    const replaced = output.replace(exactPattern, `<p>${placeholder}</p>`);
    if (replaced !== output) {
      output = replaced;
      continue;
    }
    output = output.replace(/<pre\b[^>]*data-role=["']ascii-illustration["'][^>]*>[\s\S]*?<\/pre>\s*(?:<p\b[^>]*>[\s\S]*?<\/p>)?/, `<p>${placeholder}</p>`);
  }
  return output;
}

function asciiCodeFencePattern(sketch) {
  return new RegExp(`\\\`\\\`\\\`text\\s*${escapeRegExp(String(sketch || ""))}\\s*\\\`\\\`\\\`\\s*(?:_[^_]+_)?`, "g");
}

function markdownAlt(value) {
  return String(value || "插画").replace(/[\[\]\n\r]/g, " ").trim() || "插画";
}

function escapeRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
