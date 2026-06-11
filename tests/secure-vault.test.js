import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { importLocalSecretsToVault, readSecureSecrets, secureSecretsStatus, writeSecureSecrets } from "../src/utils/secureVault.js";

test("secure vault encrypts and reads secrets", async () => {
  const cwd = await fs.mkdtemp(path.join(process.cwd(), "tmp-secure-vault-"));
  await writeSecureSecrets(cwd, {
    wechat: { appId: "wx-test", appSecret: "secret" },
    remoteUpload: { host: "1.2.3.4", username: "ubuntu", privateKeyPem: "PRIVATE-KEY-MATERIAL" },
    getnote: { apiKey: "gk_live_test", clientId: "cli_test", keyId: "key-test", expiresAt: 1812252836 }
  });
  const status = await secureSecretsStatus(cwd);
  assert.equal(status.hasWechatCredentials, true);
  assert.equal(status.hasRemotePrivateKey, true);
  assert.equal(status.hasGetNoteCredentials, true);
  assert.equal(status.getNoteKeyId, "key-test");
  assert.equal(status.getNoteExpiresAt, 1812252836);
  const paths = await fs.readdir(path.join(cwd, "data", "secure"));
  assert.ok(paths.includes("secrets.enc.json"));
  const raw = await fs.readFile(path.join(cwd, "data", "secure", "secrets.enc.json"), "utf8");
  assert.equal(raw.includes("secret"), false);
  assert.equal(raw.includes("PRIVATE-KEY-MATERIAL"), false);
  const secrets = await readSecureSecrets(cwd);
  assert.equal(secrets.wechat.appSecret, "secret");
  assert.equal(secrets.remoteUpload.privateKeyPem, "PRIVATE-KEY-MATERIAL");
  assert.equal(secrets.getnote.apiKey, "gk_live_test");
  await fs.rm(cwd, { recursive: true, force: true });
});

test("importLocalSecretsToVault imports loose local files", async () => {
  const cwd = await fs.mkdtemp(path.join(process.cwd(), "tmp-secure-import-"));
  const wechatPath = path.join(cwd, "wechat.md");
  const keyPath = path.join(cwd, "key.pem");
  await fs.writeFile(path.join(cwd, "config.json"), "Ttcloud\nuser=ubuntu\npwd=bad-password\n", "utf8");
  await fs.writeFile(wechatPath, "AppID：wx-official\nAppSecret：official-secret\n", "utf8");
  await fs.writeFile(keyPath, "PRIVATE KEY", "utf8");
  const status = await importLocalSecretsToVault({
    cwd,
    wechatConfigPath: wechatPath,
    config: {
      remoteUpload: {
        host: "81.68.126.119",
        configPath: "config.json",
        privateKeyPath: keyPath
      }
    }
  });
  assert.equal(status.hasWechatCredentials, true);
  assert.equal(status.hasRemotePassword, true);
  assert.equal(status.hasRemotePrivateKey, true);
  const secrets = await readSecureSecrets(cwd);
  assert.equal(secrets.wechat.appId, "wx-official");
  assert.equal(secrets.remoteUpload.host, "81.68.126.119");
  assert.equal(secrets.remoteUpload.privateKeyPem, "PRIVATE KEY");
  await fs.rm(cwd, { recursive: true, force: true });
});
