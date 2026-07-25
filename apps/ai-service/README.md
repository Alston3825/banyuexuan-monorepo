# apps/ai-service

伴月轩 AI / Agent 微服务（Python + FastAPI）。见《新系统开发文档》第 3.3 节：模型网关、Agent 编排、RAG 知识库均计划落在这个服务里，当前只有一个健康检查占位接口。

## 本地开发

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/uvicorn main:app --reload --port 8000
```

健康检查：`curl http://localhost:8000/health`
