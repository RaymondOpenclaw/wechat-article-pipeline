import { AiClient } from "./aiClient.js";

export async function reviewArticleDraft(input, article, {
  aiClient = new AiClient()
} = {}) {
  const fallback = () => heuristicEditorReview(input, article);
  const result = await aiClient.json(
    "你是一位资深微信公众号文章编辑。只输出 JSON。你的职责是审稿，不是夸奖：检查文章是否真正读懂原文、观点是否忠实、逻辑是否通顺、标题和引用是否服务主旨。",
    JSON.stringify({
      task: "审查公众号成稿质量",
      reviewPrinciples: [
        "先判断文章有没有读懂原文核心，不要只看文字是否流畅。",
        "标题必须准确指向文章主旨，不能把知识文章写成成长鸡汤，不能把方法文章写成泛感悟。",
        "引用金句必须来自文章最有价值的洞察，不能泛泛而谈。",
        "小标题之间要形成递进关系：具体材料 -> 核心解释 -> 作者洞察 -> 读者收获。",
        "不得新增原文没有支撑的事实、经历、立场。",
        "如果文章跑题、误解核心概念、或观点替换用户原意，必须判定为 needs_revision。"
      ],
      expectedJson: {
        verdict: "approved | needs_revision",
        approved: false,
        summary: "一句话编辑结论",
        scores: {
          understanding: 0,
          coherence: 0,
          viewpointFidelity: 0,
          titleFit: 0,
          quoteFit: 0,
          readability: 0
        },
        issues: [
          {
            severity: "critical | major | minor",
            area: "理解 | 逻辑 | 标题 | 引用 | 事实 | 排版",
            message: "发现的问题",
            suggestion: "具体怎么改"
          }
        ],
        recommendedEdits: {
          title: "建议标题",
          quote: "建议引用金句",
          structure: ["建议小节1", "建议小节2", "建议小节3", "建议小节4"]
        }
      },
      source: {
        rawText: input.rawText,
        metadata: input.metadata
      },
      article: {
        title: article.title,
        digest: article.digest,
        blueprint: article.blueprint,
        expertReviews: article.expertReviews,
        markdown: article.markdown
      }
    }),
    fallback
  );
  return normalizeEditorReview(result, fallback());
}

export function heuristicEditorReview(input, article) {
  const source = String(input?.rawText || "");
  const title = String(article?.title || "");
  const markdown = String(article?.markdown || "");
  const quote = article?.expertReviews?.valueMentor?.goldenLines?.[0] || extractBlockQuote(markdown);
  const issues = [];
  const scores = {
    understanding: 82,
    coherence: 82,
    viewpointFidelity: 82,
    titleFit: 82,
    quoteFit: 82,
    readability: 84
  };

  const sourceKeywords = importantKeywords(source);
  const articleKeywords = importantKeywords(`${title}\n${article?.digest || ""}\n${markdown}`);
  const overlap = sourceKeywords.filter((keyword) => articleKeywords.includes(keyword));
  if (sourceKeywords.length >= 4 && overlap.length / sourceKeywords.length < 0.45) {
    scores.understanding = 48;
    scores.viewpointFidelity = 50;
    issues.push({
      severity: "critical",
      area: "理解",
      message: "成稿没有覆盖原文的关键概念，可能只是套用了通用模板。",
      suggestion: `重写前先提炼原文关键词：${sourceKeywords.slice(0, 8).join("、")}，标题和小标题都要围绕这些关键词展开。`
    });
  }

  if (/外化|叙事|社会建构|建构|关系/.test(source) && /成长|往前|进退|确认方向/.test(title)) {
    scores.understanding = 25;
    scores.titleFit = 20;
    scores.viewpointFidelity = 28;
    issues.push({
      severity: "critical",
      area: "标题",
      message: "原文核心是外化、关系和社会建构，但标题被改写成泛成长主题，方向错误。",
      suggestion: "标题应包含“外化”或“关系”，例如“所谓外化：不是逃离自己，而是重新理解关系”。"
    });
  }

  if (/外化|叙事|社会建构|建构|关系/.test(source) && !/外化|关系|建构/.test(quote)) {
    scores.quoteFit = 35;
    issues.push({
      severity: "major",
      area: "引用",
      message: "引用金句没有抓住原文最重要的概念洞察。",
      suggestion: "引用应落在“外化如何把人从问题、标签和社会叙事的黏连中分出来”。"
    });
  }

  if (/这是第一段|这是第二段|把问题说清楚/.test(markdown) && source.length > 120) {
    scores.coherence = 45;
    issues.push({
      severity: "major",
      area: "逻辑",
      message: "正文出现通用 fallback 痕迹，说明文章没有围绕原文材料展开。",
      suggestion: "用原文材料重建段落，不要保留模板化占位表达。"
    });
  }

  const approved = !issues.some((issue) => issue.severity === "critical")
    && Object.values(scores).every((score) => score >= 70);

  return {
    verdict: approved ? "approved" : "needs_revision",
    approved,
    summary: approved
      ? "编辑审稿通过：文章基本读懂原文，逻辑和标题可继续进入配图。"
      : "编辑建议先修改：文章存在理解偏差或标题/引用未服务主旨。",
    scores,
    issues,
    recommendedEdits: recommendedEditsFor(input, article, issues)
  };
}

