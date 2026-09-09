# Local DO facet testkit (unpublished)

## Login-free local session (unpublished)

`createLocalSession` from `@agenticos-dev/bot-testkit/local-session` wraps the
facet runtime with a bounded JSON request interface. Supply trusted modules,
explicit browser-callable `allowedMethods`, host-only `seed` calls, and exact
HTTP loopback `origins`. The session chooses the synthetic workspace/facet;
browser requests cannot select identities. The underlying runtime injects no
credentials or outbound capabilities. Do not admit publishing methods.

The local HTTP host must bind loopback, serve the session token only to its
own preview document, limit request bodies before constructing Request objects,
route POST requests to `session.handle`, and await `session.dispose` on shutdown.
Requests require an exact Origin, JSON content type, and `x-bot-local-session`.
This is a developer capability token, not platform login or tenant authorization.
Seed methods are unavailable to browsers unless separately admitted.

Storage is temporary by default. Pass an explicit absolute `stateDirectory`
to retain SQLite across shutdown/startup. The parent directory must exist.
Only SDK-marked directories can be reused; symlinked/unowned directories are
refused. An exclusive sibling `.lock` directory prevents concurrent writers.
Shutdown retains data and releases the lock only after workerd stops. A crash
may leave a lock: verify its owner has stopped before manually removing it;
the SDK never guesses that a lock is stale.

Seed calls run on each start, so they must be transactional and idempotent.
Session tokens rotate on restart. `archiveLocalState(stateDirectory)` from
`@agenticos-dev/bot-testkit/local-state` refuses a running owner and renames
the database to a unique sibling backup. Nothing is deleted; the next start
initializes fresh state. Restore only with the preview stopped.

No live agent execution, scheduled jobs or provider calls
are enabled. This is not yet a complete browser dev server or Social Content
integration; those consumers must be wired separately.

This executes supplied app JavaScript in a **real local workerd runtime** through
Worker Loader and `ctx.facets.get`, with each facet using Cloudflare's SQLite
storage API. It is not a Node SQLite substitution or an emulated gadget class.

```js
import { createFacetTestkit } from "@agenticos-dev/bot-testkit";

const rig = await createFacetTestkit({
  modules: { "server.js": serverSource, "storage.js": storageSource },
  allowedMethods: ["listNotes", "createNote"]
});
try {
  await rig.call({
    workspace: "fixture-workspace", facet: "notes-instance",
    method: "createNote", args: [{ id: "n1", title: "Hello", body: "World" }]
  });
  await rig.restart();
  const result = await rig.call({
    workspace: "fixture-workspace", facet: "notes-instance",
    method: "listNotes", args: [{}]
  });
} finally {
  await rig.dispose();
}
```

Use serial lifecycle operations; await outstanding calls before restart/dispose.
App method results must be JSON-compatible (or undefined), matching the SDK's
wire-value boundary. The host serializes them before crossing Miniflare's Node
proxy so tests receive settled values rather than live proxy identities.
`abortFacet` terminates the actual facet object and reacquires it on its next
call. `restart` terminates the whole Miniflare/workerd process and starts a new
one against the same uniquely allocated temporary storage directory. `dispose`
stops the runtime and removes only temporary allocated directories (explicit
persistent directories are retained). HTTP is loopback
with an ephemeral port and always responds 404; tests use the DO namespace proxy.

The dynamic code receives an empty environment and `globalOutbound: null`.
Method allowlists and workspace/facet names are **explicit fixtures**, not trusted
user identities, admission, permissions or billing entitlements. These tests do
not establish production cross-tenant authorization. Do not deploy this host or
give it untrusted packages; it is an offline developer harness, not a service.

## Verification

From the SDK root after installing dependencies:

```sh
node --test --test-concurrency=1 packages/testkit/test/*.test.mjs
NOTES_GADGET_ARCHIVE=/absolute/path/to/notes.gadget node --test --test-concurrency=1 packages/testkit/test/notes.acceptance.mjs
```

The generic tests prove actual facet abort, full process restart with changed
in-memory instance tokens, persistence, separate facets and parent objects,
empty injected environment, and failed outbound network access.

The separate acceptance test requires a real Notes `.gadget` explicitly: missing
input is a failure, not a skip. It decodes its existing `server.js` and
`storage.js` members and exercises app CRUD, stale revisions, persistent
tombstones, and isolated instances without modifying app source. The archive
SHA-256 is emitted as evidence. Notes remains in its own independent repository.

Pinned runtime: `miniflare@4.20260702.0`, compatibility date `2026-07-02`, matching
the installed stable AgenticOS test runtime. Do not silently switch to latest
alpha. This is a local runtime baseline, not a new production compatibility
policy. No secrets, accounts, npm auth or Cloudflare deployment are needed.

## Boundary and remaining work

The host pattern follows Cloudflare's public
[DO facets reference](https://developers.cloudflare.com/dynamic-workers/usage/durable-object-facets/)
and the existing AgenticOS Worker Loader/facet architecture. No private platform
modules are imported or copied. This package itself is new harness code.

This batch does not prove migrations between app versions, actual admission or
permission revocation, door forwarding, platform agent execution, alarms,
schedules, MCP, billing or marketplace installation. Those require dedicated
integration tests against their canonical host boundaries. AgenticOS's host,
not the SDK or this allowlist, remains authoritative.
