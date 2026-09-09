import { posix } from "node:path";

function targets(value) {
  if (typeof value === "string") return [value];
  return value && typeof value === "object" ? Object.values(value).flatMap(targets) : [];
}

/**
 * Read the single packed entry out of `npm pack --json`, whichever shape npm
 * emitted it in: npm <= 11 returns an ARRAY of entries, npm >= 12 an OBJECT
 * keyed by package name. The release workflow pins npm 12.0.2 and nothing had
 * released since that pin, so destructuring the result as an array threw
 * "object is not iterable" on the first real release. It failed before any
 * registry write, which is the one mercy in it.
 *
 * Both shapes are read rather than the npm version pinned back down: a release
 * script that only works on one npm major breaks silently on the next upgrade,
 * at the exact moment it is needed.
 */
export function packedEntry(packOutput) {
  const [packed] = Array.isArray(packOutput) ? packOutput
    : packOutput && typeof packOutput === "object" ? Object.values(packOutput) : [];
  if (!packed || typeof packed !== "object" || Array.isArray(packed)) {
    throw new Error("npm pack --json returned no packed entry.");
  }
  return packed;
}

/** Validate npm's actual packed-file inventory, not merely the source tree. */
export function validatePackedRelease(manifest, packed) {
  if (packed.name !== manifest.name || packed.version !== manifest.version) {
    throw new Error("Packed package identity/version differs from its manifest.");
  }
  const files = new Set(packed.files.map(file => file.path));
  const required = ["package.json", ...targets(manifest.exports), ...targets(manifest.bin),
    ...targets(manifest.types), ...targets(manifest.main)];
  if (manifest.license === "Apache-2.0") required.push("LICENSE", "NOTICE");
  for (const path of required) {
    if (!path || path.startsWith("/") || path.includes("\\") || path.includes("*")
      || path.split("/").includes("..")) throw new Error(`Non-concrete package target: ${path}`);
    if (!files.has(posix.normalize(path))) throw new Error(`Required target absent from npm artifact: ${path}`);
  }
}
