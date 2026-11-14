import json

import httpx
import pytest
import respx

from app.providers.base import ChatMessage, ModelProviderError
from app.providers.volcengine_plan import VolcenginePlanProvider, VolcenginePlanVision

BASE = "https://ark.cn-beijing.volces.com/api/plan"


def _provider() -> VolcenginePlanProvider:
    return VolcenginePlanProvider(api_key="fake", base_url=BASE, model="m-fake", timeout=5)


@pytest.mark.asyncio
@respx.mock
async def test_plan_chat_puts_system_at_top_level_and_uses_bearer():
    route = respx.post(f"{BASE}/v1/messages").mock(
        return_value=httpx.Response(200, json={"model": "real-model", "content": [{"type": "text", "text": "你好"}]})
    )
    result = await _provider().complete(
        [ChatMessage(role="system", content="你是客服"), ChatMessage(role="user", content="在吗")]
    )
    assert result.content == "你好" and result.provider == "volcengine_plan" and result.model == "real-model"
    sent = route.calls[0].request
    body = json.loads(sent.content)
    assert body["system"] == "你是客服"
    assert body["messages"] == [{"role": "user", "content": "在吗"}]
    assert sent.headers["authorization"] == "Bearer fake"


@pytest.mark.asyncio
@respx.mock
async def test_plan_chat_raises_provider_error_on_http_failure():
    respx.post(f"{BASE}/v1/messages").mock(return_value=httpx.Response(401, json={"error": "bad key"}))
    with pytest.raises(ModelProviderError):
        await _provider().complete([ChatMessage(role="user", content="hi")])


@pytest.mark.asyncio
async def test_plan_has_no_embedding():
    with pytest.raises(ModelProviderError):
        await _provider().embed(["x"])


@pytest.mark.asyncio
@respx.mock
async def test_plan_vision_sends_image_block_and_retries_on_429():
    route = respx.post(f"{BASE}/v1/messages").mock(
        side_effect=[
            httpx.Response(429),
            httpx.Response(200, json={"model": "real-model", "content": [{"type": "text", "text": "{}"}]}),
        ]
    )
    vision = VolcenginePlanVision(api_key="fake", base_url=BASE, model="m-fake", timeout=5)
    text, model = await vision.read_images([b"\xff\xd8fakejpeg"], "读图")
    assert text == "{}" and model == "real-model"
    assert route.call_count == 2  # 429 后自动重试
    content = json.loads(route.calls[1].request.content)["messages"][0]["content"]
    assert content[0]["type"] == "image" and content[0]["source"]["media_type"] == "image/jpeg"
    assert content[-1] == {"type": "text", "text": "读图"}
