import fs from "node:fs/promises";
import path from "node:path";
import { AiClient } from "./aiClient.js";
import { readArticle } from "./articleReader.js";
import { loadConfig } from "./config.js";
import { transformArticle } from "./articleTransformer.js";
import { createVisualBrief } from "./visualBrief.js";
import { generateImages } from "./imageGenerator.js";
import { loadStyleProfile } from "./styleProfile.js";
import { saveArticleArchive, saveTask } from "./pipeline.js";
import { uploadProcessedArticleWithStrategy } from "../wechat/uploadStrategy.js";
import { ensureDir, readJson, slugify, writeJson } from "../utils/files.js";

export const WORKFLOW_STEPS = [
  { id: "style", name: "读取风格库", description: "加载个人写作风格和标准化提示词。", editable: false },
  { id: "transform", name: "文章成稿", description: "专家组打磨，生成公众号文章和手机 HTML。", editable: true },
  { id: "visual", name: "配图 Brief", description: "基于文章结构生成封面与正文图提示词。", editable: true },
  { id: "images", name: "生成配图", description: "生成封面和正文插图。", editable: false },
  { id: "archive", name: "本地归档", description: "保存 Markdown、HTML、JSON 和图片记录。", editable: false },
  { id: "upload", name: "上传草稿箱", description: "确认后通过云主机上传到微信公众号草稿箱。", editable: false }
];

export function workflowsDir(cwd = process.cwd()) {
  return path.join(cwd, "data", "workflows");
}

export function workflowPath(cwd, workflowId) {
  return path.join(workflowsDir(cwd), `${workflowId}.json`);
}

export async function createArticleWorkflow({
  cwd = process.cwd(),
  fileName = "draft.md",
  text,
  expertIds = null,
  config = null
} = {}) {
  if (!String(text || "").trim()) throw new Error("请先粘贴文章正文。");
  const resolvedConfig = config || await loadConfig(cwd);
  if (Array.isArray(expertIds)) {
    resolvedConfig.experts = { ...(resolvedConfig.experts || {}), enabled: expertIds.length > 0, selectedIds: expertIds };
  }
  const id = `${Date.now()}-${slugify(fileName || "workflow")}`;
  const inputDir = path.join(cwd, "data", "web-input");
  await ensureDir(inputDir);
  const inputPath = path.join(inputDir, `${id}-${path.basename(fileName || "draft.md")}`);
  await fs.writeFile(inputPath, text, "utf8");
  const workflow = {
    id,
    inputPath,
    status: "created",
    currentStep: "style",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: resolvedConfig,
    steps: WORKFLOW_STEPS.map((step) => ({ ...step, status: "pending", startedAt: "", finishedAt: "", logs: [], artifacts: [] })),
    logs: [],
    data: {}
  };
  addLog(workflow, "workflow", "工作流已创建，等待执行第一个节点。");
  await saveWorkflow(cwd, workflow);
  return workflow;
}

export async function loadWorkflow(cwd, workflowId) {
  const workflow = await readJson(workflowPath(cwd, workflowId), null);
  if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
  return workflow;
}

export async function listWorkflows(cwd = process.cwd(), limit = 20) {
  await ensureDir(workflowsDir(cwd));
  const entries = await fs.readdir(workflowsDir(cwd));
  const workflows = [];
  for (const entry of entries.filter((item) => item.endsWith(".json")).sort().reverse().slice(0, limit)) {
    const workflow = await readJson(path.join(workflowsDir(cwd), entry), null);
    if (workflow) workflows.push(summarizeWorkflow(workflow));
  }
  return workflows;
}

