import test from "node:test";
import assert from "node:assert/strict";
import { validatePackedRelease } from "../scripts/packed-release-validation.mjs";

const manifest = { name: "@agenticos-dev/example", version: "0.1.0",
  exports: { ".": { types: "./src/index.d.ts", import: "./src/index.js" } },
  bin: { example: "./src/cli.mjs" } };
const packed = { name: manifest.name, version: manifest.version,
  files: ["package.json", "src/index.d.ts", "src/index.js", "src/cli.mjs"].map(path => ({ path })) };

test("actual packed inventory contains every public entry and CLI", () => {
  assert.doesNotThrow(() => validatePackedRelease(manifest, packed));
  for (const missing of ["src/index.d.ts", "src/index.js", "src/cli.mjs"]) {
    assert.throws(() => validatePackedRelease(manifest, { ...packed,
      files: packed.files.filter(file => file.path !== missing) }), /absent from npm artifact/);
  }
});

test("packed version mismatches and non-concrete export targets fail closed", () => {
  assert.throws(() => validatePackedRelease(manifest, { ...packed, version: "0.2.0" }), /identity\/version/);
  for (const path of ["../escape.js", "/index.js", "src/*.js", "src\\index.js"]) {
    assert.throws(() => validatePackedRelease({ ...manifest, exports: path }, packed), /Non-concrete/);
  }
});

test("Apache candidates must contain both the license and attribution notice", () => {
  const licensed = { ...manifest, license: "Apache-2.0" };
  for (const missing of ["LICENSE", "NOTICE"]) {
    const files = [...packed.files, ...["LICENSE", "NOTICE"].filter(path => path !== missing).map(path => ({ path }))];
    assert.throws(() => validatePackedRelease(licensed, { ...packed, files }), /absent from npm artifact/);
  }
  assert.doesNotThrow(() => validatePackedRelease(licensed, { ...packed,
    files: [...packed.files, { path: "LICENSE" }, { path: "NOTICE" }] }));
});
