# syntax=docker/dockerfile:1

# 构建由 GitHub Actions（境外 runner）完成：拉 docker.io / npmjs 均就近，无需任何国内镜像改写。
# 国内 ECS 本地构建备用方案：把 FROM 换成 m.daocloud.io/docker.io/library/node:24-alpine 即可。
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# 关闭 Next.js 遥测，避免构建/运行时外发请求
ENV NEXT_TELEMETRY_DISABLED=1

# standalone 输出只包含运行所需文件
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 无状态应用：无数据库、无浏览器依赖，镜像极简

EXPOSE 3000
CMD ["node", "server.js"]
