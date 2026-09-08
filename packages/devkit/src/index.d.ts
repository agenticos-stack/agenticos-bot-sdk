import type { GadgetDefinitionV1 } from "@agenticos-dev/bot-contract";

export const PACKAGE_CHECK_STEPS: readonly ["test", "build", "validate"];
export type PackageCheckStep = (typeof PACKAGE_CHECK_STEPS)[number];

/** Synchronous script runner injection for tests; not a sandbox or permission gate. */
export type PackageScriptRunner = (
  command: "npm",
  args: ["run", PackageCheckStep],
  options: { cwd: string; stdio: "inherit"; shell: false; timeout: 120000 }
) => { status: number | null; error?: Error; signal?: string | null };

export interface PackageCheckOptions {
  /** Must be true to execute source scripts with local user authority. */
  trustSource?: boolean;
  run?: PackageScriptRunner;
}

export interface PackageCheckResult {
  /** Manifest name is forwarded, not validated by the script orchestrator. */
  packageName: unknown;
  steps: PackageCheckStep[];
  scope: "trusted-local-package-checks";
}

export interface PackageReleaseEvidence {
  schemaVersion: "ai-agent-package-release.v1";
  blueprintKey: string;
  artifact: string;
  sha256: string;
  byteSize: number;
  definition: GadgetDefinitionV1;
  files: Record<string, string>;
  provenance: {
    status: "incomplete-local-evidence";
    sourceCommit: null;
    lockfileSha256: string | null;
    /** Manifest compatibility data is retained, not certified. */
    runtimeCompatibility: unknown;
  };
}

export interface PackageIntegrityResult {
  artifact: string;
  sha256: string;
  byteSize: number;
  scope: "local-archive-integrity";
}

export interface PackagePackResult extends Omit<PackageIntegrityResult, "scope"> {
  output: string;
  scope: "local-package-artifact-not-published";
}

/** Requires explicit trustSource:true at runtime. Runs test, build, then validate. */
export function checkGadgetPackage(directory: string, options?: PackageCheckOptions): Promise<PackageCheckResult>;
/** Writes the app's dist artifact and release.json, never publishes it. */
export function buildPackage(directory: string): Promise<{
  /** Exposed as a byte view; the Node implementation returns a Buffer subtype. */
  bytes: Uint8Array;
  files: Record<string, string>;
  release: PackageReleaseEvidence;
}>;
export function validatePackage(directory: string): Promise<PackageIntegrityResult>;
/** Requires an explicit .gadget output and trustSource:true; refuses overwrite. */
export function packGadgetPackage(
  directory: string,
  options?: PackageCheckOptions & { output?: string }
): Promise<PackagePackResult>;
/** Requires both options at runtime; copies a reviewed local template without install. */
export function initGadgetPackage(
  destination: string,
  options?: { template?: string; name?: string }
): Promise<{ directory: string; packageName: string; scope: "local-template-copy-no-install" }>;
