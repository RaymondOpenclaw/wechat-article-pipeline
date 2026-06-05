import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function readArticle(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let rawText;
  if (ext === ".docx") {
    rawText = await readDocx(filePath);
  } else {
    rawText = await fs.readFile(filePath, "utf8");
  }
  const { metadata, body } = parseFrontmatter(rawText);
  return {
    sourcePath: filePath,
    rawText: body.trim(),
    metadata
  };
}

export function parseFrontmatter(text) {
  const match = String(text).match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { metadata: {}, body: text };
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    metadata[key] = value;
  }
  return { metadata, body: match[2] };
}

async function readDocx(filePath) {
  try {
    const { stdout } = await execFileAsync("unzip", ["-p", filePath, "word/document.xml"], {
      maxBuffer: 20 * 1024 * 1024
    });
    return stdout
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<\/w:p>/g, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch (error) {
    throw new Error(`Unable to read .docx file. Ensure unzip is installed and the file is valid: ${error.message}`);
  }
}
