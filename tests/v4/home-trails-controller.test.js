import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { HomeTrailsController } from "../../src/ui/HomeTrailsController.js";
import {
  courseFromWorkspaceParts,
  groupTrailItems,
  normalizeHomeTrailSnapshot,
  preserveSelectedTrailItem,
  shouldOfferTrailRemoval,
  trailItemDeleteMode
} from "../../src/ui/homeTrailProjection.js";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ITEM_ID = "20000000-0000-4000-8000-000000000002";
const SELECTION_ITEM_ID = "30000000-0000-4000-8000-000000000003";
const WORKSPACE_ID = "40000000-0000-4000-8000-000000000004";
const COURSE_ID = "50000000-0000-4000-8000-000000000005";
const SELECTION_ID = "60000000-0000-4000-8000-000000000006";
const HOMONYM_ITEM_ID = "70000000-0000-4000-8000-000000000007";
const HOMONYM_WORKSPACE_ID = "80000000-0000-4000-8000-000000000008";

function item(overrides = {}) {
  return {
    trailItemId: WORKSPACE_ITEM_ID,
    workspaceId: WORKSPACE_ID,
    courseKey: "course-fixture-minimal",
    courseId: null,
    selectionId: null,
    kind: "course",
    source: "workspace",
    origin: "workspace",
    title: "Fixture Minimal",
    description: "Objetivo",
    moduleCount: 1,
    lessonCount: 1,
    microsequenceCount: 1,
    cardCount: 2,
    completedCardCount: 1,
    contentHash: null,
    revision: 1,
    canEdit: true,
    canDelete: true,
    canRemove: false,
    pathId: GROUP_ID,
    pathTitle: "Grupo",
    updatedAt: "2026-08-07T12:00:00Z",
    ...overrides
  };
}

function snapshot(items) {
  return {
    space: "trails",
    groups: [{ id: GROUP_ID, title: "Grupo" }],
    items,
    hasMore: false,
    nextCursor: null,
    capabilities: { organize: true, catalogManage: false, catalogReview: false }
  };
}

function fixtureParts() {
  const project = JSON.parse(fs.readFileSync(
    new URL("../fixtures/v4/project-minimal.json", import.meta.url),
    "utf8"
  ));
  const course = project.courses[0];
  const parts = [];
  const add = (entityType, entity, parentType = null, parentId = null, position = 0) => {
    const content = structuredClone(entity);
    delete content.modules;
    delete content.lessons;
    delete content.topics;
    delete content.microsequences;
    delete content.cards;
    delete content.id;
    parts.push({ entityType, id: entity.id, parentType, parentId, position, content });
  };
  add("course", course);
  course.modules.forEach((moduleValue, moduleIndex) => {
    add("module", moduleValue, "course", course.id, moduleIndex);
    moduleValue.lessons.forEach((lesson, lessonIndex) => {
      add("lesson", lesson, "module", moduleValue.id, lessonIndex);
      lesson.topics.forEach((topic, topicIndex) =>
        add("topic", topic, "lesson", lesson.id, topicIndex)
      );
      lesson.microsequences.forEach((microsequence, microsequenceIndex) => {
        add("microsequence", microsequence, "lesson", lesson.id, microsequenceIndex);
        microsequence.cards.forEach((card, cardIndex) =>
          add("card", card, "microsequence", microsequence.id, cardIndex)
        );
      });
    });
  });
  return parts;
}

test("projeção canônica agrupa cursos e mantém plano materializado selecionável", () => {
  const plan = item({ kind: "plan", cardCount: 0, completedCardCount: 0 });
  const course = item({
    trailItemId: SELECTION_ITEM_ID,
    workspaceId: null,
    courseKey: "course-selection",
    courseId: COURSE_ID,
    selectionId: SELECTION_ID,
    source: "selection",
    origin: "catalog",
    revision: null
  });
  const normalized = normalizeHomeTrailSnapshot(snapshot([plan, course]));
  assert.equal(preserveSelectedTrailItem(normalized), SELECTION_ITEM_ID);
  assert.equal(preserveSelectedTrailItem(normalized, WORKSPACE_ITEM_ID), WORKSPACE_ITEM_ID);
  assert.deepEqual(
    groupTrailItems(normalized, { includePlans: true })[0].items.map((entry) => entry.itemId),
    [WORKSPACE_ITEM_ID, SELECTION_ITEM_ID]
  );
});

