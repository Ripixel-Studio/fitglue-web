import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Provider, createStore } from 'jotai';

const { api } = vi.hoisted(() => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), PATCH: vi.fn() } }));
function clientStub() {
  return { GET: (...a: unknown[]) => api.GET(...a), POST: (...a: unknown[]) => api.POST(...a), PUT: (...a: unknown[]) => api.PUT(...a), DELETE: (...a: unknown[]) => api.DELETE(...a), PATCH: (...a: unknown[]) => api.PATCH(...a) };
}

// Infra: keep ErrorBoundary as a passthrough so children render.
vi.mock('../infrastructure/sentry', () => ({
  initSentry: vi.fn(),
  setUser: vi.fn(),
  Sentry: {
    captureException: vi.fn(),
    ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
}));
vi.mock('../../shared/firebase', () => ({
  initFirebase: vi.fn().mockResolvedValue(null),
  getFirebaseAuth: () => ({ currentUser: null }),
  getFirebaseFirestore: () => ({}),
}));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: vi.fn(), signInWithCustomToken: vi.fn() }));
vi.mock('../../shared/nativeBridge', () => ({ isNativeApp: false, sendToNative: vi.fn() }));
vi.mock('../../shared/api/client', () => ({ client: clientStub(), default: clientStub() }));
vi.mock('../../shared/api/public-client', () => ({ publicClient: clientStub(), default: clientStub() }));
vi.mock('../../shared/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../hooks/useUser', () => ({ useUser: () => ({ user: null, loading: true, error: null, refresh: vi.fn() }) }));

import App from '../App';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('App', () => {
  it('renders the app shell (loading state) without throwing', () => {
    window.history.pushState({}, '', '/app/');
    const store = createStore();
    const { container } = render(
      <Provider store={store}>
        <App />
      </Provider>,
    );
    expect(container).toBeTruthy();
  });
});
