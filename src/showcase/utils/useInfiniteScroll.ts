import { useEffect, useRef } from 'react';

interface UseInfiniteScrollOptions {
  /** Whether there are more pages to fetch. When false the observer is torn down. */
  hasMore: boolean;
  /** Whether a fetch is currently in flight — suppresses duplicate loads. */
  loading: boolean;
  /** Fetch-and-append the next page. */
  onLoadMore: () => void;
  /** How far outside the viewport to start pre-fetching. Default 300px. */
  rootMargin?: string;
}

/**
 * Auto-loads the next page when a sentinel element scrolls into view.
 *
 * Attach the returned ref to a small element rendered at the end of a list.
 * While `hasMore` is true the sentinel is observed; each time it enters the
 * viewport (expanded by `rootMargin`) `onLoadMore` fires. As soon as `hasMore`
 * becomes false the observer disconnects — an exhausted list stops observing,
 * so there is no dangling work and no infinite spinner. Callers should flip
 * `hasMore` to false while an error is showing so a failed fetch is not retried
 * in a tight loop; a manual retry button re-drives it.
 *
 * The intersection is computed against the viewport, which clips elements
 * scrolled out of an `overflow` container — so the same hook drives both a
 * vertical list (sentinel below it) and a horizontal strip (sentinel at its
 * end): each only fires when the user reaches that section's edge.
 *
 * Degrades gracefully: where `IntersectionObserver` is unavailable (SSR, older
 * browsers, no-JS) the hook is inert, so callers must keep a manual fallback
 * button for loading more.
 */
export function useInfiniteScroll<T extends HTMLElement = HTMLDivElement>({
  hasMore,
  loading,
  onLoadMore,
  rootMargin = '300px',
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<T | null>(null);
  // Hold the latest callback so re-observing (on a `loading` change) doesn't
  // depend on a stable `onLoadMore` identity from the caller.
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // Re-subscribing when `loading` clears re-checks intersection, so a sentinel
    // still in view after one page loads keeps pulling the next.
  }, [hasMore, loading, rootMargin]);

  return sentinelRef;
}
