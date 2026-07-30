import assert from "node:assert/strict";
import test from "node:test";

import {
  authoringMcpToolsForPrincipal,
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";
import { routeRequest } from "../../supabase/functions/_shared/aralearn-authoring/protocol.js";
import { SupabaseAuthoringAdapter } from "../../supabase/functions/_shared/aralearn-authoring/supabaseAdapter.js";

const ACTOR_ID = "10000000-0000-4000-8000-000000000001";
const CLIENT_ID = "10000000-0000-4000-8000-000000000002";
const COURSE_ID = "20000000-0000-4000-8000-000000000001";

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

test("adaptador pessoal consulta somente resumos encapsulados", async () => {
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
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/list_personal_library_courses$/u);
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body, {
    p_owner_id: ACTOR_ID,
    p_limit: 50,
    p_after_position: null,
    p_after_selection_id: null,
    p_query: ""
  });
});
