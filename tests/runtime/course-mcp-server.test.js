import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ARALEARN_AUTHORING_CONTRACT_HEADER,
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import {
  AUTHORING_PROTOCOL_ID,
  AUTHORING_PROTOCOL_SCHEMA_VERSION,
  AUTHORING_PROTOCOL_V1_SCHEMA_HASH,
  AUTHORING_PROTOCOL_V1_TOOLS
} from "../../supabase/functions/_shared/aralearn-authoring/authoringProtocolV1.js";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { courseVariantComparisonFixture } from
  "../support/courseVariantComparisonFixture.js";

const ORIGIN = "https://client.example";
const RESOURCE_URL = "https://edge.example/functions/v1/aralearn-authoring-mcp";
const AUTHORIZATION_SERVER = "https://project.example/auth/v1";
const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PART_ID = "20000000-0000-4000-8000-000000000002";
const MATERIALIZATION_ID = "30000000-0000-4000-8000-000000000003";

async function minimalStudyUnit() {
  const project = JSON.parse(await readFile(
    new URL("../fixtures/package/project-minimal.json", import.meta.url),
    "utf8"
  ));
  return project.courses[0].modules[0].lessons[0].microsequences[0].studyUnits[0];
}

function handler(overrides = {}) {
  return createAuthoringMcpHandler({
    adapter: {
      async resolvePrincipal() {
        return {
          actorId: COURSE_ID,
          oauthClientId: "client",
          authenticationKind: "oauth",
          scopes: ["authoring:read", "authoring:write"]
        };
      },
      ...overrides
    },
    allowedOrigins: new Set([ORIGIN]),
    resourceUrl: RESOURCE_URL,
    authorizationServer: AUTHORIZATION_SERVER
  });
}

function request(method, params = {}) {
  return new Request(RESOURCE_URL, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Authorization: "Bearer token",
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
}

test("MCP anuncia somente invariantes e ferramentas canônicas de Curso", async () => {
  const initialize = await handler()(request("initialize", {
    protocolVersion: ARALEARN_MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "teste", version: "1" }
  }));
  const initialized = await initialize.json();
  const expectedContract = {
    id: AUTHORING_PROTOCOL_ID,
    version: AUTHORING_PROTOCOL_SCHEMA_VERSION,
    hash: AUTHORING_PROTOCOL_V1_SCHEMA_HASH
  };
  assert.equal(
    initialize.headers.get("X-AraLearn-Authoring-Contract"),
    ARALEARN_AUTHORING_CONTRACT_HEADER
  );
  assert.equal(initialized.result.serverInfo.version, AUTHORING_PROTOCOL_SCHEMA_VERSION);
  assert.equal(initialized.result.capabilities.tools.listChanged, false);
  assert.deepEqual(initialized.result._meta.authoringContract, expectedContract);
  assert.match(initialized.result.instructions, /Curso vivo e mutável/iu);
  assert.match(initialized.result.instructions, /phaseGuidance focal/iu);

  const listed = await handler()(request("tools/list"));
  const listedPayload = await listed.json();
  assert.equal(
    listed.headers.get("X-AraLearn-Authoring-Contract"),
    ARALEARN_AUTHORING_CONTRACT_HEADER
  );
  assert.deepEqual(listedPayload.result._meta.authoringContract, expectedContract);
  const tools = listedPayload.result.tools;
  const names = tools.map(({ name }) => name);
  assert.deepEqual(names, [
    "listarCursos",
    "lerCurso",
    "criarCurso",
    "alterarCurso",
    "consultarComponentesDidaticos"
  ]);
  assert.equal(names.includes("gerirPessoas"), false);
  assert.equal(names.some((name) => /workspace|trilha|cole(?:ç|c)[aã]o/iu.test(name)), false);
  for (const tool of tools) {
    assert.deepEqual(tool.securitySchemes, [{ type: "oauth2", scopes: ["offline_access"] }]);
    assert.deepEqual(tool._meta.securitySchemes, tool.securitySchemes);
  }
  const contractTools = tools.map((definition) => {
    const normalized = structuredClone(definition);
    delete normalized.securitySchemes;
    delete normalized._meta.securitySchemes;
    delete normalized._meta.ui;
    delete normalized._meta["openai/outputTemplate"];
    if (Object.keys(normalized._meta).length === 0) delete normalized._meta;
    return normalized;
  });
  assert.deepEqual(contractTools, AUTHORING_PROTOCOL_V1_TOOLS);
});

