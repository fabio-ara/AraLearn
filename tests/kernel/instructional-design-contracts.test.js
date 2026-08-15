import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  DESIGN_PARAMETER_CATALOG,
  INSTRUCTIONAL_DESIGN_CONTRACTS,
  deriveInstructionalAnalysisObservations,
  deriveMaterializationObservations,
  designParameterCatalog,
  evaluateInstructionalDesignBundle,
  instructionalDesignContracts
} from "../../src/authoring/instructionalDesignContracts.js";

const fixtureUrl = new URL(
  "../fixtures/pedagogy/instructional-design-scenarios.v1.json",
  import.meta.url
);
const fixture = JSON.parse(fs.readFileSync(fixtureUrl, "utf8"));

function validators() {
  return Object.fromEntries(Object.entries(instructionalDesignContracts()).map(([key, schema]) => {
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    return [key, validate];
  }));
}

function assertValid(validate, value, label) {
  assert.equal(
    validate(value),
    true,
    `${label}: ${JSON.stringify(validate.errors, null, 2)}`
  );
}

function scenario(id) {
  return fixture.scenarios.find((entry) => entry.id === id);
}

function canonicalBundle() {
  const lifecycle = structuredClone(fixture.canonicalLifecycle);
  return {
    analysis: structuredClone(scenario(lifecycle.analysisScenarioRef).analysis),
    parameterDefinitions: designParameterCatalog(),
    parameterAssignments: lifecycle.parameterAssignments,
    effectiveSnapshot: lifecycle.effectiveSnapshot,
    resourceSets: lifecycle.resourceSets,
    materializationManifest: lifecycle.materializationManifest
  };
}

test("schemas conceituais v1 validam o catálogo e o corpus multidomínio", () => {
  const validate = validators();
  assert.deepEqual(Object.keys(validate).sort(), [
    "designParameterAssignment",
    "designParameterDefinition",
    "effectiveDesignSnapshot",
    "instructionalAnalysis",
    "materializationManifest",
    "resourceSet"
  ]);
  fixture.scenarios.forEach((entry) => {
    assertValid(validate.instructionalAnalysis, entry.analysis, entry.id);
  });
  DESIGN_PARAMETER_CATALOG.forEach((definition) => {
    assertValid(validate.designParameterDefinition, definition, definition.id);
  });
  fixture.canonicalLifecycle.parameterAssignments.forEach((assignment) => {
    assertValid(validate.designParameterAssignment, assignment, assignment.id);
  });
  assertValid(
    validate.effectiveDesignSnapshot,
    fixture.canonicalLifecycle.effectiveSnapshot,
    "effective snapshot"
  );
  fixture.canonicalLifecycle.resourceSets.forEach((resourceSet) => {
    assertValid(validate.resourceSet, resourceSet, resourceSet.id);
  });
  assertValid(
    validate.materializationManifest,
    fixture.canonicalLifecycle.materializationManifest,
    "materialization manifest"
  );
});

test("corpus cobre seis domínios sem usar comprimento como quantidade de conteúdo", () => {
  assert.deepEqual(new Set(fixture.scenarios.map(({ domain }) => domain)), new Set([
    "conceptual_computing",
    "mathematics",
    "programming",
    "systems_administration",
    "education_theory",
    "technical_professional_training"
  ]));
  const shortDense = scenario("computing-short-high-novelty");
  const longSparse = scenario("education-long-redundant-low-novelty");
  const shortObservations = deriveInstructionalAnalysisObservations(shortDense.analysis);
  const longObservations = deriveInstructionalAnalysisObservations(longSparse.analysis);
  assert.ok(shortDense.sourceExcerpt.length < longSparse.sourceExcerpt.length);
  assert.ok(shortObservations.analysisUnitCount > longObservations.analysisUnitCount);
  assert.equal(shortObservations.coordinationSets[0].assumedNewUnitCount, 5);
  assert.equal(longObservations.coordinationSets[0].assumedNewUnitCount, 1);
});

