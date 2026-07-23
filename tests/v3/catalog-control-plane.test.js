import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { parse as parseYaml } from "yaml";

import { createAuthoringHandler } from "../../supabase/functions/_shared/aralearn-authoring/router.js";
import {
  authoringMcpToolsForPrincipal,
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/mcpTools.js";
import {
  SupabaseAuthoringAdapter
} from "../../supabase/functions/_shared/aralearn-authoring/supabaseAdapter.js";
import {
  AuthoringApiError
} from "../../supabase/functions/_shared/aralearn-authoring/errors.js";

const ORIGIN = "https://client.example";
const API_KEY = `arl_${"C".repeat(32)}`;
const ACTOR_ID = "10000000-0000-4000-8000-000000000001";
const COLLECTION_ID = "20000000-0000-4000-8000-000000000001";
const SECOND_COLLECTION_ID = "20000000-0000-4000-8000-000000000002";
const COURSE_ID = "30000000-0000-4000-8000-000000000001";
const MODULE_ID = "40000000-0000-4000-8000-000000000001";
const OPENAPI_URL = new URL(
  "../../docs/openapi/aralearn-authoring-api.yaml",
  import.meta.url
);

function principal(scopes = ["catalog:publish"]) {
  return {
    actorId: ACTOR_ID,
    clientId: "catalog-test",
    authenticationKind: "api_key",
    scopes
  };
}

function memoryAdapter({ scopes = ["catalog:publish"], overrides = {} } = {}) {
  return {
    calls: [],
    async resolvePrincipal() {
      return principal(scopes);
    },
    async listCatalogCollections(args) {
      this.calls.push(["listCatalogCollections", args]);
      return {
        items: [{
          collectionId: COLLECTION_ID,
          title: "Coleção vazia",
          courseCount: 0,
          revision: 1
        }],
        nextCursor: null
      };
    },
    async listCatalogCourses(args) {
      this.calls.push(["listCatalogCourses", args]);
      return { collectionId: args.collectionId, items: [], nextCursor: null };
    },
    async getCatalogCourse(args) {
      this.calls.push(["getCatalogCourse", args]);
      return {
        courseId: args.courseId,
        title: "Curso de controle",
        goal: "Testar o catálogo.",
        revision: 3,
        counts: { modules: 1, lessons: 2, microsequences: 4, cards: 20 }
      };
    },
    async getCatalogCourseStructure(args) {
      this.calls.push(["getCatalogCourseStructure", args]);
      return {
        course: {
          courseId: args.courseId,
          title: "Curso de controle",
          contentHash: "c".repeat(64)
        },
        authoringUpdate: {
          mode: "update",
          existingCourseId: args.courseId,
          expectedContentHash: "c".repeat(64),
          directTreeMutation: false
        },
        section: args.section,
        parentId: args.parentId,
        items: [{
          id: MODULE_ID,
          title: "Módulo de controle",
          position: 0
        }],
        nextCursor: null
      };
    },
    async updateCatalogCourseMetadata(args) {
      this.calls.push(["updateCatalogCourseMetadata", args]);
      return {
        status: "updated",
        courseId: args.courseId,
        title: args.title || "Curso de controle",
        goal: args.goal || "Testar o catálogo.",
        revision: args.baseRevision + 1
      };
    },
    async createCatalogCollection(args) {
      this.calls.push(["createCatalogCollection", args]);
      return { status: "created", collectionId: COLLECTION_ID, revision: 1 };
    },
    async renameCatalogCollection(args) {
      this.calls.push(["renameCatalogCollection", args]);
      return { status: "renamed", collectionId: args.collectionId, revision: 2 };
    },
    async retireCatalogCollection(args) {
      this.calls.push(["retireCatalogCollection", args]);
      return { status: "retired", collectionId: args.collectionId };
    },
    async reorderCatalogCollections(args) {
      this.calls.push(["reorderCatalogCollections", args]);
      return { status: "reordered", orderedCollectionCount: args.order.length };
    },
    async moveCatalogCourse(args) {
      this.calls.push(["moveCatalogCourse", args]);
      return { status: "moved", courseId: args.courseId };
    },
    async reorderCatalogCourses(args) {
      this.calls.push(["reorderCatalogCourses", args]);
      return { status: "reordered", orderedCourseCount: args.order.length };
    },
    ...overrides
  };
}

async function invoke(handler, path, {
  method = "GET",
  body,
  requestIdHeader = ""
} = {}) {
  const headers = {
    Origin: ORIGIN,
    Authorization: `Bearer ${API_KEY}`
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (requestIdHeader) headers["Idempotency-Key"] = requestIdHeader;
  const response = await handler(new Request(`https://edge.example${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }));
  return { response, json: await response.json() };
}

function handler(adapter) {
  return createAuthoringHandler({
    adapter,
    allowedOrigins: new Set([ORIGIN])
  });
}

test("descoberta administrativa inclui coleção vazia e preserva paginação", async () => {
  const adapter = memoryAdapter();
  const result = await invoke(
    handler(adapter),
    `/v1/catalog/collections?limit=25&query=rede&afterPosition=4&afterId=${COLLECTION_ID}`
      + "&includeRetired=true"
  );

  assert.equal(result.response.status, 200);
  assert.equal(result.json.data.items[0].courseCount, 0);
  const [, args] = adapter.calls[0];
  assert.equal(args.limit, 25);
  assert.equal(args.query, "rede");
  assert.equal(args.afterPosition, 4);
  assert.equal(args.afterId, COLLECTION_ID);
  assert.equal(args.includeRetired, true);
});

test("paginação rejeita cursor incompleto antes de consultar o banco", async () => {
  const adapter = memoryAdapter();
  const result = await invoke(
    handler(adapter),
    "/v1/catalog/collections?afterPosition=2"
  );

  assert.equal(result.response.status, 422);
  assert.equal(result.json.error.code, "invalid_pagination");
  assert.equal(adapter.calls.length, 0);
});

test("escopo sem catalog:publish não descobre nem modifica o catálogo", async () => {
  const adapter = memoryAdapter({ scopes: ["authoring:private:read"] });
  const list = await invoke(handler(adapter), "/v1/catalog/collections");
  const write = await invoke(handler(adapter), "/v1/catalog/collections", {
    method: "POST",
    body: {
      requestId: "catalog-scope-01",
      contractKey: "redes",
      title: "Redes"
    }
  });
  const course = await invoke(handler(adapter), `/v1/catalog/courses/${COURSE_ID}`);
  const structure = await invoke(
    handler(adapter),
    `/v1/catalog/courses/${COURSE_ID}/structure?section=modules`
  );

  assert.equal(list.response.status, 403);
  assert.equal(write.response.status, 403);
  assert.equal(course.response.status, 403);
  assert.equal(structure.response.status, 403);
  assert.equal(list.json.error.code, "insufficient_scope");
  assert.equal(adapter.calls.length, 0);
});

test("consulta individual não devolve a árvore e patch altera somente título ou objetivo", async () => {
  const adapter = memoryAdapter();
  const app = handler(adapter);
  const read = await invoke(app, `/v1/catalog/courses/${COURSE_ID}`);
  const update = await invoke(app, `/v1/catalog/courses/${COURSE_ID}`, {
    method: "PATCH",
    requestIdHeader: "catalog-course-title",
    body: {
      requestId: "catalog-course-title",
      baseRevision: 3,
      title: "Curso de controle revisado"
    }
  });

  assert.equal(read.response.status, 200);
  assert.equal(read.json.data.courseId, COURSE_ID);
  assert.equal(read.json.data.cards, undefined);
  assert.deepEqual(read.json.data.counts, {
    modules: 1,
    lessons: 2,
    microsequences: 4,
    cards: 20
  });
  assert.equal(update.response.status, 200);
  const [name, args] = adapter.calls.at(-1);
  assert.equal(name, "updateCatalogCourseMetadata");
  assert.equal(args.courseId, COURSE_ID);
  assert.equal(args.title, "Curso de controle revisado");
  assert.equal(args.goal, null);
});

test("estrutura do catálogo é formal, paginada e orienta atualização atômica", async () => {
  const adapter = memoryAdapter();
  const result = await invoke(
    handler(adapter),
    `/v1/catalog/courses/${COURSE_ID}/structure`
      + `?section=lessons&parentId=${MODULE_ID}&limit=12`
      + `&afterPosition=3&afterId=${MODULE_ID}`
  );

  assert.equal(result.response.status, 200);
  assert.equal(result.json.data.section, "lessons");
  assert.equal(result.json.data.items[0].title, "Módulo de controle");
  assert.deepEqual(result.json.data.authoringUpdate, {
    mode: "update",
    existingCourseId: COURSE_ID,
    expectedContentHash: "c".repeat(64),
    directTreeMutation: false
  });
  const [name, args] = adapter.calls.at(-1);
  assert.equal(name, "getCatalogCourseStructure");
  assert.equal(args.parentId, MODULE_ID);
  assert.equal(args.limit, 12);
  assert.equal(args.afterPosition, 3);
  assert.equal(args.afterId, MODULE_ID);
});

test("estrutura recusa seção desconhecida e cursor incompleto", async () => {
  const adapter = memoryAdapter();
  const app = handler(adapter);
  const section = await invoke(
    app,
    `/v1/catalog/courses/${COURSE_ID}/structure?section=document`
  );
  const cursor = await invoke(
    app,
    `/v1/catalog/courses/${COURSE_ID}/structure`
      + "?section=cards&afterPosition=2"
  );

  assert.equal(section.response.status, 422);
  assert.equal(section.json.error.code, "invalid_structure_section");
  assert.equal(cursor.response.status, 422);
  assert.equal(cursor.json.error.code, "invalid_pagination");
  assert.equal(adapter.calls.length, 0);
});

test("árvore publicada não possui rota de escrita direta", async () => {
  const adapter = memoryAdapter();
  const result = await invoke(
    handler(adapter),
    `/v1/catalog/courses/${COURSE_ID}/structure`,
    {
      method: "PATCH",
      body: {
        requestId: "catalog-direct-tree",
        section: "blocks",
        items: []
      }
    }
  );

  assert.equal(result.response.status, 404);
  assert.equal(result.json.error.code, "not_found");
  assert.equal(adapter.calls.length, 0);
});

test("patch de curso recusa campo imutável e alteração vazia", async () => {
  const adapter = memoryAdapter();
  const app = handler(adapter);
  const immutable = await invoke(app, `/v1/catalog/courses/${COURSE_ID}`, {
    method: "PATCH",
    body: {
      requestId: "catalog-immutable-01",
      baseRevision: 3,
      contractKey: "outro-curso",
      title: "Outro curso"
    }
  });
  const empty = await invoke(app, `/v1/catalog/courses/${COURSE_ID}`, {
    method: "PATCH",
    body: {
      requestId: "catalog-empty-patch",
      baseRevision: 3
    }
  });

  assert.equal(immutable.response.status, 422);
  assert.match(immutable.json.error.message, /contractKey/u);
  assert.equal(empty.response.status, 422);
  assert.equal(adapter.calls.length, 0);
});

test("patch de curso conserva conflito de revisão como resposta 409", async () => {
  const adapter = memoryAdapter({
    overrides: {
      async updateCatalogCourseMetadata(args) {
        this.calls.push(["updateCatalogCourseMetadata", args]);
        throw new AuthoringApiError(
          409,
          "revision_conflict",
          "Os metadados do curso mudaram desde a leitura."
        );
      }
    }
  });
  const result = await invoke(handler(adapter), `/v1/catalog/courses/${COURSE_ID}`, {
    method: "PATCH",
    body: {
      requestId: "catalog-course-stale",
      baseRevision: 2,
      goal: "Objetivo novo"
    }
  });

  assert.equal(result.response.status, 409);
  assert.equal(result.json.error.code, "revision_conflict");
});

test("comandos estreitos conservam identidade da rota e requestId", async () => {
  const adapter = memoryAdapter();
  const app = handler(adapter);
  const cases = [
    {
      path: "/v1/catalog/collections",
      method: "POST",
      body: {
        requestId: "catalog-create-01",
        contractKey: "redes",
        title: "Redes",
        description: ""
      },
      name: "createCatalogCollection"
    },
    {
      path: `/v1/catalog/collections/${COLLECTION_ID}`,
      method: "PATCH",
      body: {
        requestId: "catalog-rename-01",
        baseRevision: 1,
        title: "Redes de computadores"
      },
      name: "renameCatalogCollection",
      identity: ["collectionId", COLLECTION_ID]
    },
    {
      path: `/v1/catalog/collections/${COLLECTION_ID}/retire`,
      method: "POST",
      body: {
        requestId: "catalog-retire-01",
        baseRevision: 1,
        replacementCollectionId: SECOND_COLLECTION_ID
      },
      name: "retireCatalogCollection",
      identity: ["collectionId", COLLECTION_ID]
    },
    {
      path: `/v1/catalog/courses/${COURSE_ID}/placement`,
      method: "PUT",
      body: {
        requestId: "catalog-move-001",
        baseRevision: 1,
        targetCollectionId: SECOND_COLLECTION_ID
      },
      name: "moveCatalogCourse",
      identity: ["courseId", COURSE_ID]
    }
  ];

  for (const item of cases) {
    const result = await invoke(app, item.path, {
      method: item.method,
      body: item.body,
      requestIdHeader: item.body.requestId
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.json));
    const [name, args] = adapter.calls.at(-1);
    assert.equal(name, item.name);
    assert.equal(args.requestId, item.body.requestId);
    if (item.identity) assert.equal(args[item.identity[0]], item.identity[1]);
  }
});

test("patch de catálogo rejeita campo desconhecido e requestId divergente", async () => {
  const adapter = memoryAdapter();
  const unknown = await invoke(
    handler(adapter),
    `/v1/catalog/collections/${COLLECTION_ID}`,
    {
      method: "PATCH",
      body: {
        requestId: "catalog-patch-01",
        baseRevision: 1,
        title: "Redes",
        position: 9
      }
    }
  );
  const mismatch = await invoke(handler(adapter), "/v1/catalog/collections", {
    method: "POST",
    requestIdHeader: "catalog-header-01",
    body: {
      requestId: "catalog-body-0001",
      contractKey: "redes",
      title: "Redes"
    }
  });

  assert.equal(unknown.response.status, 422);
  assert.equal(mismatch.response.status, 422);
  assert.equal(mismatch.json.error.code, "request_id_mismatch");
  assert.equal(adapter.calls.length, 0);
});

test("adaptador usa somente as RPCs administrativas e identifica o ator", async () => {
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

  await adapter.listCatalogCollections({
    principal: actor,
    limit: 10,
    query: "dados",
    includeRetired: false
  });
  await adapter.getCatalogCourse({
    principal: actor,
    courseId: COURSE_ID
  });
  await adapter.getCatalogCourseStructure({
    principal: actor,
    courseId: COURSE_ID,
    section: "cards",
    parentId: MODULE_ID,
    limit: 8
  });
  await adapter.updateCatalogCourseMetadata({
    principal: actor,
    requestId: "catalog-course-rpc",
    courseId: COURSE_ID,
    baseRevision: 2,
    title: "Título novo"
  });
  await adapter.moveCatalogCourse({
    principal: actor,
    requestId: "catalog-move-rpc",
    courseId: COURSE_ID,
    targetCollectionId: COLLECTION_ID,
    baseRevision: 7
  });
  await adapter.reorderCatalogCourses({
    principal: actor,
    requestId: "catalog-order-rpc",
    collectionId: COLLECTION_ID,
    order: [{ courseId: COURSE_ID, baseRevision: 7 }]
  });

  assert.deepEqual(calls.map(([name]) => name), [
    "list_catalog_collections_admin",
    "get_catalog_course_admin",
    "get_catalog_course_structure_admin",
    "update_catalog_course_metadata_admin",
    "move_catalog_course_admin",
    "reorder_catalog_courses_admin"
  ]);
  assert.equal(calls.every(([, payload]) => payload.p_actor_user_id === ACTOR_ID), true);
  assert.equal(calls[1][1].p_course_id, COURSE_ID);
  assert.equal(calls[2][1].p_section, "cards");
  assert.equal(calls[2][1].p_parent_id, MODULE_ID);
  assert.equal(calls[3][1].p_title, "Título novo");
  assert.equal(calls[4][1].p_course_id, COURSE_ID);
  assert.equal(calls[5][1].p_collection_id, COLLECTION_ID);
});

test("ferramentas MCP administrativas só aparecem com escopo editorial", () => {
  const ordinary = authoringMcpToolsForPrincipal(principal(["authoring:private:write"]));
  const publisher = authoringMcpToolsForPrincipal(principal(["catalog:publish"]));
  const names = new Set(publisher.map((tool) => tool.name));

  assert.equal(ordinary.some((tool) => tool.name === "moverCursoNoCatalogo"), false);
  for (const expected of [
    "listarColecoesDoCatalogo",
    "listarCursosDaColecao",
    "consultarCursoDoCatalogo",
    "consultarEstruturaDoCursoNoCatalogo",
    "atualizarCursoDoCatalogo",
    "criarColecaoDoCatalogo",
    "renomearColecaoDoCatalogo",
    "aposentarColecaoDoCatalogo",
    "reordenarColecoesDoCatalogo",
    "moverCursoNoCatalogo",
    "reordenarCursosDaColecao"
  ]) {
    assert.equal(names.has(expected), true, expected);
  }
});

test("mapeamento MCP gera rotas estreitas sem acesso bruto a tabelas", () => {
  const list = mapAuthoringMcpToolCall("listarCursosDaColecao", {
    collectionId: COLLECTION_ID,
    limit: 20,
    query: "lógica"
  });
  const move = mapAuthoringMcpToolCall("moverCursoNoCatalogo", {
    requestId: "catalog-move-mcp",
    courseId: COURSE_ID,
    targetCollectionId: SECOND_COLLECTION_ID,
    baseRevision: 4
  });
  const read = mapAuthoringMcpToolCall("consultarCursoDoCatalogo", {
    courseId: COURSE_ID
  });
  const update = mapAuthoringMcpToolCall("atualizarCursoDoCatalogo", {
    requestId: "catalog-update-course",
    courseId: COURSE_ID,
    baseRevision: 8,
    goal: "Novo objetivo"
  });
  const structure = mapAuthoringMcpToolCall(
    "consultarEstruturaDoCursoNoCatalogo",
    {
      courseId: COURSE_ID,
      section: "blocks",
      parentId: MODULE_ID,
      limit: 10,
      afterPosition: 2,
      afterId: MODULE_ID
    }
  );

  assert.equal(
    list.path,
    `/v1/catalog/collections/${COLLECTION_ID}/courses?limit=20&query=l%C3%B3gica`
  );
  assert.equal(list.method, "GET");
  assert.equal(list.body, null);
  assert.equal(move.path, `/v1/catalog/courses/${COURSE_ID}/placement`);
  assert.equal(move.method, "PUT");
  assert.deepEqual(move.body, {
    requestId: "catalog-move-mcp",
    targetCollectionId: SECOND_COLLECTION_ID,
    baseRevision: 4
  });
  assert.equal(read.path, `/v1/catalog/courses/${COURSE_ID}`);
  assert.equal(read.method, "GET");
  assert.equal(read.body, null);
  assert.equal(update.path, `/v1/catalog/courses/${COURSE_ID}`);
  assert.equal(update.method, "PATCH");
  assert.deepEqual(update.body, {
    requestId: "catalog-update-course",
    baseRevision: 8,
    goal: "Novo objetivo"
  });
  assert.equal(
    structure.path,
    `/v1/catalog/courses/${COURSE_ID}/structure`
      + `?section=blocks&parentId=${MODULE_ID}&limit=10`
      + `&afterPosition=2&afterId=${MODULE_ID}`
  );
  assert.equal(structure.method, "GET");
  assert.equal(structure.body, null);
  assert.equal(
    JSON.stringify([list, move, read, update, structure])
      .includes("service_role"),
    false
  );
});

test("OpenAPI geral documenta o plano de controle sem abrir campos imutáveis", async () => {
  const document = parseYaml(await fs.readFile(OPENAPI_URL, "utf8"));
  const expected = new Map([
    ["GET /v1/catalog/collections", "listarColecoesDoCatalogo"],
    ["POST /v1/catalog/collections", "criarColecaoDoCatalogo"],
    ["PUT /v1/catalog/collections/order", "reordenarColecoesDoCatalogo"],
    ["PATCH /v1/catalog/collections/{collectionId}", "renomearColecaoDoCatalogo"],
    ["POST /v1/catalog/collections/{collectionId}/retire", "aposentarColecaoDoCatalogo"],
    ["GET /v1/catalog/collections/{collectionId}/courses", "listarCursosDaColecao"],
    ["PUT /v1/catalog/collections/{collectionId}/courses/order", "reordenarCursosDaColecao"],
    ["GET /v1/catalog/courses/{courseId}", "consultarCursoDoCatalogo"],
    [
      "GET /v1/catalog/courses/{courseId}/structure",
      "consultarEstruturaDoCursoNoCatalogo"
    ],
    ["PATCH /v1/catalog/courses/{courseId}", "atualizarCursoDoCatalogo"],
    ["PUT /v1/catalog/courses/{courseId}/placement", "moverCursoNoCatalogo"]
  ]);
  for (const [signature, operationId] of expected) {
    const [method, path] = signature.split(" ");
    assert.equal(document.paths[path][method.toLowerCase()].operationId, operationId);
  }
  const patchSchema = document.components.schemas.UpdateCatalogCourseRequest;
  assert.deepEqual(Object.keys(patchSchema.properties).sort(), [
    "baseRevision",
    "goal",
    "requestId",
    "title"
  ]);
  assert.equal(patchSchema.additionalProperties, false);
});
