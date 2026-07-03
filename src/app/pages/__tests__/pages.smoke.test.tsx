import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider, createStore } from 'jotai';

// ---------------------------------------------------------------------------
// Mock all data/IO dependencies so pages render as pure presentation smoke tests.
// ---------------------------------------------------------------------------

const { api, toastStub } = vi.hoisted(() => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
    PATCH: vi.fn(),
  },
  toastStub: () => ({
    toasts: [], showToast: vi.fn(), removeToast: vi.fn(),
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), show: vi.fn(),
  }),
}));

function clientStub() {
  return {
    GET: (...a: unknown[]) => api.GET(...a),
    POST: (...a: unknown[]) => api.POST(...a),
    PUT: (...a: unknown[]) => api.PUT(...a),
    DELETE: (...a: unknown[]) => api.DELETE(...a),
    PATCH: (...a: unknown[]) => api.PATCH(...a),
  };
}

vi.mock('../../../shared/api/client', () => ({ client: clientStub(), default: clientStub() }));
vi.mock('../../../shared/api/admin-client', () => ({ adminClient: clientStub(), default: clientStub() }));
vi.mock('../../../shared/api/public-client', () => ({ publicClient: clientStub(), default: clientStub() }));
vi.mock('../../../shared/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../../../shared/firebase', () => ({
  getFirebaseAuth: () => ({ currentUser: null }),
  getFirebaseFirestore: () => ({}),
  getFirebaseMessaging: () => null,
  initFirebase: vi.fn().mockResolvedValue({ auth: {}, firestore: {} }),
}));
vi.mock('firebase/auth', () => ({
  updateProfile: vi.fn().mockResolvedValue(undefined),
  onAuthStateChanged: vi.fn(),
}));
vi.mock('../../../shared/nativeBridge', () => ({ isNativeApp: false, sendToNative: vi.fn() }));

// Provide a working useToast without needing a ToastProvider in every render.
vi.mock('../../components/library/ui', async (orig) => {
  const actual = await orig<typeof import('../../components/library/ui')>();
  return { ...actual, useToast: toastStub };
});
vi.mock('../../components/library/ui/Toast/Toast', async (orig) => {
  const actual = await orig<typeof import('../../components/library/ui/Toast/Toast')>();
  return { ...actual, useToast: toastStub };
});
vi.mock('../../components/library/ui/Toast', async (orig) => {
  const actual = await orig<typeof import('../../components/library/ui/Toast')>();
  return { ...actual, useToast: toastStub };
});

