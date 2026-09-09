import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalSession } from '../src/local-session.js';

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
