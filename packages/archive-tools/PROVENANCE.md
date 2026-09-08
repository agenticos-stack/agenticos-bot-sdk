# Local extraction provenance

Unpublished candidate; owner approved Apache-2.0 on 2026-09-08.

`src/index.js` is esbuild 0.28.1 TypeScript erasure of canonical API
`packages/gadget-archive-tools/src/blueprint-archive.ts` at commit
`e800c449ef1635776ec2b5b4fab36ec353870809`.
Source SHA-256: `393458eb810243dfdb6e0456ab8f560ae63e5b5775575b33dd04fbd00333a156`.

The source header records an upstream port from
`packages/workshop-backend/src/blueprint-archive.ts`, commit `aedcda8`,
Apache-2.0. Verified directly against the upstream tree at full revision
`aedcda8b3066ff666f57ae28ecef7341d6c2dee7`: the root LICENSE is Apache-2.0 and
there is no separate NOTICE. The owner approved the AgenticOS modifications
under Apache-2.0. The package includes LICENSE, NOTICE, modification headers
and separately installed MIT dependency notices.

Runtime dependency: Yjs 13.6.32 (MIT), with lib0 and isomorphic.js transitive
dependencies retained through the lockfile. No Worker, credentials, database,
private contracts, or runtime bindings are imported. Standard Web compression
APIs and Yjs V2 encoding preserve the platform's existing format.

The runtime matches canonical TypeScript erasure, apart from its new attribution
header (verified 2026-09-08). This is not upload security validation; platform
raw upload limits, permission checks, identity selection, and publication remain
host-owned. API still owns the canonical source until a versioned-consumer
migration is reviewed; compare this hash before refreshing the snapshot.

`src/index.d.ts` retains only the archive metadata/archive interfaces and two
exported codec signatures from that same canonical revision. Comments are
condensed; metadata remains explicitly untrusted. No additional source or
private dependency is introduced. Owner license approval covers these reviewed
declarations too; it does not relicense the private API repository.

Local 2026-09-08 compatibility check decoded the API's existing upstream
`workspace-docs.gadget` (25,000 bytes), `workspace-slides.gadget` (49,977 bytes)
and `workspace-sheets.gadget` (39,404 bytes), re-encoded each with this extracted
codec and deep-compared the resulting metadata and member text. All three
passed. Original compressed bytes are not expected to match a new deterministic
snapshot; no archive corpus was copied into the SDK.
