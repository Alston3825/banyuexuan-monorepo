from typing import List

import httpx

from .base import ChatMessage, ChatResult, EmbeddingResult, ModelProvider, ModelProviderError


class DeepSeekProvider(ModelProvider):
    """
    DeepSeek Chat Completions API 适配器（完全兼容OpenAI格式）。

      POST {base_url}/chat/completions   body: {"model": "deepseek-chat", "messages": [...]}
      Authorization: Bearer <api_key>

    DeepSeek平台目前只提供对话模型（deepseek-chat/deepseek-reasoner），没有公开的
    embeddings接口——embed()直接抛错，走网关的降级链路给其他配置了embedding能力的
    供应商（如火山引擎），不是漏实现。
    """

    name = "deepseek"

    def __init__(self, api_key: str, base_url: str, model: str, timeout: float):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout = timeout

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}

    async def complete(self, messages: List[ChatMessage]) -> ChatResult:
        payload = {
            "model": self._model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": False,
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(f"{self._base_url}/chat/completions", json=payload, headers=self._headers())
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            return ChatResult(content=content, provider=self.name, model=self._model)
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            raise ModelProviderError(f"deepseek 调用失败: {exc}") from exc

    async def embed(self, texts: List[str]) -> EmbeddingResult:
        raise ModelProviderError("deepseek 不提供 embedding 接口，请配置其它支持embedding的供应商")
