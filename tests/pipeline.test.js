import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { processArticle } from "../src/core/pipeline.js";

test("processArticle creates preview artifacts without external AI", async () => {
  const cwd = await fs.mkdtemp(path.join(process.cwd(), "tmp-pipeline-"));
  await fs.mkdir(path.join(cwd, "articles"), { recursive: true });
  const articlePath = path.join(cwd, "articles", "demo.md");
  await fs.writeFile(articlePath, "---\ntitle: 测试文章\n---\n\n这是原文第一段。\n\n这是第二段。", "utf8");
  const processed = await processArticle(articlePath, {
    cwd,
    config: {
      profileName: "default",
      useHistoryStyle: false,
      image: { enabled: true, inlineImageCount: 1, coverSize: "900x383" }
    },
    aiClient: {
      json: async (_system, _user, fallback) => fallback(),
      image: async () => null
    }
  });
  assert.equal(processed.title, "测试文章");
  assert.equal(Boolean(processed.contentBrief), true);
  assert.ok(processed.contentBrief.completenessScore > 0);
  assert.equal(processed.images.length, 3);
  assert.equal(processed.images.some((image) => image.kind === "formal-illustration"), true);
  assert.ok(processed.archive.dirPath.includes("data/articles"));
  assert.match(await fs.readFile(processed.archive.markdownPath, "utf8"), /title: 测试文章/);
  assert.match(await fs.readFile(processed.archive.htmlPath, "utf8"), /<img src=/);
  const imageBytes = await fs.readFile(processed.images[0].localPath);
  assert.equal(imageBytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.ok(imageBytes.length > 4000);
  await fs.rm(cwd, { recursive: true, force: true });
});
