/**
 * A local declaration that re-implements a name the SDK already exports is a
 * fork that nothing else will ever find. It compiles, it tests, and it drifts
 * — the exact mechanism that left two bots carrying copies of door-certainty,
 * grant-receipt and platform-origin with no owner upstream.
 *
 * Lexical on purpose: the check runs on source text, before bundling and
 * without resolving imports, so it works on `scripts/` and `src/` alike.
 * Declarations are what get flagged — a `import { createRpc }` or an
 * `export { createRpc } from '…'` re-export is adoption, not a copy.
 */

const DECLARATION = /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;

function declaredNames(source) {
  const names = [];
  for (const match of source.matchAll(DECLARATION)) names.push(match[1]);
  return names;
}

/**
 * @param {Record<string, string>} files — path → JavaScript source text.
 * @param {Map<string, string> | Record<string, string> | string[]} sdkExports —
 *   SDK export name → owner label (e.g. a package or module name), or a plain
 *   list of names. Callers derive it from the installed packages —
 *   `Object.keys(await import('@agenticos-dev/bot-shell/client/dom'))` —
 *   never from a list kept by hand.
 */
export function assertNoSdkRedefinitions({ files, sdkExports }) {
  const owned = sdkExports instanceof Map
    ? sdkExports
    : new Map(Array.isArray(sdkExports)
      ? sdkExports.map(name => [name, 'the SDK'])
      : Object.entries(sdkExports ?? {}));
  const collisions = [];
  for (const [path, source] of Object.entries(files ?? {})) {
    for (const name of declaredNames(source)) {
      const owner = owned.get(name);
      if (owner !== undefined) collisions.push(`${path} declares ${name}, which ${owner} already exports`);
    }
  }
  if (collisions.length) {
    throw new Error(`Local declarations collide with SDK exports — import them instead of redefining:\n${collisions.join('\n')}`);
  }
}