test("MCP publica conhecimento e componente opcional e lê o plano pela rota compartilhada", async () => {
  const resourcesResponse = await handler()(request("resources/list"));
  const resources = (await resourcesResponse.json()).result.resources;
  assert.deepEqual(resources.map(({ uri }) => uri), [
    "aralearn://authoring/planning-design",
    "aralearn://authoring/materialization",
    "aralearn://authoring/sources",
    "aralearn://authoring/inspection",
    "aralearn://authoring/audit-repair",
    "aralearn://authoring/linguistic-didactic-review",
    "aralearn://authoring/components",
    "ui://aralearn/course-inspector/0.0.24.html"
  ]);
  const componentResponse = await handler()(request("resources/read", {
    uri: "ui://aralearn/course-inspector/0.0.24.html"
  }));
  const component = (await componentResponse.json()).result.contents[0];
  assert.equal(component.mimeType, "text/html;profile=mcp-app");
  assert.equal(component._meta.ui.prefersBorder, true);

  const toolResponse = await handler({
    async getCourseInstructionalPlan({ courseId }) {
      return {
        contract: "aralearn.course-instructional-plan.v1",
        courseId,
        courseRevision: 2,
        plan: { version: 3, parts: [] },
        recentActivity: []
      };
    }
  })(request("tools/call", {
    name: "lerCurso",
    arguments: { courseId: COURSE_ID, view: "instructional_plan" }
  }));
  const payload = await toolResponse.json();
  assert.equal(payload.result.structuredContent.data.courseRevision, 2);
  assert.equal(payload.result.structuredContent.data.plan.version, 3);
  assert.match(payload.result.content[0].text, /A leitura foi concluída\./u);
  assert.doesNotMatch(payload.result.content[0].text, /Revisão do Curso|courseRevision|plan\.version/iu);
  assert.match(payload.result.content[0].text, /0 registros de atividade recente/u);
  assert.doesNotMatch(payload.result.content[0].text, /structuredContent/u);
  assert.equal(payload.result.content[0].text.includes(COURSE_ID), false);
  assert.equal(Object.hasOwn(payload.result.structuredContent, "conversation"), false);
});

test("MCP lê a materialização retomável sem duplicar o DTO no texto", async () => {
  let call = null;
  const toolResponse = await handler({
    async getCourseAuthoringPartMaterialization(value) {
      call = value;
      return {
        contract: "aralearn.course-authoring-part-materialization.v1",
        courseId: COURSE_ID,
        courseRevision: 4,
        authoringPartId: PART_ID,
        materialization: {
          id: MATERIALIZATION_ID,
          version: 2,
          resultFacts: {
            warnings: ["Uma Fonte ainda precisa de revisão."],
            observations: ["A primeira Microssequência foi preservada."]
          },
          steps: []
        }
      };
    }
  })(request("tools/call", {
    name: "lerCurso",
    arguments: {
      courseId: COURSE_ID,
      view: "part_materialization",
      authoringPartId: PART_ID,
      materializationId: MATERIALIZATION_ID
    }
  }));
  const payload = await toolResponse.json();

  assert.equal(payload.result.structuredContent.data.materialization.id,
    MATERIALIZATION_ID);
  assert.equal(call.authoringPartId, PART_ID);
  assert.equal(call.materializationId, MATERIALIZATION_ID);
  assert.equal(payload.result.content[0].text.includes(MATERIALIZATION_ID), false);
  assert.equal(payload.result.content[0].text.includes(PART_ID), false);
  assert.doesNotMatch(payload.result.content[0].text, /Revisão do Curso|courseRevision/iu);
  assert.match(payload.result.content[0].text, /Uma Fonte ainda precisa de revisão/u);
  assert.match(payload.result.content[0].text, /primeira Microssequência foi preservada/u);
});

