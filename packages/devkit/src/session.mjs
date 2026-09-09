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
