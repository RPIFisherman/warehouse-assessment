# Warehouse Assessment

A mobile-first, tap-driven warehouse assessment demo. Built as a standalone proof-of-concept showing how facility inspections can be reduced from a 30-minute desktop form to a 5-minute mobile walkthrough where everything defaults to "OK" and only exceptions require interaction.

This is a self-contained reference implementation. The intended consumer is the WMS team — read the [PRD](./PRD.md) for the full spec and acceptance criteria before integrating into the production WMS.

## Quick Start

```bash
cd warehouse-assessment
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
npm install
npm run dev
```

Open `http://localhost:5173` in Chrome (use DevTools mobile viewport for the phone experience).

The backend runs on port 3001, the frontend on port 5173. The frontend dev server proxies `/api` and `/uploads` to the backend.

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
| Process orchestration | concurrently |

The frontend uses a CSS variable-based design system ported from the WMS web app, with the UNIS blue brand and dark mode by default.

## Project Structure

```
warehouse-assessment/
├── package.json                       # Root: orchestrates frontend + backend dev servers
├── README.md                          # This file
├── PRD.md                             # Product requirements document
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── data/                          # SQLite DB file (created at runtime, gitignored)
│   ├── uploads/                       # Photo uploads (created at runtime, gitignored)
│   └── src/
│       ├── index.ts                   # Express server, CORS, route mounting, static files
│       ├── db.ts                      # SQLite schema, seed data, connection singleton
│       └── routes/
│           ├── templates.ts           # GET /api/templates, /:id, /:id/items-by-zone
│           ├── assessments.ts         # POST/GET/PUT /api/assessments
│           ├── issues.ts              # POST/GET/PUT/DELETE /api/issues
│           ├── photos.ts              # POST /api/photos (multer upload)
│           └── settings.ts            # CRUD for categories, items, zones, facilities, presets
│
└── frontend/
    ├── package.json
    ├── vite.config.ts                 # Proxy /api and /uploads to backend
    ├── tailwind.config.js             # Tailwind config with WMS semantic color tokens
    ├── tsconfig.json
    ├── tsconfig.app.json
    ├── postcss.config.js
    ├── env.d.ts
    ├── index.html                     # Root HTML, applies "dark unis-blue" theme classes
    └── src/
        ├── main.ts                    # App bootstrap, Element Plus + Pinia + router
        ├── App.vue                    # Root component
        ├── router/
        │   └── index.ts               # Vue Router setup, lazy-loaded routes
        ├── stores/
        │   └── assessment.ts          # Pinia store for in-progress assessment state
        ├── api/
        │   ├── client.ts              # Axios instance (baseURL: /api)
        │   └── index.ts               # All API functions (typed)
        ├── types/
        │   └── index.ts               # TypeScript interfaces
        ├── styles/
        │   ├── index.scss             # Global styles, mobile overrides, scrollbar
        │   └── design-system/
        │       └── color.scss         # CSS variables for theme (light/dark/brand)
        ├── components/
        │   └── layout/
        │       ├── MobileShell.vue    # App shell wrapper (header + content + bottom nav)
        │       └── BottomNav.vue      # 4-tab bottom navigation
        └── views/
            ├── HomeView.vue                   # Dashboard with recent assessments
            ├── AssessmentWizard.vue           # 3-step setup (building type → categories → facility)
            ├── AssessmentWalk.vue             # Core view: zone-by-zone tap-driven checklist
            ├── AssessmentComplete.vue         # Score summary + email button + zone breakdown
            ├── IssuesDashboard.vue            # Issue tracking with combined filters
            ├── IssueDetailView.vue            # Single issue editor (owner, due, status)
            ├── HistoryView.vue                # Past completed assessments
            └── SettingsView.vue               # 5 tabs: Categories, Items, Zones, Facilities, Presets
```

## Key Features

### Default-OK Pattern
Every checklist item defaults to OK with a green checkmark. Assessors only tap items where they find an issue. Tapping opens an inline issue capture form (severity → photos → comment) that closes back to the list when saved.

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

