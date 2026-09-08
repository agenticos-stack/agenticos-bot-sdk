import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectRelease, RELEASE_PACKAGES } from "../scripts/release-readiness.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "sdk-release-policy-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const save = (path, value) => writeFile(join(root, path), JSON.stringify(value));
  await save("release-policy.json", { schemaVersion: 1, repository: "agenticos-stack/agenticos-gadget-sdk",
    ownerApproval: "approved", license: "MIT", sourceAudit: "approved", npmScopeOwnership: "verified", trustedPublisher: "configured" });
  await writeFile(join(root, "LICENSE"), "Synthetic license marker for policy tests; not an actual license grant.");
  const manifests = new Map();
  for (const entry of RELEASE_PACKAGES) {
    await mkdir(join(root, "packages", entry.directory), { recursive: true });
    const manifest = { name: entry.name, version: "0.1.0", private: false, license: "MIT",
      repository: { type: "git", url: "git+https://github.com/agenticos-stack/agenticos-gadget-sdk.git" },
      files: ["index.js", "index.d.ts"], exports: { ".": { types: "./index.d.ts", import: "./index.js" } }, publishConfig: { access: "public" } };
    manifests.set(entry.directory, manifest);
    await save(`packages/${entry.directory}/package.json`, manifest);
    await writeFile(join(root, "packages", entry.directory, "index.js"), "export {};\n");
    await writeFile(join(root, "packages", entry.directory, "index.d.ts"), "export {};\n");
  }
  return { root, manifests, save };
}

test("declared prerequisites can pass without claiming registry authorization", async t => {
  const { root } = await fixture(t);
  const result = await inspectRelease(root);
  assert.equal(result.ready, true);
  assert.equal(result.scope, "local-declared-release-readiness-not-authorization");
  assert.deepEqual(result.packages.map(row => row.name), RELEASE_PACKAGES.map(row => row.name));
});

test("pending approvals/private packages fail closed", async t => {
  const { root, manifests, save } = await fixture(t);
  await save("release-policy.json", { schemaVersion: 1, repository: "agenticos-stack/agenticos-gadget-sdk", ownerApproval: "pending", license: null });
  await save("packages/sdk/package.json", { ...manifests.get("sdk"), private: true });
  const result = await inspectRelease(root);
  assert.equal(result.ready, false);
  for (const code of ["ownerApproval", "sourceAudit", "npmScopeOwnership", "trustedPublisher", "license_unapproved", "private_package"]) {
    assert.ok(result.blockers.some(row => row.code === code), code);
  }
});

test("dependency closure refuses private paths and mismatched internal versions", async t => {
  const { root, manifests, save } = await fixture(t);
  await save("packages/devkit/package.json", { ...manifests.get("devkit"), dependencies: {
    "@agenticos-dev/gadget-contract": "0.2.0", "@private/api": "file:../../api"
  } });
  const result = await inspectRelease(root);
  assert.ok(result.blockers.some(row => row.code === "dependency_portability"));
  assert.ok(result.blockers.some(row => row.code === "dependency_version"));
});

test("peer entries cannot conceal runtime dependency failures", async t => {
  const { root, manifests, save } = await fixture(t);
  await save("packages/devkit/package.json", { ...manifests.get("devkit"),
    dependencies: { "@agenticos-dev/gadget-contract": "file:../../private-contract" },
    peerDependencies: { "@agenticos-dev/gadget-contract": "0.1.0" }
  });
  const result = await inspectRelease(root);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some(row => row.code === "dependency_portability" && row.message.startsWith("dependencies entry")));
  assert.ok(result.blockers.some(row => row.code === "dependency_version" && row.message.startsWith("dependencies entry")));
});

test("optional dependencies cannot introduce private paths or undeclared internal packages", async t => {
  const { root, manifests, save } = await fixture(t);
  await save("packages/devkit/package.json", { ...manifests.get("devkit"), optionalDependencies: {
    "@private/api": "file:../../api", "@agenticos-dev/private-contract": "0.1.0",
    "@agenticos-dev/gadget-contract": "0.2.0"
  } });
  const result = await inspectRelease(root);
  assert.equal(result.ready, false);
  for (const code of ["dependency_portability", "dependency_unknown_internal", "dependency_version"]) {
    assert.ok(result.blockers.some(row => row.code === code && row.message.startsWith("optionalDependencies entry")), code);
  }
});

test("missing declarations and escaping exports are refused", async t => {
  const { root, manifests, save } = await fixture(t);
  await save("packages/sdk/package.json", { ...manifests.get("sdk"), exports: { ".": "../escape.js" } });
  const result = await inspectRelease(root);
  assert.ok(result.blockers.some(row => row.code === "types_missing"));
  assert.ok(result.blockers.some(row => row.code === "export_path"));
});

test("an exported symlink cannot escape the package", async t => {
  const { root, manifests, save } = await fixture(t);
  await symlink(join(root, "LICENSE"), join(root, "packages/sdk/escape.js"));
  await save("packages/sdk/package.json", { ...manifests.get("sdk"), exports: { ".": { types: "./index.d.ts", import: "./escape.js" } } });
  assert.ok((await inspectRelease(root)).blockers.some(row => row.code === "export_escape"));
});

test("strict CLI exit follows declared readiness, including when release prerequisites are approved", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const report = await inspectRelease(root);
  const result = spawnSync(process.execPath, ["scripts/release-readiness.mjs", "--strict"], { cwd: root, encoding: "utf8", timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, report.ready ? 0 : 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).ready, report.ready);
});

test("workflow has no publication authority", async () => {
  const workflow = await readFile(new URL("../.github/workflows/npm-release-readiness.yml", import.meta.url), "utf8");
  const executable = workflow.split("\n").filter(line => !line.trimStart().startsWith("#")).join("\n");
  assert.doesNotMatch(executable, /npm\s+(?:publish|stage)|id-token:\s*write|NODE_AUTH_TOKEN|NPM_TOKEN/);
  assert.match(executable, /persist-credentials: false/);
});
