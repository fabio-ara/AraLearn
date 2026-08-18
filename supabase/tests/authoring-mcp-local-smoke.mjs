import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { flattenCourseDocument } from "../../src/domain/courseEntities.js";

const projectUrl = String(
  process.env.SUPABASE_URL || process.env.API_URL || "http://127.0.0.1:54321"
).replace(/\/+$/u, "");
const accessToken = String(
  process.env.ARALEARN_AUTHORING_MCP_OAUTH_TOKEN || ""
).trim();
const requireOAuth =
  String(process.env.ARALEARN_AUTHORING_MCP_REQUIRE_OAUTH || "").trim() === "1";
const origin = "http://127.0.0.1:4182";
const edgeUrl = `${projectUrl}/functions/v1/aralearn-authoring-mcp`;
const protocolVersion = "2025-11-25";
const hostname = new URL(projectUrl).hostname;

const AUDIT_CRITERIA = Object.freeze({
  pedagogical_quality: Object.freeze({
    code: "pedagogical_alignment",
    version: "1",
    statement: "A Unidade concretiza a intenção pedagógica declarada."
  }),
  factual_quality: Object.freeze({
    code: "claim_support",
    version: "1",
    statement: "As afirmações factuais possuem suporte exato em Fonte e Âncora ativas."
  }),
  editorial_quality: Object.freeze({
    code: "editorial_clarity",
    version: "1",
    statement: "A formulação é clara, precisa e adequada ao contexto da Unidade."
  })
});

function auditCheck(dimension, result, { checkId = randomUUID(), sourceLinks = [] } = {}) {
  const adequacy = {
    passed: "sufficient",
    failed: "insufficient",
    uncertain: "uncertain",
    not_applicable: "not_applicable",
    not_checked: "not_assessed"
  }[result];
  assert(adequacy, `Resultado de auditoria desconhecido: ${result}`);
  return {
    checkId,
    dimension,
    criterion: AUDIT_CRITERIA[dimension],
    result,
    publicEvidence: result === "not_checked"
      ? "Dimensão não reavaliada nesta rodada focal."
      : `Resultado público da dimensão ${dimension} no smoke MCP local.`,
    adequacy,
    planItemRefs: [],
    parameterRefs: [],
    sourceLinks
  };
}

assert(new Set(["127.0.0.1", "localhost"]).has(hostname), "Este smoke só usa o Supabase local.");

async function json(response) {
  const source = await response.text();
  try {
    return source ? JSON.parse(source) : null;
  } catch {
    return source;
  }
}

const metadataResponse = await fetch(
  `${edgeUrl}/.well-known/oauth-protected-resource`
);
assert.equal(metadataResponse.status, 200);
const metadata = await metadataResponse.json();
assert.equal(metadata.resource, edgeUrl);
assert.deepEqual(metadata.scopes_supported, ["openid"]);
assert.deepEqual(metadata.authorization_servers, [`${projectUrl}/auth/v1`]);

const rejectedAnonymous = await fetch(edgeUrl, {
  method: "POST",
  headers: {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    Origin: origin,
    "MCP-Protocol-Version": protocolVersion
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: {} })
});
assert.equal(rejectedAnonymous.status, 401);
assert.match(rejectedAnonymous.headers.get("www-authenticate"), /resource_metadata=/u);
assert.equal((await json(rejectedAnonymous)).error.data.code, "authentication_required");

