export async function fetchHistoryArticle(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 WeChatDraftPublisher/0.1"
    }
  });
  if (!response.ok) {
    throw new Error(`Unable to fetch ${url}: HTTP ${response.status}`);
  }
  const html = await response.text();
  return parseWeChatArticleHtml(html, url);
}

export function parseWeChatArticleHtml(html, url = "") {
  const title = decodeHtml(matchFirst(html, [
    /<h1[^>]*id=["']activity-name["'][^>]*>([\s\S]*?)<\/h1>/i,
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<title>([\s\S]*?)<\/title>/i
  ])).trim();
  const digest = decodeHtml(matchFirst(html, [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i
  ])).trim();
  const publishTime = matchFirst(html, [
    /var\s+publish_time\s*=\s*["']([^"']+)["']/i,
    /ct\s*=\s*["']?(\d{10})/i
  ]);
  const contentHtml = matchFirst(html, [
    /<div[^>]*id=["']js_content["'][^>]*>([\s\S]*?)<\/div>\s*<script/i,
    /<div[^>]*class=["'][^"']*rich_media_content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  ]);
  const text = htmlToText(contentHtml || html);
  const images = Array.from(html.matchAll(/<img[^>]+(?:data-src|src)=["']([^"']+)["'][^>]*>/gi))
    .map((match) => match[1])
    .filter(Boolean)
    .slice(0, 20);
  return {
    url,
    title,
    digest,
    publishTime,
    text,
    cover: images[0] || "",
    images
  };
}

function matchFirst(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1] || "";
  }
  return "";
}

function htmlToText(html) {
  return decodeHtml(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|h\d|li|section)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n"))
    .trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
