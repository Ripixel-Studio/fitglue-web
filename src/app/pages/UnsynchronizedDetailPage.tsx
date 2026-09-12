import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAtom } from 'jotai';
import { pipelineRunsAtom } from '../state/activitiesState';
import { useRealtimePipelineRuns } from '../hooks/useRealtimePipelineRuns';
import { PageLayout } from '../components/library/layout/PageLayout';
import { Button, IdBadge, useToast } from '../components/library/ui';
import { ExecutionStepTrace } from '../components/ExecutionStepTrace';
import { ExecutionStepStatus, PipelineRunStatus } from '../../types/pb/models/pipeline/execution';
import { InputsService } from '../services/InputsService';
import '../components/ExecutionStepTrace.css';
import './RunDetail.css';

const UnsynchronizedDetailPage: React.FC = () => {
    const { pipelineExecutionId } = useParams<{ pipelineExecutionId: string }>();
    const [activeTab, setActiveTab] = useState<'trace'>('trace');
    const [cancelling, setCancelling] = useState(false);
    const toast = useToast();
    const navigate = useNavigate();

    const { loading } = useRealtimePipelineRuns(true, 50);
    const [pipelineRuns] = useAtom(pipelineRunsAtom);

    const run = useMemo(
        () => pipelineRuns.find(r => r.id === pipelineExecutionId),
        [pipelineRuns, pipelineExecutionId]
    );

    if (!loading && !run) {
        return (
            <PageLayout title="Not Found" backTo="/activities" backLabel="Activities">
                <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                    Pipeline execution not found.
                </div>
            </PageLayout>
        );
    }

    const handleCancelPipeline = async () => {
        if (!pipelineExecutionId) return;
        if (!confirm('Cancel this pipeline run? It will stop here with no further processing.')) return;
        setCancelling(true);
        try {
            await InputsService.cancelPipelineRun(pipelineExecutionId);
            toast.success('Pipeline cancelled', 'The run has been cancelled.');
            navigate('/activities?tab=unsynchronized');
        } catch {
            toast.error('Cancel failed', 'Could not cancel the pipeline. Please try again.');
        } finally {
            setCancelling(false);
        }
    };

    const steps = run?.steps ?? [];
    const stepCount = steps.length;
    const errorCount = steps.filter(s => s.status === ExecutionStepStatus.EXECUTION_STEP_STATUS_FAILED).length;
    const okCount = steps.filter(s =>
        s.status === ExecutionStepStatus.EXECUTION_STEP_STATUS_OK ||
        s.status === ExecutionStepStatus.EXECUTION_STEP_STATUS_PASS
    ).length;
    const totalMs = steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
    const sourceLabel = run?.source?.replace(/^SOURCE_/, '').replace(/_/g, ' ').toLowerCase() ?? '—';

    return (
        <PageLayout>
            {/* ── Heading slab ── */}
            <div className="rd-head">
                <div>
                    <div className="rd-head__crumb">
                        <a href="/app/activities?tab=unsynchronized">ACTIVITIES</a>
                        <span>›</span>
                        <b>PIPELINE TRACE</b>
                    </div>
                    <div className="rd-head__title">
                        {run?.title || 'Unsynchronized Execution'}{' '}
                        <span className="gr">⚠</span>
                    </div>
                    <div className="rd-head__sub">
                        {sourceLabel && <>{sourceLabel} · </>}
                        <code>{pipelineExecutionId}</code>
                    </div>
                </div>
                <div className="rd-head__actions">
                    {(run?.status === PipelineRunStatus.PIPELINE_RUN_STATUS_PENDING ||
                        run?.status === PipelineRunStatus.PIPELINE_RUN_STATUS_RUNNING) && (
                        <Button variant="danger" size="small" onClick={handleCancelPipeline} disabled={cancelling}>
                            {cancelling ? 'Cancelling…' : '⊗ Cancel Pipeline'}
                        </Button>
                    )}
                </div>
            </div>

            {/* ── Summary stat bar ── */}
            <div className="rd-summary" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div>
                    <div className={`rd-summary__n${errorCount > 0 ? ' rd-summary__n--err' : ' rd-summary__n--ok'}`}>
                        {errorCount > 0 ? '✗ FAILED' : '— TRACE'}
                    </div>
                    <div className="rd-summary__l">Final Status</div>
                </div>
                <div>
                    <div className="rd-summary__n rd-summary__n--gr">{stepCount}</div>
                    <div className="rd-summary__l">Steps</div>
                </div>
                <div>
                    <div className={`rd-summary__n${errorCount > 0 ? ' rd-summary__n--err' : ''}`}>{errorCount}</div>
                    <div className="rd-summary__l">Errors</div>
                </div>
                <div>
                    <div className="rd-summary__n" style={{ fontSize: '1.25rem' }}>
                        {totalMs > 0 ? (totalMs < 1000 ? `${totalMs}ms` : `${(totalMs / 1000).toFixed(1)}s`) : '—'}
                    </div>
                    <div className="rd-summary__l">Total Runtime</div>
                </div>
            </div>

            {/* ── Toolbar ── */}
            <div className="rd-tools">
                <button
                    className={`rd-tools__tab${activeTab === 'trace' ? ' rd-tools__tab--active' : ''}`}
                    onClick={() => setActiveTab('trace')}
                >
                    TRACE
                    <span className="count">{stepCount} STEPS</span>
                </button>
                <div className="rd-tools__spacer" />
            </div>

            {/* ── Main 2-column layout ── */}
            <div className="rd-main">
                {/* Left rail: step list */}
                <aside className="rd-rail">
                    <div className="rd-rail__head">
                        STEPS <b>{stepCount}</b>
                    </div>
                    {[...steps]
                        .sort((a, b) => a.ordinal - b.ordinal)
                        .map(step => {
                            const isOk = step.status === ExecutionStepStatus.EXECUTION_STEP_STATUS_OK
                                || step.status === ExecutionStepStatus.EXECUTION_STEP_STATUS_PASS;
                            const isFailed = step.status === ExecutionStepStatus.EXECUTION_STEP_STATUS_FAILED;
                            const isSkipped = step.status === ExecutionStepStatus.EXECUTION_STEP_STATUS_SKIPPED;
                            const pillClass = isOk ? 'rd-step-row__pill--ok'
                                : isFailed ? 'rd-step-row__pill--err'
                                : isSkipped ? 'rd-step-row__pill--skip'
                                : 'rd-step-row__pill--queue';
                            const pillLabel = isOk ? 'OK' : isFailed ? 'ERR' : isSkipped ? 'SKIP' : '···';
                            const ms = step.durationMs && step.durationMs > 0
                                ? step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`
                                : '';
                            return (
                                <div key={step.id} className={`rd-step-row${isFailed ? ' active' : ''}`}>
                                    <span className="rd-step-row__n">{String(step.ordinal).padStart(2, '0')}</span>
                                    <div>
                                        <div className="rd-step-row__title">{step.displayName || `Step ${step.ordinal}`}</div>
                                        {ms && <div className="rd-step-row__time">{ms}</div>}
                                    </div>
                                    <span className={`rd-step-row__pill ${pillClass}`}>{pillLabel}</span>
                                </div>
                            );
                        })}
                </aside>

                {/* Right body */}
                <div className="rd-body">
                    {activeTab === 'trace' && (
                        <>
                            {/* Execution IDs */}
                            <div className="rd-providers-head">EXECUTION DETAILS</div>
                            <div className="rd-ids">
                                <div className="rd-ids__row">
                                    <span className="rd-ids__label">EXECUTION ID</span>
                                    <IdBadge id={pipelineExecutionId ?? ''} showChars={16} copyable />
                                </div>
                                {run?.title && (
                                    <div className="rd-ids__row">
                                        <span className="rd-ids__label">ACTIVITY</span>
                                        <span style={{ fontFamily: 'var(--fg-font-body)', color: 'var(--fg-paper)' }}>{run.title}</span>
                                    </div>
                                )}
                                {run?.source && (
                                    <div className="rd-ids__row">
                                        <span className="rd-ids__label">SOURCE</span>
                                        <span style={{ fontFamily: 'var(--fg-font-mono)', color: 'var(--fg-paper)', fontSize: '0.8125rem' }}>
                                            {sourceLabel}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Summary stats */}
                            <div className="rd-kvgrid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                                <div>
                                    <div className="rd-kvgrid__l">OK STEPS</div>
                                    <div className="rd-kvgrid__v" style={{ color: 'var(--fg-green)' }}>{okCount}</div>
                                </div>
                                <div>
                                    <div className="rd-kvgrid__l">FAILED STEPS</div>
                                    <div className="rd-kvgrid__v" style={{ color: errorCount > 0 ? 'var(--fg-rose)' : undefined }}>{errorCount}</div>
                                </div>
                                <div>
                                    <div className="rd-kvgrid__l">TOTAL RUNTIME</div>
                                    <div className="rd-kvgrid__v">
                                        {totalMs > 0 ? (totalMs < 1000 ? `${totalMs}ms` : `${(totalMs / 1000).toFixed(1)}s`) : '—'}
                                    </div>
                                </div>
                            </div>

                            {/* Full trace */}
                            <div className="rd-providers-head">
                                STEP TRACE <b>{stepCount} STEPS</b>
                            </div>
                            <div style={{ padding: '16px 32px' }}>
                                <ExecutionStepTrace steps={steps} isLoading={loading && !run} />
                            </div>
                        </>
                    )}

                </div>
            </div>
        </PageLayout>
    );
};

export default UnsynchronizedDetailPage;
