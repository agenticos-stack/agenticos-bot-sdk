import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { createFacetTestkit } from "../src/index.js";

const source = `import { DurableObject } from "cloudflare:workers";
export class Gadget extends DurableObject {
  #instance = crypto.randomUUID();
  constructor(ctx, env) { super(ctx, env); ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, value TEXT NOT NULL)"); }
  instance() { return this.#instance; }
  put(id, value) { this.ctx.storage.sql.exec("INSERT OR REPLACE INTO entries VALUES (?, ?)", id, value); return true; }
  read(id) { return this.ctx.storage.sql.exec("SELECT value FROM entries WHERE id = ?", id).toArray()[0]?.value ?? null; }
  bindings() { return Object.keys(this.env); }
  async outbound(url) { try { await fetch(url); return false; } catch { return true; } }
}`;

test("real Worker Loader facets keep SQLite across abort and full runtime restart, isolated by facet and host", { timeout: 45000 }, async () => {
  let hits = 0;
  const server = createServer((_request, response) => { hits++; response.end("reachable"); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const outboundUrl = `http://127.0.0.1:${server.address().port}/egress-probe`;
  let rig;
  const closeServer = () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  try { rig = await createFacetTestkit({ modules: { "server.js": source }, allowedMethods: ["instance", "put", "read", "bindings", "outbound"] }); }
  catch (error) { await closeServer(); throw error; }
  const call = (method, args = [], facet = "notes-a", workspace = "workspace-a") => rig.call({ workspace, facet, method, args });
  try {
    const parentBefore = await rig.instance("workspace-a");
    const facetBefore = await call("instance");
    assert.equal(await call("put", ["same-id", "alpha"]), true);
    assert.equal(await call("read", ["same-id"], "notes-b"), null);
    assert.equal(await call("read", ["same-id"], "notes-a", "workspace-b"), null);
    assert.equal(await call("put", ["same-id", "beta"], "notes-b"), true);
    assert.deepEqual(await call("bindings"), []);
    // A reachable controlled listener prevents DNS failure from masquerading as denial.
    assert.equal(await (await fetch(outboundUrl)).text(), "reachable");
    assert.equal(hits, 1);
    assert.equal(await call("outbound", [outboundUrl]), true);
    assert.equal(hits, 1);
    await assert.rejects(call("constructor"), /not admitted/);
    await rig.abortFacet({ workspace: "workspace-a", facet: "notes-a" });
    assert.notEqual(await call("instance"), facetBefore);
    assert.equal(await call("read", ["same-id"]), "alpha");
    const facetAfterAbort = await call("instance");
    await rig.restart();
    assert.notEqual(await rig.instance("workspace-a"), parentBefore);
    assert.notEqual(await call("instance"), facetAfterAbort);
    assert.equal(await call("read", ["same-id"]), "alpha");
    assert.equal(await call("read", ["same-id"], "notes-b"), "beta");
    assert.equal(await call("read", ["same-id"], "notes-a", "workspace-b"), null);
  } finally { try { await rig.dispose(); } finally { await closeServer(); } }
  await assert.rejects(rig.instance("workspace-a"), /disposed/);
});

test("rejects invalid local fixture setup before creating runtime", async () => {
  await assert.rejects(createFacetTestkit({ modules: {}, allowedMethods: ["get"] }), /server.js/);
  await assert.rejects(createFacetTestkit({ modules: { "server.js": source }, allowedMethods: ["constructor"] }), /allowedMethods/);
});
