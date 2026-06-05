const BASE_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',Arial,sans-serif";

export const WECHAT_FORMAT_RULES = {
  maxWidth: 677,
  paragraphMaxChars: 90,
  imageStyle: "max-width:100%;height:auto;border-radius:6px;display:block;margin:0 auto;",
  unsupportedTags: ["script", "style", "link", "iframe", "video", "audio"]
};

const TAG_STYLES = {
  h1: `margin:0 0 18px;font-size:24px;line-height:1.45;color:#172f2b;font-weight:750;letter-spacing:0;font-family:${BASE_FONT};`,
  h2: "margin:34px 0 16px;padding:0 0 0 12px;border-left:3px solid #136f63;font-size:18px;line-height:1.55;color:#173f3a;font-weight:700;letter-spacing:0;",
  h3: "margin:26px 0 12px;font-size:16px;line-height:1.65;color:#1f3936;font-weight:700;letter-spacing:0;",
  p: "margin:15px 0;font-size:16px;line-height:2.05;color:#2f3f46;letter-spacing:0;text-align:left;word-break:break-word;",
  blockquote: "margin:22px 0;padding:14px 16px;background:#f6fbf9;border-left:3px solid #136f63;border-radius:6px;color:#31524c;font-size:15px;line-height:2;letter-spacing:0;",
  ul: "margin:16px 0;padding-left:20px;color:#2f3f46;font-size:15px;line-height:2;",
  ol: "margin:16px 0;padding-left:20px;color:#2f3f46;font-size:15px;line-height:2;",
  li: "margin:6px 0;padding-left:2px;",
  strong: "font-weight:700;color:#173f3a;",
  img: WECHAT_FORMAT_RULES.imageStyle,
  pre: "margin:18px 0;padding:14px 16px;background:#f3f6f7;border-radius:6px;white-space:pre-wrap;word-break:break-word;color:#263238;font-size:13px;line-height:1.75;",
  code: "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;"
};

export function formatWechatHtml(innerHtml, {
  includeWrapper = true,
  title = "",
  digest = "",
  prependTitle = false,
  prependDigest = false
} = {}) {
  let html = String(innerHtml || "").trim();
  html = stripUnsupportedWechatHtml(html);
  html = applyInlineStyles(html);
  html = tightenMobileParagraphs(html);
  html = normalizeImageTags(html);
  html = removeEmptyParagraphs(html);

  if (prependTitle && title && !/<h1\b/i.test(html)) {
    html = `<h1 style="${TAG_STYLES.h1}">${escapeHtml(title)}</h1>\n${html}`;
  }
  if (prependDigest && digest && !html.includes("data-role=\"digest\"")) {
    html = `<section data-role="digest" style="margin:0 0 24px;padding:14px 16px;background:#f6fbf9;border-radius:6px;border-left:3px solid #136f63;"><p style="margin:0;font-size:15px;line-height:2;color:#31524c;letter-spacing:0;">${escapeHtml(digest)}</p></section>\n${html}`;
  }
  return includeWrapper ? wrapWechatArticle(html) : html;
}

export function wrapWechatArticle(innerHtml) {
  const style = [
    `max-width:${WECHAT_FORMAT_RULES.maxWidth}px`,
    "margin:0 auto",
    "padding:0 2px",
    "font-size:16px",
    "line-height:2",
    "color:#1f2933",
    "letter-spacing:0",
    "word-break:break-word",
    `font-family:${BASE_FONT}`
  ].join(";");
  return `<section data-role="wechat-article" style="${style};">\n${innerHtml}\n</section>`;
}

export function stripUnsupportedWechatHtml(html) {
  let output = String(html || "");
  for (const tag of WECHAT_FORMAT_RULES.unsupportedTags) {
    output = output.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), "");
    output = output.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
  }
  output = output.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return output;
}

export function applyInlineStyles(html) {
  return String(html || "").replace(/<(h1|h2|h3|p|blockquote|ul|ol|li|strong|img|pre|code)\b([^>]*)>/gi, (match, tagName, attrs) => {
    const tag = tagName.toLowerCase();
    const style = TAG_STYLES[tag];
    if (!style) return match;
    if (tag !== "img" && /\sstyle\s*=/i.test(attrs)) return `<${tag}${attrs}>`;
    const cleanAttrs = attrs.replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/i, "").trim();
    const attrPart = cleanAttrs ? ` ${cleanAttrs}` : "";
    const close = match.endsWith("/>") ? " /" : "";
    return `<${tag}${attrPart} style="${style}"${close}>`;
  });
}

export function normalizeImageTags(html) {
  return String(html || "").replace(/<img\b([^>]*)>/gi, (match, attrs) => {
    const hasSrc = /\ssrc\s*=/i.test(attrs);
    if (!hasSrc) return "";
    const cleanAttrs = attrs
      .replace(/\s(width|height)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/i, "")
      .trim();
    return `<img ${cleanAttrs} style="${TAG_STYLES.img}">`;
  });
}

function tightenMobileParagraphs(html) {
  return String(html || "").replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (match, attrs, content) => {
    const text = content.replace(/<[^>]+>/g, "").trim();
    if (text.length <= WECHAT_FORMAT_RULES.paragraphMaxChars) return match;
    const chunks = splitReadableChunks(content, WECHAT_FORMAT_RULES.paragraphMaxChars);
    if (chunks.length <= 1) return match;
    return chunks.map((chunk) => `<p${attrs}>${chunk}</p>`).join("\n");
  });
}

function splitReadableChunks(content, maxChars) {
  const plain = String(content || "").replace(/<br\s*\/?>/gi, "\n");
  const sentences = plain
    .split(/(?<=[。！？!?；;])\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  const chunks = [];
  let current = "";
  for (const sentence of sentences.length ? sentences : [plain]) {
    if ((current + sentence).length > maxChars && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks.map(escapeHtml);
}

function removeEmptyParagraphs(html) {
  return String(html || "").replace(/<p\b[^>]*>\s*(?:&nbsp;|\s|<br\s*\/?>)*<\/p>/gi, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
