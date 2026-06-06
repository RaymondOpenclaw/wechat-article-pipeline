import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "./files.js";
import { parseSecretConfig, readSecretConfig, resolveConfigPath } from "./secretConfig.js";

const VAULT_VERSION = 1;
const DEFAULT_WECHAT_CONFIG = "/Users/ray/WorkBuddy/config/config.md";

export function secureVaultPaths(cwd = process.cwd()) {
  const dir = path.join(cwd, "data", "secure");
  return {
    dir,
    keyPath: path.join(dir, "master.key"),
    vaultPath: path.join(dir, "secrets.enc.json")
  };
}

export async function secureSecretsStatus(cwd = process.cwd()) {
  const paths = secureVaultPaths(cwd);
  const secrets = await readSecureSecrets(cwd);
  return {
    vaultPath: paths.vaultPath,
    keyPath: paths.keyPath,
    hasVault: await exists(paths.vaultPath),
    hasMasterKey: await exists(paths.keyPath),
    hasWechatCredentials: Boolean(secrets.wechat?.appId && secrets.wechat?.appSecret),
    hasRemoteHost: Boolean(secrets.remoteUpload?.host),
    hasRemoteLogin: Boolean(secrets.remoteUpload?.username),
    hasRemotePassword: Boolean(secrets.remoteUpload?.password),
    hasRemotePrivateKey: Boolean(secrets.remoteUpload?.privateKeyPem || secrets.remoteUpload?.privateKeyPath),
    hasGetNoteCredentials: Boolean(secrets.getnote?.apiKey && secrets.getnote?.clientId),
    getNoteKeyId: secrets.getnote?.keyId || "",
    getNoteExpiresAt: Number(secrets.getnote?.expiresAt || 0),
    updatedAt: secrets.updatedAt || ""
  };
}

export async function readSecureSecrets(cwd = process.cwd()) {
  const paths = secureVaultPaths(cwd);
  try {
    const envelope = JSON.parse(await fs.readFile(paths.vaultPath, "utf8"));
    return decryptEnvelope(envelope, await loadMasterKey(cwd, { create: false }));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export async function writeSecureSecrets(cwd = process.cwd(), secrets = {}) {
  const paths = secureVaultPaths(cwd);
  await ensureDir(paths.dir);
  const key = await loadMasterKey(cwd, { create: true });
  const envelope = encryptEnvelope({
    ...secrets,
    updatedAt: new Date().toISOString()
  }, key);
  await fs.writeFile(paths.vaultPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  await chmodPrivate(paths.vaultPath);
  return secureSecretsStatus(cwd);
}

export async function mergeSecureSecrets(cwd = process.cwd(), patch = {}) {
  const current = await readSecureSecrets(cwd);
  return writeSecureSecrets(cwd, deepMerge(current, patch));
}

export async function importLocalSecretsToVault({
  cwd = process.cwd(),
  config = {},
  wechatConfigPath = DEFAULT_WECHAT_CONFIG,
  pemPath = config.remoteUpload?.privateKeyPath || ""
} = {}) {
  const current = await readSecureSecrets(cwd);
  const wechatSource = await readSecretConfig(wechatConfigPath, {});
  const remoteConfigPath = resolveConfigPath(cwd, config.remoteUpload?.configPath || "config.json");
  const remoteSource = await readSecretConfig(remoteConfigPath, {});
  const privateKeyPem = pemPath && await exists(pemPath) ? await fs.readFile(pemPath, "utf8") : current.remoteUpload?.privateKeyPem || "";
  const patch = {
    wechat: {
      appId: current.wechat?.appId || wechatSource.appid || wechatSource.appId || wechatSource.wechat_appid || "",
      appSecret: current.wechat?.appSecret || wechatSource.appsecret || wechatSource.appSecret || wechatSource.wechat_secret || ""
    },
    remoteUpload: {
      host: config.remoteUpload?.host || current.remoteUpload?.host || remoteSource.host || "",
      username: config.remoteUpload?.username || current.remoteUpload?.username || remoteSource.username || "",
      password: current.remoteUpload?.password || remoteSource.password || "",
      port: config.remoteUpload?.port || current.remoteUpload?.port || remoteSource.port || 22,
      workDir: config.remoteUpload?.workDir || current.remoteUpload?.workDir || remoteSource.workDir || "/tmp/wechat-draft-upload",
      privateKeyPath: config.remoteUpload?.privateKeyPath || current.remoteUpload?.privateKeyPath || "",
      privateKeyPem
    }
  };
  return mergeSecureSecrets(cwd, patch);
}

export function parseSecretConfigForTest(text) {
  return parseSecretConfig(text);
}

async function loadMasterKey(cwd, { create }) {
  const paths = secureVaultPaths(cwd);
  try {
    const text = (await fs.readFile(paths.keyPath, "utf8")).trim();
    return Buffer.from(text, "hex");
  } catch (error) {
    if (error.code !== "ENOENT" || !create) throw error;
  }
  await ensureDir(paths.dir);
  const key = crypto.randomBytes(32);
  await fs.writeFile(paths.keyPath, `${key.toString("hex")}\n`, "utf8");
  await chmodPrivate(paths.keyPath);
  return key;
}

function encryptEnvelope(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    version: VAULT_VERSION,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: encrypted.toString("base64")
  };
}

function decryptEnvelope(envelope, key) {
  if (envelope.version !== VAULT_VERSION || envelope.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported secure vault format");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final()
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}

function deepMerge(base, patch) {
  const result = { ...(base || {}) };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = deepMerge(result[key], value);
    } else if (value !== undefined && value !== "") {
      result[key] = value;
    }
  }
  return result;
}

async function chmodPrivate(filePath) {
  try {
    await fs.chmod(filePath, 0o600);
  } catch {
    // chmod is best effort on non-POSIX filesystems.
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
