import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import {
  ACTIVE_ORG_HEADER, DEFAULT_API_ORIGIN, archiveDevWorkspace, authHeaders, clearCredential, completeSignIn,
  credentialsPath, defaultGadgetDevTitle, devSessionEnv, forgetDevSession, grantDevDoors, mintBanner,
  parseGrantKeys, readCredential, requestSignInCode, startDevSession, studioConversationUrl, writeCredential
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

test('rejoins a live session instead of minting another room', async () => {
  const env = await sandbox();
  const credential = { token: 'sess', email: 'a@example.com', orgId: 'org_1', signedInAt: '' };
  let mints = 0;
  const fetcher = async () => {
    mints += 1;
    return {
      ok: true,
      status: 201,
      json: async () => ({
        data: { devToken: 'dev-token', workspaceId: 'chat_1', expiresAtMs: Date.now() + 8 * 3600_000 }
      })
    };
  };

  const first = await startDevSession({ credential, gadgetKey: 'social_localization', env, fetcher });
  assert.equal(first.reused, false);
  assert.equal(mints, 1);

  // A restart inside the session's own lifetime is the common case, and every
  // mint leaves a durable conversation an owner has to find and archive.
  const second = await startDevSession({ credential, gadgetKey: 'social_localization', env, fetcher });
  assert.equal(second.reused, true);
  assert.equal(second.workspaceId, 'chat_1');
  assert.equal(mints, 1);
});

test('--fresh mints a new room even when one is remembered', async () => {
  const env = await sandbox();
  const credential = { token: 'sess', email: 'a@example.com', orgId: 'org_1', signedInAt: '' };
  let mints = 0;
  const fetcher = async () => {
    mints += 1;
    return {
      ok: true, status: 201,
      json: async () => ({
        data: { devToken: 't', workspaceId: `chat_${mints}`, expiresAtMs: Date.now() + 8 * 3600_000 }
      })
    };
  };
  await startDevSession({ credential, gadgetKey: 'notes', env, fetcher });
  const fresh = await startDevSession({ credential, gadgetKey: 'notes', env, fetcher, fresh: true });
  assert.equal(fresh.reused, false);
  assert.equal(fresh.workspaceId, 'chat_2');
  assert.equal(mints, 2);
});

test('does not rejoin an expired session, and keeps gadgets and orgs apart', async () => {
  const env = await sandbox();
  const credential = { token: 'sess', email: 'a@example.com', orgId: 'org_1', signedInAt: '' };
  let mints = 0;
  const fetcher = async () => {
    mints += 1;
    return {
      ok: true, status: 201,
      json: async () => ({
        data: { devToken: 't', workspaceId: `chat_${mints}`, expiresAtMs: Date.now() + 8 * 3600_000 }
      })
    };
  };

  await startDevSession({ credential, gadgetKey: 'notes', env, fetcher });
  // Expired: a session that dies mid-run is worse than minting one.
  const later = () => Date.now() + 9 * 3600_000;
  const afterExpiry = await startDevSession({ credential, gadgetKey: 'notes', env, fetcher, now: later });
  assert.equal(afterExpiry.reused, false);

  // A different gadget, and a different organization, are different rooms.
  await startDevSession({ credential, gadgetKey: 'other_gadget', env, fetcher });
  const otherOrg = { ...credential, orgId: 'org_2' };
  const inOtherOrg = await startDevSession({ credential: otherOrg, gadgetKey: 'notes', env, fetcher });
  assert.equal(inOtherOrg.reused, false);
  assert.equal(mints, 4);
});

test('forgetting a session makes the next run start a fresh room', async () => {
  const env = await sandbox();
  const credential = { token: 'sess', email: 'a@example.com', orgId: 'org_1', signedInAt: '' };
  let mints = 0;
  const fetcher = async () => {
    mints += 1;
    return {
      ok: true, status: 201,
      json: async () => ({ data: { devToken: 't', workspaceId: `chat_${mints}`, expiresAtMs: Date.now() + 8 * 3600_000 } })
    };
  };
  await startDevSession({ credential, gadgetKey: 'notes', env, fetcher });
  assert.equal(await forgetDevSession({ gadgetKey: 'notes', orgId: 'org_1', env }), true);
  assert.equal(await forgetDevSession({ gadgetKey: 'notes', orgId: 'org_1', env }), false);
  const next = await startDevSession({ credential, gadgetKey: 'notes', env, fetcher });
  assert.equal(next.reused, false);
});

test('two checkouts of the same gadget are two developments, not one shared room', async () => {
  /*
   * The sessions file is per MACHINE, not per developer or per terminal, and
   * several agents share one box here. Keyed only by
   * (apiOrigin, gadgetKey, orgId), one session running `--fresh` minted a new
   * conversation and silently repointed everyone else's key — no error, and a
   * banner reading "Rejoined the session already open for this gadget" either
   * way. Door grants are per conversation, so the next grant landed on a room
   * nobody was running.
   */
  const env = await sandbox();
  const credential = { token: 'sess', email: 'a@example.com', orgId: 'org_1', signedInAt: '' };
  let mints = 0;
  const fetcher = async () => {
    mints += 1;
    return {
      ok: true, status: 201,
      json: async () => ({
        data: { devToken: 't', workspaceId: `chat_${mints}`, expiresAtMs: Date.now() + 8 * 3600_000 }
      })
    };
  };
  const start = (projectDir) =>
    startDevSession({ credential, gadgetKey: 'social_localization', env, fetcher, projectDir });

  const a = await start('/work/checkout-a');
  const b = await start('/work/checkout-b');
  assert.equal(a.workspaceId, 'chat_1');
  assert.equal(b.workspaceId, 'chat_2');
  assert.equal(b.reused, false, 'a second checkout must not adopt the first checkout\'s room');

  // Each directory still rejoins its OWN room, which is the behaviour that
  // stops every restart leaving a durable conversation behind.
  assert.deepEqual(
    [(await start('/work/checkout-a')).workspaceId, (await start('/work/checkout-b')).workspaceId],
    ['chat_1', 'chat_2']
  );
  assert.equal(mints, 2);
});

test('a session remembered before this change is still rejoined once, then re-keyed', async () => {
  // Upgrading the devkit must not orphan a room a developer is mid-session on.
  const env = await sandbox();
  const credential = { token: 'sess', email: 'a@example.com', orgId: 'org_1', signedInAt: '' };
  let mints = 0;
  const fetcher = async () => {
    mints += 1;
    return {
      ok: true, status: 201,
      json: async () => ({ data: { devToken: 't', workspaceId: `chat_${mints}`, expiresAtMs: Date.now() + 8 * 3600_000 } })
    };
  };

  // Write the pre-change shape by hand: no project directory in the key.
  const path = join(env.XDG_CONFIG_HOME, 'agenticos', 'dev-sessions.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({
    'https://api.agenticos.hk|social_localization|org_1': {
      devToken: 'legacy', workspaceId: 'chat_legacy',
      expiresAtMs: Date.now() + 8 * 3600_000, apiOrigin: 'https://api.agenticos.hk'
    }
  }));

  const rejoined = await startDevSession({
    credential, gadgetKey: 'social_localization', env, fetcher, projectDir: '/work/checkout-a'
  });
  assert.equal(rejoined.workspaceId, 'chat_legacy');
  assert.equal(rejoined.reused, true);
  assert.equal(mints, 0, 'the live room is rejoined, not replaced');
});

