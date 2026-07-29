import httpx
import pytest
import respx

from app.providers.base import ChatMessage, ModelProviderError
from app.providers.minimax import MiniMaxProvider
from app.providers.volcengine import VolcengineProvider


@pytest.mark.asyncio
@respx.mock
async def test_volcengine_complete_success():
    respx.post("https://ark.cn-beijing.volces.com/api/v3/chat/completions").mock(
        return_value=httpx.Response(200, json={"choices": [{"message": {"content": "你好，我是豆包"}}]})
    )
    provider = VolcengineProvider(api_key="fake-key", base_url="https://ark.cn-beijing.volces.com/api/v3", endpoint_id="ep-fake", timeout=5)

    result = await provider.complete([ChatMessage(role="user", content="你好")])

    assert result.content == "你好，我是豆包"
    assert result.provider == "volcengine"
    assert result.model == "ep-fake"


@pytest.mark.asyncio
@respx.mock
async def test_volcengine_complete_raises_on_http_error():
    respx.post("https://ark.cn-beijing.volces.com/api/v3/chat/completions").mock(return_value=httpx.Response(500))
    provider = VolcengineProvider(api_key="fake-key", base_url="https://ark.cn-beijing.volces.com/api/v3", endpoint_id="ep-fake", timeout=5)

    with pytest.raises(ModelProviderError):
        await provider.complete([ChatMessage(role="user", content="你好")])


@pytest.mark.asyncio
@respx.mock
async def test_minimax_complete_success():
    respx.post("https://api.minimax.chat/v1/text/chatcompletion_v2").mock(
        return_value=httpx.Response(200, json={"choices": [{"message": {"content": "你好，我是MiniMax"}}]})
    )
    provider = MiniMaxProvider(api_key="fake-key", group_id="grp-fake", base_url="https://api.minimax.chat/v1", model="abab6.5s-chat", timeout=5)

    result = await provider.complete([ChatMessage(role="user", content="你好")])

    assert result.content == "你好，我是MiniMax"
    assert result.provider == "minimax"


@pytest.mark.asyncio
@respx.mock
async def test_minimax_complete_raises_on_malformed_response():
    respx.post("https://api.minimax.chat/v1/text/chatcompletion_v2").mock(return_value=httpx.Response(200, json={"unexpected": "shape"}))
    provider = MiniMaxProvider(api_key="fake-key", group_id="grp-fake", base_url="https://api.minimax.chat/v1", model="abab6.5s-chat", timeout=5)

    with pytest.raises(ModelProviderError):
        await provider.complete([ChatMessage(role="user", content="你好")])


@pytest.mark.asyncio
@respx.mock
async def test_volcengine_embed_success():
    respx.post("https://ark.cn-beijing.volces.com/api/v3/embeddings").mock(
        return_value=httpx.Response(200, json={"data": [{"embedding": [0.1, 0.2]}, {"embedding": [0.3, 0.4]}]})
    )
    provider = VolcengineProvider(
        api_key="fake-key", base_url="https://ark.cn-beijing.volces.com/api/v3", endpoint_id="ep-fake", timeout=5, embedding_endpoint_id="ep-embed-fake"
    )

    result = await provider.embed(["文本一", "文本二"])

    assert result.embeddings == [[0.1, 0.2], [0.3, 0.4]]
    assert result.provider == "volcengine"


@pytest.mark.asyncio
async def test_volcengine_embed_raises_when_not_configured():
    provider = VolcengineProvider(api_key="fake-key", base_url="https://ark.cn-beijing.volces.com/api/v3", endpoint_id="ep-fake", timeout=5)

    with pytest.raises(ModelProviderError):
        await provider.embed(["文本一"])


@pytest.mark.asyncio
@respx.mock
async def test_minimax_embed_success():
    respx.post("https://api.minimax.chat/v1/embeddings").mock(return_value=httpx.Response(200, json={"data": [{"embedding": [0.5, 0.6]}]}))
    provider = MiniMaxProvider(api_key="fake-key", group_id="grp-fake", base_url="https://api.minimax.chat/v1", model="abab6.5s-chat", timeout=5)

    result = await provider.embed(["文本一"])

    assert result.embeddings == [[0.5, 0.6]]
    assert result.provider == "minimax"
