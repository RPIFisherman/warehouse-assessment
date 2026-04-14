# Warehouse Assessment

A mobile-first, tap-driven warehouse assessment demo with AI-powered video analysis. A self-contained proof-of-concept showing how facility inspections can be reduced from a long desktop form to a sub-5-minute mobile walkthrough where everything defaults to "OK" and only exceptions require interaction.

This repository is a reference implementation intended to show how a default-OK, zone-guided assessment app can work on a phone, augmented with Florence-2 / qwen3-vl / OpenAI vision models for automated video scanning and AI-generated issue comments.

## Quick Start

### Option A: Single Docker image (recommended)

No GPU required. Pull and run one image with all services inside:

```bash
docker run -d -p 80:80 --name warehouse-assessment \
  -e OPENAI_BASE_URL=http://your-openai-endpoint/v1 \
  -e OPENAI_API_KEY=your-key \
  -e OPENAI_MODEL=gpt-4.1 \
  -v wa-data:/app/backend/data \
  -v wa-uploads:/app/backend/uploads \
  yuyang2001/warehouse-assessment:latest
```

With an env file (recommended — configure OAuth + AI + networking):

```bash
cp .env.example .env   # fill in your values
docker run -d -p 80:80 --env-file .env \
  -v wa-data:/app/backend/data \
  -v wa-uploads:/app/backend/uploads \
  yuyang2001/warehouse-assessment:latest
```

With NVIDIA GPU (adds Florence-2 local inference with bounding boxes):

```bash
docker run -d --gpus all -p 80:80 --env-file .env \
  -v wa-data:/app/backend/data \
  -v wa-uploads:/app/backend/uploads \
  -v wa-hf-cache:/root/.cache/huggingface \
  yuyang2001/warehouse-assessment:gpu
```

| Image | Tag | GPU | Base | Size |
|---|---|---|---|---|
| `yuyang2001/warehouse-assessment` | `latest` | No | `python:3.11-slim` | ~1.2 GB |
| `yuyang2001/warehouse-assessment` | `gpu` | CUDA 12.6 | `nvidia/cuda` | ~10 GB |

### Option B: Docker Compose (multi-container, for development)

```bash
git clone https://github.com/RPIFisherman/warehouse-assessment.git
cd warehouse-assessment
cp .env.example .env
# Edit .env — fill in at least one OAuth provider (IAM, Google, or GitHub)
docker compose up -d --build          # no GPU
# or with GPU:
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

Services start on:
- **Frontend** (nginx): http://localhost:8080
- **Backend** (Express): http://localhost:3001
- **AI Service** (FastAPI): http://localhost:8100

### Option B: Local development (npm)

```bash
git clone https://github.com/RPIFisherman/warehouse-assessment.git
cd warehouse-assessment
cp .env.example .env
# Edit .env with your OAuth credentials
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
npm install
```

#### Run without AI (no GPU required)

```bash
npm run dev:no-ai
```

Open `http://localhost:5173` in Chrome (use DevTools mobile viewport for the phone experience).

#### Run with AI (no GPU — API relay mode)

```bash
pip install fastapi uvicorn[standard] python-multipart Pillow httpx python-dotenv
npm run dev
```

Set `OPENAI_BASE_URL` in `.env` to point at an OpenAI-compatible endpoint. The AI service auto-detects no GPU and uses the external API for vision inference.

#### Run with AI + GPU (Florence-2 local inference)

```bash
pip install fastapi uvicorn[standard] python-multipart Pillow httpx python-dotenv torch 'transformers>=4.44,<4.47' timm einops
npm run dev
```

This starts three services concurrently:
- **Backend** (Express): port 3001
- **Frontend** (Vite): port 5173
- **AI Service** (FastAPI): port 8100

With a GPU, Florence-2-large (~1.5 GB) loads into GPU memory on startup (~5-10s). Without a GPU, the AI service starts in API-relay mode and defaults to the OpenAI or Ollama backend configured in `.env`.

