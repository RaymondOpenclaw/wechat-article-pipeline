export const ARTICLE_TEMPLATES = [
  {
    id: "story_insight",
    name: "故事洞察型",
    description: "适合口语想法、个人经历、职业反思。用一个具体画面切入，提炼一个能被转发的洞察。",
    titleStrategy: "具体画面 + 反常识判断",
    structure: ["具体场景", "反常识发现", "个人经验连接", "读者可带走的判断"]
  },
  {
    id: "knowledge_course",
    name: "知识精讲型",
    description: "适合课程记录、心理咨询训练、知识笔记。先讲清核心立场，再拆概念、框架、误区和练习。",
    titleStrategy: "核心概念 + 最容易误解的地方",
    structure: ["为什么重要", "核心概念", "框架地图", "常见误区", "练习要点"]
  },
  {
    id: "practical_method",
    name: "实战方法型",
    description: "适合方案、工具、流程、行动建议。先呈现痛点，再给原则、步骤、检查清单。",
    titleStrategy: "目标结果 + 可执行方法",
    structure: ["场景痛点", "关键原则", "操作步骤", "避坑提醒", "行动清单"]
  }
];

export function getArticleTemplate(config = {}) {
  const selectedId = config.articleTemplate?.selectedId || config.articleTemplateId || "story_insight";
  return ARTICLE_TEMPLATES.find((template) => template.id === selectedId) || ARTICLE_TEMPLATES[0];
}

export function inferArticleTemplateId(text, config = {}) {
  const explicitId = config.articleTemplate?.selectedId || config.articleTemplateId;
  if (explicitId && explicitId !== "auto") return explicitId;
  const raw = String(text || "");
  if (/外化|叙事|疗法|概念|框架|课程|学员|练习|社会建构|建构/.test(raw)) return "knowledge_course";
  if (/步骤|方法|怎么做|流程|方案|执行|清单|避坑/.test(raw)) return "practical_method";
  return "story_insight";
}

export function getArticleTemplateForText(text, config = {}) {
  const selectedId = inferArticleTemplateId(text, config);
  return ARTICLE_TEMPLATES.find((template) => template.id === selectedId) || ARTICLE_TEMPLATES[0];
}

export function articleTemplatePrompt(config = {}) {
  const template = getArticleTemplate(config);
  return {
    selectedTemplate: template,
    templateRules: [
      `当前使用模板：${template.name}`,
      `适用场景：${template.description}`,
      `标题策略：${template.titleStrategy}`,
      `结构顺序：${template.structure.join(" -> ")}`,
      "必须把标题、摘要、引用金句、小标题和结尾都服务于同一个核心矛盾，不能各说各的。",
      "引用金句必须来自文章最有价值的洞察，不要放泛泛而谈的鸡汤句。",
      "如果原文是口语记录，要保留作者的第一人称和真实犹豫感，但删除重复、断裂和自我解释过多的句子。"
    ]
  };
}
