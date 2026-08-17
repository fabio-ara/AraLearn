import test from "node:test";
import assert from "node:assert/strict";

import { routeCourseRequest } from "../../supabase/functions/_shared/aralearn-authoring/courseProtocol.js";
import { executeCourseRoute } from "../../supabase/functions/_shared/aralearn-authoring/courseRouter.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PLAN_ID = "15000000-0000-4000-8000-000000000005";
const PART_ID = "20000000-0000-4000-8000-000000000002";
const MATERIALIZATION_ID = "30000000-0000-4000-8000-000000000003";
const STEP_ID = "40000000-0000-4000-8000-000000000004";
const PRINCIPAL = { actorId: COURSE_ID, scopes: ["authoring:write"] };

function request(path, { method = "GET", body = null, requestId = null } = {}) {
  return new Request(`https://aralearn.invalid${path}`, {
    method,
    headers: {
      ...(body == null ? {} : { "Content-Type": "application/json" }),
      ...(requestId == null ? {} : { "Idempotency-Key": requestId })
    },
    ...(body == null ? {} : { body: JSON.stringify(body) })
  });
}

test("roteia somente endpoints canônicos de Curso", () => {
  assert.deepEqual(routeCourseRequest("GET", "/v1/profile"), {
    name: "getPersonProfile"
  });
  assert.deepEqual(routeCourseRequest("PATCH", "/v1/profile"), {
    name: "updatePersonProfile"
  });
  assert.deepEqual(routeCourseRequest("GET", "/v1/courses"), { name: "listCourses" });
  assert.deepEqual(routeCourseRequest("POST", "/v1/courses"), { name: "createCourse" });
  assert.deepEqual(routeCourseRequest("GET", `/v1/courses/${COURSE_ID}`), {
    name: "getCourse",
    courseId: COURSE_ID
  });
  assert.deepEqual(routeCourseRequest("GET", `/v1/courses/${COURSE_ID}/entities`), {
    name: "listCourseEntities",
    courseId: COURSE_ID
  });
  assert.deepEqual(routeCourseRequest(
    "GET",
    `/v1/courses/${COURSE_ID}/instructional-plan`
  ), {
    name: "getCourseInstructionalPlan",
    courseId: COURSE_ID
  });
  assert.deepEqual(routeCourseRequest(
    "POST",
    `/v1/courses/${COURSE_ID}/instructional-plan/changes`
  ), {
    name: "commitCourseInstructionalPlan",
    courseId: COURSE_ID
  });
  assert.deepEqual(routeCourseRequest("POST", `/v1/courses/${COURSE_ID}/composition`), {
    name: "commitCourseComposition",
    courseId: COURSE_ID
  });
  assert.deepEqual(routeCourseRequest(
    "GET",
    `/v1/courses/${COURSE_ID}/authoring-parts/${PART_ID}` +
      `/materializations/${MATERIALIZATION_ID}`
  ), {
    name: "getCourseAuthoringPartMaterialization",
    courseId: COURSE_ID,
    authoringPartId: PART_ID,
    materializationId: MATERIALIZATION_ID
  });
  assert.deepEqual(routeCourseRequest(
    "POST",
    `/v1/courses/${COURSE_ID}/authoring-parts/${PART_ID}` +
      `/materializations/${MATERIALIZATION_ID}/changes`
  ), {
    name: "advanceCourseAuthoringPartMaterialization",
    courseId: COURSE_ID,
    authoringPartId: PART_ID,
    materializationId: MATERIALIZATION_ID
  });
  assert.deepEqual(routeCourseRequest("GET", `/v1/courses/${COURSE_ID}/access`), {
    name: "listCourseAccess",
    courseId: COURSE_ID
  });
  assert.deepEqual(routeCourseRequest("POST", `/v1/courses/${COURSE_ID}/access`), {
    name: "grantCourseAccess",
    courseId: COURSE_ID
  });
  assert.deepEqual(routeCourseRequest(
    "DELETE",
    `/v1/courses/${COURSE_ID}/access/20000000-0000-4000-8000-000000000002`
  ), {
    name: "revokeCourseAccess",
    courseId: COURSE_ID,
    userId: "20000000-0000-4000-8000-000000000002"
  });
  assert.throws(
    () => routeCourseRequest("GET", "/v1/authoring/workspaces"),
    (error) => error.status === 404
  );
});