test("conhecimento prévio altera conjuntos coordenados sem produzir score de carga", () => {
  const novice = structuredClone(scenario("programming-prior-knowledge-contrast").analysis);
  const expert = structuredClone(novice);
  expert.id = "analysis-programming-recursion-expert";
  expert.learnerContext.audience = "Programador experiente que já demonstra rastreamento de recursão.";
  expert.units.forEach((unit) => {
    unit.priorKnowledge = {
      state: "integrated",
      basis: "assessment",
      evidenceRefs: [`assessment:${unit.id}`],
      note: "Desempenho observado em tarefas de transferência antes da microssequência."
    };
  });
  expert.coordinationRequirements[0].assumedNewUnitRefs = [];
  const validate = validators().instructionalAnalysis;
  assertValid(validate, novice, "novice analysis");
  assertValid(validate, expert, "expert analysis");
  assert.equal(deriveInstructionalAnalysisObservations(novice).coordinationSets[0].assumedNewUnitCount, 3);
  assert.equal(deriveInstructionalAnalysisObservations(expert).coordinationSets[0].assumedNewUnitCount, 0);
  assert.equal(JSON.stringify(deriveInstructionalAnalysisObservations(novice)).includes("score"), false);
});

test("hipótese de forma do conhecimento permanece categórica e vetorial", () => {
  for (const entry of fixture.scenarios) {
    for (const unit of entry.analysis.units) {
      assert.ok(Array.isArray(unit.knowledgeFormHypothesis.conditions));
      assert.ok(Array.isArray(unit.knowledgeFormHypothesis.responses));
      assert.match(unit.knowledgeFormHypothesis.expression, /^(verbal|nonverbal|mixed|unknown)$/u);
      assert.match(
        unit.knowledgeFormHypothesis.rationaleAvailability,
        /^(available|partial|unavailable|unknown)$/u
      );
      assert.equal(Object.hasOwn(unit.knowledgeFormHypothesis, "score"), false);
    }
  }
});

test("síntese e desenvolvimento são estados de cobertura do mesmo requisito", () => {
  const math = scenario("mathematics-summary-versus-development");
  const summary = deriveMaterializationObservations({
    explanationCoverage: [{
      requirementRef: math.expectations.sameRequirementRef,
      status: math.expectations.summaryStatus,
      evidenceRefs: ["card:summary"]
    }]
  });
  const developed = deriveMaterializationObservations({
    explanationCoverage: [{
      requirementRef: math.expectations.sameRequirementRef,
      status: math.expectations.developedStatus,
      evidenceRefs: ["card:developed"]
    }]
  });
  assert.equal(summary.explanationCoverage.denominator, 1);
  assert.equal(summary.explanationCoverage.counts.mentioned, 1);
  assert.equal(developed.explanationCoverage.denominator, 1);
  assert.equal(developed.explanationCoverage.counts.developed, 1);
});

test("evidência preserva operação, características da tarefa, observável e critério", () => {
  fixture.scenarios.forEach((entry) => {
    entry.analysis.evidenceRequirements.forEach((requirement) => {
      assert.ok(requirement.operation);
      assert.ok(requirement.taskFeatures.length);
      assert.ok(requirement.criterion.observable);
      assert.ok(requirement.criterion.successCondition);
    });
  });
  const professional = scenario("professional-multimeter-performance");
  const recognition = professional.analysis.evidenceRequirements.find(
    ({ id }) => id === professional.expectations.recognitionEvidenceRef
  );
  const execution = professional.analysis.evidenceRequirements.find(
    ({ id }) => id === professional.expectations.executionEvidenceRef
  );
  assert.notEqual(recognition.operation, execution.operation);
  assert.equal(recognition.fidelityRequirementRef, null);
  assert.equal(execution.fidelityRequirementRef, professional.expectations.fidelityRequirementRef);
  const fidelity = professional.analysis.fidelityRequirements[0];
  assert.ok(fidelity.unrepresentedAspects.length);
  assert.equal(Object.keys(fidelity).some((key) => /score|level/iu.test(key)), false);
});

