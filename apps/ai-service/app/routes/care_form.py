import base64
import binascii
import io
import time
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from PIL import Image, ImageOps
from pydantic import BaseModel

from ..config import settings
from ..providers.base import ModelProviderError
from ..providers.volcengine_plan import VolcenginePlanVision
from ..security import verify_internal_api_key
from ..vision import pages as _pages  # noqa: F401  导入即注册 HEIC 读取器
from ..vision.care_form_extractor import extract_care_form

router = APIRouter(prefix="/care-form", tags=["care-form"])


class FileDto(BaseModel):
    name: str
    data_b64: str


class CareFormExtractRequest(BaseModel):
    form_title: str
    description: str = ""
    fields: List[Dict[str, Any]]
    files: List[FileDto]


class NormalizeRequest(BaseModel):
    data_b64: str
    long_side: int = 2400


@router.post("/extract", dependencies=[Depends(verify_internal_api_key)])
async def extract(body: CareFormExtractRequest) -> Dict[str, Any]:
    """护理纸质表格读图识别。字段说明书随请求传入，返回 {data, warnings, model}。"""
    if not settings.volcengine_plan_api_key or not settings.volcengine_plan_model:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="未配置读图模型（VOLCENGINE_PLAN_API_KEY / VOLCENGINE_PLAN_MODEL）")
    try:
        files = [(f.name, base64.b64decode(f.data_b64)) for f in body.files]
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="文件内容不是有效的 base64") from exc
    vision = VolcenginePlanVision(
        api_key=settings.volcengine_plan_api_key,
        base_url=settings.volcengine_plan_base_url,
        model=settings.volcengine_plan_model,
        timeout=settings.vision_request_timeout_seconds,
    )
    started = time.monotonic()
    try:
        result = await extract_care_form(files, vision, body.form_title, body.description, body.fields)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ModelProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    result["latency_ms"] = int((time.monotonic() - started) * 1000)
    return result


@router.post("/normalize", dependencies=[Depends(verify_internal_api_key)])
def normalize(body: NormalizeRequest) -> Dict[str, str]:
    """把一张照片（含苹果 HEIC）转成方向正确的 JPEG，浏览器才能直接显示。"""
    try:
        raw = base64.b64decode(body.data_b64)
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    except Exception as exc:  # noqa: BLE001  PIL 对坏图会抛多种异常
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不是可识别的图片文件") from exc
    w, h = img.size
    scale = body.long_side / max(w, h)
    if scale < 1:
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88)
    return {"jpeg_b64": base64.b64encode(buf.getvalue()).decode()}
