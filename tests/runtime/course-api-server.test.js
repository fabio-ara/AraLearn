import test from "node:test";
import assert from "node:assert/strict";

import { createCourseApiHandler } from "../../supabase/functions/_shared/aralearn-authoring/courseApiServer.js";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";

const ORIGIN = "https://app.example";
const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PART_ID = "20000000-0000-4000-8000-000000000002";
const MATERIALIZATION_ID = "30000000-0000-4000-8000-000000000003";

function request(path, { method = "POST", body = {}, token = "session" } = {}) {
  return new Request(`https://edge.example/functions/v1/aralearn-course-api${path}`, {
    method,
    headers: {
      Origin: ORIGIN,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {})
  });
}

test("expõe leitura autenticada do plano instrucional no aplicativo", async () => {
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal(token) {
        assert.equal(token, "session");
        return { actorId: COURSE_ID, scopes: ["authoring:write"] };
      },
      async getCourseInstructionalPlan({ courseId }) {
        return {
          contract: "aralearn.course-instructional-plan.v1",
          courseId,
          courseRevision: 1,
          plan: { version: 1, parts: [] },
          recentActivity: []
        };
      }
    }
  });
  const response = await handler(request("/app/lerCurso", {
    body: { courseId: COURSE_ID, view: "instructional_plan" }
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(payload.data.courseId, COURSE_ID);
  assert.equal(payload.data.plan.version, 1);
});

test("expõe a mesma leitura retomável da materialização ao aplicativo", async () => {
  let call = null;
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        return { actorId: COURSE_ID, scopes: ["authoring:read"] };
      },
      async getCourseAuthoringPartMaterialization(value) {
        call = value;
        return {
          contract: "aralearn.course-authoring-part-materialization.v1",
          courseId: COURSE_ID,
          courseRevision: 2,
          authoringPartId: PART_ID,
          materialization: { id: MATERIALIZATION_ID, steps: [] }
        };
      }
    }
  });
  const response = await handler(request("/app/lerCurso", {
    body: {
      courseId: COURSE_ID,
      view: "part_materialization",
      authoringPartId: PART_ID,
      materializationId: MATERIALIZATION_ID
    }
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.materialization.id, MATERIALIZATION_ID);
  assert.equal(call.courseId, COURSE_ID);
  assert.equal(call.authoringPartId, PART_ID);
  assert.equal(call.materializationId, MATERIALIZATION_ID);
});

test("não conserva endpoints OAuth ou de Workspace", async () => {
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {}
  });
  const oauth = await handler(request("/oauth/token"));
  const workspace = await handler(request("/app/listarWorkspacesDeAutoria"));

  assert.equal(oauth.status, 404);
  assert.equal(workspace.status, 404);
});

test("rejeita origem não autorizada antes de executar", async () => {
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {}
  });
  const value = request("/app/lerCurso", { body: { courseId: COURSE_ID } });
  value.headers.set("Origin", "https://evil.example");
  const response = await handler(value);
  assert.equal(response.status, 403);
});

test("autentica antes de ler o corpo e interrompe payload acima de 512 KiB", async () => {
  let authenticationCalls = 0;
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        authenticationCalls += 1;
        return { actorId: COURSE_ID, scopes: ["authoring:write"] };
      },
      async commitCourseInstructionalPlan() {
        assert.fail("Um payload excedente não pode alcançar a operação.");
      }
    }
  });
  const unauthenticated = request("/app/alterarCurso", {
    body: { padding: "x".repeat(513 * 1024) },
    token: ""
  });
  unauthenticated.headers.delete("Authorization");
  const unauthorizedResponse = await handler(unauthenticated);
  assert.equal(unauthorizedResponse.status, 401);
  assert.equal(authenticationCalls, 0);

  const oversized = request("/app/alterarCurso", {
    body: { padding: "x".repeat(513 * 1024) }
  });
  oversized.headers.delete("content-length");
  const oversizedResponse = await handler(oversized);
  assert.equal(oversizedResponse.status, 413);
  assert.equal(authenticationCalls, 1);
});

test("preserva o envelope CAS do plano até o adaptador", async () => {
  let call = null;
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        return { actorId: COURSE_ID, scopes: ["authoring:write"] };
      },
      async commitCourseInstructionalPlan(value) {
        call = value;
        return {
          contract: "aralearn.course-instructional-plan-change.v1",
          courseId: COURSE_ID,
          courseRevision: 6,
          planId: "20000000-0000-4000-8000-000000000002",
          planVersion: 4
        };
      }
    }
  });
  const response = await handler(request("/app/alterarCurso", {
    body: {
      requestId: "request-course-plan-0001",
      courseId: COURSE_ID,
      expectedRevision: 5,
      expectedPlanVersion: 3,
      operation: "update_instructional_plan",
      planCommand: { type: "update_plan", audience: "Docentes" }
    }
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.planVersion, 4);
  assert.equal(call.expectedCourseRevision, 5);
  assert.equal(call.expectedPlanVersion, 3);
  assert.deepEqual(call.command, { type: "update_plan", audience: "Docentes" });
});