test("Outros permanece disponível para receber cursos sem abrir uma segunda tela", () => {
  const normalized = normalizeHomeTrailSnapshot(snapshot([item()]));
  assert.deepEqual(
    groupTrailItems(normalized, { includePlans: true }).map((group) => group.id),
    [GROUP_ID, "others"]
  );
});

test("grupos e cursos usam ordem alfabética pt-BR independentemente da ordem recebida", () => {
  const secondGroupId = "10000000-0000-4000-8000-000000000009";
  const normalized = normalizeHomeTrailSnapshot({
    ...snapshot([
      item({ title: "Curso 10" }),
      item({
        trailItemId: SELECTION_ITEM_ID,
        title: "Curso 2"
      }),
      item({
        trailItemId: HOMONYM_ITEM_ID,
        title: "Árvore",
        pathId: secondGroupId,
        pathTitle: "Álgebra"
      })
    ]),
    groups: [
      { id: GROUP_ID, title: "Zoologia" },
      { id: secondGroupId, title: "Álgebra" }
    ]
  });
  const groups = groupTrailItems(normalized, { includePlans: true });
  assert.deepEqual(groups.map((group) => group.title), ["Álgebra", "Outros", "Zoologia"]);
  assert.deepEqual(
    groups.find((group) => group.id === GROUP_ID).items.map((entry) => entry.title),
    ["Curso 2", "Curso 10"]
  );
});

test("matriz distingue exclusão e retirada por origem sem duplicar ação destrutiva privada", () => {
  assert.equal(trailItemDeleteMode(item()), "workspace");
  assert.equal(trailItemDeleteMode(item({
    origin: "private",
    courseId: COURSE_ID,
    selectionId: SELECTION_ID,
    canRemove: true
  })), "private-published");
  assert.equal(trailItemDeleteMode(item({
    origin: "catalog",
    courseId: COURSE_ID,
    selectionId: SELECTION_ID,
    canRemove: true
  })), "catalog");
  assert.equal(shouldOfferTrailRemoval(item({
    origin: "private",
    courseId: COURSE_ID,
    selectionId: SELECTION_ID,
    canRemove: true
  })), false);
  assert.equal(shouldOfferTrailRemoval(item({
    origin: "catalog",
    courseId: COURSE_ID,
    selectionId: SELECTION_ID,
    canRemove: true
  })), true);
});

test("composição paginada reconstrói topics e cards e valida o contrato v4", () => {
  const course = courseFromWorkspaceParts({ parts: fixtureParts() }, item());
  assert.equal(course.modules[0].lessons[0].topics[0].id, "topic-conjuncao");
  assert.equal(course.modules[0].lessons[0].microsequences[0].cards.length, 2);
  assert.throws(
    () => courseFromWorkspaceParts({ parts: fixtureParts().filter((part) => part.entityType !== "lesson") }, item()),
    /sem ascendente/iu
  );
  assert.throws(
    () => courseFromWorkspaceParts({ parts: [...fixtureParts(), fixtureParts()[0]] }, item()),
    /repete a identidade/iu
  );
});

test("controller registra ref selection-only e invalida composição quando a revisão muda", async () => {
  let current = snapshot([
    item(),
    item({
      trailItemId: SELECTION_ITEM_ID,
      workspaceId: null,
      courseKey: "course-selection",
      courseId: COURSE_ID,
      selectionId: SELECTION_ID,
      source: "selection",
      origin: "catalog",
      revision: null
    })
  ]);
  const cleared = [];
  const cached = [];
  const adapter = {
    loadTrailSnapshot: async () => current,
    loadWorkspaceCourse: async () => ({
      trailItemId: WORKSPACE_ITEM_ID,
      workspaceId: WORKSPACE_ID,
      courseKey: "course-fixture-minimal",
      revision: current.items[0].revision,
      parts: fixtureParts()
    }),
    cacheWorkspaceCourse: async (_item, response, course) => cached.push([response.revision, course.id]),
    clearWorkspaceCourseCache: async (itemId) => cleared.push(itemId)
  };
  const controller = new HomeTrailsController({ adapter });
  await controller.refresh();
  assert.equal(controller.courseRefs.get(SELECTION_ITEM_ID).selectionId, SELECTION_ID);
  await controller.loadCourse(WORKSPACE_ITEM_ID);
  assert.deepEqual(cached, [[1, "course-fixture-minimal"]]);
  assert.equal(controller.loadedCourses.has(WORKSPACE_ITEM_ID), true);

  current = snapshot([{ ...current.items[0], revision: 2 }]);
  await controller.refresh({ selectedItemId: WORKSPACE_ITEM_ID });
  assert.equal(controller.loadedCourses.has(WORKSPACE_ITEM_ID), false);
  assert.deepEqual(cleared, [SELECTION_ITEM_ID, WORKSPACE_ITEM_ID]);
});

