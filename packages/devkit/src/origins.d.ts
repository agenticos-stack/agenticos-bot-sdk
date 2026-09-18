export const PRODUCTION_API_ORIGINS: readonly ["https://api.agenticos.hk", "https://staging-api.agenticos.hk"];

/** Requires an exact `http:` origin on loopback. */
export function assertLocalApiOrigin(apiOrigin: string): void;

/** Requires an exact origin present in PRODUCTION_API_ORIGINS. */
export function assertRemoteApiOrigin(apiOrigin: string): void;

/**
 * Loopback HTTP plus the caller's own development gateway hostnames — a
 * generic package does not know a bot's name.
 */
export function assertLocalFrontendOrigin(frontendOrigin: string, allowedHostnames?: string[]): void;

/**
 * `chat_`-prefixed UUID minted by startWorkspace. `envVar` names the caller's
 * own environment variable in the error.
 */
export function assertGadgetDevWorkspaceId(workspaceId: string, envVar: string): void;

/** ws(s) RPC socket URL for a workspace, ticket in the query. */
export function agentSocketUrl(apiOrigin: string, workspaceId: string, ticket: string): string;
