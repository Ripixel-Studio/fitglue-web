import React, { useState } from 'react';
import { ProvenanceChip, Button, useToast } from './library/ui';
import { usePluginLookup } from '../hooks/usePluginLookup';
import { formatActivityType } from '../../types/pb/enum-formatters';
import { ActivityType } from '../../types/pb/standardized_activity';
import {
    ActivitiesService,
    type StandardizedActivity,
    type ActivityProvenance,
    type ActivityEdits,
    type FieldProvenance,
    type ResolvedActivity,
} from '../services/ActivitiesService';
import './ActivityProvenancePanel.css';

export interface ActivityProvenancePanelProps {
    activity: StandardizedActivity;
    provenance: ActivityProvenance;
    /**
     * When set, each field becomes inline-editable (persisted via
     * `UpdateActivity`) and the "re-send" control appears. Omit for a
     * read-only view (e.g. public showcase).
     */
    activityId?: string;
    /**
     * Called with the fresh resolved activity after a successful inline edit,
     * so the parent can update its own copy. The panel is otherwise fully
     * controlled by the `activity`/`provenance` props.
     */
    onChange?: (next: ResolvedActivity) => void;
}

type EditorKind = 'text' | 'textarea' | 'type' | 'datetime' | 'tags';

interface FieldDescriptor {
    /** Provenance map key / `StandardizedActivity` field name. */
    key: string;
    label: string;
    editor: EditorKind;
    /** Render the resolved value, or null/'' to hide the row (read-only view). */
    render: (a: StandardizedActivity) => React.ReactNode;
    /** Current value as an editable string. */
    toInput: (a: StandardizedActivity) => string;
    /** Build the `UpdateActivity` patch from the edited string. */
    fromInput: (value: string) => ActivityEdits;
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

/** ISO timestamp → `datetime-local` input value (local time, no seconds). */
const isoToLocalInput = (iso?: string): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** `datetime-local` input value → ISO timestamp. Empty input clears the field. */
const localInputToIso = (value: string): string => {
    if (!value) return '';
    const d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toISOString();
};

// Activity-type options for the Type select, derived from the canonical enum so
// the list can never drift from the wire contract. Labels reuse the shared
// formatter the rest of the app renders with.
const ACTIVITY_TYPE_OPTIONS: Array<{ value: string; label: string }> = Object.keys(ActivityType)
    .filter((k) => k.startsWith('ACTIVITY_TYPE_'))
    .map((value) => ({ value, label: formatActivityType(value) }));

// Fields shown in the resolved-activity view, in reading order. Each maps to a
// provenance map key so the chip beside it reflects that field's origin.
const FIELDS: FieldDescriptor[] = [
    {
        key: 'name',
        label: 'Title',
        editor: 'text',
        render: (a) => a.name,
        toInput: (a) => a.name ?? '',
        fromInput: (v) => ({ name: v }),
    },
    {
        key: 'type',
        label: 'Type',
        editor: 'type',
        render: (a) => (a.type ? formatActivityType(a.type) : ''),
        toInput: (a) => a.type ?? '',
        fromInput: (v) => ({ type: v as StandardizedActivity['type'] }),
    },
    {
        key: 'startTime',
        label: 'Start',
        editor: 'datetime',
        render: (a) => formatStartTime(a.startTime),
        toInput: (a) => isoToLocalInput(a.startTime),
        fromInput: (v) => ({ startTime: localInputToIso(v) }),
    },
    {
        key: 'description',
        label: 'Description',
        editor: 'textarea',
        render: (a) => a.description,
        toInput: (a) => a.description ?? '',
        fromInput: (v) => ({ description: v }),
    },
    {
        key: 'notes',
        label: 'Notes',
        editor: 'textarea',
        render: (a) => a.notes,
        toInput: (a) => a.notes ?? '',
        fromInput: (v) => ({ notes: v }),
    },
    {
        key: 'tags',
        label: 'Tags',
        editor: 'tags',
        render: (a) => (a.tags && a.tags.length ? a.tags.join(', ') : ''),
        toInput: (a) => (a.tags ? a.tags.join(', ') : ''),
        fromInput: (v) => ({
            tags: v
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
        }),
    },
];

/**
 * Renders the resolved activity as a set of labelled fields, each tagged with a
 * provenance chip showing where its current value came from — the origin source,
 * an enricher, or a hand edit on web.
 *
 * When `activityId` is supplied the panel becomes interactive: each field can be
 * edited in place (persisted through `UpdateActivity`, flipping that field's
 * provenance to "edited by you"), and a re-send control lets the athlete push the
 * exact resolved values shown here back out to their destinations. Returns null
 * in read-only mode when there is nothing to show.
 */
export const ActivityProvenancePanel: React.FC<ActivityProvenancePanelProps> = ({
    activity,
    provenance,
    activityId,
    onChange,
}) => {
    const { getSourceName, getEnricherName } = usePluginLookup();
    const toast = useToast();
    const editable = Boolean(activityId);

    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [resending, setResending] = useState(false);
    const [confirmingResend, setConfirmingResend] = useState(false);

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

    const startEdit = (field: FieldDescriptor) => {
        setEditingKey(field.key);
        setDraft(field.toInput(activity));
    };

    const cancelEdit = () => {
        setEditingKey(null);
        setDraft('');
    };

    const saveEdit = async (field: FieldDescriptor) => {
        if (!activityId) return;
        setSaving(true);
        try {
            const edits = field.fromInput(draft);
            const result = await ActivitiesService.update(activityId, edits);
            // Prefer the server's authoritative resolved view; if the re-read
            // came back empty, fall back to an optimistic local merge that still
            // marks this field as hand-edited.
            const next: ResolvedActivity = result ?? {
                activity: { ...activity, ...edits },
                provenance: {
                    ...provenance,
                    [field.key]: { kind: 'user', updatedAt: new Date().toISOString() },
                },
            };
            onChange?.(next);
            toast.success('Saved', `${field.label} updated`);
            setEditingKey(null);
            setDraft('');
        } catch {
            toast.error('Save failed', `Could not update ${field.label}. Try again.`);
        } finally {
            setSaving(false);
        }
    };

    const handleResend = async () => {
        if (!activityId) return;
        setResending(true);
        try {
            const result = await ActivitiesService.resend(activityId);
            if (result.success) {
                toast.success('Re-sent', result.message);
            } else {
                toast.error('Re-send failed', result.message);
            }
        } finally {
            setResending(false);
            setConfirmingResend(false);
        }
    };

    const renderEditor = (field: FieldDescriptor) => {
        const inputId = `edit-${field.key}`;
        if (field.editor === 'type') {
            return (
                <select
                    id={inputId}
                    className="activity-provenance__input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={saving}
                >
                    {ACTIVITY_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            );
        }
        if (field.editor === 'textarea') {
            return (
                <textarea
                    id={inputId}
                    className="activity-provenance__input activity-provenance__input--area"
                    value={draft}
                    rows={4}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={saving}
                />
            );
        }
        return (
            <input
                id={inputId}
                className="activity-provenance__input"
                type={field.editor === 'datetime' ? 'datetime-local' : 'text'}
                value={draft}
                placeholder={field.editor === 'tags' ? 'comma, separated, tags' : undefined}
                onChange={(e) => setDraft(e.target.value)}
                disabled={saving}
            />
        );
    };

    const allRows = FIELDS.map((field) => ({ field, value: field.render(activity) }));
    // Read-only mode keeps the original behaviour (hide empty fields); editable
    // mode shows every field so empty ones can be filled in.
    const rows = editable
        ? allRows
        : allRows.filter((row) => row.value !== undefined && row.value !== null && row.value !== '');

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
                    const isEditing = editingKey === field.key;
                    const isEmpty = value === undefined || value === null || value === '';
                    return (
                        <div className="activity-provenance__row" key={field.key}>
                            <dt className="activity-provenance__label">{field.label}</dt>
                            <dd className="activity-provenance__value">
                                {isEditing ? (
                                    <div className="activity-provenance__editor">
                                        {renderEditor(field)}
                                        <div className="activity-provenance__editor-actions">
                                            <Button
                                                size="sm"
                                                variant="primary"
                                                disabled={saving}
                                                onClick={() => saveEdit(field)}
                                            >
                                                {saving ? 'Saving…' : 'Save'}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                disabled={saving}
                                                onClick={cancelEdit}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {isEmpty ? (
                                            <span className="activity-provenance__text activity-provenance__text--empty">
                                                Not set
                                            </span>
                                        ) : (
                                            <span className="activity-provenance__text">{value}</span>
                                        )}
                                        {prov && (
                                            <ProvenanceChip
                                                kind={prov.kind}
                                                label={chipLabel(prov)}
                                                title={chipTitle(prov)}
                                            />
                                        )}
                                        {editable && (
                                            <button
                                                type="button"
                                                className="activity-provenance__edit-btn"
                                                aria-label={`Edit ${field.label}`}
                                                onClick={() => startEdit(field)}
                                            >
                                                ✎ Edit
                                            </button>
                                        )}
                                    </>
                                )}
                            </dd>
                        </div>
                    );
                })}
            </dl>

            {editable && (
                <footer className="activity-provenance__foot">
                    <span className="activity-provenance__foot-hint">
                        This is exactly what FitGlue will re-send to your destinations.
                    </span>
                    {confirmingResend ? (
                        <div className="activity-provenance__editor-actions">
                            <Button
                                size="sm"
                                variant="primary"
                                disabled={resending}
                                onClick={handleResend}
                            >
                                {resending ? 'Re-sending…' : 'Confirm re-send'}
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={resending}
                                onClick={() => setConfirmingResend(false)}
                            >
                                Cancel
                            </Button>
                        </div>
                    ) : (
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setConfirmingResend(true)}
                        >
                            ↗ Re-send to destinations
                        </Button>
                    )}
                </footer>
            )}
        </section>
    );
};

export default ActivityProvenancePanel;
