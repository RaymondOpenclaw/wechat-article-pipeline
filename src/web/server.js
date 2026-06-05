import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { loadDotEnv } from "../utils/env.js";
import { ensureDir, readJson, slugify, writeJson } from "../utils/files.js";
import { loadConfig } from "../core/config.js";
import { AiClient } from "../core/aiClient.js";
import { ARTICLE_EXPERTS } from "../core/experts.js";
import { processArticle } from "../core/pipeline.js";
import { historyInboxPath, importHistoryLinks, importHistoryTexts, loadStyleProfile, refreshStyleProfile } from "../core/styleProfile.js";
import { inspectStyleEngine, refreshStyleArtifacts } from "../core/styleEngine.js";
import { createArticleWorkflow, listWorkflows, loadWorkflow, runWorkflowStep, runWorkflowUntil, updateWorkflowNode, workflowToProcessed } from "../core/workflowEngine.js";
import { uploadProcessedArticleWithStrategy } from "../wechat/uploadStrategy.js";
import { escapeHtml, replaceImagePlaceholderHtml } from "../utils/html.js";
import { importLocalSecretsToVault, secureSecretsStatus } from "../utils/secureVault.js";

const cwd = process.cwd();
loadDotEnv(cwd);
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === "GET" && url.pathname === "/") return html(response, await homePage());
    if (request.method === "GET" && url.pathname.startsWith("/generated/images/")) return file(response, path.join(cwd, decodeURIComponent(url.pathname)));
    if (request.method === "POST" && url.pathname === "/api/profile/import-links") return json(response, await importLinksApi(request));
    if (request.method === "POST" && url.pathname === "/api/profile/import-text") return json(response, await importTextApi(request));
    if (request.method === "POST" && url.pathname === "/api/profile/refresh") return json(response, await refreshProfileApi());
    if (request.method === "GET" && url.pathname === "/api/profile") return json(response, await profileApi());
    if (request.method === "GET" && url.pathname === "/api/style/inspect") return json(response, await styleInspectApi());
    if (request.method === "POST" && url.pathname === "/api/style/refresh-artifacts") return json(response, await refreshStyleArtifactsApi());
    if (request.method === "GET" && url.pathname === "/api/secrets/status") return json(response, await secretsStatusApi());
    if (request.method === "POST" && url.pathname === "/api/secrets/import-local") return json(response, await importLocalSecretsApi());
    if (request.method === "GET" && url.pathname === "/api/workflows") return json(response, await workflowsApi());
    if (request.method === "POST" && url.pathname === "/api/workflows/create") return json(response, await createWorkflowApi(request));
    if (request.method === "POST" && url.pathname === "/api/workflows/run-step") return json(response, await runWorkflowStepApi(request));
    if (request.method === "POST" && url.pathname === "/api/workflows/run-until") return json(response, await runWorkflowUntilApi(request));
    if (request.method === "POST" && url.pathname === "/api/workflows/update-node") return json(response, await updateWorkflowNodeApi(request));
    if (request.method === "POST" && url.pathname === "/api/article/preview") return json(response, await previewApi(request));
    if (request.method === "POST" && url.pathname === "/api/article/upload") return json(response, await uploadApi(request));
    response.writeHead(404);
    response.end("Not found");
  } catch (error) {
    json(response, { ok: false, error: error.message }, 500);
  }
});

server.listen(port, host, () => {
  console.log(`Wechat draft publisher web console: http://${host}:${port}`);
  scheduleStyleArtifactsRefresh();
});

