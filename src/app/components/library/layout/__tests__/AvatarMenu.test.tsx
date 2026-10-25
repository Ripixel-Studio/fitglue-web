import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AvatarMenu } from '../AvatarMenu';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

const baseProps = {
  displayName: 'Alice Smith',
  email: 'alice@example.com',
  initials: 'AS',
  isAthlete: false,
  onClose: vi.fn(),
};

describe('AvatarMenu', () => {
  it('renders display name uppercased and email', () => {
    render(<AvatarMenu {...baseProps} />, { wrapper: Wrapper });
    expect(screen.getByText('ALICE SMITH')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('shows hobbyist plan label when not athlete', () => {
    render(<AvatarMenu {...baseProps} />, { wrapper: Wrapper });
    expect(screen.getByText(/HOBBYIST PLAN/)).toBeInTheDocument();
  });

  it('shows athlete plan label when athlete', () => {
    render(<AvatarMenu {...baseProps} isAthlete />, { wrapper: Wrapper });
    expect(screen.getByText(/ATHLETE PLAN/)).toBeInTheDocument();
  });

  it('shows initials when no profile picture', () => {
    render(<AvatarMenu {...baseProps} />, { wrapper: Wrapper });
    expect(screen.getByText('AS')).toBeInTheDocument();
  });

  it('renders syncs label when provided', () => {
    render(<AvatarMenu {...baseProps} syncsThisMonth={12} />, { wrapper: Wrapper });
    expect(screen.getByText('12 SYNCS THIS MONTH')).toBeInTheDocument();
  });

  it('calls onClose when Escape pressed', async () => {
    const onClose = vi.fn();
    render(<AvatarMenu {...baseProps} onClose={onClose} />, { wrapper: Wrapper });
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the manage subscription link', () => {
    render(<AvatarMenu {...baseProps} />, { wrapper: Wrapper });
    expect(screen.getByRole('link', { name: 'MANAGE' })).toHaveAttribute(
      'href',
      '/settings/subscription',
    );
  });
});
