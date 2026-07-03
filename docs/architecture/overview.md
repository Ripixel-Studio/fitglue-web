# Architecture Overview

FitGlue Web is a **hybrid architecture** combining a static marketing site with an interactive React application, unified by Firebase Hosting.

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Firebase Hosting (CDN)                          │
│                  fitglue.tech / dev.fitglue.tech                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   ┌───────────────────────────┐    ┌───────────────────────────┐     │
│   │     Marketing Site        │    │       React SPA           │     │
│   │     (Skier SSG)           │    │       (Vite)              │     │
│   │                           │    │                           │     │
│   │  • Landing page           │    │  • Dashboard              │     │
│   │  • Features               │    │  • Activities             │     │
│   │  • Pricing                │    │  • Pipelines              │     │
│   │  • How It Works           │    │  • Connections            │     │
│   │  • Plugin pages           │    │  • Pending Inputs         │     │
│   │  • Auth pages             │    │  • Account Settings       │     │
│   │  • Guides                 │    │  • Enricher Data          │     │
│   │                           │    │  • Admin console          │     │
│   │  Output: static-dist/     │    │  Output: dist/app/        │     │
│   └───────────────────────────┘    └───────────────────────────┘     │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────────┐    ┌─────────────────────────────────────┐
│      Firestore          │    │       Cloud Run Functions           │
│   (Real-time reads)     │    │       (REST API writes)             │
│                         │    │                                     │
│  users/{userId}/        │    │  /api/users/**    → user handlers   │
│    pipelines/           │    │  /api/activities/** → activities    │
│    activities/          │    │  /api/inputs/**   → inputs          │
│    pipeline_runs/       │    │  /api/billing/**  → billing         │
│    pending_inputs/      │    │  /hooks/**        → webhooks        │
└─────────────────────────┘    └─────────────────────────────────────┘
```

## Data Access Pattern

The React app uses a **split architecture** for data access:

| Operation | Method | Why |
|-----------|--------|-----|
| **Reads** | Firestore SDK (`onSnapshot`) | Real-time updates, no polling |
| **Writes** | REST API (`useApi`) | Server-side validation |

```
┌─────────────┐    Firestore SDK     ┌─────────────┐
│   React     │ ◀────────────────────│  Firestore  │
│   App       │                      │             │
│             │    REST API          │  Cloud      │
│             │ ─────────────────────▶│  Functions  │
└─────────────┘                      └─────────────┘
```

## URL Routing

### Static Pages (Marketing Site)
| URL | Served From |
|-----|-------------|
| `/` | `static-dist/index.html` |
| `/features` | `static-dist/features.html` |
| `/pricing` | `static-dist/pricing.html` |
| `/how-it-works` | `static-dist/how-it-works.html` |
| `/connections/*` | Dynamic pages from registry |
| `/boosters/*` | Dynamic pages from registry |
| `/guides/*` | Static guide pages |
| `/auth/*` | Auth pages (login, register, etc.) |

### React SPA
| URL | Page Component |
|-----|----------------|
| `/app` | DashboardPage |
| `/app/activities` | ActivitiesListPage |
| `/app/activities/:id` | ActivityDetailPage |
| `/app/activities/unsynchronized/:id` | UnsynchronizedDetailPage |
| `/app/inputs` | PendingInputsPage |
| `/app/connections` | ConnectionsPage |
| `/app/connections/:id` | ConnectionDetailPage |
| `/app/connections/:id/setup` | ConnectionSetupPage |
| `/app/connections/:id/success` | ConnectionSuccessPage |
| `/app/connections/:id/error` | ConnectionErrorPage |
| `/app/settings/pipelines` | PipelinesPage |
| `/app/settings/pipelines/new` | PipelineWizardPage |
| `/app/settings/account` | AccountSettingsPage |
| `/app/settings/enricher-data` | EnricherDataPage |
| `/app/settings/subscription` | SubscriptionPage |
| `/app/settings/upgrade` | SubscriptionPage (alias) |
| `/app/settings/showcase` | ShowcaseManagementPage |
| `/app/settings/integrations` | ConnectionsPage (legacy) |
| `/app/admin` | AdminPage |

## Build Pipeline

```
                    ┌─────────────────────────────┐
                    │        npm run build        │
                    └─────────────────────────────┘
                                  │
              ┌───────────────────┴───────────────────┐
              ▼                                       ▼
    ┌──────────────────┐                   ┌──────────────────┐
    │  _build:static   │                   │   _build:app     │
    │  (npx skier)     │                   │   (vite build)   │
    └────────┬─────────┘                   └────────┬─────────┘
             │                                      │
             ▼                                      ▼
       static-dist/                            dist/app/
             │                                      │
             └───────────────────┬──────────────────┘
                                 │
                                 ▼
                         ┌──────────────┐
                         │    _merge    │
                         └──────┬───────┘
                                │
                                ▼
                            dist/ (final)
                                │
                                ▼
                      Firebase Hosting Deploy
```

## Tech Stack

### Marketing Site
| Technology | Purpose |
|------------|---------|
| [Skier](https://github.com/ripixel/skier) | Static site generator |
| Handlebars | Template engine |
| CSS | Styling (bundled + minified) |

### React App
| Technology | Purpose |
|------------|---------|
| [Vite](https://vite.dev/) | Build tool + dev server |
| [React 19](https://react.dev/) | UI framework |
| [React Router](https://reactrouter.com/) | Client-side routing |
| [Jotai](https://jotai.org/) | Atomic state management |
| [Firebase SDK](https://firebase.google.com/) | Auth + Firestore (reads) |
| [Sentry](https://sentry.io/) | Error tracking |
| TypeScript | Type safety |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| Firebase Hosting | CDN + rewrites |
| Cloud Run | Function hosting |
| Terraform | Infrastructure as code |
| CircleCI | CI/CD pipeline |

## Component Library

The React app uses a custom component library in `src/app/components/library/`:

```
components/library/
├── ui/          # Presentational (Button, Card, Badge, Modal, etc.)
├── layout/      # Layout (PageLayout, Stack, Grid, Container)
├── forms/       # Form components (Input, Select, FormField)
├── navigation/  # Navigation (Link, BackLink)
└── functional/  # Complex (Wizard, Timeline, ActionMenu)
```

**Patterns:**
- CSS modules for styling
- Variant props (`variant`, `size`)
- TypeScript interfaces
- Composition via `children`

## Real-time Hooks

The app uses Firebase SDK for real-time reads via custom hooks:

| Hook | Collection | State Updated |
|------|------------|---------------|
| `useRealtimePipelines` | `users/{userId}/pipelines` | `pipelinesAtom` |
| `useRealtimePipelineRuns` | `users/{userId}/pipeline_runs` | `pipelineRunsAtom` |
| `useRealtimeInputs` | `users/{userId}/pending_inputs` | `pendingInputsAtom` |
| `useRealtimeStats` | `users/{userId}` (activityCounts) | `activityStatsAtom` |

See [State Management](../react-app/state-management.md) for details.

## Observability

### Sentry Integration

- Initialized in `src/app/infrastructure/sentry.ts`
- Error boundary wraps the app
- User context set on auth
- API errors captured with context

### Loading States

- Skeleton loading components (`SkeletonLoading`, `CardSkeleton`)
- Loading atoms track fetch state
- Graceful error handling

## Development Modes

### Marketing Site Only
```bash
npm run dev:static
# Skier watch mode → http://localhost:5000
```

### React App Only
```bash
npm run dev
# Vite dev server → http://localhost:5173/app
```

### Full Local Testing
```bash
npm run serve
# Builds both + Firebase emulator → http://localhost:5000
```

## Related Documentation

- [Local Development](../development/local-development.md)
- [State Management](../react-app/state-management.md)
- [API Integration](../react-app/api-integration.md)
- [Skier Pipeline](../marketing-site/skier-pipeline.md)
- [Authentication](./authentication.md)
