import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";

import { IndexedDbRelationalStore } from "../../src/persistence/IndexedDbRelationalStore.js";
import { LearningSpaces } from "../../src/supabase/LearningSpaces.js";
import { HomeTrailsController } from "../../src/ui/HomeTrailsController.js";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const GROUP_ID = "20000000-0000-4000-8000-000000000002";
const ITEM_A = "30000000-0000-4000-8000-000000000003";
const ITEM_B = "40000000-0000-4000-8000-000000000004";
const ITEM_C = "50000000-0000-4000-8000-000000000005";
const WORKSPACE_ID = "60000000-0000-4000-8000-000000000006";
const COURSE_KEY = "course-fixture-minimal";
const QUEUE_KEY = `learning.workspace.authoring.v1:${USER_ID}:${ITEM_A}`;

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");

test.after(() => {
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor);
  } else {
    delete globalThis.navigator;
  }
});

function setOnline(value) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: Object.freeze({ onLine: value })
  });
}

function store() {
  const values = new Map();
  return {
    values,
    async getSyncState(key) {
      const value = values.get(key);
      return value === undefined ? null : structuredClone(value);
    },
    async putSyncState(key, value) {
      if (value === null) values.delete(key);
      else values.set(key, structuredClone(value));
    },
    async getAll(storeName) {
      assert.equal(storeName, "syncState");
      return [...values.entries()].map(([key, value]) => ({
        id: key,
        key,
        value: structuredClone(value)
      }));
    }
  };
}

function authClient(sessionStore) {
  return {
    sessionStore,
    getSession: () => ({ user: { id: USER_ID } })
  };
}

function fixture() {
  return structuredClone(JSON.parse(fs.readFileSync(
    new URL("../fixtures/v4/project-minimal.json", import.meta.url),
    "utf8"
  )).courses[0]);
}

function microsequenceOf(course) {
  return course.modules[0].lessons[0].microsequences[0];
}

function microsequencePath(course) {
  return [
    course.id,
    course.modules[0].id,
    course.modules[0].lessons[0].id,
    microsequenceOf(course).id
  ];
}

function partsFromCourse(course) {
  const parts = [];
  const add = (entityType, entity, parentType = null, parentId = null, position = 0) => {
    const content = structuredClone(entity);
    for (const key of [
      "id",
      "position",
      "modules",
      "lessons",
      "topics",
      "microsequences",
      "cards"
    ]) delete content[key];
    parts.push({ entityType, id: entity.id, parentType, parentId, position, content });
  };
  add("course", course);
  course.modules.forEach((moduleValue, moduleIndex) => {
    add("module", moduleValue, "course", course.id, moduleIndex);
    moduleValue.lessons.forEach((lesson, lessonIndex) => {
      add("lesson", lesson, "module", moduleValue.id, lessonIndex);
      lesson.topics.forEach((topic, topicIndex) => {
        add("topic", topic, "lesson", lesson.id, topicIndex);
      });
      lesson.microsequences.forEach((microsequence, microsequenceIndex) => {
        add("microsequence", microsequence, "lesson", lesson.id, microsequenceIndex);
        microsequence.cards.forEach((card) => {
          add("card", card, "microsequence", microsequence.id, card.position);
        });
      });
    });
  });
  return parts;
}

function trailItem({
  trailItemId = ITEM_A,
  canEdit = true,
  revision = 1
} = {}) {
  return {
    trailItemId,
    workspaceId: WORKSPACE_ID,
    courseKey: COURSE_KEY,
    courseId: null,
    selectionId: null,
    contentHash: null,
    kind: "course",
    source: "workspace",
    origin: "workspace",
    title: "Fixture Minimal",
    description: "Objetivo",
    moduleCount: 1,
    lessonCount: 1,
    microsequenceCount: 1,
    cardCount: 2,
    completedCardCount: 0,
    canEdit,
    canDelete: canEdit,
    canRemove: false,
    pathId: GROUP_ID,
    pathTitle: "Grupo",
    revision,
    updatedAt: "2026-08-09T12:00:00Z"
  };
}

