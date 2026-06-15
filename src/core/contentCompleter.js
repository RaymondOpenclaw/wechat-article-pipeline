import { AiClient } from "./aiClient.js";

export async function completeArticleInformation(input, {
  styleProfile = null,
  config = {},
  aiClient = new AiClient()
} = {}) {
  const fallback = () => heuristicContentCompletion(input, styleProfile, config);
  const result = await aiClient.json(
    "你是一位公众号内容策划编辑。只输出 JSON。你的任务是在正式成稿前补全文章信息结构：识别缺口、补足必要背景、澄清概念、提出可写角度，但不得编造用户没有提供的经历、数据、案例和结论。",
    JSON.stringify({
      task: "成稿前内容完整度补全",
      principles: [
        "先判断原文真正要表达的主旨，再判断读者理解它还缺什么信息。",
        "补全的是文章完整度：背景、概念定义、逻辑桥梁、读者疑问、例子方向、边界提醒和建议结构。",
        "不得替换作者立场，不得把原文没有的具体经历、人物、数据、事实写成已发生。",
        "可以补充通识性解释和概念背景，但必须标注为可安全补充，不把推断写成事实。",
        "如果关键事实缺失，列为 needsUserInput，不要自行捏造。",
        "输出给后续写手使用，因此要具体、可操作、可审计。"
      ],
      expectedJson: {
        coreClaim: "原文核心观点",
        intendedReaders: ["目标读者1", "目标读者2"],
        contentType: "故事洞察 | 知识精讲 | 实战方法 | 观点评论",
        completenessScore: 0,
        missingInfo: [
          {
            area: "背景 | 概念 | 逻辑 | 案例 | 方法 | 风险",
            gap: "缺什么",
            whyItMatters: "为什么影响文章完整度",
            howToFill: "后续成稿如何补"
          }
        ],
        safeSupplements: [
          {
            type: "概念澄清 | 背景补充 | 读者疑问 | 结构桥梁 | 例子方向",
            content: "可补充内容",
            usage: "建议放在哪一段或如何使用"
          }
        ],
        needsUserInput: ["需要作者补充确认的问题"],
        factualBoundaries: ["不能编造或必须谨慎处理的边界"],
        suggestedOutline: [
          { heading: "建议小标题", purpose: "这一节解决什么", keyPoints: ["要点1", "要点2"] }
        ],
        writingFocus: "后续成稿最该抓住的重点",
        completionPrompt: "给成稿写手的一段补全指令"
      },
      metadata: input.metadata,
      styleProfile,
      articleTemplate: config.articleTemplate,
      rawText: input.rawText
    }),
    fallback
  );
  return normalizeContentCompletion(result, fallback());
}

