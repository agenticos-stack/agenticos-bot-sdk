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
