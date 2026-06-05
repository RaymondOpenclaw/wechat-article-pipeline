import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { imagePlaceholder } from "../utils/html.js";
import { ensureDir, slugify, writeJson } from "../utils/files.js";
import { readSecretConfig, resolveConfigPath } from "../utils/secretConfig.js";
import { readSecureSecrets } from "../utils/secureVault.js";
import { loadWechatCredentials } from "./credentials.js";

const execFileAsync = promisify(execFile);

export async function uploadProcessedArticleRemotely(processedArticle, {
  cwd = process.cwd(),
  config = {}
} = {}) {
  const remote = await loadRemoteUploadConfig({ cwd, config });
  const credentials = await loadWechatCredentials({ cwd, config });
  if (!credentials.appId || !credentials.appSecret) {
    throw new Error("Missing WeChat official account AppID/AppSecret for remote upload");
  }
  const payload = await buildRemotePayload(processedArticle, config, credentials);
  const runId = `${Date.now()}-${slugify(processedArticle.title)}`;
  const localDir = path.join(tmpdir(), `wechat-draft-remote-${runId}`);
  await ensureDir(localDir);
  const localPayloadPath = path.join(localDir, "payload.json");
  const localScriptPath = path.join(localDir, "remote-wechat-upload.mjs");
  await fs.writeFile(localPayloadPath, JSON.stringify(payload), "utf8");
  await fs.writeFile(localScriptPath, REMOTE_UPLOAD_SCRIPT, "utf8");
  if (!remote.privateKeyPath && remote.privateKeyPem) {
    remote.privateKeyPath = path.join(localDir, "remote-upload.pem");
    await fs.writeFile(remote.privateKeyPath, remote.privateKeyPem, "utf8");
    await fs.chmod(remote.privateKeyPath, 0o600);
  }

  const remoteDir = remote.workDir.replace(/\/$/, "");
  const remotePayloadPath = `${remoteDir}/${runId}-payload.json`;
  const remoteScriptPath = `${remoteDir}/${runId}-upload.mjs`;
  const remoteTarget = `${remote.username}@${remote.host}`;
  const portArgs = remote.port ? ["-P", String(remote.port)] : [];
  const sshPortArgs = remote.port ? ["-p", String(remote.port)] : [];
  const keyArgs = remote.privateKeyPath ? ["-i", remote.privateKeyPath, "-o", "IdentitiesOnly=yes"] : [];

  await remoteRun([
    "ssh",
    ...sshPortArgs,
    ...keyArgs,
    "-o", "StrictHostKeyChecking=accept-new",
    remoteTarget,
    `mkdir -p ${shellQuote(remoteDir)}`
  ], remote, { timeoutMs: 30_000 });
  await remoteRun([
    "scp",
    ...portArgs,
    ...keyArgs,
    "-o", "StrictHostKeyChecking=accept-new",
    localScriptPath,
    `${remoteTarget}:${remoteScriptPath}`
  ], remote, { timeoutMs: 60_000 });
  await remoteRun([
    "scp",
    ...portArgs,
    ...keyArgs,
    "-o", "StrictHostKeyChecking=accept-new",
    localPayloadPath,
    `${remoteTarget}:${remotePayloadPath}`
  ], remote, { timeoutMs: 60_000 });

  const { stdout } = await remoteRun([
    "ssh",
    ...sshPortArgs,
    ...keyArgs,
    "-o", "StrictHostKeyChecking=accept-new",
    remoteTarget,
    `node ${shellQuote(remoteScriptPath)} ${shellQuote(remotePayloadPath)}`
  ], remote, { timeoutMs: Number(config.remoteUpload?.timeoutMs || 180_000), maxBuffer: 1024 * 1024 });
  const result = parseRemoteResult(stdout);
  const uploadResult = {
    ...result,
    title: payload.article.title,
    digest: payload.article.digest,
    uploadVia: "remote",
    remoteHost: remote.host,
    uploadedAt: result.uploadedAt || new Date().toISOString()
  };
  const resultPath = path.join(cwd, "data", "tasks", `${Date.now()}-${slugify(payload.article.title)}-remote-upload.json`);
  await writeJson(resultPath, uploadResult);
  return { ...uploadResult, resultPath };
}

