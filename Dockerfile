# =============================================================================
# Oasisic Downloader — Docker 多阶段构建
# =============================================================================
# 构建: docker build -t oasisic-downloader .
# 运行: docker compose up -d
# =============================================================================
FROM node:22-bookworm-slim AS base

# ── 系统依赖 ────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    aria2 \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --break-system-packages --quiet yt-dlp mutagen \
    && yt-dlp --version

WORKDIR /app

# ── Stage 1: 前端构建 ──────────────────────────────────────────────────
FROM base AS frontend

COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm install --no-audit --no-fund

COPY client/ ./client/
RUN cd client && npm run build && rm -rf node_modules

# ── Stage 2: 后端生产镜像 ─────────────────────────────────────────────
FROM base AS production

# 后端依赖（独立层，利用 build cache）
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund

# 后端代码
COPY server/ ./server/

# 前端构建产物
COPY --from=frontend /app/client/dist ./client/dist

# 运行时目录
RUN mkdir -p downloads tmp logs

# 环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV YTDLP_PATH=/usr/local/bin/yt-dlp

EXPOSE 3000

# 持久化卷
VOLUME ["/app/downloads", "/app/tmp", "/app/logs"]

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:${PORT:-3000}/api/health || exit 1

CMD ["node", "server/index.js"]