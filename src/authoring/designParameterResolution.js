import {
  DESIGN_PARAMETER_CATALOG_VERSION,
  designParameterCatalog
} from "./instructionalDesignContracts.js";
import {
  InstructionalDesignValidationError,
  assertInstructionalDesignPersistenceSafety,
  normalizeDesignParameterAssignment,
  normalizeDesignParameterDefinition,
  normalizeEffectiveDesignSnapshot,
  normalizeInstructionalAnalysis
} from "./instructionalDesignValidation.js";
import {
  resolveVersionedResourceSets,
  resourceSetRefsFromParameterValue
} from "./resourceSetResolution.js";

export const DESIGN_SCOPE_ORDER = Object.freeze([
  "workspace",
  "course",
  "module",
  "lesson",
  "microsequence"
]);

const EXPECTED_RESOLUTION_RULE = Object.freeze({
  strategy: "nearest_scope_replaces",
  sameScopeConflict: "error",
  assignmentValue: "complete_value",
  researchLockAuthority: "separate_gate"
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function scopeKey(value) {
  return `${text(value?.kind)}:${text(value?.ref)}`;
}

function definitionKey(value) {
  return JSON.stringify([text(value?.id), text(value?.version)]);
}

function assignmentDefinitionKey(value) {
  return definitionKey(value?.definitionRef);
}

function stableValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableValue(value[key])}`
    )).join(",")}}`;
  }
  return `${typeof value}:${JSON.stringify(value)}`;
}

function sameValue(left, right) {
  return stableValue(left) === stableValue(right);
}

function conflict(code, message, details = {}) {
  return { code, message, ...details };
}

function reference(value) {
  if (typeof value === "string") {
    if ((value.match(/@/gu) || []).length !== 1) return null;
    const separator = value.lastIndexOf("@");
    return separator > 0 ? { id: value.slice(0, separator), version: value.slice(separator + 1) } : null;
  }
  if (value && typeof value === "object" && text(value.id) && text(value.version)) {
    return { id: text(value.id), version: text(value.version) };
  }
  return null;
}

export function validateDesignResolutionPath(resolutionPath, targetScope) {
  const errors = [];
  const targetIndex = DESIGN_SCOPE_ORDER.indexOf(targetScope?.kind);
  const expectedKinds = targetIndex >= 0 ? DESIGN_SCOPE_ORDER.slice(0, targetIndex + 1) : [];
  const actualKinds = list(resolutionPath).map(({ kind }) => kind);
  if (JSON.stringify(actualKinds) !== JSON.stringify(expectedKinds)) {
    errors.push(conflict(
      "invalid_resolution_path",
      `A cadeia precisa seguir ${expectedKinds.join(" → ")} até o alvo.`
    ));
  }
  if (scopeKey(list(resolutionPath).at(-1)) !== scopeKey(targetScope)) {
    errors.push(conflict(
      "resolution_path_target_mismatch",
      "O último escopo da cadeia precisa ser o alvo resolvido."
    ));
  }
  const keys = list(resolutionPath).map(scopeKey);
  if (new Set(keys).size !== keys.length) {
    errors.push(conflict("duplicate_resolution_scope", "A cadeia repete um escopo."));
  }
  return { ok: errors.length === 0, errors, scopeKeys: keys };
}

function checkDefinitionRule(definition, conflicts) {
  if (!sameValue(definition.resolutionRule, EXPECTED_RESOLUTION_RULE)) {
    conflicts.push(conflict(
      "unsupported_resolution_rule",
      `O parâmetro ${definitionKey(definition)} usa regra de resolução não suportada.`,
      { definitionRef: definitionKey(definition) }
    ));
  }
}

