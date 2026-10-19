import assert from "node:assert/strict";
import test from "node:test";

import { courseDesignFixture } from "../helpers/courseDesignFixture.js";
import { encodeCourseActionTaskRequest } from
  "../../supabase/functions/_shared/aralearn-authoring/courseActionBindings.js";
import { createAuthoringActionHandler } from
  "../../supabase/functions/_shared/aralearn-authoring/courseActionServer.js";
import { executeHumanCourseTask } from
  "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";

const ORIGIN = "https://client.example";
const MCP_URL = "https://edge.example/functions/v1/aralearn-authoring-mcp";
const ACTION_URL = "https://edge.example/functions/v1/aralearn-authoring-action";
const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const ACTOR_ID = "20000000-0000-4000-8000-000000000001";
const ANALYSIS_ID = "30000000-0000-4000-8000-000000000001";
const MODULE_ID = "module-a";
const LESSON_ID = "lesson-a";
const MICRO_ID = "micro-a";
const UNIT_ID = "unit-a";
const TITLE = "Redes para iniciantes";
const PRINCIPAL = Object.freeze({ actorId: ACTOR_ID, authenticationKind: "oauth",
  scopes: Object.freeze(["authoring:read", "authoring:write"]) });

function planRead() {
  return {
    courseId: COURSE_ID,
    courseRevision: 7,
    plan: {
      id: "40000000-0000-4000-8000-000000000001",
      version: 3,
      title: TITLE,
      objective: "Explicar serviços em rede.",
      curriculumScopeItems: [],
      curriculum: { modules: [{
        id: MODULE_ID, position: 0, title: "Fundamentos",
        lessons: [{ id: LESSON_ID, position: 0, title: "Relações",
          microsequences: [{ id: MICRO_ID, position: 0, title: "Sockets" }] }]
      }] },
      instructionalAnalysisUnits: [{
        id: ANALYSIS_ID, position: 0, version: 1,
        statement: "Socket relaciona processo e comunicação.", description: ""
      }],
      evidenceRequirements: [],
      parts: []
    }
  };
}

function adapterFixture(application, { designApplication, designSnapshot } = {}) {
  const reads = [];
  return {
    publicAppUrl: "https://app.example/",
    supabaseUrl: "https://project.example",
    reads,
    async resolvePrincipal() { return PRINCIPAL; },
    async resolveActionPrincipal() { return PRINCIPAL; },
    async listCourses() {
      return { items: [{ courseId: COURSE_ID, title: TITLE }], hasMore: false, nextCursor: null };
    },
    async getCourse({ courseId }) {
      return { courseId, title: TITLE, revision: 7 };
    },
    async getCourseInstructionalPlan() {
      reads.push("plan");
      return structuredClone(planRead());
    },
    async listCourseStudyUnits() {
      reads.push("units");
      return {
        items: [{
          ordinal: 1,
          version: 2,
          studyUnit: { id: UNIT_ID, title: "Unidade 6" },
          authorship: { design: { application } },
          ...(designApplication === undefined ? {} : { designApplication: structuredClone(designApplication) }),
          ...(designSnapshot === undefined ? {} : { designSnapshot: structuredClone(designSnapshot) })
        }],
        hasMore: false,
        nextCursor: null
      };
    },
    async getCourseDesign({ scopeKind }) {
      reads.push("design");
      return courseDesignFixture({
        courseId: COURSE_ID, moduleId: MODULE_ID, lessonId: LESSON_ID,
        microsequenceId: MICRO_ID, studyUnitId: UNIT_ID
      }, { scope: scopeKind, revision: 7 });
    }
  };
}

function mcpHandler(adapter) {
  return createAuthoringMcpHandler({ adapter, allowedOrigins: new Set([ORIGIN]),
    resourceUrl: MCP_URL, authorizationServer: "https://project.example/auth/v1" });
}

function actionHandler(adapter) {
  return createAuthoringActionHandler({ adapter, allowedOrigins: new Set([ORIGIN]),
    actionBaseUrl: ACTION_URL, publicAppUrl: adapter.publicAppUrl });
}

