import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  DESIGN_PARAMETER_CATALOG,
  designParameterCatalog
} from "../../src/authoring/instructionalDesignContracts.js";
import {
  InstructionalDesignValidationError,
  normalizeDesignParameterAssignment,
  normalizeEffectiveDesignSnapshot,
  normalizeMaterializationManifest,
  normalizeResourceSet,
  validateInstructionalDesignPersistenceSafety,
  validatePromotedInstructionalDesignContract
} from "../../src/authoring/instructionalDesignValidation.js";
import {
  DESIGN_SCOPE_ORDER,
  resolveEffectiveDesignParameters
} from "../../src/authoring/designParameterResolution.js";
import {
  authorizeResourceSelection,
  packageRefKey,
  resolveVersionedResourceSets,
  validateManifestResourceAuthorizations,
  versionedRefKey
} from "../../src/authoring/resourceSetResolution.js";
import {
  InstructionalDesignBindingError,
  createPedagogicalBlueprintBinding,
  diffInstructionalIntentToMaterialization,
  normalizePedagogicalBlueprintBinding,
  selectUniqueMaterializationManifest
} from "../../src/authoring/instructionalDesignBinding.js";
import {
  measureInstructionalDesignPayload,
  projectLegacyInstructionalDesignState,
  projectOfflineInstructionalDesignState
} from "../../src/authoring/legacyInstructionalDesign.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";

const fixtureUrl = new URL(
  "../fixtures/pedagogy/instructional-design-scenarios.v1.json",
  import.meta.url
);
const fixture = JSON.parse(fs.readFileSync(fixtureUrl, "utf8"));
const canonicalAnalysis = fixture.scenarios.find(
  ({ id }) => id === fixture.canonicalLifecycle.analysisScenarioRef
).analysis;

const scopeRefs = Object.freeze({
  workspace: "workspace-research-a",
  course: "course-research-a",
  module: "module-transport",
  lesson: "lesson-transport",
  microsequence: "ms-computing-transport"
});

function pathTo(kind = "microsequence") {
  const targetIndex = DESIGN_SCOPE_ORDER.indexOf(kind);
  return DESIGN_SCOPE_ORDER.slice(0, targetIndex + 1).map((scopeKind) => ({
    kind: scopeKind,
    ref: scopeRefs[scopeKind]
  }));
}

function analysisAt(kind = "microsequence") {
  const analysis = structuredClone(canonicalAnalysis);
  analysis.id = `analysis-${kind}`;
  analysis.scope = { kind, ref: scopeRefs[kind] };
  analysis.derivedFrom = {
    workspaceRevision: 11,
    scopeEntityVersion: kind === "workspace" ? null : 4
  };
  return analysis;
}

function definition(id) {
  return structuredClone(DESIGN_PARAMETER_CATALOG.find((entry) => entry.id === id));
}

function assignment({
  id,
  definitionValue,
  scope,
  value,
  mode = "auto",
  version = "1.0.0"
}) {
  const authority = mode === "research_lock"
    ? { kind: "research_protocol", actorRef: "protocol:a", locked: true }
    : mode === "manual_override"
      ? { kind: "author", actorRef: "author:a", locked: false }
      : { kind: "gpt", actorRef: null, locked: false };
  return {
    contract: "DesignParameterAssignment@1",
    modelVersion: "1.0.0",
    id,
    version,
    definitionRef: { id: definitionValue.id, version: definitionValue.version },
    scope: structuredClone(scope),
    mode,
    value: structuredClone(value),
    authority,
    rationale: `Valor público de teste para ${scope.kind}.`,
    provenanceRefs: [`test:${id}`]
  };
}

function resolve({
  analysis = analysisAt(),
  definitions,
  assignments,
  defaults = [],
  requiredDefinitionRefs,
  resourceSets = [],
  resourceCatalogVersion = null,
  packageRegistry = RESOURCE_PACKAGE_REGISTRY,
  workspaceRevision = 19,
  scopeEntityVersion = analysis.derivedFrom.scopeEntityVersion
}) {
  return resolveEffectiveDesignParameters({
    analysis,
    definitions,
    assignments,
    defaults,
    resolutionPath: pathTo(analysis.scope.kind),
    resourceSets,
    resourceCatalogVersion,
    packageRegistry,
    requiredDefinitionRefs,
    workspaceRevision,
    scopeEntityVersion,
    snapshotId: `snapshot-${analysis.scope.kind}`,
    snapshotVersion: "1.0.0",
    resolutionVersion: "1.0.0",
    frozenAt: "2026-08-15T12:00:00Z"
  });
}

function fallbackAssignments(definitionValue) {
  const values = [
    "block",
    "allow_versatile_with_limitation",
    "allow_substitute_with_limitation",
    "block",
    "allow_versatile_with_limitation"
  ];
  return pathTo().map((scope, index) => assignment({
    id: `fallback-${scope.kind}`,
    definitionValue,
    scope,
    value: { kind: "enum", value: values[index] }
  }));
}

function blueprintV2() {
  return {
    goal: "Explicar entrega a processos e escolha entre serviços de transporte.",
    learnerSituation: "Pessoa iniciante em redes.",
    learningConditions: [],
    contentDemands: [{
      id: "transport-demand",
      description: "Relacionar entrega, processo e requisitos do serviço.",
      taskOperations: ["trace_delivery", "discriminate_by_requirement"]
    }],
    anticipatedDifficulties: [],
    designResponses: [],
    prerequisiteEvidence: [],
    conceptualLayers: [
      { id: "delivery-layer", plainLanguageReferent: "Entrega ao programa correto.", formalTerms: ["porta", "socket"], requiresLayerIds: [] },
      { id: "transport-layer", plainLanguageReferent: "Escolha segundo requisitos.", formalTerms: ["TCP", "UDP"], requiresLayerIds: ["delivery-layer"] }
    ],
    theorySteps: [
      { id: "theory-process-delivery", layerIds: ["delivery-layer"], purpose: "Explicar entrega.", taskOperation: "explain", packageCandidateIds: ["prose"] },
      { id: "theory-transport-choice", layerIds: ["transport-layer"], purpose: "Contrastar serviços.", taskOperation: "explain", packageCandidateIds: ["prose"] }
    ],
    practiceSteps: [{
      id: "practice-transport-choice",
      targetLayerIds: ["transport-layer"],
      decision: "Escolher serviço pelo requisito.",
      taskOperation: "discriminate",
      packageCandidateIds: ["choice"],
      feedback: "Contrasta o requisito determinante."
    }],
    feedbackPlan: "Retomar a relação usada na decisão.",
    termLedger: [
      { term: "porta", introducedInLayerId: "delivery-layer", plainMeaning: "Identificador do processo." },
      { term: "socket", introducedInLayerId: "delivery-layer", plainMeaning: "Extremidade de comunicação." },
      { term: "TCP", introducedInLayerId: "transport-layer", plainMeaning: "Serviço com entrega confiável." },
      { term: "UDP", introducedInLayerId: "transport-layer", plainMeaning: "Serviço sem confirmação de entrega." }
    ],
    packageCandidates: [
      { id: "prose", packageId: "aralearn.resource.paragraph", version: "1.0.0", reason: "Desenvolver relações." },
      { id: "choice", packageId: "aralearn.response.choice", version: "1.0.0", reason: "Discriminar alternativas." }
    ]
  };
}