function trailPage(items = [trailItem()]) {
  return {
    space: "trails",
    groups: [{ id: GROUP_ID, title: "Grupo" }],
    items,
    hasMore: false,
    nextCursor: null,
    capabilities: { catalogManage: false, catalogReview: false, organize: true }
  };
}

function workspaceResponse(course, {
  trailItemId = ITEM_A,
  revision = 1
} = {}) {
  return {
    trailItemId,
    workspaceId: WORKSPACE_ID,
    courseKey: COURSE_KEY,
    revision,
    parts: partsFromCourse(course),
    hasMore: false,
    nextCursor: null
  };
}

function courseRef(revision = 1) {
  return {
    trailItemId: ITEM_A,
    workspaceId: WORKSPACE_ID,
    courseKey: COURSE_KEY,
    revision
  };
}

function cardsWithText(course, cardIndex, value) {
  const cards = structuredClone(microsequenceOf(course).cards);
  cards[cardIndex].text = value;
  return cards;
}

function courseWithCards(course, cards) {
  const draft = structuredClone(course);
  microsequenceOf(draft).cards = structuredClone(cards);
  return draft;
}

function queueCards(spaces, baseCourse, cards) {
  return spaces.queueWorkspaceCards({
    courseRef: courseRef(),
    draftCourse: courseWithCards(baseCourse, cards),
    microsequencePath: microsequencePath(baseCourse),
    baseCards: microsequenceOf(baseCourse).cards,
    cards
  });
}

async function isolatedLearningSpacesRealms(label) {
  const moduleUrl = new URL("../../src/supabase/LearningSpaces.js", import.meta.url);
  const nonce = `${label}-${globalThis.crypto.randomUUID()}`;
  const [realmA, realmB] = await Promise.all([
    import(`${moduleUrl.href}?realm=${nonce}-a`),
    import(`${moduleUrl.href}?realm=${nonce}-b`)
  ]);
  return [realmA.LearningSpaces, realmB.LearningSpaces];
}

async function sharedIndexedDbStores() {
  const indexedDb = new IDBFactory();
  const first = await IndexedDbRelationalStore.open(indexedDb, { userId: USER_ID });
  const second = await IndexedDbRelationalStore.open(indexedDb, { userId: USER_ID });
  return [first, second];
}

function remoteCatalog(initialCourse, {
  initialRevision = 1,
  beforeWrite = null,
  afterWrite = null
} = {}) {
  let course = structuredClone(initialCourse);
  let revision = initialRevision;
  const writes = [];
  const receipts = new Map();
  return {
    writes,
    currentCourse: () => structuredClone(course),
    async getTrailWorkspaceCourse() {
      return workspaceResponse(course, { revision });
    },
    async executeApplicationAuthoringAction(action, argumentsValue) {
      writes.push({ action, arguments: structuredClone(argumentsValue) });
      if (beforeWrite) await beforeWrite({ callCount: writes.length, action, argumentsValue });
      if (receipts.has(argumentsValue.requestId)) {
        return structuredClone(receipts.get(argumentsValue.requestId));
      }
      assert.equal(action, "salvarCardsNaMicrossequencia");
      assert.equal(argumentsValue.expectedRevision, revision);
      microsequenceOf(course).cards = JSON.parse(argumentsValue.cardsJson);
      revision += 1;
      const receipt = { revision };
      receipts.set(argumentsValue.requestId, receipt);
      if (afterWrite) {
        await afterWrite({ callCount: writes.length, action, argumentsValue, receipt });
      }
      return receipt;
    }
  };
}

