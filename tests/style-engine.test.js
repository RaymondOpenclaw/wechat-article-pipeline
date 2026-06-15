import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { buildStylePrompt, refreshStyleArtifacts, stylePromptPath, styleSkillPath } from "../src/core/styleEngine.js";
import { importHistoryTexts } from "../src/core/styleProfile.js";

test("buildStylePrompt creates reusable author style instructions", () => {
  const prompt = buildStylePrompt({
    titlePatterns: ["问题式标题"],
    openingPatterns: ["场景开头"],
    paragraphRhythm: "短段落",
    signaturePhrases: ["其实"],
    argumentStyles: ["观点先行"],
    closingPatterns: ["行动建议"],
    bannedExpressions: ["赋能"],
    visualStyle: "克制"
  });
  assert.match(prompt, /个人公众号写作风格约束提示词/);
  assert.match(prompt, /问题式标题/);
  assert.match(prompt, /不要复制历史文章原句/);
  assert.match(prompt, /不要擅自把作者短句合并成长段/);
});

test("refreshStyleArtifacts writes prompt and skill files", async () => {
  const cwd = await fs.mkdtemp(path.join(process.cwd(), "tmp-style-engine-"));
  const aiClient = { json: async (_system, _user, fallback) => fallback() };
  await importHistoryTexts([{ title: "历史文章", text: "其实这是历史文章。\n\n更重要的是，它有稳定节奏。" }], { cwd, aiClient });
  const result = await refreshStyleArtifacts({ cwd, profileName: "default", aiClient });
  assert.equal(result.profile.articleCount, 1);
  assert.match(await fs.readFile(stylePromptPath(cwd), "utf8"), /其实/);
  assert.match(await fs.readFile(styleSkillPath(cwd), "utf8"), /公众号个人写作风格 Skill/);
  await fs.rm(cwd, { recursive: true, force: true });
});
