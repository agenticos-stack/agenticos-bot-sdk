export interface LocalStateHandle {
  /** Realpath-resolved state directory. */
  directory: string;
  /** Removes the ownership lock. */
  release(): Promise<void>;
}

/**
 * Claims a host-owned local state directory: absolute, caller-created parents,
 * `.bot-state` marker, exclusive `.lock`. Throws while another owner holds it.
 */
export function acquireLocalState(
  directory: string,
  options?: { existingOnly?: boolean }
): Promise<LocalStateHandle>;

/** Recoverable reset: renames the directory aside and returns the backup path. */
export function archiveLocalState(directory: string): Promise<string>;
