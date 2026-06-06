export function safeParseGetNoteJson(text) {
  const safe = String(text || "").replace(/"(id|note_id|parent_id|follow_id|live_id)"\s*:\s*(\d+)/g, '"$1":"$2"');
  return JSON.parse(safe);
}

export function normalizeNoteSummary(note = {}) {
  return {
    noteId: stringId(note.note_id || note.noteId || note.id),
    title: note.title || "无标题",
    content: note.content || "",
    noteType: note.note_type || note.noteType || "",
    source: note.source || "",
    tags: normalizeNamedItems(note.tags),
    topics: normalizeNamedItems(note.topics),
    isChildNote: Boolean(note.is_child_note || note.isChildNote),
    childrenCount: Number(note.children_count || note.childrenCount || 0),
    parentId: stringId(note.parent_id || note.parentId),
    createdAt: note.created_at || note.createdAt || "",
    updatedAt: note.updated_at || note.updatedAt || note.edit_time || ""
  };
}

export function normalizeNoteDetail(payload = {}) {
  const note = payload.note || payload;
  const summary = normalizeNoteSummary(note);
  const audio = note.audio || null;
  const webPage = note.web_page || note.webPage || null;
  return {
    ...summary,
    content: note.content || "",
    entryType: note.entry_type || "",
    childrenIds: Array.isArray(note.children_ids || note.childrenIds) ? (note.children_ids || note.childrenIds).map(stringId).filter(Boolean) : [],
    attachments: normalizeAttachments(note.attachments),
    audio: audio ? {
      playUrl: audio.play_url || "",
      duration: Number(audio.duration || 0),
      transcript: audio.transcript || "",
      original: audio.original || ""
    } : null,
    webPage: webPage ? {
      url: webPage.url || "",
      domain: webPage.domain || "",
      excerpt: webPage.excerpt || "",
      favicon: webPage.favicon || "",
      content: webPage.content || ""
    } : null,
    shareId: note.share_id || "",
    version: Number(note.version || 0),
    raw: note
  };
}

export function normalizeRecallResult(item = {}) {
  return {
    noteId: stringId(item.note_id),
    noteType: item.note_type || "",
    title: item.title || "无标题",
    content: item.content || "",
    createdAt: item.created_at || "",
    pageNo: item.page_no || null
  };
}

export function extractNoteBody(note = {}) {
  const parts = [];
  if (note.title) parts.push(`# ${note.title}`);
  if (note.content) parts.push(note.content);
  if (note.audio?.transcript) parts.push(`## 音频转写\n\n${note.audio.transcript}`);
  if (note.audio?.original && note.audio.original !== note.audio.transcript) parts.push(`## 音频原文\n\n${note.audio.original}`);
  if (note.webPage?.excerpt) parts.push(`## 链接摘要\n\n${note.webPage.excerpt}`);
  if (note.webPage?.content) parts.push(`## 链接原文\n\n${note.webPage.content}`);
  return parts.filter(Boolean).join("\n\n").trim();
}

export function buildGetNoteSourcePack(notes = [], {
  title = ""
} = {}) {
  const normalized = notes.map((note) => note.noteId || note.raw ? note : normalizeNoteDetail(note));
  const sourceIds = normalized.map((note) => note.noteId).filter(Boolean);
  const noteTitles = normalized.map((note) => note.title).filter(Boolean);
  const allTags = unique(normalized.flatMap((note) => note.tags || []));
  const allTopics = unique(normalized.flatMap((note) => note.topics || []));
  const rawText = normalized.map((note, index) => [
    `## 素材 ${index + 1}：${note.title || note.noteId}`,
    `来源：Get笔记 ${note.noteId}`,
    note.tags?.length ? `标签：${note.tags.join("、")}` : "",
    extractNoteBody(note)
  ].filter(Boolean).join("\n\n")).join("\n\n---\n\n");
  return {
    sourceType: "getnote",
    sourceIds,
    title: title || noteTitles[0] || "Get笔记文章素材",
    rawText,
    metadata: {
      source: "getnote",
      noteIds: sourceIds,
      noteTitles,
      noteTypes: normalized.map((note) => note.noteType).filter(Boolean),
      tags: allTags,
      topics: allTopics,
      createdAt: normalized.map((note) => note.createdAt).filter(Boolean).sort()[0] || "",
      updatedAt: normalized.map((note) => note.updatedAt).filter(Boolean).sort().at(-1) || ""
    },
    notes: normalized.map((note) => ({
      noteId: note.noteId,
      title: note.title,
      noteType: note.noteType,
      tags: note.tags,
      topics: note.topics,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt
    }))
  };
}

function normalizeNamedItems(items) {
  return Array.isArray(items) ? items.map((item) => item?.name || item).map(String).filter(Boolean) : [];
}

function normalizeAttachments(items) {
  return Array.isArray(items) ? items.map((item) => ({
    type: item.type || "",
    url: item.url || "",
    originalUrl: item.original_url || "",
    title: item.title || "",
    size: Number(item.size || 0),
    duration: Number(item.duration || 0)
  })) : [];
}

function stringId(value) {
  if (value === undefined || value === null || value === 0 || value === "0") return "";
  return String(value);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
