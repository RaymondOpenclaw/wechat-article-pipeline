export class GetNoteError extends Error {
  constructor(message, {
    code = "",
    reason = "",
    status = 0,
    requestId = "",
    retryAfter = 0,
    raw = null
  } = {}) {
    super(message);
    this.name = "GetNoteError";
    this.code = code;
    this.reason = reason;
    this.status = status;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
    this.raw = raw;
  }
}

export function buildGetNoteError({ response, payload, fallbackMessage = "Get笔记 API 调用失败" }) {
  const error = payload?.error || {};
  const retryAfter = Number(payload?.rate_limit?.retry_after || response?.headers?.get?.("Retry-After") || 0);
  const message = error.message || error.reason || fallbackMessage;
  return new GetNoteError(messageFor(error, response?.status, message), {
    code: String(error.code || ""),
    reason: String(error.reason || ""),
    status: response?.status || 0,
    requestId: payload?.request_id || "",
    retryAfter: Number.isFinite(retryAfter) ? retryAfter : 0,
    raw: payload || null
  });
}

function messageFor(error, status, fallback) {
  if (error?.reason === "not_member" || error?.code === 10201) {
    return "Get笔记接口需要会员权限，请开通会员后重试。";
  }
  if (error?.code === 10202 || status === 429) {
    return "Get笔记接口触发限流，请稍后重试。";
  }
  if (error?.message === "unauthorized" || error?.code === 10001 || status === 401) {
    return "Get笔记授权无效或已过期，请重新授权。";
  }
  if (error?.code === 10100 || status === 404) {
    return "Get笔记数据不存在，请确认笔记 ID 或知识库 ID。";
  }
  return fallback;
}
