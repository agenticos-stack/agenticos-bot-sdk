/** Origins a local gadget host may talk to. Local loopback stays the default
 * connected path; production/staging HTTPS are the gadget-dev token path. */

export const PRODUCTION_API_ORIGINS = Object.freeze([
  'https://api.agenticos.hk',
  'https://staging-api.agenticos.hk'
]);

const LOOPBACK_API_HOSTS = new Set(['127.0.0.1', 'localhost']);
const LOOPBACK_FRONTEND_HOSTS = new Set(['127.0.0.1', 'localhost']);

export function assertLocalApiOrigin(apiOrigin) {
  const api = new URL(apiOrigin);
  if (api.origin !== apiOrigin || api.protocol !== 'http:' || !LOOPBACK_API_HOSTS.has(api.hostname))
    throw new Error('Connected preview requires an explicit loopback HTTP API origin.');
}

export function assertRemoteApiOrigin(apiOrigin) {
  const api = new URL(apiOrigin);
  if (api.origin !== apiOrigin || !PRODUCTION_API_ORIGINS.includes(api.origin))
    throw new Error('Connected production preview requires https://api.agenticos.hk or https://staging-api.agenticos.hk.');
}

/**
 * A local frontend origin is loopback HTTP plus whatever development gateway
 * names the caller declares — a generic package does not know a bot's name.
 */
export function assertLocalFrontendOrigin(frontendOrigin, allowedHostnames = []) {
  const frontend = new URL(frontendOrigin);
  const admitted = new Set([...LOOPBACK_FRONTEND_HOSTS, ...allowedHostnames]);
  if (frontend.origin !== frontendOrigin || frontend.protocol !== 'http:' || !admitted.has(frontend.hostname))
    throw new Error('Connected preview requires an explicit local frontend origin.');
}

/**
 * Workspace ids minted by `startWorkspace`: `chat_` plus a UUID. `envVar`
 * names the caller's own variable in the error, so the message points at the
 * thing the developer actually sets.
 */
export function assertGadgetDevWorkspaceId(workspaceId, envVar) {
  if (typeof workspaceId !== 'string' || !/^chat_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId))
    throw new Error(`${envVar} must be the chat_ workspace id returned when the development token was minted.`);
}

export function agentSocketUrl(apiOrigin, workspaceId, ticket) {
  const socket = new URL(apiOrigin);
  socket.protocol = socket.protocol === 'https:' ? 'wss:' : 'ws:';
  socket.pathname = `/v2/workspaces/${encodeURIComponent(workspaceId)}/rpc`;
  socket.search = `?ticket=${encodeURIComponent(ticket)}`;
  return socket.href;
}
