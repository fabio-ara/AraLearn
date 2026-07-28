import assert from "node:assert/strict";
import test from "node:test";

import {
  authoringMcpToolsForPrincipal,
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/mcpTools.js";
import { routeRequest } from "../../supabase/functions/_shared/aralearn-authoring/protocol.js";
import { SupabaseAuthoringAdapter } from "../../supabase/functions/_shared/aralearn-authoring/supabaseAdapter.js";

const ACTOR_ID = "10000000-0000-4000-8000-000000000001";
const COURSE_ID = "30000000-0000-4000-8000-000000000001";

function principal(scopes = ["catalog:publish"]) {
  return {
    actorId: ACTOR_ID,
    clientId: "catalog-test",
    authenticationKind: "api_key",
    scopes
  };
}

test("catálogo expõe metadados e não reabre a árvore relacional", () => {
  assert.deepEqual(
    routeRequest("GET", `/v1/catalog/courses/${COURSE_ID}`),
    { name: "getCatalogCourse", courseId: COURSE_ID }
  );
  assert.throws(
    () => routeRequest("GET", `/v1/catalog/courses/${COURSE_ID}/structure`),
    /Endpoint inexistente/u
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("consultarEstruturaDoCursoNoCatalogo", {
      courseId: COURSE_ID,
      section: "modules"
    }),
    /Ferramenta de autoria inexistente/u
  );
});

test("ferramentas editoriais administram somente metadados e artefatos", () => {
  const names = new Set(authoringMcpToolsForPrincipal(principal()).map((tool) => tool.name));
  for (const expected of [
    "listarColecoesDoCatalogo",
    "listarCursosDaColecao",
    "consultarCursoDoCatalogo"
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

test("adaptador usa RPC de metadados sem método de estrutura", async () => {
  const calls = [];
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://example.supabase.co",
    serverApiKey: "service-role-test",
    publishableKey: "publishable-test",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify([{ courseId: COURSE_ID }]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });
  assert.equal(typeof adapter.getCatalogCourseStructure, "undefined");
  await adapter.getCatalogCourse({ principal: principal(), courseId: COURSE_ID });
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/get_catalog_course_admin$/u);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.p_actor_user_id, ACTOR_ID);
  assert.equal(body.p_course_id, COURSE_ID);
});
