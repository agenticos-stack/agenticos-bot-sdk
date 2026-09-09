import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOWS = join(import.meta.dirname, "..", ".github", "workflows");

/**
 * `actions/upload-artifact` skips hidden paths unless told otherwise, and the
 * release candidate lives in `.release-candidate/` — dot-prefixed so it stays
 * gitignored, which is what keeps prepare-release's dirty-tree check clean.
 *
 * The two are in direct tension, and the release path is exercised rarely
 * enough that the collision surfaced only on a real release: prepare packed
 * five tarballs, reported `ready: true`, and the upload then found no files.
 * `publish` consumes exactly that artifact, so an upload that quietly holds
 * nothing is a release that cannot happen — and on the publication receipt,
 * where `if-no-files-found` is `warn`, it would have been lost in silence.
 */
test("every artifact step naming a hidden path opts into hidden files", () => {
  const steps = [];
  for (const file of readdirSync(WORKFLOWS).filter(name => name.endsWith(".yml"))) {
    const text = readFileSync(join(WORKFLOWS, file), "utf8");
    // Known-shape lexical scan: `with:` blocks are flat, so a step's keys are
    // the run of lines sharing one indent after the `uses:` that opens it.
    for (const match of text.matchAll(/^(\s+)- (?:name:[^\n]*\n\s+(?:if:[^\n]*\n\s+)?)?uses: actions\/upload-artifact@[^\n]*\n((?:\1\s+[^\n]*\n)*)/gm)) {
      const [, , body] = match;
      const path = body.match(/^\s+path: (.+)$/m)?.[1]?.trim();
      if (path) steps.push({ file, path, hidden: /include-hidden-files:\s*true/.test(body) });
    }
  }
  assert.ok(steps.length >= 3, `Expected to find the artifact steps; found ${steps.length}.`);
  for (const step of steps) {
    const dotted = step.path.split("/").some(segment => segment.startsWith("."));
    if (dotted) assert.ok(step.hidden, `${step.file}: "${step.path}" is hidden but the step does not set include-hidden-files.`);
  }
});
