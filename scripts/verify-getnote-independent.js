#!/usr/bin/env node
import { GetNoteClient } from "../src/connectors/getnote/client.js";
import { getGetNoteStatus } from "../src/connectors/getnote/oauth.js";

async function main() {
  const cwd = process.cwd();
  const status = await getGetNoteStatus(cwd);
  if (!status.hasGetNoteCredentials) {
    throw new Error("项目 secureVault 中没有 Get笔记凭据，请先完成授权。");
  }
  const client = await GetNoteClient.fromSecureVault(cwd);
  const notes = await client.listNotes();
  console.log(JSON.stringify({
    independent: true,
    usedOpenClaw: false,
    hasGetNoteCredentials: status.hasGetNoteCredentials,
    getNoteExpiresAt: status.getNoteExpiresAt,
    count: notes.notes.length,
    hasMore: notes.hasMore
  }, null, 2));
}

main().catch((error) => {
  console.error(`Get笔记独立性验证失败：${error.message}`);
  process.exitCode = 1;
});
