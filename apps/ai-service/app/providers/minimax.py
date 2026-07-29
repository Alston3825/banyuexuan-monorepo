from typing import List

import httpx

from .base import ChatMessage, ChatResult, ModelProvider, ModelProviderError


class MiniMaxProvider(ModelProvider):
    """
    MiniMax ChatCompletion v2 API 适配器（OpenAI 兼容风格）。

      POST {base_url}/text/chatcompletion_v2?GroupId=<group_id>
      Authorization: Bearer <api_key>
      body: {"model": "<model_name>", "messages": [...]}

    注意：这段代码尚未用真实 API Key 做过端到端联调，如实际调用格式与文档有出入，
    请对照 MiniMax 最新文档调整本文件，见业务规则确认记录。
    """

    name = "minimax"

    def __init__(self, api_key: str, group_id: str, base_url: str, model: str, timeout: float):
        self._api_key = api_key
        self._group_id = group_id
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout = timeout

    async def complete(self, messages: List[ChatMessage]) -> ChatResult:
        payload = {
            "model": self._model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": False,
        }
        headers = {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}
        params = {"GroupId": self._group_id} if self._group_id else None
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(f"{self._base_url}/text/chatcompletion_v2", json=payload, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            return ChatResult(content=content, provider=self.name, model=self._model)
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            raise ModelProviderError(f"minimax 调用失败: {exc}") from exc