test("MCP minimiza Observações e sinaliza quando o detalhe envia texto bruto", async () => {
  const annotationId = "70000000-0000-4000-8000-000000000007";
  const protectedRef = "person-feedfacefeedface";
  const rawText = "Relato integral known.person@example.test";
  const annotation = {
    annotationId,
    annotationVersion: 2,
    provenance: { origin: "learner", channel: "study_interface" },
    contributor: {
      kind: "protected_person", role: "learner", ref: protectedRef, label: "Estudante FEED"
    },
    target: {
      kind: "study_unit",
      id: "internal-study-unit",
      observedPath: [{ kind: "course", id: COURSE_ID, label: "Curso", version: 3 }, {
        kind: "study_unit", id: "internal-study-unit", label: "Unidade", version: 2
      }],
      currentAvailable: true,
      currentPath: [{ kind: "course", id: COURSE_ID, label: "Curso", version: 3 }, {
        kind: "study_unit", id: "internal-study-unit", label: "Unidade", version: 2
      }],
      deepLink: "https://app.example/#/authoring?section=observations"
    },
    observedRevision: { certainty: "known", courseRevision: 3, targetVersion: 2 },
    rawText,
    category: "confusing",
    briefSummary: "Dúvida localizada",
    subjectClassification: {
      status: "classified",
      effective: { subjects: [{ topicId: "internal-topic", label: "Tema", topicVersion: 1 }] }
    },
    state: "open",
    ownerResponse: null,
    timestamps: { capturedAt: null, updatedAt: "2026-08-21T12:00:00Z" },
    capabilities: {
      canRevise: false, canWithdraw: false, canConsider: true, canRespond: true,
      canResolve: true, canReopen: false, canCorrectSubjects: true
    },
    deepLink: "https://app.example/#/authoring?annotation=opaque"
  };
  const page = {
    contract: "aralearn.course-anchored-annotation-page.v1",
    courseId: COURSE_ID,
    courseRevision: 3,
    annotationSetVersion: 4,
    query: {},
    summary: {
      matchingTotal: 1,
      byOrigin: { learner: 1 },
      byChannel: { study_interface: 1 },
      byState: { open: 1 },
      unclassifiedTotal: 0
    },
    items: [annotation],
    hasMore: false,
    nextCursor: null
  };
  const adapter = { async getCourseAnchoredAnnotations() { return page; } };
  const inboxResponse = await handler(adapter)(request("tools/call", {
    name: "lerCurso",
    arguments: { courseId: COURSE_ID, view: "anchored_annotations", expectedRevision: 3 }
  }));
  const inbox = (await inboxResponse.json()).result;
  const inboxSerialized = JSON.stringify(inbox);
  assert.equal(inbox.structuredContent.data.dataDisclosure.rawObservationTextIncluded, false);
  assert.match(inbox.content[0].text, /omite o texto integral/iu);
  assert.equal(inbox.structuredContent.data.items[0].target.id, "internal-study-unit");
  for (const protectedValue of [
    protectedRef, "Estudante FEED", rawText, "internal-topic"
  ]) {
    assert.equal(inboxSerialized.includes(protectedValue), false, protectedValue);
  }

  const detailResponse = await handler(adapter)(request("tools/call", {
    name: "lerCurso",
    arguments: {
      courseId: COURSE_ID,
      view: "anchored_annotations",
      expectedRevision: 3,
      mode: "detail",
      annotationId,
      includeObservationText: true
    }
  }));
  const detail = (await detailResponse.json()).result;
  assert.equal(detail.structuredContent.data.items[0].rawText, rawText);
  assert.equal(detail.structuredContent.data.dataDisclosure.rawObservationTextIncluded, true);
  assert.match(detail.content[0].text, /texto integral solicitado/iu);
  assert.doesNotMatch(detail.content[0].text, /cliente MCP|payload|schema/iu);
  for (const protectedValue of [protectedRef, "Estudante FEED", COURSE_ID]) {
    assert.equal(JSON.stringify(detail).includes(protectedValue), false, protectedValue);
  }
});

