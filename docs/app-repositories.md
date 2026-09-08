# App repository extraction checklist

This document defines the boundary between the independent SDK repository and
the independent gadget application repositories. It is a release checklist,
not permission to publish or redistribute platform source.

## Repository decisions still required

- [ ] Select and record the public license for each repository, including the
      SDK, Social Content, and Notes. Until this is approved, repositories
      remain local/unpublished.
- [x] SDK repository visibility is public, as explicitly requested by the owner.
- [ ] Select and record visibility for each gadget repository independently.
      Gadget visibility remains undecided; do not infer it from SDK visibility
      or the eventual package registry scope.
- [ ] Confirm ownership and redistribution rights for copied or ported source,
      including the archive codec's upstream Apache-2.0 provenance and all
      third-party notices.

## Social Content baseline

- [ ] Refresh the extraction source from the merged `origin/staging` commit at
      extraction time. Do not freeze the earlier package filename list or the
      pre-merge package snapshot.
- [ ] Include any accepted Social Content changes in that refreshed baseline,
      including `src/src/client/setup-copy.js` when it is present. Reconcile
      the manifest/build inputs and tests from the refreshed tree rather than
      silently dropping newly accepted files.
- [ ] Preserve the archive compatibility identity: flat member names, the
      `social_localization` key, legacy ID `social.localization`, and
      deterministic artifact bytes. Existing installed code must not be
      rewritten by repository extraction.
- [ ] Start from a clean snapshot or intentionally squashed extraction commit;
      do not migrate the monorepo's private history, review comments, task
      references, or unrelated files.

## Dependency migration

- [ ] Replace every monorepo `workspace:*` dependency with a released,
      version-pinned package or a packed local tarball during pre-publication
      testing. An app repository must build from an empty directory without
      access to API, Studio, modules, or the monorepo lockfile.
- [ ] Move the archive codec into the SDK/public tooling boundary only after
      producing supported JavaScript and declaration outputs. The current
      source-export package is private TypeScript and uses Yjs plus standard
      compression streams; document supported Node/browser/runtime versions and
      retain its archive compatibility tests.
- [ ] Do not depend on the full `@agenticos/api-contract` root export. It
      exposes internal contracts and declares unrelated `org-locale` and
      `drizzle-orm` dependencies.
- [ ] Publish or vendor a deliberately slim gadget-contract surface containing
      only the validated gadget definition schema/runtime and its required
      local types. It must have an explicit public entry point, built JS and
      `.d.ts`, a compatibility/version policy, and no accidental API/Studio
      imports.
- [ ] Keep application runtime behavior in the archive (facet storage, client,
      doors, migrations, and agent instructions). The SDK supplies transport,
      archive/definition tooling, and test adapters; it must not absorb host
      authentication, authorization, agent execution, or production adapters.

## Repository contents and isolation

- [ ] Each app repository owns its package metadata, lockfile, source, tests,
      fixture-only preview, build/validate scripts, CI, release metadata, and
      provenance records. Do not copy API workers, Studio components, modules,
      `.dev.vars`, `.wrangler-state`, production data, or credentials.
- [ ] Keep fixtures synthetic, explicitly labelled, deny-by-default, and
      incapable of falling back to live transport. Scan generated bundles,
      agent instructions, docs, and fixtures for customer identifiers, private
      URLs, tokens, and internal task/REQ references before publication.
- [ ] Add a source/dependency/license manifest and third-party notices. The
      absence of a root `LICENSE`/`COPYING` is a release blocker, even if an
      upstream component has a license comment.

## CI and release gates

- [ ] Give every app its own CI workflow and release lifecycle. CI must install
      from its own lockfile, run focused tests, build twice and compare bytes,
      validate archive/member hashes, and exercise its fixture preview.
- [ ] Add an empty-directory acceptance job that installs packed public SDK,
      contract, and archive-tool tarballs. Fail on workspace links, undeclared
      imports, missing generated JS/types, or access to monorepo-only paths.
- [ ] Scan the packed repository and artifacts for secrets, customer fixtures,
      private source, license omissions, and unexpected archive members. Record
      source commit, dependency lock hash, artifact hash, package versions, and
      supported runtime versions in release evidence.
- [ ] Keep API's bundled artifact as a compatibility consumer during migration;
      do not remove bundled ownership until the separate app repository's
      install, build, validation, and release gates pass. Any publication,
      private install, marketplace listing, or ownership cutover is a separate
      authorized host workflow.
- [ ] Use immutable, exact-SHA release artifacts and promote only artifacts
      whose staging checks passed. No direct pushes to `main` or `staging` from
      shared checkouts.
