import test from "node:test";
import assert from "node:assert/strict";
import { GADGET_TRANSPORT_PROTOCOL, createFixtureTransport } from "../index.js";

const request = (method, args = []) => ({
  protocolVersion: GADGET_TRANSPORT_PROTOCOL,
  method,
  args,
  context: { protocolVersion: GADGET_TRANSPORT_PROTOCOL, gadgetId: "fixture" }
});

test("malformed context fields cannot reach handlers", async () => {
  let calls = 0;
  const transport = createFixtureTransport({ handlers: { read: () => { calls++; return { ok: true }; } } });
  for (const patch of [{ selected: {} }, { selected: null }, { selected: "all" }, { revision: -1 }, { gadgetId: 42 }, { selected: [{ type: " ", id: "x" }] }, { selected: [Object.assign([], { type: "note", id: "n1" })] }]) {
    const input = request("read");
    input.context = { ...input.context, ...patch };
    assert.equal((await transport.call(input)).code, "invalid_request");
  }
  assert.equal(calls, 0);
});

test("unknown methods are refused and prototype keys cannot dispatch", async () => {
  const transport = createFixtureTransport({
    handlers: {
      read: () => ({ ok: true, value: "ok" }),
      constructor: () => ({ ok: true, value: "unsafe" })
    }
  });
  assert.deepEqual((await transport.call(request("missing"))).code, "unknown_method");
  assert.deepEqual((await transport.call(request("constructor"))).code, "invalid_method");
  assert.deepEqual((await transport.call({ ...request("__proto__") })).code, "invalid_method");
  assert.equal((await transport.call(request(" "))).code, "invalid_method");
  assert.equal((await transport.call(Object.assign([], request("read")))).code, "invalid_request");
});

test("pending and refused handler results are returned unchanged", async () => {
  const pending = { ok: false, code: "pending", message: "waiting", pending: true, correlationId: "c1" };
  const refused = { ok: false, code: "denied", message: "no grant", retryable: false };
  const transport = createFixtureTransport({ handlers: new Map([
    ["pending", () => pending],
    ["refused", () => refused]
  ]) });
  assert.strictEqual(await transport.call(request("pending")), pending);
  assert.strictEqual(await transport.call(request("refused")), refused);
});

test("malformed receipt metadata fails closed instead of reaching consumers", async () => {
  const malformed = [
    { ok: false, code: "pending", message: "Waiting", pending: "false" },
    { ok: false, code: "busy", message: "Retry", retryable: 1 },
    { ok: false, code: "busy", message: "Retry", correlationId: " " },
    { ok: false, code: " ", message: "Refused" },
    { ok: false, code: "denied", message: " " },
    ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "3", null].map(revision => ({ ok: true, revision })),
    Object.assign([], { ok: true }),
    Object.assign(new Date(), { ok: true }),
    Object.create({ ok: true })
  ];
  const transport = createFixtureTransport({ handlers: { receipt: ([index]) => malformed[index] } });
  try {
    for (const index of malformed.keys()) {
      assert.equal((await transport.call(request("receipt", [index]))).code, "fixture_handler_invalid_result");
    }
  } finally {
    transport.close();
  }
});

test("valid receipt metadata is preserved without inferring success or replacing host values", async () => {
  const receipts = [
    { ok: true, value: null, revision: 0, changedSinceSeen: { records: ["n1"] } },
    { ok: true, revision: Number.MAX_SAFE_INTEGER },
    { ok: false, code: "pending", message: "Waiting", pending: true, retryable: false, correlationId: "c1", detail: { fixture: true } },
    { ok: false, code: "busy", message: "Retry", pending: false, retryable: true },
    { ok: false, code: "denied", message: "Refused", pending: undefined, retryable: undefined, correlationId: undefined }
  ];
  const transport = createFixtureTransport({ handlers: { receipt: ([index]) => receipts[index] } });
  try {
    for (const [index, receipt] of receipts.entries()) {
      assert.strictEqual(await transport.call(request("receipt", [index])), receipt);
    }
  } finally {
    transport.close();
  }
});

test("unknown protocol versions fail before the supplied handler", async () => {
  let invoked = false;
  const transport = createFixtureTransport({ handlers: { read: () => { invoked = true; return { ok: true }; } } });
  const result = await transport.call({ ...request("read"), protocolVersion: "agenticos.gadget.transport.v999" });
  assert.equal(result.code, "unsupported_protocol_version");
  assert.equal(invoked, false);
});

test("invalid args and conflicting context protocol are refused", async () => {
  const transport = createFixtureTransport({ handlers: { read: () => ({ ok: true }) } });
  assert.equal((await transport.call({ ...request("read"), args: "not-an-array" })).code, "invalid_request");
  assert.equal((await transport.call({ ...request("read"), context: { protocolVersion: "wrong" } })).code, "unsupported_protocol_version");
});

