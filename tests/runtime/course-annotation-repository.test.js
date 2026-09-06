import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";

import {
  COURSE_ANNOTATION_CACHE_CONTRACT,
  COURSE_ANNOTATION_OUTBOX_CONTRACT,
  CourseAnnotationRepository
} from
  "../../src/persistence/CourseAnnotationRepository.js";
import { CourseLocalStore } from "../../src/persistence/CourseLocalStore.js";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const COURSE_ID = "20000000-0000-4000-8000-000000000002";
const UNIT_ID = "unit-a";

function annotation(command, version, now, state = "open") {
  const withdrawn = state === "withdrawn";
  return {
    contract: "aralearn.course-anchored-annotation.v1",
    annotationId: command.annotationId,
    annotationVersion: version,
    courseId: COURSE_ID,
    provenance: { origin: "learner", channel: "study_interface" },
    contributor: { kind: "self", role: "learner", ref: "self", label: "Você" },
    target: {
      kind: "study_unit",
      id: UNIT_ID,
      observedPath: [
        { kind: "course", id: COURSE_ID, label: "Curso", version: 7 },
        { kind: "study_unit", id: UNIT_ID, label: "Unidade", version: 2 }
      ],
      currentAvailable: true,
      currentPath: [
        { kind: "course", id: COURSE_ID, label: "Curso", version: 7 },
        { kind: "study_unit", id: UNIT_ID, label: "Unidade", version: 2 }
      ],
      deepLink: `#/authoring/courses/${COURSE_ID}?section=content&studyUnitId=${UNIT_ID}`
    },
    observedRevision: { certainty: "known", courseRevision: 7, targetVersion: 2 },
    rawText: withdrawn ? null : command.rawText,
    category: command.category ?? null,
    briefSummary: withdrawn ? null : command.briefSummary ?? null,
    subjectClassification: {
      status: "unclassified",
      automatic: {
        method: "target_scope_unclassified",
        methodVersion: 1,
        taxonomyRevision: 7,
        subjects: []
      },
      effective: {
        method: "target_scope_unclassified",
        methodVersion: 1,
        taxonomyRevision: 7,
        subjects: []
      },
      correctedAt: null
    },
    state,
    ownerResponse: null,
    timestamps: {
      capturedAt: command.capturedAt ?? now,
      createdAt: now,
      updatedAt: now,
      firstConsideredAt: null,
      respondedAt: null,
      resolvedAt: null,
      withdrawnAt: withdrawn ? now : null
    },
    capabilities: {
      canRevise: !withdrawn,
      canWithdraw: !withdrawn,
      canConsider: false,
      canRespond: false,
      canResolve: false,
      canReopen: false,
      canCorrectSubjects: false
    },
    deepLink: `#/authoring/courses/${COURSE_ID}?section=review&annotationId=${command.annotationId}`
  };
}

function denseAnnotation(value) {
  const subjects = Array.from({ length: 8 }, (_, index) => ({
    topicId: `topic-${index}`,
    label: "😀".repeat(300),
    topicVersion: 1
  }));
  const annotationValue = structuredClone(value);
  annotationValue.rawText = "😀".repeat(2_000);
  annotationValue.briefSummary = "😀".repeat(500);
  annotationValue.ownerResponse = {
    text: "😀".repeat(2_000),
    kind: "answer",
    consideredSourceLinks: [],
    updatedAt: "2026-08-17T15:00:00.000Z"
  };
  annotationValue.timestamps.respondedAt = "2026-08-17T15:00:00.000Z";
  annotationValue.contributor.label = "😀".repeat(120);
  for (const path of [annotationValue.target.observedPath, annotationValue.target.currentPath]) {
    for (const entry of path) entry.label = "😀".repeat(300);
  }
  annotationValue.subjectClassification = {
    status: "classified",
    automatic: {
      method: "target_scope_unclassified",
      methodVersion: 1,
      taxonomyRevision: 7,
      subjects: structuredClone(subjects)
    },
    effective: {
      method: "human_topic_selection",
      methodVersion: 1,
      taxonomyRevision: 7,
      subjects: structuredClone(subjects)
    },
    correctedAt: "2026-08-17T15:00:00.000Z"
  };
  return annotationValue;
}

function fakeApi() {
  const state = {
    online: true,
    setVersion: 0,
    items: new Map(),
    receipts: new Map(),
    calls: []
  };
  return {
    state,
    async getMyCourseAnchoredAnnotations(courseId, options) {
      assert.equal(courseId, COURSE_ID);
      if (!state.online) {
        const error = new TypeError("Failed to fetch");
        error.code = "NETWORK_ERROR";
        throw error;
      }
      const items = [...state.items.values()].filter((item) =>
        item.target.id === options.query.hierarchy.target.id);
      return {
        contract: "aralearn.course-anchored-annotation-page.v1",
        courseId: COURSE_ID,
        courseRevision: 7,
        annotationSetVersion: state.setVersion,
        query: structuredClone(options.query),
        summary: {
          matchingTotal: items.length,
          byOrigin: { learner: items.length },
          byChannel: { study_interface: items.length },
          byState: { open: items.filter(({ state: value }) => value === "open").length },
          unclassifiedTotal: items.length
        },
        items: structuredClone(items),
        hasMore: false,
        nextCursor: null
      };
    },
    async executeMyCourseAnchoredAnnotationCommand(value) {
      state.calls.push(structuredClone(value));
      if (!state.online) {
        const error = new TypeError("Failed to fetch");
        error.code = "NETWORK_ERROR";
        throw error;
      }
      if (state.receipts.has(value.requestId)) {
        return { ...structuredClone(state.receipts.get(value.requestId)), idempotent: true };
      }
      const command = value.command;
      const current = state.items.get(command.annotationId);
      const version = command.type === "create_anchored_annotation"
        ? 1
        : command.expectedAnnotationVersion + 1;
      const source = command.type === "create_anchored_annotation" ? command : {
        ...current,
        ...command,
        rawText: command.rawText ?? current.rawText,
        category: Object.hasOwn(command, "category") ? command.category : current.category,
        briefSummary: Object.hasOwn(command, "briefSummary")
          ? command.briefSummary
          : current.briefSummary,
        capturedAt: current.timestamps.capturedAt
      };
      const item = annotation(
        source,
        version,
        "2026-08-17T15:00:00.000Z",
        command.type === "withdraw_anchored_annotation" ? "withdrawn" : "open"
      );
      state.items.set(command.annotationId, item);
      state.setVersion += 1;
      const change = {
        contract: "aralearn.course-anchored-annotation-change.v1",
        courseId: COURSE_ID,
        courseRevision: 7,
        annotationSetVersion: state.setVersion,
        requestId: value.requestId,
        idempotent: false,
        changed: true,
        annotation: item
      };
      state.receipts.set(value.requestId, structuredClone(change));
      return change;
    }
  };
}

