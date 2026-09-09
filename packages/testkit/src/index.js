import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { Miniflare } from "miniflare";
import { acquireLocalState } from './local-state.js';

const RESERVED = new Set(["constructor", "fetch", "connect", "alarm", "then", "__proto__", "toString"]);
const validName = value => typeof value === "string" && /^[a-zA-Z0-9:_-]{1,160}$/.test(value);

/**
 * Real local workerd + Worker Loader + DO facets, with caller-owned fixture code.
 * Explicit allowedMethods are test routing, never production authorization.
 * Callers must await dispose() in finally. One runtime lives at a time.
 */
/**
 * A loopback endpoint the supervising object calls to reach the caller's doors.
 *
 * Bound to 127.0.0.1 on an ephemeral port, and closed with the testkit. It
 * carries no credential: whatever authority a door has lives on the far side
 * of `doors.call`, which is the caller's own real door.
 */
async function startDoorBridge(doors) {
  const server = createServer((request, response) => {
    const reply = (status, body) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const key = url.searchParams.get("key") ?? "";
    const method = url.searchParams.get("method") ?? "";
    if (request.method !== "POST" || !key || !method) return reply(400, { error: "door_required" });
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", async () => {
      let args;
      try { args = JSON.parse(Buffer.concat(chunks).toString("utf8") || "[]"); }
      catch { return reply(400, { error: "invalid_json" }); }
      try {
        // A refusal is a VALUE on the far side and stays one here; only a real
        // failure becomes a non-200, so a gadget sees the same refusal shape it
        // sees when installed.
        const result = await doors.call(key, method, Array.isArray(args) ? args : []);
        reply(200, { result });
      } catch (error) {
        reply(502, { error: error instanceof Error ? error.message : String(error) });
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/door`,
    async close() { await new Promise(resolve => server.close(() => resolve())); }
  };
}

export async function createFacetTestkit({ modules, allowedMethods, stateDirectory, doors }) {
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
  /**
   * Connected doors, or none (CON-006).
   *
   * Offline is still the default and still `env: {}` — a gadget loaded with no
   * doors configured reaches nothing, which is the property this testkit
   * exists to prove. `doors` is the CONNECTED path: the caller supplies the
   * spec the platform would supply and a `call` that forwards to the real
   * door, and the isolate reaches it exactly as it reaches a real one.
   */
  if (doors !== undefined) {
    if (!doors || typeof doors !== "object" || Array.isArray(doors)
      || !doors.spec || typeof doors.spec !== "object" || Array.isArray(doors.spec)
      || typeof doors.call !== "function") {
      throw new TypeError("doors must be { spec: { envKey: [method] }, call(envKey, method, args) }");
    }
    for (const [key, names] of Object.entries(doors.spec)) {
      if (!/^[A-Za-z][A-Za-z0-9_:.-]{0,79}$/.test(key) || !Array.isArray(names) || names.length === 0
        || names.some(name => typeof name !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(name))) {
        throw new TypeError("Each door names an env key and at least one method");
      }
    }
  }
  const doorSpec = doors ? JSON.stringify(doors.spec) : "";

  const withDoors = doors
    ? {
        ...modules,
        // Mirrors the platform's own two generated modules verbatim in shape
        // (workspace-room.ts): the isolate never receives door objects — the
        // loader env cannot carry functions or RpcTargets — so it receives a
        // stub plus a spec and builds the facade itself. Same `env.<door>` the
        // gadget sees once installed, which is the only reason the same source
        // runs in both places.
        "agenticos-doors.js": `export function wrapGadgetEnv(env) {
  const room = env.ROOM;
  let spec = {};
  try { spec = JSON.parse(typeof env.DOOR_SPEC === "string" ? env.DOOR_SPEC : "{}"); } catch { spec = {}; }
  const doors = Object.create(null);
  for (const [key, methods] of Object.entries(spec)) {
    if (!Array.isArray(methods)) continue;
    const door = Object.create(null);
    for (const method of methods) {
      if (typeof method !== "string") continue;
      door[method] = async (...args) => {
        const response = await room.fetch(
          "https://testkit/door?key=" + encodeURIComponent(key) + "&method=" + encodeURIComponent(method),
          { method: "POST", body: JSON.stringify(args), headers: { "content-type": "application/json" } }
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error((payload && payload.error) || "door failed");
        return payload && Object.prototype.hasOwnProperty.call(payload, "result") ? payload.result : payload;
      };
    }
    doors[key] = door;
  }
  return { ...env, ...doors };
}`,
        "gadget-boot.js": `import { Gadget as UserGadget } from "./server.js";
import { wrapGadgetEnv } from "./agenticos-doors.js";

export class Gadget extends UserGadget {
  constructor(ctx, env) {
    super(ctx, wrapGadgetEnv(env));
  }
}
`
      }
    : modules;

  const code = Object.fromEntries(Object.entries(withDoors).sort(([a], [b]) => a.localeCompare(b)));
  const methods = [...new Set(allowedMethods)];
  const script = await readFile(new URL("./host.js", import.meta.url), "utf8");
  const state = stateDirectory === undefined ? null : await acquireLocalState(stateDirectory);
  const directory = state?.directory ?? await mkdtemp(join(tmpdir(), "agenticos-facet-testkit-"));
  /**
   * The door bridge: loopback HTTP, because the caller's `call` is a Node
   * function and the isolate is workerd.
   *
   * The LOADED WORKER never reaches this — it keeps `globalOutbound: null` and
   * can only talk to the stub it was handed. Only the supervising Durable
   * Object fetches this URL, which is the same asymmetry the platform has
   * between a gadget isolate and the room that owns it.
   */
  const bridge = doors ? await startDoorBridge(doors) : null;

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
      CODE_KEY: createHash("sha256").update(JSON.stringify(code)).digest("hex"),
      // Empty when offline, which is what keeps the loaded worker's env at {}.
      DOOR_SPEC: doorSpec,
      DOOR_URL: bridge?.url ?? "",
      BOOT_MODULE: doors ? "gadget-boot.js" : "server.js"
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
    // Closed first: a bridge outliving its runtime is a loopback listener
    // nobody owns, and this testkit's whole contract is that it leaves nothing.
    await bridge?.close().catch(() => {});
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