test("fila offline e draftCourse sobrevivem ao reinício e chegam ao controller", async () => {
  const sessionStore = store();
  const baseCourse = fixture();
  const descriptor = trailItem();
  const firstSession = new LearningSpaces({
    catalog: {},
    authClient: authClient(sessionStore)
  });
  await firstSession.writeCache(trailPage());
  await firstSession.cacheWorkspaceCourse(
    descriptor,
    workspaceResponse(baseCourse),
    baseCourse
  );
  const localCards = cardsWithText(baseCourse, 0, "Texto alterado sem conexão.");

  setOnline(false);
  const queued = await queueCards(firstSession, baseCourse, localCards);

  assert.equal(queued.pending, true);
  assert.equal(sessionStore.values.get(QUEUE_KEY).operations.length, 1);
  const secondSession = new LearningSpaces({
    catalog: {},
    authClient: authClient(sessionStore)
  });
  const response = await secondSession.loadWorkspaceCourse(descriptor);
  assert.equal(microsequenceOf(response.draftCourse).cards[0].text, localCards[0].text);

  const controller = new HomeTrailsController({
    adapter: {
      loadTrailSnapshot: () => secondSession.loadTrailSnapshot({ online: false }),
      loadWorkspaceCourse: (item) => secondSession.loadWorkspaceCourse(item),
      cacheWorkspaceCourse: (item, value, course) =>
        secondSession.cacheWorkspaceCourse(item, value, course)
    }
  });
  await controller.refresh();
  const loaded = await controller.loadCourse();

  assert.equal(microsequenceOf(loaded).cards[0].text, localCards[0].text);
  assert.equal((await secondSession.readWorkspaceAuthoringQueue(courseRef())).operations.length, 1);
});

test("fila textual recusa alteração de estrutura da microssequência", async () => {
  const sessionStore = store();
  const baseCourse = fixture();
  const spaces = new LearningSpaces({
    catalog: {},
    authClient: authClient(sessionStore)
  });
  setOnline(false);

  await assert.rejects(
    () => spaces.queueWorkspaceMetadata({
      courseRef: courseRef(),
      draftCourse: baseCourse,
      entityType: "microsequence",
      entityPath: microsequencePath(baseCourse),
      baseMetadata: { dependsOn: [] },
      metadata: { dependsOn: ["outra-microssequencia"] }
    }),
    /metadados inválidos/iu
  );
  assert.equal(sessionStore.values.has(QUEUE_KEY), false);
});

test("duas abas sem Web Locks combinam folhas textuais stale pela transação IndexedDB", async () => {
  const [LearningSpacesRealmA, LearningSpacesRealmB] =
    await isolatedLearningSpacesRealms("distinct-leaves");
  const [storeA, storeB] = await sharedIndexedDbStores();
  try {
    const baseCourse = fixture();
    const cardsFromA = cardsWithText(baseCourse, 0, "Texto salvo pela primeira aba.");
    const cardsFromB = structuredClone(microsequenceOf(baseCourse).cards);
    cardsFromB[0].after = "Feedback salvo pela segunda aba.";
    const spacesA = new LearningSpacesRealmA({
      catalog: {},
      authClient: authClient(storeA)
    });
    const spacesB = new LearningSpacesRealmB({
      catalog: {},
      authClient: authClient(storeB)
    });

    setOnline(false);
    await Promise.all([
      queueCards(spacesA, baseCourse, cardsFromA),
      queueCards(spacesB, baseCourse, cardsFromB)
    ]);

    const queue = await spacesA.readWorkspaceAuthoringQueue(courseRef());
    const queuedCards = microsequenceOf(queue.draftCourse).cards;
    assert.equal(queue.operations.length, 1);
    assert.equal(queuedCards[0].text, cardsFromA[0].text);
    assert.equal(queuedCards[0].after, cardsFromB[0].after);
    assert.equal(queue.operations[0].cards[0].text, cardsFromA[0].text);
    assert.equal(queue.operations[0].cards[0].after, cardsFromB[0].after);
  } finally {
    storeA.close();
    storeB.close();
  }
});

test("duas abas sem Web Locks recusam duas redações stale da mesma folha", async () => {
  const [LearningSpacesRealmA, LearningSpacesRealmB] =
    await isolatedLearningSpacesRealms("same-leaf");
  const [storeA, storeB] = await sharedIndexedDbStores();
  try {
    const baseCourse = fixture();
    const cardsFromA = cardsWithText(baseCourse, 0, "Redação concorrente da primeira aba.");
    const cardsFromB = cardsWithText(baseCourse, 0, "Redação concorrente da segunda aba.");
    const spacesA = new LearningSpacesRealmA({
      catalog: {},
      authClient: authClient(storeA)
    });
    const spacesB = new LearningSpacesRealmB({
      catalog: {},
      authClient: authClient(storeB)
    });

    setOnline(false);
    const results = await Promise.allSettled([
      queueCards(spacesA, baseCourse, cardsFromA),
      queueCards(spacesB, baseCourse, cardsFromB)
    ]);

    assert.deepEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
    const rejected = results.find((result) => result.status === "rejected");
    assert.equal(rejected.reason?.code, "workspace_authoring_conflict");
    assert.match(rejected.reason?.message || "", /duas edições locais concorrentes|também foi alterado/iu);
    const queue = await spacesA.readWorkspaceAuthoringQueue(courseRef());
    assert.equal(queue.operations.length, 1);
    assert.equal([
      cardsFromA[0].text,
      cardsFromB[0].text
    ].includes(microsequenceOf(queue.draftCourse).cards[0].text), true);
  } finally {
    storeA.close();
    storeB.close();
  }
});

