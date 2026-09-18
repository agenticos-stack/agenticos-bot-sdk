/**
 * What `initGadgetPackage` emits into every new gadget package: the pieces
 * the newest bot lacked and paid for — an AGENTS.md stating the repo's git
 * line and the publish/vendor chain, a fixture rig, a local-runtime rig, the
 * API-side vendor sync script, and a continuity test that reads both sides
 * from source.
 *
 * Every file is a starting point an author edits, not a finished rig: the
 * method lists, fixture rows and budget pins are per-gadget by contract.
 * Files a template already ships are never overwritten.
 */

const AGENTS_MD = `# {{GADGET_TITLE}} agent — repository playbook

Standalone app repository: authors the agent, builds a portable \`.gadget\`
archive. \`private: true\` in package.json blocks accidental npm publication;
the repository's open-source license still applies.

## Git line

Feature branches only. Open PRs against the repository's integration branch
(\`gh pr create --draft\`); never push to the integration or production branch
directly. Merge after required checks pass.

## Checks

\`\`\`sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build    # before test: lifecycle tests spawn a preview that reads dist/
pnpm test
pnpm validate
\`\`\`

Exit codes lie here — \`pnpm\` chains return 0 while the output reports
failure. Read the output. Lifecycle tests print the spawned child's stderr.

## SDK packages are dependencies, never paths

\`@agenticos-dev/bot-*\` packages come from npm. Never import SDK source by
filesystem path (no \`BOT_SDK_SOURCE\`-style override): a path import pairs a
source tree with an installed package and the two drift silently. When the
SDK does not do enough, the fix is an SDK PR and a publish — never a local
copy with the difference added. If that is too slow, the slowness is the bug
to fix.

## Byte budgets are ratchets, not targets

\`scripts/build.mjs\` pins the archive and \`client.js\` byte ceilings at
measured values. A deliberate overage must fail the build — a budget that
does not bite is documentation, not a gate. Re-pin only at a measured new
floor, and say in the comment what the budget guards.

## Publish and vendor chain

\`pnpm build\` writes \`dist/{{GADGET_NAME}}.gadget\` plus \`release.json\`
evidence. The API repository vendors the artifact and the definition through
\`scripts/sync-{{GADGET_NAME}}.mjs\` (emitted by the scaffold; it runs from
the API repo root, \`--from <this checkout>\`), which records provenance in
\`vendor-source.json\` and enforces it with \`--check\` in CI. The vendored
copy is a port, never a hand-edited snapshot: upstream changes land by
re-running the sync, and the check gate fails on drift.

## One entry artifact, split source

The sandbox loads exactly one browser file, \`client.js\`, bundled from the
client source tree at build time. Author freely across modules; the bundle
is the only browser artifact. \`manifest.json\` packs inside the archive and
its \`storageSchemaVersion\` declaration must match the version the storage
code migrates to.
`;

const LOCAL_RPC_CONTRACT = `// Per-gadget constants — deliberately not an SDK module. The byte ceiling and
// the door surface are facts about THIS gadget's payloads and grants; two
// gadgets sharing a value share it for different reasons.

// Sized for the largest message this gadget's canvas sends, plus base64
// expansion and bounded metadata. Auth and agent messages keep the smaller
// limit in the BFF.
export const LOCAL_RPC_MAX_BYTES = 3 * 1024 * 1024;

// The door spec a development session hands the runtime: each env key to the
// methods the gadget may call on it. Methods the gadget never calls do not
// belong here.
export const GADGET_DOOR_METHODS = Object.freeze({
  // connector_key: ['listThings', 'readThing'],
});
`;