export async function loadRemoteUploadConfig({ cwd = process.cwd(), config = {} } = {}) {
  const remoteConfig = config.remoteUpload || {};
  if (remoteConfig.enabled === false) return null;
  const secretPath = resolveConfigPath(cwd, remoteConfig.configPath || "config.json");
  const secret = await readSecretConfig(secretPath, {});
  const secure = await readSecureSecrets(cwd);
  const secureRemote = secure.remoteUpload || {};
  const host = remoteConfig.host || secureRemote.host || secret.host;
  const username = remoteConfig.username || remoteConfig.user || secureRemote.username || secret.username;
  const password = remoteConfig.password || secureRemote.password || secret.password;
  const configuredPrivateKeyPath = remoteConfig.privateKeyPath || secureRemote.privateKeyPath || secret.privateKeyPath || secret.private_key_path || "";
  const privateKeyPath = configuredPrivateKeyPath && await exists(configuredPrivateKeyPath) ? configuredPrivateKeyPath : "";
  const privateKeyPem = secureRemote.privateKeyPem || "";
  const port = remoteConfig.port || secureRemote.port || secret.port || 22;
  const workDir = remoteConfig.workDir || secureRemote.workDir || secret.workDir || "/tmp/wechat-draft-upload";
  if (!host || !username || (!password && !privateKeyPath && !privateKeyPem)) {
    throw new Error("Remote upload is enabled but host/username and password/privateKeyPath are incomplete");
  }
  return { host, username, password, privateKeyPath, privateKeyPem, port, workDir };
}

export async function buildRemotePayload(processedArticle, config, credentials) {
  const cover = processedArticle.images.find((image) => image.kind === "cover");
  if (!cover) throw new Error("Processed article does not include a cover image");
  const images = [];
  for (const image of processedArticle.images) {
    images.push({
      kind: image.kind,
      name: path.basename(image.localPath),
      placeholder: image.kind === "inline" ? imagePlaceholder(images.filter((item) => item.kind === "inline").length + 1) : "",
      bytesBase64: (await fs.readFile(image.localPath)).toString("base64")
    });
  }
  return {
    appId: credentials.appId,
    appSecret: credentials.appSecret,
    article: {
      title: processedArticle.title,
      author: config.author || processedArticle.input?.metadata?.author || "",
      digest: processedArticle.digest,
      content: processedArticle.html,
      contentSourceUrl: processedArticle.input?.metadata?.source_url || "",
      needOpenComment: Number(config.wechat?.needOpenComment ?? 0),
      onlyFansCanComment: Number(config.wechat?.onlyFansCanComment ?? 0),
      showCoverPic: Number(config.wechat?.showCoverPic ?? 1)
    },
    images
  };
}

async function remoteRun(args, remote, options = {}) {
  if (remote.privateKeyPath) {
    const [command, ...commandArgs] = args;
    return execFileAsync(command, commandArgs, {
      timeout: (options.timeoutMs || 120_000) + 5000,
      maxBuffer: options.maxBuffer || 512 * 1024
    });
  }
  return expectRun(args, remote.password, options);
}

async function expectRun(args, password, { timeoutMs = 120_000, maxBuffer = 512 * 1024 } = {}) {
  const script = `
set timeout ${Math.ceil(timeoutMs / 1000)}
set password $env(REMOTE_UPLOAD_PASSWORD)
set cmd $argv
spawn {*}$cmd
expect {
  -re "(?i)are you sure you want to continue connecting" { send "yes\\r"; exp_continue }
  -re "(?i)password:" { send -- "$password\\r"; exp_continue }
  -re "(?i)permission denied" { exit 13 }
  eof
}
catch wait result
exit [lindex $result 3]
`;
  const scriptPath = path.join(tmpdir(), `wechat-draft-expect-${Date.now()}-${Math.random().toString(16).slice(2)}.exp`);
  await fs.writeFile(scriptPath, script, "utf8");
  try {
    return await execFileAsync("expect", [scriptPath, ...args], {
      timeout: timeoutMs + 5000,
      maxBuffer,
      env: {
        ...process.env,
        REMOTE_UPLOAD_PASSWORD: password
      }
    });
  } finally {
    await fs.rm(scriptPath, { force: true });
  }
}

