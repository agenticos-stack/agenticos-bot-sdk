import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DoorRefusal, refuse, isRefusal, doorFailureResponse, createDoorRuntime, grantReceiptOutcome
} from '../src/doors.mjs';
import { attachHostEvents } from '../src/host-events.mjs';
import {
  PRODUCTION_API_ORIGINS, assertLocalApiOrigin, assertRemoteApiOrigin,
  assertLocalFrontendOrigin, assertGadgetDevWorkspaceId, agentSocketUrl
} from '../src/origins.mjs';
import { assertNoSdkRedefinitions } from '../src/redefinitions.mjs';
import {
  readDeveloperKey, assertDeveloperKey, mintGadgetDevSession, describeExpiry
} from '../src/session.mjs';

test('a refusal reads refused; every other error reads unknown through the router response', async () => {
  const refused = refuse('That permission has not been granted in this conversation.', 'not_granted');
  assert.ok(refused instanceof DoorRefusal);
  assert.equal(isRefusal(refused), true);
  assert.equal(isRefusal(new Error('lost')), false);
  const denied = await doorFailureResponse(refused, 'fallback').json();
  assert.equal(denied.error.certainty, 'refused');
  assert.equal(denied.error.code, 'not_granted');
  const unknown = doorFailureResponse(new Error('transport lost'), 'fallback');
  assert.equal(unknown.status, 502);
  assert.equal((await unknown.json()).error.certainty, 'unknown');
});

test('grant starts the saved door; activate starts only a listed key and never writes consent', async () => {
  const calls = [];
  const agent = {
    grantDoor: async (input) => ({ requirementKey: input.requirementKey, persistedToAgent: false }),
    grantedDoorKeys: async () => ['metered_fetch']
  };
  const activateRuntime = async (force, key) => { calls.push([force, key]); return { status: 'ready' }; };
  const runtime = createDoorRuntime({ agent, activateRuntime });
  const granted = await runtime.grant({ requirementKey: 'metered_fetch' }, 'cred');
  assert.equal(granted.runtime.status, 'ready');
  const activated = await runtime.activate({ requirementKey: 'metered_fetch' });
  assert.equal(activated.requirementKey, 'metered_fetch');
  assert.deepEqual(calls, [[false, 'metered_fetch'], [true, 'metered_fetch']]);
  await assert.rejects(runtime.activate({ requirementKey: 'not_listed' }), /not been granted/);
});

const ok = (bodyText) => ({ ok: true, status: 200, bodyText });

test('grantReceiptOutcome: explicit runtime answers only; anything unreadable is unconfirmed', () => {
  assert.equal(grantReceiptOutcome(ok(JSON.stringify({ data: { runtime: { status: 'ready' } } }))).outcome, 'activated');
  assert.equal(grantReceiptOutcome(ok(JSON.stringify({ data: { runtime: { status: 'unchanged' } } }))).outcome, 'activated');
  assert.deepEqual(
    grantReceiptOutcome(ok(JSON.stringify({ data: { runtime: { status: 'refresh_failed', message: 'isolate failed' } } }))),
    { outcome: 'activation_failed', message: 'isolate failed' });
  for (const body of ['{not json', '', '   ', 'null', JSON.stringify({ data: {} }), JSON.stringify({ data: { runtime: { status: 'starting' } } })]) {
    assert.equal(grantReceiptOutcome(ok(body)).outcome, 'unconfirmed', `body ${JSON.stringify(body)}`);
  }
  assert.deepEqual(
    grantReceiptOutcome({ ok: false, status: 409, bodyText: JSON.stringify({ error: { message: 'Not granted.', code: 'not_granted', certainty: 'refused' } }) }),
    { outcome: 'denied', message: 'Not granted.' });
  // An explained 4xx without certainty refused (older router) may have saved consent.
  assert.equal(grantReceiptOutcome({ ok: false, status: 409, bodyText: JSON.stringify({ error: { message: 'lost' } }) }).outcome, 'unconfirmed');
  assert.equal(grantReceiptOutcome({ ok: false, status: 502, bodyText: JSON.stringify({ error: { message: 'x', certainty: 'refused' } }) }).outcome, 'unconfirmed');
});

function fakeEventSource() {
  const instances = [];
  class FakeEventSource {
    constructor(url) { this.url = url; this.closed = false; instances.push(this); }
    close() { this.closed = true; }
  }
  return { FakeEventSource, instances };
}

test('each successful open, including a reconnection, asks the canvas to reconcile; a replaced stream is silent', () => {
  const { FakeEventSource, instances } = fakeEventSource();
  const posted = [];
  const port = { postMessage: (m) => posted.push(m) };
  const first = attachHostEvents({ EventSourceImpl: FakeEventSource, getPort: () => port, port });
  const second = attachHostEvents({ EventSourceImpl: FakeEventSource, getPort: () => port, port, previous: first });
  assert.equal(instances[0].closed, true);
  instances[1].onopen();
  instances[1].onmessage({ data: JSON.stringify({ type: 'generated_image' }) });
  instances[1].onmessage({ data: '{not json' });
  instances[1].onopen();
  assert.deepEqual(posted.map((m) => m.event.type), ['reconnected', 'generated_image', 'reconnected']);
  instances[0].onopen?.();
  assert.equal(posted.length, 3);
  second.close();
  instances[1].onopen?.();
  assert.equal(posted.length, 3);
});