test("metadados do workspace combinam título e objetivo alterados em folhas distintas", async () => {
  const sessionStore = store();
  const baseCourse = fixture();
  const localCourse = structuredClone(baseCourse);
  localCourse.title = "Título local combinado";
  setOnline(false);
  const spaces = new LearningSpaces({ catalog: {}, authClient: authClient(sessionStore) });
  await spaces.queueWorkspaceMetadata({
    courseRef: courseRef(),
    draftCourse: localCourse,
    entityType: "course",
    entityPath: [baseCourse.id],
    baseMetadata: { title: baseCourse.title, goal: baseCourse.goal },
    metadata: { title: localCourse.title, goal: baseCourse.goal }
  });

  let remoteCourse = structuredClone(baseCourse);
  remoteCourse.goal = "Objetivo remoto combinado";
  let revision = 2;
  const writes = [];
  spaces.catalog = {
    async getTrailWorkspaceCourse() {
      return workspaceResponse(remoteCourse, { revision });
    },
    async executeApplicationAuthoringAction(action, args) {
      writes.push([action, structuredClone(args)]);
      assert.equal(action, "atualizarMetadadosDaEntidade");
      remoteCourse = { ...remoteCourse, title: args.title, goal: args.goal };
      return { revision: ++revision };
    }
  };
  setOnline(true);
  const synchronized = await spaces.syncWorkspaceAuthoringQueue(courseRef());
  assert.equal(synchronized.status, "materialized");
  assert.equal(remoteCourse.title, localCourse.title);
  assert.equal(remoteCourse.goal, "Objetivo remoto combinado");
  assert.equal(writes.length, 1);
});

test("fila textual recusa remoção ou reordenação de cards", async () => {
  const sessionStore = store();
  const baseCourse = fixture();
  const structurallyChangedCards = structuredClone(microsequenceOf(baseCourse).cards.slice(0, 1));
  const spaces = new LearningSpaces({
    catalog: {},
    authClient: authClient(sessionStore)
  });
  setOnline(false);

  await assert.rejects(
    () => queueCards(spaces, baseCourse, structurallyChangedCards),
    /identidade.*ordem.*quantidade/iu
  );
  assert.equal(sessionStore.values.has(QUEUE_KEY), false);
});

test("retry após resposta perdida conserva o requestId persistido", async () => {
  const sessionStore = store();
  const baseCourse = fixture();
  const localCards = cardsWithText(baseCourse, 0, "Texto para retry idempotente.");
  setOnline(false);
  const offlineSession = new LearningSpaces({
    catalog: {},
    authClient: authClient(sessionStore)
  });
  await queueCards(offlineSession, baseCourse, localCards);
  const persistedRequestId = sessionStore.values.get(QUEUE_KEY).operations[0].requestId;
  let loseFirstResponse = true;
  const catalog = remoteCatalog(baseCourse, {
    beforeWrite() {
      if (!loseFirstResponse) return;
      loseFirstResponse = false;
      throw new TypeError("resposta perdida antes da confirmação");
    }
  });

  setOnline(true);
  const firstOnlineSession = new LearningSpaces({
    catalog,
    authClient: authClient(sessionStore)
  });
  const postponed = await firstOnlineSession.syncWorkspaceAuthoringQueue(courseRef());
  assert.equal(postponed.status, "pending");
  assert.equal(sessionStore.values.get(QUEUE_KEY).operations[0].requestId, persistedRequestId);

  const secondOnlineSession = new LearningSpaces({
    catalog,
    authClient: authClient(sessionStore)
  });
  const synchronized = await secondOnlineSession.syncWorkspaceAuthoringQueue(courseRef());

  assert.equal(synchronized.status, "materialized");
  assert.deepEqual(catalog.writes.map((entry) => entry.arguments.requestId), [
    persistedRequestId,
    persistedRequestId
  ]);
  assert.equal(microsequenceOf(catalog.currentCourse()).cards[0].text, localCards[0].text);
  assert.equal(sessionStore.values.has(QUEUE_KEY), false);
});

