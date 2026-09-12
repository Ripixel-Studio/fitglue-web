import { describe, it, expect, vi, beforeEach } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: {
    supported: true,
    getMessaging: vi.fn(() => ({ messaging: true })),
    isSupported: vi.fn(async () => state.supported),
  },
}));

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({ app: true })) }));
vi.mock('firebase/auth', () => ({ getAuth: vi.fn(() => ({ auth: true })) }));
vi.mock('firebase/firestore', () => ({ getFirestore: vi.fn(() => ({ fs: true })) }));
vi.mock('firebase/messaging', () => ({
  getMessaging: () => state.getMessaging(),
  isSupported: () => state.isSupported(),
}));

describe('initFirebase messaging guard', () => {
  beforeEach(() => {
    vi.resetModules();
    state.getMessaging.mockClear();
    state.isSupported.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ appId: '1:x:web:y', projectId: 'p' }) })),
    );
  });

  it('skips getMessaging when the browser is unsupported (WEB-APP-1)', async () => {
    state.supported = false;
    const mod = await import('../firebase');
    const result = await mod.initFirebase();
    expect(result).not.toBeNull();
    expect(state.isSupported).toHaveBeenCalledTimes(1);
    expect(state.getMessaging).not.toHaveBeenCalled();
    expect(mod.getFirebaseMessaging()).toBeUndefined();
  });

  it('initialises messaging when supported', async () => {
    state.supported = true;
    const mod = await import('../firebase');
    await mod.initFirebase();
    expect(state.getMessaging).toHaveBeenCalledTimes(1);
    expect(mod.getFirebaseMessaging()).toEqual({ messaging: true });
  });
});
