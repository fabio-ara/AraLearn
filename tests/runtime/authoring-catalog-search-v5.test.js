import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { PGlite } from "@electric-sql/pglite";

import {
  createAuthoringActionHandler
} from "../../supabase/functions/_shared/aralearn-authoring/actionServer.js";
import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import { routeRequest } from "../../supabase/functions/_shared/aralearn-authoring/protocol.js";
import {
  SupabaseAuthoringAdapter
} from "../../supabase/functions/_shared/aralearn-authoring/supabaseAdapter.js";
import {
  AUTHORING_WORKSPACE_MCP_TOOLS,
  authoringMcpToolIsAllowed,
  authoringMcpToolsForPrincipal,
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const migration = fs.readFileSync(path.join(
  repositoryRoot,
  "supabase",
  "migrations",
  "20260730140000_composed_authoring_and_catalog_review.sql"
), "utf8");

const ACTION_URL = "https://edge.example/functions/v1/aralearn-authoring-action";
const MCP_URL = "https://edge.example/functions/v1/aralearn-authoring-mcp";
const ACTOR_ID = "10000000-0000-4000-8000-000000000001";
const COURSE_ID = "20000000-0000-4000-8000-000000000001";
const COLLECTION_ID = "30000000-0000-4000-8000-000000000001";
const PLACEMENT_ID = "40000000-0000-4000-8000-000000000001";
const HASH = "a".repeat(64);

function principal(scopes = ["catalog:read"]) {
  return {
    actorId: ACTOR_ID,
    authenticationKind: "oauth",
    oauthClientId: "catalog-search-client",
    scopes
  };
}

function resultData() {
  return {
    query: "nuvem virtualização",
    items: [{
      placementId: PLACEMENT_ID,
      courseId: COURSE_ID,
      contractKey: "dataprev-cloud",
      title: "Computação em Nuvem",
      goal: "Compreender nuvem e virtualização.",
      contentHash: HASH,
      revision: 4,
      moduleCount: 2,
      lessonCount: 6,
      microsequenceCount: 18,
      cardCount: 72,
      updatedAt: "2026-07-30T12:00:00.000Z",
      collection: {
        collectionId: COLLECTION_ID,
        contractKey: "concursos-dataprev",
        title: "Dataprev"
      }
    }],
    nextCursor: {
      afterTitle: "Computação em Nuvem",
      afterCourseId: COURSE_ID
    }
  };
}

function adapter(principalValue = principal()) {
  const calls = [];
  return {
    calls,
    async resolveActionPrincipal() {
      return principalValue;
    },
    async resolvePrincipal() {
      return principalValue;
    },
    async searchCatalogCourses(options) {
      calls.push(options);
      return resultData();
    }
  };
}

function toolDefinition() {
  const definition = AUTHORING_WORKSPACE_MCP_TOOLS.find(
    ({ name }) => name === "consultarCatalogo"
  );
  assert.ok(definition);
  return definition;
}

function searchInputSchema() {
  const branch = toolDefinition().inputSchema.oneOf.find(
    (candidate) =>
      candidate.properties?.operation?.const === "search_courses"
  );
  assert.ok(branch);
  return branch;
}

function validateSuccess(envelope) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true
  });
  addFormats(ajv);
  const validate = ajv.compile(toolDefinition().outputSchema);
  assert.equal(validate(envelope), true, JSON.stringify(validate.errors, null, 2));
}

function actionHandler(adapterValue) {
  return createAuthoringActionHandler({
    adapter: adapterValue,
    allowedOrigins: new Set(["https://chatgpt.com"]),
    actionBaseUrl: ACTION_URL,
    publicAppUrl: "https://app.example/AraLearn/"
  });
}

function actionRequest(argumentsValue) {
  return new Request(`${ACTION_URL}/consultarCatalogo`, {
    method: "POST",
    headers: {
      Authorization: "Bearer action-token",
      "Content-Type": "application/json",
      Origin: "https://chatgpt.com"
    },
    body: JSON.stringify(argumentsValue)
  });
}

function mcpHandler(adapterValue) {
  return createAuthoringMcpHandler({
    adapter: adapterValue,
    allowedOrigins: new Set(["https://client.example"]),
    resourceUrl: MCP_URL,
    authorizationServer: "https://project.example/auth/v1"
  });
}

function mcpRequest(argumentsValue) {
  return new Request(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer header.oauth-payload.signature",
      Origin: "https://client.example",
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "consultarCatalogo",
        arguments: argumentsValue
      }
    })
  });
}

