/** SPDX-License-Identifier: Apache-2.0
 * Modified, bounded canonical codec declarations; see ../NOTICE and ../PROVENANCE.md.
 */
export interface BlueprintArchiveMetadata {
  title: string;
  description?: string;
  author?: { type?: string; name?: string; id?: string };
  version?: number;
  bindings?: Record<string, unknown>;
  /** Untrusted package data. The publishing host validates it and owns identity. */
  gadgetDefinition?: unknown;
}

export interface BlueprintArchive {
  metadata: BlueprintArchiveMetadata;
  /** Flat filename to text content. No directory members. */
  files: Record<string, string>;
}

/** Decodes the archive; metadata still requires host validation before use. */
export function readBlueprintArchive(bytes: ArrayBuffer): Promise<BlueprintArchive>;
export function writeBlueprintArchive(input: BlueprintArchive): Promise<ArrayBuffer>;