function validateValueAgainstDefinition(definition, value, conflicts, path) {
  if (!value || value.kind !== definition.valueType) {
    conflicts.push(conflict(
      "parameter_value_type_mismatch",
      `${path} precisa usar valor ${definition.valueType}.`,
      { definitionRef: definitionKey(definition) }
    ));
    return;
  }
  const constraints = definition.constraints || {};
  const numbers = value.kind === "range"
    ? [value.minimum, value.maximum]
    : value.kind === "integer" ? [value.value] : [];
  if (value.kind === "range" && value.minimum > value.maximum) {
    conflicts.push(conflict("inverted_parameter_range", `${path} possui intervalo invertido.`));
  }
  numbers.forEach((number) => {
    if (typeof constraints.minimum === "number" && number < constraints.minimum) {
      conflicts.push(conflict("parameter_below_minimum", `${path} viola o mínimo definido.`));
    }
    if (typeof constraints.maximum === "number" && number > constraints.maximum) {
      conflicts.push(conflict("parameter_above_maximum", `${path} viola o máximo definido.`));
    }
  });
  if (value.kind === "enum" && list(constraints.allowedEnumValues).length
    && !constraints.allowedEnumValues.includes(value.value)) {
    conflicts.push(conflict("invalid_parameter_enum", `${path} usa enumeração não permitida.`));
  }
  if (value.kind === "set" && constraints.setItemPattern) {
    let pattern;
    try {
      pattern = new RegExp(constraints.setItemPattern, "u");
    } catch {
      conflicts.push(conflict(
        "invalid_parameter_set_pattern",
        `${path} referencia uma expressão regular inválida.`
      ));
      return;
    }
    list(value.values).forEach((entry) => {
      if (typeof entry !== "string" || !pattern.test(entry)) {
        conflicts.push(conflict("invalid_parameter_set_item", `${path} contém item fora do contrato.`));
      }
    });
  }
  if (value.kind === "vector" && list(constraints.vectorDimensions).length) {
    list(value.components).forEach(({ dimension }) => {
      if (!constraints.vectorDimensions.includes(dimension)) {
        conflicts.push(conflict("invalid_parameter_vector_dimension", `${path} contém dimensão não permitida.`));
      }
    });
  }
  if (value.kind === "relation" && list(constraints.relationKinds).length) {
    list(value.edges).forEach(({ kind }) => {
      if (!constraints.relationKinds.includes(kind)) {
        conflicts.push(conflict("invalid_parameter_relation_kind", `${path} contém relação não permitida.`));
      }
    });
  }
  if (value.kind === "relation") {
    const nodes = new Set(list(value.nodes));
    const edgeKeys = new Set();
    list(value.edges).forEach((edge) => {
      if (!nodes.has(edge?.from) || !nodes.has(edge?.to)) {
        conflicts.push(conflict(
          "invalid_parameter_relation_endpoint",
          `${path} contém aresta com endpoint ausente.`
        ));
      }
      const edgeKey = stableValue([edge?.from, edge?.to, edge?.kind]);
      if (edgeKeys.has(edgeKey)) {
        conflicts.push(conflict(
          "duplicate_parameter_relation_edge",
          `${path} repete uma aresta semântica.`
        ));
      }
      edgeKeys.add(edgeKey);
    });
  }
}

function normalizeDefaultValue(raw, index) {
  assertInstructionalDesignPersistenceSafety(raw);
  const required = ["definitionRef", "scope", "value", "rationale", "provenanceRefs"];
  const unknown = Object.keys(raw || {}).filter((key) => !required.includes(key));
  const missing = required.filter((key) => !Object.hasOwn(raw || {}, key));
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || unknown.length || missing.length) {
    throw new InstructionalDesignValidationError("designParameterDefault", [{
      path: `defaults[${index}]`,
      message: "Default precisa ser objeto fechado com definição, escopo, valor e proveniência.",
      code: "invalid_default"
    }]);
  }
  return structuredClone(raw);
}

export function listApplicableDesignParameterDefinitions({
  definitions = designParameterCatalog(),
  scopeKind
} = {}) {
  return list(definitions)
    .map(normalizeDesignParameterDefinition)
    .filter((definition) => definition.supportedScopes.includes(scopeKind));
}

