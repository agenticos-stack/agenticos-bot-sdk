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


test('calls overlap instead of queueing, and disposal still waits for them', async () => {
  /*
   * Every admitted call used to chain onto one promise. The comment said
   * "serialize browser mutations" and the code serialised reads too, so a
   * grid of pictures and the drawer opened over it formed a single line — and
   * a read of bytes already in the cache could sit behind eleven others until
   * the browser's own 20-second budget ran out. Observed exactly that: a
   * drawer reporting "this frame did not arrive" for a 161,525 byte preview
   * that was in SQLite the whole time.
   */
  const session = await createLocalSession({
    origins: ['http://social.localhost:18000'], allowedMethods: ['slow', 'peak'],
    modules: { 'server.js': `import {DurableObject} from 'cloudflare:workers';
      export class Gadget extends DurableObject {
        constructor(ctx, env) { super(ctx, env); this.live = 0; this.high = 0; }
        async slow() {
          this.live += 1;
          if (this.live > this.high) this.high = this.live;
          await scheduler.wait(40);
          this.live -= 1;
          return true;
        }
        peak() { return this.high; }
      }` }
  });
  const request = (input) => new Request('http://social.localhost:18000/local-rpc', {
    method: 'POST', headers: { origin: 'http://social.localhost:18000', 'content-type': 'application/json', 'x-bot-local-session': session.token }, body: JSON.stringify(input)
  });
  try {
    const responses = await Promise.all(Array.from({ length: 8 }, () => session.handle(request({ method: 'slow', args: [] }))));
    for (const response of responses) assert.equal(response.status, 200);

    /*
     * The gadget counts how many bodies were live at once, which is the claim
     * itself. Wall-clock is NOT the probe: a call through this rig costs about
     * 60ms of its own regardless of what it does, so eight 40ms calls take
     * roughly the same time whether they overlap or not, and an elapsed-time
     * assertion would be measuring the harness and flaking on a busy machine.
     */
    const peak = (await (await session.handle(request({ method: 'peak', args: [] }))).json()).value;
    assert.ok(peak > 1, `expected calls to overlap, peak was ${peak}`);
    assert.ok(peak <= 4, `expected the pool to bound concurrency, peak was ${peak}`);
  } finally { await session.dispose(); }
});

test('disposal drains the calls it admitted', async () => {
  let finished = 0;
  const session = await createLocalSession({
    origins: ['http://social.localhost:18000'], allowedMethods: ['slow'],
    modules: { 'server.js': `import {DurableObject} from 'cloudflare:workers';
      export class Gadget extends DurableObject {
        async slow() { await scheduler.wait(60); return true; }
      }` }
  });
  const request = () => new Request('http://social.localhost:18000/local-rpc', {
    method: 'POST', headers: { origin: 'http://social.localhost:18000', 'content-type': 'application/json', 'x-bot-local-session': session.token }, body: JSON.stringify({ method: 'slow', args: [] })
  });
  const calls = Array.from({ length: 3 }, () => session.handle(request()).then((response) => { finished += 1; return response; }));
  await session.dispose();
  // `dispose` returned, so every admitted call has already settled — nothing
  // is still holding the state directory when the next runtime claims it.
  assert.equal(finished, 3);
  await Promise.all(calls);
});