function definitionBlock(qualifiedName) {
  const start = migration.indexOf(`create function ${qualifiedName}(`);
  assert.notEqual(start, -1, qualifiedName);
  const end = migration.indexOf("$function$;", start);
  assert.notEqual(end, -1, qualifiedName);
  return migration.slice(start, end + "$function$;".length);
}

async function createCatalogDatabase() {
  const database = new PGlite();
  await database.exec(`
    create schema auth;
    create schema private;

    create table auth.users (
      id uuid primary key
    );
    create table public.catalog_collections (
      id uuid primary key,
      contract_key text not null,
      title text not null,
      description text not null default '',
      is_published boolean not null default true,
      deleted_at timestamptz
    );
    create table public.courses (
      id uuid primary key,
      owner_id uuid,
      contract_key text not null,
      title text not null,
      goal text not null,
      status text not null default 'published',
      deleted_at timestamptz,
      document_storage_enabled boolean not null default true,
      content_hash text,
      catalog_revision bigint not null default 1,
      module_count bigint not null default 0,
      lesson_count bigint not null default 0,
      microsequence_count bigint not null default 0,
      card_count bigint not null default 0,
      updated_at timestamptz not null default now()
    );
    create table public.catalog_collection_courses (
      id uuid primary key,
      collection_id uuid not null references public.catalog_collections(id),
      course_id uuid not null references public.courses(id),
      deleted_at timestamptz
    );
    create function private.require_workspace_actor_v5(
      p_actor_id uuid,
      p_scope text
    )
    returns void
    language plpgsql
    as $$
    begin
      if p_scope <> 'catalog:read'
         or not exists (
           select 1 from auth.users account where account.id = p_actor_id
         ) then
        raise exception 'Identidade inválida.' using errcode = '42501';
      end if;
    end;
    $$;
  `);
  await database.exec(definitionBlock("public.search_authoring_catalog_courses_v5"));
  await database.query("insert into auth.users(id) values ($1)", [ACTOR_ID]);
  await database.exec(`
    insert into public.catalog_collections(
      id, contract_key, title, description, is_published
    ) values
      ('30000000-0000-4000-8000-000000000001',
       'concursos-dataprev', 'Dataprev', 'Provas da banca FGV', true),
      ('30000000-0000-4000-8000-000000000002',
       'infraestrutura', 'Infraestrutura', 'Nuvem e virtualização', true),
      ('30000000-0000-4000-8000-000000000003',
       'retirada', 'Coleção retirada', 'Nuvem', false);

    insert into public.courses(
      id, contract_key, title, goal, content_hash, catalog_revision,
      module_count, lesson_count, microsequence_count, card_count, updated_at
    ) values
      ('20000000-0000-4000-8000-000000000001',
       'dataprev-cloud', 'Computação em Nuvem',
       'Compreender virtualização para a Dataprev.',
       '${"a".repeat(64)}', 4, 2, 6, 18, 72, '2026-07-30T12:00:00Z'),
      ('20000000-0000-4000-8000-000000000002',
       'kubernetes', 'Kubernetes Essencial',
       'Aplicar orquestração de contêineres.',
       '${"b".repeat(64)}', 2, 1, 3, 8, 32, '2026-07-30T13:00:00Z'),
      ('20000000-0000-4000-8000-000000000003',
       'seguranca-cloud', 'Segurança de Nuvem',
       'Aplicar controles de acesso.',
       '${"c".repeat(64)}', 1, 1, 2, 5, 20, '2026-07-30T14:00:00Z'),
      ('20000000-0000-4000-8000-000000000004',
       'curso-retirado', 'Nuvem Retirada',
       'Não deve aparecer.',
       '${"d".repeat(64)}', 1, 1, 1, 1, 1, '2026-07-30T15:00:00Z');

    insert into public.catalog_collection_courses(
      id, collection_id, course_id
    ) values
      ('40000000-0000-4000-8000-000000000001',
       '30000000-0000-4000-8000-000000000001',
       '20000000-0000-4000-8000-000000000001'),
      ('40000000-0000-4000-8000-000000000002',
       '30000000-0000-4000-8000-000000000002',
       '20000000-0000-4000-8000-000000000002'),
      ('40000000-0000-4000-8000-000000000003',
       '30000000-0000-4000-8000-000000000002',
       '20000000-0000-4000-8000-000000000003'),
      ('40000000-0000-4000-8000-000000000004',
       '30000000-0000-4000-8000-000000000003',
       '20000000-0000-4000-8000-000000000004');
  `);
  return database;
}

