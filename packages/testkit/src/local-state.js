import { mkdir, lstat, readFile, writeFile, rmdir, rename, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const marker = 'agenticos-local-state-v1\n';

// Host-owned development storage only. Never accept a directory from browser RPC.
export async function acquireLocalState(directory, { existingOnly = false } = {}) {
  if (typeof directory !== 'string' || !isAbsolute(directory) || resolve(directory) !== directory || basename(directory) === '')
    throw new TypeError('An explicit absolute local state directory is required');
  const parent = await realpath(dirname(directory));
  const target = join(parent, basename(directory));
  const lock = target + '.lock';
  await mkdir(lock, { mode: 0o700 }).catch(error => {
    if (error.code === 'EEXIST') throw new Error('Local state is locked. Stop its owner first; do not auto-remove stale locks.');
    throw error;
  });
  const release = () => rmdir(lock);
  try {
    let info;
    try { info = await lstat(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!info) {
      if (existingOnly) throw new Error('No local state exists to reset');
      await mkdir(target, { mode: 0o700 });
      await writeFile(join(target, '.bot-state'), marker, { flag: 'wx', mode: 0o600 });
    } else if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`Refusing a local state path that is not a plain directory (a file, or symlinked): ${target}`);
    } else if (await readFile(join(target, '.bot-state'), 'utf8').catch(() => '') !== marker) {
      /*
       * Say which of the two it is, and name the usual cause.
       *
       * "Unowned or symlinked" covered three different situations in one
       * sentence, and the one that actually happens is the dullest: something
       * else created this directory first. A host that starts an agent before
       * the isolate — the ordering a door spec requires, because `env` is
       * shaped at load — will have done `mkdir(stateDirectory, { recursive:
       * true })` on the way to writing its session file, and `recursive: true`
       * creates a PARENT too, so moving the agent into a child does not help.
       * Siblings do.
       */
      throw new Error(
        `Local state directory exists but was not created by the testkit (no .bot-state marker): ${target}. `
        + 'Something else created it first — if a host shares this path with an agent or another writer, '
        + 'give each its own sibling directory rather than a shared parent.'
      );
    }
    return { directory: target, release };
  } catch (error) { await release(); throw error; }
}

/** Recoverable reset. Refuses a running owner; keeps all prior files in a backup. */
export async function archiveLocalState(directory) {
  const state = await acquireLocalState(directory, { existingOnly: true });
  try {
    const backup = state.directory + '.backup-' + randomUUID();
    await rename(state.directory, backup);
    return backup;
  } finally { await state.release(); }
}
