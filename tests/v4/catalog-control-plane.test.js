import assert from "node:assert/strict";
import test from "node:test";

import {
  authoringMcpToolsForPrincipal,
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";
import { routeRequest } from "../../supabase/functions/_shared/aralearn-authoring/protocol.js";
import {
  executeAuthoringRoute
} from "../../supabase/functions/_shared/aralearn-authoring/routerV4.js";
import { SupabaseAuthoringAdapter } from "../../supabase/functions/_shared/aralearn-authoring/supabaseAdapter.js";

const ACTOR_ID = "10000000-0000-4000-8000-000000000001";
const COURSE_ID = "30000000-0000-4000-8000-000000000001";

function principal(scopes = ["catalog:publish"]) {
  return {
    actorId: ACTOR_ID,
    oauthClientId: "catalog-test",
    authenticationKind: "oauth",
    scopes
  };
}

test("catálogo expõe listas e lê conteúdo somente pelo contrato do MCP", () => {
  assert.throws(
    () => routeRequest("GET", `/v1/catalog/courses/${COURSE_ID}`),
    /Endpoint inexistente/u
  );
  assert.deepEqual(routeRequest("GET", `/v1/courses/${COURSE_ID}/content`), {
    name: "readCourseContent",
    courseId: COURSE_ID
  });
  assert.throws(
    () => routeRequest("GET", `/v1/catalog/courses/${COURSE_ID}/structure`),
    /Endpoint inexistente/u
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("consultarEstruturaDoCursoNoCatalogo", {
      courseId: COURSE_ID,
      section: "modules"
    }),
    /Ferramenta inexistente/u
  );
});

test("ferramentas editoriais administram somente metadados e artefatos", () => {
  const names = new Set(authoringMcpToolsForPrincipal(principal()).map((tool) => tool.name));
  for (const expected of [
    "listarColecoesDoCatalogo",
    "listarCursosDaColecao"
  ]) {
    assert.equal(names.has(expected), true, expected);
  }
  for (const retired of [
    "consultarEstruturaDoCursoNoCatalogo",
    "listarFilaEditorialDoCatalogo",
    "iniciarRevisaoDeOferta",
    "decidirOfertaDoCatalogo"
  ]) {
    assert.equal(names.has(retired), false, retired);
  }
});

test("autor privado lê o catálogo ativo sem receber capacidade de publicação", async () => {
  const privatePrincipal = principal([
    "authoring:private:read",
    "authoring:private:write"
  ]);
  const names = new Set(
    authoringMcpToolsForPrincipal(privatePrincipal).map((tool) => tool.name)
  );
  assert.equal(names.has("listarColecoesDoCatalogo"), true);
  assert.equal(names.has("listarCursosDaColecao"), true);

  let received = null;
  const result = await executeAuthoringRoute({
    request: new Request("https://edge.example/v1/catalog/collections?limit=20"),
    route: routeRequest("GET", "/v1/catalog/collections"),
    adapter: {
      async listCatalogCollections(options) {
        received = options;
        return { items: [] };
      }
    },
    principal: privatePrincipal
  });
  assert.equal(received.includeRetired, false);
  assert.deepEqual(result.data, { items: [] });

  await assert.rejects(
    () => executeAuthoringRoute({
      request: new Request(
        "https://edge.example/v1/catalog/collections?includeRetired=true"
      ),
      route: routeRequest("GET", "/v1/catalog/collections"),
      adapter: { async listCatalogCollections() { return { items: [] }; } },
      principal: privatePrincipal
    }),
    (error) => error?.code === "insufficient_scope"
  );
});

test("adaptador de autoria lista somente catálogo publicado por RPC v4", async () => {
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
  const privatePrincipal = principal(["authoring:private:read"]);
  await adapter.listCatalogCollections({ principal: privatePrincipal });
  await adapter.listCatalogCourses({
    principal: privatePrincipal,
    collectionId: "20000000-0000-4000-8000-000000000001"
  });

  assert.match(
    calls[0].url,
    /\/rest\/v1\/rpc\/list_authoring_catalog_collections_v4$/u
  );
  assert.match(
    calls[1].url,
    /\/rest\/v1\/rpc\/list_authoring_catalog_courses_v4$/u
  );
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_owner_id: ACTOR_ID,
    p_limit: 50,
    p_after_position: null,
    p_after_id: null,
    p_query: ""
  });
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    p_owner_id: ACTOR_ID,
    p_collection_id: "20000000-0000-4000-8000-000000000001",
    p_limit: 50,
    p_after_position: null,
    p_after_id: null,
    p_query: ""
  });
});
