import fs from "node:fs/promises";
import path from "node:path";
import { AiClient } from "./aiClient.js";

const ASCII_PRE_STYLE = [
  "margin:18px 0",
  "padding:14px 16px",
  "background:#f3f6f7",
  "border-radius:6px",
  "white-space:pre-wrap",
  "word-break:break-word",
  "color:#263238",
  "font-size:13px",
  "line-height:1.75",
  "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"
].join(";");

export async function applyIllustrationSkill(article, {
  cwd = process.cwd(),
  config = {},
  aiClient = new AiClient()
} = {}) {
  if (config.illustration?.enabled === false) return article;
  const fallback = () => heuristicIllustrations(article);
  const skill = await readIllustrationSkill(cwd);
  const result = await aiClient.json(
    "你是一位公众号正文 ASCII 插画编辑。只输出 JSON。你必须遵守 illustration skill：读完整篇文章，只在能帮助理解结构、对比、因果、层级或关系的位置插入紧凑 ASCII sketch；保留原文，不生成位图。",
    JSON.stringify({
      task: "为公众号文章插入 ASCII sketch 插画",
      skill,
      constraints: [
        "只允许 ASCII 字符，不使用 Unicode box drawing、emoji 或 Markdown 表情。",
        "每个 sketch 必须紧凑，标签 2-5 个。",
        "不要装饰性插画，只在能澄清结构、关系、因果或步骤时插入。",
        "返回 placements，不要返回完整改写文章。"
      ],
      expectedJson: {
        placements: [
          {
            afterHeading: "建议插入的小标题，可为空",
            afterText: "建议插入的段落片段，可为空",
            sketch: "ASCII sketch",
            caption: "一句话说明"
          }
        ]
      },
      article: {
        title: article.title,
        digest: article.digest,
        blueprint: article.blueprint,
        markdown: article.markdown
      }
    }),
    fallback
  );
  const illustrations = normalizeIllustrations(result?.placements || result?.illustrations, fallback().placements);
  if (!illustrations.length) return { ...article, asciiIllustrations: [] };
  return {
    ...article,
    markdown: insertIllustrationsIntoMarkdown(article.markdown, illustrations),
    html: insertIllustrationsIntoHtml(article.html, illustrations),
    asciiIllustrations: illustrations,
    changeLog: [
      ...(article.changeLog || []),
      `使用 illustration skill 插入 ${illustrations.length} 个 ASCII sketch 正文插画`
    ]
  };
}

export function heuristicIllustrations(article) {
  const text = `${article?.title || ""}\n${article?.digest || ""}\n${article?.markdown || ""}`;
  if (/叙事疗法|外化|解构|立场地图|怀特/.test(text)) {
    return {
      placements: [
        {
          afterHeading: "为什么要先把“人”和“问题”分开",
          afterText: "人不是问题，问题才是问题",
          sketch: [
            "Person        Problem",
            "  |              |",
            "  +--- separate -+",
            "        |",
            "   new choices"
          ].join("\n"),
          caption: "外化先把人和问题分开，才会出现新的选择空间。"
        },
        {
          afterHeading: "怀特的立场地图",
          afterText: "问题描述",
          sketch: [
            "Describe -> Effects -> Position -> Meaning",
            " problem     map       stance     values"
          ].join("\n"),
          caption: "立场地图不是背模板，而是一条逐步进入意义的提问线。"
        }
      ]
    };
  }
  if (/无结构的?团体/.test(text) && /矫正性情绪体验|关系中产生/.test(text)) {
    return {
      placements: [
        {
          afterHeading: "没有议程的团体，究竟如何工作",
          afterText: "真实的关系模式",
          sketch: [
            "Pattern -> Group -> Feedback -> New choice",
            "             |",
            "        safe relation"
          ].join("\n"),
          caption: "团体让旧的关系模式在安全互动中被看见，并有机会尝试新的选择。"
        }
      ]
    };
  }
  if (/安顿|休息|放空|刷剧|高考|采购|辞职|韧性|绩效|卷|停滞/.test(text)) {
    return {
      placements: [
        {
          afterHeading: "给自己一点不被追赶的时间",
          afterText: "通勤的时候",
          sketch: [
            "Pressure -> Pause -> Settle -> Return",
            "              |",
            "          quiet time"
          ].join("\n"),
          caption: "安顿不是停止成长，而是让自己重新有力气出发。"
        }
      ]
    };
  }
  if (/自由职业|进退|成长|身份|确认/.test(text)) {
    return {
      placements: [
        {
          afterHeading: "",
          afterText: "进进退退",
          sketch: [
            "Try -> Step back -> Check -> Continue",
            "        |",
            "   not failure"
          ].join("\n"),
          caption: "退回来不是中断，而是在确认方向。"
        }
      ]
    };
  }
  return {
    placements: [
      {
        afterHeading: "",
        afterText: "",
        sketch: [
          "Input -> [Organize] -> Article",
          "          |",
          "       boundary"
        ].join("\n"),
        caption: "先整理信息边界，再进入表达。"
      }
    ]
  };
}

