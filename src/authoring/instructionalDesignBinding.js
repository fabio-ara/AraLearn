import {
  evaluatePedagogicalBlueprint,
  pedagogicalBlueprintContract
} from "./pedagogicalBlueprint.js";
import {
  assertInstructionalDesignPersistenceSafety,
  deepFreezeInstructionalDesignValue,
  normalizeEffectiveDesignSnapshot,
  normalizeInstructionalAnalysis,
  normalizeMaterializationManifest
} from "./instructionalDesignValidation.js";
import { packageRefKey, versionedRefKey } from "./resourceSetResolution.js";

export const PEDAGOGICAL_BLUEPRINT_BINDING_CONTRACT = "PedagogicalBlueprintBinding@1";
export const INSTRUCTIONAL_MATERIALIZATION_DIFF_CONTRACT = "InstructionalMaterializationDiff@1";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function scopeKey(value) {
  return `${text(value?.kind)}:${text(value?.ref)}`;
}

function uniqueIds(entries, key, label) {
  const values = list(entries).map((entry) => text(entry?.[key]));
  if (values.some((value) => !value) || new Set(values).size !== values.length) {
    throw new InstructionalDesignBindingError(`${label} precisa de referências únicas e explícitas.`, "DUPLICATE_BINDING");
  }
  return new Set(values);
}

function requireExactCoverage(sourceIds, bindingIds, label) {
  const missing = [...sourceIds].filter((id) => !bindingIds.has(id));
  const unknown = [...bindingIds].filter((id) => !sourceIds.has(id));
  if (missing.length || unknown.length) {
    throw new InstructionalDesignBindingError(
      `${label} diverge do blueprint; ausentes: ${missing.join(", ") || "nenhum"}; desconhecidos: ${unknown.join(", ") || "nenhum"}.`,
      "INCOMPLETE_BLUEPRINT_BINDING"
    );
  }
}

function requireKnownRefs(values, known, label, { allowEmpty = false } = {}) {
  const refs = list(values).map(text);
  if (!allowEmpty && !refs.length) {
    throw new InstructionalDesignBindingError(`${label} precisa de ao menos uma referência.`, "EMPTY_BINDING");
  }
  const unknown = refs.filter((ref) => !known.has(ref));
  if (unknown.length) {
    throw new InstructionalDesignBindingError(`${label} referencia itens ausentes: ${unknown.join(", ")}.`, "UNKNOWN_BINDING_REFERENCE");
  }
  if (new Set(refs).size !== refs.length) {
    throw new InstructionalDesignBindingError(`${label} repete referência.`, "DUPLICATE_BINDING_REFERENCE");
  }
}

function requireClosedBindingEntries(entries, allowedKeys, label) {
  list(entries).forEach((entry, index) => {
    const unknown = Object.keys(entry || {}).filter((key) => !allowedKeys.includes(key));
    const missing = allowedKeys.filter((key) => !Object.hasOwn(entry || {}, key));
    if (unknown.length || missing.length) {
      throw new InstructionalDesignBindingError(
        `${label}[${index}] precisa ser fechado; ausentes: ${missing.join(", ") || "nenhum"}; desconhecidos: ${unknown.join(", ") || "nenhum"}.`,
        "INVALID_BINDING_ENTRY"
      );
    }
  });
}

export class InstructionalDesignBindingError extends Error {
  constructor(message, code = "INVALID_INSTRUCTIONAL_DESIGN_BINDING") {
    super(message);
    this.name = "InstructionalDesignBindingError";
    this.code = code;
  }
}

const BINDING_MAPPING_KEYS = Object.freeze([
  "conceptualLayers",
  "contentDemands",
  "designResponses",
  "theorySteps",
  "practiceSteps"
]);

function requireClosedObject(value, requiredKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InstructionalDesignBindingError(`${label} precisa ser um objeto fechado.`, "INVALID_BINDING_CONTRACT");
  }
  const unknown = Object.keys(value).filter((key) => !requiredKeys.includes(key));
  const missing = requiredKeys.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length || missing.length) {
    throw new InstructionalDesignBindingError(
      `${label} diverge do contrato; ausentes: ${missing.join(", ") || "nenhum"}; desconhecidos: ${unknown.join(", ") || "nenhum"}.`,
      "INVALID_BINDING_CONTRACT"
    );
  }
}

