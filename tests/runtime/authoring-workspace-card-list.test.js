import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import {
  prepareAuthoringContext
} from "../../supabase/functions/_shared/aralearn-authoring/authoringKnowledge.js";
import { executeAuthoringRoute } from "../../supabase/functions/_shared/aralearn-authoring/routerV4.js";
import { SupabaseAuthoringAdapter } from "../../supabase/functions/_shared/aralearn-authoring/supabaseAdapter.js";
import {
  AUTHORING_WORKSPACE_MCP_TOOLS,
  authoringMcpToolIsAllowed,
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";
import {
  workspaceRoute
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceProtocol.js";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const MICROSEQUENCE_PATH = [
  "course-cloud",
  "module-cloud",
  "lesson-containers",
  "micro-kubernetes"
];

function principal(scopes = ["authoring:private:read"]) {
  return {
    actorId: ACTOR_ID,
    authenticationKind: "oauth",
    scopes
  };
}

test("MCP anuncia a listagem leve workspace-only com cursor genérico pareado", () => {
  const definition = AUTHORING_WORKSPACE_MCP_TOOLS.find(
    ({ name }) => name === "listarCardsDaMicrossequencia"
  );
  assert.ok(definition);
  assert.equal(definition.annotations.readOnlyHint, true);
  assert.match(definition.description, /workspace/iu);
  assert.match(definition.description, /importe/iu);
  assert.deepEqual(
    definition.outputSchema.oneOf[0].properties.data.required,
    [
      "workspaceId",
      "revision",
      "microsequencePath",
      "items",
      "hasMore",
      "nextCursor"
    ]
  );

  const mapped = mapAuthoringMcpToolCall(definition.name, {
    workspaceId: WORKSPACE_ID,
    microsequencePath: MICROSEQUENCE_PATH,
    limit: 20,
    afterPosition: 3,
    afterId: "card-id-textual"
  });
  const url = new URL(mapped.path, "https://edge.example");
  assert.equal(
    url.pathname,
    `/v1/workspaces/${WORKSPACE_ID}/microsequence-cards`
  );
  assert.deepEqual(
    JSON.parse(url.searchParams.get("microsequencePath")),
    MICROSEQUENCE_PATH
  );
  assert.equal(url.searchParams.get("afterId"), "card-id-textual");
  assert.equal(mapped.body, null);

  assert.throws(
    () => mapAuthoringMcpToolCall(definition.name, {
      workspaceId: WORKSPACE_ID,
      microsequencePath: MICROSEQUENCE_PATH,
      afterPosition: 3
    }),
    (error) => error instanceof AuthoringApiError
      && error.code === "invalid_tool_arguments"
  );
  assert.equal(authoringMcpToolIsAllowed(definition.name, principal()), true);
  assert.equal(authoringMcpToolIsAllowed(definition.name, principal([])), false);
});

test("RAG operacional recomenda a descoberta leve antes da correção do card", () => {
  const prepared = prepareAuthoringContext({
    intent: "revise",
    targetEntity: "card",
    context: "Corrigir um card ready sem carregar o curso inteiro."
  });
  assert.ok(
    prepared.recommendedTools.includes("listarCardsDaMicrossequencia")
  );
  assert.ok(
    prepared.guidance.some(({ id }) => id === "atomic-workspace-card-review")
  );
});

test("rota valida caminho, limite e cursor antes de chamar o adapter", async () => {
  const path = `/v1/workspaces/${WORKSPACE_ID}/microsequence-cards`;
  const route = workspaceRoute("GET", path);
  assert.deepEqual(route, {
    name: "listWorkspaceMicrosequenceCards",
    workspaceId: WORKSPACE_ID
  });
  let received = null;
  const request = new Request(
    `https://edge.example${path}?microsequencePath=${
      encodeURIComponent(JSON.stringify(MICROSEQUENCE_PATH))
    }&limit=2&afterPosition=4&afterId=card-4`
  );
  const result = await executeAuthoringRoute({
    request,
    route,
    principal: principal(),
    adapter: {
      async listWorkspaceMicrosequenceCards(options) {
        received = options;
        return {
          workspaceId: WORKSPACE_ID,
          revision: 7,
          microsequencePath: MICROSEQUENCE_PATH,
          items: [],
          hasMore: false,
          nextCursor: null
        };
      }
    }
  });

  assert.deepEqual(received, {
    principal: principal(),
    workspaceId: WORKSPACE_ID,
    microsequencePath: MICROSEQUENCE_PATH,
    limit: 2,
    afterPosition: 4,
    afterId: "card-4"
  });
  assert.equal(result.data.revision, 7);

  await assert.rejects(
    () => executeAuthoringRoute({
      request: new Request(
        `https://edge.example${path}?microsequencePath=${
          encodeURIComponent(JSON.stringify(MICROSEQUENCE_PATH))
        }&afterPosition=4`
      ),
      route,
      principal: principal(),
      adapter: {}
    }),
    (error) => error?.code === "invalid_pagination"
  );
  await assert.rejects(
    () => executeAuthoringRoute({
      request: new Request(
        `https://edge.example${path}?microsequencePath=${
          encodeURIComponent(JSON.stringify(MICROSEQUENCE_PATH.slice(0, 3)))
        }`
      ),
      route,
      principal: principal(),
      adapter: {}
    }),
    (error) => error?.code === "invalid_workspace_entity_path"
  );
});

test("adapter chama uma RPC relacional direta, sem compor documento nem abrir Storage", async () => {
  const calls = [];
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://project.example",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    fetchImpl: async () => {
      throw new Error("a listagem não deve fazer download de artefato");
    }
  });
  adapter.rpc = async (name, payload, options) => {
    calls.push({ name, payload, options });
    return [{
      workspaceId: WORKSPACE_ID,
      revision: 9,
      microsequencePath: MICROSEQUENCE_PATH,
      items: [{
        id: "card-5",
        position: 5,
        kind: "exercise",
        resources: ["paragraph"],
        summary: "Recuperação ativa"
      }],
      hasMore: false,
      nextCursor: null
    }];
  };

  const result = await adapter.listWorkspaceMicrosequenceCards({
    principal: principal(),
    workspaceId: WORKSPACE_ID,
    microsequencePath: MICROSEQUENCE_PATH,
    limit: 10,
    afterPosition: 4,
    afterId: "card-4",
    deadlineAt: 12345
  });
  assert.equal(result.items[0].id, "card-5");
  assert.deepEqual(calls, [{
    name: "list_authoring_workspace_microsequence_cards_v5",
    payload: {
      p_owner_id: ACTOR_ID,
      p_workspace_id: WORKSPACE_ID,
      p_microsequence_path: MICROSEQUENCE_PATH,
      p_limit: 10,
      p_after_position: 4,
      p_after_id: "card-4"
    },
    options: { deadlineAt: 12345 }
  }]);
});

test("migration pagina rows correntes e não projeta o conteúdo integral do card", async () => {
  const source = await readFile(
    new URL(
      "../../supabase/migrations/20260730140000_composed_authoring_and_catalog_review.sql",
      import.meta.url
    ),
    "utf8"
  );
  const match = source.match(
    /create function public\.list_authoring_workspace_microsequence_cards_v5\([\s\S]+?\n\$function\$;/iu
  );
  assert.ok(match);
  const functionSource = match[0];
  assert.match(
    functionSource,
    /from private\.authoring_workspace_entities card/iu
  );
  assert.match(functionSource, /limit p_limit \+ 1/iu);
  assert.match(functionSource, /'resources', jsonb_build_array/iu);
  assert.match(functionSource, /'summary', page\.summary/iu);
  assert.doesNotMatch(functionSource, /'content'\s*,\s*page\.content/iu);
  assert.match(
    source,
    /'list_authoring_workspace_microsequence_cards_v5'/u
  );
});
