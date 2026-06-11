#!/usr/bin/env node
import path from "node:path";
import { ensureDir, writeJson } from "../src/utils/files.js";

const cwd = process.cwd();
const outDir = path.join(cwd, "data", "diagnostics", "image2-host");
await ensureDir(outDir);

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const targetPath = path.join(outDir, `${stamp}-host-image2-test.png`);
const requestPath = path.join(outDir, `${stamp}-host-image2-request.json`);
const prompt = [
  "Use case: illustration-story",
  "Asset type: WeChat article inline editorial illustration",
  "Primary request: Create a calm editorial illustration of a person giving themselves a quiet pause before returning to work.",
  "Scene/backdrop: warm quiet evening commute or desk-side pause, human-scale, not corporate stock art.",
  "Subject: one subtle human figure or symbolic objects showing pressure, pause, settling, and return.",
  "Style: clean modern editorial illustration, warm calm light, soft depth, balanced negative space, mobile-friendly.",
  "Avoid: readable text, Chinese characters, labels, UI screenshots, logos, brand marks, watermarks, QR codes."
].join("\n");

const request = {
  ok: true,
  mode: "codex-built-in-imagegen",
  model: "gpt-image-2",
  requiresApiKey: false,
  prompt,
  targetPath,
  requestPath,
  nextStep: `Ask Codex to generate this image with the built-in image_gen tool, then run: npm run import-image2 -- ${requestPath} <generated-image-path>`,
  createdAt: new Date().toISOString()
};

await writeJson(requestPath, request);
console.log(JSON.stringify(request, null, 2));
