import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {
  normalizeCourseAnchoredAnnotationCommand,
  normalizeCourseAnchoredAnnotationQuery
} from "../../src/domain/courseAnchoredAnnotations.js";
import {
  normalizeCourseAuditCycleCommand,
  normalizeCourseAuditCycleQuery
} from "../../src/domain/courseAuditCycle.js";
import {
  COURSE_COMPONENT_CATALOG_VERSION,
  COURSE_DESIGN_CONTEXT_CONTRACT,
  COURSE_DESIGN_PARAMETER_DEFINITIONS,
  auditDesignApplication,
  resolveCourseDesignParameters
} from "../../src/domain/courseDesignParameters.js";
import { normalizeCourseSourceLinks } from "../../src/domain/courseSources.js";
import { RESOURCE_CATALOG } from "../../src/resources/catalog/resourceCatalog.js";

const fixture = JSON.parse(await fs.readFile(new URL(
  "../fixtures/contextual-course-review-acceptance.v1.json",
  import.meta.url
), "utf8"));

function uuid(group, index) {
  return `${group.repeat(8)}-${group.repeat(4)}-5${group.repeat(3)}-8${group.repeat(3)}-${String(index).padStart(12, group)}`;
}

function annotationId(index) {
  return `70000000-0000-5000-8000-${String(index).padStart(12, "0")}`;
}

function checksFor(targetIndex) {
  const supported = normalizeCourseSourceLinks([fixture.sourceLink]);
  return [{
    checkId: uuid("3", targetIndex * 10 + 1),
    dimension: "pedagogical_quality",
    criterion: {
      code: "coherent_progression",
      version: "1",
      statement: "Pré-requisitos, exemplos, prática e transições formam um percurso coerente."
    },
    result: "failed",
    publicEvidence: fixture.repairTargets[targetIndex].reason,
    adequacy: "insufficient",
    planItemRefs: [],
    parameterRefs: [{
      parameterId: fixture.parameterOverride.parameterId,
      changeId: "17"
    }],
    sourceLinks: []
  }, {
    checkId: uuid("3", targetIndex * 10 + 2),
    dimension: "factual_quality",
    criterion: {
      code: "claim_support",
      version: "1",
      statement: "A explicação factual possui Fonte e Âncora pertinentes."
    },
    result: "passed",
    publicEvidence: "A Âncora contextual sustenta a relação factual.",
    adequacy: "sufficient",
    planItemRefs: [],
    parameterRefs: [],
    sourceLinks: supported
  }, {
    checkId: uuid("3", targetIndex * 10 + 3),
    dimension: "editorial_quality",
    criterion: {
      code: "editorial_focus",
      version: "1",
      statement: "A revisão preserva foco sem comprimir conteúdo necessário."
    },
    result: "passed",
    publicEvidence: "O reparo distribui o conteúdo entre as Units afetadas.",
    adequacy: "sufficient",
    planItemRefs: [],
    parameterRefs: [],
    sourceLinks: []
  }];
}

function paragraphStudyUnit(id) {
  return {
    id,
    position: 1,
    title: "Relação representada por texto",
    role: "theory",
    content: [{
      id: `${id}-paragraph`,
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Caso, nome e endereço foram condensados numa enumeração." }
    }],
    response: null,
    feedback: [],
    topics: [fixture.subjectId]
  };
}

