# 微信公众号文章草稿自动发布工具

这个项目用于把用户提供的文章整理成适合微信公众号阅读的草稿，学习历史公众号文章中的个人写作特征，生成封面和正文配图，并在用户确认后通过微信公众号官方 API 上传到草稿箱。

## 功能模块

- 公众号化成稿：按专业微信公众号写手方式生成标题、开头、正文节奏、重点句、结尾互动和微信排版 HTML。
- 专家组打磨：资深主编、价值导师、信息提炼大师分别负责可发布性、闪光点/金句、结构与 Action Items。
- 个人风格库：从公众号历史文章链接抽取标题结构、开头方式、段落节奏、高频表达、论证方式和视觉气质。
- 长期风格沉淀：历史文章会追加保存到 `profiles/default/raw-history.json`，粘贴的文章会落到 `profiles/default/inbox/`。
- 配图生成：生成 1 张封面图和 1-3 张正文插图；未配置图片模型时生成本地 PNG 占位图用于预览。
- 正文 ASCII 插画：成稿后使用 `skill/illustration` 在合适段落插入紧凑 ASCII sketch，帮助读者理解结构、关系和步骤。
- Agnes 图片生成：优先调用 `skill/agnes-image-gen` 的 Agnes AI 图片模型；不可用时回退本地插画。
- Get笔记内容来源：可把 Get笔记凭据保存到项目密文库，后续从笔记搜索、详情和素材包进入文章工作流，不依赖 OpenClaw 运行时。
- 草稿上传：官方 API 获取 `access_token`，上传封面永久素材、正文图片，并创建草稿箱草稿。
- 双入口：CLI 适合批处理和 skill 封装，Web 台适合人工预览和确认。

## 快速开始

```bash
cp .env.example .env
npm test
npm start
```

Web 台默认运行在：

```text
http://127.0.0.1:4173
```

`.env` 需要配置：

```bash
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
TEXT_MODEL=gpt-4.1-mini
IMAGE_MODEL=gpt-image-1
AGNES_API_KEY=
WECHAT_APP_ID=
WECHAT_APP_SECRET=
```

配图优先使用 `agnes-image-gen`。需要 `python3` 和 `AGNES_API_KEY`；没有 API key 或生成失败时，系统会自动回退到本地插画，不会阻塞文章预览。

## CLI

```bash
node src/cli/index.js profile import-links links.txt
node src/cli/index.js profile import-files profiles/default/inbox
node src/cli/index.js profile refresh
node src/cli/index.js profile inbox
node src/cli/index.js profile inspect
node src/cli/index.js getnote status
node src/cli/index.js getnote list
node src/cli/index.js getnote search "叙事疗法 外化" --top-k 3
node src/cli/index.js getnote create "叙事疗法 外化" --top-k 3
node src/cli/index.js preview articles/demo.md
node src/cli/index.js create articles/demo.md --confirm
node src/cli/index.js validate-wechat
npm run verify-getnote
```

上传命令必须显式带 `--confirm`，否则不会调用微信草稿接口。

默认生成强度为 `professional_wechat`：目标是按你的风格写成读者看得舒服、有收获、愿意点赞转发的公众号文章。
Web 台默认启用 3 位专家，也可以在生成预览前取消某位专家。

## 长期保存你的写作风格

风格库默认保存在：

```text
profiles/default/style-profile.json
profiles/default/raw-history.json
profiles/default/inbox/
```

后续你可以把自己的历史文章 `.md`、`.txt`、`.docx` 或 `.html` 放进 `profiles/default/inbox/`，然后运行：

```bash
node src/cli/index.js profile refresh
```

Web 台也支持直接粘贴历史文章正文，系统会保存成 inbox 里的 Markdown 文件并重新生成风格库。

这些个人文章和生成的风格 JSON 默认被 `.gitignore` 忽略，不会误提交到分享出去的项目里。

## Get笔记独立连接器

Get笔记凭据应保存到项目密文库 `data/secure/secrets.enc.json`，不要写入 `publisher.config.json` 或提交到 git。

独立性验证：

```bash
npm run verify-getnote
```

该命令只从项目 `secureVault` 读取 Get笔记凭据，直接调用 `https://openapi.biji.com`，不会依赖 OpenClaw、ClawHub 或 Codex 本地 skill。输出只包含状态和数量，不展示笔记正文。

常用命令：

```bash
node src/cli/index.js getnote status
node src/cli/index.js getnote list
node src/cli/index.js getnote search "关键词" --top-k 3
node src/cli/index.js getnote detail <note_id>
node src/cli/index.js getnote create <note_id...|关键词> --top-k 3
```

`getnote list/search` 默认只展示标题、类型、标签和短片段；`detail/create` 才会读取正文。`getnote create` 会把笔记转换成文章素材包并生成预览归档，不会上传公众号草稿。

## 文章输入

支持 `.md`、`.txt`、`.docx`、`.html`。Markdown frontmatter 示例：

```markdown
---
title: 文章标题
author: 作者名
digest: 摘要
cover_prompt: 封面提示词
---

正文内容
```

## Skill 化

`skill/` 目录包含可迁移的 `SKILL.md` 和 `agents/openai.yaml`。后续分享时，把核心程序作为 skill 的脚本依赖或项目模板，保留“预览先行、确认后上传”的安全规则。
