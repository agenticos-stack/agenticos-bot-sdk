import { test } from "node:test";
import assert from "node:assert/strict";
import { installDomStub, StubNode } from "./shell-client-dom-stub.mjs";

const documentStub = installDomStub();

const { createRpc, chunkBytes, assembleChunkedBlobUrl } = await import("../packages/shell/client/rpc.js");
const { esc, el, icon, iconMarkup, replace, relativeLabel, relativeTimeFrom, createEl, skeleton, skeletonEl } = await import("../packages/shell/client/dom.js");
const { announce, createToaster } = await import("../packages/shell/client/toast.js");
const { goToStep, setMobilePane, stepperMarkup, stepperEl } = await import("../packages/shell/client/steps.js");
const { confirmDrawerChoice, dialogShell, showDialog } = await import("../packages/shell/client/drawer.js");
const collection = await import("../packages/shell/client/collection.js");

// --- rpc.js ---------------------------------------------------------------

test("createRpc wraps only the declared methods", () => {
  const calls = [];
  const gadget = { ping: (...a) => (calls.push(["ping", ...a]), "pong"), secret: () => "no" };
  const api = createRpc(gadget, ["ping"]);
  assert.equal(api.ping(1, 2), "pong");
  assert.deepEqual(calls, [["ping", 1, 2]]);
  assert.equal(api.secret, undefined);
});

test("createRpc refuses a missing stub or an empty method list", () => {
  assert.throws(() => createRpc(null, ["ping"]), /gadget stub/);
  assert.throws(() => createRpc({}, []), /method list/);
  assert.throws(() => createRpc({}, [""]), /non-empty/);
});

test("chunkBytes reads every shape the trip produces", () => {
  assert.deepEqual([...chunkBytes(new Uint8Array([1, 2]))], [1, 2]);
  assert.deepEqual([...chunkBytes([3, 4])], [3, 4]);
  assert.deepEqual([...chunkBytes({ type: "Buffer", data: [5, 6] })], [5, 6]);
  assert.deepEqual([...chunkBytes({ 0: 7, 1: 8 })], [7, 8]); // serialised Uint8Array: index-keyed, no length
  assert.equal(chunkBytes(null).byteLength, 0);
});

test("assembleChunkedBlobUrl counts what arrived against what was promised", async () => {
  const pages = [
    { mime: "image/png", chunks: 2, total: 4, bytes: [1, 2] },
    { bytes: [3, 4] }
  ];
  const { total } = await assembleChunkedBlobUrl(async (i) => pages[i]);
  assert.equal(total, 4);
  await assert.rejects(
    assembleChunkedBlobUrl(async (i) => (i === 0 ? { chunks: 1, total: 9, bytes: [1] } : null)),
    /1 of 9 bytes/
  );
  await assert.rejects(
    assembleChunkedBlobUrl(async () => ({ ok: false, code: "gone", message: "expired" })),
    /expired/
  );
});

// --- dom.js (pure half) ----------------------------------------------------

