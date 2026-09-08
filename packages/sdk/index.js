/**
 * Framework-neutral gadget transport primitives.
 *
 * This module intentionally contains no network, auth, Cloudflare, or
 * platform imports. A host supplies the handlers; the fixture transport never
 * discovers or falls back to a live host.
 */

export const GADGET_TRANSPORT_PROTOCOL = "agenticos.gadget.transport.v1";

/**
 * A chat fixture bound to one host-resolved conversation. It owns no history,
 * reconnect loop or agent. Changing identity requires closing this adapter
 * and creating another; old subscriptions and pending calls are then disposed.
 */
export function createFixtureChatAdapter({ context, handlers = {} } = {}) {
  if (!context || ![context.workspaceId, context.conversationId].every(
    value => typeof value === "string" && value.trim().length > 0
  )) throw new TypeError("A host-resolved workspace and conversation are required.");
  const identity = Object.freeze({
    workspaceId: context.workspaceId,
    conversationId: context.conversationId
  });
  const supplied = handlerMap(handlers);
  const allowed = new Map();
  for (const method of ["loadHistory", "send", "stop", "answer"]) {
    const handler = supplied.get(method);
    if (handler) allowed.set(method, (args, hostContext) => handler(args[0], identity, hostContext));
  }
  const transport = createFixtureTransport({ handlers: allowed });
  const call = (method, input, options) => transport.call({
    protocolVersion: GADGET_TRANSPORT_PROTOCOL,
    method,
    args: [input],
    context: {
      protocolVersion: GADGET_TRANSPORT_PROTOCOL,
      selected: input?.selected
    }
  }, options);
  return {
    mode: "fixture",
    context: identity,
    loadHistory: (input = {}, options) => {
      if (!isRecord(input) ||
          (input.cursor !== undefined && !nonEmptyString(input.cursor)) ||
          (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit <= 0))) {
        return Promise.resolve(refusal("invalid_request", "History requires an optional non-empty cursor and positive safe-integer limit."));
      }
      return call("loadHistory", input, options);
    },
    send: (input, options) => {
      if (!isRecord(input) || !nonEmptyString(input.text) ||
          (input.clientMessageId !== undefined && !nonEmptyString(input.clientMessageId))) {
        return Promise.resolve(refusal("invalid_request", "Chat text and any supplied client message ID must be non-empty strings."));
      }
      return call("send", input, options);
    },
    stop: (options) => call("stop", {}, options),
    answer: (input, options) => {
      if (!isRecord(input) || !nonEmptyString(input.actionId) || typeof input.approve !== "boolean") {
        return Promise.resolve(refusal("invalid_request", "An action ID and explicit approval decision are required."));
      }
      return call("answer", input, options);
    },
    subscribe: transport.subscribe,
    emit: transport.emit,
    close: transport.close,
    get closed() { return transport.closed; }
  };
}

const PROTOTYPE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const refusal = (code, message, extra = {}) => ({
  ok: false,
  code,
  message,
  ...extra
});

function protocolRefusal() {
  return refusal(
    "unsupported_protocol_version",
    `Unsupported gadget transport protocol; expected ${GADGET_TRANSPORT_PROTOCOL}.`
  );
}

function handlerMap(input) {
  if (input === undefined) return new Map();
  if (input instanceof Map) {
    const output = new Map();
    for (const [name, handler] of input) {
      if (typeof name !== "string" || PROTOTYPE_KEYS.has(name)) continue;
      if (typeof handler === "function") output.set(name, handler);
    }
    return output;
  }
  if (input === null || typeof input !== "object") return new Map();
  const output = new Map();
  for (const name of Object.keys(input)) {
    if (PROTOTYPE_KEYS.has(name)) continue;
    const handler = input[name];
    if (typeof handler === "function") output.set(name, handler);
  }
  return output;
}

function abortRefusal() {
  return refusal(
    "cancelled",
    "The fixture call was cancelled. Cancellation does not claim server rollback or stop a host operation."
  );
}

function validContext(context) {
  if (context.gadgetId !== undefined && (typeof context.gadgetId !== "string" || !context.gadgetId.trim())) return false;
  if (context.revision !== undefined && (!Number.isSafeInteger(context.revision) || context.revision < 0)) return false;
  if (context.selected === undefined) return true;
  if (!Array.isArray(context.selected)) return false;
  return context.selected.every((record) =>
    isRecord(record) &&
    typeof record.type === "string" && record.type.trim().length > 0 &&
    typeof record.id === "string" && record.id.trim().length > 0 &&
    (record.revision === undefined || (Number.isSafeInteger(record.revision) && record.revision >= 0))
  );
}

