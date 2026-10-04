import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Registry lookups resolve ids → friendly names for the chips.
vi.mock('../../hooks/usePluginRegistry', () => ({
  usePluginRegistry: () => ({
    sources: [{ id: 'strava', name: 'Strava', icon: '🟠' }],
    enrichers: [{ id: 'workout-summary', name: 'Workout Summary', icon: '✨' }],
    destinations: [],
  }),
}));

// The editing/re-send controls call these; the panel itself is UI-only.
const update = vi.fn();
const resend = vi.fn();
vi.mock('../../services/ActivitiesService', () => ({
  ActivitiesService: {
    update: (...a: unknown[]) => update(...a),
    resend: (...a: unknown[]) => resend(...a),
  },
}));

import { ActivityProvenancePanel } from '../ActivityProvenancePanel';
import { ToastProvider } from '../library/ui';
import type { StandardizedActivity, ActivityProvenance } from '../../services/ActivitiesService';

const activity: StandardizedActivity = {
  name: 'Morning Run',
  type: 'ACTIVITY_TYPE_RUN',
  description: 'A lovely jog',
  notes: 'Felt great',
  tags: ['race', 'pb'],
  source: 'SOURCE_STRAVA',
  startTime: '2026-10-04T08:00:00Z',
};

// Everything that calls useToast must live under a ToastProvider.
const renderPanel = (ui: React.ReactElement) =>
  render(<ToastProvider>{ui}</ToastProvider>);

beforeEach(() => {
  update.mockReset();
  resend.mockReset();
});

describe('ActivityProvenancePanel (read-only)', () => {
  it('renders the resolved field values', () => {
    renderPanel(<ActivityProvenancePanel activity={activity} provenance={{}} />);
    expect(screen.getByText('Resolved Activity')).toBeInTheDocument();
    expect(screen.getByText('Morning Run')).toBeInTheDocument();
    expect(screen.getByText('Run')).toBeInTheDocument();
    expect(screen.getByText('A lovely jog')).toBeInTheDocument();
    expect(screen.getByText('race, pb')).toBeInTheDocument();
  });

  it('renders a source chip resolving the source id to a name', () => {
    const provenance: ActivityProvenance = {
      name: { kind: 'source', source: 'SOURCE_STRAVA' },
    };
    renderPanel(<ActivityProvenancePanel activity={activity} provenance={provenance} />);
    expect(screen.getByText('Source · Strava')).toBeInTheDocument();
  });

  it('renders an enricher chip resolving the enricher id to a name', () => {
    const provenance: ActivityProvenance = {
      description: { kind: 'enricher', enricher: 'workout-summary' },
    };
    renderPanel(<ActivityProvenancePanel activity={activity} provenance={provenance} />);
    expect(screen.getByText('Enricher · Workout Summary')).toBeInTheDocument();
  });

  it('renders an "edited by you" chip for user provenance', () => {
    const provenance: ActivityProvenance = {
      notes: { kind: 'user', updatedAt: '2026-10-04T09:00:00Z' },
    };
    renderPanel(<ActivityProvenancePanel activity={activity} provenance={provenance} />);
    expect(screen.getByText('Edited by you')).toBeInTheDocument();
  });

  it('hides fields with no value and shows no edit controls', () => {
    renderPanel(<ActivityProvenancePanel activity={{ name: 'Only a title' }} provenance={{}} />);
    expect(screen.getByText('Only a title')).toBeInTheDocument();
    expect(screen.queryByText('Description')).not.toBeInTheDocument();
    expect(screen.queryByText('Tags')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit /i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Re-send to destinations/i)).not.toBeInTheDocument();
  });

  it('renders nothing when the activity has no displayable fields', () => {
    const { container } = renderPanel(<ActivityProvenancePanel activity={{}} provenance={{}} />);
    // ToastProvider renders a region wrapper; the panel section is what we care about.
    expect(container.querySelector('.activity-provenance')).toBeNull();
  });
});

describe('ActivityProvenancePanel (editable)', () => {
  it('shows an edit control for every field and the re-send control', () => {
    renderPanel(
      <ActivityProvenancePanel activity={activity} provenance={{}} activityId="a1" />
    );
    expect(screen.getByRole('button', { name: 'Edit Title' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Description' })).toBeInTheDocument();
    expect(screen.getByText(/Re-send to destinations/i)).toBeInTheDocument();
  });

  it('shows empty editable fields as "Not set" so they can be filled in', () => {
    renderPanel(
      <ActivityProvenancePanel activity={{ name: 'Only a title' }} provenance={{}} activityId="a1" />
    );
    // Description/Notes/Tags/Type/Start are all empty but still editable.
    expect(screen.getAllByText('Not set').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Edit Description' })).toBeInTheDocument();
  });

  it('edits a text field and persists it via UpdateActivity', async () => {
    update.mockResolvedValue({
      activity: { ...activity, name: 'Evening Run' },
      provenance: { name: { kind: 'user', updatedAt: '2026-10-04T10:00:00Z' } },
    });
    const onChange = vi.fn();
    renderPanel(
      <ActivityProvenancePanel
        activity={activity}
        provenance={{}}
        activityId="a1"
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Title' }));
    const input = screen.getByDisplayValue('Morning Run');
    fireEvent.change(input, { target: { value: 'Evening Run' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith('a1', { name: 'Evening Run' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        activity: { ...activity, name: 'Evening Run' },
        provenance: { name: { kind: 'user', updatedAt: '2026-10-04T10:00:00Z' } },
      })
    );
  });

  it('splits a comma list into tags on save', async () => {
    update.mockResolvedValue(null);
    const onChange = vi.fn();
    renderPanel(
      <ActivityProvenancePanel activity={activity} provenance={{}} activityId="a1" onChange={onChange} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Tags' }));
    fireEvent.change(screen.getByDisplayValue('race, pb'), {
      target: { value: 'race, pb, trail ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('a1', { tags: ['race', 'pb', 'trail'] })
    );
    // A null re-read falls back to an optimistic merge that marks the field edited.
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const next = onChange.mock.calls[0][0];
    expect(next.activity.tags).toEqual(['race', 'pb', 'trail']);
    expect(next.provenance.tags.kind).toBe('user');
  });

  it('cancelling an edit leaves the value untouched', () => {
    renderPanel(<ActivityProvenancePanel activity={activity} provenance={{}} activityId="a1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Title' }));
    fireEvent.change(screen.getByDisplayValue('Morning Run'), { target: { value: 'Nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Morning Run')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('re-sends the activity after confirmation', async () => {
    resend.mockResolvedValue({ success: true, message: 'Activity re-sent to its destinations' });
    renderPanel(<ActivityProvenancePanel activity={activity} provenance={{}} activityId="a1" />);

    fireEvent.click(screen.getByText(/Re-send to destinations/i));
    const confirm = screen.getByRole('button', { name: /Confirm re-send/i });
    fireEvent.click(confirm);

    await waitFor(() => expect(resend).toHaveBeenCalledWith('a1'));
  });
});
