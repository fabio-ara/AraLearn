import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

import { LearningSpaces } from "../../src/supabase/LearningSpaces.js";
import { RemoteCourseCatalog } from "../../src/supabase/RemoteCourseCatalog.js";
import { confirmCourseRemovalInReplica } from "../../src/ui/LearningSpacesPanel.js";
import { validateWorkspaceObservationActionPayload } from "../../supabase/functions/_shared/aralearn-authoring/workspaceProtocol.js";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000002";
const COURSE_ID = "30000000-0000-4000-8000-000000000003";
const SELECTION_ID = "40000000-0000-4000-8000-000000000004";
const TRAIL_ITEM_ID = "50000000-0000-4000-8000-000000000005";
const GROUP_ID = "60000000-0000-4000-8000-000000000006";
const CONTENT_HASH = "a".repeat(64);

function trailProjection({ items = [], groups = [], hasMore = false, nextCursor = null, capabilities = {} } = {}) {
  return { space: "trails", groups, items, hasMore, nextCursor, capabilities };
}

function makeTrailItemForCursor(index) {
  return {
    trailItemId: `80000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    workspaceId: WORKSPACE_ID,
    courseKey: `course-${index}`,
    kind: "plan",
    source: "workspace",
    origin: "workspace",
    cardCount: 0,
    revision: 1,
    pathId: null,
    pathPosition: null,
    itemPosition: index
  };
}

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
        return trailProjection({
          groups: [{ id: GROUP_ID, title: "Planos", position: 0 }],
          items: [{
            trailItemId: TRAIL_ITEM_ID,
            workspaceId: WORKSPACE_ID,
            courseKey: "course-a",
            courseId: null,
            selectionId: null,
            contentHash: null,
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
            canRemove: false,
            pathId: GROUP_ID,
            pathTitle: "Planos",
            pathPosition: 0,
            itemPosition: 0,
            revision: 1,
            updatedAt: "2026-08-03T12:00:00Z"
          }],
          capabilities: { catalogManage: false, catalogReview: false }
        });
      }
    }
  });

  const online = await spaces.loadTrails({ online: true });
  assert.equal(online.page.items[0].kind, "plan");
  assert.equal(online.page.items[0].cardCount, 0);
  assert.deepEqual(calls, [{
    limit: 100,
    afterPathPosition: null,
    afterItemPosition: null,
    afterId: null
  }]);
  assert.equal(store.values.size, 1);
  assert.equal(Array.from(store.values.values())[0].version, 4);

  const offline = await spaces.loadTrails({ online: false });
  assert.equal(offline.stale, true);
  assert.deepEqual(
    offline.page.items.map((item) => item.trailItemId),
    online.page.items.map((item) => item.trailItemId)
  );
  assert.deepEqual(offline.page.capabilities, {
    catalogManage: false,
    catalogReview: false,
    organize: false
  });
  assert.equal(offline.page.items[0].canEdit, false);
  assert.equal(offline.page.items[0].canDelete, false);
});

test("Trilhas agrega mais de cinquenta itens, preserva ordem e elimina sobreposição por itemId", async () => {
  const store = sessionStore();
  const calls = [];
  const makeItem = (position) => ({
    trailItemId: `70000000-0000-4000-8000-${String(position + 1).padStart(12, "0")}`,
    workspaceId: WORKSPACE_ID,
    courseKey: `plan-${String(position).padStart(3, "0")}`,
    courseId: null,
    selectionId: null,
    contentHash: null,
    kind: "plan",
    source: "workspace",
    origin: "workspace",
    title: `Plano ${position}`,
    pathId: null,
    pathTitle: "",
    pathPosition: null,
    itemPosition: position,
    revision: 1,
    canEdit: true,
    canDelete: true,
    canRemove: false
  });
  const spaces = new LearningSpaces({
    authClient: authClient(store),
    catalog: {
      async listTrailItems(options) {
        calls.push(options);
        if (options.afterId === null) {
          return trailProjection({
            items: Array.from({ length: 50 }, (_, index) => makeItem(index)),
            hasMore: true,
            nextCursor: {
              afterPathPosition: 2147483647,
              afterItemPosition: 49,
              afterId: makeItem(49).trailItemId
            },
            capabilities: { catalogManage: true, catalogReview: true }
          });
        }
        return trailProjection({
          items: Array.from({ length: 24 }, (_, index) => ({
            ...makeItem(index + 49),
            ...(index === 0 ? { title: "Plano 49 revalidado" } : {})
          })),
          hasMore: false,
          nextCursor: null,
          capabilities: { catalogManage: true, catalogReview: true }
        });
      }
    }
  });

  const result = await spaces.loadTrails({ online: true });
  assert.equal(result.page.items.length, 73);
  assert.equal(result.page.items[0].trailItemId, makeItem(0).trailItemId);
  assert.equal(result.page.items.at(-1).trailItemId, makeItem(72).trailItemId);
  assert.equal(result.page.items[49].title, "Plano 49 revalidado");
  assert.equal(new Set(result.page.items.map((item) => item.trailItemId)).size, 73);
  assert.deepEqual(result.page.capabilities, {
    catalogManage: true,
    catalogReview: true,
    organize: true
  });
  assert.deepEqual(calls, [{
    limit: 100,
    afterPathPosition: null,
    afterItemPosition: null,
    afterId: null
  }, {
    limit: 100,
    afterPathPosition: 2147483647,
    afterItemPosition: 49,
    afterId: makeItem(49).trailItemId
  }]);
  const cached = Array.from(store.values.values())[0];
  assert.equal(cached.page.items.length, 73);
  assert.equal(cached.page.hasMore, false);
});

test("cursor repetido interrompe Trilhas sem gravar projeção parcial", async () => {
  const store = sessionStore();
  let calls = 0;
  const spaces = new LearningSpaces({
    authClient: authClient(store),
    catalog: {
      async listTrailItems() {
        calls += 1;
        return trailProjection({
          items: [{
            ...makeTrailItemForCursor(calls),
            title: `Item ${calls}`
          }],
          hasMore: true,
          nextCursor: {
            afterPathPosition: 2147483647,
            afterItemPosition: 1,
            afterId: "80000000-0000-4000-8000-000000000001"
          },
          capabilities: { catalogManage: true, catalogReview: true }
        });
      }
    }
  });

  await assert.rejects(
    () => spaces.loadTrails({ online: true }),
    /repetiu o mesmo cursor/iu
  );
  assert.equal(calls, 2);
  assert.equal(store.values.size, 0);
});

test("falha em página posterior preserva somente o último cache completo", async () => {
  const store = sessionStore();
  let phase = "seed";
  const spaces = new LearningSpaces({
    authClient: authClient(store),
    catalog: {
      async listTrailItems({ afterId }) {
        if (phase === "seed") {
          return trailProjection({
            items: [{ ...makeTrailItemForCursor(10), title: "Completo" }],
            capabilities: { catalogManage: true, catalogReview: true }
          });
        }
        if (afterId === null) {
          return trailProjection({
            items: [{ ...makeTrailItemForCursor(11), title: "Parcial" }],
            hasMore: true,
            nextCursor: {
              afterPathPosition: 2147483647,
              afterItemPosition: 11,
              afterId: makeTrailItemForCursor(11).trailItemId
            },
            capabilities: { catalogManage: true, catalogReview: true }
          });
        }
        throw new Error("segunda página indisponível");
      }
    }
  });

  await spaces.loadTrails({ online: true });
  phase = "fail";
  const fallback = await spaces.loadTrails({ online: true });
  assert.equal(fallback.stale, true);
  assert.deepEqual(
    fallback.page.items.map((item) => item.trailItemId),
    [makeTrailItemForCursor(10).trailItemId]
  );
  const cached = await spaces.loadTrails({ online: false });
  assert.equal(cached.stale, true);
  assert.deepEqual(
    cached.page.items.map((item) => item.trailItemId),
    [makeTrailItemForCursor(10).trailItemId]
  );
  assert.equal(
    cached.page.items.some((item) => item.trailItemId === makeTrailItemForCursor(11).trailItemId),
    false
  );
});

test("ações do painel usam contratos focados e limpam a projeção após mutação", async () => {
  const store = sessionStore();
  const calls = [];
  const spaces = new LearningSpaces({
    authClient: authClient(store),
    catalog: {
      async listTrailItems() { return trailProjection(); },
      async selectCourse(courseId) {
        calls.push(["selectCourse", { courseId }]);
        return { courseId };
      },
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

  await spaces.addCourseToTrails(COURSE_ID);
  assert.deepEqual(calls[0], ["selectCourse", { courseId: COURSE_ID }]);
  assert.equal(store.values.size, 0);

  await spaces.loadTrails({ online: true });
  await spaces.createCourseWorkspace({
    courseId: COURSE_ID,
    title: "Curso oficial"
  });
  assert.equal(calls.at(-1)[0], "criarWorkspaceDeAutoria");
  assert.equal(calls.at(-1)[1].sourceCourseId, COURSE_ID);
  assert.equal(calls.at(-1)[1].title, "Curso oficial");
  assert.equal(store.values.size, 0);
  await assert.rejects(
    () => spaces.createCourseWorkspace({ courseId: "inválido", title: "Curso" }),
    /Curso inválido/iu
  );

  await spaces.loadTrails({ online: true });
  await spaces.removeCourseFromTrails({
    selectionId: SELECTION_ID,
    courseId: COURSE_ID,
    expectedContentHash: CONTENT_HASH
  });
  assert.equal(calls.at(-1)[0], "retirarCursoDasTrilhas");
  assert.equal(calls.at(-1)[1].selectionId, SELECTION_ID);
  assert.equal(calls.at(-1)[1].courseId, COURSE_ID);
  assert.equal(calls.at(-1)[1].expectedContentHash, CONTENT_HASH);
  assert.match(calls.at(-1)[1].requestId, /^[0-9a-f-]{36}$/u);
  assert.equal(store.values.size, 0);
  await assert.rejects(
    () => spaces.removeCourseFromTrails({
      selectionId: SELECTION_ID,
      courseId: COURSE_ID,
      expectedContentHash: "hash-antigo"
    }),
    /Curso inválido para retirada/iu
  );

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
    afterPathPosition: 3,
    afterItemPosition: 7,
    afterId: WORKSPACE_ID
  });
  assert.match(requests[0].url, /\/rpc\/list_trail_items_v1$/u);
  assert.deepEqual(requests[0].body, {
    p_limit: 20,
    p_after_path_position: 3,
    p_after_item_position: 7,
    p_after_id: WORKSPACE_ID
  });
});

test("administração de Coleções pagina leituras e envia CAS sem campos implícitos", async () => {
  const store = sessionStore();
  const calls = [];
  const firstCollectionId = "50000000-0000-4000-8000-000000000005";
  const secondCollectionId = "60000000-0000-4000-8000-000000000006";
  const spaces = new LearningSpaces({
    authClient: authClient(store),
    catalog: {
      async executeApplicationAuthoringAction(name, args) {
        calls.push([name, structuredClone(args)]);
        if (name === "consultarCatalogo" && args.operation === "list_collections") {
          if (!args.afterId) {
            return {
              items: [{ collectionId: firstCollectionId, title: "Primeira", position: 0, revision: 2 }],
              nextCursor: { afterPosition: 0, afterId: firstCollectionId }
            };
          }
          return {
            items: [{ collectionId: secondCollectionId, title: "Segunda", position: 1, revision: 3 }],
            nextCursor: null
          };
        }
        if (name === "consultarCatalogo" && args.operation === "list_collection_courses") {
          return {
            items: args.collectionId === firstCollectionId
              ? [{ courseId: COURSE_ID, title: "Curso", placementRevision: 4, position: 0 }]
              : [],
            nextCursor: null
          };
        }
        return { status: "ok" };
      }
    }
  });

  const groups = await spaces.loadManagedCatalog();
  assert.deepEqual(groups.map((group) => group.collectionId), [firstCollectionId, secondCollectionId]);
  assert.equal(groups[0].courses[0].courseId, COURSE_ID);
  assert.deepEqual(calls.slice(0, 4).map(([, args]) => args.operation), [
    "list_collections",
    "list_collections",
    "list_collection_courses",
    "list_collection_courses"
  ]);
  assert.deepEqual(calls[1][1], {
    operation: "list_collections",
    limit: 100,
    afterPosition: 0,
    afterId: firstCollectionId
  });

  await spaces.createCatalogCollection({ title: "Ciências Humanas" });
  assert.equal(calls.at(-1)[0], "editarCatalogo");
  assert.equal(calls.at(-1)[1].operation, "create_collection");
  assert.match(calls.at(-1)[1].contractKey, /^ciencias-humanas-[0-9a-f]{8}$/u);

  await spaces.updateCatalogCollection({
    collectionId: firstCollectionId,
    revision: 2,
    title: "Humanidades",
    description: "Descrição"
  });
  assert.equal(calls.at(-1)[1].expectedRevision, 2);

  await spaces.moveCatalogCollection({
    collectionId: firstCollectionId,
    revision: 3,
    position: 1
  });
  assert.deepEqual(calls.at(-1)[1], {
    operation: "move_collection",
    requestId: calls.at(-1)[1].requestId,
    collectionId: firstCollectionId,
    expectedRevision: 3,
    position: 1
  });

  const callCountBeforeInvalidMoves = calls.length;
  for (const invalid of [
    { revision: 0, position: 0 },
    { revision: 1.5, position: 0 },
    { revision: "3", position: 0 },
    { revision: 3, position: -1 },
    { revision: 3, position: 0.5 },
    { revision: 3, position: null },
    { revision: 3, position: undefined }
  ]) {
    await assert.rejects(
      spaces.moveCatalogCollection({
        collectionId: firstCollectionId,
        ...invalid
      }),
      (error) => error instanceof TypeError
        && error.message === "Coleção inválida para ordenação."
    );
  }
  assert.equal(calls.length, callCountBeforeInvalidMoves);

  await spaces.moveCatalogCourse({
    courseId: COURSE_ID,
    placementRevision: 4,
    targetCollectionId: secondCollectionId,
    position: 0
  });
  assert.equal(calls.at(-1)[1].operation, "move_course");
  assert.equal(calls.at(-1)[1].expectedPlacementRevision, 4);

  await spaces.retireCatalogCollection({
    collectionId: firstCollectionId,
    revision: 4,
    replacementCollectionId: secondCollectionId
  });
  assert.equal(calls.at(-1)[0], "retirarDoCatalogo");
  assert.equal(calls.at(-1)[1].expectedRevision, 4);
});

test("administração de Coleções limita e paraleliza a leitura dos cursos", async () => {
  const collectionIds = Array.from({ length: 7 }, (_, index) => (
    `${String(index + 1).padStart(8, "0")}-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
  ));
  const pendingReleases = [];
  let collectionReads = 0;
  let courseReads = 0;
  let activeCourseReads = 0;
  let maxActiveCourseReads = 0;
  const spaces = new LearningSpaces({
    authClient: authClient(sessionStore()),
    catalog: {
      async executeApplicationAuthoringAction(name, args) {
        assert.equal(name, "consultarCatalogo");
        if (args.operation === "list_collections") {
          collectionReads += 1;
          return {
            items: collectionIds.map((collectionId, position) => ({
              collectionId,
              title: `Coleção ${position + 1}`,
              position,
              revision: 1
            })),
            nextCursor: null
          };
        }
        courseReads += 1;
        activeCourseReads += 1;
        maxActiveCourseReads = Math.max(maxActiveCourseReads, activeCourseReads);
        return new Promise((resolve) => pendingReleases.push(() => {
          activeCourseReads -= 1;
          resolve({ items: [], nextCursor: null });
        }));
      }
    }
  });

  const loading = spaces.loadManagedCatalog();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(courseReads, 4, "a primeira onda respeita o limite de concorrência");
  pendingReleases.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(courseReads, 5, "a próxima Coleção começa sem aguardar todo o lote");

  while (courseReads < collectionIds.length || pendingReleases.length) {
    pendingReleases.shift()?.();
    await new Promise((resolve) => setImmediate(resolve));
  }
  const groups = await loading;
  assert.equal(collectionReads, 1);
  assert.equal(courseReads, collectionIds.length);
  assert.equal(maxActiveCourseReads, 4);
  assert.deepEqual(groups.map((group) => group.collectionId), collectionIds);
});

