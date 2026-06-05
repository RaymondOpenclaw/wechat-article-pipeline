export class AiClient {
  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    textModel = process.env.TEXT_MODEL || "gpt-4.1-mini",
    imageModel = process.env.IMAGE_MODEL || "gpt-image-1"
  } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.textModel = textModel;
    this.imageModel = imageModel;
  }

  get enabled() {
    return Boolean(this.apiKey);
  }

  async json(system, user, fallback) {
    if (!this.enabled) return typeof fallback === "function" ? fallback() : fallback;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.textModel,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });
    const payload = await readApiResponse(response);
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI response did not include message content");
    return JSON.parse(content);
  }

  async image(prompt, { size = "1024x1024" } = {}) {
    if (!this.enabled) return null;
    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.imageModel,
        prompt,
        size,
        n: 1
      })
    });
    const payload = await readApiResponse(response);
    const item = payload.data?.[0];
    if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
    if (item?.url) {
      const imageResponse = await fetch(item.url);
      if (!imageResponse.ok) throw new Error(`Unable to download generated image: ${imageResponse.status}`);
      return Buffer.from(await imageResponse.arrayBuffer());
    }
    throw new Error("Image API response did not include b64_json or url");
  }
}

async function readApiResponse(response) {
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const message = payload.error?.message || payload.errmsg || text || response.statusText;
    throw new Error(`API request failed (${response.status}): ${message}`);
  }
  return payload;
}
