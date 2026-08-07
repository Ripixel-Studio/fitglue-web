import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Guards the Firestore index ownership boundary.
 *
 * `useRealtimeInputs` runs an equality filter on `status` combined with an
 * `orderBy('created_at', 'desc')` against `users/{uid}/pending_inputs`, which
 * requires a composite index. That index is NOT owned here — it is declared and
 * provisioned by fitglue-server terraform
 * (`terraform/firestore.tf` → `pending_inputs_subcollection_status_created`,
 * COLLECTION scope, status ASC + created_at DESC), applied by the privileged
 * `circleci-deployer` service account.
 *
 * The web deploy runs `firebase deploy --only hosting,firestore:rules` as
 * `circleci-web-deployer`, which holds `firebaserules.admin` but deliberately no
 * `datastore.*` role. If this repo ever re-introduces `firestore.indexes.json` or
 * an `indexes` key in `firebase.json`, the Firebase CLI would call the Firestore
 * indexes API during deploy and 403 — which is exactly the regression that took
 * `main` red before (see ADR 011). These tests fail loudly if that happens again.
 */

const repoRoot = resolve(__dirname, '../../../..');

const readJson = (relativePath: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(repoRoot, relativePath), 'utf-8'));

describe('Firestore index ownership', () => {
  it('does not ship a firestore.indexes.json (indexes are owned by fitglue-server terraform)', () => {
    expect(
      existsSync(resolve(repoRoot, 'firestore.indexes.json')),
      'firestore.indexes.json must not exist here — Firestore indexes are owned by ' +
        'fitglue-server terraform. Deploying indexes from the web repo 403s because ' +
        'circleci-web-deployer has no datastore.* role (ADR 011).',
    ).toBe(false);
  });

  it('does not wire an indexes file into firebase.json', () => {
    const firebaseConfig = readJson('firebase.json');
    const firestore = firebaseConfig.firestore as
      | { rules?: string; indexes?: string }
      | undefined;

    // Rules stay here; indexes must not.
    expect(firestore?.rules).toBe('firestore.rules');
    expect(
      firestore?.indexes,
      "firebase.json must not reference an indexes file — the web deploy is " +
        "--only hosting,firestore:rules; indexes live in fitglue-server terraform (ADR 011).",
    ).toBeUndefined();
  });
});
