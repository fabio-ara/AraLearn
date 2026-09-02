import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  AUTHORING_PROTOCOL_V1_TOOLS
} from "../../supabase/functions/_shared/aralearn-authoring/authoringProtocolV1.js";
import {
  COURSE_MCP_TOOLS
} from "../../supabase/functions/_shared/aralearn-authoring/courseMcpTools.js";
import {
  courseAuthoringGuidanceForCall
} from "../../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";
import {
  projectConversationalAuthoringToolSuccess
} from "../../supabase/functions/_shared/aralearn-authoring/conversationalAuthoringProjection.js";
import {
  executeCourseTool
} from "../../supabase/functions/_shared/aralearn-authoring/courseToolExecutor.js";
import {
  projectAuthoringProtocolToolsForActions
} from "../../scripts/projectChatGptActionSchemas.mjs";

const fixture = JSON.parse(await fs.readFile(new URL(
  "../fixtures/contextual-review-repair.v1.json",
  import.meta.url
), "utf8"));
const openApiText = await fs.readFile(new URL(
  "../../docs/downloads/aralearn-chatgpt-action-openapi.yaml",
  import.meta.url
), "utf8");
const openApi = JSON.parse(openApiText);

const COURSE_ID = "90000000-0000-5000-8000-000000000009";
const FINDING_ID = "92000000-0000-5000-8000-000000000001";
const CORRECTION_ID = "93000000-0000-5000-8000-000000000001";
const CONTEXT_HASH = "9".repeat(64);
const REQUEST_ID = "contextual-review-0001";

const actionTools = projectAuthoringProtocolToolsForActions(AUTHORING_PROTOCOL_V1_TOOLS);

function validator(schema) {
  return new Ajv2020({ allErrors: true, strict: false }).compile(schema);
}

function tool(tools, name) {
  return tools.find((candidate) => candidate.name === name);
}

function auditCheck(dimension, index, result = "passed") {
  const adequacy = result === "failed" ? "insufficient" : "sufficient";
  return {
    checkId: `94000000-0000-5000-8000-${String(index).padStart(12, "0")}`,
    dimension,
    criterion: {
      code: `${dimension}.contextual_review`,
      version: "1",
      statement: `Revisar ${dimension} no conjunto afetado.`
    },
    result,
    publicEvidence: result === "failed"
      ? "A Unit não preserva a relação necessária no percurso afetado."
      : "O aspecto permanece coerente no conjunto reinspecionado.",
    adequacy,
    planItemRefs: [],
    parameterRefs: dimension === "pedagogical_quality" ? [{
      parameterId: fixture.parameterChange.parameterId,
      changeId: null
    }] : [],
    sourceLinks: []
  };
}

function reviewChecks({ resolved = false } = {}) {
  return [
    auditCheck("pedagogical_quality", 1, resolved ? "passed" : "failed"),
    auditCheck("factual_quality", 2),
    auditCheck("editorial_quality", 3, resolved ? "passed" : "failed")
  ];
}

function auditCommands() {
  const annotationRefs = fixture.openObservations.map(({ annotationId, annotationVersion }) => ({
    annotationId,
    annotationVersion
  }));
  return {
    record: {
      type: "record_audit",
      targetStudyUnitId: fixture.initialInspection.targetStudyUnitId,
      contextHash: CONTEXT_HASH,
      origin: "human_audit",
      method: { id: "contextual-review", version: "1" },
      checks: reviewChecks(),
      findings: [{
        checkIndex: 0,
        code: "pedagogy.affected_path",
        severity: "high",
        annotationRefs
      }]
    },
    propose: {
      type: "propose_authoring_correction",
      findingId: FINDING_ID,
      expectedFindingVersion: 1,
      expectedCorrectionVersion: 0,
      afterContent: {
        title: "Regra e percurso corrigidos",
        role: "theory",
        content: []
      },
      afterSourceLinks: [],
      rationale: "Alinhar regra, transição, exemplo e prática sem alterar o pré-requisito já correto."
    },
    apply: {
      type: "apply_authoring_correction",
      findingId: FINDING_ID,
      expectedFindingVersion: 2,
      correctionId: CORRECTION_ID,
      expectedCorrectionVersion: 1,
      confirmed: true
    },
    verify: {
      type: "verify_finding",
      findingId: FINDING_ID,
      expectedFindingVersion: 3,
      correctionId: CORRECTION_ID,
      expectedCorrectionVersion: 2,
      contextHash: CONTEXT_HASH,
      origin: "human_audit",
      method: { id: "contextual-review", version: "1" },
      checks: reviewChecks({ resolved: true }),
      outcome: "resolved"
    }
  };
}

