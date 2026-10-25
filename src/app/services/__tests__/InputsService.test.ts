import { describe, it, expect, vi, beforeEach } from 'vitest';

const POST = vi.fn();
vi.mock('../../../shared/api/client', () => ({
  client: { POST: (...a: unknown[]) => POST(...a) },
  default: { POST: (...a: unknown[]) => POST(...a) },
}));

import { InputsService } from '../InputsService';

beforeEach(() => POST.mockReset().mockResolvedValue({ data: {} }));

describe('InputsService', () => {
  it('resolveInput submits the input with its data', async () => {
    const ok = await InputsService.resolveInput({ activityId: 'a1', inputData: { foo: 'bar' } });
    expect(ok).toBe(true);
    expect(POST).toHaveBeenCalledWith('/users/me/pending-inputs/{inputId}/submit', {
      params: { path: { inputId: 'a1' } },
      body: { inputId: 'a1', inputData: { foo: 'bar' } },
    });
  });

  it('resolveInput defaults inputData to an empty object', async () => {
    await InputsService.resolveInput({ activityId: 'a2' });
    expect(POST).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: { inputId: 'a2', inputData: {} },
    }));
  });

  it('dismissInput submits with empty data', async () => {
    const ok = await InputsService.dismissInput('a3');
    expect(ok).toBe(true);
    expect(POST).toHaveBeenCalledWith('/users/me/pending-inputs/{inputId}/submit', {
      params: { path: { inputId: 'a3' } },
      body: { inputId: 'a3', inputData: {} },
    });
  });

  it('cancelPipeline posts to the cancel endpoint', async () => {
    expect(await InputsService.cancelPipeline('pi1')).toBe(true);
    expect(POST).toHaveBeenCalledWith('/users/me/pending-inputs/{inputId}/cancel', {
      params: { path: { inputId: 'pi1' } },
      body: { inputId: 'pi1' },
    });
  });

  it('cancelPipelineRun posts to the run cancel endpoint', async () => {
    expect(await InputsService.cancelPipelineRun('r1')).toBe(true);
    expect(POST).toHaveBeenCalledWith('/users/me/pipeline-runs/{runId}/cancel', {
      params: { path: { runId: 'r1' } },
      body: { runId: 'r1' },
    });
  });
});
