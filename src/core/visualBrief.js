import { AiClient } from "./aiClient.js";

export async function createVisualBrief(processedArticle, { config = {}, aiClient = new AiClient() } = {}) {
  const fallback = () => heuristicVisualBrief(processedArticle, config);
  const result = await aiClient.json(
    "你是微信公众号视觉编辑。只输出 JSON，不要生成真实图片。",
    JSON.stringify({
      task: "基于文章生成封面和正文插图 brief",
      constraints: [
        "必须先分析文章结构和情绪递进，选择2-4个最需要视觉支撑的段落",
        "封面要有一个具体视觉隐喻，不能只是抽象背景或文字海报",
        "正文插图要分别对应：开头关键画面、核心比喻段落、结尾升华段落",
        "所有图片保持统一风格：cinematic, moody, dark warm tones, quiet emotional lighting",
        "图片提示词必须明确 no text, no logo, no watermark, no words, no letters, no numbers",
        "不要生成标题字、中文字符、UI截图、二维码、品牌标志"
      ],
      expectedJson: {
        theme: "主题",
        mood: "情绪",
        keywords: ["关键词"],
        coverPrompt: "封面图生成提示词",
        inlinePrompts: ["正文插图提示词"],
        forbiddenElements: ["禁止元素"],
        style: "统一视觉风格"
      },
      styleProfile: processedArticle.styleProfile,
      imageConfig: config.image,
      article: {
        title: processedArticle.title,
        digest: processedArticle.digest,
        blueprint: processedArticle.blueprint,
        markdown: processedArticle.markdown.slice(0, 3000)
      }
    }),
    fallback
  );
  return normalizeVisualBrief(result, fallback());
}

function heuristicVisualBrief(article, config) {
  const therapyCourse = specialNarrativeTherapyBrief(article, config);
  if (therapyCourse) return therapyCourse;

  const special = specialBackAndForthCareerBrief(article, config);
  if (special) return special;

  const keywords = [
    article.blueprint.articleType,
    article.blueprint.audience,
    ...article.blueprint.sections.map((section) => section.heading)
  ].filter(Boolean).slice(0, 6);
  const style = article.styleProfile?.visualStyle || config.image?.defaultStyle || "clean modern editorial illustration";
  const inlineCount = Math.max(0, Math.min(3, Number(config.image?.inlineImageCount ?? 2)));
  const visualStyle = `${style}, cinematic editorial photography illustration, moody dark warm tones, quiet warm light, high detail, natural texture, premium magazine composition`;
  const forbidden = "Absolutely no text, no Chinese characters, no letters, no words, no numbers, no handwriting marks, no captions, no signage, no UI labels, no logos, no brand marks, no watermark, no QR code. Every paper, notebook, screen, and sign-like surface must be completely blank.";
  return {
    theme: article.blueprint.coreClaim || article.title,
    mood: "克制、温暖、带一点思考后的松动感",
    keywords,
    coverPrompt: `${visualStyle}. WeChat article cover visual metaphor for the theme: ${article.blueprint.coreClaim || article.title}. Create a concrete editorial scene, not a poster: one symbolic object in foreground, a quiet human-scale environment, warm light from one side, negative space for WeChat crop, emotionally restrained. ${forbidden}`,
    inlinePrompts: Array.from({ length: inlineCount }, (_, index) => {
      const section = article.blueprint.sections[index] || article.blueprint.sections[0];
      return `${visualStyle}. Editorial inline illustration for section "${section?.heading || article.title}". Show one specific metaphorical moment with depth, foreground and background, realistic light, no decorative blobs, no generic business icons. ${forbidden}`;
    }),
    forbiddenElements: ["文字", "中文字符", "二维码", "品牌 logo", "水印", "夸张营销感", "低清晰度", "纯抽象色块"],
    style: visualStyle
  };
}

function specialNarrativeTherapyBrief(article, config) {
  const text = `${article.title}\n${article.digest}\n${article.markdown}`;
  if (!text.includes("叙事疗法") || !text.includes("外化") || !text.includes("解构")) return null;

  const inlineCount = Math.max(0, Math.min(3, Number(config.image?.inlineImageCount ?? 2)));
  const style = article.styleProfile?.visualStyle || config.image?.defaultStyle || "cinematic WeChat editorial visual";
  const visualStyle = `${style}, cinematic editorial photography illustration, moody dark warm tones, quiet therapy training atmosphere, warm side light, realistic but metaphorical, restrained and professional`;
  const forbidden = "Absolutely no text, no Chinese characters, no letters, no words, no numbers, no handwriting marks, no captions, no signage, no UI labels, no logos, no brand marks, no watermark, no QR code. Every notebook, card, screen, blackboard, and paper surface must be completely blank.";
  const inlinePrompts = [
    `${visualStyle}. A quiet counseling training room with two empty chairs facing each other, a soft thread or ribbon placed between them and a small neutral object beside one chair, visual metaphor for separating person and problem, shallow depth of field, no faces, no clinical coldness. ${forbidden}`,
    `${visualStyle}. Abstract yet realistic tabletop scene: blank cards arranged as a four-step vertical map, a second subtle horizontal path crossing it, warm lamp light, small stones marking choices, metaphor for Michael White's stance map and relative influence questions, no diagrams, no written labels. ${forbidden}`,
    `${visualStyle}. A calm window-lit therapy room after class, blank notebooks closed, empty chairs, one warm light path opening toward the door, metaphor for a new alternative story emerging, quiet and hopeful. ${forbidden}`
  ].slice(0, inlineCount);
  return {
    theme: "叙事疗法中的外化与解构，帮助人和问题分开并重建主体性",
    mood: "专业、温暖、克制、让学习者感到清晰和安全",
    keywords: ["叙事疗法", "外化", "解构", "立场地图", "相对影响力", "心理咨询训练"],
    coverPrompt: `${visualStyle}. WeChat article cover for narrative therapy training, a warm quiet counseling room with two empty chairs and a small dark neutral object placed outside the chairs, subtle thread/ribbon separating the person space from the problem object, premium magazine composition, strong mobile crop readability, no poster design. ${forbidden}`,
    inlinePrompts,
    forbiddenElements: ["文字", "中文字符", "二维码", "品牌 logo", "水印", "伪书写", "冷冰冰医疗感", "PPT课件感", "夸张卡通"],
    style: visualStyle
  };
}