function blueprintMappings() {
  return {
    conceptualLayers: [
      { layerId: "delivery-layer", unitRefs: ["process", "port", "socket"] },
      { layerId: "transport-layer", unitRefs: ["tcp", "udp"] }
    ],
    contentDemands: [{
      contentDemandId: "transport-demand",
      unitRefs: ["process", "port", "socket", "tcp", "udp"],
      evidenceRequirementRefs: ["ev-process-delivery", "ev-transport-choice"]
    }],
    designResponses: [],
    theorySteps: [
      { stepId: "theory-process-delivery", unitRefs: ["process", "port", "socket"], explanationRequirementRefs: ["exp-process-delivery"] },
      { stepId: "theory-transport-choice", unitRefs: ["tcp", "udp"], explanationRequirementRefs: ["exp-transport-choice"] }
    ],
    practiceSteps: [{
      stepId: "practice-transport-choice",
      unitRefs: ["tcp", "udp"],
      evidenceRequirementRefs: ["ev-transport-choice"]
    }]
  };
}

test("validador runtime promove contratos e rejeita estado conversacional recursivo", () => {
  const valid = validatePromotedInstructionalDesignContract(
    "instructionalAnalysis",
    canonicalAnalysis
  );
  assert.equal(valid.ok, true, JSON.stringify(valid.errors));
  const promotedRecords = [
    ["designParameterDefinition", DESIGN_PARAMETER_CATALOG[0]],
    ["designParameterAssignment", fixture.canonicalLifecycle.parameterAssignments[0]],
    ["effectiveDesignSnapshot", fixture.canonicalLifecycle.effectiveSnapshot],
    ["materializationManifest", fixture.canonicalLifecycle.materializationManifest],
    ["resourceSet", fixture.canonicalLifecycle.resourceSets[0]]
  ];
  promotedRecords.forEach(([kind, record]) => {
    const result = validatePromotedInstructionalDesignContract(kind, record);
    assert.equal(result.ok, true, `${kind}: ${JSON.stringify(result.errors)}`);
  });
  const contaminated = structuredClone(canonicalAnalysis);
  contaminated.units[0].knowledgeFormHypothesis.private = {
    nested: { messages: [{ role: "assistant", content: "raciocínio" }] }
  };
  const rejected = validatePromotedInstructionalDesignContract(
    "instructionalAnalysis",
    contaminated
  );
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.some(({ code }) => code === "forbidden_persistent_field"));
  assert.equal(validateInstructionalDesignPersistenceSafety({
    safe: { rationale: "Razão pública curta." }
  }).ok, true);
  assert.equal(validateInstructionalDesignPersistenceSafety({
    safe: [{ hiddenReasoning: "não persistir" }]
  }).ok, false);
  assert.equal(validateInstructionalDesignPersistenceSafety({
    nested: { cot: "não persistir" }
  }).ok, false);
});

test("resolução percorre deterministicamente os cinco níveis", () => {
  const fallback = definition("representation_fallback_policy");
  const assignments = fallbackAssignments(fallback);
  for (const kind of DESIGN_SCOPE_ORDER) {
    const depth = DESIGN_SCOPE_ORDER.indexOf(kind);
    const result = resolve({
      analysis: analysisAt(kind),
      definitions: [fallback],
      assignments: assignments.slice(0, depth + 1),
      requiredDefinitionRefs: [{ id: fallback.id, version: fallback.version }]
    });
    assert.equal(result.ok, true, result.conflicts.map(({ message }) => message).join("\n"));
    const effective = result.snapshot.resolvedValues[0];
    assert.equal(effective.resolution.sourceScope.kind, kind);
    assert.equal(effective.resolution.inheritance, "local");
    assert.equal(effective.value.value, assignments[depth].value.value);
    assert.deepEqual(result.snapshot.resolutionPath.map(({ kind: pathKind }) => pathKind), (
      DESIGN_SCOPE_ORDER.slice(0, depth + 1)
    ));
    assert.equal(result.snapshot.basedOnWorkspaceRevision, 19);
  }
  const beforeAnalysis = resolve({
    analysis: analysisAt(),
    definitions: [fallback],
    assignments,
    requiredDefinitionRefs: [{ id: fallback.id, version: fallback.version }],
    workspaceRevision: 1
  });
  assert.equal(beforeAnalysis.ok, false);
  assert.ok(beforeAnalysis.conflicts.some(({ code }) => (
    code === "workspace_revision_precedes_analysis"
  )));
});

test("override manual mais próximo prevalece e snapshot preserva herança", () => {
  const fallback = definition("representation_fallback_policy");
  const workspaceAuto = assignment({
    id: "fallback-workspace-auto",
    definitionValue: fallback,
    scope: pathTo()[0],
    value: { kind: "enum", value: "block" }
  });
  const lessonOverride = assignment({
    id: "fallback-lesson-manual",
    definitionValue: fallback,
    scope: pathTo()[3],
    mode: "manual_override",
    value: { kind: "enum", value: "allow_versatile_with_limitation" }
  });
  const result = resolve({
    definitions: [fallback],
    assignments: [workspaceAuto, lessonOverride],
    requiredDefinitionRefs: [{ id: fallback.id, version: fallback.version }]
  });
  assert.equal(result.ok, true, result.conflicts.map(({ message }) => message).join("\n"));
  const effective = result.snapshot.resolvedValues[0];
  assert.equal(effective.value.value, "allow_versatile_with_limitation");
  assert.equal(effective.resolution.assignmentMode, "manual_override");
  assert.equal(effective.resolution.inheritance, "inherited");
  assert.equal(effective.resolution.sourceScope.kind, "lesson");

  const lowerAuto = assignment({
    id: "fallback-micro-auto",
    definitionValue: fallback,
    scope: pathTo().at(-1),
    value: { kind: "enum", value: "block" }
  });
  const preservedManual = resolve({
    definitions: [fallback],
    assignments: [lessonOverride, lowerAuto],
    requiredDefinitionRefs: [{ id: fallback.id, version: fallback.version }]
  });
  assert.equal(preservedManual.ok, true);
  assert.equal(
    preservedManual.snapshot.resolvedValues[0].resolution.assignmentMode,
    "manual_override"
  );
  assert.equal(preservedManual.snapshot.resolvedValues[0].resolution.sourceScope.kind, "lesson");
});

