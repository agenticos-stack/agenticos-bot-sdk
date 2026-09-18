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

/**
 * Every relative module a packed file imports must itself be packed.
 *
 * The archive is flat and the platform loads exactly its members, so a module
 * added under `src/` but missing from `manifest.json` builds, passes every
 * unit test that imports it from disk, and then fails at load with `No such
 * module` the first time the gadget starts. That shipped once
 * (grant-request.js). A lexical scan is enough here: a static `from "./x.js"`
 * or `import("./x.js")` is the only way these modules reach each other. The
 * bundled `client.js` is exempt — its imports were resolved at bundle time.
 */
export function assertPackedImports(files) {
  const missing = [];
  for (const [name, text] of Object.entries(files)) {
    if (!name.endsWith(".js") || name === "client.js") continue;
    for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*)["']\.\/([^"']+)["']/gm)) {
      if (!Object.hasOwn(files, match[1])) missing.push(`${name} imports ./${match[1]}`);
    }
  }
  if (missing.length) throw new Error(`Archive is missing imported modules; add them to manifest.json: ${missing.join("; ")}.`);
}

/**
 * The storage schema this code expects, declared as data the host can read.
 *
 * A restore to older code is only safe when that code understands the storage
 * it will find: `migrate()` never runs down, so code written for schema N
 * reading storage at N+k silently sees empty columns. The host decides from
 * `storageSchemaVersion` inside the archive's own `manifest.json` — every
 * code-log revision carries the one it was built with — and never parses
 * `storage.js`. This check is what keeps that declaration honest: a migration
 * bump without the manifest fails the build instead of shipping a lie.
 */
export function assertStorageSchemaDeclaration(manifest, current) {
  const declared = manifest?.storageSchemaVersion;
  if (!Number.isSafeInteger(declared) || declared < 0) {
    throw new Error("manifest.json must declare storageSchemaVersion as a non-negative integer.");
  }
  if (declared !== current) {
    throw new Error(
      `manifest.json declares storageSchemaVersion ${declared}, but storage.js migrates to ${current}. Update the manifest with the migration.`
    );
  }
  if (!manifest.files?.includes("manifest.json")) {
    throw new Error("manifest.json must ship inside the archive so each code revision carries its storageSchemaVersion.");
  }
  return declared;
}

function budgetLimit(budget) {
  const limit = typeof budget === 'number' ? budget : budget?.limit;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('A byte budget must be a positive integer.');
  return { limit, reason: typeof budget === 'object' && budget ? budget.reason : null };
}

async function packageInputs(directory, options = {}) {
  const root = await realpath(resolve(directory));
  const manifest = await json(await sourcePath(root, 'manifest.json'));
  const packageJSON = await json(await sourcePath(root, 'package.json'));
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('Manifest must list flat source files.');
  if (typeof manifest.artifact !== 'string' || !/^[a-zA-Z0-9_-]+\.gadget$/.test(manifest.artifact)) throw new Error('Manifest artifact must be a flat .gadget filename.');
  if (packageJSON.gadget?.archive !== `dist/${manifest.artifact}`) throw new Error('package.json gadget.archive must match dist/manifest.artifact.');
  if (typeof manifest.metadata?.title !== 'string' || !manifest.metadata.title.trim()) throw new Error('Manifest metadata.title is required.');
  const checked = validateGadgetDefinition(options.definition ?? await json(await sourcePath(root, 'definition.json')));
  if (!checked.ok || checked.definition?.key !== manifest.blueprintKey) throw new Error('Definition is invalid or conflicts with manifest blueprintKey.');
  return { root, manifest, definition: checked.definition };
}

async function memberSource(root, name, generated) {
  if (generated && Object.hasOwn(generated, name)) {
    const text = await generated[name]();
    if (typeof text !== 'string') throw new Error(`Generated member ${name} did not return string source.`);
    return text;
  }
  return readFile(await sourcePath(root, `src/${name}`), 'utf8');
}