export function heuristicContentCompletion(input, _styleProfile = null, config = {}) {
  const text = String(input?.rawText || "");
  const contentType = inferContentType(text, config);
  const coreClaim = inferCoreClaim(text);
  const missingInfo = [];
  const safeSupplements = [];
  const needsUserInput = [];
  const factualBoundaries = [
    "不能编造作者没有提供的个人经历、课堂细节、人物评价或数据。",
    "如果引用理论、人物或课程内容，必须使用原文已有信息或以通识解释方式呈现。",
    "补充内容只能服务原观点，不能替换作者立场。"
  ];

  if (text.length < 600) {
    missingInfo.push({
      area: "背景",
      gap: "原文素材较短，读者可能不知道这个想法从哪里来、为什么重要。",
      whyItMatters: "缺少背景会让文章像随想，难以形成完整公众号文章。",
      howToFill: "开头补足触发场景，中段补充概念解释，结尾落到读者可带走的判断。"
    });
    needsUserInput.push("如果有具体事件、课程来源或观察对象，可以补充 1-2 个真实细节增强可信度。");
  }

  if (isCareerMobilityDraft(text)) {
    safeSupplements.push(
      {
        type: "结构桥梁",
        content: "用岗位、项目、战略三种流动解释大厂稳定感下降，再把解决方案落到可迁移能力。",
        usage: "作为全文论证主轴，避免写成泛化的裁员焦虑。"
      },
      {
        type: "边界提醒",
        content: "大厂仍有训练价值，文章批评的是对平台稳定性的神化，而不是否定大厂经历。",
        usage: "放在提出解决方案前，保持观点平衡。"
      }
    );
  } else if (isGroupProcessDraft(text)) {
    safeSupplements.push(
      {
        type: "结构桥梁",
        content: "把全文统一到一个核心区分：课程主要增加知识与技能，团体则通过真实关系互动触及才干、自我和自动化关系模式。",
        usage: "作为开头与各节之间的主轴，避免文章变成团体功能清单。"
      },
      {
        type: "读者疑问",
        content: "读者最关心的是团体如何工作、能否解决具体问题、适合谁以及哪些人暂不适合。",
        usage: "按原文六个问题递进回答，并保留创伤经历等参与边界。"
      }
    );
  } else if (/叙事疗法|外化|解构|立场地图|怀特/.test(text)) {
    safeSupplements.push(
      {
        type: "概念澄清",
        content: "外化的核心不是推卸责任，而是把人与问题分开，让来访者重新看见自己与问题的关系。",
        usage: "放在文章前 1/3，作为读者理解全文的概念地基。"
      },
      {
        type: "结构桥梁",
        content: "解构和外化可以写成一体两面：外化帮助问题从人身上分离，解构帮助理所当然的标签松动。",
        usage: "用于连接概念解释与怀特地图，避免正文变成知识点堆叠。"
      },
      {
        type: "读者疑问",
        content: "读者容易问：把人和问题分开，会不会让人逃避责任？文章需要正面回应。",
        usage: "放在后半部分，提升文章完整度和说服力。"
      }
    );
    missingInfo.push({
      area: "方法",
      gap: "知识点很多，但需要给读者一条清晰的学习路径。",
      whyItMatters: "公众号读者在手机上阅读时，需要先理解核心立场，再进入地图和练习要点。",
      howToFill: "按“为什么分开人和问题 -> 解构/外化关系 -> 立场地图 -> 相对影响力 -> 练习提醒”的顺序组织。"
    });
  } else if (isSettlingPaceDraft(text)) {
    safeSupplements.push(
      {
        type: "结构桥梁",
        content: "把“找不到合适工作”和“没有进步也算进展”统一到一个主题：人需要时间安顿自己，停顿不一定是失败。",
        usage: "作为全文主轴，连接采购求职、高考进展和作者自己的工作经验。"
      },
      {
        type: "读者疑问",
        content: "读者可能会问：安顿自己会不会变成逃避？文章需要给出边界：不是无限躺平，而是留出消化和恢复的空间。",
        usage: "放在后半部分，帮助读者把安顿变成可执行的生活安排。"
      }
    );
  } else if (/自由职业|职业|自媒体|成长|进退|身份/.test(text)) {
    safeSupplements.push(
      {
        type: "结构桥梁",
        content: "把“进进退退”解释成自我确认，而不是失败或拖延。",
        usage: "作为全文主轴，连接故事、个人经验和读者启发。"
      },
      {
        type: "读者疑问",
        content: "读者可能会问：退回来到底是在逃避，还是在确认？文章需要给出判断标准。",
        usage: "放在中后段，帮助读者把洞察转成自我观察。"
      }
    );
  } else {
    safeSupplements.push({
      type: "结构桥梁",
      content: "先把原文里的具体材料讲清楚，再抽出一个核心判断，最后给读者一个可带走的行动或辨别方法。",
      usage: "用于重排文章结构，避免直接进入抽象观点。"
    });
  }

  const suggestedOutline = buildSuggestedOutline(text, contentType);
  const completenessScore = Math.max(45, Math.min(88, 90 - missingInfo.length * 12 - needsUserInput.length * 6));
  return {
    coreClaim,
    intendedReaders: inferReaders(text),
    contentType,
    completenessScore,
    missingInfo,
    safeSupplements,
    needsUserInput,
    factualBoundaries,
    suggestedOutline,
    writingFocus: suggestedOutline[0]?.purpose || "先补齐读者理解所需的信息，再进行公众号化表达。",
    completionPrompt: [
      "正式成稿前请先完成信息补全：",
      `1. 核心观点保持为：${coreClaim}`,
      "2. 优先使用 safeSupplements 中的概念澄清、背景补充和结构桥梁。",
      "3. missingInfo 中标出的缺口要在正文结构里被回应。",
      "4. needsUserInput 只能作为提醒，不得编造成事实。",
      "5. 按 suggestedOutline 写作，再叠加作者风格和公众号手机排版。"
    ].join("\n")
  };
}

function normalizeContentCompletion(result, fallback) {
  return {
    coreClaim: stringOr(result?.coreClaim, fallback.coreClaim),
    intendedReaders: arrayOr(result?.intendedReaders, fallback.intendedReaders),
    contentType: stringOr(result?.contentType, fallback.contentType),
    completenessScore: score(result?.completenessScore, fallback.completenessScore),
    missingInfo: normalizeGapItems(result?.missingInfo, fallback.missingInfo),
    safeSupplements: normalizeSupplementItems(result?.safeSupplements, fallback.safeSupplements),
    needsUserInput: arrayOr(result?.needsUserInput, fallback.needsUserInput),
    factualBoundaries: arrayOr(result?.factualBoundaries, fallback.factualBoundaries),
    suggestedOutline: normalizeOutline(result?.suggestedOutline, fallback.suggestedOutline),
    writingFocus: stringOr(result?.writingFocus, fallback.writingFocus),
    completionPrompt: stringOr(result?.completionPrompt, fallback.completionPrompt),
    completedAt: new Date().toISOString()
  };
}

