---
name: wechat-draft-publisher
description: Use this skill to turn user-provided Chinese articles into WeChat Official Account draft-ready content, learn the user's writing style from historical WeChat article links, generate cover and inline image briefs/assets, preview the result, and upload only after explicit confirmation to the WeChat draft box through the official API.
---

# WeChat Draft Publisher

Use this skill when the user wants to prepare a WeChat Official Account article draft from their own article, learn or apply their historical writing style, generate matching article images, and upload the confirmed result to the official account draft box.

## Workflow

1. Confirm the repo contains the publisher program and run from its project root.
2. Load `.env` credentials for the OpenAI-compatible API and WeChat Official Account API.
3. If the user provides historical article links, run:

```bash
wechat-draft profile import-links links.txt
```

4. If the user adds local historical articles over time, place them in `profiles/default/inbox/` and run:

```bash
wechat-draft profile refresh
```

5. For a new article, first generate a preview:

```bash
wechat-draft preview article.md
```

6. Review the generated title, digest, HTML, change log, risk notes, cover image, and inline images with the user.
7. Upload only after explicit confirmation:

```bash
wechat-draft create article.md --confirm
```

## Editing Rules

- Write like a professional WeChat Official Account writer: strong title, hook, comfortable reading rhythm, clear takeaways, and tasteful like/share/comment guidance.
- Use the expert panel by default: chief editor for publishable prose, value mentor for highlights and golden lines, and structure master for background, tension/conclusion, and 3 action items.
- Preserve the user's facts and stance; do not fabricate unsupported cases or data.
- Use historical style only as a style constraint; do not copy sentences from historical articles.
- Generate one cover image and one to three inline images by default.
- Prefer `skill/agnes-image-gen` for real API image generation; fall back only when unavailable.
- If historical WeChat links cannot be fetched, ask the user to paste article text or provide saved HTML.
- Never upload to WeChat without explicit user confirmation.

## Useful Commands

```bash
wechat-draft profile inspect
wechat-draft profile inbox
wechat-draft validate-wechat
npm start
```

## Expected Inputs

- `.md`, `.txt`, `.docx`, or pasted article text.
- Optional historical WeChat article links, one per line.
- `.env` with `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `TEXT_MODEL`, `IMAGE_MODEL`, `WECHAT_APP_ID`, and `WECHAT_APP_SECRET`.