test("controller conserva a composição recarregada na revisão que a projeção confirma", async () => {
  let current = snapshot([item()]);
  const cleared = [];
  const adapter = {
    loadTrailSnapshot: async () => current,
    loadWorkspaceCourse: async () => ({
      trailItemId: WORKSPACE_ITEM_ID,
      workspaceId: WORKSPACE_ID,
      courseKey: "course-fixture-minimal",
      revision: current.items[0].revision,
      parts: fixtureParts()
    }),
    clearWorkspaceCourseCache: async (itemId) => cleared.push(itemId)
  };
  const controller = new HomeTrailsController({ adapter });
  await controller.refresh();
  await controller.loadCourse(WORKSPACE_ITEM_ID);

  current = snapshot([{ ...current.items[0], revision: 2 }]);
  controller.updateCourseRef(WORKSPACE_ITEM_ID, { revision: 2 });
  await controller.reloadCourse(WORKSPACE_ITEM_ID);
  await controller.refresh({ selectedItemId: WORKSPACE_ITEM_ID });

  assert.equal(controller.loadedCourses.has(WORKSPACE_ITEM_ID), true);
  assert.deepEqual(cleared, []);
});

test("controller ancora homônimos em trailItemId e recusa lookup ambíguo", async () => {
  const controller = new HomeTrailsController({
    adapter: {
      loadTrailSnapshot: async () => snapshot([
        item(),
        item({
          trailItemId: HOMONYM_ITEM_ID,
          workspaceId: HOMONYM_WORKSPACE_ID,
          title: "Fixture homônima"
        })
      ])
    }
  });
  await controller.refresh();

  assert.throws(
    () => controller.courseRefForKey("course-fixture-minimal"),
    /trailItemId/iu
  );
  assert.equal(
    controller.courseRefForKey("course-fixture-minimal", { trailItemId: WORKSPACE_ITEM_ID })
      .workspaceId,
    WORKSPACE_ID
  );
  assert.equal(
    controller.courseRefForKey("course-fixture-minimal", { trailItemId: HOMONYM_ITEM_ID })
      .workspaceId,
    HOMONYM_WORKSPACE_ID
  );
});

test("revogação limpa projeção, refs, composição e caches de Trilhas", async () => {
  let denied = false;
  const cleared = [];
  let projectionCacheCleared = 0;
  const controller = new HomeTrailsController({
    adapter: {
      async loadTrailSnapshot() {
        if (denied) throw Object.assign(new Error("permission denied"), { code: "42501" });
        return snapshot([item()]);
      },
      async loadWorkspaceCourse() {
        return {
          trailItemId: WORKSPACE_ITEM_ID,
          workspaceId: WORKSPACE_ID,
          courseKey: "course-fixture-minimal",
          revision: 1,
          parts: fixtureParts()
        };
      },
      async clearWorkspaceCourseCache(itemId) { cleared.push(itemId); },
      async clearCache() { projectionCacheCleared += 1; }
    }
  });
  await controller.refresh();
  await controller.loadCourse();
  denied = true;

  await assert.rejects(() => controller.refresh(), /permission denied/iu);
  assert.equal(controller.snapshot, null);
  assert.equal(controller.selectedItemId, "");
  assert.equal(controller.courseRefs.size, 0);
  assert.equal(controller.loadedCourses.size, 0);
  assert.deepEqual(cleared, [WORKSPACE_ITEM_ID]);
  assert.equal(projectionCacheCleared, 1);
});

test("exclusão oficial usa operação de Coleções e recarrega Trilhas", async () => {
  let current = snapshot([item({
    origin: "catalog",
    courseId: COURSE_ID,
    selectionId: SELECTION_ID,
    canRemove: true
  })]);
  const removed = [];
  const controller = new HomeTrailsController({
    adapter: {
      loadTrailSnapshot: async () => current,
      async removeCourseFromCatalog(courseId) {
        removed.push(courseId);
        current = snapshot([]);
      }
    }
  });
  await controller.refresh();
  const result = await controller.deleteFromCatalog(WORKSPACE_ITEM_ID);
  assert.deepEqual(removed, [COURSE_ID]);
  assert.equal(result.items.length, 0);
});
