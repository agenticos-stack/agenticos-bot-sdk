import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inspectRelease, RELEASE_PACKAGES } from "./release-readiness.mjs";
import { packedEntry, validatePackedRelease } from "./packed-release-validation.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
if (![4, 5].includes(process.argv.length) || process.argv[2] !== "--output"
  || (process.argv.length === 5 && process.argv[4] !== "--bootstrap")) throw new Error("Usage: node scripts/prepare-release.mjs --output <new-directory> [--bootstrap]");
const output = resolve(process.argv[3]);
// Exclusive creation: never replace an earlier candidate's bytes/evidence.
await mkdir(output);
const scratch = await mkdtemp(join(tmpdir(), "gadget-release-config-"));
try {
  const config = join(scratch, "npmrc"), globalConfig = join(scratch, "global-npmrc");
  await writeFile(config, ""); await writeFile(globalConfig, "");
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: scratch };
  const report = await inspectRelease(root, { bootstrap: process.argv[4] === "--bootstrap" });
  const artifacts = [];
  for (const entry of RELEASE_PACKAGES) {
    const manifest = JSON.parse(await readFile(resolve(root, "packages", entry.directory, "package.json"), "utf8"));
    // Shape of `npm pack --json` differs by npm major; packedEntry reads both.
    const packed = packedEntry(JSON.parse(execFileSync("npm", ["--userconfig", config, "--globalconfig", globalConfig,
      "pack", resolve(root, "packages", entry.directory), "--offline", "--ignore-scripts", "--json", "--pack-destination", output
    ], { cwd: scratch, env, encoding: "utf8", timeout: 60000 })));
    if (packed.name !== entry.name || basename(packed.filename) !== packed.filename) throw new Error("Unexpected packed package identity.");
    validatePackedRelease(manifest, packed);
    const paths = packed.files.map(file => file.path);
    if (paths.some(path => /(^|\/)(\.env(?:\.|$)|\.npmrc$|\.git(?:\/|$)|\.dev\.vars|\.wrangler(?:\/|$)|node_modules\/)/.test(path))) throw new Error("Sensitive/dependency path found in packed artifact.");
    const bytes = await readFile(join(output, packed.filename));
    artifacts.push({ name: packed.name, version: packed.version, filename: packed.filename,
      byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), files: paths });
  }
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: root, encoding: "utf8" }).trim().length > 0;
  const lockfileSha256 = createHash("sha256").update(await readFile(join(root, "package-lock.json"))).digest("hex");
  const evidence = { ...report, ready: report.ready && !dirty, sourceCommit, sourceTreeDirty: dirty,
    lockfileSha256, artifacts, publication: "not-attempted", secretScan: "path-screen-only-not-full-source-audit" };
  if (dirty) evidence.blockers.push({ code: "dirty_source", message: "Candidate includes uncommitted source." });
  await writeFile(join(output, "release-candidate.json"), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output, artifactCount: artifacts.length, ready: evidence.ready,
    blockerCount: evidence.blockers.length, publication: evidence.publication }, null, 2));
} finally {
  await rm(scratch, { recursive: true, force: true });
  // Preserve candidate/partial output for inspection. No registry writes occur.
}
