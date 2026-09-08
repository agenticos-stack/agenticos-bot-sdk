import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCandidate } from '../scripts/publish-release.mjs';
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