function isRecord(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validResult(result) {
  if (!isRecord(result) || !Object.hasOwn(result, "ok") || typeof result.ok !== "boolean") return false;
  if (result.ok) {
    return result.revision === undefined || (Number.isSafeInteger(result.revision) && result.revision >= 0);
  }
  return nonEmptyString(result.code) && nonEmptyString(result.message) &&
    (result.pending === undefined || typeof result.pending === "boolean") &&
    (result.retryable === undefined || typeof result.retryable === "boolean") &&
    (result.correlationId === undefined || nonEmptyString(result.correlationId));
}

/**
 * A local-only transport for tests and playground fixtures.
 *
 * Handlers return a complete GadgetCallResult. The result is returned without
 * reinterpretation, including pending/refused results. Unknown methods are
 * refused and never dynamically invoked.
 */
export function createFixtureTransport(options = {}) {
  const handlers = handlerMap(options.handlers);
  const subscribers = new Set();
  const inFlightClosers = new Set();
  let closed = false;

  const transport = {
    async call(request, callOptions = {}) {
      if (closed) return refusal("transport_closed", "The gadget transport is closed.");
      if (!isRecord(request)) {
        return refusal("invalid_request", "A gadget call request is required.");
      }
      if (request.protocolVersion !== GADGET_TRANSPORT_PROTOCOL) return protocolRefusal();
      if (!nonEmptyString(request.method) || PROTOTYPE_KEYS.has(request.method)) {
        return refusal("invalid_method", "A safe gadget method name is required.");
      }
      if (request.args !== undefined && !Array.isArray(request.args)) {
        return refusal("invalid_request", "Gadget call args must be an array.");
      }
      if (request.context !== undefined && (request.context === null || typeof request.context !== "object" || Array.isArray(request.context))) {
        return refusal("invalid_request", "Gadget call context must be an object.");
      }
      if (request.context?.protocolVersion !== undefined && request.context.protocolVersion !== GADGET_TRANSPORT_PROTOCOL) {
        return protocolRefusal();
      }
      let stableArgs;
      let stableContext;
      let stableRequest;
      try {
        stableArgs = structuredClone(request.args ?? []);
        stableContext = {
          ...structuredClone(request.context ?? {}),
          protocolVersion: GADGET_TRANSPORT_PROTOCOL
        };
        stableRequest = { ...structuredClone(request), args: stableArgs, context: stableContext };
      } catch {
        return refusal("invalid_request", "Gadget call values must be serializable.");
      }
      if (!validContext(stableContext)) {
        return refusal("invalid_request", "Selected records must have non-empty type/id and a non-negative revision.");
      }
      const handler = handlers.get(request.method);
      if (!handler) return refusal("unknown_method", `The fixture does not provide ${request.method}.`);

      const signal = callOptions?.signal;
      if (signal?.aborted) return abortRefusal();

      let abortListener;
      let closeCall;
      const aborted = new Promise((resolve) => {
        abortListener = () => resolve(abortRefusal());
        signal?.addEventListener("abort", abortListener, { once: true });
      });
      const closedDuringCall = new Promise((resolve) => {
        closeCall = () => resolve(refusal("transport_closed", "The gadget transport is closed."));
        inFlightClosers.add(closeCall);
      });
      try {
        // Promise.race only settles the caller's promise. It cannot pretend to
        // cancel arbitrary host code or roll back a side effect.
        return await Promise.race([
          Promise.resolve().then(() => {
            if (signal?.aborted) return abortRefusal();
            if (closed) return refusal("transport_closed", "The gadget transport is closed.");
            return handler(stableArgs, stableContext, stableRequest);
          }),
          aborted,
          closedDuringCall
        ]).then((result) => validResult(result) ? result : refusal("fixture_handler_invalid_result", "Fixture handlers must return a GadgetCallResult."));
      } catch (error) {
        return refusal("fixture_handler_failed", error instanceof Error ? error.message : String(error));
      } finally {
        signal?.removeEventListener("abort", abortListener);
        inFlightClosers.delete(closeCall);
      }
    },

    subscribe(listener) {
      if (closed || typeof listener !== "function") return () => {};
      subscribers.add(listener);
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        subscribers.delete(listener);
      };
    },

    /** Emit a fixture event to current subscribers; never sends anything live. */
    emit(event) {
      if (closed) return;
      for (const listener of [...subscribers]) {
        if (closed) break;
        if (subscribers.has(listener)) listener(event);
      }
    },

    close() {
      if (closed) return;
      closed = true;
      for (const settle of [...inFlightClosers]) settle();
      inFlightClosers.clear();
      subscribers.clear();
    },

    get closed() {
      return closed;
    },

    mode: "fixture"
  };
  return transport;
}
