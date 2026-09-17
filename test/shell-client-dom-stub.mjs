// A deliberately small DOM stub — just enough surface for the client modules'
// node builders (el/svgEl/replace/createToaster/confirmDrawerChoice) to run
// under node:test without a browser. It is NOT a DOM: querySelector resolves
// nothing, events are recorded and dispatched synchronously, and there is no
// layout. Canvases run in real documents; this exists so the module logic —
// what gets built, which listener fires — is testable here.

export class StubClassList {
  #set = new Set();
  add(...names) { for (const n of names) if (n) this.#set.add(n); }
  remove(...names) { for (const n of names) this.#set.delete(n); }
  contains(name) { return this.#set.has(name); }
  get size() { return this.#set.size; }
  toString() { return [...this.#set].join(" "); }
  [Symbol.iterator]() { return this.#set[Symbol.iterator](); }
}

export class StubNode {
  constructor(tag, ns = null) {
    this.tagName = tag;
    this.ns = ns;
    this.children = [];
    this.childNodes = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.classList = new StubClassList();
    this.listeners = {};
    this.value = "";
    this._text = "";
  }
  get className() { return this.classList.toString(); }
  set className(v) { this.classList = new StubClassList(); this.classList.add(...String(v).split(/\s+/)); }
  get textContent() { return this._text || this.childNodes.map((c) => c.textContent ?? "").join(""); }
  set textContent(v) { this._text = String(v); this.childNodes = []; }
  get innerHTML() { return this._html ?? ""; }
  set innerHTML(v) { this._html = String(v); this.childNodes = []; }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k.startsWith("data-")) this.dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  appendChild(child) { this.childNodes.push(child); if (child instanceof StubNode) this.children.push(child); return child; }
  replaceChildren(...nodes) { this.childNodes = []; this.children = []; for (const n of nodes) this.appendChild(n); }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn); }
  dispatch(type, event = {}) { for (const fn of this.listeners[type] ?? []) fn(event); }
  querySelector() { return null; }
  focus() { this.focused = true; }
}

export function installDomStub() {
  const documentStub = {
    createElement: (tag) => new StubNode(tag),
    createElementNS: (ns, tag) => new StubNode(tag, ns),
    createTextNode: (value) => ({ textContent: String(value), nodeType: 3 }),
    querySelector: () => null,
    activeElement: null,
    head: new StubNode("head"),
    body: new StubNode("body")
  };
  globalThis.document = documentStub;
  globalThis.Node = StubNode;
  globalThis.CSS = { escape: (s) => String(s) };
  return documentStub;
}
