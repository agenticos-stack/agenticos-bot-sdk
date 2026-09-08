import { randomBytes } from 'node:crypto';
import { createFacetTestkit } from './index.js';

/** Login-free trusted-source development session. Never deploy this adapter.
 * Identity and method admission are host-owned, not fields supplied by callers.
 * No outbound network/bindings are supplied by the underlying facet testkit. */
export async function createLocalSession({ modules, allowedMethods, seed = [], origins }) {
  if (!Array.isArray(origins) || !origins.length || origins.some(value => {
    try {
      const url = new URL(value);
      return url.origin !== value || url.protocol !== 'http:' ||
        !['localhost', '127.0.0.1', 'social.localhost'].includes(url.hostname);
    } catch { return true; }
  })) throw new TypeError('Explicit HTTP loopback origins required');
  if (!Array.isArray(seed)) throw new TypeError('seed must be an array');
  const methods = [...new Set([...allowedMethods, ...seed.map(call => call.method)])];
  const rig = await createFacetTestkit({ modules, allowedMethods: methods });
  const identity = Object.freeze({ workspace: 'local-developer', facet: 'local-app' });
  const token = randomBytes(32).toString('hex');
  const call = (method, args = []) => rig.call({ ...identity, method, args });
  try { for (const entry of seed) await call(entry.method, entry.args); }
  catch (error) { await rig.dispose(); throw error; }
  let closed = false;
  let queue = Promise.resolve();
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
      // Serialize browser mutations; disposal waits for admitted calls.
      const pending = queue.then(() => call(input.method, input.args));
      queue = pending.catch(() => {});
      try { return reply({ ok: true, value: await pending ?? null }); }
      catch { return reply({ ok: false, error: 'local_call_failed' }, 500); }
    },
    async dispose() { closed = true; await queue; await rig.dispose(); }
  };
}
