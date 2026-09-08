# Local implementation provenance

New local unpublished implementation, authored for the SDK developer-kit plan.
No application or repository history is copied. The trusted test/build/validate
orchestration follows API `scripts/check-gadget-package.mjs` at commit
`e800c449ef1635776ec2b5b4fab36ec353870809`; this does not move or remove that
compatibility command. The generic manifest and release evidence use the
existing Social Content standalone build shape, not a new archive format.

Canonical runtime dependencies are `@agenticos-dev/bot-archive-tools` 0.1.0 and
`@agenticos-dev/bot-contract` 0.1.0; their own provenance files identify exact
source snapshots and owner-approved Apache-2.0 licensing. All other runtime imports
are Node builtins. Package manifests use exact versions, not workspace links.
Public publication and registry installability are not claimed.

`src/index.d.ts` describes only this package's existing local JS API and imports
the bounded public `GadgetDefinitionV1` declaration. It does not import Node or
private platform declarations. Public packed-consumer checks cover both NodeNext
and Bundler TypeScript resolution; they do not certify a package's declared
runtime compatibility. Owner Apache-2.0 approval was received on 2026-09-08.
