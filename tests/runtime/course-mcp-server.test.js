import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
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
  assert.match(initialized.result.instructions, /Curso vivo e mutável/iu);
  assert.match(initialized.result.instructions, /não os fixe no prompt/iu);

  const listed = await handler()(request("tools/list"));
  const names = (await listed.json()).result.tools.map(({ name }) => name);
  assert.deepEqual(names, [
    "listarCursos",
    "lerCurso",
    "criarCurso",
    "alterarCurso",
    "gerirPessoas",
    "consultarComponentesDidaticos"
  ]);
  assert.equal(names.some((name) => /workspace|trilha|cole(?:ç|c)[aã]o/iu.test(name)), false);
});

test("MCP publica conhecimento e componente opcional e lê o plano pela rota compartilhada", async () => {
  const resourcesResponse = await handler()(request("resources/list"));
  const resources = (await resourcesResponse.json()).result.resources;
  assert.deepEqual(resources.map(({ uri }) => uri), [
    "aralearn://authoring/invariants",
    "ui://aralearn/course-inspector/0.0.23.html"
  ]);
  const componentResponse = await handler()(request("resources/read", {
    uri: "ui://aralearn/course-inspector/0.0.23.html"
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
  assert.match(payload.result.content[0].text, /Revisão do Curso: 2\./u);
  assert.match(payload.result.content[0].text, /0 registros de atividade recente/u);
  assert.doesNotMatch(payload.result.content[0].text, /structuredContent/u);
  assert.equal(payload.result.content[0].text.includes(COURSE_ID), false);
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
  assert.match(payload.result.content[0].text, new RegExp(`Parte: ${PART_ID}`, "u"));
  assert.match(payload.result.content[0].text, /Uma Fonte ainda precisa de revisão/u);
  assert.match(payload.result.content[0].text, /primeira Microssequência foi preservada/u);
});

test("MCP devolve recibo legível da conclusão com contagens e link", async () => {
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
  assert.match(text, new RegExp(`Parte: ${PART_ID}`, "u"));
  assert.match(text, /5 de 5 concluídas; 0 com falha/u);
  assert.match(text, /criadas 0; alteradas 0; removidas 0/u);
  assert.match(text, /Abrir no AraLearn:/u);
  assert.equal(text.includes(MATERIALIZATION_ID), false);
  assert.equal(payload.result.structuredContent.data.deepLink, deepLink);
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
  assert.match(text, /Planejamento comum: revisão 7; versão 2/u);
  assert.match(text, /Referência: A, revisão 1/u);
  assert.match(text, /A: revisão 1; 1 Parte; 0 Unidades/u);
  assert.match(text, /B: revisão 1; 1 Parte; 0 Unidades/u);
  assert.match(text, /desvios acidentais 1/u);
  assert.match(text, /A variante B contém uma Unidade adicional/u);
  assert.doesNotMatch(text, /"comparisonSetId"|\{"contract"/u);
  assert.equal(call.comparisonSetId, comparisonSetId);
  assert.equal(call.expectedCourseRevision, 7);
});

test("MCP resume fatos de Pesquisa com pergunta, revisão e limites", async () => {
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
  assert.match(payload.result.content[0].text, /Revisão do Curso: 7/u);
  assert.match(
    payload.result.content[0].text,
    /Concluída: 2 \(unidade: contagem; denominador: 5\)/u
  );
  assert.match(payload.result.content[0].text, /não mede aprendizagem/u);
  assert.match(payload.result.content[0].text, /Abrir no AraLearn:/u);
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
  assert.match(text, /conteúdo estruturado conserva o recorte completo/u);
  assert.doesNotMatch(text, /Categoria 13:/u);
});

test("MCP entrega prévia textual e link exato para a Unidade persistida", async () => {
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
      `?section=inspection&studyUnitId=${studyUnit.id}`
  );
  assert.match(payload.result.content[0].text, /A conjunção só é verdadeira/u);
  assert.match(payload.result.content[0].text, /Abrir no AraLearn:/u);
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
  assert.match(text, /Catálogo:/u);
  assert.match(text, /Candidatos:/u);
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
      requestId: "request-course-stale-0002",
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
  assert.equal(result.structuredContent.error.code, "stale_course_state");
  assert.equal(result.structuredContent.error.recovery.strategy, "reread_and_retry");
  assert.equal(result.structuredContent.error.recovery.requestIdMode, "new");
  assert.doesNotMatch(JSON.stringify(result), /workspace|trilha|salvarCards/iu);
});
