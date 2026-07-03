import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAtom } from 'jotai';
import { onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { initFirebase } from '../shared/firebase';
import { isNativeApp, sendToNative } from '../shared/nativeBridge';
import { userAtom, authLoadingAtom } from './state/authState';
import { initSentry, setUser as setSentryUser, Sentry } from './infrastructure/sentry';
import { Stack } from './components/library/layout';
import { Card, Heading, Paragraph, Button, Code, ToastProvider, AppLoadingScreen, ConnectionBanner } from './components/library/ui';
import { Link } from './components/library/navigation';

// App pages (protected)
import DashboardPage from './pages/DashboardPage';
import PendingInputsPage from './pages/PendingInputsPage';
import ActivitiesListPage from './pages/ActivitiesListPage';
import ActivityDetailPage from './pages/ActivityDetailPage';
import UnsynchronizedDetailPage from './pages/UnsynchronizedDetailPage';
import ConnectionsPage from './pages/ConnectionsPage';
import ConnectionSetupPage from './pages/ConnectionSetupPage';
import ConnectionSuccessPage from './pages/ConnectionSuccessPage';
import ConnectionErrorPage from './pages/ConnectionErrorPage';
import ConnectionDetailPage from './pages/ConnectionDetailPage';
import PipelinesPage from './pages/PipelinesPage';
import PipelineWizardPage from './pages/PipelineWizardPage';
import PipelineEditPage from './pages/PipelineEditPage';
import AccountSettingsPage from './pages/AccountSettingsPage';
import EnricherDataPage from './pages/EnricherDataPage';
import SubscriptionPage from './pages/SubscriptionPage';
import AdminPage from './pages/AdminPage';
import AdminUserDetailPage from './pages/AdminUserDetailPage';
import ShowcaseManagementPage from './pages/ShowcaseManagementPage';
import NotFoundPage from './pages/NotFoundPage';
import ComponentLibraryPage from './pages/ComponentLibraryPage';


import { useFCM } from './hooks/useFCM';
import { useUser } from './hooks/useUser';

// Initialize Sentry before app renders
initSentry();

// Catch unhandled promise rejections outside React's tree (timers, event listeners, etc.)
window.addEventListener('unhandledrejection', (event) => {
  Sentry.captureException(event.reason);
});

// Protected route wrapper - redirects to static /auth/login page
// Also enforces waitlist by checking accessEnabled from user profile
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser] = useAtom(userAtom);
  const [authLoading] = useAtom(authLoadingAtom);
  const { user: profile, loading: profileLoading } = useUser();

  // Show loading while Firebase auth or profile is loading
  if (authLoading || profileLoading) {
    return <AppLoadingScreen />;
  }

  // Not authenticated - redirect to login (skipped in native app; native handles auth)
  if (!firebaseUser) {
    if (!isNativeApp) {
      window.location.href = '/auth/login';
    }
    return (
      <Card>
        <Paragraph>Redirecting to login...</Paragraph>
      </Card>
    );
  }

  // Authenticated but waitlisted (no access enabled) - redirect to access-pending
  // Admins always have access regardless of accessEnabled flag
  if (profile && !profile.accessEnabled && !profile.isAdmin) {
    window.location.href = '/auth/access-pending';
    return (
      <Card>
        <Paragraph>Redirecting...</Paragraph>
      </Card>
    );
  }

  return <>{children}</>;
};

// Admin route wrapper - ensures user has admin role
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useUser();

  // useUser now properly includes auth loading, so this handles the full loading story
  if (loading) {
    return (
      <Card>
        <Stack gap="md" align="center">
          <Heading level={3}>Loading Admin Console</Heading>
          <Paragraph>Verifying admin permissions...</Paragraph>
        </Stack>
      </Card>
    );
  }

  if (!user?.isAdmin) {
    return (
      <Card>
        <Stack gap="md" align="center">
          <Heading level={2}>Access Denied</Heading>
          <Paragraph>You do not have admin privileges to view this page.</Paragraph>
          <Link to="/app">← Back to Dashboard</Link>
        </Stack>
      </Card>
    );
  }

  return <>{children}</>;
};


// Bridges the React Router navigation API to the native app via window.__fg and postMessage.
// Must be rendered inside <Router> to access useNavigate/useLocation.
const NativeBridge: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    window.__fg = {
      navigate: (path: string) => navigate(path),
      refreshAuth: async (token: string) => {
        try {
          const fb = await initFirebase();
          if (fb) await signInWithCustomToken(fb.auth, token);
        } catch (e) {
          console.error('[FitGlue] refreshAuth failed', e);
        }
      },
    };
    if (isNativeApp) document.body.classList.add('is-native-app');
    sendToNative({ type: 'ready' });
    return () => { window.__fg = undefined; if (isNativeApp) document.body.classList.remove('is-native-app'); };
  }, [navigate]);

  useEffect(() => {
    sendToNative({ type: 'routeChange', path: location.pathname });
  }, [location.pathname]);

  return null;
};

