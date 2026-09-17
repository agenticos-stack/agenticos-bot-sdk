# Gadget SDK foundation

This is the independent public SDK repository. The licensed foundation was
bootstrapped at 42deb4e on staging/main; subsequent changes use feature branches
and PRs against staging. Never commit or push directly to main/staging.
Package publication is gated on
source/dependency audit and release verification. The owner approved Apache-2.0
for the SDK and reviewed extracts on 2026-09-08. Do not import private API
or Studio modules, copy their history, or embed credentials/customer fixtures.

Use apply_patch for source edits. Keep packages framework-neutral unless their
explicit purpose is presentation. No auth engine, real agent loop, permission
engine, credentials or direct production connections belong here. Typed
capability metadata never grants authority. Fixtures must be explicitly marked
and cannot silently fall back to live transport. Tests must stop owned processes.

Three component systems share one vocabulary by contract, not by code reuse:
Studio `@agenticos/ui` (Svelte, the design source of truth), the design board
under design-plans (the approved static reference), and `packages/shell`
(bot-* CSS primitives + framework-neutral `client/` modules for sandboxed
gadget canvases). A canvas reuses names, tokens and state contracts — never
the host's implementations, which it cannot load inside its `srcdoc` iframe.
When a canvas needs a component that exists only in Studio, report the gap
back rather than patching around it. `packages/shell/README.md` carries the
canonical description.

Concurrent ownership (2026-09-08, runtime/release batch): parent owns root
files/docs/scripts/release workflow/integration and packages/sdk metadata.
do_testkit owns packages/testkit. sdk_public_types owns packages/devkit,
packages/archive-tools, packages/gadget-contract and shell declarations/metadata.
Studio integration uses its own worktree. Bounded
local extraction of the canonical archive codec and slim gadget validator is
authorized for TASK-007, with exact source revision/hashes and dependency/license
provenance. Do not copy the full private contract package or its history. This
does not authorize unrelated private source extraction. Preserve upstream
licenses, attribution and modification notices before public redistribution.
No public pushes, registry publication or extra dependencies without parent
coordination. Run Node's focused built-in tests for this batch; real local
workerd tests may use the parent-approved pinned Miniflare dependency.
