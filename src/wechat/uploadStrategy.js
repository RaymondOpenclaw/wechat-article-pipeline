import { WeChatClient } from "./client.js";
import { loadWechatCredentials } from "./credentials.js";
import { uploadProcessedArticle } from "./uploader.js";
import { uploadProcessedArticleRemotely } from "./remoteUploader.js";

export async function uploadProcessedArticleWithStrategy(processedArticle, {
  cwd = process.cwd(),
  config = {}
} = {}) {
  assertFormalIllustrationsReady(processedArticle);
  if (config.remoteUpload?.enabled) {
    return uploadProcessedArticleRemotely(processedArticle, { cwd, config });
  }
  const credentials = await loadWechatCredentials({ cwd, config });
  return uploadProcessedArticle(processedArticle, {
    cwd,
    config,
    wechatClient: new WeChatClient({
      cwd,
      appId: credentials.appId,
      appSecret: credentials.appSecret
    })
  });
}

function assertFormalIllustrationsReady(processedArticle) {
  const pending = (processedArticle.images || [])
    .filter((image) => image.kind === "formal-illustration" && image.status === "needs-host-image-generation");
  if (!pending.length) return;
  const requests = pending.map((image) => image.requestPath).filter(Boolean).join("\n");
  throw new Error([
    "正式插画还没有通过 Codex 内置 image_gen 生成并导入，已阻止上传草稿箱。",
    "请先根据 requestPath 生成图片，再运行 npm run import-image2 -- <request-json> <generated-image-path>。",
    requests ? `待处理请求：\n${requests}` : ""
  ].filter(Boolean).join("\n"));
}