test("MCP devolve recibo humano e mantém controles e link no estado estruturado", async () => {
  const deepLink = `https://app.example/#/authoring/courses/${COURSE_ID}?section=planning`;
  let call = null;
  const response = await handler({
    async advanceCourseAuthoringPartMaterialization(value) {
      call = value;
      return {
        contract: "aralearn.course-authoring-materialization-change.v1",
        courseId: COURSE_ID,
        courseRevision: 5,
        authoringPartId: PART_ID,
        operation: "finish",
        channel: "mcp",
        changed: true,
        idempotent: false,
        materialization: {
          id: MATERIALIZATION_ID,
          status: "completed",
          version: 7,
          authoringPartVersion: 4,
          completedStepCount: 5,
          failedStepCount: 0,
          totalStepCount: 5,
          nextPendingStep: null,
          updatedAt: "2026-08-20T12:00:00Z",
          completedAt: "2026-08-20T12:00:00Z",
          designContext: {},
          contextHash: "a".repeat(64)
        },
        step: null,
        entities: {
          createdCount: 0,
          updatedCount: 0,
          deletedCount: 0,
          linkedDidacticMicrosequenceId: null
        },
        deepLink
      };
    }
  })(request("tools/call", {
    name: "alterarCurso",
    arguments: {
      requestId: "request-materialization-finish",
      courseId: COURSE_ID,
      expectedRevision: 4,
      operation: "advance_part_materialization",
      materializationCommand: {
        operation: "finish",
        authoringPartId: PART_ID,
        materializationId: MATERIALIZATION_ID,
        expectedMaterializationVersion: 6,
        status: "completed",
        resultFacts: {
          producedStudyUnitCount: 3,
          warnings: [],
          observations: ["A produção foi conferida."]
        }
      }
    }
  }));
  const payload = await response.json();
  const text = payload.result.content[0].text;

  assert.equal(call.operation, "finish");
  assert.match(text, /materialização da Parte foi concluída/u);
  assert.equal(text.includes(PART_ID), false);
  assert.match(text, /5 de 5 concluídas; 0 com falha/u);
  assert.match(text, /criadas 0; alteradas 0; removidas 0/u);
  assert.equal(text.includes(deepLink), false);
  assert.equal(text.includes(MATERIALIZATION_ID), false);
  assert.equal(payload.result.structuredContent.data.deepLink, deepLink);
  assert.match(text, /Abrir a área alterada no AraLearn/u);
  assert.equal(Object.hasOwn(payload.result.structuredContent, "conversation"), false);
});