test("edição seguinte a resposta perdida usa novo requestId e não perde o texto", async () => {
  const sessionStore = store();
  const baseCourse = fixture();
  const firstCards = cardsWithText(baseCourse, 0, "Primeira redação aplicada.");
  setOnline(false);
  const spaces = new LearningSpaces({ catalog: {}, authClient: authClient(sessionStore) });
  await queueCards(spaces, baseCourse, firstCards);
  const firstRequestId = sessionStore.values.get(QUEUE_KEY).operations[0].requestId;
  let loseResponse = true;
  spaces.catalog = remoteCatalog(baseCourse, {
    afterWrite() {
      if (!loseResponse) return;
      loseResponse = false;
      throw new TypeError("resposta perdida depois do commit");
    }
  });

  setOnline(true);
  assert.equal((await spaces.syncWorkspaceAuthoringQueue(courseRef())).status, "pending");
  assert.equal(microsequenceOf(spaces.catalog.currentCourse()).cards[0].text, firstCards[0].text);

  const firstDraft = courseWithCards(baseCourse, firstCards);
  const secondCards = cardsWithText(firstDraft, 0, "Segunda redação preservada.");
  setOnline(false);
  await queueCards(spaces, firstDraft, secondCards);
  const queued = sessionStore.values.get(QUEUE_KEY).operations;
  assert.equal(queued.length, 2);
  assert.equal(queued[0].requestId, firstRequestId);
  assert.notEqual(queued[1].requestId, firstRequestId);

  setOnline(true);
  const synchronized = await spaces.syncWorkspaceAuthoringQueue(courseRef());
  assert.equal(synchronized.status, "materialized");
  assert.equal(microsequenceOf(spaces.catalog.currentCourse()).cards[0].text, secondCards[0].text);
  assert.equal(sessionStore.values.has(QUEUE_KEY), false);
});

test("curso materializado reabre offline mesmo antes de outro refresh remoto", async () => {
  const sessionStore = store();
  const baseCourse = fixture();
  const descriptor = trailItem();
  const localCards = cardsWithText(baseCourse, 0, "Texto materializado antes de sair.");
  const catalog = remoteCatalog(baseCourse);
  const firstSession = new LearningSpaces({
    catalog,
    authClient: authClient(sessionStore)
  });
  await firstSession.writeCache(trailPage());
  await firstSession.cacheWorkspaceCourse(
    descriptor,
    workspaceResponse(baseCourse),
    baseCourse
  );
  setOnline(false);
  await queueCards(firstSession, baseCourse, localCards);
  setOnline(true);
  const synchronized = await firstSession.syncWorkspaceAuthoringQueue(courseRef());
  assert.equal(synchronized.status, "materialized");

  setOnline(false);
  const secondSession = new LearningSpaces({
    catalog: {},
    authClient: authClient(sessionStore)
  });
  const snapshot = await secondSession.loadTrailSnapshot({ online: false });
  const cachedItem = snapshot.items.find((item) => item.trailItemId === ITEM_A);
  const reopened = await secondSession.loadWorkspaceCourse(cachedItem);

  assert.equal(reopened.revision, synchronized.revision);
  assert.equal(cachedItem.revision <= reopened.revision, true);
  assert.equal(cachedItem.canEditOffline, true);
  const reopenedCard = reopened.parts.find((part) => part.id === localCards[0].id);
  assert.equal(reopenedCard.content.text, localCards[0].text);

  const controller = new HomeTrailsController({
    adapter: {
      loadTrailSnapshot: () => secondSession.loadTrailSnapshot({ online: false }),
      loadWorkspaceCourse: (item) => secondSession.loadWorkspaceCourse(item),
      cacheWorkspaceCourse: (item, response, course) =>
        secondSession.cacheWorkspaceCourse(item, response, course),
      clearWorkspaceCourseCache: (itemId) => secondSession.clearWorkspaceCourseCache(itemId)
    }
  });
  await controller.refresh();
  await controller.loadCourse(ITEM_A);
  await controller.refresh();
  assert.equal(controller.loadedCourses.has(ITEM_A), true);
  assert.equal(controller.courseRefs.get(ITEM_A).revision, synchronized.revision);
  assert.notEqual(await secondSession.readWorkspaceCourseCache(courseRef(1)), null);
});