test("research lock bloqueia assignment inferior e conflitos nunca usam fallback silencioso", () => {
  const fallback = definition("representation_fallback_policy");
  const lock = assignment({
    id: "fallback-course-lock",
    definitionValue: fallback,
    scope: pathTo()[1],
    mode: "research_lock",
    value: { kind: "enum", value: "block" }
  });
  const lowerOverride = assignment({
    id: "fallback-lesson-override",
    definitionValue: fallback,
    scope: pathTo()[3],
    mode: "manual_override",
    value: { kind: "enum", value: "allow_substitute_with_limitation" }
  });
  const locked = resolve({
    definitions: [fallback],
    assignments: [lock, lowerOverride],
    requiredDefinitionRefs: [{ id: fallback.id, version: fallback.version }]
  });
  assert.equal(locked.ok, false);
  assert.equal(locked.snapshot, null);
  assert.ok(locked.conflicts.some(({ code }) => code === "research_lock_blocks_lower_assignment"));
  const nonListAssignments = resolveEffectiveDesignParameters({
    analysis: analysisAt(),
    definitions: [fallback],
    assignments: lock,
    defaults: [],
    resolutionPath: pathTo(),
    resourceSets: [],
    requiredDefinitionRefs: [{ id: fallback.id, version: fallback.version }],
    workspaceRevision: 19,
    scopeEntityVersion: analysisAt().derivedFrom.scopeEntityVersion,
    snapshotId: "snapshot-invalid-collections",
    frozenAt: "2026-08-15T12:00:00Z"
  });
  assert.equal(nonListAssignments.ok, false);
  assert.ok(nonListAssignments.conflicts.some(({ code }) => code === "invalid_resolution_input"));

  const duplicateRef = structuredClone(lowerOverride);
  duplicateRef.definitionRef = { id: "accepted_performance_forms", version: "1.0.0" };
  const acceptedForms = definition("accepted_performance_forms");
  duplicateRef.value = { kind: "set", values: ["selected-response"] };
  const ambiguousAssignments = resolve({
    definitions: [fallback, acceptedForms],
    assignments: [lowerOverride, duplicateRef],
    requiredDefinitionRefs: [
      { id: fallback.id, version: fallback.version },
      { id: acceptedForms.id, version: acceptedForms.version }
    ]
  });
  assert.equal(ambiguousAssignments.ok, false);
  assert.ok(ambiguousAssignments.conflicts.some(({ code }) => (
    code === "duplicate_parameter_assignment_ref"
  )));

  const acceptedFormsLock = assignment({
    id: "accepted-forms-lock",
    definitionValue: acceptedForms,
    scope: pathTo().at(-1),
    mode: "research_lock",
    value: { kind: "set", values: ["selected-response"] }
  });
  const lockCannotBeOmitted = resolve({
    definitions: [fallback, acceptedForms],
    assignments: [lowerOverride, acceptedFormsLock],
    requiredDefinitionRefs: [{ id: fallback.id, version: fallback.version }]
  });
  assert.equal(lockCannotBeOmitted.ok, true);
  assert.deepEqual(lockCannotBeOmitted.snapshot.resolvedValues.map(({ definitionRef }) => (
    definitionRef.id
  )).sort(), ["accepted_performance_forms", "representation_fallback_policy"]);

  const sameScopeOverride = structuredClone(lowerOverride);
  sameScopeOverride.id = "fallback-course-override";
  sameScopeOverride.scope = structuredClone(lock.scope);
  const sameScopeLocked = resolve({
    definitions: [fallback],
    assignments: [lock, sameScopeOverride],
    requiredDefinitionRefs: [{ id: fallback.id, version: fallback.version }]
  });
  assert.equal(sameScopeLocked.ok, false);
  assert.ok(sameScopeLocked.conflicts.some(({ code }) => (
    code === "research_lock_blocks_lower_assignment"
  )));

  const duplicate = structuredClone(lowerOverride);
  duplicate.id = "fallback-lesson-second";
  duplicate.value.value = "block";
  const conflicted = resolve({
    definitions: [fallback],
    assignments: [lowerOverride, duplicate],
    requiredDefinitionRefs: [{ id: fallback.id, version: fallback.version }]
  });
  assert.equal(conflicted.ok, false);
  assert.equal(conflicted.snapshot, null);
  assert.ok(conflicted.conflicts.some(({ code }) => code === "same_scope_assignment_conflict"));

  const redundantOverride = structuredClone(lowerOverride);
  redundantOverride.id = "fallback-lesson-redundant";
  redundantOverride.value = structuredClone(lock.value);
  const redundant = resolve({
    definitions: [fallback],
    assignments: [lock, redundantOverride],
    requiredDefinitionRefs: [{ id: fallback.id, version: fallback.version }]
  });
  assert.equal(redundant.ok, true, "um valor redundante não simula divergência do lock");
  assert.equal(redundant.snapshot.resolvedValues[0].resolution.assignmentMode, "research_lock");

  const workspaceLock = structuredClone(lock);
  workspaceLock.id = "fallback-workspace-lock";
  workspaceLock.scope = pathTo()[0];
  const lessonLock = structuredClone(lock);
  lessonLock.id = "fallback-lesson-lock";
  lessonLock.scope = pathTo()[3];
  const courseOverride = structuredClone(lowerOverride);
  courseOverride.id = "fallback-course-between-locks";
  courseOverride.scope = pathTo()[1];
  const nestedLocks = resolve({
    definitions: [fallback],
    assignments: [workspaceLock, lessonLock, courseOverride],
    requiredDefinitionRefs: [{ id: fallback.id, version: fallback.version }]
  });
  assert.equal(nestedLocks.ok, false);
  assert.ok(nestedLocks.conflicts.some((entry) => (
    entry.code === "research_lock_blocks_lower_assignment"
    && entry.lockAssignmentRef === "fallback-workspace-lock@1.0.0"
  )));
});

test("default é valor completo e assignment substitui sem merge implícito", () => {
  const explanation = definition("applicable_explanation_requirement_refs");
  explanation.supportedScopes = [...DESIGN_SCOPE_ORDER];
  const defaultValue = {
    definitionRef: { id: explanation.id, version: explanation.version },
    scope: pathTo()[0],
    value: { kind: "set", values: ["exp-process-delivery", "exp-transport-choice"] },
    rationale: "Default completo do workspace.",
    provenanceRefs: ["policy:workspace"]
  };
  const override = assignment({
    id: "explanation-micro-override",
    definitionValue: explanation,
    scope: pathTo().at(-1),
    mode: "manual_override",
    value: { kind: "set", values: ["exp-transport-choice"] }
  });
  const result = resolve({
    definitions: [explanation],
    assignments: [override],
    defaults: [defaultValue],
    requiredDefinitionRefs: [{ id: explanation.id, version: explanation.version }]
  });
  assert.equal(result.ok, true, result.conflicts.map(({ message }) => message).join("\n"));
  assert.deepEqual(result.snapshot.resolvedValues[0].value.values, ["exp-transport-choice"]);
});

test("conjuntos escalares têm ordem canônica por tipo e valor", () => {
  const first = structuredClone(fixture.canonicalLifecycle.parameterAssignments[0]);
  first.definitionRef = { id: "accepted_performance_forms", version: "1.0.0" };
  first.value = { kind: "set", values: [2, "2", true] };
  const second = structuredClone(first);
  second.value.values.reverse();
  assert.deepEqual(
    normalizeDesignParameterAssignment(first).value,
    normalizeDesignParameterAssignment(second).value
  );
});

