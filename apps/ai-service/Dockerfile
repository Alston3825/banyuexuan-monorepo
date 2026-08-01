# apps/ai-service 生产镜像（构建上下文须为 apps/ai-service 目录）
# 构建：docker build -t banyuexuan-ai-service apps/ai-service

FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 8000
# 本服务只应该被 apps/api 在内网访问，不对公网暴露（见部署手册"网络与安全"章节）
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
