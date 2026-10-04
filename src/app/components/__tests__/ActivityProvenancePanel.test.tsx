import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Registry lookups resolve ids → friendly names for the chips.
vi.mock('../../hooks/usePluginRegistry', () => ({
  usePluginRegistry: () => ({
    sources: [{ id: 'strava', name: 'Strava', icon: '🟠' }],
    enrichers: [{ id: 'workout-summary', name: 'Workout Summary', icon: '✨' }],
    destinations: [],
  }),
}));

import { ActivityProvenancePanel } from '../ActivityProvenancePanel';
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

describe('ActivityProvenancePanel', () => {
  it('renders the resolved field values', () => {
    render(<ActivityProvenancePanel activity={activity} provenance={{}} />);
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
    render(<ActivityProvenancePanel activity={activity} provenance={provenance} />);
    expect(screen.getByText('Source · Strava')).toBeInTheDocument();
  });

  it('renders an enricher chip resolving the enricher id to a name', () => {
    const provenance: ActivityProvenance = {
      description: { kind: 'enricher', enricher: 'workout-summary' },
    };
    render(<ActivityProvenancePanel activity={activity} provenance={provenance} />);
    expect(screen.getByText('Enricher · Workout Summary')).toBeInTheDocument();
  });

  it('renders an "edited by you" chip for user provenance', () => {
    const provenance: ActivityProvenance = {
      notes: { kind: 'user', updatedAt: '2026-10-04T09:00:00Z' },
    };
    render(<ActivityProvenancePanel activity={activity} provenance={provenance} />);
    expect(screen.getByText('Edited by you')).toBeInTheDocument();
  });

  it('hides fields with no value', () => {
    render(
      <ActivityProvenancePanel activity={{ name: 'Only a title' }} provenance={{}} />
    );
    expect(screen.getByText('Only a title')).toBeInTheDocument();
    expect(screen.queryByText('Description')).not.toBeInTheDocument();
    expect(screen.queryByText('Tags')).not.toBeInTheDocument();
  });

  it('renders nothing when the activity has no displayable fields', () => {
    const { container } = render(<ActivityProvenancePanel activity={{}} provenance={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
