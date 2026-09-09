import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RELEASE_PACKAGES } from './release-readiness.mjs';

/** How long a freshly published version may take to become readable. */
export const PROPAGATION_TIMEOUT_MS = 300000;
export const PROPAGATION_POLL_MS = 5000;

export function validateCandidate(candidate, sha) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || candidate.sourceCommit !== sha
    || !candidate.ready || candidate.sourceTreeDirty || candidate.blockers?.length !== 0
    || candidate.mode !== 'trusted-publisher'
    || candidate.repository !== 'agenticos-stack/agenticos-bot-sdk') throw new Error('Unapproved candidate or source SHA');
  if (candidate.artifacts?.length !== RELEASE_PACKAGES.length) throw new Error('Incomplete release set');
  candidate.artifacts.forEach((artifact, index) => {
    if (artifact.name !== RELEASE_PACKAGES[index].name
      || !/^\d+\.\d+\.\d+$/.test(artifact.version)
      || artifact.filename !== `agenticos-dev-${artifact.name.split('/')[1]}-${artifact.version}.tgz`
      || basename(artifact.filename) !== artifact.filename
      || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error('Invalid artifact identity');
  });
}

/**
 * Wait for a published version's integrity to MATCH, not merely for its
 * version document to appear.
 *
 * npm answers a successful publish with "Your package is being processed and
 * may take a few minutes to become available", and the 0.2.0 release proved it
 * means that: all five packages published correctly, and the run went red
 * anyway because the check gave the registry sixty seconds and then read
 * `undefined`.
 *
 * The loop it replaces had two faults, and only the first is obvious. It
 * stopped as soon as the document existed, so a document that arrived without
 * a settled `dist` failed the single check that followed; and sixty seconds is
 * not "a few minutes". A slow registry has to read as slow, never as corrupt
 * bytes — the failure that invents is more alarming than the one it hides, and
 * it sends someone hunting a tampered artifact that was never there.
 */
export async function awaitPublishedIntegrity({
  artifact, integrity, lookup,
  timeoutMs = PROPAGATION_TIMEOUT_MS, pollMs = PROPAGATION_POLL_MS,
  now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
}) {
  const deadline = now() + timeoutMs;
  for (;;) {
    const published = await lookup(artifact);
    if (published?.dist?.integrity === integrity) return published;
    if (now() >= deadline) {
      // Name which of the two it was. They need different responses: one is a
      // registry to wait on, the other is bytes to investigate.
      throw new Error(published
        ? `Published integrity does not match after ${timeoutMs / 1000}s: registry reports ${published?.dist?.integrity ?? 'no integrity'}, expected ${integrity}.`
        : `${artifact.name}@${artifact.version} did not appear on the registry within ${timeoutMs / 1000}s. It may still be processing; check before republishing.`);
    }
    await sleep(pollMs);
  }
}

async function metadata(artifact) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(artifact.name)}/${artifact.version}`, { signal: AbortSignal.timeout(30000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Registry lookup failed: ${response.status}`);
  return response.json();
}

async function main() {
  const mode = process.argv[2];
  if (!['--check', '--publish'].includes(mode) || process.argv.length !== 3) throw new Error('Use --check or --publish');
  const candidate = JSON.parse(await readFile('.release-candidate/release-candidate.json', 'utf8'));
  validateCandidate(candidate, process.env.GITHUB_SHA);
  const bytes = new Map();
  for (const artifact of candidate.artifacts) {
    const data = await readFile(resolve('.release-candidate', artifact.filename));
    if (createHash('sha256').update(data).digest('hex') !== artifact.sha256) throw new Error('Candidate hash mismatch');
    bytes.set(artifact.name, data);
    // Preflight the entire release before the first registry write. Never
    // silently skip an occupied version or reinterpret a 404 as authorization.
    if (await metadata(artifact)) throw new Error(`Version already exists: ${artifact.name}@${artifact.version}`);
  }
  if (mode === '--check') return;
  if (process.env.GITHUB_REPOSITORY !== candidate.repository
    || process.env.GITHUB_REF !== 'refs/heads/staging'
    || !process.env.ACTIONS_ID_TOKEN_REQUEST_URL || !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) throw new Error('Trusted GitHub publishing context required');
  const receipt = { sourceCommit: candidate.sourceCommit, artifacts: [], status: 'in-progress' };
  const save = () => writeFile('.release-candidate/publication.json', JSON.stringify(receipt, null, 2) + '\n');
  await save();
  try {
    for (const artifact of candidate.artifacts) {
      const entry = { name: artifact.name, version: artifact.version, sha256: artifact.sha256, status: 'attempting' };
      receipt.artifacts.push(entry); await save();
      execFileSync('npm', ['publish', resolve('.release-candidate', artifact.filename), '--access=public', '--ignore-scripts', '--registry=https://registry.npmjs.org/'], { stdio: 'inherit', timeout: 120000 });
      entry.status = 'published'; await save();
      const integrity = 'sha512-' + createHash('sha512').update(bytes.get(artifact.name)).digest('base64');
      await awaitPublishedIntegrity({ artifact, integrity, lookup: metadata });
      entry.status = 'integrity-verified'; await save();
    }
    receipt.status = 'published-integrity-verified';
  } catch (error) {
    receipt.status = 'failed-or-partial';
    throw error;
  } finally { await save(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
