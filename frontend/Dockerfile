# ──────────────────────────────────────────────────────────────────
# Frontend — Vue 3 SPA served by Nginx
# Two-stage: node builds dist/, nginx serves it + proxies /api + /uploads.
# ──────────────────────────────────────────────────────────────────

# ---- Stage 1: build ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Ensure no stale .js cruft competes with .ts at resolve time
RUN find src -name '*.js' -type f -delete 2>/dev/null || true
RUN npx vite build

# ---- Stage 2: nginx runtime ----
FROM nginx:1.27-alpine AS runtime

# Remove default config, install ours
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/app.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
