import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { parseSecretConfig } from "../src/utils/secretConfig.js";
import { buildRemotePayload, loadRemoteUploadConfig } from "../src/wechat/remoteUploader.js";

test("parseSecretConfig supports loose cloud host config", () => {
  const config = parseSecretConfig("Ttcloud\nuser=ubuntu\npwd=secret\n");
  assert.equal(config.name, "Ttcloud");
  assert.equal(config.username, "ubuntu");
  assert.equal(config.password, "secret");
});

test("loadRemoteUploadConfig merges public host with private local secrets", async () => {
  const cwd = await fs.mkdtemp(path.join(process.cwd(), "tmp-remote-config-"));
  await fs.writeFile(path.join(cwd, "config.json"), "Ttcloud\nuser=root\npwd=secret\n", "utf8");
  const config = await loadRemoteUploadConfig({
    cwd,
    config: {
      remoteUpload: {
        enabled: true,
        host: "81.68.126.119",
        configPath: "config.json"
      }
    }
  });
  assert.equal(config.host, "81.68.126.119");
  assert.equal(config.username, "root");
  assert.equal(config.password, "secret");
  assert.equal(config.workDir, "/tmp/wechat-draft-upload");
  await fs.rm(cwd, { recursive: true, force: true });
});

test("loadRemoteUploadConfig supports private key authentication", async () => {
  const cwd = await fs.mkdtemp(path.join(process.cwd(), "tmp-remote-key-config-"));
  const keyPath = path.join(cwd, "key.pem");
  await fs.writeFile(path.join(cwd, "config.json"), "Ttcloud\nuser=ubuntu\n", "utf8");
  await fs.writeFile(keyPath, "KEY", "utf8");
  const config = await loadRemoteUploadConfig({
    cwd,
    config: {
      remoteUpload: {
        enabled: true,
        host: "81.68.126.119",
        privateKeyPath: keyPath
      }
    }
  });
  assert.equal(config.username, "ubuntu");
  assert.equal(config.privateKeyPath, keyPath);
  await fs.rm(cwd, { recursive: true, force: true });
});

test("buildRemotePayload embeds images and WeChat article fields", async () => {
  const cwd = await fs.mkdtemp(path.join(process.cwd(), "tmp-remote-payload-"));
  const coverPath = path.join(cwd, "cover.png");
  const formalPath = path.join(cwd, "formal.png");
  const inlinePath = path.join(cwd, "inline.png");
  await fs.writeFile(coverPath, "cover");
  await fs.writeFile(formalPath, "formal");
  await fs.writeFile(inlinePath, "inline");
  const payload = await buildRemotePayload({
    title: "标题",
    digest: "摘要",
    html: "<p>{{FORMAL_ILLUSTRATION_1}}</p><p>{{INLINE_IMAGE_1}}</p>",
    input: { metadata: {} },
    images: [
      { kind: "cover", localPath: coverPath },
      { kind: "formal-illustration", index: 1, localPath: formalPath },
      { kind: "inline", localPath: inlinePath }
    ]
  }, {
    wechat: { showCoverPic: 1 }
  }, {
    appId: "wx-test",
    appSecret: "secret"
  });
  assert.equal(payload.appId, "wx-test");
  assert.equal(payload.article.title, "标题");
  assert.equal(payload.images.length, 3);
  assert.equal(payload.images[1].placeholder, "{{FORMAL_ILLUSTRATION_1}}");
  assert.equal(payload.images[2].placeholder, "{{INLINE_IMAGE_1}}");
  assert.ok(payload.images[0].bytesBase64);
  await fs.rm(cwd, { recursive: true, force: true });
});