test("snapshot efetivo é imutável, pequeno e referencia ResourceSet exato", () => {
  const resourcesDefinition = definition("available_resource_set_refs");
  const resourceSet = structuredClone(fixture.canonicalLifecycle.resourceSets[0]);
  const lock = assignment({
    id: "resource-set-course-lock",
    definitionValue: resourcesDefinition,
    scope: pathTo()[1],
    mode: "research_lock",
    value: { kind: "set", values: [`${resourceSet.id}@${resourceSet.version}`] }
  });
  const result = resolve({
    definitions: [resourcesDefinition],
    assignments: [lock],
    resourceSets: [resourceSet],
    requiredDefinitionRefs: [{ id: resourcesDefinition.id, version: resourcesDefinition.version }]
  });
  assert.equal(result.ok, true, result.conflicts.map(({ message }) => message).join("\n"));
  assert.equal(Object.isFrozen(result.snapshot), true);
  assert.equal(Object.isFrozen(result.snapshot.resolvedValues[0].value), true);
  assert.deepEqual(result.snapshot.resourceSetRefs, [{ id: resourceSet.id, version: resourceSet.version }]);

  const wrongCatalog = resolve({
    definitions: [resourcesDefinition],
    assignments: [lock],
    resourceSets: [resourceSet],
    resourceCatalogVersion: "catalogo-incompatível",
    requiredDefinitionRefs: [{ id: resourcesDefinition.id, version: resourcesDefinition.version }]
  });
  assert.equal(wrongCatalog.ok, false);
  assert.ok(wrongCatalog.conflicts.some(({ code }) => code === "resource_catalog_version_mismatch"));
  const invalidType = structuredClone(lock);
  invalidType.value = { kind: "enum", value: "resource-set-condition-a@1.0.0" };
  const invalidTypeResult = resolve({
    definitions: [resourcesDefinition],
    assignments: [invalidType],
    resourceSets: [resourceSet],
    requiredDefinitionRefs: [{ id: resourcesDefinition.id, version: resourcesDefinition.version }]
  });
  assert.equal(invalidTypeResult.ok, false);
  assert.equal(invalidTypeResult.snapshot, null);
  assert.ok(invalidTypeResult.conflicts.some(({ code }) => (
    code === "parameter_value_type_mismatch"
  )));
  assert.throws(() => {
    result.snapshot.resolvedValues[0].value.values.push("resource-set-other@1.0.0");
  }, TypeError);
  const serialized = JSON.stringify(result.snapshot);
  assert.equal(serialized.includes("packages"), false);
  assert.ok(Buffer.byteLength(serialized, "utf8") < 4_096);
});