test("aplicativo usa a mesma leitura e mudança de parâmetros do MCP", async () => {
  const calls = [];
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        return { actorId: COURSE_ID, scopes: ["authoring:write"] };
      },
      async getCourseDesign(value) {
        calls.push(["read", value]);
        return { contract: "aralearn.course-design.v1", courseId: COURSE_ID };
      },
      async applyCourseDesignCommand(value) {
        calls.push(["write", value]);
        return { contract: "aralearn.course-design-change.v1", changed: true };
      }
    }
  });
  const readResponse = await handler(request("/app/lerCurso", {
    body: {
      courseId: COURSE_ID,
      view: "course_design",
      scope: { kind: "course", ref: COURSE_ID },
      limit: 16,
      cursor: null
    }
  }));
  assert.equal(readResponse.status, 200);

  const writeResponse = await handler(request("/app/alterarCurso", {
    body: {
      requestId: "request-course-design-0001",
      courseId: COURSE_ID,
      expectedRevision: 5,
      operation: "update_course_design",
      designCommand: {
        type: "clear_guidance",
        scope: { kind: "course", ref: COURSE_ID }
      }
    }
  }));
  assert.equal(writeResponse.status, 200);
  assert.equal(calls[0][1].scopeKind, "course");
  assert.equal(calls[0][1].scopeRef, COURSE_ID);
  assert.equal(calls[1][1].expectedCourseRevision, 5);
  assert.equal(calls[1][1].command.type, "clear_guidance");
});

test("aplicativo usa o mesmo contrato de Fontes do MCP", async () => {
  const calls = [];
  const legacySourceId = ` legacy-${"s".repeat(300)} `;
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        return { actorId: COURSE_ID, scopes: ["authoring:read", "authoring:write"] };
      },
      async getCourseSources(value) {
        calls.push(["read", value]);
        return {
          contract: "aralearn.course-sources.v1",
          courseId: COURSE_ID,
          courseRevision: 5,
          mode: "target",
          query: { sourceId: null, targetKind: "study_unit", targetId: "unit-a" },
          items: [],
          nextCursor: null
        };
      },
      async executeCourseSourceCommand(value) {
        calls.push(["write", value]);
        return {
          contract: "aralearn.course-source-change.v1",
          courseId: COURSE_ID,
          courseRevision: 6,
          requestId: "request-course-source-0001",
          idempotent: false,
          changed: true,
          change: { type: "retire_source", subjectId: legacySourceId, revision: 2 }
        };
      }
    }
  });
  const readResponse = await handler(request("/app/lerCurso", {
    body: {
      courseId: COURSE_ID,
      view: "course_sources",
      expectedRevision: 5,
      mode: "target",
      targetKind: "study_unit",
      targetId: "unit-a",
      limit: 12,
      cursor: null
    }
  }));
  assert.equal(readResponse.status, 200);

  const writeResponse = await handler(request("/app/alterarCurso", {
    body: {
      requestId: "request-course-source-0001",
      courseId: COURSE_ID,
      expectedRevision: 5,
      operation: "update_course_sources",
      sourceCommand: {
        type: "retire_source",
        sourceId: legacySourceId,
        expectedSourceRevision: 1
      }
    }
  }));
  assert.equal(writeResponse.status, 200);
  assert.equal(calls[0][1].expectedRevision, 5);
  assert.equal(calls[0][1].targetId, "unit-a");
  assert.equal(calls[1][1].expectedCourseRevision, 5);
  assert.deepEqual(calls[1][1].command, {
    type: "retire_source",
    sourceId: legacySourceId,
    expectedSourceRevision: 1
  });

  const spoofed = await handler(request("/app/alterarCurso", {
    body: {
      requestId: "request-course-source-0002",
      courseId: COURSE_ID,
      expectedRevision: 5,
      operation: "update_course_sources",
      sourceCommand: {
        type: "retire_source",
        sourceId: "source-a",
        expectedSourceRevision: 1,
        actorId: COURSE_ID
      }
    }
  }));
  assert.equal(spoofed.status, 422);
});

test("orienta reler o Curso e usar novo requestId após conflito de versão", async () => {
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        return { actorId: COURSE_ID, scopes: ["authoring:write"] };
      },
      async commitCourseInstructionalPlan() {
        throw new AuthoringApiError(
          409,
          "stale_course_state",
          "A versão de estado do Curso mudou."
        );
      }
    }
  });
  const response = await handler(request("/app/alterarCurso", {
    body: {
      requestId: "request-course-stale-0001",
      courseId: COURSE_ID,
      expectedRevision: 1,
      expectedPlanVersion: 1,
      operation: "update_instructional_plan",
      planCommand: { type: "update_plan", title: "Curso revisto" }
    }
  }));
  const payload = await response.json();

  assert.equal(response.status, 409);
  assert.equal(payload.error.code, "stale_course_state");
  assert.deepEqual(payload.error.recovery, {
    strategy: "reread_and_retry",
    retryable: true,
    requestIdMode: "new",
    steps: [
      "Releia o Curso e sua versão de estado corrente.",
      "Reaplique somente a intenção ainda pertinente com novo requestId."
    ]
  });
  assert.doesNotMatch(JSON.stringify(payload), /workspace|trilha|salvarCards/iu);
});