test("catálogo admite tipos honestos e delimita todas as alegações", () => {
  assert.deepEqual(
    new Set(DESIGN_PARAMETER_CATALOG.map(({ valueType }) => valueType)),
    new Set(["integer", "range", "enum", "set", "vector", "relation"])
  );
  DESIGN_PARAMETER_CATALOG.forEach((definition) => {
    assert.ok(definition.unit.numerator);
    assert.ok(definition.unit.denominator);
    assert.match(
      definition.epistemicClassification.kind,
      /^(?:aralearn_operationalization|software_property)$/u
    );
    assert.match(
      definition.epistemicClassification.claimBoundary,
      /não (?:uma medida científica validada|uma medida educacional)/iu
    );
    assert.ok(definition.theoreticalAnchors.length);
    definition.theoreticalAnchors.forEach((anchor) => assert.ok(anchor.limit));
    assert.deepEqual(definition.resolutionRule, {
      strategy: "nearest_scope_replaces",
      sameScopeConflict: "error",
      assignmentValue: "complete_value",
      researchLockAuthority: "separate_gate"
    });
  });
  const serialized = JSON.stringify(DESIGN_PARAMETER_CATALOG);
  assert.ok(DESIGN_PARAMETER_CATALOG.some(
    ({ epistemicClassification }) => epistemicClassification.kind === "software_property"
  ));
  assert.equal(/(?:cognitive_load|fidelity|proficiency|knowledge_component)_score/iu.test(serialized), false);
  assert.equal(/card_count_target|character_count_target|word_count_target/iu.test(serialized), false);
});

test("Auto, override e lock persistem valor e autoridade; herança só aparece no snapshot", () => {
  const validate = validators().designParameterAssignment;
  const assignments = fixture.canonicalLifecycle.parameterAssignments;
  assert.deepEqual(assignments.map(({ mode }) => mode), ["auto", "manual_override", "research_lock"]);
  assignments.forEach((assignment) => assert.ok(Object.hasOwn(assignment, "value")));
  assert.deepEqual(assignments.map(({ authority }) => authority), [
    { kind: "gpt", actorRef: null, locked: false },
    { kind: "author", actorRef: "author:fixture", locked: false },
    { kind: "research_protocol", actorRef: "research-protocol:condition-a", locked: true }
  ]);
  const unresolvedAuto = structuredClone(assignments[0]);
  delete unresolvedAuto.value;
  assert.equal(validate(unresolvedAuto), false);
  const invalidInheritedAssignment = structuredClone(assignments[0]);
  invalidInheritedAssignment.mode = "inherited";
  assert.equal(validate(invalidInheritedAssignment), false);
  const invalidAutoAuthority = structuredClone(assignments[0]);
  invalidAutoAuthority.authority = { kind: "author", actorRef: "author:fixture", locked: false };
  assert.equal(validate(invalidAutoAuthority), false);
  const resolutions = fixture.canonicalLifecycle.effectiveSnapshot.resolvedValues
    .map(({ resolution }) => resolution);
  assert.deepEqual(
    resolutions.map(({ assignmentMode, inheritance }) => [assignmentMode, inheritance]),
    [
      ["auto", "local"],
      ["manual_override", "local"],
      ["research_lock", "inherited"]
    ]
  );
  const conflatedResolution = structuredClone(fixture.canonicalLifecycle.effectiveSnapshot);
  conflatedResolution.resolvedValues[2].resolution = {
    kind: "inherited",
    assignmentRef: { id: "assignment-fallback-lock", version: "1.0.0" },
    sourceScope: { kind: "course", ref: "course-research-a" },
    rationale: "Forma antiga conflava origem e modo.",
    provenanceRefs: ["research-protocol:condition-a"]
  };
  assert.equal(validators().effectiveDesignSnapshot(conflatedResolution), false);
});