async function search(database, {
  query,
  limit = 20,
  afterTitle = null,
  afterCourseId = null
}) {
  const result = await database.query(
    `select public.search_authoring_catalog_courses_v5(
       $1, $2, $3, $4, $5
     ) as value`,
    [ACTOR_ID, query, limit, afterTitle, afterCourseId]
  );
  return result.rows[0].value;
}

test("registro expõe busca somente para catalog:read com contrato fechado", () => {
  const definition = toolDefinition();
  const branch = searchInputSchema();
  assert.equal(branch.required.includes("query"), true);
  assert.equal(branch.properties.query.minLength, 2);
  assert.equal(branch.properties.query.maxLength, 200);
  assert.equal(branch.properties.limit.maximum, 50);
  assert.equal(definition.annotations.readOnlyHint, true);
  assert.equal(authoringMcpToolIsAllowed(
    "consultarCatalogo",
    principal()
  ), true);
  assert.equal(authoringMcpToolIsAllowed(
    "consultarCatalogo",
    principal(["authoring:private:read", "authoring:private:write"])
  ), false);
  assert.equal(
    authoringMcpToolsForPrincipal(
      principal(["authoring:private:read", "authoring:private:write"])
    ).some(({ name }) => name === "consultarCatalogo"),
    false
  );
  assert.equal(
    AUTHORING_WORKSPACE_MCP_TOOLS
      .some(({ name }) => name === "buscarCursosNoCatalogo"),
    false
  );
});

test("mapeamento mantém consulta, limite e cursor pareado na rota leve", () => {
  const operation = mapAuthoringMcpToolCall("consultarCatalogo", {
    operation: "search_courses",
    query: "nuvem virtualização",
    limit: 10,
    afterTitle: "Computação em Nuvem",
    afterCourseId: COURSE_ID
  });
  assert.equal(operation.method, "GET");
  assert.equal(operation.body, null);
  assert.equal(operation.requestId, null);
  assert.equal(
    operation.path,
    "/v1/catalog/courses/search?query=nuvem+virtualiza%C3%A7%C3%A3o"
      + "&limit=10&afterTitle=Computa%C3%A7%C3%A3o+em+Nuvem"
      + `&afterCourseId=${COURSE_ID}`
  );
  assert.deepEqual(
    routeRequest("GET", "/v1/catalog/courses/search"),
    { name: "searchCatalogCourses" }
  );
  for (const invalid of [
    { query: "x" },
    { query: "  " },
    { query: "nuvem", limit: 51 },
    { query: "nuvem", afterTitle: "Computação em Nuvem" },
    { query: "nuvem", afterCourseId: COURSE_ID },
    { query: "nuvem", legacyCollectionScan: true }
  ]) {
    assert.throws(
      () => mapAuthoringMcpToolCall("consultarCatalogo", {
        operation: "search_courses",
        ...invalid
      }),
      (error) => error?.code === "invalid_tool_arguments"
    );
  }
});

test("adapter chama somente a RPC v5 com parâmetros compactos", async () => {
  const calls = [];
  const value = await SupabaseAuthoringAdapter.prototype.searchCatalogCourses.call({
    async rpc(name, payload, options) {
      calls.push({ name, payload, options });
      return [resultData()];
    }
  }, {
    principal: principal(),
    query: "nuvem virtualização",
    limit: 10,
    afterTitle: "Computação em Nuvem",
    afterCourseId: COURSE_ID,
    deadlineAt: 1234
  });
  assert.deepEqual(value, resultData());
  assert.deepEqual(calls, [{
    name: "search_authoring_catalog_courses_v5",
    payload: {
      p_owner_id: ACTOR_ID,
      p_query: "nuvem virtualização",
      p_limit: 10,
      p_after_title: "Computação em Nuvem",
      p_after_course_id: COURSE_ID
    },
    options: { deadlineAt: 1234 }
  }]);
});