## Environment Configuration

All three services read from a **single root `.env` file**. Copy `.env.example` to `.env` and fill in your values. No per-directory `.env` files are needed.

```bash
cp .env.example .env
```

### OAuth Providers

The app supports three OAuth providers. Configure whichever ones you need -- the login page automatically shows buttons only for providers that have credentials set in `.env`.

| Provider | Required env vars | Where to register |
|---|---|---|
| IAM (item.pub) | `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_IAM_DOMAIN` | https://platform.item.com/approval |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | https://console.cloud.google.com/apis/credentials |
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | https://github.com/settings/applications/new |

Each provider needs a redirect URI registered. The callback URL pattern is:

```
https://your-app.example.com/auth/callback
```

Google appends `?state=google` automatically; GitHub appends `?code=...&state=github`. IAM uses a `state` parameter with the provider name (`iam`).

### AI Service Configuration (GPU-optional)

The AI service runs without an NVIDIA GPU. Set at least one external backend:

```bash
# OpenAI-compatible API (recommended for no-GPU deployments)
OPENAI_BASE_URL=http://your-endpoint/v1
OPENAI_MODEL=gpt-4.1
OPENAI_API_KEY=your-key

# Ollama (optional — leave empty to disable)
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_VL_MODEL=qwen3-vl:32b

# Florence-2 sidecar URL (for backend -> sidecar calls)
FLORENCE_SIDECAR_URL=http://localhost:8100
```

When a GPU is present and `torch`+`transformers` are installed, Florence-2 loads automatically. Otherwise the service defaults to the OpenAI or Ollama backend.

### Networking

```bash
ALLOWED_HOSTS=my-tunnel.trycloudflare.com
ALLOWED_ORIGINS=https://my-tunnel.trycloudflare.com
```

## Docker Deployment

### Single image (recommended for production)

