import { WeChatClient } from "./client.js";
import { loadWechatCredentials } from "./credentials.js";
import { uploadProcessedArticle } from "./uploader.js";
import { uploadProcessedArticleRemotely } from "./remoteUploader.js";

export async function uploadProcessedArticleWithStrategy(processedArticle, {
  cwd = process.cwd(),
  config = {}
} = {}) {
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
