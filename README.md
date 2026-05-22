# 公众号文章端到端发布流水线

给 WorkBuddy / AI 助手用的技能包。配置好后，把文章丢给助手，自动完成**优化 → 配图 → 标题 → 上传**。

---

## 前置条件

你需要先有：

1. **WorkBuddy** 桌面端（[下载](https://www.workbuddy.cn)）
2. **微信公众号**（个人订阅号即可，需完成微信认证）
3. **一台能联网的电脑**（Mac / Windows / Linux）

---

## 安装（3步）

### 第1步：下载本仓库

```bash
# 放到 WorkBuddy 的 skills 目录下
git clone https://github.com/RaymondOpenclaw/wechat-article-pipeline.git \
  ~/.workbuddy/skills/wechat-article-pipeline
```

### 第2步：配置微信 API

1. 登录 [微信公众平台](https://mp.weixin.qq.com)
2. 左侧菜单 →「设置与开发」→「基本配置」
3. 拿到 **AppID** 和 **AppSecret**（AppSecret 点"重置"才显示，只出现一次，保存好）
4. 在同一页面，把当前电脑的**公网IP**加到 **IP白名单**

> 查公网IP：`curl ip.sb`

### 第3步：设置环境变量

把下面加到 `~/.zshrc`（Mac）或 `~/.bashrc`（Linux）：

```bash
export WECHAT_APPID="wx你的AppID"
export WECHAT_SECRET="你的AppSecret"
```

然后执行：
```bash
source ~/.zshrc
```

---

## 验证配置

终端执行：
```bash
curl -s "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=$WECHAT_APPID&secret=$WECHAT_SECRET"
```

返回 `{"access_token":"...","expires_in":7200}` 即成功。

如果返回 `40164 invalid ip`，说明 IP 白名单没加对。

---

## 使用

打开 WorkBuddy，把文章发给助手，说：

> **"帮我优化这篇文章，配图，写标题，然后上传到公众号草稿箱。"**

助手会自动走完：

```
文章优化（去AI味） → 生成配图 → 优化标题 → 导出HTML → 上传草稿箱
```

完成后助手会给出一个链接，你登录公众号后台确认无误即可发表。

---

## 包含的技能

| 技能 | 来源 | 说明 |
|------|------|------|
| `humanizer` | WorkBuddy 市场 | 去除AI写作痕迹 |
| `多模态内容生成` | 系统内置 | AI生成配图 |
| `mp-draft-push` | WorkBuddy 市场 | 上传到公众号草稿箱 |

> 前两个通常已自带，`mp-draft-push` 如果没装，去 WorkBuddy 技能市场搜一下。

---

## 常见问题

**Q：换WiFi后上传失败？**  
A：IP变了，去微信后台重新加新IP到白名单。

**Q：文章里的图片在草稿箱不显示？**  
A：正常，助手会自动把图片上传到微信素材库。如果没看到图，检查网络或重试。

**Q：标题能改吗？**  
A：助手会先生成5个备选，你挑一个。也可以直接说"你定"，助手自动选。

**Q：能用于别人的公众号吗？**  
A：不能。AppID/Secret 是跟公众号绑死的，每个人都有自己的一套。

---

## License

MIT
