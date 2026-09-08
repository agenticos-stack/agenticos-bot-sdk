/** Bounded declarations for this extracted validator, not the private API contract.
 * Source revision and pending redistribution approval: ../PROVENANCE.md.
 */
export const GADGET_DEFINITION_SCHEMA: "gadget.definition.v1";
export const GADGET_ENVELOPE_SCHEMA: "gadget.envelope.v1";
export const GADGET_LIMITS: {
  readonly stateBytes: 1048576;
  readonly stringChars: 20000;
  readonly collectionItems: 500;
  readonly definitionFields: 200;
  readonly definitionActions: 60;
  readonly definitionViews: 12;
  readonly definitionRequirements: 60;
  readonly mutablePaths: 300;
  readonly jsonDepth: 12;
  readonly titleChars: 300;
  readonly labelChars: 120;
  readonly keyChars: 80;
};
/** Historical vocabulary. The validator accepts only the supported subset. */
export const GADGET_RUNTIME_TIERS: readonly ["declarative", "sandboxed_client", "sandboxed_server"];
export type GadgetRuntimeTier = (typeof GADGET_RUNTIME_TIERS)[number];
export const GADGET_SUPPORTED_RUNTIME_TIERS: readonly ["declarative"];
export type GadgetSupportedRuntimeTier = (typeof GADGET_SUPPORTED_RUNTIME_TIERS)[number];
export const GADGET_STATUSES: readonly ["draft", "in_review", "ready", "archived"];
export type GadgetStatus = (typeof GADGET_STATUSES)[number];
export const GADGET_COMMAND_KINDS: readonly [
  "state.set", "state.merge", "collection.add", "collection.update", "collection.remove",
  "selection.set", "proposal.accept", "proposal.reject"
];
export type GadgetCommandKind = (typeof GADGET_COMMAND_KINDS)[number];
export const GADGET_FIELD_KINDS: readonly [
  "text", "richText", "number", "boolean", "choice", "collection", "sourceSnapshot", "computed"
];
export type GadgetFieldKind = (typeof GADGET_FIELD_KINDS)[number];
export const GADGET_VIEW_LAYOUTS: readonly ["full", "measured", "stage"];
export type GadgetViewLayout = (typeof GADGET_VIEW_LAYOUTS)[number];
export const GADGET_ERROR_CODES: readonly [
  "gadget_not_found", "gadget_forbidden", "gadget_revision_conflict", "gadget_definition_invalid",
  "gadget_state_invalid", "gadget_command_unsupported", "gadget_path_not_mutable",
  "gadget_payload_too_large", "gadget_runtime_tier_not_supported", "gadget_action_unknown",
  "gadget_action_not_permitted", "gadget_binding_unresolved"
];
export type GadgetErrorCode = (typeof GADGET_ERROR_CODES)[number];

export interface GadgetFieldV1 {
  key: string;
  kind: GadgetFieldKind;
  label?: string;
  maxItems?: number;
  min?: number;
  max?: number;
  options?: string[];
  subjectKind?: string;
}

/** Catalog identity only: effects and approval policies remain host-owned. */
export interface GadgetActionV1 {
  actionKey: string;
  catalogEntryId: string;
  label?: string;
  inputSchema?: Record<string, unknown>;
  outputMapping?: string;
}

/** Capability requests, never granted authority or organization-local assignments. */
export interface GadgetBindingRequirementV1 {
  requirementKey: string;
  kind: "capability" | "connector_resource" | "knowledge_source" | "agent" | "storage";
  label?: string;
  optional?: boolean;
  min?: number;
  max?: number;
  role?: string;
}

export interface GadgetViewV1 {
  key: string;
  label: string;
  layout: GadgetViewLayout;
  widgets: Array<Record<string, unknown>>;
}

export interface GadgetDefinitionV1 {
  schemaVersion: typeof GADGET_DEFINITION_SCHEMA;
  key: string;
  version: number;
  title: string;
  runtimeTier: GadgetSupportedRuntimeTier;
  fields: GadgetFieldV1[];
  mutable: string[];
  commands: GadgetCommandKind[];
  actions: GadgetActionV1[];
  views: GadgetViewV1[];
  requirements?: GadgetBindingRequirementV1[];
  externalInstanceStore?: string;
  distribution?: "platform" | "installed";
  requiresSetup?: boolean;
}

export type GadgetValidationSeverity = "error" | "warning";
export interface GadgetValidationIssue {
  path: string;
  code: string;
  severity: GadgetValidationSeverity;
  message: string;
}
export interface GadgetDefinitionValidationResult {
  ok: boolean;
  definition?: GadgetDefinitionV1;
  issues: GadgetValidationIssue[];
}

export function hasForbiddenKey(value: unknown, depth?: number): boolean;
export function isGadgetPath(value: unknown): value is string;
export function isMutablePath(definition: GadgetDefinitionV1, path: string): boolean;
export function validateGadgetDefinition(value: unknown): GadgetDefinitionValidationResult;
/** Compatibility checks only; this validator does not authorize writes. */
export function validateGadgetState(state: unknown): GadgetValidationIssue[];
