# 伴月轩月子中心管理系统

多门店月子中心管理系统。架构与规划详见 [`docs/`](./docs)：
- 《伴月轩月子中心管理系统_新系统开发文档_V1.0.docx》—— 功能架构与技术架构
- 《伴月轩月子中心管理系统_软件项目开发计划_V1.0.docx》—— 分期路线图与里程碑

当前处于 **P0 阶段（平台底座）** 的起步：仓库骨架已就绪，尚未接入真实腾讯云资源、尚未创建远程仓库/CI-CD。

## 目录结构

```
apps/
  web/          管理后台 / 客户端 —— Vue 3 + TypeScript + Vite（响应式 + PWA）
  api/          主业务后端 —— NestJS + TypeScript
  ai-service/   AI / Agent 微服务 —— Python + FastAPI
packages/
  shared/       前后端共享 TypeScript 类型
docs/           已审核的架构文档与项目计划
docker-compose.yml   本地开发用 MySQL + Redis（不连接腾讯云）
```

## 本地开发

首次执行：

```bash
npm install
```

分别启动三个服务：

```bash
npm run dev:web     # http://localhost:5173
npm run dev:api      # http://localhost:3000/api/v1/health
cd apps/ai-service && ./.venv/bin/uvicorn main:app --reload --port 8000   # http://localhost:8000/health
```

起本地数据库（可选，接具体业务功能时才需要）：

```bash
docker-compose up -d
```

## 环境变量

每个服务的 `.env.example` 只列变量名，不含真实值。真实的数据库连接串、模型 API Key 等只写在本地未提交的 `.env` 文件，或未来 CI/CD 的 GitHub Secrets 里。

## 下一步

见《软件项目开发计划》第 7 章「下一步行动」：创建远程代码仓库、打通 CI/CD 到腾讯云、启动 P0 的多门店/账号/RBAC/工作流引擎开发。
