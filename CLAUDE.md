# FitGlue Web

Hybrid dual-architecture site served from Firebase Hosting:
- **React SPA** (Vite 6) at `/app/**` — authenticated dashboard
- **Static marketing site** (Skier SSG) at `/` — landing pages, guides, help articles

## Stack

| Concern | Technology |
|---------|-----------|
| Runtime | React 19 + TypeScript 5.3 (strict) |
| Build (app) | Vite 6 |
| Build (marketing) | Skier 3 (custom SSG, Handlebars templates) |
| State | Jotai 2 (atomic, global) |
| Routing | React Router 6 (SPA only, basename `/app`) |
| API client | openapi-fetch (typed from generated schema) |
| Real-time data | Firestore SDK (listeners for reads) |
| Auth | Firebase Authentication |
| Error tracking | Sentry |
| Hosting | Firebase Hosting → Cloud Run rewrites |
| Node version | **22+** (enforced via `.nvmrc` and `engines`) |

## Key Commands

```bash
npm run dev           # Build dev + firebase serve (full site, localhost:5000)
npm run dev:static    # Skier watch mode only (marketing site, localhost:5000)
npm run build         # Production build (Vite app + Skier static → dist/)
npm run lint          # ESLint on src/
npm run preflight     # tsc --noEmit + lint + build (run before pushing)
npm run gen-api       # Regenerate REST types from ../server/docs/api/openapi.yaml
npm run deploy        # firebase deploy --only hosting (dev project)
npm run deploy:prod   # firebase deploy --only hosting (prod project)
```

## Directory Structure

```
web/
├── src/
│   ├── app/                  # React SPA
│   │   ├── App.tsx           # All route definitions
│   │   ├── main.tsx          # Entry point (Jotai Provider)
│   │   ├── components/       # UI components (library/, dashboard/, admin/, wizard/, etc.)
│   │   ├── pages/            # Route page components
│   │   ├── hooks/            # Custom hooks (useApi, useAuth, useRealtime*, usePlugin*)
│   │   ├── state/            # Jotai atoms (authState, userState, pipelinesState, etc.)
│   │   ├── services/         # API service wrappers (ActivitiesService, InputsService)
│   │   ├── utils/            # Formatters, tier utils, color utils
│   │   ├── infrastructure/   # Sentry init
│   │   └── data/             # Static data (smartNudges)
│   ├── shared/
│   │   ├── firebase.ts       # Firebase SDK init
│   │   └── api/              # API clients + generated schemas
│   │       ├── client.ts               # Authenticated client (/api/v2/*)
│   │       ├── admin-client.ts         # Admin client (/api/admin/*)
│   │       ├── public-client.ts        # Public client (no auth)
│   │       ├── schema.ts               # Generated — DO NOT EDIT manually
│   │       ├── schema-client.ts        # Generated — DO NOT EDIT manually
│   │       ├── schema-admin.ts         # Generated — DO NOT EDIT manually
│   │       └── schema-public.ts        # Generated — DO NOT EDIT manually
│   └── types/pb/             # Generated protobuf types — DO NOT EDIT manually
│
├── pages/                    # Handlebars marketing pages (Skier input)
├── partials/                 # Shared header/footer partials
├── templates/                # Dynamic page templates (connections, boosters)
├── content/help-articles/    # Markdown help articles
├── assets/                   # CSS, images, static JS
├── public/                   # SPA entry HTML, PWA manifest, auth pages
├── tasks/                    # Custom Skier build tasks
├── scripts/                  # Dev/deploy utility scripts
├── terraform/                # GCP infrastructure (Firebase Hosting, IAM)
├── skier.tasks.mjs           # Skier build pipeline definition
├── vite.config.ts            # Vite build config
└── firebase.json             # Hosting config (rewrites, cache headers)
```

## Architecture

### Data Strategy

- **Reads**: Firestore real-time listeners (via `useFirestoreListener` + Jotai atoms)
- **Writes**: REST API via openapi-fetch (`/api/v2/**` routes to `api-client` Cloud Run service)

### Auth Flow

1. Firebase Auth SDK initializes (config loaded from `/__/firebase/init.json` at runtime — provided by Firebase Hosting)
2. `onAuthStateChanged` updates `userAtom` and `authLoadingAtom`
3. Protected routes check `userAtom` + `profile.accessEnabled`
4. Every API request gets a Firebase ID token via auth middleware in `client.ts`

### Jotai State

All global state lives in `src/app/state/`. Each atom file owns a domain:
- `authState.ts` — Firebase User, auth loading
- `userState.ts` — User profile + billing tier
- `pipelinesState.ts` — Pipeline configs (Firestore synced)
- `activitiesState.ts` — Pipeline runs, activity stats, unsynchronized entries
- `integrationsState.ts` — Connection statuses
- `inputsState.ts` — Pending user inputs (mid-pipeline pauses)
- `pluginRegistryState.ts` — All sources/enrichers/destinations
- `adminState.ts` — Admin console state

Each domain atom has a corresponding `useRealtime*` hook that attaches a Firestore listener and writes to the atom.

### API Clients

Three openapi-fetch clients, all in `src/shared/api/`:
- `client.ts` — Authenticated (Bearer token), base `/api/v2`
- `admin-client.ts` — Admin endpoints, base `/api/admin`
- `public-client.ts` — No auth required, public registry/showcase

