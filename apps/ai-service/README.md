# apps/ai-service

伴月轩 AI / Agent 微服务（Python + FastAPI）。见《新系统开发文档》第 3.3 节：模型网关、Agent 编排、RAG 知识库均计划落在这个服务里。

当前已实现：**模型网关**——统一封装火山引擎方舟(Volcengine Ark)与 MiniMax 两家境内合规供应商（母婴健康数据不允许出境，见业务规则确认记录#10），支持主/备供应商热切换与降级：
- `POST /chat/complete`：对话生成，供 apps/api 的智能客服/护理异常建议 Agent 调用
- `POST /embeddings/create`：文本向量化，供 apps/api 的知识库检索（RAG）调用

Agent 编排层的自主多步工具调用（完整 MCP 协议）尚未实现，见业务规则确认记录"P4模型网关"章节的范围收窄说明。

## 本地开发

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/uvicorn main:app --reload --port 8000
```

健康检查：`curl http://localhost:8000/health`

## 配置真实密钥并手动冒烟测试

复制 `.env.example` 为 `.env`，填入你的火山引擎方舟 API Key + 推理接入点ID（`VOLCENGINE_ENDPOINT_ID`，格式如 `ep-xxxxxxxx-xxxxx`，在方舟控制台创建）和/或 MiniMax API Key + GroupId，然后：

```bash
./.venv/bin/uvicorn main:app --reload --port 8000

curl -X POST http://localhost:8000/chat/complete \
  -H "Content-Type: application/json" \
  -H "X-Internal-Api-Key: <你在.env里配置的INTERNAL_API_KEY，留空则不校验>" \
  -d '{"messages": [{"role": "user", "content": "你好，请用一句话自我介绍"}]}'
```

再测一下 embedding（RAG知识库检索用，需要额外配置 `VOLCENGINE_EMBEDDING_ENDPOINT_ID` 或使用 MiniMax 默认的 `MINIMAX_EMBEDDING_MODEL`）：

```bash
curl -X POST http://localhost:8000/embeddings/create \
  -H "Content-Type: application/json" \
  -H "X-Internal-Api-Key: <你在.env里配置的INTERNAL_API_KEY，留空则不校验>" \
  -d '{"texts": ["伴月轩月子中心提供42天基础套餐服务"]}'
```

**重要**：`app/providers/volcengine.py` 与 `app/providers/minimax.py` 里的请求路径/字段是按官方文档记载的格式编写的，尚未用真实密钥做过端到端联调（密钥属于敏感信息，不应粘贴进 AI 对话）。首次配置真实密钥后，务必按上面的 curl 命令手动跑一次，如果报错请对照供应商最新文档调整这两个文件里的请求格式。

## 单元测试

```bash
./.venv/bin/pytest -v
```

模型网关的主/备切换逻辑与两个供应商适配器均用 mock HTTP（respx）覆盖，不需要真实密钥即可运行。
