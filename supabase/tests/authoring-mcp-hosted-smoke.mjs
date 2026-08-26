import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { flattenCourseDocument } from "../../src/domain/courseEntities.js";

const projectUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/u, "");
const accessToken = String(
  process.env.ARALEARN_AUTHORING_MCP_OAUTH_TOKEN || ""
).trim();
const origin = String(process.env.ARALEARN_AUTHORING_MCP_ORIGIN || "")
  .trim()
  .replace(/\/+$/u, "");

assert.match(projectUrl, /^https:\/\/[^/]+$/u, "Informe a Project URL HTTPS em SUPABASE_URL.");
assert.match(accessToken, /^[^.]+\.[^.]+\.[^.]+$/u, "Informe um access token OAuth em ARALEARN_AUTHORING_MCP_OAUTH_TOKEN.");
assert.match(origin, /^https:\/\/[^/]+$/u, "Informe uma origem HTTPS permitida.");
assert.equal(
  Object.hasOwn(process.env, "SUPABASE_SERVICE_ROLE_KEY"),
  false,
  "O smoke hospedado do MCP não aceita service role."
);
const edgeUrl = `${projectUrl}/functions/v1/aralearn-authoring-mcp`;
const protocolVersion = "2025-11-25";
let rpcId = 0;

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
      : `Resultado público da dimensão ${dimension} no smoke MCP hospedado.`,
    adequacy,
    planItemRefs: [],
    parameterRefs: [],
    sourceLinks
  };
}

async function readJson(response, label) {
  const source = await response.text();
  try {
    return source ? JSON.parse(source) : null;
  } catch {
    assert.fail(`${label}: resposta não contém JSON.`);
  }
}

async function call(method, params = {}, { initialize = false } = {}) {
  rpcId += 1;
  const response = await fetch(edgeUrl, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Origin: origin,
      ...(initialize ? {} : { "MCP-Protocol-Version": protocolVersion })
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params })
  });
  const body = await readJson(response, method);
  assert.equal(
    response.status,
    200,
    `${method}: HTTP ${response.status}: ${body?.error?.message || JSON.stringify(body)}`
  );
  assert.equal(body?.jsonrpc, "2.0");
  assert.equal(body?.id, rpcId);
  assert.equal(body?.error, undefined, body?.error?.message);
  assert.equal(response.headers.get("mcp-session-id"), null, "O servidor deve permanecer stateless.");
  return body.result;
}

async function tool(name, argumentsValue = {}) {
  const result = await call("tools/call", { name, arguments: argumentsValue });
  assert.equal(
    result?.isError,
    false,
    `${name}: ${result?.structuredContent?.error?.message || "erro MCP"}`
  );
  assert.equal(result.structuredContent.ok, true);
  return result.structuredContent.data;
}

async function rejectedTool(name, argumentsValue = {}) {
  const result = await call("tools/call", { name, arguments: argumentsValue });
  assert.equal(result?.isError, true, JSON.stringify(result));
  assert.equal(result.structuredContent?.ok, false);
  return result.structuredContent.error;
}

const metadataResponse = await fetch(
  `${edgeUrl}/.well-known/oauth-protected-resource`
);
assert.equal(metadataResponse.status, 200, "Protected-resource metadata indisponível.");
const metadata = await metadataResponse.json();
assert.equal(metadata.resource, edgeUrl);
assert.deepEqual(metadata.scopes_supported, ["offline_access"]);
assert.deepEqual(metadata.authorization_servers, [`${projectUrl}/auth/v1`]);

const discoveryResponse = await fetch(
  `${projectUrl}/.well-known/oauth-authorization-server/auth/v1`
);
assert.equal(discoveryResponse.status, 200, "OAuth discovery do Supabase indisponível.");
const discovery = await discoveryResponse.json();
assert.match(discovery.authorization_endpoint, /\/auth\/v1\/oauth\/authorize$/u);
assert.match(discovery.token_endpoint, /\/auth\/v1\/oauth\/token$/u);
assert.ok(
  discovery.code_challenge_methods_supported?.includes("S256"),
  "OAuth Server não anuncia PKCE S256."
);

const initialized = await call("initialize", {
  protocolVersion,
  capabilities: {},
  clientInfo: { name: "aralearn-hosted-smoke", version: "2" }
}, { initialize: true });
assert.equal(initialized.protocolVersion, protocolVersion);
assert.equal(initialized.capabilities.tools.listChanged, false);

await call("ping");
const listed = await call("tools/list");
assert.deepEqual(listed.tools.map(({ name }) => name), [
  "listarCursos",
  "lerCurso",
  "criarCurso",
  "alterarCurso",
  "consultarComponentesDidaticos"
]);
assert.ok(listed.tools.every((entry) =>
  entry.securitySchemes?.[0]?.type === "oauth2" &&
  entry.securitySchemes?.[0]?.scopes?.length === 1 &&
  entry.securitySchemes[0].scopes[0] === "offline_access" &&
  JSON.stringify(entry._meta?.securitySchemes) === JSON.stringify(entry.securitySchemes)
));
assert.equal(
  listed.tools.some(({ name }) =>
    /workspace|trilha|cole(?:ç|c)[aã]o|publica(?:ç|c)[aã]o/iu.test(name)
  ),
  false
);

