import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { LearningSpaces } from "../../src/supabase/LearningSpaces.js";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const GROUP_ID = "20000000-0000-4000-8000-000000000002";
const ITEM_A = "30000000-0000-4000-8000-000000000003";
const ITEM_B = "40000000-0000-4000-8000-000000000004";
const WORKSPACE_ID = "50000000-0000-4000-8000-000000000005";

function store() {
  const values = new Map();
  return {
    values,
    async getSyncState(key) { return values.get(key) ?? null; },
    async putSyncState(key, value) {
      if (value === null) values.delete(key);
      else values.set(key, structuredClone(value));
    }
  };
}

function authClient(sessionStore) {
  return {
    sessionStore,
    getSession: () => ({ user: { id: USER_ID } })
  };
}

function trailItem(trailItemId, titleIndex) {
  return {
    trailItemId,
    workspaceId: WORKSPACE_ID,
    courseKey: "course-fixture-minimal",
    courseId: null,
    selectionId: null,
    kind: "course",
    source: "workspace",
    origin: "workspace",
    title: `Curso ${titleIndex + 1}`,
    description: "Objetivo",
    moduleCount: 1,
    lessonCount: 1,
    microsequenceCount: 1,
    cardCount: 2,
    completedCardCount: 0,
    contentHash: null,
    revision: 5,
    canEdit: true,
    canDelete: true,
    canRemove: false,
    pathId: GROUP_ID,
    pathTitle: "Grupo",
    updatedAt: "2026-08-07T12:00:00Z"
  };
}

function fixture() {
  return JSON.parse(fs.readFileSync(
    new URL("../fixtures/v4/project-minimal.json", import.meta.url),
    "utf8"
  )).courses[0];
}

function fixtureParts() {
  const course = fixture();
  const parts = [];
  const add = (entityType, entity, parentType = null, parentId = null, position = 0) => {
    const content = structuredClone(entity);
    for (const key of ["id", "modules", "lessons", "topics", "microsequences", "cards"]) {
      delete content[key];
    }
    parts.push({ entityType, id: entity.id, parentType, parentId, position, content });
  };
  add("course", course);
  for (const [moduleIndex, moduleValue] of course.modules.entries()) {
    add("module", moduleValue, "course", course.id, moduleIndex);
    for (const [lessonIndex, lesson] of moduleValue.lessons.entries()) {
      add("lesson", lesson, "module", moduleValue.id, lessonIndex);
      lesson.topics.forEach((topic, index) => add("topic", topic, "lesson", lesson.id, index));
      for (const [microIndex, microsequence] of lesson.microsequences.entries()) {
        add("microsequence", microsequence, "lesson", lesson.id, microIndex);
        microsequence.cards.forEach((card, index) =>
          add("card", card, "microsequence", microsequence.id, index)
        );
      }
    }
  }
  return parts;
}

test("snapshot de Trilhas percorre cursor por identidade e ordena somente a página completa", async () => {
  const sessionStore = store();
  const calls = [];
  const catalog = {
    async listTrailItems(options) {
      calls.push(options);
      const common = {
        space: "trails",
        groups: [{ id: GROUP_ID, title: "Grupo" }],
        capabilities: { catalogManage: false, catalogReview: false }
      };
      if (options.afterId === null) {
        return {
          ...common,
          items: [trailItem(ITEM_A, 1)],
          hasMore: true,
          nextCursor: { afterId: ITEM_A }
        };
      }
      return { ...common, items: [trailItem(ITEM_B, 0)], hasMore: false, nextCursor: null };
    }
  };
  const spaces = new LearningSpaces({ catalog, authClient: authClient(sessionStore) });
  const snapshot = await spaces.loadTrailSnapshot();
  assert.deepEqual(snapshot.items.map((entry) => entry.trailItemId), [ITEM_B, ITEM_A]);
  assert.deepEqual(calls, [{
    limit: 100,
    afterId: null
  }, {
    limit: 100,
    afterId: ITEM_A
  }]);
  assert.equal([...sessionStore.values.values()][0].page.items.length, 2);
});

test("falha transitória da projeção usa o cache sem conservar autoridade", async () => {
  const sessionStore = store();
  let available = true;
  const catalog = {
    async listTrailItems() {
      if (!available) throw new TypeError("Failed to fetch");
      return {
        space: "trails",
        groups: [{ id: GROUP_ID, title: "Grupo" }],
        items: [trailItem(ITEM_A, 0)],
        hasMore: false,
        nextCursor: null,
        capabilities: { catalogManage: true, catalogReview: true }
      };
    }
  };
  const spaces = new LearningSpaces({ catalog, authClient: authClient(sessionStore) });
  await spaces.loadTrailSnapshot();
  available = false;

  const stale = await spaces.loadTrails({ online: true });

  assert.equal(stale.stale, true);
  assert.equal(stale.page.items[0].canEdit, false);
  assert.equal(stale.page.items[0].canDelete, false);
  assert.equal(stale.page.capabilities.catalogManage, false);
  assert.equal(stale.page.capabilities.organize, false);
});

