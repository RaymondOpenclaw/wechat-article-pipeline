import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { uploadProcessedArticle } from "../src/wechat/uploader.js";

test("uploadProcessedArticle uploads cover, formal illustrations, inline images, then draft", async () => {
  const cwd = await fs.mkdtemp(path.join(process.cwd(), "tmp-wechat-"));
  const coverPath = path.join(cwd, "cover.png");
  const formalPath = path.join(cwd, "formal.png");
  const inlinePath = path.join(cwd, "inline.png");
  await fs.writeFile(coverPath, "cover");
  await fs.writeFile(formalPath, "formal");
  await fs.writeFile(inlinePath, "inline");
  const calls = [];
  const client = {
    async uploadPermanentImage(filePath) {
      calls.push(["cover", filePath]);
      return { media_id: "cover_media" };
    },
    async uploadArticleImage(filePath) {
      calls.push([filePath === formalPath ? "formal" : "inline", filePath]);
      return { url: filePath === formalPath ? "https://mmbiz.qpic.cn/formal.png" : "https://mmbiz.qpic.cn/inline.png" };
    },
    async addDraft(article) {
      calls.push(["draft", article]);
      return { media_id: "draft_media" };
    }
  };
  const result = await uploadProcessedArticle({
    title: "标题",
    digest: "摘要",
    html: "<section><p>{{FORMAL_ILLUSTRATION_1}}</p><p>{{INLINE_IMAGE_1}}</p></section>",
    input: { metadata: {} },
    images: [
      { kind: "cover", localPath: coverPath, prompt: "cover" },
      { kind: "formal-illustration", index: 1, localPath: formalPath, prompt: "formal" },
      { kind: "inline", localPath: inlinePath, prompt: "inline" }
    ]
  }, {
    cwd,
    config: { author: "作者", wechat: {} },
    wechatClient: client
  });
  assert.equal(result.mediaId, "draft_media");
  assert.deepEqual(calls.map((call) => call[0]), ["cover", "formal", "inline", "draft"]);
  assert.match(calls[3][1].content, /formal\.png/);
  assert.match(calls[3][1].content, /inline\.png/);
  assert.doesNotMatch(calls[3][1].content, /\{\{FORMAL_ILLUSTRATION_1\}\}/);
  assert.doesNotMatch(calls[3][1].content, /\{\{INLINE_IMAGE_1\}\}/);
  assert.doesNotMatch(calls[3][1].content, /<p><p/);
  await fs.rm(cwd, { recursive: true, force: true });
});
