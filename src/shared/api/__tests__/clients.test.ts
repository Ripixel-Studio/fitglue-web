import { describe, it, expect, vi, beforeEach } from 'vitest';

const captureException = vi.fn();
vi.mock('../../../app/infrastructure/sentry', () => ({ Sentry: { captureException: (...a: unknown[]) => captureException(...a) } }));
// Keep firebase out of the import graph for the authenticated client.
vi.mock('../../firebase', () => ({ getFirebaseAuth: () => null, initFirebase: vi.fn() }));

import { createErrorMiddleware } from '../throwing-client';

type OnResponse = NonNullable<ReturnType<typeof createErrorMiddleware>['onResponse']>;

function res(over: Partial<{ ok: boolean; status: number; statusText: string; url: string; body: unknown; parseFails: boolean }>) {
  const { ok = true, status = 200, statusText = 'OK', url = 'https://x.test/api/v2/users/me', body = {}, parseFails = false } = over;
  return {
    ok, status, statusText, url,
    clone: () => ({ json: async () => { if (parseFails) throw new Error('not json'); return body; } }),
  } as unknown as Response;
}
const req = { method: 'GET' } as unknown as Request;

beforeEach(() => captureException.mockReset());

describe('createErrorMiddleware', () => {
  it('passes through 2xx responses untouched', async () => {
    const mw = createErrorMiddleware('Test');
    const r = res({ ok: true });
    await expect((mw.onResponse as OnResponse)({ response: r, request: req } as never)).resolves.toBe(r);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('throws the server-provided message on non-2xx and reports to Sentry', async () => {
    const mw = createErrorMiddleware('Test');
    const call = (mw.onResponse as OnResponse)({
      response: res({ ok: false, status: 400, body: { message: 'Bad input' } }),
      request: req,
    } as never);
    await expect(call).rejects.toThrow('Bad input');
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('prefers the body.error field when message is absent', async () => {
    const mw = createErrorMiddleware('Test');
    const call = (mw.onResponse as OnResponse)({
      response: res({ ok: false, status: 403, body: { error: 'Forbidden zone' } }),
      request: req,
    } as never);
    await expect(call).rejects.toThrow('Forbidden zone');
  });

  it('falls back to a status-based message when the body is unparseable', async () => {
    const mw = createErrorMiddleware('PublicAPI');
    const call = (mw.onResponse as OnResponse)({
      response: res({ ok: false, status: 500, statusText: 'Server Error', parseFails: true }),
      request: req,
    } as never);
    await expect(call).rejects.toThrow(/PublicAPI GET \/api\/v2\/users\/me failed: 500 Server Error/);
  });
});

describe('client modules', () => {
  it('expose typed GET/POST methods', async () => {
    const pub = (await import('../public-client')).default;
    expect(typeof pub.GET).toBe('function');
    expect(typeof pub.POST).toBe('function');

    const authed = (await import('../client')).default;
    expect(typeof authed.GET).toBe('function');
  });
});
