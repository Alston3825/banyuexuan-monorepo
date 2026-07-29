from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..config import settings
from ..gateway import ModelGateway, NoProviderConfiguredError, build_providers
from ..providers.base import ModelProviderError
from ..security import verify_internal_api_key

router = APIRouter(prefix="/embeddings", tags=["embeddings"])

_gateway = ModelGateway(build_providers(settings), settings.primary_provider, settings.fallback_provider)


class CreateEmbeddingsRequest(BaseModel):
    texts: List[str]
    preferred_provider: Optional[str] = None


class CreateEmbeddingsResponse(BaseModel):
    embeddings: List[List[float]]
    provider: str
    model: str
    latency_ms: int
    used_fallback: bool


@router.post("/create", response_model=CreateEmbeddingsResponse, dependencies=[Depends(verify_internal_api_key)])
async def create(body: CreateEmbeddingsRequest) -> CreateEmbeddingsResponse:
    try:
        result = await _gateway.embed(body.texts, preferred_provider=body.preferred_provider)
    except NoProviderConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except ModelProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return CreateEmbeddingsResponse(
        embeddings=result.embeddings,
        provider=result.provider,
        model=result.model,
        latency_ms=result.latency_ms,
        used_fallback=result.used_fallback,
    )
