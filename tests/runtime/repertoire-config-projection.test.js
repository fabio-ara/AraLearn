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

function adapterFixture(application) {
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
          authorship: { design: { application } }
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

function mcpRequest(args) {
  return new Request(MCP_URL, {
    method: "POST",
    headers: {
      Origin: ORIGIN, Authorization: "Bearer synthetic",
      Accept: "application/json, text/event-stream", "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {
      name: "consultar_repertorio_instrucional", arguments: args
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

async function throughMcp(adapter, args) {
  const response = await mcpHandler(adapter)(mcpRequest(args));
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
