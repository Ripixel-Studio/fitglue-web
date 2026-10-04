import { client } from '../../shared/api/client';
import { logger } from '../../shared/logger';
import type { components } from '../../shared/api/schema-client';

/** The resolved activity as returned by the read API (`GET /users/me/activities/{id}`). */
export type StandardizedActivity = components['schemas']['StandardizedActivity'];

/**
 * Where a resolved activity field's current value came from. These three kinds
 * map one-to-one onto the provenance chips the web UI shows for every field:
 *   - 'source'   → the value came straight from the origin platform (Strava, Hevy, …)
 *   - 'enricher' → an enricher produced or overwrote the value
 *   - 'user'     → the athlete edited it by hand on web ("edited by you")
 *
 * The read API is the single source of truth for provenance. The canonical wire
 * shape for one field is `{ kind, source?, enricher?, updatedAt? }`; `kind` is the
 * discriminator. `normalizeProvenance` below is tolerant of the enum-style spellings
 * the gateway may serialise (e.g. "FIELD_SOURCE_KIND_ENRICHER") so the UI keeps
 * working regardless of casing.
 */
export type FieldProvenanceKind = 'source' | 'enricher' | 'user';

export interface FieldProvenance {
  kind: FieldProvenanceKind;
  /** Origin platform (e.g. "SOURCE_STRAVA" or "strava") when `kind === 'source'`. */
  source?: string;
  /** Enricher id or provider type (e.g. "workout-summary") when `kind === 'enricher'`. */
  enricher?: string;
  /** ISO timestamp the value was last set, when the API provides it. */
  updatedAt?: string;
}

/** Per-field provenance, keyed by `StandardizedActivity` field name (e.g. "name", "description"). */
export type ActivityProvenance = Record<string, FieldProvenance>;

/** A resolved activity together with the provenance of each of its fields. */
export interface ResolvedActivity {
  activity: StandardizedActivity;
  provenance: ActivityProvenance;
}

/**
 * Normalise one raw provenance kind into the UI's canonical lowercase form.
 * Tolerant of enum spellings ("FIELD_SOURCE_KIND_SOURCE"), plain words ("source"),
 * and the "edited by you" sense ("user"/"edit"). Returns null for anything else.
 */
function normalizeProvenanceKind(raw: unknown): FieldProvenanceKind | null {
  if (typeof raw !== 'string') return null;
  const k = raw.toLowerCase();
  // Order matters: enum spellings like "FIELD_SOURCE_KIND_ENRICHER" carry the
  // word "source" in their prefix, so the distinguishing tokens are matched first.
  if (k.includes('enrich')) return 'enricher';
  if (k.includes('user') || k.includes('edit')) return 'user';
  if (k.includes('source')) return 'source';
  return null;
}

function normalizeProvenanceEntry(value: unknown): FieldProvenance | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  // `kind` is canonical; `origin`/`type` are tolerated as synonyms.
  const kind = normalizeProvenanceKind(v.kind ?? v.origin ?? v.type);
  if (!kind) return null;
  const entry: FieldProvenance = { kind };
  if (typeof v.source === 'string') entry.source = v.source;
  if (typeof v.enricher === 'string') entry.enricher = v.enricher;
  if (typeof v.updatedAt === 'string') entry.updatedAt = v.updatedAt;
  return entry;
}

/**
 * Normalise the raw per-field provenance map from the read API. Unknown or
 * malformed entries are dropped so a single bad field can never break the view.
 */
export function normalizeProvenance(raw: unknown): ActivityProvenance {
  if (!raw || typeof raw !== 'object') return {};
  const out: ActivityProvenance = {};
  for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = normalizeProvenanceEntry(value);
    if (entry) out[field] = entry;
  }
  return out;
}

// These types would come from the generated schema once activities
// endpoints are added to the gateway proto. For now, defined locally.
export interface SynchronizedActivity {
  id: string;
  activityId?: string;
  name?: string;
  sport?: string;
  startedAt?: string;
  source?: string;
  pipelineExecution?: ExecutionRecord[];
  pipelineExecutionId?: string;
  enrichedData?: Record<string, unknown>;
  destinations?: Array<{ destination: string; status: string; externalId?: string; error?: string }>;
}

export interface UnsynchronizedEntry {
  pipelineExecutionId: string;
  activityId?: string;
  source?: string;
  startedAt?: string;
  error?: string;
  title?: string;
  activityType?: string;
  timestamp?: string;
  status?: string;
  errorMessage?: string;
}

export interface ExecutionRecord {
  /** Service name, e.g. "parkrun-results", "workout-summary" */
  service?: string;
  executionId?: string;
  step?: string;
  status?: string;
  /** ISO timestamp */
  timestamp?: string;
  startTime?: string;
  endTime?: string;
  startedAt?: string;
  completedAt?: string;
  triggerType?: string;
  inputsJson?: string;
  outputsJson?: string;
  error?: string;
  errorMessage?: string;
}

