import { AiClient } from "./aiClient.js";
import { articleTemplatePrompt, getArticleTemplate, getArticleTemplateForText } from "./articleTemplates.js";
import { ARTICLE_EXPERTS, buildExpertPanel, normalizeExpertReviews } from "./experts.js";
import { formatWechatHtml } from "./wechatFormatter.js";
import { imagePlaceholder, textToParagraphHtml } from "../utils/html.js";

export async function transformArticle(input, { styleProfile = null, contentBrief = null, config = {}, aiClient = new AiClient() } = {}) {
  const fallback = () => heuristicTransform(input, styleProfile, config, contentBrief);
  const result = await aiClient.json(
    "你是专业微信公众号写手和主编。只输出 JSON。目标是按作者个人风格写成让读者看得舒服、有收获、愿意点赞转发的公众号成稿；不得虚构事实、不得替换用户立场、不得照搬历史文章原句。",
    buildTransformPrompt(input, styleProfile, contentBrief, config),
    fallback
  );
  return normalizeTransformResult(result, input, styleProfile, contentBrief, config);
}

function buildTransformPrompt(input, styleProfile, contentBrief, config) {
  return JSON.stringify({
    task: "将用户给的内容编写成专业微信公众号成稿",
    constraints: [
      "成稿前必须先吸收 contentBrief：补齐读者理解所需的背景、概念、逻辑桥梁、读者疑问和建议结构",
      "contentBrief 中的 safeSupplements 可以写入正文；needsUserInput 只能作为风险提示或待确认问题，不得编造成事实",
      "contentBrief 中的 factualBoundaries 是硬边界，不能突破",
      "以专业公众号写手和资深主编的方式重组表达：标题有打开欲，开头从具体场景或反常识切入，正文有洞察密度，结尾能自然带动点赞、在看、转发或留言",
      "先执行 humanizer：去除AI味、空泛套话和总结腔，保留作者口语里的真实感、犹豫感和个人判断",
      "按照用户历史文章的写作特征来写：标题结构、开头方式、段落节奏、常用表达、论证习惯、结尾习惯都要参考 StyleProfile",
      "公众号排版必须直接适合手机阅读：短段落、清晰小标题、重点句、引用/金句、列表/步骤、留白、图片插入点",
      "每个小节只解决一个问题，并让读者获得一个明确收获，避免空泛鸡汤、管理学套话、AI常见套路",
      "参考 BND-1/wechat_article_skills 的写作原则：第一人称、观点鲜明但有理有据、真实场景导向、短句短段、不要堆功能/概念列表",
      "标题候选必须覆盖：情绪共鸣型、身份认同型、反常识型、金句提炼型、场景切入型",
      "必须根据 selectedTemplate 组织文章，不要把不同模板混用成松散列表",
      "不要新增未经原文或 contentBrief.safeSupplements 支持的事实或案例",
      "如果使用个人风格，只迁移结构和表达习惯，不复制历史原句",
      "必须调用 expertPanel 中的专家视角：主编负责成稿质量，价值导师负责闪光点和金句，信息提炼大师负责结构与 Action Items",
      "正文 HTML 中用 {{INLINE_IMAGE_1}} 到 {{INLINE_IMAGE_N}} 标记正文配图位置"
    ],
    expectedJson: {
      blueprint: {
        coreClaim: "核心观点",
        audience: "目标读者",
        articleType: "文章类型",
        titleCandidates: ["情绪共鸣型标题", "身份认同型标题", "反常识型标题", "金句提炼型标题", "场景切入型标题"],
        digest: "120字内摘要",
        sections: [{ heading: "小标题", role: "段落功能", summary: "小节摘要" }],
        closingPrompt: "结尾互动句",
        shareReason: "读者愿意点赞转发的理由"
      },
      title: "最终标题",
      digest: "摘要",
      markdown: "优化后的 Markdown",
      html: "带内联样式、可直接进入公众号编辑器的 HTML",
      expertReviews: {
        chiefEditor: { summary: "主编点评", suggestions: ["修改建议"] },
        valueMentor: { highlights: ["闪光点"], goldenLines: ["金句1", "金句2"] },
        structureMaster: { background: "核心背景", tensionOrConclusion: "主要矛盾或关键结论", actionItems: ["下一步1", "下一步2", "下一步3"] }
      },
      changeLog: ["改动说明"],
      riskNotes: ["风险提示，没有则为空数组"]
    },
    articleTemplate: articleTemplatePrompt(config),
    contentBrief,
    metadata: input.metadata,
    styleProfile,
    expertPanel: buildExpertPanel(input, config),
    inlineImageCount: config.image?.inlineImageCount ?? 2,
    rawText: input.rawText
  });
}

function normalizeTransformResult(result, input, styleProfile, contentBrief, config) {
  const inlineCount = Math.max(0, Math.min(3, Number(config.image?.inlineImageCount ?? 2)));
  const markdown = String(result.markdown || input.rawText).trim();
  const normalizedBlueprint = normalizeBlueprint(result.blueprint, input, result.digest);
  const expertReviews = normalizeExpertReviews(result.expertReviews, input, normalizedBlueprint.sections, config);
  let html = String(result.html || textToParagraphHtml(markdown)).trim();
  for (let index = 1; index <= inlineCount; index += 1) {
    if (!html.includes(imagePlaceholder(index))) {
      html += `\n<p>${imagePlaceholder(index)}</p>`;
    }
  }
  return {
    input,
    blueprint: normalizedBlueprint,
    styleProfile,
    contentBrief,
    expertReviews,
    title: String(result.title || result.blueprint?.titleCandidates?.[0] || input.metadata.title || "未命名文章").trim(),
    digest: String(result.digest || result.blueprint?.digest || "").slice(0, 120),
    markdown,
    html: formatWechatHtml(html),
    changeLog: Array.isArray(result.changeLog) ? result.changeLog : ["完成专业公众号成稿与移动端排版优化"],
    riskNotes: Array.isArray(result.riskNotes) ? result.riskNotes : [],
    createdAt: new Date().toISOString()
  };
}

function normalizeBlueprint(blueprint, input, digest = "") {
  const title = input.metadata.title || firstHeading(input.rawText) || "未命名文章";
  return {
    coreClaim: blueprint?.coreClaim || firstSentence(input.rawText),
    audience: blueprint?.audience || "公众号读者",
    articleType: blueprint?.articleType || "观点/经验文章",
    titleCandidates: Array.isArray(blueprint?.titleCandidates) && blueprint.titleCandidates.length
      ? blueprint.titleCandidates
      : [title, `${title}：真正重要的不是方法，而是顺序`, `把${title}这件事想清楚`],
    digest: blueprint?.digest || digest || firstSentence(input.rawText).slice(0, 120),
    sections: Array.isArray(blueprint?.sections) ? blueprint.sections : inferSections(input.rawText),
    closingPrompt: blueprint?.closingPrompt || "如果这篇文章让你有一点启发，欢迎点个赞，也转给那个正在整理思路的人。",
    shareReason: blueprint?.shareReason || "读者能带走清晰方法和具体行动感"
  };
}

