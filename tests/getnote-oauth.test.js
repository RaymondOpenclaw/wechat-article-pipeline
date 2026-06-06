import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { getGetNoteStatus, pollDeviceAuthorization, saveGetNoteCredentials, startDeviceAuthorization } from "../src/connectors/getnote/oauth.js";
import { readSecureSecrets } from "../src/utils/secureVault.js";

test("GetNote OAuth start and poll normalize device credentials", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    if (String(url).endsWith("/device/code")) {
      return responseJson({
        success: true,
        data: {
          code: "device-code",
          user_code: "ABCD-1234",
          verification_uri: "https://biji.com/openapi/oauth/authorize?code=device-code",
          expires_in: 600,
          interval: 5
        }
      });
    }
    return responseJson({
      success: true,
      data: {
        client_id: "cli_test",
        api_key: "gk_live_test",
        key_id: "key-test",
        expires_at: 1812252836
      }
    });
  };

  const started = await startDeviceAuthorization({ clientId: "cli_test", fetchImpl });
  const polled = await pollDeviceAuthorization({ code: started.code, clientId: "cli_test", fetchImpl });

  assert.equal(started.userCode, "ABCD-1234");
  assert.equal(polled.apiKey, "gk_live_test");
  assert.equal(calls[1].body.grant_type, "device_code");
});

test("saveGetNoteCredentials stores credentials in project secure vault", async () => {
  const cwd = await fs.mkdtemp(path.join(process.cwd(), "tmp-getnote-oauth-"));
  await saveGetNoteCredentials(cwd, {
    apiKey: "gk_live_test",
    clientId: "cli_test",
    keyId: "key-test",
    expiresAt: 1812252836
  });
  const status = await getGetNoteStatus(cwd);
  assert.equal(status.hasGetNoteCredentials, true);
  assert.equal(status.getNoteKeyId, "key-test");
  assert.equal(status.getNoteExpiresAt, 1812252836);
  const secrets = await readSecureSecrets(cwd);
  assert.equal(secrets.getnote.apiKey, "gk_live_test");
  assert.equal(secrets.getnote.clientId, "cli_test");
  await fs.rm(cwd, { recursive: true, force: true });
});

function responseJson(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "" },
    text: async () => JSON.stringify(value)
  };
}
