# apps/ai-service 生产镜像（构建上下文须为 apps/ai-service 目录）
# 构建：docker build -t banyuexuan-ai-service apps/ai-service

FROM python:3.12-slim
WORKDIR /app

# 默认走腾讯云的PyPI镜像：官方 files.pythonhosted.org 从境内网络访问经常连接超时/中断，
# 部署到腾讯云服务器构建这个镜像时踩过坑（pip下载大包时ReadTimeoutError）。可通过
# --build-arg PIP_INDEX_URL=... 换回官方源或其他镜像，不强制绑定这一个源。
ARG PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple
ENV PIP_INDEX_URL=${PIP_INDEX_URL}

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 8000
# 本服务只应该被 apps/api 在内网访问，不对公网暴露（见部署手册"网络与安全"章节）
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
