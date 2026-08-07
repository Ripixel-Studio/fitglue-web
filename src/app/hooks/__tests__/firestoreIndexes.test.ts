import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Guards the Firestore composite-index contract.
 *
 * `useRealtimeInputs` runs an equality filter on `status` combined with an
 * `orderBy('created_at', 'desc')` against `users/{uid}/pending_inputs`. Firestore
 * requires an explicit composite index for that combination; without it the
 * onSnapshot listener fails in production with a `FirebaseError`
 * ("The query requires an index") that surfaced on the dashboard (Sentry WEB-APP-1).
 *
 * These tests fail if the index is not declared, or if `firebase.json` does not
 * point at the indexes file (so `firebase deploy` never provisions it).
 */

const repoRoot = resolve(__dirname, '../../../..');

const readJson = (relativePath: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(repoRoot, relativePath), 'utf-8'));

interface IndexField {
  fieldPath: string;
  order?: string;
  arrayConfig?: string;
}
interface CompositeIndex {
  collectionGroup: string;
  queryScope: string;
  fields: IndexField[];
}

describe('Firestore composite indexes', () => {
  it('declares the pending_inputs (status + created_at desc) index required by useRealtimeInputs', () => {
    const config = readJson('firestore.indexes.json');
    const indexes = (config.indexes ?? []) as CompositeIndex[];

    const match = indexes.find(
      (index) =>
        index.collectionGroup === 'pending_inputs' &&
        index.fields.some((f) => f.fieldPath === 'status') &&
        index.fields.some((f) => f.fieldPath === 'created_at' && f.order === 'DESCENDING'),
    );

    expect(
      match,
      'Missing composite index for pending_inputs (status ASC, created_at DESC) — the dashboard listener will throw FirebaseError in production',
    ).toBeDefined();
  });

  it('wires the indexes file into firebase.json so it gets deployed', () => {
    const firebaseConfig = readJson('firebase.json');
    const firestore = firebaseConfig.firestore as { indexes?: string } | undefined;
    expect(firestore?.indexes).toBe('firestore.indexes.json');
  });
});
