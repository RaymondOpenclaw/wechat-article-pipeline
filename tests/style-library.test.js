import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { importStyleLibraryTexts, inspectStyleLibrary } from "../src/core/styleLibrary.js";

const aiClient = {
  json: async (_system, _user, fallback) => fallback()
};

test("style library imports texts and writes reusable artifacts", async () => {
  const cwd = await fs.mkdtemp(path.join(process.cwd(), "tmp-style-library-"));
  const result = await importStyleLibraryTexts([
    {
      title: "我的第一篇文章",
      text: "最近我发现，其实写作风格需要慢慢沉淀。换句话说，它不是一次生成出来的。"
    }
  ], { cwd, profileName: "default", aiClient });
  assert.equal(result.profile.articleCount, 1);
  assert.match(result.stylePromptPath, /style-prompt\.md$/);
  assert.match(result.styleSkillPath, /STYLE_SKILL\.md$/);

  const library = await inspectStyleLibrary({ cwd, profileName: "default" });
  assert.equal(library.articleCount, 1);
  assert.equal(library.rawArticleCount, 1);
  assert.ok(library.paths.stylePromptPath);
  await fs.rm(cwd, { recursive: true, force: true });
});