function mcpRequest(args, name = "consultar_repertorio_instrucional") {
  return new Request(MCP_URL, {
    method: "POST",
    headers: {
      Origin: ORIGIN, Authorization: "Bearer synthetic",
      Accept: "application/json, text/event-stream", "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {
      name, arguments: args
    } })
  });
}

function actionRequest(args) {
  const binding = encodeCourseActionTaskRequest("consultar_repertorio_instrucional", args);
  return new Request(`${ACTION_URL}/${binding.operationName}`, {
    method: "POST",
    headers: { Origin: ORIGIN, Authorization: "Bearer synthetic",
      "Content-Type": "application/json" },
    body: JSON.stringify(binding.arguments)
  });
}

async function throughMcp(adapter, args, name = "consultar_repertorio_instrucional") {
  const response = await mcpHandler(adapter)(mcpRequest(args, name));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.notEqual(body.result?.isError, true, JSON.stringify(body));
  return body.result.structuredContent;
}

async function throughAction(adapter, args) {
  const response = await actionHandler(adapter)(actionRequest(args));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

test("estado de desenho da unidade não é confundido com recibo em executor, MCP e Actions", async () => {
  const applications = [null, {
    mode: "expository",
    componentRefs: ["aralearn.resource.paragraph@1.0.0"],
    analysisIdeas: { introduced: [{ name: "Socket", description: "Relação preservada." }],
      used: [], revisited: [] }
  }];
  for (const application of applications) {
    const args = { curso: TITLE, microssequencia: "Sockets", unidade: 1 };
    const channels = [
      ["executor", adapter => executeHumanCourseTask({ adapter, principal: PRINCIPAL,
        name: "consultar_repertorio_instrucional", rawArguments: args })],
      ["mcp", adapter => throughMcp(adapter, args)],
      ["actions", adapter => throughAction(adapter, args)]
    ];
    for (const [channel, execute] of channels) {
      const adapter = adapterFixture(structuredClone(application));
      const output = await execute(adapter);
      assert.deepEqual(output.context.configuracaoAplicadaNaUnidade,
        { application: structuredClone(application) }, channel);
      assert.equal(Object.hasOwn(output.context, "configuracaoAplicada"), false, channel);
      assert.deepEqual(output.context.aplicacao, structuredClone(application), channel);
      assert.deepEqual(adapter.reads, ["plan", "units", "design"], channel);
    }
  }
});

test("curso e escopo sem unidade continuam preservados", async () => {
  for (const args of [{ curso: TITLE }, { curso: TITLE, modulo: 1 }]) {
    const adapter = adapterFixture(null);
    const output = await executeHumanCourseTask({ adapter, principal: PRINCIPAL,
      name: "consultar_repertorio_instrucional", rawArguments: args });
    assert.equal(output.context.configuracaoAplicadaNaUnidade, null);
    assert.equal(output.context.aplicacao, null);
    assert.equal(Object.hasOwn(output.context, "configuracaoAplicada"), false);
    assert.equal(adapter.reads.includes("units"), false);
  }
});

test("readback focal expõe oportunidades aplicadas sem expor referências internas", async () => {
  const application = {
    mode: "practice",
    practiceApplications: [
      { evidenceRequirementId: "40000000-0000-4000-8000-000000000001",
        opportunityId: "Identificar FTTB pelo ponto em que a fibra termina e reconhecer que o cenário não informa arquitetura óptica nem taxa.",
        invariantTaskOperation: "Classificar alcance e ponto de chegada da fibra",
        variedDimensions: [] },
      { evidenceRequirementId: "40000000-0000-4000-8000-000000000001",
        opportunityId: "Associar WPAN, WMAN e WWAN aos alcances pessoal, metropolitano e geograficamente amplo, mantendo separados o meio sem fio e o alcance.",
        invariantTaskOperation: "Classificar alcance e ponto de chegada da fibra",
        variedDimensions: [] }
    ]
  };
  const adapter = adapterFixture(application);
  adapter.getCourseInstructionalPlan = async () => {
    adapter.reads.push("plan");
    const read = planRead();
    read.plan.evidenceRequirements = [{ id: "40000000-0000-4000-8000-000000000001", position: 0,
      version: 1, statement: "Classificar alcance e ponto de chegada da fibra",
      description: "Relacionar siglas de alcance ao critério e identificar FTTx pelas fronteiras do cenário." }];
    return read;
  };
  const args = { curso: TITLE, microssequencia: "Sockets", unidade: 1 };
  const output = await throughMcp(adapter, args);
  const practices = output.context.aplicacao.practiceApplications;
  assert.deepEqual(practices.map(({ oportunidade }) => oportunidade), application.practiceApplications.map(({ opportunityId }) => opportunityId));
  assert.deepEqual(practices.map(({ invariantTaskOperation }) => invariantTaskOperation),
    ["Classificar alcance e ponto de chegada da fibra", "Classificar alcance e ponto de chegada da fibra"]);
  assert.deepEqual(practices.map(({ variedDimensions }) => variedDimensions), [[], []]);
  assert.notEqual(practices[0].oportunidade, output.context.evidencias[0].descricao);
  assert.ok(practices.every(item => !Object.hasOwn(item, "opportunityId") &&
    !Object.hasOwn(item, "evidenceRequirementId")));
  assert.equal(output.context.aplicacao.mode, "practice");
  const configuration = await executeHumanCourseTask({ adapter: adapterFixture(application), principal: PRINCIPAL,
    name: "consultar_configuracao", rawArguments: args });
  assert.deepEqual(configuration.context.aplicacaoNaUnidade.practiceApplications.map(item => item.oportunidade),
    application.practiceApplications.map(({ opportunityId }) => opportunityId));
  assert.ok(configuration.context.aplicacaoNaUnidade.practiceApplications.every(item =>
    !Object.hasOwn(item, "opportunityId") && !Object.hasOwn(item, "evidenceRequirementId")));
  assert.equal(adapter.reads.filter(read => read === "plan").length, 1);
  assert.equal(adapter.reads.includes("units"), true);
});

test("snapshot authoring real preserva repertório e configuração enquanto usa aplicação canônica nas duas consultas", async () => {
  const evidenceRequirementId = "40000000-0000-4000-8000-000000000001";
  const legacySnapshot = {
    mode: "practice",
    analysisIdeas: { introduced: [], used: [{ name: "Socket", description: "Interface entre processo e transporte." }], revisited: [] },
    componentRefs: ["aralearn.resource.paragraph@1.0.0", "aralearn.response.ordering@3.0.0"],
    explanationApplications: [{ developedForms: ["mechanism"], notApplicable: [{ form: "plain_definition", reason: "A unidade pratica um mecanismo." }] }],
    practiceEvidence: [{ name: "Distinguir processo, socket e conexão TCP.", description: "Aplicar a distinção a cenários TCP sintéticos distintos." }]
  };
  const canonicalApplication = {
    mode: "practice",
    introducedInstructionalAnalysisUnitIds: [ANALYSIS_ID],
    usedInstructionalAnalysisUnitIds: [ANALYSIS_ID],
    curriculumScopeItemIds: [],
    componentRefs: [...legacySnapshot.componentRefs],
    explanationApplications: [{ instructionalAnalysisUnitId: ANALYSIS_ID, developedForms: ["mechanism"],
      notApplicable: [{ form: "plain_definition", reason: "A unidade pratica um mecanismo." }] }],
    practiceApplications: [
      { evidenceRequirementId, opportunityId: "Identificar o socket do navegador no caso Alfa.",
        invariantTaskOperation: "Distinguir processo, socket e conexão TCP.", variedDimensions: ["case_or_data"] },
      { evidenceRequirementId, opportunityId: "Identificar o socket do servidor no caso Beta.",
        invariantTaskOperation: "Distinguir processo, socket e conexão TCP.", variedDimensions: ["case_or_data"] }
    ]
  };
  const designSnapshot = { appliedAt: "2026-10-19T00:00:00.000Z", parameters: [
    { parameterId: "practice_position", value: "before_and_after", origin: "research_condition",
      reason: "Fixação editorial preservada.", sourceScopeKind: "course" }
  ] };
  const adapter = adapterFixture(legacySnapshot, { designApplication: canonicalApplication, designSnapshot });
  const args = { curso: TITLE, microssequencia: "Sockets", unidade: 1 };
  const expectedPractices = canonicalApplication.practiceApplications.map(item => ({
    oportunidade: item.opportunityId,
    invariantTaskOperation: item.invariantTaskOperation,
    variedDimensions: item.variedDimensions
  }));

  const repertoire = await throughMcp(adapter, args);
  const repertoireApplication = repertoire.context.aplicacao;
  assert.deepEqual(repertoireApplication.practiceApplications, expectedPractices);
  assert.deepEqual(repertoireApplication.practiceEvidence, legacySnapshot.practiceEvidence);
  assert.deepEqual(repertoireApplication.analysisIdeas, legacySnapshot.analysisIdeas);
  assert.deepEqual(repertoireApplication.explanationApplications, legacySnapshot.explanationApplications);
  assert.deepEqual(repertoireApplication.componentRefs, legacySnapshot.componentRefs);
  assert.equal(repertoireApplication.mode, legacySnapshot.mode);
  assert.deepEqual(repertoire.context.configuracaoAplicadaNaUnidade.application.practiceApplications, expectedPractices);
  assert.deepEqual(repertoire.context.configuracaoAplicadaNaUnidade.application.practiceEvidence,
    legacySnapshot.practiceEvidence);
  assert.doesNotMatch(JSON.stringify(repertoire.context), /opportunityId|evidenceRequirementId|instructionalAnalysisUnitIds/u);

  const configuration = await throughMcp(adapter, args, "consultar_configuracao");
  assert.deepEqual(configuration.context.aplicacaoNaUnidade.practiceApplications, expectedPractices);
  assert.deepEqual(configuration.context.aplicacaoNaUnidade.practiceEvidence, legacySnapshot.practiceEvidence);
  assert.deepEqual(configuration.context.aplicacaoNaUnidade.analysisIdeas, legacySnapshot.analysisIdeas);
  assert.deepEqual(configuration.context.aplicacaoNaUnidade.explanationApplications,
    legacySnapshot.explanationApplications);
  assert.deepEqual(configuration.context.aplicacaoNaUnidade.componentRefs, legacySnapshot.componentRefs);
  assert.equal(configuration.context.aplicacaoNaUnidade.mode, legacySnapshot.mode);
  assert.deepEqual(configuration.context.configuracaoAplicadaNaUnidade.parametros.find(item =>
    item.campo === "posicao_da_pratica")?.valor, "before_and_after");
  assert.doesNotMatch(JSON.stringify(configuration.context), /opportunityId|evidenceRequirementId|instructionalAnalysisUnitIds/u);
});

test("recibo de recuperação incompleto permanece falha fechada", async () => {
  const adapter = adapterFixture(null);
  adapter.getCourseDesignRecoveryReceipt = async () => ({
    status: "confirmed",
    result: {
      courseId: COURSE_ID,
      requestId: "request-design-invalid-1",
      courseRevision: 0,
      idempotent: true,
      changed: true,
      changes: []
    }
  });
  await assert.rejects(() => executeHumanCourseTask({ adapter, principal: PRINCIPAL,
    name: "ajustar_configuracao", rawArguments: { recuperacao: {
      courseId: COURSE_ID,
      requestId: "request-design-invalid-1",
      operation: "apply_course_design_command_batch_v3"
    } } }), error => error.status === 503 &&
      error.code === "course_service_unavailable" &&
      /resultado de recuperação/u.test(error.message));
});
