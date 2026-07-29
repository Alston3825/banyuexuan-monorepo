from datetime import datetime, timezone

from fastapi import FastAPI

from app.routes.chat import router as chat_router

app = FastAPI(title="伴月轩 AI / Agent 微服务", version="0.1.0")
app.include_router(chat_router)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "ai-service",
        "time": datetime.now(timezone.utc).isoformat(),
    }
