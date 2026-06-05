import test from "node:test";
import assert from "node:assert/strict";
import { reviewArticleDraft } from "../src/core/editorReview.js";

const aiClient = {
  json: async (_system, _user, fallback) => fallback()
};

test("editor review rejects articles that replace externalization with generic growth", async () => {
  const review = await reviewArticleDraft({
    rawText: [
      "外化部分",
      "斯特林说，火是对消化系统的外化，衣服是对体温调节能力的外化，而最重要的一次外化是社群本身。",
      "我对叙事里面的外化有新的理解：外化的重点是关系强化。",
      "外化将个人与社会建构剥离，例如有钱才算成功，女生要生儿育女。"
    ].join("\n\n"),
    metadata: {}
  }, {
    title: "真正的成长，可能不是一直往前",
    digest: "成长需要进退确认。",
    markdown: "> 把问题说清楚，本身就是一种行动力。\n\n真正的成长，可能不是一直往前。\n\n把问题说清楚，本身就是一种行动力。",
    expertReviews: {
      valueMentor: {
        goldenLines: ["把问题说清楚，本身就是一种行动力。"]
      }
    }
  }, { aiClient });

  assert.equal(review.approved, false);
  assert.equal(review.verdict, "needs_revision");
  assert.match(review.issues.map((issue) => issue.area).join(","), /标题|理解|逻辑|引用/);
  assert.match(review.recommendedEdits.title, /外化/);
  assert.match(review.recommendedEdits.quote, /外化/);
});
