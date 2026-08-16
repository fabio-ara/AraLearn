import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EXPERIMENT_ASSIGNMENT_ALGORITHMS,
  EXPERIMENT_FREEZE_POLICY,
  InstructionalExperimentValidationError,
  assertFrozenExperimentVariantUnchanged,
  assignSeededExperimentCondition,
  diffExperimentVariantMaterializations,
  instructionalExperimentContract,
  normalizeExperimentDifferenceClassifications,
  normalizeInstructionalExperimentProtocol,
  validateInstructionalExperimentProtocol
} from "../../src/authoring/instructionalExperiment.js";

const fixture = JSON.parse(await readFile(new URL(
  "../fixtures/pedagogy/authoring-experiments.v1.json",
  import.meta.url
), "utf8"));

function protocol() {
  return structuredClone(fixture.protocol);
}

function freezeReceipt(version = "1.0.0") {
  return {
    variantRevisionRef: { id: "variant-a", version },
    baseRef: { id: "publication-base-a", version: "1.0.0" },
    protocolRef: { id: "protocol-a", version: "1.0.0" },
    conditionRef: { id: "condition-a", version: "1.0.0" },
    microsequencePins: [
      {
        microsequenceRef: "micro-a",
        contentArtifactHash: "a".repeat(64),
        designSnapshotRef: { id: "snapshot-a", version: "1.0.0" },
        materializationManifestRef: { id: "manifest-a", version: "1.0.0" },
        auditRunRef: { id: "audit-a", version: "1.0.0" },
        differenceReviewRef: { id: "diff-a", version: "1.0.0" }
      },
      {
        microsequenceRef: "micro-b",
        contentArtifactHash: "b".repeat(64),
        designSnapshotRef: { id: "snapshot-b", version: "1.0.0" },
        materializationManifestRef: { id: "manifest-b", version: "1.0.0" },
        auditRunRef: { id: "audit-b", version: "1.0.0" },
        differenceReviewRef: { id: "diff-b", version: "1.0.0" }
      }
    ],
    frozenAt: "2026-08-16T12:00:00Z",
    policy: structuredClone(EXPERIMENT_FREEZE_POLICY)
  };
}

test("protocolo usa parâmetros ordinários, condições explícitas e ResourceSet exato", () => {
  const normalized = normalizeInstructionalExperimentProtocol(protocol(), {
    resourceSets: fixture.resourceSets
  });
  assert.deepEqual(
    normalized.factors.map(({ factorId }) => factorId),
    ["available-resources", "novelty-ceiling"]
  );
  assert.equal(normalized.conditions.length, 3);
  assert.equal(
    normalized.conditions.some(({ conditionId }) => conditionId === "compact-map"),
    false,
    "o domínio não inventa a quarta célula de um fatorial"
  );
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(instructionalExperimentContract().boundaries.automaticFactorialDesign, false);
  assert.equal(
    instructionalExperimentContract().boundaries.resourceSetIsAvailabilityNotRequirement,
    true
  );
});

