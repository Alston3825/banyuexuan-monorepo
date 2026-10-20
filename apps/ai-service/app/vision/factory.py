from typing import Optional, Union

from ..config import Settings
from ..providers.volcengine_plan import VolcenginePlanVision
from ..providers.volcengine_vision import ArkVision

VisionClient = Union[ArkVision, VolcenginePlanVision]

NOT_CONFIGURED = "未配置读图模型（VOLCENGINE_API_KEY + VOLCENGINE_VISION_MODEL，或 VOLCENGINE_PLAN_API_KEY / VOLCENGINE_PLAN_MODEL）"


def make_vision(settings: Settings) -> Optional[VisionClient]:
    """读图客户端：优先用方舟按量计费通道；没配才退回 Agent Plan 专属通道；都没配返回 None。"""
    if settings.volcengine_api_key and settings.volcengine_vision_model:
        return ArkVision(
            api_key=settings.volcengine_api_key,
            base_url=settings.volcengine_base_url,
            model=settings.volcengine_vision_model,
            timeout=settings.vision_request_timeout_seconds,
            video_model=settings.volcengine_video_model,
        )
    if settings.volcengine_plan_api_key and settings.volcengine_plan_model:
        return VolcenginePlanVision(
            api_key=settings.volcengine_plan_api_key,
            base_url=settings.volcengine_plan_base_url,
            model=settings.volcengine_plan_model,
            timeout=settings.vision_request_timeout_seconds,
        )
    return None
