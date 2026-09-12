/**
 * Signing a developer in from a terminal.
 *
 * WHY THERE IS NO DEVICE GRANT HERE. RFC 8628 exists for a device that has no
 * browser of its own — a TV, a headless appliance. A developer has one, and
 * the platform already sends a one-time code by email for exactly this kind of
 * sign-in. So this uses the flow the product already has rather than adding a
 * second one: `email-otp/send-verification-otp`, then `sign-in/email-otp`.
 *
 * WHAT IS STORED. The session token the server returns in `set-auth-token`,
 * written `0600` under `~/.config/agenticos/`. The API's `bearer()` plugin
 * verifies that token's signature and treats the request as the session it
 * belongs to, so nothing here needs a bespoke credential type, a scope, or a
 * table of its own.
 *
 * The token is a credential: it is never printed, never passed as an argument,
 * and never written anywhere but that file.
 */

import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Production. Overridden per command for a different deployment. */
export const DEFAULT_API_ORIGIN = "https://api.agenticos.hk";

/** Studio's own header for "act in this organization", not a CLI invention. */
export const ACTIVE_ORG_HEADER = "x-agenticos-active-org";

/**
 * `~/.config/agenticos/credentials.json`, honouring `XDG_CONFIG_HOME`.
 *
 * One file for every deployment, keyed by API origin, so signing in to a
 * second one does not silently replace the first.
 */
export function credentialsPath(env = process.env) {
  const base = env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  return join(base, "agenticos", "credentials.json");
}

