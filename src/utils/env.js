import fs from "node:fs";
import path from "node:path";

export function loadDotEnv(cwd = process.cwd()) {
  const envPath = path.join(cwd, ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = rest.join("=").replace(/^['"]|['"]$/g, "");
    }
  }
}

export function requireEnv(keys) {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
