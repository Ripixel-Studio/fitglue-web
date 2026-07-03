import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRealtimePipelines } from '../../hooks/useRealtimePipelines';
import { usePluginLookup } from '../../hooks/usePluginLookup';
import { DashboardBand } from '../library/ui/DashboardBand';
import { PipelineSummaryCard } from '../library/ui/PipelineSummaryCard';
import { EmptyState } from '../library/ui';

export const PipelinesSection: React.FC = () => {
    const navigate = useNavigate();
    const { pipelines, loading } = useRealtimePipelines();
    const { getSourceName, getSourceIcon, getDestinationName, getDestinationIcon } = usePluginLookup();

    const activePipelines = pipelines.filter((p: { disabled?: boolean }) => !p.disabled);
    const rightLabel = loading ? '…' : `${activePipelines.length} ACTIVE — VIEW ALL →`;

    return (
        <>
            <DashboardBand
                label="🔀 Your Pipelines"
                right={
                    <span
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate('/settings/pipelines')}
                    >
                        {rightLabel}
                    </span>
                }
            />
            {!loading && activePipelines.length === 0 ? (
                <EmptyState
                    variant="mini"
                    title="No pipelines configured"
                    actionLabel="Create First Pipeline"
                    onAction={() => navigate('/settings/pipelines/new')}
                />
            ) : (
                <div style={{ padding: '0.5rem 1.25rem 1.125rem' }}>
                    {activePipelines.slice(0, 5).map((pipeline) => {
                        const enricherCount = pipeline.enrichers?.length ?? 0;
                        const source = `${getSourceIcon(pipeline.source)} ${getSourceName(pipeline.source)}`;
                        const dests: [string, string][] = (pipeline.destinations ?? []).map(
                            (dest: string | number) => [getDestinationIcon(dest), getDestinationName(dest).toUpperCase()]
                        );
                        return (
                            <PipelineSummaryCard
                                key={pipeline.id}
                                name={pipeline.name || 'Unnamed Pipeline'}
                                source={source}
                                boosters={enricherCount}
                                dests={dests}
                                onClick={() => navigate(`/settings/pipelines`)}
                            />
                        );
                    })}
                    <div style={{ padding: '1rem 0 0.25rem', textAlign: 'center' }}>
                        <button
                            className="fg-button fg-button--ghost fg-button--sm"
                            onClick={() => navigate('/settings/pipelines/new')}
                        >
                            + NEW PIPELINE
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};
