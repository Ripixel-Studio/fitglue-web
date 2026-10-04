import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProvenanceChip } from '../ProvenanceChip';

describe('ProvenanceChip', () => {
  it('renders a source chip with the resolved label', () => {
    render(<ProvenanceChip kind="source" label="Strava" />);
    const el = screen.getByText('Source · Strava');
    expect(el).toBeInTheDocument();
    // source → cyan stamp
    expect(el.closest('.fg-stamp')).toHaveClass('fg-stamp--cyan');
  });

  it('renders a bare source chip without a label', () => {
    render(<ProvenanceChip kind="source" />);
    expect(screen.getByText('Source')).toBeInTheDocument();
  });

  it('renders an enricher chip with the enricher name', () => {
    render(<ProvenanceChip kind="enricher" label="Workout Summary" />);
    const el = screen.getByText('Enricher · Workout Summary');
    expect(el).toBeInTheDocument();
    expect(el.closest('.fg-stamp')).toHaveClass('fg-stamp--violet');
  });

  it('renders "Edited by you" for user provenance and ignores the label', () => {
    render(<ProvenanceChip kind="user" label="ignored" />);
    const el = screen.getByText('Edited by you');
    expect(el).toBeInTheDocument();
    expect(el.closest('.fg-stamp')).toHaveClass('fg-stamp--gold');
  });

  it('applies the base provenance class', () => {
    render(<ProvenanceChip kind="source" label="Hevy" />);
    expect(screen.getByText('Source · Hevy').closest('.fg-stamp')).toHaveClass('fg-provenance-chip');
  });

  it('exposes the title as a tooltip', () => {
    render(<ProvenanceChip kind="user" title="Edited 1 Jan" />);
    expect(screen.getByText('Edited by you')).toHaveAttribute('title', 'Edited 1 Jan');
  });
});
