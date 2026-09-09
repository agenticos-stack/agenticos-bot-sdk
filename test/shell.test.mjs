import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { compile } from "svelte/compiler";
import { render } from "svelte/server";

test("shell compiles cleanly and renders paired, collapsed and localized slots", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".shell-test-"));
  try {
    const source = await readFile(new URL("../packages/shell/GadgetSplitView.svelte", import.meta.url), "utf8");
    const compiled = compile(source, { filename: "GadgetSplitView.svelte", generate: "server" });
    assert.deepEqual(compiled.warnings, []);
    await writeFile(join(scratch, "Shell.mjs"), compiled.js.code);
    const wrapper = compile(`
      <script>import Shell from './Shell.mjs'; let {chatOpen=true, canvasScroll='auto', chatSide='right', mobilePane='both'}=$props();</script>
      {#snippet chat()}<button>Fixture conversation</button>{/snippet}
      {#snippet canvas()}<textarea aria-label="Draft">Fixture draft</textarea>{/snippet}
      <Shell {chat} {canvas} {chatOpen} {canvasScroll} {chatSide} {mobilePane} chatLabel="對話" canvasLabel="內容" />
    `, { filename: "Wrapper.svelte", generate: "server" });
    await writeFile(join(scratch, "Wrapper.mjs"), wrapper.js.code);
    const { default: Component } = await import(pathToFileURL(join(scratch, "Wrapper.mjs")));
    const paired = render(Component).body;
    assert.match(paired, /Fixture conversation/);
    assert.match(paired, /Fixture draft/);
    assert.match(paired, /aria-label="對話"/);
    assert.match(paired, /aria-label="內容"/);
    assert.ok(paired.indexOf('aria-label="Draft"') < paired.indexOf('Fixture conversation'));
    const left = render(Component, {props: {chatSide: 'left', mobilePane: 'canvas'}}).body;
    assert.ok(left.indexOf('Fixture conversation') < left.indexOf('aria-label="Draft"'));
    assert.equal((left.match(/Fixture conversation/g) ?? []).length, 1);
    assert.equal((left.match(/Fixture draft/g) ?? []).length, 1);
    assert.match(left, /data-mobile-pane="canvas"/);
    const leftCollapsed = render(Component, {props: {chatSide: 'left', chatOpen: false}}).body;
    assert.doesNotMatch(leftCollapsed, /Fixture conversation/);
    assert.match(leftCollapsed, /Fixture draft/);
    const collapsed = render(Component, { props: { chatOpen: false, canvasScroll: "clip" } }).body;
    assert.doesNotMatch(collapsed, /Fixture conversation/);
    assert.match(collapsed, /Fixture draft/);
    assert.match(collapsed, /canvas-clip/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
