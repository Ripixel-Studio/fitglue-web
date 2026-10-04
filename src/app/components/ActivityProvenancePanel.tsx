import React from 'react';
import { ProvenanceChip } from './library/ui';
import { usePluginLookup } from '../hooks/usePluginLookup';
import { formatActivityType } from '../../types/pb/enum-formatters';
import type {
    StandardizedActivity,
    ActivityProvenance,
    FieldProvenance,
} from '../services/ActivitiesService';
import './ActivityProvenancePanel.css';

export interface ActivityProvenancePanelProps {
    activity: StandardizedActivity;
    provenance: ActivityProvenance;
}

interface FieldDescriptor {
    /** Provenance map key / `StandardizedActivity` field name. */
    key: string;
    label: string;
    /** Render the resolved value, or null/'' to hide the row. */
    render: (a: StandardizedActivity) => React.ReactNode;
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

// Fields shown in the resolved-activity view, in reading order. Each maps to a
// provenance map key so the chip beside it reflects that field's origin.
const FIELDS: FieldDescriptor[] = [
    { key: 'name', label: 'Title', render: (a) => a.name },
    { key: 'type', label: 'Type', render: (a) => (a.type ? formatActivityType(a.type) : '') },
    { key: 'startTime', label: 'Start', render: (a) => formatStartTime(a.startTime) },
    { key: 'description', label: 'Description', render: (a) => a.description },
    { key: 'notes', label: 'Notes', render: (a) => a.notes },
    { key: 'tags', label: 'Tags', render: (a) => (a.tags && a.tags.length ? a.tags.join(', ') : '') },
];

/**
 * Renders the resolved activity as a set of labelled fields, each tagged with a
 * provenance chip showing where its current value came from — the origin source,
 * an enricher, or a hand edit on web. Returns null when there is nothing to show.
 */
export const ActivityProvenancePanel: React.FC<ActivityProvenancePanelProps> = ({
    activity,
    provenance,
}) => {
    const { getSourceName, getEnricherName } = usePluginLookup();

    const chipLabel = (p: FieldProvenance): string | undefined => {
        if (p.kind === 'source') {
            return getSourceName(p.source ?? activity.source ?? '');
        }
        if (p.kind === 'enricher') {
            return p.enricher ? getEnricherName(p.enricher) : undefined;
        }
        return undefined;
    };

    const chipTitle = (p: FieldProvenance): string | undefined => {
        if (p.kind === 'user' && p.updatedAt) {
            const date = new Date(p.updatedAt);
            if (!isNaN(date.getTime())) return `Edited ${date.toLocaleString()}`;
        }
        return undefined;
    };

    const rows = FIELDS.map((field) => ({ field, value: field.render(activity) }))
        .filter((row) => row.value !== undefined && row.value !== null && row.value !== '');

    if (rows.length === 0) return null;

    return (
        <section className="activity-provenance">
            <header className="activity-provenance__head">
                <h3>Resolved Activity</h3>
                <span className="activity-provenance__hint">
                    What FitGlue will sync — and where each field came from
                </span>
            </header>
            <dl className="activity-provenance__fields">
                {rows.map(({ field, value }) => {
                    const prov = provenance[field.key];
                    return (
                        <div className="activity-provenance__row" key={field.key}>
                            <dt className="activity-provenance__label">{field.label}</dt>
                            <dd className="activity-provenance__value">
                                <span className="activity-provenance__text">{value}</span>
                                {prov && (
                                    <ProvenanceChip
                                        kind={prov.kind}
                                        label={chipLabel(prov)}
                                        title={chipTitle(prov)}
                                    />
                                )}
                            </dd>
                        </div>
                    );
                })}
            </dl>
        </section>
    );
};

export default ActivityProvenancePanel;
