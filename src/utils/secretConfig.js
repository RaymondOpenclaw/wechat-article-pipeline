import fs from "node:fs/promises";
import path from "node:path";

export async function readSecretConfig(filePath, fallback = null) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return parseSecretConfig(text);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export function parseSecretConfig(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return {};
  try {
    return normalizeObject(JSON.parse(trimmed));
  } catch {
    return parseLooseConfig(trimmed);
  }
}

export function resolveConfigPath(cwd, filePath) {
  if (!filePath) return path.join(cwd, "config.json");
  return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
}

function parseLooseConfig(text) {
  const result = {};
  const positional = [];
  for (const line of text.split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean || clean.startsWith("#") || clean.startsWith("//")) continue;
    const match = clean.match(/^([^:=：]+)\s*[:：=]\s*(.+)$/);
    if (match) {
      const key = normalizeKey(match[1]);
      if (key) result[key] = stripQuotes(match[2].trim());
    } else {
      positional.push(stripQuotes(clean));
    }
  }
  if (!result.host) result.host = positional.find((item) => /^\d+\.\d+\.\d+\.\d+$/.test(item)) || "";
  if (!result.name && positional[0] && !/^\d+\.\d+\.\d+\.\d+$/.test(positional[0])) result.name = positional[0];
  return result;
}

function normalizeObject(value) {
  const result = {};
  for (const [key, item] of Object.entries(value || {})) {
    result[normalizeKey(key) || key] = item;
  }
  return result;
}

function normalizeKey(key) {
  const lower = String(key || "").trim().toLowerCase();
  const mapping = {
    ip: "host",
    hostname: "host",
    server: "host",
    user: "username",
    username: "username",
    account: "username",
    login: "username",
    pwd: "password",
    pass: "password",
    password: "password",
    workdir: "workDir",
    work_dir: "workDir",
    port: "port"
  };
  return mapping[lower] || lower;
}

function stripQuotes(value) {
  return String(value || "").replace(/^["']|["']$/g, "");
}
