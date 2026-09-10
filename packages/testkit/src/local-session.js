import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFacetTestkit } from './index.js';
import { encodeBytes } from './rpc-bytes.js';

/**
 * The host credential for `/local-rpc`, stable for as long as the state is.
 *
 * This was minted fresh on every call, so every restart of a development host
 * invalidated the token the browser was holding and the developer had to press
 * "Start development session" again — after every edit to client code, which
 * cannot hot-reload. The session was being thrown away for no reason except
 * that the token was random.
 *
 * It lives beside the SQLite it guards, in a directory the testkit already
 * owns at `0700`, and is written `0600`. That is the same trust boundary: a
 * reader of this file can already read the data it protects. Resetting or
 * archiving the state drops the token with it, which is the behaviour to want
 * — a fresh state is a fresh session.
 *
 * An ephemeral run (no `stateDirectory`) keeps a random token. There is
 * nowhere to persist it and nothing to come back to.
 */
async function sessionToken(stateDirectory) {
  if (!stateDirectory) return randomBytes(32).toString('hex');
  const path = join(stateDirectory, '.bot-session-token');
  const existing = await readFile(path, 'utf8').catch(() => '');
  if (/^[0-9a-f]{64}$/.test(existing.trim())) return existing.trim();
  const minted = randomBytes(32).toString('hex');
  // `flag: 'w'` and not 'wx': a half-written or corrupt token should be
  // replaced, not turn every future start into an error nobody can clear.
  await writeFile(path, `${minted}\n`, { mode: 0o600, flag: 'w' });
  return minted;
}

/** Login-free trusted-source development session. Never deploy this adapter.
 * `doors`, when supplied, is the caller's own connected doors — see
 * createFacetTestkit. Without it the gadget is loaded with an empty env.
 * Identity and method admission are host-owned, not fields supplied by callers.
 * No outbound network/bindings are supplied by the underlying facet testkit. */
export async function createLocalSession({ modules, allowedMethods, seed = [], origins, stateDirectory, doors }) {
  if (!Array.isArray(origins) || !origins.length || origins.some(value => {
    try {
      const url = new URL(value);
      return url.origin !== value || url.protocol !== 'http:' ||
        !['localhost', '127.0.0.1', 'social.localhost'].includes(url.hostname);
    } catch { return true; }
  })) throw new TypeError('Explicit HTTP loopback origins required');
  if (!Array.isArray(seed)) throw new TypeError('seed must be an array');
  const methods = [...new Set([...allowedMethods, ...seed.map(call => call.method)])];
  // Passed straight through: this adapter owns identity and method admission,
  // never what a door is or whether one may be reached.
  const rig = await createFacetTestkit({ modules, allowedMethods: methods, stateDirectory, doors });
  const identity = Object.freeze({ workspace: 'local-developer', facet: 'local-app' });
  const token = await sessionToken(stateDirectory);
  const call = (method, args = []) => rig.call({ ...identity, method, args });
  try { for (const entry of seed) await call(entry.method, entry.args); }
  catch (error) { await rig.dispose(); throw error; }
  /**
   * A BOUNDED POOL, not a single line.
   *
   * Every admitted call used to chain onto one promise — the comment said
   * "serialize browser mutations", and the code serialised reads too. So a
   * grid of pictures and the drawer opened over it formed one queue, and a
   * read of bytes ALREADY IN THE CACHE could sit behind eleven others until
   * the browser's own 20-second budget ran out. Observed exactly that: a
   * drawer reporting "this frame did not arrive" for a 161,525 byte preview
   * that was in SQLite the whole time.
   *
   * Nothing is lost by letting them overlap. What orders storage is the
   * Durable Object's own input gate, inside the isolate, where a write is
   * ordered against every other operation on that object; this queue never
   * provided that guarantee, it only hid the need for it behind a slower
   * pipe. The pool that replaces it exists to bound MEMORY — each in-flight
   * media call holds its bytes plus a base64 copy of them — not to order
   * anything.
   *
   * Disposal still waits for every call it admitted, which is the part of the
   * old comment that was load-bearing.
   */
  const MAX_CONCURRENT_CALLS = 4;
  let closed = false;
  let active = 0;
  const waiting = [];
  const inFlight = new Set();

  function acquire() {
    if (active < MAX_CONCURRENT_CALLS) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise(resolve => waiting.push(resolve));
  }

  function release() {
    const next = waiting.shift();
    // Hand the slot straight over rather than dropping and re-taking it, so a
    // waiter cannot be overtaken by a call that arrives in between.
    if (next) next();
    else active -= 1;
  }

  async function admit(method, args) {
    await acquire();
    const running = call(method, args);
    inFlight.add(running);
    try { return await running; }
    finally { inFlight.delete(running); release(); }
  }
  return {
    mode: 'local-runtime', identity, token,
    async handle(request) {
      const reply = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
      if (closed) return reply({ error: 'session_closed' }, 503);
      if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
      if (!origins.includes(request.headers.get('origin')) || request.headers.get('x-bot-local-session') !== token)
        return reply({ error: 'local_session_required' }, 403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'json_required' }, 415);
      const reader = request.body?.getReader();
      const chunks = [];
      let length = 0;
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > 65536) { await reader.cancel(); return reply({ error: 'request_too_large' }, 413); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
      }
      const body = Buffer.concat(chunks).toString('utf8');
      let input;
      try { input = JSON.parse(body); } catch { return reply({ error: 'invalid_json' }, 400); }
      if (!input || !allowedMethods.includes(input.method) || !Array.isArray(input.args) ||
          Object.keys(input).some(key => !['method', 'args'].includes(key))) return reply({ error: 'method_not_admitted' }, 403);
      // `encodeBytes` only touches binary values; see rpc-bytes.js for what an
      // index-keyed Uint8Array costs on this hop.
      try { return reply({ ok: true, value: encodeBytes(await admit(input.method, input.args) ?? null) }); }
      catch { return reply({ ok: false, error: 'local_call_failed' }, 500); }
    },
    async dispose() {
      // `closed` stops new calls at the door, so this drains rather than
      // chases: whatever was admitted finishes, and nothing joins behind it.
      closed = true;
      while (inFlight.size) await Promise.allSettled([...inFlight]);
      await rig.dispose();
    }
  };
}