const App: React.FC = () => {
  const [, setUser] = useAtom(userAtom);
  const [, setLoading] = useAtom(authLoadingAtom);

  useFCM();

  useEffect(() => {
    const setup = async () => {
      const fb = await initFirebase();
      if (!fb) {
        setLoading(false);
        return;
      }

      // In native mode: sign in with the injected custom token before registering the auth
      // listener, so the first onAuthStateChanged fires with a user (not null).
      const nativeToken = window.__fitglueCustomToken;
      if (nativeToken) {
        window.__fitglueCustomToken = undefined;
        try {
          await signInWithCustomToken(fb.auth, nativeToken);
        } catch (e) {
          console.error('[FitGlue] Native token sign-in failed', e);
        }
      }

      let wasAuthenticated = false;
      onAuthStateChanged(fb.auth, (u) => {
        setUser(u);
        setLoading(false);
        setSentryUser(u?.uid || null);

        // If the session dropped while the web app is embedded in the native app,
        // tell native to re-fetch and re-inject a fresh custom token.
        if (!u && wasAuthenticated && isNativeApp) {
          sendToNative({ type: 'authExpired' });
        }
        wasAuthenticated = !!u;
      });
    };

    setup();
  }, [setUser, setLoading]);

  return (
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <Card>
          <Stack gap="md" align="center">
            <Heading level={2}>Something went wrong</Heading>
            <Paragraph>We&apos;ve been notified and are working on a fix.</Paragraph>
            <Code>
              {error instanceof Error ? error.message : String(error)}
            </Code>
            <Button onClick={resetError} variant="primary">
              Try Again
            </Button>
          </Stack>
        </Card>
      )}
    >
      <ToastProvider>
          <ConnectionBanner />
          <Router basename="/app">
            <NativeBridge />
            <Routes>
              {/* Protected app routes */}
              <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="/inputs" element={<ProtectedRoute><PendingInputsPage /></ProtectedRoute>} />
              <Route path="/activities" element={<ProtectedRoute><ActivitiesListPage /></ProtectedRoute>} />
              <Route path="/activities/unsynchronized/:pipelineExecutionId" element={<ProtectedRoute><UnsynchronizedDetailPage /></ProtectedRoute>} />
              <Route path="/activities/:id" element={<ProtectedRoute><ActivityDetailPage /></ProtectedRoute>} />
              <Route path="/settings/integrations" element={<ProtectedRoute><ConnectionsPage /></ProtectedRoute>} />
              <Route path="/connections" element={<ProtectedRoute><ConnectionsPage /></ProtectedRoute>} />
              <Route path="/connections/:id/setup" element={<ProtectedRoute><ConnectionSetupPage /></ProtectedRoute>} />
              <Route path="/connections/:id/success" element={<ProtectedRoute><ConnectionSuccessPage /></ProtectedRoute>} />
              <Route path="/connections/:id/error" element={<ProtectedRoute><ConnectionErrorPage /></ProtectedRoute>} />
              <Route path="/connections/:id" element={<ProtectedRoute><ConnectionDetailPage /></ProtectedRoute>} />
              <Route path="/settings/pipelines" element={<ProtectedRoute><PipelinesPage /></ProtectedRoute>} />
              <Route path="/settings/pipelines/new" element={<ProtectedRoute><PipelineWizardPage /></ProtectedRoute>} />
              <Route path="/settings/pipelines/:pipelineId/edit" element={<ProtectedRoute><PipelineEditPage /></ProtectedRoute>} />
              <Route path="/settings/account" element={<ProtectedRoute><AccountSettingsPage /></ProtectedRoute>} />
              <Route path="/settings/enricher-data" element={<ProtectedRoute><EnricherDataPage /></ProtectedRoute>} />
              <Route path="/settings/subscription" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
              <Route path="/settings/showcase" element={<ProtectedRoute><ShowcaseManagementPage /></ProtectedRoute>} />
              <Route path="/settings/upgrade" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
              <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
              <Route path="/admin/users/:id" element={<AdminRoute><AdminUserDetailPage /></AdminRoute>} />
              {/* Dev tool — component library gallery (no auth required) */}
              <Route path="/dev/library" element={<ComponentLibraryPage />} />




              {/* Catch-all for unknown routes */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Router>
      </ToastProvider>
    </Sentry.ErrorBoundary>
  );
};

export default App;
