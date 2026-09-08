# npm release preparation

## SDK packages and gadget apps are different deliverables

The public SDK repository owns npm packages: transport contracts, shell,
developer tooling and eventually the runtime testkit. Each app owns its own
repository and `.gadget` artifact. An app can consume the SDK from npm without
publishing the app itself to npm. AgenticOS blueprint publication and marketplace
eligibility remain host-owned operations.

## What is implemented now

`npm run release:check` reports blockers without contacting npm or changing
anything. `node scripts/release-readiness.mjs --strict` exits nonzero until all
declared prerequisites pass. This is a metadata check, **not** proof of npm
ownership, license approval, source safety, authentication or live compatibility.

`node scripts/prepare-release.mjs --output <new-directory>` packs an explicit
ordered package list with lifecycle scripts disabled. It refuses an existing
output directory, records file lists, SHA-256, source commit, dirty-tree state
and lockfile hash, and retains an explicit `publication: not-attempted` result.
Every export, declaration and CLI entry must appear in npm's packed-file
inventory; an on-disk file excluded from the tarball cannot pass this check.
Its sensitive-path screen is not a complete secret/source audit. Partial
candidates are retained on failure for inspection, never overwritten.

The manual `npm-release-readiness.yml` workflow runs focused checks and retains
candidate tarballs. It has read-only repository permission, no OIDC minting
permission, no npm token and no publish/stage command. Hosted execution itself
has not been tested because the new SDK repository is still local-only.

## Owner setup before first publication

1. Choose the SDK license and approve audited source/dependency provenance.
2. Create the intended **public** `agenticos-stack/agenticos-gadget-sdk`
   repository from the clean SDK history, not platform history. Its visibility
   is already decided; app repository visibility is a separate choice.
3. Confirm control of the `@agenticos` npm scope and each package name. Name
   availability and an authenticated CLI are not proof of organization authority.
4. Choose real initial versions, include package licenses/notices and exact
   `repository.url`, enable `publishConfig.access: public`, and deliberately
   remove `private: true` only in a reviewed release change.
5. Bootstrap any brand-new npm packages through an explicitly approved owner
   release. Do not assume staged publishing can create a new package.
6. Configure each package's GitHub Actions trusted publisher: exact organization,
   repository, workflow filename and protected environment. Reviewers and tag
   protection must be configured in GitHub; a workflow environment name alone
   does not create an approval policy.

No password, 2FA code or long-lived publishing token should be pasted into chat.
If interactive npm login is needed for the initial owner setup, do it locally
with the authorized npm account. This repository does not save login state.

## Recommended subsequent release mechanism

Use GitHub-hosted Actions with npm trusted publishing (OIDC), then prefer
stage-only publisher permission and a maintainer's 2FA approval. This removes
the need for a persistent publishing token on a developer/agent machine.
Trusted publishing and the stage approval remain registry controls, not a
boolean in `release-policy.json`.

The publishing workflow must be added/reviewed separately after bootstrap. It
should validate the exact source/tag and package versions, run the same tests,
record immutable tarball hashes, submit those reviewed artifacts in dependency
order and reconcile a partial multi-package release before retrying. Never
blindly republish a version or overwrite an existing npm release. Verify
registry versions and an empty-consumer install afterward; that verification
is not implemented by the local readiness report.

Current order: gadget-contract and archive-tools first; gadget-sdk and
gadget-shell independently; gadget-devkit after its exact-version dependencies.
The experimental testkit is not yet in the release list. `init` still requires
an explicit reviewed template; do not advertise a complete generated starter.

## Verified npm constraints (2026-09-08)

- OIDC trusted publishing requires npm 11.5.1+ and Node 22.14.0+, with supported
  hosted runners. It can generate provenance for public packages from public
  repositories. [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- Staged publishing requires npm 11.15.0+, an existing package and a maintainer's
  2FA approval before public release. It cannot bootstrap a new package.
  [npm staged publishing](https://docs.npmjs.com/staged-publishing/)
- New scoped public packages need explicit public access.
  [npm scoped packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
- Candidate workflow pins Node 24.20.0 and npm 12.0.2. The latter's registry
  metadata requires Node `^22.22.2 || ^24.15.0 || >=26.0.0`; do not install it
  globally on this host's older Node 22.17.1 just to prepare packages.

## Current release status

Blocked intentionally: owner license/source audit, public repository setup,
scope ownership, first package bootstrap, trusted publisher configuration and
explicit publication approval. No registry write has been attempted.
