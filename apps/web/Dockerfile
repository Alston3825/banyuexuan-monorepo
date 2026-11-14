# apps/web 生产镜像：vite build 产物由 nginx 静态托管（构建上下文须为仓库根目录）
# 构建：docker build -f apps/web/Dockerfile -t banyuexuan-web .

FROM node:24-alpine AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci

COPY apps/web apps/web
RUN npm run build --workspace=@banyuexuan/web

FROM nginx:1.27-alpine AS runtime
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
