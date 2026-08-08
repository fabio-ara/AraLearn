import assert from "node:assert/strict";
import test from "node:test";

import {
  authoringMcpToolsForPrincipal,
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";
import { routeRequest } from "../../supabase/functions/_shared/aralearn-authoring/protocol.js";
import { executeAuthoringRoute } from "../../supabase/functions/_shared/aralearn-authoring/routerV4.js";
import { SupabaseAuthoringAdapter } from "../../supabase/functions/_shared/aralearn-authoring/supabaseAdapter.js";

const ACTOR_ID = "10000000-0000-4000-8000-000000000001";
const CLIENT_ID = "10000000-0000-4000-8000-000000000002";
const COURSE_ID = "20000000-0000-4000-8000-000000000001";
const SELECTION_ID = "30000000-0000-4000-8000-000000000001";
const CONTENT_HASH = "a".repeat(64);

function principal(scopes = ["authoring:private:read", "authoring:private:write"]) {
  return {
    actorId: ACTOR_ID,
    oauthClientId: CLIENT_ID,
    authenticationKind: "oauth",
    scopes
  };
}

test("biblioteca pessoal expõe resumos e não uma estrutura PostgreSQL", () => {
  assert.deepEqual(routeRequest("GET", "/v1/library/courses"), {
    name: "listPersonalLibraryCourses"
  });
  assert.throws(
    () => routeRequest("GET", `/v1/library/courses/${COURSE_ID}/structure`),
    /Endpoint inexistente/u
  );
  assert.throws(
    () => routeRequest("DELETE", `/v1/library/courses/${COURSE_ID}`),
    /Endpoint inexistente/u
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("consultarEstruturaDoCursoSelecionado", {
      courseId: COURSE_ID,
      section: "modules"
    }),
    /Ferramenta inexistente/u
  );
});

test("MCP pessoal mantém organização e autoria por artefatos", () => {
  const names = new Set(authoringMcpToolsForPrincipal(principal()).map((tool) => tool.name));
  for (const expected of [
    "listarCursosDaBibliotecaPessoal",
    "criarWorkspaceDeAutoria",
    "lerWorkspaceDeAutoria",
    "lerConteudoDoCurso"
  ]) {
    assert.equal(names.has(expected), true, expected);
  }
  for (const retired of [
    "consultarEstruturaDoCursoSelecionado",
    "listarCursosElegiveisParaCatalogo",
    "listarMinhasOfertasAoCatalogo",
    "oferecerCursoAoCatalogo",
    "retirarOfertaDoCatalogo"
  ]) {
    assert.equal(names.has(retired), false, retired);
  }
});

test("retirada de Trilhas usa contrato destrutivo, idempotente e com CAS", () => {
  const definition = authoringMcpToolsForPrincipal(principal())
    .find(({ name }) => name === "retirarCursoDasTrilhas");
  assert.ok(definition);
  assert.equal(definition.annotations.destructiveHint, true);
  assert.equal(definition.annotations.idempotentHint, true);
  assert.deepEqual(
    new Set(definition.inputSchema.required),
    new Set([
      "requestId", "selectionId", "courseId", "expectedContentHash"
    ])
  );
  const operation = mapAuthoringMcpToolCall("retirarCursoDasTrilhas", {
    requestId: "remove-trilhas-0001",
    selectionId: SELECTION_ID,
    courseId: COURSE_ID,
    expectedContentHash: CONTENT_HASH
  });
  assert.deepEqual(operation, {
    method: "POST",
    path: `/v1/library/courses/${COURSE_ID}/remove`,
    body: {
      requestId: "remove-trilhas-0001",
      selectionId: SELECTION_ID,
      expectedContentHash: CONTENT_HASH
    },
    requestId: "remove-trilhas-0001"
  });
  assert.deepEqual(
    routeRequest("POST", `/v1/library/courses/${COURSE_ID}/remove`),
    { name: "removePersonalLibraryCourse", courseId: COURSE_ID }
  );
});

test("rota compartilhada retira somente a seleção explicitamente lida", async () => {
  let received = null;
  const result = await executeAuthoringRoute({
    request: new Request(`https://edge.example/v1/library/courses/${COURSE_ID}/remove`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "remove-trilhas-0001"
      },
      body: JSON.stringify({
        requestId: "remove-trilhas-0001",
        selectionId: SELECTION_ID,
        expectedContentHash: CONTENT_HASH
      })
    }),
    route: routeRequest("POST", `/v1/library/courses/${COURSE_ID}/remove`),
    principal: principal(),
    adapter: {
      async removePersonalLibraryCourse(options) {
        received = options;
        return {
          status: "removed",
          selectionId: SELECTION_ID,
          courseId: COURSE_ID,
          kind: "official",
          courseArchived: false,
          idempotent: false
        };
      }
    }
  });
  assert.deepEqual(received, {
    principal: principal(),
    courseId: COURSE_ID,
    requestId: "remove-trilhas-0001",
    selectionId: SELECTION_ID,
    expectedContentHash: CONTENT_HASH
  });
  assert.equal(result.requestId, "remove-trilhas-0001");
  assert.equal(result.data.kind, "official");
  assert.equal(result.data.courseArchived, false);
});

