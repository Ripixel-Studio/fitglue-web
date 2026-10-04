import React from 'react';
import { Badge, BadgeVariant } from './Badge';
import type { FieldProvenanceKind } from '../../../services/ActivitiesService';
import './ProvenanceChip.css';

export interface ProvenanceChipProps {
    /** Which kind of provenance this field has. */
    kind: FieldProvenanceKind;
    /**
     * Resolved human label for the origin — the source platform name ("Strava")
     * or enricher name ("Workout Summary"). Ignored for `user` ("Edited by you").
     */
    label?: string;
    /** Optional tooltip, e.g. the edit timestamp. */
    title?: string;
    className?: string;
}

interface KindMeta {
    variant: BadgeVariant;
    icon: string;
    /** Build the chip text; `label` is the resolved source/enricher name. */
    text: (label?: string) => string;
}

const KIND_META: Record<FieldProvenanceKind, KindMeta> = {
    source: { variant: 'source', icon: '📥', text: (l) => (l ? `Source · ${l}` : 'Source') },
    enricher: { variant: 'premium', icon: '✨', text: (l) => (l ? `Enricher · ${l}` : 'Enricher') },
    user: { variant: 'warning', icon: '✎', text: () => 'Edited by you' },
};

/**
 * A single per-field provenance chip. Renders one of three variants — source,
 * enricher, or "edited by you" — so a reader can see at a glance where the value
 * of each resolved activity field came from.
 */
export const ProvenanceChip: React.FC<ProvenanceChipProps> = ({ kind, label, title, className }) => {
    const meta = KIND_META[kind];
    if (!meta) return null;

    return (
        <Badge
            variant={meta.variant}
            size="sm"
            icon={meta.icon}
            className={['fg-provenance-chip', className].filter(Boolean).join(' ')}
        >
            <span title={title}>{meta.text(label)}</span>
        </Badge>
    );
};