function changeEnvelope(auditCommand) {
  return {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 7,
    operation: "update_audit_cycle",
    auditCommand
  };
}

test("#271 fixture expande alvos anotados para o percurso pedagogicamente afetado", () => {
  assert.equal(fixture.format, "aralearn.contextual-review-repair-eval.v1");
  assert.equal(
    fixture.epistemicStatus,
    "synthetic_review_declarations_for_contract_and_human_review"
  );
  assert.equal(fixture.openObservations.length, 2);
  assert.equal(fixture.persistentBatchEntity, null);
  assert.deepEqual(fixture.affectedContext.map(({ relation }) => relation), [
    "prerequisite", "observed_target", "transition", "example", "practice"
  ]);
  const annotated = new Set(fixture.openObservations.map(({ targetStudyUnitId }) => (
    targetStudyUnitId
  )));
  const affectedBeyondTargets = fixture.affectedContext.filter(({ studyUnitId }) => (
    !annotated.has(studyUnitId)
  ));
  assert.ok(affectedBeyondTargets.length >= 2);
  assert.deepEqual(
    fixture.affectedContext.filter(({ requiresRepair }) => requiresRepair)
      .map(({ studyUnitId }) => studyUnitId),
    [
      "unit-04-routing-rule",
      "unit-05-routing-transition",
      "unit-06-routing-example",
      "unit-07-routing-practice"
    ]
  );
  assert.deepEqual(fixture.flow, [
    "inspect", "observe", "request_review", "read_open_observations",
    "expand_affected_context", "record_findings", "propose_repairs",
    "obtain_one_decision", "apply_confirmed_repairs", "reinspect_affected_units",
    "verify_findings"
  ]);
});

test("#271 guidance conduz Observações abertas até reparo contextual e reinspeção", () => {
  const inspection = courseAuthoringGuidanceForCall("lerCurso", { view: "study_units" });
  const didacticReview = courseAuthoringGuidanceForCall("lerCurso", {
    view: "audit_cycle",
    mode: "context",
    dimensions: ["pedagogical_quality"]
  });
  const audit = courseAuthoringGuidanceForCall("lerCurso", {
    view: "audit_cycle",
    mode: "context",
    dimensions: ["factual_quality"]
  });
  const sources = courseAuthoringGuidanceForCall("lerCurso", {
    view: "course_sources",
    mode: "target"
  });
  const components = courseAuthoringGuidanceForCall("consultarComponentesDidaticos", {
    operation: "audit_representation"
  });
  const inspectionText = inspection.instructions.join(" ");
  const didacticText = didacticReview.instructions.join(" ");
  const auditText = audit.instructions.join(" ");
  const sourceText = sources.instructions.join(" ");
  const componentText = components.instructions.join(" ");

  assert.match(inspectionText, /Observações abertas.*inbox/iu);
  assert.match(inspectionText, /não crie entidade persistente de lote/iu);
  assert.match(inspectionText, /progressão, pré-requisitos, transições, exemplos ou prática/iu);
  assert.match(inspectionText, /não limite a análise às Units originalmente anotadas/iu);
  assert.match(inspectionText, /alteração de parâmetro rege a próxima geração ou revisão/iu);
  assert.match(didacticText, /inspecionar, observar, pedir revisão.*propor reparo.*reinspecionar/iu);
  assert.match(didacticText, /progressão, pré-requisitos, transições, exemplos e prática/iu);
  assert.match(didacticText, /não apenas os alvos anotados/iu);
  assert.match(auditText, /Units anteriores ou posteriores pertinentes/iu);
  assert.match(auditText, /findings e propostas para todo o conjunto/iu);
  assert.match(auditText, /overallFit substitute.*finding.*proposta concreta/iu);
  assert.match(auditText, /Validade estrutural não resolve o achado/iu);
  assert.match(auditText, /verify_finding como resolved ou still_open/iu);
  assert.match(auditText, /deep link rotulado e uma única próxima decisão/iu);
  assert.match(sourceText, /referência humana, o papel efetivo.*Âncora ou trecho/iu);
  assert.match(sourceText, /não viram apoio factual automaticamente/iu);
  assert.match(sourceText, /Fonte e Âncora continuam contestáveis/iu);
  assert.match(componentText, /overallFit substitute.*finding e proposta concreta/iu);
  assert.match(componentText, /não uma quota de diversidade/iu);
});

