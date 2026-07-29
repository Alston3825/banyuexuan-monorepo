from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Literal


@dataclass
class ChatMessage:
    role: Literal["system", "user", "assistant"]
    content: str


@dataclass
class ChatResult:
    content: str
    provider: str
    model: str


@dataclass
class EmbeddingResult:
    embeddings: List[List[float]]
    provider: str
    model: str


class ModelProviderError(Exception):
    """某个供应商调用失败（网络错误、超时、非2xx响应等），网关据此触发降级到备用供应商。"""


class ModelProvider(ABC):
    """统一的模型供应商适配接口，屏蔽不同厂商 API 差异（见 3.3.1 节）。"""

    name: str

    @abstractmethod
    async def complete(self, messages: List[ChatMessage]) -> ChatResult:
        """调用供应商的 Chat Completions API，失败时抛出 ModelProviderError。"""
        raise NotImplementedError

    @abstractmethod
    async def embed(self, texts: List[str]) -> EmbeddingResult:
        """调用供应商的 Embeddings API，失败时抛出 ModelProviderError。"""
        raise NotImplementedError
