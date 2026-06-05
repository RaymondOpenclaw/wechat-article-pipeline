import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export function slugify(input) {
  return String(input || "article")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "article";
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function listInputFiles(targetPath) {
  const stat = await fs.stat(targetPath);
  if (stat.isFile()) return [targetPath];
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const supported = new Set([".md", ".txt", ".docx", ".html"]);
  return entries
    .filter((entry) => entry.isFile() && supported.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(targetPath, entry.name));
}
