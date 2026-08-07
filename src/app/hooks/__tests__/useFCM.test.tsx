import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider, createStore } from 'jotai';

const { state } = vi.hoisted(() => ({
  state: {
    user: null as { uid: string } | null,
    messaging: {} as object | null,
    getToken: vi.fn(),
    onMessageCb: undefined as ((p: unknown) => void) | undefined,
    setFCMToken: vi.fn(),
  },
}));

vi.mock('firebase/messaging', () => ({
  getToken: (...a: unknown[]) => state.getToken(...a),
  onMessage: (_m: unknown, cb: (p: unknown) => void) => {
    state.onMessageCb = cb;
    return () => {};
  },
}));
vi.mock('../../../shared/firebase', () => ({
  getFirebaseMessaging: () => state.messaging,
}));
vi.mock('../../services/InputsService', () => ({
  InputsService: { setFCMToken: (...a: unknown[]) => state.setFCMToken(...a) },
}));
vi.mock('../../../shared/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { logger } from '../../../shared/logger';
import { useFCM } from '../useFCM';
import { userAtom } from '../../state/authState';

function makeWrapper(user: { uid: string } | null) {
  const store = createStore();
  store.set(userAtom, user as never);
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.user = null;
  state.messaging = {};
  state.onMessageCb = undefined;
  state.getToken.mockResolvedValue('fcm-token-123');
  // jsdom Notification
  const NotificationCtor = vi.fn(function (this: Record<string, unknown>) {
    this.close = vi.fn();
    this.onclick = null;
  }) as unknown as { (...a: unknown[]): void; requestPermission: ReturnType<typeof vi.fn> };
  NotificationCtor.requestPermission = vi.fn().mockResolvedValue('granted');
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    writable: true,
    value: NotificationCtor,
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register: vi.fn().mockResolvedValue({ scope: '/' }) },
  });
});

describe('useFCM', () => {
  it('is a no-op when there is no user', () => {
    renderHook(() => useFCM(), { wrapper: makeWrapper(null) });
    expect(state.getToken).not.toHaveBeenCalled();
  });

  it('registers the service worker and stores the FCM token for a logged-in user', async () => {
    renderHook(() => useFCM(), { wrapper: makeWrapper({ uid: 'u1' }) });
    await waitFor(() => expect(state.getToken).toHaveBeenCalled());
    await waitFor(() => expect(state.setFCMToken).toHaveBeenCalledWith('fcm-token-123'));
    expect(navigator.serviceWorker.register).toHaveBeenCalled();
  });

  it('subscribes to foreground messages and creates a notification', async () => {
    renderHook(() => useFCM(), { wrapper: makeWrapper({ uid: 'u1' }) });
    await waitFor(() => expect(state.onMessageCb).toBeDefined());
    state.onMessageCb?.({
      notification: { title: 'Hello', body: 'World' },
      data: { type: 'PENDING_INPUT', activity_id: 'act-1' },
    });
    expect(Notification).toHaveBeenCalledWith('Hello', expect.objectContaining({ body: 'World' }));
  });

  it('does nothing when messaging is unavailable', async () => {
    state.messaging = null;
    renderHook(() => useFCM(), { wrapper: makeWrapper({ uid: 'u1' }) });
    // give microtasks a chance
    await Promise.resolve();
    expect(state.getToken).not.toHaveBeenCalled();
  });

  // Regression for WEB-APP-2: on platforms without the Notification global
  // (iOS Safari < 16.4, native WebViews) `getMessaging()` can still return a
  // Messaging instance, so setup reaches the bare `Notification.requestPermission()`
  // call and throws `ReferenceError: Notification is not defined`.
  describe('when the Notification global is absent', () => {
    beforeEach(() => {
      // Simulate an environment that supports messaging but not Notifications.
      delete (globalThis as { Notification?: unknown }).Notification;
      state.messaging = {};
    });

    it('does not touch Notification (no ReferenceError, no error report)', async () => {
      renderHook(() => useFCM(), { wrapper: makeWrapper({ uid: 'u1' }) });
      await Promise.resolve();
      await Promise.resolve();
      // Must skip gracefully rather than crash into the catch + Sentry report.
      expect(logger.error).not.toHaveBeenCalled();
      expect(state.getToken).not.toHaveBeenCalled();
    });

    it('does not construct a Notification for foreground messages', async () => {
      renderHook(() => useFCM(), { wrapper: makeWrapper({ uid: 'u1' }) });
      await waitFor(() => expect(state.onMessageCb).toBeDefined());
      expect(() =>
        state.onMessageCb?.({
          notification: { title: 'Hello', body: 'World' },
          data: { type: 'PENDING_INPUT', activity_id: 'act-1' },
        })
      ).not.toThrow();
    });
  });
});