async function readIllustrationSkill(cwd) {
  const candidates = [
    path.join(cwd, "skill", "illustration", "SKILL.md"),
    path.join(process.env.HOME || "", ".codex", "skills", "illustration", "SKILL.md")
  ];
  for (const filePath of candidates) {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch {
      // Try the next candidate.
    }
  }
  return "";
}

function normalizeIllustrations(value, fallback) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return source.map((item) => ({
    afterHeading: String(item?.afterHeading || ""),
    afterText: String(item?.afterText || ""),
    sketch: asciiOnly(String(item?.sketch || "")),
    caption: String(item?.caption || "")
  })).filter((item) => item.sketch.trim()).slice(0, 3);
}

function insertIllustrationsIntoMarkdown(markdown, illustrations) {
  let output = String(markdown || "");
  for (const illustration of illustrations) {
    const block = [
      "",
      "```text",
      illustration.sketch,
      "```",
      illustration.caption ? `_${illustration.caption}_` : "",
      ""
    ].filter((line) => line !== "").join("\n");
    output = insertAfterAnchor(output, illustration, block);
  }
  return output;
}

function insertIllustrationsIntoHtml(html, illustrations) {
  let output = String(html || "");
  for (const illustration of illustrations) {
    const block = [
      `<pre data-role="ascii-illustration" style="${ASCII_PRE_STYLE}">${escapeHtml(illustration.sketch)}</pre>`,
      illustration.caption ? `<p style="margin:8px 0 18px;font-size:13px;line-height:1.8;color:#687782;">${escapeHtml(illustration.caption)}</p>` : ""
    ].join("");
    const inserted = insertHtmlAfterHeading(output, illustration.afterHeading, block);
    output = inserted || output.replace(/<\/section>\s*$/i, `${block}\n</section>`);
  }
  return output;
}

function insertAfterAnchor(markdown, illustration, block) {
  const lines = markdown.split(/\n/);
  const headingIndex = illustration.afterHeading
    ? lines.findIndex((line) => line.replace(/^#+\s*/, "").includes(illustration.afterHeading))
    : -1;
  const textIndex = illustration.afterText
    ? lines.findIndex((line, index) => index > Math.max(-1, headingIndex) && line.includes(illustration.afterText))
    : -1;
  const index = textIndex >= 0 ? textIndex : headingIndex >= 0 ? nextParagraphIndex(lines, headingIndex) : nextParagraphIndex(lines, 0);
  lines.splice(Math.min(lines.length, index + 1), 0, block);
  return lines.join("\n");
}

function nextParagraphIndex(lines, start) {
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].trim() && !lines[index].startsWith("#")) return index;
  }
  return Math.max(0, start);
}

function insertHtmlAfterHeading(html, heading, block) {
  if (!heading) return "";
  const escaped = escapeRegExp(heading);
  const pattern = new RegExp(`(<h[23][^>]*>[\\s\\S]*?${escaped}[\\s\\S]*?<\\/h[23]>)([\\s\\S]*?<\\/p>)`, "i");
  if (!pattern.test(html)) return "";
  return html.replace(pattern, `$1$2${block}`);
}

function asciiOnly(value) {
  return String(value || "")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
