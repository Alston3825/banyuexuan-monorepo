from typing import List, Optional

import httpx

from .base import ChatMessage, ChatResult, EmbeddingResult, ModelProvider, ModelProviderError


class VolcengineProvider(ModelProvider):
    """
    火山引擎方舟(Ark) Chat Completions / Embeddings API 适配器。

    接口按官方文档记载的 OpenAI 兼容格式实现：
      POST {base_url}/chat/completions      body: {"model": "<endpoint_id>", "messages": [...]}
      POST {base_url}/embeddings            body: {"model": "<embedding_endpoint_id>", "input": [...]}
      Authorization: Bearer <api_key>

    注意：这段代码尚未用真实 API Key 做过端到端联调（密钥属于敏感信息，不通过对话传递），
    如实际调用格式与文档有出入，请对照火山引擎最新文档调整本文件，见业务规则确认记录。
    """

    name = "volcengine"

    def __init__(self, api_key: str, base_url: str, endpoint_id: str, timeout: float, embedding_endpoint_id: Optional[str] = None):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._endpoint_id = endpoint_id
        self._embedding_endpoint_id = embedding_endpoint_id
        self._timeout = timeout

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}

    async def complete(self, messages: List[ChatMessage]) -> ChatResult:
        payload = {
            "model": self._endpoint_id,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": False,
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(f"{self._base_url}/chat/completions", json=payload, headers=self._headers())
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            return ChatResult(content=content, provider=self.name, model=self._endpoint_id)
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            raise ModelProviderError(f"volcengine 调用失败: {exc}") from exc

    async def embed(self, texts: List[str]) -> EmbeddingResult:
        if not self._embedding_endpoint_id:
            raise ModelProviderError("volcengine 未配置 embedding 推理接入点(VOLCENGINE_EMBEDDING_ENDPOINT_ID)")
        payload = {"model": self._embedding_endpoint_id, "input": texts}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(f"{self._base_url}/embeddings", json=payload, headers=self._headers())
            resp.raise_for_status()
            data = resp.json()
            embeddings = [item["embedding"] for item in data["data"]]
            return EmbeddingResult(embeddings=embeddings, provider=self.name, model=self._embedding_endpoint_id)
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            raise ModelProviderError(f"volcengine embedding调用失败: {exc}") from exc
