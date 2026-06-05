import fs from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function generateWithAgnesImageSkill({
  prompt,
  outputPath,
  size,
  cwd = process.cwd(),
  skillDir = path.join(cwd, "skill", "agnes-image-gen")
}) {
  const scriptPath = path.join(skillDir, "scripts", "generate_image.py");
  if (!(await exists(scriptPath))) return null;

  const command = await resolveAgnesCommand();
  if (!command) return null;

  const outputDir = path.join(path.dirname(outputPath), ".agnes-tmp");
  await fs.mkdir(outputDir, { recursive: true });
  const before = await listFiles(outputDir);
  const args = buildArgs({ scriptPath, prompt, outputDir, size });
  try {
    const agnesEnv = await loadAgnesEnv();
    await execFileAsync(command.bin, [...command.prefixArgs, ...args], {
      cwd,
      timeout: Number(process.env.AGNES_IMAGE_TIMEOUT_MS || 180000),
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        ...agnesEnv,
        AGNES_IMAGE_SKILL_DIR: skillDir
      }
    });
    const generated = await newestGeneratedFile(outputDir, before);
    if (!generated) return null;
    await fs.rename(generated, outputPath);
    return outputPath;
  } catch (error) {
    if (process.env.AGNES_IMAGE_STRICT === "1") {
      throw new Error(`agnes-image-gen failed: ${error.message}`);
    }
    return null;
  }
}

async function loadAgnesEnv() {
  if (process.env.AGNES_API_KEY) return {};
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(homedir(), ".zshrc"),
    path.join(homedir(), ".bashrc")
  ];
  for (const filePath of candidates) {
    const value = await readEnvAssignment(filePath, "AGNES_API_KEY");
    if (value) return { AGNES_API_KEY: value };
  }
  return {};
}

async function readEnvAssignment(filePath, key) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const pattern = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?${key}=([^\\n#]+)`);
    const match = text.match(pattern);
    if (!match) return "";
    return match[1].trim().replace(/^['"]|['"]$/g, "");
  } catch {
    return "";
  }
}

export async function resolveAgnesCommand() {
  if (process.env.AGNES_IMAGE_GEN_COMMAND) {
    const [bin, ...prefixArgs] = splitCommand(process.env.AGNES_IMAGE_GEN_COMMAND);
    return { bin, prefixArgs };
  }
  if (await commandExists("python3")) return { bin: "python3", prefixArgs: [] };
  if (await commandExists("python")) return { bin: "python", prefixArgs: [] };
  return null;
}

function buildArgs({ scriptPath, prompt, outputDir, size }) {
  const args = [scriptPath, prompt, "--output-dir", outputDir];
  const apiKey = process.env.AGNES_API_KEY;
  const model = process.env.AGNES_IMAGE_MODEL || "agnes-image-2.0-flash";
  if (apiKey) args.push("--api-key", apiKey);
  if (model) args.push("--model", model);
  if (size) args.push("--size", normalizeAgnesSize(size));
  return args;
}

function normalizeAgnesSize(size) {
  const match = String(size || "").match(/^(\d+)x(\d+)$/);
  if (!match) return "1024x1024";
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return "1024x1024";
  return "1024x1024";
}

async function commandExists(command) {
  try {
    await execFileAsync("which", [command], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function splitCommand(value) {
  return String(value).trim().split(/\s+/).filter(Boolean);
}

async function listFiles(dirPath) {
  try {
    const entries = await fs.readdir(dirPath);
    return new Set(entries.map((entry) => path.join(dirPath, entry)));
  } catch {
    return new Set();
  }
}

async function newestGeneratedFile(dirPath, before) {
  const entries = await fs.readdir(dirPath);
  const candidates = [];
  for (const entry of entries) {
    const filePath = path.join(dirPath, entry);
    if (before.has(filePath)) continue;
    const ext = path.extname(entry).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;
    const stat = await fs.stat(filePath);
    candidates.push({ filePath, mtimeMs: stat.mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.filePath || null;
}
