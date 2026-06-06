import test from "node:test";
import assert from "node:assert/strict";
import { completeArticleInformation } from "../src/core/contentCompleter.js";

const aiClient = {
  json: async (_system, _user, fallback) => fallback()
};

test("content completer builds a pre-writing brief for narrative therapy drafts", async () => {
  const brief = await completeArticleInformation({
    rawText: [
      "领域：叙事疗法心理学 / 心理咨询技能培训",
      "本次课程聚焦叙事疗法的解构与外化技术，讲解怀特的解构对话地图。",
      "外化的核心是将人和问题分开，解构的目标是发现支线故事。"
    ].join("\n\n"),
    metadata: {}
  }, { aiClient });

  assert.match(brief.coreClaim, /外化|解构/);
  assert.match(brief.contentType, /知识/);
  assert.ok(brief.completenessScore > 0);
  assert.ok(brief.missingInfo.length >= 1);
  assert.ok(brief.safeSupplements.some((item) => /外化/.test(item.content)));
  assert.ok(brief.suggestedOutline.some((item) => /立场地图|问题/.test(`${item.heading}${item.keyPoints.join("")}`)));
  assert.match(brief.completionPrompt, /safeSupplements|补全/);
});