test("esc escapes every markup metacharacter", () => {
  assert.equal(esc(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  assert.equal(esc(null), "");
});

test("iconMarkup and skeleton produce the canvas-contract markup", () => {
  assert.match(iconMarkup("check"), /^<svg[^>]*viewBox="0 0 24 24"/);
  assert.throws(() => iconMarkup("not-an-icon"), /Unknown icon/);
  assert.match(skeleton(54), /class="skeleton bot-skeleton[^"]*"[^>]*height:54px/);
});

test("relativeLabel speaks both locales the canvases ship", () => {
  const now = Date.now();
  assert.equal(relativeLabel("en", new Date(now - 3 * 86_400_000).toISOString(), now), "3 days ago");
  assert.equal(relativeLabel("zh-HK", new Date(now - 3 * 86_400_000).toISOString(), now), "3 日前");
  assert.equal(relativeLabel("en", new Date(now).toISOString(), now), "just now");
  assert.equal(relativeTimeFrom("not a date"), null);
});

// --- dom.js (node builders, against the stub) ------------------------------

test("el builds a node with attrs, dataset, listeners and children", () => {
  let clicked = 0;
  const node = el("button", { class: "bot-button", type: "button", dataset: { key: "k1" }, onclick: () => clicked++ }, ["Save"]);
  assert.equal(node.tagName, "button");
  assert.equal(node.className, "bot-button");
  assert.equal(node.dataset.key, "k1");
  assert.equal(node.textContent, "Save");
  node.dispatch("click");
  assert.equal(clicked, 1);
});

test("createEl applies the bot's class adapter without touching the source name", () => {
  const elx = createEl({ "x-card": "bot-card" });
  const node = elx("div", { class: "x-card" });
  assert.ok(node.classList.contains("x-card"));
  assert.ok(node.classList.contains("bot-card"));
});

test("svgEl + icon build namespaced nodes and reject unknown names", () => {
  const svg = icon("check");
  assert.equal(svg.tagName, "svg");
  assert.equal(svg.children.length, 1);
  assert.throws(() => icon("bogus"), /Unknown icon/);
});

test("replace clears and re-fills a container in one step", () => {
  const box = el("div");
  replace(box, [el("span", null, "a"), null, el("span", null, "b")]);
  assert.equal(box.children.length, 2);
  replace(box, []);
  assert.equal(box.children.length, 0);
});

// --- toast.js ---------------------------------------------------------------

test("announce writes the toast host and shows it", () => {
  const host = new StubNode("div");
  documentStub.querySelector = (q) => (q === "#toast" ? host : null);
  announce("Saved", { duration: 5 });
  assert.equal(host.textContent, "Saved");
  assert.ok(host.classList.contains("show"));
  documentStub.querySelector = () => null;
});

test("createToaster renders title, body, action and dismiss into the region", () => {
  const region = new StubNode("div");
  const toaster = createToaster(region, { dismissLabel: "Dismiss" });
  let ran = 0;
  toaster.show({ title: "Refused", body: "Policy", action: { label: "Fix", run: () => ran++ } });
  const card = region.children[0];
  assert.equal(card.className, "bot-toast-card");
  const buttons = card.children.filter((c) => c.tagName === "button");
  assert.equal(buttons.length, 2);
  buttons[0].dispatch("click"); // action: clears itself and runs
  assert.equal(ran, 1);
  assert.equal(region.children.length, 0);
});

// --- steps.js ---------------------------------------------------------------

test("goToStep admits only declared steps; setMobilePane only declared panes", () => {
  const state = { step: "select", mobilePane: "source" };
  assert.equal(goToStep(state, "draft", ["select", "draft"]).step, "draft");
  assert.equal(goToStep(state, "bogus", ["select", "draft"]).step, "select");
  assert.equal(setMobilePane(state, "preview", ["source", "draft", "preview"]).mobilePane, "preview");
  assert.equal(setMobilePane(state, "bogus", ["source"]).mobilePane, "source");
});

test("stepperMarkup emits the .stepper contract; stepperEl emits bot-steps", () => {
  const html = stepperMarkup(["Audience", "Content", "Review"], 1);
  assert.match(html, /class="stepper"/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /data-done="true"/);
  const nav = stepperEl(["One", "Two"], 0, { onStep: () => {} });
  assert.equal(nav.className, "bot-steps");
  assert.equal(nav.children.filter((c) => c.className === "bot-steps-step").length, 2);
});

// --- drawer.js --------------------------------------------------------------

test("confirmDrawerChoice resolves the choice and closes the dialog", async () => {
  const dlg = new StubNode("dialog");
  dlg.open = false;
  dlg.showModal = () => { dlg.open = true; };
  dlg.close = () => { dlg.open = false; };
  const decision = confirmDrawerChoice(dlg, {
    title: "Unsaved", body: "Discard?",
    choices: [{ value: "keep", label: "Keep" }, { value: "discard", label: "Discard", primary: true }]
  });
  assert.ok(dlg.open);
  const buttons = dlg.children[0].children[2].children;
  buttons[1].dispatch("click");
  assert.equal(await decision, "discard");
  assert.equal(dlg.open, false);
});

test("confirmDrawerChoice ignores a close that left the dialog open, resolves 'cancel' on a real one", async () => {
  const dlg = new StubNode("dialog");
  dlg.open = false;
  dlg.showModal = () => { dlg.open = true; };
  dlg.close = () => { dlg.open = false; };
  const decision = confirmDrawerChoice(dlg, { title: "B", body: [], choices: [{ value: "y", label: "y" }] });
  // A `close` event can arrive while the dialog is open again — a previous
  // prompt's delayed event. It must not answer this prompt.
  dlg.dispatch("close");
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(dlg.open);
  dlg.open = false; // now the dismissal is real
  dlg.dispatch("close");
  assert.equal(await decision, "cancel");
});

// --- collection.js ----------------------------------------------------------

test("collection reducers keep state plain and immutable", () => {
  let s = collection.createCollectionState();
  s = collection.setItems(s, { items: [{ id: "a", seen: false, selected: false }, { id: "b", seen: true, selected: false }] });
  assert.equal(collection.newCount(s), 1);
  s = collection.applySelection(s, "a", true);
  assert.deepEqual(collection.selectedIds(s), ["a"]);
  // A refetch racing a local selection keeps the local flag.
  s = collection.mergeScanResult(s, [{ id: "a", seen: false, selected: false }, { id: "c", seen: false, selected: false }]);
  assert.equal(collection.findItem(s, "a").selected, true);
  assert.equal(collection.findItem(s, "c").selected, false);
  s = collection.setNotice(s, { message: "refused", actionLabel: "Review" });
  assert.equal(s.notice.actionLabel, "Review");
  s = collection.clearNotice(s);
  assert.equal(s.notice, null);
});

test("visibleItems applies filter, source chip and search in order", () => {
  let s = collection.createCollectionState({ filter: "new" });
  s = collection.setItems(s, {
    items: [
      { id: "a", seen: false, sourceBinding: "ig", text: "Hello there" },
      { id: "b", seen: true, sourceBinding: "fb", text: "Other" }
    ]
  });
  assert.deepEqual(collection.visibleItems(s).map((i) => i.id), ["a"]); // "new" facet = unseen
  s = collection.setFilter(s, "all", ["all", "new"]);
  assert.equal(collection.visibleItems(s).length, 2);
  s = collection.setSourceFilter(s, "ig");
  assert.deepEqual(collection.visibleItems(s).map((i) => i.id), ["a"]);
  s = collection.setSourceFilter(s, "ig"); // same chip toggles off
  s = collection.setSearch(s, "hello");
  assert.deepEqual(collection.visibleItems(s).map((i) => i.id), ["a"]);
});

test("reviewTabs derives tabs from the definition's review_state options", () => {
  const options = ["drafting", "in_review", "approved", "scheduled", "sent"];
  const open = ["drafting", "in_review"];
  const vocab = { approved: { label: ["Approved", "已核准"] }, scheduled: { label: ["Scheduled", "已排程"] }, sent: { label: ["Sent", "已發送"] } };
  const tabs = collection.reviewTabs({ options, open, vocab });
  assert.deepEqual(tabs.map((t) => t.id), ["all", "draft", "approved", "scheduled", "sent"]);
  assert.deepEqual(tabs[1].states, ["drafting", "in_review"]); // open states fold into Drafts
  // Adding a state to the definition adds a tab — no canvas edit.
  const more = collection.reviewTabs({ options: [...options, "recalled"], open, vocab });
  assert.equal(more.at(-1).id, "recalled");
  assert.deepEqual(more.at(-1).label, ["recalled", "recalled"]);
});

test("showDialog mounts markup into the shared dialog element", () => {
  const dlg = new StubNode("dialog");
  dlg.open = false;
  dlg.showModal = () => { dlg.open = true; };
  documentStub.querySelector = (q) => (q === "#dialog" ? dlg : null);
  showDialog("<p>hi</p>", { drawer: true });
  assert.ok(dlg.open);
  assert.equal(dlg.className, "bot-drawer");
  assert.equal(dlg.innerHTML, "<p>hi</p>");
  documentStub.querySelector = () => null;
});
