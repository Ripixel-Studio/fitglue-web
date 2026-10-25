import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({ app: true })) }));
vi.mock('firebase/auth', () => ({ getAuth: vi.fn(() => ({ auth: true })) }));
vi.mock('firebase/firestore', () => ({ getFirestore: vi.fn(() => ({ fs: true })) }));

describe('initFirebase', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ appId: '1:x:web:y', projectId: 'p' }) })),
    );
  });

  it('initialises app, auth and firestore from the hosting config', async () => {
    const mod = await import('../firebase');
    const result = await mod.initFirebase();
    expect(result).toEqual({ app: { app: true }, auth: { auth: true }, firestore: { fs: true } });
    expect(mod.getFirebaseApp()).toEqual({ app: true });
    expect(mod.getFirebaseAuth()).toEqual({ auth: true });
    expect(mod.getFirebaseFirestore()).toEqual({ fs: true });
  });

  it('returns null (and leaves the globals unset) when no hosting config is available', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    const mod = await import('../firebase');
    expect(await mod.initFirebase()).toBeNull();
    expect(mod.getFirebaseApp()).toBeUndefined();
  });

  it('shares one init across concurrent callers instead of double initializeApp (WEB-APP-4)', async () => {
    // Mirror the real Firebase SDK: initializeApp() throws "app/duplicate-app"
    // if the default app is initialised twice. With the pre-fix code, two
    // concurrent initFirebase() callers both passed the "already initialised?"
    // guard (it awaits the hosting config before assigning), both reached here,
    // and the second throw became an unhandled rejection → Sentry "Error" at /app/.
    const { initializeApp } = (await import('firebase/app')) as unknown as {
      initializeApp: ReturnType<typeof vi.fn>;
    };
    let appCount = 0;
    initializeApp.mockImplementation(() => {
      appCount += 1;
      if (appCount > 1) {
        throw new Error('Firebase App named "[DEFAULT]" already exists (app/duplicate-app)');
      }
      return { app: true };
    });

    const mod = await import('../firebase');

    // Two callers racing on the same /app mount. Neither rejects, and
    // initializeApp runs exactly once.
    const [a, b] = await Promise.all([mod.initFirebase(), mod.initFirebase()]);

    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(appCount).toBe(1);

    // A later call still returns the same cached Firebase instances (fresh wrapper
    // object, same underlying app/auth/firestore) without re-initialising.
    const c = await mod.initFirebase();
    expect(c).toEqual(a);
    expect(appCount).toBe(1);
  });
});