Never call the API directly — always use one of these clients or the service wrappers in `src/app/services/`.

### Error Tracking & Logging

Never call `Sentry.captureException()` or `console.error()` directly in application code. Use `logger.error(message, error)` from `src/shared/logger.ts` — it combines console output and Sentry capture in one call. Enforced by ESLint `no-restricted-properties`.

The only files exempt from this rule (they may import Sentry directly):
- `src/shared/logger.ts`
- `src/app/infrastructure/sentry.ts`
- `src/app/firebase-messaging-sw.ts`
- `src/app/hooks/useApi.ts`
- `src/app/App.tsx`
- `src/auth.ts`

### Test Coverage

Coverage is measured honestly across the **whole** `src/` tree (`coverage.all` + `include: src/**`), not just files a test imports — so the reported number reflects every source file. Generated code (`schema*`, `types/pb`), static `app/data`, and test files are excluded.

Thresholds in `vitest.config.ts` are a **ratchet floor** set to the current whole-codebase coverage. They are enforced by `npm run test:coverage`, which `npm run preflight` (and the pre-push hook) runs — so a drop below the floor fails the build. **When you add tests, raise the floor** to the new level so coverage can only go up.

Every source file should have at least *some* test coverage; many still sit at 0% and need at least a smoke test. Improve coverage incrementally and ratchet the thresholds up as you go.

### Marketing Site (Skier)

Skier is a custom Node SSG. The build pipeline in `skier.tasks.mjs`:
1. Fetches plugin registry from API at build time (cached in `.cache/registry.json`)
2. Transforms registry data for templates
3. Generates static pages from `pages/`, `templates/`, `content/`
4. Bundles CSS with cache hash
5. Outputs to `dist/`

The Vite and Skier outputs are merged: `dist/` contains both the React app and all static pages.

## React App Routes (App.tsx)

All routes have basename `/app`. Protected routes require Firebase auth + `profile.accessEnabled`.

| Path | Page |
|------|------|
| `/` | DashboardPage |
| `/activities` | ActivitiesListPage |
| `/activities/:id` | ActivityDetailPage |
| `/activities/unsynchronized/:pipelineExecutionId` | UnsynchronizedDetailPage |
| `/inputs` | PendingInputsPage |
| `/connections` | ConnectionsPage |
| `/connections/:id` | ConnectionDetailPage |
| `/connections/:id/setup` | ConnectionSetupPage |
| `/connections/:id/success` | ConnectionSuccessPage |
| `/connections/:id/error` | ConnectionErrorPage |
| `/settings/pipelines` | PipelinesPage |
| `/settings/pipelines/new` | PipelineWizardPage |
| `/settings/pipelines/:pipelineId/edit` | PipelineEditPage |
| `/settings/account` | AccountSettingsPage |
| `/settings/enricher-data` | EnricherDataPage |
| `/settings/subscription` | SubscriptionPage |
| `/settings/upgrade` | SubscriptionPage (alias) |
| `/settings/showcase` | ShowcaseManagementPage |
| `/settings/integrations` | ConnectionsPage (legacy redirect) |
| `/admin` | AdminPage (admin only) |

## Common Tasks

### Add a new SPA route
1. Create page component in `src/app/pages/`
2. Add route to `src/app/App.tsx`

### Add a help article
1. Create markdown file in `content/help-articles/{section}/`
2. Skier will auto-generate the page at next build

### Add a marketing page
1. Create Handlebars template in `pages/`
2. Register in `skier.tasks.mjs` (add to the appropriate `generatePagesTask`)

### Update API types after server changes
```bash
npm run gen-api
```
This reads `../server/docs/api/openapi.yaml`. Commit the generated files in `src/shared/api/schema*.ts`.

### Update protobuf types after server proto changes
Run `make generate` in `server/` — it writes directly to `../web/src/types/pb/`.

## Firebase Rewrites (firebase.json)

| Path | Cloud Run Service |
|------|------------------|
| `/api/v2/**` | api-client |
| `/api/admin/**` | api-admin |
| `/api/public/**` | api-public |
| `/api/webhooks/**` | api-webhook |
| `/api/mobile/**` | api-webhook |
| `/auth/**` | api-client |
| `/hooks/**` | api-webhook |
| `/app/**` | `/app/index.html` (SPA) |

## Environment Variables

- `VITE_FIREBASE_VAPID_KEY` — FCM web push key
- `VITE_SENTRY_DSN` — Sentry DSN (optional, skip in dev)
- `VITE_ENVIRONMENT` — `dev` or `prod` label for Sentry
- Firebase config is NOT in env vars — it's loaded at runtime from `/__/firebase/init.json`

## Build Output

```bash
npm run build  →  dist/
                  ├── app/          (React SPA)
                  ├── auth/         (static auth pages)
                  ├── guides/       (static guides)
                  ├── help/         (help articles)
                  ├── connections/  (dynamic plugin pages)
                  ├── boosters/     (dynamic enricher pages)
                  └── index.html    (homepage)
```

## CI/CD (.circleci/config.yml)

- Every commit: `npm run lint` + `npm run _build:app`
- Push to main: auto-deploy to `dev`
- Manual approval: deploy to `prod`
- Prod release: `npm run release` (standard-version semver bump)
- Server can trigger web rebuilds (server CircleCI pipeline sends trigger)
