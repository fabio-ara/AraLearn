import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

import { LearningSpaces } from "../../src/supabase/LearningSpaces.js";
import { RemoteCourseCatalog } from "../../src/supabase/RemoteCourseCatalog.js";
import { validateWorkspaceObservationActionPayload } from "../../supabase/functions/_shared/aralearn-authoring/workspaceProtocol.js";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000002";

function sessionStore() {
  const values = new Map();
  return {
    values,
    async getSyncState(key) { return values.get(key) ?? null; },
    async putSyncState(key, value) {
      if (value === null) values.delete(key);
      else values.set(key, value);
    }
  };
}

function authClient(store) {
  return {
    sessionStore: store,
    getSession: () => ({ user: { id: USER_ID } })
  };
}

test("Trilhas guarda somente a projeção corrente por conta e a reutiliza offline", async () => {
  const store = sessionStore();
  const calls = [];
  const spaces = new LearningSpaces({
    authClient: authClient(store),
    catalog: {
      async listTrailItems(options) {
        calls.push(options);
        return {
          items: [{
            itemId: `workspace:${WORKSPACE_ID}:course:course-a`,
            workspaceId: WORKSPACE_ID,
            courseKey: "course-a",
            courseId: null,
            selectionId: null,
            kind: "plan",
            source: "workspace",
            origin: "workspace",
            title: "Plano A",
            description: "Objetivo",
            moduleCount: 1,
            lessonCount: 2,
            microsequenceCount: 3,
            cardCount: 0,
            canEdit: true,
            canDelete: true,
            position: 0,
            updatedAt: "2026-08-03T12:00:00Z"
          }],
          hasMore: false,
          nextCursor: null,
          capabilities: { catalogManage: false, catalogReview: false }
        };
      }
    }
  });

  const online = await spaces.loadTrails({ online: true });
  assert.equal(online.page.items[0].kind, "plan");
  assert.equal(online.page.items[0].cardCount, 0);
  assert.deepEqual(calls, [{ limit: 50, afterPosition: null, afterId: null }]);
  assert.equal(store.values.size, 1);

  const offline = await spaces.loadTrails({ online: false });
  assert.equal(offline.stale, true);
  assert.deepEqual(offline.page, online.page);
});

test("ações do painel usam contratos focados e limpam a projeção após mutação", async () => {
  const store = sessionStore();
  const calls = [];
  const spaces = new LearningSpaces({
    authClient: authClient(store),
    catalog: {
      async listTrailItems() { return { items: [], capabilities: {} }; },
      async executeApplicationAuthoringAction(name, args) {
        calls.push([name, args]);
        if (name === "criarWorkspaceDeAutoria") {
          return { workspaceId: WORKSPACE_ID, revision: 1 };
        }
        if (name === "lerWorkspaceDeAutoria") {
          return { workspaceId: WORKSPACE_ID, revision: 4, content: { courses: [] } };
        }
        return { workspaceId: WORKSPACE_ID, revision: 5 };
      }
    }
  });
  await spaces.loadTrails({ online: true });
  assert.equal(store.values.size, 1);

  await spaces.createPlan({ title: "  Plano novo  ", description: "  Objetivo curto  " });
  assert.equal(calls[0][0], "criarWorkspaceDeAutoria");
  assert.equal(calls[0][1].title, "Plano novo");
  assert.equal(calls[0][1].brief, "Objetivo curto");
  assert.match(calls[0][1].requestId, /^[0-9a-f-]{36}$/u);
  assert.equal(store.values.size, 0);

  await spaces.updateEntity({
    workspaceId: WORKSPACE_ID,
    revision: 4,
    entityType: "lesson",
    entityPath: ["course-a", "module-a", "lesson-a"],
    title: "Lição revisada",
    goal: "Descrição revisada"
  });
  assert.deepEqual(calls.at(-1).slice(0, 1), ["atualizarMetadadosDaEntidade"]);
  assert.equal(calls.at(-1)[1].expectedRevision, 4);
  assert.equal(calls.at(-1)[1].title, "Lição revisada");

  await spaces.createObservation({
    workspaceId: WORKSPACE_ID,
    entityType: "lesson",
    entityPath: ["course-a", "module-a", "lesson-a"],
    body: "  Rever o exemplo.  "
  });
  assert.equal(calls.at(-1)[0], "gerirWorkspaceEducacional");
  assert.equal(calls.at(-1)[1].operation, "create_observation");
  assert.equal(calls.at(-1)[1].body, "Rever o exemplo.");

  await spaces.loadWorkspaceAccess(WORKSPACE_ID);
  assert.equal(calls.at(-1)[0], "gerirWorkspaceEducacional");
  assert.deepEqual(calls.at(-1)[1], {
    operation: "read",
    workspaceId: WORKSPACE_ID
  });
});

