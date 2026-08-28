import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ShowcaseProfilePage from '../ShowcaseProfilePage';
import publicClient from '../../../shared/api/public-client';

vi.mock('../../../shared/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('../../../shared/firebase', () => ({
  initFirebase: vi.fn().mockResolvedValue(null),
  getFirebaseAuth: () => ({ currentUser: null }),
  getFirebaseFirestore: () => ({}),
}));
vi.mock('../../utils/recordView', () => ({ recordShowcaseView: vi.fn() }));
vi.mock('../../utils/useShowcaseMeta', () => ({ useShowcaseMeta: vi.fn() }));
vi.mock('../../utils/useShowcaseOwner', () => ({ useShowcaseOwner: () => ({ isOwner: false, resolved: true }) }));

// Keep the test focused on the roundups band — stub the heavy layout tree.
vi.mock('../../components/layout/ProfileHero', () => ({ default: () => <div /> }));
vi.mock('../../components/layout/LifetimeStats', () => ({ default: () => <div /> }));
vi.mock('../../components/layout/MedalWall', () => ({ default: () => <div /> }));
vi.mock('../../components/layout/ConsistencyHeatmap', () => ({ default: () => <div /> }));
vi.mock('../../components/layout/ZoneBar', () => ({ default: () => <div /> }));
vi.mock('../../components/layout/RouteMosaic', () => ({ default: () => <div /> }));
vi.mock('../../components/layout/ActivityGrid', () => ({ default: () => <div /> }));
vi.mock('../../components/PhotoGallery', () => ({ PhotoGallery: () => <div /> }));

// Public client: profile is empty-but-valid; roundups endpoint mimics the real
// server pagination — 12 per page, with a total of 40 across 4 pages.
vi.mock('../../../shared/api/public-client', () => {
  const TOTAL = 40;
  const PAGE_SIZE = 12;
  const TOTAL_PAGES = Math.ceil(TOTAL / PAGE_SIZE);
  const makeRoundups = (page: number) => {
    const start = (page - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, TOTAL);
    return Array.from({ length: Math.max(0, end - start) }, (_, i) => {
      const idx = start + i;
      return {
        roundupId: `r${idx}`,
        periodKey: `week-${String((idx % 52) + 1).padStart(2, '0')}-2026`,
        totalActivities: 5,
        periodStart: '2026-05-01T00:00:00Z',
        periodEnd: '2026-05-08T00:00:00Z',
      };
    });
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const GET = vi.fn((path: string, opts?: any) => {
    if (path === '/showcase/profile/{slug}') {
      return Promise.resolve({
        data: { profile: { displayName: 'Jane', entries: [], totalActivities: 0 }, currentPage: 1, totalPages: 1 },
      });
    }
    if (path === '/showcase/{slug}/roundups/recent') {
      const page = opts?.params?.query?.page ?? 1;
      return Promise.resolve({
        data: { roundups: makeRoundups(page), currentPage: page, totalPages: TOTAL_PAGES },
      });
    }
    return Promise.resolve({ data: {} });
  });
  const c = { GET };
  return { publicClient: c, default: c };
});
vi.mock('../../../shared/api/client', () => {
  const c = { GET: vi.fn(() => new Promise(() => {})) };
  return { client: c, default: c };
});

function Wrapper() {
  return (
    <MemoryRouter initialEntries={['/@jane']}>
      <Routes>
        <Route path="/:slug" element={<ShowcaseProfilePage />} />
      </Routes>
    </MemoryRouter>
  );
}

// Controllable IntersectionObserver so we can drive auto-load-on-scroll in
// jsdom (which ships no real implementation).
class FakeIO {
  static instances: FakeIO[] = [];
  cb: IntersectionObserverCallback;
  observed: Element[] = [];
  disconnected = false;
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    FakeIO.instances.push(this);
  }
  observe(el: Element) { this.observed.push(el); }
  disconnect() { this.disconnected = true; }
  unobserve() {}
  takeRecords() { return []; }
  triggerAll() {
    for (const io of FakeIO.instances) {
      if (io.disconnected) continue;
      io.cb([{ isIntersecting: true } as IntersectionObserverEntry], io as unknown as IntersectionObserver);
    }
  }
}

