import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// npm ci caches locked tarballs but may not cache registry metadata needed by
// a fresh consumer's offline dependency solver. Seed only public dependencies
// through a disposable online consumer before the offline acceptance checks.
const root = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const scratch = await mkdtemp(join(tmpdir(), "sdk-offline-preparation-"));
try {
  const config = join(scratch, "npmrc"), globalConfig = join(scratch, "global-npmrc");
  await writeFile(config, "");
  await writeFile(globalConfig, "");
  await writeFile(join(scratch, "package.json"), JSON.stringify({ name: "public-cache-preparation", private: true }));
  execFileSync("npm", ["--userconfig", config, "--globalconfig", globalConfig,
    "--registry=https://registry.npmjs.org/", "install", "--ignore-scripts", "--no-audit", "--no-fund",
    `yjs@${root.devDependencies.yjs}`, `svelte@${root.devDependencies.svelte}`], {
    cwd: scratch, env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: scratch },
    stdio: "inherit", timeout: 120000
  });
} finally {
  await rm(scratch, { recursive: true, force: true });
}
