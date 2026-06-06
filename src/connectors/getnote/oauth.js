import { mergeSecureSecrets, readSecureSecrets } from "../../utils/secureVault.js";
import { buildGetNoteError } from "./errors.js";
import { GETNOTE_BASE_URL } from "./client.js";
import { safeParseGetNoteJson } from "./normalizer.js";

export const GETNOTE_OPENCLAW_CLIENT_ID = "cli_a1b2c3d4e5f6789012345678abcdef90";

export async function getGetNoteStatus(cwd = process.cwd()) {
  const secrets = await readSecureSecrets(cwd);
  const getnote = secrets.getnote || {};
  const expiresAt = Number(getnote.expiresAt || 0);
  const now = Math.floor(Date.now() / 1000);
  return {
    hasGetNoteCredentials: Boolean(getnote.apiKey && getnote.clientId),
    getNoteClientId: getnote.clientId ? maskClientId(getnote.clientId) : "",
    getNoteKeyId: getnote.keyId || "",
    getNoteExpiresAt: expiresAt,
    getNoteExpiresAtText: expiresAt ? new Date(expiresAt * 1000).toISOString() : "",
    getNoteExpired: Boolean(expiresAt && expiresAt <= now),
    getNoteExpiringSoon: Boolean(expiresAt && expiresAt - now < 30 * 24 * 60 * 60)
  };
}

export async function saveGetNoteCredentials(cwd = process.cwd(), credentials = {}) {
  const apiKey = credentials.apiKey || credentials.api_key;
  const clientId = credentials.clientId || credentials.client_id;
  if (!apiKey || !clientId) throw new Error("Get笔记授权返回缺少 apiKey 或 clientId。");
  return mergeSecureSecrets(cwd, {
    getnote: {
      apiKey,
      clientId,
      keyId: credentials.keyId || credentials.key_id || "",
      expiresAt: Number(credentials.expiresAt || credentials.expires_at || 0)
    }
  });
}

export async function startDeviceAuthorization({
  clientId = GETNOTE_OPENCLAW_CLIENT_ID,
  baseUrl = GETNOTE_BASE_URL,
  fetchImpl = globalThis.fetch
} = {}) {
  const data = await oauthRequest(fetchImpl, baseUrl, "/open/api/v1/oauth/device/code", {
    client_id: clientId
  });
  return {
    code: data.code || "",
    userCode: data.user_code || "",
    verificationUri: data.verification_uri || "",
    verificationUriQrCode: data.verification_uri_qrcode || "",
    expiresIn: Number(data.expires_in || 600),
    interval: Number(data.interval || 5),
    clientId
  };
}

export async function pollDeviceAuthorization({
  code,
  clientId = GETNOTE_OPENCLAW_CLIENT_ID,
  baseUrl = GETNOTE_BASE_URL,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!code) throw new Error("请提供 Get笔记设备授权 code。");
  const data = await oauthRequest(fetchImpl, baseUrl, "/open/api/v1/oauth/token", {
    grant_type: "device_code",
    client_id: clientId,
    code
  });
  return {
    clientId: data.client_id || clientId,
    apiKey: data.api_key || "",
    keyId: data.key_id || "",
    expiresAt: Number(data.expires_at || 0),
    message: data.msg || ""
  };
}

async function oauthRequest(fetchImpl, baseUrl, pathname, body) {
  if (!fetchImpl) throw new Error("当前运行环境不支持 fetch。");
  const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  const payload = text ? safeParseGetNoteJson(text) : {};
  if (!response.ok || payload.success === false) {
    throw buildGetNoteError({ response, payload, fallbackMessage: "Get笔记授权请求失败" });
  }
  return payload.data || payload;
}

function maskClientId(value) {
  const text = String(value || "");
  if (text.length <= 10) return text ? "***" : "";
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}