// --- custom hooks ---
vi.mock('../../hooks/usePluginRegistry', () => ({
  usePluginRegistry: () => ({
    registry: { sources: [], enrichers: [], destinations: [], integrations: [] },
    sources: [], enrichers: [], destinations: [], integrations: [],
    loading: false, error: null, refresh: vi.fn(),
  }),
}));
vi.mock('../../hooks/useUser', () => ({
  useUser: () => ({ user: { uid: 'u1', isAdmin: true, accessEnabled: true, tier: 'athlete', displayName: 'Test' }, loading: false, error: null, refresh: vi.fn() }),
}));
vi.mock('../../hooks/useRealtimePipelines', () => ({ useRealtimePipelines: () => ({ pipelines: [], loading: false, refresh: vi.fn() }) }));
vi.mock('../../hooks/useRealtimeIntegrations', () => ({ useRealtimeIntegrations: () => ({ integrations: {}, loading: false, refresh: vi.fn() }) }));
vi.mock('../../hooks/useRealtimePipelineRuns', () => ({ useRealtimePipelineRuns: () => ({ pipelineRuns: [], runs: [], loading: false, refresh: vi.fn() }) }));
vi.mock('../../hooks/useRealtimeInputs', () => ({ useRealtimeInputs: () => ({ inputs: [], loading: false, refresh: vi.fn() }) }));
vi.mock('../../hooks/useRealtimeStats', () => ({ useRealtimeStats: () => ({ stats: { synchronizedCount: 0 }, loading: false }) }));
vi.mock('../../hooks/usePluginDefaults', () => ({ usePluginDefaults: () => ({ getDefaults: () => ({}), getEnricherDefaults: () => ({}), loading: false }) }));
vi.mock('../../hooks/usePluginLookup', () => ({
  usePluginLookup: () => ({
    getSourceInfo: () => ({ id: '', name: 'Unknown', icon: '📥' }),
    getDestinationInfo: () => ({ id: '', name: 'Unknown', icon: '📤' }),
    getEnricherInfo: () => ({ id: '', name: 'Unknown', icon: '⚙️' }),
    getSourceName: () => 'Unknown', getSourceIcon: () => '📥',
    getDestinationName: () => 'Unknown', getDestinationIcon: () => '📤',
    getEnricherName: () => 'Unknown', getEnricherIcon: () => '⚙️',
  }),
}));
vi.mock('../../hooks/useConnectionActions', () => ({
  useConnectionActions: () => ({
    triggerAction: vi.fn(), isRunning: () => false, isCompleted: () => false,
    getError: () => undefined, clearError: vi.fn(), clearCompleted: vi.fn(),
  }),
}));
vi.mock('../../hooks/useShowcaseSlug', () => ({ useShowcaseSlug: () => null }));
vi.mock('../../hooks/useShowcasePreferences', () => ({ useShowcasePreferences: () => ({ preferences: { defaultDestination: false }, loading: false }) }));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    error: null, success: null, loading: false,
    changePassword: vi.fn(), clearMessages: vi.fn(), logout: vi.fn(),
    sendPasswordReset: vi.fn(), resendVerificationEmail: vi.fn(),
  }),
}));
vi.mock('../../hooks/useGuidedTour', () => ({
  GuidedTourProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGuidedTour: () => ({
    isActive: false, currentStep: 0, totalSteps: 0, step: null, steps: [], isCompleted: true,
    startTour: vi.fn(), nextStep: vi.fn(), skipTour: vi.fn(), dismissTour: vi.fn(),
  }),
}));
vi.mock('../../hooks/admin', () => ({
  useAdminStats: () => ({ stats: null, loading: false, error: null, refresh: vi.fn() }),
  useAdminUsers: () => ({ users: [], loading: false, error: null, fetchUsers: vi.fn(), updateUser: vi.fn() }),
  useAdminPipelineRuns: () => ({ runs: [], stats: null, loading: false, error: null, hasMore: false, fetchRuns: vi.fn(), loadMore: vi.fn(), selectRun: vi.fn() }),
  useAdminRunOps: () => ({ repost: vi.fn(), cancelRun: vi.fn(), resolvePendingInput: vi.fn() }),
  useAdminAuditLog: () => ({ entries: [], loading: false, error: null, refresh: vi.fn() }),
}));

// Pages
import DashboardPage from '../DashboardPage';
import ActivitiesListPage from '../ActivitiesListPage';
import ActivityDetailPage from '../ActivityDetailPage';
import UnsynchronizedDetailPage from '../UnsynchronizedDetailPage';
import PendingInputsPage from '../PendingInputsPage';
import ConnectionsPage from '../ConnectionsPage';
import ConnectionDetailPage from '../ConnectionDetailPage';
import ConnectionSetupPage from '../ConnectionSetupPage';
import ConnectionSuccessPage from '../ConnectionSuccessPage';
import ConnectionErrorPage from '../ConnectionErrorPage';
import PipelinesPage from '../PipelinesPage';
import PipelineWizardPage from '../PipelineWizardPage';
import PipelineEditPage from '../PipelineEditPage';
import AccountSettingsPage from '../AccountSettingsPage';
import EnricherDataPage from '../EnricherDataPage';
import SubscriptionPage from '../SubscriptionPage';
import AdminPage from '../AdminPage';
import ShowcaseManagementPage from '../ShowcaseManagementPage';
import NotFoundPage from '../NotFoundPage';
import ComponentLibraryPage from '../ComponentLibraryPage';

beforeEach(() => {
  vi.clearAllMocks();
  api.GET.mockResolvedValue({ data: {} });
  api.POST.mockResolvedValue({ data: {} });
  api.PUT.mockResolvedValue({ data: {} });
  api.DELETE.mockResolvedValue({ data: {} });
  api.PATCH.mockResolvedValue({ data: {} });
});

