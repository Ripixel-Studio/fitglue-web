import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    initializeApp: vi.fn(() => ({ name: 'app' })) as ((...a: unknown[]) => unknown) & ReturnType<typeof vi.fn>,
    getAuth: vi.fn(() => ({ name: 'auth' })) as ((...a: unknown[]) => unknown) & ReturnType<typeof vi.fn>,
    onAuthStateChanged: vi.fn() as ((...a: unknown[]) => unknown) & ReturnType<typeof vi.fn>,
    signInWithPopup: vi.fn() as ((...a: unknown[]) => unknown) & ReturnType<typeof vi.fn>,
    signInWithEmailAndPassword: vi.fn() as ((...a: unknown[]) => unknown) & ReturnType<typeof vi.fn>,
    createUserWithEmailAndPassword: vi.fn() as ((...a: unknown[]) => unknown) & ReturnType<typeof vi.fn>,
    signOut: vi.fn() as ((...a: unknown[]) => unknown) & ReturnType<typeof vi.fn>,
    authCallback: undefined as ((u: unknown) => void) | undefined,
  },
}));

vi.mock('firebase/app', () => ({ initializeApp: (...a: unknown[]) => mocks.initializeApp(...a) }));
vi.mock('firebase/auth', () => ({
  getAuth: (...a: unknown[]) => mocks.getAuth(...a),
  onAuthStateChanged: (auth: unknown, cb: (u: unknown) => void) => {
    mocks.authCallback = cb;
    mocks.onAuthStateChanged(auth, cb);
    return () => {};
  },
  signInWithPopup: (...a: unknown[]) => mocks.signInWithPopup(...a),
  signInWithEmailAndPassword: (...a: unknown[]) => mocks.signInWithEmailAndPassword(...a),
  createUserWithEmailAndPassword: (...a: unknown[]) => mocks.createUserWithEmailAndPassword(...a),
  signOut: (...a: unknown[]) => mocks.signOut(...a),
  GoogleAuthProvider: class {},
}));

async function flush() {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe('auth.ts bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.authCallback = undefined;
    document.body.innerHTML = '';
    // jsdom doesn't define alert/window.location.href reliably for assignment; stub
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ apiKey: 'k', projectId: 'p' }),
    }));
  });

  it('fetches config, initializes firebase, and registers the auth observer', async () => {
    await import('../auth');
    await flush();
    expect(mocks.initializeApp).toHaveBeenCalledWith({ apiKey: 'k', projectId: 'p' });
    expect(mocks.getAuth).toHaveBeenCalled();
    expect(mocks.onAuthStateChanged).toHaveBeenCalled();
  });

  it('updates landing nav when a user is logged in', async () => {
    const nav = document.createElement('div');
    nav.id = 'landing-nav';
    document.body.appendChild(nav);
    await import('../auth');
    await flush();
    mocks.authCallback?.({ uid: 'u1' });
    expect(nav.innerHTML).toContain('Dashboard');
  });

  it('restores landing nav when logged out', async () => {
    const nav = document.createElement('div');
    nav.id = 'landing-nav';
    document.body.appendChild(nav);
    await import('../auth');
    await flush();
    mocks.authCallback?.(null);
    expect(nav.innerHTML).toContain('Login');
    expect(nav.innerHTML).not.toContain('Sign Up');
    expect(nav.innerHTML).not.toContain('/auth/register');
  });

  it('wires up the Google login button', async () => {
    const btn = document.createElement('button');
    btn.id = 'btn-login-google';
    document.body.appendChild(btn);
    await import('../auth');
    await flush();
    btn.click();
    expect(mocks.signInWithPopup).toHaveBeenCalled();
  });

  it('shows an error banner when config fails to load', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    await import('../auth');
    await flush();
    // jsdom doesn't implement innerText, so check the injected error banner element exists
    const banner = Array.from(document.body.children).find(
      (el) => (el as HTMLElement).style.background === 'rgb(255, 68, 68)',
    );
    expect(banner).toBeTruthy();
    // firebase should not init without config
    expect(mocks.initializeApp).not.toHaveBeenCalled();
  });
});
