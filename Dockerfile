# ═══════════════════════════════════════════════════════════════════
# Warehouse Assessment — Unified Single Image
# ═══════════════════════════════════════════════════════════════════
# Combines frontend (nginx), backend (Express), and AI service
# (FastAPI) into one image. No GPU required — uses OpenAI-compatible
# API or Ollama for vision inference.
#
# Build:
#   docker build -t yuyang2001/warehouse-assessment .
#
# Run:
#   docker run -d -p 80:80 --env-file .env yuyang2001/warehouse-assessment
#
# Required env vars (pass at runtime, NOT baked into image):
#   OPENAI_BASE_URL   — OpenAI-compatible endpoint for AI features
#   OPENAI_API_KEY    — API key for the endpoint
# ═══════════════════════════════════════════════════════════════════

# ── Stage 1: Build frontend ──────────────────────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN find src -name '*.js' -type f -delete 2>/dev/null || true
RUN npx vite build

# ── Stage 2: Build backend (Debian — glibc matches runtime) ──────
FROM node:22-bookworm-slim AS backend-build
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npx tsc
# Rebuild native modules (better-sqlite3) for the runtime glibc, strip dev deps
RUN npm ci --omit=dev && npm rebuild better-sqlite3

# ── Stage 3: Runtime ─────────────────────────────────────────────
FROM python:3.11-slim-bookworm

# Node.js binary (same Debian Bookworm = glibc compatible)
COPY --from=backend-build /usr/local/bin/node /usr/local/bin/node

# System packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx supervisor ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── AI service ──
WORKDIR /app/ai-service
COPY ai-service/requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt
COPY ai-service/main.py .
RUN mkdir -p frames annotated

# ── Backend ──
WORKDIR /app/backend
COPY --from=backend-build /build/dist/ ./dist/
COPY --from=backend-build /build/node_modules/ ./node_modules/
COPY --from=backend-build /build/package.json .
RUN mkdir -p data uploads

# ── Frontend static files ──
COPY --from=frontend-build /build/dist/ /var/www/html/

# ── Nginx config ──
RUN rm -f /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf
COPY nginx-unified.conf /etc/nginx/conf.d/app.conf

# ── Supervisor config ──
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

WORKDIR /app
EXPOSE 80

# Persistent data volumes (mount these for data retention across restarts)
VOLUME ["/app/backend/data", "/app/backend/uploads"]

CMD ["supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
