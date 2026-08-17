import { validateStudyUnitEnvelope } from "../resources/kernel/studyUnitEnvelope.js";
import {
  DESIGN_PARAMETER_CATALOG,
  evaluateInstructionalDesignBundle
} from "./instructionalDesignContracts.js";
import {
  diffInstructionalIntentToMaterialization,
  normalizePedagogicalBlueprintBinding
} from "./instructionalDesignBinding.js";
import {
  normalizeDesignParameterAssignment,
  normalizeDesignParameterDefinition,
  normalizeEffectiveDesignSnapshot,
  normalizeInstructionalAnalysis,
  normalizeMaterializationManifest,
  normalizeResourceSet
} from "./instructionalDesignValidation.js";
import { evaluatePedagogicalBlueprint } from "./pedagogicalBlueprint.js";
import { packageRefKey, versionedRefKey } from "./resourceSetResolution.js";

export const AUTHORING_CONFORMANCE_AUDIT_CONTRACT = "AuthoringConformanceAudit@1";
export const AUTHORING_CONFORMANCE_AUDIT_ALGORITHM = Object.freeze({
  id: "aralearn.instructional-conformance",
  version: "1.0.0"
});

const CHECK_STATUS = Object.freeze({
  passed: "passed",
  failed: "failed",
  notApplicable: "not_applicable"
});