test("MCP entrega o mesmo DTO factual de comparação usado pela interface", async () => {
  const comparisonSetId = "81000000-0000-4000-8000-000000000008";
  const expected = courseVariantComparisonFixture({
    sourceCourseId: COURSE_ID,
    comparisonSetId,
    courseRevision: 7
  });
  expected.differences.accidentalDeviations.push({
    courseId: expected.members[1].courseId,
    referenceCourseId: expected.members[0].courseId,
    kind: "study_units",
    scopeKind: null,
    scopeId: null,
    key: "studyUnits",
    expectedValue: 0,
    actualValue: 1,
    explanation: "A variante B contém uma Unidade adicional."
  });
  let call = null;
  const response = await handler({
    async getCourseVariantComparison(value) {
      call = value;
      return expected;
    }
  })(request("tools/call", {
    name: "lerCurso",
    arguments: {
      courseId: COURSE_ID,
      view: "variant_comparison",
      comparisonSetId,
      expectedRevision: 7
    }
  }));
  const payload = await response.json();
  assert.deepEqual(payload.result.structuredContent.data, expected);
  const text = payload.result.content[0].text;
  assert.match(text, /comparação de variantes foi lida/iu);
  assert.match(text, /Referência: A/u);
  assert.match(text, /A: 1 Parte; 0 Unidades/u);
  assert.match(text, /B: 1 Parte; 0 Unidades/u);
  assert.match(text, /desvios acidentais 1/u);
  assert.match(text, /A variante B contém uma Unidade adicional/u);
  assert.doesNotMatch(text, /revisão|planVersion|courseRevision/iu);
  assert.doesNotMatch(text, /"comparisonSetId"|\{"contract"/u);
  assert.equal(call.comparisonSetId, comparisonSetId);
  assert.equal(call.expectedCourseRevision, 7);
});

test("MCP resume fatos de Pesquisa com pergunta e limites sem revisão técnica", async () => {
  let call = null;
  const deepLink = `https://app.example/#/authoring/courses/${COURSE_ID}?section=research`;
  const response = await handler({
    async getCourseAuthoringAnalytics(value) {
      call = value;
      return {
        contract: "aralearn.course-authoring-analytics.v1",
        courseRevision: 7,
        overview: {
          question: "Quais fatos de produção aparecem no recorte?",
          series: [{
            key: "completed",
            label: "Concluída",
            value: 2,
            unit: "count",
            denominator: 5,
            missing: false
          }]
        },
        facts: [],
        limitations: ["A contagem não mede aprendizagem."],
        missingData: [],
        deepLink
      };
    }
  })(request("tools/call", {
    name: "lerCurso",
    arguments: {
      courseId: COURSE_ID,
      view: "research",
      expectedRevision: 7,
      datasets: ["materializations"],
      limit: 20
    }
  }));
  const payload = await response.json();

  assert.equal(call.expectedCourseRevision, 7);
  assert.deepEqual(call.query.datasets, ["materializations"]);
  assert.match(payload.result.content[0].text, /fatos de pesquisa da Autoria/iu);
  assert.doesNotMatch(payload.result.content[0].text, /Revisão do Curso|courseRevision/iu);
  assert.match(
    payload.result.content[0].text,
    /Concluída: 2 \(unidade: contagem; denominador: 5\)/u
  );
  assert.match(payload.result.content[0].text, /não mede aprendizagem/u);
  assert.equal(payload.result.content[0].text.includes(deepLink), false);
  assert.equal(payload.result.structuredContent.data.deepLink, deepLink);
});

test("MCP avisa quando a síntese textual de Pesquisa limita as categorias", async () => {
  const series = Array.from({ length: 13 }, (_, index) => ({
    key: `category_${index + 1}`,
    label: `Categoria ${index + 1}`,
    value: index + 1,
    unit: "count",
    denominator: 91,
    missing: false
  }));
  const response = await handler({
    async getCourseAuthoringAnalytics() {
      return {
        contract: "aralearn.course-authoring-analytics.v1",
        courseRevision: 7,
        overview: { question: "Quais categorias aparecem?", series },
        facts: [], limitations: [], missingData: [], deepLink: null
      };
    }
  })(request("tools/call", {
    name: "lerCurso",
    arguments: { courseId: COURSE_ID, view: "research", expectedRevision: 7 }
  }));
  const text = (await response.json()).result.content[0].text;
  assert.match(text, /12 de 13 categorias/u);
  assert.match(text, /demais categorias continuam disponíveis/u);
  assert.doesNotMatch(text, /Categoria 13:/u);
});

test("MCP entrega prévia textual e oferece o link como ação estruturada", async () => {
  const studyUnit = await minimalStudyUnit();
  const response = await handler({
    publicAppUrl: "https://fabio-ara.github.io/AraLearn"
  })(request("tools/call", {
    name: "consultarComponentesDidaticos",
    arguments: {
      operation: "preview_study_unit",
      courseId: COURSE_ID,
      studyUnitId: studyUnit.id,
      studyUnitJson: JSON.stringify(studyUnit)
    }
  }));
  const payload = await response.json();
  const preview = payload.result.structuredContent.data.result;

  assert.equal(preview.studyUnit.id, studyUnit.id);
  assert.equal(preview.previewMode, "client_renderer");
  assert.match(preview.accessibleText, /A conjunção só é verdadeira/u);
  assert.equal(
    preview.deepLink,
    `https://fabio-ara.github.io/AraLearn/#/authoring/courses/${COURSE_ID}` +
      `?section=content&studyUnitId=${studyUnit.id}`
  );
  assert.match(payload.result.content[0].text, /A conjunção só é verdadeira/u);
  assert.equal(payload.result.content[0].text.includes(preview.deepLink), false);
  assert.match(payload.result.content[0].text, /Abrir a prévia no AraLearn/u);
  assert.equal(Object.hasOwn(payload.result.structuredContent, "conversation"), false);
  assert.doesNotMatch(JSON.stringify(payload), /"rendered":false/u);
});

test("MCP resume operações não visuais da biblioteca sem despejar JSON", async () => {
  const response = await handler()(request("tools/call", {
    name: "consultarComponentesDidaticos",
    arguments: {
      operation: "search",
      query: "diagrama de conjuntos"
    }
  }));
  const payload = await response.json();
  const text = payload.result.content[0].text;

  assert.equal(payload.result.structuredContent.data.operation, "search");
  assert.match(text, /biblioteca de componentes didáticos foi consultada/iu);
  assert.match(text, /Operação: Busca de componentes/u);
  assert.match(text, /Candidatos:/u);
  assert.doesNotMatch(text, /Catálogo:|catalogVersion/iu);
  assert.doesNotMatch(text, /"candidates"|\{"contract"/u);
});

test("MCP interrompe envelope acima de 1 MiB antes de despachar ferramenta", async () => {
  let authenticationCalls = 0;
  const response = await handler({
    async resolvePrincipal() {
      authenticationCalls += 1;
      return {
        actorId: COURSE_ID,
        oauthClientId: "client",
        authenticationKind: "oauth",
        scopes: ["authoring:read", "authoring:write"]
      };
    },
    async getCourse() {
      assert.fail("Envelope excedente não pode alcançar a ferramenta.");
    }
  })(request("tools/call", {
    name: "lerCurso",
    arguments: {
      courseId: COURSE_ID,
      padding: "x".repeat(1024 * 1024)
    }
  }));
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(authenticationCalls, 1);
  assert.equal(payload.error.data.code, "mcp_message_too_large");
});

test("MCP não induz repetição quando a resposta estoura após criar o Curso", async () => {
  let writes = 0;
  const response = await handler({
    async createCourse({ title }) {
      writes += 1;
      return {
        contract: "aralearn.course.v1",
        courseId: COURSE_ID,
        title,
        revision: 1,
        deepLink: `https://example.test/#/authoring/courses/${COURSE_ID}`,
        padding: "x".repeat(2 * 1024 * 1024 - 350)
      };
    }
  })(request("tools/call", {
    name: "criarCurso",
    arguments: {
      requestId: "mcp-large-created-course-0001",
      title: "Curso já gravado",
      objective: "Provar a certeza de escrita após o limite da resposta."
    }
  }));
  const payload = await response.json();
  const result = payload.result;

  assert.equal(writes, 1);
  assert.equal(response.status, 200);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.requestId, "mcp-large-created-course-0001");
  assert.equal(result.structuredContent.error.code, "mcp_response_too_large");
  assert.equal(result.structuredContent.error.recovery.strategy, "verify_state");
  assert.equal(result.structuredContent.error.recovery.retryable, false);
  assert.match(result.content[0].text, /gravação foi concluída/iu);
  assert.doesNotMatch(result.content[0].text, /Nada foi salvo|reduza a página/iu);
  assert.equal(Object.hasOwn(result.structuredContent, "conversation"), false);
});

test("MCP torna recuperável o conflito de versão do Curso sem instruções substituídas", async () => {
  const response = await handler({
    async commitCourseInstructionalPlan() {
      throw new AuthoringApiError(
        409,
        "stale_course_state",
        "A versão de estado do Curso mudou."
      );
    }
  })(request("tools/call", {
    name: "alterarCurso",
    arguments: {
      requestId: " request-course-stale-0002 ",
      courseId: COURSE_ID,
      expectedRevision: 3,
      expectedPlanVersion: 2,
      operation: "update_instructional_plan",
      planCommand: { type: "update_plan", objective: "Objetivo atualizado" }
    }
  }));
  const payload = await response.json();
  const result = payload.result;

  assert.equal(response.status, 200);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.requestId, "request-course-stale-0002");
  assert.equal(result.structuredContent.error.code, "stale_course_state");
  assert.equal(result.structuredContent.error.recovery.strategy, "reread_and_retry");
  assert.equal(result.structuredContent.error.recovery.requestIdMode, "new");
  assert.match(result.content[0].text, /Nada foi sobrescrito/u);
  assert.doesNotMatch(result.content[0].text, /stale_course_state|requestId|revisão \d/iu);
  assert.equal(Object.hasOwn(result.structuredContent, "conversation"), false);
  assert.doesNotMatch(JSON.stringify(result), /workspace|trilha|salvarCards/iu);
});

