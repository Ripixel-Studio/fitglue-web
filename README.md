# FitGlue Web

The frontend hosting layer for the FitGlue fitness data platform. Contains a **marketing site** (static HTML) and a **React SPA** (dashboard), unified by Firebase Hosting.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    Firebase Hosting                         │
│                 fitglue.tech / dev.fitglue.tech            │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐     ┌─────────────────────┐       │
│  │   Marketing Site    │     │     React App       │       │
│  │   (Skier SSG)       │     │     (Vite)          │       │
│  │                     │     │                     │       │
│  │  /, /how-it-works,  │     │  /app/**            │       │
│  │  /guides, etc.      │     │                     │       │
│  └─────────────────────┘     └─────────────────────┘       │
│                                                             │
└────────────────────────────────────────────────────────────┘
                         │
                         ▼ Firebase Rewrites
              ┌────────────────────────┐
              │   Cloud Run Functions  │
              │   /api/**, /hooks/**   │
              └────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install

# Marketing site dev server (Skier watch)
npm run dev:static
# → http://localhost:5000

# React app dev server (Vite)
npm run dev
# → http://localhost:5173/app

# Full local testing (build + Firebase serve)
npm run serve
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Marketing Site | [Skier](https://github.com/ripixel/skier) (SSG) + Handlebars |
| React App | Vite + React 19 + TypeScript |
| State | Jotai (atomic state) |
| Auth | Firebase Authentication |
| Hosting | Firebase Hosting + Cloud Run |
| Infrastructure | Terraform |
| CI/CD | CircleCI with OIDC |

## Project Structure

```
web/
├── pages/              # Marketing page templates (Handlebars)
├── partials/           # Shared template partials
├── templates/          # Dynamic page templates
├── assets/
│   ├── styles/         # CSS (main.css)
│   └── images/         # Static images
├── src/
│   └── app/            # React SPA
│       ├── components/ # React components
│       ├── hooks/      # Custom hooks
│       ├── pages/      # Page components
│       ├── state/      # Jotai atoms
│       └── services/   # API services
├── tasks/              # Custom Skier tasks
├── static-dist/        # Skier build output
├── dist/               # Final merged output
├── skier.tasks.mjs     # Skier configuration
├── vite.config.ts      # Vite configuration
└── firebase.json       # Hosting config
```

## Available Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Full site with Firebase serve |
| `npm run dev:static` | Marketing site watch mode |
| `npm run build` | Production build (Skier + Vite) |
| `npm run serve` | Build + Firebase local serve |
| `npm run deploy` | Deploy to Firebase Hosting |
| `npm run lint` | ESLint check |
| `npm run gen-api` | Regenerate API types |

## Documentation

### Development
- [Local Development](docs/development/local-development.md) - Running dev servers
- [Styling Guide](docs/development/styling.md) - CSS architecture

### Architecture
- [Overview](docs/architecture/overview.md) - Dual architecture design
- [Authentication](docs/architecture/authentication.md) - Auth flow

### Marketing Site
- [Skier Pipeline](docs/marketing-site/skier-pipeline.md) - Build system
- [Templates](docs/marketing-site/templates.md) - Handlebars templates
- [Content](docs/marketing-site/content.md) - Content management

### React App
- [State Management](docs/react-app/state-management.md) - Jotai atoms
- [Routing](docs/react-app/routing.md) - React Router config
- [API Integration](docs/react-app/api-integration.md) - Backend communication

### Deployment
- [Deployment Guide](docs/deployment/deployment.md) - CI/CD process
- [Bootstrap Guide](docs/deployment/bootstrap.md) - Initial setup

### Decisions
- [ADRs](docs/decisions/ADR.md) - Architectural decisions

## Environments

| Environment | Project | Domain |
|-------------|---------|--------|
| Dev | `fitglue-server-dev` | `dev.fitglue.tech` |
| Test | `fitglue-server-test` | `test.fitglue.tech` |
| Prod | `fitglue-server-prod` | `fitglue.tech` |

Deployment is automated via CircleCI:
- **Dev**: Auto-deploy on push to `main`
- **Test**: Auto-deploy after dev succeeds
- **Prod**: Manual approval required

## Troubleshooting

- **Frontend errors**: Check the browser console and [Sentry](https://fitglue.sentry.io/issues/) (web project)
- **Backend/API errors**: See the server [Troubleshooting Guide](../server/docs/guides/troubleshooting.md) for per-domain debugging playbooks
- **Pipeline/enricher/webhook issues**: All server-side — refer to the server troubleshooting guide
- **Build issues**: Run `npm run lint` and `npm run typecheck` to catch common problems

## License

MIT
