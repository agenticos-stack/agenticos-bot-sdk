import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readBlueprintArchive } from "../../archive-tools/src/index.js";
import { createFacetTestkit } from "../src/index.js";

test("actual packed Notes server: CRUD, conflict, facet isolation and persistent full workerd restart", { timeout: 45000 }, async t => {
  const archivePath = process.env.NOTES_GADGET_ARCHIVE;
  assert.ok(archivePath, "Set NOTES_GADGET_ARCHIVE explicitly; this acceptance does not silently skip or substitute fixtures");
  const bytes = await readFile(archivePath);
  const { files } = await readBlueprintArchive(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.equal(typeof files["server.js"], "string");
  assert.equal(typeof files["storage.js"], "string");
  t.diagnostic(`Artifact SHA-256: ${createHash("sha256").update(bytes).digest("hex")}`);
  const rig = await createFacetTestkit({
    modules: { "server.js": files["server.js"], "storage.js": files["storage.js"] },
    allowedMethods: ["listNotes", "getNote", "createNote", "updateNote", "deleteNote"]
  });
  const call = (method, args = [], facet = "notes-a", workspace = "workspace-a") => rig.call({ workspace, facet, method, args });
  try {
    const before = await rig.instance("workspace-a");
    const created = await call("createNote", [{ id: "shared-id", title: "Original", body: "Persist me" }]);
    assert.equal(created.ok, true);
    assert.equal(created.revision, 1);
    assert.equal((await call("listNotes", [{}])).value.notes.length, 1);
    assert.equal((await call("getNote", ["shared-id"], "notes-b")).code, "not_found");
    assert.equal((await call("getNote", ["shared-id"], "notes-a", "workspace-b")).code, "not_found");
    assert.equal((await call("createNote", [{ id: "shared-id", title: "Other facet", body: "Different" }], "notes-b")).ok, true);
    const updated = await call("updateNote", [{ id: "shared-id", title: "Updated", body: "Survives restart", expectedRevision: 1 }]);
    assert.equal(updated.revision, 2);
    assert.equal((await call("updateNote", [{ id: "shared-id", title: "Stale", body: "Must not write", expectedRevision: 1 }])).code, "revision_conflict");
    await rig.abortFacet({ workspace: "workspace-a", facet: "notes-a" });
    assert.deepEqual(await call("getNote", ["shared-id"]), updated);
    await rig.restart();
    assert.notEqual(await rig.instance("workspace-a"), before);
    assert.deepEqual(await call("getNote", ["shared-id"]), updated);
    assert.equal((await call("getNote", ["shared-id"], "notes-b")).value.title, "Other facet");
    assert.equal((await call("getNote", ["shared-id"], "notes-a", "workspace-b")).code, "not_found");
    assert.equal((await call("deleteNote", [{ id: "shared-id", expectedRevision: 1 }])).code, "revision_conflict");
    const deleted = await call("deleteNote", [{ id: "shared-id", expectedRevision: 2 }]);
    assert.equal(deleted.ok, true);
    assert.equal(deleted.revision, 3);
    await rig.restart();
    assert.equal((await call("getNote", ["shared-id"])).code, "not_found");
    assert.deepEqual(await call("deleteNote", [{ id: "shared-id", expectedRevision: 2 }]), deleted);
    assert.equal((await call("createNote", [{ id: "shared-id", title: "Original", body: "Persist me" }])).code, "not_found");
    assert.equal((await call("listNotes", [{}])).value.notes.length, 0);
  } finally { await rig.dispose(); }
});
