import test from "node:test";
import assert from "node:assert/strict";
import { transformArticle } from "../src/core/articleTransformer.js";
import { createVisualBrief } from "../src/core/visualBrief.js";

test("transformArticle creates a professional WeChat-ready draft fallback", async () => {
  const input = {
    rawText: "# 我的一篇文章\n\n这是第一段。它表达了核心观点。\n\n这是第二段，继续展开。",
    metadata: { title: "我原来的标题" }
  };
  const article = await transformArticle(input, {
    config: { image: { inlineImageCount: 2 } },
    aiClient: { json: async (_system, _user, fallback) => fallback() }
  });
  assert.equal(article.title, "我原来的标题");
  assert.match(article.html, /INLINE_IMAGE_1/);
  assert.match(article.html, /font-size:16px/);
  assert.match(article.html, /点个赞|点赞/);
  assert.match(article.html, /读完可以立刻做的 3 件事/);
  assert.equal(article.expertReviews.valueMentor.goldenLines.length, 2);
  assert.match(article.markdown, /有些想法/);
  assert.equal(article.blueprint.sections.length, 3);
  assert.ok(article.changeLog.length >= 1);
  assert.equal(article.blueprint.titleCandidates.length, 5);
});

test("transformArticle infers a concise title from rough ideas", async () => {
  const article = await transformArticle({
    rawText: "我刚刚有个想法，写文章不是把脑子里的东西倒出来，而是帮读者整理出一个可以跟上的顺序。",
    metadata: {}
  }, {
    config: { image: { inlineImageCount: 1 } },
    aiClient: { json: async (_system, _user, fallback) => fallback() }
  });
  assert.equal(article.title, "写文章不是倒出来，而是整理顺序");
});

test("createVisualBrief creates cover and inline prompts", async () => {
  const article = {
    title: "文章标题",
    digest: "摘要",
    markdown: "正文",
    styleProfile: { visualStyle: "clean editorial" },
    blueprint: {
      coreClaim: "核心观点",
      articleType: "观点文",
      audience: "读者",
      sections: [{ heading: "第一节" }, { heading: "第二节" }]
    }
  };
  const brief = await createVisualBrief(article, {
    config: { image: { inlineImageCount: 2 } },
    aiClient: { json: async (_system, _user, fallback) => fallback() }
  });
  assert.match(brief.coverPrompt, /核心观点/);
  assert.match(brief.coverPrompt, /no text/);
  assert.equal(brief.inlinePrompts.length, 2);
});