function requireVersionedRef(value, label) {
  requireClosedObject(value, ["id", "version"], label);
  if (!text(value.id) || !text(value.version)) {
    throw new InstructionalDesignBindingError(`${label} precisa de id e versão.`, "INVALID_BINDING_CONTRACT");
  }
}

function requireStringList(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)
    || (!allowEmpty && value.length === 0)
    || value.some((entry) => !text(entry))
    || new Set(value).size !== value.length) {
    throw new InstructionalDesignBindingError(
      `${label} precisa ser lista ${allowEmpty ? "" : "não vazia "}de referências únicas.`,
      "INVALID_BINDING_CONTRACT"
    );
  }
}

function requireMappingShape(entries, idKey, refFields, label) {
  uniqueIds(entries, idKey, label);
  entries.forEach((entry, index) => {
    refFields.forEach(({ key, allowEmpty = false }) => {
      requireStringList(entry[key], `${label}[${index}].${key}`, { allowEmpty });
    });
  });
}

export function normalizePedagogicalBlueprintBinding(raw) {
  assertInstructionalDesignPersistenceSafety(raw);
  requireClosedObject(raw, [
    "contract",
    "id",
    "version",
    "scope",
    "blueprintRef",
    "blueprintContractVersion",
    "analysisRef",
    "effectiveSnapshotRef",
    "mappings"
  ], "Binding");
  if (raw.contract !== PEDAGOGICAL_BLUEPRINT_BINDING_CONTRACT
    || !text(raw.id)
    || !text(raw.version)
    || raw.blueprintContractVersion !== 2) {
    throw new InstructionalDesignBindingError("Identidade ou versão do binding é inválida.", "INVALID_BINDING_CONTRACT");
  }
  requireClosedObject(raw.scope, ["kind", "ref"], "Binding.scope");
  if (raw.scope.kind !== "microsequence" || !text(raw.scope.ref)) {
    throw new InstructionalDesignBindingError("Binding.scope precisa de kind e ref.", "INVALID_BINDING_CONTRACT");
  }
  requireVersionedRef(raw.blueprintRef, "Binding.blueprintRef");
  requireVersionedRef(raw.analysisRef, "Binding.analysisRef");
  requireVersionedRef(raw.effectiveSnapshotRef, "Binding.effectiveSnapshotRef");
  requireClosedObject(raw.mappings, BINDING_MAPPING_KEYS, "Binding.mappings");
  BINDING_MAPPING_KEYS.forEach((key) => {
    if (!Array.isArray(raw.mappings[key])) {
      throw new InstructionalDesignBindingError(`Binding.mappings.${key} precisa ser lista.`, "INVALID_BINDING_CONTRACT");
    }
  });
  requireClosedBindingEntries(raw.mappings.conceptualLayers, ["layerId", "unitRefs"], "conceptualLayers");
  requireClosedBindingEntries(
    raw.mappings.contentDemands,
    ["contentDemandId", "unitRefs", "evidenceRequirementRefs"],
    "contentDemands"
  );
  requireClosedBindingEntries(
    raw.mappings.designResponses,
    ["designResponseId", "explanationRequirementRefs", "evidenceRequirementRefs"],
    "designResponses"
  );
  requireClosedBindingEntries(
    raw.mappings.theorySteps,
    ["stepId", "unitRefs", "explanationRequirementRefs"],
    "theorySteps"
  );
  requireClosedBindingEntries(
    raw.mappings.practiceSteps,
    ["stepId", "unitRefs", "evidenceRequirementRefs"],
    "practiceSteps"
  );
  requireMappingShape(raw.mappings.conceptualLayers, "layerId", [
    { key: "unitRefs" }
  ], "Binding de camadas");
  requireMappingShape(raw.mappings.contentDemands, "contentDemandId", [
    { key: "unitRefs" },
    { key: "evidenceRequirementRefs", allowEmpty: true }
  ], "Binding de demandas");
  requireMappingShape(raw.mappings.designResponses, "designResponseId", [
    { key: "explanationRequirementRefs", allowEmpty: true },
    { key: "evidenceRequirementRefs", allowEmpty: true }
  ], "Binding de respostas");
  requireMappingShape(raw.mappings.theorySteps, "stepId", [
    { key: "unitRefs" },
    { key: "explanationRequirementRefs", allowEmpty: true }
  ], "Binding de teoria");
  requireMappingShape(raw.mappings.practiceSteps, "stepId", [
    { key: "unitRefs" },
    { key: "evidenceRequirementRefs" }
  ], "Binding de prática");
  const theoryIds = new Set(raw.mappings.theorySteps.map(({ stepId }) => stepId));
  const practiceIds = new Set(raw.mappings.practiceSteps.map(({ stepId }) => stepId));
  const duplicateKinds = [...theoryIds].filter((stepId) => practiceIds.has(stepId));
  if (duplicateKinds.length) {
    throw new InstructionalDesignBindingError(
      `Teoria e prática repetem stepId: ${duplicateKinds.join(", ")}.`,
      "DUPLICATE_BINDING"
    );
  }
  return deepFreezeInstructionalDesignValue(structuredClone(raw));
}

