import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const sandbox = await mkdtemp(resolve(tmpdir(), 'gadget-devkit-test-'));
after(() => rm(sandbox, { recursive: true, force: true }));
const packages = fileURLToPath(new URL('../../', import.meta.url));
const tarballs = [];
for (const name of ['archive-tools', 'gadget-contract', 'devkit']) {
  const packed = spawnSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', sandbox], { cwd: resolve(packages, name), encoding: 'utf8', shell: false });
  assert.equal(packed.status, 0, packed.stderr);
  tarballs.push(resolve(sandbox, JSON.parse(packed.stdout)[0].filename));
}
const consumer = resolve(sandbox, 'consumer');
await mkdir(consumer);
await writeFile(resolve(consumer, 'package.json'), JSON.stringify({ name: 'isolated-devkit-test', private: true, type: 'module' }));
const installed = spawnSync('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs], { cwd: consumer, encoding: 'utf8', shell: false });
assert.equal(installed.status, 0, installed.stderr);
const modulePath = resolve(consumer, 'node_modules/@agenticos-dev/gadget-devkit/src/index.js');
const devkit = await import(pathToFileURL(modulePath));
const codec = await import(pathToFileURL(resolve(consumer, 'node_modules/@agenticos-dev/gadget-archive-tools/src/index.js')));
const contract = await import(pathToFileURL(resolve(consumer, 'node_modules/@agenticos-dev/gadget-contract/src/index.js')));
const definition = { schemaVersion: 'gadget.definition.v1', key: 'test_notes', version: 1, title: 'Test notes', runtimeTier: 'declarative', distribution: 'installed', fields: [{ key: 'title', kind: 'text', label: 'Title' }], mutable: ['title'], commands: ['state.set'], actions: [], views: [{ key: 'main', label: 'Notes', layout: 'full', widgets: [{ id: 'title', type: 'rich_text', title: 'Title', binding: 'title' }] }] };
let serial = 0;
async function fixture(overrides = {}) {
  const root = resolve(sandbox, `app-${++serial}`);
  await mkdir(resolve(root, 'src'), { recursive: true });
  await writeFile(resolve(root, 'package.json'), JSON.stringify({ name: 'test-notes', type: 'module', scripts: { test: 'node --version', build: 'node --version', validate: 'node --version' }, gadget: { archive: 'dist/test-notes.gadget' }, ...overrides }));
  await writeFile(resolve(root, 'manifest.json'), JSON.stringify({ blueprintKey: 'test_notes', artifact: 'test-notes.gadget', metadata: { title: 'Test notes' }, files: ['server.js', 'agent.md'] }));
  await writeFile(resolve(root, 'definition.json'), JSON.stringify(definition));
  await writeFile(resolve(root, 'src/server.js'), 'export default class Notes {}\n');
  await writeFile(resolve(root, 'src/agent.md'), 'Help with notes.\n');
  return root;
}
const successfulRun = () => ({ status: 0 });

test('isolated package closure imports canonical codec and validator without API checkout', async () => {
  assert.equal(contract.validateGadgetDefinition(definition).ok, true);
  assert.equal(contract.validateGadgetDefinition({ ...definition, runtimeTier: 'sandboxed_server' }).ok, false);
  const first = await codec.writeBlueprintArchive({ metadata: { title: 'Test' }, files: { 'server.js': 'export default {};' } });
  const second = await codec.writeBlueprintArchive({ metadata: { title: 'Test' }, files: { 'server.js': 'export default {};' } });
  assert.deepEqual(first, second);
  assert.equal((await codec.readBlueprintArchive(first)).files['server.js'], 'export default {};');
});

test('trusted check runs test/build/validate in order without shell interpolation', async () => {
  const root = await fixture();
  const calls = [];
  const result = await devkit.checkGadgetPackage(root, { trustSource: true, run(command, args, options) { calls.push({ command, args, options }); return { status: 0 }; } });
  assert.deepEqual(result.steps, ['test', 'build', 'validate']);
  assert.deepEqual(calls.map((call) => call.args), [['run', 'test'], ['run', 'build'], ['run', 'validate']]);
  assert.ok(calls.every((call) => call.command === 'npm' && call.options.shell === false && call.options.cwd === root));
});

test('check requires explicit trust and preflights all scripts', async () => {
  const root = await fixture({ scripts: { test: 'node --version' } });
  let calls = 0;
  const run = () => { calls++; return { status: 0 }; };
  await assert.rejects(devkit.checkGadgetPackage(root, { run }), /trust-source/);
  await assert.rejects(devkit.checkGadgetPackage(root, { trustSource: true, run }), /declare a build/);
  assert.equal(calls, 0);
});

test('signals, spawn errors and nonzero exits stop the pipeline', async () => {
  const root = await fixture();
  for (const result of [{ status: null, signal: 'SIGTERM' }, { status: 0, error: new Error('spawn failed') }, { status: 2 }]) {
    let count = 0;
    await assert.rejects(devkit.checkGadgetPackage(root, { trustSource: true, run() { count++; return result; } }), /Package test failed/);
    assert.equal(count, 1);
  }
});

test('canonical build and validation produce repeatable archives and integrity evidence', async () => {
  const root = await fixture();
  const first = await devkit.buildPackage(root);
  const second = await devkit.buildPackage(root);
  assert.deepEqual(first.bytes, second.bytes);
  const result = await devkit.validatePackage(root);
  assert.equal(result.sha256, first.release.sha256);
  assert.equal(result.byteSize, first.bytes.length);
});

test('build rejects conflicting identity, unsafe members and source symlink escape', async () => {
  const root = await fixture();
  await writeFile(resolve(root, 'definition.json'), JSON.stringify({ ...definition, key: 'other' }));
  await assert.rejects(devkit.buildPackage(root), /conflicts/);
  await writeFile(resolve(root, 'definition.json'), JSON.stringify(definition));
  const manifestPath = resolve(root, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  await writeFile(manifestPath, JSON.stringify({ ...manifest, files: ['../secret.js'] }));
  await assert.rejects(devkit.buildPackage(root), /flat archive member/);
  await writeFile(manifestPath, JSON.stringify({ ...manifest, files: ['outside.js'] }));
  await symlink(resolve(root, '../'), resolve(root, 'src/outside.js'));
  await assert.rejects(devkit.buildPackage(root), /symlink escapes/);
});

test('build refuses symlinked output directory without writing through it', async () => {
  const root = await fixture();
  await symlink(consumer, resolve(root, 'dist'));
  await assert.rejects(devkit.buildPackage(root), /symlinked dist/);
});

test('validation detects tampered archive and release evidence', async () => {
  const root = await fixture();
  await devkit.buildPackage(root);
  const releasePath = resolve(root, 'dist/release.json');
  const release = JSON.parse(await readFile(releasePath, 'utf8'));
  await writeFile(releasePath, JSON.stringify({ ...release, sha256: 'wrong' }));
  await assert.rejects(devkit.validatePackage(root), /checksum/);
  await writeFile(releasePath, JSON.stringify(release));
  await writeFile(resolve(root, 'dist/test-notes.gadget'), Buffer.from('corrupt'));
  await assert.rejects(devkit.validatePackage(root), /prefix/);
});

test('pack revalidates and refuses overwrite before executing package scripts', async () => {
  const root = await fixture();
  await devkit.buildPackage(root);
  const output = resolve(sandbox, 'deliverable.gadget');
  const result = await devkit.packGadgetPackage(root, { trustSource: true, output, run: successfulRun });
  assert.equal(result.output, output);
  let calls = 0;
  await assert.rejects(devkit.packGadgetPackage(root, { trustSource: true, output, run() { calls++; return { status: 0 }; } }), /overwrite/);
  assert.equal(calls, 0);
  assert.deepEqual(await readFile(output), await readFile(resolve(root, 'dist/test-notes.gadget')));
});

test('pack cannot accept a lying validate script for corrupt bytes', async () => {
  const root = await fixture();
  await devkit.buildPackage(root);
  await writeFile(resolve(root, 'dist/test-notes.gadget'), 'not an archive');
  await assert.rejects(devkit.packGadgetPackage(root, { trustSource: true, output: resolve(sandbox, 'corrupt.gadget'), run: successfulRun }), /prefix/);
});

test('pack preserves an output created while package scripts are running', async () => {
  const root = await fixture();
  await devkit.buildPackage(root);
  const output = resolve(sandbox, 'concurrent-output.gadget');
  let calls = 0;
  await assert.rejects(devkit.packGadgetPackage(root, { trustSource: true, output, run() {
    if (calls++ === 0) writeFileSync(output, 'Other writer owns this file.');
    return { status: 0 };
  } }), /EEXIST/);
  assert.equal(await readFile(output, 'utf8'), 'Other writer owns this file.');
});

test('validation refuses stale source, metadata and lockfile after a build', async () => {
  const root = await fixture();
  await devkit.buildPackage(root);
  await writeFile(resolve(root, 'src/agent.md'), 'Changed instructions.');
  await assert.rejects(devkit.validatePackage(root), /differs from current source/);
  await devkit.buildPackage(root);
  const path = resolve(root, 'manifest.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...manifest, metadata: { title: 'Renamed' } }));
  await assert.rejects(devkit.validatePackage(root), /metadata differs/);
  await devkit.buildPackage(root);
  await writeFile(resolve(root, 'package-lock.json'), '{}');
  await assert.rejects(devkit.validatePackage(root), /provenance differs/);
});

test('init copies reviewed local template without running scripts and refuses overwrite', async () => {
  const root = await fixture();
  const output = resolve(sandbox, 'initialized');
  await devkit.initGadgetPackage(output, { template: root, name: 'new-agent' });
  const manifest = JSON.parse(await readFile(resolve(output, 'package.json'), 'utf8'));
  assert.equal(manifest.name, 'new-agent');
  assert.equal(manifest.private, true);
  assert.equal(await readFile(resolve(output, 'src/agent.md'), 'utf8'), 'Help with notes.\n');
  await assert.rejects(devkit.initGadgetPackage(output, { template: root, name: 'new-agent' }), /overwrite/);
});

test('init rejects secret/hidden entries and symlinks before creating destination', async () => {
  const root = await fixture();
  await writeFile(resolve(root, '.env'), 'DO_NOT_COPY=fixture');
  await assert.rejects(devkit.initGadgetPackage(resolve(sandbox, 'secrets'), { template: root, name: 'safe' }), /excluded entry/);
  await rm(resolve(root, '.env'));
  await symlink(resolve(root, 'src'), resolve(root, 'linked'));
  await assert.rejects(devkit.initGadgetPackage(resolve(sandbox, 'links'), { template: root, name: 'safe' }), /symlinks/);
});

test('CLI rejects unknown and duplicate options', () => {
  const cli = resolve(consumer, 'node_modules/@agenticos-dev/gadget-devkit/src/cli.mjs');
  for (const args of [['check', consumer, '--no-sandbox'], ['check', consumer, '--trust-source', '--trust-source'], ['pack', consumer, '--output']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', shell: false });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown option|Duplicate option|Missing value/);
  }
});
