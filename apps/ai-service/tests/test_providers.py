import httpx
import pytest
import respx

from app.providers.base import ChatMessage, ModelProviderError
from app.providers.deepseek import DeepSeekProvider
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
async def test_minimax_complete_raises_readable_error_on_base_resp_failure():
    """真实联调复现过：HTTP层200，但账户余额不足时choices是null，错误信息在
    base_resp里（status_code=1008），不检查这个会在null上取下标炸出无意义的
    TypeError，把"余额不足"这种本该让人一眼看懂的错误吞掉。"""
    respx.post("https://api.minimax.chat/v1/text/chatcompletion_v2").mock(
        return_value=httpx.Response(
            200,
            json={"choices": None, "base_resp": {"status_code": 1008, "status_msg": "insufficient balance"}},
        )
    )
    provider = MiniMaxProvider(api_key="fake-key", group_id="grp-fake", base_url="https://api.minimax.chat/v1", model="abab6.5s-chat", timeout=5)

    with pytest.raises(ModelProviderError, match="insufficient balance"):
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


@pytest.mark.asyncio
@respx.mock
async def test_deepseek_complete_success():
    respx.post("https://api.deepseek.com/chat/completions").mock(
        return_value=httpx.Response(200, json={"choices": [{"message": {"content": "你好，我是DeepSeek"}}]})
    )
    provider = DeepSeekProvider(api_key="fake-key", base_url="https://api.deepseek.com", model="deepseek-chat", timeout=5)

    result = await provider.complete([ChatMessage(role="user", content="你好")])

    assert result.content == "你好，我是DeepSeek"
    assert result.provider == "deepseek"


@pytest.mark.asyncio
@respx.mock
async def test_deepseek_complete_raises_on_malformed_response():
    respx.post("https://api.deepseek.com/chat/completions").mock(return_value=httpx.Response(200, json={"unexpected": "shape"}))
    provider = DeepSeekProvider(api_key="fake-key", base_url="https://api.deepseek.com", model="deepseek-chat", timeout=5)

    with pytest.raises(ModelProviderError):
        await provider.complete([ChatMessage(role="user", content="你好")])


@pytest.mark.asyncio
async def test_deepseek_embed_always_raises():
    """DeepSeek平台没有公开的embedding接口，embed()应该直接抛错走降级链路，不是漏实现。"""
    provider = DeepSeekProvider(api_key="fake-key", base_url="https://api.deepseek.com", model="deepseek-chat", timeout=5)

    with pytest.raises(ModelProviderError):
        await provider.embed(["文本一"])
