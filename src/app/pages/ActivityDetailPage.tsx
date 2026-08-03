import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useRealtimePipelines } from '../hooks/useRealtimePipelines';
import { usePluginRegistry } from '../hooks/usePluginRegistry';
import { useRealtimePipelineRuns } from '../hooks/useRealtimePipelineRuns';
import { useRealtimeInputs } from '../hooks/useRealtimeInputs';
import { useShowcaseSlug } from '../hooks/useShowcaseSlug';
import { PageLayout } from '../components/library/layout';
import { CardSkeleton, Heading, Paragraph, Code, Button, SvgAsset, useToast, ProgressBar } from '../components/library/ui';
import '../components/library/ui/CardSkeleton.css';
import { MagicActionsPopover } from '../components/MagicActionsPopover';
import PendingInputCard from '../components/PendingInputCard';
import type { PendingInput } from '../hooks/useRealtimeInputs';
import { client } from '../../shared/api/client';
import { formatActivityType, formatDestination, formatDestinationStatus } from '../../types/pb/enum-formatters';
import { buildDestinationUrl } from '../utils/destinationUrls';
import { isNativeApp, sendToNative } from '../../shared/nativeBridge';
import { PluginManifest } from '../types/plugin';
import { BoosterExecution, PipelineRun, PipelineRunStatus } from '../../types/pb/user';
import { SynchronizedActivity } from '../services/ActivitiesService';
import './RunDetail.css';

interface ProviderExecution {
    ProviderName: string;
    Status: string;
    Metadata?: Record<string, unknown>;
}

const deriveOriginalSource = (pipelineRun: PipelineRun): string => {
    // Use the source field directly from PipelineRun
    if (pipelineRun.source) {
        return pipelineRun.source
            .replace(/^SOURCE_/, '')
            .replace(/_/g, ' ')
            .split(' ')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }
    return 'Unknown';
};

/**
 * Convert PipelineRun.boosters to ProviderExecution format for display
 */
const mapBoostersToExecutions = (boosters?: BoosterExecution[]): ProviderExecution[] => {
    if (!boosters || boosters.length === 0) return [];
    return boosters.map(b => ({
        ProviderName: b.providerName,
        Status: b.status,
        Metadata: b.metadata as Record<string, unknown>,
    }));
};

/**
 * Determine effective status by checking metadata for status override.
 * Enrichers may complete successfully at the execution level but report
 * their own internal status (error, skipped) in metadata.
 */
const getEffectiveStatus = (execution: ProviderExecution): string => {
    let status = execution.Status?.toUpperCase() || 'UNKNOWN';

    if (!execution.Metadata) return status;

    // Find status from metadata - check for any key that is exactly "status" or ends with "_status"
    let metadataStatus: string | null = null;
    for (const [key, val] of Object.entries(execution.Metadata)) {
        if ((key === 'status' || key.endsWith('_status')) && typeof val === 'string') {
            metadataStatus = val.toLowerCase();
            break;
        }
    }

    // Override execution status with metadata status if more specific
    if (status === 'SUCCESS' && metadataStatus) {
        if (metadataStatus === 'error') {
            status = 'ERROR';
        } else if (metadataStatus === 'skipped') {
            status = 'SKIPPED';
        }
    }

    return status;
};

interface GeneratedAsset {
    type: string;
    url: string;
    providerName: string;
}

const extractGeneratedAssets = (providerExecutions: ProviderExecution[]): GeneratedAsset[] => {
    const assets: GeneratedAsset[] = [];

    for (const execution of providerExecutions) {
        // Use effective status to honor metadata status override
        if (getEffectiveStatus(execution) !== 'SUCCESS' || !execution.Metadata) {
            continue;
        }

        for (const [key, value] of Object.entries(execution.Metadata)) {
            if (key.startsWith('asset_') && typeof value === 'string' && value.startsWith('http')) {
                const assetType = key.replace('asset_', '');
                assets.push({
                    type: assetType,
                    url: value,
                    providerName: execution.ProviderName || 'Unknown',
                });
            } else if (key === 'photo_urls' && typeof value === 'string' && value) {
                const urls = value.split(',').filter((u) => u.startsWith('http'));
                for (const url of urls) {
                    assets.push({ type: 'photo', url, providerName: execution.ProviderName || 'Unknown' });
                }
            }
        }
    }

    return assets;
};

