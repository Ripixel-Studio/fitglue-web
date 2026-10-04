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

/**
 * What produced a proposed re-run of an activity:
 *   - 'repull' → the activity was pulled fresh from its origin source platform
 *   - 'rerun'  → a single enricher was re-run against the current activity
 *
 * The gateway may serialise this as an enum ("PROPOSAL_ORIGIN_REPULL") or a plain
 * word; `normalizeProposal` is tolerant of both.
 */
export type ProposalOrigin = 'repull' | 'rerun';

/**
 * A proposed new version of an activity, produced by a re-pull from source or an
 * enricher re-run, held server-side until the athlete accepts or dismisses it.
 * Carries the full proposed resolved activity plus the provenance of each field,
 * so the UI can diff it against the live activity before anything is applied.
 */
export interface ActivityProposal {
  /** Opaque id so accept/dismiss target the exact proposal the athlete reviewed. */
  id: string;
  /** What produced the proposal. */
  origin: ProposalOrigin;
  /** When `origin === 'rerun'`, the enricher id/provider that produced it. */
  enricher?: string;
  /** The proposed resolved activity. */
  activity: StandardizedActivity;
  /** Provenance of each proposed field (same shape as the live activity's). */
  provenance: ActivityProvenance;
  /** ISO timestamp the proposal was created, when the API provides it. */
  createdAt?: string;
}

/** A resolved activity together with the provenance of each of its fields. */
export interface ResolvedActivity {
  activity: StandardizedActivity;
  provenance: ActivityProvenance;
  /**
   * A pending proposed re-run of this activity awaiting the athlete's decision,
   * produced by a re-pull from source or an enricher re-run. Absent when there is
   * nothing to review.
   */
  proposal?: ActivityProposal | null;
}

/**
 * The fields an athlete may edit by hand on web. These map one-to-one onto the
 * editable rows in the resolved-activity panel and onto what `UpdateActivity`
 * accepts on the gateway. Anything the athlete sets here becomes `user`
 * provenance ("edited by you") server-side.
 */
export type ActivityEdits = Partial<
  Pick<StandardizedActivity, 'name' | 'type' | 'startTime' | 'description' | 'notes' | 'tags'>
>;

/**
 * Human labels for the provenanced/editable activity fields, in reading order.
 * Shared by the enricher-contributions and proposal-diff views so the field set
 * and its ordering can never drift from `ActivityEdits` / the resolved panel.
 */
export const ACTIVITY_FIELD_LABELS: ReadonlyArray<{ key: keyof ActivityEdits; label: string }> = [
  { key: 'name', label: 'Title' },
  { key: 'type', label: 'Type' },
  { key: 'startTime', label: 'Start' },
  { key: 'description', label: 'Description' },
  { key: 'notes', label: 'Notes' },
  { key: 'tags', label: 'Tags' },
];

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

/** Normalise a raw proposal-origin value into the UI's canonical form. */
function normalizeProposalOrigin(raw: unknown): ProposalOrigin {
  return typeof raw === 'string' && /pull/i.test(raw) ? 'repull' : 'rerun';
}

/**
 * Normalise a raw proposal from the read API into an `ActivityProposal`, tolerant
 * of whether the proposed activity is bare or wrapped in `{ activity }` and of
 * where the id is carried (`id` or `proposalId`). Returns null for anything that
 * can't be identified — an un-addressable proposal can't be accepted or dismissed,
 * so it's safer to show nothing than an un-actionable card.
 */