const FIXTURES = `/**
 * The fixture half of the local runtime: synthetic rows so the canvas opens
 * with something to read.
 *
 * \`server.js\` is wrapped rather than edited — the packed server and its
 * storage stay unchanged, and \`seedLocal\` exists only in the fixture
 * modules. Fixtures are content shape only: never a recipient list, a send,
 * or live provider state.
 */

/** The replacement server.js source for fixture mode. */
export function fixtureServerModule() {
  return \`
    import { Gadget as App } from './app-server.js';
    export class Gadget extends App {
      async seedLocal() {
        // Deterministic synthetic state across the lifecycle the canvas
        // renders — the composer opens with drafts to read and the list shows
        // every state chip. Return counts so a seeded rig is visible in logs.
        return { seeded: 0 };
      }
    }\`;
}

/** The seed calls the session replays before it opens. */
export const SEED_CALLS = Object.freeze([{ method: 'seedLocal', args: [] }]);
`;

const LOCAL_RUNTIME = `import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLocalSession } from '@agenticos-dev/bot-testkit/local-session';
import { LOCAL_RPC_MAX_BYTES } from './local-rpc-contract.mjs';
import { fixtureServerModule, SEED_CALLS } from './fixtures.mjs';

/**
 * Local development runtime: the packed server modules plus the fixture
 * wrapper, served by the SDK testkit — consumed as a package, never by path.
 *
 * allowedMethods is the gadget's RPC surface, split so the list that needs
 * no door (browsing, drafting, saving) works on first open while door-bound
 * methods admit only when doors exist — a clear "not granted" beats a
 * confusing failure inside the gadget.
 */
export async function createGadgetRuntime({ directory, origins, allowedHostnames, stateDirectory, doors, seedFixtures = true }) {
  const modules = {};
  for (const name of await readdir(join(directory, 'src'))) {
    if (name.endsWith('.js')) modules[name] = await readFile(join(directory, 'src', name), 'utf8');
  }
  if (seedFixtures) {
    modules['app-server.js'] = modules['server.js'];
    modules['server.js'] = fixtureServerModule();
  }
  const browsing = ['summary', 'getCapabilities', 'subscribe'];
  const needsDoors = [];
  const connectedDoors = doors ?? undefined;
  if (seedFixtures) console.warn('Fixture runtime seeds synthetic state. No door or provider call is live.');
  return createLocalSession({
    modules, origins, allowedHostnames, stateDirectory, doors: connectedDoors,
    maxRequestBytes: LOCAL_RPC_MAX_BYTES,
    seed: seedFixtures ? [...SEED_CALLS] : [],
    allowedMethods: connectedDoors || !seedFixtures ? [...browsing, ...needsDoors] : browsing
  });
}
`;

const CONTINUITY_TEST = `// Continuity — reads both sides from source, fails on divergence.
//
// A module added under src/ and never listed in manifest.json builds, passes
// every unit test that imports it from disk, and fails at first load with
// "No such module". That shipped once (grant-request.js). This test is the
// generalization of that defect: the filesystem and the manifest are the two
// sides, and a mock of either is decoration.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));

// Members the archive carries with no src/ file: bundled client.js and the
// packed manifest itself. Anything else listed must exist under src/.
const GENERATED = new Set(['client.js', 'manifest.json']);
// src/ files deliberately not packed — bundler inputs under the client
// source tree are already covered by client.js; name the rest explicitly.
const SOURCE_ONLY = new Set([]);

test('every src/ module is a packed member, and every member exists', async () => {
  const sources = new Set((await readdir(join(root, 'src'))).filter((name) => name.endsWith('.js')));
  const packed = new Set(manifest.files);
  const unpacked = [...sources].filter((name) => !packed.has(name) && !SOURCE_ONLY.has(name));
  const missing = [...packed].filter((name) => !sources.has(name) && !GENERATED.has(name));
  assert.deepEqual(unpacked, [], 'src/ modules absent from manifest.json files');
  assert.deepEqual(missing, [], 'manifest.json members with no src/ file and no generator');
});
`;

