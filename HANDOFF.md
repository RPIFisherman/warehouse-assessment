# Session Handoff -- feat/ai-video-assessment

**Date**: 2026-04-12
**Branch**: `feat/ai-video-assessment` (not yet merged to `main`)
**Author context**: This session added multi-provider OAuth, an AI video/photo analysis sidecar, AI auto-comments on issues, a model switcher UI, Docker deployment, and consolidated environment variables. The IAM OAuth2 integration was completed in a prior session and is already on `main`.

---

## What was done this session

1. **Multi-provider OAuth (IAM + Google + GitHub)** -- Extended the existing IAM-only OAuth to support Google and GitHub as peer providers. Provider selection on the login screen, shared callback handling, and per-provider token exchange on the backend.

2. **AI Video Scan (Florence-2 + ffmpeg + bounding boxes)** -- New Python FastAPI sidecar (`ai-service/`) that accepts images or video frames, runs Microsoft Florence-2-large for object detection, and returns annotated frames with bounding boxes.

3. **AI Auto-Comment on issues** -- When an issue is created or updated with photos but no human comment, the backend automatically calls the AI sidecar to describe the photos and attaches an `[AI Comment]` to the issue. Triggers on both POST (create) and PUT (update) routes.

4. **3-backend AI model switcher** -- Runtime-switchable AI backends: Florence-2 (local, always available), qwen3-vl (via Ollama), and OpenAI-compatible relay (gpt-4.1/gpt-5). The sidecar probes Ollama and OpenAI every 10 seconds and drops unreachable backends from the available list. A new "AI Model" tab in Settings lets the user switch at runtime.

5. **Docker deployment** -- `docker-compose.yml` with three services (backend, frontend, ai-service), individual Dockerfiles, and an nginx.conf for the frontend container. Uses `host.docker.internal` for reaching host-side Ollama/OpenAI relay.

6. **Consolidated .env** -- Replaced 6 scattered `.env` files with a single root `.env` and a root `.env.example`. Backend, frontend (`vite.config.ts` patched), and ai-service all read from the root.

---

## File map

### Multi-provider OAuth
| File | Status | Role |
|------|--------|------|
| `backend/src/auth/oauthProviders.ts` | new | Provider registry (IAM, Google, GitHub configs) |
| `backend/src/auth/middleware.ts` | modified | Token validation, multi-provider session lookup |
| `backend/src/auth/iamClient.ts` | existing | IAM-specific OIDC client (unchanged this session) |
| `backend/src/routes/auth.ts` | modified | `/auth/login/:provider`, `/auth/callback/:provider` routes |
| `frontend/src/utils/auth.ts` | modified | Provider-aware token storage and redirect helpers |
| `frontend/src/api/client.ts` | modified | Axios interceptor attaches provider-specific token |
| `frontend/src/views/LoginView.vue` | modified | Provider selection buttons |
| `frontend/src/views/AuthCallbackView.vue` | modified | Reads `?state=` to determine provider, calls backend |

### AI Service (sidecar)
| File | Status | Role |
|------|--------|------|
| `ai-service/main.py` | new | FastAPI app: Florence-2 inference, model listing, Ollama/OpenAI proxy |
| `ai-service/requirements.txt` | new | Python deps (fastapi, transformers, torch, Pillow, etc.) |
| `ai-service/Dockerfile` | new | Python 3.11 + CUDA base image for GPU inference |

### AI Auto-Comment
| File | Status | Role |
|------|--------|------|
| `backend/src/routes/issues.ts` | modified | POST and PUT both call `tryGenerateAIComment` when photos present + no human comment |

### AI Video Scan UI
| File | Status | Role |
|------|--------|------|
| `frontend/src/views/AIAssessmentView.vue` | new | Video upload, frame extraction, annotation display |
| `frontend/src/components/layout/BottomNav.vue` | modified | Added 5th tab for AI Assessment |
| `frontend/src/router/index.ts` | modified | `/ai-assessment` route |

### Model Switcher UI
| File | Status | Role |
|------|--------|------|
| `frontend/src/views/SettingsView.vue` | modified | New "AI Model" tab with runtime backend selection |