test("ResourceSet separa disponibilidade, seleção e uso materializado", () => {
  const bundle = canonicalBundle();
  const result = evaluateInstructionalDesignBundle(bundle);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.observations.materialization.availableResourceSetCount, 1);
  assert.equal(bundle.resourceSets[0].packages.length, 3);
  assert.equal(result.observations.materialization.selectedResourceCount, 3);
  assert.equal(result.observations.materialization.materializedResourceCount, 5);
  assert.equal(new Set(bundle.materializationManifest.resourceSelections.map(
    (selection) => `${selection.package.packageId}@${selection.package.version}`
  )).size, 2);
  assert.equal(bundle.resourceSets[0].packages.every(
    (entry) => Object.keys(entry).sort().join(",") === "packageId,version"
  ), true);
  const duplicatePackage = structuredClone(bundle.resourceSets[0]);
  duplicatePackage.packages.push(structuredClone(duplicatePackage.packages[0]));
  assert.equal(validators().resourceSet(duplicatePackage), false);
});

test("ResourceSet bloqueia package fora da condição e exige limitação de substitute", () => {
  const outsideSet = canonicalBundle();
  outsideSet.materializationManifest.resourceSelections[0].package = {
    packageId: "aralearn.resource.flow",
    version: "1.0.0"
  };
  const outsideResult = evaluateInstructionalDesignBundle(outsideSet);
  assert.equal(outsideResult.valid, false);
  assert.match(outsideResult.errors.join(" "), /fora do ResourceSet/iu);

  const silentSubstitute = canonicalBundle();
  silentSubstitute.materializationManifest.resourceSelections[0].fit = "substitute";
  silentSubstitute.materializationManifest.resourceSelections[0].limitations = [];
  const substituteResult = evaluateInstructionalDesignBundle(silentSubstitute);
  assert.equal(substituteResult.valid, false);
  assert.match(substituteResult.errors.join(" "), /substitute sem registrar limitação/iu);
});

test("autorização não combina package e fit vindos de ResourceSets diferentes", () => {
  const mixedAuthorization = canonicalBundle();
  const setA = mixedAuthorization.resourceSets[0];
  setA.selectionConstraints.allowedFits = ["canonical", "versatile"];
  const setB = structuredClone(setA);
  setB.id = "resource-set-condition-b";
  setB.packages = [{ packageId: "aralearn.resource.flow", version: "1.0.0" }];
  setB.selectionConstraints.allowedFits = ["substitute"];
  mixedAuthorization.resourceSets.push(setB);
  const setBRef = { id: setB.id, version: setB.version };
  mixedAuthorization.effectiveSnapshot.resourceSetRefs.push(setBRef);
  mixedAuthorization.materializationManifest.resourceSetRefs.push(setBRef);
  mixedAuthorization.materializationManifest.resourceSelections[0].fit = "substitute";
  mixedAuthorization.materializationManifest.resourceSelections[0].limitations = [
    "O fit substitute é permitido apenas na outra condição, que não contém este package."
  ];
  const result = evaluateInstructionalDesignBundle(mixedAuthorization);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /fit não permitido pelo ResourceSet autorizador/iu);
});

test("snapshot e manifesto usam o mesmo conjunto e respeitam papéis autorizados", () => {
  const hiddenSet = canonicalBundle();
  hiddenSet.materializationManifest.resourceSetRefs = [];
  const hiddenSetResult = evaluateInstructionalDesignBundle(hiddenSet);
  assert.equal(hiddenSetResult.valid, false);
  assert.match(hiddenSetResult.errors.join(" "), /exatamente os mesmos ResourceSets/iu);

  const responseBlocked = canonicalBundle();
  responseBlocked.resourceSets[0].selectionConstraints.allowResponsePackages = false;
  const responseResult = evaluateInstructionalDesignBundle(responseBlocked);
  assert.equal(responseResult.valid, false);
  assert.match(responseResult.errors.join(" "), /response package não permitido/iu);

  const embeddedBlocked = canonicalBundle();
  embeddedBlocked.materializationManifest.resourceSelections[0].role = "embedded_practice";
  const embeddedResult = evaluateInstructionalDesignBundle(embeddedBlocked);
  assert.equal(embeddedResult.valid, false);
  assert.match(embeddedResult.errors.join(" "), /prática incorporada não permitida/iu);
});

