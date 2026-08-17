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
  assert.deepEqual(routeCourseRequest("GET", `/v1/courses/${COURSE_ID}/study-units`), {
    name: "listCourseStudyUnits",
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
  assert.deepEqual(routeCourseRequest("GET", `/v1/courses/${COURSE_ID}/course-design`), {
    name: "getCourseDesign",
    courseId: COURSE_ID
  });
  assert.deepEqual(routeCourseRequest(
    "POST",
    `/v1/courses/${COURSE_ID}/course-design/changes`
  ), {
    name: "applyCourseDesignCommand",
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

test("lê Unidades de estudo por escopo com âncora e orçamento limitado", async () => {
  let call = null;
  const adapter = {
    async listCourseStudyUnits(value) {
      call = value;
      return {
        contract: "aralearn.course-study-unit-inspection-page.v1",
        courseId: value.courseId,
        courseRevision: value.expectedRevision,
        items: []
      };
    }
  };
  const value = request(
    `/v1/courses/${COURSE_ID}/study-units?expectedRevision=8` +
      `&scopeKind=authoring_part&scopeId=${PART_ID}` +
      "&anchorStudyUnitId=unit-a&direction=backward&limit=12&maxBytes=262144"
  );
  const result = await executeCourseRoute({
    request: value,
    route: routeCourseRequest("GET", new URL(value.url).pathname),
    adapter,
    principal: PRINCIPAL
  });

  assert.equal(result.data.courseRevision, 8);
  assert.equal(call.scopeKind, "authoring_part");
  assert.equal(call.scopeId, PART_ID);
  assert.equal(call.anchorStudyUnitId, "unit-a");
  assert.equal(call.cursorStudyUnitId, null);
  assert.equal(call.direction, "backward");
  assert.equal(call.maxBytes, 262144);

  const invalid = request(
    `/v1/courses/${COURSE_ID}/study-units?expectedRevision=8` +
      "&anchorStudyUnitId=unit-a&cursorStudyUnitId=unit-b"
  );
  await assert.rejects(
    () => executeCourseRoute({
      request: invalid,
      route: routeCourseRequest("GET", new URL(invalid.url).pathname),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_pagination"
  );
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
      content: {
        title: "Módulo",
        guide: {
          goal: "Orientar o módulo.",
          include: [],
          exclude: [],
          notation: [],
          avoid: []
        }
      }
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
      entityType: "study_unit",
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

test("composição valida semanticamente cada entidade do segmento alterado", async () => {
  const adapter = {
    async commitCourseComposition() {
      assert.fail("O adaptador não pode receber conteúdo didático inválido.");
    }
  };
  const path = `/v1/courses/${COURSE_ID}/composition`;
  const invalidRows = [{
    entityType: "module",
    entityId: "module-a",
    parentType: null,
    parentId: null,
    position: 0,
    content: {
      title: "Módulo",
      guide: { goal: "Orientar.", include: [], exclude: [], notation: [] }
    }
  }, {
    entityType: "microsequence",
    entityId: "micro-a",
    parentType: "lesson",
    parentId: "lesson-a",
    position: 0,
    content: {
      title: "Microssequência",
      goal: "Explicar.",
      role: "papel-inexistente",
      dependsOn: [],
      covers: [],
      checks: [],
      errors: []
    }
  }];
  for (const [index, row] of invalidRows.entries()) {
    const requestId = `request-invalid-segment-${index}`;
    const value = request(path, {
      method: "POST",
      requestId,
      body: { requestId, expectedRevision: 1, upserts: [row], deletes: [] }
    });
    await assert.rejects(
      () => executeCourseRoute({
        request: value,
        route: routeCourseRequest("POST", path),
        adapter,
        principal: PRINCIPAL
      }),
      (error) => error.code === "invalid_course_contract"
    );
  }
});

test("composição rejeita envelope inválido da Unidade sem reler o Curso inteiro", async () => {
  const adapter = {
    async commitCourseComposition() {
      assert.fail("O adaptador não pode receber uma Unidade de estudo inválida.");
    }
  };
  const path = `/v1/courses/${COURSE_ID}/composition`;
  const value = request(path, {
    method: "POST",
    requestId: "request-invalid-study-unit-envelope",
    body: {
      requestId: "request-invalid-study-unit-envelope",
      expectedRevision: 3,
      upserts: [{
        entityType: "study_unit",
        entityId: "unit-a",
        parentType: "microsequence",
        parentId: "micro-a",
        position: 1,
        content: {
          title: "Unidade incompleta",
          role: "theory",
          content: [],
          response: null,
          feedback: [],
          topics: [],
          sources: []
        }
      }],
      deletes: []
    }
  });
  await assert.rejects(
    () => executeCourseRoute({
      request: value,
      route: routeCourseRequest("POST", path),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_contract"
  );
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
      deletes: [{ entityType: "study_unit", entityId: "unit-a" }]
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

test("etapa rejeita referência de componente desconhecida antes do adaptador", async () => {
  const adapter = {
    async advanceCourseAuthoringPartMaterialization() {
      assert.fail("O adaptador não pode receber componente desconhecido.");
    }
  };
  const path = `/v1/courses/${COURSE_ID}/authoring-parts/${PART_ID}` +
    `/materializations/${MATERIALIZATION_ID}/changes`;
  const value = request(path, {
    method: "POST",
    requestId: "request-materialization-components",
    body: {
      requestId: "request-materialization-components",
      expectedCourseRevision: 7,
      expectedMaterializationVersion: 1,
      operation: "record_step",
      payload: {
        stepId: STEP_ID,
        expectedStepVersion: 1,
        status: "completed",
        resultFacts: {},
        entityChanges: {
          upserts: [{
            entityType: "study_unit",
            entityId: "unit-a",
            parentType: "microsequence",
            parentId: "micro-a",
            position: 1,
            content: {
              title: "Unidade A",
              role: "theory",
              content: [{
                id: "paragraph-a",
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: "Conteúdo explicado." }
              }],
              response: null,
              feedback: [],
              topics: [],
              sources: []
            }
          }],
          deletes: []
        },
        designApplication: {
          contextHash: "a".repeat(64),
          didacticMicrosequenceId: "micro-a",
          studyUnits: [{
            studyUnitId: "unit-a",
            mode: "expository",
            introducedInstructionalAnalysisUnitIds: [],
            explanationApplications: [],
            practiceApplications: [],
            componentRefs: ["aralearn.resource.unknown@1.0.0"]
          }]
        }
      }
    }
  });
  await assert.rejects(
    () => executeCourseRoute({
      request: value,
      route: routeCourseRequest("POST", path),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "unknown_course_component_ref"
  );
});

test("etapa rejeita fatos atribuídos a microssequência diferente do upsert", async () => {
  const adapter = {
    async advanceCourseAuthoringPartMaterialization() {
      assert.fail("O adaptador não pode receber fatos atribuídos ao alvo errado.");
    }
  };
  const path = `/v1/courses/${COURSE_ID}/authoring-parts/${PART_ID}` +
    `/materializations/${MATERIALIZATION_ID}/changes`;
  const requestId = "request-materialization-wrong-target";
  const value = request(path, {
    method: "POST",
    requestId,
    body: {
      requestId,
      expectedCourseRevision: 7,
      expectedMaterializationVersion: 1,
      operation: "record_step",
      payload: {
        stepId: STEP_ID,
        expectedStepVersion: 1,
        status: "completed",
        resultFacts: {},
        entityChanges: {
          upserts: [{
            entityType: "study_unit",
            entityId: "unit-a",
            parentType: "microsequence",
            parentId: "micro-b",
            position: 1,
            content: {
              title: "Unidade A",
              role: "theory",
              content: [{
                id: "paragraph-a",
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: "Conteúdo explicado." }
              }],
              response: null,
              feedback: [],
              topics: [],
              sources: []
            }
          }],
          deletes: []
        },
        designApplication: {
          contextHash: "a".repeat(64),
          didacticMicrosequenceId: "micro-a",
          studyUnits: [{
            studyUnitId: "unit-a",
            mode: "expository",
            introducedInstructionalAnalysisUnitIds: [],
            explanationApplications: [],
            practiceApplications: [],
            componentRefs: ["aralearn.resource.paragraph@1.0.0"]
          }]
        }
      }
    }
  });

  await assert.rejects(
    () => executeCourseRoute({
      request: value,
      route: routeCourseRequest("POST", path),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "design_application_content_mismatch" &&
      error.details?.studyUnitId === "unit-a"
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

test("lê e altera parâmetros por escopo concreto com validação fechada", async () => {
  const calls = [];
  const adapter = {
    async getCourseDesign(value) {
      calls.push(["read", value]);
      return { contract: "aralearn.course-design.v1", courseId: COURSE_ID };
    },
    async applyCourseDesignCommand(value) {
      calls.push(["write", value]);
      return { contract: "aralearn.course-design-change.v1", changed: true };
    }
  };
  const read = request(
    `/v1/courses/${COURSE_ID}/course-design?scopeKind=lesson&scopeRef=lesson-a` +
      "&limit=16&cursor=micro-a"
  );
  await executeCourseRoute({
    request: read,
    route: routeCourseRequest("GET", new URL(read.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  assert.equal(calls[0][1].scopeKind, "lesson");
  assert.equal(calls[0][1].scopeRef, "lesson-a");
  assert.equal(calls[0][1].childLimit, 16);
  assert.equal(calls[0][1].childCursor, "micro-a");

  const invalidQuery = request(
    `/v1/courses/${COURSE_ID}/course-design?scopeKind=course&scopeRef=${COURSE_ID}` +
      "&offset=16"
  );
  await assert.rejects(
    () => executeCourseRoute({
      request: invalidQuery,
      route: routeCourseRequest("GET", new URL(invalidQuery.url).pathname),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_design_query"
  );

  const command = {
    type: "set_guidance",
    scope: { kind: "course", ref: COURSE_ID },
    guidance: "Explique termos antes de coordená-los em mecanismos.",
    origin: "author",
    reason: "Orientação editorial explícita."
  };
  const write = request(`/v1/courses/${COURSE_ID}/course-design/changes`, {
    method: "POST",
    requestId: "request-design-0001",
    body: {
      requestId: "request-design-0001",
      expectedCourseRevision: 4,
      command
    }
  });
  const result = await executeCourseRoute({
    request: write,
    route: routeCourseRequest("POST", new URL(write.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  assert.equal(result.requestId, "request-design-0001");
  assert.equal(calls[1][1].expectedCourseRevision, 4);
  assert.deepEqual(calls[1][1].command, command);

  const targetCommand = {
    type: "set_target_plan_items",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    instructionalAnalysisUnitIds: [PART_ID],
    evidenceRequirementIds: ["50000000-0000-4000-8000-000000000005"]
  };
  const targetWrite = request(`/v1/courses/${COURSE_ID}/course-design/changes`, {
    method: "POST",
    requestId: "request-design-targets",
    body: {
      requestId: "request-design-targets",
      expectedCourseRevision: 5,
      command: targetCommand
    }
  });
  await executeCourseRoute({
    request: targetWrite,
    route: routeCourseRequest("POST", new URL(targetWrite.url).pathname),
    adapter,
    principal: PRINCIPAL
  });
  assert.deepEqual(calls[2][1].command, targetCommand);

  const invalidTarget = request(`/v1/courses/${COURSE_ID}/course-design/changes`, {
    method: "POST",
    requestId: "request-design-targets-invalid",
    body: {
      requestId: "request-design-targets-invalid",
      expectedCourseRevision: 5,
      command: {
        ...targetCommand,
        scope: { kind: "lesson", ref: "lesson-a" }
      }
    }
  });
  await assert.rejects(
    () => executeCourseRoute({
      request: invalidTarget,
      route: routeCourseRequest("POST", new URL(invalidTarget.url).pathname),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_design_scope"
  );

  const invalid = request(`/v1/courses/${COURSE_ID}/course-design/changes`, {
    method: "POST",
    requestId: "request-design-0002",
    body: {
      requestId: "request-design-0002",
      expectedCourseRevision: 4,
      command: { ...command, origin: "migration" }
    }
  });
  await assert.rejects(
    () => executeCourseRoute({
      request: invalid,
      route: routeCourseRequest("POST", new URL(invalid.url).pathname),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_design_origin"
  );

  const wrongCourse = request(`/v1/courses/${COURSE_ID}/course-design/changes`, {
    method: "POST",
    requestId: "request-design-wrong-course",
    body: {
      requestId: "request-design-wrong-course",
      expectedCourseRevision: 4,
      command: {
        ...command,
        scope: { kind: "course", ref: PART_ID }
      }
    }
  });
  await assert.rejects(
    () => executeCourseRoute({
      request: wrongCourse,
      route: routeCourseRequest("POST", new URL(wrongCourse.url).pathname),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_design_scope"
  );
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

test("materialização rejeita contexto declarado pelo cliente antes do adaptador", async () => {
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
    (error) => error.code === "unknown_course_command_field" &&
      error.details?.field === "designContext"
  );
});

test("record_step mantém designApplication nulo fora de conclusão didática", async () => {
  let call = null;
  const adapter = {
    async advanceCourseAuthoringPartMaterialization(value) {
      call = value;
      return { changed: true };
    }
  };
  const path = `/v1/courses/${COURSE_ID}/authoring-parts/${PART_ID}` +
    `/materializations/${MATERIALIZATION_ID}/changes`;
  const base = {
    requestId: "request-materialization-null-facts",
    expectedCourseRevision: 7,
    expectedMaterializationVersion: 1,
    operation: "record_step",
    payload: {
      stepId: STEP_ID,
      expectedStepVersion: 1,
      status: "completed",
      resultFacts: {},
      entityChanges: { upserts: [], deletes: [] },
      designApplication: null
    }
  };
  await executeCourseRoute({
    request: request(path, { method: "POST", requestId: base.requestId, body: base }),
    route: routeCourseRequest("POST", path),
    adapter,
    principal: PRINCIPAL
  });
  assert.equal(call.payload.designApplication, null);

  const missing = structuredClone(base);
  missing.requestId = "request-materialization-missing-facts";
  delete missing.payload.designApplication;
  await assert.rejects(
    () => executeCourseRoute({
      request: request(path, { method: "POST", requestId: missing.requestId, body: missing }),
      route: routeCourseRequest("POST", path),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_command"
  );

  const failed = {
    ...base,
    requestId: "request-materialization-failed-facts",
    payload: {
      ...base.payload,
      status: "failed",
      designApplication: {
        contextHash: "a".repeat(64),
        didacticMicrosequenceId: "micro-a",
        studyUnits: []
      }
    }
  };
  await assert.rejects(
    () => executeCourseRoute({
      request: request(path, { method: "POST", requestId: failed.requestId, body: failed }),
      route: routeCourseRequest("POST", path),
      adapter,
      principal: PRINCIPAL
    }),
    (error) => error.code === "invalid_course_command"
  );

  for (const [requestId, resultFacts] of [
    ["request-materialization-reserved-facts", { designApplication: {} }],
    ["request-materialization-large-facts", { note: "x".repeat(16_350) }]
  ]) {
    const invalidFacts = structuredClone(base);
    invalidFacts.requestId = requestId;
    invalidFacts.payload.resultFacts = resultFacts;
    await assert.rejects(
      () => executeCourseRoute({
        request: request(path, { method: "POST", requestId, body: invalidFacts }),
        route: routeCourseRequest("POST", path),
        adapter,
        principal: PRINCIPAL
      }),
      (error) => error.code === "invalid_course_command"
    );
  }
});