test('social_localization defaults to the product name, not the gadget key', () => {
  assert.equal(defaultGadgetDevTitle('social_localization'), 'Social Content (dev)');
  assert.equal(defaultGadgetDevTitle('notes'), undefined);
});

test('parseGrantKeys splits a comma list and drops empties', () => {
  assert.deepEqual(parseGrantKeys('metered_fetch'), ['metered_fetch']);
  assert.deepEqual(parseGrantKeys('metered_fetch, social'), ['metered_fetch', 'social']);
  assert.deepEqual(parseGrantKeys('  ,metered_fetch,  '), ['metered_fetch']);
  assert.deepEqual(parseGrantKeys(''), []);
});

test('prints the Studio conversation URL for the API origin that minted it', () => {
  assert.equal(
    studioConversationUrl('https://api.agenticos.hk', 'chat_5647cc60-4991-4d36-8bca-3dd6e2b4370a'),
    'https://app.agenticos.hk/chat/chat_5647cc60-4991-4d36-8bca-3dd6e2b4370a'
  );
  assert.equal(
    studioConversationUrl('https://staging-api.agenticos.hk', 'chat_1'),
    'https://staging-app.agenticos.hk/chat/chat_1'
  );
});

test('the mint banner names the URL, the TTL, and what to do when it lapses', () => {
  const banner = mintBanner({
    workspaceId: 'chat_1',
    apiOrigin: 'https://api.agenticos.hk',
    expiresAtMs: Date.parse('2026-09-12T23:12:23.000Z'),
    reused: false
  });
  assert.match(banner, /https:\/\/app\.agenticos\.hk\/chat\/chat_1/);
  assert.match(banner, /2026-09-12T23:12:23.000Z/);
  assert.match(banner, /8 hours/);
  assert.match(banner, /bot-dev dev/);
  assert.equal(banner.includes('dev-token'), false);
});

test('grants named doors on the minted room as the signed-in developer', async () => {
  let seen;
  await grantDevDoors({
    credential: { token: 'sess', orgId: 'org_1' },
    workspaceId: 'chat_1',
    keys: ['metered_fetch'],
    fetcher: async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 201, json: async () => ({ data: { grant: { requirementKey: 'metered_fetch' } } }) };
    }
  });
  assert.equal(seen.url, `${DEFAULT_API_ORIGIN}/v2/workspaces/chat_1/door-grants`);
  assert.equal(seen.init.headers.authorization, 'Bearer sess');
  assert.equal(seen.init.headers[ACTIVE_ORG_HEADER], 'org_1');
  assert.deepEqual(JSON.parse(seen.init.body), { requirementKey: 'metered_fetch', persistToAgent: false });
});

test('a grant failure names the door and the status, not a token', async () => {
  const failure = await grantDevDoors({
    credential: { token: 'sess' },
    workspaceId: 'chat_1',
    keys: ['metered_fetch'],
    fetcher: async () => ({
      ok: false, status: 403,
      json: async () => ({ error: { message: 'not a member' } })
    })
  }).catch((error) => error);
  assert.match(failure.message, /metered_fetch/);
  assert.match(failure.message, /403/);
  assert.equal(failure.message.includes('sess'), false);
});

test('archives the minted room so it leaves the sidebar', async () => {
  let seen;
  await archiveDevWorkspace({
    credential: { token: 'sess', orgId: 'org_1' },
    workspaceId: 'chat_1',
    fetcher: async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 200, json: async () => ({ data: { archived: true } }) };
    }
  });
  assert.equal(seen.url, `${DEFAULT_API_ORIGIN}/v2/workspaces/chat_1/archive`);
  assert.deepEqual(JSON.parse(seen.init.body), { archived: true });
});

