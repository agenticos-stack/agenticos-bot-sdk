# Local extraction provenance

Unpublished; source and dependency license approval remains a release gate.

`src/index.js` is esbuild 0.28.1 TypeScript erasure of canonical API
`packages/gadget-archive-tools/src/blueprint-archive.ts` at commit
`e800c449ef1635776ec2b5b4fab36ec353870809`.
Source SHA-256: `393458eb810243dfdb6e0456ab8f560ae63e5b5775575b33dd04fbd00333a156`.

The source header records an upstream port from
`packages/workshop-backend/src/blueprint-archive.ts`, commit `aedcda8`,
Apache-2.0. That assertion is not a completed license/provenance audit of our
subsequent modifications. No license for this new SDK is selected by this file.
Retain/review upstream notices and obtain owner license approval before release.

Runtime dependency: Yjs 13.6.32 (MIT), with lib0 and isomorphic.js transitive
dependencies retained through the lockfile. No Worker, credentials, database,
private contracts, or runtime bindings are imported. Standard Web compression
APIs and Yjs V2 encoding preserve the platform's existing format.

This is an unchanged codec extraction, not upload security validation; platform
raw upload limits, permission checks, identity selection, and publication remain
host-owned. API still owns the canonical source until a versioned-consumer
migration is reviewed; compare this hash before refreshing the snapshot.

Local 2026-09-08 compatibility check decoded the API's existing upstream
`workspace-docs.gadget` (25,000 bytes), `workspace-slides.gadget` (49,977 bytes)
and `workspace-sheets.gadget` (39,404 bytes), re-encoded each with this extracted
codec and deep-compared the resulting metadata and member text. All three
passed. Original compressed bytes are not expected to match a new deterministic
snapshot; no archive corpus was copied into the SDK.
