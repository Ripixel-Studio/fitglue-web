import React, { useState } from 'react';
import { logger } from '../../shared/logger';
import { PendingInput } from '../state/inputsState';
import type { PipelineRun } from '../../types/pb/user';
import { InputsService } from '../services/InputsService';
import { usePluginLookup } from '../hooks/usePluginLookup';
import { useRealtimePipelines } from '../hooks/useRealtimePipelines';
import { Button, CountdownRing, useToast } from './library/ui';
import { Select, Textarea, Input, FormField, FileInput } from './library/forms';
import { HybridRaceTaggerInput } from './forms/HybridRaceTaggerInput';
import { PhotoUploadInput } from './forms/PhotoUploadInput';
import { WorkoutEntryInput } from './forms/WorkoutEntryInput';
import '../pages/PendingInputsPage.css';

export const isUrgent = (deadline?: Date | null): boolean => {
    if (!deadline) return false;
    return deadline.getTime() - Date.now() < 3600 * 1000;
};

const ACTIVITY_TYPE_ICONS: Record<string, string> = {
    RUN: '🏃',
    RIDE: '🚴',
    SWIM: '🏊',
    WALK: '🚶',
    HIKE: '🥾',
    WEIGHT_TRAINING: '🏋️',
    WORKOUT: '💪',
    ROWING: '🚣',
    TENNIS: '🎾',
    GOLF: '⛳',
    YOGA: '🧘',
    SKIING: '⛷️',
    SNOWBOARDING: '🏂',
};

const formatSourceStartTime = (value: Date | undefined): string => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
    });
};

const formatAutoDeadline = (deadline?: Date | null): string | null => {
    if (!deadline) return null;
    return deadline.toLocaleString(undefined, {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
    });
};

interface PendingInputCardProps {
    input: PendingInput;
    /** The pipeline run this input belongs to, joined by the page. Supplies the
     *  current activity title and start time when the input itself lacks them. */
    activityRun?: PipelineRun;
    onResolved: () => void;
}

