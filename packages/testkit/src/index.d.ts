import type { LocalSessionDoors } from "./local-session.js";

export interface CreateFacetTestkitOptions {
  /** Flat `name.js` → source map; must include `server.js`. */
  modules: Record<string, string>;
  /** Explicit non-reserved method names the rig admits. */
  allowedMethods: string[];
  /** Absolute directory for persistent state; omitted means ephemeral. */
  stateDirectory?: string;
  /** Connected doors, or none — `null` and `undefined` both mean absent. */
  doors?: LocalSessionDoors | null;
}

export interface FacetTestkit {
  call(call: { workspace: string; facet: string; method: string; args?: unknown[] }): Promise<unknown>;
  instance(workspace: string): Promise<unknown>;
  abortFacet(target: { workspace: string; facet: string }): Promise<void>;
  /** Disposes workerd and restarts it against the same persisted state. */
  restart(): Promise<void>;
  /** Closes the door bridge, disposes workerd, releases the state lock. */
  dispose(): Promise<void>;
}

/**
 * Real local workerd + Worker Loader + DO facets, with caller-owned fixture
 * code. `allowedMethods` is test routing, never production authorization.
 * Await dispose() in finally; one runtime holds a state directory at a time.
 */
export function createFacetTestkit(options: CreateFacetTestkitOptions): Promise<FacetTestkit>;
