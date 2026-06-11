import test from "node:test";
import assert from "node:assert/strict";
import { applyIllustrationSkill } from "../src/core/illustrationSkill.js";

const article = {
  title: "叙事疗法里，外化不是逃避责任",
  digest: "外化和解构的关键，是把人与问题分开。",
  markdown: [
    "# 叙事疗法里，外化不是逃避责任",
    "",
    "## 为什么要先把“人”和“问题”分开",
    "",
    "人不是问题，问题才是问题。外化要做的第一件事，就是把这个黏在身上的标签拿下来。",
    "",
    "## 怀特的立场地图",
    "",
    "第一步是问题描述，第二步是绘制影响地图，第三步是声明立场，第四步是论证评估。"
  ].join("\n"),
  html: [
    "<section>",
    "<h1>叙事疗法里，外化不是逃避责任</h1>",
    "<h2>为什么要先把“人”和“问题”分开</h2>",
    "<p>人不是问题，问题才是问题。外化要做的第一件事，就是把这个黏在身上的标签拿下来。</p>",
    "<h2>怀特的立场地图</h2>",
    "<p>第一步是问题描述，第二步是绘制影响地图，第三步是声明立场，第四步是论证评估。</p>",
    "</section>"
  ].join(""),
  changeLog: []
};

test("applyIllustrationSkill inserts ASCII sketches into markdown and html", async () => {
  const illustrated = await applyIllustrationSkill(article, {
    aiClient: { json: async (_system, _user, fallback) => fallback() }
  });

  assert.equal(illustrated.asciiIllustrations.length, 2);
  assert.match(illustrated.markdown, /```text/);
  assert.match(illustrated.markdown, /Person\s+Problem/);
  assert.match(illustrated.html, /data-role="ascii-illustration"/);
  for (const illustration of illustrated.asciiIllustrations) {
    assert.doesNotMatch(illustration.sketch, /[^\x09\x0a\x0d\x20-\x7e]/);
  }
});

test("applyIllustrationSkill can be disabled", async () => {
  const unchanged = await applyIllustrationSkill(article, {
    config: { illustration: { enabled: false } },
    aiClient: { json: async (_system, _user, fallback) => fallback() }
  });
  assert.equal(unchanged.markdown, article.markdown);
  assert.equal(unchanged.asciiIllustrations, undefined);
});