const PendingInputCard: React.FC<PendingInputCardProps> = ({ input, activityRun, onResolved }) => {
    const { getSourceInfo, getEnricherInfo } = usePluginLookup();
    const { pipelines } = useRealtimePipelines();
    const toast = useToast();

    const [formValues, setFormValues] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [fileNames, setFileNames] = useState<Record<string, { name: string; size: number }>>({});

    const handleInputChange = (field: string, value: string) => {
        setFormValues(prev => ({ ...prev, [field]: value }));
    };

    const formatLabel = (field: string): string => {
        const serverLabel = input.displayConfig?.fieldLabels?.[field];
        if (serverLabel) return serverLabel;
        return field.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    const handleSubmit = async () => {
        const missingFields = input.requiredFields?.filter((f: string) => !formValues[f] || formValues[f].trim() === '');
        if (missingFields && missingFields.length > 0) {
            toast.warning('Missing Fields', `Please fill in: ${missingFields.map(f => formatLabel(f)).join(', ')}`);
            return;
        }
        setIsSubmitting(true);
        try {
            const success = await InputsService.resolveInput({ activityId: input.activityId, inputData: formValues });
            if (success) {
                toast.success('Input Resolved', 'Activity details submitted successfully');
                onResolved();
            }
        } catch (error) {
            logger.error('Failed to submit details:', error);
            toast.error('Submission Failed', 'Failed to submit details. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleNoExercises = async () => {
        setIsSubmitting(true);
        try {
            const success = await InputsService.resolveInput({ activityId: input.activityId, inputData: { workout_data: '[]' } });
            if (success) {
                toast.success('Got it', 'Activity synced without exercise data');
                onResolved();
            }
        } catch {
            toast.error('Failed', 'Failed to submit. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDismiss = async () => {
        if (!confirm('Are you sure you want to dismiss this input request? The activity might remain unsynchronized.')) {
            return;
        }
        setIsSubmitting(true);
        try {
            const success = await InputsService.dismissInput(input.activityId);
            if (success) {
                toast.success('Input Dismissed', 'The pending input has been dismissed');
                onResolved();
            }
        } catch {
            toast.error('Dismiss Failed', 'Failed to dismiss input. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderField = (field: string) => {
        const value = formValues[field] ?? '';
        const fieldType = input.displayConfig?.fieldTypes?.[field] || '';

        if (fieldType.startsWith('custom:hybrid_race_tagger') || (!fieldType && field === 'race_selection')) {
            const lapsJson = input.providerMetadata?.laps || '[]';
            const presetsJson = input.providerMetadata?.presets || '[]';
            return (
                <HybridRaceTaggerInput
                    lapsJson={lapsJson}
                    presetsJson={presetsJson}
                    value={value}
                    onChange={(newValue) => handleInputChange(field, newValue)}
                />
            );
        }

        if (fieldType === 'photo_upload') {
            return (
                <PhotoUploadInput
                    activityId={input.activityId}
                    value={value}
                    onChange={(newValue) => handleInputChange(field, newValue)}
                />
            );
        }

        if (fieldType === 'workout_entry') {
            return (
                <WorkoutEntryInput
                    value={value}
                    onChange={(newValue) => handleInputChange(field, newValue)}
                />
            );
        }

        if (fieldType.startsWith('file') || (!fieldType && field === 'fit_file_base64')) {
            const acceptMatch = fieldType.match(/accept=([^,]+)/);
            const accept = acceptMatch?.[1] || '.fit';
            const fileInfo = fileNames[field];
            return (
                <FileInput
                    accept={accept}
                    placeholder={`Click to select ${accept} file`}
                    fileName={fileInfo?.name}
                    fileSize={fileInfo?.size}
                    onFileSelect={(file) => {
                        setFileNames(prev => ({ ...prev, [field]: { name: file.name, size: file.size } }));
                        const reader = new FileReader();
                        reader.onload = () => {
                            const base64 = (reader.result as string).split(',')[1];
                            handleInputChange(field, base64 || '');
                        };
                        reader.readAsDataURL(file);
                    }}
                />
            );
        }

        if (fieldType.startsWith('select') || (!fieldType && field === 'activity_type')) {
            return (
                <Select
                    value={value}
                    onChange={(e) => handleInputChange(field, e.target.value)}
                    options={[
                        { value: '', label: 'Select Type...' },
                        { value: 'RUN', label: 'Run' },
                        { value: 'RIDE', label: 'Ride' },
                        { value: 'WEIGHT_TRAINING', label: 'Weight Training' },
                        { value: 'WORKOUT', label: 'Workout' },
                    ]}
                />
            );
        }

        if (fieldType.startsWith('textarea') || (!fieldType && field === 'description')) {
            const rowsMatch = fieldType.match(/rows=(\d+)/);
            const rows = rowsMatch ? parseInt(rowsMatch[1], 10) : 3;
            return (
                <Textarea
                    placeholder={`Enter ${formatLabel(field)}...`}
                    value={value}
                    onChange={(e) => handleInputChange(field, e.target.value)}
                    rows={rows}
                />
            );
        }

        const placeholderMatch = fieldType.match(/placeholder=([^,]+)/);
        const placeholder = placeholderMatch ? placeholderMatch[1] : `Enter ${formatLabel(field)}...`;
        return (
            <Input
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={(e) => handleInputChange(field, e.target.value)}
            />
        );
    };

    // Derive display info
    const pipeline = input.pipelineId ? pipelines.find(p => p.id === input.pipelineId) : undefined;
    let sourceId = pipeline?.source?.toLowerCase() || '';
    if (!sourceId && input.sourceActivitySource) {
        sourceId = input.sourceActivitySource.toLowerCase().replace(/^source_/, '');
    }
    if (!sourceId) {
        const [sourcePart] = (input.activityId || '').split(':');
        sourceId = sourcePart?.toLowerCase().replace('source_', '') || 'unknown';
    }
    const sourceInfo = getSourceInfo(sourceId);
    const pipelineName = pipeline?.name || pipeline?.id || '';
    const enricherName = getEnricherInfo(input.enricherProviderId || '').name;

    const isAutoPopulated = input.autoPopulated === true;
    const autoDeadline = input.autoDeadline ?? null;
    const urgent = isUrgent(autoDeadline);
    const deadlineLabel = formatAutoDeadline(autoDeadline);
    const deadlinePassed = autoDeadline ? new Date() > autoDeadline : false;
    const activityTypeRaw = input.sourceActivityType?.replace(/^ACTIVITY_TYPE_/, '') || '';
    const activityIcon = ACTIVITY_TYPE_ICONS[activityTypeRaw] || '🏅';
    const enricherLabel = input.displayConfig?.title || enricherName;
    const stampLabel = urgent ? '⚠ URGENT' : (enricherLabel || activityTypeRaw || 'INPUT');

    const activityTypeHuman = activityTypeRaw
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    // The source_* fields are only populated for FIT-file uploads; for every
    // other source we fall back to the joined pipeline run so the card can still
    // show which activity this input maps to.
    const activityStartTime = input.sourceStartTime ?? activityRun?.startTime;
    const titleBase = input.sourceDisplayName
        || activityRun?.title
        || [sourceInfo.name, activityTypeHuman].filter(Boolean).join(' ')
        || 'Activity';

    const titleTime = activityStartTime
        ? activityStartTime.toLocaleString(undefined, {
            day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
          })
        : '';
    const titleText = titleTime ? `${titleBase} · ${titleTime}` : titleBase;

    const metaSource = sourceInfo.name;
    const createdLabel = formatSourceStartTime(input.createdAt);

    const showForm = !isAutoPopulated || deadlinePassed;

    return (
        <article className={`pi${urgent ? ' pi--urgent' : ''}`}>
            <div className="pi__head">
                <CountdownRing
                    deadline={autoDeadline}
                    createdAt={input.createdAt}
                    size={80}
                />
                <div>
                    <div className="pi__title">
                        {activityIcon} {titleText}
                    </div>
                    {(metaSource || pipelineName || createdLabel) && (
                        <div className="pi__meta">
                            {metaSource}
                            {pipelineName && <> · VIA <b>{pipelineName}</b></>}
                            {createdLabel && <> · ADDED {createdLabel}</>}
                        </div>
                    )}
                </div>
                <span className={`pi__stamp${urgent ? ' pi__stamp--urgent' : ''}`}>
                    {stampLabel}
                </span>
            </div>

            <div className="pi__why">
                <span className="pi__why-icon">
                    {isAutoPopulated ? '⏸' : '✨'}
                </span>
                <div>
                    {isAutoPopulated && !deadlinePassed ? (
                        <>
                            <b>{enricherName}</b> booster is waiting on official results.
                            We auto-poll — usually posted within a few hours.
                            {autoDeadline && <> Auto-populates by <b>{deadlineLabel}</b>.</>}
                        </>
                    ) : isAutoPopulated && deadlinePassed ? (
                        <>
                            Automatic results weren&apos;t found for <b>{enricherName}</b>.
                            Enter your results manually below.
                        </>
                    ) : (
                        <>
                            <b>Complete the missing info</b> so the pipeline can finish syncing this activity.
                        </>
                    )}
                </div>
            </div>

            {showForm && (
                <div className="pi__form">
                    {input.requiredFields?.map((field) => (
                        <FormField key={field} label={formatLabel(field)} htmlFor={`field-${field}-${input.activityId}`}>
                            {renderField(field)}
                        </FormField>
                    ))}
                </div>
            )}

            <div className="pi__cta">
                {deadlineLabel && !deadlinePassed && (
                    <span className="pi__cta-meta">
                        Auto-populates {deadlineLabel} →
                    </span>
                )}
                {showForm && input.requiredFields?.some(f =>
                    (input.displayConfig?.fieldTypes?.[f] ?? '') === 'workout_entry'
                ) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleNoExercises}
                        disabled={isSubmitting}
                    >
                        ⊘ NO EXERCISES
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDismiss}
                    disabled={isSubmitting}
                >
                    {isAutoPopulated && !deadlinePassed ? "DON'T WAIT →" : '⊘ SKIP'}
                </Button>
                {showForm && (
                    <Button
                        size="sm"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? '…' : 'SUBMIT →'}
                    </Button>
                )}
            </div>
        </article>
    );
};

export default PendingInputCard;
