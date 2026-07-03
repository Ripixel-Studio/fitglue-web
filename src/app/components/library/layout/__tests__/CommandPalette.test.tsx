import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Provider, createStore } from 'jotai';
import { CommandPalette } from '../CommandPalette';
import { userProfileAtom } from '../../../../state/userState';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function adminWrapper(isAdmin: boolean) {
  const store = createStore();
  store.set(userProfileAtom, { isAdmin } as never);
  return function AdminWrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter><Provider store={store}>{children}</Provider></MemoryRouter>;
  };
}

describe('CommandPalette', () => {
  it('renders the search input and dialog', () => {
    render(<CommandPalette onClose={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search commands' })).toBeInTheDocument();
  });

  it('renders global actions and nav items by default', () => {
    render(<CommandPalette onClose={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByText('Create new pipeline')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('filters items by query', async () => {
    render(<CommandPalette onClose={vi.fn()} />, { wrapper: Wrapper });
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search commands' }),
      'connections',
    );
    expect(screen.getByText('Connections')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('shows empty state for no matches', async () => {
    render(<CommandPalette onClose={vi.fn()} />, { wrapper: Wrapper });
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search commands' }),
      'zzzznotamatch',
    );
    expect(screen.getByText(/No results/)).toBeInTheDocument();
  });

  it('calls onClose when backdrop clicked', async () => {
    const onClose = vi.fn();
    const { container } = render(<CommandPalette onClose={onClose} />, {
      wrapper: Wrapper,
    });
    const backdrop = container.querySelector('.cmd-backdrop') as HTMLElement;
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape pressed', async () => {
    const onClose = vi.fn();
    render(<CommandPalette onClose={onClose} />, { wrapper: Wrapper });
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('activates an item on click and closes', async () => {
    const onClose = vi.fn();
    render(<CommandPalette onClose={onClose} />, { wrapper: Wrapper });
    await userEvent.click(screen.getByText('Connections'));
    expect(onClose).toHaveBeenCalled();
  });

  it('hides admin actions for non-admins', () => {
    render(<CommandPalette onClose={vi.fn()} />, { wrapper: adminWrapper(false) });
    expect(screen.queryByText('Admin: Console')).not.toBeInTheDocument();
  });

  it('shows admin actions for admins', () => {
    render(<CommandPalette onClose={vi.fn()} />, { wrapper: adminWrapper(true) });
    expect(screen.getByText('Admin: Console')).toBeInTheDocument();
    expect(screen.getByText('Admin: Audit log')).toBeInTheDocument();
  });
});
