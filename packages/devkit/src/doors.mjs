/**
 * The door grant contract for a gadget's connected development rig.
 *
 * Three pieces of one flow: certainty vocabulary for what a thrown error
 * means (server side), the grant/activate orchestration, and strict reading
 * of the API's receipt (caller side). Ported from the bots' identical
 * door-certainty.mjs, door-runtime.mjs and grant-receipt.mjs — byte-identical
 * copies in two repos was the fork; this module is the owner.
 */

/**
 * How sure a failed door grant or activation is that nothing happened.
 *
 * `refused` is a known answer before any effect: validation, a door this
 * source never declared, a key the platform does not list as granted, the
 * wrong account, no running session, or an upstream 4xx that explained
 * itself. Everything else — transport loss, an upstream 5xx, a body nobody
 * can read, any error nobody classified — is `unknown`: consent may have been
 * saved. Unclassified is unknown by construction, so a new throw can never
 * read as a denial.
 */
export class DoorRefusal extends Error {
  constructor(message, code = 'refused') {
    super(message);
    this.name = 'DoorRefusal';
    this.code = code;
    this.certainty = 'refused';
  }
}

export function refuse(message, code) {
  return new DoorRefusal(message, code);
}

export function isRefusal(error) {
  return error instanceof Error && error.certainty === 'refused';
}

/**
 * The router's answer for a thrown grant/activation error: 409 with
 * `certainty: "refused"` only for a refusal; 502 with `certainty: "unknown"`
 * otherwise.
 */
export function doorFailureResponse(error, fallback) {
  const message = error instanceof Error && error.message ? error.message : fallback;
  const headers = { 'cache-control': 'no-store' };
  if (isRefusal(error)) {
    return Response.json({ error: { message, code: error.code, certainty: 'refused' } }, { status: 409, headers });
  }
  return Response.json({ error: { message, certainty: 'unknown' } }, { status: 502, headers });
}

/**
 * The door half of the local runtime: consent and activation as separate
 * answers.
 *
 * `grant` records the owner's yes once, then starts the door. A grant that
 * saved but could not start returns `refresh_failed` (the API's own
 * `GrantRuntimeRefresh` vocabulary) instead of throwing. A failed grant keeps
 * its certainty: a refusal from `agent.grantDoor` stays refused, and anything
 * else stays unknown, because consent may already be saved.
 *
 * `activate` is also the recovery path for an unconfirmed grant: it re-reads
 * the platform's authoritative grant list and starts only a key listed there.
 * It never writes or broadens consent.
 *
 * `activateRuntime` is handed the requirement key it is being asked to bring
 * up, not just a force flag: a refresh that finishes without error only
 * proves the refresh ran, never that the requested door ended up in the
 * running spec (an unchanged, still-empty environment "finishes" too). The
 * caller uses the key to check the door is actually there and to report
 * `refresh_failed` — never `ready` — when it is not (F02a).
 */
export function createDoorRuntime({ agent, activateRuntime }) {
  return {
    grant: async (input, credential) => {
      const granted = await agent.grantDoor(input, credential);
      return { ...granted, runtime: await activateRuntime(false, granted.requirementKey) };
    },
    activate: async (input) => {
      const requirementKey = typeof input?.requirementKey === 'string' ? input.requirementKey : '';
      const listed = await agent.grantedDoorKeys();
      if (!Array.isArray(listed)) throw new Error('The platform grant list could not be read.');
      if (!listed.includes(requirementKey)) throw refuse('That permission has not been granted in this conversation.', 'not_granted');
      return { requirementKey, runtime: await activateRuntime(true, requirementKey) };
    }
  };
}

/**
 * What a door grant or activation response means, read strictly.
 *
 * The same contract Studio applies to the API's receipt: only an explicit
 * runtime answer is an answer. HTTP 200 with a body nobody can read, or a
 * receipt with no runtime status, is not "activated" — the permission may or
 * may not be live, so the canvas hears `unconfirmed` and can ask to activate
 * (which verifies before starting anything). Recovery never writes a grant.
 *
 * `response` is `{ ok, status, bodyText }`; the body is parsed here so a
 * malformed body is classified rather than thrown.
 */
export function grantReceiptOutcome(response) {
  let body = null;
  let readable = false;
  if (typeof response?.bodyText === "string" && response.bodyText.trim()) {
    try {
      body = JSON.parse(response.bodyText);
      readable = body !== null && typeof body === "object";
    } catch {
      readable = false;
    }
  }
  const status = Number(response?.status);
  if (!response?.ok) {
    const message = readable && typeof body?.error?.message === "string" ? body.error.message : null;
    // A denial only when the host classified it as a refusal before any
    // effect. A server error, an unreadable body, or an explained 4xx without
    // `certainty: "refused"` (an older router flattened every throw into 409)
    // may have saved consent: unconfirmed, recheckable by activation.
    if (Number.isInteger(status) && status >= 400 && status < 500 && message && body?.error?.certainty === "refused") {
      return { outcome: "denied", message };
    }
    return { outcome: "unconfirmed", message: message ?? "The permission answer could not be confirmed." };
  }
  if (!readable) return { outcome: "unconfirmed", message: "The permission answer could not be read." };
  const runtime = body?.data?.runtime;
  const runtimeStatus = typeof runtime?.status === "string" ? runtime.status : null;
  const message = typeof runtime?.message === "string" ? runtime.message : undefined;
  if (runtimeStatus === "ready" || runtimeStatus === "unchanged") return { outcome: "activated", message };
  if (runtimeStatus === "refresh_failed") return { outcome: "activation_failed", message };
  return { outcome: "unconfirmed", message: "The permission answer did not say whether the door is running." };
}