function normalizeOrigin(origin) {
  const value = (origin || "").trim().replace(/\/+$/, "");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Not a valid API origin: ${origin}`);
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("An API origin must be https, or loopback for local development.");
  }
  return url.origin;
}

async function readStore(env = process.env) {
  try {
    return JSON.parse(await readFile(credentialsPath(env), "utf8")) ?? {};
  } catch {
    return {};
  }
}

async function writeStore(store, env = process.env) {
  const path = credentialsPath(env);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  // `mode` on writeFile only applies when the file is created; an existing
  // file keeps whatever it had, so state it every time.
  await chmod(path, 0o600);
}

/** The stored credential for one deployment, or null. */
export async function readCredential({ apiOrigin = DEFAULT_API_ORIGIN, env = process.env } = {}) {
  const store = await readStore(env);
  return store[normalizeOrigin(apiOrigin)] ?? null;
}

export async function writeCredential({ apiOrigin, token, email, orgId, env = process.env }) {
  const origin = normalizeOrigin(apiOrigin);
  const store = await readStore(env);
  store[origin] = { token, email, ...(orgId ? { orgId } : {}), signedInAt: new Date().toISOString() };
  await writeStore(store, env);
  return origin;
}

/** Forget one deployment's credential. Removes the file when it was the last. */
export async function clearCredential({ apiOrigin = DEFAULT_API_ORIGIN, env = process.env } = {}) {
  const origin = normalizeOrigin(apiOrigin);
  const store = await readStore(env);
  if (!(origin in store)) return false;
  delete store[origin];
  if (Object.keys(store).length === 0) await rm(credentialsPath(env), { force: true });
  else await writeStore(store, env);
  return true;
}

/**
 * Headers that authenticate a request as this developer.
 *
 * `orgId` is optional and travels as the header Studio already sends; without
 * it the API resolves the person's last active organization, which is what
 * somebody with one organization always wants.
 */
export function authHeaders(credential) {
  if (!credential?.token) throw new Error("Not signed in. Run `bot-dev login` first.");
  return {
    authorization: `Bearer ${credential.token}`,
    ...(credential.orgId ? { [ACTIVE_ORG_HEADER]: credential.orgId } : {})
  };
}

async function postJson(url, body, fetcher) {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(20000)
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

/** Ask the platform to email a one-time code. */
export async function requestSignInCode({ apiOrigin = DEFAULT_API_ORIGIN, email, fetcher = fetch }) {
  const origin = normalizeOrigin(apiOrigin);
  const address = (email || "").trim();
  if (!address.includes("@")) throw new Error("An email address is required.");
  const { response, payload } = await postJson(
    `${origin}/api/auth/email-otp/send-verification-otp`,
    { email: address, type: "sign-in" },
    fetcher
  );
  if (!response.ok) {
    throw new Error(`Could not send a sign-in code (${response.status}): ${payload?.message || "unknown error"}`);
  }
  return { email: address, apiOrigin: origin };
}

/**
 * Trade the emailed code for a session token.
 *
 * The token arrives in `set-auth-token`, not in the body — that is the
 * `bearer()` plugin's contract for a client with no cookie jar. A 200 without
 * that header means the deployment has no bearer support, which is worth
 * saying plainly rather than storing nothing and reporting success.
 */
export async function completeSignIn({ apiOrigin = DEFAULT_API_ORIGIN, email, otp, fetcher = fetch }) {
  const origin = normalizeOrigin(apiOrigin);
  const code = (otp || "").trim();
  if (!code) throw new Error("The emailed code is required.");
  const { response, payload } = await postJson(
    `${origin}/api/auth/sign-in/email-otp`,
    { email: (email || "").trim(), otp: code },
    fetcher
  );
  if (!response.ok) {
    throw new Error(`Sign-in failed (${response.status}): ${payload?.message || "that code was not accepted"}`);
  }
  const token = response.headers.get("set-auth-token");
  if (!token) {
    throw new Error("Signed in, but the deployment returned no bearer token. Its bearer plugin is not enabled.");
  }
  return { token, apiOrigin: origin };
}

/** Who the stored credential belongs to, asked of the server rather than the file. */
export async function fetchSession({ apiOrigin = DEFAULT_API_ORIGIN, credential, fetcher = fetch }) {
  const origin = normalizeOrigin(apiOrigin);
  const response = await fetcher(`${origin}/api/auth/get-session`, {
    headers: { ...authHeaders(credential), accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return payload?.user ? { id: payload.user.id, email: payload.user.email } : null;
}

/**
 * Where a minted session is remembered, so a restart does not mint another.
 *
 * `bot-dev dev` used to start a NEW conversation on every invocation. Five
 * `[gadget-dev]` rooms accumulated in one afternoon of ordinary restarts, and
 * each one is a durable row an owner then has to find and archive. A session
 * lasts eight hours; a restart inside that window should rejoin the one it
 * already has.
 *
 * Kept beside the credential rather than in it: this is a cache of something
 * the server issued, and losing it costs one extra room, never access.
 */
function sessionsPath(env = process.env) {
  const base = env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  return join(base, "agenticos", "dev-sessions.json");
}

/**
 * Which remembered session belongs to this run.
 *
 * The project directory is part of the key, and that is the whole point. This
 * file is per MACHINE, not per developer or per terminal, and several agents
 * share one box here. Keyed only by `(apiOrigin, gadgetKey, orgId)`, one
 * session running `bot-dev dev --fresh` minted a new conversation and silently
 * repointed everyone else's key — with no error, and a banner reading
 * "Rejoined the session already open for this gadget" either way. Door grants
 * are per conversation, so the next grant landed on a room nobody was running.
 *
 * Two checkouts of the same gadget are two developments and get two rooms.
 * That is the intent, not a side effect.
 */
function sessionKey(apiOrigin, gadgetKey, orgId, projectDir = process.cwd()) {
  return [apiOrigin, gadgetKey, orgId ?? "", projectDir].join("|");
}

/**
 * The pre-project-directory key.
 *
 * Read once, so upgrading the devkit does not orphan a live room that a
 * developer is mid-session on. Never written.
 */
function legacySessionKey(apiOrigin, gadgetKey, orgId) {
  return [apiOrigin, gadgetKey, orgId ?? ""].join("|");
}

async function readSessions(env = process.env) {
  try {
    return JSON.parse(await readFile(sessionsPath(env), "utf8")) ?? {};
  } catch {
    return {};
  }
}

/**
 * A remembered session that is still worth rejoining, or null.
 *
 * Expiry is checked with a minute of headroom: a session that dies mid-run is
 * worse than minting one, and the host validates it again on connect anyway.
 */
export async function rememberedDevSession({
  apiOrigin, gadgetKey, orgId, env = process.env, now = Date.now, projectDir = process.cwd()
}) {
  const store = await readSessions(env);
  const origin = normalizeOrigin(apiOrigin);
  const entry = store[sessionKey(origin, gadgetKey, orgId, projectDir)]
    ?? store[legacySessionKey(origin, gadgetKey, orgId)];
  if (!entry?.devToken || !entry?.workspaceId) return null;
  return Number(entry.expiresAtMs) - 60_000 > now() ? entry : null;
}

async function rememberDevSession({
  apiOrigin, gadgetKey, orgId, session, env = process.env, projectDir = process.cwd()
}) {
  const path = sessionsPath(env);
  const store = await readSessions(env);
  store[sessionKey(apiOrigin, gadgetKey, orgId, projectDir)] = {
    devToken: session.devToken,
    workspaceId: session.workspaceId,
    expiresAtMs: session.expiresAtMs,
    apiOrigin,
    projectDir
  };
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

/** Forget a remembered session, so the next run starts a fresh room. */
export async function forgetDevSession({
  apiOrigin = DEFAULT_API_ORIGIN, gadgetKey, orgId, env = process.env, projectDir = process.cwd()
}) {
  const path = sessionsPath(env);
  const store = await readSessions(env);
  const origin = normalizeOrigin(apiOrigin);
  // Forget both spellings: whichever one `rememberedDevSession` would have
  // rejoined is the one that has to go, or `--fresh` quietly rejoins it.
  const keys = [sessionKey(origin, gadgetKey, orgId, projectDir), legacySessionKey(origin, gadgetKey, orgId)]
    .filter((candidate) => candidate in store);
  if (keys.length === 0) return false;
  for (const key of keys) delete store[key];
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  return true;
}

/**
 * Start a gadget development session and hand back what a host needs.
 *
 * The credential never leaves this process: it authenticates one request, and
 * what comes back is a session token scoped to one organization, one
 * workspace, one gadget key, for eight hours. That is what a host is given —
 * never the sign-in credential itself.
 */
export async function startDevSession({
  apiOrigin = DEFAULT_API_ORIGIN,
  credential,
  gadgetKey,
  title,
  fresh = false,
  env = process.env,
  now = Date.now,
  fetcher = fetch,
  projectDir = process.cwd()
}) {
  const origin = normalizeOrigin(apiOrigin);
  const key = (gadgetKey || "").trim();
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) {
    throw new Error("A gadget key is a lowercase snake_case identifier, not display text.");
  }
  // Rejoin rather than mint. A restart inside the session's own lifetime is
  // the common case, and every mint leaves a durable conversation behind.
  if (!fresh) {
    const remembered = await rememberedDevSession({
      apiOrigin: origin, gadgetKey: key, orgId: credential?.orgId, env, now, projectDir
    });
    if (remembered) return { ...remembered, apiOrigin: origin, reused: true };
  }
  const response = await fetcher(`${origin}/v2/gadget-dev/sessions`, {
    method: "POST",
    headers: { ...authHeaders(credential), "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(title ? { gadgetKey: key, title } : { gadgetKey: key }),
    redirect: "error",
    signal: AbortSignal.timeout(20000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.data?.devToken) {
    const message = payload?.error?.message || "The development session could not be started.";
    if (response.status === 401) {
      throw new Error(`Not signed in, or the session expired (401): run \`bot-dev login\`.`);
    }
    throw new Error(`Could not start a development session (${response.status}): ${message}`);
  }
  const { devToken, workspaceId, expiresAtMs, title: roomTitle } = payload.data;
  const session = { devToken, workspaceId, expiresAtMs, title: roomTitle, apiOrigin: origin };
  await rememberDevSession({ apiOrigin: origin, gadgetKey: key, orgId: credential?.orgId, session, env, projectDir });
  return { ...session, reused: false };
}

