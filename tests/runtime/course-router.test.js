import test from "node:test";
import assert from "node:assert/strict";

import { routeCourseRequest } from "../../supabase/functions/_shared/aralearn-authoring/courseProtocol.js";
import { executeCourseRoute } from "../../supabase/functions/_shared/aralearn-authoring/courseRouter.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
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
  assert.deepEqual(routeCourseRequest("POST", `/v1/courses/${COURSE_ID}/changes`), {
    name: "commitCourseChanges",
    courseId: COURSE_ID
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
    goal: "Aprender"
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
  assert.equal(call.brief, "");
});

test("commit exige versão, conteúdo e escopo de escrita", async () => {
  const body = {
    requestId: "request-change-0001",
    expectedRevision: 2,
    operation: "commit_entities",
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
    async commitCourseChanges(value) { call = value; return { courseId: COURSE_ID, revision: 3 }; }
  };
  const value = request(`/v1/courses/${COURSE_ID}/changes`, {
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

  const deniedRequest = request(`/v1/courses/${COURSE_ID}/changes`, {
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

test("commit rejeita hierarquia, posição e conteúdo incompatíveis antes do banco", async () => {
  const adapter = {
    async commitCourseChanges() {
      assert.fail("O adaptador não pode receber uma entidade inválida.");
    }
  };
  const body = {
    requestId: "request-course-invalid-entity",
    expectedRevision: 1,
    operation: "commit_entities",
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
  const value = request(`/v1/courses/${COURSE_ID}/changes`, {
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
      goal: "Aprender",
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

test("estado autoral aceita somente o objeto canônico completo", async () => {
  const validState = { version: 1, parts: [], decisions: [], mandate: null };
  const calls = [];
  const adapter = {
    async commitCourseChanges(value) {
      calls.push(value);
      return { courseId: COURSE_ID, revision: 2 };
    }
  };
  const route = routeCourseRequest("POST", `/v1/courses/${COURSE_ID}/changes`);
  const valid = request(`/v1/courses/${COURSE_ID}/changes`, {
    method: "POST",
    requestId: "request-state-0001",
    body: {
      requestId: "request-state-0001",
      expectedRevision: 1,
      operation: "update_metadata",
      authoringState: validState
    }
  });
  await executeCourseRoute({ request: valid, route, adapter, principal: PRINCIPAL });
  assert.deepEqual(calls[0].authoringState, validState);

  for (const invalidState of [{}, { ...validState, extra: true }]) {
    const invalid = request(`/v1/courses/${COURSE_ID}/changes`, {
      method: "POST",
      requestId: "request-state-0002",
      body: {
        requestId: "request-state-0002",
        expectedRevision: 1,
        operation: "update_metadata",
        authoringState: invalidState
      }
    });
    await assert.rejects(
      () => executeCourseRoute({ request: invalid, route, adapter, principal: PRINCIPAL }),
      (error) => error.code === "invalid_course_command"
    );
  }
});
