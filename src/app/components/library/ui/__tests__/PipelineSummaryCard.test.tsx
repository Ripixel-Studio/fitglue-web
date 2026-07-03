import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PipelineSummaryCard } from '../PipelineSummaryCard';

describe('PipelineSummaryCard', () => {
  const base = {
    name: 'My Pipeline',
    source: 'Strava',
    boosters: 3,
    dests: [['🏃', 'Strava']] as [string, string][],
  };

  it('renders name and source', () => {
    const { container } = render(<PipelineSummaryCard {...base} />);
    expect(screen.getByText('My Pipeline')).toBeInTheDocument();
    expect(container.querySelector('.pipeline-card__src')?.textContent).toBe('Strava');
  });

  it('pluralises booster count', () => {
    render(<PipelineSummaryCard {...base} boosters={3} />);
    expect(screen.getByText('3 BOOSTERS')).toBeInTheDocument();
  });

  it('singular booster count', () => {
    render(<PipelineSummaryCard {...base} boosters={1} />);
    expect(screen.getByText('1 BOOSTER')).toBeInTheDocument();
  });

  it('fires onClick', async () => {
    const handler = vi.fn();
    render(<PipelineSummaryCard {...base} onClick={handler} />);
    await userEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledOnce();
  });
});