function ids() {
  let index = 10;
  return () => `30000000-0000-4000-8000-${String(index += 1).padStart(12, "0")}`;
}

function collaborativeWindow() {
  const channels = new Map();
  const messages = [];
  class BroadcastChannel {
    constructor(name) {
      this.name = name;
      this.listeners = new Set();
      const members = channels.get(name) || new Set();
      members.add(this);
      channels.set(name, members);
    }

    addEventListener(type, listener) {
      if (type === "message") this.listeners.add(listener);
    }

    postMessage(value) {
      messages.push(structuredClone(value));
      for (const channel of channels.get(this.name) || []) {
        if (channel === this) continue;
        queueMicrotask(() => {
          for (const listener of channel.listeners) listener({ data: structuredClone(value) });
        });
      }
    }

    close() {
      channels.get(this.name)?.delete(this);
    }
  }
  return { windowValue: { BroadcastChannel }, messages };
}

function collaborativeLocks() {
  const pending = new Map();
  return {
    request(name, _options, operation) {
      const next = (pending.get(name) || Promise.resolve()).then(operation, operation);
      pending.set(name, next.catch(() => undefined));
      return next;
    }
  };
}

async function repository(api = fakeApi()) {
  const cache = await CourseLocalStore.open(new IDBFactory(), { userId: USER_ID });
  const value = new CourseAnnotationRepository({
    courseId: COURSE_ID,
    courseRevision: 7,
    api,
    cache,
    clock: () => new Date("2026-08-17T14:00:00.000Z"),
    uuidFactory: ids(),
    windowValue: {}
  });
  await value.initialize();
  return { value, cache, api };
}

test("manual mantém outbox em fundo e permite Salvar observação e sincronização explícitos", async () => {
  const api = fakeApi();
  let reads = 0;
  const read = api.getMyCourseAnchoredAnnotations.bind(api);
  api.getMyCourseAnchoredAnnotations = (...args) => { reads += 1; return read(...args); };
  const cache = await CourseLocalStore.open(new IDBFactory(), { userId: USER_ID });
  const value = new CourseAnnotationRepository({ courseId: COURSE_ID, courseRevision: 7, api, cache,
    synchronizationMode: "manual", uuidFactory: ids(), windowValue: {} });
  await value.initialize();
  await value.refreshTarget({ studyUnitId: UNIT_ID });
  assert.equal(reads, 0);
  api.state.online = false;
  await value.createForTarget({ studyUnitId: UNIT_ID }, { rawText: "Observação explícita.", category: null });
  const sent = api.state.calls.length;
  assert.equal(sent, 1);
  api.state.online = true;
  await value.flush();
  assert.equal(api.state.calls.length, sent);
  assert.equal(value.snapshot().pendingCount, 1);
  await value.flush({ explicit: true });
  assert.equal(value.snapshot().pendingCount, 0);
  assert.equal(api.state.items.size, 1);
  await value.refreshTarget({ studyUnitId: UNIT_ID }, { explicit: true });
  assert.ok(reads > 0);
  value.close();
  cache.close();
});

test("mantém N observações offline e sincroniza cada request uma vez", async () => {
  const api = fakeApi();
  api.state.online = false;
  const { value, cache } = await repository(api);

  await value.createForTarget({ studyUnitId: UNIT_ID }, {
    rawText: "Primeira observação.",
    category: "question"
  });
  await value.createForTarget({ studyUnitId: UNIT_ID }, {
    rawText: "Segunda observação.",
    category: null
  });
  await value.flush();

  assert.equal(value.snapshot().pendingCount, 2);
  assert.equal(value.loadForTarget({ studyUnitId: UNIT_ID }).length, 2);
  assert.deepEqual(
    value.loadForTarget({ studyUnitId: UNIT_ID }).map(({ syncStatus }) => syncStatus),
    ["pending", "pending"]
  );

  api.state.online = true;
  await value.flush();
  assert.equal(value.snapshot().pendingCount, 0);
  assert.equal(api.state.items.size, 2);
  assert.equal(new Set(api.state.calls.map(({ requestId }) => requestId)).size, 2);
  value.close();
  cache.close();
});

test("preserva payload tentado e cria novo comando para editar e retirar", async () => {
  const api = fakeApi();
  api.state.online = false;
  const { value, cache } = await repository(api);
  const created = await value.createForTarget({ studyUnitId: UNIT_ID }, {
    rawText: "Texto inicial.",
    category: "confusing"
  });
  await value.flush();
  const firstAttempt = structuredClone(api.state.calls.at(-1));

  await value.revise(created.annotationId, {
    rawText: "Texto revisto.",
    category: "suggestion"
  });
  assert.equal(api.state.calls[0].command.rawText, firstAttempt.command.rawText);
  assert.notEqual(
    value.loadForTarget({ studyUnitId: UNIT_ID }).find(({ annotationId }) =>
      annotationId === created.annotationId).rawText,
    firstAttempt.command.rawText
  );

  api.state.online = true;
  await value.flush();
  const synced = value.loadForTarget({ studyUnitId: UNIT_ID }).find(({ annotationId }) =>
    annotationId === created.annotationId);
  assert.equal(synced.rawText, "Texto revisto.");
  assert.equal(synced.annotationVersion, 2);

  await value.withdraw(created.annotationId);
  await value.flush();
  const withdrawn = value.loadForTarget({ studyUnitId: UNIT_ID }).find(({ annotationId }) =>
    annotationId === created.annotationId);
  assert.equal(withdrawn.state, "withdrawn");
  assert.equal(withdrawn.rawText, null);
  assert.equal(api.state.calls.at(-1).command.type, "withdraw_anchored_annotation");
  value.close();
  cache.close();
});