test("composição fixa a revisão entre páginas e usa uma única réplica offline validada", async () => {
  const sessionStore = store();
  const parts = fixtureParts();
  const calls = [];
  let failNetwork = false;
  const catalog = {
    async getTrailWorkspaceCourse(options) {
      calls.push(options);
      if (failNetwork) throw new TypeError("Failed to fetch");
      const first = options.afterCursor === null;
      return {
        trailItemId: ITEM_A,
        workspaceId: WORKSPACE_ID,
        courseKey: "course-fixture-minimal",
        revision: 5,
        parts: first ? parts.slice(0, 3) : parts.slice(3),
        hasMore: first,
        nextCursor: first ? "cursor-1" : null
      };
    }
  };
  const spaces = new LearningSpaces({ catalog, authClient: authClient(sessionStore) });
  const descriptor = trailItem(ITEM_A, 0);
  const response = await spaces.loadWorkspaceCourse(descriptor);
  assert.equal(response.parts.length, parts.length);
  assert.equal(calls[0].expectedRevision, null);
  assert.equal(calls[1].expectedRevision, 5);
  await spaces.cacheWorkspaceCourse(descriptor, response, fixture());
  failNetwork = true;
  const cached = await spaces.loadWorkspaceCourse(descriptor);
  assert.deepEqual(cached, response);
  assert.equal(
    [...sessionStore.values.keys()].filter((key) => key.includes(ITEM_A)).length,
    1
  );
});

test("mutações de grupo usam trailItemId e invalidam a projeção", async () => {
  const sessionStore = store();
  const calls = [];
  const spaces = new LearningSpaces({
    authClient: authClient(sessionStore),
    catalog: {
      async mutateTrails(input) { calls.push(input); return { revision: 2 }; }
    }
  });
  await sessionStore.putSyncState(`learning.spaces.v1:${USER_ID}`, { version: 5 });
  await spaces.placeItem({ trailItemId: ITEM_A, groupId: GROUP_ID });
  assert.equal(calls[0].operation, "place_item");
  assert.deepEqual(calls[0].arguments, {
    trailItemId: ITEM_A,
    groupId: GROUP_ID
  });
  assert.equal(sessionStore.values.size, 0);
});

test("retry após resposta perdida reutiliza requestId e não duplica grupo", async () => {
  const sessionStore = store();
  const calls = [];
  let committed = false;
  const catalog = {
    async mutateTrails(input) {
      calls.push(structuredClone(input));
      if (!committed) {
        committed = true;
        throw new TypeError("resposta perdida");
      }
      return { revision: 2, idempotent: true };
    }
  };
  const firstSession = new LearningSpaces({
    authClient: authClient(sessionStore),
    catalog
  });
  await assert.rejects(
    () => firstSession.createGroup({ title: "Dataprev" }),
    /resposta perdida/u
  );

  const secondSession = new LearningSpaces({
    authClient: authClient(sessionStore),
    catalog
  });
  const retried = await secondSession.createGroup({ title: "Dataprev" });

  assert.equal(retried.idempotent, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].requestId, calls[1].requestId);
  assert.deepEqual(calls[0].arguments, calls[1].arguments);
  assert.equal(
    [...sessionStore.values.keys()].some((key) => key.startsWith("learning.trail.mutations.v1:")),
    false
  );
});

test("snapshot online remove caches dos itens cuja autoridade foi revogada", async () => {
  const sessionStore = store();
  let visible = true;
  const catalog = {
    async listTrailItems() {
      return {
        space: "trails",
        groups: visible ? [{ id: GROUP_ID, title: "Grupo" }] : [],
        items: visible ? [trailItem(ITEM_A, 0)] : [],
        hasMore: false,
        nextCursor: null,
        capabilities: { catalogManage: false, catalogReview: false, organize: true }
      };
    }
  };
  const firstSession = new LearningSpaces({ catalog, authClient: authClient(sessionStore) });
  await firstSession.loadTrailSnapshot();
  await sessionStore.putSyncState(`learning.trail.course.v1:${USER_ID}:${ITEM_A}`, {
    contract: "aralearn.trail-course-cache.v1"
  });
  await sessionStore.putSyncState(`trail.personalState:${USER_ID}:${ITEM_A}`, {
    contract: "aralearn.trail-personal-state-cache.v3"
  });

  visible = false;
  const secondSession = new LearningSpaces({ catalog, authClient: authClient(sessionStore) });
  const snapshot = await secondSession.loadTrailSnapshot();

  assert.deepEqual(snapshot.items, []);
  assert.equal(sessionStore.values.has(`learning.trail.course.v1:${USER_ID}:${ITEM_A}`), false);
  assert.equal(sessionStore.values.has(`trail.personalState:${USER_ID}:${ITEM_A}`), false);
  assert.equal(sessionStore.values.has(`learning.spaces.v1:${USER_ID}`), true);
});

test("falha de autoridade pode purgar projeção e caches derivados de uma sessão anterior", async () => {
  const sessionStore = store();
  await sessionStore.putSyncState(`learning.spaces.v1:${USER_ID}`, {
    version: 5,
    page: {
      space: "trails",
      groups: [],
      items: [trailItem(ITEM_A, 0)],
      capabilities: {}
    }
  });
  await sessionStore.putSyncState(`learning.trail.course.v1:${USER_ID}:${ITEM_A}`, { cached: true });
  await sessionStore.putSyncState(`trail.personalState:${USER_ID}:${ITEM_A}`, { cached: true });
  const spaces = new LearningSpaces({ catalog: {}, authClient: authClient(sessionStore) });

  await spaces.clearCache({ purgeItems: true });

  assert.equal(sessionStore.values.size, 0);
});