test("ResourceSet normaliza conjunto e autoriza seleção somente pela referência declarada", () => {
  assert.notEqual(
    versionedRefKey({ id: "resource@set", version: "1" }),
    versionedRefKey({ id: "resource", version: "set@1" })
  );
  assert.notEqual(
    packageRefKey({ packageId: "package@variant", version: "1" }),
    packageRefKey({ packageId: "package", version: "variant@1" })
  );
  const sourceSet = structuredClone(fixture.canonicalLifecycle.resourceSets[0]);
  sourceSet.packages.reverse();
  const normalized = normalizeResourceSet(sourceSet);
  const resolutionPath = fixture.canonicalLifecycle.effectiveSnapshot.resolutionPath;
  assert.deepEqual(normalized.packages.map(({ packageId }) => packageId), [
    "aralearn.resource.paragraph",
    "aralearn.resource.relation_map",
    "aralearn.response.choice"
  ]);
  const resolved = resolveVersionedResourceSets({
    refs: [{ id: normalized.id, version: normalized.version }],
    resourceSets: [normalized, { id: "unrelated-invalid", version: "1.0.0" }],
    packageRegistry: RESOURCE_PACKAGE_REGISTRY,
    resolutionPath
  });
  assert.equal(resolved.ok, true, resolved.errors.map(({ message }) => message).join("\n"));
  assert.equal(resolved.availability.length, 3);
  const missingRegistry = resolveVersionedResourceSets({
    refs: [{ id: normalized.id, version: normalized.version }],
    resourceSets: [normalized],
    resolutionPath
  });
  assert.equal(missingRegistry.ok, false);
  assert.ok(missingRegistry.errors.some(({ code }) => (
    code === "resource_package_registry_required"
  )));
  assert.deepEqual(missingRegistry.resourceSets, []);
  assert.deepEqual(missingRegistry.availability, []);
  const unavailable = structuredClone(normalized);
  unavailable.id = "resource-set-unavailable";
  unavailable.packages[0] = { packageId: "aralearn.resource.unavailable", version: "9.9.9" };
  const unavailableResult = resolveVersionedResourceSets({
    refs: [{ id: unavailable.id, version: unavailable.version }],
    resourceSets: [unavailable],
    packageRegistry: RESOURCE_PACKAGE_REGISTRY,
    resolutionPath
  });
  assert.equal(unavailableResult.ok, false);
  assert.ok(unavailableResult.errors.some(({ code }) => code === "resource_package_not_installed"));
  assert.deepEqual(unavailableResult.availability, []);
  const unrelated = structuredClone(normalized);
  unrelated.id = "resource-set-unrelated";
  unrelated.scope.ref = "course-unrelated";
  const unrelatedResult = resolveVersionedResourceSets({
    refs: [{ id: unrelated.id, version: unrelated.version }],
    resourceSets: [unrelated],
    packageRegistry: RESOURCE_PACKAGE_REGISTRY,
    resolutionPath
  });
  assert.equal(unrelatedResult.ok, false);
  assert.ok(unrelatedResult.errors.some(({ code }) => (
    code === "resource_set_outside_resolution_path"
  )));
  const snapshot = normalizeEffectiveDesignSnapshot(fixture.canonicalLifecycle.effectiveSnapshot);
  const selection = fixture.canonicalLifecycle.materializationManifest.resourceSelections[0];
  assert.equal(authorizeResourceSelection({
    selection,
    effectiveSnapshot: snapshot,
    resourceSets: [normalized],
    packageRegistry: RESOURCE_PACKAGE_REGISTRY
  }).ok, true);
  const forgedSnapshot = {
    resourceSetRefs: snapshot.resourceSetRefs,
    resolutionPath: snapshot.resolutionPath,
    resolvedValues: snapshot.resolvedValues
  };
  const forgedAuthorization = authorizeResourceSelection({
    selection,
    effectiveSnapshot: forgedSnapshot,
    resourceSets: [normalized],
    packageRegistry: RESOURCE_PACKAGE_REGISTRY
  });
  assert.equal(forgedAuthorization.ok, false);
  assert.ok(forgedAuthorization.errors.some(({ code }) => code === "invalid_effective_snapshot"));
  const crossScopeSnapshot = structuredClone(snapshot);
  crossScopeSnapshot.scope.ref = "ms-foreign";
  const crossScopeAuthorization = authorizeResourceSelection({
    selection,
    effectiveSnapshot: crossScopeSnapshot,
    resourceSets: [normalized],
    packageRegistry: RESOURCE_PACKAGE_REGISTRY
  });
  assert.equal(crossScopeAuthorization.ok, false);
  assert.ok(crossScopeAuthorization.errors.some(({ code }) => (
    code === "invalid_effective_snapshot_path"
  )));
  const foreign = structuredClone(selection);
  foreign.package = { packageId: "aralearn.resource.flow", version: "1.0.0" };
  const denied = authorizeResourceSelection({
    selection: foreign,
    effectiveSnapshot: snapshot,
    resourceSets: [normalized],
    packageRegistry: RESOURCE_PACKAGE_REGISTRY
  });
  assert.equal(denied.ok, false);
  assert.ok(denied.errors.some(({ code }) => code === "package_not_in_authorizing_resource_set"));

  const responseSet = structuredClone(normalized);
  responseSet.selectionConstraints.allowResponsePackages = false;
  const disguisedResponse = structuredClone(
    fixture.canonicalLifecycle.materializationManifest.resourceSelections[2]
  );
  disguisedResponse.role = "exposition";
  const roleBypass = authorizeResourceSelection({
    selection: disguisedResponse,
    effectiveSnapshot: snapshot,
    resourceSets: [responseSet],
    packageRegistry: RESOURCE_PACKAGE_REGISTRY
  });
  assert.equal(roleBypass.ok, false);
  assert.ok(roleBypass.errors.some(({ code }) => code === "package_role_mismatch"));
  assert.ok(roleBypass.errors.some(({ code }) => code === "response_package_not_allowed"));

  const blockingSet = structuredClone(normalized);
  blockingSet.id = "resource-set-blocking";
  blockingSet.selectionConstraints.onNoAdequateRepresentation = "block";
  const snapshotWithBoth = structuredClone(snapshot);
  snapshotWithBoth.resourceSetRefs.push({ id: blockingSet.id, version: blockingSet.version });
  const substitute = structuredClone(selection);
  substitute.fit = "substitute";
  substitute.limitations = ["A prosa não preserva integralmente a estrutura pretendida."];
  assert.equal(authorizeResourceSelection({
    selection: substitute,
    effectiveSnapshot: snapshotWithBoth,
    resourceSets: [normalized, blockingSet],
    packageRegistry: RESOURCE_PACKAGE_REGISTRY
  }).ok, true, "a política de outro conjunto não contamina o autorizador local");
  substitute.authorizedByResourceSetRef = { id: blockingSet.id, version: blockingSet.version };
  const blockedSubstitute = authorizeResourceSelection({
    selection: substitute,
    effectiveSnapshot: snapshotWithBoth,
    resourceSets: [normalized, blockingSet],
    packageRegistry: RESOURCE_PACKAGE_REGISTRY
  });
  assert.equal(blockedSubstitute.ok, false);
  assert.ok(blockedSubstitute.errors.some(({ code }) => (
    code === "substitute_blocked_by_resource_set"
  )));

  const policyBlockedSnapshot = structuredClone(snapshot);
  const effectivePolicy = policyBlockedSnapshot.resolvedValues.find(({ definitionRef }) => (
    definitionRef.id === "representation_fallback_policy"
  ));
  effectivePolicy.value = { kind: "enum", value: "block" };
  const blockedByEffectivePolicy = authorizeResourceSelection({
    selection: { ...substitute, authorizedByResourceSetRef: selection.authorizedByResourceSetRef },
    effectiveSnapshot: policyBlockedSnapshot,
    resourceSets: [normalized],
    packageRegistry: RESOURCE_PACKAGE_REGISTRY
  });
  assert.equal(blockedByEffectivePolicy.ok, false);
  assert.ok(blockedByEffectivePolicy.errors.some(({ code }) => (
    code === "substitute_blocked_by_effective_policy"
  )));

  const versatile = structuredClone(selection);
  const versatileBlockedByEffectivePolicy = authorizeResourceSelection({
    selection: versatile,
    effectiveSnapshot: policyBlockedSnapshot,
    resourceSets: [normalized],
    packageRegistry: RESOURCE_PACKAGE_REGISTRY
  });
  assert.equal(versatileBlockedByEffectivePolicy.ok, false);
  assert.ok(versatileBlockedByEffectivePolicy.errors.some(({ code }) => (
    code === "versatile_blocked_by_effective_policy"
  )));
  const versatileWithoutLimitation = authorizeResourceSelection({
    selection: { ...versatile, limitations: [] },
    effectiveSnapshot: snapshot,
    resourceSets: [normalized],
    packageRegistry: RESOURCE_PACKAGE_REGISTRY
  });
  assert.equal(versatileWithoutLimitation.ok, false);
  assert.ok(versatileWithoutLimitation.errors.some(({ code }) => (
    code === "versatile_without_limitation"
  )));
  const versatilePolicySnapshot = structuredClone(snapshot);
  versatilePolicySnapshot.resolvedValues.find(({ definitionRef }) => (
    definitionRef.id === "representation_fallback_policy"
  )).value = { kind: "enum", value: "allow_versatile_with_limitation" };
  assert.equal(authorizeResourceSelection({
    selection: versatile,
    effectiveSnapshot: versatilePolicySnapshot,
    resourceSets: [normalized],
    packageRegistry: RESOURCE_PACKAGE_REGISTRY
  }).ok, true);
  const canonicalWithLimitation = authorizeResourceSelection({
    selection: { ...versatile, fit: "canonical" },
    effectiveSnapshot: snapshot,
    resourceSets: [normalized],
    packageRegistry: RESOURCE_PACKAGE_REGISTRY
  });
  assert.equal(canonicalWithLimitation.ok, false);
  assert.ok(canonicalWithLimitation.errors.some(({ code }) => (
    code === "canonical_with_limitation"
  )));
  const substituteBlockedByVersatilePolicy = authorizeResourceSelection({
    selection: { ...substitute, authorizedByResourceSetRef: selection.authorizedByResourceSetRef },
    effectiveSnapshot: versatilePolicySnapshot,
    resourceSets: [normalized],
    packageRegistry: RESOURCE_PACKAGE_REGISTRY
  });
  assert.equal(substituteBlockedByVersatilePolicy.ok, false);
  assert.ok(substituteBlockedByVersatilePolicy.errors.some(({ code }) => (
    code === "substitute_blocked_by_effective_policy"
  )));
});

