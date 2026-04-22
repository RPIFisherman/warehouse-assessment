# ──────────────────────────────────────────────────────────────────
# Backend — Express + TypeScript + SQLite
# Two-stage build: compile with full toolchain, run lean on node:22-alpine.
# better-sqlite3 is a native module, so we need build-essentials in stage 1.
# ──────────────────────────────────────────────────────────────────

# ---- Stage 1: build ----
FROM node:22-alpine AS build
WORKDIR /app

RUN apk add --no-cache python3 make g++ git

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# ---- Stage 2: runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app

# Rebuild native deps against the runtime alpine's libs
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev && npm rebuild better-sqlite3 \
    && apk del make g++ \
    && rm -rf /root/.npm

COPY --from=build /app/dist ./dist

# Runtime dirs — mounted as volumes in compose for persistence
RUN mkdir -p /app/data /app/uploads

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/index.js"]
