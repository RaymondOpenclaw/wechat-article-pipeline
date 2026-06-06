import { buildGetNoteSourcePack } from "../connectors/getnote/normalizer.js";

export function sourcePackToArticleInput(sourcePack) {
  if (!sourcePack?.rawText) throw new Error("文章来源素材包缺少正文内容。");
  return {
    rawText: sourcePack.rawText,
    metadata: {
      title: sourcePack.title || "Get笔记文章素材",
      ...(sourcePack.metadata || {}),
      sourceType: sourcePack.sourceType || sourcePack.metadata?.source || "unknown",
      sourceIds: sourcePack.sourceIds || sourcePack.metadata?.noteIds || []
    }
  };
}

export function getNoteDetailsToSourcePack(notes, options = {}) {
  return buildGetNoteSourcePack(notes, options);
}
