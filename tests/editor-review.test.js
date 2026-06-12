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

test("group process article does not receive narrative externalization edits", async () => {
  const review = await reviewArticleDraft({
    rawText: "无结构团体会让真实关系模式浮现，成员在反馈中获得矫正性情绪体验。团体带领者需要先作为参与者体验团体。",
    metadata: {}
  }, {
    title: "为什么学了很多，还是用不出来？团体工作的真正价值",
    digest: "团体通过真实关系互动，帮助人看见阻碍知识与技能发挥的自我模式。",
    markdown: "> 团体不急着教你更多，而是让你看见真实关系里的自己。\n\n## 团体如何工作\n\n成员在反馈中尝试新的选择。",
    expertReviews: {
      valueMentor: {
        goldenLines: ["团体不急着教你更多，而是让你看见真实关系里的自己。"]
      }
    }
  }, { aiClient });

  assert.equal(review.approved, true);
  assert.equal(review.recommendedEdits.title, "为什么学了很多，还是用不出来？团体工作的真正价值");
  assert.doesNotMatch(review.recommendedEdits.quote, /外化/);
});
