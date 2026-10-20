import json

import httpx
import pytest
import respx

from app.config import Settings
from app.providers.base import ModelProviderError
from app.providers.volcengine_plan import VolcenginePlanVision
from app.providers.volcengine_vision import ArkVision
from app.vision.factory import make_vision

BASE = "https://ark.cn-beijing.volces.com/api/v3"


def _ok(text="识别结果"):
    return httpx.Response(200, json={"model": "real", "choices": [{"message": {"content": text}}]})


@pytest.mark.asyncio
@respx.mock
async def test_read_images_uses_openai_format_and_bearer():
    route = respx.post(f"{BASE}/chat/completions").mock(return_value=_ok())
    text, model = await ArkVision("k", BASE, "ep-img", 5).read_images([b"abc"], "读一下")
    assert (text, model) == ("识别结果", "real")
    req = route.calls[0].request
    body = json.loads(req.content)
    assert req.headers["authorization"] == "Bearer k" and body["model"] == "ep-img"
    parts = body["messages"][0]["content"]
    assert parts[0]["type"] == "image_url" and parts[0]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert parts[1] == {"type": "text", "text": "读一下"}


@pytest.mark.asyncio
@respx.mock
async def test_read_video_uses_video_model_and_accepts_url():
    route = respx.post(f"{BASE}/chat/completions").mock(return_value=_ok("视频内容"))
    v = ArkVision("k", BASE, "ep-img", 5, video_model="ep-vid")
    await v.read_video("https://example.com/a.mp4", "描述")
    body = json.loads(route.calls[0].request.content)
    assert body["model"] == "ep-vid"
    assert body["messages"][0]["content"][0] == {"type": "video_url", "video_url": {"url": "https://example.com/a.mp4"}}
    await v.read_video(b"xyz", "描述")
    assert json.loads(route.calls[1].request.content)["messages"][0]["content"][0]["video_url"]["url"].startswith("data:video/mp4;base64,")


@pytest.mark.asyncio
@respx.mock
async def test_read_images_raises_after_retries(monkeypatch):
    async def no_sleep(_):
        return None
    monkeypatch.setattr("app.providers.volcengine_vision.asyncio.sleep", no_sleep)
    respx.post(f"{BASE}/chat/completions").mock(return_value=httpx.Response(401, json={"error": "bad"}))
    with pytest.raises(ModelProviderError):
        await ArkVision("k", BASE, "ep", 5).read_images([b"a"], "x")


def test_factory_prefers_ark_then_plan_then_none():
    base = dict(_env_file=None)
    assert make_vision(Settings(**base)) is None
    plan = Settings(volcengine_plan_api_key="p", volcengine_plan_model="m", **base)
    assert isinstance(make_vision(plan), VolcenginePlanVision)
    both = Settings(volcengine_plan_api_key="p", volcengine_plan_model="m", volcengine_api_key="k", volcengine_vision_model="ep", **base)
    assert isinstance(make_vision(both), ArkVision)