test("lista com paginação completa e lê outline", async () => {
  const calls = [];
  const adapter = {
    async listCourses(value) { calls.push(["list", value]); return { items: [] }; },
    async getCourse(value) { calls.push(["get", value]); return { courseId: value.courseId }; }
  };
  const listRequest = request(`/v1/courses?query=rede&limit=12&beforeUpdatedAt=2026-08-17T10%3A00%3A00Z&beforeId=${COURSE_ID}`);
  await executeCourseRoute({
    request: listRequest,
    route: routeCourseRequest("GET", new URL(listRequest.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  const getRequest = request(`/v1/courses/${COURSE_ID}?view=outline`);
  await executeCourseRoute({
    request: getRequest,
    route: routeCourseRequest("GET", new URL(getRequest.url).pathname),
    adapter,
    principal: PRINCIPAL
  });

  assert.equal(calls[0][1].query, "rede");
  assert.equal(calls[0][1].limit, 12);
  assert.equal(calls[0][1].beforeId, COURSE_ID);
  assert.equal(calls[1][1].courseId, COURSE_ID);
  assert.equal(calls[1][1].includeOutline, true);
});

test("lê entidades paginadas sob a mesma versão", async () => {
  let call = null;
  const adapter = {
    async listCourseEntities(value) {
      call = value;
      return { courseId: value.courseId, revision: value.expectedRevision, items: [] };
    }
  };
  const value = request(
    `/v1/courses/${COURSE_ID}/entities?expectedRevision=4&limit=50` +
      "&afterEntityType=microsequence&afterEntityId=micro-a"
  );
  const result = await executeCourseRoute({
    request: value,
    route: routeCourseRequest("GET", new URL(value.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  assert.equal(result.data.revision, 4);
  assert.equal(call.courseId, COURSE_ID);
  assert.equal(call.expectedRevision, 4);
  assert.equal(call.afterEntityType, "microsequence");
  assert.equal(call.afterEntityId, "micro-a");
});

test("cria Curso e reconcilia requestId", async () => {
  let call = null;
  const adapter = {
    async createCourse(value) { call = value; return { courseId: COURSE_ID, revision: 1 }; }
  };
  const body = {
    requestId: "request-course-0001",
    title: "Curso",
    objective: "Aprender"
  };
  const value = request("/v1/courses", {
    method: "POST",
    requestId: body.requestId,
    body
  });
  const result = await executeCourseRoute({
    request: value,
    route: routeCourseRequest("POST", "/v1/courses"),
    adapter,
    principal: PRINCIPAL
  });

  assert.equal(result.requestId, body.requestId);
  assert.equal(call.title, "Curso");
  assert.equal(call.objective, "Aprender");
});

test("criação rejeita controles e preserva quebras de layout deliberadas", async () => {
  const calls = [];
  const adapter = {
    async createCourse(value) {
      calls.push(value);
      return { courseId: COURSE_ID, revision: 1 };
    }
  };
  for (const [title, objective, requestId] of [
    ["Curso\u0001inválido", "Objetivo válido", "request-control-0001"],
    ["Curso válido", "Objetivo\u007finválido", "request-control-0002"],
    ["Curso\u0085inválido", "Objetivo válido", "request-control-0003"]
  ]) {
    const value = request("/v1/courses", {
      method: "POST",
      requestId,
      body: { requestId, title, objective }
    });
    await assert.rejects(
      executeCourseRoute({
        request: value,
        route: routeCourseRequest("POST", "/v1/courses"),
        adapter,
        principal: PRINCIPAL
      }),
      (error) => error.code === "invalid_course_command"
    );
  }
  const requestId = "request-layout-0001";
  const value = request("/v1/courses", {
    method: "POST",
    requestId,
    body: {
      requestId,
      title: "Curso válido",
      objective: "Objetivo em duas linhas.\n\tCom detalhe."
    }
  });
  await executeCourseRoute({
    request: value,
    route: routeCourseRequest("POST", "/v1/courses"),
    adapter,
    principal: PRINCIPAL
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].objective, "Objetivo em duas linhas.\n\tCom detalhe.");
});

test("commit de composição exige versão, conteúdo e escopo de escrita", async () => {
  const body = {
    requestId: "request-change-0001",
    expectedRevision: 2,
    upserts: [{
      entityType: "module",
      entityId: "module-a",
      parentType: null,
      parentId: null,
      position: 0,
      content: { title: "Módulo", guide: {} }
    }],
    deletes: []
  };
  let call = null;
  const adapter = {
    async commitCourseComposition(value) {
      call = value;
      return { courseId: COURSE_ID, revision: 3 };
    }
  };
  const value = request(`/v1/courses/${COURSE_ID}/composition`, {
    method: "POST",
    requestId: body.requestId,
    body
  });
  const route = routeCourseRequest("POST", new URL(value.url).pathname);
  const result = await executeCourseRoute({ request: value, route, adapter, principal: PRINCIPAL });

  assert.equal(result.data.revision, 3);
  assert.equal(call.courseId, COURSE_ID);
  assert.equal(call.expectedRevision, 2);
  assert.equal(call.upserts.length, 1);

  const deniedRequest = request(`/v1/courses/${COURSE_ID}/composition`, {
    method: "POST",
    requestId: body.requestId,
    body
  });
  for (const scopes of [
    ["authoring:read"],
    ["authoring:private:write"],
    ["*"]
  ]) {
    await assert.rejects(
      () => executeCourseRoute({
        request: deniedRequest.clone(),
        route,
        adapter,
        principal: { actorId: COURSE_ID, scopes }
      }),
      (error) => error.status === 403
    );
  }
});

test("composição rejeita hierarquia, posição e conteúdo incompatíveis antes do banco", async () => {
  const adapter = {
    async commitCourseComposition() {
      assert.fail("O adaptador não pode receber uma entidade inválida.");
    }
  };
  const body = {
    requestId: "request-course-invalid-entity",
    expectedRevision: 1,
    upserts: [{
      entityType: "card",
      entityId: "unit-a",
      parentType: "lesson",
      parentId: "lesson-a",
      position: 0,
      content: { id: "duplicated" }
    }],
    deletes: []
  };
  const value = request(`/v1/courses/${COURSE_ID}/composition`, {
    method: "POST",
    requestId: body.requestId,
    body
  });
  await assert.rejects(
    () => executeCourseRoute({
      request: value,
      route: routeCourseRequest("POST", new URL(value.url).pathname),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_entity"
  );
});

test("composição rejeita título curricular fora do contrato antes do banco", async () => {
  const adapter = {
    async commitCourseComposition() {
      assert.fail("O adaptador não pode receber título curricular inválido.");
    }
  };
  const invalidTitles = ["M".repeat(301), "Micro\u0001inválida", "Micro\u0085inválida"];
  for (const [index, title] of invalidTitles.entries()) {
    const body = {
      requestId: `request-course-invalid-title-${index}`,
      expectedRevision: 1,
      upserts: [{
        entityType: index === 0 ? "module" : "microsequence",
        entityId: index === 0 ? "module-a" : "micro-a",
        parentType: index === 0 ? null : "lesson",
        parentId: index === 0 ? null : "lesson-a",
        position: 0,
        content: { title }
      }],
      deletes: []
    };
    const path = `/v1/courses/${COURSE_ID}/composition`;
    const value = request(path, {
      method: "POST",
      requestId: body.requestId,
      body
    });
    await assert.rejects(
      () => executeCourseRoute({
        request: value,
        route: routeCourseRequest("POST", path),
        adapter,
        principal: PRINCIPAL
      }),
      (error) => error.code === "invalid_course_command"
    );
  }
});

test("composição e etapa rejeitam listas malformadas sem descartar dados", async () => {
  const adapter = {
    async commitCourseComposition() {
      assert.fail("O adaptador não pode receber composição parcial.");
    },
    async advanceCourseAuthoringPartMaterialization() {
      assert.fail("O adaptador não pode receber etapa parcial.");
    }
  };
  const compositionPath = `/v1/courses/${COURSE_ID}/composition`;
  const malformedComposition = request(compositionPath, {
    method: "POST",
    requestId: "request-course-malformed-lists",
    body: {
      requestId: "request-course-malformed-lists",
      expectedRevision: 1,
      upserts: {},
      deletes: [{ entityType: "card", entityId: "unit-a" }]
    }
  });
  await assert.rejects(
    () => executeCourseRoute({
      request: malformedComposition,
      route: routeCourseRequest("POST", compositionPath),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_command"
  );

  const materializationPath = `/v1/courses/${COURSE_ID}/authoring-parts/${PART_ID}` +
    `/materializations/${MATERIALIZATION_ID}/changes`;
  const malformedStep = request(materializationPath, {
    method: "POST",
    requestId: "request-materialization-lists",
    body: {
      requestId: "request-materialization-lists",
      expectedCourseRevision: 7,
      expectedMaterializationVersion: 1,
      operation: "record_step",
      payload: {
        stepId: STEP_ID,
        expectedStepVersion: 1,
        status: "completed",
        resultFacts: {},
        entityChanges: { upserts: {}, deletes: [] }
      }
    }
  });
  await assert.rejects(
    () => executeCourseRoute({
      request: malformedStep,
      route: routeCourseRequest("POST", materializationPath),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_command"
  );
});

test("rejeita cursor parcial e campos fora do comando", async () => {
  const adapter = { async listCourses() { return { items: [] }; } };
  const partial = request("/v1/courses?beforeId=10000000-0000-4000-8000-000000000001");
  await assert.rejects(
    () => executeCourseRoute({
      request: partial,
      route: routeCourseRequest("GET", "/v1/courses"),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_pagination"
  );

  const invalid = request("/v1/courses", {
    method: "POST",
    body: {
      requestId: "request-course-0001",
      title: "Curso",
      objective: "Aprender",
      workspaceId: COURSE_ID
    }
  });
  await assert.rejects(
    () => executeCourseRoute({
      request: invalid,
      route: routeCourseRequest("POST", "/v1/courses"),
      adapter: { async createCourse() { return {}; } },
      principal: PRINCIPAL
    }),
    (error) => error.code === "unknown_course_command_field"
  );
});

test("perfil próprio e acesso direto atravessam o mesmo contrato do MCP", async () => {
  const calls = [];
  const adapter = {
    async getPersonProfile(value) {
      calls.push(["read-profile", value]);
      return { userId: PRINCIPAL.actorId, displayName: null };
    },
    async updatePersonProfile(value) {
      calls.push(["update-profile", value]);
      return { userId: PRINCIPAL.actorId, ...value.patch };
    },
    async listCourseAccess(value) {
      calls.push(["list-access", value]);
      return { courseId: value.courseId, items: [] };
    },
    async manageCourseAccess(value) {
      calls.push(["manage-access", value]);
      return { courseId: value.courseId, targetUserId: value.targetUserId || null };
    }
  };

  for (const value of [
    request("/v1/profile"),
    request("/v1/profile", {
      method: "PATCH",
      body: { displayName: "Pesquisadora", avatarObjectKey: null }
    }),
    request(`/v1/courses/${COURSE_ID}/access`)
  ]) {
    await executeCourseRoute({
      request: value,
      route: routeCourseRequest(value.method, new URL(value.url).pathname),
      adapter,
      principal: PRINCIPAL
    });
  }

  const grant = request(`/v1/courses/${COURSE_ID}/access`, {
    method: "POST",
    requestId: "request-access-0001",
    body: {
      requestId: "request-access-0001",
      email: "Pessoa@Example.com",
      confirmed: true
    }
  });
  await executeCourseRoute({
    request: grant,
    route: routeCourseRequest(grant.method, new URL(grant.url).pathname),
    adapter,
    principal: PRINCIPAL
  });

  const revoke = request(
    `/v1/courses/${COURSE_ID}/access/20000000-0000-4000-8000-000000000002`,
    {
      method: "DELETE",
      requestId: "request-access-0002",
      body: { requestId: "request-access-0002", confirmed: true }
    }
  );
  await executeCourseRoute({
    request: revoke,
    route: routeCourseRequest(revoke.method, new URL(revoke.url).pathname),
    adapter,
    principal: PRINCIPAL
  });

  assert.deepEqual(calls.map(([name]) => name), [
    "read-profile", "update-profile", "list-access", "manage-access", "manage-access"
  ]);
  assert.equal(calls[3][1].email, "pessoa@example.com");
  assert.equal(calls[4][1].targetUserId, "20000000-0000-4000-8000-000000000002");
});

test("conceder ou revogar acesso exige confirmação explícita", async () => {
  const adapter = {
    async manageCourseAccess() {
      assert.fail("O adaptador não deve receber acesso sem confirmação.");
    }
  };
  for (const [method, path, body] of [
    ["POST", `/v1/courses/${COURSE_ID}/access`, {
      requestId: "request-access-0001",
      email: "pessoa@example.com",
      confirmed: false
    }],
    ["DELETE", `/v1/courses/${COURSE_ID}/access/20000000-0000-4000-8000-000000000002`, {
      requestId: "request-access-0002"
    }]
  ]) {
    const value = request(path, { method, body, requestId: body.requestId });
    await assert.rejects(
      () => executeCourseRoute({
        request: value,
        route: routeCourseRequest(method, path),
        adapter,
        principal: PRINCIPAL
      }),
      (error) => error.code === "access_confirmation_required"
    );
  }
});

test("lê e altera o plano instrucional com as duas cercas CAS", async () => {
  const calls = [];
  const adapter = {
    async getCourseInstructionalPlan(value) {
      calls.push(["read", value]);
      return {
        contract: "aralearn.course-instructional-plan.v1",
        courseId: COURSE_ID,
        courseRevision: 3,
        plan: { id: PLAN_ID, version: 5, parts: [] },
        recentActivity: []
      };
    },
    async commitCourseInstructionalPlan(value) {
      calls.push(["commit", value]);
      return {
        contract: "aralearn.course-instructional-plan-change.v1",
        courseId: COURSE_ID,
        courseRevision: 4,
        planId: PLAN_ID,
        planVersion: 6
      };
    }
  };

  const read = request(`/v1/courses/${COURSE_ID}/instructional-plan?recentLimit=8`);
  const readResult = await executeCourseRoute({
    request: read,
    route: routeCourseRequest("GET", new URL(read.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  assert.equal(readResult.data.plan.version, 5);
  assert.equal(calls[0][1].recentLimit, 8);

  const command = {
    type: "update_plan",
    objective: "Compreender redes",
    preferredPartCount: { minimum: 7, maximum: 10, origin: "author" }
  };
  const commit = request(`/v1/courses/${COURSE_ID}/instructional-plan/changes`, {
    method: "POST",
    requestId: "request-plan-0001",
    body: {
      requestId: "request-plan-0001",
      expectedCourseRevision: 3,
      expectedPlanVersion: 5,
      command
    }
  });
  const commitResult = await executeCourseRoute({
    request: commit,
    route: routeCourseRequest("POST", new URL(commit.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  assert.equal(commitResult.requestId, "request-plan-0001");
  assert.equal(commitResult.data.planVersion, 6);
  assert.equal(calls[1][1].expectedCourseRevision, 3);
  assert.equal(calls[1][1].expectedPlanVersion, 5);
  assert.deepEqual(calls[1][1].command, command);
});

test("lê uma materialização de Parte sem parâmetros implícitos", async () => {
  let call = null;
  const adapter = {
    async getCourseAuthoringPartMaterialization(value) {
      call = value;
      return {
        contract: "aralearn.course-authoring-part-materialization.v1",
        courseId: COURSE_ID,
        courseRevision: 8,
        authoringPartId: PART_ID,
        materialization: { id: MATERIALIZATION_ID, steps: [] }
      };
    }
  };
  const value = request(
    `/v1/courses/${COURSE_ID}/authoring-parts/${PART_ID}` +
      `/materializations/${MATERIALIZATION_ID}`
  );
  const result = await executeCourseRoute({
    request: value,
    route: routeCourseRequest("GET", new URL(value.url).pathname),
    adapter,
    principal: PRINCIPAL
  });

  assert.equal(result.requestId, null);
  assert.equal(result.data.materialization.id, MATERIALIZATION_ID);
  assert.equal(call.courseId, COURSE_ID);
  assert.equal(call.authoringPartId, PART_ID);
  assert.equal(call.materializationId, MATERIALIZATION_ID);
});

test("avança materialização de Parte com versões e etapas delimitadas", async () => {
  let call = null;
  const adapter = {
    async advanceCourseAuthoringPartMaterialization(value) {
      call = value;
      return {
        contract: "aralearn.course-authoring-materialization-change.v1",
        courseId: COURSE_ID,
        courseRevision: 8,
        authoringPartId: PART_ID,
        operation: "start",
        materialization: { id: MATERIALIZATION_ID, status: "running", version: 1 }
      };
    }
  };
  const body = {
    requestId: "request-materialization-0001",
    expectedCourseRevision: 7,
    expectedMaterializationVersion: 0,
    operation: "start",
    payload: {
      authoringPartVersion: 2,
      designContext: { audience: "Docentes" },
      steps: [{
        id: STEP_ID,
        position: 0,
        kind: "didactic_microsequence_materialization",
        targetDidacticMicrosequenceId: "micro-a",
        productionPosition: 0
      }]
    }
  };
  const value = request(
    `/v1/courses/${COURSE_ID}/authoring-parts/${PART_ID}` +
      `/materializations/${MATERIALIZATION_ID}/changes`,
    { method: "POST", requestId: body.requestId, body }
  );
  const result = await executeCourseRoute({
    request: value,
    route: routeCourseRequest("POST", new URL(value.url).pathname),
    adapter,
    principal: PRINCIPAL
  });

  assert.equal(result.data.materialization.version, 1);
  assert.equal(call.courseId, COURSE_ID);
  assert.equal(call.authoringPartId, PART_ID);
  assert.equal(call.materializationId, MATERIALIZATION_ID);
  assert.equal(call.expectedCourseRevision, 7);
  assert.equal(call.expectedMaterializationVersion, 0);
  assert.deepEqual(call.payload.steps[0], body.payload.steps[0]);
});

test("materialização rejeita cerca ou alvo incoerente antes do adaptador", async () => {
  const adapter = {
    async advanceCourseAuthoringPartMaterialization() {
      assert.fail("O adaptador não pode receber materialização inválida.");
    }
  };
  const body = {
    requestId: "request-materialization-0002",
    expectedCourseRevision: 7,
    expectedMaterializationVersion: 1,
    operation: "start",
    payload: {
      authoringPartVersion: 2,
      designContext: {},
      steps: [{
        id: STEP_ID,
        position: 0,
        kind: "context_load",
        targetDidacticMicrosequenceId: "micro-a",
        productionPosition: 0
      }]
    }
  };
  const path = `/v1/courses/${COURSE_ID}/authoring-parts/${PART_ID}` +
    `/materializations/${MATERIALIZATION_ID}/changes`;
  const value = request(path, { method: "POST", requestId: body.requestId, body });
  await assert.rejects(
    () => executeCourseRoute({
      request: value,
      route: routeCourseRequest("POST", path),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_command"
  );
});
