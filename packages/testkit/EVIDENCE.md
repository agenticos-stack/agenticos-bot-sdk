# Local facet verification — 2026-09-08

Runtime: `miniflare@4.20260702.0` and its pinned workerd, compatibility date
`2026-07-02`. One Node test process / runtime at a time. No Cloudflare credentials
or remote account used; owned runtime and controlled HTTP listener stopped.

Command from SDK root:

```sh
NOTES_GADGET_ARCHIVE=/home/ubuntu/Project/agenticos-stack/worktrees/gadget-notes-foundation/dist/notes.gadget node --test --test-concurrency=1 packages/testkit/test/facets.test.mjs packages/testkit/test/notes.acceptance.mjs
```

Result: **3 tests passed, 0 failed, 0 skipped** (two generic test cases and one
end-to-end Notes acceptance case containing the assertions below).

Actual Notes artifact SHA-256:
`180b2dd00080fb5f1f99447673e7dac68a0936e47df7e16f7183dfd486606062`.

Proven using real Worker Loader/facet/SQLite APIs:

- Generic fixture: persisted SQL values survive `ctx.facets.abort` and complete
  Miniflare disposal/recreation; parent/facet instance UUID changes prove fresh
  object instances. Same record ID stays isolated across two facets and parents.
- Dynamic fixture gets no environment bindings. Outbound fetch to a controlled,
  independently confirmed reachable loopback listener fails with no extra hit.
- Actual Notes archive members (no test rewrite): create, list, read, update,
  rejected stale update/delete, facet abort, full process restart, independent
  instances, delete, restart, idempotent delete replay and no resurrection.
- Miniflare object RPC proxies are explicitly serialized to JSON in the fixture
  host so data assertions compare settled wire values, not proxy identities.

Negative control: temporarily remove `globalOutbound: null`. The generic case
fails at the outbound-denial assertion (`false !== true`); restore it and rerun
the combined command successfully. The controlled listener avoids mistaking
unresolvable DNS or an unavailable internet service for network denial.

Not proven: production authentication/tenant admission, marketplace install,
door capability revocation, actual agent behavior, migration across schema
versions, schedules/alarms or browser UX. Method admission and identity selection
in this harness are explicit fixtures and cannot grant platform authority.
