import { DurableObject } from "cloudflare:workers";

/** Local fixture supervisor, NOT AgenticOS authentication/admission logic. */
export class FixtureHost extends DurableObject {
  #instance = crypto.randomUUID();

  instance() { return this.#instance; }

  #facet(name) {
    /**
     * Offline is still the default: with no doors configured the isolate is
     * loaded with `env: {}` and `globalOutbound: null`, reaching nothing.
     *
     * With doors, it is handed exactly what the platform hands a real gadget —
     * a stub it can fetch and a spec — never door objects, because loader env
     * cannot carry functions. `globalOutbound` stays null either way: the door
     * remains the only way out.
     */
    const connected = typeof this.env.DOOR_SPEC === "string" && this.env.DOOR_SPEC.length > 0;
    const worker = this.env.LOADER.get(this.env.CODE_KEY, () => ({
      compatibilityDate: "2026-07-02",
      mainModule: connected ? this.env.BOOT_MODULE : "server.js",
      modules: this.env.MODULES,
      globalOutbound: null,
      env: connected
        ? { ROOM: this.env.HOST.get(this.ctx.id), DOOR_SPEC: this.env.DOOR_SPEC }
        : {}
    }));
    return this.ctx.facets.get(name, () => ({
      class: worker.getDurableObjectClass("Gadget"),
      id: name
    }));
  }

  async invoke(name, method, args) {
    if (!this.env.METHODS.includes(method)) throw new Error("Fixture method not admitted");
    /*
     * ENCODE BEFORE SERIALISING. This line is where typed arrays die.
     *
     * Miniflare's Node proxy retains object results as live RPC proxies, so
     * the result is serialised here rather than handed on as proxy identity.
     * But `JSON.stringify` has no representation for a Uint8Array: it writes
     * an object with one property per byte, about nine characters each, and
     * everything downstream then sees a plain object that no longer knows what
     * it was.
     *
     * `encodeBytes` first ran at the reply boundary in `local-session.js`,
     * which is one line too late — this stringify had already flattened the
     * value and the encoder passed it through untouched. `__botEncodeBytes` is
     * prepended to this file at load time (index.js) because a string script
     * cannot import; rpc-bytes.js still owns the format.
     */
    return JSON.stringify(__botEncodeBytes(await this.#facet(name)[method](...args)));
  }

  /**
   * The gadget's door call, forwarded to whoever owns the real door.
   *
   * Reached only through the stub handed to the isolate as `ROOM`, and only
   * when doors were configured. This object may fetch the loopback bridge; the
   * gadget may not fetch anything at all.
   */
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.endsWith("/door") || !this.env.DOOR_URL) {
      return new Response(JSON.stringify({ error: "unknown_door" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }
    const target = new URL(this.env.DOOR_URL);
    target.search = url.search;
    const response = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: await request.text()
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "content-type": "application/json" }
    });
  }

  abortFacet(name) {
    this.ctx.facets.abort(name, new Error("Explicit local testkit facet restart"));
  }
}

// No network RPC gateway: tests call the in-process Miniflare DO namespace.
export default { fetch() { return new Response("Local testkit has no HTTP API", { status: 404 }); } };