export async function runWorkflowStep({
  cwd = process.cwd(),
  workflowId,
  stepId = null,
  aiClient = new AiClient()
} = {}) {
  const workflow = await loadWorkflow(cwd, workflowId);
  const targetStepId = stepId || nextPendingStep(workflow);
  if (!targetStepId) return workflow;
  const step = workflow.steps.find((item) => item.id === targetStepId);
  if (!step) throw new Error(`Unknown workflow step: ${targetStepId}`);
  step.status = "running";
  step.startedAt = new Date().toISOString();
  workflow.status = "running";
  workflow.currentStep = targetStepId;
  addLog(workflow, targetStepId, `开始执行：${step.name}`);
  await saveWorkflow(cwd, workflow);

  try {
    await executeStep({ cwd, workflow, stepId: targetStepId, aiClient });
    step.status = "done";
    step.finishedAt = new Date().toISOString();
    workflow.status = nextPendingStep(workflow) ? "paused" : "done";
    workflow.currentStep = nextPendingStep(workflow) || "";
    addLog(workflow, targetStepId, `完成：${step.name}`);
    await saveWorkflow(cwd, workflow);
    return workflow;
  } catch (error) {
    step.status = "failed";
    step.finishedAt = new Date().toISOString();
    workflow.status = "failed";
    addLog(workflow, targetStepId, `失败：${error.message}`, "error");
    await saveWorkflow(cwd, workflow);
    throw error;
  }
}

export async function runWorkflowUntil({
  cwd = process.cwd(),
  workflowId,
  untilStepId = "archive",
  aiClient = new AiClient()
} = {}) {
  let workflow = await loadWorkflow(cwd, workflowId);
  while (nextPendingStep(workflow)) {
    const next = nextPendingStep(workflow);
    workflow = await runWorkflowStep({ cwd, workflowId, stepId: next, aiClient });
    if (next === untilStepId || workflow.status === "failed") break;
  }
  return workflow;
}

export async function updateWorkflowNode({
  cwd = process.cwd(),
  workflowId,
  node,
  patch
} = {}) {
  const workflow = await loadWorkflow(cwd, workflowId);
  if (node === "article") {
    workflow.data.transformed = {
      ...(workflow.data.transformed || {}),
      ...pick(patch, ["title", "digest", "markdown", "html"])
    };
    resetFrom(workflow, "visual");
    addLog(workflow, "transform", "已手动修改文章节点，后续配图/归档/上传节点需要重新执行。");
  } else if (node === "visual") {
    workflow.data.visualBrief = patch;
    resetFrom(workflow, "images");
    addLog(workflow, "visual", "已手动修改配图 Brief，后续配图/归档/上传节点需要重新执行。");
  } else {
    throw new Error(`Unsupported editable node: ${node}`);
  }
  await saveWorkflow(cwd, workflow);
  return workflow;
}

export function workflowToProcessed(workflow) {
  if (!workflow.data.transformed) return null;
  return {
    ...workflow.data.transformed,
    visualBrief: workflow.data.visualBrief || null,
    images: workflow.data.images || [],
    taskPath: workflow.data.taskPath || "",
    archive: workflow.data.archive || null,
    uploadResult: workflow.data.uploadResult || null
  };
}