export interface RepostResponse {
  success: boolean;
  message: string;
  newPipelineExecutionId?: string;
  destination?: string;
  promptUpdatePipeline?: boolean;
}

export interface IActivitiesService {
  getStats(): Promise<{
    totalSynced: number;
    uploadsThisMonth: number;
  }>;
  get(id: string): Promise<SynchronizedActivity | null>;
  getResolved(id: string): Promise<ResolvedActivity | null>;
  listUnsynchronized(limit?: number, offset?: number): Promise<UnsynchronizedEntry[]>;
  getUnsynchronizedTrace(pipelineExecutionId: string): Promise<{ pipelineExecutionId: string; pipelineExecution: ExecutionRecord[] } | null>;
  repostToMissedDestination(activityId: string, destination: string): Promise<RepostResponse>;
  retryDestination(activityId: string, destination: string): Promise<RepostResponse>;
  fullPipelineRerun(activityId: string): Promise<RepostResponse>;
}


// TODO: Add unsynchronized endpoints to gateway proto so they appear in the OpenAPI spec.
export const ActivitiesService: IActivitiesService = {
  async getStats() {
    try {
      const { data } = await client.GET('/users/me/activities/stats');
      return {
        totalSynced: data?.totalActivities ?? 0,
        uploadsThisMonth: data?.uploadsThisMonth ?? 0,
      };
    } catch (err) {
      logger.warn('Failed to fetch activity stats', err);
      return { totalSynced: 0, uploadsThisMonth: 0 };
    }
  },

  async get(id: string) {
    try {
      const { data } = await client.GET('/users/me/activities/{id}', {
        params: { path: { id } }
      });
      return ((data as Record<string, unknown>)?.activity as SynchronizedActivity) || null;
    } catch {
      return null;
    }
  },

  async getResolved(id: string) {
    try {
      const { data } = await client.GET('/users/me/activities/{id}', {
        params: { path: { id } },
      });
      const record = (data ?? {}) as Record<string, unknown>;
      // The gateway may return the activity bare or wrapped in `{ activity }`;
      // provenance rides alongside it either way.
      const wrapped = record.activity as Record<string, unknown> | undefined;
      const activity = (wrapped ?? record) as StandardizedActivity;
      const provenance = normalizeProvenance(record.provenance ?? wrapped?.provenance);
      return { activity, provenance };
    } catch {
      return null;
    }
  },

  // TODO: Add /users/me/activities/unsynchronized to gateway proto
  async listUnsynchronized(limit = 20, offset = 0) {
    try {
      const { data } = await client.GET('/activities/unsynchronized' as '/users/me/activities/{id}', {
        params: { query: { limit, offset } } as never
      });
      return ((data as Record<string, unknown>)?.executions as UnsynchronizedEntry[]) || [];
    } catch (err) {
      logger.warn('Failed to fetch unsynchronized executions', err);
      return [];
    }
  },

  // TODO: Add /users/me/activities/unsynchronized/{id} to gateway proto
  async getUnsynchronizedTrace(pipelineExecutionId: string) {
    try {
      const { data } = await client.GET('/activities/unsynchronized/{pipelineExecutionId}' as '/users/me/activities/{id}', {
        params: { path: { pipelineExecutionId } } as never
      });
      const d = data as Record<string, unknown>;
      return d ? { pipelineExecutionId: (d.pipelineExecutionId as string) || pipelineExecutionId, pipelineExecution: (d.pipelineExecution as ExecutionRecord[]) || [] } : null;
    } catch {
      return null;
    }
  },

  async repostToMissedDestination(activityId: string, destination: string): Promise<RepostResponse> {
    try {
      const { data } = await client.POST('/repost/missed-destination', {
        body: { activityId, destination } as never,
      });
      return (data as RepostResponse) || { success: true };
    } catch {
      return { success: false, message: 'Failed to re-post to destination' };
    }
  },

  async retryDestination(activityId: string, destination: string): Promise<RepostResponse> {
    try {
      const { data } = await client.POST('/repost/retry-destination', {
        body: { activityId, destination } as never,
      });
      return (data as RepostResponse) || { success: true };
    } catch {
      return { success: false, message: 'Failed to retry destination' };
    }
  },

  async fullPipelineRerun(activityId: string): Promise<RepostResponse> {
    try {
      const { data } = await client.POST('/repost/full-pipeline', {
        body: { activityId } as never,
      });
      return (data as RepostResponse) || { success: true };
    } catch {
      return { success: false, message: 'Failed to re-run pipeline' };
    }
  },
};
