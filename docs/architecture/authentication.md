# Authentication System

FitGlue uses **Firebase Authentication** for user identity and security. This document covers the web frontend implementation.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     React App (/app)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  authState   │  │   useAuth    │  │  ProtectedRoute  │  │
│  │   (Jotai)    │──│    hook      │──│    wrapper       │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Firebase Auth SDK                          │
│              (Google Identity Platform)                      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      Cloud Functions                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ auth-handler │  │  API routes  │  │  Firestore rules │  │
│  │ (user sync)  │  │ (protected)  │  │  (/users/{uid})  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## State Management

### Auth Atoms

Authentication state is managed with Jotai atoms in `src/app/state/authState.ts`:

```typescript
import { atom } from 'jotai';
import { User } from 'firebase/auth';

// Firebase Auth user object
export const userAtom = atom<User | null>(null);

// Loading state during auth initialization
export const authLoadingAtom = atom(true);
```

### Initialization Flow

The `App.tsx` component initializes Firebase Auth:

```typescript
// src/app/App.tsx
useEffect(() => {
  const setup = async () => {
    const fb = await initFirebase();
    if (!fb) {
      setLoading(false);
      return;
    }

    onAuthStateChanged(fb.auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  };

  setup();
}, [setUser, setLoading]);
```

## Hooks

### useAuth

The `useAuth` hook provides authentication operations:

```typescript
// src/app/hooks/useAuth.ts
export const useAuth = () => {
  // Sign in with email/password
  const signIn = async (email: string, password: string) => { ... };

  // Sign out
  const signOut = async () => { ... };

  // Password reset
  const resetPassword = async (email: string) => { ... };

  return { signIn, signOut, resetPassword };
};
```

### useUser

The `useUser` hook provides user profile data:

```typescript
// src/app/hooks/useUser.ts
export const useUser = () => {
  const { user, loading, tier } = ...;

  return { user, loading, tier };
};
```

## Route Protection

### ProtectedRoute

Wraps routes that require authentication:

```typescript
// src/app/App.tsx
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user] = useAtom(userAtom);
  const [loading] = useAtom(authLoadingAtom);

  if (loading) {
    return <div className="container">Loading...</div>;
  }

  if (!user) {
    // Redirect to static auth page (outside React app)
    window.location.href = '/auth/login';
    return <div className="container">Redirecting to login...</div>;
  }

  return <>{children}</>;
};
```

### Route Configuration

```typescript
// src/app/App.tsx
<Routes>
  {/* Protected app routes */}
  <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
  <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

  {/* Catch-all */}
  <Route path="*" element={<NotFoundPage />} />
</Routes>
```

## Auth Flow

### Login Flow

1. User visits `/auth/login` (static Skier page)
2. Enters credentials, Firebase JS SDK authenticates
3. `onAuthStateChanged` fires, updates `userAtom`
4. Redirect to `/app` (React app)
5. `ProtectedRoute` allows access

### Logout Flow

1. User clicks logout in React app
2. `useAuth().signOut()` calls Firebase
3. `onAuthStateChanged` fires, clears `userAtom`
4. `ProtectedRoute` redirects to `/auth/login`

### Password Reset

1. User visits `/auth/forgot-password`
2. Enters email, Firebase sends reset link
3. User clicks link, lands on Firebase-hosted reset page
4. Password updated, redirected to `/auth/login`

## API Authentication

### Token Injection

The `useApi` hook automatically injects Firebase auth tokens:

```typescript
// src/app/hooks/useApi.ts
const getAuthHeader = useCallback(async () => {
  const auth = getFirebaseAuth();
  const token = await auth?.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}, []);

const get = useCallback(async (path: string) => {
  const headers = await getAuthHeader();
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  // ...
}, [getAuthHeader]);
```

### Backend Verification

Cloud Functions verify the token:

```typescript
// Server-side (Cloud Functions)
const decodedToken = await auth.verifyIdToken(idToken);
const userId = decodedToken.uid;
```

## Local Development

### Creating Test Users

Use the Admin CLI to create test users:

```bash
# From server repo
cd server/src/typescript/admin-cli

# Interactive
npm start users:create

# With credentials
npm start users:create -- --email=test@example.com --password=password123
```

### Firebase Emulators

For fully local testing with emulators:

```bash
# Start emulators
firebase emulators:start

# Point app to emulators (update .env.development)
VITE_USE_EMULATOR=true
```

## Security Rules

Firestore rules restrict access:

```javascript
// firestore.rules
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

Background services (enrichers, uploaders) use the Admin SDK to bypass rules.

## Related Documentation

- [Architecture Overview](./overview.md)
- [API Integration](../react-app/api-integration.md)
- [State Management](../react-app/state-management.md)
