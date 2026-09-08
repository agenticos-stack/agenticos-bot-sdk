import { readFile, access, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Explicit release order. Actual apps and the experimental testkit are not
// implicitly published just because another directory appears under packages/.
export const RELEASE_PACKAGES = Object.freeze([
  { directory: "gadget-contract", name: "@agenticos-dev/bot-contract" },
  { directory: "archive-tools", name: "@agenticos-dev/bot-archive-tools" },
  { directory: "sdk", name: "@agenticos-dev/bot-sdk" },
  { directory: "shell", name: "@agenticos-dev/bot-shell" },
  { directory: "devkit", name: "@agenticos-dev/bot-devkit" }
]);
const repository = "agenticos-stack/agenticos-gadget-sdk";
const load = async path => JSON.parse(await readFile(path, "utf8"));
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const relativeFile = value => typeof value === "string" && value.length > 0 && !isAbsolute(value)
  && !value.split(/[\\/]/).some(part => part === "..") && !value.includes("*");
function exportPaths(value, result = []) {
  if (typeof value === "string") result.push(value);
  else if (value && typeof value === "object") for (const child of Object.values(value)) exportPaths(child, result);
  return result;
}

/** Reports declared readiness, not an authorization, legal or registry audit. */
export async function inspectRelease(root, { bootstrap = false } = {}) {
  root = await realpath(root);
  const blockers = [], packages = [];
  const block = (code, message, name) => blockers.push({ code, message, ...(name ? { package: name } : {}) });
  const policy = await load(resolve(root, "release-policy.json"));
  if (policy.schemaVersion !== 1 || policy.repository !== repository) block("policy_invalid", "Release policy schema/repository must match the SDK.");
  for (const [key, expected] of [["ownerApproval", "approved"], ["sourceAudit", "approved"],
    ["npmScopeOwnership", "verified"]]) {
    if (policy[key] !== expected) block(key, `${key} remains ${policy[key] ?? "unset"}.`);
  }
  if (bootstrap) {
    if (policy.bootstrapPublish !== "approved") block("bootstrap_unapproved", "First-publication authorization is required.");
  } else if (policy.trustedPublisher !== "configured") {
    block("trustedPublisher", "Trusted publisher remains unconfigured.");
  }
  if (typeof policy.license !== "string" || !policy.license.trim() || policy.license === "UNLICENSED") block("license_unapproved", "Owner-selected SDK license remains unresolved.");
  if (!await exists(resolve(root, "LICENSE"))) block("license_missing", "Approved root LICENSE is absent.");
  for (const entry of RELEASE_PACKAGES) {
    const directory = resolve(root, "packages", entry.directory);
    const manifest = await load(resolve(directory, "package.json"));
    packages.push({ ...entry, version: manifest.version, private: manifest.private === true });
    if (bootstrap && manifest.version !== "0.1.0") block("bootstrap_version", "Bootstrap approval covers only initial version 0.1.0.", entry.name);
    if (manifest.name !== entry.name) block("name_mismatch", "Package name differs from the explicit release list.", entry.name);
    if (manifest.private !== false) block("private_package", "Package has not been explicitly enabled for publication.", entry.name);
    if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version) || manifest.version === "0.0.0") block("version_unset", "Choose a release version.", entry.name);
    if (manifest.license !== policy.license || !manifest.license) block("package_license", "Package license must match the approved policy.", entry.name);
    const repo = typeof manifest.repository === "object" ? manifest.repository.url : manifest.repository;
    if (repo !== `git+https://github.com/${repository}.git`) block("package_repository", "Package must identify the exact public SDK repository.", entry.name);
    if (manifest.publishConfig?.access !== "public") block("package_access", "Scoped package public access must be explicit.", entry.name);
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) block("package_files", "Package must use an explicit packed-file list.", entry.name);
    const paths = exportPaths(manifest.exports);
    if (!paths.some(path => /\.d\.(ts|mts|cts)$/.test(path))) block("types_missing", "Public exports need TypeScript declarations.", entry.name);
    for (const path of paths) {
      if (!relativeFile(path)) { block("export_path", "Export must resolve to a concrete package-local file.", entry.name); continue; }
      try {
        const part = relative(await realpath(directory), await realpath(resolve(directory, path)));
        if (!part || part === ".." || part.startsWith(`..${sep}`) || isAbsolute(part)) block("export_escape", "Export escapes its package.", entry.name);
      } catch { block("export_missing", `Export target is missing: ${path}`, entry.name); }
    }
    // Do not merge sections: a peer range must not conceal a runtime file link,
    // and optional dependencies are still part of the published install graph.
    for (const section of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      for (const [name, version] of Object.entries(manifest[section] ?? {})) {
        if (typeof version !== "string" || !version.trim() || /^(workspace:|file:|link:|https?:|git\+|\.\.?\/)/.test(version)) block("dependency_portability", `${section} entry ${name} is not registry-portable.`, entry.name);
        const internal = RELEASE_PACKAGES.find(item => item.name === name);
        if (name.startsWith("@agenticos-dev/") && !internal) block("dependency_unknown_internal", `${section} entry ${name} is outside the explicit public release set.`, entry.name);
        if (internal) {
          const dependency = await load(resolve(root, "packages", internal.directory, "package.json"));
          if (version !== dependency.version) block("dependency_version", `${section} entry ${name} must match the exact release version.`, entry.name);
        }
      }
    }
  }
  return { schemaVersion: 1, scope: "local-declared-release-readiness-not-authorization",
    repository, mode: bootstrap ? "owner-approved-first-publication" : "trusted-publisher", ready: blockers.length === 0, packages, blockers };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some(arg => !["--strict", "--bootstrap"].includes(arg))) throw new Error("Usage: node scripts/release-readiness.mjs [--strict] [--bootstrap]");
  const report = await inspectRelease(fileURLToPath(new URL("../", import.meta.url)), { bootstrap: args.includes("--bootstrap") });
  console.log(JSON.stringify(report, null, 2));
  if (args.includes("--strict") && !report.ready) process.exitCode = 1;
}
