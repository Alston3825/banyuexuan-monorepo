import time
from dataclasses import dataclass
from typing import Dict, List, Optional

from .config import Settings
from .providers.base import ChatMessage, ChatResult, ModelProvider, ModelProviderError
from .providers.minimax import MiniMaxProvider
from .providers.volcengine import VolcengineProvider


class NoProviderConfiguredError(Exception):
    """请求的供应商未在环境变量里配置密钥。"""


@dataclass
class GatewayResult:
    content: str
    provider: str
    model: str
    latency_ms: int
    used_fallback: bool


def build_providers(settings: Settings) -> Dict[str, ModelProvider]:
    """按配置构建供应商实例；未配置密钥的供应商不会出现在字典里。"""
    providers: Dict[str, ModelProvider] = {}
    if settings.volcengine_api_key and settings.volcengine_endpoint_id:
        providers["volcengine"] = VolcengineProvider(
            api_key=settings.volcengine_api_key,
            base_url=settings.volcengine_base_url,
            endpoint_id=settings.volcengine_endpoint_id,
            timeout=settings.request_timeout_seconds,
        )
    if settings.minimax_api_key:
        providers["minimax"] = MiniMaxProvider(
            api_key=settings.minimax_api_key,
            group_id=settings.minimax_group_id or "",
            base_url=settings.minimax_base_url,
            model=settings.minimax_model,
            timeout=settings.request_timeout_seconds,
        )
    return providers


class ModelGateway:
    """
    统一模型网关：主供应商不可用时自动降级到备用供应商（见 3.3.1 节"多供应商热切换与降级"），
    并记录调用耗时供成本/性能审计使用。
    """

    def __init__(self, providers: Dict[str, ModelProvider], primary: str, fallback: Optional[str]):
        self._providers = providers
        self._primary = primary
        self._fallback = fallback

    async def complete(self, messages: List[ChatMessage], preferred_provider: Optional[str] = None) -> GatewayResult:
        order = self._resolve_order(preferred_provider)
        if not order:
            raise NoProviderConfiguredError("没有任何已配置密钥的模型供应商")

        last_error: Optional[Exception] = None
        for index, provider_name in enumerate(order):
            provider = self._providers.get(provider_name)
            if not provider:
                continue
            started_at = time.monotonic()
            try:
                result: ChatResult = await provider.complete(messages)
                latency_ms = int((time.monotonic() - started_at) * 1000)
                return GatewayResult(
                    content=result.content,
                    provider=result.provider,
                    model=result.model,
                    latency_ms=latency_ms,
                    used_fallback=index > 0,
                )
            except ModelProviderError as exc:
                last_error = exc
                continue

        raise last_error or NoProviderConfiguredError("所有已配置的模型供应商均调用失败")

    def _resolve_order(self, preferred_provider: Optional[str]) -> List[str]:
        order: List[str] = []
        if preferred_provider:
            order.append(preferred_provider)
        for name in (self._primary, self._fallback):
            if name and name not in order:
                order.append(name)
        return [name for name in order if name in self._providers]
