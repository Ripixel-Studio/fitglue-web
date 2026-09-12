import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SynchronizedActivity, ActivitiesService, RepostResponse } from '../services/ActivitiesService';
import { InputsService } from '../services/InputsService';
import { Destination } from '../../types/pb/events';
import { formatDestination } from '../../types/pb/enum-formatters';
import { usePluginRegistry } from '../hooks/usePluginRegistry';
import { useRealtimeIntegrations } from '../hooks/useRealtimeIntegrations';
import { useUser } from '../hooks/useUser';
import { getEffectiveTier, TIER_ATHLETE, HOBBYIST_TIER_LIMITS } from '../utils/tier';
import { PluginManifest } from '../types/plugin';
import { Modal, Button, Card, Paragraph } from './library/ui';
import { Stack } from './library/layout';

interface AvailableDestination {
    key: string;
    name: string;
    icon: string;
    enumValue: Destination;
}

const getAvailableDestinations = (
    registryDestinations: PluginManifest[],
    userIntegrations: Record<string, { connected?: boolean } | undefined> | null
): AvailableDestination[] => {
    const destinations: AvailableDestination[] = [];
    for (const destPlugin of registryDestinations) {
        const hasRequiredIntegrations = !destPlugin.requiredIntegrations?.length ||
            destPlugin.requiredIntegrations.every(id => userIntegrations?.[id]?.connected ?? false);
        if (!hasRequiredIntegrations) continue;
        const enumKey = `DESTINATION_${destPlugin.id.toUpperCase()}`;
        const enumValue = Destination[enumKey as keyof typeof Destination];
        if (typeof enumValue === 'number' && enumValue !== Destination.DESTINATION_UNSPECIFIED) {
            destinations.push({ key: destPlugin.id, name: formatDestination(enumValue), icon: destPlugin.icon || '📤', enumValue });
        }
    }
    return destinations;
};

type ModalType = 'missed' | 'retry' | 'full' | 'cancel' | null;

interface MagicActionsPopoverProps {
    activity: SynchronizedActivity;
    onSuccess: () => void;
    pendingInputId?: string;
    /** True when the run is still cancellable (PENDING or RUNNING) — surfaces the "Cancel pipeline" action. */
    isCancellableRun?: boolean;
}