const componentSearch = await tool("consultarComponentesDidaticos", {
  operation: "search",
  query: "explicação progressiva em prosa",
  slot: "content",
  limit: 4
});
assert.equal(componentSearch.contract, "aralearn.instructional-component-library.v1");
assert.equal(
  componentSearch.result.candidates.some(
    ({ packageId }) => packageId === "aralearn.resource.paragraph"
  ),
  true
);

if (process.env.ARALEARN_AUTHORING_MCP_EPHEMERAL_USER === "1") {
  const createArguments = {
    requestId: randomUUID(),
    title: `Smoke MCP ${new Date().toISOString()}`,
    objective: "Validar o contrato hospedado corrente sem conservar dados de teste."
  };
  const created = await tool("criarCurso", createArguments);
  const replayed = await tool("criarCurso", createArguments);
  assert.equal(replayed.courseId, created.courseId, "Retry não recuperou o Curso.");
  assert.equal(replayed.idempotent, true);

  const compositionRows = flattenCourseDocument({
    contract: "aralearn.course.v1",
    courses: [{
      id: created.courseId,
      title: createArguments.title,
      goal: createArguments.objective,
      modules: [{
        id: "module-hosted-smoke",
        title: "Módulo hospedado",
        guide: {
          goal: "Validar o módulo.", include: ["Curso"], exclude: [], notation: [], avoid: []
        },
        lessons: [{
          id: "lesson-hosted-smoke",
          title: "Lição hospedada",
          guide: {
            goal: "Validar a lição.", include: ["Curso"], exclude: [], notation: [], avoid: []
          },
          topics: [],
          microsequences: [{
            id: "microsequence-hosted-smoke",
            title: "Microssequência hospedada",
            goal: "Validar a paginação owner-only.",
            role: "explain",
            dependsOn: [], covers: [], checks: [], errors: [],
            studyUnits: [1, 2].map((position) => ({
              id: `study-unit-hosted-smoke-${position}`,
              position,
              title: `Unidade hospedada ${position}`,
              role: "theory",
              content: [{
                id: `content-hosted-smoke-${position}`,
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: `Conteúdo hospedado ${position}.` }
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
  assert.equal(compositionRows.some(({ entityType }) => entityType === "study_unit"), true);
  const changed = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: created.revision,
    operation: "commit_course_composition",
    upserts: compositionRows,
    deletes: [],
    sourceAttributionApplications: [1, 2].map((position) => ({
      studyUnitId: `study-unit-hosted-smoke-${position}`,
      sourceLinks: []
    }))
  });
  assert.equal(changed.revision, 2);

  const sourceId = "source-hosted-smoke-verified";
  const anchorId = "anchor-hosted-smoke-verified";
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
        title: "Fonte verificada pelo MCP hospedado",
        authorship: "AraLearn",
        publicationDate: "2026-08-17",
        identifier: null,
        language: "pt-BR",
        citationText: "AraLearn. Fonte verificada pelo MCP hospedado, 2026.",
        url: "https://example.test/aralearn/mcp-hosted-source",
        editionOrVersion: "2026-08-17",
        origin: "external",
        availability: "open_access",
        verificationStatus: "author_verified",
        studyVisibility: "citation_and_link"
      }
    }
  });
  assert.equal(savedSource.courseRevision, changed.revision + 1);

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
      selector: { kind: "page_range", startPage: 3, endPage: 4 },
      verificationExcerpt: "Trecho privado verificado pelo MCP hospedado."
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
  assert.equal(sourceDetail.contract, "aralearn.mcp-course-sources.v1");
  assert.equal(sourceDetail.items[0].anchors[0].anchorId, anchorId);
  assert.equal(
    sourceDetail.items[0].anchors[0].verificationExcerpt,
    "Trecho privado verificado pelo MCP hospedado."
  );
  assert.equal(Object.hasOwn(sourceDetail, "courseId"), false);
  assert.equal(Object.hasOwn(sourceDetail.items[0], "actorId"), false);
  assert.equal(Object.hasOwn(sourceDetail.items[0].anchors[0], "actorId"), false);

  const firstStudyUnitRow = compositionRows.find(
    ({ entityType, entityId }) => entityType === "study_unit"
      && entityId === "study-unit-hosted-smoke-1"
  );
  const invalidAtomicRow = {
    ...firstStudyUnitRow,
    content: { ...firstStudyUnitRow.content, title: "Alteração hospedada que deve reverter" }
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
        sourceId: "source-hosted-smoke-inexistente",
        sourceRevision: 1,
        relation: "supported_by",
        anchors: [{
          anchorId: "anchor-hosted-smoke-inexistente",
          anchorRevision: 1
        }]
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
  assert.equal(afterRejectedAttribution.items[0].studyUnit.title, "Unidade hospedada 1");

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
  assert.equal(Object.hasOwn(attributedTarget.items[0], "attributionId"), false);
  assert.equal(Object.hasOwn(attributedTarget.items[0], "actorId"), false);
  assert.equal(Object.hasOwn(attributedTarget.items[0], "targetHash"), false);

  const atomicStudyUnitRow = {
    ...firstStudyUnitRow,
    content: {
      ...firstStudyUnitRow.content,
      title: "Unidade hospedada 1 com proveniência"
    }
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
  assert.equal(firstPage.contract, "aralearn.course-study-unit-inspection-page.v2");
  assert.deepEqual(firstPage.items[0].authorship, {
    pendingObservationCount: 0,
    production: null,
    design: null
  });
  assert.equal(firstPage.items[0].studyUnit.id, "study-unit-hosted-smoke-1");
  assert.equal(
    firstPage.items[0].studyUnit.title,
    "Unidade hospedada 1 com proveniência"
  );
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
  assert.equal(secondPage.items[0].studyUnit.id, "study-unit-hosted-smoke-2");

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
        ref: "microsequence-hosted-smoke"
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
      ref: "microsequence-hosted-smoke"
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
      mode: "explicit",
      origin: "author",
      reason: "Exercitar o desenho parametrizado no smoke hospedado."
    }
  });
  assert.equal(designChange.courseRevision, provenanceComposition.revision + 4);
  assert.equal(designChange.change.type, "set_parameter");

  const annotationId = randomUUID();
  const annotationRequestId = randomUUID();
  const annotationCommand = {
    type: "create_anchored_annotation",
    annotationId,
    target: { kind: "study_unit", id: "study-unit-hosted-smoke-1" },
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
  assert.equal(Object.hasOwn(createdAnnotation.annotation, "rawText"), false);
  assert.equal(createdAnnotation.dataDisclosure.rawObservationTextIncluded, false);
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
    targetId: "study-unit-hosted-smoke-1",
    includeDescendants: false,
    limit: 12
  });
  assert.equal(
    annotationPage.contract,
    "aralearn.mcp-anchored-annotation-page.v1"
  );
  assert.equal(annotationPage.summary.byChannel.authoring_chat, 1);
  const projectedAnnotation = annotationPage.items.find(
    ({ annotationId: id }) => id === annotationId
  );
  assert.equal(projectedAnnotation.briefSummary, annotationCommand.briefSummary);
  assert.equal(Object.hasOwn(projectedAnnotation, "rawText"), false);
  assert.equal(Object.hasOwn(projectedAnnotation.contributor, "ref"), false);
  assert.equal(Object.hasOwn(projectedAnnotation.contributor, "label"), false);
  assert.equal(Object.hasOwn(projectedAnnotation.target, "observedPath"), false);
  assert.equal(Object.hasOwn(projectedAnnotation.target, "deepLink"), false);
  assert.equal(Object.hasOwn(projectedAnnotation, "deepLink"), false);
  assert.equal(annotationPage.dataDisclosure.rawObservationTextIncluded, false);

  let auditCourseRevision = designChange.courseRevision;
  const auditContextPage = await tool("lerCurso", {
    courseId: created.courseId,
    view: "audit_cycle",
    expectedRevision: auditCourseRevision,
    auditSetVersion: null,
    mode: "context",
    targetStudyUnitId: "study-unit-hosted-smoke-1",
    annotationIds: [annotationId],
    includeObservationText: true,
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
      targetStudyUnitId: "study-unit-hosted-smoke-1",
      contextHash: auditContextPage.context.contextHash,
      origin: "human_audit",
      method: { id: "aralearn-mcp-hosted-smoke-review", version: "1" },
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

  const auditRunsPage = await tool("lerCurso", {
    courseId: created.courseId,
    view: "audit_cycle",
    expectedRevision: auditCourseRevision,
    auditSetVersion: null,
    mode: "runs",
    targetStudyUnitId: "study-unit-hosted-smoke-1",
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
    "study-unit-hosted-smoke-1");

  const auditFindingPage = await tool("lerCurso", {
    courseId: created.courseId,
    view: "audit_cycle",
    expectedRevision: auditCourseRevision,
    auditSetVersion: null,
    mode: "detail",
    findingId: auditFindingId,
    limit: 1
  });
  const auditCorrectionId = randomUUID();
  const auditAfterContent = structuredClone(auditContextPage.context.target.content);
  auditAfterContent.title = "Unidade hospedada 1 corrigida pela auditoria";
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
      rationale: "Exercitar confirmação, aplicação e rollback pelo MCP hospedado."
    }
  });
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
  const appliedAuditCorrection = await tool("alterarCurso", {
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
      confirmed: true
    }
  });
  assert.equal(appliedAuditCorrection.courseRevision, auditCourseRevision + 1);
  assert.equal(appliedAuditCorrection.correction.status, "applied");
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
    targetStudyUnitId: "study-unit-hosted-smoke-1",
    annotationIds: [annotationId],
    includeObservationText: true,
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
}

console.log(
  "Smoke MCP hospedado: OAuth, Fonte, observação e ciclo de auditoria aprovados."
);