function chooseResolvedValue({ definition, assignments, defaults, pathDepth, conflicts }) {
  const key = definitionKey(definition);
  const candidates = assignments.map((assignment) => ({
    source: "assignment",
    assignment,
    scope: assignment.scope,
    depth: pathDepth.get(scopeKey(assignment.scope)),
    value: assignment.value
  }));
  const defaultCandidates = defaults.map((entry) => ({
    source: "default",
    defaultValue: entry,
    scope: entry.scope,
    depth: pathDepth.get(scopeKey(entry.scope)),
    value: entry.value
  }));
  const byDepthAndMode = new Map();
  candidates.forEach((candidate) => {
    const slot = `${candidate.depth}:${candidate.assignment.mode}`;
    const entries = byDepthAndMode.get(slot) || [];
    entries.push(candidate);
    byDepthAndMode.set(slot, entries);
  });
  for (const [slot, entries] of byDepthAndMode) {
    if (entries.length > 1) {
      conflicts.push(conflict(
        "same_scope_assignment_conflict",
        `O parâmetro ${key} possui ${entries.length} assignments da mesma autoridade no mesmo escopo.`,
        {
          definitionRef: key,
          depth: entries[0].depth,
          assignmentMode: entries[0].assignment.mode,
          slot,
          assignmentRefs: entries.map(({ assignment }) => `${assignment.id}@${assignment.version}`)
        }
      ));
    }
  }
  const locks = candidates.filter(({ assignment }) => assignment.mode === "research_lock");
  if (locks.length) {
    const lockValues = new Set(locks.map(({ value }) => stableValue(value)));
    if (lockValues.size > 1) {
      conflicts.push(conflict(
        "research_lock_conflict",
        `Research locks incompatíveis atingem o parâmetro ${key}.`,
        { definitionRef: key }
      ));
      return null;
    }
    const chosenLock = [...locks].sort((left, right) => right.depth - left.depth)[0];
    const forbiddenLowerAssignments = candidates.filter((candidate) => (
      candidate.assignment.mode !== "research_lock"
      && locks.some((lock) => (
        candidate.depth >= lock.depth && !sameValue(candidate.value, lock.value)
      ))
    ));
    forbiddenLowerAssignments.forEach((candidate) => {
      const blockingLock = [...locks]
        .filter((lock) => candidate.depth >= lock.depth)
        .sort((left, right) => right.depth - left.depth)[0];
      conflicts.push(conflict(
        "research_lock_blocks_lower_assignment",
        `O lock de pesquisa de ${key} impede assignment inferior ${candidate.assignment.id}.`,
        {
          definitionRef: key,
          lockAssignmentRef: `${blockingLock.assignment.id}@${blockingLock.assignment.version}`,
          blockedAssignmentRef: `${candidate.assignment.id}@${candidate.assignment.version}`
        }
      ));
    });
    return chosenLock;
  }
  const manualOverrides = candidates.filter(({ assignment }) => (
    assignment.mode === "manual_override"
  )).sort((left, right) => right.depth - left.depth);
  if (manualOverrides.length) return manualOverrides[0];
  const automaticAssignments = candidates.filter(({ assignment }) => (
    assignment.mode === "auto"
  )).sort((left, right) => right.depth - left.depth);
  if (automaticAssignments.length) return automaticAssignments[0];
  const defaultsByDepth = new Map();
  defaultCandidates.forEach((candidate) => {
    const entries = defaultsByDepth.get(candidate.depth) || [];
    entries.push(candidate);
    defaultsByDepth.set(candidate.depth, entries);
  });
  for (const [depth, entries] of defaultsByDepth) {
    if (entries.length > 1) {
      conflicts.push(conflict(
        "same_scope_default_conflict",
        `O parâmetro ${key} possui defaults conflitantes no mesmo escopo.`,
        { definitionRef: key, depth }
      ));
    }
  }
  return [...defaultCandidates].sort((left, right) => right.depth - left.depth)[0] || null;
}

