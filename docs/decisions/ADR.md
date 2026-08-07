# Architecture Decision Records (ADR)

This document records key architectural and design decisions for the FitGlue web project.

## 001 - Shared GCP Projects with Server Repo (2025-12-24)

### Context
The web and server repos need to work together to implement the Unified URL Strategy, where all endpoints are accessible via a single domain (e.g., `fitglue.tech`).

### Decision
The web and server repos deploy to the **same GCP projects**:
- `fitglue-server-dev`
- `fitglue-server-test`
- `fitglue-server-prod`

### Rationale
Firebase Hosting rewrites only work when the hosting site and Cloud Functions are in the same GCP project. This enables:
- `/` → Static landing page (web repo)
- `/hooks/{provider}` → Webhook handlers (server repo)
- `/api/**` → API service (server repo)
- `/auth/{provider}/callback` → OAuth callbacks (server repo)

### Consequences
- **Pros**: Zero-cost routing via Firebase Hosting, no CORS issues, clean URLs
- **Cons**: Coordination required between repos, both deploy to same project

See server repo's [Decision 008](https://github.com/ripixel/fitglue-server/blob/main/docs/DECISIONS.md#008---project--repository-architecture-2025-12-24) for full context.

## 002 - Separate Service Accounts for Web and Server (2025-12-24)

### Context
Both web and server repos deploy to the same GCP projects via CircleCI OIDC authentication.

### Decision
Use separate service accounts with different permissions:
- **Server**: `circleci-deployer` with broad Editor role
- **Web**: `circleci-web-deployer` with limited Firebase Hosting + Storage roles

### Rationale
Principle of least privilege - the web deployer only needs to:
- Deploy to Firebase Hosting (`roles/firebasehosting.admin`)
- Upload hosting files (`roles/storage.objectAdmin`)

It doesn't need to create Cloud Functions, manage Firestore, or other server infrastructure.

### Consequences
- **Pros**: Better security, clear separation of concerns
- **Cons**: Requires separate bootstrap process for web deployer

## 003 - Wildcard Workload Identity Binding (2025-12-24)

### Context
CircleCI uses OIDC to authenticate with GCP via workload identity federation. We initially tried using specific attribute filters to distinguish between server and web deployments.

### Decision
Use **wildcard pattern (`/*`)** for workload identity bindings instead of specific attribute filters.

**Correct**:
```
principalSet://iam.googleapis.com/projects/{PROJECT_NUMBER}/locations/global/workloadIdentityPools/circleci-pool/*
```

