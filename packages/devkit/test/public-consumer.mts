import {
  readBlueprintArchive, writeBlueprintArchive, type BlueprintArchive,
  type BlueprintArchiveMetadata
} from '@agenticos-dev/gadget-archive-tools';
import {
  GADGET_COMMAND_KINDS, GADGET_DEFINITION_SCHEMA, GADGET_ENVELOPE_SCHEMA,
  GADGET_ERROR_CODES, GADGET_FIELD_KINDS, GADGET_LIMITS, GADGET_RUNTIME_TIERS,
  GADGET_STATUSES, GADGET_SUPPORTED_RUNTIME_TIERS, GADGET_VIEW_LAYOUTS,
  hasForbiddenKey, isGadgetPath, isMutablePath, validateGadgetDefinition, validateGadgetState,
  type GadgetActionV1, type GadgetBindingRequirementV1, type GadgetCommandKind,
  type GadgetDefinitionV1, type GadgetErrorCode, type GadgetFieldV1,
  type GadgetFieldKind, type GadgetRuntimeTier, type GadgetStatus,
  type GadgetSupportedRuntimeTier, type GadgetValidationIssue, type GadgetViewLayout
} from '@agenticos-dev/gadget-contract';
import {
  PACKAGE_CHECK_STEPS, buildPackage, checkGadgetPackage, initGadgetPackage,
  packGadgetPackage, validatePackage, type PackageScriptRunner,
  type PackageReleaseEvidence, type PackageCheckStep
} from '@agenticos-dev/gadget-devkit';
import SplitView, { type GadgetSplitViewProps } from '@agenticos-dev/gadget-shell/GadgetSplitView.svelte';
import type { ComponentProps, Snippet } from 'svelte';

const definition: GadgetDefinitionV1 = {
  schemaVersion: GADGET_DEFINITION_SCHEMA, key: 'notes', version: 1, title: 'Notes',
  runtimeTier: 'declarative', fields: [{ key: 'text', kind: 'text' }],
  mutable: ['text'], commands: ['state.set'], actions: [],
  views: [{ key: 'main', label: 'Notes', layout: 'full', widgets: [{ type: 'text' }] }]
};
const metadata: BlueprintArchiveMetadata = { title: 'Notes', gadgetDefinition: definition };
const encoded: ArrayBuffer = await writeBlueprintArchive({ metadata, files: { 'agent.md': 'Help with notes.' } });
const archive: BlueprintArchive = await readBlueprintArchive(encoded);
const parsed = validateGadgetDefinition(archive.metadata.gadgetDefinition);
if (parsed.ok && parsed.definition) {
  const definitionKey: string = parsed.definition.key;
  isMutablePath(parsed.definition, 'text');
  void definitionKey;
}
const issue: GadgetValidationIssue | undefined = validateGadgetState({ text: 'Hello' })[0];
const unknownPath: unknown = 'text';
if (isGadgetPath(unknownPath)) unknownPath.toUpperCase();
hasForbiddenKey({ safe: true }, 0);

const vocabulary: [GadgetCommandKind, GadgetErrorCode, GadgetFieldKind, GadgetRuntimeTier,
  GadgetStatus, GadgetSupportedRuntimeTier, GadgetViewLayout, PackageCheckStep] = [
  GADGET_COMMAND_KINDS[0], GADGET_ERROR_CODES[0], GADGET_FIELD_KINDS[0],
  GADGET_RUNTIME_TIERS[0], GADGET_STATUSES[0], GADGET_SUPPORTED_RUNTIME_TIERS[0],
  GADGET_VIEW_LAYOUTS[0], PACKAGE_CHECK_STEPS[0]
];
const schema: 'gadget.envelope.v1' = GADGET_ENVELOPE_SCHEMA;
const stateLimit: 1048576 = GADGET_LIMITS.stateBytes;
const run: PackageScriptRunner = (command, args, options) => {
  const executable: 'npm' = command;
  const script: PackageCheckStep = args[1];
  const noShell: false = options.shell;
  void [executable, script, noShell];
  return { status: 0 };
};
const check = await checkGadgetPackage('./notes', { trustSource: true, run });
const checkScope: 'trusted-local-package-checks' = check.scope;
// Manifest names are forwarded unchecked, not promised to be strings.
// @ts-expect-error unvalidated manifest metadata remains unknown
const assumedName: string = check.packageName;
const built = await buildPackage('./notes');
const bytes: Uint8Array = built.bytes;
const release: PackageReleaseEvidence = built.release;
const integrity = await validatePackage('./notes');
const packed = await packGadgetPackage('./notes', { trustSource: true, run, output: './notes.gadget' });
const packScope: 'local-package-artifact-not-published' = packed.scope;
const copied = await initGadgetPackage('./new-notes', { template: './reviewed-template', name: 'new-notes' });
const copyScope: 'local-template-copy-no-install' = copied.scope;

declare const chat: Snippet;
declare const canvas: Snippet;
const shellProps: ComponentProps<typeof SplitView> = { chat, canvas, canvasScroll: 'clip', chatOpen: false };
const declaredProps: GadgetSplitViewProps = shellProps;
// @ts-expect-error canvas is a required snippet
const missingCanvas: GadgetSplitViewProps = { chat };
// @ts-expect-error shell does not accept an undeclared scroll policy
const invalidScroll: GadgetSplitViewProps = { chat, canvas, canvasScroll: 'scroll' };
// @ts-expect-error this declaration does not grant author-selected runtime tiers
const unsupported: GadgetDefinitionV1 = { ...definition, runtimeTier: 'sandboxed_server' };
// @ts-expect-error catalog actions cannot override host approval policy
const privileged: GadgetActionV1 = { actionKey: 'send', catalogEntryId: 'send', requiresApproval: false };
// @ts-expect-error requirements cannot carry tenant binding assignments
const assignment: GadgetBindingRequirementV1 = { requirementKey: 'notes', kind: 'storage', resolvedId: 'tenant-id' };
// @ts-expect-error finite field vocabulary
const unknownField: GadgetFieldV1 = { key: 'text', kind: 'arbitrary_code' };
// @ts-expect-error archive text members are not binary objects
writeBlueprintArchive({ metadata, files: { 'data.bin': bytes } });
// @ts-expect-error codec requires the exact ArrayBuffer slice, not a byte view
readBlueprintArchive(bytes);
// @ts-expect-error runner must be synchronous
checkGadgetPackage('./notes', { trustSource: true, run: async () => ({ status: 0 }) });
// @ts-expect-error internal implementation subpaths are not public exports
await import('@agenticos-dev/gadget-devkit/src/index.js');
void [issue, vocabulary, schema, stateLimit, checkScope, release, integrity, packScope,
  copyScope, declaredProps, missingCanvas, invalidScroll, unsupported, privileged,
  assignment, unknownField, assumedName];
