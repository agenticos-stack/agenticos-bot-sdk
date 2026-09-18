export interface LocalSessionSeedCall {
  method: string;
  args?: unknown[];
}

/** Connected doors, or none (CON-006). The caller owns what a door reaches. */
export interface LocalSessionDoors {
  /** Maps each env key to the methods the loaded gadget may call on it. */
  spec: Record<string, string[]>;
  call(envKey: string, method: string, args: unknown[]): Promise<unknown>;
}

export interface CreateLocalSessionOptions {
  /** Flat `name.js` → source map; must include `server.js`. */
  modules: Record<string, string>;
  /** Explicit method names the session admits; identity is host-owned. */
  allowedMethods: string[];
  /** Calls replayed through the admitted surface before the session opens. */
  seed?: LocalSessionSeedCall[];
  /** Exact `http:` origins the request boundary admits. */
  origins: string[];
  /**
   * Hostnames `origins` may use. Defaults to loopback only; a caller declares
   * its own development gateway names (for example `gadget.localhost`).
   */
  allowedHostnames?: string[];
  /** Absolute directory for persistent local state; omitted means ephemeral. */
  stateDirectory?: string;
  doors?: LocalSessionDoors | null;
  /** Request body byte limit, 1–4194304. */
  maxRequestBytes?: number;
}

export interface LocalSession {
  mode: "local-runtime";
  identity: { workspace: string; facet: string };
  /** Bearer credential the request boundary requires per call. */
  token: string;
  handle(request: Request): Promise<Response>;
  /** Drains admitted calls, then releases the runtime and its state lock. */
  dispose(): Promise<void>;
}

/**
 * Real local workerd session over createFacetTestkit. Loopback HTTP origins
 * only unless the caller extends `allowedHostnames`. Await dispose() in
 * finally; one runtime holds a state directory at a time.
 */
export function createLocalSession(options: CreateLocalSessionOptions): Promise<LocalSession>;
