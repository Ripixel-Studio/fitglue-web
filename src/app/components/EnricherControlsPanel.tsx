import React, { useMemo, useState } from 'react';
import { Button, ProvenanceChip, useToast } from './library/ui';
import { usePluginLookup } from '../hooks/usePluginLookup';
import { formatActivityType } from '../../types/pb/enum-formatters';
import {
    ActivitiesService,
    ACTIVITY_FIELD_LABELS,
    type StandardizedActivity,
    type ActivityProvenance,
    type ActivityProposal,
    type FieldProvenance,
    type ResolvedActivity,
} from '../services/ActivitiesService';
import './EnricherControlsPanel.css';

export interface EnricherControlsPanelProps {
    /** The live resolved activity. */
    activity: StandardizedActivity;
    /** Per-field provenance of the live activity. */
    provenance: ActivityProvenance;
    /** A pending proposed re-run awaiting accept/dismiss, if any. */
    proposal?: ActivityProposal | null;
    /** Activity id — the controls act on this activity. */
    activityId: string;
    /**
     * Called with the fresh resolved activity after any control completes
     * (re-run, re-pull, accept, dismiss), so the parent can update its copy.
     */
    onChange: (next: ResolvedActivity) => void;
}

const formatStartTime = (iso?: string): string => {
    if (!iso) return '';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

/** Render one activity field as a human string, matching the resolved panel. */
const formatFieldValue = (key: keyof StandardizedActivity, a: StandardizedActivity): string => {
    const v = a[key];
    if (key === 'type') return v ? formatActivityType(v as string) : '';
    if (key === 'startTime') return formatStartTime(v as string | undefined);
    if (key === 'tags') return Array.isArray(v) ? v.join(', ') : '';
    if (v === undefined || v === null) return '';
    return typeof v === 'string' ? v : String(v);
};

/**
 * Enricher presentation + controls for the activity detail page.
 *
 * Shows what each enricher contributed to the resolved activity (grouped from the
 * per-field provenance), with a per-enricher re-run control; a re-pull-from-source
 * control; and, when the gateway has staged a proposed re-run, a review card that
 * diffs the proposal against the live activity so the athlete can accept or dismiss
 * it before anything is re-sent.
 *
 * All controls go through `ActivitiesService` and hand the re-read resolved
 * activity back up via `onChange`; the panel is otherwise fully controlled.
 */
export const EnricherControlsPanel: React.FC<EnricherControlsPanelProps> = ({
    activity,
    provenance,
    proposal,
    activityId,
    onChange,
}) => {
    const { getEnricherInfo, getSourceName } = usePluginLookup();
    const toast = useToast();

    // Which control is mid-flight, so only its button spins and the rest disable.
    const [pending, setPending] = useState<string | null>(null);

    // Invert provenance → the fields each enricher currently owns in the resolved
    // activity. Iterating FIELD order (not provenance key order) keeps the field
    // list under each enricher stable and in reading order.
    const contributions = useMemo(() => {
        const byEnricher = new Map<string, string[]>();
        for (const { key, label } of ACTIVITY_FIELD_LABELS) {
            const p = provenance[key];
            if (p?.kind === 'enricher' && p.enricher) {
                const list = byEnricher.get(p.enricher) ?? [];
                list.push(label);
                byEnricher.set(p.enricher, list);
            }
        }
        return Array.from(byEnricher.entries()).map(([enricher, fields]) => ({ enricher, fields }));
    }, [provenance]);

    const sourceName = getSourceName(activity.source ?? '');

    const run = async (
        key: string,
        action: () => Promise<ResolvedActivity | null>,
        okTitle: string,
        okBody: string,
        failBody: string
    ) => {
        setPending(key);
        try {
            const next = await action();
            if (next) onChange(next);
            toast.success(okTitle, okBody);
        } catch {
            toast.error('Something went wrong', failBody);
        } finally {
            setPending(null);
        }
    };

    const handleRerun = (enricher: string, name: string) =>
        run(
            `rerun:${enricher}`,
            () => ActivitiesService.rerunEnricher(activityId, enricher),
            'Re-run staged',
            `${name} re-ran — review the proposed changes below`,
            `Could not re-run ${name}. Try again.`
        );

    const handleRepull = () =>
        run(
            'repull',
            () => ActivitiesService.repullFromSource(activityId),
            'Re-pull staged',
            `Pulled fresh from ${sourceName} — review the proposed changes below`,
            `Could not re-pull from ${sourceName}. Try again.`
        );

    const handleAccept = () => {
        if (!proposal) return;
        return run(
            'accept',
            () => ActivitiesService.acceptProposal(activityId, proposal.id),
            'Changes applied',
            'The proposed values are now live on this activity',
            'Could not apply the proposed changes. Try again.'
        );
    };

    const handleDismiss = () => {
        if (!proposal) return;
        return run(
            'dismiss',
            () => ActivitiesService.dismissProposal(activityId, proposal.id),
            'Proposal dismissed',
            'Kept the current values; nothing was changed',
            'Could not dismiss the proposal. Try again.'
        );
    };

    const proposalOriginLabel = (p: ActivityProposal): string => {
        if (p.origin === 'repull') return `Re-pulled from ${sourceName}`;
        return `Re-ran ${p.enricher ? getEnricherInfo(p.enricher).name : 'an enricher'}`;
    };

    const chipLabel = (p: FieldProvenance): string | undefined => {
        if (p.kind === 'source') return getSourceName(p.source ?? activity.source ?? '');
        if (p.kind === 'enricher') return p.enricher ? getEnricherInfo(p.enricher).name : undefined;
        return undefined;
    };

    // Fields the proposal would change, with before/after values for the diff.
    const proposalDiff = useMemo(() => {
        if (!proposal) return [];
        return ACTIVITY_FIELD_LABELS.map(({ key, label }) => {
            const before = formatFieldValue(key, activity);
            const after = formatFieldValue(key, proposal.activity);
            return { key, label, before, after, prov: proposal.provenance[key] };
        }).filter((row) => row.before !== row.after);
    }, [proposal, activity]);

    const busy = pending !== null;

    return (
        <section className="enricher-controls">
            <header className="enricher-controls__head">
                <h3>Enrichers</h3>
                <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={handleRepull}
                >
                    {pending === 'repull' ? 'Re-pulling…' : '↻ Re-pull from source'}
                </Button>
            </header>

            {proposal && (
                <div className="enricher-controls__proposal" role="region" aria-label="Proposed changes">
                    <div className="enricher-controls__proposal-head">
                        <span className="enricher-controls__proposal-title">✨ Proposed changes</span>
                        <span className="enricher-controls__proposal-origin">{proposalOriginLabel(proposal)}</span>
                    </div>
                    {proposalDiff.length === 0 ? (
                        <p className="enricher-controls__empty">
                            This re-run produced no changes to the resolved activity.
                        </p>
                    ) : (
                        <dl className="enricher-controls__diff">
                            {proposalDiff.map((row) => (
                                <div className="enricher-controls__diff-row" key={row.key}>
                                    <dt className="enricher-controls__diff-label">{row.label}</dt>
                                    <dd className="enricher-controls__diff-values">
                                        <span className="enricher-controls__diff-before">
                                            {row.before || 'Not set'}
                                        </span>
                                        <span className="enricher-controls__diff-arrow">→</span>
                                        <span className="enricher-controls__diff-after">
                                            {row.after || 'Not set'}
                                        </span>
                                        {row.prov && (
                                            <ProvenanceChip kind={row.prov.kind} label={chipLabel(row.prov)} />
                                        )}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    )}
                    <div className="enricher-controls__proposal-actions">
                        <Button size="sm" variant="primary" disabled={busy} onClick={handleAccept}>
                            {pending === 'accept' ? 'Applying…' : '✓ Accept'}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={handleDismiss}>
                            {pending === 'dismiss' ? 'Dismissing…' : '✕ Dismiss'}
                        </Button>
                    </div>
                </div>
            )}

            {contributions.length === 0 ? (
                <p className="enricher-controls__empty">
                    No enricher contributed to this activity&apos;s resolved fields.
                </p>
            ) : (
                <ul className="enricher-controls__list">
                    {contributions.map(({ enricher, fields }) => {
                        const info = getEnricherInfo(enricher);
                        const rerunKey = `rerun:${enricher}`;
                        return (
                            <li className="enricher-controls__item" key={enricher}>
                                <span className="enricher-controls__icon" aria-hidden="true">{info.icon}</span>
                                <div className="enricher-controls__detail">
                                    <div className="enricher-controls__name">{info.name}</div>
                                    <div className="enricher-controls__fields">
                                        Contributed: {fields.join(', ')}
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() => handleRerun(enricher, info.name)}
                                >
                                    {pending === rerunKey ? 'Re-running…' : '↻ Re-run'}
                                </Button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
};

export default EnricherControlsPanel;