test("adaptador pessoal consulta a mesma projeção canônica de Trilhas", async () => {
  const calls = [];
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://example.supabase.co",
    serverApiKey: "service-role-test",
    publishableKey: "publishable-test",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify([{ items: [] }]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });
  assert.equal(typeof adapter.getPersonalLibraryCourseStructure, "undefined");
  await adapter.listPersonalLibraryCourses({ principal: principal() });
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/list_trail_items_for_actor_v1$/u);
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body, {
    p_actor_id: ACTOR_ID,
    p_limit: 20,
    p_after_path_position: null,
    p_after_item_position: null,
    p_after_id: null
  });
});

test("projeção MCP de Trilhas inclui progresso agregado sem carregar o curso", () => {
  const definition = authoringMcpToolsForPrincipal(principal())
    .find(({ name }) => name === "listarCursosDaBibliotecaPessoal");
  const successSchema = definition.outputSchema.oneOf
    .find((branch) => branch.properties?.ok?.const === true);
  const itemSchema = successSchema.properties.data
    .properties.items.items;
  assert.equal(itemSchema.required.includes("completedCardCount"), true);
  assert.deepEqual(itemSchema.properties.completedCardCount, {
    type: "integer",
    minimum: 0
  });
});

test("adaptador retira curso por RPC estreita e traduz submissão ativa", async () => {
  const calls = [];
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://example.supabase.co",
    serverApiKey: "service-role-test",
    publishableKey: "publishable-test",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify([{
        status: "removed",
        selectionId: SELECTION_ID,
        courseId: COURSE_ID,
        kind: "personal",
        courseArchived: true,
        idempotent: false
      }]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });
  const removed = await adapter.removePersonalLibraryCourse({
    principal: principal(),
    requestId: "remove-trilhas-0001",
    selectionId: SELECTION_ID,
    courseId: COURSE_ID,
    expectedContentHash: CONTENT_HASH
  });
  assert.equal(removed.courseArchived, true);
  assert.match(
    calls[0].url,
    /\/rest\/v1\/rpc\/remove_course_from_personal_library_v5$/u
  );
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_actor_id: ACTOR_ID,
    p_selection_id: SELECTION_ID,
    p_course_id: COURSE_ID,
    p_request_id: "remove-trilhas-0001",
    p_expected_content_hash: CONTENT_HASH
  });

  const blocked = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://example.supabase.co",
    serverApiKey: "service-role-test",
    publishableKey: "publishable-test",
    fetchImpl: async () => new Response(JSON.stringify({
      code: "AS409",
      message: "internal detail is not exposed"
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })
  });
  await assert.rejects(
    () => blocked.removePersonalLibraryCourse({
      principal: principal(),
      requestId: "remove-trilhas-0002",
      selectionId: SELECTION_ID,
      courseId: COURSE_ID,
      expectedContentHash: CONTENT_HASH
    }),
    (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.code, "active_catalog_submission");
      return true;
    }
  );
});
