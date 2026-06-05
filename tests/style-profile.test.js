import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { buildStyleProfile, importHistoryTexts, rawHistoryPath } from "../src/core/styleProfile.js";
import { parseWeChatArticleHtml } from "../src/core/historyFetcher.js";

test("parseWeChatArticleHtml extracts title and content", () => {
  const parsed = parseWeChatArticleHtml(`
    <html><head><meta name="description" content="摘要内容"></head>
    <body><h1 id="activity-name">历史文章标题</h1>
    <div id="js_content"><p>其实这是正文。</p><p>第二段内容。</p><img data-src="https://image.test/a.jpg"></div><script></script></body></html>
  `, "https://mp.weixin.qq.com/s/test");
  assert.equal(parsed.title, "历史文章标题");
  assert.match(parsed.text, /其实这是正文/);
  assert.equal(parsed.images[0], "https://image.test/a.jpg");
});

test("buildStyleProfile fallback returns reusable style profile", async () => {
  const profile = await buildStyleProfile([
    { title: "为什么要重新理解写作？", text: "其实写作是一个整理思路的过程。\n\n更重要的是，它帮助我们看清问题。", url: "u1" },
    { title: "3 个方法，把事情说清楚", text: "问题在于，我们经常急着表达。\n\n换句话说，结构先于措辞。", url: "u2" }
  ], {
    profileName: "default",
    aiClient: { json: async (_system, _user, fallback) => fallback() }
  });
  assert.equal(profile.articleCount, 2);
  assert.ok(profile.titlePatterns.length >= 1);
  assert.ok(profile.signaturePhrases.includes("其实"));
});

test("importHistoryTexts appends to saved style library", async () => {
  const cwd = await fs.mkdtemp(path.join(process.cwd(), "tmp-style-"));
  const aiClient = { json: async (_system, _user, fallback) => fallback() };
  await importHistoryTexts([{ title: "第一篇", text: "其实这是第一篇历史文章。" }], { cwd, aiClient });
  const result = await importHistoryTexts([{ title: "第二篇", text: "换句话说，这是第二篇历史文章。" }], { cwd, aiClient });
  const raw = JSON.parse(await fs.readFile(rawHistoryPath(cwd), "utf8"));
  assert.equal(result.articles.length, 2);
  assert.equal(raw.articles.length, 2);
  assert.equal(result.profile.articleCount, 2);
  await fs.rm(cwd, { recursive: true, force: true });
});
