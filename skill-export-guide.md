# 公众号文章流水线 - 导出与使用指引

## 当前Skill位置

```
~/.workbuddy/skills/wechat-article-pipeline/SKILL.md
```

## 导出方式

### 方式一：直接复制文件夹（推荐）

在你的机器上：
```bash
cp -r ~/.workbuddy/skills/wechat-article-pipeline \
  /path/to/share/wechat-article-pipeline
```

对方收到后，放到他自己的目录：
```bash
mkdir -p ~/.workbuddy/skills
cp -r /path/to/share/wechat-article-pipeline ~/.workbuddy/skills/
```

然后重启 WorkBuddy 或让助手重新加载技能即可。

### 方式二：手动创建（如果复制不方便）

让对方手动创建文件：
```bash
mkdir -p ~/.workbuddy/skills/wechat-article-pipeline
touch ~/.workbuddy/skills/wechat-article-pipeline/SKILL.md
```

然后把 SKILL.md 的内容复制进去（内容附在本文末尾）。

---

## 对方使用前必须配置的事

### 1. 微信公众平台账号

对方必须有自己的**微信公众号（订阅号/服务号）**，并且：

- 完成微信认证（个人订阅号也可）
- 开通开发者权限

### 2. 获取 AppID 和 AppSecret

1. 登录 [微信公众平台](https://mp.weixin.qq.com)
2. 左侧菜单 →「设置与开发」→「基本配置」
3. 查看 **AppID(应用ID)**
4. 点击「重置」获取 **AppSecret**（只显示一次，务必保存）

### 3. 配置环境变量

在对方的机器上设置环境变量（建议写到 `.zshrc` 或 `.bash_profile`）：

```bash
export WECHAT_APPID="wx你的AppID"
export WECHAT_SECRET="你的AppSecret"
```

然后执行 `source ~/.zshrc` 使其生效。

### 4. 添加IP白名单

1. 微信公众平台 →「设置与开发」→「基本配置」
2. 找到 **IP白名单**，点击「查看」
3. 添加对方机器的**公网IP**

> 如何查公网IP：在终端执行 `curl ip.sb`，返回的IP就是。

**注意**：每次换网络（比如从家里到公司），IP会变，需要重新添加。

---

## 完整依赖清单

| 依赖 | 说明 | 安装方式 |
|------|------|---------|
| WorkBuddy | 运行环境 | 对方需安装 WorkBuddy 桌面端 |
| humanizer skill | 文章去AI味 | 市场下载或复制 |
| 多模态内容生成 skill | AI配图 | 系统内置，无需额外安装 |
| mp-draft-push skill | 上传到草稿箱 | 市场下载或复制 |
| jq | JSON处理 | `brew install jq` (macOS) |
| curl | HTTP请求 | 系统自带 |
| Python 3 | 脚本运行 | 系统自带 |

---

## 验证是否配好

让对方执行这个命令测试：

```bash
curl -s "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=$WECHAT_APPID&secret=$WECHAT_SECRET"
```

如果返回 `{"access_token":"...","expires_in":7200}`，说明配置成功。

如果返回 `40164 invalid ip`，说明IP白名单没加对。

如果返回 `40013 invalid appid`，说明AppID错了。

---

## 使用方式

配置完成后，对方只需：

1. 打开 WorkBuddy
2. 把文章发给你（助手）
3. 说"帮我优化并发布到公众号"
4. 你（助手）会自动走完整个流程

---

## 局限说明

- **必须有自己的公众号**：借用别人的不行，因为AppID和Secret绑定了特定账号
- **IP白名单限制**：如果对方的网络环境经常变（比如经常出差），可能需要频繁更新白名单
- **图片生成依赖云端**：需要联网，且每次生成需要30-60秒等待
- **审核前需手动确认**：草稿上传后，还是需要对方登录公众号后台确认无误后再点"发表"

---

## SKILL.md 完整内容（供复制）

```markdown
---
title: "公众号文章端到端发布流水线"
description: "从原始文章到公众号草稿箱的完整工作流：文章优化、配图生成、标题优化、HTML导出、草稿上传"
agent_created: true
---

# 公众号文章端到端发布流水线

## 适用场景

用户给出一篇原始文章，需要完成从内容优化到公众号草稿箱发布的完整流程。

## 完整流程

### Phase 1: 文章优化

1. **加载 humanizer skill**
   - 调用 `Skill: humanizer`
   - 去除AI味，让语气更自然、更像真人写作

2. **执行优化**
   - 原文不变的情况下，优化：
     - 语气节奏（拆分长段落，适配手机阅读）
     - 加粗重点句（帮助快速浏览）
     - 引用块格式（朋友圈/金句引用）
     - 去除重复表达和AI常见套路
   - **不改动核心观点和金句**

### Phase 2: 配图生成

1. **分析文章结构和情绪递进**
   - 通读全文，识别2-4个需要视觉支撑的关键段落
   - 配图位置通常在：开头（封面）、核心比喻段落、结尾升华段落

2. **生成配图**
   - 调用 `Skill: 多模态内容生成`
   - 所有配图保持统一风格：暗调+暖光，情绪感强，简约抽象
   - 分辨率：1280×720（横版）或 720×1280（竖版朋友圈封面）
   - Prompt 要求：no text, no logo, cinematic, moody, dark warm tones

3. **图片下载到本地**
   - 保存到 `{workspace}/article_images/`
   - 命名规范：`cover_xxx.png`、`illus_xxx.png` 等

### Phase 3: 标题优化

1. **撰写5个备选标题**
   - 风格覆盖：情绪共鸣型、身份认同型、反常识型、金句提炼型、场景切入型
   - 适配公众号打开率逻辑（好奇驱动/痛点驱动/身份驱动）

2. **提供摘要/导语**
   - 可直接复制到公众号摘要栏

### Phase 4: HTML导出

1. **生成公众号兼容的HTML**
   - 所有样式必须内联（`style="..."`）
   - 微信会过滤 `<style>` 标签和 `<head>` 内容
   - 图片路径先用本地路径，上传前替换为微信素材库URL
   - 保存到 `{workspace}/article_inline.html`

### Phase 5: 上传到草稿箱

1. **环境检查**
   - 确认 `WECHAT_APPID` 和 `WECHAT_SECRET` 已配置
   - 确认服务器IP已加入公众号IP白名单

2. **上传封面图到微信素材库**
   - 调用 `mp-draft-push` 脚本的 `upload_wechat_image`
   - 获取 `thumb_media_id`

3. **上传文章内配图**
   - 每张配图都上传到素材库
   - 获取微信URL（`mmbiz.qpic.cn` 域名）
   - 替换HTML中的本地图片路径

4. **创建草稿**
   - 调用 `mp-draft-push` 脚本的 `create_draft`
   - 参数：title, author, digest, content_html, thumb_media_id
   - 开启评论：`need_open_comment: 1`

## 关键配置

| 环境变量 | 说明 | 获取方式 |
|---------|------|---------|
| `WECHAT_APPID` | 公众号应用ID | 微信公众平台 → 设置与开发 → 基本配置 |
| `WECHAT_SECRET` | 公众号应用密钥 | 同上，需重置查看 |
| IP白名单 | 服务器公网IP | 微信公众平台 → 基本配置 → IP白名单 |

## 注意事项

1. **IP白名单**：首次使用前必须将服务器IP加入白名单，否则会返回 `40164 invalid ip`
2. **图片URL**：文章内图片必须是微信素材库URL（`mmbiz.qpic.cn`），本地路径在草稿中不显示
3. **中文编码**：JSON 构建时必须用 `ensure_ascii=False`，否则中文乱码
4. **标题长度**：最多64字节（约21个中文字符）
5. **Token有效期**：access_token 有效期2小时，每次上传前重新获取

## 输出物清单

完成后的工作目录应包含：

```
{workspace}/
├── article_inline.html      # 公众号兼容HTML（内联样式）
├── article_html.html        # 本地预览版HTML（含<style>标签）
├── article_titles.md        # 5个备选标题+推荐排序
├── article_images/
│   ├── cover_xxx.png        # 封面图
│   ├── illus_xxx.png        # 文章配图1
│   └── ...                  # 其他配图
```

## 故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| `40164 invalid ip` | IP不在白名单 | 去微信公众平台添加服务器IP |
| `40001 access_token expired` | Token过期 | 重新获取token |
| 文章内图片不显示 | 使用了本地路径 | 先上传到微信素材库，替换为mmbiz URL |
| 排版错乱 | 用了`<style>`标签 | 全部改为内联`style="..."` |
```