test("resolução rejeita conflito no mesmo escopo e preserva modo e valor completos", () => {
  const sameScopeConflict = canonicalBundle();
  const conflictingAssignment = structuredClone(sameScopeConflict.parameterAssignments[0]);
  conflictingAssignment.id = "assignment-novelty-conflict";
  conflictingAssignment.value.value = 4;
  sameScopeConflict.parameterAssignments.push(conflictingAssignment);
  const conflictResult = evaluateInstructionalDesignBundle(sameScopeConflict);
  assert.equal(conflictResult.valid, false);
  assert.match(conflictResult.errors.join(" "), /conflita com outro valor no mesmo escopo/iu);

  const lostMode = canonicalBundle();
  lostMode.effectiveSnapshot.resolvedValues[0].resolution.assignmentMode = "manual_override";
  const modeResult = evaluateInstructionalDesignBundle(lostMode);
  assert.equal(modeResult.valid, false);
  assert.match(modeResult.errors.join(" "), /perde o modo do assignment/iu);

  const deltaValue = canonicalBundle();
  deltaValue.effectiveSnapshot.resolvedValues[1].value.values = ["exp-process-delivery"];
  const valueResult = evaluateInstructionalDesignBundle(deltaValue);
  assert.equal(valueResult.valid, false);
  assert.match(valueResult.errors.join(" "), /valor completo do assignment/iu);
});

test("resolutionPath preserva a cadeia congelada e todas as origens resolvidas", () => {
  const bundle = canonicalBundle();
  assert.deepEqual(bundle.effectiveSnapshot.resolutionPath.map(({ kind }) => kind), [
    "workspace",
    "course",
    "module",
    "lesson",
    "microsequence"
  ]);
  const missingModule = canonicalBundle();
  missingModule.effectiveSnapshot.resolutionPath.splice(2, 1);
  const missingModuleResult = evaluateInstructionalDesignBundle(missingModule);
  assert.equal(missingModuleResult.valid, false);
  assert.match(missingModuleResult.errors.join(" "), /resolutionPath precisa seguir/iu);

  const unknownSource = canonicalBundle();
  unknownSource.effectiveSnapshot.resolvedValues[2].resolution.sourceScope.ref = "course-other";
  const unknownSourceResult = evaluateInstructionalDesignBundle(unknownSource);
  assert.equal(unknownSourceResult.valid, false);
  assert.match(unknownSourceResult.errors.join(" "), /sourceScope fora do resolutionPath/iu);
});

