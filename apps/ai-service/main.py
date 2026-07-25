from datetime import datetime, timezone

from fastapi import FastAPI

app = FastAPI(title="伴月轩 AI / Agent 微服务", version="0.0.1")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "ai-service",
        "time": datetime.now(timezone.utc).isoformat(),
    }
