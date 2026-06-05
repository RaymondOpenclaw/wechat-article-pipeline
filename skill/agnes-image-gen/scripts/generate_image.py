#!/usr/bin/env python3
"""
Agnes AI Image Generation Script
调用 Agnes AI 的图像生成 API (OpenAI 兼容格式)
"""

import os
import sys
import argparse
import requests
import time

API_BASE = "https://apihub.agnes-ai.com/v1"
DEFAULT_MODEL = "agnes-image-2.0-flash"


def generate_image(prompt, api_key, model=DEFAULT_MODEL, size="1024x1024", n=1, output_dir="."):
    """生成图像并保存到本地"""
    
    if not api_key:
        api_key = os.environ.get("AGNES_API_KEY")
    
    if not api_key:
        print("错误: 未提供 API Key。请设置 AGNES_API_KEY 环境变量或通过 --api-key 参数传入。")
        sys.exit(1)
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": model,
        "prompt": prompt,
        "n": n,
        "size": size
    }
    
    print(f"正在生成图像: {prompt[:50]}...")
    print(f"模型: {model}, 尺寸: {size}")
    
    try:
        response = requests.post(
            f"{API_BASE}/images/generations",
            headers=headers,
            json=payload,
            timeout=120
        )
        
        if response.status_code != 200:
            print(f"请求失败: HTTP {response.status_code}")
            print(f"响应: {response.text}")
            sys.exit(1)
        
        data = response.json()
        
        if "data" not in data:
            print(f"响应格式异常: {json.dumps(data, indent=2, ensure_ascii=False)}")
            sys.exit(1)
        
        saved_files = []
        for i, item in enumerate(data["data"]):
            if "url" in item:
                img_url = item["url"]
                img_response = requests.get(img_url, timeout=60)
                
                if img_response.status_code == 200:
                    ext = ".png"
                    if ".jpg" in img_url or ".jpeg" in img_url:
                        ext = ".jpg"
                    
                    timestamp = int(time.time())
                    filename = f"agnes_gen_{timestamp}_{i+1}{ext}"
                    filepath = os.path.join(output_dir, filename)
                    
                    with open(filepath, "wb") as f:
                        f.write(img_response.content)
                    
                    saved_files.append(filepath)
                    print(f"已保存: {filepath}")
                else:
                    print(f"下载图像失败: HTTP {img_response.status_code}")
            elif "b64_json" in item:
                import base64
                filename = f"agnes_gen_{i+1}.png"
                filepath = os.path.join(output_dir, filename)
                
                with open(filepath, "wb") as f:
                    f.write(base64.b64decode(item["b64_json"]))
                
                saved_files.append(filepath)
                print(f"已保存: {filepath}")
        
        return saved_files
        
    except requests.exceptions.Timeout:
        print("请求超时，请稍后重试。")
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f"请求异常: {e}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Agnes AI 图像生成工具")
    parser.add_argument("prompt", help="图像生成提示词")
    parser.add_argument("--api-key", help="Agnes AI API Key (或设置 AGNES_API_KEY 环境变量)")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"模型名称 (默认: {DEFAULT_MODEL})")
    parser.add_argument("--size", default="1024x1024", help="图像尺寸 (默认: 1024x1024)")
    parser.add_argument("--n", type=int, default=1, help="生成数量 (默认: 1)")
    parser.add_argument("--output-dir", default=".", help="输出目录 (默认: 当前目录)")
    
    args = parser.parse_args()
    
    os.makedirs(args.output_dir, exist_ok=True)
    
    files = generate_image(
        prompt=args.prompt,
        api_key=args.api_key,
        model=args.model,
        size=args.size,
        n=args.n,
        output_dir=args.output_dir
    )
    
    print(f"\n生成完成！共 {len(files)} 张图像")


if __name__ == "__main__":
    main()
