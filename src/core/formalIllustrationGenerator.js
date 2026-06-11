import fs from "node:fs/promises";
import path from "node:path";
import { illustrativePng } from "./imageGenerator.js";
import { ensureDir, slugify } from "../utils/files.js";
import { escapeHtml, formalIllustrationPlaceholder } from "../utils/html.js";

export async function generateFormalIllustrations(article, {
  cwd = process.cwd(),
  config = {},
  hostedImagePaths = []
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
    const hostedSourcePath = await resolveHostedImagePath({ cwd, config, hostedImagePaths, number });
    const requestPath = await writeHostImage2Request({
      cwd,
      article,
      illustration,
      index: number,
      prompt,
      targetPath: filePath,
      sourcePath: hostedSourcePath
    });
    const imported = hostedSourcePath ? await copyHostedImage(hostedSourcePath, filePath) : false;
    if (!imported) await fs.writeFile(filePath, illustrativePng("formal-illustration", prompt));
    const generator = imported ? "codex-built-in-imagegen" : "codex-built-in-imagegen-pending";
    formalIllustrations.push({
      kind: "formal-illustration",
      index: number,
      prompt,
      localPath: filePath,
      generator,
      requestPath,
      sourcePath: hostedSourcePath,
      status: imported ? "ready" : "needs-host-image-generation",
      error: imported ? "" : "Codex built-in image_gen output has not been imported yet.",
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
      `已生成 ${formalIllustrations.length} 个 Codex 内置 image2 宿主请求，并将可用图片放回正文原位置`
    ]
  };
}

export function buildImage2Prompt(article, illustration, index) {
  return [
    "Use case: illustration-story",
    "Asset type: WeChat article inline editorial illustration",
    "Primary request: Render the ASCII sketch as a polished bitmap illustration using Codex built-in gpt-image-2/image_gen, not an API client.",
    "Scene/backdrop: quiet human-scale editorial scene with warm calm light and balanced negative space for mobile reading.",
    "Subject: the article's metaphor, expressed through simple objects or one subtle human figure.",
    "Style: clean modern editorial illustration, human warmth, clear metaphor, soft depth, restrained premium magazine composition.",
    "Avoid: readable text, Chinese characters, labels, UI screenshots, logos, brand marks, watermarks, QR codes, decorative blobs.",
    "Output: square PNG/WebP suitable for 1024x1024 inline use.",
    `Article title: ${article.title || ""}`,
    `Article digest: ${article.digest || ""}`,
    `Illustration ${index} caption: ${illustration.caption || ""}`,
    "ASCII sketch:",
    illustration.sketch || ""
  ].join("\n");
}

export async function writeHostImage2Request({
  cwd = process.cwd(),
  article,
  illustration,
  index,
  prompt,
  targetPath,
  sourcePath = ""
}) {
  const dir = path.join(cwd, "data", "image2-requests");
  await ensureDir(dir);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const requestPath = path.join(dir, `${stamp}-${slugify(article.title || "article")}-${index}.json`);
  const request = {
    mode: "codex-built-in-imagegen",
    model: "gpt-image-2",
    status: sourcePath ? "source-provided" : "pending-host-generation",
    articleTitle: article.title || "",
    articleDigest: article.digest || "",
    index,
    caption: illustration.caption || "",
    asciiSketch: illustration.sketch || "",
    prompt,
    targetPath,
    sourcePath,
    instructions: [
      "Use Codex built-in image_gen tool with this prompt.",
      "After generation, copy the selected image into targetPath.",
      "Do not use OPENAI_API_KEY or any runtime API client for this request."
    ],
    createdAt: new Date().toISOString()
  };
  await fs.writeFile(requestPath, JSON.stringify(request, null, 2), "utf8");
  return requestPath;
}

async function resolveHostedImagePath({ cwd, config, hostedImagePaths, number }) {
  const configured = config.formalIllustration?.hostedImagePaths || config.formalIllustration?.hostedImages || [];
  const candidates = Array.isArray(hostedImagePaths) && hostedImagePaths.length ? hostedImagePaths : configured;
  if (Array.isArray(candidates)) return absolutePath(cwd, candidates[number - 1] || "");
  return absolutePath(cwd, candidates[String(number)] || candidates[formalIllustrationPlaceholder(number)] || "");
}

async function copyHostedImage(sourcePath, targetPath) {
  if (!sourcePath) return false;
  try {
    await ensureDir(path.dirname(targetPath));
    await fs.copyFile(sourcePath, targetPath);
    return true;
  } catch {
    return false;
  }
}

function absolutePath(cwd, value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return path.isAbsolute(text) ? text : path.join(cwd, text);
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
