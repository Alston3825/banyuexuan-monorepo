import asyncio
import base64
from typing import List, Optional, Tuple, Union

import httpx

from .base import ModelProviderError


class ArkVision:
    """
    火山引擎方舟(Ark) 按量计费通道的读图/读视频客户端（OpenAI 兼容格式）：
      POST {base_url}/chat/completions      Authorization: Bearer <api key>
      content: [{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,..."}}, {"type":"text","text": prompt}]
      视频：{"type":"video_url","video_url":{"url":"data:video/mp4;base64,..." 或 公网地址}}
    model 填控制台的“推理接入点 ID”(ep-xxxx) 或模型名称均可。
    和 VolcenginePlanVision 接口一致（read_images 返回 (文字, 模型名)），识别逻辑不用改。
    429/5xx 自动重试两次。
    """

    name = "volcengine_ark"

    def __init__(self, api_key: str, base_url: str, model: str, timeout: float, video_model: Optional[str] = None):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._video_model = video_model or model
        self._timeout = timeout

    async def read_images(self, images: List[bytes], prompt: str, max_tokens: int = 2000) -> Tuple[str, str]:
        content = [
            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(img).decode()}}
            for img in images
        ]
        content.append({"type": "text", "text": prompt})
        return await self._chat(self._model, content, max_tokens)

    async def read_video(self, video: Union[bytes, str], prompt: str, mime: str = "video/mp4", max_tokens: int = 2000) -> Tuple[str, str]:
        """video 可以是视频文件字节（小文件，内联 base64），或可公网访问的视频地址。"""
        url = video if isinstance(video, str) else f"data:{mime};base64," + base64.b64encode(video).decode()
        content = [{"type": "video_url", "video_url": {"url": url}}, {"type": "text", "text": prompt}]
        return await self._chat(self._video_model, content, max_tokens)

    async def _chat(self, model: str, content: list, max_tokens: int) -> Tuple[str, str]:
        payload = {"model": model, "max_tokens": max_tokens, "temperature": 0, "stream": False, "messages": [{"role": "user", "content": content}]}
        headers = {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}
        last_error = "未知错误"
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.post(f"{self._base_url}/chat/completions", json=payload, headers=headers)
                if resp.status_code in (429, 500, 502, 503, 504) and attempt < 2:
                    last_error = f"HTTP {resp.status_code}"
                    await asyncio.sleep(2 * (attempt + 1))
                    continue
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"] or "", data.get("model", model)
            except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
                last_error = str(exc)
                if attempt < 2:
                    await asyncio.sleep(2 * (attempt + 1))
        raise ModelProviderError(f"volcengine_ark 读图调用失败: {last_error}")
