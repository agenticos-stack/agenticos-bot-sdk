# Local extraction provenance

Unpublished; source license approval remains a release gate.

`src/index.js` is esbuild 0.28.1 TypeScript erasure of canonical API
`packages/agenticos-api-contract/src/gadgets.ts` at commit
`e800c449ef1635776ec2b5b4fab36ec353870809`.
Source SHA-256: `b70049842a536c4fe5d704d9b4e5a79f292bf7844454cea2c28c7855eeabc130`.

The only source imports were TypeScript-only `SideEffectClass` and
`CommandGate`; erasure removes both. There are no runtime dependencies and no
whole private contract package, customer fixtures, credentials, or repository
history is copied. No validator algorithm or archive format is reimplemented.

The source file has no explicit standalone license grant. This snapshot is
permitted only for local unpublished development pending source audit and owner
license selection. Validation is compatibility checking, not authorization or
proof of runtime isolation. API remains the canonical source until the separate
versioned-consumer migration; compare this hash before refreshing the snapshot.

`src/index.d.ts` is a bounded declaration selection from that same revision:
the exported validator/constants, their definition/field/action/view/requirement
types, and validation result/issue types only. It omits instance envelopes,
bindings assignments, command governance and all private contract imports.
Comments are condensed. This selection does not alter runtime validation or
resolve source redistribution approval.
