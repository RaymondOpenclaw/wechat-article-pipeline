#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { loadDotEnv } from "../utils/env.js";
import { listInputFiles, readJson } from "../utils/files.js";
import { loadConfig } from "../core/config.js";
import { AiClient } from "../core/aiClient.js";
import { processArticle } from "../core/pipeline.js";
import { historyInboxPath, importHistoryFiles, importHistoryLinks, loadStyleProfile, refreshStyleProfile } from "../core/styleProfile.js";
import { WeChatClient } from "../wechat/client.js";
import { uploadProcessedArticleWithStrategy } from "../wechat/uploadStrategy.js";

const cwd = process.cwd();
loadDotEnv(cwd);

async function main() {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (!command || command === "help" || command === "--help") return help();
    if (command === "profile") return profileCommand(args);
    if (command === "preview") return previewCommand(args);
    if (command === "create") return createCommand(args);
    if (command === "init-config") return initConfigCommand();
    if (command === "validate-wechat") return validateWeChatCommand();
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exitCode = 1;
  }
}

async function profileCommand(args) {
  const [subcommand, filePath] = args;
  const config = await loadConfig(cwd);
  if (subcommand === "import-links") {
    if (!filePath) throw new Error("Usage: wechat-draft profile import-links links.txt");
    const links = (await fs.readFile(path.resolve(filePath), "utf8")).split(/\r?\n/);
    const result = await importHistoryLinks(links, {
      cwd,
      profileName: config.profileName,
      aiClient: new AiClient()
    });
    console.log(`Imported ${result.importedArticles.length} new article(s).`);
    console.log(`Style library now has ${result.articles.length} article(s).`);
    if (result.failures.length) console.log(`Failed ${result.failures.length} link(s); see profiles/${config.profileName}/raw-history.json.`);
    console.log(`Style profile saved to profiles/${config.profileName}/style-profile.json.`);
    console.log(`Inbox folder: ${result.inboxPath}`);
    return;
  }
  if (subcommand === "import-files") {
    if (!filePath) throw new Error("Usage: wechat-draft profile import-files <file-or-dir>");
    const result = await importHistoryFiles(path.resolve(filePath), {
      cwd,
      profileName: config.profileName,
      aiClient: new AiClient()
    });
    console.log(`Imported ${result.importedArticles.length} file article(s).`);
    console.log(`Style library now has ${result.articles.length} article(s).`);
    console.log(`Style profile saved to profiles/${config.profileName}/style-profile.json.`);
    return;
  }
  if (subcommand === "refresh") {
    const result = await refreshStyleProfile({
      cwd,
      profileName: config.profileName,
      aiClient: new AiClient()
    });
    console.log(`Style profile refreshed from ${result.articles.length} saved article(s).`);
    console.log(`Inbox folder: ${result.inboxPath}`);
    return;
  }
  if (subcommand === "inbox") {
    console.log(historyInboxPath(cwd, config.profileName));
    return;
  }
  if (subcommand === "inspect") {
    const profile = await loadStyleProfile(cwd, config.profileName);
    if (!profile) throw new Error(`No style profile found for "${config.profileName}".`);
    console.log(JSON.stringify(profile, null, 2));
    return;
  }
  throw new Error("Usage: wechat-draft profile <import-links|import-files|refresh|inbox|inspect>");
}

async function previewCommand(args) {
  const target = args[0];
  if (!target) throw new Error("Usage: wechat-draft preview <file-or-dir>");
  const config = await loadConfig(cwd);
  const files = await listInputFiles(path.resolve(target));
  for (const file of files) {
    const processed = await processArticle(file, { cwd, config, aiClient: new AiClient() });
    printPreview(processed);
  }
}

async function createCommand(args) {
  const target = args[0];
  const confirmed = args.includes("--confirm");
  if (!target) throw new Error("Usage: wechat-draft create <file-or-dir> --confirm");
  if (!confirmed) throw new Error("Refusing to upload without --confirm. Use preview first, then rerun with --confirm.");
  const config = await loadConfig(cwd);
  const files = await listInputFiles(path.resolve(target));
  for (const file of files) {
    const processed = await processArticle(file, { cwd, config, aiClient: new AiClient() });
    const result = await uploadProcessedArticleWithStrategy(processed, { cwd, config });
    console.log(`Uploaded draft: ${result.title} (${result.mediaId})`);
  }
}

async function initConfigCommand() {
  const envExists = await exists(path.join(cwd, ".env"));
  console.log(envExists ? ".env already exists; leaving it untouched." : "Copy .env.example to .env and fill credentials before uploading.");
  console.log("publisher.config.json is the main runtime config.");
}

async function validateWeChatCommand() {
  const client = new WeChatClient({ cwd });
  const token = await client.getAccessToken({ forceRefresh: true });
  console.log(`WeChat token OK: ${token.slice(0, 8)}...`);
}

function printPreview(processed) {
  console.log("\n--- Preview ---");
  console.log(`Title: ${processed.title}`);
  console.log(`Digest: ${processed.digest}`);
  console.log(`Images: ${processed.images.length}`);
  console.log(`Changes: ${processed.changeLog.join("；")}`);
  if (processed.riskNotes.length) console.log(`Risks: ${processed.riskNotes.join("；")}`);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function help() {
  console.log(`wechat-draft

Commands:
  wechat-draft profile import-links links.txt
  wechat-draft profile import-files <file-or-dir>
  wechat-draft profile refresh
  wechat-draft profile inbox
  wechat-draft profile inspect
  wechat-draft preview <file-or-dir>
  wechat-draft create <file-or-dir> --confirm
  wechat-draft init-config
  wechat-draft validate-wechat
`);
}

main();