function specialBackAndForthCareerBrief(article, config) {
  const text = `${article.title}\n${article.digest}\n${article.markdown}`;
  if (!text.includes("丁丁") || !text.includes("自由职业") || !(text.includes("第五阶") || text.includes("进进退退"))) return null;

  const inlineCount = Math.max(0, Math.min(3, Number(config.image?.inlineImageCount ?? 2)));
  const style = article.styleProfile?.visualStyle || config.image?.defaultStyle || "cinematic WeChat editorial visual";
  const visualStyle = `${style}, cinematic editorial photography illustration, moody dark warm tones, quiet emotional lighting, soft grain, shallow depth of field, restrained and poetic, premium magazine cover`;
  const forbidden = "Absolutely no text, no Chinese characters, no letters, no words, no numbers, no handwriting marks, no captions, no signage, no UI labels, no logos, no brand marks, no watermark, no QR code. Every paper, notebook, screen, and sign-like surface must be completely blank.";
  const inlinePrompts = [
    `${visualStyle}. A quiet kindergarten stair-jump installation at dusk, low wooden steps descending, a small child silhouette has stepped back from a higher step to a middle step, teacher's notebook blurred in the foreground, warm side light, emotional but realistic, visual metaphor for growth by retreating and confirming. ${forbidden}`,
    `${visualStyle}. Night workspace of an independent freelancer, plain unbranded matte laptop closed with no emblem, blank paper cards arranged like small steps moving forward then back, one warm desk lamp, reflective mood, not corporate, not stock photo. All cards and notebook pages are pure blank paper without any marks. ${forbidden}`,
    `${visualStyle}. A lone adult figure standing between several softly lit stepping stones, some stones ahead and some behind, warm light opening in the distance, sense of self-confirmation rather than victory, calm cinematic composition. ${forbidden}`
  ].slice(0, inlineCount);
  return {
    theme: "自由职业里的进进退退，是在确认自己的方向和身份",
    mood: "克制、温暖、带一点自我松绑后的安定",
    keywords: ["丁丁", "第五阶", "进进退退", "身份确认", "自由职业", "职业转型"],
    coverPrompt: `${visualStyle}. WeChat article cover, a child-sized stair-jump structure in a quiet kindergarten, one small child seen from behind standing on the fifth step while higher steps are visible ahead, warm light across dark wooden floor, subtle adult notebook in foreground, metaphor for retreat as self-confirmation, strong readable composition for mobile cover crop, no poster design. ${forbidden}`,
    inlinePrompts,
    forbiddenElements: ["文字", "中文字符", "二维码", "品牌 logo", "水印", "夸张儿童卡通", "企业商务插画", "纯抽象色块"],
    style: visualStyle
  };
}

function normalizeVisualBrief(result, fallback) {
  const style = result?.style || fallback.style;
  const forbidden = "Absolutely no text, no Chinese characters, no letters, no words, no numbers, no handwriting marks, no captions, no signage, no logos, no brand marks, no watermark, no QR code. Every paper, notebook, screen, and sign-like surface must be completely blank.";
  const coverPrompt = strengthenPrompt(result?.coverPrompt || fallback.coverPrompt, style, forbidden);
  const inlinePrompts = Array.isArray(result?.inlinePrompts) && result.inlinePrompts.length
    ? result.inlinePrompts
    : fallback.inlinePrompts;
  return {
    theme: result?.theme || fallback.theme,
    mood: result?.mood || fallback.mood,
    keywords: Array.isArray(result?.keywords) && result.keywords.length ? result.keywords : fallback.keywords,
    coverPrompt,
    inlinePrompts: inlinePrompts.map((prompt) => strengthenPrompt(prompt, style, forbidden)),
    forbiddenElements: Array.isArray(result?.forbiddenElements) && result.forbiddenElements.length ? result.forbiddenElements : fallback.forbiddenElements,
    style
  };
}

function strengthenPrompt(prompt, style, forbidden) {
  const value = String(prompt || "").trim();
  const hasNoText = /no text|no words|无文字/i.test(value);
  const withStyle = value.includes(style) ? value : `${style}. ${value}`;
  return hasNoText ? withStyle : `${withStyle} ${forbidden}`;
}
