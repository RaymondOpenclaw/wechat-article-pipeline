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
  assert.equal(updated.steps.find((step) => step.id === "archive").status, "done");
  assert.equal(updated.steps.find((step) => step.id === "transform").artifacts.at(-1).type, "article");
  assert.equal(updated.steps.find((step) => step.id === "visual").artifacts.at(-1).type, "visual-brief");
  assert.equal(updated.steps.find((step) => step.id === "archive").artifacts.at(-1).type, "archive");
  const processed = workflowToProcessed(updated);
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
  assert.equal(patched.steps.find((step) => step.id === "visual").status, "pending");
  assert.equal(patched.steps.find((step) => step.id === "archive").status, "pending");
  const reloaded = await loadWorkflow(cwd, workflow.id);
  assert.match(reloaded.logs.at(-1).message, /手动修改文章节点/);
  await fs.rm(cwd, { recursive: true, force: true });
});
