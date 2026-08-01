# apps/api 生产镜像：多阶段构建（monorepo npm workspaces，构建上下文须为仓库根目录）
# 构建：docker build -f apps/api/Dockerfile -t banyuexuan-api .

FROM node:24-alpine AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/api apps/api
# @prisma/client 是"空壳"包，真正的模型类型/查询代码要靠 prisma generate 根据 schema.prisma
# 生成到 node_modules/.prisma/client 里，本地开发时这一步通常已经跑过（npm install会触发postinstall），
# 干净的docker构建上下文里必须显式跑一次，否则 `nest build` 会因为找不到模型类型而失败
RUN cd apps/api && npx prisma generate
RUN npm run build --workspace=@banyuexuan/api
# 注意：不裁剪 devDependencies——生产环境仍需要用 `npx prisma db seed` 补充权限点/工作流定义等
# 结构性配置（见 docs/生产数据库迁移与种子数据策略.md），而 seed.ts 是用 ts-node 运行的，
# ts-node/typescript 都是 devDependencies，裁掉会导致 seed 命令在生产镜像里跑不了。

FROM node:24-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /repo/apps/api/dist ./apps/api/dist
COPY --from=builder /repo/apps/api/prisma ./apps/api/prisma
COPY --from=builder /repo/apps/api/package.json ./apps/api/package.json

WORKDIR /repo/apps/api
EXPOSE 3000
# 启动前跑迁移：生产库结构变更必须走 `prisma migrate deploy`（幂等，只应用未执行过的迁移），
# 不能用 `prisma db push`（会跳过迁移历史，且可能在字段变更时静默丢数据）。
# nest build 的产物在 dist/src/main.js（tsconfig rootDir 是仓库结构决定的，不是 dist/main.js）
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
