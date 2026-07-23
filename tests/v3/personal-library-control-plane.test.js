import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { parse as parseYaml } from "yaml";

import {
  authoringMcpToolsForPrincipal,
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/mcpTools.js";
import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import {
  createAuthoringHandler
} from "../../supabase/functions/_shared/aralearn-authoring/router.js";
import {
  SupabaseAuthoringAdapter
} from "../../supabase/functions/_shared/aralearn-authoring/supabaseAdapter.js";

const ORIGIN = "https://client.example";
const API_KEY = `arl_${"P".repeat(32)}`;
const ACTOR_ID = "10000000-0000-4000-8000-000000000001";
const CLIENT_ID = "10000000-0000-4000-8000-000000000002";
const COURSE_ID = "20000000-0000-4000-8000-000000000001";
const SELECTION_ID = "30000000-0000-4000-8000-000000000001";
const PATH_ID = "40000000-0000-4000-8000-000000000001";
const MODULE_ID = "50000000-0000-4000-8000-000000000001";
const OPENAPI_URL = new URL(
  "../../docs/openapi/aralearn-authoring-api.yaml",
  import.meta.url
);

function principal(scopes = [
  "authoring:private:read",
  "authoring:private:write"
]) {
  return {
    actorId: ACTOR_ID,
    clientId: CLIENT_ID,
    authenticationKind: "api_key",
    scopes
  };
}

function memoryAdapter({ scopes, overrides = {} } = {}) {
  return {
    calls: [],
    async resolvePrincipal() {
      return principal(scopes);
    },
    async listPersonalLibraryCourses(args) {
      this.calls.push(["listPersonalLibraryCourses", args]);
      return {
        items: [{
          selectionId: SELECTION_ID,
          courseId: COURSE_ID,
          title: "Curso selecionado"
        }],
        nextCursor: null
      };
    },
    async getPersonalLibraryCourseStructure(args) {
      this.calls.push(["getPersonalLibraryCourseStructure", args]);
      return {
        course: { courseId: args.courseId },
        section: args.section,
        parentId: args.parentId,
        items: [],
        nextCursor: null
      };
    },
    async listPersonalStudyPaths(args) {
      this.calls.push(["listPersonalStudyPaths", args]);
      return {
        unassignedCount: 1,
        items: [{ pathId: PATH_ID, title: "Estudos", courseCount: 0 }],
        nextCursor: null
      };
    },
    async renamePersonalLibraryCourse(args) {
      this.calls.push(["renamePersonalLibraryCourse", args]);
      return { status: "renamed", courseId: args.courseId, title: args.title };
    },
    async createPersonalStudyPath(args) {
      this.calls.push(["createPersonalStudyPath", args]);
      return { status: "created", pathId: PATH_ID, title: args.title };
    },
    async renamePersonalStudyPath(args) {
      this.calls.push(["renamePersonalStudyPath", args]);
      return { status: "renamed", pathId: args.pathId, title: args.title };
    },
    async deletePersonalStudyPath(args) {
      this.calls.push(["deletePersonalStudyPath", args]);
      return {
        status: "deleted",
        pathId: args.pathId,
        detachedCourseCount: 1
      };
    },
    async movePersonalCourseSelection(args) {
      this.calls.push(["movePersonalCourseSelection", args]);
      return {
        status: "moved",
        selectionId: args.selectionId,
        pathId: args.targetPathId
      };
    },
    ...overrides
  };
}

function handler(adapter) {
  return createAuthoringHandler({
    adapter,
    allowedOrigins: new Set([ORIGIN])
  });
}

async function invoke(app, path, {
  method = "GET",
  body,
  requestIdHeader = null
} = {}) {
  const headers = {
    Origin: ORIGIN,
    "X-AraLearn-API-Key": API_KEY
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (requestIdHeader) headers["Idempotency-Key"] = requestIdHeader;
  const response = await app(new Request(`https://edge.example${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }));
  return { response, json: await response.json() };
}

test("API pessoal pagina cursos, trilhas e estrutura sem consultar tabelas", async () => {
  const adapter = memoryAdapter();
  const app = handler(adapter);
  const courses = await invoke(
    app,
    `/v1/library/courses?limit=20&query=lógica&afterPosition=3`
      + `&afterSelectionId=${SELECTION_ID}`
  );
  const structure = await invoke(
    app,
    `/v1/library/courses/${COURSE_ID}/structure?section=lessons`
      + `&parentId=${MODULE_ID}&limit=40`
  );
  const paths = await invoke(
    app,
    `/v1/library/paths?limit=10&afterPosition=0&afterPathId=${PATH_ID}`
  );

  assert.equal(courses.response.status, 200);
  assert.equal(courses.json.data.items[0].selectionId, SELECTION_ID);
  assert.equal(structure.response.status, 200);
  assert.equal(paths.response.status, 200);
  assert.equal(paths.json.data.unassignedCount, 1);
  assert.deepEqual(
    adapter.calls.map(([name]) => name),
    [
      "listPersonalLibraryCourses",
      "getPersonalLibraryCourseStructure",
      "listPersonalStudyPaths"
    ]
  );
  assert.deepEqual(
    {
      limit: adapter.calls[0][1].limit,
      query: adapter.calls[0][1].query,
      afterPosition: adapter.calls[0][1].afterPosition,
      afterSelectionId: adapter.calls[0][1].afterSelectionId
    },
    {
      limit: 20,
      query: "lógica",
      afterPosition: 3,
      afterSelectionId: SELECTION_ID
    }
  );
  assert.equal(adapter.calls[1][1].parentId, MODULE_ID);
  assert.equal(adapter.calls[2][1].afterPathId, PATH_ID);
});

test("OpenAPI canônico documenta todas as rotas e limites da biblioteca pessoal", async () => {
  const document = parseYaml(await fs.readFile(OPENAPI_URL, "utf8"));
  const expected = new Map([
    ["GET /v1/library/courses", "listarCursosDaBibliotecaPessoal"],
    ["PATCH /v1/library/courses/{courseId}", "renomearCursoPessoal"],
    [
      "GET /v1/library/courses/{courseId}/structure",
      "consultarEstruturaDoCursoSelecionado"
    ],
    ["GET /v1/library/paths", "listarTrilhasPessoais"],
    ["POST /v1/library/paths", "criarTrilhaPessoal"],
    ["PATCH /v1/library/paths/{pathId}", "renomearTrilhaPessoal"],
    ["DELETE /v1/library/paths/{pathId}", "excluirTrilhaPessoal"],
    ["PUT /v1/library/selections/{selectionId}/path", "moverCursoParaTrilha"]
  ]);

  for (const [signature, operationId] of expected) {
    const [method, path] = signature.split(" ");
    assert.equal(
      document.paths[path]?.[method.toLowerCase()]?.operationId,
      operationId,
      `${signature} não corresponde à rota pessoal implementada.`
    );
  }

  const schemas = document.components.schemas;
  assert.deepEqual(
    Object.keys(schemas.RenamePersonalLibraryCourseRequest.properties).sort(),
    ["requestId", "title"]
  );
  assert.equal(
    schemas.RenamePersonalLibraryCourseRequest.properties.title.maxLength,
    200
  );
  assert.equal(
    schemas.CreatePersonalStudyPathRequest.properties.title.maxLength,
    120
  );
  assert.deepEqual(
    schemas.MovePersonalCourseSelectionRequest.required,
    ["requestId", "targetPathId"]
  );
  assert.deepEqual(
    schemas.MovePersonalCourseSelectionRequest.properties.targetPathId.type,
    ["string", "null"]
  );
  assert.equal(
    document.components.parameters.PersonalStructureLimit.schema.maximum,
    200
  );
  assert.equal(
    document.components.parameters.PersonalLibraryQuery.schema.maxLength,
    160
  );

  const gap = schemas.AuthoringGap;
  assert.equal(gap.properties.acceptedAnswers.minItems, 0);
  assert.equal(gap.properties.acceptedAnswers.maxItems, 8);
  assert.equal(gap.properties.acceptedAnswers.uniqueItems, true);
  assert.equal(gap.properties.acceptedAnswers.items.maxLength, 120);
  assert.deepEqual(gap.allOf[0].then.not.required, ["acceptedAnswers"]);
});

test("API pessoal rejeita curso sem escopo, cursor incompleto e parentId incoerente", async () => {
  const withoutRead = memoryAdapter({ scopes: ["authoring:private:write"] });
  const forbidden = await invoke(handler(withoutRead), "/v1/library/courses");
  const adapter = memoryAdapter();
  const app = handler(adapter);
  const cursor = await invoke(app, "/v1/library/courses?afterPosition=2");
  const missingParent = await invoke(
    app,
    `/v1/library/courses/${COURSE_ID}/structure?section=cards`
  );
  const moduleParent = await invoke(
    app,
    `/v1/library/courses/${COURSE_ID}/structure?section=modules&parentId=${MODULE_ID}`
  );

  assert.equal(forbidden.response.status, 403);
  assert.equal(forbidden.json.error.code, "insufficient_scope");
  assert.equal(cursor.response.status, 422);
  assert.equal(missingParent.response.status, 422);
  assert.equal(moduleParent.response.status, 422);
  assert.equal(adapter.calls.length, 0);
});

test("API pessoal valida e encaminha somente comandos estreitos", async () => {
  const adapter = memoryAdapter();
  const app = handler(adapter);
  const cases = [
    {
      method: "PATCH",
      path: `/v1/library/courses/${COURSE_ID}`,
      requestId: "personal-course-rename",
      body: { title: "Título pessoal" },
      adapterName: "renamePersonalLibraryCourse",
      identity: ["courseId", COURSE_ID]
    },
    {
      method: "POST",
      path: "/v1/library/paths",
      requestId: "personal-path-create",
      body: { title: "Nova trilha" },
      adapterName: "createPersonalStudyPath"
    },
    {
      method: "PATCH",
      path: `/v1/library/paths/${PATH_ID}`,
      requestId: "personal-path-rename",
      body: { title: "Trilha renomeada" },
      adapterName: "renamePersonalStudyPath",
      identity: ["pathId", PATH_ID]
    },
    {
      method: "DELETE",
      path: `/v1/library/paths/${PATH_ID}`,
      requestId: "personal-path-delete",
      body: {},
      adapterName: "deletePersonalStudyPath",
      identity: ["pathId", PATH_ID]
    },
    {
      method: "PUT",
      path: `/v1/library/selections/${SELECTION_ID}/path`,
      requestId: "personal-course-move",
      body: { targetPathId: PATH_ID },
      adapterName: "movePersonalCourseSelection",
      identity: ["selectionId", SELECTION_ID]
    },
    {
      method: "PUT",
      path: `/v1/library/selections/${SELECTION_ID}/path`,
      requestId: "personal-course-unassign",
      body: { targetPathId: null },
      adapterName: "movePersonalCourseSelection",
      identity: ["selectionId", SELECTION_ID]
    }
  ];

  for (const item of cases) {
    const body = { requestId: item.requestId, ...item.body };
    const result = await invoke(app, item.path, {
      method: item.method,
      requestIdHeader: item.requestId,
      body
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.json));
    const [name, args] = adapter.calls.at(-1);
    assert.equal(name, item.adapterName);
    assert.equal(args.requestId, item.requestId);
    if (item.identity) assert.equal(args[item.identity[0]], item.identity[1]);
  }
  assert.equal(adapter.calls.at(-1)[1].targetPathId, null);
});

test("comandos pessoais rejeitam escrita sem escopo, campo extra e destino omitido", async () => {
  const readOnly = memoryAdapter({ scopes: ["authoring:private:read"] });
  const forbidden = await invoke(
    handler(readOnly),
    `/v1/library/courses/${COURSE_ID}`,
    {
      method: "PATCH",
      body: { requestId: "personal-forbidden-01", title: "Outro título" }
    }
  );
  const adapter = memoryAdapter();
  const app = handler(adapter);
  const extra = await invoke(app, "/v1/library/paths", {
    method: "POST",
    body: {
      requestId: "personal-extra-field",
      title: "Trilha",
      ownerId: ACTOR_ID
    }
  });
  const omitted = await invoke(
    app,
    `/v1/library/selections/${SELECTION_ID}/path`,
    {
      method: "PUT",
      body: { requestId: "personal-move-empty" }
    }
  );

  assert.equal(forbidden.response.status, 403);
  assert.equal(extra.response.status, 422);
  assert.equal(omitted.response.status, 422);
  assert.equal(readOnly.calls.length, 0);
  assert.equal(adapter.calls.length, 0);
});

test("adaptador pessoal usa apenas RPCs encapsuladas e propaga ator e cliente", async () => {
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.example",
    serverApiKey: "server-key",
    publishableKey: "publishable-key"
  });
  const calls = [];
  adapter.rpc = async (name, payload) => {
    calls.push([name, payload]);
    return { status: "ok" };
  };
  const actor = principal();

  await adapter.listPersonalLibraryCourses({
    principal: actor,
    limit: 12,
    query: "redes"
  });
  await adapter.getPersonalLibraryCourseStructure({
    principal: actor,
    courseId: COURSE_ID,
    section: "lessons",
    parentId: MODULE_ID
  });
  await adapter.listPersonalStudyPaths({ principal: actor });
  await adapter.renamePersonalLibraryCourse({
    principal: actor,
    requestId: "personal-adapter-course",
    courseId: COURSE_ID,
    title: "Redes"
  });
  await adapter.createPersonalStudyPath({
    principal: actor,
    requestId: "personal-adapter-create",
    title: "Infraestrutura"
  });
  await adapter.renamePersonalStudyPath({
    principal: actor,
    requestId: "personal-adapter-rename",
    pathId: PATH_ID,
    title: "Infraestrutura e redes"
  });
  await adapter.deletePersonalStudyPath({
    principal: actor,
    requestId: "personal-adapter-delete",
    pathId: PATH_ID
  });
  await adapter.movePersonalCourseSelection({
    principal: actor,
    requestId: "personal-adapter-move",
    selectionId: SELECTION_ID,
    targetPathId: PATH_ID
  });

  assert.deepEqual(calls.map(([name]) => name), [
    "list_personal_library_courses",
    "get_personal_library_course_structure",
    "list_personal_study_paths",
    "rename_personal_library_course",
    "create_personal_study_path",
    "rename_personal_study_path",
    "delete_personal_study_path",
    "move_personal_course_selection"
  ]);
  assert.equal(
    calls.every(([, payload]) => (
      payload.p_actor_user_id === ACTOR_ID
      && payload.p_client_id === CLIENT_ID
    )),
    true
  );
  assert.equal(calls[0][1].p_query, "redes");
  assert.equal(calls[1][1].p_parent_id, MODULE_ID);
  assert.equal(calls.at(-1)[1].p_target_path_id, PATH_ID);
});

test("MCP pessoal expõe ferramentas por escopo e mapeia rotas estreitas", () => {
  const readNames = new Set(
    authoringMcpToolsForPrincipal(principal(["authoring:private:read"]))
      .map((entry) => entry.name)
  );
  const writeNames = new Set(
    authoringMcpToolsForPrincipal(principal(["authoring:private:write"]))
      .map((entry) => entry.name)
  );
  const editorialNames = new Set(
    authoringMcpToolsForPrincipal(principal(["catalog:publish"]))
      .map((entry) => entry.name)
  );
  for (const name of [
    "listarCursosDaBibliotecaPessoal",
    "consultarEstruturaDoCursoSelecionado",
    "listarTrilhasPessoais"
  ]) {
    assert.equal(readNames.has(name), true, name);
    assert.equal(writeNames.has(name), false, name);
    assert.equal(editorialNames.has(name), false, name);
  }
  for (const name of [
    "renomearCursoPessoal",
    "criarTrilhaPessoal",
    "renomearTrilhaPessoal",
    "excluirTrilhaPessoal",
    "moverCursoParaTrilha"
  ]) {
    assert.equal(writeNames.has(name), true, name);
    assert.equal(readNames.has(name), false, name);
    assert.equal(editorialNames.has(name), false, name);
  }

  const courses = mapAuthoringMcpToolCall("listarCursosDaBibliotecaPessoal", {
    limit: 20,
    query: "redes"
  });
  const structure = mapAuthoringMcpToolCall(
    "consultarEstruturaDoCursoSelecionado",
    {
      courseId: COURSE_ID,
      section: "lessons",
      parentId: MODULE_ID,
      limit: 40
    }
  );
  const move = mapAuthoringMcpToolCall("moverCursoParaTrilha", {
    requestId: "personal-mcp-move",
    selectionId: SELECTION_ID,
    targetPathId: PATH_ID
  });
  const unassign = mapAuthoringMcpToolCall("moverCursoParaTrilha", {
    requestId: "personal-mcp-unassign",
    selectionId: SELECTION_ID,
    targetPathId: null
  });

  assert.equal(courses.method, "GET");
  assert.equal(courses.path, "/v1/library/courses?limit=20&query=redes");
  assert.equal(
    structure.path,
    `/v1/library/courses/${COURSE_ID}/structure`
      + `?section=lessons&parentId=${MODULE_ID}&limit=40`
  );
  assert.equal(move.path, `/v1/library/selections/${SELECTION_ID}/path`);
  assert.deepEqual(move.body, {
    requestId: "personal-mcp-move",
    targetPathId: PATH_ID
  });
  assert.equal(unassign.body.targetPathId, null);
  assert.equal(JSON.stringify([courses, structure, move]).includes("service_role"), false);
});

test("MCP pessoal executa o comando com a identidade resolvida da chave", async () => {
  const adapter = memoryAdapter();
  const app = createAuthoringMcpHandler({
    adapter,
    allowedOrigins: new Set([ORIGIN])
  });
  const response = await app(new Request(
    "https://edge.example/functions/v1/aralearn-authoring-mcp",
    {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION,
        "X-AraLearn-API-Key": API_KEY
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "moverCursoParaTrilha",
          arguments: {
            requestId: "personal-mcp-execute",
            selectionId: SELECTION_ID,
            targetPathId: PATH_ID
          }
        }
      })
    }
  ));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.result.isError, false);
  assert.equal(body.result.structuredContent.data.selectionId, SELECTION_ID);
  assert.equal(adapter.calls.length, 1);
  const [name, args] = adapter.calls[0];
  assert.equal(name, "movePersonalCourseSelection");
  assert.equal(args.principal.actorId, ACTOR_ID);
  assert.equal(args.principal.clientId, CLIENT_ID);
  assert.equal(args.targetPathId, PATH_ID);
});
