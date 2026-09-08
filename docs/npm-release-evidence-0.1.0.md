# Public npm release 0.1.0

Published 2026-09-08 under owner-approved Apache-2.0 licensing.

- Repository: https://github.com/agenticos-stack/agenticos-gadget-sdk
- Exact source: `238e56283bd283691c8bca214b9a52be2d53af20`
- Bootstrap PR #1; staging-to-main promotion PR #2, merged without squash.
- PR CI: 34177393855; staging CI: 34177449961, both passed.
- Release with exact tarballs and machine-readable hash evidence:
  https://github.com/agenticos-stack/agenticos-gadget-sdk/releases/tag/v0.1.0

All five packages are public at version 0.1.0:

- `@agenticos-dev/gadget-contract`
- `@agenticos-dev/gadget-archive-tools`
- `@agenticos-dev/gadget-sdk`
- `@agenticos-dev/gadget-shell`
- `@agenticos-dev/gadget-devkit`

Publication was sequential in dependency order, from a clean source tree and
reviewed tarballs. Each registry integrity matched the local tarball; all five
publicly downloaded tarball SHA-256 values matched the release manifest.
Fresh consumers, without npm credentials and with new caches, passed both
package-name and direct registry-tarball installs. LICENSE/NOTICE presence,
strict NodeNext/Bundler declaration consumers, fixture denial, archive roundtrip,
definition refusal and untrusted-script refusal were verified.

The initial package metadata endpoints returned 404 during registry propagation,
despite successful publishes and accessible version/tarball records. No package
was republished. Name-based installation passed once metadata became available.

CI's first cold run also exposed missing npm metadata for offline fixture
installs. An explicit public-dependency preparation step fixed it; the isolated
SDK acceptance installs remain offline. No credentials or lifecycle scripts are
used for that preparation.

This is a developer foundation release, not completed Studio integration or
production runtime acceptance. The experimental testkit remains unpublished.
Bootstrap used a privately supplied temporary credential. No OIDC provenance
is claimed; trusted publisher configuration and its stage-only workflow remain
separate account setup work. Notes still needs its own published-dependency
migration. Private API and Studio source licenses are unchanged.
