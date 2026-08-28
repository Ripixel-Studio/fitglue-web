import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { useInfiniteScroll } from '../useInfiniteScroll';

// A controllable IntersectionObserver stand-in: tests capture the instance and
// drive `isIntersecting` manually, since jsdom ships no real implementation.
const lastIO = () => FakeIO.instances[FakeIO.instances.length - 1];

class FakeIO {
  static instances: FakeIO[] = [];
  cb: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  observed: Element[] = [];
  disconnected = false;
  constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.cb = cb;
    this.options = options;
    FakeIO.instances.push(this);
  }
  observe(el: Element) { this.observed.push(el); }
  disconnect() { this.disconnected = true; }
  unobserve() {}
  takeRecords() { return []; }
  trigger(isIntersecting: boolean) {
    this.cb(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function Harness(props: { hasMore: boolean; loading: boolean; onLoadMore: () => void }) {
  const ref = useInfiniteScroll<HTMLDivElement>(props);
  return <div ref={ref} data-testid="sentinel" />;
}

describe('useInfiniteScroll', () => {
  beforeEach(() => {
    FakeIO.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIO as unknown as typeof IntersectionObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('observes the sentinel and calls onLoadMore when it intersects', () => {
    const onLoadMore = vi.fn();
    render(<Harness hasMore loading={false} onLoadMore={onLoadMore} />);

    const io = lastIO()!;
    expect(io.observed).toHaveLength(1);

    act(() => io.trigger(true));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('does not fire while a fetch is in flight', () => {
    const onLoadMore = vi.fn();
    render(<Harness hasMore loading onLoadMore={onLoadMore} />);

    act(() => lastIO()!.trigger(true));
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('does not fire when the sentinel is not intersecting', () => {
    const onLoadMore = vi.fn();
    render(<Harness hasMore loading={false} onLoadMore={onLoadMore} />);

    act(() => lastIO()!.trigger(false));
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('does not observe once the list is exhausted (hasMore=false)', () => {
    const onLoadMore = vi.fn();
    render(<Harness hasMore={false} loading={false} onLoadMore={onLoadMore} />);
    // No observer is created when there is nothing more to load.
    expect(FakeIO.instances).toHaveLength(0);
  });

  it('disconnects the observer when hasMore flips to false', () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(<Harness hasMore loading={false} onLoadMore={onLoadMore} />);
    const io = lastIO()!;
    rerender(<Harness hasMore={false} loading={false} onLoadMore={onLoadMore} />);
    expect(io.disconnected).toBe(true);
  });

  it('stays inert when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const onLoadMore = vi.fn();
    // Should not throw when the API is missing (no-JS / old browsers).
    expect(() =>
      render(<Harness hasMore loading={false} onLoadMore={onLoadMore} />),
    ).not.toThrow();
    expect(onLoadMore).not.toHaveBeenCalled();
  });
});
