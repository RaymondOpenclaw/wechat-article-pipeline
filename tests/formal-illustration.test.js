import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { generateFormalIllustrations } from "../src/core/formalIllustrationGenerator.js";

const tinyPng = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfab0000000049454e44ae426082", "hex");

test("generateFormalIllustrations replaces ASCII sketches with image2 placeholders", async () => {
  const cwd = await fs.mkdtemp(path.join(process.cwd(), "tmp-formal-illustration-"));
  const article = {
    title: "叙事疗法里的外化",
    digest: "把人和问题分开，才会出现新的选择。",
    markdown: [
      "# 叙事疗法里的外化",
      "",
      "```text",
      "Person        Problem",
      "  |              |",
      "  +--- separate -+",
      "```",
      "_外化先把人和问题分开，才会出现新的选择空间。_"
    ].join("\n"),
    html: [
      "<section>",
      "<h2>为什么要先把人和问题分开</h2>",
      "<pre data-role=\"ascii-illustration\" style=\"x\">Person        Problem\n  |              |\n  +--- separate -+</pre>",
      "<p style=\"margin:8px 0 18px;font-size:13px;line-height:1.8;color:#687782;\">外化先把人和问题分开，才会出现新的选择空间。</p>",
      "</section>"
    ].join(""),
    asciiIllustrations: [
      {
        sketch: "Person        Problem\n  |              |\n  +--- separate -+",
        caption: "外化先把人和问题分开，才会出现新的选择空间。"
      }
    ],
    changeLog: []
  };

  const processed = await generateFormalIllustrations(article, {
    cwd,
    config: { formalIllustration: { enabled: true, model: "gpt-image-1", size: "1024x1024" } },
    aiClient: { image: async () => tinyPng }
  });

  assert.equal(processed.formalIllustrations.length, 1);
  assert.equal(processed.formalIllustrations[0].generator, "image2");
  assert.match(processed.markdown, /!\[外化先把人和问题分开/);
  assert.match(processed.html, /\{\{FORMAL_ILLUSTRATION_1\}\}/);
  assert.doesNotMatch(processed.html, /ascii-illustration/);
  const bytes = await fs.readFile(processed.formalIllustrations[0].localPath);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  await fs.rm(cwd, { recursive: true, force: true });
});

test("generateFormalIllustrations falls back to local PNG when image2 is unavailable", async () => {
  const cwd = await fs.mkdtemp(path.join(process.cwd(), "tmp-formal-illustration-fallback-"));
  const processed = await generateFormalIllustrations({
    title: "成长的进退",
    digest: "退回来是在确认方向。",
    markdown: "```text\nTry -> Step back\n```\n_退回来不是中断。_",
    html: "<section><pre data-role=\"ascii-illustration\">Try -&gt; Step back</pre><p style=\"margin:8px 0 18px;font-size:13px;line-height:1.8;color:#687782;\">退回来不是中断。</p></section>",
    asciiIllustrations: [{ sketch: "Try -> Step back", caption: "退回来不是中断。" }],
    changeLog: []
  }, {
    cwd,
    config: { formalIllustration: { enabled: true } },
    aiClient: { image: async () => null }
  });
  assert.equal(processed.formalIllustrations[0].generator, "image2-fallback");
  const bytes = await fs.readFile(processed.formalIllustrations[0].localPath);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  await fs.rm(cwd, { recursive: true, force: true });
});
