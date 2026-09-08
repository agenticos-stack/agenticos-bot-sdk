import { DurableObject } from "cloudflare:workers";

/** Local fixture supervisor, NOT AgenticOS authentication/admission logic. */
export class FixtureHost extends DurableObject {
  #instance = crypto.randomUUID();

  instance() { return this.#instance; }

  #facet(name) {
    const worker = this.env.LOADER.get(this.env.CODE_KEY, () => ({
      compatibilityDate: "2026-07-02",
      mainModule: "server.js",
      modules: this.env.MODULES,
      globalOutbound: null,
      // No platform bindings, credentials, namespace or capability fixtures.
      env: {}
    }));
    return this.ctx.facets.get(name, () => ({
      class: worker.getDurableObjectClass("Gadget"),
      id: name
    }));
  }

  async invoke(name, method, args) {
    if (!this.env.METHODS.includes(method)) throw new Error("Fixture method not admitted");
    // Miniflare's Node proxy retains object results as live RPC proxies. Serialize
    // here so assertions inspect a settled JSON value, not proxy identity.
    return JSON.stringify(await this.#facet(name)[method](...args));
  }

  abortFacet(name) {
    this.ctx.facets.abort(name, new Error("Explicit local testkit facet restart"));
  }
}

// No network RPC gateway: tests call the in-process Miniflare DO namespace.
export default { fetch() { return new Response("Local testkit has no HTTP API", { status: 404 }); } };
