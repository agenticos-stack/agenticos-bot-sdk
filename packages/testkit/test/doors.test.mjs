import assert from "node:assert/strict";
import test from "node:test";
import { createFacetTestkit } from "../src/index.js";

// A gadget reaching a door. The isolate never receives door objects — loader
// env cannot carry functions — so it receives a stub and a spec and builds
// `env.<door>.<method>` itself, exactly as the platform does. What these pin
// is that the facade is the same one a gadget sees when installed, and that
// offline stays offline.
const source = `import { DurableObject } from "cloudflare:workers";
export class Gadget extends DurableObject {
  bindings() { return Object.keys(this.env).sort(); }
  async ping(account) { return this.env.fetch_door.socialPostsForAccount(account); }
  async missing() { return typeof this.env.absent_door; }
  async pingSafe(account) {
    try { return { ok: true, value: await this.env.fetch_door.socialPostsForAccount(account) }; }
    catch (error) { return { ok: false, message: String(error && error.message || error) }; }
  }
  async outbound(url) { try { await fetch(url); return "reached"; } catch { return "blocked"; } }
}`;

test("a gadget calls a door and gets the owner's real answer back", { timeout: 45000 }, async () => {
  const seen = [];
  const rig = await createFacetTestkit({
    modules: { "server.js": source },
    allowedMethods: ["bindings", "ping", "missing", "outbound"],
    doors: {
      spec: { fetch_door: ["socialPostsForAccount"] },
      async call(key, method, args) {
        seen.push({ key, method, args });
        return { posts: [{ id: "p1", account: args[0] }] };
      }
    }
  });
  try {
    const value = await rig.call({
      workspace: "w", facet: "f", method: "ping", args: ["@someaccount"]
    });
    assert.deepEqual(value, { posts: [{ id: "p1", account: "@someaccount" }] });
    assert.deepEqual(seen, [
      { key: "fetch_door", method: "socialPostsForAccount", args: ["@someaccount"] }
    ]);

    // The declared door is in env under the name the gadget writes; one that
    // was never granted is simply absent, which is what an installed gadget
    // sees too.
    const names = await rig.call({ workspace: "w", facet: "f", method: "bindings", args: [] });
    assert.ok(names.includes("fetch_door"), `expected fetch_door in ${names.join(", ")}`);
    assert.equal(await rig.call({ workspace: "w", facet: "f", method: "missing", args: [] }), "undefined");

    // The door is the only way out. Connecting one does not open the network.
    assert.equal(
      await rig.call({ workspace: "w", facet: "f", method: "outbound", args: ["http://127.0.0.1:1/"] }),
      "blocked"
    );
  } finally {
    await rig.dispose();
  }
});

test("a door failure reaches the gadget as a catchable error", { timeout: 45000 }, async () => {
  // The platform throws inside the isolate when a door call fails, and the
  // gadget is expected to handle it — the same shape an installed gadget sees.
  // Asserted from INSIDE the gadget on purpose: letting the throw escape a
  // facet call is what breaks the actor's output gate, so what matters is that
  // the author can catch it, not what the harness does if nobody does.
  const rig = await createFacetTestkit({
    modules: { "server.js": source },
    allowedMethods: ["pingSafe"],
    doors: {
      spec: { fetch_door: ["socialPostsForAccount"] },
      async call() { throw new Error("provider unavailable"); }
    }
  });
  try {
    const outcome = await rig.call({ workspace: "w", facet: "f", method: "pingSafe", args: ["@a"] });
    assert.equal(outcome.ok, false);
    assert.match(outcome.message, /provider unavailable|door failed/);
  } finally {
    await rig.dispose();
  }
});

test("offline stays offline: no doors configured means an empty env", { timeout: 45000 }, async () => {
  const rig = await createFacetTestkit({
    modules: { "server.js": source },
    allowedMethods: ["bindings", "missing"]
  });
  try {
    assert.deepEqual(await rig.call({ workspace: "w", facet: "f", method: "bindings", args: [] }), []);
    assert.equal(await rig.call({ workspace: "w", facet: "f", method: "missing", args: [] }), "undefined");
  } finally {
    await rig.dispose();
  }
});

test("refuses a malformed doors option rather than loading half a facade", async () => {
  const modules = { "server.js": source };
  for (const doors of [
    { spec: {}, call: "nope" },
    { spec: { "bad key!": ["ok"] }, call: async () => null },
    { spec: { good: [] }, call: async () => null },
    { spec: { good: ["not a method"] }, call: async () => null }
  ]) {
    await assert.rejects(
      createFacetTestkit({ modules, allowedMethods: ["ping"], doors }),
      /doors must be|Each door names/
    );
  }
});