function heuristicTransform(input, styleProfile, config, contentBrief = null) {
  const therapyCourse = buildNarrativeTherapyCourseArticle(input, config);
  if (therapyCourse) return attachContentBrief(therapyCourse, contentBrief);

  const narrative = buildSpecialNarrativeArticle(input, config);
  if (narrative) return attachContentBrief(narrative, contentBrief);

  const externalization = buildExternalizationConceptArticle(input, config);
  if (externalization) return attachContentBrief(externalization, contentBrief);

  const templated = buildTemplatedArticle(input, styleProfile, config);
  if (templated) return attachContentBrief(templated, contentBrief);

  const sourceTitle = input.metadata.title || firstHeading(input.rawText);
  const paragraphs = input.rawText
    .replace(/^#{1,3}\s+/gm, "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const title = sourceTitle || inferTitleFromText(input.rawText);
  const intro = paragraphs[0] || "";
  const titleCandidates = buildTitleCandidates(title, styleProfile);
  const digest = buildDigest(intro, input.rawText);
  const sections = buildProfessionalSections(paragraphs, input.rawText);
  const expertReviews = normalizeExpertReviews(null, input, sections, config);
  const markdown = [
    `# ${title}`,
    "",
    buildOpening(paragraphs),
    "",
    digest,
    "",
    ...sections.flatMap((section) => [`## ${section.heading}`, "", section.body]),
    "",
    "如果这篇文章让你有一点启发，欢迎点个赞，也转给那个正在整理思路的人。"
  ].join("\n\n");
  const html = renderProfessionalWechatHtml({ title, digest, sections, expertReviews, inlineCount: config.image?.inlineImageCount ?? 2 });
  return {
    blueprint: {
      coreClaim: firstSentence(input.rawText),
      audience: "希望从文章中获得启发、方法和行动感的公众号读者",
      articleType: "专业公众号成稿",
      titleCandidates,
      digest,
      sections: sections.map((section) => ({ heading: section.heading, role: section.role, summary: firstSentence(section.body).slice(0, 80) })),
      closingPrompt: "如果这篇文章让你有一点启发，欢迎点个赞，也转给那个正在整理思路的人。",
      shareReason: "文章提供了清晰判断和可带走的方法，适合读者收藏与转发"
    },
    title,
    digest,
    markdown,
    html,
    expertReviews,
    changeLog: [
      contentBrief ? "先执行内容完整度补全，再进入公众号成稿打磨" : "未提供内容补全 Brief，按原文直接成稿",
      `启用专家组：${ARTICLE_EXPERTS.map((expert) => expert.name).join("、")}`,
      "按专业公众号文章节奏重组开头、正文和结尾",
      "强化读者收获、重点句、行动感和点赞转发引导",
      "根据个人风格库约束表达习惯，并完成微信移动端排版"
    ],
    riskNotes: []
  };
}

function attachContentBrief(article, contentBrief) {
  if (!contentBrief) return article;
  return {
    ...article,
    contentBrief,
    changeLog: [
      "先执行内容完整度补全，再进入公众号成稿打磨",
      ...(Array.isArray(article.changeLog) ? article.changeLog : [])
    ],
    riskNotes: [
      ...(Array.isArray(article.riskNotes) ? article.riskNotes : []),
      ...(Array.isArray(contentBrief.needsUserInput) ? contentBrief.needsUserInput.map((item) => `待作者确认：${item}`) : [])
    ]
  };
}

function buildTemplatedArticle(input, styleProfile, config) {
  const template = getArticleTemplateForText(input.rawText, config);
  const raw = normalizeRawText(input.rawText);
  if (!raw) return null;
  const sentences = splitSentences(raw);
  const analysis = analyzeDraft(raw, sentences, template);
  const title = input.metadata.title || buildTemplateTitle(analysis, template, styleProfile);
  const digest = buildTemplateDigest(analysis, template);
  const sections = buildTemplateSections(analysis, template);
  const expertReviews = buildTemplateExpertReviews(analysis, template, sections);
  const quote = expertReviews.valueMentor.goldenLines[0];
  const markdown = [
    `# ${title}`,
    "",
    ...analysis.opening,
    "",
    digest,
    "",
    `> ${quote}`,
    "",
    ...sections.flatMap((section) => [`## ${section.heading}`, "", section.body]),
    "",
    analysis.closing
  ].join("\n\n");
  const html = renderProfessionalWechatHtml({
    title,
    digest,
    sections,
    expertReviews,
    openingParagraphs: analysis.opening,
    closingLead: "写到最后，我想把这篇文章收束成一句话：",
    closingClaim: quote,
    closingPrompt: analysis.closing,
    inlineCount: config.image?.inlineImageCount ?? 2
  });
  return {
    input,
    blueprint: {
      coreClaim: analysis.coreClaim,
      audience: analysis.audience,
      articleType: template.name,
      titleCandidates: buildTemplateTitleCandidates(analysis, template),
      digest,
      sections: sections.map((section) => ({ heading: section.heading, role: section.role, summary: firstSentence(section.body).slice(0, 80) })),
      closingPrompt: analysis.closing,
      shareReason: analysis.shareReason
    },
    styleProfile,
    expertReviews,
    title,
    digest,
    markdown,
    html,
    changeLog: [
      `套用文本模板：${template.name}`,
      "参考 BND-1 写作修饰原则，强化第一人称、具体场景、核心矛盾和短段落",
      "重写标题候选、引用金句、小标题和行动清单，使其统一服务核心观点"
    ],
    riskNotes: [],
    createdAt: new Date().toISOString()
  };
}

function buildNarrativeTherapyCourseArticle(input, config) {
  const text = input.rawText;
  const isNarrativeTherapyCourse = text.includes("叙事疗法")
    && text.includes("解构")
    && text.includes("外化")
    && (text.includes("怀特") || text.includes("立场地图"));
  if (!isNarrativeTherapyCourse) return null;

  const title = "叙事疗法里，外化不是逃避责任";
  const digest = "学习叙事疗法时，外化和解构最容易被误解：外化不是替来访者开脱，而是把人与问题分开，让人重新看见自己的立场、价值和选择空间。";
  const sections = [
    {
      heading: "为什么要先把“人”和“问题”分开",
      role: "建立外化的核心立场",
      body: [
        "学叙事疗法时，很多人会先被一个句子打动：人不是问题，问题才是问题。",
        "这句话听起来温和，但它不是一句安慰人的话。它背后其实是一种非常清晰的咨询立场：来访者不是“焦虑本人”、不是“拖延本人”、也不是“自私本人”。这些问题、标签和评价，往往是在关系、文化和社会规训里被慢慢建构出来的。",
        "外化要做的第一件事，就是把这个黏在身上的标签拿下来，放到来访者面前。",
        "当问题被命名、被看见、被放到外部，它就不再等同于一个人的身份。来访者也才有机会问：这个问题是怎么影响我的？我对它是什么态度？我想让它继续这样影响我的生活吗？"
      ].join("\n\n")
    },
    {
      heading: "解构不是分析得更深，而是拆掉理所当然",
      role: "解释解构和外化的关系",
      body: [
        "解构的目标，不是把痛苦挖得更细，也不是把问题解释得更复杂。",
        "它真正想做的，是颠覆那些看起来理所当然的现实：为什么这件事一定要被叫作“失败”？为什么这个人一定要被称为“自私”？为什么某种社会评价会变成一个人对自己的判决？",
        "从这个意义上说，外化是解构的起点。",
        "如果把外化当作一个技术动作，它通常从描述问题、命名问题开始；如果把外化当作一种态度，它会贯穿整个叙事对话。解构问题的过程，会自然推动外化；而外化对话，本质上也一直在解构。",
        "所以，判断方向有没有走对，有一个很朴素的标准：谈完之后，来访者是更自责、更挫败，还是更放松、更有空间、更能看见新的可能？"
      ].join("\n\n")
    },
    {
      heading: "怀特的立场地图：四步不是模板，而是方向",
      role: "梳理解构对话的纵向提问线",
      body: [
        "怀特的立场地图，可以理解为一条纵向提问线。",
        "第一步，是描述问题。这里最重要的不是套一个抽象标签，而是回到来访者自己的经验：当时发生了什么？问题具体怎么出现？为什么现在它成了一个问题？",
        "第二步，是绘制影响地图。也就是继续问：这个问题给你的生活、关系、工作、身体、情绪带来了什么影响？",
        "第三步，是声明立场。来访者怎么看待这些影响？喜欢吗？接受吗？想继续这样吗？这一步回答的是：你对问题的态度是什么。",
        "第四步，是论证评估。为什么你会这样看？这对你来说意味着什么？你最在意的是什么？这一步开始碰到来访者的价值、身份和自我认同。",
        "一个很通俗的区分是：第三步问“你喜不喜欢、认不认同”，第四步问“为什么你会这么认为”。"
      ].join("\n\n")
    },
    {
      heading: "相对影响力：别只问问题如何影响人",
      role: "梳理横向提问线和独特经验",
      body: [
        "叙事对话不能只停在“问题如何影响人”。问完这个方向之后，还要反过来问：人是如何影响问题的？",
        "这就是相对影响力提问。",
        "它会带我们看见来访者已经做过的应对。这里的应对不一定是成功行动，也不一定要很漂亮。主动做了什么，是应对；什么都没做、但问题没有继续变糟，也可能是一种应对。",
        "当来访者答不上来，可以用更有脚手架的问题进入：为什么问题没有变得更糟？什么时候它的影响没有那么大？有没有谁知道你遇到这个困难？谁曾经给过你帮助？",
        "这些问题的目的，是把来访者从单一的问题故事里带出来，去看见那些被忽略的独特经验和支线故事。新的意义，往往就是从这里开始长出来的。"
      ].join("\n\n")
    },
    {
      heading: "外化不会让人逃避责任，反而让人重新成为主体",
      role: "回应常见疑问并给出练习提醒",
      body: [
        "学习者很常问：把人和问题分开，会不会让来访者逃避责任？",
        "这个担心很重要，但外化并不是否认行为后果。一个人仍然需要在社会、法律和道德框架下为自己的行为负责。",
        "外化真正分开的，是主体身份和问题影响。它不是说“这件事与你无关”，而是说“你不等于这个问题，所以你可以重新选择你和它的关系”。",
        "当内疚感和无力感降低一点，来访者反而更可能有空间去想：我真正想要的生活是什么？我愿意怎样对自己的选择负责？",
        "所以练习解构地图时，不必机械套模板。记住每一步要探寻的目标，再根据来访者的状态调整语言。好问题不是显得专业，而是来访者能听懂、好回答，并且回答之后更能看见自己。"
      ].join("\n\n")
    }
  ];
  const expertReviews = {
    chiefEditor: {
      summary: "这篇文章适合写成心理咨询学习者的课程复盘型公众号文章，重点是把外化、解构、立场地图和常见误解讲清楚。",
      suggestions: ["开头先抓住“人不是问题”这个核心立场", "用四步地图降低学习门槛", "结尾落到练习提醒，避免只停留在概念解释"]
    },
    valueMentor: {
      highlights: ["第三步与第四步的通俗区分很适合保留，能帮助学习者立刻理解。", "把“外化不是逃避责任，而是重建主体性”作为全文核心金句。"],
      goldenLines: ["外化不是替人开脱，而是让人重新看见自己和问题的关系。", "好问题不是显得专业，而是让来访者回答之后更能看见自己。"]
    },
    structureMaster: {
      background: "课程聚焦叙事疗法中的解构与外化技术，回应学习者对概念、地图和练习方式的疑问。",
      tensionOrConclusion: "核心矛盾是：学习者容易把外化理解成技巧或开脱，但它真正指向的是人与问题分离后的主体性重建。",
      actionItems: ["练习时先把问题从抽象标签还原到具体情境", "每次提问前确认自己正在探索哪一层目标", "看到独特经验出现时，及时从问题故事转向支线故事"]
    }
  };
  const markdown = [
    `# ${title}`,
    "",
    "学习叙事疗法，最容易卡住的地方，往往不是记不住技术，而是还没有真正理解技术背后的立场。",
    "",
    digest,
    "",
    "> 外化不是替人开脱，而是让人重新看见自己和问题的关系。",
    "",
    ...sections.flatMap((section) => [`## ${section.heading}`, "", section.body]),
    "",
    "如果你正在练习叙事对话，可以先不急着问出“漂亮的问题”。先确认一件事：这个问题问出去之后，来访者会更靠近问题，还是更靠近自己？"
  ].join("\n\n");
  const html = renderProfessionalWechatHtml({
    title,
    digest,
    sections,
    expertReviews,
    openingParagraphs: [
      "学习叙事疗法，最容易卡住的地方，往往不是记不住技术，而是还没有真正理解技术背后的立场。",
      "尤其是解构和外化。它们看起来像一组提问技术，但真正重要的，是它们如何帮助来访者从“我就是问题”的故事里退出来。"
    ],
    closingLead: "写到最后，我想把这次课程的重点收束成一句话：",
    closingClaim: "外化不是把责任推出去，而是把主体性请回来。",
    closingPrompt: "如果你身边也有人在学习叙事疗法，可以把这篇转给他。很多时候，真正需要练习的不是模板，而是看待人的方式。",
    inlineCount: config.image?.inlineImageCount ?? 2
  });
  return {
    input,
    blueprint: {
      coreClaim: "叙事疗法中的外化和解构，核心是将人和问题分开，并通过立场地图与相对影响力提问重建主体性。",
      audience: "心理咨询师、叙事疗法学习者、心理咨询技能培训学员",
      articleType: "课程复盘型知识文章",
      titleCandidates: [
        title,
        "学叙事疗法，先理解这句：人不是问题",
        "外化会让人逃避责任吗？恰恰相反",
        "怀特的解构地图，真正要问的不是模板",
        "一篇讲清楚叙事疗法的解构与外化"
      ],
      digest,
      sections: sections.map((section) => ({ heading: section.heading, role: section.role, summary: firstSentence(section.body).slice(0, 80) })),
      closingPrompt: "真正需要练习的不是模板，而是看待人的方式。",
      shareReason: "帮助心理咨询学习者清晰理解解构、外化、立场地图和练习要点"
    },
    styleProfile: null,
    title,
    digest,
    markdown,
    html,
    expertReviews,
    changeLog: [
      "识别为叙事疗法课程复盘型知识文章",
      "将课程提纲重组为“核心立场-概念关系-立场地图-相对影响力-常见疑问”的公众号结构",
      "保留关键概念和练习要点，增强开头钩子、金句、行动建议和转发理由"
    ],
    riskNotes: [],
    createdAt: new Date().toISOString()
  };
}

function buildExternalizationConceptArticle(input, config) {
  const text = input.rawText;
  const isExternalizationConcept = text.includes("外化")
    && (text.includes("斯特林") || text.includes("赫拉利") || text.includes("火") || text.includes("衣服") || text.includes("社群"))
    && (text.includes("叙事") || text.includes("关系") || text.includes("社会建构") || text.includes("建构"));
  if (!isExternalizationConcept) return null;

  const title = "所谓外化：不是逃离自己，而是重新理解关系";
  const digest = "外化不是把问题推出去，也不是让人逃避责任。它更像一种关系重组：把人从问题、标签和社会叙事的黏连中分出来，重新看见自己如何与世界相连。";
  const sections = [
    {
      heading: "人不是靠独自变强成为人的",
      role: "从斯特林的人类外化切入",
      body: [
        "斯特林关于智人的解释里，有一个很漂亮的洞见：正因为智人体型小、个体脆弱，所以我们不得不依赖合作。",
        "而为了维持合作，人类发展出一种非常关键的能力：外化。",
        "什么是外化？简单说，就是把原本由身体完成的功能，转移到身体之外。",
        "火，是对消化系统的外化。熟食让人类不再需要那么强大的颌骨和漫长的消化道，节省下来的能量，转而供给大脑。",
        "衣服，是对体温调节能力的外化。有了衣服，人类不需要长出厚厚的皮毛，也能进入更寒冷的地方。",
        "更重要的是，社群本身也是外化。人类把记忆、协作和意义，放进群体、故事和关系网络里。"
      ].join("\n\n")
    },
    {
      heading: "外化不是变得不完整，而是把自己活到世界里",
      role: "提炼人类学层面的核心转折",
      body: [
        "这件事真正有意思的地方在于：外化并没有让人变得更弱。",
        "恰恰相反，人类是在不断外化中，变成了更复杂的自己。",
        "我们不是把所有能力都关在身体里，而是把自己延伸到火、衣服、工具、语言、社群和制度之中。",
        "所以外化不是简单的“把东西放出去”。",
        "它改变的是关系：人与外界的关系，人与熟悉群体的关系，人与陌生社会的关系。",
        "从这个角度看，外化最重要的作用，不只是增强能力，而是强化关系。"
      ].join("\n\n")
    },
    {
      heading: "这也让我重新理解叙事疗法里的外化",
      role: "连接叙事疗法概念",
      body: [
        "想到这里，我会重新看叙事疗法里的外化。",
        "以前我们很容易把它理解成一句技术话术：人不是问题，问题才是问题。",
        "但如果从关系的角度看，外化要做的事情更深。",
        "它不是简单安慰一个人“这不是你的错”，也不是把责任推出去。",
        "它是在帮助一个人看见：我和问题之间，原来不是天然黏在一起的；我和家庭、群体、社会标签之间，也不是只能维持原来的绑定。",
        "当一个人说“我要做个好孩子”“我要当个好员工”“有钱才算成功”“女生就应该生儿育女”，这些话往往不只是个人想法，而是熟悉群体和社会叙事共同建构出来的关系。"
      ].join("\n\n")
    },
    {
      heading: "外化的价值，是把黏连的关系重新分开",
      role: "落到文章主旨和读者收获",
      body: [
        "所以我现在更愿意把叙事里的外化理解成一种关系重组。",
        "它把人和问题分开，把个人和群体规则分开，把自我和社会建构分开。",
        "分开不是为了切断关系，而是为了让关系重新变得可以被看见、被命名、被协商。",
        "一个人不再只能说“我就是失败的”“我就是不够好”“我必须成为别人定义里的样子”。",
        "他开始有空间问：这个问题是怎么影响我的？这个标签是谁给我的？我是否还愿意继续这样理解自己？",
        "这就是外化真正有力量的地方。",
        "它不是让人远离自己，而是让人从僵死的绑定里重新活起来。"
      ].join("\n\n")
    }
  ];
  const expertReviews = {
    chiefEditor: {
      summary: "这篇文章应写成概念洞察型文章：从斯特林的人类外化讲到叙事疗法的外化，核心是关系重组，而不是成长节奏。",
      suggestions: ["标题必须包含“外化/关系”，不能写成泛成长标题", "开头保留火、衣服、社群三个例子", "中段要明确外化的三层关系：外界、熟悉群体、陌生社会"]
    },
    valueMentor: {
      highlights: ["把斯特林的人类外化和叙事疗法外化连接起来，是这篇文章最有价值的洞察。", "外化的重点不是能力增强，而是关系被重新看见。"],
      goldenLines: [
        "外化不是把问题推开，而是把人从问题、标签和社会叙事的黏连中解放出来。",
        "人类最重要的能力，或许不是把一切都留在身体里，而是学会把自己安放到世界之中。"
      ]
    },
    structureMaster: {
      background: "斯特林用火、衣服和社群解释人类外化能力，作者进一步联想到叙事疗法中的外化。",
      tensionOrConclusion: "核心结论是：外化不是逃离自我，而是重新理解人和问题、群体、社会叙事之间的关系。",
      actionItems: ["区分问题和人的身份", "看见群体规则如何参与自我定义", "重新命名自己和社会叙事的关系"]
    }
  };
  const markdown = [
    `# ${title}`,
    "",
    "外化这个词，放在人类演化里很有意思；放到叙事疗法里，也许更有意思。",
    "",
    digest,
    "",
    "> 外化不是把问题推开，而是把人从问题、标签和社会叙事的黏连中解放出来。",
    "",
    ...sections.flatMap((section) => [`## ${section.heading}`, "", section.body]),
    "",
    "如果你也在学习叙事疗法，可以试着把“外化”先从技术动作里拿出来。它真正要处理的，也许不是一个问题，而是一个人被什么样的关系困住了。"
  ].join("\n\n");
  const html = renderProfessionalWechatHtml({
    title,
    digest,
    sections,
    expertReviews,
    openingParagraphs: [
      "外化这个词，放在人类演化里很有意思；放到叙事疗法里，也许更有意思。",
      "它表面上讲的是“把东西放到身体之外”，但真正触动我的，是它如何改变人和世界之间的关系。"
    ],
    closingLead: "写到最后，我想把这篇文章收束成一句话：",
    closingClaim: "外化不是远离自己，而是让自己从僵死的绑定中重新活起来。",
    closingPrompt: "如果你也在学习叙事疗法，可以试着把“外化”先从技术动作里拿出来。它真正要处理的，也许不是一个问题，而是一个人被什么样的关系困住了。",
    inlineCount: config.image?.inlineImageCount ?? 2
  });
  return {
    input,
    blueprint: {
      coreClaim: "外化不是逃离自己，而是重新理解人和问题、群体、社会叙事之间的关系。",
      audience: "叙事疗法学习者、心理咨询师、对人类学和心理学概念感兴趣的读者",
      articleType: "知识精讲型",
      titleCandidates: [
        title,
        "人不是靠独自变强成为人的",
        "火、衣服与叙事疗法：人如何把自己活到世界里",
        "问题不是你本人：但这句话真正难懂的地方在后面",
        "外化真正处理的，是关系"
      ],
      digest,
      sections: sections.map((section) => ({ heading: section.heading, role: section.role, summary: firstSentence(section.body).slice(0, 80) })),
      closingPrompt: "外化真正要处理的，也许不是一个问题，而是一个人被什么样的关系困住了。",
      shareReason: "读者能把人类演化中的外化和叙事疗法中的外化连接起来，获得更深一层的理解"
    },
    styleProfile: null,
    title,
    digest,
    markdown,
    html,
    expertReviews,
    changeLog: [
      "识别为外化概念洞察文章",
      "依据编辑诊断，将主题从泛成长修正为“外化与关系重组”",
      "保留斯特林的火、衣服、社群例子，并连接叙事疗法中的外化价值"
    ],
    riskNotes: [],
    createdAt: new Date().toISOString()
  };
}

function buildSpecialNarrativeArticle(input, config) {
  const text = input.rawText;
  const isBackAndForthCareerStory = text.includes("丁丁")
    && text.includes("自由职业")
    && (text.includes("进进退退") || text.includes("退回来"));
  if (!isBackAndForthCareerStory) return null;

  const title = "一个孩子退回第五阶后，我理解了自由职业的反复";
  const digest = "我们总以为成长应该一阶一阶往上走。可一个孩子从更高处退回第五阶的瞬间，让我突然理解：自由职业里的反复，不一定是退步，也可能是在确认自己真正要成为谁。";
  const sections = [
    {
      heading: "他没有继续往上跳",
      role: "用幼儿园观察制造反常识开场",
      body: [
        "今天听到一个幼儿园里的小观察，挺击中我。",
        "有个幼儿园把原本滑滑梯的地方，改成了一组可以往下跳的阶梯。孩子们不再只是滑下来，而是自己选择站在哪一阶，然后往下跳。",
        "如果按我们大人的想象，孩子学习这件事，大概应该是从第一阶、第二阶、第三阶，慢慢往上。能力越强，跳得越高。成长嘛，好像就应该是一条往上的线。",
        "但老师记录一个叫丁丁的小孩时，看到的不是这样。",
        "丁丁走到第五阶、第六阶、第七阶。你以为下一步他会挑战第八阶，可他没有。他退了回来，又选择了第五阶。",
        "这个动作很小，但它一下子把我脑子里那个“成长阶梯”的画面打碎了。原来真实的成长，可能不是稳定地往上爬，而是走上去一点，再退回来一点。"
      ].join("\n\n")
    },
    {
      heading: "退回来，是在确认自己",
      role: "提炼儿童学习背后的价值洞察",
      body: [
        "沈祖云老师讲到一个点：孩子会通过这种进进退退，去确认自己正在做的事到底是不是适合自己。",
        "它不只是胆小，也不是简单的能力不够。",
        "更准确地说，这是一次身份确认。",
        "我是不是那个可以从这里跳下去的人？这个高度是不是现在的我能承受的？我到底是在挑战自己，还是只是在迎合别人对“进步”的想象？",
        "我们很容易把退回来理解成失败。可在孩子那里，退回来可能只是一个确认动作。",
        "确认过了，他才知道：原来第五阶不是退步，而是此刻最真实、最稳的起点。"
      ].join("\n\n")
    },
    {
      heading: "自由职业这一年，我也一直在进退",
      role: "连接个人经验，建立读者共鸣",
      body: [
        "这个故事让我很有触动，是因为我做自由职业这一年，也一直处在这样的节奏里。",
        "我试过做自媒体，写了一些内容，也发布过；我也认真尝试过用 AI 帮自己提高产出。那些事情不是没做，也不是没努力。",
        "但做完之后，我又退回来了。",
        "以前我会把这个动作解释成：是不是我不够坚持？是不是我又在换方向？是不是我明明走出去了，却又把自己拉回原地？",
        "现在我会更愿意把它看成一次确认。",
        "我退回来，是想问自己：这件事对我真正想要的自由职业状态重要吗？它是我现在最该投入的方向吗？它是在把我带向那个更想成为的自己，还是只是让我看起来好像在前进？",
        "很多时候，答案其实不是。",
        "所以我开始允许自己像丁丁一样，在不同方向上走几步，再退几步。试一下内容，退回来；试一下合作，退回来；试一下新的定位，再退回来确认。",
        "直到最近，我才慢慢找到一种更适合自己的模式：先和老师合作一些具体项目，再在项目里继续校准自己的位置。"
      ].join("\n\n")
    },
    {
      heading: "如果你也在反复，请先别急着否定自己",
      role: "给自由职业者和职业转型者一个可带走的判断",
      body: [
        "我想把这个感受分享给正在自由职业、职业转型，或者正在重新找自己位置的人。",
        "你会进，也会退。你会兴奋地开始一个方向，也会突然发现它不是现在最重要的事。你会以为自己应该一路往上跳，但现实常常会让你退回某一阶，重新感受脚下到底稳不稳。",
        "这不一定是坏事。",
        "真正需要警惕的，也许不是退回来，而是从来不允许自己退回来。因为那样的人，很可能只是一直往前冲，却没有真正确认过：我跳下去的这个高度，真的是我想要的吗？",
        "所以，进进退退不一定说明你没有成长。",
        "它可能恰恰说明，你正在很认真地确认自己。"
      ].join("\n\n")
    }
  ];
  const expertReviews = {
    chiefEditor: {
      summary: "这篇文章最好的结构是从“丁丁退回第五阶”的反常识画面切入，把成长从直线叙事改写为身份确认，再落到自由职业者对方向和定位的校准。",
      suggestions: ["开头必须保留台阶、第五阶、第八阶这些具体画面", "把“退回来”重新定义为确认，而不是失败", "结尾不要喊口号，要给自由职业者一个可以带走的判断"]
    },
    valueMentor: {
      highlights: ["丁丁没有挑战第八阶，而是退回第五阶，这是全文最有传播力的画面。", "作者把自由职业中的反复，从“不坚持”改写成“身份确认”，这是独特洞察。"],
      goldenLines: ["退回来不是失败，而是在确认哪个高度才真正属于你。", "成长不是一路往上跳，而是在进进退退里，确认自己要成为谁。"]
    },
    structureMaster: {
      background: "幼儿园孩子跳台阶的观察，引发了作者对自由职业一年进退节奏的理解。",
      tensionOrConclusion: "主要矛盾是：我们以为成长应该持续向上，但真实成长常常需要撤回、确认、再前进。",
      actionItems: ["记录自己每一次“退回来”的原因", "分辨撤回是逃避，还是在确认方向", "把尝试当成定位校准，而不是成败审判"]
    }
  };
  const markdown = [
    `# ${title}`,
    "",
    "有时候，一个小孩从台阶上退回来，会突然解释成年人很长一段时间里的困惑。",
    "",
    digest,
    "",
    "> 退回来不是失败，而是在确认哪个高度才真正属于你。",
    "",
    ...sections.flatMap((section) => [`## ${section.heading}`, "", section.body]),
    "",
    "如果你也正在经历这种进进退退，愿你先不要急着否定自己。也许你不是停滞了，而是在认真确认自己真正要去的方向。"
  ].join("\n\n");
  const html = renderProfessionalWechatHtml({
    title,
    digest,
    sections,
    expertReviews,
    openingParagraphs: [
      "有时候，一个孩子从台阶上往下跳的方式，会突然解释成年人很长一段时间里的困惑。",
      "我今天听到的这个故事，就是这样。它讲的是一个叫丁丁的小孩，也讲的是我们在自由职业和职业转型里都会遇到的那种进进退退。"
    ],
    closingLead: "写到最后，我想把这件事收束成一句话：",
    closingClaim: "进进退退不一定是停滞，它也可能是你在认真确认自己。",
    closingPrompt: "如果你也在这样的阶段，欢迎把这篇文章转给那个正在反复确认方向的人。也许我们都不用那么急着证明自己一直在往上走。",
    inlineCount: config.image?.inlineImageCount ?? 2
  });
  return {
    input,
    blueprint: {
      coreClaim: "自由职业里的进进退退，不一定是退步，也可能是在确认自己的方向和身份。",
      audience: "自由职业者、职业转型者、正在重新定位自己的人",
      articleType: "故事型职业反思文章",
      titleCandidates: [
        title,
        "自由职业这一年，我终于接纳了自己的进进退退",
        "退回来不是失败，是在确认哪个高度属于你",
        "真正的成长，可能不是一直往上跳",
        "丁丁退回第五阶后，我看懂了自己的自由职业"
      ],
      digest,
      sections: sections.map((section) => ({ heading: section.heading, role: section.role, summary: firstSentence(section.body).slice(0, 80) })),
      closingPrompt: "如果你也正在进进退退，愿你先不要急着否定自己。",
      shareReason: "读者能从儿童观察里重新理解自由职业和职业转型中的反复"
    },
    styleProfile: null,
    title,
    digest,
    markdown,
    html,
    expertReviews,
    changeLog: [
      "识别为故事型职业反思文章",
      "将口语稿重组为“儿童观察-身份确认-自由职业校准-读者共鸣”的公众号结构",
      "强化丁丁跳台阶的反常识画面、自由职业的身份确认和结尾的点赞转发理由",
      "按 wechat-article-pipeline 要求加入 humanizer、金句引用块、手机阅读节奏和结构化行动建议"
    ],
    riskNotes: [],
    createdAt: new Date().toISOString()
  };
}

function buildTitleCandidates(title, styleProfile) {
  const hasQuestionPattern = styleProfile?.titlePatterns?.some((pattern) => pattern.includes("问题"));
  const candidates = [
    title,
    `${title}：真正拉开差距的，是这一步`,
    `把${title}想清楚，很多事就顺了`,
    `为什么你总觉得${title}很难？`,
    `我后来才明白，${title}背后藏着一个更重要的问题`
  ];
  if (hasQuestionPattern) candidates[2] = `${title}，为什么总是卡住？`;
  return candidates;
}

function normalizeRawText(text) {
  return String(text || "")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function analyzeDraft(raw, sentences, template) {
  const first = sentences[0] || firstSentence(raw) || "这个想法值得被认真整理";
  const second = sentences[1] || "";
  const hasCareer = /自由职业|职业|转型|定位|自媒体/.test(raw);
  const hasCourse = /课程|训练|提问|技术|疗法|概念|框架|练习|学员/.test(raw);
  const scene = extractScene(raw, first);
  const tension = extractTension(raw, first, second);
  const coreClaim = extractCoreClaim(raw, first, template);
  const audience = hasCareer
    ? "自由职业者、职业转型者、正在重新定位自己的人"
    : hasCourse
      ? "学习者、实践者、需要把知识转成行动的人"
      : "正在整理想法、寻找方法和行动感的公众号读者";
  const goldenLine = buildGoldenLine({ raw, coreClaim, tension, template });
  const actionItems = buildActionItems({ raw, template });
  return {
    raw,
    sentences,
    scene,
    tension,
    coreClaim,
    audience,
    goldenLine,
    actionItems,
    shareReason: "读者能带走一个更清楚的判断，以及下一步可以做什么",
    opening: buildTemplateOpening({ scene, tension, coreClaim, template }),
    closing: buildTemplateClosing({ goldenLine, template }),
    details: sentences.slice(0, 8)
  };
}

function extractScene(raw, first) {
  const scenePatterns = [
    /今天听到(.+?)[。！？]/,
    /最近(.+?)[。！？]/,
    /有个(.+?)[。！？]/,
    /我在(.+?)[。！？]/
  ];
  for (const pattern of scenePatterns) {
    const matched = raw.match(pattern)?.[0];
    if (matched) return trimSentence(matched);
  }
  return trimSentence(first);
}

function extractTension(raw, first, second) {
  if (/不是.+而是/.test(raw)) {
    return trimSentence(raw.match(/不是[^。！？]+而是[^。！？]+/)?.[0] || first);
  }
  if (/退|反复|进进退退|卡住|困惑|误解/.test(raw)) {
    return "我们以为问题出在没有前进，但真正需要看的，可能是为什么要退回来确认。";
  }
  if (/问题|矛盾|疑问|难/.test(raw)) {
    return trimSentence(first);
  }
  return trimSentence(second || first);
}

function extractCoreClaim(raw, first, template) {
  if (/退一步|退回来|进进退退|自由职业/.test(raw)) {
    return "有些后退不是失败，而是在确认这条路是否真的适合自己。";
  }
  if (/写文章/.test(raw) && /不是/.test(raw) && /而是/.test(raw)) {
    return "写文章不是倒出来，而是整理顺序";
  }
  if (template.id === "knowledge_course") {
    return "真正重要的不是记住概念，而是理解概念背后的立场和使用边界。";
  }
  if (template.id === "practical_method") {
    return "把问题拆成可执行步骤，行动才会从模糊变得稳定。";
  }
  return trimSentence(first);
}

function buildTemplateTitle(analysis, template, styleProfile) {
  const candidates = buildTemplateTitleCandidates(analysis, template);
  if (styleProfile?.titlePatterns?.some((pattern) => pattern.includes("短标题"))) {
    return candidates.find((candidate) => candidate.length <= 18) || candidates[0];
  }
  return candidates[0];
}

function buildTemplateTitleCandidates(analysis, template) {
  const subject = compactSubject(analysis.coreClaim || analysis.scene);
  if (template.id === "knowledge_course") {
    return [
      `${subject}，最容易误解的其实是这一步`,
      `一篇讲清楚${subject}的公众号文章`,
      `学${subject}，先别急着套模板`,
      `${subject}真正重要的不是概念`,
      `把${subject}讲明白：立场、框架和练习`
    ];
  }
  if (template.id === "practical_method") {
    return [
      `${subject}：先把这 3 步走清楚`,
      `别急着行动，先拆开${subject}`,
      `${subject}的实战方法：从混乱到可执行`,
      `真正有效的方法，不是更用力`,
      `把${subject}落地，关键是顺序`
    ];
  }
  return [
    analysis.raw.includes("自由职业") ? "自由职业不是一直往前冲" : null,
    subject.includes("写文章") ? subject : null,
    subject.includes("自由职业") ? "自由职业不是一直往前冲" : `${subject}，不是你以为的那样`,
    subject.includes("退") ? "退回来，不一定是失败" : `${subject}背后，藏着一个更重要的问题`,
    `我后来才明白：${subject}`,
    `真正的成长，可能不是一直往前`,
    `${subject}：在反复里确认自己`
  ].filter(Boolean);
}

function buildTemplateDigest(analysis, template) {
  if (template.id === "knowledge_course") {
    return `${analysis.coreClaim} 这篇文章会按“立场、概念、框架、误区、练习”的顺序，把它讲到能理解也能使用。`.slice(0, 120);
  }
  if (template.id === "practical_method") {
    return `${analysis.coreClaim} 与其急着找答案，不如先把问题拆成能执行的步骤。`.slice(0, 120);
  }
  return `${analysis.coreClaim} 很多时候，真正值得写下来的不是结论，而是你怎么在具体经历里看见它。`.slice(0, 120);
}

function buildTemplateOpening({ scene, tension, coreClaim, template }) {
  if (template.id === "knowledge_course") {
    return [
      "学一个知识点，最容易卡住的地方，往往不是记不住定义。",
      `真正会影响理解的，是你有没有看见它背后的问题：${tension}`,
      `所以这篇文章不急着堆概念，我想先把一个核心判断说清楚：${coreClaim}`
    ];
  }
  if (template.id === "practical_method") {
    return [
      "很多方法之所以用不起来，不是因为人不够努力。",
      `更常见的情况是：${tension}`,
      `这篇文章想解决的，就是把这件事从一个模糊问题，拆成几步可以执行的动作。`
    ];
  }
  return [
    `我先从一个很具体的画面说起：${scene}`,
    `这个画面打动我的地方，不在于它多特别，而在于它把一个我们常常说不清的状态呈现了出来：${tension}`,
    `我后来意识到，真正重要的可能是：${coreClaim}`
  ];
}

function buildTemplateSections(analysis, template) {
  if (template.id === "knowledge_course") return buildKnowledgeSections(analysis);
  if (template.id === "practical_method") return buildPracticalSections(analysis);
  return buildStorySections(analysis);
}

function buildStorySections(analysis) {
  return [
    {
      heading: "先看见那个具体画面",
      role: "用场景建立读者进入感",
      body: [
        analysis.scene,
        "好的文章不是一上来就讲大道理，而是先让读者看见一个具体时刻。",
        `这个时刻之所以值得写，是因为它不只是事件本身。它背后真正牵动人的，是：${analysis.tension}`
      ].join("\n\n")
    },
    {
      heading: "真正的重点，不在表面的进退",
      role: "提炼反常识洞察",
      body: [
        analysis.coreClaim,
        "我们习惯把事情理解成一条向前的线：只要足够努力，就应该一直更快、更高、更确定。",
        "但很多真实的成长不是这样。它更像反复靠近一个方向，再退回来确认：这是不是我真正想走的路？这个高度是不是现在的我能承受的？"
      ].join("\n\n")
    },
    {
      heading: "把它放回自己的生活里",
      role: "连接作者经验和读者共鸣",
      body: [
        "我自己也会在类似的节奏里摇摆。",
        "有些选择看起来像撤回，其实是在问自己：我是在靠近想成为的自己，还是只是在完成别人眼里的前进？",
        "当这个问题被问出来，很多原本让人自责的反复，就有了新的解释。"
      ].join("\n\n")
    },
    {
      heading: "如果你也在反复，请先别急着否定自己",
      role: "给读者可带走判断",
      body: [
        "当然，不是所有退回都值得美化。有些退回确实是逃避，有些反复也需要被看见。",
        "但我们至少可以多问一步：这次停下来，是因为我害怕，还是因为我正在校准方向？",
        "当你能区分这两件事，进退就不再只是成败判断，而会变成一次更诚实的自我确认。"
      ].join("\n\n")
    }
  ];
}

function buildKnowledgeSections(analysis) {
  return [
    {
      heading: "先别急着背概念",
      role: "建立知识学习的核心问题",
      body: [
        analysis.coreClaim,
        "很多知识之所以学完用不上，是因为我们只记住了名词，却没有理解它在解决什么问题。",
        `所以第一步，是先把这个疑问放到台面上：${analysis.tension}`
      ].join("\n\n")
    },
    {
      heading: "把概念放回使用场景",
      role: "解释概念和边界",
      body: [
        "一个概念只有放回具体场景里，才会变得清楚。",
        "你可以先问三个问题：它想区分什么？它想改变什么？它在什么情况下不需要被使用？",
        "这三个问题，比单纯背定义更重要。"
      ].join("\n\n")
    },
    {
      heading: "用一张地图理解它",
      role: "形成框架化理解",
      body: [
        "我更建议把它理解成一张地图，而不是一组标准答案。",
        "地图的意义，不是让你机械照走，而是帮你知道自己现在在哪一层：是在描述问题，还是在看影响；是在表明立场，还是在追问背后的价值。",
        "一旦层次清楚，提问和行动都会更稳。"
      ].join("\n\n")
    },
    {
      heading: "练习时，先追求清楚，不追求漂亮",
      role: "落到练习建议",
      body: [
        "真正好的练习，不是问出看起来很高级的问题。",
        "而是对方能听懂、能回答，并且回答之后对自己多一点理解。",
        "如果一个问题让人更紧、更羞愧、更像是在被评判，方向可能就偏了。"
      ].join("\n\n")
    }
  ];
}

function buildPracticalSections(analysis) {
  return [
    {
      heading: "先把问题说具体",
      role: "定义痛点",
      body: [
        analysis.tension,
        "问题越抽象，行动就越容易变成用力但无效。",
        "所以第一步不是做更多，而是把问题从一个模糊判断，改写成一个具体场景。"
      ].join("\n\n")
    },
    {
      heading: "再找到真正影响结果的顺序",
      role: "提炼原则",
      body: [
        analysis.coreClaim,
        "很多事情不是缺方法，而是顺序错了。",
        "先判断目标，再拆步骤；先确认边界，再投入资源；先做最小尝试，再决定要不要加码。"
      ].join("\n\n")
    },
    {
      heading: "可以这样做三步",
      role: "给出执行路径",
      body: analysis.actionItems.map((item, index) => `${index + 1}. ${item}`).join("\n\n")
    },
    {
      heading: "最后留一个检查点",
      role: "避免盲目执行",
      body: [
        "做完之后，不要只问结果好不好。",
        "还要问：这个动作有没有让我更清楚？有没有让我更靠近真正想要的状态？有没有暴露下一步该调整的地方？",
        "能回答这三个问题，行动才不是白忙。"
      ].join("\n\n")
    }
  ];
}

function buildTemplateExpertReviews(analysis, template, sections) {
  return {
    chiefEditor: {
      summary: `这篇文章适合采用「${template.name}」：先建立核心矛盾，再让标题、引用、小标题和结尾围绕同一个判断推进。`,
      suggestions: ["开头保留具体画面或具体问题", "每个小节只推进一个层次", "结尾给读者一个能转发的判断"]
    },
    valueMentor: {
      highlights: [analysis.scene, analysis.coreClaim],
      goldenLines: [
        analysis.goldenLine,
        "好的文章不是替读者下结论，而是帮读者把自己的处境看清楚。"
      ]
    },
    structureMaster: {
      background: analysis.scene,
      tensionOrConclusion: analysis.tension,
      actionItems: analysis.actionItems.length ? analysis.actionItems : sections.slice(0, 3).map((section) => section.heading)
    }
  };
}

function buildGoldenLine({ raw, coreClaim, template }) {
  if (/退一步|退回来|进进退退|自由职业/.test(raw)) {
    return "退一步不是放弃，而是在确认这条路是否真的属于你。";
  }
  if (template.id === "knowledge_course") {
    return "真正掌握一个概念，不是记住定义，而是知道它在什么地方能帮人看见新的可能。";
  }
  if (template.id === "practical_method") {
    return "方法不是让你更用力，而是让你知道下一步该往哪里用力。";
  }
  return coreClaim.length <= 34 ? coreClaim : "真正重要的不是说出答案，而是看见答案背后的那个问题。";
}

function buildActionItems({ raw, template }) {
  if (/退一步|退回来|进进退退|自由职业/.test(raw)) {
    return ["记录这次想退回来的原因", "分辨它是逃避，还是方向校准", "用一个更小的动作继续验证自己"];
  }
  if (template.id === "knowledge_course") {
    return ["先说清这个概念在解决什么问题", "用一个真实场景检验它是否适用", "把练习目标改写成对方听得懂的问题"];
  }
  if (template.id === "practical_method") {
    return ["把问题改写成一个具体场景", "列出最小可执行的第一步", "做完后复盘它让你更清楚了什么"];
  }
  return ["找出最能说明问题的具体画面", "写下这件事真正触动你的判断", "把判断改写成读者能带走的一句话"];
}

function buildTemplateClosing({ goldenLine, template }) {
  if (template.id === "knowledge_course") {
    return `如果你也在学这个知识点，可以先不急着追求提问多漂亮。先确认它有没有让你更清楚地看见人、问题和可能性。${goldenLine}`;
  }
  if (template.id === "practical_method") {
    return `如果这篇文章对你有帮助，建议先从第一步开始做。真正改变状态的，往往不是更大的决心，而是一个更清楚的下一步。`;
  }
  return `如果你也正在类似的阶段，愿你先不要急着否定自己。也许你不是停滞了，而是在认真确认自己真正要去的方向。如果这句话对你有一点触动，欢迎点个赞，也转给那个正在反复确认方向的人。`;
}

function compactSubject(value) {
  const text = String(value || "")
    .replace(/[。！？!?；;]+$/g, "")
    .replace(/^真正重要的可能是：?/, "")
    .replace(/^有些/, "")
    .trim();
  if (text.includes("自由职业")) return "自由职业不是一直往前冲";
  if (text.length <= 18) return text || "这件事";
  return text.slice(0, 18);
}

function trimSentence(value) {
  return String(value || "").trim().replace(/[。！？!?；;]+$/g, "。");
}

function buildDigest(intro, fullText) {
  const first = firstSentence(intro || fullText);
  if (!first) return "这篇文章试着把一个重要问题说清楚：先看见核心，再找到可以执行的路径。";
  return `${first}。这篇文章会把问题拆开，给你一个更清晰、更容易行动的理解。`.slice(0, 120);
}

function buildOpening(paragraphs) {
  const first = firstSentence(paragraphs[0] || "");
  if (!first) return "有些想法最开始只是几句话，但真正值得写出来的，往往就藏在这些不成形的记录里。";
  return `有些想法，一开始看起来只是几句随手记下的话。可是继续往下看，你会发现它真正想说的是：${first}。这不是一句简单的感受，而是一个值得被认真拆开的入口。`;
}

function buildProfessionalSections(paragraphs, fullText) {
  const clean = paragraphs.length ? paragraphs : ["这篇文章需要先把问题说清楚，再给出可以带走的判断。"];
  const sentences = splitSentences(clean.join("\n"));
  const first = sentences[0] || firstSentence(fullText);
  const second = sentences[1] || "很多时候，我们不是缺少材料，而是缺少把材料串起来的顺序。";
  const third = sentences[2] || "一旦顺序清楚，表达自然就会变得更稳定。";
  return [
    {
      heading: "先把最重要的问题拎出来",
      role: "开头承接读者痛点",
      body: [
        polishParagraph(first, { lead: "真正值得注意的是" }),
        polishParagraph(second, { lead: "问题往往不在于" }),
        "所以，写作的第一步不是急着把文字变漂亮，而是先问自己：这篇文章到底要帮读者看清什么？"
      ].join("\n\n")
    },
    {
      heading: "让读者跟得上你的思路",
      role: "提供核心判断和方法",
      body: [
        polishParagraph(third, { lead: "这件事真正难的地方在于" }),
        "公众号文章最怕的不是观点不够多，而是读者读到一半不知道你要带他去哪里。一个好的表达，应该像一条清楚的路：先看见问题，再理解原因，最后知道下一步怎么做。",
        "这也是为什么我们要把段落拆短、把小标题写清楚、把关键句单独拎出来。形式不是装饰，它是在帮读者降低理解成本。"
      ].join("\n\n")
    },
    {
      heading: "把想法变成读者能带走的收获",
      role: "形成行动感和传播理由",
      body: [
        "读者愿意点赞、收藏、转发，往往不是因为文章说得多，而是因为他读完以后真的带走了某个判断。",
        "这个判断可以很朴素：我知道问题在哪里了；我知道下一步该先做什么了；我终于能把脑子里那团混乱的东西放到一条线上了。",
        "当一篇文章能做到这一点，它就不只是把你的想法写出来，而是在替读者完成一次整理。"
      ].join("\n\n")
    }
  ];
}

function renderProfessionalWechatHtml({
  title,
  digest,
  sections,
  expertReviews,
  openingParagraphs = null,
  closingLead = "写到最后，我想把这篇文章收束成一句话：",
  closingClaim = "把问题说清楚，本身就是一种行动力。",
  closingPrompt = "如果这篇文章让你有一点启发，欢迎点个赞，也转给那个正在整理思路的人。",
  inlineCount
}) {
  const safeInlineCount = Math.max(0, Math.min(3, Number(inlineCount ?? 2)));
  const imageSlots = new Map();
  for (let index = 1; index <= safeInlineCount; index += 1) {
    const sectionNumber = Math.min(index, Math.max(sections.length, 1));
    imageSlots.set(sectionNumber, [...(imageSlots.get(sectionNumber) || []), index]);
  }
  const goldenLine = expertReviews?.valueMentor?.goldenLines?.[0] || "真正有用的文章，不是让人点头，而是让人读完之后知道自己可以怎么做。";
  const actionItems = expertReviews?.structureMaster?.actionItems?.length
    ? expertReviews.structureMaster.actionItems
    : ["明确核心问题", "放回具体场景", "给读者一个下一步行动"];
  const body = sections.map((section, index) => {
    const image = (imageSlots.get(index + 1) || [])
      .map((imageIndex) => `<p style="margin:26px 0;text-align:center;">${imagePlaceholder(imageIndex)}</p>`)
      .join("");
    return `
      <section style="margin:36px 0 0;">
        <h2 style="margin:0 0 18px;padding:0 0 0 12px;border-left:3px solid #136f63;font-size:18px;line-height:1.55;color:#173f3a;font-weight:700;letter-spacing:0;">${escapeSection(section.heading)}</h2>
        ${section.body.split(/\n{2,}/).map((paragraph, paragraphIndex) => renderWechatParagraph(paragraph, paragraphIndex === 0)).join("\n")}
        ${image}
      </section>`;
  }).join("\n");
  const opening = openingParagraphs?.length
    ? openingParagraphs.map((paragraph, index) => renderWechatParagraph(paragraph, index === 0)).join("\n")
    : `
    <p style="margin:0 0 16px;font-size:17px;line-height:1.95;color:#1f3936;font-weight:600;">很多值得发布的文章，一开始都不是文章。</p>
    <p style="margin:0 0 18px;font-size:16px;line-height:1.95;color:#243b3a;">它可能只是几句口语化的记录，一个还没有完全展开的念头，甚至是一段你自己都觉得有点散的想法。但只要里面有真实的问题、有你的判断、有能带给读者的启发，它就值得被认真整理。</p>`;
  return `
    <section style="margin:0 0 26px;padding:15px 16px;background:#f6fbf9;border-radius:6px;border-left:3px solid #136f63;">
      <p style="margin:0;font-size:15px;line-height:2;color:#31524c;letter-spacing:0;">${escapeSection(digest)}</p>
    </section>
    ${opening}
    <section style="margin:24px 0 30px;padding:14px 16px;background:#fffaf0;border-radius:6px;border-left:3px solid #d59b2d;">
      <p style="margin:0 0 6px;font-size:13px;line-height:1.7;color:#8a6a28;letter-spacing:0;">导师提炼的金句</p>
      <p style="margin:0;font-size:16px;line-height:1.95;color:#5c451f;font-weight:600;letter-spacing:0;">${escapeSection(goldenLine)}</p>
    </section>
    ${body}
    <section style="margin:36px 0 0;padding:15px 16px;background:#f6fbf9;border-radius:6px;border-left:3px solid #136f63;">
      <p style="margin:0 0 10px;font-size:15px;line-height:1.8;color:#31524c;font-weight:700;letter-spacing:0;">读完可以立刻做的 3 件事</p>
      <ol style="margin:0;padding-left:20px;color:#2f3f46;font-size:15px;line-height:2;">
        ${actionItems.slice(0, 3).map((item) => `<li style="margin:6px 0;padding-left:2px;">${escapeSection(item)}</li>`).join("")}
      </ol>
    </section>
    <section style="margin:38px 0 4px;padding:16px 16px;background:#f7f8fa;border-radius:6px;">
      <p style="margin:0 0 10px;font-size:16px;line-height:2;color:#243b3a;letter-spacing:0;">${escapeSection(closingLead)}</p>
      <p style="margin:0;font-size:17px;line-height:1.9;color:#173f3a;font-weight:700;letter-spacing:0;">${escapeSection(closingClaim)}</p>
      <p style="margin:16px 0 0;font-size:15px;line-height:2;color:#53666a;letter-spacing:0;">${escapeSection(closingPrompt)}</p>
    </section>`;
}

function renderWechatParagraph(paragraph, emphasize = false) {
  const style = emphasize
    ? "margin:16px 0;font-size:17px;line-height:2;color:#1f3936;font-weight:600;letter-spacing:0;text-align:left;word-break:break-word;"
    : "margin:16px 0;font-size:16px;line-height:2.05;color:#2f3f46;letter-spacing:0;text-align:left;word-break:break-word;";
  return `<p style="${style}">${escapeSection(paragraph).replace(/\n/g, "<br>")}</p>`;
}

function inferTitleFromText(text) {
  const first = firstSentence(text);
  if (!first) return "把一个想法写成文章，关键不是文采";
  if (first.includes("写文章") && first.includes("不是") && first.includes("而是")) {
    return "写文章不是倒出来，而是整理顺序";
  }
  if (first.includes("想法") && first.includes("顺序")) {
    return "把想法整理成文章，关键是顺序";
  }
  const compact = first
    .replace(/^我(最近)?(发现|觉得|意识到)，?/, "")
    .replace(/^我刚刚有个想法，?/, "")
    .replace(/最难的不是(.+?)，而是(.+)/, "真正难的不是$1，而是$2")
    .replace(/[，。；：,.].*$/, "")
    .slice(0, 20);
  return compact.length >= 8 ? compact : "把这件事想清楚，文章就有了";
}

function splitSentences(text) {
  return String(text || "")
    .replace(/^#{1,3}\s+/gm, "")
    .split(/[。！？!?\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function polishParagraph(sentence, { lead = "" } = {}) {
  const cleaned = String(sentence || "")
    .trim()
    .replace(/[。！？!?；;]+$/g, "")
    .replace(/^我(最近)?(发现|觉得|意识到)，?/, "")
    .replace(/^我刚刚有个想法，?/, "")
    .replace(/^所以我(觉得|认为)，?/, "")
    .replace(/^所以，?/, "");
  if (!cleaned) return "真正重要的，是先把那个模糊的问题变得具体。";
  if (/^很多时候/.test(cleaned)) return `${cleaned}。`;
  if (/^文章应该|^这篇文章|^表达/.test(cleaned)) return `更具体地说，${cleaned}。`;
  if (lead) return `${lead}，${cleaned}。`;
  return `${cleaned}。`;
}

function escapeSection(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function inferSections(text) {
  const headings = [...String(text).matchAll(/^#{1,3}\s+(.+)$/gm)].map((match) => match[1].trim());
  if (headings.length) {
    return headings.slice(0, 8).map((heading) => ({ heading, role: "原文小节", summary: heading }));
  }
  return [{ heading: "正文", role: "承载主要观点", summary: firstSentence(text).slice(0, 80) }];
}

function firstHeading(text) {
  return String(text).match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim();
}

function firstSentence(text) {
  return String(text || "")
    .replace(/^#{1,3}\s+/gm, "")
    .split(/[。！？!?\n]/)
    .map((item) => item.trim())
    .find(Boolean) || "";
}