test("MCP mantém a URL assinada somente no campo estruturado autorizado", async () => {
  const contentHash = "a".repeat(64);
  const storagePath = `${COURSE_ID}/${contentHash}.pdf`;
  const signedUrl =
    "https://storage.example.test/object/source.pdf?token=temporary-download-secret";
  let calls = 0;
  const adapter = {
    async getCourseSourceAttachmentAccess() {
      calls += 1;
      return {
        contract: "aralearn.course-source-attachment-access.v1",
        courseId: COURSE_ID,
        courseRevision: 4,
        operation: "download",
        sourceId: "source-pdf",
        sourceRevision: 2,
        storageOriginCourseId: COURSE_ID,
        attachment: {
          contentHash,
          byteSize: 1_024,
          mediaType: "application/pdf",
          storagePath
        },
        uploadRequired: false,
        alreadyLinked: true,
        signedUrl,
        expiresAt: "2026-08-21T12:01:00Z"
      };
    }
  };
  const argumentsWithoutDisclosure = {
    courseId: COURSE_ID,
    view: "course_source_attachment",
    expectedRevision: 4,
    attachmentOperation: "download",
    sourceId: "source-pdf",
    sourceRevision: 2,
    contentHash
  };

  const deniedResponse = await handler(adapter)(request("tools/call", {
    name: "lerCurso",
    arguments: argumentsWithoutDisclosure
  }));
  const denied = (await deniedResponse.json()).result;
  assert.equal(denied.isError, true);
  assert.equal(
    denied.structuredContent.error.code,
    "attachment_download_url_disclosure_required"
  );
  assert.equal(calls, 0);
  assert.equal(JSON.stringify(denied).includes(signedUrl), false);

  const allowedResponse = await handler(adapter)(request("tools/call", {
    name: "lerCurso",
    arguments: {
      ...argumentsWithoutDisclosure,
      includeAttachmentDownloadUrl: true
    }
  }));
  const allowed = (await allowedResponse.json()).result;
  const data = allowed.structuredContent.data;
  assert.equal(calls, 1);
  assert.equal(data.signedUrl, signedUrl);
  assert.equal(data.dataDisclosure.attachmentDownloadUrlIncluded, true);
  assert.equal(data.dataDisclosure.attachmentDownloadUrlExpiresInSeconds, 60);
  assert.equal(allowed.content[0].text.includes(signedUrl), false);
  assert.equal(allowed.content[0].text.includes("temporary-download-secret"), false);
  assert.equal(JSON.stringify(data).includes(storagePath), false);
  assert.equal(Object.hasOwn(data, "storageOriginCourseId"), false);
});