async function scheduleStyleArtifactsRefresh() {
  const config = await loadConfig(cwd);
  if (!config.styleEngine?.autoRefreshEnabled) return;
  const intervalMs = Math.max(1, Number(config.styleEngine.autoRefreshHours || 24)) * 60 * 60 * 1000;
  setInterval(async () => {
    try {
      const latest = await loadConfig(cwd);
      if (!latest.styleEngine?.autoRefreshEnabled) return;
      await refreshStyleArtifacts({ cwd, profileName: latest.profileName, aiClient: new AiClient() });
      console.log(`[style-engine] refreshed profile artifacts at ${new Date().toISOString()}`);
    } catch (error) {
      console.log(`[style-engine] refresh skipped: ${error.message}`);
    }
  }, intervalMs);
}

async function homePage() {
  const config = await loadConfig(cwd);
  const profile = await loadStyleProfile(cwd, config.profileName);
  const secrets = await secureSecretsStatus(cwd);
  const inboxPath = historyInboxPath(cwd, config.profileName);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>微信公众号草稿自动发布工具</title>
  <style>
    :root { color-scheme: light; --ink:#1f2933; --muted:#64748b; --line:#d8dee9; --brand:#136f63; --bg:#f7f8f6; --panel:#fff; --soft:#eef7f3; --warn:#fff7ed; }
    * { box-sizing: border-box; }
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--bg); color:var(--ink); }
    header { padding:22px 28px; border-bottom:1px solid var(--line); background:#fff; display:flex; align-items:center; justify-content:space-between; gap:16px; }
    h1 { margin:0; font-size:22px; letter-spacing:0; }
    main { max-width:1280px; margin:0 auto; padding:20px 24px 28px; display:grid; grid-template-columns:380px 1fr; gap:20px; }
    .panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:18px; }
    h2 { margin:0 0 14px; font-size:17px; }
    label { display:block; font-size:13px; color:var(--muted); margin:12px 0 6px; }
    textarea, input { width:100%; border:1px solid var(--line); border-radius:6px; padding:10px; font:inherit; background:#fff; }
    textarea { min-height:150px; resize:vertical; }
    button { border:0; border-radius:6px; padding:10px 14px; background:var(--brand); color:#fff; font-weight:650; cursor:pointer; }
    button.secondary { background:#334155; }
    button:disabled { background:#9aa6b2; cursor:not-allowed; }
    .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    .tabs { max-width:1280px; margin:0 auto; padding:14px 24px 0; display:flex; gap:8px; flex-wrap:wrap; }
    .tab { background:#fff; color:var(--ink); border:1px solid var(--line); }
    .tab.active { background:var(--brand); color:#fff; border-color:var(--brand); }
    .hidden { display:none !important; }
    .muted { color:var(--muted); font-size:13px; }
    .preview { min-height:540px; overflow:auto; }
    .flow { max-width:1280px; margin:0 auto; padding:18px 24px 0; display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; }
    .step { border:1px solid var(--line); background:#fff; border-radius:8px; padding:10px 12px; min-height:74px; }
    .step strong { display:block; font-size:14px; margin-bottom:4px; }
    .step span { display:block; font-size:12px; line-height:1.45; color:var(--muted); }
    .status-pill { display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; background:var(--soft); color:#136f63; font-size:12px; font-weight:650; }
    .status-pill.warn { background:var(--warn); color:#9a3412; }
    .phone-shell { max-width:430px; margin:16px auto 0; background:#fff; border:1px solid var(--line); border-radius:8px; padding:14px 14px 24px; box-shadow:0 12px 30px rgba(15,23,42,.08); }
    .article { background:#fff; padding:6px 2px; border-radius:6px; }
    .article h1 { font-size:24px; margin:0 0 12px; }
    .article img { max-width:100%; border-radius:6px; }
    pre { white-space:pre-wrap; background:#f1f5f9; border-radius:6px; padding:12px; overflow:auto; }
    .image-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin:12px 0; }
    .image-grid img { width:100%; border:1px solid var(--line); background:#fff; }
    .expert-list { display:grid; gap:8px; margin:8px 0 12px; }
    .expert-item { display:flex; gap:8px; align-items:flex-start; padding:8px; border:1px solid var(--line); border-radius:6px; background:#fbfcfd; }
    .expert-item input { width:auto; margin-top:3px; }
    .expert-item strong { display:block; font-size:14px; }
    .expert-item span { display:block; font-size:12px; color:var(--muted); line-height:1.5; }
    .workflow-steps { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px; margin:14px 0; }
    .workflow-node { border:1px solid var(--line); border-radius:8px; padding:10px; background:#fff; }
    .workflow-node.done { background:#eef7f3; border-color:#b9ded0; }
    .workflow-node.running { background:#eff6ff; border-color:#bfdbfe; }
    .workflow-node.failed { background:#fff1f2; border-color:#fecdd3; }
    .workflow-node strong { display:block; font-size:13px; margin-bottom:4px; }
    .workflow-node span { color:var(--muted); font-size:12px; }
    .node-editor textarea { min-height:90px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
    @media (max-width: 980px) { main { grid-template-columns:1fr; padding:14px; } .flow { grid-template-columns:1fr 1fr; padding:14px 14px 0; } header { align-items:flex-start; flex-direction:column; } }
    @media (max-width: 560px) { .flow { grid-template-columns:1fr; } .phone-shell { max-width:100%; box-shadow:none; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>微信公众号文章草稿自动发布工具</h1>
      <div class="muted">风格库：${escapeHtml(config.profileName)} · 历史文章：${profile?.articleCount || 0} 篇 · 上传前必须确认</div>
    </div>
    <button class="secondary" onclick="location.reload()">刷新</button>
  </header>
  <nav class="tabs">
    <button class="tab active" data-tab="main">主流程：公众号文章生成</button>
    <button class="tab" data-tab="style">二级菜单：历史文章风格沉淀</button>
    <button class="tab" data-tab="settings">二级菜单：安全与迁移配置</button>
  </nav>
  <section class="flow">
    <div class="step"><strong>1. 创建工作流</strong><span>输入文章，生成可审计任务。</span></div>
    <div class="step"><strong>2. 文章成稿</strong><span>专家组打磨，支持暂停修改。</span></div>
    <div class="step"><strong>3. 配图生成</strong><span>Brief 和图片节点可单独重跑。</span></div>
    <div class="step"><strong>4. 本地归档</strong><span>自动保存文章和图片记录。</span></div>
    <div class="step"><strong>5. 草稿上传</strong><span>确认后通过云主机进入草稿箱。</span></div>
  </section>
  <main>
    <div>
      <section class="panel tab-panel hidden" data-panel="settings">
        <h2>安全配置</h2>
        <div class="row">
          <span class="${secrets.hasVault ? "status-pill" : "status-pill warn"}">${secrets.hasVault ? "已启用加密库" : "未生成加密库"}</span>
          <span class="${secrets.hasWechatCredentials ? "status-pill" : "status-pill warn"}">公众号凭据${secrets.hasWechatCredentials ? "已保存" : "待保存"}</span>
          <span class="${secrets.hasRemotePrivateKey ? "status-pill" : "status-pill warn"}">云主机密钥${secrets.hasRemotePrivateKey ? "已保存" : "待保存"}</span>
        </div>
        <p class="muted">迁移机器时复制 <code>data/secure/</code> 与项目文件即可继续调用；该目录已被 git 忽略。</p>
        <div class="row">
          <button id="importSecretsBtn" class="secondary">导入当前配置到加密库</button>
          <button id="secretStatusBtn" class="secondary">检查配置</button>
        </div>
        <pre id="secretBox">${escapeHtml(JSON.stringify(maskSecretStatus(secrets), null, 2))}</pre>
      </section>
      <section class="panel tab-panel hidden" data-panel="style">
        <h2>风格库模块</h2>
        <label>公众号文章链接，每行一个</label>
        <textarea id="links" placeholder="https://mp.weixin.qq.com/s/..."></textarea>
        <div class="row"><button id="importBtn">导入链接并更新</button></div>
        <label>粘贴一篇历史文章正文</label>
        <input id="historyTitle" placeholder="历史文章标题" />
        <textarea id="historyText" placeholder="把你已发布或过往文章正文粘贴到这里"></textarea>
        <div class="row">
          <button id="importTextBtn">保存正文并更新</button>
          <button id="refreshProfileBtn" class="secondary">刷新本地文章库</button>
          <button id="refreshStyleArtifactsBtn" class="secondary">生成风格提示词/Skill</button>
        </div>
        <p class="muted">本地文章库：${escapeHtml(inboxPath)}</p>
        <pre id="profileBox">${escapeHtml(profile ? JSON.stringify(profile, null, 2) : "尚未生成风格库")}</pre>
      </section>
      <section class="panel tab-panel" data-panel="main">
        <h2>公众号文章生成主流程</h2>
        <label>文件名</label>
        <input id="fileName" value="draft.md" />
        <label>文章正文</label>
        <textarea id="articleText" placeholder="粘贴你的文章 Markdown 或纯文本"></textarea>
        <label>专家打磨</label>
        <div class="expert-list">
          ${ARTICLE_EXPERTS.map((expert) => `
            <label class="expert-item">
              <input type="checkbox" name="expertIds" value="${escapeHtml(expert.id)}" ${config.experts?.selectedIds?.includes(expert.id) !== false ? "checked" : ""} />
              <span><strong>${escapeHtml(expert.name)}</strong>${escapeHtml(expert.prompt.replace(/\[在此输入你的草稿\]|\[在此输入你的记录\]|\[在此输入文本\]/g, "你的文章"))}</span>
            </label>
          `).join("")}
        </div>
        <div class="row">
          <button id="createWorkflowBtn">创建工作流</button>
          <button id="runNextBtn" class="secondary" disabled>执行下一节点</button>
          <button id="runToArchiveBtn" class="secondary" disabled>生成到预览</button>
          <button id="uploadBtn" disabled>确认上传到草稿箱</button>
        </div>
        <p class="muted">节点可暂停、修改、继续。不点击确认上传，不会调用微信草稿接口。</p>
      </section>
    </div>
    <section class="panel preview">
      <h2>工作流审计与手机预览</h2>
      <div id="status" class="muted">等待输入文章。</div>
      <div id="workflowBox"></div>
      <section class="node-editor">
        <h2>节点修改</h2>
        <label>文章节点修改 JSON（title/digest/markdown/html）</label>
        <textarea id="articlePatch" placeholder='{"title":"新的标题"}'></textarea>
        <button id="applyArticlePatchBtn" class="secondary" disabled>应用文章修改并从配图继续</button>
        <label>配图 Brief 修改 JSON</label>
        <textarea id="visualPatch" placeholder='{"coverPrompt":"...","inlinePrompts":["..."]}'></textarea>
        <button id="applyVisualPatchBtn" class="secondary" disabled>应用配图修改并重新生成图片</button>
      </section>
      <div id="result"></div>
    </section>
  </main>
  <script>
    let currentTaskPath = "";
    let currentWorkflowId = "";
    const statusEl = document.querySelector("#status");
    const resultEl = document.querySelector("#result");
    const workflowEl = document.querySelector("#workflowBox");
    document.querySelectorAll(".tab").forEach(button => {
      button.onclick = () => {
        document.querySelectorAll(".tab").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.toggle("hidden", panel.dataset.panel !== button.dataset.tab));
      };
    });
    document.querySelector("#importBtn").onclick = async () => {
      statusEl.textContent = "正在抓取历史文章并合并到风格库...";
      const data = await postJson("/api/profile/import-links", { links: document.querySelector("#links").value });
      document.querySelector("#profileBox").textContent = JSON.stringify(data, null, 2);
      statusEl.textContent = data.ok ? "风格库已更新。" : data.error;
    };
    document.querySelector("#importTextBtn").onclick = async () => {
      statusEl.textContent = "正在保存历史正文并更新风格库...";
      const data = await postJson("/api/profile/import-text", {
        title: document.querySelector("#historyTitle").value,
        text: document.querySelector("#historyText").value
      });
      document.querySelector("#profileBox").textContent = JSON.stringify(data, null, 2);
      statusEl.textContent = data.ok ? "历史正文已保存，风格库已更新。" : data.error;
    };
    document.querySelector("#refreshProfileBtn").onclick = async () => {
      statusEl.textContent = "正在从本地文章库刷新风格库...";
      const data = await postJson("/api/profile/refresh", {});
      document.querySelector("#profileBox").textContent = JSON.stringify(data, null, 2);
      statusEl.textContent = data.ok ? "风格库已从本地文章库刷新。" : data.error;
    };
    document.querySelector("#refreshStyleArtifactsBtn").onclick = async () => {
      statusEl.textContent = "正在提炼历史文章特征并生成标准化提示词/Skill...";
      const data = await postJson("/api/style/refresh-artifacts", {});
      document.querySelector("#profileBox").textContent = JSON.stringify(data, null, 2);
      statusEl.textContent = data.ok ? "风格提示词和 Skill 已生成。" : data.error;
    };
    document.querySelector("#secretStatusBtn").onclick = async () => {
      const data = await fetch("/api/secrets/status").then(response => response.json());
      document.querySelector("#secretBox").textContent = JSON.stringify(data, null, 2);
      statusEl.textContent = data.ok ? "安全配置检查完成。" : data.error;
    };
    document.querySelector("#importSecretsBtn").onclick = async () => {
      statusEl.textContent = "正在把微信和云主机配置导入本地加密库...";
      const data = await postJson("/api/secrets/import-local", {});
      document.querySelector("#secretBox").textContent = JSON.stringify(data, null, 2);
      statusEl.textContent = data.ok ? "敏感配置已加密保存。" : data.error;
    };
    document.querySelector("#createWorkflowBtn").onclick = async () => {
      statusEl.textContent = "正在创建文章生成工作流...";
      document.querySelector("#uploadBtn").disabled = true;
      const data = await postJson("/api/workflows/create", {
        fileName: document.querySelector("#fileName").value,
        text: document.querySelector("#articleText").value,
        expertIds: [...document.querySelectorAll('input[name="expertIds"]:checked')].map(input => input.value)
      });
      if (!data.ok) { statusEl.textContent = data.error; return; }
      updateWorkflow(data.workflow);
      statusEl.textContent = "工作流已创建。你可以逐步执行，也可以一键生成到预览。";
    };
    document.querySelector("#runNextBtn").onclick = async () => {
      if (!currentWorkflowId) return;
      statusEl.textContent = "正在执行下一节点...";
      const data = await postJson("/api/workflows/run-step", { workflowId: currentWorkflowId });
      if (!data.ok) { statusEl.textContent = data.error; return; }
      updateWorkflow(data.workflow);
      statusEl.textContent = "节点执行完成。";
    };
    document.querySelector("#runToArchiveBtn").onclick = async () => {
      if (!currentWorkflowId) return;
      statusEl.textContent = "正在执行到本地归档和手机预览...";
      const data = await postJson("/api/workflows/run-until", { workflowId: currentWorkflowId, untilStepId: "archive" });
      if (!data.ok) { statusEl.textContent = data.error; return; }
      updateWorkflow(data.workflow);
      statusEl.textContent = "已生成到预览，可审核后上传草稿箱。";
    };
    document.querySelector("#uploadBtn").onclick = async () => {
      if (!currentWorkflowId) return;
      statusEl.textContent = "正在通过云主机上传封面、正文图片并创建草稿...";
      const data = await postJson("/api/workflows/run-step", { workflowId: currentWorkflowId, stepId: "upload" });
      statusEl.textContent = data.ok ? "已上传到微信公众号草稿箱。" : data.error;
      if (data.ok) {
        updateWorkflow(data.workflow);
        alert("草稿创建成功：" + data.workflow.data.uploadResult.mediaId);
      }
    };
    document.querySelector("#applyArticlePatchBtn").onclick = async () => {
      if (!currentWorkflowId) return;
      const patch = parsePatch("#articlePatch");
      if (!patch) return;
      const data = await postJson("/api/workflows/update-node", { workflowId: currentWorkflowId, node: "article", patch });
      if (!data.ok) { statusEl.textContent = data.error; return; }
      updateWorkflow(data.workflow);
      statusEl.textContent = "文章节点已修改，可以继续执行配图节点。";
    };
    document.querySelector("#applyVisualPatchBtn").onclick = async () => {
      if (!currentWorkflowId) return;
      const patch = parsePatch("#visualPatch");
      if (!patch) return;
      const data = await postJson("/api/workflows/update-node", { workflowId: currentWorkflowId, node: "visual", patch });
      if (!data.ok) { statusEl.textContent = data.error; return; }
      updateWorkflow(data.workflow);
      statusEl.textContent = "配图 Brief 已修改，可以重新生成图片。";
    };
    async function postJson(url, body) {
      const response = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body) });
      return response.json();
    }
    function renderResult(article) {
      if (!article) return "";
      const images = article.images.map(image => '<div><img src="' + image.localPath.replace(location.origin, "") + '" /><div class="muted">' + image.kind + '</div></div>').join("");
      return '<div class="article"><h1>' + escapeHtml(article.title) + '</h1><p class="muted">' + escapeHtml(article.digest) + '</p>' + renderArchive(article.archive) + '<div class="image-grid">' + images + '</div><div class="phone-shell">' + article.html + '</div>' + renderExperts(article.expertReviews) + '<h2>改动说明</h2><pre>' + escapeHtml(article.changeLog.join("\\n")) + '</pre><h2>风险提示</h2><pre>' + escapeHtml((article.riskNotes || []).join("\\n") || "无") + '</pre></div>';
    }
    function updateWorkflow(workflow) {
      currentWorkflowId = workflow.id;
      currentTaskPath = workflow.data?.taskPath || "";
      document.querySelector("#runNextBtn").disabled = false;
      document.querySelector("#runToArchiveBtn").disabled = false;
      document.querySelector("#applyArticlePatchBtn").disabled = !workflow.data?.transformed;
      document.querySelector("#applyVisualPatchBtn").disabled = !workflow.data?.visualBrief;
      document.querySelector("#uploadBtn").disabled = !workflow.data?.archive;
      workflowEl.innerHTML = renderWorkflow(workflow);
      resultEl.innerHTML = workflow.processed ? renderResult(workflow.processed) : "";
      if (workflow.data?.transformed) {
        document.querySelector("#articlePatch").value = JSON.stringify({
          title: workflow.data.transformed.title,
          digest: workflow.data.transformed.digest
        }, null, 2);
      }
      if (workflow.data?.visualBrief) {
        document.querySelector("#visualPatch").value = JSON.stringify(workflow.data.visualBrief, null, 2);
      }
    }
    function renderWorkflow(workflow) {
      const steps = workflow.steps.map(step => '<div class="workflow-node ' + step.status + '"><strong>' + escapeHtml(step.name) + '</strong><span>' + escapeHtml(step.status) + '</span></div>').join("");
      const logs = workflow.logs.slice(-20).map(log => '[' + log.at + '] ' + log.stepId + ' · ' + log.message).join("\\n");
      return '<div class="workflow-steps">' + steps + '</div><h2>执行日志</h2><pre>' + escapeHtml(logs || "暂无日志") + '</pre>';
    }
    function parsePatch(selector) {
      try {
        return JSON.parse(document.querySelector(selector).value || "{}");
      } catch (error) {
        statusEl.textContent = "JSON 格式不正确：" + error.message;
        return null;
      }
    }
    function renderArchive(archive) {
      if (!archive) return "";
      return '<section style="margin:14px 0;padding:12px;border:1px solid #d9ebe5;border-radius:8px;background:#f6fbf9;"><strong>已保存到本地</strong><pre style="margin:8px 0 0;">' + escapeHtml(archive.dirPath) + '</pre></section>';
    }
    function renderExperts(reviews) {
      if (!reviews) return "";
      return '<h2>专家打磨记录</h2><pre>' + escapeHtml(JSON.stringify(reviews, null, 2)) + '</pre>';
    }
    function escapeHtml(s) { return String(s || "").replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch])); }
  </script>
</body>
</html>`;
}

async function importLinksApi(request) {
  const body = await readBody(request);
  const config = await loadConfig(cwd);
  const links = String(body.links || "").split(/\r?\n/);
  const result = await importHistoryLinks(links, { cwd, profileName: config.profileName, aiClient: new AiClient() });
  return { ok: true, ...result };
}

async function importTextApi(request) {
  const body = await readBody(request);
  const config = await loadConfig(cwd);
  const title = String(body.title || "").trim() || "手动粘贴历史文章";
  const text = String(body.text || "").trim();
  if (!text) throw new Error("请先粘贴历史文章正文。");
  const inboxDir = historyInboxPath(cwd, config.profileName);
  await ensureDir(inboxDir);
  const sourcePath = path.join(inboxDir, `${Date.now()}-${slugify(title)}.md`);
  await fs.writeFile(sourcePath, `---\ntitle: ${title}\n---\n\n${text}\n`, "utf8");
  const result = await importHistoryTexts([{
    title,
    text,
    sourcePath
  }], { cwd, profileName: config.profileName, aiClient: new AiClient() });
  return { ok: true, ...result };
}

async function refreshProfileApi() {
  const config = await loadConfig(cwd);
  const result = await refreshStyleProfile({ cwd, profileName: config.profileName, aiClient: new AiClient() });
  return { ok: true, ...result };
}

async function profileApi() {
  const config = await loadConfig(cwd);
  return { ok: true, profile: await loadStyleProfile(cwd, config.profileName) };
}

async function styleInspectApi() {
  const config = await loadConfig(cwd);
  return { ok: true, ...(await inspectStyleEngine({ cwd, profileName: config.profileName })) };
}

async function refreshStyleArtifactsApi() {
  const config = await loadConfig(cwd);
  return { ok: true, ...(await refreshStyleArtifacts({ cwd, profileName: config.profileName, aiClient: new AiClient() })) };
}

async function secretsStatusApi() {
  return { ok: true, ...maskSecretStatus(await secureSecretsStatus(cwd)) };
}

async function importLocalSecretsApi() {
  const config = await loadConfig(cwd);
  return { ok: true, ...maskSecretStatus(await importLocalSecretsToVault({ cwd, config })) };
}

async function workflowsApi() {
  return { ok: true, workflows: await listWorkflows(cwd) };
}

async function createWorkflowApi(request) {
  const body = await readBody(request);
  const config = await loadConfig(cwd);
  const workflow = await createArticleWorkflow({
    cwd,
    fileName: body.fileName || "draft.md",
    text: body.text || "",
    expertIds: Array.isArray(body.expertIds) ? body.expertIds : null,
    config
  });
  return { ok: true, workflow: publicWorkflow(workflow) };
}

async function runWorkflowStepApi(request) {
  const body = await readBody(request);
  const workflow = await runWorkflowStep({
    cwd,
    workflowId: String(body.workflowId || ""),
    stepId: body.stepId || null,
    aiClient: new AiClient()
  });
  return { ok: true, workflow: publicWorkflow(workflow) };
}

async function runWorkflowUntilApi(request) {
  const body = await readBody(request);
  const workflow = await runWorkflowUntil({
    cwd,
    workflowId: String(body.workflowId || ""),
    untilStepId: body.untilStepId || "archive",
    aiClient: new AiClient()
  });
  return { ok: true, workflow: publicWorkflow(workflow) };
}

async function updateWorkflowNodeApi(request) {
  const body = await readBody(request);
  const workflow = await updateWorkflowNode({
    cwd,
    workflowId: String(body.workflowId || ""),
    node: body.node,
    patch: body.patch || {}
  });
  return { ok: true, workflow: publicWorkflow(workflow) };
}

async function previewApi(request) {
  const body = await readBody(request);
  if (!String(body.text || "").trim()) throw new Error("请先粘贴文章正文。");
  const safeName = path.basename(body.fileName || "draft.md");
  const tempDir = path.join(cwd, "data", "web-input");
  await ensureDir(tempDir);
  const filePath = path.join(tempDir, safeName);
  await fs.writeFile(filePath, body.text, "utf8");
  const config = await loadConfig(cwd);
  if (Array.isArray(body.expertIds)) {
    config.experts = { ...(config.experts || {}), enabled: body.expertIds.length > 0, selectedIds: body.expertIds };
  }
  const processed = await processArticle(filePath, { cwd, config, aiClient: new AiClient() });
  const taskPath = path.join(cwd, "data", "tasks", `latest-web-preview.json`);
  await writeJson(taskPath, processed);
  return { ok: true, processed: publicArticle(processed), taskPath, archive: processed.archive };
}

async function uploadApi(request) {
  const body = await readBody(request);
  const config = await loadConfig(cwd);
  const taskPath = path.resolve(String(body.taskPath || ""));
  if (!taskPath.startsWith(path.join(cwd, "data", "tasks"))) throw new Error("Invalid task path");
  const processed = await readJson(taskPath);
  const result = await uploadProcessedArticleWithStrategy(processed, { cwd, config });
  return { ok: true, result };
}

function publicWorkflow(workflow) {
  const processed = workflowToProcessed(workflow);
  return {
    ...workflow,
    processed: processed ? publicArticle(processed) : null
  };
}

function publicArticle(processed) {
  const images = processed.images.map((image) => ({
    ...image,
    localPath: image.localPath.replace(cwd, "")
  }));
  let htmlPreview = processed.html;
  images
    .filter((image) => image.kind === "inline")
    .forEach((image, index) => {
      const src = image.localPath;
      const imgHtml = `<p style="margin:22px 0;text-align:center;"><img src="${src}" alt="" style="max-width:100%;height:auto;border-radius:8px;" /></p>`;
      htmlPreview = replaceImagePlaceholderHtml(htmlPreview, index + 1, imgHtml);
    });
  htmlPreview = htmlPreview.replace(/\{\{INLINE_IMAGE_\d+\}\}/g, "");
  return {
    ...processed,
    html: htmlPreview,
    images,
    archive: processed.archive
  };
}

function maskSecretStatus(status) {
  return {
    vaultPath: status.vaultPath,
    keyPath: status.keyPath,
    hasVault: status.hasVault,
    hasMasterKey: status.hasMasterKey,
    hasWechatCredentials: status.hasWechatCredentials,
    hasRemoteHost: status.hasRemoteHost,
    hasRemoteLogin: status.hasRemoteLogin,
    hasRemotePassword: status.hasRemotePassword,
    hasRemotePrivateKey: status.hasRemotePrivateKey,
    updatedAt: status.updatedAt
  };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function html(response, body) {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(body);
}

async function json(response, body, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function file(response, filePath) {
  try {
    const bytes = await fs.readFile(filePath);
    const type = filePath.endsWith(".svg") ? "image/svg+xml" : "image/png";
    response.writeHead(200, { "Content-Type": type });
    response.end(bytes);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500);
    response.end(error.code === "ENOENT" ? "File not found" : error.message);
  }
}