interface EnrichmentMetric {
    label: string;
    value: string;
    icon: string;
}

const extractEnrichmentMetrics = (executions: ProviderExecution[]): EnrichmentMetric[] => {
    const merged: Record<string, unknown> = {};
    for (const e of executions) {
        if (getEffectiveStatus(e) === 'SUCCESS' && e.Metadata) {
            Object.assign(merged, e.Metadata);
        }
    }

    const metrics: EnrichmentMetric[] = [];
    const n = (key: string) => {
        const v = merged[key];
        return typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) : undefined);
    };
    const s = (key: string) => {
        const v = merged[key];
        return typeof v === 'string' ? v : undefined;
    };

    const avgHr = n('avg_heart_rate');
    if (avgHr !== undefined && !isNaN(avgHr)) metrics.push({ label: 'AVG HR', value: `${Math.round(avgHr)} bpm`, icon: '❤️' });

    const maxHr = n('max_heart_rate');
    if (maxHr !== undefined && !isNaN(maxHr)) metrics.push({ label: 'MAX HR', value: `${Math.round(maxHr)} bpm`, icon: '🔺' });

    const minHr = n('min_heart_rate');
    if (minHr !== undefined && !isNaN(minHr)) metrics.push({ label: 'MIN HR', value: `${Math.round(minHr)} bpm`, icon: '🔻' });

    const effort = n('effort_score');
    if (effort !== undefined && !isNaN(effort)) {
        const band = s('effort_band');
        metrics.push({ label: 'EFFORT', value: band ? `${Math.round(effort)}/100 · ${band}` : `${Math.round(effort)}/100`, icon: '⚡' });
    }

    const trimp = n('trimp');
    if (trimp !== undefined && !isNaN(trimp)) metrics.push({ label: 'TRIMP', value: String(Math.round(trimp)), icon: '📈' });

    const hoursRecover = n('hours_to_recover');
    if (hoursRecover !== undefined && !isNaN(hoursRecover)) metrics.push({ label: 'RECOVER', value: `${Math.round(hoursRecover)}h`, icon: '🔄' });

    const calories = n('calories_burned') ?? n('calories_kcal');
    if (calories !== undefined && !isNaN(calories)) metrics.push({ label: 'CALORIES', value: `${Math.round(calories)} kcal`, icon: '🔥' });

    const streak = n('current_streak_days');
    if (streak !== undefined && !isNaN(streak)) metrics.push({ label: 'STREAK', value: `${Math.round(streak)}d`, icon: '🔥' });

    return metrics;
};