test("an explicitly undefined context protocol is normalized before dispatch", async () => {
  let received;
  const transport = createFixtureTransport({ handlers: {
    read: (_args, context, input) => {
      received = { context, requestContext: input.context };
      return { ok: true };
    }
  } });
  try {
    const result = await transport.call({ ...request("read"), context: { protocolVersion: undefined } });
    assert.equal(result.ok, true);
    assert.equal(received.context.protocolVersion, GADGET_TRANSPORT_PROTOCOL);
    assert.equal(received.requestContext.protocolVersion, GADGET_TRANSPORT_PROTOCOL);
  } finally {
    transport.close();
  }
});

test("closing during event delivery prevents remaining listeners from firing", () => {
  const transport = createFixtureTransport();
  const seen = [];
  transport.subscribe(() => {
    seen.push("first");
    transport.close();
  });
  transport.subscribe(() => seen.push("stale"));
  transport.emit("event");
  assert.deepEqual(seen, ["first"]);
  assert.equal(transport.closed, true);
});

test("disposing a listener during delivery prevents its callback for that event", () => {
  const transport = createFixtureTransport();
  const seen = [];
  transport.subscribe(() => {
    seen.push("first");
    disposeSecond();
  });
  const disposeSecond = transport.subscribe(() => seen.push("disposed"));
  try {
    transport.emit("event");
    assert.deepEqual(seen, ["first"]);
  } finally {
    transport.close();
  }
});

test("abort before and during a call returns cancellation without claiming rollback", async () => {
  const transport = createFixtureTransport({ handlers: {
    slow: async () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, value: "late" }), 30))
  } });
  const before = new AbortController();
  before.abort();
  assert.match((await transport.call(request("slow"), { signal: before.signal })).message, /does not claim server rollback/);

  const during = new AbortController();
  const pending = transport.call(request("slow"), { signal: during.signal });
  during.abort();
  const result = await pending;
  assert.equal(result.code, "cancelled");
  assert.match(result.message, /does not claim server rollback/);
});

test("close is idempotent, closes calls, and disposes subscriptions", async () => {
  const transport = createFixtureTransport({ handlers: { read: () => ({ ok: true, value: 1 }) } });
  let events = 0;
  transport.subscribe(() => { events += 1; });
  const dispose = transport.subscribe(() => { events += 1; });
  dispose();
  dispose();
  transport.emit({ ignored: true });
  assert.equal(events, 1);
  transport.close();
  transport.close();
  assert.equal(transport.closed, true);
  transport.emit({ ignored: true });
  assert.equal(events, 1);
  assert.equal((await transport.call(request("read"))).code, "transport_closed");
  const lateDispose = transport.subscribe(() => { events += 1; });
  lateDispose();
  assert.equal(events, 1);
});

test("fixture handlers are isolated from input mutation and receive context", async () => {
  let seen;
  const transport = createFixtureTransport({ handlers: {
    inspect: (args, context) => { seen = { args, context }; return { ok: true, value: args[0] }; }
  } });
  const args = [{ value: 3 }];
  const context = { protocolVersion: GADGET_TRANSPORT_PROTOCOL, gadgetId: "a", selected: [{ type: "note", id: "n1", revision: 2 }] };
  const originalContext = structuredClone(context);
  const call = transport.call({ ...request("inspect"), args, context });
  args[0].value = 99;
  context.gadgetId = "mutated";
  const result = await call;
  assert.deepEqual(result, { ok: true, value: { value: 3 } });
  assert.notStrictEqual(seen.args, args);
  assert.notStrictEqual(seen.context, context);
  assert.deepEqual(seen.context, originalContext);
});

test("malformed handler results and selected-record context are refused", async () => {
  const transport = createFixtureTransport({ handlers: {
    malformed: () => undefined,
    read: () => ({ ok: true, value: "ok" })
  } });
  assert.equal((await transport.call(request("malformed"))).code, "fixture_handler_invalid_result");
  const badContext = { ...request("read"), context: { protocolVersion: GADGET_TRANSPORT_PROTOCOL, selected: [{ type: "note", id: "", revision: -1 }] } };
  assert.equal((await transport.call(badContext)).code, "invalid_request");
});

test("close settles an in-flight caller while the fixture handler may continue", async () => {
  let handlerFinished = false;
  const transport = createFixtureTransport({ handlers: {
    slow: async () => new Promise((resolve) => setTimeout(() => {
      handlerFinished = true;
      resolve({ ok: true, value: "late" });
    }, 25))
  } });
  const call = transport.call(request("slow"));
  await Promise.resolve();
  transport.close();
  assert.equal((await call).code, "transport_closed");
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(handlerFinished, true);
});
