import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RELEASE_PACKAGES } from './release-readiness.mjs';

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
      let published;
      for (let attempt = 0; attempt < 12; attempt++) {
        published = await metadata(artifact);
        if (published) break;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      const integrity = 'sha512-' + createHash('sha512').update(bytes.get(artifact.name)).digest('base64');
      if (published?.dist?.integrity !== integrity) throw new Error('Published integrity not verified');
      entry.status = 'integrity-verified'; await save();
    }
    receipt.status = 'published-integrity-verified';
  } catch (error) {
    receipt.status = 'failed-or-partial';
    throw error;
  } finally { await save(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
