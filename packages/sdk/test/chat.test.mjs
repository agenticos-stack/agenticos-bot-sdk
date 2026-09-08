import test from "node:test";
import assert from "node:assert/strict";
import { createFixtureChatAdapter } from "../index.js";

const identity = { workspaceId: "fixture-workspace", conversationId: "fixture-conversation" };

test("chat fixture binds detached identity and denies unconfigured operations", async () => {
  const context = { ...identity };
  const chat = createFixtureChatAdapter({ context });
  context.conversationId = "another";
  assert.deepEqual(chat.context, identity);
  assert.equal(Object.isFrozen(chat.context), true);
  assert.equal(chat.mode, "fixture");
  for (const result of await Promise.all([
    chat.loadHistory(), chat.send({ text: "Hello" }), chat.stop(),
    chat.answer({ actionId: "ask", approve: true })
  ])) assert.equal(result.code, "unknown_method");
  chat.close();
  assert.throws(() => createFixtureChatAdapter({ context: { ...identity, workspaceId: " " } }), TypeError);
});

test("chat delegates detached selections and preserves pending/denied receipts", async () => {
  let received;
  const pending = { ok: false, code: "approval_pending", message: "Simulated approval", pending: true };
  const denied = { ok: false, code: "forbidden", message: "Simulated refusal" };
  const chat = createFixtureChatAdapter({ context: identity, handlers: {
    send: (input, bound, host) => { received = { input, bound, host }; return pending; },
    answer: () => denied
  } });
  const input = { text: "Refine", selected: [{ type: "draft", id: "one", revision: 3 }] };
  const sent = chat.send(input);
  input.selected[0].revision = 4;
  assert.deepEqual(await sent, pending);
  assert.equal(received.input.selected[0].revision, 3);
  assert.equal(received.host.selected[0].revision, 3);
  assert.deepEqual(received.bound, identity);
  assert.deepEqual(await chat.answer({ actionId: "ask", approve: false }), denied);
  assert.equal((await chat.send({ text: " " })).code, "invalid_request");
  assert.equal((await chat.send({ text: "Hi", selected: [{ type: "draft", id: "one", revision: -1 }] })).code, "invalid_request");
  assert.equal((await chat.answer({ actionId: "ask", approve: "yes" })).code, "invalid_request");
  chat.close();
});

test("chat does not turn a void host invocation into a success receipt", async () => {
  const chat = createFixtureChatAdapter({ context: identity, handlers: { send: () => undefined } });
  assert.equal((await chat.send({ text: "Hello" })).code, "fixture_handler_invalid_result");
  chat.close();
});

test("malformed history pagination and send identities never dispatch to host handlers", async () => {
  let calls = 0;
  const handler = () => { calls++; return { ok: true }; };
  const chat = createFixtureChatAdapter({ context: identity, handlers: { loadHistory: handler, send: handler } });
  try {
    for (const input of [null, "all", [], { cursor: " " }, { cursor: 1 }, { limit: 0 }, { limit: -1 }, { limit: 1.5 }, { limit: Infinity }, { limit: Number.MAX_SAFE_INTEGER + 1 }]) {
      assert.equal((await chat.loadHistory(input)).code, "invalid_request");
    }
    for (const clientMessageId of [" ", 1, null, false]) {
      assert.equal((await chat.send({ text: "Hello", clientMessageId })).code, "invalid_request");
    }
    assert.equal(calls, 0);
    assert.equal((await chat.loadHistory({ cursor: "page-2", limit: 20 })).ok, true);
    assert.equal((await chat.send({ text: "Hello", clientMessageId: "message-1" })).ok, true);
    assert.equal(calls, 2);
  } finally {
    chat.close();
  }
});

test("chat refuses malformed pending and retryable receipts", async () => {
  const chat = createFixtureChatAdapter({ context: identity, handlers: {
    send: () => ({ ok: false, code: "pending", message: "Wait", pending: "false" }),
    answer: () => ({ ok: false, code: "denied", message: "No", retryable: "true" })
  } });
  try {
    assert.equal((await chat.send({ text: "Hello" })).code, "fixture_handler_invalid_result");
    assert.equal((await chat.answer({ actionId: "ask", approve: true })).code, "fixture_handler_invalid_result");
  } finally {
    chat.close();
  }
});

test("closing old chat disposes events and settles its pending call without touching replacement", async () => {
  const old = createFixtureChatAdapter({ context: identity, handlers: { send: () => new Promise(() => {}) } });
  const seen = [];
  const dispose = old.subscribe(event => seen.push(event));
  old.emit("before");
  const pending = old.send({ text: "Hello" });
  await Promise.resolve();
  old.close();
  old.close();
  const next = createFixtureChatAdapter({ context: { ...identity, conversationId: "next" } });
  old.emit("stale");
  dispose();
  assert.equal((await pending).code, "transport_closed");
  assert.deepEqual(seen, ["before"]);
  assert.equal(next.closed, false);
  assert.equal((await old.loadHistory()).code, "transport_closed");
  next.close();
});

test("chat cancellation settles caller without claiming operation rollback", async () => {
  const chat = createFixtureChatAdapter({ context: identity, handlers: { send: () => new Promise(() => {}) } });
  const controller = new AbortController();
  const pending = chat.send({ text: "Hello" }, { signal: controller.signal });
  controller.abort();
  const result = await pending;
  assert.equal(result.code, "cancelled");
  assert.match(result.message, /does not claim server rollback/);
  chat.close();
});
