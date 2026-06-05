import fs from "node:fs/promises";
import path from "node:path";

const defaultConfig = {
  author: "",
  profileName: "default",
  useHistoryStyle: true,
  rewriteDepth: "light",
  articleTemplate: {
    selectedId: "story_insight"
  },
  styleEngine: {
    autoRefreshEnabled: true,
    autoRefreshHours: 24
  },
  image: {
    enabled: true,
    coverSize: "900x383",
    inlineImageCount: 2,
    defaultStyle: "cinematic WeChat editorial visual, moody dark warm tones, quiet emotional lighting, minimal realistic composition, premium magazine feeling"
  },
  wechat: {
    showCoverPic: 1,
    needOpenComment: 0,
    onlyFansCanComment: 0
  }
};

export async function loadConfig(cwd = process.cwd()) {
  const filePath = path.join(cwd, "publisher.config.json");
  try {
    const userConfig = JSON.parse(await fs.readFile(filePath, "utf8"));
    return mergeConfig(defaultConfig, userConfig);
  } catch (error) {
    if (error.code === "ENOENT") return defaultConfig;
    throw error;
  }
}

function mergeConfig(base, override) {
  const result = { ...base, ...override };
  result.image = { ...base.image, ...(override.image || {}) };
  result.wechat = { ...base.wechat, ...(override.wechat || {}) };
  result.styleEngine = { ...base.styleEngine, ...(override.styleEngine || {}) };
  result.articleTemplate = { ...base.articleTemplate, ...(override.articleTemplate || {}) };
  return result;
}

export { defaultConfig };
