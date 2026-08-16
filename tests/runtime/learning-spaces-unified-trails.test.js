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

function trailItem(trailItemId, titleIndex, overrides = {}) {
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
    updatedAt: "2026-08-07T12:00:00Z",
    ...overrides
  };
}

function fixture() {
  return JSON.parse(fs.readFileSync(
    new URL("../fixtures/package/project-minimal.json", import.meta.url),
    "utf8"
  )).courses[0];
}

function fixtureParts(course = fixture()) {
  const parts = [];
  const add = (entityType, entity, parentType = null, parentId = null, position = 0) => {
    const content = structuredClone(entity);
    delete content.id;
    delete content.position;
    const childCollections = {
      course: ["modules"],
      module: ["lessons"],
      lesson: ["topics", "microsequences"],
      microsequence: ["cards"]
    };
    for (const key of childCollections[entityType] || []) delete content[key];
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
        microsequence.cards.forEach((card) =>
          add("card", card, "microsequence", microsequence.id, card.position)
        );
      }
    }
  }
  return parts;
}

function largeFixture(cardCount = 2_800) {
  const course = fixture();
  const microsequence = course.modules[0].lessons[0].microsequences[0];
  const template = microsequence.cards[0];
  microsequence.cards = Array.from({ length: cardCount }, (_, index) => {
    const card = structuredClone(template);
    const suffix = String(index + 1).padStart(4, "0");
    card.id = `card-large-${suffix}`;
    card.position = index + 1;
    card.title = `Conteúdo ${suffix}`;
    card.content = card.content.map((resource, resourceIndex) => ({
      ...resource,
      id: `${card.id}-content-${resourceIndex + 1}`
    }));
    card.feedback = card.feedback.map((resource, resourceIndex) => ({
      ...resource,
      id: `${card.id}-feedback-${resourceIndex + 1}`
    }));
    return card;
  });
  return course;
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

test("Conteúdo da Autoria reutiliza composição paginada grande e caches independentes", async () => {
  const sessionStore = store();
  const largeCourse = largeFixture();
  assert.ok(
    new TextEncoder().encode(JSON.stringify(largeCourse)).byteLength > 1_400_000,
    "o cenário precisa exceder amplamente o envelope de uma única Action"
  );
  const secondCourse = JSON.parse(JSON.stringify(fixture()).replaceAll(
    "fixture-minimal",
    "fixture-second"
  ));
  const partsByItem = new Map([
    [ITEM_A, fixtureParts(largeCourse)],
    [ITEM_B, fixtureParts(secondCourse)]
  ]);
  const descriptors = [
    trailItem(ITEM_A, 0, {
      kind: "plan",
      courseKey: largeCourse.id,
      cardCount: largeCourse.modules[0].lessons[0].microsequences[0].cards.length
    }),
    trailItem(ITEM_B, 1, { kind: "plan", courseKey: secondCourse.id })
  ];
  const courseCalls = [];
  let trailReads = 0;
  const catalog = {
    async listTrailItems() {
      trailReads += 1;
      return {
        space: "trails",
        groups: [{ id: GROUP_ID, title: "Grupo" }],
        items: descriptors,
        hasMore: false,
        nextCursor: null,
        capabilities: { catalogManage: false, catalogReview: false, organize: true }
      };
    },
    async getTrailWorkspaceCourse(options) {
      courseCalls.push(structuredClone(options));
      const parts = partsByItem.get(options.trailItemId);
      assert.ok(parts, "a composição deve usar o trail item privado do curso");
      const offset = options.afterCursor == null ? 0 : Number(options.afterCursor);
      assert.equal(options.expectedRevision, offset === 0 ? null : 5);
      const pageParts = parts.slice(offset, offset + 100);
      const nextOffset = offset + pageParts.length;
      const response = {
        trailItemId: options.trailItemId,
        workspaceId: WORKSPACE_ID,
        courseKey: descriptors.find((item) => item.trailItemId === options.trailItemId).courseKey,
        revision: 5,
        parts: pageParts,
        hasMore: nextOffset < parts.length,
        nextCursor: nextOffset < parts.length ? String(nextOffset) : null
      };
      assert.ok(
        new TextEncoder().encode(JSON.stringify(response)).byteLength < 96 * 1024,
        "cada página precisa permanecer abaixo do envelope normal da Action"
      );
      return response;
    },
    async executeApplicationAuthoringAction() {
      throw new Error("Conteúdo da Autoria não deve baixar document pela Action.");
    }
  };
  const spaces = new LearningSpaces({ catalog, authClient: authClient(sessionStore) });
  const microsequence = largeCourse.modules[0].lessons[0].microsequences[0];
  const fullPath = [
    largeCourse.id,
    largeCourse.modules[0].id,
    largeCourse.modules[0].lessons[0].id,
    microsequence.id,
    microsequence.cards.at(-1).id
  ];

  const loaded = await spaces.loadAuthoringWorkspaceCourse({
    workspaceId: WORKSPACE_ID,
    entityPath: fullPath,
    online: true
  });
  assert.equal(loaded.course.id, largeCourse.id);
  assert.equal(loaded.course.modules[0].lessons[0].microsequences[0].cards.length, 2_800);
  assert.deepEqual(loaded.entityPath, fullPath);
  assert.equal(loaded.transient, true);
  assert.ok(courseCalls.filter(({ trailItemId }) => trailItemId === ITEM_A).length > 20);

  const second = await spaces.loadAuthoringWorkspaceCourse({
    workspaceId: WORKSPACE_ID,
    entityPath: [secondCourse.id],
    online: true
  });
  assert.equal(second.course.id, secondCourse.id);
  const pathDepths = [1, 2, 3, 4, 5];
  for (const depth of pathDepths) {
    const offline = await spaces.loadAuthoringWorkspaceCourse({
      workspaceId: WORKSPACE_ID,
      entityPath: fullPath.slice(0, depth),
      online: false
    });
    assert.equal(offline.course.id, largeCourse.id);
    assert.deepEqual(offline.entityPath, fullPath.slice(0, depth));
    assert.equal(offline.stale, true);
  }
  assert.equal((await spaces.loadAuthoringWorkspaceCourse({
    workspaceId: WORKSPACE_ID,
    entityPath: [secondCourse.id],
    online: false
  })).course.id, secondCourse.id);
  assert.equal(trailReads, 2, "leituras offline devem usar a projeção de Trilhas em cache");
  assert.equal(
    [...sessionStore.values.keys()].filter((key) => key.includes("learning.trail.course.v1")).length,
    2,
    "cada curso deve manter sua réplica paginada independente"
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
