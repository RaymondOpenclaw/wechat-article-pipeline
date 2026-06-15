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

test("author revisions receive detailed short-line style analysis", async () => {
  const profile = await buildStyleProfile([
    {
      title: "稳定的工作正在消失，我们开始进入职业流动时代",
      sampleType: "author_revision",
      weight: 3,
      text: "上周六跟老师连麦\n\n聊到了职业困境\n\n真正让人疲惫的\n\n往往不只是事情变多\n\n而是角色和标准不断切换\n\n项目可以结束\n\n能力才是自己的资产"
    }
  ], {
    profileName: "default",
    aiClient: { json: async (_system, _user, fallback) => fallback() }
  });

  assert.match(profile.paragraphRhythm, /一行一个意思/);
  assert.ok(profile.editingPreferences.some((item) => /不要把短句合并/.test(item)));
  assert.ok(profile.voiceTone.some((item) => /口语/.test(item)));
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

test("importHistoryTexts preserves author revision metadata", async () => {
  const cwd = await fs.mkdtemp(path.join(process.cwd(), "tmp-style-revision-"));
  const aiClient = { json: async (_system, _user, fallback) => fallback() };
  const result = await importHistoryTexts([{
    title: "作者校改稿",
    text: "一行一个意思\n\n能力才是自己的资产",
    sampleType: "author_revision",
    revisionOf: "AI 初稿",
    weight: 3
  }], { cwd, aiClient });

  assert.equal(result.articles[0].sampleType, "author_revision");
  assert.equal(result.articles[0].revisionOf, "AI 初稿");
  assert.equal(result.articles[0].weight, 3);
  await fs.rm(cwd, { recursive: true, force: true });
});