/**
 * The environment a gadget host reads.
 *
 * Generic names, not one gadget's: a host consumes a session it did not mint,
 * and naming the variables after the gadget would make every new gadget invent
 * its own spelling of the same three facts.
 */
export function devSessionEnv(session) {
  return {
    AGENTICOS_API_ORIGIN: session.apiOrigin,
    AGENTICOS_GADGET_DEV_TOKEN: session.devToken,
    AGENTICOS_GADGET_DEV_WORKSPACE_ID: session.workspaceId
  };
}

/**
 * How long a minted gadget-dev token lasts. The API's own constant is
 * `GADGET_DEV_TOKEN_TTL_MS` (8 hours); this copy is only for copy at mint
 * time, so the advice is said before anything has failed.
 */
export const GADGET_DEV_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Product names that are not the gadget key. The key is an identifier; the
 * owner's sidebar is for people. Other gadgets pass `--title`.
 */
const GADGET_DEV_TITLES = {
  social_localization: "Social Content (dev)"
};

/** The conversation title to send when the caller did not pass `--title`. */
export function defaultGadgetDevTitle(gadgetKey) {
  return GADGET_DEV_TITLES[gadgetKey] ?? undefined;
}

/**
 * Split `--grant metered_fetch,social` into keys. Empty pieces are dropped,
 * not turned into a request for a door named "".
 */