test("manifesto usa um snapshot e todas as autorizações de resource permanecem auditáveis", () => {
  const snapshot = fixture.canonicalLifecycle.effectiveSnapshot;
  const manifest = fixture.canonicalLifecycle.materializationManifest;
  const resourceSets = fixture.canonicalLifecycle.resourceSets;
  let registryReads = 0;
  const countingRegistry = {
    get(packageId, version) {
      registryReads += 1;
      return RESOURCE_PACKAGE_REGISTRY.get(packageId, version);
    }
  };
  const validation = validateManifestResourceAuthorizations({
    effectiveSnapshot: snapshot,
    materializationManifest: manifest,
    resourceSets,
    packageRegistry: countingRegistry
  });
  assert.equal(validation.ok, true, validation.errors.map(({ message }) => message).join("\n"));
  assert.ok(
    registryReads <= resourceSets[0].packages.length + manifest.resourceSelections.length,
    "o manifesto resolve os conjuntos uma vez e consulta apenas cada seleção"
  );
  const foreignManifest = structuredClone(manifest);
  foreignManifest.scope.ref = "ms-foreign";
  foreignManifest.analysisRef.id = "analysis-foreign";
  foreignManifest.effectiveSnapshotRef.id = "snapshot-foreign";
  const foreignValidation = validateManifestResourceAuthorizations({
    effectiveSnapshot: snapshot,
    materializationManifest: foreignManifest,
    resourceSets,
    packageRegistry: RESOURCE_PACKAGE_REGISTRY
  });
  assert.equal(foreignValidation.ok, false);
  assert.deepEqual(new Set(foreignValidation.errors.map(({ code }) => code)), new Set([
    "manifest_analysis_snapshot_mismatch",
    "manifest_effective_snapshot_mismatch",
    "manifest_snapshot_scope_mismatch"
  ]));
  const invalidPlural = structuredClone(manifest);
  invalidPlural.effectiveSnapshotRefs = [invalidPlural.effectiveSnapshotRef];
  delete invalidPlural.effectiveSnapshotRef;
  const contractResult = validatePromotedInstructionalDesignContract(
    "materializationManifest",
    invalidPlural
  );
  assert.equal(contractResult.ok, false);
  assert.ok(contractResult.errors.some(({ path }) => path.endsWith("effectiveSnapshotRef")));
  const duplicate = structuredClone(manifest);
  duplicate.id = "manifest-duplicate";
  duplicate.version = "2.0.0";
  assert.throws(() => selectUniqueMaterializationManifest({
    manifests: [manifest, duplicate],
    scope: manifest.scope,
    materializedWorkspaceRevision: manifest.materializedWorkspaceRevision
  }), (error) => (
    error instanceof InstructionalDesignBindingError
      && error.code === "AMBIGUOUS_MATERIALIZATION_MANIFEST"
  ));
});

test("binding referencia blueprint v2, análise e snapshot sem duplicar o plano", () => {
  const analysis = canonicalAnalysis;
  const snapshot = fixture.canonicalLifecycle.effectiveSnapshot;
  const binding = createPedagogicalBlueprintBinding({
    id: "binding-transport",
    blueprint: blueprintV2(),
    blueprintRef: fixture.canonicalLifecycle.materializationManifest.blueprintRef,
    packageRegistry: RESOURCE_PACKAGE_REGISTRY,
    analysis,
    effectiveSnapshot: snapshot,
    mappings: blueprintMappings()
  });
  assert.equal(binding.blueprintContractVersion, 2);
  assert.equal(Object.hasOwn(binding, "blueprint"), false);
  assert.equal(Object.isFrozen(binding.mappings.theorySteps), true);
  assert.deepEqual(normalizePedagogicalBlueprintBinding(binding), binding);
  const courseBinding = structuredClone(binding);
  courseBinding.scope = { kind: "course", ref: "course-research-a" };
  assert.throws(
    () => normalizePedagogicalBlueprintBinding(courseBinding),
    (error) => error instanceof InstructionalDesignBindingError
      && error.code === "INVALID_BINDING_CONTRACT"
  );
  const badMappings = blueprintMappings();
  badMappings.practiceSteps[0].evidenceRequirementRefs = ["ev-unknown"];
  assert.throws(() => createPedagogicalBlueprintBinding({
    id: "binding-invalid",
    blueprint: blueprintV2(),
    blueprintRef: fixture.canonicalLifecycle.materializationManifest.blueprintRef,
    packageRegistry: RESOURCE_PACKAGE_REGISTRY,
    analysis,
    effectiveSnapshot: snapshot,
    mappings: badMappings
  }), InstructionalDesignBindingError);

  const emptyBlueprint = blueprintV2();
  emptyBlueprint.contentDemands = [];
  emptyBlueprint.conceptualLayers = [];
  emptyBlueprint.theorySteps = [];
  emptyBlueprint.packageCandidates = [];
  const emptyMappings = blueprintMappings();
  emptyMappings.contentDemands = [];
  emptyMappings.conceptualLayers = [];
  emptyMappings.theorySteps = [];
  assert.throws(() => createPedagogicalBlueprintBinding({
    id: "binding-invalid-blueprint",
    blueprint: emptyBlueprint,
    blueprintRef: fixture.canonicalLifecycle.materializationManifest.blueprintRef,
    packageRegistry: RESOURCE_PACKAGE_REGISTRY,
    analysis,
    effectiveSnapshot: snapshot,
    mappings: emptyMappings
  }), (error) => (
    error instanceof InstructionalDesignBindingError
      && error.code === "INVALID_PEDAGOGICAL_BLUEPRINT"
  ));

  const staleSnapshot = structuredClone(snapshot);
  staleSnapshot.scopeEntityVersion += 1;
  assert.throws(() => createPedagogicalBlueprintBinding({
    id: "binding-stale-snapshot",
    blueprint: blueprintV2(),
    blueprintRef: fixture.canonicalLifecycle.materializationManifest.blueprintRef,
    packageRegistry: RESOURCE_PACKAGE_REGISTRY,
    analysis,
    effectiveSnapshot: staleSnapshot,
    mappings: blueprintMappings()
  }), (error) => (
    error instanceof InstructionalDesignBindingError
      && error.code === "SNAPSHOT_ENTITY_VERSION_MISMATCH"
  ));

  const duplicateStepBlueprint = blueprintV2();
  duplicateStepBlueprint.practiceSteps[0].id = duplicateStepBlueprint.theorySteps[0].id;
  const duplicateStepMappings = blueprintMappings();
  duplicateStepMappings.practiceSteps[0].stepId = duplicateStepMappings.theorySteps[0].stepId;
  assert.throws(() => createPedagogicalBlueprintBinding({
    id: "binding-duplicate-step",
    blueprint: duplicateStepBlueprint,
    blueprintRef: fixture.canonicalLifecycle.materializationManifest.blueprintRef,
    packageRegistry: RESOURCE_PACKAGE_REGISTRY,
    analysis,
    effectiveSnapshot: snapshot,
    mappings: duplicateStepMappings
  }), (error) => (
    error instanceof InstructionalDesignBindingError
      && error.code === "INVALID_PEDAGOGICAL_BLUEPRINT"
  ));
});