test("#271 MCP e Actions leem Observações selecionadas e abrem foco das Units afetadas", () => {
  const validateMcpRead = validator(tool(COURSE_MCP_TOOLS, "lerCurso").inputSchema);
  const validateActionRead = validator(tool(actionTools, "lerCurso").inputSchema);
  const validateMcpChange = validator(tool(COURSE_MCP_TOOLS, "alterarCurso").inputSchema);
  const validateActionChange = validator(tool(actionTools, "alterarCurso").inputSchema);
  const inbox = {
    courseId: COURSE_ID,
    view: "anchored_annotations",
    expectedRevision: 7,
    mode: "inbox",
    targetKind: "didactic_microsequence",
    targetId: fixture.scope.id,
    includeDescendants: true,
    states: ["open"],
    limit: 24
  };
  const context = {
    courseId: COURSE_ID,
    view: "audit_cycle",
    expectedRevision: 7,
    auditSetVersion: 1,
    mode: "context",
    targetStudyUnitId: fixture.initialInspection.targetStudyUnitId,
    annotationIds: fixture.openObservations.map(({ annotationId }) => annotationId),
    includeObservationText: true,
    limit: 12
  };
  const focus = {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 7,
    operation: "create_inspection_focus",
    inspectionFocus: {
      title: "Revisão do percurso de roteamento",
      studyUnitIds: fixture.affectedContext.map(({ studyUnitId }) => studyUnitId)
    }
  };
  for (const [validateMcp, validateAction, payload] of [
    [validateMcpRead, validateActionRead, inbox],
    [validateMcpRead, validateActionRead, context],
    [validateMcpChange, validateActionChange, focus]
  ]) {
    assert.equal(validateMcp(payload), true, JSON.stringify(validateMcp.errors));
    assert.equal(validateAction(payload), true, JSON.stringify(validateAction.errors));
  }
  assert.equal(Object.hasOwn(focus.inspectionFocus, "batchId"), false);
});

test("#271 finding, proposta, decisão, aplicação e verificação usam o audit cycle existente", () => {
  const validateMcp = validator(tool(COURSE_MCP_TOOLS, "alterarCurso").inputSchema);
  const validateAction = validator(tool(actionTools, "alterarCurso").inputSchema);
  const commands = auditCommands();
  for (const command of Object.values(commands)) {
    const payload = changeEnvelope(command);
    assert.equal(validateMcp(payload), true, JSON.stringify(validateMcp.errors));
    assert.equal(validateAction(payload), true, JSON.stringify(validateAction.errors));
  }
  assert.equal(commands.record.findings[0].annotationRefs.length, 2);
  assert.equal(commands.propose.rationale.includes("transição, exemplo e prática"), true);
  assert.equal(commands.apply.confirmed, true);
  assert.equal(commands.verify.outcome, "resolved");
});

test("#271 audit_representation substitute vira evidência de finding sem quota", async () => {
  const studyUnitJson = JSON.stringify({
    id: fixture.representationAudit.studyUnitId,
    position: 5,
    title: "Transição de roteamento",
    role: "theory",
    content: [{
      id: "routing-paragraph",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Primeiro compare a condição, então selecione o destino e encaminhe." }
    }],
    response: null,
    feedback: [],
    topics: ["roteamento"]
  });
  const rawArguments = {
    operation: "audit_representation",
    studyUnitJson,
    studyUnitRole: "theory",
    intent: "Preservar uma sequência de decisões de roteamento.",
    structureIds: ["structure.process"],
    taskOperationIds: ["task_operation.order"],
    mustPreserve: ["ordem entre condição, escolha e encaminhamento"]
  };
  const validateMcp = validator(tool(COURSE_MCP_TOOLS, "consultarComponentesDidaticos")
    .inputSchema);
  const validateAction = validator(tool(actionTools, "consultarComponentesDidaticos")
    .inputSchema);
  assert.equal(validateMcp(rawArguments), true, JSON.stringify(validateMcp.errors));
  assert.equal(validateAction(rawArguments), true, JSON.stringify(validateAction.errors));

  const result = await executeCourseTool({
    adapter: {},
    principal: { actorId: COURSE_ID, scopes: ["authoring:read"] },
    name: "consultarComponentesDidaticos",
    rawArguments,
    surface: "mcp"
  });
  assert.equal(result.data.result.structural.valid, true);
  assert.equal(result.data.result.overallFit, fixture.representationAudit.overallFit);
  assert.equal(fixture.representationAudit.expectedConsequence, (
    "record_finding_and_propose_functional_replacement"
  ));
  assert.equal(fixture.representationAudit.diversityQuota, null);
  assert.match(result.data.phaseGuidance.instructions.join(" "), /finding e proposta concreta/iu);
});