test("sincronização combina edições locais e remotas em cards distintos", async () => {
  const sessionStore = store();
  const baseCourse = fixture();
  const localCards = cardsWithText(baseCourse, 0, "Card A editado localmente.");
  setOnline(false);
  const offlineSession = new LearningSpaces({
    catalog: {},
    authClient: authClient(sessionStore)
  });
  await queueCards(offlineSession, baseCourse, localCards);

  const remoteCards = structuredClone(microsequenceOf(baseCourse).cards);
  remoteCards[1].after = "Feedback do card B editado remotamente.";
  const catalog = remoteCatalog(courseWithCards(baseCourse, remoteCards), {
    initialRevision: 2
  });
  setOnline(true);
  const onlineSession = new LearningSpaces({
    catalog,
    authClient: authClient(sessionStore)
  });
  const synchronized = await onlineSession.syncWorkspaceAuthoringQueue(courseRef());
  const synchronizedCards = microsequenceOf(catalog.currentCourse()).cards;

  assert.equal(synchronized.status, "materialized");
  assert.equal(synchronizedCards[0].text, localCards[0].text);
  assert.equal(synchronizedCards[1].after, remoteCards[1].after);
  assert.equal(catalog.writes.length, 1);
  assert.equal(catalog.writes[0].arguments.expectedRevision, 2);
});

test("sincronização combina folhas textuais distintas do mesmo card", async () => {
  const sessionStore = store();
  const baseCourse = fixture();
  const localCards = cardsWithText(baseCourse, 0, "Título local do mesmo card.");
  setOnline(false);
  const spaces = new LearningSpaces({ catalog: {}, authClient: authClient(sessionStore) });
  await queueCards(spaces, baseCourse, localCards);

  const remoteCards = structuredClone(microsequenceOf(baseCourse).cards);
  remoteCards[0].after = "Explicação remota preservada.";
  spaces.catalog = remoteCatalog(courseWithCards(baseCourse, remoteCards), {
    initialRevision: 2
  });
  setOnline(true);
  const synchronized = await spaces.syncWorkspaceAuthoringQueue(courseRef());
  const resultCards = microsequenceOf(spaces.catalog.currentCourse()).cards;

  assert.equal(synchronized.status, "materialized");
  assert.equal(resultCards[0].text, localCards[0].text);
  assert.equal(resultCards[0].after, remoteCards[0].after);
});

test("sincronização preserva o rascunho e acusa conflito no mesmo card", async () => {
  const sessionStore = store();
  const baseCourse = fixture();
  const localCards = cardsWithText(baseCourse, 0, "Versão local do card A.");
  setOnline(false);
  const offlineSession = new LearningSpaces({
    catalog: {},
    authClient: authClient(sessionStore)
  });
  await queueCards(offlineSession, baseCourse, localCards);

  const remoteCards = cardsWithText(baseCourse, 0, "Versão remota do card A.");
  const catalog = remoteCatalog(courseWithCards(baseCourse, remoteCards), {
    initialRevision: 2
  });
  setOnline(true);
  const onlineSession = new LearningSpaces({
    catalog,
    authClient: authClient(sessionStore)
  });
  const synchronized = await onlineSession.syncWorkspaceAuthoringQueue(courseRef());
  const persisted = await onlineSession.readWorkspaceAuthoringQueue(courseRef());

  assert.equal(synchronized.status, "conflict");
  assert.equal(synchronized.pending, true);
  assert.equal(catalog.writes.length, 0);
  assert.equal(persisted.status, "conflict");
  assert.equal(microsequenceOf(persisted.draftCourse).cards[0].text, localCards[0].text);
  assert.match(persisted.errorMessage, /também foi alterado/iu);
});