### Inline Photo Display
Once an issue is saved, its photo thumbnails render directly under the item label even when collapsed — assessors can see what they captured without re-opening the form.

### Full-Screen Photo Zoom
Tap any thumbnail anywhere in the app (walk view, complete page, issue detail) to open a full-screen overlay with the photo at native resolution. Tap outside or the X to close.

### Editable Issues
Saved issues can be re-opened and fully edited: severity, comment, and photos. Changes save via API immediately.

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
- **Facilities**: warehouse locations (the wizard selects from this list, no free text)
- **Building Type Presets**: which categories are pre-checked when starting an assessment for each building type (New / Current / Closing / Consolidating)

### Issue Tracking Dashboard
Combined filters: status (Open / In Progress / Closed) × severity (Low / Medium / High) × facility. Result count updates live; "Clear all" resets all filters.

### Email Report Export
The Complete page has a "Send Report by Email" button that opens the user's email client with a pre-filled subject and body containing the score, zone breakdown with emoji indicators (🟢/🟡/🔴), each issue with severity/owner/due date, and a deep link back to the report.

## Database Schema

SQLite, single file at `backend/data/warehouse-assessment.db`. Tables created on first run; default data seeded if empty.

| Table | Purpose |
|---|---|
| `template` | Assessment categories (e.g. Safety, Facility) |
| `checklist_item` | Items within a template, grouped by zone |
| `zone_config` | Configurable facility zones |
| `facility` | Warehouse locations |
| `building_type_preset` | Default category selection per building type |
| `assessment` | Assessment instances |
| `issue` | Issues logged during an assessment (with `photo_filenames` JSON array) |

See [PRD.md](./PRD.md) section 6 for the complete column definitions.

## API Endpoints

All endpoints under `/api`. See [PRD.md](./PRD.md) section 5 for request/response shapes.

```
GET    /api/templates
GET    /api/templates/:id
GET    /api/templates/:id/items-by-zone

POST   /api/assessments
GET    /api/assessments
GET    /api/assessments/:id
PUT    /api/assessments/:id/complete

POST   /api/issues
GET    /api/issues               # supports tracking_status, severity, facility_name, assessment_id filters
GET    /api/issues/:id
PUT    /api/issues/:id           # update owner, due_date, tracking_status, comment, severity, photo_filenames
DELETE /api/issues/:id

POST   /api/photos               # multipart upload, returns { filename, url }

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

## Routes

| Path | View | Purpose |
|---|---|---|
| `/` | HomeView | Dashboard with recent assessments and start button |
| `/assess/new` | AssessmentWizard | 3-step setup wizard |
| `/assess/:id/walk` | AssessmentWalk | Core zone-by-zone walkthrough |
| `/assess/:id/complete` | AssessmentComplete | Score summary, email export |
| `/issues` | IssuesDashboard | Filterable issue list |
| `/issues/:id` | IssueDetailView | Single issue editor |
| `/history` | HistoryView | Past completed assessments |
| `/settings` | SettingsView | Configuration management |

## Mobile Considerations

- Min tap target: 44px for all interactive elements
- Bottom navigation bar with safe-area inset padding for notch phones
- Native camera capture via `<input capture="environment">` (no upload dialog friction)
- Responsive container max-width 768px, centered on larger screens
- `touch-action: manipulation` and disabled `-webkit-tap-highlight-color` for native feel
- Dark theme default to match WMS production look

## Reset / Clean State

Delete the SQLite DB to start fresh with seeded defaults:

```bash
rm -f backend/data/warehouse-assessment.db*
```

Photos are stored in `backend/uploads/` and persist independently.

## Deployment Notes

For sharing the demo via Cloudflare Tunnel (e.g. `https://warehouse-assessment.example.com`):

1. Add the public hostname to `frontend/vite.config.ts` under `server.allowedHosts`
2. Add the public hostname to the CORS whitelist in `backend/src/index.ts`
3. Use Cloudflare Access (Zero Trust) to restrict access by email — no code changes needed

## See Also

- **[PRD.md](./PRD.md)** — Full product requirements with acceptance criteria, data shapes, and integration guidance for the WMS team.
