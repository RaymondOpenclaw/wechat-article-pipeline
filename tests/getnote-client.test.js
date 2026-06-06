import test from "node:test";
import assert from "node:assert/strict";
import { GetNoteClient } from "../src/connectors/getnote/client.js";
import { buildGetNoteSourcePack, safeParseGetNoteJson } from "../src/connectors/getnote/normalizer.js";

test("safeParseGetNoteJson keeps int64 ids as strings", () => {
  const parsed = safeParseGetNoteJson('{"data":{"id":1912026791293912400,"note_id":1912026791293912400,"title":"测试"}}');
  assert.equal(parsed.data.id, "1912026791293912400");
  assert.equal(parsed.data.note_id, "1912026791293912400");
});

test("GetNoteClient lists notes with auth headers and string ids", async () => {
  const calls = [];
  const client = new GetNoteClient({
    apiKey: "gk_live_test",
    clientId: "cli_test",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return responseText('{"success":true,"data":{"notes":[{"id":1912026791293912400,"title":"最近笔记","note_type":"plain_text","tags":[{"name":"标签"}]}],"has_more":true,"cursor":"next"},"request_id":"req"}');
    }
  });
  const result = await client.listNotes();
  assert.equal(calls[0].options.headers.Authorization, "gk_live_test");
  assert.equal(calls[0].options.headers["X-Client-ID"], "cli_test");
  assert.equal(result.notes[0].noteId, "1912026791293912400");
  assert.deepEqual(result.notes[0].tags, ["标签"]);
  assert.equal(result.hasMore, true);
});

test("GetNoteClient caps search topK and normalizes recall results", async () => {
  let requestBody = null;
  const client = new GetNoteClient({
    apiKey: "gk_live_test",
    clientId: "cli_test",
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return responseJson({
        success: true,
        data: {
          results: [{ note_id: "1912026791293912400", note_type: "NOTE", title: "搜索结果", content: "片段" }]
        }
      });
    }
  });
  const result = await client.searchNotes({ query: "叙事疗法", topK: 99 });
  assert.equal(requestBody.top_k, 10);
  assert.equal(result.results[0].noteId, "1912026791293912400");
});

test("GetNoteClient builds source pack from note details", async () => {
  const client = new GetNoteClient({
    apiKey: "gk_live_test",
    clientId: "cli_test",
    fetchImpl: async () => responseJson({
      success: true,
      data: {
        note: {
          note_id: "1912026791293912400",
          title: "叙事疗法解构技术课程小组讨论与答疑记录",
          note_type: "class_audio",
          content: "外化的核心是将人和问题分开。",
          tags: [{ name: "叙事疗法" }],
          audio: { transcript: "怀特的立场地图包含问题描述、影响地图、声明立场和论证评估。" }
        }
      }
    })
  });
  const pack = await client.buildSourcePack({ noteIds: ["1912026791293912400"] });
  assert.equal(pack.sourceType, "getnote");
  assert.equal(pack.sourceIds[0], "1912026791293912400");
  assert.match(pack.rawText, /外化的核心/);
  assert.match(pack.rawText, /立场地图/);
  assert.deepEqual(pack.metadata.tags, ["叙事疗法"]);
});

test("buildGetNoteSourcePack combines link and audio fields", () => {
  const pack = buildGetNoteSourcePack([{
    noteId: "1",
    title: "链接笔记",
    noteType: "link",
    tags: ["AI链接笔记"],
    topics: [],
    content: "AI 摘要",
    webPage: { excerpt: "网页摘要", content: "网页原文" }
  }, {
    noteId: "2",
    title: "音频笔记",
    noteType: "audio",
    tags: ["录音笔记"],
    topics: [],
    content: "总结",
    audio: { transcript: "音频转写" }
  }]);
  assert.match(pack.rawText, /网页原文/);
  assert.match(pack.rawText, /音频转写/);
  assert.deepEqual(pack.sourceIds, ["1", "2"]);
});

function responseJson(value, status = 200) {
  return responseText(JSON.stringify(value), status);
}

function responseText(text, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "" },
    text: async () => text
  };
}