export function resolveEffectiveDesignParameters({
  analysis: rawAnalysis,
  definitions: rawDefinitions = designParameterCatalog(),
  assignments: rawAssignments = [],
  defaults: rawDefaults = [],
  resolutionPath,
  resourceSets = [],
  resourceCatalogVersion = null,
  packageRegistry = null,
  requiredDefinitionRefs = [],
  workspaceRevision,
  scopeEntityVersion,
  snapshotId,
  snapshotVersion = "1.0.0",
  resolutionVersion = "1.0.0",
  frozenAt
} = {}) {
  const conflicts = [];
  const invalidCollections = [
    ["definitions", rawDefinitions],
    ["assignments", rawAssignments],
    ["defaults", rawDefaults],
    ["resolutionPath", resolutionPath],
    ["resourceSets", resourceSets],
    ["requiredDefinitionRefs", requiredDefinitionRefs]
  ].filter(([, value]) => !Array.isArray(value));
  if (invalidCollections.length) {
    return {
      ok: false,
      conflicts: [conflict(
        "invalid_resolution_input",
        `Coleções da resolução precisam ser listas: ${invalidCollections.map(([key]) => key).join(", ")}.`
      )],
      unresolvedDefinitionRefs: [],
      snapshot: null
    };
  }
  let analysis;
  let definitions;
  let assignments;
  let defaults;
  const normalizedResolutionPath = list(resolutionPath);
  try {
    analysis = normalizeInstructionalAnalysis(rawAnalysis);
    definitions = list(rawDefinitions).map(normalizeDesignParameterDefinition);
    assignments = list(rawAssignments).map(normalizeDesignParameterAssignment);
    defaults = list(rawDefaults).map(normalizeDefaultValue);
  } catch (cause) {
    if (cause instanceof InstructionalDesignValidationError) {
      const invalidPattern = cause.errors.some(({ code }) => (
        code === "invalid_parameter_set_pattern"
      ));
      return {
        ok: false,
        conflicts: [conflict(
          invalidPattern ? "invalid_parameter_set_pattern" : "invalid_resolution_input",
          cause.message,
          { cause }
        )],
        unresolvedDefinitionRefs: [],
        snapshot: null
      };
    }
    throw cause;
  }
  const pathResult = validateDesignResolutionPath(normalizedResolutionPath, analysis.scope);
  conflicts.push(...pathResult.errors);
  const normalizedWorkspaceRevision = Number(workspaceRevision);
  const normalizedScopeEntityVersion = scopeEntityVersion === null
    ? null
    : Number(scopeEntityVersion);
  if (!Number.isSafeInteger(normalizedWorkspaceRevision) || normalizedWorkspaceRevision < 1) {
    conflicts.push(conflict(
      "invalid_workspace_revision",
      "A resolução exige a revisão corrente e explícita do workspace."
    ));
  } else if (normalizedWorkspaceRevision < analysis.derivedFrom.workspaceRevision) {
    conflicts.push(conflict(
      "workspace_revision_precedes_analysis",
      "A resolução não pode anteceder a revisão usada pela análise instrucional."
    ));
  }
  if (analysis.scope.kind === "workspace") {
    if (normalizedScopeEntityVersion !== null) {
      conflicts.push(conflict(
        "invalid_scope_entity_version",
        "O escopo workspace não possui versão de entidade separada."
      ));
    }
  } else if (!Number.isSafeInteger(normalizedScopeEntityVersion)
      || normalizedScopeEntityVersion < 1) {
    conflicts.push(conflict(
      "invalid_scope_entity_version",
      "A resolução exige a versão corrente da entidade alvo."
    ));
  } else if (analysis.derivedFrom.scopeEntityVersion !== normalizedScopeEntityVersion) {
    conflicts.push(conflict(
      "stale_instructional_analysis",
      "A entidade mudou desde a análise instrucional; reanalise antes de resolver."
    ));
  }
  const pathDepth = new Map(pathResult.scopeKeys.map((key, index) => [key, index]));
  const definitionsByRef = new Map();
  definitions.forEach((definition) => {
    const key = definitionKey(definition);
    if (definitionsByRef.has(key)) {
      conflicts.push(conflict("duplicate_parameter_definition", `Definição duplicada: ${key}.`));
    }
    definitionsByRef.set(key, definition);
    checkDefinitionRule(definition, conflicts);
  });
  const assignmentsByDefinition = new Map();
  const assignmentRefs = new Set();
  assignments.forEach((assignment, index) => {
    const assignmentRef = definitionKey(assignment);
    if (assignmentRefs.has(assignmentRef)) {
      conflicts.push(conflict(
        "duplicate_parameter_assignment_ref",
        `Mais de um assignment usa a referência global ${assignmentRef}.`,
        { assignmentIndex: index }
      ));
    }
    assignmentRefs.add(assignmentRef);
    const key = assignmentDefinitionKey(assignment);
    const definition = definitionsByRef.get(key);
    if (!definition) {
      conflicts.push(conflict(
        "unknown_parameter_definition",
        `Assignment ${assignment.id} referencia definição ausente: ${key}.`,
        { assignmentIndex: index }
      ));
      return;
    }
    if (!definition.supportedScopes.includes(assignment.scope.kind)) {
      conflicts.push(conflict(
        "unsupported_assignment_scope",
        `O parâmetro ${key} não admite escopo ${assignment.scope.kind}.`
      ));
    }
    validateValueAgainstDefinition(
      definition,
      assignment.value,
      conflicts,
      `assignments[${index}].value`
    );
    if (!pathDepth.has(scopeKey(assignment.scope))) return;
    const entries = assignmentsByDefinition.get(key) || [];
    entries.push(assignment);
    assignmentsByDefinition.set(key, entries);
  });
  const defaultsByDefinition = new Map();
  defaults.forEach((entry, index) => {
    const key = definitionKey(entry.definitionRef);
    const definition = definitionsByRef.get(key);
    if (!definition) {
      conflicts.push(conflict("unknown_default_definition", `Default referencia definição ausente: ${key}.`));
      return;
    }
    if (!definition.supportedScopes.includes(entry.scope.kind)) {
      conflicts.push(conflict(
        "unsupported_default_scope",
        `O parâmetro ${key} não admite default em ${entry.scope.kind}.`
      ));
    }
    validateValueAgainstDefinition(definition, entry.value, conflicts, `defaults[${index}].value`);
    if (!pathDepth.has(scopeKey(entry.scope))) return;
    const entries = defaultsByDefinition.get(key) || [];
    entries.push(entry);
    defaultsByDefinition.set(key, entries);
  });
  const rawRequiredDefinitionRefs = list(requiredDefinitionRefs);
  const explicitlyRequired = rawRequiredDefinitionRefs.map(reference).filter(Boolean);
  if (explicitlyRequired.length !== rawRequiredDefinitionRefs.length) {
    conflicts.push(conflict(
      "invalid_required_definition_ref",
      "A lista de parâmetros requeridos contém referência sem id@version."
    ));
  }
  const lockedDefinitionKeys = [...assignmentsByDefinition.entries()]
    .filter(([, entries]) => entries.some(({ mode }) => mode === "research_lock"))
    .map(([key]) => key);
  const keysToResolve = explicitlyRequired.length
    ? [...new Set([...explicitlyRequired.map(definitionKey), ...lockedDefinitionKeys])]
    : [...new Set([
      ...assignmentsByDefinition.keys(),
      ...defaultsByDefinition.keys()
    ])];
  const unresolvedDefinitionRefs = [];
  const resolvedValues = [];
  keysToResolve.sort().forEach((key) => {
    const definition = definitionsByRef.get(key);
    if (!definition) {
      conflicts.push(conflict("required_definition_not_found", `Definição requerida ausente: ${key}.`));
      return;
    }
    const chosen = chooseResolvedValue({
      definition,
      assignments: assignmentsByDefinition.get(key) || [],
      defaults: defaultsByDefinition.get(key) || [],
      pathDepth,
      conflicts
    });
    if (!chosen) {
      unresolvedDefinitionRefs.push({ id: definition.id, version: definition.version });
      return;
    }
    const targetScope = normalizedResolutionPath.at(-1);
    if (chosen.source === "assignment") {
      resolvedValues.push({
        definitionRef: { id: definition.id, version: definition.version },
        value: structuredClone(chosen.value),
        resolution: {
          assignmentMode: chosen.assignment.mode,
          inheritance: scopeKey(chosen.scope) === scopeKey(targetScope) ? "local" : "inherited",
          assignmentRef: { id: chosen.assignment.id, version: chosen.assignment.version },
          sourceScope: structuredClone(chosen.scope),
          rationale: chosen.assignment.rationale,
          provenanceRefs: [...chosen.assignment.provenanceRefs]
        }
      });
    } else {
      resolvedValues.push({
        definitionRef: { id: definition.id, version: definition.version },
        value: structuredClone(chosen.value),
        resolution: {
          assignmentMode: "default",
          inheritance: scopeKey(chosen.scope) === scopeKey(targetScope) ? "local" : "inherited",
          assignmentRef: null,
          sourceScope: structuredClone(chosen.scope),
          rationale: chosen.defaultValue.rationale,
          provenanceRefs: [...chosen.defaultValue.provenanceRefs]
        }
      });
    }
  });
  if (explicitlyRequired.length && unresolvedDefinitionRefs.length) {
    conflicts.push(conflict(
      "required_parameter_unresolved",
      `Parâmetros requeridos permanecem sem valor: ${unresolvedDefinitionRefs.map(definitionKey).join(", ")}.`
    ));
  }
  const resourceParameter = resolvedValues.find(({ definitionRef }) => (
    definitionRef.id === "available_resource_set_refs"
  ));
  const resourceSetRefs = resourceSetRefsFromParameterValue(resourceParameter?.value);
  if (resourceParameter && (
    resourceParameter.value?.kind !== "set"
      || !Array.isArray(resourceParameter.value?.values)
      || resourceParameter.value.values.length !== resourceSetRefs.length
  )) {
    conflicts.push(conflict(
      "invalid_resource_set_parameter_value",
      "available_resource_set_refs contém referência inválida."
    ));
  }
  const parameterCatalogVersions = new Set(definitions.map(({ catalogVersion }) => catalogVersion));
  if (parameterCatalogVersions.size > 1) {
    conflicts.push(conflict(
      "parameter_catalog_version_conflict",
      "A resolução recebeu definições de versões diferentes do catálogo."
    ));
  }
  const parameterCatalogVersion = [...parameterCatalogVersions][0]
    || DESIGN_PARAMETER_CATALOG_VERSION;
  const resolvedSets = resolveVersionedResourceSets({
    refs: resourceSetRefs,
    resourceSets,
    expectedCatalogVersion: resourceCatalogVersion,
    packageRegistry,
    resolutionPath: normalizedResolutionPath
  });
  conflicts.push(...resolvedSets.errors.map((entry) => conflict(
    entry.code,
    entry.message,
    { resourceSetRef: entry.resourceSetRef }
  )));
  if (conflicts.length) {
    return { ok: false, conflicts, unresolvedDefinitionRefs, snapshot: null };
  }
  let snapshot;
  try {
    snapshot = normalizeEffectiveDesignSnapshot({
      contract: "EffectiveDesignSnapshot@1",
      modelVersion: analysis.modelVersion,
      id: text(snapshotId),
      version: text(snapshotVersion),
      scope: structuredClone(analysis.scope),
      analysisRef: { id: analysis.id, version: analysis.version },
      parameterCatalogVersion,
      basedOnWorkspaceRevision: normalizedWorkspaceRevision,
      scopeEntityVersion: normalizedScopeEntityVersion,
      resolutionVersion: text(resolutionVersion),
      resolutionPath: structuredClone(normalizedResolutionPath),
      resolvedValues,
      resourceSetRefs,
      frozenAt: text(frozenAt)
    });
  } catch (cause) {
    if (cause instanceof InstructionalDesignValidationError) {
      return {
        ok: false,
        conflicts: [conflict("invalid_effective_snapshot", cause.message, { cause })],
        unresolvedDefinitionRefs,
        snapshot: null
      };
    }
    throw cause;
  }
  return {
    ok: true,
    conflicts: [],
    unresolvedDefinitionRefs,
    snapshot,
    resourceSets: resolvedSets.resourceSets
  };
}
