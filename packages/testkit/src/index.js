import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Miniflare } from "miniflare";
import { acquireLocalState } from './local-state.js';

const RESERVED = new Set(["constructor", "fetch", "connect", "alarm", "then", "__proto__", "toString"]);
const validName = value => typeof value === "string" && /^[a-zA-Z0-9:_-]{1,160}$/.test(value);

/**
 * Real local workerd + Worker Loader + DO facets, with caller-owned fixture code.
 * Explicit allowedMethods are test routing, never production authorization.
 * Callers must await dispose() in finally. One runtime lives at a time.
 */
export async function createFacetTestkit({ modules, allowedMethods, stateDirectory }) {
  if (!modules || typeof modules !== "object" || Array.isArray(modules)
    || typeof modules["server.js"] !== "string") throw new TypeError("modules must include server.js source");
  for (const [name, source] of Object.entries(modules)) {
    if (!/^[a-zA-Z0-9_-]+\.js$/.test(name) || typeof source !== "string") {
      throw new TypeError("Fixture modules must be flat JavaScript source files");
    }
  }
  if (!Array.isArray(allowedMethods) || allowedMethods.length === 0
    || allowedMethods.some(method => typeof method !== "string" || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(method) || RESERVED.has(method))) {
    throw new TypeError("Explicit non-reserved allowedMethods are required");
  }
  const code = Object.fromEntries(Object.entries(modules).sort(([a], [b]) => a.localeCompare(b)));
  const methods = [...new Set(allowedMethods)];
  const script = await readFile(new URL("./host.js", import.meta.url), "utf8");
  const state = stateDirectory === undefined ? null : await acquireLocalState(stateDirectory);
  const directory = state?.directory ?? await mkdtemp(join(tmpdir(), "agenticos-facet-testkit-"));
  const options = {
    name: "agenticos-facet-testkit",
    script,
    modules: true,
    host: "127.0.0.1",
    port: 0,
    compatibilityDate: "2026-07-02",
    workerLoaders: { LOADER: {} },
    durableObjects: { HOST: { className: "FixtureHost", useSQLite: true } },
    durableObjectsPersist: directory,
    bindings: {
      MODULES: code,
      METHODS: methods,
      CODE_KEY: createHash("sha256").update(JSON.stringify(code)).digest("hex")
    }
  };
  let runtime;
  let disposed = false;
  let busy = false;
  async function start() {
    runtime = new Miniflare(options);
    await runtime.ready;
  }
  async function host(workspace) {
    if (disposed) throw new Error("Testkit disposed");
    if (busy) throw new Error("Testkit restart in progress");
    if (!validName(workspace)) throw new TypeError("Explicit fixture workspace name required");
    const namespace = await runtime.getDurableObjectNamespace("HOST");
    return namespace.get(namespace.idFromName(workspace));
  }
  async function dispose() {
    if (disposed) return;
    disposed = true;
    if (state) {
      // A failed shutdown must retain the lock: an old writer may still exist.
      await runtime?.dispose();
      await state.release();
    } else {
      try { await runtime?.dispose(); }
      finally { await rm(directory, { recursive: true, force: true }); }
    }
  }
  try { await start(); }
  catch (error) { await dispose(); throw error; }
  return {
    async call({ workspace, facet, method, args = [] }) {
      if (!validName(facet)) throw new TypeError("Explicit fixture facet name required");
      if (!methods.includes(method)) throw new Error("Fixture method not admitted");
      if (!Array.isArray(args)) throw new TypeError("args must be an array");
      const serialized = await (await host(workspace)).invoke(facet, method, args);
      return serialized === undefined ? undefined : JSON.parse(serialized);
    },
    async instance(workspace) { return await (await host(workspace)).instance(); },
    async abortFacet({ workspace, facet }) {
      if (!validName(facet)) throw new TypeError("Explicit fixture facet name required");
      await (await host(workspace)).abortFacet(facet);
    },
    async restart() {
      if (disposed || busy) throw new Error("Testkit unavailable");
      busy = true;
      try {
        // Terminates workerd. A fresh process uses the same isolated disk DBs.
        await runtime.dispose();
        await start();
      } finally { busy = false; }
    },
    dispose
  };
}
