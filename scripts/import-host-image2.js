#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, readJson, writeJson } from "../src/utils/files.js";

const [requestPathArg, imagePathArg] = process.argv.slice(2);
if (!requestPathArg || !imagePathArg) {
  console.error("Usage: npm run import-image2 -- <request-json> <generated-image-path>");
  process.exit(1);
}

const cwd = process.cwd();
const requestPath = path.isAbsolute(requestPathArg) ? requestPathArg : path.join(cwd, requestPathArg);
const imagePath = path.isAbsolute(imagePathArg) ? imagePathArg : path.join(cwd, imagePathArg);
const request = await readJson(requestPath, null);
if (!request?.targetPath) throw new Error(`Invalid image2 host request: ${requestPath}`);

const targetPath = path.isAbsolute(request.targetPath) ? request.targetPath : path.join(cwd, request.targetPath);
await ensureDir(path.dirname(targetPath));
await fs.copyFile(imagePath, targetPath);
const bytes = await fs.readFile(targetPath);
const report = {
  ok: true,
  mode: "codex-built-in-imagegen",
  requestPath,
  sourcePath: imagePath,
  targetPath,
  bytes: bytes.length,
  signature: bytes.subarray(0, 12).toString("hex"),
  importedAt: new Date().toISOString()
};
await writeJson(requestPath.replace(/request\.json$/, "import-report.json"), report);
console.log(JSON.stringify(report, null, 2));
