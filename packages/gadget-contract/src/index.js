const GADGET_DEFINITION_SCHEMA = "gadget.definition.v1";
const GADGET_ENVELOPE_SCHEMA = "gadget.envelope.v1";
const GADGET_LIMITS = {
  /** Canonical state, serialized, per ASSUMPTION-002. */
  stateBytes: 1048576,
  /** Any single string field inside state or a command payload. */
  stringChars: 2e4,
  /** Items in one declared collection. */
  collectionItems: 500,
  /** Declared collections, fields, actions, views, requirements. */
  definitionFields: 200,
  definitionActions: 60,
  definitionViews: 12,
  definitionRequirements: 60,
  /** Mutable-path allowlist entries. */
  mutablePaths: 300,
  /** Depth of any JSON structure we will parse. */
  jsonDepth: 12,
  /** Title and label lengths. */
  titleChars: 300,
  labelChars: 120,
  /** Key-ish identifiers: definition keys, action keys, requirement keys. */
  keyChars: 80
};
const GADGET_RUNTIME_TIERS = ["declarative", "sandboxed_client", "sandboxed_server"];
const GADGET_SUPPORTED_RUNTIME_TIERS = ["declarative"];
const GADGET_STATUSES = ["draft", "in_review", "ready", "archived"];
const GADGET_COMMAND_KINDS = [
  "state.set",
  "state.merge",
  "collection.add",
  "collection.update",
  "collection.remove",
  "selection.set",
  "proposal.accept",
  "proposal.reject"
];
const GADGET_FIELD_KINDS = [
  "text",
  "richText",
  "number",
  "boolean",
  "choice",
  "collection",
  "sourceSnapshot",
  "computed"
];
const GADGET_VIEW_LAYOUTS = ["full", "measured", "stage"];
const GADGET_ERROR_CODES = [
  "gadget_not_found",
  "gadget_forbidden",
  "gadget_revision_conflict",
  "gadget_definition_invalid",
  "gadget_state_invalid",
  "gadget_command_unsupported",
  "gadget_path_not_mutable",
  "gadget_payload_too_large",
  "gadget_runtime_tier_not_supported",
  "gadget_action_unknown",
  "gadget_action_not_permitted",
  "gadget_binding_unresolved"
];
function error(state, path, code, message) {
  state.issues.push({ path, code, severity: "error", message });
}
const FORBIDDEN_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
function hasForbiddenKey(value, depth = 0) {
  if (depth > GADGET_LIMITS.jsonDepth) return true;
  if (Array.isArray(value)) return value.some((item) => hasForbiddenKey(item, depth + 1));
  if (!value || typeof value !== "object") return false;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (hasForbiddenKey(value[key], depth + 1)) return true;
  }
  return false;
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function boundedString(value, max) {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return void 0;
  return trimmed;
}
const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const PATH_PATTERN = /^[a-z][a-z0-9_]*(\[\])?(\.[a-z][a-z0-9_]*(\[\])?)*$/;
function isGadgetPath(value) {
  return typeof value === "string" && value.length <= GADGET_LIMITS.stringChars && PATH_PATTERN.test(value);
}
function isMutablePath(definition, path) {
  if (!isGadgetPath(path)) return false;
  return definition.mutable.includes(path);
}
function validateGadgetDefinition(value) {
  const state = { issues: [] };
  if (!isRecord(value)) {
    error(state, "$", "definition.object", "Definition must be an object.");
    return { ok: false, issues: state.issues };
  }
  if (hasForbiddenKey(value)) {
    error(state, "$", "definition.forbidden_key", "Definition contains a prototype key or exceeds maximum depth.");
    return { ok: false, issues: state.issues };
  }
  const schemaVersion = value.schemaVersion === GADGET_DEFINITION_SCHEMA ? value.schemaVersion : void 0;
  if (!schemaVersion) {
    error(state, "schemaVersion", "schema_version.unsupported", `schemaVersion must be ${GADGET_DEFINITION_SCHEMA}.`);
  }
  const key = boundedString(value.key, GADGET_LIMITS.keyChars);
  if (!key || !KEY_PATTERN.test(key)) {
    error(state, "key", "definition.key.invalid", "key must be lower_snake_case.");
  }
  const version = typeof value.version === "number" && Number.isInteger(value.version) && value.version > 0 ? value.version : void 0;
  if (!version) error(state, "version", "definition.version.invalid", "version must be a positive integer.");
  const title = boundedString(value.title, GADGET_LIMITS.titleChars);
  if (!title) error(state, "title", "definition.title.required", "title is required.");
  const tier = value.runtimeTier;
  let runtimeTier;
  if (tier === "sandboxed_server" || tier === "sandboxed_client") {
    error(
      state,
      "runtimeTier",
      "gadget_runtime_tier_not_supported",
      `${tier} is not a runtime tier. A gadget runs code because it carries code, not because a definition declares a tier.`
    );
  } else if (tier === "declarative") {
    runtimeTier = tier;
  } else {
    error(state, "runtimeTier", "definition.runtime_tier.invalid", `runtimeTier must be one of ${GADGET_SUPPORTED_RUNTIME_TIERS.join(", ")}.`);
  }
  let externalInstanceStore;
  if (value.externalInstanceStore !== void 0) {
    const store = boundedString(value.externalInstanceStore, GADGET_LIMITS.keyChars);
    if (!store || !KEY_PATTERN.test(store)) {
      error(
        state,
        "externalInstanceStore",
        "definition.external_instance_store.invalid",
        "externalInstanceStore must be lower_snake_case when present."
      );
    } else {
      externalInstanceStore = store;
    }
  }
  let distribution;
  if (value.distribution !== void 0) {
    if (value.distribution === "platform" || value.distribution === "installed") {
      distribution = value.distribution;
    } else {
      error(
        state,
        "distribution",
        "definition.distribution.invalid",
        'distribution must be "platform" or "installed" when present.'
      );
    }
  }
  let requiresSetup;
  if (value.requiresSetup !== void 0) {
    if (typeof value.requiresSetup === "boolean") {
      requiresSetup = value.requiresSetup;
    } else {
      error(state, "requiresSetup", "definition.requires_setup.invalid", "requiresSetup must be a boolean when present.");
    }
  }
  const fields = validateFields(value.fields, state);
  const fieldKeys = new Set(fields.map((f) => f.key));
  const mutable = validateMutable(value.mutable, fieldKeys, state);
  const commands = validateCommands(value.commands, state);
  const actions = validateActions(value.actions, state);
  const views = validateViews(value.views, state);
  const requirements = validateRequirements(value.requirements, state);
  if (state.issues.length) return { ok: false, issues: state.issues };
  return {
    ok: true,
    issues: [],
    definition: {
      schemaVersion,
      key,
      version,
      title,
      runtimeTier,
      fields,
      mutable,
      commands,
      actions,
      views,
      ...requirements.length ? { requirements } : {},
      ...externalInstanceStore ? { externalInstanceStore } : {},
      // Absent stays absent: "platform" is only ever declared explicitly by a
      // definition that wants to say so, not stamped on every one that did not.
      ...distribution ? { distribution } : {},
      // Same rule: absent stays absent, and only a definition that declares
      // `true` gets it — `false` is never stamped on the many definitions
      // that never mention this field.
      ...requiresSetup ? { requiresSetup } : {}
    }
  };
}
function validateFields(value, state) {
  if (!Array.isArray(value) || value.length === 0) {
    error(state, "fields", "definition.fields.required", "fields must contain at least one entry.");
    return [];
  }
  if (value.length > GADGET_LIMITS.definitionFields) {
    error(state, "fields", "definition.fields.limit", `fields cannot exceed ${GADGET_LIMITS.definitionFields} entries.`);
    return [];
  }
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  value.forEach((raw, index) => {
    if (!isRecord(raw)) {
      error(state, `fields[${index}]`, "field.object", "Field must be an object.");
      return;
    }
    const key = boundedString(raw.key, GADGET_LIMITS.keyChars);
    if (!key || !KEY_PATTERN.test(key)) {
      error(state, `fields[${index}].key`, "field.key.invalid", "Field key must be lower_snake_case.");
      return;
    }
    if (seen.has(key)) {
      error(state, `fields[${index}].key`, "field.key.duplicate", `Duplicate field key ${key}.`);
      return;
    }
    seen.add(key);
    const kind = GADGET_FIELD_KINDS.find((k) => k === raw.kind);
    if (!kind) {
      error(state, `fields[${index}].kind`, "field.kind.invalid", `Unknown field kind for ${key}.`);
      return;
    }
    const maxItems = typeof raw.maxItems === "number" && Number.isInteger(raw.maxItems) && raw.maxItems > 0 ? Math.min(raw.maxItems, GADGET_LIMITS.collectionItems) : void 0;
    out.push({
      key,
      kind,
      ...boundedString(raw.label, GADGET_LIMITS.labelChars) ? { label: boundedString(raw.label, GADGET_LIMITS.labelChars) } : {},
      ...kind === "collection" ? { maxItems: maxItems ?? GADGET_LIMITS.collectionItems } : {},
      ...typeof raw.min === "number" ? { min: raw.min } : {},
      ...typeof raw.max === "number" ? { max: raw.max } : {},
      ...Array.isArray(raw.options) ? { options: raw.options.filter((o) => typeof o === "string").slice(0, 100) } : {},
      ...boundedString(raw.subjectKind, GADGET_LIMITS.keyChars) ? { subjectKind: boundedString(raw.subjectKind, GADGET_LIMITS.keyChars) } : {}
    });
  });
  return out;
}
function validateMutable(value, fieldKeys, state) {
  if (!Array.isArray(value)) {
    error(state, "mutable", "definition.mutable.required", "mutable must be an array of declared paths.");
    return [];
  }
  if (value.length > GADGET_LIMITS.mutablePaths) {
    error(state, "mutable", "definition.mutable.limit", `mutable cannot exceed ${GADGET_LIMITS.mutablePaths} paths.`);
    return [];
  }
  const out = [];
  value.forEach((raw, index) => {
    if (!isGadgetPath(raw)) {
      error(state, `mutable[${index}]`, "definition.mutable.path_invalid", "Mutable entry is not a valid field path.");
      return;
    }
    const root = raw.split(".")[0].replace("[]", "");
    if (!fieldKeys.has(root)) {
      error(state, `mutable[${index}]`, "definition.mutable.unknown_field", `Mutable path ${raw} names undeclared field ${root}.`);
      return;
    }
    if (!out.includes(raw)) out.push(raw);
  });
  return out;
}
function validateCommands(value, state) {
  if (!Array.isArray(value) || value.length === 0) {
    error(state, "commands", "definition.commands.required", "commands must contain at least one entry.");
    return [];
  }
  const out = [];
  value.forEach((raw, index) => {
    const cmd = GADGET_COMMAND_KINDS.find((c) => c === raw);
    if (!cmd) {
      error(state, `commands[${index}]`, "definition.commands.invalid", "Unknown command kind.");
      return;
    }
    if (!out.includes(cmd)) out.push(cmd);
  });
  return out;
}
function validateActions(value, state) {
  if (value === void 0) return [];
  if (!Array.isArray(value)) {
    error(state, "actions", "definition.actions.array", "actions must be an array.");
    return [];
  }
  if (value.length > GADGET_LIMITS.definitionActions) {
    error(state, "actions", "definition.actions.limit", `actions cannot exceed ${GADGET_LIMITS.definitionActions} entries.`);
    return [];
  }
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  value.forEach((raw, index) => {
    if (!isRecord(raw)) {
      error(state, `actions[${index}]`, "action.object", "Action must be an object.");
      return;
    }
    for (const banned of ["effectClass", "sideEffectClass", "approvalPolicy", "requiresApproval", "capability"]) {
      if (banned in raw) {
        error(
          state,
          `actions[${index}].${banned}`,
          "action.effect_not_author_controlled",
          `${banned} is resolved from the command catalog, not declared by a definition.`
        );
        return;
      }
    }
    const actionKey = boundedString(raw.actionKey, GADGET_LIMITS.keyChars);
    if (!actionKey || !KEY_PATTERN.test(actionKey)) {
      error(state, `actions[${index}].actionKey`, "action.key.invalid", "actionKey must be lower_snake_case.");
      return;
    }
    if (seen.has(actionKey)) {
      error(state, `actions[${index}].actionKey`, "action.key.duplicate", `Duplicate actionKey ${actionKey}.`);
      return;
    }
    seen.add(actionKey);
    const catalogEntryId = boundedString(raw.catalogEntryId, GADGET_LIMITS.keyChars);
    if (!catalogEntryId) {
      error(state, `actions[${index}].catalogEntryId`, "action.catalog_entry.required", "catalogEntryId is required.");
      return;
    }
    out.push({
      actionKey,
      catalogEntryId,
      ...boundedString(raw.label, GADGET_LIMITS.labelChars) ? { label: boundedString(raw.label, GADGET_LIMITS.labelChars) } : {},
      ...isRecord(raw.inputSchema) ? { inputSchema: raw.inputSchema } : {},
      ...isGadgetPath(raw.outputMapping) ? { outputMapping: raw.outputMapping } : {}
    });
  });
  return out;
}
function validateViews(value, state) {
  if (!Array.isArray(value) || value.length === 0) {
    error(state, "views", "definition.views.required", "views must contain at least one entry.");
    return [];
  }
  if (value.length > GADGET_LIMITS.definitionViews) {
    error(state, "views", "definition.views.limit", `views cannot exceed ${GADGET_LIMITS.definitionViews} entries.`);
    return [];
  }
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  value.forEach((raw, index) => {
    if (!isRecord(raw)) {
      error(state, `views[${index}]`, "view.object", "View must be an object.");
      return;
    }
    const key = boundedString(raw.key, GADGET_LIMITS.keyChars);
    if (!key || !KEY_PATTERN.test(key)) {
      error(state, `views[${index}].key`, "view.key.invalid", "View key must be lower_snake_case.");
      return;
    }
    if (seen.has(key)) {
      error(state, `views[${index}].key`, "view.key.duplicate", `Duplicate view key ${key}.`);
      return;
    }
    seen.add(key);
    const label = boundedString(raw.label, GADGET_LIMITS.labelChars);
    const layout = GADGET_VIEW_LAYOUTS.find((l) => l === raw.layout);
    if (!label) error(state, `views[${index}].label`, "view.label.required", "View label is required.");
    if (!layout) error(state, `views[${index}].layout`, "view.layout.invalid", "View layout must be full, measured, or stage.");
    const widgets = Array.isArray(raw.widgets) ? raw.widgets.filter(isRecord).slice(0, 60) : [];
    if (!widgets.length) error(state, `views[${index}].widgets`, "view.widgets.required", "View must declare at least one widget.");
    if (label && layout && widgets.length) out.push({ key, label, layout, widgets });
  });
  return out;
}
function validateRequirements(value, state) {
  if (value === void 0) return [];
  if (!Array.isArray(value)) {
    error(state, "requirements", "definition.requirements.array", "requirements must be an array.");
    return [];
  }
  if (value.length > GADGET_LIMITS.definitionRequirements) {
    error(state, "requirements", "definition.requirements.limit", "Too many requirements.");
    return [];
  }
  const kinds = /* @__PURE__ */ new Set(["capability", "connector_resource", "knowledge_source", "agent", "storage"]);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  value.forEach((raw, index) => {
    if (!isRecord(raw)) {
      error(state, `requirements[${index}]`, "requirement.object", "Requirement must be an object.");
      return;
    }
    if ("resolvedId" in raw || "value" in raw) {
      error(state, `requirements[${index}]`, "requirement.assignment_present", "A requirement must not carry an assignment value.");
      return;
    }
    const requirementKey = boundedString(raw.requirementKey, GADGET_LIMITS.keyChars);
    if (!requirementKey || seen.has(requirementKey)) {
      error(state, `requirements[${index}].requirementKey`, "requirement.key.invalid", "requirementKey must be present and unique.");
      return;
    }
    seen.add(requirementKey);
    const kind = typeof raw.kind === "string" && kinds.has(raw.kind) ? raw.kind : void 0;
    if (!kind) {
      error(state, `requirements[${index}].kind`, "requirement.kind.invalid", "Unknown requirement kind.");
      return;
    }
    let min;
    let max;
    const rawMin = typeof raw.min === "number" && Number.isInteger(raw.min) && raw.min > 0 ? raw.min : void 0;
    const rawMax = typeof raw.max === "number" && Number.isInteger(raw.max) && raw.max > 0 ? raw.max : void 0;
    if (raw.min !== void 0 && rawMin === void 0) {
      error(state, `requirements[${index}].min`, "requirement.min.invalid", "min must be a positive integer when present.");
      return;
    }
    if (raw.max !== void 0 && rawMax === void 0) {
      error(state, `requirements[${index}].max`, "requirement.max.invalid", "max must be a positive integer when present.");
      return;
    }
    if (rawMin !== void 0 || rawMax !== void 0) {
      min = rawMin ?? 1;
      max = rawMax ?? min;
      if (min > max) {
        error(state, `requirements[${index}].max`, "requirement.max.less_than_min", "max must be greater than or equal to min.");
        return;
      }
      if (max > GADGET_LIMITS.definitionRequirements) {
        error(state, `requirements[${index}].max`, "requirement.max.limit", `max cannot exceed ${GADGET_LIMITS.definitionRequirements}.`);
        return;
      }
    }
    const role = boundedString(raw.role, GADGET_LIMITS.keyChars);
    if (raw.role !== void 0 && (!role || !KEY_PATTERN.test(role))) {
      error(state, `requirements[${index}].role`, "requirement.role.invalid", "role must be lower_snake_case when present.");
      return;
    }
    out.push({
      requirementKey,
      kind,
      ...boundedString(raw.label, GADGET_LIMITS.labelChars) ? { label: boundedString(raw.label, GADGET_LIMITS.labelChars) } : {},
      ...raw.optional === true ? { optional: true } : {},
      ...min !== void 0 ? { min } : {},
      ...max !== void 0 ? { max } : {},
      ...role ? { role } : {}
    });
  });
  return out;
}
function validateGadgetState(state) {
  const issues = [];
  if (!isRecord(state)) {
    issues.push({ path: "$", code: "gadget_state_invalid", severity: "error", message: "State must be an object." });
    return issues;
  }
  if (hasForbiddenKey(state)) {
    issues.push({ path: "$", code: "gadget_state_invalid", severity: "error", message: "State contains a prototype key or exceeds maximum depth." });
    return issues;
  }
  const serialized = JSON.stringify(state);
  if (serialized.length > GADGET_LIMITS.stateBytes) {
    issues.push({
      path: "$",
      code: "gadget_payload_too_large",
      severity: "error",
      message: `State exceeds ${GADGET_LIMITS.stateBytes} bytes.`
    });
  }
  return issues;
}
export {
  GADGET_COMMAND_KINDS,
  GADGET_DEFINITION_SCHEMA,
  GADGET_ENVELOPE_SCHEMA,
  GADGET_ERROR_CODES,
  GADGET_FIELD_KINDS,
  GADGET_LIMITS,
  GADGET_RUNTIME_TIERS,
  GADGET_STATUSES,
  GADGET_SUPPORTED_RUNTIME_TIERS,
  GADGET_VIEW_LAYOUTS,
  hasForbiddenKey,
  isGadgetPath,
  isMutablePath,
  validateGadgetDefinition,
  validateGadgetState
};