export function parseGrantKeys(value) {
  if (typeof value !== "string" || !value.trim()) return [];
  return [...new Set(value.split(/[\s,]+/).map((key) => key.trim()).filter(Boolean))];
}

const STUDIO_ORIGIN_BY_API = {
  "https://api.agenticos.hk": "https://app.agenticos.hk",
  "https://staging-api.agenticos.hk": "https://staging-app.agenticos.hk"
};

/** The Studio conversation a minted room opens as. Never a credential. */
export function studioConversationUrl(apiOrigin, workspaceId) {
  const origin = normalizeOrigin(apiOrigin);
  const studio = STUDIO_ORIGIN_BY_API[origin]
    ?? origin.replace("://api.", "://app.").replace("://staging-api.", "://staging-app.");
  return `${studio}/chat/${encodeURIComponent(workspaceId)}`;
}

/**
 * What to print at mint, including the URL and what to do when the eight
 * hours are up. The 401 path used to be the only place that advice appeared,
 * which is after the host has already failed.
 */
export function mintBanner(session) {
  const until = new Date(session.expiresAtMs).toISOString();
  const url = studioConversationUrl(session.apiOrigin, session.workspaceId);
  const hours = Math.round(GADGET_DEV_SESSION_TTL_MS / 3_600_000);
  const lines = [
    `Development session ${session.workspaceId} on ${session.apiOrigin}.`,
    `Open ${url}`,
    `Valid until ${until} (${hours} hours). When that lapses, stop this process and run \`bot-dev dev\` again — it mints a new session. The host cannot refresh an expired token in place; do not paste a Studio cookie.`
  ];
  if (session.reused) {
    lines.push("Rejoined the session already open for this gadget. Pass --fresh to start a new conversation.");
  }
  return lines.join("\n");
}

async function v2Json({ apiOrigin, credential, path, method, body, fetcher = fetch }) {
  const origin = normalizeOrigin(apiOrigin);
  const response = await fetcher(`${origin}${path}`, {
    method,
    headers: { ...authHeaders(credential), "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(20000)
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

/**
 * Grant named doors on the minted conversation, as the signed-in developer
 * who owns the room — never a PAT, never a pasted cookie. `persistToAgent` is
 * false: a throwaway dev room must not become the agent's standing grant.
 *
 * The gadget-dev token is not a session on `/v2/workspaces/:id/door-grants`;
 * only the rpc-ticket route accepts it. The login credential is the member.
 */
export async function grantDevDoors({
  apiOrigin = DEFAULT_API_ORIGIN, credential, workspaceId, keys, fetcher = fetch
}) {
  const granted = [];
  for (const requirementKey of keys) {
    const { response, payload } = await v2Json({
      apiOrigin,
      credential,
      path: `/v2/workspaces/${encodeURIComponent(workspaceId)}/door-grants`,
      method: "POST",
      body: { requirementKey, persistToAgent: false },
      fetcher
    });
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || "unknown error";
      throw new Error(`Could not grant ${requirementKey} (${response.status}): ${message}`);
    }
    granted.push(requirementKey);
  }
  return granted;
}

/**
 * Archive the development conversation so it leaves the owner's sidebar.
 * Uses the login credential, for the same reason `--grant` does.
 */
export async function archiveDevWorkspace({
  apiOrigin = DEFAULT_API_ORIGIN, credential, workspaceId, fetcher = fetch
}) {
  const { response, payload } = await v2Json({
    apiOrigin,
    credential,
    path: `/v2/workspaces/${encodeURIComponent(workspaceId)}/archive`,
    method: "POST",
    body: { archived: true },
    fetcher
  });
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || "unknown error";
    throw new Error(`Could not archive ${workspaceId} (${response.status}): ${message}`);
  }
  return true;
}
