#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { loadDotEnv } from "../utils/env.js";
import { ensureDir, listInputFiles, readJson, slugify, writeJson } from "../utils/files.js";
import { loadConfig } from "../core/config.js";
import { AiClient } from "../core/aiClient.js";
import { processArticle } from "../core/pipeline.js";
import { historyInboxPath, importHistoryFiles, importHistoryLinks, loadStyleProfile, refreshStyleProfile } from "../core/styleProfile.js";
import { GetNoteClient } from "../connectors/getnote/client.js";
import { getGetNoteStatus } from "../connectors/getnote/oauth.js";
import { WeChatClient } from "../wechat/client.js";
import { uploadProcessedArticleWithStrategy } from "../wechat/uploadStrategy.js";

const cwd = process.cwd();
loadDotEnv(cwd);

async function main() {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (!command || command === "help" || command === "--help") return help();
    if (command === "profile") return profileCommand(args);
    if (command === "getnote") return getNoteCommand(args);
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

async function getNoteCommand(args) {
  const [subcommand, ...rest] = args;
  if (subcommand === "status") {
    const status = await getGetNoteStatus(cwd);
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  const client = await GetNoteClient.fromSecureVault(cwd);
  if (subcommand === "list") {
    const cursor = valueAfter(rest, "--cursor") || "";
    const result = await client.listNotes({ cursor });
    printNoteList(result.notes);
    console.log(`Has more: ${result.hasMore}${result.cursor ? `, cursor: ${result.cursor}` : ""}`);
    return;
  }
  if (subcommand === "search") {
    const query = positional(rest).join(" ").trim();
    if (!query) throw new Error("Usage: wechat-draft getnote search <query> [--top-k 3]");
    const topK = Number(valueAfter(rest, "--top-k") || 3);
    const result = await client.searchNotes({ query, topK });
    printRecallResults(result.results);
    return;
  }
  if (subcommand === "detail") {
    const noteId = positional(rest)[0];
    if (!noteId) throw new Error("Usage: wechat-draft getnote detail <note_id>");
    const note = await client.getNoteDetail({ noteId, imageQuality: "original" });
    console.log(JSON.stringify(note, null, 2));
    return;
  }
  if (subcommand === "create") {
    const pack = await buildGetNotePackFromArgs(client, rest);
    const sourcePath = await saveGetNoteSourcePack(pack);
    const config = await loadConfig(cwd);
    const processed = await processArticle(sourcePath, { cwd, config, aiClient: new AiClient() });
    printPreview(processed);
    console.log(`GetNote source saved: ${sourcePath}`);
    console.log(`Source notes: ${pack.sourceIds.join(", ")}`);
    return;
  }
  throw new Error("Usage: wechat-draft getnote <status|list|search|detail|create>");
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

function printNoteList(notes) {
  for (const [index, note] of notes.entries()) {
    console.log(`${index + 1}. ${note.title} (${note.noteType || "note"})`);
    console.log(`   id: ${note.noteId}`);
    if (note.tags.length) console.log(`   tags: ${note.tags.join("、")}`);
    if (note.updatedAt) console.log(`   updated: ${note.updatedAt}`);
  }
}

function printRecallResults(results) {
  for (const [index, item] of results.entries()) {
    console.log(`${index + 1}. ${item.title} (${item.createdAt || item.noteType || "result"})`);
    if (item.noteId) console.log(`   id: ${item.noteId}`);
    if (item.content) console.log(`   ${item.content.slice(0, 160).replace(/\s+/g, " ")}`);
  }
}

async function buildGetNotePackFromArgs(client, args) {
  const topK = Number(valueAfter(args, "--top-k") || 3);
  const title = valueAfter(args, "--title") || "";
  const values = positional(args);
  if (!values.length) throw new Error("Usage: wechat-draft getnote create <note_id...|query> [--top-k 3]");
  const allIds = values.every((value) => /^\d+$/.test(value));
  if (allIds) return client.buildSourcePack({ noteIds: values, title });
  const query = values.join(" ");
  const result = await client.searchNotes({ query, topK });
  const noteIds = result.results.map((item) => item.noteId).filter(Boolean);
  if (!noteIds.length) throw new Error("搜索结果中没有可读取详情的 NOTE 类型笔记。");
  return client.buildSourcePack({ noteIds, title: title || query });
}

async function saveGetNoteSourcePack(pack) {
  const dir = path.join(cwd, "data", "getnote-source");
  await ensureDir(dir);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const base = `${stamp}-${slugify(pack.title)}`;
  const mdPath = path.join(dir, `${base}.md`);
  const jsonPath = path.join(dir, `${base}.json`);
  const frontmatter = [
    "---",
    `title: ${pack.title}`,
    "source: getnote",
    `note_ids: ${pack.sourceIds.join(",")}`,
    "---",
    ""
  ].join("\n");
  await fs.writeFile(mdPath, `${frontmatter}${pack.rawText}\n`, "utf8");
  await writeJson(jsonPath, pack);
  return mdPath;
}

function positional(args) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value.startsWith("--")) {
      index += 1;
    } else {
      values.push(value);
    }
  }
  return values;
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : "";
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
  wechat-draft getnote status
  wechat-draft getnote list
  wechat-draft getnote search <query> [--top-k 3]
  wechat-draft getnote detail <note_id>
  wechat-draft getnote create <note_id...|query> [--top-k 3]
  wechat-draft preview <file-or-dir>
  wechat-draft create <file-or-dir> --confirm
  wechat-draft init-config
  wechat-draft validate-wechat
`);
}

main();
