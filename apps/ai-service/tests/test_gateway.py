from typing import List

import pytest

from app.gateway import ModelGateway, NoProviderConfiguredError
from app.providers.base import ChatMessage, ChatResult, ModelProvider, ModelProviderError


class FakeProvider(ModelProvider):
    def __init__(self, name: str, should_fail: bool = False, content: str = "ok"):
        self.name = name
        self._should_fail = should_fail
        self._content = content
        self.call_count = 0

    async def complete(self, messages: List[ChatMessage]) -> ChatResult:
        self.call_count += 1
        if self._should_fail:
            raise ModelProviderError(f"{self.name} 挂了")
        return ChatResult(content=self._content, provider=self.name, model="fake-model")


@pytest.mark.asyncio
async def test_gateway_uses_primary_when_healthy():
    primary = FakeProvider("volcengine", content="来自火山引擎")
    fallback = FakeProvider("minimax", content="来自minimax")
    gateway = ModelGateway({"volcengine": primary, "minimax": fallback}, primary="volcengine", fallback="minimax")

    result = await gateway.complete([ChatMessage(role="user", content="你好")])

    assert result.content == "来自火山引擎"
    assert result.provider == "volcengine"
    assert result.used_fallback is False
    assert fallback.call_count == 0


@pytest.mark.asyncio
async def test_gateway_falls_back_when_primary_fails():
    primary = FakeProvider("volcengine", should_fail=True)
    fallback = FakeProvider("minimax", content="来自minimax")
    gateway = ModelGateway({"volcengine": primary, "minimax": fallback}, primary="volcengine", fallback="minimax")

    result = await gateway.complete([ChatMessage(role="user", content="你好")])

    assert result.content == "来自minimax"
    assert result.provider == "minimax"
    assert result.used_fallback is True


@pytest.mark.asyncio
async def test_gateway_raises_when_all_providers_fail():
    primary = FakeProvider("volcengine", should_fail=True)
    fallback = FakeProvider("minimax", should_fail=True)
    gateway = ModelGateway({"volcengine": primary, "minimax": fallback}, primary="volcengine", fallback="minimax")

    with pytest.raises(ModelProviderError):
        await gateway.complete([ChatMessage(role="user", content="你好")])


@pytest.mark.asyncio
async def test_gateway_raises_when_no_provider_configured():
    gateway = ModelGateway({}, primary="volcengine", fallback="minimax")

    with pytest.raises(NoProviderConfiguredError):
        await gateway.complete([ChatMessage(role="user", content="你好")])


@pytest.mark.asyncio
async def test_gateway_respects_preferred_provider_override():
    primary = FakeProvider("volcengine", content="来自火山引擎")
    fallback = FakeProvider("minimax", content="来自minimax")
    gateway = ModelGateway({"volcengine": primary, "minimax": fallback}, primary="volcengine", fallback="minimax")

    result = await gateway.complete([ChatMessage(role="user", content="你好")], preferred_provider="minimax")

    assert result.provider == "minimax"