test("protocolo recusa definição inventada, tupla incompleta e ResourceSet fora da condição", () => {
  const invalid = protocol();
  invalid.factors[0].definitionRef.id = "research_novelty_score";
  invalid.conditions[0].values.pop();
  invalid.conditions[1].values[1].resourceSetRef.id = "resources-unapproved";
  const result = validateInstructionalExperimentProtocol(invalid, {
    resourceSets: fixture.resourceSets
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(({ code }) => code === "unknown_experiment_factor_definition"));
  assert.ok(result.errors.some(({ code }) => code === "incomplete_experiment_condition"));
  assert.ok(result.errors.some(({ code }) => code === "unknown_experiment_resource_set"));
});

test("protocolo validável fecha scope, quatro invariantes e consentimento", () => {
  const invalid = protocol();
  invalid.scope.kind = "workspace";
  invalid.invariants = ["sources", "targets", "analysis", "telemetry"];
  delete invalid.consentPolicyRef;
  const result = validateInstructionalExperimentProtocol(invalid, {
    resourceSets: fixture.resourceSets
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(({ code }) => code === "invalid_experiment_scope"));
  assert.ok(result.errors.some(({ code }) => code === "invalid_experiment_invariant"));
  assert.ok(result.errors.some(({ code }) => code === "missing_experiment_invariant"));
  assert.ok(result.errors.some(({ path }) => path === "$.consentPolicyRef"));
});

test("seeded assignment independe da ordem recebida e nunca altera atribuição existente", async () => {
  const input = {
    protocolRef: { id: "30000000-0000-4000-8000-000000000001", version: "7" },
    seed: "seed-a",
    participantRef: "participant:pseudonym-a",
    conditionRefs: [
      { id: "condition-c", version: "7" },
      { id: "condition-a", version: "7" },
      { id: "condition-b", version: "7" }
    ]
  };
  const first = await assignSeededExperimentCondition(input);
  const retry = await assignSeededExperimentCondition({
    ...input,
    conditionRefs: [...input.conditionRefs].reverse()
  });
  assert.deepEqual(retry, first);
  assert.equal(first.algorithm, EXPERIMENT_ASSIGNMENT_ALGORITHMS.seededRandom);
  assert.deepEqual(first.conditionRef, { id: "condition-a", version: "7" });
  assert.equal(first.conditionOrdinal, 1);
  assert.equal(
    first.secretCommitment,
    "6e958e47d9d330f7402a1880dc867105365a800a4cd5bed6aea6753b80e28087"
  );
  assert.equal(
    first.assignmentFingerprint,
    "129a552fa49bd5221c0e6f7466dbe218470d92b44b5c5f1ebf4fc88d496031aa"
  );
  assert.equal(JSON.stringify(first).includes(input.seed), false);
});

test("diff factual é separado da classificação semântica e rejeita hunk inventado", () => {
  const diff = diffExperimentVariantMaterializations(
    { title: "Base", cards: [{ id: "a", text: "curto" }] },
    { title: "Base", cards: [{ id: "a", text: "desenvolvido" }], limitation: "mapa ausente" }
  );
  assert.equal(diff.algorithm, "canonical-json-pointer-fnv1a64-diff@2.0.0");
  assert.equal(diff.total, 2);
  const differenceRefs = Object.fromEntries(diff.items.map((item, index) => [
    item.differenceId,
    { id: `hunk-${index + 1}`, version: String(index + 1).repeat(64).slice(0, 64) }
  ]));
  const classifications = normalizeExperimentDifferenceClassifications([
    {
      differenceRef: differenceRefs[
        diff.items.find(({ path }) => path.endsWith("/text")).differenceId
      ],
      classification: "directly_required",
      publicRationale: "A condição elevou o limite ordinário de novidade.",
      evidenceRefs: ["factor:novelty-ceiling"]
    },
    {
      differenceRef: differenceRefs[
        diff.items.find(({ path }) => path === "/limitation").differenceId
      ],
      classification: "inevitable_derived",
      publicRationale: "O ResourceSet autorizado não continha o mapa ideal.",
      evidenceRefs: ["resourceset:resources-text@1.0.0"]
    }
  ], { allowedDifferenceRefs: Object.values(differenceRefs) });
  assert.equal(classifications.length, 2);
  assert.throws(
    () => normalizeExperimentDifferenceClassifications([{
      differenceRef: { id: "hunk-invented", version: "f".repeat(64) },
      classification: "accidental_unplanned",
      publicRationale: "Não corresponde a um hunk factual.",
      evidenceRefs: []
    }], { allowedDifferenceRefs: Object.values(differenceRefs) }),
    (error) => error instanceof InstructionalExperimentValidationError
      && error.errors.some(({ code }) => code === "unknown_experiment_difference")
  );
});

test("diff por identidade separa reorder de mudança de conteúdo", () => {
  const base = {
    cards: [
      { id: "a", text: "A" },
      { id: "b", text: "B" }
    ]
  };
  const reordered = diffExperimentVariantMaterializations(base, {
    cards: [
      { id: "b", text: "B" },
      { id: "a", text: "A" }
    ]
  });
  assert.deepEqual(reordered.items.map(({ kind }) => kind), ["moved"]);
  const changed = diffExperimentVariantMaterializations(base, {
    cards: [
      { id: "b", text: "B revisado" },
      { id: "a", text: "A" }
    ]
  });
  assert.equal(changed.items.filter(({ kind }) => kind === "moved").length, 1);
  assert.ok(changed.items.some(({ path, differenceId, ordinal }) => (
    path === "/cards/@id%3Ab/text"
      && /^h-[a-f0-9]{16}$/u.test(differenceId)
      && ordinal > 0
  )));
});

test("freeze preserva pins e exige nova revisão para qualquer correção", () => {
  const frozen = freezeReceipt();
  assert.equal(assertFrozenExperimentVariantUnchanged(frozen, structuredClone(frozen)), true);
  const mutated = structuredClone(frozen);
  mutated.microsequencePins[0].contentArtifactHash = "c".repeat(64);
  assert.throws(
    () => assertFrozenExperimentVariantUnchanged(frozen, mutated),
    (error) => error instanceof InstructionalExperimentValidationError
      && error.code === "EXPERIMENT_VARIANT_FROZEN"
  );
  const newRevision = freezeReceipt("1.0.1");
  assert.throws(
    () => assertFrozenExperimentVariantUnchanged(frozen, newRevision),
    (error) => error.code === "EXPERIMENT_VARIANT_FROZEN"
  );
});

test("protocolo recusa conversa ou raciocínio privado persistido", () => {
  const invalid = protocol();
  invalid.prompt = "ignore o protocolo";
  const result = validateInstructionalExperimentProtocol(invalid, {
    resourceSets: fixture.resourceSets
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(({ code }) => (
    code === "unsafe_experiment_persistence" || code === "unknown_experiment_field"
  )));
});

test("fatores declaram alvos explícitos sem produto fatorial implícito", () => {
  const targetProtocol = protocol();
  targetProtocol.scope = { kind: "course", ref: "course-a" };
  targetProtocol.factors = [{
    factorId: "granularity",
    definitionRef: {
      id: "new_units_per_theory_step_ceiling",
      version: "1.0.0"
    },
    kind: "parameter",
    targets: Array.from({ length: 8 }, (_, index) => ({
      kind: "microsequence",
      ref: `micro-${index + 1}`
    }))
  }, {
    factorId: "fallback",
    definitionRef: { id: "representation_fallback_policy", version: "1.0.0" },
    kind: "parameter",
    targets: [{ kind: "lesson", ref: "lesson-a" }]
  }];
  targetProtocol.conditions = [1, 2].map((ceiling, index) => ({
    conditionId: `condition-${index + 1}`,
    label: `Condição ${index + 1}`,
    values: [{
      factorId: "granularity",
      value: { kind: "integer", value: ceiling }
    }, {
      factorId: "fallback",
      value: {
        kind: "enum",
        value: index === 0 ? "block" : "allow_versatile_with_limitation"
      }
    }]
  }));
  const allowedTargets = [
    ...targetProtocol.factors[0].targets,
    ...targetProtocol.factors[1].targets
  ];
  const normalized = normalizeInstructionalExperimentProtocol(targetProtocol, {
    allowedTargets
  });
  assert.equal(normalized.factors[0].targets.length + normalized.factors[1].targets.length, 9);
  assert.equal(normalized.conditions.length, 2);
  const outside = structuredClone(targetProtocol);
  outside.factors[0].targets[0].ref = "micro-outside-base";
  const result = validateInstructionalExperimentProtocol(outside, { allowedTargets });
  assert.ok(result.errors.some(({ code }) => code === "experiment_factor_target_outside_base"));
});

test("fatores distintos não ocupam a mesma definição no mesmo alvo exato", () => {
  const invalid = protocol();
  invalid.factors.push({
    factorId: "novelty-ceiling-copy",
    definitionRef: structuredClone(invalid.factors[0].definitionRef),
    kind: "parameter",
    targets: structuredClone(invalid.factors[0].targets)
  });
  invalid.conditions.forEach((condition) => {
    const source = condition.values.find(({ factorId }) => factorId === "novelty-ceiling");
    condition.values.push({
      factorId: "novelty-ceiling-copy",
      value: structuredClone(source.value)
    });
  });
  const result = validateInstructionalExperimentProtocol(invalid, {
    resourceSets: fixture.resourceSets
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(({ code }) => (
    code === "duplicate_experiment_factor_target_slot"
  )));
});

test("fatores ResourceSet rejeitam targets ancestor e descendant sobrepostos", () => {
  const invalid = protocol();
  invalid.scope = { kind: "course", ref: "course-a" };
  invalid.factors = [{
    factorId: "resources-lesson",
    definitionRef: { id: "available_resource_set_refs", version: "1.0.0" },
    kind: "resource_set",
    targets: [{ kind: "lesson", ref: "lesson-a" }]
  }, {
    factorId: "resources-micro",
    definitionRef: { id: "available_resource_set_refs", version: "1.0.0" },
    kind: "resource_set",
    targets: [{ kind: "microsequence", ref: "micro-a" }]
  }];
  invalid.conditions = fixture.resourceSets.map((resourceSet, index) => ({
    conditionId: `resource-overlap-${index + 1}`,
    label: `Condição ${index + 1}`,
    values: invalid.factors.map((factor) => ({
      factorId: factor.factorId,
      resourceSetRef: { id: resourceSet.id, version: resourceSet.version }
    }))
  }));
  const result = validateInstructionalExperimentProtocol(invalid, {
    resourceSets: fixture.resourceSets,
    allowedTargets: [{
      kind: "lesson",
      ref: "lesson-a",
      entityPath: ["course-a", "module-a", "lesson-a"]
    }, {
      kind: "microsequence",
      ref: "micro-a",
      entityPath: ["course-a", "module-a", "lesson-a", "micro-a"]
    }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(({ code }) => (
    code === "overlapping_experiment_resource_set_targets"
  )));
});

test("ResourceSet precisa governar todos os alvos do fator", () => {
  const targetProtocol = protocol();
  targetProtocol.scope = { kind: "course", ref: "course-a" };
  targetProtocol.factors = [{
    factorId: "available-resources",
    definitionRef: { id: "available_resource_set_refs", version: "1.0.0" },
    kind: "resource_set",
    targets: Array.from({ length: 8 }, (_, index) => ({
      kind: "microsequence",
      ref: `micro-${index + 1}`
    }))
  }];
  const courseSets = fixture.resourceSets.map((resourceSet) => ({
    ...structuredClone(resourceSet),
    scope: { kind: "course", ref: "course-a" }
  }));
  targetProtocol.conditions = courseSets.map((resourceSet, index) => ({
    conditionId: `resources-${index + 1}`,
    label: `Conjunto ${index + 1}`,
    values: [{
      factorId: "available-resources",
      resourceSetRef: { id: resourceSet.id, version: resourceSet.version }
    }]
  }));
  assert.equal(validateInstructionalExperimentProtocol(targetProtocol, {
    resourceSets: courseSets
  }).ok, true);
  const microOnly = {
    ...structuredClone(courseSets[0]),
    id: "resources-micro-only",
    scope: { kind: "microsequence", ref: "micro-1" }
  };
  const invalid = structuredClone(targetProtocol);
  invalid.conditions[0].values[0].resourceSetRef = {
    id: microOnly.id,
    version: microOnly.version
  };
  const result = validateInstructionalExperimentProtocol(invalid, {
    resourceSets: [...courseSets, microOnly]
  });
  assert.ok(result.errors.some(({ code }) => (
    code === "experiment_resource_set_target_subset"
  )));
});

test("elaboração e prática usam ParameterValue completo e governado", () => {
  const governed = protocol();
  governed.factors = [{
    factorId: "explanation",
    definitionRef: { id: "applicable_explanation_requirement_refs", version: "1.0.0" },
    kind: "parameter",
    targets: [{ kind: "microsequence", ref: "micro-a" }]
  }, {
    factorId: "practice-range",
    definitionRef: {
      id: "distinct_practice_opportunities_per_evidence_requirement",
      version: "1.0.0"
    },
    kind: "parameter",
    targets: [{ kind: "microsequence", ref: "micro-a" }]
  }, {
    factorId: "practice-vector",
    definitionRef: { id: "practice_variation_dimensions", version: "1.0.0" },
    kind: "parameter",
    targets: [{ kind: "microsequence", ref: "micro-a" }]
  }, {
    factorId: "evidence-operation",
    definitionRef: { id: "evidence_alignment_relation", version: "1.0.0" },
    kind: "parameter",
    targets: [{ kind: "microsequence", ref: "micro-a" }]
  }];
  governed.conditions = ["a", "b"].map((suffix, index) => ({
    conditionId: `governed-${suffix}`,
    label: `Condição governada ${suffix}`,
    values: [{
      factorId: "explanation",
      value: { kind: "set", values: [`explanation:${suffix}`] }
    }, {
      factorId: "practice-range",
      value: { kind: "range", minimum: index + 1, maximum: index + 3 }
    }, {
      factorId: "practice-vector",
      value: {
        kind: "vector",
        components: [{ dimension: "context", value: suffix, unit: "category" }]
      }
    }, {
      factorId: "evidence-operation",
      value: {
        kind: "relation",
        nodes: ["target", `evidence-${suffix}`],
        edges: [{ from: "target", to: `evidence-${suffix}`, kind: "elicits" }]
      }
    }]
  }));
  assert.equal(validateInstructionalExperimentProtocol(governed).ok, true);
  const invalid = structuredClone(governed);
  invalid.conditions[0].values[0].value.values = ["ref com espaço"];
  invalid.conditions[0].values[1].value.minimum = -1;
  invalid.conditions[0].values[3].value.edges[0].kind = "causes";
  const result = validateInstructionalExperimentProtocol(invalid);
  assert.ok(result.errors.filter(({ code }) => code === "experiment_factor_out_of_range").length >= 3);
});

test("diff pina base ou variante e permite comparação A↔B", () => {
  const baseToA = diffExperimentVariantMaterializations(
    { cards: [{ id: "practice", operation: "classify" }] },
    { cards: [{ id: "practice", operation: "explain" }] },
    {
      baselineRef: {
        kind: "base",
        ref: { id: "base-publication", version: "1.0.0" }
      },
      candidateVariantRevisionRef: { id: "variant-a", version: "1.0.0" }
    }
  );
  assert.equal(baseToA.baselineRef.kind, "base");
  const aToB = diffExperimentVariantMaterializations(
    { cards: [{ id: "practice", operation: "explain" }] },
    { cards: [{ id: "practice", operation: "explain", unplannedHint: true }] },
    {
      baselineRef: {
        kind: "variant_revision",
        ref: { id: "variant-a", version: "1.0.0" }
      },
      candidateVariantRevisionRef: { id: "variant-b", version: "1.0.0" }
    }
  );
  assert.equal(aToB.baselineRef.kind, "variant_revision");
  assert.ok(aToB.items.some(({ path, differenceId }) => (
    path === "/cards/@id%3Apractice/unplannedHint"
      && /^h-[a-f0-9]{16}$/u.test(differenceId)
  )));
});

test("diff factual cobre zero, mais de vinte e o teto canônico de cinco mil hunks", () => {
  const empty = diffExperimentVariantMaterializations({ values: [] }, { values: [] });
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.items, []);
  assert.equal(empty.truncated, false);

  const many = diffExperimentVariantMaterializations(
    { values: Array.from({ length: 5_000 }, () => 0) },
    { values: Array.from({ length: 5_000 }, () => 1) }
  );
  assert.equal(many.total, 5_000);
  assert.equal(many.items.length, 5_000);
  assert.equal(many.truncated, false);
  assert.equal(many.items[0].ordinal, 1);
  assert.equal(many.items[4_999].ordinal, 5_000);
  assert.equal(new Set(many.items.map(({ differenceId }) => differenceId)).size, 5_000);
  assert.ok(many.items[20]);

  assert.throws(() => diffExperimentVariantMaterializations(
    { values: Array.from({ length: 5_001 }, () => 0) },
    { values: Array.from({ length: 5_001 }, () => 1) }
  ), (error) => error?.code === "EXPERIMENT_DIFFERENCE_LIMIT_EXCEEDED");

  assert.throws(() => diffExperimentVariantMaterializations(
    { values: Array.from({ length: 300 }, () => 0) },
    { values: Array.from({ length: 300 }, () => 1) },
    { deadlineAt: 0 }
  ), (error) => error?.code === "EXPERIMENT_DIFFERENCE_DEADLINE_REACHED");
});

test("protocol contract caps instruments and outcomes at 32 each", () => {
  const boundary = protocol();
  boundary.instrumentRefs = Array.from({ length: 32 }, (_, index) => ({
    id: `instrument-${index}`,
    version: "1.0.0"
  }));
  boundary.outcomeRefs = Array.from({ length: 32 }, (_, index) => ({
    id: `outcome-${index}`,
    version: "1.0.0"
  }));
  assert.equal(validateInstructionalExperimentProtocol(boundary, {
    resourceSets: fixture.resourceSets
  }).ok, true);
  boundary.instrumentRefs.push({ id: "instrument-overflow", version: "1.0.0" });
  boundary.outcomeRefs.push({ id: "outcome-overflow", version: "1.0.0" });
  const result = validateInstructionalExperimentProtocol(boundary, {
    resourceSets: fixture.resourceSets
  });
  assert.ok(result.errors.some(({ path }) => path === "$.instrumentRefs"));
  assert.ok(result.errors.some(({ path }) => path === "$.outcomeRefs"));
});
