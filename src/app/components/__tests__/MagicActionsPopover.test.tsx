import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SynchronizedActivity } from '../../services/ActivitiesService';

vi.mock('../../hooks/usePluginRegistry', () => ({
  usePluginRegistry: () => ({ destinations: [] }),
}));
vi.mock('../../hooks/useRealtimeIntegrations', () => ({
  useRealtimeIntegrations: () => ({ integrations: {} }),
}));
vi.mock('../../hooks/useUser', () => ({ useUser: () => ({ user: {} }) }));

import { MagicActionsPopover } from '../MagicActionsPopover';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

const activity = { activityId: 'a1', destinations: {} } as unknown as SynchronizedActivity;

describe('MagicActionsPopover', () => {
  it('renders the trigger and opens the popover on click', () => {
    render(<MagicActionsPopover activity={activity} onSuccess={vi.fn()} />, { wrapper: Wrapper });
    const trigger = screen.getByText(/MAGIC ACTIONS/);
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByText(/Advanced/)).toBeInTheDocument();
  });

  it('does not offer Cancel pipeline for a completed run', () => {
    render(<MagicActionsPopover activity={activity} onSuccess={vi.fn()} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText(/MAGIC ACTIONS/));
    expect(screen.queryByText(/Cancel pipeline/)).not.toBeInTheDocument();
  });

  it('offers Cancel pipeline for a cancellable (pending or running) run', () => {
    render(<MagicActionsPopover activity={activity} onSuccess={vi.fn()} isCancellableRun />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText(/MAGIC ACTIONS/));
    expect(screen.getByText(/Cancel pipeline/)).toBeInTheDocument();
  });
});