test("retirada offline redige texto, síntese e resposta no cache e na memória", async () => {
  const api = fakeApi();
  const { value, cache } = await repository(api);
  const created = await value.createForTarget({ studyUnitId: UNIT_ID }, {
    rawText: "Texto privado que deve desaparecer.",
    category: "question",
    briefSummary: "Síntese privada."
  });
  const authoritative = api.state.items.get(created.annotationId);
  authoritative.ownerResponse = {
    text: "Resposta privada da autoria.",
    kind: "answer",
    consideredSourceLinks: [],
    updatedAt: "2026-08-17T15:30:00.000Z"
  };
  authoritative.timestamps.respondedAt = "2026-08-17T15:30:00.000Z";
  api.state.setVersion += 1;
  await value.refreshTarget({ studyUnitId: UNIT_ID });

  api.state.online = false;
  const withdrawn = await value.withdraw(created.annotationId);
  assert.equal(withdrawn.state, "withdrawn");
  assert.equal(withdrawn.rawText, null);
  assert.equal(withdrawn.briefSummary, null);
  assert.equal(withdrawn.ownerResponse, null);

  const persisted = await cache.getCache(`${COURSE_ANNOTATION_CACHE_CONTRACT}:${COURSE_ID}`);
  const persistedItem = persisted.targetPages[UNIT_ID][0].items[0];
  assert.equal(persistedItem.state, "withdrawn");
  assert.equal(persistedItem.rawText, null);
  assert.equal(persistedItem.briefSummary, null);
  assert.equal(persistedItem.ownerResponse, null);
  assert.doesNotMatch(JSON.stringify(persisted), /privad[ao]/iu);
  value.close();
  cache.close();
});

test("refresh aceita a ordem de chaves devolvida pelo backend hospedado", async () => {
  const api = fakeApi();
  const read = api.getMyCourseAnchoredAnnotations.bind(api);
  api.getMyCourseAnchoredAnnotations = async (courseId, options) => {
    const page = await read(courseId, options);
    const query = page.query;
    page.query = {
      mode: query.mode,
      states: query.states,
      origins: query.origins,
      channels: query.channels,
      hierarchy: query.hierarchy,
      categories: query.categories,
      subjectIds: query.subjectIds,
      annotationId: query.annotationId,
      includeUncategorized: query.includeUncategorized
    };
    return page;
  };
  const { value, cache } = await repository(api);

  assert.deepEqual(await value.refreshTarget({ studyUnitId: UNIT_ID }), []);
  const persisted = await cache.getCache(`${COURSE_ANNOTATION_CACHE_CONTRACT}:${COURSE_ID}`);
  assert.deepEqual(Object.keys(persisted.targetPages[UNIT_ID][0].query), [
    "mode", "origins", "channels", "states", "categories", "includeUncategorized",
    "subjectIds", "hierarchy", "annotationId"
  ]);

  value.close();
  cache.close();
});

test("revisão offline reabre e remove resposta e resolução antigas da projeção", async () => {
  const api = fakeApi();
  const { value, cache } = await repository(api);
  const created = await value.createForTarget({ studyUnitId: UNIT_ID }, {
    rawText: "Texto antes da resposta.",
    category: "question"
  });
  const authoritative = api.state.items.get(created.annotationId);
  authoritative.state = "resolved";
  authoritative.ownerResponse = {
    text: "Resposta que ficou obsoleta.",
    kind: "answer",
    consideredSourceLinks: [],
    updatedAt: "2026-08-17T15:30:00.000Z"
  };
  authoritative.timestamps.respondedAt = "2026-08-17T15:30:00.000Z";
  authoritative.timestamps.resolvedAt = "2026-08-17T15:40:00.000Z";
  api.state.setVersion += 1;
  await value.refreshTarget({ studyUnitId: UNIT_ID });

  api.state.online = false;
  const revised = await value.revise(created.annotationId, {
    rawText: "Texto revisto após a resposta.",
    category: "suggestion"
  });
  assert.equal(revised.state, "open");
  assert.equal(revised.ownerResponse, null);
  assert.equal(revised.timestamps.respondedAt, null);
  assert.equal(revised.timestamps.resolvedAt, null);
  assert.equal(revised.rawText, "Texto revisto após a resposta.");
  value.close();
  cache.close();
});

test("revisão usa somente a versão da observação e aceita revisão corrente do Curso", async () => {
  const api = fakeApi();
  const execute = api.executeMyCourseAnchoredAnnotationCommand.bind(api);
  api.executeMyCourseAnchoredAnnotationCommand = async (value) => {
    const result = await execute(value);
    if (value.command.type === "revise_anchored_annotation") {
      assert.equal(value.expectedCourseRevision, null);
      return { ...result, courseRevision: 8 };
    }
    return result;
  };
  const { value, cache } = await repository(api);
  const created = await value.createForTarget({ studyUnitId: UNIT_ID }, {
    rawText: "Antes.",
    category: null
  });
  await value.flush();
  await value.revise(created.annotationId, { rawText: "Depois.", category: "suggestion" });
  await value.flush();

  assert.equal(value.loadForTarget({ studyUnitId: UNIT_ID })[0].rawText, "Depois.");
  value.close();
  cache.close();
});