test('origin assertions: loopback defaults, caller-declared hostnames, and the caller-named env var', () => {
  assert.doesNotThrow(() => assertLocalApiOrigin('http://127.0.0.1:8787'));
  assert.doesNotThrow(() => assertRemoteApiOrigin('https://staging-api.agenticos.hk'));
  assert.throws(() => assertRemoteApiOrigin('http://127.0.0.1:8787'), /production preview/);
  assert.throws(() => assertLocalApiOrigin('https://api.agenticos.hk'), /loopback/);
  assert.equal(PRODUCTION_API_ORIGINS.length, 2);
  // A bot's gateway name is caller-supplied, never built into the package.
  assert.throws(() => assertLocalFrontendOrigin('http://email.localhost:18000'), /local frontend origin/);
  assert.doesNotThrow(() => assertLocalFrontendOrigin('http://email.localhost:18000', ['email.localhost']));
  assert.doesNotThrow(() => assertLocalFrontendOrigin('http://localhost:5174'));
  assert.throws(() => assertLocalFrontendOrigin('https://localhost:5174', ['email.localhost']), /local frontend origin/);
  const workspaceId = 'chat_' + crypto.randomUUID();
  assert.doesNotThrow(() => assertGadgetDevWorkspaceId(workspaceId, 'EMAIL_CAMPAIGN_DEV_WORKSPACE_ID'));
  assert.throws(() => assertGadgetDevWorkspaceId('workspace_123', 'EMAIL_CAMPAIGN_DEV_WORKSPACE_ID'), /EMAIL_CAMPAIGN_DEV_WORKSPACE_ID must be the chat_/);
  const socket = agentSocketUrl('https://api.agenticos.hk', workspaceId, 'ticket/1');
  assert.equal(socket, `wss://api.agenticos.hk/v2/workspaces/${workspaceId}/rpc?ticket=ticket%2F1`);
});

test('assertNoSdkRedefinitions flags a local copy and passes once the name is imported', () => {
  const sdkExports = new Map([
    ['createRpc', '@agenticos-dev/bot-shell/client/rpc'],
    ['createEl', '@agenticos-dev/bot-shell/client/elements'],
    ['createLocalSession', '@agenticos-dev/bot-testkit']
  ]);
  const forked = {
    'scripts/dom.mjs': 'export function createEl(tag, attrs) { return document.createElement(tag); }\n',
    'scripts/rpc.mjs': "import { createRpc } from '@agenticos-dev/bot-shell/client/rpc';\nexport { createRpc };\n"
  };
  // A re-exported SDK name is adoption; the reimplemented createEl is the fork.
  assert.throws(() => assertNoSdkRedefinitions({ files: forked, sdkExports }), /dom\.mjs declares createEl/);
  const adopted = {
    'scripts/dom.mjs': "export { createEl } from '@agenticos-dev/bot-shell/client/elements';\n",
    'scripts/local.mjs': 'const helper = () => true;\nexport function ownThing() { return helper(); }\n'
  };
  assert.doesNotThrow(() => assertNoSdkRedefinitions({ files: adopted, sdkExports }));
});

test('developer key mint: shape-checked before the network, key never in an error', async () => {
  assert.equal(readDeveloperKey('  ag_mcp_x  '), 'ag_mcp_x');
  assert.equal(readDeveloperKey('   '), null);
  assert.equal(readDeveloperKey(undefined), null);
  assert.throws(() => assertDeveloperKey('not-a-key', 'SOCIAL_CONTENT_DEV_KEY'), /SOCIAL_CONTENT_DEV_KEY must be a personal access token/);
  assert.doesNotThrow(() => assertDeveloperKey('ag_mcp_' + 'a'.repeat(64), 'SOCIAL_CONTENT_DEV_KEY'));
  const key = 'ag_mcp_' + 'b'.repeat(64);
  const requests = [];
  const fetcher = async (url, init) => {
    requests.push({ url, authorization: init.headers.authorization, body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ data: { devToken: 'dt', workspaceId: 'chat_x', expiresAtMs: 123 } }) };
  };
  const session = await mintGadgetDevSession({ apiOrigin: 'https://api.agenticos.hk/', developerKey: key, envVar: 'SOCIAL_CONTENT_DEV_KEY', gadgetKey: 'social_content', fetcher });
  assert.deepEqual(session, { devToken: 'dt', workspaceId: 'chat_x', expiresAtMs: 123 });
  assert.equal(requests[0].url, 'https://api.agenticos.hk/v2/gadget-dev/sessions');
  assert.equal(requests[0].authorization, 'Bearer ' + key);
  await assert.rejects(
    mintGadgetDevSession({ apiOrigin: 'https://api.agenticos.hk', developerKey: key, gadgetKey: 'x', fetcher: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'expired' } }) }) }),
    /failed \(401\): expired/);
  assert.equal(describeExpiry(123), new Date(123).toISOString());
  assert.equal(describeExpiry(NaN), 'unknown');
});
