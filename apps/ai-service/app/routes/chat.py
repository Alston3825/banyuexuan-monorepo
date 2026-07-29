from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..config import settings
from ..gateway import ModelGateway, NoProviderConfiguredError, build_providers
from ..providers.base import ChatMessage, ModelProviderError
from ..security import verify_internal_api_key

router = APIRouter(prefix="/chat", tags=["chat"])

_gateway = ModelGateway(build_providers(settings), settings.primary_provider, settings.fallback_provider)


class ChatMessageDto(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatCompleteRequest(BaseModel):
    messages: List[ChatMessageDto]
    preferred_provider: Optional[str] = None


class ChatCompleteResponse(BaseModel):
    content: str
    provider: str
    model: str
    latency_ms: int
    used_fallback: bool


@router.post("/complete", response_model=ChatCompleteResponse, dependencies=[Depends(verify_internal_api_key)])
async def complete(body: ChatCompleteRequest) -> ChatCompleteResponse:
    messages = [ChatMessage(role=m.role, content=m.content) for m in body.messages]
    try:
        result = await _gateway.complete(messages, preferred_provider=body.preferred_provider)
    except NoProviderConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except ModelProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return ChatCompleteResponse(
        content=result.content,
        provider=result.provider,
        model=result.model,
        latency_ms=result.latency_ms,
        used_fallback=result.used_fallback,
    )