test("404 de observação não é tratado como revogação do Curso", async () => {
  const api = fakeApi();
  const { value, cache } = await repository(api);
  const created = await value.createForTarget({ studyUnitId: UNIT_ID }, {
    rawText: "Ainda disponível localmente.",
    category: "question"
  });
  await value.flush();
  const execute = api.executeMyCourseAnchoredAnnotationCommand.bind(api);
  api.executeMyCourseAnchoredAnnotationCommand = async () => {
    const error = new Error("Observação ausente.");
    error.status = 404;
    error.code = "ANNOTATION_NOT_FOUND";
    throw error;
  };

  await value.withdraw(created.annotationId);
  await value.flush();
  assert.equal(value.snapshot().failedCount, 1);
  const failed = value.loadForTarget({ studyUnitId: UNIT_ID })[0];
  assert.equal(failed.syncStatus, "failed");
  assert.equal(failed.state, "open");
  assert.notEqual(await cache.getCache(
    `aralearn.course-anchored-annotation-cache.v1:${COURSE_ID}`
  ), null);

  await value.discardFailed(created.annotationId);
  assert.equal(value.snapshot().failedCount, 0);
  assert.equal(value.loadForTarget({ studyUnitId: UNIT_ID })[0].syncStatus, "synced");
  api.executeMyCourseAnchoredAnnotationCommand = execute;
  await value.withdraw(created.annotationId);
  await value.flush();
  assert.equal(value.snapshot().failedCount, 0);
  assert.equal(value.loadForTarget({ studyUnitId: UNIT_ID })[0].state, "withdrawn");
  value.close();
  cache.close();
});

test("replay sem item confirmado relê o alvo e não dereferencia annotation nula", async () => {
  const api = fakeApi();
  const execute = api.executeMyCourseAnchoredAnnotationCommand.bind(api);
  api.executeMyCourseAnchoredAnnotationCommand = async (value) => {
    const result = await execute(value);
    return { ...result, idempotent: true, changed: false, annotation: null };
  };
  const { value, cache } = await repository(api);
  await value.createForTarget({ studyUnitId: UNIT_ID }, {
    rawText: "Confirmada antes da resposta.",
    category: "confusing"
  });
  await value.flush();

  const items = value.loadForTarget({ studyUnitId: UNIT_ID });
  assert.equal(items.length, 1);
  assert.equal(items[0].syncStatus, "synced");
  assert.equal(items[0].rawText, "Confirmada antes da resposta.");
  value.close();
  cache.close();
});

