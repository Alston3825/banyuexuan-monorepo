from datetime import datetime, timezone

from fastapi import FastAPI

from app.config import settings
from app.routes.chat import router as chat_router
from app.routes.care_form import router as care_form_router
from app.routes.contract import router as contract_router
from app.routes.embeddings import router as embeddings_router

if settings.environment == "production" and not settings.internal_api_key:
    # 生产环境本服务默认不能对公网暴露（见 docker-compose.prod.yml 里 ai-service 不映射端口），
    # 但即便如此，共享密钥留空 = 内网任何能连到这个端口的调用方都不设防，风险太高，直接拒绝启动
    raise RuntimeError("生产环境(ENVIRONMENT=production)必须设置 INTERNAL_API_KEY，不能留空")

app = FastAPI(title="伴月轩 AI / Agent 微服务", version="0.2.0")
app.include_router(chat_router)
app.include_router(embeddings_router)
app.include_router(contract_router)
app.include_router(care_form_router)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "ai-service",
        "time": datetime.now(timezone.utc).isoformat(),
    }