const formatAssetType = (type: string): string => {
    const typeMap: Record<string, string> = {
        'ai_banner': 'AI Banner',
        'muscle_heatmap': 'Muscle Heatmap',
        'route_thumbnail': 'Route Map',
        'photo': 'Activity Photo',
    };
    return typeMap[type] || type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

// SvgAsset is now imported from '../components/library/ui'

// Remove unused getDestinationActivityType - we now get type directly from PipelineRun

const formatPlatformName = (
    platform: string,
    sources: PluginManifest[],
    destinations: PluginManifest[]
): { name: string; icon: string; iconType?: string; iconPath?: string } => {
    const key = platform.toLowerCase();

    const allPlugins = [...sources, ...destinations];
    const plugin = allPlugins.find(p => p.id === key);

    const name = plugin?.name || platform.charAt(0).toUpperCase() + platform.slice(1).toLowerCase();
    const icon = plugin?.icon || '📱';

    return { name, icon, iconType: plugin?.iconType, iconPath: plugin?.iconPath };
};

const formatDateTime = (dateStr?: string | Date): string => {
    if (!dateStr) return 'Unknown';
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    return date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

const formatMetadataKey = (key: string): string => {
    return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
};

const formatMetadataValue = (value: unknown): string => {
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return value.toLocaleString();
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
};

/**
 * Get card variant and status info based on pipeline run status
 * Mirrors the logic from EnrichedActivityCard for consistency
 */
const getStatusInfo = (status?: PipelineRunStatus): {
    cardVariant: 'default' | 'success' | 'premium' | 'awaiting' | 'needs-input';
    badgeVariant: 'default' | 'success' | 'warning' | 'error';
    statusLabel?: string;
    statusIcon?: string;
} => {
    switch (status) {
        case PipelineRunStatus.PIPELINE_RUN_STATUS_SYNCED:
            return { cardVariant: 'success', badgeVariant: 'success', statusLabel: 'Synced', statusIcon: '✅' };
        case PipelineRunStatus.PIPELINE_RUN_STATUS_PARTIAL:
            return { cardVariant: 'awaiting', badgeVariant: 'warning', statusLabel: 'Partial', statusIcon: '⚠️' };
        case PipelineRunStatus.PIPELINE_RUN_STATUS_FAILED:
            return { cardVariant: 'default', badgeVariant: 'error', statusLabel: 'Failed', statusIcon: '❌' };
        case PipelineRunStatus.PIPELINE_RUN_STATUS_RUNNING:
            return { cardVariant: 'awaiting', badgeVariant: 'default', statusLabel: 'Running', statusIcon: '🔄' };
        case PipelineRunStatus.PIPELINE_RUN_STATUS_PENDING:
            return { cardVariant: 'needs-input', badgeVariant: 'warning', statusLabel: 'Awaiting Input', statusIcon: '⏳' };
        case PipelineRunStatus.PIPELINE_RUN_STATUS_SKIPPED:
            return { cardVariant: 'premium', badgeVariant: 'default', statusLabel: 'Skipped', statusIcon: '⏭️' };
        case PipelineRunStatus.PIPELINE_RUN_STATUS_CANCELLED:
            return { cardVariant: 'default', badgeVariant: 'error', statusLabel: 'Cancelled', statusIcon: '⊗' };
        case PipelineRunStatus.PIPELINE_RUN_STATUS_SYNCED_WITH_PENDING:
            return { cardVariant: 'needs-input', badgeVariant: 'warning', statusLabel: 'Synced · Pending Input', statusIcon: '⏳' };
        default:
            return { cardVariant: 'default', badgeVariant: 'default' };
    }
};

/**
 * Select the pending inputs that belong to a given run.
 *
 * Every pending input the pipeline creates carries `linkedActivityId`, which the
 * server sets to the owning run's `activityId` — for BOTH blocking and non-blocking
 * inputs (see the enricher orchestrator's `handleWaitError` /
 * `createNonBlockingPendingInput`). That is the reliable join key: a pending input's
 * own `activityId`/`id` is the stable `source:external:provider` document ID, which
 * never equals a run's random-UUID `activityId`, so matching on that can never work.
 *
 * We additionally fall back to the run's denormalized `pendingInputId` /
 * `nonBlockingPendingInputIds` so inputs still surface on older run documents written
 * before `linked_activity_id` was populated.
 */
export function selectRunPendingInputs(inputs: PendingInput[], run: PipelineRun): PendingInput[] {
    const denormalizedIds = new Set(
        [run.pendingInputId, ...run.nonBlockingPendingInputIds].filter((v): v is string => Boolean(v))
    );
    return inputs.filter(i =>
        (Boolean(i.linkedActivityId) && i.linkedActivityId === run.activityId) ||
        (denormalizedIds.size > 0 && (denormalizedIds.has(i.activityId) || denormalizedIds.has(i.id ?? '')))
    );
}

const ActivityDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { pipelines } = useRealtimePipelines();
    const { sources, destinations: registryDestinations, enrichers } = usePluginRegistry();
    const toast = useToast();

    // Per-run export state
    const [exportStatus, setExportStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

    // Provider list filter: ALL | OK | SKIP
    const [providerFilter, setProviderFilter] = useState<'ALL' | 'OK' | 'SKIP'>('ALL');

    // Get pipeline runs - this is now the PRIMARY data source
    const { pipelineRuns, loading } = useRealtimePipelineRuns(true, 50);
    const { inputs, refresh: refreshInputs } = useRealtimeInputs();
    const showcaseSlug = useShowcaseSlug();

    // Find the pipeline run for this activity by activityId
    const pipelineRun = useMemo((): PipelineRun | undefined => {
        return pipelineRuns.find(run => run.activityId === id);
    }, [pipelineRuns, id]);

    // Find pending inputs belonging to this run
    const relevantInputs = useMemo(
        () => (pipelineRun ? selectRunPendingInputs(inputs, pipelineRun) : []),
        [inputs, pipelineRun]
    );

    // Memoized data extraction from PipelineRun
    const {
        sourceInfo,
        destinations,
        providerExecutions,
        activityType,
        generatedAssets,
        pipelineName,
        showcaseUrl,
    } = useMemo(() => {
        if (!pipelineRun) {
            return {
                sourceInfo: { name: '', icon: '' },
                destinations: [],
                providerExecutions: [],
                activityType: '',
                generatedAssets: [],
                pipelineName: undefined,
                showcaseUrl: undefined,
            };
        }

        const originalSource = deriveOriginalSource(pipelineRun);
        const sourceInfo = formatPlatformName(originalSource, sources, registryDestinations);

        // Build destinations from pipeline run destination outcomes (show all, with status)
        const destinations: { name: string; externalId: string; status: string }[] = (pipelineRun.destinations || [])
            .map(d => ({
                name: formatDestination(d.destination) || 'Unknown',
                externalId: d.externalId || '',
                status: formatDestinationStatus(d.status) || 'Unknown'
            }));

        // Use pipeline run boosters for enrichment data
        const providerExecutions = mapBoostersToExecutions(pipelineRun.boosters);

        const activityType = formatActivityType(pipelineRun.type);
        const generatedAssets = extractGeneratedAssets(providerExecutions);
        const pipelineName = pipelineRun.pipelineId
            ? pipelines.find(p => p.id === pipelineRun.pipelineId)?.name
            : undefined;

        // Build showcase URL if this activity was synced there.
        // Uses /@{slug}/{showcaseId} format. Falls back to /showcase/{showcaseId}
        // (which the showcase router also handles) if the slug isn't loaded yet.
        const showcaseDest = pipelineRun.destinations?.find(d => formatDestination(d.destination) === 'Showcase');
        const showcaseUrl = showcaseDest?.externalId
            ? (showcaseSlug
                ? `/@${showcaseSlug}/${showcaseDest.externalId}`
                : `/showcase/${showcaseDest.externalId}`)
            : undefined;

        return {
            sourceInfo,
            destinations,
            providerExecutions,
            activityType,
            generatedAssets,
            pipelineName,
            showcaseUrl,
        };
    }, [pipelineRun, sources, registryDestinations, pipelines, showcaseSlug]);

    if (loading && !pipelineRun) {
        return (
            <PageLayout title="Loading..." backTo="/activities" backLabel="Activities">
                <CardSkeleton variant="activity-detail" />
            </PageLayout>
        );
    }

    if (!pipelineRun) {
        return (
            <PageLayout title="Not Found" backTo="/activities" backLabel="Activities">
                <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                    <Heading level={3}>Activity not found</Heading>
                    <Paragraph muted>This activity may have been deleted or doesn&apos;t exist.</Paragraph>
                </div>
            </PageLayout>
        );
    }

    // Separate destinations by status
    const successDestinations = destinations.filter(d => d.status === 'Success');
    const failedDestinations = destinations.filter(d => d.status === 'Failed');
    const creditsUsed = successDestinations.length;

    const statusInfo = getStatusInfo(pipelineRun.status);
    const enrichmentMetrics = extractEnrichmentMetrics(providerExecutions);

    const handleExport = async () => {
        setExportStatus('loading');
        try {
            const { data } = await client.GET('/users/me/pipeline-runs/{runId}/export', {
                params: {
                    path: { runId: pipelineRun.id },
                },
            });
            if (!data?.downloadUrl) throw new Error('No download URL');
            const link = document.createElement('a');
            link.href = data.downloadUrl;
            link.download = `run-${pipelineRun.id}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setExportStatus('done');
            toast.success('Export Ready', 'Run data saved as a ZIP archive');
        } catch {
            setExportStatus('error');
            toast.error('Export Failed', 'Could not export run data. Try again.');
        }
    };

    return (
        <PageLayout>
            {/* ── Heading slab ── */}
            <div className="rd-head">
                <div>
                    <div className="rd-head__crumb">
                        <a href="/app/activities">ACTIVITIES</a>
                        <span>›</span>
                        <b>{pipelineRun.title || 'ACTIVITY DETAIL'}</b>
                    </div>
                    <div className="rd-head__title">
                        {pipelineRun.title || 'Untitled Activity'}{' '}
                        <span className="gr">→</span>
                    </div>
                    <div className="rd-head__sub">
                        {activityType}
                        {sourceInfo.name && <> · via {sourceInfo.name}</>}
                        {pipelineName && <> · {pipelineName}</>}
                        {' '}&nbsp;·&nbsp;
                        <code>{formatDateTime(pipelineRun.startTime)}</code>
                    </div>
                </div>
                <div className="rd-head__actions">
                    <Button variant="secondary" size="small" disabled={exportStatus === 'loading'} onClick={handleExport}>
                        {exportStatus === 'loading' ? '⏳ EXPORTING…' : '📦 EXPORT'}
                    </Button>
                    {showcaseUrl && (
                        isNativeApp ? (
                            <button
                                className="fg-button fg-button--ghost fg-button--sm"
                                onClick={() => sendToNative({ type: 'openShowcase', url: `${window.location.origin}${showcaseUrl}` })}
                            >
                                ↗ VIEW ON SHOWCASE
                            </button>
                        ) : (
                            <a href={showcaseUrl} target="_blank" rel="noopener noreferrer" className="fg-button fg-button--ghost fg-button--sm">
                                ↗ VIEW ON SHOWCASE
                            </a>
                        )
                    )}
                    <MagicActionsPopover
                        activity={{
                            activityId: pipelineRun.activityId,
                            title: pipelineRun.title,
                            description: pipelineRun.description,
                            type: pipelineRun.type,
                            source: pipelineRun.source,
                            startTime: pipelineRun.startTime,
                            destinations: destinations.reduce((acc, d) => ({ ...acc, [d.name]: d.externalId }), {} as Record<string, string>),
                            pipelineId: pipelineRun.pipelineId,
                            pipelineExecutionId: pipelineRun.id,
                            syncedAt: pipelineRun.updatedAt,
                        } as unknown as SynchronizedActivity}
                        pendingInputId={pipelineRun.pendingInputId ?? undefined}
                        isPendingRun={pipelineRun.status === PipelineRunStatus.PIPELINE_RUN_STATUS_PENDING}
                        onSuccess={() => { }}
                    />
                </div>
            </div>

            {/* ── Summary stat bar ── */}
            <div className="rd-summary">
                <div>
                    <div className={`rd-summary__n${statusInfo.cardVariant === 'success' ? ' rd-summary__n--ok' : statusInfo.cardVariant === 'default' ? ' rd-summary__n--err' : ''}`}>
                        {statusInfo.statusIcon} {statusInfo.statusLabel || '—'}
                    </div>
                    <div className="rd-summary__l">Final Status</div>
                </div>
                <div>
                    <div className="rd-summary__n rd-summary__n--gr">{providerExecutions.length}</div>
                    <div className="rd-summary__l">Enrichers Ran</div>
                </div>
                <div>
                    <div className="rd-summary__n">{successDestinations.length}</div>
                    <div className="rd-summary__l">Destinations · OK</div>
                </div>
                <div>
                    <div className={`rd-summary__n${failedDestinations.length > 0 ? ' rd-summary__n--err' : ''}`}>
                        {failedDestinations.length}
                    </div>
                    <div className="rd-summary__l">Errors</div>
                </div>
                <div>
                    <div className="rd-summary__n">{creditsUsed}</div>
                    <div className="rd-summary__l">Credits Used</div>
                </div>
                <div>
                    <div className="rd-summary__n rd-summary__n--sm">{formatDateTime(pipelineRun.updatedAt)}</div>
                    <div className="rd-summary__l">Synced</div>
                </div>
            </div>

            {/* ── Toolbar ── */}
            <div className="rd-tools">
                <span className="rd-tools__tab rd-tools__tab--active">
                    ACTIVITY
                    <span className="count">{activityType.toUpperCase()}</span>
                </span>
                <div className="rd-tools__spacer" />
            </div>

            {/* ── Pending inputs ── */}
            {relevantInputs.length > 0 && (
                <>
                    <div className="rd-providers-head">
                        ACTION REQUIRED{' '}
                        <b>{relevantInputs.length} PENDING {relevantInputs.length === 1 ? 'INPUT' : 'INPUTS'}</b>
                    </div>
                    <div className="pi-grid">
                        {relevantInputs.map((input) => (
                            <PendingInputCard
                                key={input.id || input.activityId}
                                input={input}
                                onResolved={refreshInputs}
                            />
                        ))}
                    </div>
                </>
            )}

            {/* ── Main 2-column layout ── */}
            <div className="rd-main">
                {/* Left rail: pipeline phases only — no per-booster rows */}
                <aside className="rd-rail">
                    <div className="rd-rail__head">
                        <span>Execution Trace</span>
                        <span>{1 + (providerExecutions.length > 0 ? 1 : 0) + destinations.length} STEPS</span>
                    </div>

                    {/* Source row */}
                    <div className="rd-step-row">
                        <span className="rd-step-row__n">SRC</span>
                        <div>
                            <div className="rd-step-row__title">{sourceInfo.name || 'Source'}</div>
                            <div className="rd-step-row__service">{activityType.toLowerCase()}</div>
                        </div>
                        <span className="rd-step-row__pill rd-step-row__pill--ok">OK</span>
                    </div>

                    {/* Single enricher group row — details live in the body, not here */}
                    {providerExecutions.length > 0 && (() => {
                        const ranCount = providerExecutions.filter(e => getEffectiveStatus(e) === 'SUCCESS').length;
                        const skipCount = providerExecutions.filter(e => getEffectiveStatus(e) === 'SKIPPED').length;
                        return (
                            <div className="rd-step-row active">
                                <span className="rd-step-row__n">ENR</span>
                                <div>
                                    <div className="rd-step-row__title">Enricher · {providerExecutions.length} boosters</div>
                                    <div className="rd-step-row__service">{ranCount} ran · {skipCount} skipped · ↓ detail in body</div>
                                </div>
                                <span className="rd-step-row__pill rd-step-row__pill--ok">✓ {ranCount}/{providerExecutions.length}</span>
                            </div>
                        );
                    })()}

                    {/* Divider before destinations */}
                    {destinations.length > 0 && (
                        <div className="rd-rail__divider">→ Router · destinations</div>
                    )}

                    {/* Destination rows */}
                    {destinations.map((dest, idx) => {
                        const destInfo = formatPlatformName(dest.name.toLowerCase(), sources, registryDestinations);
                        const pillClass = dest.status === 'Success' ? 'rd-step-row__pill--ok'
                            : dest.status === 'Failed' ? 'rd-step-row__pill--err'
                            : dest.status === 'Skipped' ? 'rd-step-row__pill--skip'
                            : 'rd-step-row__pill--queue';
                        return (
                            <div key={idx} className="rd-step-row">
                                <span className="rd-step-row__n">DST</span>
                                <div>
                                    <div className="rd-step-row__title">{destInfo.name}</div>
                                    <div className="rd-step-row__service">{dest.name.toLowerCase()}-uploader</div>
                                </div>
                                <span className={`rd-step-row__pill ${pillClass}`}>
                                    {dest.status === 'Success' ? 'OK' : dest.status.slice(0, 4).toUpperCase()}
                                </span>
                            </div>
                        );
                    })}
                </aside>

                {/* Right body */}
                <div className="rd-body">
                    {/* Enriched activity description (aggregate of all enrichers) — preserves newlines and bullets */}
                    {pipelineRun.description && (
                        <div className="ai-card">
                            <div className="ai-card__head">
                                <h3>✨ Activity Description</h3>
                            </div>
                            <div className="ai-card__body">
                                {pipelineRun.description.replace(/^✨ AI Summary:\n?/, '')}
                            </div>
                            <div className="ai-card__foot">
                                <span>POSTED VIA FITGLUE</span>
                                <button onClick={() => navigator.clipboard.writeText(pipelineRun.description || '')}>
                                    📋 COPY
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Generated assets */}
                    {generatedAssets.length > 0 && (
                        <>
                            <div className="rd-providers-head">
                                GENERATED ASSETS <b>{generatedAssets.length}</b>
                            </div>
                            <div className="rd-dests" style={{ gridTemplateColumns: `repeat(${Math.min(generatedAssets.length, 3)}, 1fr)` }}>
                                {generatedAssets.map((asset, idx) => (
                                    <a
                                        key={idx}
                                        href={asset.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="rd-dest rd-dest--asset"
                                    >
                                        <SvgAsset url={asset.url} alt={formatAssetType(asset.type)} className="asset-thumbnail" />
                                        <div className="rd-dest__name">{formatAssetType(asset.type)}</div>
                                    </a>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Enrichment metrics */}
                    {enrichmentMetrics.length > 0 && (
                        <>
                            <div className="rd-section-head">
                                <h2>Enrichment Data</h2>
                                <span className="rd-section-head__right">{enrichmentMetrics.length} metrics</span>
                            </div>
                            <div className="rd-kvgrid" style={{ gridTemplateColumns: `repeat(${Math.min(enrichmentMetrics.length, 3)}, 1fr)` }}>
                                {enrichmentMetrics.map(m => (
                                    <div key={m.label}>
                                        <div className="rd-kvgrid__l">{m.label}</div>
                                        <div className="rd-kvgrid__v">{m.icon} {m.value}</div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Boosters detailed list — ONE place only (rail has no per-booster rows) */}
                    {providerExecutions.length > 0 && (
                        <>
                            <div className="rd-providers-head">
                                <span>Provider Executions · {providerExecutions.length} boosters</span>
                                <div className="rd-provider__filter">
                                    {(['ALL', 'OK', 'SKIP'] as const).map(f => {
                                        const count = f === 'ALL' ? providerExecutions.length
                                            : f === 'OK' ? providerExecutions.filter(e => getEffectiveStatus(e) === 'SUCCESS').length
                                            : providerExecutions.filter(e => getEffectiveStatus(e) === 'SKIPPED').length;
                                        return (
                                            <button
                                                key={f}
                                                className={providerFilter === f ? 'active' : ''}
                                                onClick={() => setProviderFilter(f)}
                                            >
                                                {f} · {count}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            {providerExecutions.filter(exec => {
                                if (providerFilter === 'ALL') return true;
                                const s = getEffectiveStatus(exec);
                                return providerFilter === 'OK' ? s === 'SUCCESS' : s === 'SKIPPED';
                            }).map((exec, idx) => {
                                const effectiveStatus = getEffectiveStatus(exec);
                                const pillClass = effectiveStatus === 'SUCCESS' ? 'rd-step-row__pill--ok'
                                    : effectiveStatus === 'SKIPPED' ? 'rd-step-row__pill--skip'
                                    : (effectiveStatus === 'ERROR' || effectiveStatus === 'FAILED') ? 'rd-step-row__pill--err'
                                    : 'rd-step-row__pill--run';
                                const pillLabel = effectiveStatus === 'SUCCESS' ? 'OK'
                                    : effectiveStatus === 'SKIPPED' ? 'SKIP'
                                    : effectiveStatus;
                                const enricherPlugin = enrichers.find(
                                    e => e.id === exec.ProviderName || e.id === exec.ProviderName?.replace(/_/g, '-')
                                );
                                const displayName = enricherPlugin?.name || exec.ProviderName
                                    ?.replace(/[_-]/g, ' ')
                                    .split(' ')
                                    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                                    .join(' ') || 'Unknown';
                                const boosterMs = pipelineRun.boosters?.find(b => b.providerName === exec.ProviderName)?.durationMs;
                                const metaEntries = exec.Metadata
                                    ? Object.entries(exec.Metadata).filter(([k]) => !k.startsWith('asset_') && k !== 'photo_urls')
                                    : [];
                                return (
                                    <div key={idx} className="rd-provider">
                                        <span className="rd-provider__num">{String(idx + 1).padStart(2, '0')}</span>
                                        <div>
                                            <div className="rd-provider__name">{displayName}</div>
                                            {metaEntries.length > 0 && (
                                                <div className="rd-provider__meta">
                                                    {metaEntries.slice(0, 4).map(([k, v]) => (
                                                        <span key={k}><b>{formatMetadataKey(k)}</b> {formatMetadataValue(v)}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="rd-provider__right">
                                            <span className={`rd-step-row__pill ${pillClass}`}>{pillLabel}</span>
                                            {boosterMs != null && boosterMs > 0 && (
                                                <span className="rd-provider__ms">{boosterMs}ms</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}

                    {/* Destinations grid */}
                    {destinations.length > 0 && (
                        <>
                            <div className="rd-providers-head">
                                DESTINATIONS{' '}
                                <b>{successDestinations.length} OK{failedDestinations.length > 0 ? ` · ${failedDestinations.length} FAILED` : ''}</b>
                            </div>
                            <div className="rd-dests">
                                {destinations.map((dest, idx) => {
                                    const destInfo = formatPlatformName(dest.name.toLowerCase(), sources, registryDestinations);
                                    const pipeline = pipelineRun.pipelineId ? pipelines.find(p => p.id === pipelineRun.pipelineId) : undefined;
                                    const destConfig = pipeline?.destinationConfigs?.[dest.name.toLowerCase()]?.config;
                                    const externalUrl = buildDestinationUrl(registryDestinations, dest.name.toLowerCase(), dest.externalId, destConfig);
                                    const pillClass = dest.status === 'Success' ? 'rd-step-row__pill--ok'
                                        : dest.status === 'Failed' ? 'rd-step-row__pill--err'
                                        : dest.status === 'Skipped' ? 'rd-step-row__pill--skip'
                                        : 'rd-step-row__pill--queue';
                                    const destOutcome = pipelineRun.destinations?.find(
                                        d => formatDestination(d.destination) === dest.name
                                    );
                                    return (
                                        <div key={idx} className="rd-dest">
                                            <div className="rd-dest__emoji">{destInfo.icon}</div>
                                            <div>
                                                <div className="rd-dest__name">{destInfo.name}</div>
                                                {externalUrl ? (
                                                    <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="rd-dest__url">
                                                        View →
                                                    </a>
                                                ) : destOutcome?.error ? (
                                                    <span className="rd-dest__url" style={{ color: 'var(--fg-rose)' }}>{destOutcome.error}</span>
                                                ) : null}
                                            </div>
                                            <span className={`rd-step-row__pill ${pillClass}`}>
                                                {dest.status === 'Success' ? 'OK' : dest.status.slice(0, 4).toUpperCase()}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {/* Timing breakdown */}
                    {pipelineRun.boosters && pipelineRun.boosters.length > 0 && (() => {
                        const totalBoosterMs = pipelineRun.boosters.reduce((sum, b) => sum + (b.durationMs || 0), 0);
                        const maxBoosterMs = Math.max(...pipelineRun.boosters.map(b => b.durationMs || 0));
                        return (
                            <>
                                <div className="rd-providers-head">
                                    BOOSTER TIMING <b>{totalBoosterMs > 0 ? `${totalBoosterMs}ms TOTAL` : ''}</b>
                                </div>
                                {pipelineRun.boosters
                                    .slice()
                                    .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
                                    .map((booster, idx) => {
                                        const pct = maxBoosterMs > 0 ? Math.max(5, Math.round(((booster.durationMs || 0) / maxBoosterMs) * 100)) : 0;
                                        return (
                                            <div key={idx} className="rd-provider" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center' }}>
                                                    <Paragraph size="sm"><strong>{booster.providerName}</strong></Paragraph>
                                                    <span className={`rd-step-row__pill ${booster.status === 'SUCCESS' ? 'rd-step-row__pill--ok' : booster.status === 'FAILED' ? 'rd-step-row__pill--err' : 'rd-step-row__pill--skip'}`}>
                                                        {booster.status}
                                                    </span>
                                                    <span className="rd-provider__ms">{booster.durationMs > 0 ? `${booster.durationMs}ms` : '—'}</span>
                                                </div>
                                                {booster.durationMs > 0 && (
                                                    <ProgressBar
                                                        value={pct}
                                                        max={100}
                                                        size="sm"
                                                        variant={booster.status === 'SUCCESS' ? 'success' : booster.status === 'FAILED' ? 'error' : 'default'}
                                                    />
                                                )}
                                                {booster.error && <Code>{booster.error}</Code>}
                                            </div>
                                        );
                                    })}
                            </>
                        );
                    })()}

                    {/* Footer */}
                    <div className="rd-json__head">
                        <span>SYNCED {formatDateTime(pipelineRun.updatedAt)}</span>
                        <span className="chev">·</span>
                    </div>
                </div>
            </div>
        </PageLayout>
    );
};

export default ActivityDetailPage;
