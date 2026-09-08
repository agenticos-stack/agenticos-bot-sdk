import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const packages = fileURLToPath(new URL('../../', import.meta.url));
const compiler = join(root, 'node_modules/.bin/tsc');
const packageNames = ['archive-tools', 'gadget-contract', 'devkit', 'shell'];

test('packed public declarations work without private repos in NodeNext and Bundler consumers', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'gadget-public-types-'));
  try {
    const consumer = join(scratch, 'consumer');
    await mkdir(consumer);
    const userConfig = join(scratch, 'empty.npmrc');
    const globalConfig = join(scratch, 'global.npmrc');
    await writeFile(userConfig, '');
    await writeFile(globalConfig, '');
    // Public dependency tarballs come from npm's populated cache, never auth or private repos.
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: scratch };
    const npm = args => execFileSync('npm', [
      '--userconfig', userConfig, '--globalconfig', globalConfig, ...args
    ], { cwd: consumer, env, encoding: 'utf8', timeout: 60000 });
    const tarballs = [];
    const manifests = new Map();
    for (const directory of packageNames) {
      const source = join(packages, directory);
      const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
      manifests.set(manifest.name, manifest);
      const pack = JSON.parse(npm(['pack', source, '--offline', '--ignore-scripts', '--json', '--pack-destination', scratch]))[0];
      const files = pack.files.map(file => file.path);
      const declarations = directory === 'shell' ? 'GadgetSplitView.svelte.d.ts' : 'src/index.d.ts';
      assert.ok(files.includes(declarations), `${manifest.name} must ship its types`);
      assert.ok(files.every(path => !/(^|\/)(test|node_modules|\.env|\.git)(\/|$)/.test(path)), 'No tests, dependency trees, or local credentials in packages');
      for (const [subpath, entry] of Object.entries(manifest.exports)) {
        assert.equal(Object.keys(entry)[0], 'types', `${subpath} resolves declarations first`);
        for (const target of Object.values(entry)) assert.ok(files.includes(target.replace(/^\.\//, '')), `${target} exists in tarball`);
      }
      tarballs.push(join(scratch, pack.filename));
    }
    for (const manifest of manifests.values()) {
      for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) {
        assert.doesNotMatch(version, /^(file:|workspace:|link:|git)/);
        if (dependency.startsWith('@agenticos-dev/')) {
          assert.ok(manifests.has(dependency), `Internal dependency ${dependency} belongs to the public closure`);
          assert.equal(version, manifests.get(dependency).version, 'Exact internal dependency version');
        } else assert.equal(dependency, 'yjs', 'Only the reviewed codec dependency belongs to this runtime closure');
      }
    }
    const svelte = JSON.parse(await readFile(join(root, 'node_modules/svelte/package.json'), 'utf8'));
    await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'isolated-public-types', private: true, type: 'module' }));
    npm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs, `svelte@${svelte.version}`]);
    for (const name of ['bot-dev', 'gadget-dev']) {
      const cli = spawnSync(join(consumer, `node_modules/.bin/${name}`), ['check', consumer], {
        cwd: consumer, env, encoding: 'utf8', timeout: 10000
      });
      assert.equal(cli.error, undefined, `npm installs an executable ${name} bin`);
      assert.equal(cli.status, 1);
      assert.match(cli.stderr, /trust-source/, 'Installed bin retains the explicit-trust refusal');
    }
    const lock = JSON.parse(await readFile(join(consumer, 'package-lock.json'), 'utf8'));
    for (const path of Object.keys(lock.packages)) {
      if (path.startsWith('node_modules/@agenticos-dev/')) {
        assert.ok(manifests.has(path.slice('node_modules/'.length)), `No private AgenticOS dependency ${path}`);
      }
    }
    await writeFile(join(consumer, 'consumer.mts'), await readFile(new URL('./public-consumer.mts', import.meta.url), 'utf8'));
    for (const [module, moduleResolution] of [['NodeNext', 'NodeNext'], ['ESNext', 'Bundler']]) {
      const config = join(consumer, `tsconfig.${moduleResolution}.json`);
      await writeFile(config, JSON.stringify({
        compilerOptions: { target: 'ES2022', module, moduleResolution, strict: true,
          noEmit: true, types: [], skipLibCheck: false }, files: ['consumer.mts']
      }));
      try {
        execFileSync(compiler, ['--project', config], { cwd: consumer, env, encoding: 'utf8', timeout: 30000 });
      } catch (error) {
        assert.fail(`${moduleResolution} declaration diagnostics:\n${error.stdout ?? ''}${error.stderr ?? error.message}`);
      }
    }
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import * as codec from '@agenticos-dev/bot-archive-tools';
      import * as contract from '@agenticos-dev/bot-contract';
      import * as devkit from '@agenticos-dev/bot-devkit';
      assert.equal(typeof codec.readBlueprintArchive, 'function');
      assert.equal(contract.validateGadgetDefinition({}).ok, false);
      assert.deepEqual(devkit.PACKAGE_CHECK_STEPS, ['test', 'build', 'validate']);
      assert.ok(import.meta.resolve('@agenticos-dev/bot-shell/GadgetSplitView.svelte').endsWith('/GadgetSplitView.svelte'));
      console.log('Public package entries resolve');
    `], { cwd: consumer, env, encoding: 'utf8', timeout: 10000 });
    assert.match(result, /Public package entries resolve/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
