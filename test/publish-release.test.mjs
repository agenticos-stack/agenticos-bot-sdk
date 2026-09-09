import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCandidate, awaitPublishedIntegrity, PROPAGATION_TIMEOUT_MS } from '../scripts/publish-release.mjs';
import { RELEASE_PACKAGES } from '../scripts/release-readiness.mjs';
const sha = 'a'.repeat(40);
function candidate() {
  return { sourceCommit: sha, ready: true, sourceTreeDirty: false, blockers: [], mode: 'trusted-publisher', repository: 'agenticos-stack/agenticos-bot-sdk',
    artifacts: RELEASE_PACKAGES.map(p => ({ name: p.name, version: '0.1.1', filename: `agenticos-dev-${p.name.split('/')[1]}-0.1.1.tgz`, sha256: 'b'.repeat(64) })) };
}
test('accepts exact approved candidate', () => assert.doesNotThrow(() => validateCandidate(candidate(), sha)));
test('refuses SHA, approval, dirty source and bootstrap mismatches', () => {
  for (const change of [{sourceCommit: 'c'.repeat(40)}, {ready: false}, {sourceTreeDirty: true}, {mode: 'owner-approved-first-publication'}, {blockers: [{}]}, {repository: 'other/repo'}])
    assert.throws(() => validateCandidate({...candidate(), ...change}, sha));
});
test('refuses missing, reordered and escaping artifacts', () => {
  const missing = candidate(); missing.artifacts.pop(); assert.throws(() => validateCandidate(missing, sha));
  const reordered = candidate(); reordered.artifacts.reverse(); assert.throws(() => validateCandidate(reordered, sha));
  const escaped = candidate(); escaped.artifacts[0].filename = '../bad.tgz'; assert.throws(() => validateCandidate(escaped, sha));
});

// The 0.2.0 release published all five packages correctly and still went red:
// the old check waited only for the version document to exist, gave it sixty
// seconds, then read an unsettled `dist` and called the bytes unverified.
const artifact = { name: '@agenticos-dev/bot-devkit', version: '0.2.0' };
const INTEGRITY = 'sha512-CrZV1czY9SI5zomZkF5ug==';

function clock() {
  let t = 0;
  return { now: () => t, sleep: async ms => { t += ms; } };
}

test('a registry that is merely slow eventually verifies', async () => {
  const { now, sleep } = clock();
  let calls = 0;
  // Absent, then present but unsettled, then correct — the real sequence.
  const lookup = async () => {
    calls += 1;
    if (calls === 1) return null;
    if (calls === 2) return { dist: {} };
    return { dist: { integrity: INTEGRITY } };
  };
  const published = await awaitPublishedIntegrity({ artifact, integrity: INTEGRITY, lookup, now, sleep });
  assert.equal(published.dist.integrity, INTEGRITY);
  assert.equal(calls, 3);
});

test('a version that never appears says so, and does not accuse the bytes', async () => {
  const { now, sleep } = clock();
  await assert.rejects(
    awaitPublishedIntegrity({ artifact, integrity: INTEGRITY, lookup: async () => null, now, sleep }),
    error => {
      assert.match(error.message, /did not appear on the registry/);
      assert.match(error.message, /still be processing/);
      assert.doesNotMatch(error.message, /does not match/);
      return true;
    }
  );
});

test('a settled integrity that differs is reported as a mismatch, with both values', async () => {
  const { now, sleep } = clock();
  await assert.rejects(
    awaitPublishedIntegrity({
      artifact, integrity: INTEGRITY, now, sleep,
      lookup: async () => ({ dist: { integrity: 'sha512-somethingElse==' } })
    }),
    error => {
      assert.match(error.message, /does not match/);
      assert.match(error.message, /sha512-somethingElse==/);
      assert.match(error.message, /sha512-CrZV1czY9SI5zomZkF5ug==/);
      return true;
    }
  );
});

test('the wait is a few minutes, because that is what npm asks for', () => {
  // Sixty seconds is what failed. The registry's own words are "a few minutes".
  assert.ok(PROPAGATION_TIMEOUT_MS >= 180000, 'propagation window must be minutes, not seconds');
});