function renderPage(ui: React.ReactNode, route = '/', path?: string) {
  const store = createStore();
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <Provider store={store}>
        <MemoryRouter initialEntries={[route]}>
          {path ? <Routes><Route path={path} element={children} /></Routes> : children}
        </MemoryRouter>
      </Provider>
    );
  }
  return render(<Wrapper>{ui}</Wrapper>);
}

describe('page smoke tests', () => {
  it('NotFoundPage renders', () => {
    const { container } = renderPage(<NotFoundPage />);
    expect(container).toBeTruthy();
  });

  it('DashboardPage renders', () => {
    const { container } = renderPage(<DashboardPage />);
    expect(container).toBeTruthy();
  });

  it('ActivitiesListPage renders', () => {
    const { container } = renderPage(<ActivitiesListPage />);
    expect(container).toBeTruthy();
  });

  it('ActivityDetailPage renders', () => {
    const { container } = renderPage(<ActivityDetailPage />, '/activities/a1', '/activities/:id');
    expect(container).toBeTruthy();
  });

  it('UnsynchronizedDetailPage renders', () => {
    const { container } = renderPage(
      <UnsynchronizedDetailPage />, '/activities/unsynchronized/pe1', '/activities/unsynchronized/:pipelineExecutionId',
    );
    expect(container).toBeTruthy();
  });

  it('PendingInputsPage renders', () => {
    const { container } = renderPage(<PendingInputsPage />);
    expect(container).toBeTruthy();
  });

  it('ConnectionsPage renders', () => {
    const { container } = renderPage(<ConnectionsPage />);
    expect(container).toBeTruthy();
  });

  it('ConnectionDetailPage renders', () => {
    const { container } = renderPage(<ConnectionDetailPage />, '/connections/strava', '/connections/:id');
    expect(container).toBeTruthy();
  });

  it('ConnectionSetupPage renders', () => {
    const { container } = renderPage(<ConnectionSetupPage />, '/connections/strava/setup', '/connections/:id/setup');
    expect(container).toBeTruthy();
  });

  it('ConnectionSuccessPage renders', () => {
    const { container } = renderPage(<ConnectionSuccessPage />, '/connections/strava/success', '/connections/:id/success');
    expect(container).toBeTruthy();
  });

  it('ConnectionErrorPage renders', () => {
    const { container } = renderPage(<ConnectionErrorPage />, '/connections/strava/error?reason=denied', '/connections/:id/error');
    expect(container).toBeTruthy();
  });

  it('PipelinesPage renders', () => {
    const { container } = renderPage(<PipelinesPage />);
    expect(container).toBeTruthy();
  });

  it('PipelineWizardPage renders', () => {
    const { container } = renderPage(<PipelineWizardPage />);
    expect(container).toBeTruthy();
  });

  it('PipelineEditPage renders', () => {
    const { container } = renderPage(<PipelineEditPage />, '/settings/pipelines/p1/edit', '/settings/pipelines/:pipelineId/edit');
    expect(container).toBeTruthy();
  });

  it('AccountSettingsPage renders', () => {
    const { container } = renderPage(<AccountSettingsPage />);
    expect(container).toBeTruthy();
  });

  it('EnricherDataPage renders', () => {
    const { container } = renderPage(<EnricherDataPage />);
    expect(container).toBeTruthy();
  });

  it('SubscriptionPage renders', () => {
    const { container } = renderPage(<SubscriptionPage />);
    expect(container).toBeTruthy();
  });

  it('AdminPage renders', () => {
    const { container } = renderPage(<AdminPage />);
    expect(container).toBeTruthy();
  });

  it('ShowcaseManagementPage renders', () => {
    const { container } = renderPage(<ShowcaseManagementPage />);
    expect(container).toBeTruthy();
  });

  it('ComponentLibraryPage renders', () => {
    const { container } = renderPage(<ComponentLibraryPage />);
    expect(container).toBeTruthy();
  });
});