test("cliente remoto chama somente a projeção integrada de Trilhas", async () => {
  const requests = [];
  const catalog = new RemoteCourseCatalog({
    projectUrl: "https://project.example",
    publishableKey: "sb_publishable_test",
    authClient: {
      getSession: () => ({ user: { id: USER_ID } }),
      getAccessToken: async () => "access-token"
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });
  await catalog.listTrailItems({
    limit: 20,
    afterPosition: 3,
    afterId: WORKSPACE_ID
  });
  assert.match(requests[0].url, /\/rpc\/list_trail_items_v1$/u);
  assert.deepEqual(requests[0].body, {
    p_limit: 20,
    p_after_position: 3,
    p_after_id: WORKSPACE_ID
  });
});

test("observações exigem o caminho estrutural completo do alvo", () => {
  const valid = validateWorkspaceObservationActionPayload({
    requestId: "observation:resource:1",
    operation: "create",
    payload: {
      entityType: "resource",
      entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
      resourceTargetId: "body:paragraph-1",
      body: "Rever este recurso."
    }
  });
  assert.equal(valid.payload.resourceTargetId, "body:paragraph-1");
  assert.throws(() => validateWorkspaceObservationActionPayload({
    requestId: "observation:course:1",
    operation: "create",
    payload: {
      entityType: "course",
      entityPath: ["course-a", "module-forjado"],
      body: "Caminho inválido."
    }
  }), /entityPath é inválido/u);
});

test("migrações do painel removem a Central categórica e guardam observações sem cópias", () => {
  const integrated = fs.readFileSync(new URL(
    "../../supabase/migrations/20260803010000_integrated_learning_spaces.sql",
    import.meta.url
  ), "utf8");
  const observations = fs.readFileSync(new URL(
    "../../supabase/migrations/20260803020000_workspace_entity_observations.sql",
    import.meta.url
  ), "utf8");

  assert.match(integrated, /drop function if exists public\.get_current_state_central_v1/iu);
  assert.match(integrated, /create function public\.list_trail_items_v1/iu);
  assert.match(integrated, /'plan'|"plan"/u);
  assert.match(integrated, /'course'|"course"/u);
  assert.doesNotMatch(integrated, /create table/iu);

  assert.match(observations, /create table private\.authoring_workspace_observations/iu);
  assert.match(observations, /entity_path text\[\]/iu);
  assert.match(observations, /body text not null/iu);
  assert.doesNotMatch(observations, /card_json|course_json|snapshot|conversation|prompt/iu);
  assert.match(observations, /on delete cascade/iu);
  assert.match(observations, /'schemaRevision', '20260803020000'/u);
  assert.match(observations, /'workspace-entity-observations-v1'/u);
});

test("PostgreSQL aceita o caminho exato da observação e recusa ancestral forjado", async () => {
  const database = new PGlite();
  try {
    await database.exec(`
      create schema private; create schema auth; create schema extensions;
      create role anon; create role authenticated; create role service_role;
      create function extensions.digest(bytea,text) returns bytea language sql immutable
        as $$ select decode(md5($1) || md5($1), 'hex') $$;
      create table auth.users(id uuid primary key);
      create table private.authoring_workspaces(id uuid primary key);
      create table private.authoring_workspace_entities(
        workspace_id uuid not null references private.authoring_workspaces(id),
        entity_type text not null, entity_id text not null,
        parent_type text, parent_id text
      );
      create function private.require_educational_workspace_capability_v1(uuid,uuid,text)
        returns void language plpgsql as $$ begin return; end $$;
      create function private.educational_workspace_can_v1(uuid,uuid,text)
        returns boolean language sql stable as $$ select true $$;
    `);
    await database.exec(fs.readFileSync(new URL(
      "../../supabase/migrations/20260803020000_workspace_entity_observations.sql",
      import.meta.url
    ), "utf8"));
    await database.query("insert into auth.users(id) values ($1)", [USER_ID]);
    await database.query("insert into private.authoring_workspaces(id) values ($1)", [WORKSPACE_ID]);
    await database.exec(`
      insert into private.authoring_workspace_entities values
        ('${WORKSPACE_ID}','course','course-a',null,null),
        ('${WORKSPACE_ID}','module','module-a','course','course-a'),
        ('${WORKSPACE_ID}','lesson','lesson-a','module','module-a'),
        ('${WORKSPACE_ID}','microsequence','micro-a','lesson','lesson-a'),
        ('${WORKSPACE_ID}','card','card-a','microsequence','micro-a')
    `);
    const result = await database.query(
      "select public.manage_authoring_workspace_observation_for_actor_v1($1,$2,$3,'create',$4::jsonb) value",
      [USER_ID, "observation:resource:1", WORKSPACE_ID, JSON.stringify({
        entityType: "resource",
        entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
        resourceTargetId: "body:paragraph-1",
        body: "Rever."
      })]
    );
    assert.equal(result.rows[0].value.operation, "create");
    await assert.rejects(database.query(
      "select public.manage_authoring_workspace_observation_for_actor_v1($1,$2,$3,'create',$4::jsonb)",
      [USER_ID, "observation:forged:1", WORKSPACE_ID, JSON.stringify({
        entityType: "lesson",
        entityPath: ["course-a", "module-forged", "lesson-a"],
        body: "Inválida."
      })]
    ), (error) => error.code === "P0002");
  } finally {
    await database.close();
  }
});
