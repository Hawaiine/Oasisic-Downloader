FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    aria2 \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install --break-system-packages --quiet yt-dlp mutagen
RUN yt-dlp --version

WORKDIR /app

# ── Stage 1: Frontend build ────────────────────────────────────────────
FROM base AS frontend
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npm run build

# ── Stage 2: Backend ───────────────────────────────────────────────────
FROM base AS backend
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts
COPY server/ ./server/
COPY --from=frontend /app/client/dist ./client/dist

# Runtime directories
RUN mkdir -p downloads tmp logs

# Default environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

VOLUME ["/app/downloads", "/app/tmp", "/app/logs"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -sf http://localhost:${PORT:-3000}/api/health || exit 1

CMD ["node", "server/index.js"]