const SUMMARY_DIMENSIONS = Object.freeze([
  "structure",
  "design",
  "practice",
  "resources"
]);
const FINDING_CATEGORIES = Object.freeze([
  "structure", "design", "explanation", "practice", "resources",
  "coverage", "coherence", "dependencies", "redundancy", "integration"
]);
const FINDING_ORIGINS = Object.freeze(["deterministic", "semantic_audit"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function requireArray(value, name) {
  if (!Array.isArray(value)) {
    throw new TypeError(`A auditoria exige ${name} como lista.`);
  }
  return value;
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function boundedClone(value, limit = 50) {
  if (Array.isArray(value)) {
    const items = value.slice(0, limit).map((entry) => boundedClone(entry, limit));
    return value.length > limit
      ? { items, total: value.length, truncated: true }
      : items;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(
      ([key, entry]) => [key, boundedClone(entry, limit)]
    ));
  }
  return value;
}

function tupleKey(...values) {
  return JSON.stringify(values);
}

function ref(value) {
  return value ? { id: text(value.id), version: text(value.version) } : null;
}

function scope(value) {
  return value ? { kind: text(value.kind), ref: text(value.ref) } : null;
}

function compareText(left, right) {
  return left < right ? -1 : (left > right ? 1 : 0);
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
}

function validVersionedRef(value) {
  return plainObject(value)
    && Object.keys(value).length === 2
    && Object.hasOwn(value, "id")
    && Object.hasOwn(value, "version")
    && typeof value.id === "string"
    && typeof value.version === "string"
    && value.id === value.id.trim()
    && value.version === value.version.trim()
    && value.id.length >= 1
    && value.id.length <= 240
    && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(value.version);
}

function compactFindingDistribution(audit) {
  if (Array.isArray(audit?.findings)) {
    const byCategory = {};
    const byOrigin = {};
    audit.findings.forEach(({ category, origin }) => {
      const key = text(category);
      const originKey = text(origin);
      if (!FINDING_CATEGORIES.includes(key)) {
        throw new TypeError("A auditoria componente contém categoria de finding inválida.");
      }
      if (!FINDING_ORIGINS.includes(originKey)) {
        throw new TypeError("A auditoria componente contém origem de finding inválida.");
      }
      byCategory[key] = (byCategory[key] || 0) + 1;
      byOrigin[originKey] = (byOrigin[originKey] || 0) + 1;
    });
    return { total: audit.findings.length, byCategory, byOrigin };
  }
  const summary = audit?.findingSummary;
  if (!validVersionedRef(audit?.auditRunRef)
    || !plainObject(summary)
    || Object.keys(summary).length !== 3
    || !Object.hasOwn(summary, "total")
    || !Object.hasOwn(summary, "byCategory")
    || !Object.hasOwn(summary, "byOrigin")
    || !Number.isInteger(summary.total)
    || summary.total < 0
    || !plainObject(summary.byCategory)
    || !plainObject(summary.byOrigin)) {
    throw new TypeError("A auditoria componente exige findingSummary e auditRunRef canônicos.");
  }
  const categoryEntries = Object.entries(summary.byCategory);
  const originEntries = Object.entries(summary.byOrigin);
  if (categoryEntries.some(([category, count]) => (
    !FINDING_CATEGORIES.includes(category)
      || !Number.isInteger(count)
      || count < 0
  )) || originEntries.some(([origin, count]) => (
    !FINDING_ORIGINS.includes(origin)
      || !Number.isInteger(count)
      || count < 0
  ))
    || categoryEntries.reduce((total, [, count]) => total + count, 0) !== summary.total
    || originEntries.reduce((total, [, count]) => total + count, 0) !== summary.total) {
    throw new TypeError("A distribuição compacta de findings é inválida.");
  }
  return clone(summary);
}

function makeTarget(context, { cardId = "", resourceTargetId = "" } = {}) {
  const path = list(context?.microsequencePath).map(text).filter(Boolean);
  if (cardId) path.push(text(cardId));
  return {
    entityType: resourceTargetId ? "resource" : cardId ? "card" : "microsequence",
    entityPath: path,
    resourceTargetId: resourceTargetId || null
  };
}

function ruleRef(kind, id, version = null) {
  return { kind, id: text(id), version: version == null ? null : text(version) };
}

function checkFingerprint({ code, target, ruleRef: rule }) {
  return `v1:${tupleKey(
    code,
    target?.entityType,
    target?.entityPath,
    target?.resourceTargetId,
    rule?.kind,
    rule?.id,
    rule?.version
  )}`;
}

function findingForCheck(check) {
  if (check.status !== CHECK_STATUS.failed) return null;
  return {
    code: check.code,
    origin: "deterministic",
    category: check.category,
    severity: check.severity,
    target: clone(check.target),
    ruleRef: clone(check.ruleRef),
    publicEvidence: check.publicEvidence,
    proposedRepair: check.proposedRepair ?? null,
    fingerprint: checkFingerprint(check)
  };
}

function createCollector(context) {
  const checks = [];
  const findings = [];
  return {
    add({
      code,
      category,
      passed,
      applicable = true,
      severity = "high",
      target = makeTarget(context),
      rule = ruleRef("contract", code, "1.0.0"),
      publicEvidence,
      expected = null,
      actual = null,
      proposedRepair = null
    }) {
      const status = applicable
        ? passed ? CHECK_STATUS.passed : CHECK_STATUS.failed
        : CHECK_STATUS.notApplicable;
      const check = {
        code,
        category,
        status,
        severity,
        target: clone(target),
        ruleRef: clone(rule),
        publicEvidence: text(publicEvidence),
        expected: boundedClone(expected),
        actual: boundedClone(actual),
        proposedRepair: proposedRepair == null ? null : text(proposedRepair)
      };
      checks.push(check);
      const finding = findingForCheck(check);
      if (finding) findings.push(finding);
    },
    checks,
    findings
  };
}

function resolvedParameter(snapshot, id) {
  return list(snapshot?.resolvedValues).find(({ definitionRef }) => definitionRef?.id === id) || null;
}

function assignmentByRef(assignments, assignmentRef) {
  const key = versionedRefKey(assignmentRef);
  return assignments.find((assignment) => versionedRefKey(assignment) === key) || null;
}

function materializedStepsByRef(manifest) {
  return new Map(list(manifest?.materializedSteps).map((step) => [step.stepRef, step]));
}

function cardsById(cards) {
  return new Map(cards.map((card) => [text(card?.id), card]));
}

function cardInstances(cards) {
  const instances = [];
  const append = (card, slot, value, index) => {
    if (!value || typeof value !== "object") return;
    const role = slot === "response"
      ? "response"
      : card.role === "practice" ? "embedded_practice" : "exposition";
    instances.push({
      cardId: text(card.id),
      cardPosition: Number(card.position),
      studyUnitRole: text(card.role),
      slot,
      slotIndex: index,
      instanceId: text(value.id),
      resourceTargetId: `${slot}:${text(value.id)}`,
      package: {
        packageId: text(value.package),
        version: text(value.version)
      },
      role
    });
  };
  cards.forEach((card) => {
    list(card.content).forEach((value, index) => append(card, "content", value, index));
    if (card.response) append(card, "response", card.response, 0);
    list(card.feedback).forEach((value, index) => append(card, "feedback", value, index));
  });
  return instances.sort((left, right) => (
    left.cardPosition - right.cardPosition
      || compareText(left.cardId, right.cardId)
      || compareText(left.slot, right.slot)
      || left.slotIndex - right.slotIndex
  ));
}

function multiset(values, keyFor) {
  const counts = new Map();
  values.forEach((value) => {
    const key = keyFor(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

function multisetDifference(left, right) {
  const values = [];
  for (const [key, count] of left) {
    const missing = count - (right.get(key) || 0);
    for (let index = 0; index < missing; index += 1) values.push(key);
  }
  return values.sort(compareText);
}

function resourceFactKey(value) {
  return tupleKey(
    value.cardId || value.artifactRef,
    packageRefKey(value.package),
    value.role
  );
}

function visibleTextForCard(card, packageRegistry) {
  const values = [];
  const append = (instance, slot) => {
    try {
      values.push(text(packageRegistry?.accessibleText?.(instance, slot)));
    } catch {
      values.push("");
    }
  };
  list(card.content).forEach((instance) => append(instance, "content"));
  if (card.response) append(card.response, "response");
  list(card.feedback).forEach((instance) => append(instance, "feedback"));
  return values.filter(Boolean).join(" ").replace(/\s+/gu, " ").trim();
}

function boundedReferenceList(values, name) {
  const references = sortedUnique(requireArray(values, name).map(text).filter(Boolean));
  return {
    items: references.slice(0, 5),
    count: references.length,
    truncated: references.length > 5
  };
}

function boundedOrderedList(values, name, limit = 20) {
  const entries = requireArray(values, name);
  return {
    items: entries.slice(0, limit).map(clone),
    count: entries.length,
    truncated: entries.length > limit
  };
}

function metric(id, value, unit, denominator, inputRefs) {
  return {
    id,
    kind: "derived",
    value,
    unit,
    denominator: {
      count: denominator.count,
      unit: denominator.unit,
      refs: boundedReferenceList(denominator.refs, "denominator.refs")
    },
    algorithm: {
      ...AUTHORING_CONFORMANCE_AUDIT_ALGORITHM,
      inputRefs: boundedReferenceList(inputRefs, "algorithm.inputRefs")
    }
  };
}

function normalizeInputs(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("A auditoria exige um objeto de entrada.");
  }
  const analysis = normalizeInstructionalAnalysis(raw.analysis);
  const parameterDefinitions = requireArray(
    raw.parameterDefinitions,
    "parameterDefinitions"
  ).map(normalizeDesignParameterDefinition);
  const parameterAssignments = requireArray(
    raw.parameterAssignments,
    "parameterAssignments"
  ).map(normalizeDesignParameterAssignment);
  const effectiveSnapshot = normalizeEffectiveDesignSnapshot(raw.effectiveSnapshot);
  const resourceSets = requireArray(raw.resourceSets, "resourceSets").map(normalizeResourceSet);
  const binding = normalizePedagogicalBlueprintBinding(raw.binding);
  const materializationManifest = normalizeMaterializationManifest(raw.materializationManifest);
  const cards = clone(requireArray(raw.cards, "cards"));
  return {
    analysis,
    parameterDefinitions,
    parameterAssignments,
    effectiveSnapshot,
    resourceSets,
    blueprint: clone(raw.blueprint),
    binding,
    materializationManifest,
    cards
  };
}

function normalizeAuditContext(raw, analysis) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("A auditoria exige contexto corrente e cercado por revisão.");
  }
  const workspaceId = text(raw.workspaceId);
  const microsequencePath = requireArray(
    raw.microsequencePath,
    "context.microsequencePath"
  ).map(text);
  const auditedRevision = Number(raw.auditedRevision);
  const materializationStateRevision = Number(raw.materializationStateRevision);
  const currentContentHash = text(raw.currentContentHash);
  const materializationState = text(raw.materializationState);
  if (!workspaceId
    || analysis.scope?.kind !== "microsequence"
    || microsequencePath.length !== 4
    || microsequencePath.some((entry) => !entry)
    || microsequencePath[3] !== analysis.scope.ref
    || !Number.isSafeInteger(auditedRevision)
    || auditedRevision < 1
    || !Number.isSafeInteger(materializationStateRevision)
    || materializationStateRevision < 0
    || !/^[a-f0-9]{64}$/u.test(currentContentHash)
    || !materializationState) {
    throw new TypeError("O contexto da auditoria não identifica a materialização corrente.");
  }
  return {
    workspaceId,
    microsequencePath,
    auditedRevision,
    materializationStateRevision,
    currentContentHash,
    materializationState
  };
}

function addBundleChecks(collector, value) {
  const bundle = evaluateInstructionalDesignBundle({
    analysis: value.analysis,
    parameterDefinitions: value.parameterDefinitions,
    parameterAssignments: value.parameterAssignments,
    effectiveSnapshot: value.effectiveSnapshot,
    resourceSets: value.resourceSets,
    materializationManifest: value.materializationManifest
  });
  collector.add({
    code: "instructional_contract_bundle",
    category: "structure",
    passed: bundle.valid,
    publicEvidence: bundle.valid
      ? "Análise, parâmetros, snapshot, ResourceSets e manifesto têm referências coerentes."
      : bundle.errors.slice(0, 5).join(" "),
    expected: "bundle_valid",
    actual: bundle.valid ? "bundle_valid" : bundle.errors.slice(0, 20),
    proposedRepair: "Corrigir as referências ou contratos citados sem alterar o conteúdo fora do achado."
  });
  const diff = diffInstructionalIntentToMaterialization({
    analysis: value.analysis,
    effectiveSnapshot: value.effectiveSnapshot,
    binding: value.binding,
    materializationManifest: value.materializationManifest
  });
  const hasStructuralDifference = diff.identityMismatches.length > 0
    || Object.values(diff.steps).some((entries) => entries.length > 0)
    || diff.resources.selectedNotMaterialized.length > 0
    || diff.resources.materializedWithoutSelection.length > 0
    || diff.resources.resourceSetRefMismatch
    || diff.resources.selectionsOutsideResourceSets.length > 0
    || diff.resources.packageSetMismatch
    || diff.resources.selectionMaterializationMismatches.length > 0;
  collector.add({
    code: "planned_materialized_alignment",
    category: "design",
    passed: !hasStructuralDifference,
    publicEvidence: hasStructuralDifference
      ? "O diff factual encontrou divergências entre binding, plano e manifesto."
      : "Binding, passos planejados e manifesto usam as mesmas identidades estruturadas.",
    expected: "no_structural_difference",
    actual: hasStructuralDifference ? diff : "no_structural_difference",
    proposedRepair: "Reconciliar somente as referências divergentes e registrar novo manifesto."
  });
  return { bundle, diff };
}

function addBlueprintChecks(collector, value, packageRegistry) {
  const result = evaluatePedagogicalBlueprint(value.blueprint, packageRegistry);
  collector.add({
    code: "blueprint_contract",
    category: "structure",
    passed: result.valid,
    publicEvidence: result.valid
      ? "O blueprint v2 preserva camadas, passos e packages referenciados."
      : result.errors.slice(0, 5).join(" "),
    expected: "blueprint_valid",
    actual: result.valid ? "blueprint_valid" : result.errors.slice(0, 20),
    rule: ruleRef("contract", "PedagogicalBlueprint", "2"),
    proposedRepair: "Corrigir o blueprint e seu binding antes de reparar cards."
  });
}

function addCardAndResourceChecks(collector, value, packageRegistry, context) {
  const manifest = value.materializationManifest;
  const cardMap = cardsById(value.cards);
  const cardErrors = [];
  value.cards.forEach((card, index) => {
    const validation = validateStudyUnitEnvelope(card, packageRegistry, `studyUnits[${index}]`);
    cardErrors.push(...validation.errors);
  });
  collector.add({
    code: "materialized_card_contracts",
    category: "resources",
    passed: cardErrors.length === 0,
    publicEvidence: cardErrors.length
      ? cardErrors.slice(0, 5).join(" ")
      : `${value.cards.length} cards obedecem aos envelopes e contracts dos packages.`,
    expected: "all_cards_valid",
    actual: cardErrors.length ? cardErrors.slice(0, 20) : "all_cards_valid",
    proposedRepair: "Corrigir apenas o card ou resource apontado pelo erro de contrato."
  });

  const analysisSourceRefs = new Set(value.analysis.sourceRefs);
  const sourceMismatches = value.cards.flatMap((card) => list(card.sources)
    .filter((sourceRef) => !analysisSourceRefs.has(sourceRef))
    .map((sourceRef) => ({ cardId: card.id, sourceRef })));
  collector.add({
    code: "card_sources_trace_to_analysis",
    category: "structure",
    passed: sourceMismatches.length === 0,
    target: sourceMismatches[0]
      ? makeTarget(context, { cardId: sourceMismatches[0].cardId })
      : makeTarget(context),
    publicEvidence: sourceMismatches.length
      ? `${sourceMismatches.length} referências de fonte dos cards não pertencem à análise vigente.`
      : "As referências de fonte declaradas nos cards pertencem à análise vigente.",
    expected: [...analysisSourceRefs].sort(compareText),
    actual: sourceMismatches,
    rule: ruleRef("traceability", "analysis-source-refs", "1.0.0"),
    proposedRepair: "Atualizar a análise ou remover a referência sem origem, sem inventar fonte."
  });

  const actualCardIds = sortedUnique(value.cards.map(({ id }) => text(id)));
  const declaredCardIds = sortedUnique(list(manifest.materializedSteps).flatMap(
    ({ artifactRefs }) => list(artifactRefs).map(text)
  ));
  collector.add({
    code: "actual_cards_match_artifact_refs",
    category: "structure",
    passed: JSON.stringify(actualCardIds) === JSON.stringify(declaredCardIds),
    publicEvidence: `Cards atuais: ${actualCardIds.length}; artifactRefs declarados: ${declaredCardIds.length}.`,
    expected: declaredCardIds,
    actual: actualCardIds,
    proposedRepair: "Registrar manifesto para o conjunto exato de cards correntes."
  });

  const stepByRef = materializedStepsByRef(manifest);
  const roleMismatches = [];
  stepByRef.forEach((step) => {
    list(step.artifactRefs).forEach((cardId) => {
      const card = cardMap.get(cardId);
      if (card && card.role !== step.kind) roleMismatches.push({ cardId, stepRef: step.stepRef });
    });
  });
  collector.add({
    code: "card_role_matches_materialized_step",
    category: "structure",
    passed: roleMismatches.length === 0,
    publicEvidence: roleMismatches.length
      ? `Cards com papel diferente do passo: ${roleMismatches.map(({ cardId }) => cardId).join(", ")}.`
      : "Cada card materializado preserva o papel theory/practice de seu passo.",
    expected: "matching_roles",
    actual: roleMismatches,
    proposedRepair: "Alinhar o papel do card ao passo correspondente sem trocar sua intenção."
  });

  const actualInstances = cardInstances(value.cards);
  const actual = multiset(actualInstances, resourceFactKey);
  const declared = multiset(list(manifest.materializedResources), resourceFactKey);
  const undeclaredActual = multisetDifference(actual, declared);
  const declaredNotActual = multisetDifference(declared, actual);
  const firstDivergentInstance = actualInstances.find((instance) => (
    undeclaredActual.includes(resourceFactKey(instance))
  ));
  collector.add({
    code: "actual_resources_match_manifest",
    category: "resources",
    passed: undeclaredActual.length === 0 && declaredNotActual.length === 0,
    target: firstDivergentInstance
      ? makeTarget(context, {
          cardId: firstDivergentInstance.cardId,
          resourceTargetId: firstDivergentInstance.resourceTargetId
        })
      : makeTarget(context),
    publicEvidence: undeclaredActual.length || declaredNotActual.length
      ? `Instâncias reais não declaradas: ${undeclaredActual.length}; declarações sem instância real: ${declaredNotActual.length}.`
      : `${actualInstances.length} instâncias reais coincidem com package@version, papel e card declarados.`,
    expected: { undeclaredActual: [], declaredNotActual: [] },
    actual: { undeclaredActual, declaredNotActual },
    proposedRepair: "Refazer o manifesto a partir das instâncias reais ou corrigir o resource divergente."
  });

  const materializedByFact = new Map();
  list(manifest.materializedResources).forEach((entry) => {
    const key = resourceFactKey(entry);
    if (!materializedByFact.has(key)) materializedByFact.set(key, []);
    materializedByFact.get(key).push(entry);
  });
  const selectionById = new Map(list(manifest.resourceSelections).map((entry) => [entry.id, entry]));
  const setByRef = new Map(value.resourceSets.map((entry) => [versionedRefKey(entry), entry]));
  const authorizationErrors = [];
  actualInstances.forEach((instance) => {
    const declaredEntries = materializedByFact.get(resourceFactKey(instance)) || [];
    const declaredEntry = declaredEntries.shift();
    if (!declaredEntry) {
      authorizationErrors.push({
        cardId: instance.cardId,
        resourceTargetId: instance.resourceTargetId,
        package: instance.package,
        selectionRef: null
      });
      return;
    }
    const selection = selectionById.get(declaredEntry.selectionRef);
    const authorizer = selection ? setByRef.get(versionedRefKey(selection.authorizedByResourceSetRef)) : null;
    const packageAllowed = authorizer && list(authorizer.packages).some(
      (entry) => packageRefKey(entry) === packageRefKey(instance.package)
    );
    if (!selection || !packageAllowed || selection.role !== instance.role) {
      authorizationErrors.push({
        cardId: instance.cardId,
        resourceTargetId: instance.resourceTargetId,
        package: instance.package,
        selectionRef: declaredEntry.selectionRef
      });
    }
  });
  collector.add({
    code: "actual_resources_preserve_resource_set_condition",
    category: "resources",
    passed: authorizationErrors.length === 0,
    severity: "critical",
    target: authorizationErrors[0]
      ? makeTarget(context, {
          cardId: authorizationErrors[0].cardId,
          resourceTargetId: authorizationErrors[0].resourceTargetId
        })
      : makeTarget(context),
    publicEvidence: authorizationErrors.length
      ? `${authorizationErrors.length} instâncias atuais não têm seleção e ResourceSet autorizador compatíveis.`
      : "Cada instância atual preserva package@version, papel e ResourceSet da condição efetiva.",
    expected: "all_actual_instances_authorized",
    actual: authorizationErrors,
    rule: ruleRef("parameter", "available_resource_set_refs", "1.0.0"),
    proposedRepair: "Restaurar os resources autorizados pela condição ou registrar uma limitação permitida."
  });

  return actualInstances;
}

function addLockCheck(collector, value) {
  const violations = [];
  list(value.effectiveSnapshot.resolvedValues).forEach((resolved) => {
    if (resolved?.resolution?.assignmentMode !== "research_lock") return;
    const assignment = assignmentByRef(value.parameterAssignments, resolved.resolution.assignmentRef);
    if (!assignment
      || assignment.mode !== "research_lock"
      || JSON.stringify(assignment.value) !== JSON.stringify(resolved.value)) {
      violations.push(resolved.definitionRef);
    }
  });
  collector.add({
    code: "research_lock_preserved",
    category: "design",
    passed: violations.length === 0,
    severity: "critical",
    publicEvidence: violations.length
      ? `Locks divergentes: ${violations.map(({ id }) => id).join(", ")}.`
      : "Todos os valores com research_lock no snapshot coincidem com seus assignments imutáveis.",
    expected: "all_research_locks_preserved",
    actual: violations,
    rule: ruleRef("authority", "research_lock", "1.0.0"),
    proposedRepair: "Restaurar a condição bloqueada; o auditor não pode alterar o lock."
  });
}

function addTheoryAndPracticeChecks(collector, value, context) {
  const manifestSteps = materializedStepsByRef(value.materializationManifest);
  const cardMap = cardsById(value.cards);
  const earliest = (stepRef) => Math.min(
    ...list(manifestSteps.get(stepRef)?.artifactRefs)
      .map((cardId) => Number(cardMap.get(cardId)?.position))
      .filter(Number.isFinite)
  );
  const theoryByUnit = new Map();
  value.binding.mappings.theorySteps.forEach((step) => {
    const position = earliest(step.stepId);
    step.unitRefs.forEach((unitRef) => {
      if (!theoryByUnit.has(unitRef) || position < theoryByUnit.get(unitRef)) {
        theoryByUnit.set(unitRef, position);
      }
    });
  });
  const practiceBeforeTheory = [];
  value.binding.mappings.practiceSteps.forEach((step) => {
    const practicePosition = earliest(step.stepId);
    step.unitRefs.forEach((unitRef) => {
      const theoryPosition = theoryByUnit.get(unitRef);
      if (!Number.isFinite(theoryPosition)
        || !Number.isFinite(practicePosition)
        || theoryPosition >= practicePosition) {
        practiceBeforeTheory.push({ stepRef: step.stepId, unitRef, theoryPosition, practicePosition });
      }
    });
  });
  const firstPractice = practiceBeforeTheory[0];
  const firstPracticeCard = firstPractice
    ? list(manifestSteps.get(firstPractice.stepRef)?.artifactRefs)[0]
    : "";
  collector.add({
    code: "practice_after_required_theory",
    category: "practice",
    passed: practiceBeforeTheory.length === 0,
    target: makeTarget(context, { cardId: firstPracticeCard }),
    publicEvidence: practiceBeforeTheory.length
      ? `${practiceBeforeTheory.length} vínculos de prática aparecem antes da teoria necessária.`
      : "Cada unidade praticada possui materialização teórica anterior na ordem real dos cards.",
    expected: "theory_position_before_practice",
    actual: practiceBeforeTheory,
    rule: ruleRef("blueprint", "theory-before-practice", "2"),
    proposedRepair: "Mover ou fundamentar a prática sem introduzir conteúdo novo nela."
  });
}

function addNumericParameterChecks(collector, value, context) {
  const unitById = new Map(value.analysis.units.map((unit) => [unit.id, unit]));
  const assumedNew = new Set([
    ...value.analysis.units
      .filter(({ priorKnowledge }) => ["new", "unknown"].includes(priorKnowledge?.state))
      .map(({ id }) => id),
    ...value.analysis.coordinationRequirements.flatMap(({ assumedNewUnitRefs }) => assumedNewUnitRefs)
  ]);
  const stepLimit = resolvedParameter(value.effectiveSnapshot, "new_units_per_theory_step_ceiling");
  const stepViolations = [];
  if (stepLimit?.value?.kind === "integer") {
    value.binding.mappings.theorySteps.forEach((step) => {
      const refs = step.unitRefs.filter((unitRef) => assumedNew.has(unitRef) && unitById.has(unitRef));
      if (refs.length > stepLimit.value.value) {
        stepViolations.push({ stepRef: step.stepId, count: refs.length, unitRefs: refs.sort(compareText) });
      }
    });
  }
  collector.add({
    code: "new_units_per_theory_step_ceiling",
    category: "design",
    applicable: stepLimit?.value?.kind === "integer",
    passed: stepViolations.length === 0,
    target: stepViolations[0]
      ? makeTarget(context, {
          cardId: list(materializedStepsByRef(value.materializationManifest)
            .get(stepViolations[0].stepRef)?.artifactRefs)[0]
        })
      : makeTarget(context),
    publicEvidence: stepLimit?.value?.kind === "integer"
      ? stepViolations.length
        ? `${stepViolations.length} passos excedem o limite efetivo ${stepLimit.value.value}.`
        : `Nenhum passo excede o limite efetivo ${stepLimit.value.value}.`
      : "O snapshot não contém este parâmetro.",
    expected: stepLimit?.value?.value ?? null,
    actual: stepViolations,
    rule: ruleRef("parameter", "new_units_per_theory_step_ceiling", "1.0.0"),
    proposedRepair: "Descomprimir o passo preservando dependências e desenvolvimento explicativo."
  });

  const coordinationLimit = resolvedParameter(
    value.effectiveSnapshot,
    "simultaneous_new_units_per_coordination_set_ceiling"
  );
  const coordinationViolations = [];
  if (coordinationLimit?.value?.kind === "integer") {
    value.analysis.coordinationRequirements.forEach((requirement) => {
      if (requirement.assumedNewUnitRefs.length > coordinationLimit.value.value) {
        coordinationViolations.push({
          requirementRef: requirement.id,
          count: requirement.assumedNewUnitRefs.length,
          unitRefs: clone(requirement.assumedNewUnitRefs)
        });
      }
    });
  }
  collector.add({
    code: "simultaneous_new_units_per_coordination_set_ceiling",
    category: "design",
    applicable: coordinationLimit?.value?.kind === "integer",
    passed: coordinationViolations.length === 0,
    publicEvidence: coordinationLimit?.value?.kind === "integer"
      ? coordinationViolations.length
        ? `${coordinationViolations.length} conjuntos explícitos excedem o limite efetivo.`
        : "Os conjuntos explícitos respeitam a cardinalidade efetiva."
      : "O snapshot não contém este parâmetro.",
    expected: coordinationLimit?.value?.value ?? null,
    actual: coordinationViolations,
    rule: ruleRef("parameter", "simultaneous_new_units_per_coordination_set_ceiling", "1.0.0"),
    proposedRepair: "Rever a coordenação planejada sem chamar a cardinalidade de carga cognitiva."
  });
}

function addCoverageChecks(collector, value) {
  const manifest = value.materializationManifest;
  const explanation = new Map(manifest.explanationCoverage.map((entry) => [entry.requirementRef, entry]));
  const applicable = resolvedParameter(value.effectiveSnapshot, "applicable_explanation_requirement_refs");
  const requiredRefs = applicable?.value?.kind === "set"
    ? applicable.value.values.map(String)
    : value.analysis.explanationRequirements.map(({ id }) => id);
  const explanationGaps = requiredRefs.filter((requirementRef) => {
    const entry = explanation.get(requirementRef);
    return !entry || ["mentioned", "missing"].includes(entry.status);
  });
  collector.add({
    code: "applicable_explanation_coverage",
    category: "explanation",
    passed: explanationGaps.length === 0,
    publicEvidence: explanationGaps.length
      ? `Requisitos sem desenvolvimento declarado: ${explanationGaps.join(", ")}.`
      : `${requiredRefs.length} requisitos aplicáveis possuem cobertura estrutural declarada.`,
    expected: requiredRefs,
    actual: explanationGaps,
    rule: ruleRef("parameter", "applicable_explanation_requirement_refs", "1.0.0"),
    proposedRepair: "Desenvolver somente os requisitos aprovados; uma menção não basta."
  });

  const evidence = new Map(manifest.evidenceCoverage.map((entry) => [entry.requirementRef, entry]));
  const evidenceGaps = value.analysis.evidenceRequirements
    .map(({ id }) => id)
    .filter((requirementRef) => {
      const entry = evidence.get(requirementRef);
      return !entry || ["partial", "missing"].includes(entry.status);
    });
  collector.add({
    code: "evidence_requirement_coverage",
    category: "practice",
    passed: evidenceGaps.length === 0,
    publicEvidence: evidenceGaps.length
      ? `Requisitos de evidência incompletos: ${evidenceGaps.join(", ")}.`
      : `${value.analysis.evidenceRequirements.length} requisitos possuem vínculos estruturais de prática.`,
    expected: value.analysis.evidenceRequirements.map(({ id }) => id),
    actual: evidenceGaps,
    rule: ruleRef("requirement", "evidenceRequirements", "1.0.0"),
    proposedRepair: "Materializar uma oportunidade pertinente sem inferir aprendizagem a partir da cobertura."
  });

  const range = resolvedParameter(
    value.effectiveSnapshot,
    "distinct_practice_opportunities_per_evidence_requirement"
  );
  const opportunityViolations = [];
  if (range?.value?.kind === "range") {
    value.analysis.evidenceRequirements.forEach(({ id: requirementRef }) => {
      const signatures = new Set(manifest.practiceOpportunities
        .filter(({ evidenceRequirementRefs }) => evidenceRequirementRefs.includes(requirementRef))
        .map(({ semanticSignature }) => text(semanticSignature))
        .filter(Boolean));
      if (signatures.size < range.value.minimum || signatures.size > range.value.maximum) {
        opportunityViolations.push({ requirementRef, count: signatures.size });
      }
    });
  }
  collector.add({
    code: "declared_distinct_practice_range",
    category: "practice",
    applicable: range?.value?.kind === "range",
    passed: opportunityViolations.length === 0,
    publicEvidence: range?.value?.kind === "range"
      ? opportunityViolations.length
        ? `${opportunityViolations.length} requisitos estão fora da faixa de assinaturas declaradas.`
        : "As assinaturas declaradas estão na faixa efetiva. Sua distinção semântica ainda requer revisão."
      : "O snapshot não contém este parâmetro.",
    expected: range?.value ?? null,
    actual: opportunityViolations,
    rule: ruleRef("parameter", "distinct_practice_opportunities_per_evidence_requirement", "1.0.0"),
    proposedRepair: "Rever oportunidades aprovadas; não multiplicar variações cosméticas para cumprir contagem."
  });
}

function buildMetrics(value, actualInstances, packageRegistry) {
  const cards = value.cards;
  const theoryCards = cards.filter(({ role }) => role === "theory");
  const practiceCards = cards.filter(({ role }) => role === "practice");
  const visible = cards.map((card) => visibleTextForCard(card, packageRegistry));
  const characters = visible.reduce((total, entry) => total + [...entry].length, 0);
  const words = visible.reduce((total, entry) => (
    total + (entry ? entry.split(/\s+/u).filter(Boolean).length : 0)
  ), 0);
  const denominator = {
    count: 1,
    unit: "materialization_manifest",
    refs: [`${value.materializationManifest.id}@${value.materializationManifest.version}`]
  };
  const inputs = [
    `${value.materializationManifest.id}@${value.materializationManifest.version}`,
    `content:${value.materializationManifest.contentHash}`
  ];
  return [
    metric("materialized_card_count", cards.length, "card", denominator, inputs),
    metric("materialized_theory_card_count", theoryCards.length, "theory_card", denominator, inputs),
    metric("materialized_practice_card_count", practiceCards.length, "practice_card", denominator, inputs),
    metric("materialized_resource_instance_count", actualInstances.length, "resource_instance", denominator, inputs),
    metric("materialized_visible_character_count", characters, "unicode_code_point", denominator, inputs),
    metric("materialized_visible_word_count", words, "whitespace_token", denominator, inputs)
  ];
}

function summaryFor(checks, findings) {
  const dimensions = Object.fromEntries(SUMMARY_DIMENSIONS.map((dimension) => {
    const applicable = checks.filter((check) => check.category === dimension
      || (dimension === "design" && check.category === "explanation"));
    const state = applicable.length === 0
      ? "not_checked"
      : applicable.some(({ status }) => status === CHECK_STATUS.failed)
        ? "finding"
        : applicable.every(({ status }) => status === CHECK_STATUS.notApplicable)
          ? "not_checked"
          : "conformant";
    return [dimension, state];
  }));
  return {
    ...dimensions,
    deterministicFindingCount: findings.length,
    checkCounts: {
      passed: checks.filter(({ status }) => status === CHECK_STATUS.passed).length,
      failed: checks.filter(({ status }) => status === CHECK_STATUS.failed).length,
      notApplicable: checks.filter(({ status }) => status === CHECK_STATUS.notApplicable).length
    }
  };
}

export function deriveActualMaterializedResources(cards) {
  return clone(cardInstances(requireArray(cards, "cards")));
}

export function auditInstructionalConformance(raw = {}) {
  const value = normalizeInputs(raw);
  const context = normalizeAuditContext(raw.context, value.analysis);
  const collector = createCollector(context);
  collector.add({
    code: "manifest_tracks_current_materialization",
    category: "structure",
    applicable: true,
    passed: (!context.currentContentHash
        || context.currentContentHash === value.materializationManifest.contentHash)
      && (!context.materializationState || context.materializationState === "tracked"),
    severity: "critical",
    publicEvidence: `Estado atual: ${context.materializationState}; hash atual: ${context.currentContentHash}.`,
    expected: {
      materializationState: "tracked",
      contentHash: value.materializationManifest.contentHash
    },
    actual: {
      materializationState: context.materializationState || null,
      contentHash: context.currentContentHash || null
    },
    rule: ruleRef("materialization", "current-content-fingerprint", "1.0.0"),
    proposedRepair: "Registrar um manifesto novo para os cards correntes antes de auditar."
  });
  addBundleChecks(collector, value);
  addBlueprintChecks(collector, value, raw.packageRegistry);
  const actualInstances = addCardAndResourceChecks(
    collector,
    value,
    raw.packageRegistry,
    context
  );
  addLockCheck(collector, value);
  addTheoryAndPracticeChecks(collector, value, context);
  addNumericParameterChecks(collector, value, context);
  addCoverageChecks(collector, value);
  const metrics = buildMetrics(value, actualInstances, raw.packageRegistry);
  const report = {
    contract: AUTHORING_CONFORMANCE_AUDIT_CONTRACT,
    algorithm: clone(AUTHORING_CONFORMANCE_AUDIT_ALGORITHM),
    scope: scope(value.analysis.scope),
    auditedRevision: context.auditedRevision,
    materializationStateRevision: context.materializationStateRevision,
    contentHash: value.materializationManifest.contentHash,
    refs: {
      analysisRef: ref(value.analysis),
      effectiveSnapshotRef: ref(value.effectiveSnapshot),
      blueprintRef: ref(value.materializationManifest.blueprintRef),
      bindingRef: ref(value.binding),
      manifestRef: ref(value.materializationManifest),
      resourceSetRefs: value.effectiveSnapshot.resourceSetRefs.map(ref)
    },
    checks: collector.checks,
    findings: collector.findings,
    metrics,
    semanticReview: [
      {
        code: "semantic_excessive_compression",
        category: "design",
        ruleRef: ruleRef("parameter", "new_units_per_theory_step_ceiling", "1.0.0"),
        question: "O conteúdo real introduz unidades ou relações não declaradas e as comprime além do desenho?"
      },
      {
        code: "semantic_explanation_only_mentioned",
        category: "explanation",
        ruleRef: ruleRef("requirement", "explanationRequirements", "1.0.0"),
        question: "Cada requisito marcado como desenvolvido é realmente explicado, e não apenas mencionado?"
      },
      {
        code: "semantic_practice_operation_mismatch",
        category: "practice",
        ruleRef: ruleRef("requirement", "evidenceRequirements", "1.0.0"),
        question: "A prática realmente elicita a operação pretendida e varia dimensões relevantes?"
      },
      {
        code: "semantic_representation_mismatch",
        category: "resources",
        ruleRef: ruleRef("requirement", "representationRequirements", "1.0.0"),
        question: "A representação preserva a estrutura e a operação pretendidas sem alegar equivalência artificial?"
      }
    ],
    epistemicBoundary: "Esta auditoria verifica contratos, referências e operacionalizações de desenho. Não mede carga cognitiva, proficiência, compreensão nem eficácia educacional."
  };
  report.summary = summaryFor(report.checks, report.findings);
  return Object.freeze(report);
}

export function aggregatePartConformanceAudits({
  part,
  audits,
  auditedRevision
} = {}) {
  const normalizedAudits = requireArray(audits, "audits");
  const microsequenceIds = requireArray(
    part?.microsequenceIds,
    "part.microsequenceIds"
  ).map(text).filter(Boolean);
  const partId = text(part?.id);
  if (!partId || !microsequenceIds.length || microsequenceIds.length > 500
    || new Set(microsequenceIds).size !== microsequenceIds.length) {
    throw new TypeError("A agregação exige uma Parte identificada com microssequências únicas.");
  }
  if (!Number.isInteger(auditedRevision) || auditedRevision < 1) {
    throw new TypeError("A agregação exige uma revisão auditada positiva e comum.");
  }
  const validSummaryState = new Set(["conformant", "finding", "not_checked"]);
  if (normalizedAudits.some((audit) => (
    !plainObject(audit)
    || audit.contract !== AUTHORING_CONFORMANCE_AUDIT_CONTRACT
    || audit.algorithm?.id !== AUTHORING_CONFORMANCE_AUDIT_ALGORITHM.id
    || audit.algorithm?.version !== AUTHORING_CONFORMANCE_AUDIT_ALGORITHM.version
    || audit.scope?.kind !== "microsequence"
    || !text(audit.scope?.ref)
    || !Number.isInteger(audit.auditedRevision)
    || audit.auditedRevision < 1
    || audit.auditedRevision > auditedRevision
    || !Number.isInteger(audit.materializationStateRevision)
    || audit.materializationStateRevision < 0
    || !/^[a-f0-9]{64}$/u.test(text(audit.contentHash))
    || (Array.isArray(audit.findings)
      ? !Array.isArray(audit.checks) || !Array.isArray(audit.metrics)
      : !validVersionedRef(audit.auditRunRef))
    || !plainObject(audit.summary)
    || SUMMARY_DIMENSIONS.some((dimension) => (
      !validSummaryState.has(audit.summary[dimension])
    ))
  ))) {
    throw new TypeError("Cada auditoria agregada precisa ser canônica e não pode ser posterior à Parte.");
  }
  const findingDistributions = normalizedAudits.map(compactFindingDistribution);
  const auditScopeRefs = normalizedAudits.map((audit) => text(audit?.scope?.ref));
  if (auditScopeRefs.some((scopeRef) => !microsequenceIds.includes(scopeRef))
    || new Set(auditScopeRefs).size !== auditScopeRefs.length
    || normalizedAudits.some((audit) => audit?.scope?.kind !== "microsequence")) {
    throw new TypeError("Cada auditoria agregada precisa pertencer uma única vez à Parte.");
  }
  const reportByMicrosequence = new Map(normalizedAudits.map((audit) => [audit?.scope?.ref, audit]));
  const missingAudits = microsequenceIds.filter((id) => !reportByMicrosequence.has(id));
  const findingsByCategory = {};
  const findingsByOrigin = {};
  findingDistributions.forEach(({ byCategory, byOrigin }) => {
    Object.entries(byCategory).forEach(([category, count]) => {
      findingsByCategory[category] = (findingsByCategory[category] || 0) + count;
    });
    Object.entries(byOrigin).forEach(([origin, count]) => {
      findingsByOrigin[origin] = (findingsByOrigin[origin] || 0) + count;
    });
  });
  const checks = [{
    code: "part_microsequence_audit_coverage",
    category: "structure",
    status: missingAudits.length ? CHECK_STATUS.failed : CHECK_STATUS.passed,
    severity: "high",
    target: { entityType: "workspace", entityPath: [], resourceTargetId: null },
    ruleRef: ruleRef("coordination", "part-audit-coverage", "1.0.0"),
    publicEvidence: missingAudits.length
      ? `Microssequências sem rodada nesta auditoria (${missingAudits.length}): ${missingAudits.slice(0, 5).join(", ")}${missingAudits.length > 5 ? ", …" : ""}.`
      : `${microsequenceIds.length} microssequências da Parte têm rodadas componentes versionadas e correntes.`,
    expected: {
      count: microsequenceIds.length,
      unit: "microsequence"
    },
    actual: {
      count: normalizedAudits.length,
      unit: "audited_microsequence",
      missingRefs: boundedOrderedList(
        missingAudits,
        "missingAudits"
      )
    },
    proposedRepair: null
  }];
  for (const dimension of SUMMARY_DIMENSIONS) {
    const states = normalizedAudits.map((audit) => text(audit?.summary?.[dimension]));
    const status = missingAudits.length || states.length === 0
      ? CHECK_STATUS.notApplicable
      : states.some((state) => state === "finding")
        ? CHECK_STATUS.failed
        : states.every((state) => state === "conformant")
          ? CHECK_STATUS.passed
          : CHECK_STATUS.notApplicable;
    checks.push({
      code: `part_${dimension}_distribution`,
      category: dimension,
      status,
      severity: "high",
      target: { entityType: "workspace", entityPath: [], resourceTargetId: null },
      ruleRef: ruleRef("coordination", `part-${dimension}-distribution`, "1.0.0"),
      publicEvidence: status === CHECK_STATUS.passed
        ? `Todas as microssequências auditadas estão sem finding determinístico em ${dimension}.`
        : status === CHECK_STATUS.failed
          ? `Ao menos uma microssequência tem finding determinístico em ${dimension}.`
          : `A dimensão ${dimension} não foi coberta integralmente nesta rodada da Parte.`,
      expected: {
        count: normalizedAudits.length,
        state: "conformant",
        unit: "microsequence"
      },
      actual: {
        count: states.length,
        unit: "microsequence",
        byState: Object.fromEntries([...validSummaryState].map((state) => [
          state,
          states.filter((value) => value === state).length
        ]))
      },
      proposedRepair: null
    });
  }
  // As divergências das dimensões já permanecem nos findings das respectivas
  // microssequências. A Parte cria finding próprio somente quando o recorte
  // não foi integralmente auditado, evitando duplicar o mesmo problema.
  const findings = checks.slice(0, 1).map(findingForCheck).filter(Boolean);
  const denominatorRefs = microsequenceIds.length ? microsequenceIds : [text(part?.id) || "part"];
  const metrics = [metric(
    "part_deterministic_finding_count",
    findingDistributions.reduce((total, summary) => total + summary.total, 0),
    "finding",
    {
      count: Math.max(1, denominatorRefs.length),
      unit: "microsequence",
      refs: denominatorRefs
    },
    normalizedAudits.map((audit) => `${audit?.scope?.ref}@${audit?.auditedRevision}`)
  )];
  const report = {
    contract: AUTHORING_CONFORMANCE_AUDIT_CONTRACT,
    algorithm: clone(AUTHORING_CONFORMANCE_AUDIT_ALGORITHM),
    scope: { kind: "part", ref: partId },
    auditedRevision: Number(auditedRevision),
    materializationStateRevision: null,
    contentHash: null,
    refs: {
      microsequenceRefs: boundedOrderedList(
        microsequenceIds,
        "part.microsequenceIds"
      ),
      auditRefs: boundedOrderedList(
        normalizedAudits.map((audit) => ({
          scopeRef: audit?.scope?.ref,
          auditedRevision: audit?.auditedRevision,
          contentHash: audit?.contentHash,
          auditRunRef: validVersionedRef(audit?.auditRunRef)
            ? ref(audit.auditRunRef)
            : null
        })),
        "audits"
      )
    },
    checks,
    findings,
    metrics,
    semanticReview: [
      "coherence_between_microsequences",
      "promised_dependencies_and_revisits",
      "unjustified_redundancy",
      "integration_gaps"
    ],
    distribution: {
      microsequenceCount: microsequenceIds.length,
      auditedMicrosequenceCount: normalizedAudits.length,
      findingCount: findingDistributions.reduce(
        (total, summary) => total + summary.total,
        0
      ),
      findingsByCategory,
      findingsByOrigin
    },
    epistemicBoundary: "A agregação de Parte descreve cobertura e distribuição. Não produz nota de qualidade nem medida de aprendizagem."
  };
  report.summary = summaryFor(report.checks, report.findings);
  return Object.freeze(report);
}

export function authoringConformanceParameterCatalog() {
  return clone(DESIGN_PARAMETER_CATALOG);
}