test("revisões, versões de entidade, hashes e catálogo resolvido preservam proveniência", () => {
  fixture.scenarios.forEach(({ analysis }) => {
    assert.ok(analysis.derivedFrom.workspaceRevision > 0);
    assert.ok(analysis.derivedFrom.scopeEntityVersion > 0);
  });
  const bundle = canonicalBundle();
  assert.equal(
    bundle.effectiveSnapshot.basedOnWorkspaceRevision,
    bundle.analysis.derivedFrom.workspaceRevision
  );
  assert.equal(
    bundle.effectiveSnapshot.scopeEntityVersion,
    bundle.analysis.derivedFrom.scopeEntityVersion
  );
  assert.equal(bundle.effectiveSnapshot.parameterCatalogVersion, "1.0.0");
  assert.ok(
    bundle.materializationManifest.materializedWorkspaceRevision
      >= bundle.effectiveSnapshot.basedOnWorkspaceRevision
  );
  assert.match(bundle.materializationManifest.contentHash, /^[a-f0-9]{64}$/u);
  assert.match(bundle.materializationManifest.blueprintHash, /^[a-f0-9]{64}$/u);
  assert.ok(bundle.materializationManifest.createdAt);
  assert.equal(
    bundle.resourceSets[0].resolvedCatalogVersion,
    bundle.resourceSets[0].facetBasis.catalogVersion
  );

  const staleAnalysis = canonicalBundle();
  staleAnalysis.effectiveSnapshot.basedOnWorkspaceRevision += 1;
  const staleResult = evaluateInstructionalDesignBundle(staleAnalysis);
  assert.equal(staleResult.valid, false);
  assert.match(staleResult.errors.join(" "), /diverge da revisão usada pela análise/iu);

  const mismatchedCatalog = canonicalBundle();
  mismatchedCatalog.resourceSets[0].resolvedCatalogVersion = "2.0.0";
  const catalogResult = evaluateInstructionalDesignBundle(mismatchedCatalog);
  assert.equal(catalogResult.valid, false);
  assert.match(catalogResult.errors.join(" "), /catálogo resolvido e proveniência/iu);

  const invalidHash = structuredClone(bundle.materializationManifest);
  invalidHash.contentHash = "sha256:curto";
  assert.equal(validators().materializationManifest(invalidHash), false);
});

test("repetição cosmética não infla oportunidades semanticamente distintas", () => {
  const observations = deriveMaterializationObservations(
    fixture.canonicalLifecycle.materializationManifest
  );
  assert.equal(observations.practiceOpportunityCount, 3);
  assert.equal(observations.distinctPracticeOpportunityCount, 2);
  const signatures = fixture.canonicalLifecycle.materializationManifest.practiceOpportunities
    .map(({ semanticSignature }) => semanticSignature);
  assert.equal(new Set(signatures).size, 2);
});

test("cards e caracteres aparecem apenas como métricas derivadas rastreáveis", () => {
  const metrics = fixture.canonicalLifecycle.materializationManifest.derivedMetrics;
  assert.deepEqual(metrics.map(({ id }) => id), ["card_count", "character_count"]);
  metrics.forEach((metric) => {
    assert.equal(metric.kind, "derived");
    assert.equal(metric.scope.kind, "microsequence");
    assert.ok(metric.denominator.count > 0);
    assert.ok(metric.denominator.refs.length);
    assert.ok(metric.algorithm.id);
    assert.ok(metric.algorithm.version);
    assert.ok(metric.algorithm.inputRefs.length);
  });
  const artifactRefs = fixture.canonicalLifecycle.materializationManifest.materializedSteps
    .flatMap(({ artifactRefs: refs }) => refs);
  assert.equal(new Set(artifactRefs).size, metrics.find(({ id }) => id === "card_count").value);
  assert.equal(DESIGN_PARAMETER_CATALOG.some(({ id }) => /card|character|word/iu.test(id)), false);
});

test("escopos pedagógicos não transformam Parte em unidade de parametrização", () => {
  const scopes = new Set(DESIGN_PARAMETER_CATALOG.flatMap(({ supportedScopes }) => supportedScopes));
  assert.equal(scopes.has("part"), false);
  assert.equal(scopes.has("module"), true);
  const analysis = structuredClone(fixture.scenarios[0].analysis);
  analysis.scope.kind = "part";
  assert.equal(validators().instructionalAnalysis(analysis), false);
});

test("exports retornam cópias para preservar contratos e catálogo canônicos", () => {
  const contracts = instructionalDesignContracts();
  const catalog = designParameterCatalog();
  contracts.instructionalAnalysis.title = "mutated";
  catalog[0].label = "mutated";
  assert.notEqual(INSTRUCTIONAL_DESIGN_CONTRACTS.instructionalAnalysis.title, "mutated");
  assert.notEqual(DESIGN_PARAMETER_CATALOG[0].label, "mutated");
});
