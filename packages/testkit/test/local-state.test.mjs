import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFacetTestkit } from '../src/index.js';
import { archiveLocalState, acquireLocalState } from '../src/local-state.js';

test('explicit local state survives disposal, locks writers and resets recoverably', async () => {
  const root = await mkdtemp(join(tmpdir(),'bot-state-test-'));
  const stateDirectory = join(root,'notes');
  const options = {stateDirectory,allowedMethods:['write','read'],modules:{'server.js':`
    import {DurableObject} from 'cloudflare:workers';
    export class Gadget extends DurableObject {
      constructor(ctx,env){super(ctx,env);ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS notes (text TEXT)');}
      write(text){this.ctx.storage.sql.exec('INSERT INTO notes VALUES (?)',text);return true;}
      read(){return this.ctx.storage.sql.exec('SELECT text FROM notes').toArray();}
    }`}};
  const call = (rig,method,args=[])=>rig.call({workspace:'dev',facet:'notes',method,args});
  let rig;
  try {
    rig = await createFacetTestkit(options);
    await call(rig,'write',['saved before restart']);
    await assert.rejects(createFacetTestkit(options),/locked/);
    await assert.rejects(archiveLocalState(stateDirectory),/locked/);
    await rig.dispose(); rig = undefined;
    options.modules['server.js'] += '\n// changed development source\n';
    rig = await createFacetTestkit(options);
    assert.deepEqual(await call(rig,'read'),[{text:'saved before restart'}]);
    await rig.dispose(); rig = undefined;
    const backup = await archiveLocalState(stateDirectory);
    assert.equal(await readFile(join(backup,'.bot-state'),'utf8'),'agenticos-local-state-v1\n');
    rig = await createFacetTestkit(options);
    assert.deepEqual(await call(rig,'read'),[]);
    await rig.dispose(); rig = undefined;
    rig = await createFacetTestkit({...options,stateDirectory:backup});
    assert.deepEqual(await call(rig,'read'),[{text:'saved before restart'}]);
    await rig.dispose(); rig = undefined;
    await mkdir(join(root,'unowned'));
    await assert.rejects(acquireLocalState(join(root,'unowned')),/unowned/);
    await symlink(backup,join(root,'alias'));
    await assert.rejects(acquireLocalState(join(root,'alias')),/symlinked/);
  } finally { await rig?.dispose(); await rm(root,{recursive:true,force:true}); }
});

test('a directory something else created is refused by name, and the message says why', async () => {
  /*
   * The dull cause, and the one that actually happens: a host that starts an
   * agent before the isolate — the ordering a door spec requires, since `env`
   * is shaped at load — has already done `mkdir(stateDirectory, { recursive:
   * true })` on the way to writing its session file. The old message said
   * "unowned or symlinked", which sent the reader looking for a symlink that
   * was never there.
   */
  const root = await mkdtemp(join(tmpdir(), 'bot-state-foreign-'));
  const target = join(root, 'runtime');
  await mkdir(target, { recursive: true, mode: 0o700 });   // created by somebody else, no marker
  await assert.rejects(acquireLocalState(target), (error) => {
    assert.match(error.message, /was not created by the testkit/);
    assert.match(error.message, /\.bot-state marker/);
    assert.match(error.message, /sibling directory/);      // names the fix
    assert.ok(error.message.includes(target));             // names the path
    return true;
  });
  await rm(root, { recursive: true, force: true });
});