Both `yuyang2001/warehouse-assessment:latest` (CPU) and `:gpu` tags bundle all three services (nginx + Express + FastAPI) into one container managed by supervisord. See [Quick Start](#quick-start) above for run commands.

### Docker Compose (development)

The `docker-compose.yml` defines three separate containers (no GPU required):

| Service | Base image | Host port | Internal port | Purpose |
|---|---|---|---|---|
| `frontend` | nginx:alpine | 8080 | 80 | Serves built SPA, proxies `/api` and `/api/ai` |
| `backend` | node:22-alpine | 3001 | 3001 | Express API + SQLite |
| `ai` | python:3.11-slim | — (internal only) | 8100 | AI inference sidecar (API-relay mode) |

For GPU + Florence-2 support, use the compose override:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

This swaps the `ai` service to an `nvidia/cuda:12.6.3` base with torch+transformers. Requires the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Florence-2 weights (~1.5 GB) are cached in the `ai_hf_cache` volume.

### External Services (not containerized)

Ollama and OpenAI-compatible relays run **outside** Docker. Containers reach the host machine via `host.docker.internal` (configured via `extra_hosts: host.docker.internal:host-gateway` in docker-compose.yml).

Example `.env` entries for Docker deployment:

```bash
OLLAMA_HOST=http://host.docker.internal:43411
OPENAI_BASE_URL=http://host.docker.internal:7077/v1
FLORENCE_SIDECAR_URL=http://ai:8100
```

### Persistent Volumes

| Volume | Path (single image) | Purpose |
|---|---|---|
| `wa-data` | `/app/backend/data` | SQLite database |
| `wa-uploads` | `/app/backend/uploads` | Photo uploads |
| `wa-hf-cache` | `/root/.cache/huggingface` | Florence-2 weights (GPU image only) |

### Nginx Reverse Proxy

The frontend container runs nginx (`frontend/nginx.conf`) that:
- Serves the built Vue SPA with SPA fallback (`try_files $uri /index.html`)
- Proxies `/api/ai/*` to the `ai` service (port 8100), stripping the `/api/ai` prefix
- Proxies `/api/*` to the `backend` service (port 3001)
- Proxies `/uploads/*` to the backend for photo serving
- Sets a 200 MB upload limit and 5-minute proxy timeout for video processing

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | Vue 3.4 + TypeScript + Vite 5 |
| UI library | Element Plus 2.8 + Tailwind CSS 3.4 |
| State management | Pinia |
| Routing | Vue Router 4 |
| Backend framework | Express 4 + TypeScript |
| Database | SQLite via better-sqlite3 |
| File uploads | Multer |
| Authentication | Multi-provider OAuth2 (IAM + Google + GitHub) |
| AI inference (local) | Florence-2-large (GPU, ~1s/image, bounding boxes) |
| AI inference (Ollama) | qwen3-vl:32b (optional, ~15-20s/image, semantic) |
| AI inference (cloud) | OpenAI-compatible relay (optional, configurable model name) |
| AI service | Python FastAPI + uvicorn |
| Video processing | ffmpeg (frame extraction) |
| Containerization | Docker (single image or 3-service compose) |
| Frontend server (Docker) | Nginx (reverse proxy + SPA serving) |
| Process orchestration | concurrently (local dev) |

## Project Structure

```
warehouse-assessment/
├── .env.example                           # Template for unified env config (copy to .env)
├── .env                                   # Your local config (gitignored)
├── Dockerfile                             # Unified single image (CPU, no GPU)
├── Dockerfile.gpu-unified                 # Unified single image (NVIDIA GPU)
├── docker-compose.yml                     # 3-service stack (no GPU)
├── docker-compose.gpu.yml                 # GPU override for docker-compose
├── nginx-unified.conf                     # nginx config for single-image mode
├── supervisord.conf                       # Process manager for single image
├── package.json                           # Root: orchestrates all dev servers
├── README.md                              # This file
│
├── ai-service/                            # Python FastAPI sidecar for vision AI
│   ├── Dockerfile                         # CPU-only (python:3.11-slim, lightweight)
│   ├── Dockerfile.gpu                     # NVIDIA CUDA (Florence-2 support)
│   ├── main.py                            # GPU-optional: Florence-2 + qwen3-vl + OpenAI inference
│   ├── requirements.txt                   # Base Python dependencies
│   ├── requirements-gpu.txt               # GPU-only deps (torch, transformers)
│   ├── frames/                            # Temp: extracted video frames (gitignored)
│   └── annotated/                         # Temp: frames with bounding boxes (gitignored)
│
├── backend/
│   ├── Dockerfile                         # node:22-alpine
│   ├── package.json
│   ├── tsconfig.json
│   ├── data/                              # SQLite DB (gitignored)
│   ├── uploads/                           # Photo uploads (gitignored)
│   └── src/
│       ├── index.ts                       # Express server, middleware stack, route mounting
│       ├── db.ts                          # SQLite schema, migrations, seed data
│       ├── auth/
│       │   ├── oauthProviders.ts          # Multi-provider OAuth2 (IAM, Google, GitHub)
│       │   ├── iamClient.ts              # IAM OAuth2 upstream API wrapper
│       │   └── middleware.ts             # requireAuth — validates Bearer tokens per provider
│       └── routes/
│           ├── auth.ts                    # OAuth2 endpoints (authorize-url, login-by-code, etc.)
│           ├── templates.ts               # GET /api/templates
│           ├── assessments.ts             # CRUD /api/assessments
│           ├── issues.ts                  # CRUD /api/issues + AI auto-comment trigger
│           ├── photos.ts                  # POST /api/photos (multer upload)
│           └── settings.ts               # CRUD for categories, items, zones, facilities, presets
│
└── frontend/
    ├── Dockerfile                         # Multi-stage build: node (build) + nginx (serve)
    ├── nginx.conf                         # Reverse proxy config for Docker deployment
    ├── package.json
    ├── vite.config.ts                     # Proxy: /api->Express, /api/ai->AI sidecar, /uploads->Express
    └── src/
        ├── main.ts                        # App bootstrap
        ├── App.vue                        # Root component
        ├── router/index.ts                # Routes + auth guard
        ├── stores/assessment.ts           # Pinia store for walk state
        ├── api/
        │   ├── client.ts                  # Axios + auth interceptors (Bearer token, 401 refresh)
        │   └── index.ts                  # All API functions (typed)
        ├── utils/auth.ts                  # Token storage, login/logout, refresh single-flight
        ├── types/index.ts                 # TypeScript interfaces
        ├── components/layout/
        │   ├── MobileShell.vue            # App shell + user avatar/logout dropdown
        │   └── BottomNav.vue              # 5-tab bottom navigation
        └── views/
            ├── LoginView.vue                      # Multi-provider sign-in (IAM, Google, GitHub)
            ├── AuthCallbackView.vue               # OAuth2 callback handler
            ├── HomeView.vue                       # Dashboard with personalized greeting
            ├── AIAssessmentView.vue               # AI Video Scan (upload -> analyze -> results)
            ├── AssessmentWizard.vue                # 3-step setup (building type -> categories -> facility)
            ├── AssessmentWalk.vue                  # Core view: zone-by-zone checklist
            ├── AssessmentComplete.vue              # Score summary + email export
            ├── IssuesDashboard.vue                # Issue tracking with combined filters
            ├── IssueDetailView.vue                # Single issue editor
            ├── HistoryView.vue                    # Past completed assessments
            └── SettingsView.vue                   # 6 tabs: Categories, Items, Zones, Facilities, Presets, AI Model
```

## Key Features

### Default-OK Pattern
Every checklist item defaults to OK with a green checkmark. Assessors only tap items where they find an issue. Tapping opens an inline issue capture form (severity -> photos -> comment) that closes back to the list when saved.

### Authentication (Multi-Provider OAuth2)

The login page shows sign-in buttons for each configured OAuth provider:

- **IAM** (item.pub Central/IAM) -- corporate SSO via Authorization Code Flow
- **Google** -- Google OIDC with `openid profile email` scopes
- **GitHub** -- GitHub OAuth with `read:user user:email` scopes

Buttons for unconfigured providers (missing client ID/secret in `.env`) are hidden automatically. The provider is encoded in the OAuth `state` parameter so the callback knows which token endpoint to call. An `X-Auth-Provider` header on API requests tells the backend middleware which provider's userinfo endpoint to use for token validation.

All `/api/*` endpoints (except `/api/auth/*`) require a valid Bearer token. The frontend handles token refresh automatically via axios interceptors. Token validation results are cached for 5 minutes by SHA-256 fingerprint to avoid per-request upstream calls.

### AI Video Scan
Record or upload a warehouse walkthrough video and the AI analyzes it frame-by-frame against configurable safety questions. Uses Florence-2 for phrase grounding with bounding box overlays, or qwen3-vl for semantic descriptions.

The flow:
1. Navigate to the **AI Scan** tab
2. Record or upload a video
3. Edit assessment questions (4 defaults provided)
4. Tap **Analyze Video** -- the sidecar extracts frames via ffmpeg and runs inference
5. Results show per-frame status (OK / issue), AI captions, and annotated images with bounding boxes

### AI Auto-Comment

When an assessor saves an issue with photos but **leaves the comment empty**, the backend automatically calls the AI sidecar's `/describe-photos` endpoint. The AI analyzes each photo in context (zone, checklist label, severity) and generates a descriptive comment prefixed with `[AI Comment]` to distinguish it from human input.

This works on both code paths:
- **POST `/api/issues`** -- triggered when creating a new issue with photos and no comment
- **PUT `/api/issues/:id`** -- triggered when adding photos to an existing issue that still has no comment

If the AI model is unreachable or not confident, no comment is generated and the field stays empty.

### AI Model Switcher

Settings -> AI Model tab provides a runtime dropdown to switch between three inference backends:

| Backend | Speed | Features | Requirement |
|---|---|---|---|
| **Florence-2** (default) | ~1s/image | Phrase grounding, bounding boxes, generic descriptions | Local NVIDIA GPU |
| **qwen3-vl:32b** (via Ollama) | ~15-20s/image | Semantic understanding, safety reasoning, no bboxes | Ollama running on host with `OLLAMA_HOST` set |
| **OpenAI-compatible** (e.g. gpt-4.1, gpt-5) | Varies | Configurable model name, uses streaming API | `OPENAI_BASE_URL` set and reachable |

The AI service probes all backends every 10 seconds (cached). **Unreachable backends are automatically hidden** from the Settings dropdown -- if Ollama is down or `OPENAI_BASE_URL` is empty, those options simply don't appear. Switching takes effect immediately with no restart required.

### Severity-Driven Visual System
Issues are color-coded by severity throughout the app:

| Severity | Border | Icon | Tag color |
|---|---|---|---|
| OK | Green | CircleCheck | Green badge |
| Low | Soft yellow (70% opacity) | Warning triangle | Yellow tag |
| Medium | Yellow | Warning triangle | Yellow tag |
| High | Red | CircleCloseFilled | Red tag |

### Multi-Photo Capture per Issue
Each issue can hold multiple photos. The capture form shows a grid of thumbnails with a red X to remove each, plus an "Add" button that opens the native camera (`<input type="file" accept="image/*" capture="environment">`). Photos persist with the issue and can be viewed/added/deleted later by re-tapping the item.

### Zone-Guided Walk
Assessors progress through configured zones (Receiving, Picking, Packing, Dock, Restrooms, Stage, Projects) via horizontal pill tabs. Completed zones show a green check. A "Next Zone" button at the bottom advances; on the last zone the button becomes "Complete Assessment".

### Auto-Scoring (Green / Yellow / Red)
On completion the backend computes:
- `overall_score` = `((total_items - total_issues) / total_items) * 100`
- `overall_rating` = `RED` if any HIGH issue or score < 70, `YELLOW` if score < 90, `GREEN` otherwise

### Configurable Templates
Settings page lets non-developers manage:
- **Categories**: assessment groupings (e.g. Safety, Facility, Operations)
- **Checklist Items**: items grouped by zone within each category
- **Zones**: facility area definitions
- **Facilities**: warehouse locations (controlled dropdown, no free text)
- **Building Type Presets**: which categories are pre-checked per building type
- **AI Model**: switch between Florence-2, qwen3-vl, and OpenAI-compatible inference backends

### Issue Tracking Dashboard
Combined filters: status (Open / In Progress / Closed) x severity (Low / Medium / High) x facility. Result count updates live; "Clear all" resets all filters.

### Email Report Export
The Complete page has a "Send Report by Email" button that opens the user's email client with a pre-filled subject and body containing the score, zone breakdown with emoji indicators, each issue with severity/owner/due date, and a deep link back to the report.

## API Endpoints

### Authentication (public -- no token required)

```
GET    /api/auth/authorize-url         # Returns login URL (?provider=iam|google|github)
POST   /api/auth/login-by-code         # Exchange code for tokens + user info
POST   /api/auth/refresh-token         # Refresh expired access token
GET    /api/auth/logout-url            # Returns logout URL (plain text)
POST   /api/auth/session/clear         # OIDC back-channel logout (called by IAM)
```

### Feature endpoints (Bearer token required)

```
GET    /api/templates
GET    /api/templates/:id
GET    /api/templates/:id/items-by-zone

POST   /api/assessments
GET    /api/assessments
GET    /api/assessments/:id
PUT    /api/assessments/:id/complete

POST   /api/issues                     # Auto-triggers AI comment if photos + no comment
GET    /api/issues
GET    /api/issues/:id
PUT    /api/issues/:id                 # Auto-triggers AI comment if new photos + no comment
DELETE /api/issues/:id

POST   /api/photos                     # multipart upload, returns { filename, url }

GET    /api/settings/categories
POST   /api/settings/categories
PUT    /api/settings/categories/:id
DELETE /api/settings/categories/:id
GET    /api/settings/categories/:id/items
POST   /api/settings/items
PUT    /api/settings/items/:id
DELETE /api/settings/items/:id
GET    /api/settings/zones
POST   /api/settings/zones
PUT    /api/settings/zones/:code
DELETE /api/settings/zones/:code
GET    /api/settings/facilities
POST   /api/settings/facilities
PUT    /api/settings/facilities/:id
DELETE /api/settings/facilities/:id
GET    /api/settings/presets
PUT    /api/settings/presets/:buildingType
```

### AI Service (proxied via `/api/ai/*` -> sidecar on port 8100)

```
GET    /api/ai/health                  # Model status, GPU info, active model
GET    /api/ai/config                  # Current model config + available models list
POST   /api/ai/config                  # Switch active model { model: "florence-2" | "qwen3-vl:32b" | "<openai-model>" }
POST   /api/ai/assess-video            # Multipart: video + questions + frame_interval
POST   /api/ai/describe-photos         # JSON: photo_paths + context -> [AI Comment]
GET    /api/ai/frames/:session/:file   # Serve extracted/annotated frame images
```

## Routes

| Path | View | Purpose |
|---|---|---|
| `/login` | LoginView | Multi-provider sign-in (IAM, Google, GitHub) |
| `/auth/callback` | AuthCallbackView | OAuth2 code exchange (public) |
| `/` | HomeView | Dashboard with personalized greeting |
| `/ai-scan` | AIAssessmentView | AI Video Scan wizard |
| `/assess/new` | AssessmentWizard | 3-step manual assessment setup |
| `/assess/:id/walk` | AssessmentWalk | Zone-by-zone walkthrough |
| `/assess/:id/complete` | AssessmentComplete | Score summary, email export |
| `/issues` | IssuesDashboard | Filterable issue list |
| `/issues/:id` | IssueDetailView | Single issue editor |
| `/history` | HistoryView | Past completed assessments |
| `/settings` | SettingsView | Configuration + AI model management |

## Database Schema

SQLite, single file at `backend/data/warehouse-assessment.db`. Tables created on first run; default data seeded if empty. Additive migrations run via `ensureColumn` (idempotent ALTER TABLE guarded by PRAGMA table_info).

| Table | Purpose |
|---|---|
| `template` | Assessment categories (e.g. Safety, Facility) |
| `checklist_item` | Items within a template, grouped by zone |
| `zone_config` | Configurable facility zones |
| `facility` | Warehouse locations |
| `building_type_preset` | Default category selection per building type |
| `assessment` | Assessment instances (`created_by_user_id` tracks who) |
| `issue` | Issues logged during an assessment (`created_by_user_id`, `photo_filenames` JSON array) |

## Mobile Considerations

- Min tap target: 44px for all interactive elements
- 5-tab bottom navigation bar with safe-area inset padding for notch phones
- Native camera capture via `<input capture="environment">` (no upload dialog friction)
- Responsive container max-width 768px, centered on larger screens
- `touch-action: manipulation` and disabled `-webkit-tap-highlight-color` for native feel
- Dark theme default

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start backend + frontend + AI service (all three) |
| `npm run dev:no-ai` | Start backend + frontend only (no GPU required) |
| `npm run build` | Build frontend to `frontend/dist/` |
| `npm run preview` | Build + start backend + vite preview + AI service |
| `npm run start:preview` | Start backend + vite preview (no build, no AI) |
| `npm run start:preview:ai` | Start backend + vite preview + AI service |

## Reset / Clean State

Delete the SQLite DB to start fresh with seeded defaults:

```bash
rm -f backend/data/warehouse-assessment.db*
```

Photos are stored in `backend/uploads/` and persist independently.

## Deployment Notes

### Local development (tunnel)

For sharing the demo via a public URL (e.g. Cloudflare Tunnel, ngrok):

1. Configure your hostname in `.env` via `ALLOWED_HOSTS` and `ALLOWED_ORIGINS` -- no source code edits required.
2. Use `npm run preview` (not `npm run dev`) to serve via `vite preview` -- this eliminates dev server attack surfaces.
3. Set `OLLAMA_HOST` environment variable if your Ollama server runs on a non-default port (e.g. `OLLAMA_HOST=http://127.0.0.1:43411`).
4. The AI service binds to `0.0.0.0:8100` -- ensure this port is reachable from the Vite proxy.

### Docker deployment

**Single image** (recommended):
1. Copy `.env.example` to `.env` and configure OAuth + AI backend credentials.
2. `docker run -d -p 80:80 --env-file .env -v wa-data:/app/backend/data -v wa-uploads:/app/backend/uploads yuyang2001/warehouse-assessment:latest`
3. Access the app at http://localhost.

**Docker Compose** (development):
1. Copy `.env.example` to `.env` and configure.
2. Run `docker compose up -d --build` (no GPU) or add `-f docker-compose.gpu.yml` for GPU support.
3. Access the app at http://localhost:8080.
4. For host services (Ollama, OpenAI relay), use `host.docker.internal`:
   ```bash
   OPENAI_BASE_URL=http://host.docker.internal:7077/v1
   OLLAMA_HOST=http://host.docker.internal:43411
   ```

## Security Notes

This demo has been through a security review. The following items were found and addressed:

### Fixed in code

| Finding | Severity | Fix |
|---|---|---|
| AI sidecar unauthenticated | High | Shared-secret `X-AI-Auth` header between backend and sidecar. Set `AI_SIDECAR_SECRET` in `.env`. Docker only exposes sidecar internally (no host port mapping). |
| Arbitrary file read via `/describe-photos` | High | `photo_paths` validated against `ALLOWED_PHOTO_DIR` — paths outside the uploads directory are rejected. |
| Unrestricted file upload (stored XSS) | High | Multer `fileFilter` only accepts `image/*` MIME types. Extensions forced from MIME, not client filename. |
| OAuth CSRF (static state param) | Medium | `state` is now `provider:random_nonce` with 5-minute TTL, validated on callback. |
| Error message leakage | Low | Auth endpoints return generic error messages, not `String(e)`. Debug trace file removed. |
| Missing security headers | Medium | Nginx adds `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. |

### Known limitations (must fix before production)

These are **not fixed** in this demo and **must be addressed** before any real deployment:

1. **No resource-level authorization.** Any authenticated user can read ALL assessments/issues and mutate global settings. `created_by_user_id` is stored but not enforced in queries. **Production fix:** add `WHERE created_by_user_id = ?` filters on read endpoints; gate `/api/settings/*` behind an admin role from `userRoles`/`userPermissions`.

2. **localStorage tokens (not HttpOnly cookies).** Access tokens in localStorage are vulnerable to XSS. The upload restriction mitigates the most dangerous vector (stored active content), but a full fix requires HttpOnly/Secure/SameSite cookies or a BFF session pattern.

3. **AI sidecar reads full video upload into memory.** `UploadFile.read()` buffers the entire file. Combined with the 200 MB nginx limit, a large upload consumes 200 MB of RAM. **Production fix:** stream to disk with `aiofiles`, or lower the limit.

4. **`trust_remote_code=True` for Florence-2.** Required by the model's custom architecture. Mitigate by pinning to the exact snapshot hash via `FLORENCE_MODEL_PATH` env var.

5. **Uploads served from same origin.** Photo files at `/uploads/*` are public and served from the same origin as the app. **Production fix:** serve from a separate cookieless domain or use signed URLs.

6. **No rate limiting.** Auth, upload, and AI endpoints have no request rate limits. **Production fix:** add rate limiting middleware (e.g. `express-rate-limit`) on `/api/auth/*`, `/api/photos`, and nginx-level limits on `/api/ai/*`.

## License

This demo is provided as-is for reference purposes.