test("Action e MCP executam a mesma busca e preservam o outputSchema", async () => {
  const argumentsValue = {
    operation: "search_courses",
    query: "nuvem virtualização",
    limit: 10,
    afterTitle: "Computação em Nuvem",
    afterCourseId: COURSE_ID
  };
  const actionAdapter = adapter();
  const actionResponse = await actionHandler(actionAdapter)(
    actionRequest(argumentsValue)
  );
  const actionEnvelope = await actionResponse.json();
  assert.equal(actionResponse.status, 200, JSON.stringify(actionEnvelope));
  assert.equal(actionEnvelope.ok, true);
  validateSuccess(actionEnvelope);

  const mcpAdapter = adapter();
  const mcpResponse = await mcpHandler(mcpAdapter)(mcpRequest(argumentsValue));
  const mcpPayload = await mcpResponse.json();
  assert.equal(mcpResponse.status, 200);
  assert.equal(mcpPayload.result.isError, false, JSON.stringify(mcpPayload));
  validateSuccess(mcpPayload.result.structuredContent);

  for (const current of [actionAdapter, mcpAdapter]) {
    assert.equal(current.calls.length, 1);
    assert.equal(current.calls[0].principal.actorId, ACTOR_ID);
    assert.deepEqual({
      query: current.calls[0].query,
      limit: current.calls[0].limit,
      afterTitle: current.calls[0].afterTitle,
      afterCourseId: current.calls[0].afterCourseId
    }, {
      query: argumentsValue.query,
      limit: argumentsValue.limit,
      afterTitle: argumentsValue.afterTitle,
      afterCourseId: argumentsValue.afterCourseId
    });
  }
});

test("perfil privado não anuncia nem executa a busca global", async () => {
  const privateAdapter = adapter(
    principal(["authoring:private:read", "authoring:private:write"])
  );
  const response = await actionHandler(privateAdapter)(
    actionRequest({ operation: "search_courses", query: "nuvem" })
  );
  const payload = await response.json();
  assert.equal(response.status, 403);
  assert.equal(payload.error.code, "insufficient_scope");
  assert.deepEqual(privateAdapter.calls, []);
});

test("PostgreSQL aplica tokens AND, coleção ativa e cursor determinístico sem artefato", async () => {
  const definition = definitionBlock(
    "public.search_authoring_catalog_courses_v5"
  );
  assert.match(
    definition,
    /regexp_split_to_table\(v_query, '\[\[:space:\]\]\+'\)[\s\S]+strpos\([\s\S]+course\.title[\s\S]+course\.goal[\s\S]+course\.contract_key[\s\S]+collection\.title[\s\S]+collection\.description/u
  );
  assert.doesNotMatch(
    definition,
    /artifact_refs|course_revisions|storage\.objects|get_course_document/u
  );

  const database = await createCatalogDatabase();
  try {
    const crossField = await search(database, {
      query: "NUVEM dataprev"
    });
    assert.deepEqual(
      crossField.items.map(({ courseId }) => courseId),
      ["20000000-0000-4000-8000-000000000001"]
    );
    assert.equal(crossField.items[0].collection.title, "Dataprev");
    assert.equal(crossField.items[0].cardCount, 72);

    const collectionDescription = await search(database, {
      query: "KUBERNETES virtualização"
    });
    assert.deepEqual(
      collectionDescription.items.map(({ courseId }) => courseId),
      ["20000000-0000-4000-8000-000000000002"]
    );

    const firstPage = await search(database, { query: "nuvem", limit: 2 });
    assert.deepEqual(
      firstPage.items.map(({ title }) => title),
      ["Computação em Nuvem", "Kubernetes Essencial"]
    );
    assert.deepEqual(firstPage.nextCursor, {
      afterTitle: "Kubernetes Essencial",
      afterCourseId: "20000000-0000-4000-8000-000000000002"
    });
    const secondPage = await search(database, {
      query: "nuvem",
      limit: 2,
      afterTitle: firstPage.nextCursor.afterTitle,
      afterCourseId: firstPage.nextCursor.afterCourseId
    });
    assert.deepEqual(
      secondPage.items.map(({ title }) => title),
      ["Segurança de Nuvem"]
    );
    assert.equal(secondPage.nextCursor, null);
    assert.equal(
      [...firstPage.items, ...secondPage.items]
        .some(({ title }) => title === "Nuvem Retirada"),
      false
    );

    const wildcardLiteral = await search(database, { query: "%_" });
    assert.deepEqual(wildcardLiteral.items, []);
    await assert.rejects(
      () => search(database, { query: "x" }),
      /Busca ou paginação do catálogo inválida/u
    );
    await assert.rejects(
      () => search(database, {
        query: "nuvem",
        afterTitle: "Computação em Nuvem"
      }),
      /Busca ou paginação do catálogo inválida/u
    );
  } finally {
    await database.close();
  }
});