test("#271 Fontes preservam papel contestável e parâmetro rege a próxima revisão", () => {
  assert.deepEqual(fixture.sources.map(({ role, factualSupport, contestable }) => ({
    role,
    factualSupport,
    contestable
  })), [{
    role: "scope_and_calibration",
    factualSupport: false,
    contestable: true
  }, {
    role: "factual_support",
    factualSupport: true,
    contestable: true
  }]);
  assert.equal(fixture.sources.every(({ citationText, anchor }) => (
    Boolean(citationText && anchor)
  )), true);

  const validateMcpRead = validator(tool(COURSE_MCP_TOOLS, "lerCurso").inputSchema);
  const validateActionRead = validator(tool(actionTools, "lerCurso").inputSchema);
  const sourceRead = {
    courseId: COURSE_ID,
    view: "course_sources",
    expectedRevision: 7,
    mode: "target",
    targetKind: "study_unit",
    targetId: fixture.initialInspection.targetStudyUnitId
  };
  assert.equal(validateMcpRead(sourceRead), true, JSON.stringify(validateMcpRead.errors));
  assert.equal(validateActionRead(sourceRead), true, JSON.stringify(validateActionRead.errors));

  const parameter = fixture.parameterChange;
  const change = {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 7,
    operation: "update_course_design",
    designCommand: {
      type: "set_parameter",
      scope: parameter.scope,
      parameterId: parameter.parameterId,
      value: parameter.effectiveValue,
      mode: "explicit",
      origin: parameter.origin,
      reason: "A próxima revisão precisa de três oportunidades distintas."
    }
  };
  const validateMcpChange = validator(tool(COURSE_MCP_TOOLS, "alterarCurso").inputSchema);
  const validateActionChange = validator(tool(actionTools, "alterarCurso").inputSchema);
  assert.equal(validateMcpChange(change), true, JSON.stringify(validateMcpChange.errors));
  assert.equal(validateActionChange(change), true, JSON.stringify(validateActionChange.errors));
  assert.equal(parameter.appliesTo, "next_generation_or_revision");
  assert.equal(parameter.expectedRecordedPracticeOpportunities, parameter.effectiveValue);
});

test("#271 coordenação de reparo devolve uma mudança, deep link e uma decisão", () => {
  const deepLink = `https://example.test/#/authoring/courses/${COURSE_ID}?section=content`;
  const projected = projectConversationalAuthoringToolSuccess({
    toolName: "alterarCurso",
    rawArguments: { operation: "create_inspection_focus" },
    envelope: {
      ok: true,
      requestId: REQUEST_ID,
      data: { changed: true, deepLink }
    },
    summary: {
      change: fixture.coordination.proposal,
      nextDecision: fixture.coordination.nextDecision
    }
  });
  assert.equal(projected.action?.label, fixture.coordination.actionLabel);
  assert.equal((projected.message.match(/\?/gu) || []).length, 1);
  assert.ok(projected.message.length < 280);
  assert.equal(projected.message.includes(deepLink), false);
  for (const { studyUnitId } of fixture.affectedContext) {
    assert.equal(projected.message.includes(studyUnitId), false);
  }
  assert.doesNotMatch(projected.message, /resultFacts|contextHash|auditRunId|payload/iu);
});

test("#271 OpenAPI preserva as tarefas existentes sem criar ferramenta de revisão paralela", () => {
  assert.match(openApi.paths["/lerCurso"].post.description, /phaseGuidance focal/iu);
  assert.ok(openApi.paths["/alterarCurso"]);
  assert.ok(openApi.paths["/consultarComponentesDidaticos"]);
  for (const value of [
    "anchored_annotations", "audit_cycle", "create_inspection_focus",
    "record_audit", "propose_authoring_correction", "apply_authoring_correction",
    "verify_finding", "audit_representation"
  ]) assert.equal(openApiText.includes(value), true, value);
  assert.doesNotMatch(
    openApiText,
    /review_observations_batch|repair_affected_units|observationBatchId/iu
  );
  assert.equal(
    COURSE_MCP_TOOLS.some(({ name }) => /review|repair|batch/iu.test(name)),
    false
  );
});