async function lockfileEvidence(root) {
  for (const name of ['package-lock.json', 'pnpm-lock.yaml']) {
    try { return { lockfile: name, lockfileSha256: hash(await readFile(await sourcePath(root, name))) }; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { lockfile: null, lockfileSha256: null };
}

/** App-owned build helper: flat src members, canonical codec and definition checker.
 *
 * Options (all optional):
 *   definition           — parsed gadget definition object; falls back to definition.json
 *   generatedMembers     — { [member]: () => string } for members that are not
 *                          plain src/ files (bundled client.js, manifest.json)
 *   storageSchemaVersion — expected storage schema; asserts the manifest declares it
 *   budgets              — { clientJs, archive } byte limits, each a number or
 *                          { limit, reason }; the reason is what the guard protects
 *   outputDir            — defaults to <package>/dist
 */
export async function buildPackage(directory, options = {}) {
  const { root, manifest, definition } = await packageInputs(directory, options);
  const files = Object.create(null);
  for (const name of manifest.files) {
    if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(name) || Object.hasOwn(files, name)) throw new Error('Invalid or duplicate flat archive member.');
    files[name] = await memberSource(root, name, options.generatedMembers);
  }
  assertPackedImports(files);
  if (options.storageSchemaVersion !== undefined) assertStorageSchemaDeclaration(manifest, options.storageSchemaVersion);
  const budgets = options.budgets ?? {};
  let clientBytes = null;
  if (budgets.clientJs != null) {
    if (!Object.hasOwn(files, 'client.js')) throw new Error('budgets.clientJs is set but client.js is not a packed member.');
    const { limit, reason } = budgetLimit(budgets.clientJs);
    clientBytes = Buffer.byteLength(files['client.js'], 'utf8');
    if (clientBytes > limit) throw new Error(`client.js is ${clientBytes} bytes; the declared budget is ${limit}${reason ? ` — ${reason}` : ''}.`);
  }
  const bytes = Buffer.from(await writeBlueprintArchive({ metadata: { ...manifest.metadata, gadgetDefinition: definition }, files }));
  if (budgets.archive != null) {
    const { limit, reason } = budgetLimit(budgets.archive);
    if (bytes.length > limit) throw new Error(`Archive is ${bytes.length} bytes; the declared budget is ${limit}${reason ? ` — ${reason}` : ''}.`);
  }
  const { lockfile, lockfileSha256 } = await lockfileEvidence(root);
  const release = {
    schemaVersion: 'ai-agent-package-release.v1', blueprintKey: manifest.blueprintKey,
    artifact: manifest.artifact, sha256: hash(bytes), byteSize: bytes.length, definition,
    ...(clientBytes === null ? {} : { clientBytes }),
    files: Object.fromEntries(Object.entries(files).map(([name, text]) => [name, hash(text)])),
    provenance: { status: 'incomplete-local-evidence', sourceCommit: null, lockfile, lockfileSha256,
      runtimeCompatibility: manifest.compatibility ?? null }
  };
  const dist = options.outputDir ? resolve(options.outputDir) : resolve(root, 'dist');
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

export async function validatePackage(directory, options = {}) {
  const { root, manifest, definition } = await packageInputs(directory, options);
  const dist = options.outputDir ? resolve(options.outputDir) : resolve(root, 'dist');
  const release = await json(await sourcePath(dist, 'release.json'));
  const bytes = await readFile(await sourcePath(dist, manifest.artifact));
  const archive = await readBlueprintArchive(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const checked = validateGadgetDefinition(archive.metadata.gadgetDefinition);
  if (!checked.ok || !isDeepStrictEqual(checked.definition, definition)) throw new Error('Archive definition differs from package definition.');
  if (!isDeepStrictEqual(archive.metadata, { ...manifest.metadata, gadgetDefinition: definition })) throw new Error('Archive metadata differs from package manifest.');
  if (hash(bytes) !== release.sha256 || bytes.length !== release.byteSize) throw new Error('Archive checksum/size differs from release.');
  if (release.schemaVersion !== 'ai-agent-package-release.v1' || release.artifact !== manifest.artifact || release.blueprintKey !== manifest.blueprintKey || !isDeepStrictEqual(release.definition, definition)) throw new Error('Release identity/definition differs from package.');
  if (!isDeepStrictEqual(Object.keys(archive.files).sort(), [...manifest.files].sort()) || !isDeepStrictEqual(Object.keys(release.files).sort(), Object.keys(archive.files).sort())) throw new Error('Archive/release member set differs from manifest.');
  for (const [name, text] of Object.entries(archive.files)) {
    if (hash(text) !== release.files[name]) throw new Error(`Member checksum differs: ${name}`);
    if (text !== await memberSource(root, name, options.generatedMembers)) throw new Error(`Archive member differs from current source: ${name}`);
  }
  const { lockfile, lockfileSha256 } = await lockfileEvidence(root);
  if (!isDeepStrictEqual(release.provenance, { status: 'incomplete-local-evidence', sourceCommit: null,
    lockfile, lockfileSha256, runtimeCompatibility: manifest.compatibility ?? null })) throw new Error('Release provenance differs from current package evidence.');
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
