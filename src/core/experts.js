export const ARTICLE_EXPERTS = [
  {
    id: "chief_editor",
    name: "资深主编",
    prompt: "你是一位资深的主编。我写了一段口语化的记录：[在此输入你的草稿]。请保留我的核心观点和个人风格，将其打磨成一篇逻辑清晰、极具吸引力的文章，使其达到可发布的水平。"
  },
  {
    id: "value_mentor",
    name: "价值导师",
    prompt: "你是一位善于发现价值的导师。请仔细阅读我的这段记录：[在此输入你的记录]。请帮我点评，提炼出其中最有价值的闪光点、独特的洞察，并将其总结为一到两句金句。"
  },
  {
    id: "structure_master",
    name: "信息提炼大师",
    prompt: "你是一位信息提炼大师。我提供了一段长文本或会议录音转文字：[在此输入文本]。请帮我进行结构化梳理，提炼出核心背景、主要矛盾或关键结论，最后用 3 个要点（Action Items）总结下一步计划。"
  }
];

export function resolveExpertIds(config = {}) {
  if (config.experts?.enabled === false) return [];
  const requested = Array.isArray(config.experts?.selectedIds) && config.experts.selectedIds.length
    ? config.experts.selectedIds
    : ARTICLE_EXPERTS.map((expert) => expert.id);
  const valid = new Set(ARTICLE_EXPERTS.map((expert) => expert.id));
  return requested.filter((id) => valid.has(id));
}

export function buildExpertPanel(input, config = {}) {
  const expertIds = new Set(resolveExpertIds(config));
  return ARTICLE_EXPERTS
    .filter((expert) => expertIds.has(expert.id))
    .map((expert) => ({
      id: expert.id,
      name: expert.name,
      prompt: expert.prompt,
      instruction: expert.prompt.replace(/\[在此输入你的草稿\]|\[在此输入你的记录\]|\[在此输入文本\]/g, input.rawText)
    }));
}

export function normalizeExpertReviews(reviews, input, sections = [], config = {}) {
  if (resolveExpertIds(config).length === 0) return null;
  const fallback = heuristicExpertReviews(input, sections);
  return {
    chiefEditor: {
      summary: stringOr(reviews?.chiefEditor?.summary, fallback.chiefEditor.summary),
      suggestions: arrayOr(reviews?.chiefEditor?.suggestions, fallback.chiefEditor.suggestions)
    },
    valueMentor: {
      highlights: arrayOr(reviews?.valueMentor?.highlights, fallback.valueMentor.highlights),
      goldenLines: arrayOr(reviews?.valueMentor?.goldenLines, fallback.valueMentor.goldenLines).slice(0, 2)
    },
    structureMaster: {
      background: stringOr(reviews?.structureMaster?.background, fallback.structureMaster.background),
      tensionOrConclusion: stringOr(reviews?.structureMaster?.tensionOrConclusion, fallback.structureMaster.tensionOrConclusion),
      actionItems: arrayOr(reviews?.structureMaster?.actionItems, fallback.structureMaster.actionItems).slice(0, 3)
    }
  };
}

export function heuristicExpertReviews(input, sections = []) {
  const first = firstSentence(input.rawText) || "这段内容已经有一个值得展开的核心问题";
  const sectionHeadings = sections.map((section) => section.heading).filter(Boolean);
  return {
    chiefEditor: {
      summary: "保留原始观点和个人表达气质，强化开头吸引力、论证顺序、段落节奏和结尾传播动机。",
      suggestions: [
        "先把读者最容易共鸣的卡点放到开头",
        "每个小节只解决一个问题，避免信息堆叠",
        "结尾给读者一个可带走的判断或行动"
      ]
    },
    valueMentor: {
      highlights: [
        first,
        sectionHeadings.length ? `文章已经具备清晰的推进线索：${sectionHeadings.slice(0, 3).join("、")}` : "真正的价值在于把模糊感拆成可执行的步骤"
      ],
      goldenLines: [
        "把问题说清楚，本身就是一种行动力。",
        "真正有用的文章，不是让人点头，而是让人读完之后知道自己可以怎么做。"
      ]
    },
    structureMaster: {
      background: first,
      tensionOrConclusion: "主要矛盾在于：想法已经存在，但还需要被结构化，才能变成读者能理解、能行动、愿意转发的内容。",
      actionItems: [
        "明确这篇文章只回答的一个核心问题",
        "把核心观点放回读者熟悉的具体场景",
        "用短段落、重点句和行动清单提升阅读获得感"
      ]
    }
  };
}

function arrayOr(value, fallback) {
  return Array.isArray(value) && value.length ? value.map(String) : fallback;
}

function stringOr(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function firstSentence(text) {
  return String(text || "")
    .replace(/^#{1,3}\s+/gm, "")
    .split(/[。！？!?\n]/)
    .map((item) => item.trim())
    .find(Boolean) || "";
}