if (!accessToken) {
  assert.equal(
    requireOAuth,
    false,
    "O smoke MCP autenticado exige um access token OAuth provisionado."
  );
  console.log(
    "Smoke MCP local: metadata e separação da chave HTTP aprovadas; "
    + "defina ARALEARN_AUTHORING_MCP_OAUTH_TOKEN para executar mutações OAuth locais."
  );
} else {
  assert.notEqual(
    accessToken,
    String(
      process.env.SUPABASE_SERVICE_ROLE_KEY
      || process.env.SERVICE_ROLE_KEY
      || ""
    ).trim(),
    "A service role não pode ser usada como bearer do MCP."
  );
  let rpcId = 1;
  async function call(method, params = {}) {
    rpcId += 1;
    const response = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Origin: origin,
        "MCP-Protocol-Version": protocolVersion
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params })
    });
    const body = await json(response);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.error, undefined, body.error?.message);
    return body.result;
  }
  async function tool(name, argumentsValue = {}) {
    const result = await call("tools/call", { name, arguments: argumentsValue });
    assert.equal(result.isError, false, result.structuredContent?.error?.message);
    return result.structuredContent.data;
  }
  async function rejectedTool(name, argumentsValue = {}) {
    const result = await call("tools/call", { name, arguments: argumentsValue });
    assert.equal(result.isError, true, JSON.stringify(result));
    assert.equal(result.structuredContent?.ok, false);
    return result.structuredContent.error;
  }

  const initialized = await call("initialize", {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: "aralearn-local-smoke", version: "1" }
  });
  assert.equal(initialized.protocolVersion, protocolVersion);

  const listed = await call("tools/list");
  const toolNames = listed.tools.map(({ name }) => name);
  assert.deepEqual(toolNames, [
    "listarCursos",
    "lerCurso",
    "criarCurso",
    "alterarCurso",
    "gerirPessoas",
    "consultarComponentesDidaticos"
  ]);
  assert.equal(
    toolNames.some((name) => /workspace|trilha|cole(?:ç|c)[aã]o|publica(?:ç|c)[aã]o/iu.test(name)),
    false
  );

  const created = await tool("criarCurso", {
    requestId: randomUUID(),
    title: "Curso OAuth local",
    objective: "Validar a autoria canônica pelo MCP"
  });
  assert.match(String(created.courseId || ""), /^[0-9a-f-]{36}$/iu);
  assert.equal(created.revision, 1);

  const read = await tool("lerCurso", {
    courseId: created.courseId,
    view: "outline"
  });
  assert.equal(read.courseId, created.courseId);
  assert.equal(read.revision, 1);

  const compositionRows = flattenCourseDocument({
    contract: "aralearn.course.v1",
    courses: [{
      id: created.courseId,
      title: "Curso OAuth local",
      goal: "Validar a autoria canônica pelo MCP",
      modules: [{
        id: "module-mcp-smoke",
        title: "Módulo MCP",
        guide: {
          goal: "Validar a escrita MCP.",
          include: ["Curso"],
          exclude: [],
          notation: [],
          avoid: []
        },
        lessons: [{
          id: "lesson-mcp-smoke",
          title: "Lição MCP",
          guide: {
            goal: "Validar a leitura MCP.",
            include: ["Curso"],
            exclude: [],
            notation: [],
            avoid: []
          },
          topics: [],
          microsequences: [{
            id: "microsequence-mcp-smoke",
            title: "Microssequência MCP",
            goal: "Paginar Unidades pelo contrato corrente.",
            role: "explain",
            dependsOn: [],
            covers: [],
            checks: [],
            errors: [],
            studyUnits: [1, 2].map((position) => ({
              id: `study-unit-mcp-smoke-${position}`,
              position,
              title: `Unidade MCP ${position}`,
              role: "theory",
              content: [{
                id: `content-mcp-smoke-${position}`,
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: `Conteúdo MCP ${position}.` }
              }],
              response: null,
              feedback: [],
              topics: []
            }))
          }]
        }]
      }]
    }]
  }).rows;
  assert.equal(
    compositionRows.some(({ entityType }) => entityType === "study_unit"),
    true
  );

  const changed = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: read.revision,
    operation: "commit_course_composition",
    upserts: compositionRows,
    deletes: [],
    sourceAttributionApplications: [1, 2].map((position) => ({
      studyUnitId: `study-unit-mcp-smoke-${position}`,
      sourceLinks: []
    }))
  });
  assert.equal(changed.revision, 2);
  assert.equal(changed.upsertedCount, 5);

  const sourceId = "source-mcp-smoke-verified";
  const anchorId = "anchor-mcp-smoke-verified";
  const savedSource = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: changed.revision,
    operation: "update_course_sources",
    sourceCommand: {
      type: "save_source",
      sourceId,
      expectedSourceRevision: 0,
      source: {
        kind: "web_page",
        title: "Fonte verificada pelo MCP local",
        citationText: "AraLearn. Fonte verificada pelo MCP local, 2026.",
        url: "https://example.test/aralearn/mcp-local-source",
        editionOrVersion: "2026-08-17",
        studyVisibility: "citation_and_link"
      }
    }
  });
  assert.equal(savedSource.courseRevision, changed.revision + 1);
  assert.deepEqual(savedSource.change, {
    type: "save_source",
    subjectId: sourceId,
    revision: 1
  });

  const savedAnchor = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: savedSource.courseRevision,
    operation: "update_course_sources",
    sourceCommand: {
      type: "save_anchor",
      anchorId,
      sourceId,
      sourceRevision: 1,
      expectedAnchorRevision: 0,
      selector: { kind: "page_range", startPage: 1, endPage: 2 },
      verificationExcerpt: "Trecho privado verificado pelo MCP local."
    }
  });
  assert.equal(savedAnchor.courseRevision, changed.revision + 2);
  const sourceLink = {
    sourceId,
    sourceRevision: 1,
    relation: "supported_by",
    anchors: [{ anchorId, anchorRevision: 1 }]
  };
  const sourceDetail = await tool("lerCurso", {
    courseId: created.courseId,
    view: "course_sources",
    expectedRevision: savedAnchor.courseRevision,
    mode: "source",
    sourceId,
    limit: 10
  });
  assert.equal(sourceDetail.contract, "aralearn.course-sources.v1");
  assert.equal(sourceDetail.items[0].anchors[0].anchorId, anchorId);
  assert.equal(
    sourceDetail.items[0].anchors[0].verificationExcerpt,
    "Trecho privado verificado pelo MCP local."
  );

  const firstStudyUnitRow = compositionRows.find(
    ({ entityType, entityId }) => entityType === "study_unit"
      && entityId === "study-unit-mcp-smoke-1"
  );
  const invalidAtomicRow = {
    ...firstStudyUnitRow,
    content: { ...firstStudyUnitRow.content, title: "Alteração que deve reverter" }
  };
  const rejectedAttribution = await rejectedTool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: savedAnchor.courseRevision,
    operation: "commit_course_composition",
    upserts: [invalidAtomicRow],
    deletes: [],
    sourceAttributionApplications: [{
      studyUnitId: invalidAtomicRow.entityId,
      sourceLinks: [{
        sourceId: "source-mcp-smoke-inexistente",
        sourceRevision: 1,
        relation: "supported_by",
        anchors: [{ anchorId: "anchor-mcp-smoke-inexistente", anchorRevision: 1 }]
      }]
    }]
  });
  assert.match(String(rejectedAttribution.code || ""), /invalid|source/iu);
  const afterRejectedAttribution = await tool("lerCurso", {
    courseId: created.courseId,
    view: "study_units",
    expectedRevision: savedAnchor.courseRevision,
    scope: { kind: "course" },
    direction: "forward",
    limit: 1,
    maxBytes: 65_536
  });
  assert.equal(afterRejectedAttribution.courseRevision, savedAnchor.courseRevision);
  assert.equal(afterRejectedAttribution.items[0].studyUnit.title, "Unidade MCP 1");

  const targetAttribution = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: savedAnchor.courseRevision,
    operation: "update_course_sources",
    sourceCommand: {
      type: "set_target_sources",
      targetKind: "study_unit",
      targetId: firstStudyUnitRow.entityId,
      expectedTargetVersion: 1,
      sourceLinks: [sourceLink]
    }
  });
  assert.equal(targetAttribution.courseRevision, changed.revision + 3);
  assert.equal(targetAttribution.change.type, "set_target_sources");

  const attributedTarget = await tool("lerCurso", {
    courseId: created.courseId,
    view: "course_sources",
    expectedRevision: targetAttribution.courseRevision,
    mode: "target",
    targetKind: "study_unit",
    targetId: firstStudyUnitRow.entityId,
    limit: 10
  });
  assert.equal(attributedTarget.items[0].effective, true);
  assert.deepEqual(attributedTarget.items[0].sourceLinks, [sourceLink]);

  const atomicStudyUnitRow = {
    ...firstStudyUnitRow,
    content: { ...firstStudyUnitRow.content, title: "Unidade MCP 1 com proveniência" }
  };
  const provenanceComposition = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: targetAttribution.courseRevision,
    operation: "commit_course_composition",
    upserts: [atomicStudyUnitRow],
    deletes: [],
    sourceAttributionApplications: [{
      studyUnitId: atomicStudyUnitRow.entityId,
      sourceLinks: [sourceLink]
    }]
  });
  assert.equal(provenanceComposition.revision, changed.revision + 4);
  assert.equal(provenanceComposition.updatedCount, 1);

  const atomicTarget = await tool("lerCurso", {
    courseId: created.courseId,
    view: "course_sources",
    expectedRevision: provenanceComposition.revision,
    mode: "target",
    targetKind: "study_unit",
    targetId: atomicStudyUnitRow.entityId,
    limit: 10
  });
  assert.equal(atomicTarget.items[0].effective, true);
  assert.equal(atomicTarget.items[0].targetVersion, 2);
  assert.deepEqual(atomicTarget.items[0].sourceLinks, [sourceLink]);

  const firstPage = await tool("lerCurso", {
    courseId: created.courseId,
    view: "study_units",
    expectedRevision: provenanceComposition.revision,
    scope: { kind: "course" },
    direction: "forward",
    limit: 1,
    maxBytes: 65_536
  });
  assert.equal(
    firstPage.contract,
    "aralearn.course-study-unit-inspection-page.v1"
  );
  assert.equal(firstPage.totalCount, 2);
  assert.equal(firstPage.items[0].studyUnit.id, "study-unit-mcp-smoke-1");
  assert.equal(firstPage.items[0].studyUnit.title, "Unidade MCP 1 com proveniência");
  assert.deepEqual(firstPage.nextCursor, {
    studyUnitId: "study-unit-mcp-smoke-1"
  });

  const secondPage = await tool("lerCurso", {
    courseId: created.courseId,
    view: "study_units",
    expectedRevision: provenanceComposition.revision,
    scope: { kind: "course" },
    cursor: firstPage.nextCursor,
    direction: "forward",
    limit: 1,
    maxBytes: 65_536
  });
  assert.equal(secondPage.items[0].studyUnit.id, "study-unit-mcp-smoke-2");
  assert.equal(secondPage.hasPrevious, true);
  assert.equal(secondPage.hasMore, false);

  const analysisItemId = randomUUID();
  const evidenceItemId = randomUUID();
  const analysisChange = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: provenanceComposition.revision,
    expectedPlanVersion: 1,
    operation: "update_instructional_plan",
    planCommand: {
      type: "add_plan_item",
      kind: "instructional_analysis_unit",
      id: analysisItemId,
      position: 0,
      statement: "Distinguir configuração DNS de concessão DHCP.",
      sourceLinks: []
    }
  });
  assert.equal(analysisChange.courseRevision, provenanceComposition.revision + 1);
  assert.equal(analysisChange.planVersion, 2);
  const evidenceChange = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: analysisChange.courseRevision,
    expectedPlanVersion: analysisChange.planVersion,
    operation: "update_instructional_plan",
    planCommand: {
      type: "add_plan_item",
      kind: "evidence_requirement",
      id: evidenceItemId,
      position: 0,
      statement: "Explicar a relação DNS–DHCP em um caso novo.",
      sourceLinks: []
    }
  });
  assert.equal(evidenceChange.courseRevision, provenanceComposition.revision + 2);
  assert.equal(evidenceChange.planVersion, 3);

  const targetChange = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: evidenceChange.courseRevision,
    operation: "update_course_design",
    designCommand: {
      type: "set_target_plan_items",
      scope: {
        kind: "didactic_microsequence",
        ref: "microsequence-mcp-smoke"
      },
      instructionalAnalysisUnitIds: [analysisItemId],
      evidenceRequirementIds: [evidenceItemId]
    }
  });
  assert.equal(targetChange.courseRevision, provenanceComposition.revision + 3);
  assert.equal(targetChange.change.type, "set_target_plan_items");

  const targetDesign = await tool("lerCurso", {
    courseId: created.courseId,
    view: "course_design",
    scope: {
      kind: "didactic_microsequence",
      ref: "microsequence-mcp-smoke"
    },
    limit: 32
  });
  assert.deepEqual(targetDesign.targetPlanItems, {
    instructionalAnalysisUnitIds: [analysisItemId],
    evidenceRequirementIds: [evidenceItemId]
  });

  const initialDesign = await tool("lerCurso", {
    courseId: created.courseId,
    view: "course_design",
    scope: { kind: "course", ref: created.courseId },
    limit: 32
  });
  assert.equal(initialDesign.contract, "aralearn.course-design.v1");
  assert.equal(initialDesign.targetPlanItems, null);
  assert.equal(initialDesign.definitions.length, 4);
  assert.equal(initialDesign.componentCatalog.options.length, 32);

  const designChange = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: targetChange.courseRevision,
    operation: "update_course_design",
    designCommand: {
      type: "set_parameter",
      scope: { kind: "course", ref: created.courseId },
      parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
      value: 3,
      origin: "author",
      reason: "Exercitar a resolução explícita pelo MCP local."
    }
  });
  assert.equal(designChange.courseRevision, provenanceComposition.revision + 4);
  assert.equal(designChange.change.type, "set_parameter");

  const resolvedDesign = await tool("lerCurso", {
    courseId: created.courseId,
    view: "course_design",
    scope: { kind: "course", ref: created.courseId },
    limit: 32
  });
  const resolvedCeiling = resolvedDesign.parameters.find(
    ({ parameterId }) => parameterId
      === "new_analysis_unit_ceiling_per_expository_study_unit"
  );
  assert.equal(resolvedCeiling.effectiveAssignment.value, 3);

  const annotationId = randomUUID();
  const annotationRequestId = randomUUID();
  const annotationCommand = {
    type: "create_anchored_annotation",
    annotationId,
    target: { kind: "study_unit", id: "study-unit-mcp-smoke-1" },
    rawText: "  A passagem precisa distinguir os dois mecanismos.\nPreservar este contexto.  ",
    category: "confusing",
    capturedAt: null,
    briefSummary: "Distinguir os dois mecanismos",
    confirmed: true
  };
  const unconfirmedAnnotation = await rejectedTool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: designChange.courseRevision,
    operation: "update_anchored_annotations",
    annotationCommand: { ...annotationCommand, confirmed: false }
  });
  assert.equal(
    unconfirmedAnnotation.code,
    "anchored_annotation_confirmation_required"
  );
  const createdAnnotation = await tool("alterarCurso", {
    requestId: annotationRequestId,
    courseId: created.courseId,
    expectedRevision: designChange.courseRevision,
    operation: "update_anchored_annotations",
    annotationCommand
  });
  assert.equal(createdAnnotation.courseRevision, designChange.courseRevision);
  assert.equal(createdAnnotation.annotation.annotationId, annotationId);
  assert.equal(createdAnnotation.annotation.provenance.origin, "author");
  assert.equal(createdAnnotation.annotation.provenance.channel, "authoring_chat");
  assert.equal(createdAnnotation.annotation.rawText, annotationCommand.rawText);
  const replayedAnnotation = await tool("alterarCurso", {
    requestId: annotationRequestId,
    courseId: created.courseId,
    expectedRevision: designChange.courseRevision,
    operation: "update_anchored_annotations",
    annotationCommand
  });
  assert.equal(replayedAnnotation.idempotent, true);
  assert.equal(replayedAnnotation.annotationSetVersion,
    createdAnnotation.annotationSetVersion);

  const annotationPage = await tool("lerCurso", {
    courseId: created.courseId,
    view: "anchored_annotations",
    expectedRevision: designChange.courseRevision,
    annotationSetVersion: null,
    mode: "target",
    states: ["open"],
    targetKind: "study_unit",
    targetId: "study-unit-mcp-smoke-1",
    includeDescendants: false,
    limit: 12
  });
  assert.equal(
    annotationPage.contract,
    "aralearn.course-anchored-annotation-page.v1"
  );
  assert.equal(annotationPage.summary.byChannel.authoring_chat, 1);
  assert.equal(
    annotationPage.items.find(({ annotationId: id }) => id === annotationId)?.rawText,
    annotationCommand.rawText
  );

  let auditCourseRevision = designChange.courseRevision;
  const auditContextPage = await tool("lerCurso", {
    courseId: created.courseId,
    view: "audit_cycle",
    expectedRevision: auditCourseRevision,
    auditSetVersion: null,
    mode: "context",
    targetStudyUnitId: "study-unit-mcp-smoke-1",
    annotationIds: [annotationId],
    limit: 1
  });
  assert.equal(
    auditContextPage.contract,
    "aralearn.course-audit-cycle-page.v1"
  );
  assert.equal(
    auditContextPage.context.contract,
    "aralearn.course-audit-context.v1"
  );
  const auditAnnotation = auditContextPage.context.annotations.find(
    ({ annotationId: id }) => id === annotationId
  );
  assert.equal(auditAnnotation.annotationVersion,
    createdAnnotation.annotation.annotationVersion);
  const auditRunId = randomUUID();
  const auditFindingId = randomUUID();
  const auditCheckId = randomUUID();
  const recordedAudit = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: auditCourseRevision,
    operation: "update_audit_cycle",
    auditCommand: {
      type: "record_audit",
      auditRunId,
      targetStudyUnitId: "study-unit-mcp-smoke-1",
      contextHash: auditContextPage.context.contextHash,
      origin: "human_audit",
      method: { id: "aralearn-mcp-local-smoke-review", version: "1" },
      checks: [
        auditCheck("pedagogical_quality", "not_checked"),
        auditCheck("factual_quality", "not_checked"),
        auditCheck("editorial_quality", "failed", { checkId: auditCheckId })
      ],
      findings: [{
        findingId: auditFindingId,
        checkId: auditCheckId,
        code: "ambiguous_formulation",
        severity: "medium",
        annotationRefs: [{
          annotationId,
          annotationVersion: auditAnnotation.annotationVersion
        }]
      }]
    }
  });
  assert.equal(recordedAudit.courseRevision, auditCourseRevision);
  assert.equal(recordedAudit.change.type, "record_audit");
  assert.equal(recordedAudit.change.auditRunId, auditRunId);

  const auditRunsPage = await tool("lerCurso", {
    courseId: created.courseId,
    view: "audit_cycle",
    expectedRevision: auditCourseRevision,
    auditSetVersion: null,
    mode: "runs",
    targetStudyUnitId: "study-unit-mcp-smoke-1",
    limit: 12
  });
  assert.equal(
    auditRunsPage.runs.find(({ auditRunId: id }) => id === auditRunId)?.auditRunId,
    auditRunId
  );
  const auditRunDetail = await tool("lerCurso", {
    courseId: created.courseId,
    view: "audit_cycle",
    expectedRevision: auditCourseRevision,
    auditSetVersion: null,
    mode: "detail",
    auditRunId,
    limit: 1
  });
  assert.equal(auditRunDetail.runDetail.auditRunId, auditRunId);
  assert.equal(auditRunDetail.runDetail.target.path.at(-1).id,
    "study-unit-mcp-smoke-1");

  const auditFindingPage = await tool("lerCurso", {
    courseId: created.courseId,
    view: "audit_cycle",
    expectedRevision: auditCourseRevision,
    auditSetVersion: null,
    mode: "detail",
    findingId: auditFindingId,
    limit: 1
  });
  assert.equal(auditFindingPage.detail.finding.status, "open");
  const auditCorrectionId = randomUUID();
  const auditAfterContent = structuredClone(auditContextPage.context.target.content);
  auditAfterContent.title = "Unidade MCP 1 corrigida pela auditoria";
  const proposedAuditCorrection = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: auditCourseRevision,
    operation: "update_audit_cycle",
    auditCommand: {
      type: "propose_authoring_correction",
      correctionId: auditCorrectionId,
      findingId: auditFindingId,
      expectedFindingVersion:
        auditFindingPage.detail.finding.findingVersion,
      expectedCorrectionVersion: 0,
      afterContent: auditAfterContent,
      afterSourceLinks: auditContextPage.context.target.sourceLinks,
      rationale: "Exercitar proposta, confirmação, aplicação e rollback pelo MCP."
    }
  });
  assert.equal(proposedAuditCorrection.correction.status, "proposed");
  assert.deepEqual(
    proposedAuditCorrection.correction.checkpoint.before.content.topics,
    proposedAuditCorrection.correction.checkpoint.after.content.topics
  );
  assert.deepEqual(
    proposedAuditCorrection.correction.checkpoint.before.sourceLinks,
    proposedAuditCorrection.correction.checkpoint.after.sourceLinks
  );
  const unconfirmedAuditApplication = await rejectedTool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: auditCourseRevision,
    operation: "update_audit_cycle",
    auditCommand: {
      type: "apply_authoring_correction",
      findingId: auditFindingId,
      expectedFindingVersion:
        proposedAuditCorrection.finding.findingVersion,
      correctionId: auditCorrectionId,
      expectedCorrectionVersion:
        proposedAuditCorrection.correction.correctionVersion,
      confirmed: false
    }
  });
  assert.equal(
    unconfirmedAuditApplication.code,
    "authoring_correction_confirmation_required"
  );
  const applyAuditRequestId = randomUUID();
  const appliedAuditCorrection = await tool("alterarCurso", {
    requestId: applyAuditRequestId,
    courseId: created.courseId,
    expectedRevision: auditCourseRevision,
    operation: "update_audit_cycle",
    auditCommand: {
      type: "apply_authoring_correction",
      findingId: auditFindingId,
      expectedFindingVersion:
        proposedAuditCorrection.finding.findingVersion,
      correctionId: auditCorrectionId,
      expectedCorrectionVersion:
        proposedAuditCorrection.correction.correctionVersion,
      confirmed: true
    }
  });
  assert.equal(appliedAuditCorrection.courseRevision, auditCourseRevision + 1);
  assert.equal(appliedAuditCorrection.finding.status, "awaiting_verification");
  assert.equal(appliedAuditCorrection.correction.status, "applied");
  const replayedAuditApplication = await tool("alterarCurso", {
    requestId: applyAuditRequestId,
    courseId: created.courseId,
    expectedRevision: auditCourseRevision,
    operation: "update_audit_cycle",
    auditCommand: {
      type: "apply_authoring_correction",
      findingId: auditFindingId,
      expectedFindingVersion:
        proposedAuditCorrection.finding.findingVersion,
      correctionId: auditCorrectionId,
      expectedCorrectionVersion:
        proposedAuditCorrection.correction.correctionVersion,
      confirmed: true
    }
  });
  assert.equal(replayedAuditApplication.idempotent, true);
  assert.equal(replayedAuditApplication.courseRevision,
    appliedAuditCorrection.courseRevision);
  auditCourseRevision = appliedAuditCorrection.courseRevision;

  const unconfirmedAuditRollback = await rejectedTool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: auditCourseRevision,
    operation: "update_audit_cycle",
    auditCommand: {
      type: "rollback_authoring_correction",
      findingId: auditFindingId,
      expectedFindingVersion: appliedAuditCorrection.finding.findingVersion,
      correctionId: auditCorrectionId,
      expectedCorrectionVersion:
        appliedAuditCorrection.correction.correctionVersion,
      confirmed: false
    }
  });
  assert.equal(
    unconfirmedAuditRollback.code,
    "authoring_correction_confirmation_required"
  );
  const rolledBackAuditCorrection = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: auditCourseRevision,
    operation: "update_audit_cycle",
    auditCommand: {
      type: "rollback_authoring_correction",
      findingId: auditFindingId,
      expectedFindingVersion: appliedAuditCorrection.finding.findingVersion,
      correctionId: auditCorrectionId,
      expectedCorrectionVersion:
        appliedAuditCorrection.correction.correctionVersion,
      confirmed: true
    }
  });
  assert.equal(rolledBackAuditCorrection.courseRevision, auditCourseRevision + 1);
  assert.equal(rolledBackAuditCorrection.finding.status, "open");
  assert.equal(rolledBackAuditCorrection.correction.status, "rolled_back");
  const auditContextAfterRollback = await tool("lerCurso", {
    courseId: created.courseId,
    view: "audit_cycle",
    expectedRevision: rolledBackAuditCorrection.courseRevision,
    auditSetVersion: null,
    mode: "context",
    targetStudyUnitId: "study-unit-mcp-smoke-1",
    annotationIds: [annotationId],
    limit: 1
  });
  assert.deepEqual(
    auditContextAfterRollback.context.target.content,
    proposedAuditCorrection.correction.checkpoint.before.content
  );
  assert.deepEqual(
    auditContextAfterRollback.context.target.sourceLinks,
    proposedAuditCorrection.correction.checkpoint.before.sourceLinks
  );

  const own = await tool("listarCursos", { query: "OAuth local" });
  assert.equal(
    own.items.some(({ courseId }) => courseId === created.courseId),
    true
  );
  const profile = await tool("gerirPessoas", { operation: "read_profile" });
  assert.match(String(profile.userId || ""), /^[0-9a-f-]{36}$/iu);

  console.log(
    "Smoke MCP local: OAuth, Fonte, observação e ciclo de auditoria aprovados."
  );
}