export function createPedagogicalBlueprintBinding({
  id,
  version = "1.0.0",
  blueprint,
  blueprintRef,
  packageRegistry,
  analysis: rawAnalysis,
  effectiveSnapshot: rawSnapshot,
  mappings
} = {}) {
  assertInstructionalDesignPersistenceSafety({ blueprintRef, mappings });
  const analysis = normalizeInstructionalAnalysis(rawAnalysis);
  const snapshot = normalizeEffectiveDesignSnapshot(rawSnapshot);
  const blueprintContract = pedagogicalBlueprintContract();
  if (analysis.scope.kind !== "microsequence") {
    throw new InstructionalDesignBindingError(
      "Binding pedagógico v1 pertence a uma microssequência.",
      "INVALID_BINDING_SCOPE"
    );
  }
  if (!text(id) || !text(version) || !text(blueprintRef?.id) || !text(blueprintRef?.version)) {
    throw new InstructionalDesignBindingError(
      "Binding e blueprint precisam de referências versionadas explícitas.",
      "MISSING_BINDING_IDENTITY"
    );
  }
  const missingSections = blueprintContract.requiredSections.filter((key) => !Object.hasOwn(blueprint || {}, key));
  if (missingSections.length) {
    throw new InstructionalDesignBindingError(
      `Blueprint omite seções v2: ${missingSections.join(", ")}.`,
      "INCOMPLETE_BLUEPRINT"
    );
  }
  const blueprintEvaluation = evaluatePedagogicalBlueprint(blueprint, packageRegistry);
  if (!blueprintEvaluation.valid) {
    throw new InstructionalDesignBindingError(
      `Blueprint v2 inválido: ${blueprintEvaluation.errors.join(" ")}`,
      "INVALID_PEDAGOGICAL_BLUEPRINT"
    );
  }
  if (versionedRefKey(snapshot.analysisRef) !== versionedRefKey(analysis)) {
    throw new InstructionalDesignBindingError("Snapshot não pertence à análise informada.", "SNAPSHOT_ANALYSIS_MISMATCH");
  }
  if (scopeKey(snapshot.scope) !== scopeKey(analysis.scope)) {
    throw new InstructionalDesignBindingError("Snapshot e análise usam escopos diferentes.", "SNAPSHOT_SCOPE_MISMATCH");
  }
  if (snapshot.scopeEntityVersion !== analysis.derivedFrom.scopeEntityVersion) {
    throw new InstructionalDesignBindingError(
      "Snapshot não usa a versão de entidade analisada.",
      "SNAPSHOT_ENTITY_VERSION_MISMATCH"
    );
  }
  if (snapshot.basedOnWorkspaceRevision < analysis.derivedFrom.workspaceRevision) {
    throw new InstructionalDesignBindingError(
      "Snapshot antecede a revisão analisada.",
      "SNAPSHOT_WORKSPACE_REVISION_MISMATCH"
    );
  }
  const requiredMappingKeys = [
    "conceptualLayers",
    "contentDemands",
    "designResponses",
    "theorySteps",
    "practiceSteps"
  ];
  const unknownMappingKeys = Object.keys(mappings || {}).filter((key) => !requiredMappingKeys.includes(key));
  const missingMappingKeys = requiredMappingKeys.filter((key) => !Object.hasOwn(mappings || {}, key));
  if (unknownMappingKeys.length || missingMappingKeys.length) {
    throw new InstructionalDesignBindingError("Mappings do blueprint precisam ser fechados e completos.", "INVALID_MAPPING_SECTIONS");
  }
  requireClosedBindingEntries(mappings.conceptualLayers, ["layerId", "unitRefs"], "conceptualLayers");
  requireClosedBindingEntries(
    mappings.contentDemands,
    ["contentDemandId", "unitRefs", "evidenceRequirementRefs"],
    "contentDemands"
  );
  requireClosedBindingEntries(
    mappings.designResponses,
    ["designResponseId", "explanationRequirementRefs", "evidenceRequirementRefs"],
    "designResponses"
  );
  requireClosedBindingEntries(
    mappings.theorySteps,
    ["stepId", "unitRefs", "explanationRequirementRefs"],
    "theorySteps"
  );
  requireClosedBindingEntries(
    mappings.practiceSteps,
    ["stepId", "unitRefs", "evidenceRequirementRefs"],
    "practiceSteps"
  );
  const units = new Set(analysis.units.map(({ id: unitId }) => unitId));
  const explanations = new Set(analysis.explanationRequirements.map(({ id: requirementId }) => requirementId));
  const evidence = new Set(analysis.evidenceRequirements.map(({ id: requirementId }) => requirementId));
  const layerIds = new Set(blueprint.conceptualLayers.map(({ id: layerId }) => layerId));
  const demandIds = new Set(blueprint.contentDemands.map(({ id: demandId }) => demandId));
  const responseIds = new Set(blueprint.designResponses.map(({ id: responseId }) => responseId));
  const theoryStepIds = new Set(blueprint.theorySteps.map(({ id: stepId }) => stepId));
  const practiceStepIds = new Set(blueprint.practiceSteps.map(({ id: stepId }) => stepId));
  const mappedLayers = uniqueIds(mappings.conceptualLayers, "layerId", "Binding de camadas");
  const mappedDemands = uniqueIds(mappings.contentDemands, "contentDemandId", "Binding de demandas");
  const mappedResponses = uniqueIds(mappings.designResponses, "designResponseId", "Binding de respostas");
  const mappedTheory = uniqueIds(mappings.theorySteps, "stepId", "Binding de teoria");
  const mappedPractice = uniqueIds(mappings.practiceSteps, "stepId", "Binding de prática");
  requireExactCoverage(layerIds, mappedLayers, "Binding de camadas");
  requireExactCoverage(demandIds, mappedDemands, "Binding de demandas");
  requireExactCoverage(responseIds, mappedResponses, "Binding de respostas");
  requireExactCoverage(theoryStepIds, mappedTheory, "Binding de teoria");
  requireExactCoverage(practiceStepIds, mappedPractice, "Binding de prática");
  mappings.conceptualLayers.forEach((entry, index) => {
    requireKnownRefs(entry.unitRefs, units, `conceptualLayers[${index}].unitRefs`);
  });
  mappings.contentDemands.forEach((entry, index) => {
    requireKnownRefs(entry.unitRefs, units, `contentDemands[${index}].unitRefs`);
    requireKnownRefs(
      entry.evidenceRequirementRefs,
      evidence,
      `contentDemands[${index}].evidenceRequirementRefs`,
      { allowEmpty: true }
    );
  });
  mappings.designResponses.forEach((entry, index) => {
    requireKnownRefs(
      entry.explanationRequirementRefs,
      explanations,
      `designResponses[${index}].explanationRequirementRefs`,
      { allowEmpty: true }
    );
    requireKnownRefs(
      entry.evidenceRequirementRefs,
      evidence,
      `designResponses[${index}].evidenceRequirementRefs`,
      { allowEmpty: true }
    );
  });
  mappings.theorySteps.forEach((entry, index) => {
    requireKnownRefs(entry.unitRefs, units, `theorySteps[${index}].unitRefs`);
    requireKnownRefs(
      entry.explanationRequirementRefs,
      explanations,
      `theorySteps[${index}].explanationRequirementRefs`,
      { allowEmpty: true }
    );
  });
  mappings.practiceSteps.forEach((entry, index) => {
    requireKnownRefs(entry.unitRefs, units, `practiceSteps[${index}].unitRefs`);
    requireKnownRefs(entry.evidenceRequirementRefs, evidence, `practiceSteps[${index}].evidenceRequirementRefs`);
  });
  return normalizePedagogicalBlueprintBinding({
    contract: PEDAGOGICAL_BLUEPRINT_BINDING_CONTRACT,
    id: text(id),
    version: text(version),
    scope: structuredClone(analysis.scope),
    blueprintRef: structuredClone(blueprintRef),
    blueprintContractVersion: blueprintContract.version,
    analysisRef: { id: analysis.id, version: analysis.version },
    effectiveSnapshotRef: { id: snapshot.id, version: snapshot.version },
    mappings: structuredClone(mappings)
  });
}