test("diff computa planned versus materialized e cobertura sem julgamento semântico oculto", () => {
  const analysis = canonicalAnalysis;
  const snapshot = fixture.canonicalLifecycle.effectiveSnapshot;
  const manifest = fixture.canonicalLifecycle.materializationManifest;
  const binding = createPedagogicalBlueprintBinding({
    id: "binding-transport-diff",
    blueprint: blueprintV2(),
    blueprintRef: manifest.blueprintRef,
    packageRegistry: RESOURCE_PACKAGE_REGISTRY,
    analysis,
    effectiveSnapshot: snapshot,
    mappings: blueprintMappings()
  });
  const diff = diffInstructionalIntentToMaterialization({
    analysis,
    effectiveSnapshot: snapshot,
    binding,
    materializationManifest: manifest
  });
  assert.deepEqual(diff.identityMismatches, []);
  assert.deepEqual(diff.steps.missingMaterialization, []);
  assert.deepEqual(diff.explanations.notDeveloped, ["exp-transport-choice"]);
  assert.deepEqual(diff.evidence.notCovered, ["ev-process-delivery", "ev-transport-choice"]);
  assert.equal(diff.explanations.denominator, 2);
  assert.equal(diff.evidence.denominator, 2);
  assert.equal(Object.hasOwn(diff, "score"), false);

  const foreignResourceSetManifest = structuredClone(manifest);
  foreignResourceSetManifest.resourceSetRefs = [{ id: "resource-set-foreign", version: "1.0.0" }];
  foreignResourceSetManifest.resourceSelections[0].authorizedByResourceSetRef = {
    id: "resource-set-foreign",
    version: "1.0.0"
  };
  const resourceSetDiff = diffInstructionalIntentToMaterialization({
    analysis,
    effectiveSnapshot: snapshot,
    binding,
    materializationManifest: foreignResourceSetManifest
  });
  assert.equal(resourceSetDiff.resources.resourceSetRefMismatch, true);
  assert.ok(resourceSetDiff.resources.selectionsOutsideResourceSets.includes(
    foreignResourceSetManifest.resourceSelections[0].id
  ));
  assert.equal(resourceSetDiff.hasDifferences, true);

  const temporallyImpossibleManifest = structuredClone(manifest);
  temporallyImpossibleManifest.materializedWorkspaceRevision = (
    snapshot.basedOnWorkspaceRevision - 1
  );
  temporallyImpossibleManifest.scopeEntityVersion = snapshot.scopeEntityVersion - 1;
  const temporalDiff = diffInstructionalIntentToMaterialization({
    analysis,
    effectiveSnapshot: snapshot,
    binding,
    materializationManifest: temporallyImpossibleManifest
  });
  assert.ok(temporalDiff.identityMismatches.includes("manifest_workspace_revision"));
  assert.ok(temporalDiff.identityMismatches.includes("manifest_scope_entity_version"));
  assert.equal(temporalDiff.hasDifferences, true);

  const foreignAnalysisSnapshot = structuredClone(snapshot);
  foreignAnalysisSnapshot.analysisRef.id = "analysis-foreign";
  const foreignSnapshotDiff = diffInstructionalIntentToMaterialization({
    analysis,
    effectiveSnapshot: foreignAnalysisSnapshot,
    binding,
    materializationManifest: manifest
  });
  assert.ok(foreignSnapshotDiff.identityMismatches.includes("snapshot_analysis"));
  assert.equal(foreignSnapshotDiff.hasDifferences, true);

  const forgedBinding = structuredClone(binding);
  delete forgedBinding.contract;
  assert.throws(() => diffInstructionalIntentToMaterialization({
    analysis,
    effectiveSnapshot: snapshot,
    binding: forgedBinding,
    materializationManifest: manifest
  }), (error) => (
    error instanceof InstructionalDesignBindingError
      && error.code === "INVALID_BINDING_CONTRACT"
  ));

  const driftedManifest = structuredClone(manifest);
  driftedManifest.scope.ref = "ms-foreign";
  driftedManifest.materializedSteps[0].kind = "practice";
  driftedManifest.materializedSteps[1].unitRefs = [
    ...driftedManifest.materializedSteps[1].unitRefs,
    "process"
  ];
  driftedManifest.materializedResources[0].package = {
    packageId: "aralearn.resource.relation_map",
    version: "1.0.0"
  };
  driftedManifest.explanationCoverage.push({
    requirementRef: "exp-invented",
    status: "developed",
    evidenceRefs: ["card:theory:1"]
  });
  driftedManifest.evidenceCoverage.push({
    requirementRef: "ev-invented",
    status: "covered",
    practiceOpportunityRefs: [],
    evidenceRefs: ["card:practice:1"]
  });
  const drifted = diffInstructionalIntentToMaterialization({
    analysis,
    effectiveSnapshot: snapshot,
    binding,
    materializationManifest: driftedManifest
  });
  assert.ok(drifted.identityMismatches.includes("manifest_scope"));
  assert.deepEqual(drifted.steps.stepContractMismatches, [
    { stepRef: "theory-process-delivery", fields: ["kind"] },
    { stepRef: "theory-transport-choice", fields: ["unitRefs"] }
  ]);
  assert.deepEqual(drifted.steps.plannedBindingMismatches, []);
  assert.deepEqual(drifted.explanations.coverageOutsideAnalysis, ["exp-invented"]);
  assert.deepEqual(drifted.evidence.coverageOutsideAnalysis, ["ev-invented"]);
  assert.equal(drifted.resources.packageSetMismatch, true);
  assert.deepEqual(drifted.resources.selectionMaterializationMismatches, [{
    materializedResourceRef: driftedManifest.materializedResources[0].id,
    fields: ["package"]
  }]);
  assert.equal(drifted.hasDifferences, true);

  const jointlyDriftedManifest = structuredClone(manifest);
  jointlyDriftedManifest.plannedSteps[0].kind = "practice";
  jointlyDriftedManifest.materializedSteps[0].kind = "practice";
  jointlyDriftedManifest.plannedSteps[0].unitRefs = ["tcp"];
  jointlyDriftedManifest.materializedSteps[0].unitRefs = ["tcp"];
  const jointlyDrifted = diffInstructionalIntentToMaterialization({
    analysis,
    effectiveSnapshot: snapshot,
    binding,
    materializationManifest: jointlyDriftedManifest
  });
  assert.deepEqual(jointlyDrifted.steps.stepContractMismatches, []);
  assert.deepEqual(jointlyDrifted.steps.plannedBindingMismatches, [{
    stepRef: "theory-process-delivery",
    fields: ["kind", "unitRefs"]
  }]);
  assert.equal(jointlyDrifted.hasDifferences, true);
});