### Docker
| File | Status | Role |
|------|--------|------|
| `docker-compose.yml` | new | 3 services, `host.docker.internal` for host access |
| `backend/Dockerfile` | new | Node 20 + Express |
| `frontend/Dockerfile` | new | Node build stage + nginx runtime |
| `frontend/nginx.conf` | new | SPA fallback, API proxy to backend container |
| `ai-service/Dockerfile` | new | (see AI Service above) |
| `.dockerignore` | new | Excludes node_modules, .env, etc. |

### Environment consolidation
| File | Status | Role |
|------|--------|------|
| `.env` | new (root) | Single source of truth for all services |
| `.env.example` | new (root) | Template with placeholder values |
| `frontend/vite.config.ts` | modified | Reads root `.env` via `envDir` or manual dotenv load |

---

## How to run

### 1. Local development (`npm run dev`)
Starts backend (Express on 3001), Vite dev server (5173), and AI sidecar (8100) concurrently.
```bash
cp .env.example .env   # fill in real values
npm run dev
```

### 2. Preview mode (`npm run preview`)
Same as dev but uses `vite preview` instead of `vite dev` -- serves the production build with proper CSP headers. Safer for Cloudflare tunnel exposure.
```bash
npm run build          # builds frontend
npm run preview
```

### 3. Docker (`docker compose up`)
Full containerized deployment. Frontend served via nginx on port 8080.
```bash
cp .env.example .env   # fill in real values
docker compose up -d --build
```

---

## Services and ports

| Service | Port | Purpose |
|---------|------|---------|
| backend | 3001 | Express + SQLite + OAuth endpoints |
| frontend | 5173 (dev/preview) / 8080 (docker) | Vite dev or Vite preview or Nginx |
| ai-service | 8100 | Florence-2 FastAPI sidecar |
| (external) Ollama | 11434 or user-configured | qwen3-vl backend |
| (external) OpenAI relay | user-configured | gpt-4.1 / gpt-5 etc. |

---

## Known quirks / gotchas

### vue-tsc .js cruft
`vue-tsc -b` emits `.js` files next to `.ts` sources in `frontend/src/`. Vite resolves `.js` before `.ts`, so builds can silently use stale transpiled output instead of current source. If changes seem to not take effect:
```bash
find frontend/src -name '*.js' -delete
```
These files are already in `.gitignore`.

### OpenAI relay requires streaming
Some OpenAI-compatible proxy servers drop the `content` field in non-streaming responses. The AI sidecar always uses `stream: true` for the OpenAI backend and collects SSE delta chunks to avoid this. Do not change the OpenAI path to non-streaming without testing against your specific proxy.

### Cloudflare Managed Challenge blocks programmatic access
The tunnel URL has Cloudflare bot protection enabled. `curl` from CLI will get a 403, but real browsers pass the challenge. If IAM back-channel logout needs to work programmatically, add a **Skip Managed Challenge** WAF rule for `/api/auth/session/clear` in the Cloudflare dashboard.