test("retirada confirmada limpa a réplica antes de reconstruir a home", async () => {
  const calls = [];
  let selected = true;
  const result = await confirmCourseRemovalInReplica({
    courseId: COURSE_ID,
    syncEngine: {
      async confirmSelectedCourseRemoval(courseId) {
        calls.push(["confirm", courseId]);
        selected = false;
      }
    },
    synchronizeReplica: async (options) => { calls.push(["sync", options]); },
    repository: {
      async refreshFromReplica() {
        calls.push(["refresh"]);
      },
      loadCourseSummaries: () => selected ? [{ courseId: COURSE_ID }] : []
    }
  });
  assert.deepEqual(calls, [
    ["confirm", COURSE_ID],
    ["sync", { guaranteeFresh: true }],
    ["refresh"]
  ]);
  assert.equal(result.status, "reconciled");
  await assert.rejects(
    () => confirmCourseRemovalInReplica({
      repository: {},
      synchronizeReplica: async () => {},
      courseId: COURSE_ID
    }),
    (error) => error.remoteCommitted === true
  );
});

test("cache local indisponível não invalida leitura nem exclusão remotas", async () => {
  const calls = [];
  const spaces = new LearningSpaces({
    authClient: authClient({
      async getSyncState() { throw new Error("IDBDatabase is closing"); },
      async putSyncState() { throw new Error("IDBDatabase is closing"); }
    }),
    catalog: {
      async listTrailItems() {
        calls.push("read");
        return trailProjection();
      },
      async executeApplicationAuthoringAction(name) {
        calls.push(name);
        return { status: "removed", courseId: COURSE_ID };
      }
    }
  });

  const online = await spaces.loadTrails({ online: true });
  assert.equal(online.stale, false);
  await spaces.removeCourseFromTrails({
    selectionId: SELECTION_ID,
    courseId: COURSE_ID,
    expectedContentHash: CONTENT_HASH
  });
  assert.deepEqual(calls, ["read", "retirarCursoDasTrilhas"]);
  const offline = await spaces.loadTrails({ online: false });
  assert.equal(offline.page, null);
  assert.equal(offline.stale, true);
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