test("resolução explícita mantém só o texto local conflitante", async () => {
  const sessionStore = store();
  const baseCourse = fixture();
  const localCards = cardsWithText(baseCourse, 0, "Redação local escolhida.");
  setOnline(false);
  const spaces = new LearningSpaces({ catalog: {}, authClient: authClient(sessionStore) });
  await queueCards(spaces, baseCourse, localCards);

  const remoteCards = cardsWithText(baseCourse, 0, "Redação remota concorrente.");
  remoteCards[0].after = "Explicação remota em outra folha.";
  spaces.catalog = remoteCatalog(courseWithCards(baseCourse, remoteCards), {
    initialRevision: 2
  });
  setOnline(true);
  const conflicted = await spaces.syncWorkspaceAuthoringQueue(courseRef());
  assert.equal(conflicted.status, "conflict");

  const resolved = await spaces.resolveWorkspaceAuthoringConflict(
    courseRef(),
    "keep_local"
  );
  const resultCards = microsequenceOf(spaces.catalog.currentCourse()).cards;
  assert.equal(resolved.status, "materialized");
  assert.equal(resultCards[0].text, localCards[0].text);
  assert.equal(resultCards[0].after, remoteCards[0].after);
  assert.equal(sessionStore.values.has(QUEUE_KEY), false);
});

test("resolução explícita pode descartar todo o rascunho local", async () => {
  const sessionStore = store();
  const baseCourse = fixture();
  const localCards = cardsWithText(baseCourse, 0, "Redação local descartada.");
  setOnline(false);
  const spaces = new LearningSpaces({ catalog: {}, authClient: authClient(sessionStore) });
  await queueCards(spaces, baseCourse, localCards);

  const remoteCards = cardsWithText(baseCourse, 0, "Redação remota mantida.");
  spaces.catalog = remoteCatalog(courseWithCards(baseCourse, remoteCards), {
    initialRevision: 2
  });
  setOnline(true);
  assert.equal((await spaces.syncWorkspaceAuthoringQueue(courseRef())).status, "conflict");
  const discarded = await spaces.resolveWorkspaceAuthoringConflict(
    courseRef(),
    "discard_local"
  );

  assert.equal(discarded.status, "discarded");
  assert.equal(microsequenceOf(discarded.course).cards[0].text, remoteCards[0].text);
  assert.equal(spaces.catalog.writes.length, 0);
  assert.equal(sessionStore.values.has(QUEUE_KEY), false);
});

test("edição anexada durante sincronização não é apagada pela fila em voo", async () => {
  const sessionStore = store();
  const baseCourse = fixture();
  const firstCards = cardsWithText(baseCourse, 0, "Primeira edição já na fila.");
  setOnline(false);
  const spaces = new LearningSpaces({
    catalog: {},
    authClient: authClient(sessionStore)
  });
  await queueCards(spaces, baseCourse, firstCards);

  let releaseFirstWrite;
  let signalFirstWrite;
  const firstWriteEntered = new Promise((resolve) => {
    signalFirstWrite = resolve;
  });
  const firstWriteReleased = new Promise((resolve) => {
    releaseFirstWrite = resolve;
  });
  const catalog = remoteCatalog(baseCourse, {
    async beforeWrite({ callCount }) {
      if (callCount !== 1) return;
      signalFirstWrite();
      await firstWriteReleased;
    }
  });
  spaces.catalog = catalog;
  setOnline(true);
  const syncing = spaces.syncWorkspaceAuthoringQueue(courseRef());
  await firstWriteEntered;

  const firstDraft = courseWithCards(baseCourse, firstCards);
  const secondCards = structuredClone(firstCards);
  secondCards[1].after = "Segunda edição criada durante o primeiro envio.";
  const appending = queueCards(spaces, firstDraft, secondCards);
  releaseFirstWrite();

  const [firstResult, secondResult] = await Promise.all([syncing, appending]);
  const remoteCards = microsequenceOf(catalog.currentCourse()).cards;
  assert.equal(firstResult.status, "materialized");
  assert.equal(secondResult.status, "materialized");
  assert.equal(catalog.writes.length, 2);
  assert.notEqual(
    catalog.writes[0].arguments.requestId,
    catalog.writes[1].arguments.requestId
  );
  assert.equal(remoteCards[0].text, firstCards[0].text);
  assert.equal(remoteCards[1].after, secondCards[1].after);
  assert.equal(sessionStore.values.has(QUEUE_KEY), false);
});

