# Local AI agent developer tooling

Unpublished foundation. These commands operate on **trusted local source**;
they do not sandbox scripts, authorize publishing, install an agent into a
workspace, or prove Cloudflare runtime compatibility. The public SDK uses
owner-approved Apache-2.0; canonical API-consumer migration is still pending.

Install the locally packed archive-tools, gadget-contract and devkit tarballs
together into the independent application's devDependencies. The dependency
graph contains no `workspace:*` links or private API imports. Archive-tools uses
pinned Yjs 13.6.32. Node 22.17+ and npm are required.

```sh
bot-dev init ./my-agent --template ./reviewed-template-export --name my-agent
bot-dev check ./my-agent --trust-source
bot-dev pack ./my-agent --trust-source --output ./my-agent-release.gadget
```

`init` currently copies a reviewed **export directory**, not an arbitrary git
checkout. It requires package scripts `test`, `build`, `validate`. It refuses
existing destinations, symlinks, hidden files (except `.gitignore`), `dist`, and
`node_modules`. It changes only package name and `private: true`; definition and
blueprint identity are retained deliberately and must be reviewed by the author.
The previous `gadget-dev` command remains a compatibility alias for `bot-dev`.
It runs no scripts and does not install dependencies. There is no bundled Notes
app: the real app belongs in its own repository. A generic generated template,
identity-selection UX and TASK-008 acceptance are still pending.

`check` preflights all three scripts, then runs `npm run test`, `npm run build`,
`npm run validate` sequentially. Child invocation uses argument arrays and
`shell: false`; npm package scripts themselves intentionally execute trusted
developer code and retain the user's local authority. Signals, timeouts, spawn
errors and nonzero exits fail immediately. The timeout is 120 seconds per step.

`pack` requires the same trust flag and an explicit new `.gadget` output path.
It refuses an existing file before starting scripts and uses exclusive copying
after checks, preserving another writer's output. It independently checks the
canonical archive and release evidence after the package validation script.
Output parent directories must already exist. There is intentionally no force
overwrite or publish command in this batch.

## Application contract

`package.json` declares `gadget.archive: "dist/my-agent.gadget"`, and its app-owned
scripts call these helpers after any necessary compile/bundle work:

```js
import { buildPackage, validatePackage } from '@agenticos-dev/bot-devkit';
await buildPackage(process.cwd()); // build script
// In the separate validation script:
await validatePackage(process.cwd());
```

`manifest.json`:

```json
{
  "blueprintKey": "my_agent",
  "artifact": "my-agent.gadget",
  "metadata": { "title": "My AI agent" },
  "files": ["server.js", "client.js", "agent.md"]
}
```

`definition.json` is the existing canonical `gadget.definition.v1` definition,
not a new SDK schema. Its key must equal `blueprintKey`; the host still selects
publication identity and authority. Every listed member is read from flat
`src/<name>`. The build helper does not bundle code or resolve dependencies.
Relative source paths/symlinks cannot escape the package directory; a symlinked
`dist` or output file is refused. The application's ordinary build overwrites
its own `dist` files; **pack's deliverable output never overwrites**.

The builder uses the canonical platform codec and writes a `.gadget` archive
and `dist/release.json`. Validation checks definition/manifest identity, current
metadata, current source text, archive bytes/size/hash, exact member set and
member hashes. A self-consistent but stale archive fails validation.

Release evidence records a package-lock hash if present and preserves optional
manifest `compatibility` metadata. Provenance is explicitly incomplete:
`sourceCommit: null`, `status: "incomplete-local-evidence"`. Compatibility is a
declared value, not a tested compatibility claim. Full source-commit provenance,
other lockfile formats, host runtime acceptance and release signing are not
implemented. Metadata validation is not a source/privacy audit.

## Focused verification

From the SDK root:

```sh
node --test packages/devkit/test/devkit.test.mjs
node --test packages/devkit/test/public-types.test.mjs
```

The suite packs all three local packages and installs them into a temporary
consumer with `npm install --offline --ignore-scripts`. Its npm cache therefore
needs the pinned dependency closure populated once. No monorepo imports or
workspace links are available to that consumer. Temporary consumer files are
removed at completion.

The second suite additionally packs the shell and installs its pinned Svelte
peer from the local npm cache. It compiles an independent TypeScript consumer
under strict NodeNext and Bundler resolution (`skipLibCheck: false`, no ambient
Node types). Positive and negative assertions cover every exported codec,
validator and devkit API plus required shell snippets and unsupported authority
fields. Export targets must exist in each tarball, internal package versions
must match the public closure, and private API packages must not be installed.
The shell's `.svelte` entry still requires a Svelte-capable application bundler;
type availability does not make the component directly executable by Node.

Declarations preserve `unknown` for unchecked package names, compatibility
metadata and embedded definitions. Build bytes are exposed as `Uint8Array` (the
implementation returns its Node Buffer subtype), avoiding an ambient Node-types
dependency for consumers that only inspect package evidence.