**Incorrect** (doesn't work):
```
principalSet://iam.googleapis.com/projects/{PROJECT_NUMBER}/locations/global/workloadIdentityPools/circleci-pool/attribute.project_id/{CIRCLECI_ORG_ID}
```

### Rationale
After extensive troubleshooting, we discovered that:
1. The server repo uses wildcard pattern and it works
2. Specific attribute filters cause `Permission 'iam.serviceAccounts.getAccessToken' denied` errors
3. CircleCI OIDC tokens don't provide enough flexibility for custom attribute filtering

Separation between server and web is achieved by:
- Different service accounts
- Different permissions
- CircleCI specifies which service account to use in credential config

### Consequences
- **Pros**: Authentication works reliably, matches server pattern
- **Cons**: Can't use attribute-based filtering to restrict access

## 004 - Bootstrap Script Instead of Terraform for IAM (2025-12-24)

### Context
IAM configuration (service accounts, role bindings) needs to be created before CircleCI can deploy.

### Decision
Use a **bootstrap script** (`scripts/setup_web_deployer.sh`) to create IAM resources instead of managing them with Terraform.

### Rationale
Chicken-and-egg problem:
1. Terraform needs the service account to authenticate
2. But Terraform can't create the service account without authentication
3. The web deployer service account has minimal permissions (Firebase + Storage), not enough to create service accounts or manage IAM

### Consequences
- **Pros**: Simple one-time setup, no permission conflicts, can be re-run safely
- **Cons**: IAM configuration not in Terraform state, manual step required

The Terraform configuration documents what the bootstrap script creates but doesn't manage it.

## 005 - No Build Step (2025-12-24) — SUPERSEDED

> **Note**: This decision has been superseded by ADR 007 and ADR 008.

### Original Decision
No build step - serve static files directly.

### Current State
The web repo now has a **dual build system**:
- **Skier SSG** for marketing pages → `static-dist/`
- **Vite** for React app → `dist/app/`

See ADR 007 for details.

## 006 - Vibrant Color Palette (2025-12-24)

### Context
User requested a modern, eye-catching design inspired by ripixel.co.uk.

### Decision
Use a vibrant color palette with high saturation:
- Primary: `#FF006E` (bright pink)
- Secondary: `#8338EC` (vivid purple)
- Accent: `#3A86FF` (electric blue)
- Success: `#06FFA5` (neon green)

With automatic dark mode support.

### Rationale
- Stands out from generic landing pages
- Creates strong first impression
- Aligns with user's design preferences
- Modern and professional

### Consequences
- **Pros**: Memorable, modern, professional
- **Cons**: May not appeal to everyone (but that's okay for a personal project)

---

## 007 - Hybrid Marketing + React Architecture (2026-01)

### Context
FitGlue needs both:
1. **SEO-optimized marketing pages** - Landing, features, pricing, guides
2. **Interactive web application** - Dashboard, settings, pipeline management

A single approach can't optimize for both.

### Decision
Implement a **hybrid architecture**:
- **Marketing Site**: Static HTML generated by Skier SSG (Handlebars templates)
- **React App**: Vite-built SPA mounted at `/app`
- **Firebase Hosting**: Serves both, with rewrites connecting to Cloud Functions

```
┌────────────────────────────────────────────┐
│              Firebase Hosting              │
├────────────────────────────────────────────┤
│  /                → static-dist/index.html │
│  /features        → static-dist/features   │
│  /app/**          → dist/app/index.html    │
│  /api/**          → Cloud Run Functions    │
└────────────────────────────────────────────┘
```

### Rationale
- Marketing pages need fast initial load and SEO metadata
- React app needs interactivity and real-time state
- Shared CSS ensures consistent design language
- Firebase Hosting rewrites provide seamless URL structure

### Alternatives Considered
- **Next.js SSR**: Overkill for marketing pages, added complexity
- **Full SPA**: Poor SEO, slow marketing page loads
- **Two separate repos**: Harder to maintain shared styles

### Consequences
- **Pros**: Best of both worlds, great SEO, fast marketing, interactive app
- **Cons**: Two build systems to maintain, slightly complex merge step

## 008 - Skier Static Site Generator (2026-01)

### Context
Marketing pages need to be:
- Static HTML for SEO
- Template-driven for consistency
- Data-driven for dynamic plugin/connection pages

### Decision
Use **Skier**, a custom task-based static site generator, for marketing pages.

Key features used:
- `generatePagesTask` - Compile Handlebars templates
- `setGlobalsTask` - Inject global variables
- `bundleCssTask` - Minify and bundle CSS
- Custom tasks for registry data and dynamic pages

### Rationale
- Simple, declarative task pipeline
- Handlebars templates are familiar and logic-less
- Custom tasks enable registry-driven dynamic pages
- Hot reload via `skier watch`

### Alternatives Considered
- **Eleventy**: More complex, unfamiliar syntax
- **Astro**: Overkill, introduces new paradigm
- **Manual scripts**: Less maintainable

### Consequences
- **Pros**: Simple, fast builds, familiar templates, extensible
- **Cons**: Small ecosystem, limited documentation

## 009 - Styling Strategy (2026-01)

### Context
Both marketing site and React app need consistent styling without duplicating CSS.

### Decision
Use a **shared CSS architecture**:
- Single `main.css` (78KB) with design tokens and component styles
- Auth-specific `_auth.css` for login/register pages
- CSS variables for theming (colors, spacing, typography)
- Both Skier and React apps include the same built CSS

### Rationale
- Design tokens ensure consistency
- Single source of truth for styles
- No build-time CSS-in-JS overhead in React
- Works with both static and dynamic rendering

### Pattern
```css
/* Design Tokens */
:root {
  --color-primary: #FF006E;
  --color-secondary: #8338EC;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
}

/* Component Styles */
.btn-primary { ... }
.card { ... }

/* Page-specific Sections */
.hero { ... }
.features-grid { ... }
```

### Consequences
- **Pros**: Consistent design, single CSS bundle, fast styling
- **Cons**: Large CSS file (mitigated by caching), no scoped styles

## 010 - Jotai for State Management (2026-01)

### Context
The React app needs global state for authentication, user data, and app settings.

### Decision
Use **Jotai** for atomic state management.

### Rationale
- Simpler than Redux, no boilerplate
- Atoms are composable and derivable
- Built-in React integration
- Small bundle size

### Usage Pattern
```typescript
// Define atom
export const userAtom = atom<User | null>(null);

// Use in component
const [user, setUser] = useAtom(userAtom);
```

### Consequences
- **Pros**: Simple API, minimal code, good TypeScript support
- **Cons**: Less common than Redux, fewer tutorials

## 011 - Firestore Indexes Owned by Server Terraform (2026-08)

### Context
`useRealtimeInputs` queries `users/{uid}/pending_inputs` with `where('status')` +
`orderBy('created_at', 'desc')`, which needs a composite index. A production
`FirebaseError: The query requires an index` (Sentry WEB-APP-1) prompted an earlier
fix that added `firestore.indexes.json` here and set `firebase deploy --only
hosting,firestore` to provision it. That deploy started 403ing on `main`: the web
deploy runs as `circleci-web-deployer`, which holds `firebaserules.admin` (rules)
but **no** `datastore.*` role, so it cannot create Firestore indexes.

A follow-up tried to grant `roles/datastore.indexAdmin` in
`scripts/setup_web_deployer.sh`, but that script is a manual bootstrap that CI never
runs, and the SA's live IAM is actually managed by fitglue-server's
`terraform/iam.tf` — so the grant never took effect and `main` stayed red.

Crucially, fitglue-server terraform **already declares this exact index**
(`terraform/firestore.tf` → `pending_inputs_subcollection_status_created`,
COLLECTION scope, `status` ASC + `created_at` DESC) and applies it live via the
privileged `circleci-deployer`. The index was already provisioned; the web repo was
duplicating ownership and hitting a permission wall doing so.

### Decision
Firestore **indexes** are owned exclusively by fitglue-server terraform. The web repo
deploys **hosting + Firestore rules only** (`firebase deploy --only
hosting,firestore:rules`). This repo carries no `firestore.indexes.json` and no
`indexes` key in `firebase.json`. The web deployer keeps `firebaserules.admin` and no
`datastore.*` role — restoring the least-privilege boundary from ADR 002.

### Rationale
- Single owner for indexes (terraform) — no dual reconciliation that could fight
  (e.g. a web deploy deleting a terraform-managed index absent from a JSON file).
- Matches the deliberate IAM split: web = hosting + rules, server = Firestore infra.
- No coverage lost: the `pending_inputs` index is live in dev and prod via server
  terraform, so `useRealtimeInputs` (and the Sentry WEB-APP-1 query it guards) works.

### Consequences
- **Pros**: Correct ownership, no 403, least privilege preserved, no code duplication.
- **Cons**: A new index needed by a web query must be added in fitglue-server
  terraform and applied before the query ships — a cross-repo coordination step.
- Supersedes the index-in-web approach; the guard test
  `src/app/hooks/__tests__/firestoreIndexes.test.ts` now asserts indexes are **not**
  managed here, so the regression can't silently return.