function normalizeEditorReview(result, fallback) {
  const scores = {
    understanding: score(result?.scores?.understanding, fallback.scores.understanding),
    coherence: score(result?.scores?.coherence, fallback.scores.coherence),
    viewpointFidelity: score(result?.scores?.viewpointFidelity, fallback.scores.viewpointFidelity),
    titleFit: score(result?.scores?.titleFit, fallback.scores.titleFit),
    quoteFit: score(result?.scores?.quoteFit, fallback.scores.quoteFit),
    readability: score(result?.scores?.readability, fallback.scores.readability)
  };
  const issuesFromResult = Array.isArray(result?.issues) ? result.issues.map((issue) => ({
    severity: String(issue.severity || "minor"),
    area: String(issue.area || "编辑"),
    message: String(issue.message || ""),
    suggestion: String(issue.suggestion || "")
  })).filter((issue) => issue.message || issue.suggestion) : fallback.issues;
  const guardIssues = fallback.issues
    .filter((issue) => issue.severity === "critical")
    .filter((issue) => !issuesFromResult.some((item) => item.area === issue.area && item.message === issue.message));
  const issues = [...issuesFromResult, ...guardIssues];
  const hasBlockingIssue = issues.some((issue) => issue.severity === "critical");
  const hasLowScore = Object.values(scores).some((item) => item < 60);
  const approved = !hasBlockingIssue && !hasLowScore && (
    typeof result?.approved === "boolean"
      ? result.approved
      : Object.values(scores).every((item) => item >= 70)
  );
  return {
    verdict: approved ? "approved" : "needs_revision",
    approved,
    summary: String(result?.summary || fallback.summary),
    scores,
    issues,
    recommendedEdits: {
      title: String(result?.recommendedEdits?.title || fallback.recommendedEdits.title || ""),
      quote: String(result?.recommendedEdits?.quote || fallback.recommendedEdits.quote || ""),
      structure: Array.isArray(result?.recommendedEdits?.structure) && result.recommendedEdits.structure.length
        ? result.recommendedEdits.structure.map(String)
        : fallback.recommendedEdits.structure
    },
    reviewedAt: new Date().toISOString()
  };
}

function recommendedEditsFor(input, article, issues) {
  const source = String(input?.rawText || "");
  if (/无结构.{0,4}团体|团体带领|矫正性情绪体验|团体.{0,12}(关系|反馈|自我)/.test(source)) {
    return {
      title: article?.title || "为什么学了很多，还是用不出来？团体工作的真正价值",
      quote: article?.expertReviews?.valueMentor?.goldenLines?.[0]
        || "团体不急着教你更多，而是让你看见：为什么已经学会的东西，在真实关系里仍然用不出来。",
      structure: issues.length
        ? ["知识技能为什么用不出来", "助人者需要的自我素养", "团体如何通过关系工作", "具体问题如何在团体中被松动", "适合参加的人与安全边界"]
        : []
    };
  }
  if (/外化|叙事|社会建构|建构|关系/.test(source)) {
    return {
      title: "所谓外化：不是逃离自己，而是重新理解关系",
      quote: "外化不是把问题推开，而是把人从问题、标签和社会叙事的黏连中解放出来。",
      structure: ["人不是靠独自变强成为人的", "外化不是变得不完整，而是把自己活到世界里", "这也让我重新理解叙事疗法里的外化", "外化的价值，是把黏连的关系重新分开"]
    };
  }
  return {
    title: article?.title || "",
    quote: article?.expertReviews?.valueMentor?.goldenLines?.[0] || "",
    structure: issues.length ? ["重提原文核心", "补足逻辑递进", "重写标题和引用", "给读者明确收获"] : []
  };
}

function score(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function extractBlockQuote(markdown) {
  return String(markdown || "").match(/^>\s*(.+)$/m)?.[1] || "";
}

function importantKeywords(text) {
  const candidates = [
    "外化", "叙事", "关系", "社会建构", "建构", "社群", "赫拉利", "斯特林", "火", "衣服",
    "自由职业", "进退", "确认", "身份", "立场地图", "解构", "问题", "标签", "群体"
  ];
  return candidates.filter((keyword) => String(text || "").includes(keyword));
}
