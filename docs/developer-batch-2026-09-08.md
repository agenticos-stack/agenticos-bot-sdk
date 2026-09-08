# Developer foundation batch — 2026-09-08

## Implemented locally, unpublished

- Runtime transport/chat fixture hardening: 22 Node tests passed, with malformed
  result metadata and input-shape regressions demonstrated before fixes.
- Canonical codec and slim validator extracted as JavaScript with exact source
  hashes/provenance. No full private API contract or private history copied.
- Trusted-source `init/check/pack`, build/validate helpers: 15 tests passed,
  including isolated offline tarball install, corrupt/stale output, path and
  symlink boundaries, failure propagation and concurrent output preservation.
- Original transport package isolated import/strict TypeScript and shell
  compile/SSR checks passed (two tests).
- A separate Notes source repository consumes three packed tooling packages.
  Its 18 tests cover SQL behavior and client state with a minimal DOM harness.
- Clean-consumer Notes acceptance passed without API/Studio source or workspace
  links. Dependency closure: devkit, archive-tools, gadget-contract, Yjs, lib0,
  isomorphic.js. Repeat builds were byte-identical; existing output preserved.

Notes archive: 8,150 bytes, SHA-256
`180b2dd00080fb5f1f99447673e7dac68a0936e47df7e16f7183dfd486606062`.
This supersedes initial `b7d6510c…` after removing trailing blank lines from
two archive members; build/validation and clean-consumer acceptance were rerun.
Build provenance deliberately reports incomplete local evidence; sourceCommit
is null. This is not a signed/published release.

## UI and storage evidence limits

Notes has cards, editor drawer, explicit deletion, unsaved-edit protection,
revision conflicts, pagination and a labelled local fixture server serving the
packed client. Fixture storage uses Node SQLite and resets when its server
stops. No model, authenticated platform account or external effect is connected.

Browser acceptance did not run: local Chrome failed to launch with thread
creation errors; reduced-resource attempts also encountered sandbox launch
configuration failures. No screenshot, focus/responsive or actual sandbox RPC
acceptance is claimed. Node client tests are not a substitute. Owned preview
processes are stopped after verification; restart from the app's preview script.

SQL tests prove rollback, stale-revision refusal, replay handling, pagination,
two separate databases and reconstruction over an existing database. They do
not prove real DO facet startup, eviction/restart, host admission, cross-tenant
authorization or production upgrade recovery.

## Repository and release boundaries

SDK remains intended for a new public repository; Notes is separately owned.
Both are local-only pending license/public-source audit and app visibility.
No public push, npm publication, marketplace listing or production deployment
was performed. Local source is committed for durability; no remote backup is
claimed. Public package exports still need TypeScript tooling declarations,
complete provenance and independent license review.

## Next bounded batch

1. Complete generic scaffold and explicit blueprint identity selection.
2. Build credential-free workerd/DO facet testkit using canonical host behavior.
3. Prove Notes persistence/restart/migrations and isolated host integration.
4. Complete Notes browser acceptance; wire SDK shell and transport into Studio.
5. Extract Social Content separately without changing its legacy identity or
   bundled/installed lifecycle as a side effect.

Cloudflare APIs were checked against the current
[SQLite storage reference](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
and [DO facet reference](https://developers.cloudflare.com/dynamic-workers/usage/durable-object-facets/).
