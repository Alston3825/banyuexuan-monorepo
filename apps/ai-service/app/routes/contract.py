import base64
import binascii
import time
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..config import settings
from ..providers.base import ModelProviderError
from ..vision.factory import NOT_CONFIGURED, make_vision
from ..security import verify_internal_api_key
from ..vision.contract_extractor import extract_contract

router = APIRouter(prefix="/contract", tags=["contract"])


class ContractFileDto(BaseModel):
    name: str
    data_b64: str


class ContractExtractRequest(BaseModel):
    files: List[ContractFileDto]


@router.post("/extract", dependencies=[Depends(verify_internal_api_key)])
async def extract(body: ContractExtractRequest) -> Dict[str, Any]:
    """纸质合同（PDF/照片）读图识别。返回：结构化数据、需人工核对的提醒、逐页图片(JPEG base64)。"""
    vision = make_vision(settings)
    if vision is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=NOT_CONFIGURED)
    try:
        files = [(f.name, base64.b64decode(f.data_b64)) for f in body.files]
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="文件内容不是有效的 base64") from exc

    started = time.monotonic()
    try:
        result = await extract_contract(files, vision)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ModelProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    result["latency_ms"] = int((time.monotonic() - started) * 1000)
    return result
