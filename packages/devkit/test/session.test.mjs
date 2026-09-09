import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  ACTIVE_ORG_HEADER, DEFAULT_API_ORIGIN, authHeaders, clearCredential, completeSignIn,
  credentialsPath, devSessionEnv, readCredential, requestSignInCode, startDevSession, writeCredential
} from '../src/session.mjs';

async function sandbox() {
  return { XDG_CONFIG_HOME: await mkdtemp(resolve(tmpdir(), 'bot-dev-session-')) };
}

const OK = { ok: true, status: 200, json: async () => ({ success: true }), headers: new Headers() };

test('stores credentials under XDG_CONFIG_HOME, one entry per deployment', async () => {
  const env = await sandbox();
  assert.equal(credentialsPath(env), join(env.XDG_CONFIG_HOME, 'agenticos', 'credentials.json'));

  await writeCredential({ apiOrigin: DEFAULT_API_ORIGIN, token: 't1', email: 'a@example.com', env });
  await writeCredential({ apiOrigin: 'https://staging-api.agenticos.hk', token: 't2', email: 'a@example.com', env });

  // Signing in to a second deployment must not replace the first.
  assert.equal((await readCredential({ env }))?.token, 't1');
  assert.equal((await readCredential({ apiOrigin: 'https://staging-api.agenticos.hk', env }))?.token, 't2');
});

test('writes the credential file 0600', async () => {
  const env = await sandbox();
  await writeCredential({ apiOrigin: DEFAULT_API_ORIGIN, token: 't', email: 'a@example.com', env });
  const mode = (await stat(credentialsPath(env))).mode & 0o777;
  assert.equal(mode, 0o600);
});

test('logout forgets one deployment and reports whether it had one', async () => {
  const env = await sandbox();
  await writeCredential({ apiOrigin: DEFAULT_API_ORIGIN, token: 't', email: 'a@example.com', env });
  assert.equal(await clearCredential({ env }), true);
  assert.equal(await readCredential({ env }), null);
  assert.equal(await clearCredential({ env }), false);
});

test('authenticates with a bearer, and pins an organization only when asked', () => {
  assert.deepEqual(authHeaders({ token: 'abc' }), { authorization: 'Bearer abc' });
  assert.deepEqual(authHeaders({ token: 'abc', orgId: 'org_1' }), {
    authorization: 'Bearer abc',
    [ACTIVE_ORG_HEADER]: 'org_1'
  });
  assert.throws(() => authHeaders(null), /bot-dev login/);
});

test('refuses an API origin that is neither https nor loopback', async () => {
  await assert.rejects(
    requestSignInCode({ apiOrigin: 'http://api.example.com', email: 'a@example.com', fetcher: async () => OK }),
    /https, or loopback/
  );
});

test('asks the platform for a sign-in code at the endpoint it already serves', async () => {
  let seen;
  await requestSignInCode({
    email: '  a@example.com ',
    fetcher: async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return OK; }
  });
  assert.equal(seen.url, `${DEFAULT_API_ORIGIN}/api/auth/email-otp/send-verification-otp`);
  assert.deepEqual(seen.body, { email: 'a@example.com', type: 'sign-in' });
});

test('takes the session token from set-auth-token, not the body', async () => {
  const { token } = await completeSignIn({
    email: 'a@example.com',
    otp: '123456',
    fetcher: async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'set-auth-token': 'session-token' }),
      json: async () => ({ user: { id: 'u1' } })
    })
  });
  assert.equal(token, 'session-token');
});

test('a 200 with no bearer token is a failure, not a silent success', async () => {
  // Storing nothing and reporting success is how somebody ends up debugging
  // "signed in but every call is anonymous".
  await assert.rejects(
    completeSignIn({
      email: 'a@example.com',
      otp: '123456',
      fetcher: async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({}) })
    }),
    /bearer plugin is not enabled/
  );
});

test('reports a rejected code with its status, without echoing the code', async () => {
  const failure = await completeSignIn({
    email: 'a@example.com',
    otp: '999999',
    fetcher: async () => ({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: async () => ({ message: 'Invalid OTP' })
    })
  }).catch((error) => error);
  assert.match(failure.message, /401/);
  assert.match(failure.message, /Invalid OTP/);
  assert.equal(failure.message.includes('999999'), false);
});

test('a missing credentials file reads as not signed in, not as a crash', async () => {
  const env = { XDG_CONFIG_HOME: join(tmpdir(), 'bot-dev-does-not-exist-' + Date.now()) };
  assert.equal(await readCredential({ env }), null);
});

test('the stored file never contains a password or the emailed code', async () => {
  const env = await sandbox();
  await writeCredential({ apiOrigin: DEFAULT_API_ORIGIN, token: 'tok', email: 'a@example.com', orgId: 'org_1', env });
  const raw = await readFile(credentialsPath(env), 'utf8');
  const stored = JSON.parse(raw)[DEFAULT_API_ORIGIN];
  assert.deepEqual(Object.keys(stored).sort(), ['email', 'orgId', 'signedInAt', 'token']);
});

test('mints a development session with the stored credential, never the credential itself', async () => {
  let seen;
  const session = await startDevSession({
    credential: { token: 'sess', email: 'a@example.com', orgId: 'org_1', signedInAt: '' },
    gadgetKey: 'social_localization',
    title: 'Social Content',
    fetcher: async (url, init) => {
      seen = { url, init };
      return {
        ok: true,
        status: 201,
        json: async () => ({
          data: { devToken: 'dev-token', workspaceId: 'chat_1', expiresAtMs: 1_770_000_000_000, title: '[gadget-dev] Social Content' }
        })
      };
    }
  });

  assert.equal(seen.url, `${DEFAULT_API_ORIGIN}/v2/gadget-dev/sessions`);
  assert.equal(seen.init.headers.authorization, 'Bearer sess');
  assert.equal(seen.init.headers[ACTIVE_ORG_HEADER], 'org_1');
  assert.deepEqual(JSON.parse(seen.init.body), { gadgetKey: 'social_localization', title: 'Social Content' });
  assert.equal(session.devToken, 'dev-token');
  assert.equal(session.workspaceId, 'chat_1');
});

test('refuses display text where a gadget key belongs, before any request', async () => {
  let called = false;
  await assert.rejects(
    startDevSession({
      credential: { token: 't', email: 'a@example.com', signedInAt: '' },
      gadgetKey: 'Social Content',
      fetcher: async () => { called = true; return { ok: true, status: 201, json: async () => ({}) }; }
    }),
    /snake_case/
  );
  assert.equal(called, false);
});

test('a 401 says to sign in again rather than reporting a mint failure', async () => {
  const failure = await startDevSession({
    credential: { token: 'stale', email: 'a@example.com', signedInAt: '' },
    gadgetKey: 'notes',
    fetcher: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Authentication required.' } }) })
  }).catch((error) => error);
  assert.match(failure.message, /bot-dev login/);
});

test("hands a host generic environment names, not one gadget spelling", () => {
  const env = devSessionEnv({
    devToken: 'dev-token',
    workspaceId: 'chat_1',
    expiresAtMs: 0,
    apiOrigin: 'https://api.agenticos.hk'
  });
  assert.deepEqual(env, {
    AGENTICOS_API_ORIGIN: 'https://api.agenticos.hk',
    AGENTICOS_GADGET_DEV_TOKEN: 'dev-token',
    AGENTICOS_GADGET_DEV_WORKSPACE_ID: 'chat_1'
  });
});