test("duas abas serializam a outbox e invalidam sem transmitir texto", async () => {
  const api = fakeApi();
  const factory = new IDBFactory();
  const cacheA = await CourseLocalStore.open(factory, { userId: USER_ID });
  const cacheB = await CourseLocalStore.open(factory, { userId: USER_ID });
  const channel = collaborativeWindow();
  const locks = collaborativeLocks();
  const create = (cache, uuidFactory) => new CourseAnnotationRepository({
    courseId: COURSE_ID,
    courseRevision: 7,
    api,
    cache,
    uuidFactory,
    windowValue: channel.windowValue,
    navigatorValue: { locks },
    clock: () => new Date("2026-08-17T14:00:00.000Z")
  });
  const valueA = create(cacheA, () => "30000000-0000-4000-8000-000000000101");
  const valueB = create(cacheB, () => "30000000-0000-4000-8000-000000000102");
  await Promise.all([
    valueA.initialize(),
    valueB.initialize()
  ]);

  let refreshB = Promise.resolve();
  const unsubscribe = valueB.subscribe(({ stale }) => {
    if (stale) refreshB = valueB.refreshTarget({ studyUnitId: UNIT_ID });
  });
  await Promise.all([
    valueA.createForTarget({ studyUnitId: UNIT_ID }, {
      rawText: "Texto privado da aba A.", category: "question"
    }),
    valueB.createForTarget({ studyUnitId: UNIT_ID }, {
      rawText: "Texto privado da aba B.", category: "suggestion"
    })
  ]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await refreshB;

  assert.equal(api.state.items.size, 2);
  assert.equal(valueB.loadForTarget({ studyUnitId: UNIT_ID }).length, 2);
  assert.ok(channel.messages.length > 0);
  for (const message of channel.messages) {
    assert.deepEqual(Object.keys(message).sort(), [
      "annotationIds", "annotationSetVersion", "courseId"
    ]);
    assert.ok(message.annotationSetVersion <= api.state.setVersion);
    assert.ok(message.annotationSetVersion < 1_000_000);
    assert.doesNotMatch(JSON.stringify(message), /Texto privado/u);
  }
  unsubscribe();
  valueA.close();
  valueB.close();
  cacheA.close();
  cacheB.close();
});

test("segunda aba relê o cache ao receber retirada sem depender de subscriber", async () => {
  const api = fakeApi();
  const factory = new IDBFactory();
  const cacheA = await CourseLocalStore.open(factory, { userId: USER_ID });
  const cacheB = await CourseLocalStore.open(factory, { userId: USER_ID });
  const channel = collaborativeWindow();
  const create = (cache, uuidFactory) => new CourseAnnotationRepository({
    courseId: COURSE_ID,
    courseRevision: 7,
    api,
    cache,
    uuidFactory,
    windowValue: channel.windowValue,
    clock: () => new Date("2026-08-17T14:00:00.000Z")
  });
  const valueA = create(cacheA, ids());
  const valueB = create(cacheB, () => "30000000-0000-4000-8000-000000000112");
  await Promise.all([
    valueA.initialize(),
    valueB.initialize()
  ]);
  const created = await valueA.createForTarget({ studyUnitId: UNIT_ID }, {
    rawText: "Texto que a outra aba não pode reter.",
    category: "question",
    briefSummary: "Síntese que precisa ser redigida."
  });
  await new Promise((resolve) => setImmediate(resolve));
  const remote = api.state.items.get(created.annotationId);
  remote.ownerResponse = {
    text: "Resposta que precisa ser redigida.",
    kind: "answer",
    consideredSourceLinks: [],
    updatedAt: "2026-08-17T15:30:00.000Z"
  };
  remote.timestamps.respondedAt = "2026-08-17T15:30:00.000Z";
  api.state.setVersion += 1;
  await valueA.refreshTarget({ studyUnitId: UNIT_ID });
  await valueB.refreshTarget({ studyUnitId: UNIT_ID });
  assert.match(JSON.stringify(valueB.loadForTarget({ studyUnitId: UNIT_ID })), /precisa ser redigida/u);

  await valueA.withdraw(created.annotationId);
  await new Promise((resolve) => setImmediate(resolve));
  const visible = valueB.loadForTarget({ studyUnitId: UNIT_ID });
  assert.equal(visible.length, 1);
  assert.equal(visible[0].state, "withdrawn");
  assert.equal(visible[0].rawText, null);
  assert.equal(visible[0].briefSummary, null);
  assert.equal(visible[0].ownerResponse, null);
  assert.doesNotMatch(JSON.stringify(visible), /precisa ser redigida|não pode reter/u);
  valueA.close();
  valueB.close();
  cacheA.close();
  cacheB.close();
});

test("segunda aba relê a outbox, mas sinaliza que falta snapshot completo sem rede", async () => {
  const api = fakeApi();
  api.state.online = false;
  const factory = new IDBFactory();
  const cacheA = await CourseLocalStore.open(factory, { userId: USER_ID });
  const cacheB = await CourseLocalStore.open(factory, { userId: USER_ID });
  const channel = collaborativeWindow();
  const create = (cache, uuidFactory) => new CourseAnnotationRepository({
    courseId: COURSE_ID,
    courseRevision: 7,
    api,
    cache,
    uuidFactory,
    windowValue: channel.windowValue,
    clock: () => new Date("2026-08-17T14:00:00.000Z")
  });
  const valueA = create(cacheA, () => "30000000-0000-4000-8000-000000000121");
  const valueB = create(cacheB, () => "30000000-0000-4000-8000-000000000122");
  await Promise.all([
    valueA.initialize(),
    valueB.initialize()
  ]);
  let refreshB = Promise.resolve();
  const unsubscribe = valueB.subscribe(({ stale }) => {
    if (stale) refreshB = valueB.refreshTarget({ studyUnitId: UNIT_ID })
      .catch((error) => error);
  });

  await valueA.createForTarget({ studyUnitId: UNIT_ID }, {
    rawText: "Draft privado pendente da aba A.",
    category: "question"
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const refreshError = await refreshB;

  const visible = valueB.loadForTarget({ studyUnitId: UNIT_ID });
  assert.equal(refreshError.code, "course_annotation_cache_miss");
  assert.equal(visible.length, 1);
  assert.equal(visible[0].rawText, "Draft privado pendente da aba A.");
  assert.equal(visible[0].syncStatus, "pending");
  assert.ok(channel.messages.length > 0);
  assert.doesNotMatch(JSON.stringify(channel.messages), /Draft privado/u);
  unsubscribe();
  valueA.close();
  valueB.close();
  cacheA.close();
  cacheB.close();
});

test("Broadcast ignora IDs não UUID e lotes acima do teto", async () => {
  const api = fakeApi();
  const channel = collaborativeWindow();
  const cache = await CourseLocalStore.open(new IDBFactory(), { userId: USER_ID });
  const value = new CourseAnnotationRepository({
    courseId: COURSE_ID,
    courseRevision: 7,
    api,
    cache,
    uuidFactory: ids(),
    windowValue: channel.windowValue,
    clock: () => new Date("2026-08-17T14:00:00.000Z")
  });
  await value.initialize();
  let received = 0;
  value.subscribe(() => { received += 1; });
  const rogue = new channel.windowValue.BroadcastChannel(
    "aralearn.course-anchored-annotations.v1"
  );
  rogue.postMessage({
    courseId: COURSE_ID,
    annotationSetVersion: 1,
    annotationIds: ["texto-privado"]
  });
  rogue.postMessage({
    courseId: COURSE_ID,
    annotationSetVersion: 1,
    annotationIds: Array.from({ length: 129 }, () =>
      "30000000-0000-4000-8000-000000000123")
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(received, 0);
  rogue.close();
  value.close();
  cache.close();
});

test("descarte offline remove a intenção falha sem fingir rebase", async () => {
  const api = fakeApi();
  const { value, cache } = await repository(api);
  const created = await value.createForTarget({ studyUnitId: UNIT_ID }, {
    rawText: "Autoridade inicial.",
    category: null
  });
  const execute = api.executeMyCourseAnchoredAnnotationCommand.bind(api);
  api.executeMyCourseAnchoredAnnotationCommand = async () => {
    const error = new Error("Conflito de versão.");
    error.status = 409;
    error.code = "ANNOTATION_VERSION_CHANGED";
    throw error;
  };
  await value.revise(created.annotationId, {
    rawText: "Mutação que falhou.", category: "confusing"
  });
  assert.equal(value.snapshot().failedCount, 1);

  api.state.online = false;
  api.executeMyCourseAnchoredAnnotationCommand = execute;
  await assert.rejects(
    value.discardFailed(created.annotationId),
    ({ code }) => code === "annotation_rebase_offline"
  );
  assert.equal(value.snapshot().failedCount, 0);
  const visible = value.loadForTarget({ studyUnitId: UNIT_ID })[0];
  assert.equal(visible.rawText, "Autoridade inicial.");
  assert.equal(visible.syncStatus, "synced");
  value.close();
  cache.close();
});

test("outbox adulterada falha fechada antes de chamar a API", async (t) => {
  const annotationA = "30000000-0000-4000-8000-000000000401";
  const annotationB = "30000000-0000-4000-8000-000000000402";
  const requestA = "30000000-0000-4000-8000-000000000403";
  const validEntry = (annotationId = annotationA, requestId = requestA) => ({
    requestId,
    annotationId,
    targetStudyUnitId: UNIT_ID,
    expectedCourseRevision: 7,
    command: {
      type: "create_anchored_annotation",
      annotationId,
      target: { kind: "study_unit", id: UNIT_ID },
      rawText: "Payload íntegro.",
      category: null,
      capturedAt: null,
      briefSummary: null
    },
    status: "pending",
    attempted: false,
    createdAt: "2026-08-17T14:00:00.000Z",
    lastError: null
  });
  const fixtures = [{
    name: "annotationId divergente",
    commands: [{ ...validEntry(), command: { ...validEntry().command, annotationId: annotationB } }]
  }, {
    name: "alvo divergente",
    commands: [{
      ...validEntry(),
      command: { ...validEntry().command, target: { kind: "study_unit", id: "unit-other" } }
    }]
  }, {
    name: "revisão do Curso ausente no create",
    commands: [{ ...validEntry(), expectedCourseRevision: null }]
  }, {
    name: "revisão do Curso indevida na revisão",
    commands: [{
      ...validEntry(),
      expectedCourseRevision: 7,
      command: {
        type: "revise_anchored_annotation",
        annotationId: annotationA,
        expectedAnnotationVersion: 1,
        rawText: "Revisão adulterada.",
        category: null,
        briefSummary: null
      }
    }]
  }, {
    name: "requestId duplicado",
    commands: [validEntry(), validEntry(annotationB, requestA)]
  }];

  for (const fixture of fixtures) {
    await t.test(fixture.name, async () => {
      const api = fakeApi();
      const cache = await CourseLocalStore.open(new IDBFactory(), { userId: USER_ID });
      const key = `${COURSE_ANNOTATION_OUTBOX_CONTRACT}:${COURSE_ID}`;
      await cache.putCache(key, {
        contract: COURSE_ANNOTATION_OUTBOX_CONTRACT,
        courseId: COURSE_ID,
        commands: fixture.commands,
        updatedAt: "2026-08-17T14:00:00.000Z"
      });
      const value = new CourseAnnotationRepository({
        courseId: COURSE_ID,
        courseRevision: 7,
        api,
        cache,
        uuidFactory: ids(),
        windowValue: {},
        clock: () => new Date("2026-08-17T14:00:00.000Z")
      });
      await value.initialize();
      assert.equal(api.state.calls.length, 0);
      assert.equal(value.snapshot().pendingCount, 0);
      assert.equal(await cache.getCache(key), null);
      value.close();
      cache.close();
    });
  }
});

test("replay idempotente aceita revisão corrente mas continua vinculado ao alvo", async () => {
  const api = fakeApi();
  const execute = api.executeMyCourseAnchoredAnnotationCommand.bind(api);
  api.executeMyCourseAnchoredAnnotationCommand = async (value) => {
    const change = await execute(value);
    return { ...change, courseRevision: 8, idempotent: true };
  };
  const { value, cache } = await repository(api);
  await value.createForTarget({ studyUnitId: UNIT_ID }, {
    rawText: "Request já confirmado antes do avanço do Curso.",
    category: null
  });
  assert.equal(value.snapshot().failedCount, 0);
  assert.equal(value.snapshot().pendingCount, 0);

  api.executeMyCourseAnchoredAnnotationCommand = async (input) => {
    const change = await execute(input);
    return {
      ...change,
      annotation: {
        ...change.annotation,
        target: { ...change.annotation.target, id: "unit-other" }
      }
    };
  };
  await value.createForTarget({ studyUnitId: UNIT_ID }, {
    rawText: "Confirmação com alvo divergente.",
    category: "confusing"
  });
  assert.equal(value.snapshot().failedCount, 1);
  value.close();
  cache.close();
});

test("leitura byte-limited agrega sete páginas válidas do mesmo alvo", async () => {
  const api = fakeApi();
  const cursors = [];
  api.getMyCourseAnchoredAnnotations = async (_courseId, options) => {
    cursors.push(options.cursor);
    const index = options.cursor === null ? 0 : Number(options.cursor.replace("cursor", ""));
    const hasMore = index < 6;
    const item = annotation({
      type: "create_anchored_annotation",
      annotationId: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      target: { kind: "study_unit", id: UNIT_ID },
      rawText: `Observação da página ${index + 1}.`,
      category: null,
      capturedAt: "2026-08-17T14:00:00.000Z",
      briefSummary: null
    }, 1, "2026-08-17T14:00:00.000Z");
    return {
      contract: "aralearn.course-anchored-annotation-page.v1",
      courseId: COURSE_ID,
      courseRevision: 7,
      annotationSetVersion: 1,
      query: structuredClone(options.query),
      summary: {
        matchingTotal: 7,
        byOrigin: { learner: 7 },
        byChannel: { study_interface: 7 },
        byState: { open: 7 },
        unclassifiedTotal: 7
      },
      items: [item],
      hasMore,
      nextCursor: hasMore ? `cursor${index + 1}` : null
    };
  };
  const { value, cache } = await repository(api);
  const items = await value.refreshTarget({ studyUnitId: UNIT_ID });
  assert.equal(items.length, 7);
  assert.deepEqual(cursors, [null, "cursor1", "cursor2", "cursor3", "cursor4", "cursor5", "cursor6"]);
  const persisted = await cache.getCache(`${COURSE_ANNOTATION_CACHE_CONTRACT}:${COURSE_ID}`);
  assert.equal(persisted.targetPages[UNIT_ID].length, 7);
  value.close();
  cache.close();
});

test("leitura de alvo recusa cursor repetido antes de gravar página parcial", async () => {
  const api = fakeApi();
  let reads = 0;
  api.getMyCourseAnchoredAnnotations = async (_courseId, options) => {
    reads += 1;
    const item = annotation({
      type: "create_anchored_annotation",
      annotationId: `50000000-0000-4000-8000-${String(reads).padStart(12, "0")}`,
      target: { kind: "study_unit", id: UNIT_ID },
      rawText: `Observação ${reads}.`,
      category: null,
      capturedAt: "2026-08-17T14:00:00.000Z",
      briefSummary: null
    }, 1, "2026-08-17T14:00:00.000Z");
    return {
      contract: "aralearn.course-anchored-annotation-page.v1",
      courseId: COURSE_ID,
      courseRevision: 7,
      annotationSetVersion: 1,
      query: structuredClone(options.query),
      summary: {
        matchingTotal: 3,
        byOrigin: { learner: 3 },
        byChannel: { study_interface: 3 },
        byState: { open: 3 },
        unclassifiedTotal: 3
      },
      items: [item],
      hasMore: true,
      nextCursor: "cursor-repetido"
    };
  };
  const { value, cache } = await repository(api);
  await assert.rejects(
    value.refreshTarget({ studyUnitId: UNIT_ID }),
    /não avançou de forma válida/u
  );
  assert.equal(reads, 2);
  assert.equal(
    await cache.getCache(`${COURSE_ANNOTATION_CACHE_CONTRACT}:${COURSE_ID}`),
    null
  );
  value.close();
  cache.close();
});

test("IDs opacos contam escalares Unicode e bytes, não unidades UTF-16", async () => {
  const api = fakeApi();
  api.state.online = false;
  const { value, cache } = await repository(api);
  const valid = "😀".repeat(240);
  const invalid = "😀".repeat(241);

  await value.createForTarget({ studyUnitId: valid }, {
    rawText: "Alvo astral no limite.",
    category: null
  });
  assert.equal(value.loadForTarget({ studyUnitId: valid }).length, 1);
  await assert.rejects(
    value.createForTarget({ studyUnitId: invalid }, {
      rawText: "Ultrapassa o limite.",
      category: null
    }),
    /Unidade de estudo inválida/u
  );
  value.close();
  cache.close();
});

test("cache adulterado ou de revisão anterior falha fechado e é purgado", async () => {
  const api = fakeApi();
  const { value, cache } = await repository(api);
  await value.createForTarget({ studyUnitId: UNIT_ID }, {
    rawText: "Fato remoto válido.",
    category: "question"
  });
  await value.refreshTarget({ studyUnitId: UNIT_ID });
  value.close();

  const key = `aralearn.course-anchored-annotation-cache.v1:${COURSE_ID}`;
  const validCache = await cache.getCache(key);
  const poisoned = structuredClone(validCache);
  const poisonedItem = poisoned.targetPages[UNIT_ID][0].items[0];
  poisonedItem.target.id = "unit-other";
  poisonedItem.target.observedPath.at(-1).id = "unit-other";
  poisonedItem.target.currentPath.at(-1).id = "unit-other";
  await cache.putCache(key, poisoned);

  const reopened = new CourseAnnotationRepository({
    courseId: COURSE_ID,
    courseRevision: 7,
    api,
    cache,
    clock: () => new Date("2026-08-17T14:00:00.000Z"),
    uuidFactory: ids(),
    windowValue: {}
  });
  await reopened.initialize();
  assert.deepEqual(reopened.loadForTarget({ studyUnitId: UNIT_ID }), []);
  assert.equal(await cache.getCache(key), null);
  reopened.close();

  const stale = structuredClone(validCache);
  stale.courseRevision = 6;
  for (const pages of Object.values(stale.targetPages)) {
    for (const page of pages) page.courseRevision = 6;
  }
  for (const change of stale.changes) change.courseRevision = 6;
  await cache.putCache(key, stale);
  const revised = new CourseAnnotationRepository({
    courseId: COURSE_ID,
    courseRevision: 7,
    api,
    cache,
    clock: () => new Date("2026-08-17T14:00:00.000Z"),
    uuidFactory: ids(),
    windowValue: {}
  });
  await revised.initialize();
  assert.equal(await cache.getCache(key), null);
  revised.close();
  cache.close();
});

test("cache incompatível é recuperado sem perder a outbox", async () => {
  const api = fakeApi();
  api.state.online = false;
  const { value, cache } = await repository(api);
  await value.createForTarget({ studyUnitId: UNIT_ID }, {
    rawText: "Observação ainda não enviada.",
    category: "question"
  });
  assert.equal(value.snapshot().pendingCount, 1);
  value.close();

  const cacheStorageKey = `${COURSE_ANNOTATION_CACHE_CONTRACT}:${COURSE_ID}`;
  const outboxStorageKey = `${COURSE_ANNOTATION_OUTBOX_CONTRACT}:${COURSE_ID}`;
  const incompatible = {
    contract: COURSE_ANNOTATION_CACHE_CONTRACT,
    courseId: COURSE_ID,
    courseRevision: 6,
    annotationSetVersion: 0,
    targetPages: {},
    changes: [],
    updatedAt: "2026-08-17T13:00:00.000Z"
  };
  await cache.putCache(cacheStorageKey, incompatible);

  const reopened = new CourseAnnotationRepository({
    courseId: COURSE_ID,
    courseRevision: 7,
    api,
    cache,
    clock: () => new Date("2026-08-17T14:00:00.000Z"),
    uuidFactory: ids(),
    windowValue: {}
  });
  await reopened.initialize();
  assert.equal(await cache.getCache(cacheStorageKey), null);
  assert.equal(reopened.snapshot().pendingCount, 1);
  assert.equal((await cache.getCache(outboxStorageKey)).commands.length, 1);
  assert.equal(reopened.loadForTarget({ studyUnitId: UNIT_ID })[0].rawText,
    "Observação ainda não enviada.");

  api.state.online = true;
  await reopened.flush();
  assert.equal(reopened.snapshot().pendingCount, 0);
  reopened.close();
  cache.close();
});

test("flush recupera troca concorrente por página de outro alvo", async () => {
  const api = fakeApi();
  const { value, cache } = await repository(api);
  await value.refreshTarget({ studyUnitId: UNIT_ID });

  const cacheStorageKey = `${COURSE_ANNOTATION_CACHE_CONTRACT}:${COURSE_ID}`;
  const outboxStorageKey = `${COURSE_ANNOTATION_OUTBOX_CONTRACT}:${COURSE_ID}`;
  const incompatible = await cache.getCache(cacheStorageKey);
  incompatible.targetPages[UNIT_ID][0].query.hierarchy.target.id = "unit-other";

  api.state.online = false;
  await value.createForTarget({ studyUnitId: UNIT_ID }, {
    rawText: "Criação offline preservada durante a troca.",
    category: "question"
  });
  assert.equal(value.snapshot().pendingCount, 1);
  assert.equal((await cache.getCache(outboxStorageKey)).commands.length, 1);

  const originalUpdateCache = cache.updateCache.bind(cache);
  let concurrentSwapApplied = false;
  cache.updateCache = async (key, updater) => {
    if (key === cacheStorageKey && !concurrentSwapApplied) {
      concurrentSwapApplied = true;
      await cache.putCache(cacheStorageKey, incompatible);
    }
    return originalUpdateCache(key, updater);
  };

  api.state.online = true;
  await value.flush();

  assert.equal(concurrentSwapApplied, true);
  assert.equal(value.snapshot().pendingCount, 0);
  assert.equal((await cache.getCache(outboxStorageKey)).commands.length, 0);
  assert.equal(value.loadForTarget({ studyUnitId: UNIT_ID })[0].rawText,
    "Criação offline preservada durante a troca.");
  assert.equal(value.loadForTarget({ studyUnitId: UNIT_ID })[0].syncStatus, "synced");
  assert.equal(api.state.items.size, 1);
  value.close();
  cache.close();
});

test("cache denso poda mudanças deterministicamente e nunca ultrapassa 2 MiB", async () => {
  const api = fakeApi();
  const execute = api.executeMyCourseAnchoredAnnotationCommand.bind(api);
  api.executeMyCourseAnchoredAnnotationCommand = async (input) => {
    const change = await execute(input);
    return { ...change, annotation: denseAnnotation(change.annotation) };
  };
  const { value, cache } = await repository(api);
  for (let index = 0; index < 60; index += 1) {
    await value.createForTarget({ studyUnitId: UNIT_ID }, {
      rawText: "😀".repeat(2_000),
      category: null,
      briefSummary: "😀".repeat(500)
    });
  }
  const key = `aralearn.course-anchored-annotation-cache.v1:${COURSE_ID}`;
  const stored = await cache.getCache(key);
  assert.ok(new TextEncoder().encode(JSON.stringify(stored)).byteLength <= 2 * 1024 * 1024);
  assert.ok(stored.changes.length > 0);
  assert.ok(stored.changes.length < 60);
  assert.equal(stored.changes.at(-1).annotation.rawText, "😀".repeat(2_000));

  const oversized = structuredClone(stored);
  oversized.changes = Array.from({ length: 128 }, (_, index) => ({
    ...structuredClone(stored.changes.at(-1)),
    requestId: `request-${String(index).padStart(3, "0")}`
  }));
  await cache.putCache(key, oversized);
  value.close();
  const reopened = new CourseAnnotationRepository({
    courseId: COURSE_ID,
    courseRevision: 7,
    api,
    cache,
    clock: () => new Date("2026-08-17T14:00:00.000Z"),
    uuidFactory: ids(),
    windowValue: {}
  });
  await reopened.initialize();
  assert.equal(await cache.getCache(key), null);
  reopened.close();
  cache.close();
});

test("alvo online maior que 2 MiB retorna completo sem persistir falso vazio", async () => {
  const api = fakeApi();
  const denseItems = Array.from({ length: 60 }, (_, index) => denseAnnotation(annotation({
    type: "create_anchored_annotation",
    annotationId: `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    target: { kind: "study_unit", id: UNIT_ID },
    rawText: "Substituído pela carga densa.",
    category: null,
    capturedAt: "2026-08-17T14:00:00.000Z",
    briefSummary: null
  }, 1, "2026-08-17T14:00:00.000Z")));
  api.getMyCourseAnchoredAnnotations = async (_courseId, options) => {
    if (!api.state.online) {
      const error = new TypeError("Failed to fetch");
      error.code = "NETWORK_ERROR";
      throw error;
    }
    const offset = options.cursor === null ? 0 : Number(options.cursor.replace("cursor", ""));
    const items = denseItems.slice(offset, offset + 4);
    const nextOffset = offset + items.length;
    const hasMore = nextOffset < denseItems.length;
    return {
      contract: "aralearn.course-anchored-annotation-page.v1",
      courseId: COURSE_ID,
      courseRevision: 7,
      annotationSetVersion: 1,
      query: structuredClone(options.query),
      summary: {
        matchingTotal: denseItems.length,
        byOrigin: { learner: denseItems.length },
        byChannel: { study_interface: denseItems.length },
        byState: { open: denseItems.length },
        unclassifiedTotal: 0
      },
      items: structuredClone(items),
      hasMore,
      nextCursor: hasMore ? `cursor${nextOffset}` : null
    };
  };
  const { value, cache } = await repository(api);
  const online = await value.refreshTarget({ studyUnitId: UNIT_ID });
  assert.equal(online.length, denseItems.length);

  const key = `${COURSE_ANNOTATION_CACHE_CONTRACT}:${COURSE_ID}`;
  const stored = await cache.getCache(key);
  assert.ok(new TextEncoder().encode(JSON.stringify(stored)).byteLength <= 2 * 1024 * 1024);
  assert.equal(Object.hasOwn(stored.targetPages, UNIT_ID), false);

  api.state.online = false;
  const revised = await value.revise(denseItems[0].annotationId, {
    rawText: "Revisão local sobre o snapshot efêmero.",
    category: "suggestion"
  });
  assert.equal(revised.rawText, "Revisão local sobre o snapshot efêmero.");
  assert.equal(revised.ownerResponse, null);
  const withdrawn = await value.withdraw(denseItems[0].annotationId);
  assert.equal(withdrawn.state, "withdrawn");
  assert.equal(withdrawn.rawText, null);
  assert.equal(withdrawn.briefSummary, null);
  assert.equal(withdrawn.ownerResponse, null);
  assert.equal(value.loadForTarget({ studyUnitId: UNIT_ID }).length, denseItems.length);
  assert.equal(
    (await value.refreshTarget({ studyUnitId: UNIT_ID })).length,
    denseItems.length
  );
  value.close();

  const reopened = new CourseAnnotationRepository({
    courseId: COURSE_ID,
    courseRevision: 7,
    api,
    cache,
    clock: () => new Date("2026-08-17T14:00:00.000Z"),
    uuidFactory: ids(),
    windowValue: {}
  });
  await reopened.initialize();
  await assert.rejects(
    reopened.refreshTarget({ studyUnitId: UNIT_ID }),
    (error) => error?.code === "course_annotation_cache_miss" && /offline/u.test(error.message)
  );
  assert.equal(reopened.loadForTarget({ studyUnitId: UNIT_ID }).length, 0);
  reopened.close();
  cache.close();
});
