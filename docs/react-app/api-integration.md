# API Integration

The React app uses a **dual data access pattern**: Firestore SDK for real-time reads and REST API for mutations.

## Data Access Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         React Components                              │
│                                                                       │
│  ┌─────────────────────┐              ┌─────────────────────┐        │
│  │   Real-time Hooks   │              │      useApi         │        │
│  │ (Firestore Reads)   │              │   (REST Writes)     │        │
│  │                     │              │                     │        │
│  │ • useRealtimePipelines             │ • POST /pipelines   │        │
│  │ • useRealtimePipelineRuns          │ • PATCH /users/me   │        │
│  │ • useRealtimeInputs                │ • DELETE /pipelines │        │
│  │ • useRealtimeStats  │              │ • POST /inputs/respond       │
│  └──────────┬──────────┘              └──────────┬──────────┘        │
│             │                                    │                    │
│             ▼                                    ▼                    │
│      ┌─────────────┐                      ┌─────────────┐            │
│      │  Firestore  │                      │   Cloud     │            │
│      │    SDK      │                      │  Functions  │            │
│      └─────────────┘                      └─────────────┘            │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

## Why This Pattern?

| Operation | Method | Why |
|-----------|--------|-----|
| **Reads** | Firestore SDK | Instant updates via `onSnapshot`, no polling |
| **Writes** | REST API | Server-side validation, authorization checks |

**Key Insight:** Most service class methods that previously fetched data are now replaced by real-time hooks. Use service classes only for mutations.

## useApi Hook

The core HTTP client in `src/app/hooks/useApi.ts`:

```typescript
export const useApi = () => {
  const getAuthHeader = useCallback(async () => {
    const auth = getFirebaseAuth();
    const token = await auth?.currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const get = useCallback(async (path: string) => {
    const headers = await getAuthHeader();
    const response = await fetch(`/api${path}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...headers },
    });
    if (!response.ok) throw new ApiError(response.status, await response.text());
    return response.json();
  }, [getAuthHeader]);

  const post = useCallback(async (path: string, body?: unknown) => { ... }, []);
  const patch = useCallback(async (path: string, body?: unknown) => { ... }, []);
  const del = useCallback(async (path: string) => { ... }, []);

  return { get, post, patch, delete: del };
};
```

**Features**:
- Automatic Firebase auth token injection
- Memoized to prevent re-renders
- Consistent error handling
- Sentry error capture for 5xx errors

## When to Use What

### Use Real-time Hooks (Reads)

```typescript
// ✅ Good: Real-time data via hooks
function PipelinesList() {
  const { pipelines, loading } = useRealtimePipelines();
  // Data updates automatically when Firestore changes

  if (loading) return <SkeletonLoading />;
  return <ul>{pipelines.map(p => <li key={p.id}>{p.name}</li>)}</ul>;
}
```

### Use useApi (Writes)

```typescript
// ✅ Good: Mutations via REST API
function CreatePipelineButton() {
  const api = useApi();

  const handleCreate = async () => {
    await api.post('/users/me/pipelines', {
      name: 'My Pipeline',
      source: 'HEVY',
      destinations: ['STRAVA']
    });
    // Firestore listener auto-updates the list
  };

  return <Button onClick={handleCreate}>Create</Button>;
}
```

### Use useApi for Non-Firestore Data

```typescript
// ✅ Good: Data not in Firestore (registry, external APIs)
function usePluginRegistry() {
  const api = useApi();
  const [registry, setRegistry] = useAtom(pluginRegistryAtom);

  useEffect(() => {
    api.get('/registry').then(setRegistry);
  }, []);

  return registry;
}
```

## Available Real-time Hooks

| Hook | Replaces | Data Source |
|------|----------|-------------|
| `useRealtimePipelines` | `PipelinesService.list()` | `users/{userId}/pipelines` |
| `useRealtimePipelineRuns` | N/A (new) | `users/{userId}/pipeline_runs` |
| `useRealtimeInputs` | `InputsService.list()` | `users/{userId}/pending_inputs` |
| `useRealtimeIntegrations` | `IntegrationsService.list()` | `users/{userId}` (integrations field) |
| `useRealtimeStats` | `ActivitiesService.getStats()` | `users/{userId}` (activityCounts field) |

## REST API Endpoints (Mutations Only)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/users/me` | PATCH | Update profile |
| `/api/users/me/pipelines` | POST | Create pipeline |
| `/api/users/me/pipelines/:id` | PATCH | Update pipeline |
| `/api/users/me/pipelines/:id` | DELETE | Delete pipeline |
| `/api/inputs/:id/respond` | POST | Submit input response |
| `/api/activities/:id/repost` | POST | Repost to destinations |
| `/api/billing/**` | * | Billing operations |

## REST API Endpoints (Reads - Special Cases)

Some data still requires REST API reads:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/registry` | GET | Plugin registry (cached) |
| `/api/activities/:id/executions` | GET | Detailed execution trace |

## Type Generation

API types are generated from Protobufs:

```bash
# In web/
npm run gen-proto
```

This generates `src/shared/generated/` from server protobufs.

**Usage:**
```typescript
import { PipelineConfig, SynchronizedActivity } from '../shared/generated';
```

## Error Handling

### With Loading State and Skeleton

```typescript
function PipelineRunsList() {
  const { pipelineRuns, loading, error } = useRealtimePipelineRuns();

  if (loading) {
    return <SkeletonLoading count={3}><CardSkeleton /></SkeletonLoading>;
  }

  if (error) {
    return <ErrorBanner message="Failed to load activities" />;
  }

  return <ActivityCards activities={activities} />;
}
```

### API Mutation with Error Handling

```typescript
const handleSubmit = async () => {
  setLoading(true);
  setError(null);
  try {
    await api.post('/users/me/pipelines', pipelineData);
    toast.success('Pipeline created');
    navigate('/app/settings/pipelines');
  } catch (e) {
    setError('Failed to create pipeline');
    Sentry.captureException(e);
  } finally {
    setLoading(false);
  }
};
```

## Local Development

### Vite Proxy

During development, Vite proxies `/api` requests:

```typescript
// vite.config.ts
proxy: {
  '/api': {
    target: 'http://localhost:8080',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
},
```

### Full Local Testing

```bash
npm run serve  # Build + Firebase emulator
```

API requests go through Firebase Hosting rewrites to Cloud Run.

## Migration Notes

### Deprecated Patterns

```typescript
// ❌ Deprecated: Fetching via API for Firestore data
const activities = await api.get('/activities');

// ✅ Current: Real-time hooks
const { pipelineRuns } = useRealtimePipelineRuns();
```

### Service Classes

Service classes are now primarily for mutations:

```typescript
// ❌ Deprecated methods (use hooks instead)
ActivitiesService.list()
PipelinesService.list()
InputsService.list()

// ✅ Still valid (mutations)
InputsService.respond(inputId, response)
ActivitiesService.repost(activityId, destinations)
```

## Related Documentation

- [State Management](./state-management.md) - Real-time hooks and atoms
- [Routing](./routing.md)
- [Authentication](../architecture/authentication.md)