export function normalizeProposal(raw: unknown): ActivityProposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  const id = typeof v.id === 'string' ? v.id : typeof v.proposalId === 'string' ? v.proposalId : '';
  if (!id) return null;
  const activityRaw =
    v.activity && typeof v.activity === 'object' ? (v.activity as Record<string, unknown>) : {};
  const proposal: ActivityProposal = {
    id,
    origin: normalizeProposalOrigin(v.origin ?? v.kind ?? v.source),
    activity: activityRaw as StandardizedActivity,
    provenance: normalizeProvenance(v.provenance ?? activityRaw.provenance),
  };
  if (typeof v.enricher === 'string') proposal.enricher = v.enricher;
  if (typeof v.createdAt === 'string') proposal.createdAt = v.createdAt;
  return proposal;
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
  update(id: string, edits: ActivityEdits): Promise<ResolvedActivity | null>;
  resend(id: string): Promise<RepostResponse>;
  rerunEnricher(id: string, enricher: string): Promise<ResolvedActivity | null>;
  repullFromSource(id: string): Promise<ResolvedActivity | null>;
  acceptProposal(id: string, proposalId: string): Promise<ResolvedActivity | null>;
  dismissProposal(id: string, proposalId: string): Promise<ResolvedActivity | null>;
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
      const resolved: ResolvedActivity = { activity, provenance };
      // Only attach a proposal when the API actually returns one, so the shape
      // stays `{ activity, provenance }` for the common (no-pending-run) case.
      const proposal = normalizeProposal(record.proposal ?? wrapped?.proposal);
      if (proposal) resolved.proposal = proposal;
      return resolved;
    } catch {
      return null;
    }
  },

  /**
   * Edit one or more fields of a resolved activity by hand (`UpdateActivity`).
   *
   * The gateway wraps the entity the same way `UpdatePipeline` / `UpdateProfile`
   * do — `{ id, activity }` on `PUT /users/me/activities/{id}` — so we follow
   * that convention. The put isn't in the generated client surface yet (the
   * generated path only exposes GET/DELETE/repost), so the path is cast onto a
   * sibling PUT route until the gateway proto gains `UpdateActivity`; the wire
   * contract (`{ id, activity }`) is unaffected by the cast.
   *
   * After writing, we re-read the resolved activity so the returned provenance
   * reflects the server's record — the edited fields come back as `user`
   * ("edited by you"). Throws (via the throwing client) if the write fails, so
   * callers can surface the failure to the athlete.
   */
  async update(id: string, edits: ActivityEdits) {
    await client.PUT('/users/me/activities/{id}' as '/users/me/pipelines/{id}', {
      params: { path: { id } },
      body: { id, activity: edits } as never,
    });
    return ActivitiesService.getResolved(id);
  },

  /**
   * Re-send an already-synced activity to its destinations with its current
   * resolved field values (`RepostActivity`). Used by the "re-send" control
   * after inline edits so destinations pick up the hand-edited values.
   */
  async resend(id: string): Promise<RepostResponse> {
    try {
      await client.POST('/users/me/activities/{id}/repost', {
        params: { path: { id } },
      });
      return { success: true, message: 'Activity re-sent to its destinations' };
    } catch {
      return { success: false, message: 'Failed to re-send activity' };
    }
  },

  /**
   * Re-run a single enricher against the activity's current resolved values
   * (`RerunEnricher`). The gateway runs the enricher fresh and stages its output
   * as a *proposal* rather than applying it, so the athlete reviews the change
   * before anything is re-sent. We re-read the resolved activity afterwards so the
   * freshly-staged `proposal` comes back on the returned view.
   *
   * The route isn't in the generated client surface yet (the gateway proto needs
   * `RerunEnricher`); the path is cast onto a sibling activities POST route until
   * it is. The wire contract — `POST /users/me/activities/{id}/enrichers/{enricher}/rerun`
   * — is unaffected by the cast. Throws (via the throwing client) on failure.
   */
  async rerunEnricher(id: string, enricher: string) {
    await client.POST(
      '/users/me/activities/{id}/enrichers/{enricher}/rerun' as '/users/me/activities/{id}/repost',
      { params: { path: { id, enricher } } as never }
    );
    return ActivitiesService.getResolved(id);
  },

  /**
   * Re-pull the activity from its origin source platform (`RepullActivity`),
   * picking up anything that changed there (edited title, added photos, corrected
   * GPS, …). Like `rerunEnricher`, the gateway stages the fresh pull as a proposal
   * for review rather than applying it, so we re-read to surface it. Throws on
   * failure. Route pending `RepullActivity` in the gateway proto.
   */
  async repullFromSource(id: string) {
    await client.POST('/users/me/activities/{id}/repull' as '/users/me/activities/{id}/repost', {
      params: { path: { id } },
    });
    return ActivitiesService.getResolved(id);
  },

  /**
   * Apply a staged proposal (`AcceptProposal`): its proposed values become the
   * activity's resolved values and the pending proposal is cleared. We re-read so
   * the returned view reflects the applied values with their new provenance and no
   * lingering proposal. Throws on failure. Route pending `AcceptProposal`.
   */
  async acceptProposal(id: string, proposalId: string) {
    await client.POST('/users/me/activities/{id}/proposal/accept' as '/users/me/activities/{id}/repost', {
      params: { path: { id } },
      body: { proposalId } as never,
    });
    return ActivitiesService.getResolved(id);
  },

  /**
   * Discard a staged proposal (`DismissProposal`) without touching the activity's
   * resolved values. We re-read so the returned view no longer carries the
   * proposal. Throws on failure. Route pending `DismissProposal`.
   */
  async dismissProposal(id: string, proposalId: string) {
    await client.POST('/users/me/activities/{id}/proposal/dismiss' as '/users/me/activities/{id}/repost', {
      params: { path: { id } },
      body: { proposalId } as never,
    });
    return ActivitiesService.getResolved(id);
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
