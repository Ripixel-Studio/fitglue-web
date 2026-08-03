import { describe, it, expect } from 'vitest';
import { selectRunPendingInputs } from '../ActivityDetailPage';
import type { PendingInput } from '../../hooks/useRealtimeInputs';
import type { PipelineRun } from '../../../types/pb/user';

// The run's activityId is a random UUID; a pending input's id/activityId is the
// stable `source:external:provider` document id. They are different namespaces, so
// the reliable link is the input's linkedActivityId (== the run's activityId).
const RUN_ACTIVITY_ID = 'a1b2c3-uuid';
const STABLE_ID = 'SOURCE_STRAVA:12345:user_input';

const run = (over: Partial<PipelineRun> = {}): PipelineRun => ({
    activityId: RUN_ACTIVITY_ID,
    pendingInputId: undefined,
    nonBlockingPendingInputIds: [],
    ...over,
} as PipelineRun);

const input = (over: Partial<PendingInput> = {}): PendingInput => ({
    id: STABLE_ID,
    activityId: STABLE_ID,
    linkedActivityId: '',
    ...over,
} as PendingInput);

describe('selectRunPendingInputs', () => {
    it('links a blocking input via linkedActivityId even when the run has no denormalized ids', () => {
        const i = input({ linkedActivityId: RUN_ACTIVITY_ID });
        expect(selectRunPendingInputs([i], run())).toEqual([i]);
    });

    it('links a non-blocking input via linkedActivityId', () => {
        const i = input({
            id: 'SOURCE_STRAVA:12345:photo_upload',
            activityId: 'SOURCE_STRAVA:12345:photo_upload',
            linkedActivityId: RUN_ACTIVITY_ID,
            nonBlocking: true,
        });
        expect(selectRunPendingInputs([i], run())).toEqual([i]);
    });

    it('does NOT match a pending input whose activityId happens to equal the run id (dead legacy arm)', () => {
        // Guard against the old bug: matching input.activityId === run.activityId.
        // A real input never has activityId === run's UUID, but assert we don't rely on it.
        const i = input({ activityId: 'SOURCE_STRAVA:999:user_input', linkedActivityId: 'some-other-run' });
        expect(selectRunPendingInputs([i], run())).toEqual([]);
    });

    it('falls back to the run pendingInputId (denormalized) when linkedActivityId is missing', () => {
        const i = input({ linkedActivityId: '' });
        expect(selectRunPendingInputs([i], run({ pendingInputId: STABLE_ID }))).toEqual([i]);
    });

    it('falls back to nonBlockingPendingInputIds when linkedActivityId is missing', () => {
        const i = input({ linkedActivityId: '' });
        expect(
            selectRunPendingInputs([i], run({ nonBlockingPendingInputIds: [STABLE_ID] }))
        ).toEqual([i]);
    });

    it('does not leak inputs belonging to a different run', () => {
        const mine = input({ id: 'x:1:p', activityId: 'x:1:p', linkedActivityId: RUN_ACTIVITY_ID });
        const theirs = input({ id: 'y:2:p', activityId: 'y:2:p', linkedActivityId: 'other-run-uuid' });
        expect(selectRunPendingInputs([mine, theirs], run())).toEqual([mine]);
    });
});
