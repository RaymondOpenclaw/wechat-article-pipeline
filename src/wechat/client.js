import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, readJson, writeJson } from "../utils/files.js";

export class WeChatClient {
  constructor({
    appId = process.env.WECHAT_APP_ID,
    appSecret = process.env.WECHAT_APP_SECRET,
    cwd = process.cwd(),
    apiBase = "https://api.weixin.qq.com"
  } = {}) {
    this.appId = appId;
    this.appSecret = appSecret;
    this.cwd = cwd;
    this.apiBase = apiBase.replace(/\/$/, "");
    this.tokenPath = path.join(cwd, "data", "wechat-token.json");
  }

  validateConfig() {
    if (!this.appId || !this.appSecret) {
      throw new Error("Missing WECHAT_APP_ID or WECHAT_APP_SECRET");
    }
  }

  async getAccessToken({ forceRefresh = false } = {}) {
    this.validateConfig();
    const cached = await readJson(this.tokenPath, null);
    if (!forceRefresh && cached?.access_token && cached.expires_at > Date.now() + 60_000) {
      return cached.access_token;
    }
    const url = `${this.apiBase}/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(this.appId)}&secret=${encodeURIComponent(this.appSecret)}`;
    const payload = await this.getJson(url);
    if (!payload.access_token) {
      throw new Error(`WeChat token response missing access_token: ${JSON.stringify(payload)}`);
    }
    await writeJson(this.tokenPath, {
      access_token: payload.access_token,
      expires_at: Date.now() + (Number(payload.expires_in || 7200) - 300) * 1000
    });
    return payload.access_token;
  }

  async uploadPermanentImage(filePath) {
    const token = await this.getAccessToken();
    const url = `${this.apiBase}/cgi-bin/material/add_material?access_token=${token}&type=image`;
    const payload = await this.postMultipart(url, "media", filePath);
    if (!payload.media_id) throw new Error(`Permanent image upload failed: ${JSON.stringify(payload)}`);
    return payload;
  }

  async uploadArticleImage(filePath) {
    const token = await this.getAccessToken();
    const url = `${this.apiBase}/cgi-bin/media/uploadimg?access_token=${token}`;
    const payload = await this.postMultipart(url, "media", filePath);
    if (!payload.url) throw new Error(`Article image upload failed: ${JSON.stringify(payload)}`);
    return payload;
  }

  async addDraft(article) {
    const token = await this.getAccessToken();
    const url = `${this.apiBase}/cgi-bin/draft/add?access_token=${token}`;
    const payload = await this.postJson(url, {
      articles: [article]
    });
    if (!payload.media_id) throw new Error(`Draft creation failed: ${JSON.stringify(payload)}`);
    return payload;
  }

  async getJson(url) {
    const response = await fetch(url);
    return parseWeChatResponse(response);
  }

  async postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return parseWeChatResponse(response);
  }

  async postMultipart(url, fieldName, filePath) {
    const form = new FormData();
    const bytes = await fs.readFile(filePath);
    const blob = new Blob([bytes]);
    form.append(fieldName, blob, path.basename(filePath));
    const response = await fetch(url, { method: "POST", body: form });
    return parseWeChatResponse(response);
  }
}

export async function parseWeChatResponse(response) {
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`WeChat HTTP ${response.status}: ${text}`);
  }
  if (payload.errcode && payload.errcode !== 0) {
    throw new Error(`WeChat API error ${payload.errcode}: ${payload.errmsg || "unknown"}`);
  }
  return payload;
}

export async function resetTokenCache(cwd = process.cwd()) {
  const tokenPath = path.join(cwd, "data", "wechat-token.json");
  await ensureDir(path.dirname(tokenPath));
  await fs.rm(tokenPath, { force: true });
}