function buildSuggestedOutline(text, contentType) {
  if (isCareerMobilityDraft(text)) {
    return [
      { heading: "大厂人的聊天变了", purpose: "用真实问题呈现稳定感变化", keyPoints: ["安全感下降", "职业流动时代"] },
      { heading: "岗位、项目和战略的三种流动", purpose: "解释不确定性的结构来源", keyPoints: ["任务定义人", "战场消失", "资源重配"] },
      { heading: "大厂仍值得去，但不能被神化", purpose: "平衡评价大厂价值", keyPoints: ["职业训练", "平台不是保险"] },
      { heading: "把内部经验翻译成可迁移能力", purpose: "给出个人应对方式", keyPoints: ["市场通用能力", "职业资产"] }
    ];
  }
  if (isGroupProcessDraft(text)) {
    return [
      { heading: "为什么学了很多，还是用不出来", purpose: "用读者痛点引出团体与课程的区别", keyPoints: ["知识、技能、才干", "自我层面的卡点"] },
      { heading: "助人者最容易忽略的第三种能力", purpose: "说明自我素养的重要性", keyPoints: ["专业技能", "商业技能", "自我素养"] },
      { heading: "无结构团体如何让真实模式浮现", purpose: "解释团体工作机制", keyPoints: ["真实社会缩影", "此时此地反馈", "矫正性情绪体验"] },
      { heading: "具体问题如何在团体里被突破", purpose: "回应收费、客户和变现等问题", keyPoints: ["问题互动方式", "关系反馈", "重新选择"] },
      { heading: "谁适合参加，谁暂时不适合", purpose: "明确参与对象和安全边界", keyPoints: ["三类适合人群", "重大创伤", "开放意愿"] }
    ];
  }
  if (/叙事疗法|外化|解构|立场地图|怀特/.test(text)) {
    return [
      { heading: "先把“人”和“问题”分开", purpose: "建立外化的核心立场", keyPoints: ["人不是问题", "外化降低标签对身份的黏连"] },
      { heading: "解构不是挖痛苦，而是拆掉理所当然", purpose: "解释解构与外化的关系", keyPoints: ["社会建构", "独特经验", "支线故事"] },
      { heading: "怀特的立场地图怎么问", purpose: "给出纵向提问框架", keyPoints: ["问题描述", "影响地图", "声明立场", "论证评估"] },
      { heading: "再反过来问：人如何影响问题", purpose: "补全相对影响力提问", keyPoints: ["自身应对", "关系资源", "意义衔接"] },
      { heading: "练习时别生硬套模板", purpose: "落到学习者的练习提醒", keyPoints: ["问题要听得懂", "支线故事出现即可转向"] }
    ];
  }
  if (/自由职业|职业|自媒体|成长|进退|身份/.test(text)) {
    if (isSettlingPaceDraft(text)) {
      return [
        { heading: "两个看起来无关的事情", purpose: "用采购求职和高考进展打开文章", keyPoints: ["找不到合适工作", "没有进步也是进展"] },
        { heading: "停下来，可能是在安顿自己", purpose: "提炼核心洞察", keyPoints: ["不是不努力", "内心需要消化"] },
        { heading: "这个时代最缺的是缓一缓的空间", purpose: "分析社会节奏和绩效压力", keyPoints: ["工作太卷", "不允许停滞"] },
        { heading: "给自己留一点不被追赶的时间", purpose: "给读者可执行建议", keyPoints: ["通勤放空", "少用刷剧填满", "允许消化"] }
      ];
    }
    return [
      { heading: "那个孩子为什么退回第五阶", purpose: "用具体故事打开文章", keyPoints: ["进两步退三步", "不是线性成长"] },
      { heading: "退回来，也是在确认自己", purpose: "提炼核心洞察", keyPoints: ["身份确认", "自我判断"] },
      { heading: "自由职业也会这样试探", purpose: "连接作者个人经验", keyPoints: ["尝试", "暂停", "重新定位"] },
      { heading: "怎么判断退是逃避还是确认", purpose: "给读者可带走的方法", keyPoints: ["退后是否更清楚", "是否回到重要任务"] }
    ];
  }
  return [
    { heading: "先把具体材料讲清楚", purpose: "让读者进入文章", keyPoints: ["场景", "问题", "触发点"] },
    { heading: "再提炼真正的问题", purpose: "建立文章主旨", keyPoints: ["核心矛盾", "关键判断"] },
    { heading: "给读者一个可带走的判断", purpose: "提高完整度和转发价值", keyPoints: ["方法", "提醒", "行动"] }
  ];
}