async function executeStep({ cwd, workflow, stepId, aiClient }) {
  if (stepId === "style") {
    workflow.data.input = await readArticle(workflow.inputPath);
    workflow.data.styleProfile = workflow.config.useHistoryStyle
      ? await loadStyleProfile(cwd, workflow.config.profileName)
      : null;
    addLog(workflow, stepId, workflow.data.styleProfile ? "已加载个人风格库。" : "未启用或未找到风格库，将使用通用公众号风格。");
    recordArtifact(workflow, stepId, {
      type: "style-profile",
      label: workflow.data.styleProfile ? "个人风格库" : "通用公众号风格",
      summary: workflow.data.styleProfile
        ? `${workflow.data.styleProfile.articleCount || 0} 篇历史文章特征`
        : "未加载历史风格"
    });
    return;
  }
  if (stepId === "transform") {
    const input = workflow.data.input || await readArticle(workflow.inputPath);
    workflow.data.input = input;
    workflow.data.transformed = await transformArticle(input, {
      styleProfile: workflow.data.styleProfile || null,
      config: workflow.config,
      aiClient
    });
    addLog(workflow, stepId, `生成标题：${workflow.data.transformed.title}`);
    recordArtifact(workflow, stepId, {
      type: "article",
      label: "公众号成稿",
      title: workflow.data.transformed.title,
      digest: workflow.data.transformed.digest,
      editable: true
    });
    return;
  }
  if (stepId === "visual") {
    assertData(workflow, "transformed", "请先执行文章成稿节点。");
    workflow.data.visualBrief = await createVisualBrief(workflow.data.transformed, { config: workflow.config, aiClient });
    addLog(workflow, stepId, `生成 ${workflow.data.visualBrief.inlinePrompts?.length || 0} 个正文配图提示词。`);
    recordArtifact(workflow, stepId, {
      type: "visual-brief",
      label: "配图 Brief",
      theme: workflow.data.visualBrief.theme,
      inlineCount: workflow.data.visualBrief.inlinePrompts?.length || 0,
      editable: true
    });
    return;
  }
  if (stepId === "images") {
    assertData(workflow, "visualBrief", "请先执行配图 Brief 节点。");
    workflow.data.images = workflow.config.image?.enabled
      ? await generateImages(workflow.data.visualBrief, workflow.data.transformed, { cwd, config: workflow.config, aiClient })
      : [];
    addLog(workflow, stepId, `生成图片 ${workflow.data.images.length} 张。`);
    recordArtifact(workflow, stepId, {
      type: "images",
      label: "封面与正文配图",
      count: workflow.data.images.length,
      paths: workflow.data.images.map((image) => image.localPath)
    });
    return;
  }
  if (stepId === "archive") {
    assertData(workflow, "transformed", "请先执行文章成稿节点。");
    const processed = workflowToProcessed(workflow);
    workflow.data.taskPath = await saveTask(cwd, processed);
    workflow.data.archive = await saveArticleArchive(cwd, { ...processed, taskPath: workflow.data.taskPath });
    addLog(workflow, stepId, `已保存到：${workflow.data.archive.dirPath}`);
    recordArtifact(workflow, stepId, {
      type: "archive",
      label: "本地归档",
      dirPath: workflow.data.archive.dirPath,
      markdownPath: workflow.data.archive.markdownPath,
      htmlPath: workflow.data.archive.htmlPath,
      jsonPath: workflow.data.archive.jsonPath
    });
    return;
  }
  if (stepId === "upload") {
    assertData(workflow, "archive", "请先执行本地归档节点。");
    const processed = workflowToProcessed(workflow);
    workflow.data.uploadResult = await uploadProcessedArticleWithStrategy(processed, { cwd, config: workflow.config });
    addLog(workflow, stepId, `草稿箱创建成功：${workflow.data.uploadResult.mediaId}`);
    recordArtifact(workflow, stepId, {
      type: "wechat-draft",
      label: "微信公众号草稿",
      mediaId: workflow.data.uploadResult.mediaId,
      uploadedAt: new Date().toISOString()
    });
    return;
  }
}

async function saveWorkflow(cwd, workflow) {
  workflow.updatedAt = new Date().toISOString();
  await writeJson(workflowPath(cwd, workflow.id), workflow);
}

function nextPendingStep(workflow) {
  return workflow.steps.find((step) => step.status === "pending" || step.status === "failed")?.id || "";
}

function resetFrom(workflow, stepId) {
  const start = workflow.steps.findIndex((step) => step.id === stepId);
  if (start < 0) return;
  for (const step of workflow.steps.slice(start)) {
    step.status = "pending";
    step.startedAt = "";
    step.finishedAt = "";
    step.artifacts = [];
  }
  workflow.status = "paused";
  workflow.currentStep = stepId;
}

function addLog(workflow, stepId, message, level = "info") {
  const entry = {
    at: new Date().toISOString(),
    stepId,
    level,
    message
  };
  workflow.logs.push(entry);
  const step = workflow.steps.find((item) => item.id === stepId);
  if (step) step.logs.push(entry);
}

function recordArtifact(workflow, stepId, artifact) {
  const step = workflow.steps.find((item) => item.id === stepId);
  if (!step) return;
  step.artifacts.push({
    at: new Date().toISOString(),
    ...artifact
  });
}

function summarizeWorkflow(workflow) {
  return {
    id: workflow.id,
    status: workflow.status,
    currentStep: workflow.currentStep,
    title: workflow.data.transformed?.title || path.basename(workflow.inputPath || ""),
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt
  };
}

function assertData(workflow, key, message) {
  if (!workflow.data[key]) throw new Error(message);
}

function pick(value = {}, keys = []) {
  const result = {};
  for (const key of keys) {
    if (value[key] !== undefined) result[key] = value[key];
  }
  return result;
}
