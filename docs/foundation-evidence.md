# Local foundation evidence — 2026-09-07

This is an unpublished independent repository scaffold. No public remote,
license grant, registry release or production integration is claimed.

Implemented: framework-neutral transport declarations and an explicit fixture
transport. Unknown operations/protocols and malformed requests/results are
refused. Call inputs are detached before asynchronous execution. Cancellation
and close settle callers without claiming to roll back arbitrary handler work.
Subscriptions support disposal; closing is idempotent. No live transport exists.

Verification: `npm test` passed 10 Node tests. `npm pack --ignore-scripts
--dry-run --json ./packages/sdk` listed exactly README.md, index.js, index.d.ts
and package.json. This inspection is not a full external install, license audit
or public release. No registry packages were installed for these checks.

Review fixes: malformed result refusal, in-flight close settlement, snapshot
timing, required context normalization and rejection of non-array selected
records. Parent independently reran all tests after the final context fix.

Pending: actual host adapters, Studio shell adoption, real chat projection,
SQLite runtime testkit and independent gadget repositories. Local shell and
tarball-install acceptance are recorded below. SDK visibility is explicitly public when released. SDK license and
individual gadget repository visibility remain owner decisions.

## Packed consumer acceptance

`npm run test:package` now passes a real offline pack/install/import check in
an empty temporary consumer. The installed dependency graph contains only the
SDK. Public export success, unknown-method refusal and closed-call refusal are
verified. Ten transport tests also remain passing. Temporary files are removed
by the test on success or failure; no publication or registry access occurs.

The first run failed because npm refuses loading one file as both global and
user configuration. Separate empty files fixed the harness; the test was rerun
successfully. This is transport-package acceptance, not complete gadget-app,
shell, TypeScript-consumer compilation or real SQLite runtime acceptance.

## TypeScript consumer acceptance

The packed-consumer test now also compiles `test/consumer-types.mts` inside the
empty consumer under strict NodeNext resolution. The compiler resolves the
installed SDK's public declarations, not a source path alias. Valid fixture,
transport and refusal usage compiles; expected-error assertions cover malformed
refusals, context protocol versions, non-array arguments and fixture event
injection through a production transport interface.

TypeScript 7.0.2 is pinned as a root development dependency with a standalone
npm lockfile. It is absent from the SDK runtime dependency graph. Ten runtime
tests and the packed-consumer test passed after this extension. TypeScript
consumer acceptance is now verified; real host/shell/SQLite integration remains
pending.

## Shell extraction candidate

Added `packages/shell/GadgetSplitView.svelte`, based on Studio's presentation
component with host-supplied labels instead of private i18n imports. The app
slot remains unconditional; chat is unmounted when collapsed. Theme tokens,
pane bounds and existing responsive behavior are retained. No Studio consumer
was changed and no auth/chat runtime was extracted.

`npm run test:shell` passes compilation with zero warnings and server-rendered
paired/collapsed/localized slot checks. Svelte autofixer reports no issues or
suggestions. These are not browser lifecycle/layout acceptance tests. Real
mobile/keyboard review and mount-preservation results follow below.

## Shell browser verification

Verified the actual compiled component in an isolated local Chromium session
against the loopback fixture server, not Studio or a live API. The initial
mobile check exposed inherited visual/DOM ordering disagreement. The candidate
now places the app first in DOM and visual order: left on desktop, above chat
on mobile. Studio remains unchanged; its desktop chat-left arrangement differs.

- At 390 × 844, Tab from the toggle focuses draft, then chat message; the
  respective top coordinates are 267.78 and 686.44 pixels.
- Collapsing and reopening chat preserves the exact draft textarea DOM node
  and its unsaved value. Chat is absent while collapsed and remounted on reopen.
- At 1440 × 900, app occupies x=0, width=1048; chat x=1048, width=392.
- Document scroll width equals viewport width at both tested sizes.
- Shell compile/SSR regression passes, including app-before-chat source order.
  Svelte autofixer reports zero issues/suggestions for shell and preview.

These are manual browser interaction/geometry checks, not a committed browser
regression suite, headed product-design acceptance or live chat integration.
The fixture has no network authority. Reproduce with `npm run preview:shell`;
restart after edits because the preview bundles once on startup.

## Chat fixture and host-gap audit

Added the public chat interface and an identity-bound fixture adapter using
the existing fixture transport, without another session coordinator. Five
new tests verify bound identity, deny-by-default operations, detached selected
records, preserved pending/refused results, rejection of void outcomes,
old-context close/disposal and cancellation. All 15 SDK runtime tests pass.
The offline packed-consumer test also passes, including the chat runtime export
and strict TypeScript checks for selection revisions and approval decisions.

Latest Studio audit found that structured selected records are not accepted by
the current send path and console operations return void, not outcome receipts.
See `chat-fixture.md` for the exact inspected SHA and live-adapter prerequisites.
No Studio/API edits, live connection or publication occurred in this batch.

## Parallel review follow-up

Fixed SDK reentrant event disposal (close/unsubscribe during delivery prevents
later callbacks) and explicit-undefined context protocol normalization. Three
new regressions bring runtime checks to 18 passing; parent independently reran
those and the offline package/TypeScript consumer check successfully.
Optional result-field validation remains a known follow-up from review.
Studio draft #836 now also clears abandoned single-answer optimistic overlays;
87 focused console tests pass. Neither repo claims completed live SDK adoption.
