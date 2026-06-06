import test from "node:test";
import assert from "node:assert/strict";
import { getNoteDetailsToSourcePack, sourcePackToArticleInput } from "../src/core/articleSource.js";

test("GetNote source pack converts to article input", () => {
  const pack = getNoteDetailsToSourcePack([{
    noteId: "1912026791293912400",
    title: "关系中配得感缺失的原因及应对方法探讨",
    noteType: "audio",
    tags: ["人际关系", "配得感"],
    topics: [],
    content: "配得感缺失会影响关系中的表达。",
    audio: { transcript: "需要区分对方的回应和自己的自我评价。" },
    createdAt: "2026-06-06 10:34:56",
    updatedAt: "2026-06-06 10:42:22"
  }]);
  const input = sourcePackToArticleInput(pack);
  assert.match(input.rawText, /配得感缺失/);
  assert.match(input.rawText, /自我评价/);
  assert.equal(input.metadata.sourceType, "getnote");
  assert.deepEqual(input.metadata.sourceIds, ["1912026791293912400"]);
  assert.deepEqual(input.metadata.tags, ["人际关系", "配得感"]);
});
