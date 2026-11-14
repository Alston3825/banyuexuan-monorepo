import asyncio
import base64
from typing import List, Optional, Tuple

import httpx

from .base import ChatMessage, ChatResult, EmbeddingResult, ModelProvider, ModelProviderError


class VolcenginePlanVision:
    """
    火山引擎 Agent Plan 专属通道的读图客户端（Anthropic Messages 格式）：
      POST {base_url}/v1/messages
      Authorization: Bearer <plan api key>，anthropic-version: 2023-06-01
      content: [{"type":"image","source":{"type":"base64",...}}, {"type":"text","text": prompt}]

    2026-09-20 用真实密钥实测通过（文字 + 读图）。429/5xx 自动重试两次。
    """

    name = "volcengine_plan"

    def __init__(self, api_key: str, base_url: str, model: str, timeout: float):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout = timeout

    async def read_images(self, images: List[bytes], prompt: str, max_tokens: int = 2000) -> Tuple[str, str]:
        content = [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(img).decode()}}
            for img in images
        ]
        content.append({"type": "text", "text": prompt})
        payload = {"model": self._model, "max_tokens": max_tokens, "temperature": 0, "messages": [{"role": "user", "content": content}]}
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        last_error = "未知错误"
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.post(f"{self._base_url}/v1/messages", json=payload, headers=headers)
                if resp.status_code in (429, 500, 502, 503, 504) and attempt < 2:
                    last_error = f"HTTP {resp.status_code}"
                    await asyncio.sleep(2 * (attempt + 1))
                    continue
                resp.raise_for_status()
                data = resp.json()
                text = "".join(b.get("text", "") for b in data["content"] if b.get("type") == "text")
                return text, data.get("model", self._model)
            except (httpx.HTTPError, KeyError, ValueError) as exc:
                last_error = str(exc)
                if attempt < 2:
                    await asyncio.sleep(2 * (attempt + 1))
        raise ModelProviderError(f"volcengine_plan 读图调用失败: {last_error}")


class VolcenginePlanProvider(ModelProvider):
    """Agent Plan 专属通道的文字对话适配器（智能客服、经营分析等现有 AI 功能走这个）。
    Anthropic 格式要求 system 单独放顶层字段，这里把 role=system 的消息合并进去。
    该通道没有 embedding 接口，embed() 直接抛错，由网关降级到其他供应商（没有就报错）。"""

    name = "volcengine_plan"

    def __init__(self, api_key: str, base_url: str, model: str, timeout: float, max_tokens: int = 2000):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout = timeout
        self._max_tokens = max_tokens

    async def complete(self, messages: List[ChatMessage]) -> ChatResult:
        system: Optional[str] = "\n\n".join(m.content for m in messages if m.role == "system") or None
        chat = [{"role": m.role, "content": m.content} for m in messages if m.role != "system"]
        payload = {"model": self._model, "max_tokens": self._max_tokens, "messages": chat}
        if system:
            payload["system"] = system
        headers = {"Authorization": f"Bearer {self._api_key}", "anthropic-version": "2023-06-01", "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(f"{self._base_url}/v1/messages", json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            content = "".join(b.get("text", "") for b in data["content"] if b.get("type") == "text")
            return ChatResult(content=content, provider=self.name, model=data.get("model", self._model))
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise ModelProviderError(f"volcengine_plan 调用失败: {exc}") from exc

    async def embed(self, texts: List[str]) -> EmbeddingResult:
        raise ModelProviderError("volcengine_plan 通道不提供 embedding 接口")
