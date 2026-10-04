import { describe, it, expect, vi, beforeEach } from 'vitest';

const GET = vi.fn();
const POST = vi.fn();
const PUT = vi.fn();
vi.mock('../../../shared/api/client', () => {
  const c = {
    GET: (...a: unknown[]) => GET(...a),
    POST: (...a: unknown[]) => POST(...a),
    PUT: (...a: unknown[]) => PUT(...a),
  };
  return { client: c, default: c };
});

import { ActivitiesService, normalizeProvenance } from '../ActivitiesService';

beforeEach(() => {
  GET.mockReset();
  POST.mockReset();
  PUT.mockReset();
});

describe('ActivitiesService.getStats', () => {
  it('maps the API response into stats', async () => {
    GET.mockResolvedValue({ data: { totalActivities: 12, uploadsThisMonth: 3 } });
    expect(await ActivitiesService.getStats()).toEqual({ totalSynced: 12, uploadsThisMonth: 3 });
  });

  it('defaults missing fields to zero', async () => {
    GET.mockResolvedValue({ data: {} });
    expect(await ActivitiesService.getStats()).toEqual({ totalSynced: 0, uploadsThisMonth: 0 });
  });

  it('returns zeros and swallows errors', async () => {
    GET.mockRejectedValue(new Error('boom'));
    expect(await ActivitiesService.getStats()).toEqual({ totalSynced: 0, uploadsThisMonth: 0 });
  });
});

describe('ActivitiesService.get', () => {
  it('unwraps the activity field', async () => {
    GET.mockResolvedValue({ data: { activity: { id: 'a1', name: 'Run' } } });
    expect(await ActivitiesService.get('a1')).toEqual({ id: 'a1', name: 'Run' });
  });

  it('returns null when there is no activity', async () => {
    GET.mockResolvedValue({ data: {} });
    expect(await ActivitiesService.get('a1')).toBeNull();
  });

  it('returns null on error', async () => {
    GET.mockRejectedValue(new Error('nope'));
    expect(await ActivitiesService.get('a1')).toBeNull();
  });
});

describe('ActivitiesService.getResolved', () => {
  it('returns the activity and normalized provenance (wrapped response)', async () => {
    GET.mockResolvedValue({
      data: {
        activity: { id: 'a1', name: 'Run' },
        provenance: {
          name: { kind: 'user', updatedAt: '2026-10-04T09:00:00Z' },
          description: { kind: 'enricher', enricher: 'workout-summary' },
        },
      },
    });
    expect(await ActivitiesService.getResolved('a1')).toEqual({
      activity: { id: 'a1', name: 'Run' },
      provenance: {
        name: { kind: 'user', updatedAt: '2026-10-04T09:00:00Z' },
        description: { kind: 'enricher', enricher: 'workout-summary' },
      },
    });
  });

  it('reads a bare activity response with provenance alongside', async () => {
    GET.mockResolvedValue({
      data: { id: 'a1', name: 'Run', provenance: { name: { kind: 'source', source: 'SOURCE_STRAVA' } } },
    });
    const result = await ActivitiesService.getResolved('a1');
    expect(result?.activity).toMatchObject({ id: 'a1', name: 'Run' });
    expect(result?.provenance).toEqual({ name: { kind: 'source', source: 'SOURCE_STRAVA' } });
  });

  it('returns empty provenance when the API omits it', async () => {
    GET.mockResolvedValue({ data: { activity: { id: 'a1' } } });
    expect(await ActivitiesService.getResolved('a1')).toEqual({ activity: { id: 'a1' }, provenance: {} });
  });

  it('returns null on error', async () => {
    GET.mockRejectedValue(new Error('nope'));
    expect(await ActivitiesService.getResolved('a1')).toBeNull();
  });
});

describe('ActivitiesService.update', () => {
  it('PUTs the wrapped edits then re-reads the resolved activity', async () => {
    PUT.mockResolvedValue({ data: { id: 'a1', name: 'Evening Run' } });
    GET.mockResolvedValue({
      data: {
        activity: { id: 'a1', name: 'Evening Run' },
        provenance: { name: { kind: 'user', updatedAt: '2026-10-04T10:00:00Z' } },
      },
    });

    const result = await ActivitiesService.update('a1', { name: 'Evening Run' });

    expect(PUT).toHaveBeenCalledWith(expect.any(String), {
      params: { path: { id: 'a1' } },
      body: { id: 'a1', activity: { name: 'Evening Run' } },
    });
    expect(result).toEqual({
      activity: { id: 'a1', name: 'Evening Run' },
      provenance: { name: { kind: 'user', updatedAt: '2026-10-04T10:00:00Z' } },
    });
  });

  it('propagates write failures to the caller', async () => {
    PUT.mockRejectedValue(new Error('boom'));
    await expect(ActivitiesService.update('a1', { name: 'x' })).rejects.toThrow('boom');
    expect(GET).not.toHaveBeenCalled();
  });
});

