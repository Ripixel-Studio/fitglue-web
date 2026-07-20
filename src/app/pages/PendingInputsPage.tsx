import { useMemo } from 'react';
import { useRealtimeInputs } from '../hooks/useRealtimeInputs';
import { useRealtimePipelineRuns } from '../hooks/useRealtimePipelineRuns';
import { Button } from '../components/library/ui';
import { PageLayout } from '../components/library/layout';
import PendingInputCard, { isUrgent } from '../components/PendingInputCard';
import type { PipelineRun } from '../../types/pb/user';
import './PendingInputsPage.css';

const PendingInputsPage = () => {
    const { inputs, loading, refresh } = useRealtimeInputs();
    // Pending inputs carry very little activity context (often just the source),
    // so we join each one to its pipeline run to surface the current activity
    // title and the time the activity took place.
    const { pipelineRuns } = useRealtimePipelineRuns(true, 100);

    const runForInput = useMemo(() => {
        const byActivity = new Map<string, PipelineRun>();
        const byPendingInput = new Map<string, PipelineRun>();
        for (const run of pipelineRuns) {
            if (run.activityId) byActivity.set(run.activityId, run);
            if (run.pendingInputId) byPendingInput.set(run.pendingInputId, run);
            for (const id of run.nonBlockingPendingInputIds ?? []) {
                byPendingInput.set(id, run);
            }
        }
        return { byActivity, byPendingInput };
    }, [pipelineRuns]);

    const urgentCount = inputs.filter(i => isUrgent(i.autoDeadline)).length;

    const headerStats = inputs.length > 0 ? (
        <>
            <div className="page-header-stat">
                <span className="page-header-stat__value page-header-stat__value--gradient">
                    {inputs.length}
                </span>
                <span className="page-header-stat__label">Pending</span>
            </div>
            {urgentCount > 0 && (
                <div className="page-header-stat">
                    <span className="page-header-stat__value" style={{ color: 'var(--fg-rose)' }}>
                        {urgentCount}
                    </span>
                    <span className="page-header-stat__label">Urgent</span>
                </div>
            )}
        </>
    ) : undefined;

    return (
        <PageLayout
            title="Action Required"
            headerStats={headerStats}
            headerSubtitle="These activities are waiting on you. Fill in the missing info, or let the deadline tick down and we'll auto-populate where we can."
            headerActions={
                <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
                    {loading ? '…' : '⟲ REFRESH'}
                </Button>
            }
        >
            <div className="fg-band">
                <span className="fg-band__label">PENDING INPUTS</span>
                <span className="fg-band__right">
                    {inputs.length > 0 ? `${inputs.length} AWAITING INPUT` : 'ALL CLEAR'}
                </span>
            </div>

            {!loading && inputs.length === 0 && (
                <div className="pi-empty">
                    <div className="pi-empty__icon">🎉</div>
                    <div className="pi-empty__title">ALL CAUGHT UP</div>
                    <p className="pi-empty__sub">No activities waiting for your input right now.</p>
                    <Button variant="ghost" size="sm" onClick={refresh}>CHECK AGAIN</Button>
                </div>
            )}

            {inputs.length > 0 && (
                <div className="pi-grid">
                    {inputs.map((input) => (
                        <PendingInputCard
                            key={input.id || input.activityId}
                            input={input}
                            activityRun={
                                (input.id ? runForInput.byPendingInput.get(input.id) : undefined)
                                ?? runForInput.byActivity.get(input.activityId)
                            }
                            onResolved={refresh}
                        />
                    ))}
                </div>
            )}
        </PageLayout>
    );
};

export default PendingInputsPage;