const VENDOR_SYNC = `#!/usr/bin/env node
/**
 * Refresh the vendored {{GADGET_TITLE}} gadget copy from a local
 * \`bot-{{GADGET_NAME}}\` checkout, or (with \`--check\`) verify the vendored
 * copy has not drifted from what \`vendor-source.json\` records.
 *
 * THIS SCRIPT RUNS FROM THE API REPOSITORY ROOT — copy it to
 * \`agenticos-api/scripts/sync-{{GADGET_NAME}}.mjs\`. It mirrors the
 * provenance pattern: \`packages/{{GADGET_NAME}}-vendor/definition.ts\` must
 * be byte-identical to the source repo's copy after the declared
 * adaptations, and the built blueprint archive is tracked the same way, as a
 * build artifact rather than raw source.
 *
 * Provenance is regenerated here rather than by hand. Hand-editing the
 * recorded digests is how a stale or tampered copy passes its own gate.
 *
 * Usage:
 *   node scripts/sync-{{GADGET_NAME}}.mjs --check
 *   node scripts/sync-{{GADGET_NAME}}.mjs --from ../bot-{{GADGET_NAME}}
 *   node scripts/sync-{{GADGET_NAME}}.mjs --from ../bot-{{GADGET_NAME}} --artifact ../bot-{{GADGET_NAME}}/dist/{{GADGET_NAME}}.gadget
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_DIR = join(REPO_ROOT, "packages/{{GADGET_NAME}}-vendor");
const DEFINITION_NAME = "definition.ts";
const METADATA_PATH = join(VENDOR_DIR, "vendor-source.json");
const ARTIFACT_PATH = join(REPO_ROOT, "workers/api/format-blueprints/{{GADGET_NAME}}.gadget");
const ARTIFACT_REPO_RELATIVE = "workers/api/format-blueprints/{{GADGET_NAME}}.gadget";

/**
 * \`definition.ts\` is not byte-identical to upstream, permanently: the bot
 * repo imports \`GADGET_DEFINITION_SCHEMA\` from its own published
 * \`@agenticos-dev/bot-contract\` package, and the API workspace has the
 * equivalent value in \`@agenticos/api-contract/gadgets\`. Applying the
 * substitution here keeps it a single reviewable, versioned step instead of
 * a silent one-off edit. If upstream's import no longer matches \`find\`, the
 * sync refuses rather than vendoring a copy that does not resolve.
 */
const DEFINITION_ADAPTATIONS = [
  {
    find: 'import { GADGET_DEFINITION_SCHEMA } from "@agenticos-dev/bot-contract";',
    replace: 'import { GADGET_DEFINITION_SCHEMA } from "@agenticos/api-contract/gadgets";'
  },
  { find: "(\`@agenticos-dev/bot-contract\`)", replace: "(\`@agenticos/api-contract/gadgets\`)" }
];

function applyDefinitionAdaptations(canonicalText) {
  let text = canonicalText;
  for (const { find, replace } of DEFINITION_ADAPTATIONS) {
    if (!text.includes(find)) {
      throw new Error(
        \`Upstream \${DEFINITION_NAME} no longer contains \${JSON.stringify(find)}. \` +
          "The DEFINITION_ADAPTATIONS in this script are stale — update them (and re-verify the result resolves in this workspace) before syncing."
      );
    }
    text = text.replace(find, replace);
  }
  return text;
}

function parseArgs(argv) {
  const args = { from: process.env.{{GADGET_ENV}}_PATH ?? null, artifact: null, check: false, reportOnly: false, allowDirty: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--from") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--from requires a path to a bot-{{GADGET_NAME}} checkout.");
      args.from = value;
    } else if (arg === "--artifact") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--artifact requires a path to a built .gadget file.");
      args.artifact = value;
    } else if (arg === "--check") args.check = true;
    else if (arg === "--report-only") args.reportOnly = true;
    else if (arg === "--allow-dirty") args.allowDirty = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Sync or check the vendored {{GADGET_TITLE}} gadget copy.",
          "",
          "  --check          Verify the vendored files against vendor-source.json; write nothing",
          "  --from <path>    bot-{{GADGET_NAME}} checkout (default: \${{GADGET_ENV}}_PATH)",
          "  --artifact <path> A freshly built .gadget file to vendor as the blueprint archive",
          "  --report-only    Show what would change; write nothing",
          "  --allow-dirty    Record a working-tree snapshot instead of refusing on a dirty --from checkout"
        ].join("\\n")
      );
      process.exit(0);
    } else throw new Error(\`Unknown option: \${arg}\`);
  }
  return args;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function git(cwd, ...cliArgs) {
  return execFileSync("git", cliArgs, { cwd, encoding: "utf8" }).trim();
}

function canonicalScopeSha256(files) {
  const entries = Object.entries(files).sort(([left], [right]) => left.localeCompare(right));
  return sha256(entries.map(([name, rule]) => \`\${name}:\${rule.sha256}\\n\`).join(""));
}

function runCheck() {
  const errors = [];
  let metadata;
  try {
    metadata = JSON.parse(readFileSync(METADATA_PATH, "utf8"));
  } catch (error) {
    console.error(\`Cannot read \${METADATA_PATH}: \${error instanceof Error ? error.message : String(error)}\`);
    process.exitCode = 1;
    return;
  }
  if (metadata.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (metadata.source?.repository !== "agenticos-stack/bot-{{GADGET_NAME}}") {
    errors.push("source.repository must be agenticos-stack/bot-{{GADGET_NAME}}");
  }
  if (!/^[a-f0-9]{40}$/.test(metadata.source?.baseCommit ?? "")) errors.push("source.baseCommit must be a 40-character lowercase Git SHA");
  if (!["clean", "working-tree"].includes(metadata.source?.treeState)) errors.push('source.treeState must be "clean" or "working-tree"');
  const files = metadata.files ?? {};
  if (metadata.canonicalScopeSha256 !== canonicalScopeSha256(files)) errors.push("canonicalScopeSha256 mismatch");
  let clean = 0;
  for (const [name, rule] of Object.entries(files)) {
    if (!["identical", "adapted"].includes(rule.mode)) { errors.push(\`unsupported mode for \${name}: \${rule.mode}\`); continue; }
    try {
      if (sha256(readFileSync(join(VENDOR_DIR, name))) !== rule.sha256) errors.push(\`\${name} differs from vendor-source.json\`);
      else clean += 1;
    } catch (error) { errors.push(\`cannot read \${name}: \${error instanceof Error ? error.message : String(error)}\`); }
  }
  if (!metadata.artifact || metadata.artifact.path !== ARTIFACT_REPO_RELATIVE) errors.push(\`artifact.path must be \${ARTIFACT_REPO_RELATIVE}\`);
  else {
    try {
      if (sha256(readFileSync(ARTIFACT_PATH)) !== metadata.artifact.sha256) errors.push(\`\${ARTIFACT_REPO_RELATIVE} differs from vendor-source.json\`);
    } catch (error) { errors.push(\`cannot read \${ARTIFACT_REPO_RELATIVE}: \${error instanceof Error ? error.message : String(error)}\`); }
  }
  if (errors.length) {
    console.error("{{GADGET_TITLE}} vendor provenance error:");
    for (const message of errors) console.error(\`  - \${message}\`);
    process.exitCode = 1;
    return;
  }
  console.log(\`{{GADGET_TITLE}} vendor provenance: \${clean}/\${Object.keys(files).length} source file(s) clean, artifact clean\`);
  console.log(\`Source: \${metadata.source.repository} @ \${metadata.source.baseCommit} (\${metadata.source.treeState})\`);
}

function readMetadata() {
  try {
    return JSON.parse(readFileSync(METADATA_PATH, "utf8"));
  } catch {
    return { schemaVersion: 1, files: {} };
  }
}

function runSync(args) {
  if (!args.from) throw new Error("--from <bot-{{GADGET_NAME}} checkout> is required (or set {{GADGET_ENV}}_PATH).");
  const fromRoot = resolve(REPO_ROOT, args.from);
  const canonicalDefinition = join(fromRoot, DEFINITION_NAME);
  try {
    statSync(canonicalDefinition);
  } catch {
    console.error(\`No \${DEFINITION_NAME} at \${canonicalDefinition}. Pass --from <bot-{{GADGET_NAME}} checkout>.\`);
    process.exit(2);
  }
  const dirty = git(fromRoot, "status", "--porcelain") !== "";
  if (dirty && !args.allowDirty && !args.reportOnly) {
    console.error(\`The bot-{{GADGET_NAME}} checkout at \${fromRoot} has uncommitted changes. Commit them, or pass --allow-dirty to record a working-tree snapshot.\`);
    process.exit(2);
  }
  const baseCommit = git(fromRoot, "rev-parse", "HEAD");

  const metadata = readMetadata();
  const canonicalText = readFileSync(canonicalDefinition, "utf8");
  const adaptedText = applyDefinitionAdaptations(canonicalText);
  const vendoredPath = join(VENDOR_DIR, DEFINITION_NAME);
  const changed = [];
  let currentText = null;
  try {
    currentText = readFileSync(vendoredPath, "utf8");
  } catch {
    currentText = null;
  }
  if (currentText !== adaptedText) {
    changed.push(DEFINITION_NAME);
    if (!args.reportOnly) writeFileSync(vendoredPath, adaptedText);
  }
  metadata.files = metadata.files ?? {};
  metadata.files[DEFINITION_NAME] = {
    mode: "adapted",
    sha256: sha256(Buffer.from(adaptedText)),
    note: "Not byte-identical to upstream by design — see DEFINITION_ADAPTATIONS in this script."
  };

  const capturedOn = new Date().toISOString().slice(0, 10);
  metadata.source = { repository: "agenticos-stack/bot-{{GADGET_NAME}}", baseCommit, treeState: dirty ? "working-tree" : "clean", capturedOn };
  metadata.canonicalScopeSha256 = canonicalScopeSha256(metadata.files);

  if (args.artifact) {
    const artifactSource = resolve(REPO_ROOT, args.artifact);
    const artifactBytes = readFileSync(artifactSource);
    if (sha256(artifactBytes) !== (metadata.artifact?.sha256 ?? null)) changed.push(ARTIFACT_REPO_RELATIVE);
    if (!args.reportOnly) copyFileSync(artifactSource, ARTIFACT_PATH);
    metadata.artifact = { path: ARTIFACT_REPO_RELATIVE, sha256: sha256(artifactBytes), capturedOn, builtFrom: \`\${baseCommit} (pnpm build in the bot-{{GADGET_NAME}} checkout)\` };
  }

  if (!args.reportOnly) writeFileSync(METADATA_PATH, \`\${JSON.stringify(metadata, null, 2)}\\n\`);

  console.log(\`{{GADGET_TITLE}} sync \${args.reportOnly ? "(report only) " : ""}from \${baseCommit}\${dirty ? " (working tree)" : ""}\`);
  console.log(changed.length ? \`  refreshed: \${changed.join(", ")}\` : "  nothing changed");
  if (!args.artifact) {
    console.log(
      \`  artifact not refreshed (no --artifact given) — \${ARTIFACT_REPO_RELATIVE} is unchanged; --check still verifies it against the recorded digest.\`
    );
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.check) runCheck();
else runSync(args);
`;

const TEMPLATES = {
  'AGENTS.md': AGENTS_MD,
  'scripts/local-rpc-contract.mjs': LOCAL_RPC_CONTRACT,
  'scripts/fixtures.mjs': FIXTURES,
  'scripts/local-runtime.mjs': LOCAL_RUNTIME,
  'test/continuity.test.mjs': CONTINUITY_TEST,
  'scripts/vendor-sync.mjs': VENDOR_SYNC
};

function substitute(text, name) {
  const kebab = name;
  const snake = name.replace(/-/g, '_');
  const env = snake.toUpperCase();
  const title = name.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join(' ');
  return text
    .replaceAll('{{GADGET_NAME}}', kebab)
    .replaceAll('{{GADGET_SNAKE}}', snake)
    .replaceAll('{{GADGET_ENV}}', env)
    .replaceAll('{{GADGET_TITLE}}', title);
}

/**
 * The files `initGadgetPackage` emits into a scaffolded package, keyed by
 * package-relative path. `name` is the validated package name.
 */
export function scaffoldFiles(name) {
  return Object.fromEntries(Object.entries(TEMPLATES).map(([path, text]) => [path, substitute(text, name)]));
}