test("workspace legacy fica unresolved e legacy_unrestricted sem valores retroativos", () => {
  const legacy = projectLegacyInstructionalDesignState({
    workspaceRef: "workspace-legacy",
    scope: { kind: "microsequence", ref: "legacy-ms-1" },
    blueprintRef: { id: "legacy-blueprint", version: "1.0.0" }
  });
  assert.equal(legacy.analysis.status, "unresolved");
  assert.equal(legacy.parameters.status, "unresolved");
  assert.deepEqual(legacy.parameters.resolvedValues, []);
  assert.equal(legacy.resources.status, "unresolved");
  assert.equal(legacy.materialization.status, "unresolved");
  const legacyWithContent = projectLegacyInstructionalDesignState({
    workspaceRef: "workspace-legacy",
    scope: { kind: "microsequence", ref: "legacy-ms-1" },
    blueprintRef: { id: "legacy-blueprint", version: "1.0.0" },
    hasMaterializedContent: true
  });
  assert.equal(legacyWithContent.resources.status, "legacy_unrestricted");
  assert.equal(legacyWithContent.materialization.status, "legacy_untracked");
  assert.deepEqual(legacy.resources.resourceSetRefs, []);
  const offline = projectOfflineInstructionalDesignState({ legacyProjection: legacy });
  assert.equal(offline.offlineAuthority.canRead, true);
  assert.equal(offline.offlineAuthority.canQueueManualOverride, false);
  assert.equal(offline.offlineAuthority.canGrantResearchAuthority, false);
  assert.equal(offline.offlineAuthority.canChangeResearchLock, false);
  assert.equal(offline.offlineAuthority.mustRevalidateLocksAndPermissionsRemotely, true);
  const authorizedQueue = projectOfflineInstructionalDesignState({
    legacyProjection: legacy,
    mayQueueManualOverride: true
  });
  assert.equal(authorizedQueue.offlineAuthority.canQueueManualOverride, true);
  assert.equal(authorizedQueue.offlineAuthority.canChangeResearchLock, false);
  assert.throws(() => projectLegacyInstructionalDesignState({
    workspaceRef: "",
    scope: { kind: "planet", ref: "" },
    hasMaterializedContent: true
  }), InstructionalDesignValidationError);
  const contaminatedLegacy = structuredClone(legacyWithContent);
  contaminatedLegacy.rawPrompt = "não persistir";
  assert.throws(() => projectOfflineInstructionalDesignState({
    legacyProjection: contaminatedLegacy
  }), InstructionalDesignValidationError);
  const foreignSnapshot = structuredClone(fixture.canonicalLifecycle.effectiveSnapshot);
  foreignSnapshot.analysisRef.id = "analysis-foreign";
  assert.throws(() => projectOfflineInstructionalDesignState({
    analysis: canonicalAnalysis,
    effectiveSnapshot: foreignSnapshot,
    mayQueueManualOverride: true
  }), InstructionalDesignValidationError);
});

test("curso grande mede payload frugal sem copiar fontes ou conversa", () => {
  const count = 500;
  const analyses = [];
  const snapshots = [];
  const manifests = [];
  for (let index = 0; index < count; index += 1) {
    const analysis = structuredClone(canonicalAnalysis);
    analysis.id = `analysis-large-${index}`;
    analysis.scope.ref = `ms-large-${index}`;
    analysis.sourceRefs = [`source-ref:${index}`];
    analyses.push(analysis);
    const snapshot = structuredClone(fixture.canonicalLifecycle.effectiveSnapshot);
    snapshot.id = `snapshot-large-${index}`;
    snapshot.scope.ref = `ms-large-${index}`;
    snapshot.analysisRef.id = analysis.id;
    snapshot.resolutionPath.at(-1).ref = `ms-large-${index}`;
    snapshots.push(snapshot);
    const manifest = structuredClone(fixture.canonicalLifecycle.materializationManifest);
    manifest.id = `manifest-large-${index}`;
    manifest.scope.ref = `ms-large-${index}`;
    manifest.analysisRef.id = analysis.id;
    manifest.effectiveSnapshotRef.id = snapshot.id;
    manifests.push(manifest);
  }
  const measurement = measureInstructionalDesignPayload({ analyses, snapshots, manifests });
  assert.equal(measurement.totalRecords, count * 3);
  assert.ok(measurement.totalBytes > 0);
  assert.ok(measurement.totalBytes < 15 * 1024 * 1024);
  assert.ok(measurement.maxRecordBytes < 64 * 1024);
  assert.equal(JSON.stringify({ analyses, snapshots, manifests }).includes("sourceExcerpt"), false);
  assert.equal(JSON.stringify(measurement).includes("messages"), false);
});

test("normalização falha de modo explícito em contrato inválido", () => {
  const invalid = structuredClone(fixture.canonicalLifecycle.effectiveSnapshot);
  invalid.resolvedValues[0].resolution.assignmentMode = "inherited";
  assert.throws(() => normalizeEffectiveDesignSnapshot(invalid), InstructionalDesignValidationError);

  const duplicatedCoverage = structuredClone(
    fixture.canonicalLifecycle.materializationManifest
  );
  const conflictingCoverage = structuredClone(duplicatedCoverage.explanationCoverage[0]);
  conflictingCoverage.status = "missing";
  conflictingCoverage.evidenceRefs = [];
  duplicatedCoverage.explanationCoverage.push(conflictingCoverage);
  const reversedCoverage = structuredClone(duplicatedCoverage);
  reversedCoverage.explanationCoverage.reverse();
  [duplicatedCoverage, reversedCoverage].forEach((manifest) => {
    assert.throws(
      () => normalizeMaterializationManifest(manifest),
      (error) => error instanceof InstructionalDesignValidationError
        && error.errors.some(({ code }) => code === "duplicate_semantic_key")
    );
  });
  const courseManifest = structuredClone(fixture.canonicalLifecycle.materializationManifest);
  courseManifest.scope = { kind: "course", ref: "course-research-a" };
  assert.throws(
    () => normalizeMaterializationManifest(courseManifest),
    InstructionalDesignValidationError
  );
  const invalidPatternDefinition = definition("available_resource_set_refs");
  invalidPatternDefinition.constraints.setItemPattern = "[";
  const invalidPatternResult = resolve({
    definitions: [invalidPatternDefinition],
    assignments: [],
    requiredDefinitionRefs: [{
      id: invalidPatternDefinition.id,
      version: invalidPatternDefinition.version
    }]
  });
  assert.equal(invalidPatternResult.ok, false);
  assert.equal(invalidPatternResult.snapshot, null);
  assert.ok(invalidPatternResult.conflicts.some(({ code }) => (
    code === "invalid_parameter_set_pattern"
  )));
  const duplicateVectorDimension = structuredClone(
    fixture.canonicalLifecycle.parameterAssignments[0]
  );
  duplicateVectorDimension.definitionRef = {
    id: "practice_variation_dimensions",
    version: "1.0.0"
  };
  duplicateVectorDimension.value = {
    kind: "vector",
    components: [
      { dimension: "context", value: "a", unit: "category" },
      { dimension: "context", value: "b", unit: "category" }
    ]
  };
  assert.throws(
    () => normalizeDesignParameterAssignment(duplicateVectorDimension),
    (error) => error instanceof InstructionalDesignValidationError
      && error.errors.some(({ code }) => code === "duplicate_semantic_key")
  );
  const invalidRelation = structuredClone(fixture.canonicalLifecycle.parameterAssignments[0]);
  invalidRelation.definitionRef = { id: "evidence_alignment_relation", version: "1.0.0" };
  invalidRelation.value = {
    kind: "relation",
    nodes: ["target"],
    edges: [{ from: "target", to: "missing", kind: "supports" }]
  };
  assert.throws(
    () => normalizeDesignParameterAssignment(invalidRelation),
    (error) => error instanceof InstructionalDesignValidationError
      && error.errors.some(({ code }) => code === "invalid_parameter_relation_endpoint")
  );
  assert.equal(designParameterCatalog().length, DESIGN_PARAMETER_CATALOG.length);

  const fallback = definition("representation_fallback_policy");
  const stale = resolve({
    definitions: [fallback],
    assignments: [fallbackAssignments(fallback).at(-1)],
    requiredDefinitionRefs: [{ id: fallback.id, version: fallback.version }],
    scopeEntityVersion: 99
  });
  assert.equal(stale.ok, false);
  assert.ok(stale.conflicts.some(({ code }) => code === "stale_instructional_analysis"));
});
