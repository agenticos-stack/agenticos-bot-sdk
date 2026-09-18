export interface AssertNoSdkRedefinitionsOptions {
  /** Path → JavaScript source text. */
  files: Record<string, string>;
  /**
   * SDK export name → owner label, or a plain list of names. Derived from the
   * installed packages (`Object.keys(await import(...))`), never kept by hand.
   */
  sdkExports: Map<string, string> | Record<string, string> | string[];
}

/**
 * Fails when a file declares a top-level name an SDK package already exports.
 * Imports and `export … from` re-exports are adoption and never flagged.
 */
export function assertNoSdkRedefinitions(options: AssertNoSdkRedefinitionsOptions): void;
