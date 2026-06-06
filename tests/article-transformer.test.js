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
  assert.match(article.markdown, /具体画面|核心矛盾/);
  assert.equal(article.blueprint.sections.length >= 3, true);
  assert.ok(article.changeLog.length >= 1);
  assert.equal(article.blueprint.titleCandidates.length, 5);
});

test("transformArticle infers a concise title from rough ideas", async () => {
  const contentBrief = {
    coreClaim: "写文章要先整理顺序",
    safeSupplements: [{ type: "结构桥梁", content: "读者需要看到顺序如何影响理解。", usage: "放在中段" }],
    needsUserInput: [],
    factualBoundaries: [],
    suggestedOutline: []
  };
  const article = await transformArticle({
    rawText: "我刚刚有个想法，写文章不是把脑子里的东西倒出来，而是帮读者整理出一个可以跟上的顺序。",
    metadata: {}
  }, {
    contentBrief,
    config: { image: { inlineImageCount: 1 } },
    aiClient: { json: async (_system, _user, fallback) => fallback() }
  });
  assert.equal(article.title, "写文章不是倒出来，而是整理顺序");
  assert.equal(article.contentBrief.coreClaim, "写文章要先整理顺序");
});

test("transformArticle supports selectable article templates", async () => {
  const input = {
    rawText: "自由职业的节奏不是一直前进。很多时候，退一步是在确认这条路和自己是否匹配。",
    metadata: {}
  };
  const aiClient = { json: async (_system, _user, fallback) => fallback() };
  const story = await transformArticle(input, {
    config: { articleTemplate: { selectedId: "story_insight" }, image: { inlineImageCount: 1 } },
    aiClient
  });
  assert.equal(story.blueprint.articleType, "故事洞察型");
  assert.equal(story.title, "自由职业不是一直往前冲");
  assert.match(story.markdown, /退一步不是放弃/);

  const knowledge = await transformArticle(input, {
    config: { articleTemplate: { selectedId: "knowledge_course" }, image: { inlineImageCount: 1 } },
    aiClient
  });
  assert.equal(knowledge.blueprint.articleType, "知识精讲型");
  assert.match(knowledge.markdown, /先别急着背概念/);

  const practical = await transformArticle(input, {
    config: { articleTemplate: { selectedId: "practical_method" }, image: { inlineImageCount: 1 } },
    aiClient
  });
  assert.equal(practical.blueprint.articleType, "实战方法型");
  assert.match(practical.markdown, /可以这样做三步/);
});

test("transformArticle understands externalization concept drafts", async () => {
  const input = {
    rawText: [
      "外化部分",
      "斯特林说，火是对消化系统的外化，衣服是对体温调节能力的外化，而最重要的一次外化是社群本身。",
      "赫拉利说人类会讲故事，斯特林告诉我们讲故事这件事在人类大脑里有专用硬件。",
      "我对叙事里面的外化有新的理解：外化的重点是关系强化，人与外界，人与熟悉群体，人与更大的陌生群体。",
      "外化将个人与社会建构剥离，例如有钱才算成功，女生要生儿育女。"
    ].join("\n\n"),
    metadata: {}
  };
  const article = await transformArticle(input, {
    config: { articleTemplate: { selectedId: "auto" }, image: { inlineImageCount: 1 } },
    aiClient: { json: async (_system, _user, fallback) => fallback() }
  });
  assert.equal(article.title, "所谓外化：不是逃离自己，而是重新理解关系");
  assert.equal(article.blueprint.articleType, "知识精讲型");
  assert.match(article.markdown, /火，是对消化系统的外化/);
  assert.match(article.markdown, /外化不是把问题推开/);
  assert.doesNotMatch(article.title, /成长|往前/);
  assert.doesNotMatch(article.markdown, /真正的成长，可能不是一直往前/);
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
