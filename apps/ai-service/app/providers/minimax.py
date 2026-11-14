from typing import List

import httpx

from .base import ChatMessage, ChatResult, EmbeddingResult, ModelProvider, ModelProviderError


class MiniMaxProvider(ModelProvider):
    """
    MiniMax ChatCompletion v2 / Embeddings API 适配器（OpenAI 兼容风格）。

      POST {base_url}/text/chatcompletion_v2?GroupId=<group_id>   body: {"model": "<model_name>", "messages": [...]}
      POST {base_url}/embeddings?GroupId=<group_id>               body: {"model": "<embedding_model>", "input": [...]}
      Authorization: Bearer <api_key>

    用真实API Key联调过一次（2026-08-16）：MiniMax所有接口即使HTTP层200成功，业务层
    错误也是通过响应体里的 base_resp.status_code/status_msg 表达的（0=成功），不是
    HTTP状态码——比如账户余额不足时返回的是 200 + {"choices": null, "base_resp":
    {"status_code": 1008, "status_msg": "insufficient balance"}}，如果不先检查
    base_resp就直接去取choices[0]，会在choices为null时炸出一个"'NoneType' object is
    not subscriptable"这种没有实际意义的TypeError，把"余额不足"这种本该清晰返回给
    用户的错误信息吞掉了。
    """

    name = "minimax"

    def __init__(self, api_key: str, group_id: str, base_url: str, model: str, timeout: float, embedding_model: str = "embo-01"):
        self._api_key = api_key
        self._group_id = group_id
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._embedding_model = embedding_model
        self._timeout = timeout

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}

    def _params(self) -> dict:
        return {"GroupId": self._group_id} if self._group_id else None

    @staticmethod
    def _check_base_resp(data: dict, action: str) -> None:
        """MiniMax所有接口统一约定：即使HTTP 200，真正的业务错误码在response.base_resp
        里，status_code非0就是失败（如1008=余额不足，1004=鉴权失败等），此时choices/data
        这些正常字段会是null——必须在解析正常字段之前先检查这个，否则会在null上做
        下标/属性访问，炸出无实际信息的TypeError/KeyError，把真正的错误原因吞掉。"""
        base_resp = data.get("base_resp") or {}
        status_code = base_resp.get("status_code", 0)
        if status_code != 0:
            raise ModelProviderError(f"minimax {action}失败（status_code={status_code}）: {base_resp.get('status_msg', '未知错误')}")

    async def complete(self, messages: List[ChatMessage]) -> ChatResult:
        payload = {
            "model": self._model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": False,
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(f"{self._base_url}/text/chatcompletion_v2", json=payload, headers=self._headers(), params=self._params())
            resp.raise_for_status()
            data = resp.json()
            self._check_base_resp(data, "对话")
            content = data["choices"][0]["message"]["content"]
            return ChatResult(content=content, provider=self.name, model=self._model)
        except ModelProviderError:
            raise
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            raise ModelProviderError(f"minimax 调用失败: {exc}") from exc

    async def embed(self, texts: List[str]) -> EmbeddingResult:
        payload = {"model": self._embedding_model, "input": texts}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(f"{self._base_url}/embeddings", json=payload, headers=self._headers(), params=self._params())
            resp.raise_for_status()
            data = resp.json()
            self._check_base_resp(data, "embedding")
            embeddings = [item["embedding"] for item in data["data"]]
            return EmbeddingResult(embeddings=embeddings, provider=self.name, model=self._embedding_model)
        except ModelProviderError:
            raise
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            raise ModelProviderError(f"minimax embedding调用失败: {exc}") from exc
