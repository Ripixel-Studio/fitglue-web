import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { state } = vi.hoisted(() => ({
  state: {
    auth: { currentUser: { uid: 'u1' } } as { currentUser: { uid: string } | null } | null,
    firestore: {} as object | null,
    onNext: undefined as ((snap: unknown) => void) | undefined,
    onError: undefined as ((e: Error) => void) | undefined,
    unsub: vi.fn(),
  },
}));

vi.mock('firebase/firestore', () => ({
  // Supports both onSnapshot(query, next, err) and
  // onSnapshot(query, options, next, err) signatures.
  onSnapshot: (_q: unknown, ...rest: unknown[]) => {
    const [next, err] = (typeof rest[0] === 'function' ? rest : rest.slice(1)) as [
      (s: unknown) => void,
      (e: Error) => void,
    ];
    state.onNext = next;
    state.onError = err;
    return state.unsub;
  },
}));
vi.mock('../../../shared/firebase', () => ({
  getFirebaseFirestore: () => state.firestore,
  getFirebaseAuth: () => state.auth,
}));
vi.mock('../../../shared/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { useFirestoreListener, useFirestoreDocument } from '../useFirestoreListener';

const queryFactory = () => ({}) as never;
const mapper = (snap: unknown) => (snap as { value: number }).value;

let keyCounter = 0;
const nextKey = () => `test_listener_${keyCounter++}`;

beforeEach(() => {
  state.auth = { currentUser: { uid: 'u1' } };
  state.firestore = {};
  state.onNext = undefined;
  state.onError = undefined;
  state.unsub = vi.fn();
});

describe('useFirestoreListener', () => {
  it('does nothing when there is no signed-in user', () => {
    state.auth = { currentUser: null };
    const key = nextKey();
    const { result } = renderHook(() =>
      useFirestoreListener({ listenerKey: key, queryFactory, mapper }),
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.isListening).toBe(false);
  });

  it('stops loading when Firestore is not initialized', () => {
    state.firestore = null;
    const key = nextKey();
    const { result } = renderHook(() =>
      useFirestoreListener({ listenerKey: key, queryFactory, mapper }),
    );
    expect(result.current.loading).toBe(false);
  });

  it('stops loading when the query factory returns null', () => {
    const key = nextKey();
    const { result } = renderHook(() =>
      useFirestoreListener({ listenerKey: key, queryFactory: () => null, mapper }),
    );
    expect(result.current.loading).toBe(false);
  });

  it('maps snapshot data and reports listening, calling onData', () => {
    const onData = vi.fn();
    const key = nextKey();
    const { result } = renderHook(() =>
      useFirestoreListener({ listenerKey: key, queryFactory, mapper, onData }),
    );
    act(() => state.onNext?.({ value: 42 }));
    expect(result.current.data).toBe(42);
    expect(result.current.isListening).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(onData).toHaveBeenCalledWith(42);
  });

  it('surfaces listener errors', () => {
    const key = nextKey();
    const { result } = renderHook(() =>
      useFirestoreListener({ listenerKey: key, queryFactory, mapper }),
    );
    const err = new Error('permission denied');
    act(() => state.onError?.(err));
    expect(result.current.error).toBe(err);
    expect(result.current.isListening).toBe(false);
  });

  it('reuses a single underlying listener across two consumers of the same key', () => {
    const key = nextKey();
    const first = renderHook(() => useFirestoreListener({ listenerKey: key, queryFactory, mapper }));
    act(() => state.onNext?.({ value: 7 }));
    expect(first.result.current.data).toBe(7);

    // Second consumer of the same key should immediately see the cached data.
    const second = renderHook(() => useFirestoreListener({ listenerKey: key, queryFactory, mapper }));
    expect(second.result.current.data).toBe(7);

    // Tearing down only the last subscriber unsubscribes the underlying listener.
    first.unmount();
    expect(state.unsub).not.toHaveBeenCalled();
    second.unmount();
    expect(state.unsub).toHaveBeenCalled();
  });

  it('contains a mapper throw on cached data for a late subscriber (no ErrorBoundary crash)', () => {
    const key = nextKey();

    // First consumer establishes the listener and caches a snapshot.
    const first = renderHook(() => useFirestoreListener({ listenerKey: key, queryFactory, mapper }));
    act(() => state.onNext?.({ value: 7 }));
    expect(first.result.current.data).toBe(7);

    // A second consumer of the same key maps the *cached* snapshot immediately on
    // mount, inside its effect. If that mapper throws on the document shape, the
    // failure must stay contained — logged, no data — rather than propagating out
    // of the effect where React would hand it to the app-wide ErrorBoundary and
    // blank the /app route (Sentry WEB-APP-3).
    const throwingMapper = (): number => { throw new Error('unexpected document shape'); };
    let secondData: number | null = 0;
    expect(() => {
      const second = renderHook(() =>
        useFirestoreListener({ listenerKey: key, queryFactory, mapper: throwingMapper }),
      );
      secondData = second.result.current.data;
    }).not.toThrow();

    // Contained: the late subscriber simply has no data, and the shared listener
    // keeps serving the first consumer.
    expect(secondData ?? null).toBeNull();
    expect(first.result.current.data).toBe(7);
  });

  it('refresh() re-creates the listener', () => {
    const key = nextKey();
    const { result } = renderHook(() =>
      useFirestoreListener({ listenerKey: key, queryFactory, mapper }),
    );
    act(() => state.onNext?.({ value: 1 }));
    act(() => result.current.refresh());
    act(() => state.onNext?.({ value: 2 }));
    expect(result.current.data).toBe(2);
  });
});

describe('useFirestoreDocument', () => {
  it('maps an existing document via .data()', () => {
    const key = nextKey();
    const { result } = renderHook(() =>
      useFirestoreDocument<{ name: string }>({
        listenerKey: key,
        docFactory: () => ({}) as never,
        mapper: (d) => (d as { name: string }) ?? { name: 'none' },
      }),
    );
    act(() => state.onNext?.({ exists: () => true, data: () => ({ name: 'Run' }) }));
    expect(result.current.data).toEqual({ name: 'Run' });
  });

  it('maps a missing document to the undefined branch', () => {
    const key = nextKey();
    const { result } = renderHook(() =>
      useFirestoreDocument<string>({
        listenerKey: key,
        docFactory: () => ({}) as never,
        mapper: (d) => (d === undefined ? 'missing' : 'present'),
      }),
    );
    act(() => state.onNext?.({ exists: () => false }));
    expect(result.current.data).toBe('missing');
  });
});