function inferContentType(text, config) {
  if (config.articleTemplate?.selectedId && config.articleTemplate.selectedId !== "auto") return config.articleTemplate.selectedId;
  if (/课程|知识精讲|叙事疗法|解构|外化|地图|练习/.test(text)) return "知识精讲";
  if (/步骤|方法|行动|计划|Action Items/i.test(text)) return "实战方法";
  if (/今天听到|我发现|自由职业|成长|经历/.test(text)) return "故事洞察";
  return "观点文章";
}

function inferReaders(text) {
  if (isCareerMobilityDraft(text)) return ["大厂从业者", "职业转型者", "关注长期职业发展的读者"];
  if (isGroupProcessDraft(text)) return ["心理咨询师与教练", "助人行业从业者", "有人际困扰或想学习团体带领的人"];
  if (/叙事疗法|心理咨询|来访|咨询/.test(text)) return ["心理咨询学习者", "叙事疗法练习者", "心理咨询技能培训读者"];
  if (isSettlingPaceDraft(text)) return ["职场压力中的读者", "刚经历停顿或调整的人", "想重新安顿自己的普通人"];
  if (/自由职业|职业|自媒体/.test(text)) return ["自由职业探索者", "职业转型中的读者", "正在寻找自我定位的人"];
  return ["对主题感兴趣的公众号读者", "希望获得清晰判断和行动感的人"];
}

function inferCoreClaim(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (isCareerMobilityDraft(normalized)) {
    return "当岗位、项目和公司战略都在加速流动，职业稳定感需要从依赖平台转向建设可迁移能力。";
  }
  if (isGroupProcessDraft(normalized)) {
    return "团体不是再教一套知识或技术，而是在真实关系互动中，让人看见并松动那些阻碍知识和技能发挥的自我模式。";
  }
  if (/叙事疗法|外化|解构/.test(normalized)) {
    return "外化和解构的关键，是把人与问题分开，让来访者重新看见立场、价值和选择空间。";
  }
  if (isSettlingPaceDraft(normalized)) {
    return "人不是机器，很多停顿和后退不是失败，而是在给自己留出消化、恢复和重新出发的时间。";
  }
  if (/自由职业|进退|身份/.test(normalized)) {
    return "成长不一定是线性向前，进进退退也可能是在确认自己真正要走的方向。";
  }
  return firstSentence(normalized) || "把原始想法整理成读者能够理解并带走收获的完整文章。";
}

function isSettlingPaceDraft(text) {
  return /安顿|休息|放空|刷剧|高考|采购|辞职|韧性|绩效|卷|停滞/.test(String(text || ""));
}

function isGroupProcessDraft(text) {
  const value = String(text || "");
  return /无结构的?团体/.test(value)
    && /矫正性情绪体验/.test(value)
    && /问题.*关系中产生/.test(value);
}

function isCareerMobilityDraft(text) {
  const value = String(text || "");
  return /大厂/.test(value)
    && /岗位|项目/.test(value)
    && /可迁移能力|职业资产/.test(value)
    && /战略|组织/.test(value);
}

function normalizeGapItems(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  return source.map((item) => ({
    area: stringOr(item?.area, "完整度"),
    gap: stringOr(item?.gap, ""),
    whyItMatters: stringOr(item?.whyItMatters, ""),
    howToFill: stringOr(item?.howToFill, "")
  })).filter((item) => item.gap || item.howToFill);
}

function normalizeSupplementItems(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  return source.map((item) => ({
    type: stringOr(item?.type, "补充"),
    content: stringOr(item?.content, ""),
    usage: stringOr(item?.usage, "")
  })).filter((item) => item.content || item.usage);
}

function normalizeOutline(value, fallback) {
  const source = Array.isArray(value) && value.length ? value : fallback;
  return source.map((item) => ({
    heading: stringOr(item?.heading, "小节"),
    purpose: stringOr(item?.purpose, ""),
    keyPoints: arrayOr(item?.keyPoints, [])
  })).filter((item) => item.heading || item.purpose);
}

function arrayOr(value, fallback) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : fallback;
}

function stringOr(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function score(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function firstSentence(text) {
  return String(text || "").split(/[。！？!?]/).map((item) => item.trim()).find(Boolean) || "";
}