export const MagicActionsPopover: React.FC<MagicActionsPopoverProps> = ({ activity, onSuccess, pendingInputId, isCancellableRun }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [modalType, setModalType] = useState<ModalType>(null);
    const [selectedDestination, setSelectedDestination] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<RepostResponse | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const { destinations: registryDestinations } = usePluginRegistry();
    const { integrations: userIntegrations } = useRealtimeIntegrations();
    const { user } = useUser();
    const navigate = useNavigate();

    const isAtLimit = user && getEffectiveTier(user) !== TIER_ATHLETE &&
        (user.syncCountThisMonth || 0) >= HOBBYIST_TIER_LIMITS.SYNCS_PER_MONTH;

    const availableDestinations = useMemo(
        () => getAvailableDestinations(registryDestinations, userIntegrations as Record<string, { connected?: boolean } | undefined> | null),
        [registryDestinations, userIntegrations]
    );

    const sourceKey = activity.source ? activity.source.replace(/^SOURCE_/, '').toLowerCase() : null;
    const syncedDestinations = activity.destinations ? Object.keys(activity.destinations) : [];
    const syncedDestinationsLower = syncedDestinations.map(k => k.toLowerCase());

    const missedDestinations = availableDestinations.filter(
        d => !syncedDestinationsLower.includes(d.key.toLowerCase()) && d.key !== sourceKey
    );
    const retryDestinations = syncedDestinations.filter(k => k.toLowerCase() !== sourceKey);

    // Close on outside click or Escape
    useEffect(() => {
        if (!isOpen) return;
        const onClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
        document.addEventListener('mousedown', onClickOutside);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClickOutside);
            document.removeEventListener('keydown', onKey);
        };
    }, [isOpen]);

    const openModal = (type: ModalType, destination?: string) => {
        setModalType(type);
        setSelectedDestination(destination || null);
        setResult(null);
        setIsOpen(false);
    };

    const closeModal = () => {
        setModalType(null);
        setSelectedDestination(null);
        setResult(null);
    };

    const handleAction = async () => {
        if (!modalType) return;
        setLoading(true);
        try {
            let response: RepostResponse;
            if (modalType === 'missed' && selectedDestination) {
                response = await ActivitiesService.repostToMissedDestination(activity.activityId!, selectedDestination);
            } else if (modalType === 'retry' && selectedDestination) {
                response = await ActivitiesService.retryDestination(activity.activityId!, selectedDestination);
            } else if (modalType === 'full') {
                response = await ActivitiesService.fullPipelineRerun(activity.activityId!);
            } else if (modalType === 'cancel' && activity.pipelineExecutionId) {
                await InputsService.cancelPipelineRun(activity.pipelineExecutionId);
                response = { success: true, message: 'Pipeline cancelled.' };
            } else {
                return;
            }
            setResult(response);
            if (response.success) {
                setTimeout(() => { onSuccess(); closeModal(); }, 2000);
            }
        } catch {
            setResult({ success: false, message: 'An unexpected error occurred' });
        } finally {
            setLoading(false);
        }
    };

    const destIcon = (key: string) =>
        availableDestinations.find(d => d.key.toLowerCase() === key.toLowerCase())?.icon || '📱';
    const destLabel = (key: string) =>
        availableDestinations.find(d => d.key.toLowerCase() === key.toLowerCase())?.name || key;

    return (
        <>
            <div ref={containerRef} className="magic">
                <button
                    className="magic__trigger"
                    onClick={() => setIsOpen(prev => !prev)}
                    aria-expanded={isOpen}
                    aria-haspopup="true"
                >
                    ✨ MAGIC ACTIONS <span>▾</span>
                </button>

                {isOpen && (
                    <div className="magic__pop">
                        {isAtLimit ? (
                            <div className="magic__limit">
                                <span>🔒 Monthly sync limit reached.</span>
                                <button
                                    className="magic__btn"
                                    onClick={() => { setIsOpen(false); navigate('/settings/subscription'); }}
                                >
                                    Upgrade for unlimited →
                                </button>
                            </div>
                        ) : (
                            <>
                                {missedDestinations.length > 0 && (
                                    <div className="magic__sec">
                                        <h5>📤 Send to another destination</h5>
                                        <p>Send to a platform it hasn&apos;t been synced to yet. Uses existing enrichments — no credits spent.</p>
                                        <div className="magic__row">
                                            {missedDestinations.map(dest => (
                                                <button
                                                    key={dest.key}
                                                    type="button"
                                                    className="magic__btn"
                                                    onClick={() => openModal('missed', dest.key)}
                                                >
                                                    {dest.icon} {dest.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {retryDestinations.length > 0 && (
                                    <div className="magic__sec">
                                        <h5>🔄 Retry destination</h5>
                                        <p>Re-send to a platform it&apos;s already synced to. Useful if the previous sync had issues.</p>
                                        <div className="magic__row">
                                            {retryDestinations.map(destKey => (
                                                <button
                                                    key={destKey}
                                                    type="button"
                                                    className="magic__btn"
                                                    onClick={() => openModal('retry', destKey)}
                                                >
                                                    {destIcon(destKey)} {destLabel(destKey)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="magic__sec">
                                    <h5>✨ Advanced</h5>
                                    <p>Re-process through the full pipeline with current boosters. May create duplicates on some platforms.</p>
                                    <div className="magic__row">
                                        <button
                                            type="button"
                                            className="magic__btn magic__btn--danger"
                                            onClick={() => openModal('full')}
                                        >
                                            🔄 Re-run entire pipeline
                                        </button>
                                        {(isCancellableRun || pendingInputId) && (
                                            <button
                                                type="button"
                                                className="magic__btn magic__btn--danger"
                                                onClick={() => openModal('cancel')}
                                            >
                                                ⊗ Cancel pipeline
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Confirmation modal — renders in a portal, unaffected by popover */}
            <Modal
                isOpen={!!modalType}
                onClose={closeModal}
                title={
                    modalType === 'missed'  ? `📤 Send to ${selectedDestination}` :
                    modalType === 'retry'   ? `🔄 Retry ${selectedDestination}` :
                    modalType === 'cancel'  ? '⊗ Cancel Pipeline' :
                                             '✨ Re-run Pipeline'
                }
                size="sm"
                footer={
                    <Stack direction="horizontal" gap="sm" justify="end">
                        <Button variant="secondary" onClick={closeModal} disabled={loading}>Cancel</Button>
                        <Button
                            variant={modalType === 'full' || modalType === 'cancel' ? 'danger' : 'primary'}
                            onClick={handleAction}
                            disabled={loading || result?.success === true}
                        >
                            {loading ? 'Processing…' : modalType === 'full' ? 'Re-run Pipeline' : modalType === 'cancel' ? 'Cancel Pipeline' : 'Confirm'}
                        </Button>
                    </Stack>
                }
            >
                <Stack gap="md">
                    {modalType === 'missed' && (
                        <Paragraph>This will send the activity to {selectedDestination}. The original enrichments will be preserved.</Paragraph>
                    )}
                    {modalType === 'retry' && (
                        <Paragraph>This will re-send the activity to {selectedDestination}. If it already exists, it will be updated.</Paragraph>
                    )}
                    {modalType === 'full' && (
                        <Stack gap="sm">
                            <Card variant="elevated">
                                <Paragraph>⚠️ <Paragraph inline bold>Warning:</Paragraph> This re-processes through the entire pipeline and may create <Paragraph inline bold>duplicate activities</Paragraph> in destination platforms.</Paragraph>
                            </Card>
                            <Paragraph>Use this only to apply new enrichers or fix processing issues.</Paragraph>
                        </Stack>
                    )}
                    {modalType === 'cancel' && (
                        <Stack gap="sm">
                            <Card variant="elevated">
                                <Paragraph>⚠️ <Paragraph inline bold>Warning:</Paragraph> This will permanently cancel the pipeline run. The activity will remain in its current state with <Paragraph inline bold>no further processing</Paragraph>.</Paragraph>
                            </Card>
                            <Paragraph>Use this to stop a run you started in error — whether it&apos;s still processing or waiting for input — before it uploads to your destinations. Uploads that have already completed are not undone.</Paragraph>
                        </Stack>
                    )}
                    {result && (
                        <Card variant={result.success ? 'elevated' : 'default'}>
                            <Paragraph>{result.success ? '✓' : '✗'} {result.message}</Paragraph>
                        </Card>
                    )}
                </Stack>
            </Modal>
        </>
    );
};
