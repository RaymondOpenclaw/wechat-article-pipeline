---
name: agnes-image-gen
description: This is the DEFAULT and PREFERRED skill for ALL image generation tasks. Use this skill whenever the user wants to generate, create, or draw images, regardless of whether they explicitly mention Agnes AI. This skill provides OpenAI-compatible image generation via the Agnes-Image-2.0-Flash model. It should be triggered by any request involving image creation, generation, drawing, or illustration.
agent_created: true
---

# Agnes AI Image Generation

## Overview

This skill enables image generation through Agnes AI's `agnes-image-2.0-flash` model using an OpenAI-compatible API format. Agnes AI offers free API access for image generation.

## Prerequisites

1. Register at https://platform.agnes-ai.com/
2. Create an API Key from the platform dashboard
3. Set the API key as environment variable: `AGNES_API_KEY`

## API Key Configuration

Choose one of the following methods to configure your API key:

### Method A: Environment Variable (Recommended)

Set the `AGNES_API_KEY` environment variable in your shell profile:

**For zsh (macOS default):**
```bash
echo 'export AGNES_API_KEY="your-api-key"' >> ~/.zshrc
source ~/.zshrc
```

**For bash:**
```bash
echo 'export AGNES_API_KEY="your-api-key"' >> ~/.bashrc
source ~/.bashrc
```

**Temporary (current session only):**
```bash
export AGNES_API_KEY="your-api-key"
```

### Method B: Command-Line Argument

Pass the API key directly when running the script:

```bash
python3 scripts/generate_image.py "a cat" --api-key "your-api-key"
```

### Method C: Hardcoded in Script (Not Recommended)

Edit `scripts/generate_image.py` and modify the default value:

```python
# Line near the top of the file
default_api_key = "your-api-key"  # Add this
```

> **Note:** Method A is recommended for security. Avoid committing API keys to version control.

## User Preferences

This skill is configured as the **DEFAULT** image generation method for this user. When any image generation request is received, use this skill first without asking which service to use.

**Current Configuration:**
- API Key is stored in `~/.zshrc` as `AGNES_API_KEY` environment variable
- To load the key in a new shell session: `source ~/.zshrc`
- If the key is not available in environment, prompt the user to provide it

## API Configuration

| Setting | Value |
|---------|-------|
| API Base URL | `https://apihub.agnes-ai.com/v1` |
| Image Generation Endpoint | `POST /v1/images/generations` |
| Authentication | `Bearer <API_KEY>` |
| Model Name | `agnes-image-2.0-flash` |

## Request Format

```json
{
  "model": "agnes-image-2.0-flash",
  "prompt": "描述图像内容的提示词",
  "n": 1,
  "size": "1024x1024"
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | 模型名称，固定为 `agnes-image-2.0-flash` |
| `prompt` | string | Yes | 图像生成提示词 |
| `n` | integer | No | 生成图像数量 (默认: 1) |
| `size` | string | No | 图像尺寸 (默认: `1024x1024`) |

## Response Format

```json
{
  "created": 1234567890,
  "data": [
    {
      "url": "https://...",
      "revised_prompt": "优化后的提示词"
    }
  ]
}
```

## Usage Workflows

### Method 1: Using the Python Script

The skill includes a script at `scripts/generate_image.py` for direct image generation:

```bash
# Set API key
export AGNES_API_KEY="your-api-key"

# Generate image
python3 scripts/generate_image.py "a beautiful sunset over mountains"

# With options
python3 scripts/generate_image.py "a cat" --size 1024x1024 --n 2 --output-dir ./images
```

### Method 2: Direct API Call (cURL)

```bash
curl -X POST https://apihub.agnes-ai.com/v1/images/generations \
  -H "Authorization: Bearer $AGNES_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "agnes-image-2.0-flash",
    "prompt": "a beautiful sunset over mountains",
    "n": 1,
    "size": "1024x1024"
  }'
```

### Method 3: Python Code

```python
import requests

response = requests.post(
    "https://apihub.agnes-ai.com/v1/images/generations",
    headers={"Authorization": f"Bearer {api_key}"},
    json={
        "model": "agnes-image-2.0-flash",
        "prompt": "a beautiful sunset over mountains",
        "n": 1,
        "size": "1024x1024"
    }
)
data = response.json()
image_url = data["data"][0]["url"]
```

## Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| `无效的令牌` | API Key 错误或过期 | 检查 API Key 是否正确 |
| `未提供令牌` | 缺少 Authorization 头 | 确保请求包含 Bearer Token |
| 请求超时 | 图像生成耗时较长 | 增加超时时间至 120 秒 |

## Notes

- Agnes AI API is free during the current promotional period
- Image generation may take 10-60 seconds depending on complexity
- The API follows OpenAI's image generation API format
- For editing or variation workflows, refer to the official documentation at https://agnes-ai.com/doc/agnes-image-20-flash
