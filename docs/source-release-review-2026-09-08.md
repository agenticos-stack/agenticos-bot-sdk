# SDK license and source release review — 2026-09-08

Owner authorization: publish the SDK under `@agenticos-dev`, using Apache-2.0
for original work and the reviewed AgenticOS extracts. Individual gadget apps
and private API/Studio repositories are not relicensed by this decision.

## Reviewed source boundaries

- Archive codec: canonical source SHA-256
  `393458eb810243dfdb6e0456ab8f560ae63e5b5775575b33dd04fbd00333a156`, API revision
  `e800c449ef1635776ec2b5b4fab36ec353870809`. SDK runtime matches esbuild 0.28.1
  TypeScript erasure exactly after removing the newly added attribution header.
- Validator: canonical source SHA-256
  `b70049842a536c4fe5d704d9b4e5a79f292bf7844454cea2c28c7855eeabc130`, same API
  revision. Runtime matches TypeScript erasure exactly. No private runtime
  imports or complete API contract package are included.
- Shell is a bounded presentation extraction with caller-supplied labels and
  app-first layout; no private i18n, auth, routing or session runtime is copied.
- SDK fixture contracts, devkit orchestration and testkit are SDK-local work.
  Runtime imports were inspected: public SDK packages, Yjs, Node builtins,
  Miniflare and Cloudflare's runtime builtin only. No private repository links.

## Attribution and dependency scope

Cloudflare OS upstream revision
`aedcda8b3066ff666f57ae28ecef7341d6c2dee7` was inspected directly. Its root LICENSE
is Apache-2.0; its complete tracked tree has no separate NOTICE. The archive
package now records upstream attribution, source path, modification history and
an explicit modified-file header. All six SDK package directories contain
Apache-2.0 LICENSE and attribution NOTICE files.

Yjs 13.6.32 and the installed lib0/isomorphic.js MIT license texts are preserved
in archive-tools/THIRD_PARTY_LICENSES.md. They are registry dependencies, not
bundled code. Svelte is a separately installed MIT peer of the shell.

The experimental testkit remains excluded from the five-package initial npm
release. Miniflare's development dependency graph includes LGPL-licensed
libvips/sharp binaries. These are not bundled into the initial SDK tarballs;
do not advertise the entire dependency graph as Apache-2.0 or redistribute a
bundled testkit runtime without a separate dependency review.

## Privacy and verification limits

The independent SDK git history (102 unique historical blobs before this
license batch) was scanned for npm/GitHub/AWS credential signatures and private
key headers: no matches. This is a bounded signature scan, not a guarantee that
no possible secret exists. No private platform git history is included.
Candidate packaging separately rejects sensitive paths and checks actual
export/type/CLI file inventories; Apache candidates must include LICENSE/NOTICE.

This records engineering provenance and owner authorization, not an independent
legal opinion, security certification or production compatibility claim.
Initial versions are prepared as 0.1.0. Package manifests stay private until
the actual publication batch; authentication and registry verification are
separate remaining gates.

## Candidate verification

Thirty focused checks passed across devkit, packed TypeScript consumers, shell
compile/SSR and release inventory/policy checks. The initial SDK inventory test
failed because its exact expected file list predated LICENSE/NOTICE; the list
was updated and the affected packed install test passed on rerun. It also
verifies that the installed license equals the reviewed package license.

Five actual 0.1.0 tarballs were generated offline with scripts disabled.
Every Apache candidate includes LICENSE and NOTICE; archive-tools also includes
the upstream attribution and separate MIT dependency notices. Candidates remain
explicitly unpublished. The existing Notes repository still needs its own
versioned dependency migration to the new scope after npm publication.
