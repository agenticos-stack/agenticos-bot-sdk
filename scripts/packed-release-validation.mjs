import { posix } from "node:path";

function targets(value) {
  if (typeof value === "string") return [value];
  return value && typeof value === "object" ? Object.values(value).flatMap(targets) : [];
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