test("#271 seleção multi-Unit cria fatos individuais e consulta abertas por escopo", () => {
  assert.equal(fixture.contract, "aralearn.contextual-course-review-acceptance.v1");
  const commands = fixture.observedTargetIds.map((targetId, index) => (
    normalizeCourseAnchoredAnnotationCommand({
      type: "create_anchored_annotation",
      annotationId: annotationId(index + 1),
      target: { kind: "study_unit", id: targetId },
      rawText: fixture.observationText,
      category: "confusing",
      capturedAt: "2026-09-01T12:00:00Z",
      briefSummary: "Pré-requisito insuficiente."
    })
  ));
  assert.equal(new Set(commands.map(({ annotationId }) => annotationId)).size, 2);
  assert.deepEqual(commands.map(({ target }) => target.id), fixture.observedTargetIds);
  assert.equal(commands.every((command) => command.rawText === fixture.observationText), true);
  assert.equal(commands.some((command) => Object.hasOwn(command, "batchId")), false);

  const openScope = normalizeCourseAnchoredAnnotationQuery({
    mode: "target",
    origins: ["author"],
    channels: ["authoring_interface"],
    states: ["open"],
    categories: ["confusing"],
    includeUncategorized: true,
    subjectIds: [fixture.subjectId],
    hierarchy: {
      target: { kind: "didactic_microsequence", id: fixture.microsequenceId },
      includeDescendants: true
    },
    annotationId: null
  });
  assert.deepEqual(openScope.states, ["open"]);
  assert.deepEqual(openScope.subjectIds, [fixture.subjectId]);
  assert.equal(openScope.hierarchy.includeDescendants, true);
});

test("#271 revisão compõe correções focais para alvo e percurso pedagogicamente afetado", () => {
  const annotationByTarget = new Map(fixture.observedTargetIds.map((id, index) => [
    id,
    annotationId(index + 1)
  ]));
  const repairCommands = fixture.repairTargets.map((target, index) => {
    const annotationIds = annotationByTarget.has(target.id)
      ? [annotationByTarget.get(target.id)]
      : [];
    const contextQuery = normalizeCourseAuditCycleQuery({
      mode: "context",
      targetStudyUnitId: target.id,
      findingId: null,
      correctionId: null,
      auditRunId: null,
      states: [],
      dimensions: [],
      severities: [],
      annotationIds
    });
    const checks = checksFor(index);
    const record = normalizeCourseAuditCycleCommand({
      type: "record_audit",
      auditRunId: uuid("1", index + 1),
      targetStudyUnitId: target.id,
      contextHash: String(index + 1).repeat(64).slice(0, 64),
      origin: "human_audit",
      method: { id: "contextual-course-review", version: "1" },
      checks,
      findings: [{
        findingId: uuid("2", index + 1),
        checkId: checks[0].checkId,
        code: "affected_progression",
        severity: "high",
        annotationRefs: annotationIds.map((id) => ({ annotationId: id, annotationVersion: 1 }))
      }]
    });
    const correction = normalizeCourseAuditCycleCommand({
      type: "propose_authoring_correction",
      correctionId: uuid("4", index + 1),
      findingId: record.findings[0].findingId,
      expectedFindingVersion: 1,
      expectedCorrectionVersion: 0,
      afterContent: {
        title: `Reparo · ${target.id}`,
        topics: [fixture.subjectId],
        rationale: target.reason
      },
      afterSourceLinks: [fixture.sourceLink],
      rationale: `Reparar ${target.reason} sem limitar a revisão à Unit anotada.`
    });
    return { targetId: target.id, contextQuery, record, correction };
  });

  assert.deepEqual(repairCommands.map(({ targetId }) => targetId),
    fixture.repairTargets.map(({ id }) => id));
  assert.equal(repairCommands.filter(({ contextQuery }) =>
    contextQuery.annotationIds.length > 0).length, fixture.observedTargetIds.length);
  assert.equal(repairCommands.every(({ correction }) =>
    !Object.hasOwn(correction, "batchId") && correction.afterSourceLinks.length === 1), true);
  assert.equal(new Set(repairCommands.map(({ correction }) => correction.correctionId)).size,
    fixture.repairTargets.length);
});

