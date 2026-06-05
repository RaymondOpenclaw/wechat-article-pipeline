import path from "node:path";
import { imagePlaceholder, replaceImagePlaceholderHtml } from "../utils/html.js";
import { writeJson, slugify } from "../utils/files.js";
import { WeChatClient } from "./client.js";

export async function uploadProcessedArticle(processedArticle, {
  cwd = process.cwd(),
  config = {},
  wechatClient = new WeChatClient({ cwd })
} = {}) {
  const cover = processedArticle.images.find((image) => image.kind === "cover");
  if (!cover) throw new Error("Processed article does not include a cover image");

  const coverUpload = await wechatClient.uploadPermanentImage(cover.localPath);
  cover.mediaId = coverUpload.media_id;

  let content = processedArticle.html;
  const inlineImages = processedArticle.images.filter((image) => image.kind === "inline");
  const imageMappings = [];
  for (const [index, image] of inlineImages.entries()) {
    const upload = await wechatClient.uploadArticleImage(image.localPath);
    image.wechatUrl = upload.url;
    const imgHtml = `<p style="text-align:center;"><img src="${upload.url}" alt="" style="max-width:100%;height:auto;" /></p>`;
    content = replaceImagePlaceholderHtml(content, index + 1, imgHtml);
    imageMappings.push({ placeholder: imagePlaceholder(index + 1), localPath: image.localPath, url: upload.url });
  }
  content = content.replace(/\{\{INLINE_IMAGE_\d+\}\}/g, "");

  const articlePayload = {
    title: processedArticle.title,
    author: config.author || processedArticle.input.metadata.author || "",
    digest: processedArticle.digest,
    content,
    content_source_url: processedArticle.input.metadata.source_url || "",
    thumb_media_id: coverUpload.media_id,
    need_open_comment: Number(config.wechat?.needOpenComment ?? 0),
    only_fans_can_comment: Number(config.wechat?.onlyFansCanComment ?? 0),
    show_cover_pic: Number(config.wechat?.showCoverPic ?? 1)
  };
  const draft = await wechatClient.addDraft(articlePayload);
  const result = {
    mediaId: draft.media_id,
    title: processedArticle.title,
    digest: processedArticle.digest,
    coverMediaId: coverUpload.media_id,
    imageMappings,
    uploadedAt: new Date().toISOString()
  };
  const resultPath = path.join(cwd, "data", "tasks", `${Date.now()}-${slugify(processedArticle.title)}-upload.json`);
  await writeJson(resultPath, result);
  return result;
}