test("MCP não reflete token, e-mail, Authorization ou payload bruto em erros", async () => {
  const sentinels = [
    "known.person@example.test",
    "Bearer token-that-must-not-leak",
    "Authorization: Bearer token-that-must-not-leak",
    "raw personal payload from an observation"
  ];
  const response = await handler({
    async getCourse() {
      throw new AuthoringApiError(
        422,
        "invalid_course_contract",
        "O Curso não corresponde ao contrato.",
        {
          field: "course",
          value: sentinels[0],
          reason: sentinels[1],
          Authorization: sentinels[2],
          rawPayload: sentinels[3]
        }
      );
    }
  })(request("tools/call", {
    name: "lerCurso",
    arguments: { courseId: COURSE_ID }
  }));
  const payload = await response.json();
  const serialized = JSON.stringify(payload);

  assert.equal(payload.result.isError, true);
  assert.equal(payload.result.structuredContent.error.code, "invalid_course_contract");
  for (const sentinel of sentinels) assert.equal(serialized.includes(sentinel), false, sentinel);

  const invalidParams = await handler()(request("tools/list", {
    Authorization: sentinels[1]
  }));
  assert.equal(JSON.stringify(await invalidParams.json()).includes("Authorization"), false);
  const invalidMethod = await handler()(request(sentinels[0]));
  assert.equal(JSON.stringify(await invalidMethod.json()).includes(sentinels[0]), false);

  const hostileField = sentinels[0];
  const unknownArgument = await handler()(request("tools/call", {
    name: "lerCurso",
    arguments: { courseId: COURSE_ID, [hostileField]: "valor" }
  }));
  const unknownPayload = await unknownArgument.json();
  const unknownResult = unknownPayload.result;
  assert.equal(unknownResult.isError, true);
  assert.equal(unknownResult.structuredContent.error.message,
    "O comando contém um campo não reconhecido.");
  assert.match(unknownResult.content[0].text, /operação de autoria não foi concluída/iu);
  assert.doesNotMatch(unknownResult.content[0].text, /unknown_tool_argument|requestId/iu);
  assert.equal(Object.hasOwn(unknownResult.structuredContent, "conversation"), false);
  assert.equal(JSON.stringify(unknownPayload).includes(hostileField), false);

  const hostileRequestId = sentinels[1];
  const invalidRequestId = await handler()(request("tools/call", {
    name: "criarCurso",
    arguments: {
      requestId: hostileRequestId,
      title: "Curso seguro",
      objective: "Não refletir entrada hostil."
    }
  }));
  const invalidRequestIdPayload = await invalidRequestId.json();
  const invalidRequestIdResult = invalidRequestIdPayload.result;
  assert.equal(invalidRequestIdResult.isError, true);
  assert.equal(invalidRequestIdResult.structuredContent.requestId, null);
  assert.equal(invalidRequestIdResult.structuredContent.error.code, "invalid_tool_argument");
  assert.equal(invalidRequestIdResult.structuredContent.error.recovery.requestIdMode, "none");
  assert.equal(JSON.stringify(invalidRequestIdPayload).includes(hostileRequestId), false);
});
