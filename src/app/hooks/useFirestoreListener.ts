import { useEffect, useState, useCallback, useRef } from 'react';
import { Query, DocumentReference, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { getFirebaseFirestore, getFirebaseAuth } from '../../shared/firebase';
import { logger } from '../../shared/logger';
import {
    reportFirestoreListenerAdded,
    reportFirestoreSnapshot,
    reportFirestoreError,
    reportFirestoreListenerRemoved,
} from './useFirestoreConnection';

export type FirestoreQueryFactory<T> = (
    firestore: ReturnType<typeof getFirebaseFirestore>,
    userId: string
) => Query<T> | DocumentReference<T> | null;

export type FirestoreDataMapper<TFirestore, TData> = (
    snapshot: TFirestore
) => TData;

interface UseFirestoreListenerOptions<TData> {
    /** Unique key to identify this listener (e.g., 'pipeline_runs_50') */
    listenerKey: string;
    /** Factory function to create the Firestore query or document reference */
    queryFactory: FirestoreQueryFactory<unknown>;
    /** Optional Jotai setter to update global state */
    onData?: (data: TData) => void;
    /** Whether the listener is enabled */
    enabled?: boolean;
}

interface UseFirestoreListenerResult<TData> {
    data: TData | null;
    loading: boolean;
    error: Error | null;
    isListening: boolean;
    refresh: () => void;
}

// --- Global Listener Registry ---
// Manages shared Firestore listeners across components

interface ListenerEntry {
    unsubscribe: Unsubscribe;
    subscriberCount: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    latestData: any;
    error: Error | null;
    isListening: boolean;
}

const listenerRegistry = new Map<string, ListenerEntry>();
const listenerCallbacks = new Map<string, Set<(data: unknown) => void>>();

function getListenerKey(baseKey: string, userId: string): string {
    return `${userId}:${baseKey}`;
}

/**
 * useFirestoreListener - Generic Firestore Real-time Listener Hook
 *
 * This hook provides a consistent pattern for listening to Firestore data.
 * It uses a GLOBAL LISTENER REGISTRY to ensure only ONE Firestore listener
 * is created per unique listenerKey, regardless of how many components use it.
 *
 * Features:
 * - Firebase auth state handling
 * - Firestore initialization
 * - Loading/error/listening states
 * - Automatic cleanup on unmount
 * - SHARED LISTENERS across components (via listenerKey)
 *
 * Usage:
 * ```ts
 * const { data, loading, error } = useFirestoreListener({
 *   listenerKey: 'pipelines',
 *   queryFactory: (firestore, userId) =>
 *     collection(firestore, 'users', userId, 'pipelines'),
 *   mapper: (snapshot) => snapshot.docs.map(doc => mapPipeline(doc)),
 *   onData: setPipelines, // optional Jotai setter
 * });
 * ```
 */
export function useFirestoreListener<TData>(
    options: UseFirestoreListenerOptions<TData> & {
        mapper: (snapshot: unknown) => TData;
    }
): UseFirestoreListenerResult<TData> {
    const { listenerKey: baseKey, queryFactory, mapper, onData, enabled = true } = options;

    const auth = getFirebaseAuth();
    const currentUser = auth?.currentUser;
    const userId = currentUser?.uid;

    const [data, setData] = useState<TData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [isListening, setIsListening] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Use refs to store callbacks to prevent effect re-runs
    const mapperRef = useRef(mapper);
    const onDataRef = useRef(onData);
    mapperRef.current = mapper;
    onDataRef.current = onData;

    useEffect(() => {
        if (!enabled || !userId) {
            setIsListening(false);
            setLoading(false);
            return;
        }

        const firestore = getFirebaseFirestore();
        if (!firestore) {
            console.warn('[useFirestoreListener] Firestore not initialized');
            setLoading(false);
            return;
        }

        const fullKey = getListenerKey(baseKey, userId);

        // Check if listener already exists
        const existingEntry = listenerRegistry.get(fullKey);
        if (existingEntry) {
            // Listener exists - just subscribe to updates
            existingEntry.subscriberCount++;
            console.log(`[useFirestoreListener] Reusing existing listener for ${baseKey} (${existingEntry.subscriberCount} subscribers)`);

            // Use existing data immediately
            if (existingEntry.latestData !== undefined) {
                // Mapping cached data can throw on an unexpected document shape.
                // The primary snapshot path swallows exactly this failure (see the
                // callback loop that wraps every `cb(snapshot)` in try/catch below),
                // so a single bad document only degrades that one listener. This
                // reuse path runs synchronously inside the effect, so an unguarded
                // throw here escapes into React's commit phase and is caught by the
                // app-wide ErrorBoundary — blanking the whole /app route for a
                // late/returning subscriber to a shared listener. Guard it the same
                // way so the failure stays contained and logged (Sentry) instead.
                try {
                    const mappedData = mapperRef.current(existingEntry.latestData);
                    setData(mappedData);
                    onDataRef.current?.(mappedData);
                } catch (err) {
                    logger.error('[useFirestoreListener] Failed to map cached data:', err);
                }
            }
            setIsListening(existingEntry.isListening);
            setError(existingEntry.error);
            setLoading(false);

            // Register callback for future updates
            if (!listenerCallbacks.has(fullKey)) {
                listenerCallbacks.set(fullKey, new Set());
            }
            const callback = (snapshot: unknown) => {
                const mappedData = mapperRef.current(snapshot);
                setData(mappedData);
                onDataRef.current?.(mappedData);
            };
            listenerCallbacks.get(fullKey)!.add(callback);

            return () => {
                listenerCallbacks.get(fullKey)?.delete(callback);
                const entry = listenerRegistry.get(fullKey);
                if (entry) {
                    entry.subscriberCount--;
                    console.log(`[useFirestoreListener] Unsubscribing from ${baseKey} (${entry.subscriberCount} subscribers remaining)`);
                    if (entry.subscriberCount <= 0) {
                        console.log(`[useFirestoreListener] No more subscribers, removing listener for ${baseKey}`);
                        entry.unsubscribe();
                        listenerRegistry.delete(fullKey);
                        listenerCallbacks.delete(fullKey);
                        reportFirestoreListenerRemoved(fullKey);
                    }
                }
                setIsListening(false);
            };
        }

        // No existing listener - create new one
        console.log(`[useFirestoreListener] Creating new listener for ${baseKey}`);
        // Only show loading on the very first connection (no cached data yet).
        // On reconnections after network drops, keep showing stale data instead
        // of flashing a skeleton/loading state.
        if (data === null) {
            setLoading(true);
        }

        try {
            const queryOrRef = queryFactory(firestore, userId);
            if (!queryOrRef) {
                setLoading(false);
                return;
            }

            // Initialize callbacks set
            if (!listenerCallbacks.has(fullKey)) {
                listenerCallbacks.set(fullKey, new Set());
            }

            // Register this component's callback
            const callback = (snapshot: unknown) => {
                const mappedData = mapperRef.current(snapshot);
                setData(mappedData);
                onDataRef.current?.(mappedData);
            };
            listenerCallbacks.get(fullKey)!.add(callback);

            // Listen with metadata changes so we observe the cache → server
            // transition even when the data itself is unchanged (e.g. an empty
            // collection). That transition is how we know we're actually
            // connected vs. serving an offline cache snapshot.
            const unsubscribe = onSnapshot(
                queryOrRef as Query,
                { includeMetadataChanges: true },
                (snapshot) => {
                    const entry = listenerRegistry.get(fullKey);
                    if (entry) {
                        entry.latestData = snapshot;
                        entry.isListening = true;
                        entry.error = null;
                    }

                    // Report connection state from snapshot metadata. A snapshot
                    // served from cache means we haven't reached the server yet.
                    const fromCache =
                        (snapshot as { metadata?: { fromCache?: boolean } })?.metadata?.fromCache ?? false;
                    reportFirestoreSnapshot(fullKey, fromCache);

                    // Notify all subscribers
                    const callbacks = listenerCallbacks.get(fullKey);
                    if (callbacks) {
                        callbacks.forEach(cb => {
                            try {
                                cb(snapshot);
                            } catch (err) {
                                logger.error('[useFirestoreListener] Callback error:', err);
                            }
                        });
                    }

                    setIsListening(true);
                    setError(null);
                    setLoading(false);
                },
                (err) => {
                    logger.error('[useFirestoreListener] Listener error:', err);
                    const entry = listenerRegistry.get(fullKey);
                    if (entry) {
                        entry.error = err;
                        entry.isListening = false;
                    }
                    reportFirestoreError(fullKey);
                    setError(err);
                    setLoading(false);
                    setIsListening(false);
                }
            );

            // Register in global registry
            listenerRegistry.set(fullKey, {
                unsubscribe,
                subscriberCount: 1,
                latestData: undefined,
                error: null,
                isListening: false,
            });
            reportFirestoreListenerAdded(fullKey);

            return () => {
                listenerCallbacks.get(fullKey)?.delete(callback);
                const entry = listenerRegistry.get(fullKey);
                if (entry) {
                    entry.subscriberCount--;
                    console.log(`[useFirestoreListener] Unsubscribing from ${baseKey} (${entry.subscriberCount} subscribers remaining)`);
                    if (entry.subscriberCount <= 0) {
                        console.log(`[useFirestoreListener] No more subscribers, removing listener for ${baseKey}`);
                        entry.unsubscribe();
                        listenerRegistry.delete(fullKey);
                        listenerCallbacks.delete(fullKey);
                        reportFirestoreListenerRemoved(fullKey);
                    }
                }
                setIsListening(false);
            };
        } catch (err) {
            logger.error('[useFirestoreListener] Failed to set up listener:', err);
            setError(err instanceof Error ? err : new Error('Unknown error'));
            setLoading(false);
            return;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, userId, baseKey, queryFactory, refreshTrigger]);

    const refresh = useCallback(() => {
        // Force re-create the listener
        const fullKey = userId ? getListenerKey(baseKey, userId) : null;
        if (fullKey) {
            const entry = listenerRegistry.get(fullKey);
            if (entry) {
                entry.unsubscribe();
                listenerRegistry.delete(fullKey);
                listenerCallbacks.delete(fullKey);
            }
        }
        setRefreshTrigger(prev => prev + 1);
    }, [baseKey, userId]);

    return {
        data,
        loading,
        error,
        isListening,
        refresh,
    };
}

/**
 * useFirestoreDocument - Convenience wrapper for single document listeners
 */
export function useFirestoreDocument<TData>(
    options: Omit<UseFirestoreListenerOptions<TData>, 'queryFactory'> & {
        docFactory: (firestore: ReturnType<typeof getFirebaseFirestore>, userId: string) => DocumentReference | null;
        mapper: (data: unknown | undefined) => TData;
    }
): UseFirestoreListenerResult<TData> {
    const { docFactory, mapper, ...rest } = options;

    return useFirestoreListener({
        ...rest,
        queryFactory: docFactory as FirestoreQueryFactory<unknown>,
        mapper: (snapshot: unknown) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const docSnapshot = snapshot as any;
            if (!docSnapshot.exists?.()) {
                return mapper(undefined);
            }
            return mapper(docSnapshot.data());
        },
    });
}
