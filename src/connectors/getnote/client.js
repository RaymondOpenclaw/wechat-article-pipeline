import { readSecureSecrets } from "../../utils/secureVault.js";
import { buildGetNoteError } from "./errors.js";
import { buildGetNoteSourcePack, normalizeNoteDetail, normalizeNoteSummary, normalizeRecallResult, safeParseGetNoteJson } from "./normalizer.js";

export const GETNOTE_BASE_URL = "https://openapi.biji.com";

export class GetNoteClient {
  constructor({
    apiKey,
    clientId,
    baseUrl = GETNOTE_BASE_URL,
    fetchImpl = globalThis.fetch
  } = {}) {
    if (!apiKey) throw new Error("缺少 Get笔记 API Key，请先完成授权。");
    if (!clientId) throw new Error("缺少 Get笔记 Client ID，请先完成授权。");
    if (!fetchImpl) throw new Error("当前运行环境不支持 fetch。");
    this.apiKey = apiKey;
    this.clientId = clientId;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.fetchImpl = fetchImpl;
  }

  static async fromSecureVault(cwd = process.cwd(), options = {}) {
    const secrets = await readSecureSecrets(cwd);
    const getnote = secrets.getnote || {};
    return new GetNoteClient({
      apiKey: getnote.apiKey || process.env.GETNOTE_API_KEY,
      clientId: getnote.clientId || process.env.GETNOTE_CLIENT_ID,
      ...options
    });
  }

  async listNotes({ cursor = "" } = {}) {
    const data = await this.request("GET", "/open/api/v1/resource/note/list", { query: cursor ? { cursor } : {} });
    return {
      notes: (data.notes || []).map(normalizeNoteSummary),
      hasMore: Boolean(data.has_more),
      cursor: String(data.cursor || ""),
      total: Number(data.total || data.notes?.length || 0)
    };
  }

  async getNoteDetail({ noteId, imageQuality = "" } = {}) {
    if (!noteId) throw new Error("请提供 Get笔记 note_id。");
    const data = await this.request("GET", "/open/api/v1/resource/note/detail", {
      query: {
        id: String(noteId),
        ...(imageQuality ? { image_quality: imageQuality } : {})
      }
    });
    return normalizeNoteDetail(data.note || data);
  }

  async searchNotes({ query, topK = 3 } = {}) {
    if (!String(query || "").trim()) throw new Error("请提供搜索关键词。");
    const data = await this.request("POST", "/open/api/v1/resource/recall", {
      body: {
        query: String(query).trim(),
        top_k: clampTopK(topK)
      }
    });
    return {
      results: (data.results || []).map(normalizeRecallResult)
    };
  }

  async listKnowledgeBases({ page = 1, subscribed = false } = {}) {
    const path = subscribed
      ? "/open/api/v1/resource/knowledge/subscribe/list"
      : "/open/api/v1/resource/knowledge/list";
    const data = await this.request("GET", path, { query: { page: Math.max(1, Number(page) || 1) } });
    return {
      topics: (data.topics || []).map((topic) => ({
        topicId: String(topic.topic_id || ""),
        name: topic.name || "",
        description: topic.description || "",
        cover: topic.cover || "",
        stats: topic.stats || {},
        createdAt: topic.created_at || "",
        updatedAt: topic.updated_at || ""
      })),
      hasMore: Boolean(data.has_more),
      total: Number(data.total || 0)
    };
  }

  async searchKnowledge({ topicId, query, topK = 3 } = {}) {
    if (!topicId) throw new Error("请提供知识库 topic_id。");
    if (!String(query || "").trim()) throw new Error("请提供搜索关键词。");
    const data = await this.request("POST", "/open/api/v1/resource/recall/knowledge", {
      body: {
        topic_id: String(topicId),
        query: String(query).trim(),
        top_k: clampTopK(topK)
      }
    });
    return {
      results: (data.results || []).map(normalizeRecallResult)
    };
  }

  async buildSourcePack({ noteIds = [], title = "" } = {}) {
    const ids = [...new Set(noteIds.map(String).filter(Boolean))];
    if (!ids.length) throw new Error("请至少选择一条 Get笔记。");
    const notes = [];
    for (const noteId of ids) {
      notes.push(await this.getNoteDetail({ noteId, imageQuality: "original" }));
    }
    return buildGetNoteSourcePack(notes, { title });
  }

  async request(method, pathname, { query = {}, body = null } = {}) {
    const url = new URL(`${this.baseUrl}${pathname}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: this.apiKey,
        "X-Client-ID": this.clientId,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const text = await response.text();
    const payload = text ? safeParseGetNoteJson(text) : {};
    if (!response.ok || payload.success === false) {
      throw buildGetNoteError({ response, payload, fallbackMessage: `Get笔记接口调用失败：${pathname}` });
    }
    return payload.data || payload;
  }
}

function clampTopK(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 3;
  return Math.max(1, Math.min(10, Math.round(number)));
}