### Docker host networking for external services
Inside containers, Ollama and the OpenAI relay running on the Docker host are reachable via `host.docker.internal`. This is configured in `docker-compose.yml` via:
```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

### OAuth callback state parameter
Google and GitHub encode the provider name in the `?state=` query param on the OAuth callback. IAM does not -- it uses the redirect URI itself to deliver the `?code=`. The frontend `AuthCallbackView` reads `state` to determine which provider's token exchange endpoint to call on the backend. Do not remove the `state` parameter from Google/GitHub flows.

### PUT path triggers AI auto-comment (not just POST)
The common user flow is: save an issue empty, then add photos later via the "add photo to existing issue" flow. If only POST triggered AI auto-comment generation, this flow would be missed. Both POST and PUT routes in `backend/src/routes/issues.ts` now call `tryGenerateAIComment`.

---

## OAuth credentials configured

The following providers have credentials in `.env`. **Do not commit or share the actual values.**

| Provider | Status | Identifier hint |
|----------|--------|-----------------|
| IAM | Configured | client_id starts with `stag-wms...` (platform.item.com approval 300155966761078784) |
| Google | Configured | client_id ends with `.apps.googleusercontent.com` |
| GitHub | Configured | client_id starts with `Ov23li...` |

---

## Security audit results

An external security review found 7 issues. **6 were fixed in code, 3 are conscious scope deferrals that MUST be addressed before production.**

### Fixed

| # | Finding | Severity | Fix applied |
|---|---------|----------|-------------|
| 1 | AI sidecar unauthenticated + arbitrary path read | High | `AI_SIDECAR_SECRET` shared-secret auth on sidecar; `ALLOWED_PHOTO_DIR` path validation; Docker `expose` (no host port) |
| 2 | Unrestricted file upload (stored XSS) | High | Multer `fileFilter` accepts only `image/*` MIME types; extension forced from MIME |
| 3 | OAuth CSRF (static state param) | Medium | `state` is now `provider:random_nonce` (5-min TTL); validated on callback |
| 4 | Error message leakage + debug trace to /tmp | Low | Auth routes return generic messages; trace file writing removed |
| 5 | Missing nginx security headers | Medium | Added `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` |

### NOT fixed — must address before production

| # | Finding | Severity | Why deferred | Production fix |
|---|---------|----------|-------------|----------------|
| A | No resource-level authorization | High | PoC is single-tenant. `created_by_user_id` is stored but queries don't filter by it. | Add `WHERE created_by_user_id = ?` on reads; gate `/settings/*` behind admin role from `userRoles`. |
| B | localStorage tokens (XSS vector) | Medium | Standard SPA pattern for PoC; mitigated by upload file-type restriction. | Switch to HttpOnly/Secure/SameSite cookies or BFF session pattern. |
| C | AI sidecar full memory video read | Medium | `UploadFile.read()` buffers entire file. 200MB nginx limit = 200MB RAM spike. Auth now blocks unauthenticated abuse. | Stream to disk with `aiofiles`; or lower nginx `client_max_body_size` to 50MB. |
| D | `trust_remote_code=True` (supply chain) | Low | Required by Florence-2 custom architecture. | Pin `FLORENCE_MODEL_PATH` to vetted snapshot hash in .env; do not use HuggingFace auto-download in production. |
| E | Uploads served from same origin | Low | Photo filenames are UUIDs, hard to guess. Upload MIME is now restricted. | Serve from a separate cookieless domain or use signed URLs. |
| F | No rate limiting | Medium | Dev/demo environment with limited users. | Add `express-rate-limit` on `/api/auth/*`, `/api/photos`; nginx `limit_req` on `/api/ai/*`. |

### Files changed for security fixes

- `ai-service/main.py` — `SidecarAuthMiddleware` + `ALLOWED_PHOTO_DIR` path validation
- `backend/src/routes/photos.ts` — `fileFilter` MIME whitelist + forced extension
- `backend/src/auth/oauthProviders.ts` — `generateState()` / `validateState()` with random nonce + TTL
- `backend/src/routes/auth.ts` — state validation on `/login-by-code` + generic error messages
- `backend/src/routes/issues.ts` — `X-AI-Auth` header sent to sidecar; trace file removed
- `frontend/nginx.conf` — security headers
- `docker-compose.yml` — `expose: 8100` (removed host port mapping)
- `.env.example` — added `AI_SIDECAR_SECRET` and `ALLOWED_PHOTO_DIR`

---

## What's NOT done / next steps

1. **Commit and open PR** -- The working tree on `feat/ai-video-assessment` has uncommitted changes covering all the work above. Stage, commit, and open a PR against `main`.

2. **Update Jira ticket** -- WISE2018-35782 should get a final session summary comment.

3. **Test Docker build end-to-end** -- `docker compose config` validates, but an actual `docker compose up --build` was not run this session. Run it and fix any build failures.

4. **Session persistence for AI model cache** -- The `ai_hf_cache` Docker volume handles Florence-2 model downloads, but a first-run in a clean environment will take time to download the model. Consider a pre-pull step or init container.

5. **Verify .env consolidation in Vite dev mode** -- Vite dev mode reads `.env.local` before falling back. Verify the root-read logic in `frontend/vite.config.ts` works correctly in dev mode (not just preview/build).

6. **AI auto-comment edge cases** -- Test behavior when the AI sidecar is unreachable (should fail silently without blocking issue save) and when photos are removed on a PUT (should not re-trigger).

---

## Commit history on this branch (since main)

```
e0a07ac style: notify we are on IAM Stage
2c54f93 chore: gitignore vue-tsc -b js artifacts in src
ed51c2c feat(ui): personalize home greeting and prefill assessor name
ffe693a chore(security): use vite preview for tunnel exposure
38b9d81 feat(auth): integrate IAM OAuth2 with API protection
```

All Docker, multi-provider OAuth, AI service, AI auto-comment, model switcher, and .env consolidation work is currently uncommitted in the working tree.