describe('ActivitiesService.resend', () => {
  it('POSTs to the repost route and reports success', async () => {
    POST.mockResolvedValue({ data: undefined });
    const result = await ActivitiesService.resend('a1');
    expect(POST).toHaveBeenCalledWith('/users/me/activities/{id}/repost', {
      params: { path: { id: 'a1' } },
    });
    expect(result.success).toBe(true);
  });

  it('reports a failure instead of throwing', async () => {
    POST.mockRejectedValue(new Error('nope'));
    const result = await ActivitiesService.resend('a1');
    expect(result.success).toBe(false);
  });
});

describe('normalizeProvenance', () => {
  it('maps enum-style kinds to the canonical lowercase form', () => {
    expect(
      normalizeProvenance({
        name: { kind: 'FIELD_SOURCE_KIND_SOURCE', source: 'SOURCE_STRAVA' },
        description: { kind: 'FIELD_SOURCE_KIND_ENRICHER', enricher: 'workout-summary' },
        notes: { kind: 'FIELD_SOURCE_KIND_USER_EDIT' },
      })
    ).toEqual({
      name: { kind: 'source', source: 'SOURCE_STRAVA' },
      description: { kind: 'enricher', enricher: 'workout-summary' },
      notes: { kind: 'user' },
    });
  });

  it('accepts origin/type as synonyms for kind', () => {
    expect(normalizeProvenance({ a: { origin: 'source' }, b: { type: 'enricher' } })).toEqual({
      a: { kind: 'source' },
      b: { kind: 'enricher' },
    });
  });

  it('drops entries with an unrecognised or missing kind', () => {
    expect(
      normalizeProvenance({ good: { kind: 'user' }, bad: { kind: 'mystery' }, empty: {} })
    ).toEqual({ good: { kind: 'user' } });
  });

  it('returns an empty map for non-object input', () => {
    expect(normalizeProvenance(undefined)).toEqual({});
    expect(normalizeProvenance(null)).toEqual({});
    expect(normalizeProvenance('nope')).toEqual({});
  });
});

describe('ActivitiesService.listUnsynchronized', () => {
  it('returns the executions array', async () => {
    GET.mockResolvedValue({ data: { executions: [{ pipelineExecutionId: 'p1' }] } });
    expect(await ActivitiesService.listUnsynchronized()).toEqual([{ pipelineExecutionId: 'p1' }]);
  });

  it('passes limit/offset query params', async () => {
    GET.mockResolvedValue({ data: { executions: [] } });
    await ActivitiesService.listUnsynchronized(5, 10);
    expect(GET).toHaveBeenCalledWith(expect.any(String), {
      params: { query: { limit: 5, offset: 10 } },
    });
  });

  it('returns [] on error', async () => {
    GET.mockRejectedValue(new Error('x'));
    expect(await ActivitiesService.listUnsynchronized()).toEqual([]);
  });
});

describe('ActivitiesService.getUnsynchronizedTrace', () => {
  it('normalises the trace shape', async () => {
    GET.mockResolvedValue({ data: { pipelineExecutionId: 'p1', pipelineExecution: [{ step: 's' }] } });
    expect(await ActivitiesService.getUnsynchronizedTrace('p1')).toEqual({
      pipelineExecutionId: 'p1',
      pipelineExecution: [{ step: 's' }],
    });
  });

  it('falls back to the passed id and empty execution list', async () => {
    GET.mockResolvedValue({ data: {} });
    expect(await ActivitiesService.getUnsynchronizedTrace('p9')).toEqual({
      pipelineExecutionId: 'p9',
      pipelineExecution: [],
    });
  });

  it('returns null on error', async () => {
    GET.mockRejectedValue(new Error('x'));
    expect(await ActivitiesService.getUnsynchronizedTrace('p1')).toBeNull();
  });
});

describe('ActivitiesService repost actions', () => {
  it('repostToMissedDestination returns the API response', async () => {
    POST.mockResolvedValue({ data: { success: true, message: 'ok' } });
    expect(await ActivitiesService.repostToMissedDestination('a1', 'strava')).toEqual({
      success: true,
      message: 'ok',
    });
  });

  it('repostToMissedDestination returns a failure on error', async () => {
    POST.mockRejectedValue(new Error('x'));
    expect(await ActivitiesService.repostToMissedDestination('a1', 'strava')).toEqual({
      success: false,
      message: 'Failed to re-post to destination',
    });
  });

  it('retryDestination returns a failure on error', async () => {
    POST.mockRejectedValue(new Error('x'));
    expect(await ActivitiesService.retryDestination('a1', 'strava')).toEqual({
      success: false,
      message: 'Failed to retry destination',
    });
  });

  it('fullPipelineRerun returns a failure on error', async () => {
    POST.mockRejectedValue(new Error('x'));
    expect(await ActivitiesService.fullPipelineRerun('a1')).toEqual({
      success: false,
      message: 'Failed to re-run pipeline',
    });
  });

  it('fullPipelineRerun defaults to success when API returns no body', async () => {
    POST.mockResolvedValue({ data: null });
    expect(await ActivitiesService.fullPipelineRerun('a1')).toEqual({ success: true });
  });
});
