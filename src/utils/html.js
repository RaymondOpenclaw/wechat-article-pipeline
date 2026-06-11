export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function textToParagraphHtml(text) {
  const blocks = String(text || "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  return blocks
    .map((block) => {
      if (/^#{1,3}\s+/.test(block)) {
        return `<h2>${escapeHtml(block.replace(/^#{1,3}\s+/, ""))}</h2>`;
      }
      if (/^[-*]\s+/m.test(block)) {
        const items = block
          .split(/\r?\n/)
          .map((line) => line.replace(/^[-*]\s+/, "").trim())
          .filter(Boolean)
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

export function wrapWechatHtml(innerHtml) {
  return `<section style="max-width:677px;margin:0 auto;font-size:16px;line-height:2;color:#1f2933;letter-spacing:0;word-break:break-word;">
${innerHtml}
</section>`;
}

export function imagePlaceholder(index) {
  return `{{INLINE_IMAGE_${index}}}`;
}

export function formalIllustrationPlaceholder(index) {
  return `{{FORMAL_ILLUSTRATION_${index}}}`;
}

export function replaceImagePlaceholderHtml(html, index, replacementHtml) {
  return replacePlaceholderHtml(html, imagePlaceholder(index), replacementHtml);
}

export function replaceFormalIllustrationPlaceholderHtml(html, index, replacementHtml) {
  return replacePlaceholderHtml(html, formalIllustrationPlaceholder(index), replacementHtml);
}

export function replacePlaceholderHtml(html, placeholder, replacementHtml) {
  const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const paragraphPattern = new RegExp(`<p\\b[^>]*>\\s*${escaped}\\s*<\\/p>`, "g");
  return String(html).replace(paragraphPattern, replacementHtml).replaceAll(placeholder, replacementHtml);
}
