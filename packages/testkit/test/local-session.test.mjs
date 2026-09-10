import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalSession } from '../src/local-session.js';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('local session uses SQLite, host identity and denies unadmitted calls', async () => {
  const session = await createLocalSession({
    origins: ['http://social.localhost:18000'], allowedMethods: ['read', 'write'],
    modules: { 'server.js': `import {DurableObject} from 'cloudflare:workers';
      export class Gadget extends DurableObject {
        constructor(ctx, env) { super(ctx, env); this.sql=ctx.storage.sql; this.sql.exec('CREATE TABLE IF NOT EXISTS notes (text TEXT)'); }
        seed() { this.sql.exec('INSERT INTO notes VALUES (?)', 'seeded'); }
        write(value) { this.sql.exec('INSERT INTO notes VALUES (?)', value); return true; }
        read() { return this.sql.exec('SELECT text FROM notes').toArray(); }
      }` }, seed: [{ method: 'seed', args: [] }]
  });
  const request = (input, token = session.token) => new Request('http://social.localhost:18000/local-rpc', {
    method: 'POST', headers: { origin: 'http://social.localhost:18000', 'content-type': 'application/json', 'x-bot-local-session': token }, body: JSON.stringify(input)
  });
  try {
    assert.equal((await session.handle(request({ method: 'read', args: [] }, 'wrong'))).status, 403);
    const foreign = request({ method: 'read', args: [] });
    foreign.headers.set('origin', 'http://untrusted.example');
    assert.equal((await session.handle(foreign)).status, 403);
    assert.equal((await session.handle(request({ method: 'write', args: ['x'.repeat(65537)] }))).status, 413);
    for (const method of ['publish', 'seed', 'fetch']) assert.equal((await session.handle(request({ method, args: [] }))).status, 403);
    assert.equal((await session.handle(request({ method: 'read', args: [], workspace: 'someone-else' }))).status, 403);
    assert.equal((await session.handle(request({ method: 'write', args: ['persisted'] }))).status, 200);
    assert.deepEqual((await (await session.handle(request({ method: 'read', args: [] }))).json()).value, [{ text: 'seeded' }, { text: 'persisted' }]);
  } finally { await session.dispose(); }
});

test('a session token outlives the process that minted it', async () => {
  /*
   * The token was minted fresh on every start, so every restart of a
   * development host invalidated the one the browser was holding and the
   * developer had to press "Start development session" again — after every
   * edit to client code, which cannot hot-reload. The session was being thrown
   * away for no reason except that the token was random.
   */
  const root = await mkdtemp(join(tmpdir(), 'bot-token-'));
  const stateDirectory = join(root, 'runtime');
  const options = {
    origins: ['http://social.localhost:18000'],
    allowedMethods: ['read'],
    stateDirectory,
    modules: { 'server.js': `import {DurableObject} from 'cloudflare:workers';
      export class Gadget extends DurableObject { read() { return 'ok'; } }` }
  };

  const first = await createLocalSession(options);
  const token = first.token;
  await first.dispose();

  const second = await createLocalSession(options);
  try {
    assert.equal(second.token, token, 'a restart against the same state keeps the session alive');
    // It is a host credential sitting beside the data it guards, so it is
    // written no more readably than that data.
    const file = join(stateDirectory, '.bot-session-token');
    assert.match((await readFile(file, 'utf8')).trim(), /^[0-9a-f]{64}$/);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  } finally {
    await second.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('an ephemeral session still gets a random token, since there is nothing to return to', async () => {
  const options = {
    origins: ['http://social.localhost:18000'],
    allowedMethods: ['read'],
    modules: { 'server.js': `import {DurableObject} from 'cloudflare:workers';
      export class Gadget extends DurableObject { read() { return 'ok'; } }` }
  };
  const a = await createLocalSession(options);
  const b = await createLocalSession(options);
  try {
    assert.notEqual(a.token, b.token);
    assert.match(a.token, /^[0-9a-f]{64}$/);
  } finally { await a.dispose(); await b.dispose(); }
});

