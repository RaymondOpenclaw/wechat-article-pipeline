import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createArticleWorkflow, loadWorkflow, runWorkflowStep, runWorkflowUntil, updateWorkflowNode, workflowToProcessed } from "../src/core/workflowEngine.js";

const aiClient = {
  json: async (_system, _user, fallback) => fallback(),
  image: async () => null
};

test("article workflow runs node by node to archive", async () => {
  const cwd = await fs.mkdtemp(path.join(process.cwd(), "tmp-workflow-"));
  const workflow = await createArticleWorkflow({
    cwd,
    fileName: "draft.md",
    text: "这是第一段。\n\n这是第二段。",
    config: {
      profileName: "default",
      useHistoryStyle: false,
      image: { enabled: true, inlineImageCount: 1 }
    }
  });
  assert.equal(workflow.steps[0].status, "pending");
  let updated = await runWorkflowStep({ cwd, workflowId: workflow.id, stepId: "style", aiClient });
  assert.equal(updated.steps[0].status, "done");
  assert.equal(updated.steps[0].logs.length > 0, true);
  assert.equal(updated.steps[0].artifacts.at(-1).type, "style-profile");
  updated = await runWorkflowUntil({ cwd, workflowId: workflow.id, untilStepId: "archive", aiClient });
  assert.equal(updated.data.images.length, 2);
  assert.ok(updated.data.archive.dirPath.includes("data/articles"));
  assert.equal(updated.steps.find((step) => step.id === "content_completion").status, "done");
  assert.equal(updated.steps.find((step) => step.id === "editor_review").status, "done");
  assert.equal(updated.steps.find((step) => step.id === "archive").status, "done");
  assert.equal(updated.steps.find((step) => step.id === "content_completion").artifacts.at(-1).type, "content-brief");
  assert.equal(updated.steps.find((step) => step.id === "transform").artifacts.at(-1).type, "article");
  assert.equal(updated.steps.find((step) => step.id === "editor_review").artifacts.at(-1).type, "editor-review");
  assert.equal(updated.steps.find((step) => step.id === "visual").artifacts.at(-1).type, "visual-brief");
  assert.equal(updated.steps.find((step) => step.id === "archive").artifacts.at(-1).type, "archive");
  const processed = workflowToProcessed(updated);
  assert.equal(Boolean(processed.contentBrief), true);
  assert.equal(processed.editorReview.approved, true);
  assert.equal(processed.images.length, 2);
  await fs.rm(cwd, { recursive: true, force: true });
});

test("updating article node resets later workflow nodes", async () => {
  const cwd = await fs.mkdtemp(path.join(process.cwd(), "tmp-workflow-reset-"));
  const workflow = await createArticleWorkflow({
    cwd,
    fileName: "draft.md",
    text: "这是第一段。\n\n这是第二段。",
    config: {
      profileName: "default",
      useHistoryStyle: false,
      image: { enabled: false, inlineImageCount: 0 }
    }
  });
  await runWorkflowUntil({ cwd, workflowId: workflow.id, untilStepId: "archive", aiClient });
  const patched = await updateWorkflowNode({
    cwd,
    workflowId: workflow.id,
    node: "article",
    patch: { title: "手动修改标题" }
  });
  assert.equal(patched.data.transformed.title, "手动修改标题");
  assert.equal(patched.steps.find((step) => step.id === "editor_review").status, "pending");
  assert.equal(patched.steps.find((step) => step.id === "visual").status, "pending");
  assert.equal(patched.steps.find((step) => step.id === "archive").status, "pending");
  const reloaded = await loadWorkflow(cwd, workflow.id);
  assert.match(reloaded.logs.at(-1).message, /手动修改文章节点/);
  await fs.rm(cwd, { recursive: true, force: true });
});

test("editor review blocks later nodes when article misses the source viewpoint", async () => {
  const cwd = await fs.mkdtemp(path.join(process.cwd(), "tmp-workflow-review-"));
  const workflow = await createArticleWorkflow({
    cwd,
    fileName: "externalization.md",
    text: [
      "外化部分",
      "斯特林说，火是对消化系统的外化，衣服是对体温调节能力的外化，而最重要的一次外化是社群本身。",
      "我对叙事里面的外化有新的理解：外化的重点是关系强化，人与外界，人与熟悉群体，人与更大的陌生群体。",
      "外化将个人与社会建构剥离，例如有钱才算成功，女生要生儿育女。"
    ].join("\n\n"),
    config: {
      profileName: "default",
      useHistoryStyle: false,
      image: { enabled: false, inlineImageCount: 0 }
    }
  });
  await runWorkflowStep({ cwd, workflowId: workflow.id, stepId: "style", aiClient });
  await runWorkflowStep({ cwd, workflowId: workflow.id, stepId: "transform", aiClient });
  await updateWorkflowNode({
    cwd,
    workflowId: workflow.id,
    node: "article",
    patch: {
      title: "真正的成长，可能不是一直往前",
      digest: "成长需要进退确认。",
      markdown: "> 把问题说清楚，本身就是一种行动力。\n\n真正的成长，可能不是一直往前。\n\n把问题说清楚，本身就是一种行动力。",
      html: "<section><h1>真正的成长，可能不是一直往前</h1><p>把问题说清楚，本身就是一种行动力。</p></section>"
    }
  });

  const reviewed = await runWorkflowUntil({ cwd, workflowId: workflow.id, untilStepId: "archive", aiClient });

  assert.equal(reviewed.steps.find((step) => step.id === "editor_review").status, "done");
  assert.equal(reviewed.data.editorReview.approved, false);
  assert.match(reviewed.data.editorReview.recommendedEdits.title, /外化/);
  assert.equal(reviewed.steps.find((step) => step.id === "visual").status, "pending");
  assert.equal(reviewed.steps.find((step) => step.id === "archive").status, "pending");
  assert.equal(reviewed.data.archive, undefined);
  await fs.rm(cwd, { recursive: true, force: true });
});
