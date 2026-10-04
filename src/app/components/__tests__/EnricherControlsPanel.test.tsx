import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Registry lookups resolve ids → friendly names/icons for the rows and chips.
vi.mock('../../hooks/usePluginRegistry', () => ({
  usePluginRegistry: () => ({
    sources: [{ id: 'strava', name: 'Strava', icon: '🟠' }],
    enrichers: [{ id: 'workout-summary', name: 'Workout Summary', icon: '✨' }],
    destinations: [],
  }),
}));

const rerunEnricher = vi.fn();
const repullFromSource = vi.fn();
const acceptProposal = vi.fn();
const dismissProposal = vi.fn();
vi.mock('../../services/ActivitiesService', async (importOriginal) => {
  // Keep the real ACTIVITY_FIELD_LABELS constant the component imports.
  const actual = await importOriginal<typeof import('../../services/ActivitiesService')>();
  return {
    ...actual,
    ActivitiesService: {
      rerunEnricher: (...a: unknown[]) => rerunEnricher(...a),
      repullFromSource: (...a: unknown[]) => repullFromSource(...a),
      acceptProposal: (...a: unknown[]) => acceptProposal(...a),
      dismissProposal: (...a: unknown[]) => dismissProposal(...a),
    },
  };
});

import { EnricherControlsPanel } from '../EnricherControlsPanel';
import { ToastProvider } from '../library/ui';
import type {
  StandardizedActivity,
  ActivityProvenance,
  ActivityProposal,
  ResolvedActivity,
} from '../../services/ActivitiesService';

const activity: StandardizedActivity = {
  name: 'Morning Run',
  type: 'ACTIVITY_TYPE_RUN',
  description: 'A lovely jog',
  source: 'SOURCE_STRAVA',
  startTime: '2026-10-04T08:00:00Z',
};

const provenance: ActivityProvenance = {
  name: { kind: 'source', source: 'SOURCE_STRAVA' },
  description: { kind: 'enricher', enricher: 'workout-summary' },
};

const renderPanel = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

beforeEach(() => {
  rerunEnricher.mockReset();
  repullFromSource.mockReset();
  acceptProposal.mockReset();
  dismissProposal.mockReset();
});

describe('EnricherControlsPanel contributions', () => {
  it('groups contributed fields under each enricher', () => {
    renderPanel(
      <EnricherControlsPanel
        activity={activity}
        provenance={provenance}
        activityId="a1"
        onChange={() => {}}
      />
    );
    expect(screen.getByText('Workout Summary')).toBeInTheDocument();
    expect(screen.getByText('Contributed: Description')).toBeInTheDocument();
  });

  it('shows an empty hint when no enricher owns a resolved field', () => {
    renderPanel(
      <EnricherControlsPanel
        activity={activity}
        provenance={{ name: { kind: 'source', source: 'SOURCE_STRAVA' } }}
        activityId="a1"
        onChange={() => {}}
      />
    );
    expect(
      screen.getByText(/No enricher contributed to this activity/i)
    ).toBeInTheDocument();
  });

  it('re-runs a single enricher and hands the result up via onChange', async () => {
    const next: ResolvedActivity = { activity, provenance, proposal: null };
    rerunEnricher.mockResolvedValue(next);
    const onChange = vi.fn();
    renderPanel(
      <EnricherControlsPanel
        activity={activity}
        provenance={provenance}
        activityId="a1"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Re-run/i }));
    await waitFor(() => expect(rerunEnricher).toHaveBeenCalledWith('a1', 'workout-summary'));
    expect(onChange).toHaveBeenCalledWith(next);
  });

  it('re-pulls from source', async () => {
    repullFromSource.mockResolvedValue({ activity, provenance });
    const onChange = vi.fn();
    renderPanel(
      <EnricherControlsPanel
        activity={activity}
        provenance={provenance}
        activityId="a1"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Re-pull from source/i }));
    await waitFor(() => expect(repullFromSource).toHaveBeenCalledWith('a1'));
    expect(onChange).toHaveBeenCalled();
  });
});

describe('EnricherControlsPanel proposal review', () => {
  const proposal: ActivityProposal = {
    id: 'prop-1',
    origin: 'rerun',
    enricher: 'workout-summary',
    activity: { ...activity, description: 'A brand new summary' },
    provenance: { description: { kind: 'enricher', enricher: 'workout-summary' } },
  };

  it('diffs the proposed change and labels its origin', () => {
    renderPanel(
      <EnricherControlsPanel
        activity={activity}
        provenance={provenance}
        proposal={proposal}
        activityId="a1"
        onChange={() => {}}
      />
    );
    expect(screen.getByText(/Proposed changes/)).toBeInTheDocument();
    expect(screen.getByText('Re-ran Workout Summary')).toBeInTheDocument();
    // Before (struck) and after values both present for the changed field.
    expect(screen.getByText('A lovely jog')).toBeInTheDocument();
    expect(screen.getByText('A brand new summary')).toBeInTheDocument();
  });

  it('accepts the proposal', async () => {
    acceptProposal.mockResolvedValue({ activity: proposal.activity, provenance: proposal.provenance });
    const onChange = vi.fn();
    renderPanel(
      <EnricherControlsPanel
        activity={activity}
        provenance={provenance}
        proposal={proposal}
        activityId="a1"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Accept/i }));
    await waitFor(() => expect(acceptProposal).toHaveBeenCalledWith('a1', 'prop-1'));
    expect(onChange).toHaveBeenCalled();
  });

  it('dismisses the proposal', async () => {
    dismissProposal.mockResolvedValue({ activity, provenance });
    const onChange = vi.fn();
    renderPanel(
      <EnricherControlsPanel
        activity={activity}
        provenance={provenance}
        proposal={proposal}
        activityId="a1"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }));
    await waitFor(() => expect(dismissProposal).toHaveBeenCalledWith('a1', 'prop-1'));
    expect(onChange).toHaveBeenCalled();
  });
});