function bindingStepIds(binding) {
  return new Set([
    ...binding.mappings.theorySteps.map(({ stepId }) => stepId),
    ...binding.mappings.practiceSteps.map(({ stepId }) => stepId)
  ]);
}

function bindingStepIntent(binding) {
  return new Map([
    ...binding.mappings.theorySteps.map((step) => [step.stepId, {
      kind: "theory",
      unitRefs: [...step.unitRefs].sort()
    }]),
    ...binding.mappings.practiceSteps.map((step) => [step.stepId, {
      kind: "practice",
      unitRefs: [...step.unitRefs].sort()
    }])
  ]);
}

export function diffInstructionalIntentToMaterialization({
  analysis: rawAnalysis,
  effectiveSnapshot: rawSnapshot,
  binding: rawBinding,
  materializationManifest: rawManifest
} = {}) {
  const binding = normalizePedagogicalBlueprintBinding(rawBinding);
  const analysis = normalizeInstructionalAnalysis(rawAnalysis);
  const snapshot = normalizeEffectiveDesignSnapshot(rawSnapshot);
  const manifest = normalizeMaterializationManifest(rawManifest);
  const identityMismatches = [];
  if (versionedRefKey(snapshot.analysisRef) !== versionedRefKey(analysis)) {
    identityMismatches.push("snapshot_analysis");
  }
  if (versionedRefKey(binding?.analysisRef) !== versionedRefKey(analysis)) {
    identityMismatches.push("binding_analysis");
  }
  if (versionedRefKey(binding?.effectiveSnapshotRef) !== versionedRefKey(snapshot)) {
    identityMismatches.push("binding_snapshot");
  }
  if (versionedRefKey(manifest.analysisRef) !== versionedRefKey(analysis)) {
    identityMismatches.push("manifest_analysis");
  }
  if (versionedRefKey(manifest.effectiveSnapshotRef) !== versionedRefKey(snapshot)) {
    identityMismatches.push("manifest_snapshot");
  }
  if (versionedRefKey(manifest.blueprintRef) !== versionedRefKey(binding?.blueprintRef)) {
    identityMismatches.push("manifest_blueprint");
  }
  if (scopeKey(snapshot.scope) !== scopeKey(analysis.scope)) {
    identityMismatches.push("snapshot_scope");
  }
  if (snapshot.scopeEntityVersion !== analysis.derivedFrom.scopeEntityVersion) {
    identityMismatches.push("snapshot_entity_version");
  }
  if (snapshot.basedOnWorkspaceRevision < analysis.derivedFrom.workspaceRevision) {
    identityMismatches.push("snapshot_workspace_revision");
  }
  if (scopeKey(binding?.scope) !== scopeKey(analysis.scope)) {
    identityMismatches.push("binding_scope");
  }
  if (scopeKey(manifest.scope) !== scopeKey(analysis.scope)) {
    identityMismatches.push("manifest_scope");
  }
  if (manifest.materializedWorkspaceRevision < snapshot.basedOnWorkspaceRevision) {
    identityMismatches.push("manifest_workspace_revision");
  }
  if (manifest.scopeEntityVersion !== snapshot.scopeEntityVersion) {
    identityMismatches.push("manifest_scope_entity_version");
  }
  const plannedByRef = new Map(manifest.plannedSteps.map((step) => [step.stepRef, step]));
  const materializedByRef = new Map(
    manifest.materializedSteps.map((step) => [step.stepRef, step])
  );
  const planned = new Set(plannedByRef.keys());
  const materialized = new Set(materializedByRef.keys());
  const boundSteps = bindingStepIds(binding);
  const missingFromPlan = [...boundSteps].filter((stepRef) => !planned.has(stepRef)).sort();
  const plannedOutsideBinding = [...planned].filter((stepRef) => !boundSteps.has(stepRef)).sort();
  const missingMaterialization = [...planned].filter((stepRef) => !materialized.has(stepRef)).sort();
  const materializedOutsidePlan = [...materialized].filter((stepRef) => !planned.has(stepRef)).sort();
  const boundIntent = bindingStepIntent(binding);
  const plannedBindingMismatches = [...planned].filter((stepRef) => boundIntent.has(stepRef))
    .map((stepRef) => {
      const expected = boundIntent.get(stepRef);
      const plannedStep = plannedByRef.get(stepRef);
      const fields = [];
      if (expected.kind !== plannedStep.kind) fields.push("kind");
      if (JSON.stringify(expected.unitRefs) !== JSON.stringify([...plannedStep.unitRefs].sort())) {
        fields.push("unitRefs");
      }
      return fields.length ? { stepRef, fields } : null;
    })
    .filter(Boolean);
  const stepContractMismatches = [...planned].filter((stepRef) => materialized.has(stepRef))
    .map((stepRef) => {
      const plannedStep = plannedByRef.get(stepRef);
      const materializedStep = materializedByRef.get(stepRef);
      const fields = [];
      if (plannedStep.kind !== materializedStep.kind) fields.push("kind");
      const plannedUnits = [...plannedStep.unitRefs].sort();
      const materializedUnits = [...materializedStep.unitRefs].sort();
      if (JSON.stringify(plannedUnits) !== JSON.stringify(materializedUnits)) fields.push("unitRefs");
      return fields.length ? { stepRef, fields } : null;
    })
    .filter(Boolean);
  const explanationCoverage = new Map(
    manifest.explanationCoverage.map((entry) => [entry.requirementRef, entry])
  );
  const evidenceCoverage = new Map(
    manifest.evidenceCoverage.map((entry) => [entry.requirementRef, entry])
  );
  const missingExplanationCoverage = analysis.explanationRequirements
    .map(({ id: requirementRef }) => requirementRef)
    .filter((requirementRef) => !explanationCoverage.has(requirementRef))
    .sort();
  const knownExplanationRefs = new Set(
    analysis.explanationRequirements.map(({ id: requirementRef }) => requirementRef)
  );
  const explanationCoverageOutsideAnalysis = [...explanationCoverage.keys()]
    .filter((requirementRef) => !knownExplanationRefs.has(requirementRef))
    .sort();
  const explanationsNotDeveloped = [...explanationCoverage.values()]
    .filter(({ status }) => status === "mentioned" || status === "missing")
    .map(({ requirementRef }) => requirementRef)
    .sort();
  const missingEvidenceCoverage = analysis.evidenceRequirements
    .map(({ id: requirementRef }) => requirementRef)
    .filter((requirementRef) => !evidenceCoverage.has(requirementRef))
    .sort();
  const knownEvidenceRefs = new Set(
    analysis.evidenceRequirements.map(({ id: requirementRef }) => requirementRef)
  );
  const evidenceCoverageOutsideAnalysis = [...evidenceCoverage.keys()]
    .filter((requirementRef) => !knownEvidenceRefs.has(requirementRef))
    .sort();
  const evidenceNotCovered = [...evidenceCoverage.values()]
    .filter(({ status }) => status === "partial" || status === "missing")
    .map(({ requirementRef }) => requirementRef)
    .sort();
  const selectedIds = new Set(manifest.resourceSelections.map(({ id: selectionId }) => selectionId));
  const snapshotResourceSetRefs = snapshot.resourceSetRefs.map(versionedRefKey).sort();
  const manifestResourceSetRefs = manifest.resourceSetRefs.map(versionedRefKey).sort();
  const resourceSetRefMismatch = (
    JSON.stringify(snapshotResourceSetRefs) !== JSON.stringify(manifestResourceSetRefs)
  );
  const snapshotResourceSetRefSet = new Set(snapshotResourceSetRefs);
  const manifestResourceSetRefSet = new Set(manifestResourceSetRefs);
  const selectionsOutsideResourceSets = manifest.resourceSelections
    .filter(({ authorizedByResourceSetRef }) => {
      const key = versionedRefKey(authorizedByResourceSetRef);
      return !snapshotResourceSetRefSet.has(key) || !manifestResourceSetRefSet.has(key);
    })
    .map(({ id: selectionId }) => selectionId)
    .sort();
  const materializedSelectionIds = new Set(
    manifest.materializedResources.map(({ selectionRef }) => selectionRef)
  );
  const selectedNotMaterialized = [...selectedIds]
    .filter((selectionId) => !materializedSelectionIds.has(selectionId))
    .sort();
  const materializedWithoutSelection = manifest.materializedResources
    .filter(({ selectionRef }) => !selectedIds.has(selectionRef))
    .map(({ id: materializedId }) => materializedId)
    .sort();
  const selectedPackages = [...new Set(manifest.resourceSelections.map(({ package: packageRef }) => (
    packageRefKey(packageRef)
  )))].sort();
  const materializedPackages = [...new Set(manifest.materializedResources.map(({ package: packageRef }) => (
    packageRefKey(packageRef)
  )))].sort();
  const selectionsById = new Map(
    manifest.resourceSelections.map((selection) => [selection.id, selection])
  );
  const selectionMaterializationMismatches = manifest.materializedResources
    .map((materializedResource) => {
      const selection = selectionsById.get(materializedResource.selectionRef);
      if (!selection) return null;
      const fields = [];
      if (packageRefKey(selection.package) !== packageRefKey(materializedResource.package)) {
        fields.push("package");
      }
      if (selection.role !== materializedResource.role) fields.push("role");
      return fields.length ? { materializedResourceRef: materializedResource.id, fields } : null;
    })
    .filter(Boolean);
  const packageSetMismatch = JSON.stringify(selectedPackages) !== JSON.stringify(materializedPackages);
  const diff = {
    contract: INSTRUCTIONAL_MATERIALIZATION_DIFF_CONTRACT,
    scope: structuredClone(analysis.scope),
    analysisRef: { id: analysis.id, version: analysis.version },
    effectiveSnapshotRef: { id: snapshot.id, version: snapshot.version },
    materializationManifestRef: { id: manifest.id, version: manifest.version },
    identityMismatches,
    steps: {
      missingFromPlan,
      plannedOutsideBinding,
      missingMaterialization,
      materializedOutsidePlan,
      plannedBindingMismatches,
      stepContractMismatches
    },
    explanations: {
      missingCoverage: missingExplanationCoverage,
      coverageOutsideAnalysis: explanationCoverageOutsideAnalysis,
      notDeveloped: explanationsNotDeveloped,
      denominator: analysis.explanationRequirements.length
    },
    evidence: {
      missingCoverage: missingEvidenceCoverage,
      coverageOutsideAnalysis: evidenceCoverageOutsideAnalysis,
      notCovered: evidenceNotCovered,
      denominator: analysis.evidenceRequirements.length
    },
    resources: {
      selectedNotMaterialized,
      materializedWithoutSelection,
      selectedPackages,
      materializedPackages,
      snapshotResourceSetRefs,
      manifestResourceSetRefs,
      resourceSetRefMismatch,
      selectionsOutsideResourceSets,
      packageSetMismatch,
      selectionMaterializationMismatches
    }
  };
  diff.hasDifferences = identityMismatches.length > 0
    || Object.values(diff.steps).some((values) => values.length > 0)
    || missingExplanationCoverage.length > 0
    || explanationCoverageOutsideAnalysis.length > 0
    || explanationsNotDeveloped.length > 0
    || missingEvidenceCoverage.length > 0
    || evidenceCoverageOutsideAnalysis.length > 0
    || evidenceNotCovered.length > 0
    || selectedNotMaterialized.length > 0
    || materializedWithoutSelection.length > 0
    || resourceSetRefMismatch
    || selectionsOutsideResourceSets.length > 0
    || packageSetMismatch
    || selectionMaterializationMismatches.length > 0;
  return deepFreezeInstructionalDesignValue(diff);
}

export function selectUniqueMaterializationManifest({
  manifests,
  scope,
  materializedWorkspaceRevision
} = {}) {
  const matching = list(manifests).map(normalizeMaterializationManifest).filter((manifest) => (
    scopeKey(manifest.scope) === scopeKey(scope)
      && manifest.materializedWorkspaceRevision === materializedWorkspaceRevision
  ));
  if (matching.length > 1) {
    throw new InstructionalDesignBindingError(
      "Mais de um manifesto foi registrado para o mesmo escopo e revisão.",
      "AMBIGUOUS_MATERIALIZATION_MANIFEST"
    );
  }
  return matching[0] || null;
}
