import { readSecretConfig } from "../utils/secretConfig.js";
import { readSecureSecrets } from "../utils/secureVault.js";

const DEFAULT_WORKBUDDY_WECHAT_CONFIG = "/Users/ray/WorkBuddy/config/config.md";

export async function loadWechatCredentials({ config = {}, cwd = process.cwd() } = {}) {
  const envCredentials = {
    appId: process.env.WECHAT_APP_ID || process.env.WECHAT_APPID || "",
    appSecret: process.env.WECHAT_APP_SECRET || process.env.WECHAT_SECRET || ""
  };
  if (envCredentials.appId && envCredentials.appSecret) return envCredentials;

  const secure = await readSecureSecrets(cwd);
  if (secure.wechat?.appId && secure.wechat?.appSecret) {
    return {
      appId: secure.wechat.appId,
      appSecret: secure.wechat.appSecret
    };
  }

  const configPath = config.wechat?.credentialPath || DEFAULT_WORKBUDDY_WECHAT_CONFIG;
  const parsed = await readSecretConfig(configPath, {});
  const appId = parsed.appid || parsed.appId || parsed.wechat_appid || "";
  const appSecret = parsed.appsecret || parsed.appSecret || parsed.wechat_secret || "";
  if (appId && appSecret) return { appId, appSecret };

  return envCredentials;
}
