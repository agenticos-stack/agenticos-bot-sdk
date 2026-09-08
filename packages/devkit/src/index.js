import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { readBlueprintArchive, writeBlueprintArchive } from '@agenticos-dev/bot-archive-tools';
import { validateGadgetDefinition } from '@agenticos-dev/bot-contract';

export const PACKAGE_CHECK_STEPS = Object.freeze(['test', 'build', 'validate']);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const encode = (value) => `${JSON.stringify(value, null, 2)}\n`;

function inside(root, path) {
  const part = relative(root, path);
  return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

function localPath(root, value) {
  if (typeof value !== 'string' || !value || isAbsolute(value)) throw new Error('Expected a package-relative file path.');
  const path = resolve(root, value);
  if (!inside(root, path)) throw new Error('File path escapes package directory.');
  return path;
}

async function sourcePath(root, value) {
  const path = localPath(root, value);
  if (!inside(await realpath(root), await realpath(path))) throw new Error('Source symlink escapes package directory.');
  if (!(await lstat(path)).isFile()) throw new Error('Expected a regular package file.');
  return path;
}

async function mustNotExist(path) {
  try { await lstat(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error(`Refusing to overwrite existing output: ${path}`);
}

function trusted(options) {
  if (options.trustSource !== true) throw new Error('Package scripts execute arbitrary local code. Pass --trust-source only for source you trust.');
}

/** Orchestration, not a sandbox. The package's scripts retain local user authority. */
export async function checkGadgetPackage(directory, options = {}) {
  trusted(options);
  const cwd = await realpath(resolve(directory));
  const manifest = await json(resolve(cwd, 'package.json'));
  for (const step of PACKAGE_CHECK_STEPS) {
    if (typeof manifest.scripts?.[step] !== 'string' || !manifest.scripts[step].trim()) throw new Error(`Package must declare a ${step} script.`);
  }
  const run = options.run ?? spawnSync;
  for (const step of PACKAGE_CHECK_STEPS) {
    const result = run('npm', ['run', step], { cwd, stdio: 'inherit', shell: false, timeout: 120_000 });
    if (result.error || result.signal || result.status !== 0) throw new Error(`Package ${step} failed: ${result.error?.message ?? result.signal ?? `exit ${result.status}`}`);
  }
  return { packageName: manifest.name ?? null, steps: [...PACKAGE_CHECK_STEPS], scope: 'trusted-local-package-checks' };
}

async function packageInputs(directory) {
  const root = await realpath(resolve(directory));
  const manifest = await json(await sourcePath(root, 'manifest.json'));
  const packageJSON = await json(await sourcePath(root, 'package.json'));
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('Manifest must list flat source files.');
  if (typeof manifest.artifact !== 'string' || !/^[a-zA-Z0-9_-]+\.gadget$/.test(manifest.artifact)) throw new Error('Manifest artifact must be a flat .gadget filename.');
  if (packageJSON.gadget?.archive !== `dist/${manifest.artifact}`) throw new Error('package.json gadget.archive must match dist/manifest.artifact.');
  if (typeof manifest.metadata?.title !== 'string' || !manifest.metadata.title.trim()) throw new Error('Manifest metadata.title is required.');
  const checked = validateGadgetDefinition(await json(await sourcePath(root, 'definition.json')));
  if (!checked.ok || checked.definition?.key !== manifest.blueprintKey) throw new Error('Definition is invalid or conflicts with manifest blueprintKey.');
  return { root, manifest, definition: checked.definition };
}

/** App-owned build helper: flat src members, canonical codec and definition checker. */
export async function buildPackage(directory) {
  const { root, manifest, definition } = await packageInputs(directory);
  const files = Object.create(null);
  for (const name of manifest.files) {
    if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(name) || Object.hasOwn(files, name)) throw new Error('Invalid or duplicate flat archive member.');
    files[name] = await readFile(await sourcePath(root, `src/${name}`), 'utf8');
  }
  const bytes = Buffer.from(await writeBlueprintArchive({ metadata: { ...manifest.metadata, gadgetDefinition: definition }, files }));
  let lockfileSha256 = null;
  try { lockfileSha256 = hash(await readFile(await sourcePath(root, 'package-lock.json'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const release = {
    schemaVersion: 'ai-agent-package-release.v1', blueprintKey: manifest.blueprintKey,
    artifact: manifest.artifact, sha256: hash(bytes), byteSize: bytes.length, definition,
    files: Object.fromEntries(Object.entries(files).map(([name, text]) => [name, hash(text)])),
    provenance: { status: 'incomplete-local-evidence', sourceCommit: null, lockfileSha256,
      runtimeCompatibility: manifest.compatibility ?? null }
  };
  const dist = resolve(root, 'dist');
  await mkdir(dist, { recursive: true });
  if ((await lstat(dist)).isSymbolicLink()) throw new Error('Refusing symlinked dist directory.');
  for (const name of [manifest.artifact, 'release.json']) {
    try { if ((await lstat(resolve(dist, name))).isSymbolicLink()) throw new Error('Refusing symlinked build output.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await writeFile(resolve(dist, manifest.artifact), bytes);
  await writeFile(resolve(dist, 'release.json'), encode(release));
  return { bytes, files, release };
}

export async function validatePackage(directory) {
  const { root, manifest, definition } = await packageInputs(directory);
  const release = await json(await sourcePath(root, 'dist/release.json'));
  const bytes = await readFile(await sourcePath(root, `dist/${manifest.artifact}`));
  const archive = await readBlueprintArchive(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const checked = validateGadgetDefinition(archive.metadata.gadgetDefinition);
  if (!checked.ok || !isDeepStrictEqual(checked.definition, definition)) throw new Error('Archive definition differs from package definition.');
  if (!isDeepStrictEqual(archive.metadata, { ...manifest.metadata, gadgetDefinition: definition })) throw new Error('Archive metadata differs from package manifest.');
  if (hash(bytes) !== release.sha256 || bytes.length !== release.byteSize) throw new Error('Archive checksum/size differs from release.');
  if (release.schemaVersion !== 'ai-agent-package-release.v1' || release.artifact !== manifest.artifact || release.blueprintKey !== manifest.blueprintKey || !isDeepStrictEqual(release.definition, definition)) throw new Error('Release identity/definition differs from package.');
  if (!isDeepStrictEqual(Object.keys(archive.files).sort(), [...manifest.files].sort()) || !isDeepStrictEqual(Object.keys(release.files).sort(), Object.keys(archive.files).sort())) throw new Error('Archive/release member set differs from manifest.');
  for (const [name, text] of Object.entries(archive.files)) {
    if (hash(text) !== release.files[name]) throw new Error(`Member checksum differs: ${name}`);
    if (text !== await readFile(await sourcePath(root, `src/${name}`), 'utf8')) throw new Error(`Archive member differs from current source: ${name}`);
  }
  let lockfileSha256 = null;
  try { lockfileSha256 = hash(await readFile(await sourcePath(root, 'package-lock.json'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!isDeepStrictEqual(release.provenance, { status: 'incomplete-local-evidence', sourceCommit: null,
    lockfileSha256, runtimeCompatibility: manifest.compatibility ?? null })) throw new Error('Release provenance differs from current package evidence.');
  return { artifact: manifest.artifact, sha256: release.sha256, byteSize: bytes.length, scope: 'local-archive-integrity' };
}

export async function packGadgetPackage(directory, options = {}) {
  trusted(options);
  if (typeof options.output !== 'string' || !options.output.endsWith('.gadget')) throw new Error('Provide an explicit --output ending in .gadget.');
  const output = resolve(options.output);
  await mustNotExist(output);
  const root = await realpath(resolve(directory));
  await checkGadgetPackage(root, options);
  const result = await validatePackage(root);
  const source = await sourcePath(root, `dist/${result.artifact}`);
  // COPYFILE_EXCL closes the check/write race without truncating another file.
  await copyFile(source, output, constants.COPYFILE_EXCL);
  return { ...result, output, scope: 'local-package-artifact-not-published' };
}

/** Copies an explicitly chosen local template. No dependency install or script execution. */
export async function initGadgetPackage(destination, { template, name } = {}) {
  if (typeof template !== 'string' || !template) throw new Error('Provide --template pointing to a reviewed local template.');
  if (typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('Provide a lowercase package --name.');
  const root = await realpath(resolve(template));
  const output = resolve(destination);
  await mustNotExist(output);
  const packageJSON = await json(await sourcePath(root, 'package.json'));
  for (const step of PACKAGE_CHECK_STEPS) if (!packageJSON.scripts?.[step]) throw new Error(`Template must declare ${step}.`);
  const entries = [];
  async function inspect(path, base = '') {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if ((entry.name.startsWith('.') && entry.name !== '.gitignore') || ['node_modules', 'dist'].includes(entry.name)) throw new Error(`Template contains excluded entry: ${entry.name}`);
      const part = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Template symlinks are not supported: ${part}`);
      if (entry.isDirectory()) await inspect(resolve(path, entry.name), part);
      else if (entry.isFile()) entries.push(part);
      else throw new Error(`Unsupported template entry: ${part}`);
    }
  }
  await inspect(root);
  await mkdir(output);
  for (const entry of entries) {
    const target = localPath(output, entry);
    await mkdir(dirname(target), { recursive: true });
    if (entry === 'package.json') await writeFile(target, encode({ ...packageJSON, name, private: true }), { flag: 'wx' });
    else await copyFile(resolve(root, entry), target, constants.COPYFILE_EXCL);
  }
  return { directory: output, packageName: name, scope: 'local-template-copy-no-install' };
}