describe('ShowcaseProfilePage', () => {
  it('shows 12 roundups initially and appends more via "load more"', async () => {
    render(<Wrapper />);

    // Initial page requests page 1 (12 roundups) and renders a tile per roundup.
    expect(await screen.findByText('Load more roundups →')).toBeInTheDocument();
    expect(screen.getAllByText('WEEKLY ROUNDUP')).toHaveLength(12);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstRoundupCall = (publicClient.GET as any).mock.calls.find(
      (c: unknown[]) => c[0] === '/showcase/{slug}/roundups/recent',
    );
    expect(firstRoundupCall?.[1]?.params?.query?.page).toBe(1);

    // Loading more fetches page 2 and appends its roundups to the existing list.
    fireEvent.click(screen.getByText('Load more roundups →'));
    await waitFor(() => expect(screen.getAllByText('WEEKLY ROUNDUP')).toHaveLength(24));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pages = (publicClient.GET as any).mock.calls
      .filter((c: unknown[]) => c[0] === '/showcase/{slug}/roundups/recent')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => c[1]?.params?.query?.page);
    expect(pages).toContain(2);
  });

  it('hides "load more" once every roundup page has been fetched', async () => {
    render(<Wrapper />);
    expect(await screen.findByText('Load more roundups →')).toBeInTheDocument();

    // 4 pages total (40 roundups / 12 per page) — click through the rest.
    fireEvent.click(screen.getByText('Load more roundups →'));
    await waitFor(() => expect(screen.getAllByText('WEEKLY ROUNDUP')).toHaveLength(24));
    fireEvent.click(screen.getByText('Load more roundups →'));
    await waitFor(() => expect(screen.getAllByText('WEEKLY ROUNDUP')).toHaveLength(36));
    fireEvent.click(screen.getByText('Load more roundups →'));
    await waitFor(() => expect(screen.getAllByText('WEEKLY ROUNDUP')).toHaveLength(40));

    expect(screen.queryByText('Load more roundups →')).not.toBeInTheDocument();
  });

  describe('infinite scroll', () => {
    beforeEach(() => {
      FakeIO.instances = [];
      vi.stubGlobal('IntersectionObserver', FakeIO as unknown as typeof IntersectionObserver);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('auto-loads the next roundup page when the sentinel scrolls into view', async () => {
      render(<Wrapper />);
      expect(await screen.findByText('Load more roundups →')).toBeInTheDocument();
      expect(screen.getAllByText('WEEKLY ROUNDUP')).toHaveLength(12);

      // Scrolling the sentinel into view fetches page 2 without any click.
      act(() => FakeIO.instances.forEach((io) => io.triggerAll()));
      await waitFor(() => expect(screen.getAllByText('WEEKLY ROUNDUP')).toHaveLength(24));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pages = (publicClient.GET as any).mock.calls
        .filter((c: unknown[]) => c[0] === '/showcase/{slug}/roundups/recent')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((c: any) => c[1]?.params?.query?.page);
      expect(pages).toContain(2);
    });

    it('shows a retry affordance when a roundup page fetch fails, and no infinite spinner', async () => {
      render(<Wrapper />);
      // Wait for the initial page-1 fetch to settle (button implies more pages).
      const btn = await screen.findByText('Load more roundups →');

      // Make the NEXT fetch (page 2, triggered by the load) reject.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (publicClient.GET as any).mockImplementationOnce(() => Promise.reject(new Error('network')));
      fireEvent.click(btn);

      expect(await screen.findByText(/Couldn’t load more roundups/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      // No stuck loading indicator once the fetch settled.
      expect(screen.queryByText('Loading more roundups…')).not.toBeInTheDocument();
    });
  });
});