test("#271 Fonte contextual, representação e override da Microssequência têm efeito por Unit", () => {
  const sourceLinks = normalizeCourseSourceLinks([fixture.sourceLink]);
  assert.deepEqual(sourceLinks[0].anchors, fixture.sourceLink.anchors);

  const representation = RESOURCE_CATALOG.auditRepresentation({
    studyUnit: paragraphStudyUnit("unit-example"),
    intent: {
      query: "Comparar os mesmos atributos entre casos.",
      structureIds: ["structure.table"],
      taskOperationIds: ["task_operation.compare"],
      mustPreserve: ["linhas e colunas"]
    }
  });
  assert.equal(representation.overallFit, "substitute");

  const path = [
    { kind: "course", ref: fixture.courseId },
    { kind: "module", ref: "module-dns" },
    { kind: "lesson", ref: "lesson-dns" },
    { kind: "didactic_microsequence", ref: fixture.microsequenceId }
  ];
  const resolved = resolveCourseDesignParameters([{
    changeId: "17",
    action: "set",
    parameterId: fixture.parameterOverride.parameterId,
    scope: path.at(-1),
    value: fixture.parameterOverride.value,
    origin: fixture.parameterOverride.origin,
    reason: fixture.parameterOverride.reason
  }], path);
  assert.equal(resolved[0].effectiveAssignment.value, 1);
  assert.equal(resolved[0].effectiveAssignment.inherited, false);

  const analysisIds = fixture.repairTargets.map((_, index) => (
    `50000000-0000-5000-8000-${String(index + 1).padStart(12, "0")}`
  ));
  const parameters = COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => ({
    parameterId: definition.id,
    value: definition.id === fixture.parameterOverride.parameterId
      ? fixture.parameterOverride.value
      : structuredClone(definition.defaultValue),
    origin: definition.id === fixture.parameterOverride.parameterId ? "author" : "system_default",
    reason: definition.id === fixture.parameterOverride.parameterId
      ? fixture.parameterOverride.reason
      : "Hipótese padrão de produto.",
    sourceScope: definition.id === fixture.parameterOverride.parameterId ? path.at(-1) : null
  }));
  const designContext = {
    contract: COURSE_DESIGN_CONTEXT_CONTRACT,
    courseId: fixture.courseId,
    courseRevision: 7,
    authoringPartId: "60000000-0000-5000-8000-000000000001",
    componentCatalogVersion: COURSE_COMPONENT_CATALOG_VERSION,
    instructionalAnalysisUnits: analysisIds.map((id, position) => ({
      id,
      position,
      statement: fixture.repairTargets[position].reason,
      version: 1
    })),
    evidenceRequirements: [],
    guidanceRevisions: [],
    targets: [{
      didacticMicrosequenceId: fixture.microsequenceId,
      instructionalAnalysisUnitIds: analysisIds,
      evidenceRequirementIds: [],
      parameters,
      guidanceRevisionIds: [],
      componentPolicy: {
        changeId: null,
        policy: {
          catalogVersion: COURSE_COMPONENT_CATALOG_VERSION,
          availability: "all",
          allowedRefs: [],
          excludedRefs: [],
          preferredRefs: []
        },
        origin: "system_default",
        reason: "Todos os componentes permanecem disponíveis.",
        sourceScope: null
      },
      sourceAttributions: {
        instructionalAnalysisUnits: [],
        evidenceRequirements: []
      }
    }]
  };
  const forms = ["plain_definition", "concrete_example", "mechanism", "contrast"];
  const application = {
    contextHash: "a".repeat(64),
    didacticMicrosequenceId: fixture.microsequenceId,
    studyUnits: fixture.repairTargets.map((target, index) => ({
      studyUnitId: target.id,
      mode: "expository",
      introducedInstructionalAnalysisUnitIds: [analysisIds[index]],
      explanationApplications: [{
        instructionalAnalysisUnitId: analysisIds[index],
        developedForms: forms,
        notApplicable: []
      }],
      practiceApplications: [],
      componentRefs: []
    }))
  };
  const audit = auditDesignApplication(designContext, application, {
    contextHash: application.contextHash
  });
  assert.deepEqual(audit.issues, []);
  assert.equal(application.studyUnits.every(({ introducedInstructionalAnalysisUnitIds }) =>
    introducedInstructionalAnalysisUnitIds.length === fixture.parameterOverride.value), true);
});
