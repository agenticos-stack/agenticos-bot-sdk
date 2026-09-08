import { mkdtemp, mkdir, readFile, writeFile, readdir, copyFile, lstat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

// Trusted local source only: package scripts execute code with local authority.
if (process.argv.length !== 4 || process.argv[3] !== "--trust-source") {
  console.error("Usage: node scripts/check-independent-app.mjs <app-repo> --trust-source");
  process.exit(1);
}
const app = resolve(process.argv[2]);
const sdk = fileURLToPath(new URL("../", import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), "gadget-independent-app-"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  const consumer = join(scratch, "consumer"), packages = join(consumer, ".local-packages");
  await mkdir(packages, { recursive: true });
  const userConfig = join(scratch, "user.npmrc"), globalConfig = join(scratch, "global.npmrc");
  await writeFile(userConfig, "");
  await writeFile(globalConfig, "");
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: scratch };
  const npm = (args, cwd = consumer) => execFileSync("npm", [
    "--userconfig", userConfig, "--globalconfig", globalConfig, ...args
  ], { cwd, env, encoding: "utf8", timeout: 120000 });
  async function copySource(source, target) {
    const info = await lstat(source);
    if (info.isSymbolicLink()) throw new Error("Independent app source must not use symlinks.");
    if (info.isDirectory()) {
      await mkdir(target, { recursive: true });
      for (const name of await readdir(source)) {
        if (name.startsWith(".") || name === "node_modules") throw new Error("Unexpected hidden/dependency source entry.");
        await copySource(join(source, name), join(target, name));
      }
    } else if (info.isFile()) await copyFile(source, target);
    else throw new Error("Unsupported source entry.");
  }
  for (const name of ["package.json", "manifest.json", "definition.json", "src", "scripts", "test"]) {
    await copySource(join(app, name), join(consumer, name));
  }
  const tarballs = [];
  for (const name of ["archive-tools", "gadget-contract", "devkit"]) {
    const [packed] = JSON.parse(npm(["pack", join(sdk, "packages", name), "--offline", "--ignore-scripts", "--json", "--pack-destination", packages]));
    tarballs.push(join(packages, packed.filename));
  }
  const packageJSON = JSON.parse(await readFile(join(consumer, "package.json"), "utf8"));
  for (const [name, version] of Object.entries({ ...packageJSON.dependencies, ...packageJSON.devDependencies })) {
    if (typeof version !== "string" || version.startsWith("workspace:") || version.startsWith("link:")) throw new Error(`Nonportable dependency: ${name}`);
    if (version.startsWith("file:") && !version.startsWith("file:.local-packages/")) throw new Error(`Cross-repository dependency: ${name}`);
  }
  npm(["install", "--save-dev", ...tarballs, "--offline", "--ignore-scripts", "--no-audit", "--no-fund"]);
  const lock = JSON.parse(await readFile(join(consumer, "package-lock.json"), "utf8"));
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (entry.link || name.includes("api-contract") || name.includes("social-content")) throw new Error(`Unexpected dependency closure: ${name}`);
  }
  const cli = join(consumer, "node_modules/@agenticos-dev/bot-devkit/src/cli.mjs");
  const run = (args) => execFileSync(process.execPath, [cli, ...args], { cwd: consumer, env, encoding: "utf8", timeout: 120000 });
  const checks = run(["check", consumer, "--trust-source"]);
  const manifest = JSON.parse(await readFile(join(consumer, "manifest.json"), "utf8"));
  const archive = join(consumer, "dist", manifest.artifact);
  const first = await readFile(archive);
  npm(["run", "build"]);
  npm(["run", "validate"]);
  const second = await readFile(archive);
  if (!first.equals(second)) throw new Error("Archive rebuild is not deterministic.");
  const output = join(scratch, "acceptance.gadget");
  run(["pack", consumer, "--trust-source", "--output", output]);
  if (!(await readFile(output)).equals(second)) throw new Error("Packed bytes differ from validated build.");
  let refusedOverwrite = false;
  try { run(["pack", consumer, "--trust-source", "--output", output]); }
  catch { refusedOverwrite = true; }
  if (!refusedOverwrite || !(await readFile(output)).equals(second)) throw new Error("Existing output was not preserved.");
  console.log(checks.trim());
  console.log(JSON.stringify({
    scope: "trusted-independent-app-offline-tooling-acceptance", packageName: packageJSON.name,
    artifact: manifest.artifact, archiveSha256: sha256(second), byteSize: second.length,
    deterministic: true, overwriteRefused: true, crossRepoWorkspaceLinks: false,
    dependencies: Object.keys(lock.packages).filter(Boolean),
    excluded: ["live-host-admission", "workerd-facet-persistence", "publication", "full-public-license-audit"]
  }, null, 2));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