function parseRemoteResult(stdout) {
  const lines = String(stdout || "").trim().split(/\r?\n/).filter(Boolean);
  for (const line of lines.reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const payload = JSON.parse(trimmed);
      if (payload.mediaId) return payload;
    } catch {
      // Keep looking.
    }
  }
  throw new Error("Remote upload did not return a valid draft media_id");
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const REMOTE_UPLOAD_SCRIPT = String.raw`
import fs from "node:fs/promises";
import path from "node:path";

const payloadPath = process.argv[2];
if (!payloadPath) throw new Error("Missing payload path");
const payload = JSON.parse(await fs.readFile(payloadPath, "utf8"));
const runDir = path.join(path.dirname(payloadPath), path.basename(payloadPath, ".json"));
await fs.mkdir(runDir, { recursive: true });

async function getAccessToken() {
  const url = "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid="
    + encodeURIComponent(payload.appId)
    + "&secret="
    + encodeURIComponent(payload.appSecret);
  const data = await requestJson(url);
  if (!data.access_token) throw new Error("WeChat token response missing access_token: " + JSON.stringify(data));
  return data.access_token;
}

async function uploadImage({ token, image, permanent }) {
  const filePath = path.join(runDir, image.name);
  await fs.writeFile(filePath, Buffer.from(image.bytesBase64, "base64"));
  const form = new FormData();
  const blob = new Blob([await fs.readFile(filePath)], { type: "image/png" });
  form.append("media", blob, image.name);
  const url = permanent
    ? "https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=" + token + "&type=image"
    : "https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=" + token;
  const data = await requestJson(url, { method: "POST", body: form });
  if (permanent && !data.media_id) throw new Error("Permanent image upload failed: " + JSON.stringify(data));
  if (!permanent && !data.url) throw new Error("Article image upload failed: " + JSON.stringify(data));
  return data;
}

async function addDraft(token, article) {
  const data = await requestJson("https://api.weixin.qq.com/cgi-bin/draft/add?access_token=" + token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ articles: [article] })
  });
  if (!data.media_id) throw new Error("Draft creation failed: " + JSON.stringify(data));
  return data;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) throw new Error("WeChat HTTP " + response.status + ": " + text);
  if (data.errcode && data.errcode !== 0) throw new Error("WeChat API error " + data.errcode + ": " + (data.errmsg || "unknown"));
  return data;
}

function replaceImagePlaceholderHtml(html, index, replacementHtml) {
  const placeholder = "{{INLINE_IMAGE_" + index + "}}";
  const escaped = placeholder.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const paragraphPattern = new RegExp("<p\\b[^>]*>\\s*" + escaped + "\\s*<\\/p>", "g");
  return String(html).replace(paragraphPattern, replacementHtml).replaceAll(placeholder, replacementHtml);
}

const token = await getAccessToken();
const cover = payload.images.find((image) => image.kind === "cover");
const inlineImages = payload.images.filter((image) => image.kind === "inline");
const coverUpload = await uploadImage({ token, image: cover, permanent: true });
let content = payload.article.content;
const imageMappings = [];
for (const [index, image] of inlineImages.entries()) {
  const upload = await uploadImage({ token, image, permanent: false });
  const imgHtml = '<p style="text-align:center;"><img src="' + upload.url + '" alt="" style="max-width:100%;height:auto;" /></p>';
  content = replaceImagePlaceholderHtml(content, index + 1, imgHtml);
  imageMappings.push({ placeholder: "{{INLINE_IMAGE_" + (index + 1) + "}}", url: upload.url });
}
content = content.replace(/\{\{INLINE_IMAGE_\d+\}\}/g, "");
const articlePayload = {
  title: payload.article.title,
  author: payload.article.author || "",
  digest: payload.article.digest || "",
  content,
  content_source_url: payload.article.contentSourceUrl || "",
  thumb_media_id: coverUpload.media_id,
  need_open_comment: Number(payload.article.needOpenComment || 0),
  only_fans_can_comment: Number(payload.article.onlyFansCanComment || 0),
  show_cover_pic: Number(payload.article.showCoverPic ?? 1)
};
const draft = await addDraft(token, articlePayload);
console.log(JSON.stringify({
  mediaId: draft.media_id,
  coverMediaId: coverUpload.media_id,
  imageMappings,
  uploadedAt: new Date().toISOString()
}));
`;
