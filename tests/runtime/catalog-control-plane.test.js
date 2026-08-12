import assert from "node:assert/strict";
import test from "node:test";

import {
  authoringMcpToolsForPrincipal,
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";
import { routeRequest } from "../../supabase/functions/_shared/aralearn-authoring/protocol.js";
import {
  executeAuthoringRoute
} from "../../supabase/functions/_shared/aralearn-authoring/authoringRouter.js";
import { SupabaseAuthoringAdapter } from "../../supabase/functions/_shared/aralearn-authoring/supabaseAdapter.js";

const ACTOR_ID = "10000000-0000-4000-8000-000000000001";
const COURSE_ID = "30000000-0000-4000-8000-000000000001";

function principal(scopes = [
  "catalog:read", "catalog:review", "catalog:publish", "catalog:manage"
]) {
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

test("conta editorial recebe leitura e comandos estreitos do catálogo", () => {
  const names = new Set(authoringMcpToolsForPrincipal(principal()).map((tool) => tool.name));
  for (const expected of [
    "consultarCatalogo",
    "editarCatalogo",
    "retirarDoCatalogo",
    "listarRevisoesEditoriais"
  ]) {
    assert.equal(names.has(expected), true, expected);
  }
  for (const retired of [
    "consultarEstruturaDoCursoNoCatalogo",
    "listarFilaEditorialDoCatalogo",
    "iniciarRevisaoDeOferta",
    "decidirOfertaDoCatalogo",
    "listarColecoesDoCatalogo",
    "listarCursosDaColecao",
    "criarColecaoNoCatalogo",
    "atualizarColecaoDoCatalogo",
    "retirarColecaoDoCatalogo",
    "moverCursoNoCatalogo",
    "retirarCursoDoCatalogo"
  ]) {
    assert.equal(names.has(retired), false, retired);
  }
});

test("autor privado opera somente a biblioteca de Trilhas", async () => {
  const privatePrincipal = principal([
    "authoring:private:read",
    "authoring:private:write"
  ]);
  const names = new Set(
    authoringMcpToolsForPrincipal(privatePrincipal).map((tool) => tool.name)
  );
  assert.equal(names.has("consultarCatalogo"), false);
  assert.equal(names.has("listarRevisoesEditoriais"), false);
  assert.equal(names.has("listarCursosDaBibliotecaPessoal"), true);

  await assert.rejects(
    () => executeAuthoringRoute({
      request: new Request("https://edge.example/v1/catalog/collections"),
      route: routeRequest("GET", "/v1/catalog/collections"),
      adapter: { async listCatalogCollections() { return { items: [] }; } },
      principal: privatePrincipal
    }),
    (error) => error?.code === "insufficient_scope"
  );
});

test("fila editorial propaga cursor keyset estrito até o adaptador", async () => {
  const beforeSubmittedAt = "2026-07-30T15:00:00.000Z";
  const beforeId = "40000000-0000-4000-8000-000000000001";
  let received = null;
  const reviewPrincipal = principal(["catalog:review"]);
  const adapter = {
    async listCatalogReviews(options) {
      received = options;
      return { view: "queue", items: [], hasMore: false, nextCursor: null };
    }
  };
  const path = "/v1/catalog/reviews";
  await executeAuthoringRoute({
    request: new Request(
      `https://edge.example${path}?view=queue&limit=25`
      + `&beforeSubmittedAt=${encodeURIComponent(beforeSubmittedAt)}`
      + `&beforeId=${beforeId}`
    ),
    route: routeRequest("GET", path),
    adapter,
    principal: reviewPrincipal
  });
  assert.deepEqual(received, {
    principal: reviewPrincipal,
    view: "queue",
    limit: 25,
    beforeSubmittedAt,
    beforeId
  });

  for (const query of [
    `view=queue&beforeSubmittedAt=${encodeURIComponent(beforeSubmittedAt)}`,
    `view=queue&beforeSubmittedAt=${encodeURIComponent("2026-02-30T15:00:00Z")}&beforeId=${beforeId}`,
    "view=unknown"
  ]) {
    await assert.rejects(
      () => executeAuthoringRoute({
        request: new Request(`https://edge.example${path}?${query}`),
        route: routeRequest("GET", path),
        adapter,
        principal: reviewPrincipal
      }),
      (error) => error?.status === 422
    );
  }
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
    p_after_id: null,
    p_query: ""
  });
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    p_owner_id: ACTOR_ID,
    p_collection_id: "20000000-0000-4000-8000-000000000001",
    p_limit: 50,
    p_after_id: null,
    p_query: ""
  });
});

test("adaptador distingue envio já em revisão de claim editorial indisponível", async () => {
  const errorAdapter = (databaseCode) => new SupabaseAuthoringAdapter({
    supabaseUrl: "https://example.supabase.co",
    serverApiKey: "service-role-test",
    publishableKey: "publishable-test",
    fetchImpl: async () => new Response(JSON.stringify({
      code: databaseCode,
      message: "detalhe interno não deve orientar o cliente"
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })
  });

  await assert.rejects(
    () => errorAdapter("RS409").submitCourseForReview({
      principal: principal(["catalog:submit"]),
      submissionId: "40000000-0000-4000-8000-000000000001",
      courseId: COURSE_ID,
      expectedContentHash: "a".repeat(64)
    }),
    (error) => error?.status === 409
      && error?.code === "catalog_review_in_progress"
  );

  await assert.rejects(
    () => errorAdapter("RC409").claimCatalogReview({
      principal: principal(["catalog:review"]),
      submissionId: "40000000-0000-4000-8000-000000000002"
    }),
    (error) => error?.status === 409
      && error?.code === "catalog_review_unavailable"
  );
});

test("adaptador distingue reutilização de requestId de conflito estrutural", async () => {
  const adapterFor = (body) => new SupabaseAuthoringAdapter({
    supabaseUrl: "https://example.supabase.co",
    serverApiKey: "service-role-test",
    publishableKey: "publishable-test",
    attempts: 1,
    fetchImpl: async () => new Response(JSON.stringify(body), {
      status: 409,
      headers: { "Content-Type": "application/json" }
    })
  });

  await assert.rejects(
    () => adapterFor({
      code: "23505",
      message: "requestId reutilizado com dados diferentes."
    }).rpc("teste", {}),
    (error) => error?.status === 409
      && error?.code === "idempotency_key_reused"
  );

  await assert.rejects(
    () => adapterFor({
      code: "23505",
      message: "O identificador oficial já existe."
    }).rpc("teste", {}),
    (error) => error?.status === 409
      && error?.code === "conflict"
  );

  await assert.rejects(
    () => adapterFor({
      code: "CS409",
      message: "requestId já foi usado com outro comando."
    }).rpc("teste", {}),
    (error) => error?.status === 409
      && error?.code === "idempotency_key_reused"
  );
});