test("canEditOffline exige autoridade prévia e cache ou rascunho e alcança a referência", async () => {
  const sessionStore = store();
  const baseCourse = fixture();
  const editableWithCache = trailItem({ trailItemId: ITEM_A });
  const editableWithoutCache = trailItem({ trailItemId: ITEM_B });
  const unauthorizedWithCache = trailItem({ trailItemId: ITEM_C, canEdit: false });
  const spaces = new LearningSpaces({
    catalog: {},
    authClient: authClient(sessionStore)
  });
  await spaces.writeCache(trailPage([
    editableWithCache,
    editableWithoutCache,
    unauthorizedWithCache
  ]));
  await spaces.cacheWorkspaceCourse(
    editableWithCache,
    workspaceResponse(baseCourse, { trailItemId: ITEM_A }),
    baseCourse
  );
  await spaces.cacheWorkspaceCourse(
    unauthorizedWithCache,
    workspaceResponse(baseCourse, { trailItemId: ITEM_C }),
    baseCourse
  );

  setOnline(false);
  let snapshot = await spaces.loadTrailSnapshot({ online: false });
  const byId = new Map(snapshot.items.map((item) => [item.trailItemId, item]));
  assert.equal(byId.get(ITEM_A).canEditOffline, true);
  assert.equal(byId.get(ITEM_B).canEditOffline, false);
  assert.equal(byId.get(ITEM_C).canEditOffline, false);
  assert.equal(snapshot.items.every((item) => item.canEdit === false), true);

  await spaces.clearWorkspaceCourseCache(ITEM_A);
  await queueCards(spaces, baseCourse, microsequenceOf(baseCourse).cards);
  snapshot = await spaces.loadTrailSnapshot({ online: false });
  const itemBackedOnlyByDraft = snapshot.items.find((item) => item.trailItemId === ITEM_A);
  assert.equal(itemBackedOnlyByDraft.canEditOffline, true);
  const reopenedFromDraft = await spaces.loadWorkspaceCourse(itemBackedOnlyByDraft);
  assert.equal(reopenedFromDraft.draftCourse.id, COURSE_KEY);

  const controller = new HomeTrailsController({
    adapter: {
      loadTrailSnapshot: () => spaces.loadTrailSnapshot({ online: false })
    }
  });
  await controller.refresh();
  assert.equal(controller.item(ITEM_A).canEditOffline, true);
  assert.equal(controller.courseRefs.get(ITEM_A).canEditOffline, true);
});

test("reinício após enviar a última operação conclui a fila vazia sem rascunho fantasma", async () => {
  const sessionStore = store();
  const baseCourse = fixture();
  await sessionStore.putSyncState(QUEUE_KEY, {
    contract: "aralearn.workspace-authoring-queue.v1",
    trailItemId: ITEM_A,
    workspaceId: WORKSPACE_ID,
    courseKey: COURSE_KEY,
    baseRevision: 2,
    status: "pending",
    errorMessage: "",
    operations: [],
    draftCourse: baseCourse,
    updatedAt: "2026-08-09T12:00:00Z"
  });
  const catalog = remoteCatalog(baseCourse, { initialRevision: 2 });
  const spaces = new LearningSpaces({ catalog, authClient: authClient(sessionStore) });

  setOnline(true);
  const result = await spaces.syncWorkspaceAuthoringQueue(courseRef(1));

  assert.equal(result.status, "materialized");
  assert.equal(catalog.writes.length, 0);
  assert.equal(sessionStore.values.has(QUEUE_KEY), false);
  assert.equal((await spaces.readWorkspaceCourseCache(courseRef(1))).revision, 2);
});
