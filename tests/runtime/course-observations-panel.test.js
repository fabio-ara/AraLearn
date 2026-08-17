import assert from "node:assert/strict";
import test from "node:test";

import { createCourseObservationsPanel } from "../../src/ui/CourseObservationsPanel.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const ANNOTATION_ID = "20000000-0000-4000-8000-000000000002";
const CONTRIBUTOR_REF = "person-0123456789abcdef";

class FakeRoot {
  constructor() {
    this.innerHTML = "";
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }
}

function outline() {
  return {
    contract: "aralearn.course.v1",
    courseId: COURSE_ID,
    title: "Curso",
    goal: "Compreender o tema.",
    revision: 7,
    ownership: "owned",
    canEdit: true,
    counts: {
      moduleCount: 1,
      lessonCount: 1,
      topicCount: 2,
      microsequenceCount: 1,
      studyUnitCount: 1
    },
    createdAt: "2026-08-17T09:00:00.000Z",
    updatedAt: "2026-08-17T10:00:00.000Z",
    outline: {
      courseId: COURSE_ID,
      title: "Curso",
      goal: "Compreender o tema.",
      modules: [{
        id: "module-a",
        title: "Módulo fora da primeira página",
        lessons: [{
          id: "lesson-a",
          title: "Lição contextual",
          topics: [{ id: "topic-a", title: "Conceito central", summary: null }, {
            id: "topic-b", title: "Assunto ausente da primeira página", summary: null
          }],
          microsequences: [{
            id: "micro-a",
            title: "Microssequência contextual",
            studyUnitCount: 1
          }]
        }]
      }]
    },
    deepLink: `#/authoring/courses/${COURSE_ID}?section=structure`
  };
}

function item() {
  return {
    contract: "aralearn.course-anchored-annotation.v1",
    annotationId: ANNOTATION_ID,
    annotationVersion: 3,
    courseId: COURSE_ID,
    provenance: { origin: "learner", channel: "study_interface" },
    contributor: {
      kind: "protected_person",
      role: "learner",
      ref: CONTRIBUTOR_REF,
      label: "Estudante 7"
    },
    target: {
      kind: "study_unit",
      id: "unit-a",
      observedPath: [{
        kind: "course", id: COURSE_ID, label: "Curso", version: 7
      }, {
        kind: "study_unit", id: "unit-a", label: "Unidade contextual", version: 2
      }],
      currentAvailable: true,
      currentPath: [{
        kind: "course", id: COURSE_ID, label: "Curso", version: 7
      }, {
        kind: "study_unit", id: "unit-a", label: "Unidade contextual", version: 2
      }],
      deepLink: `#/authoring/courses/${COURSE_ID}?section=inspection&studyUnitId=unit-a`
    },
    observedRevision: { certainty: "known", courseRevision: 7, targetVersion: 2 },
    rawText: "Há uma possível ambiguidade no segundo parágrafo.",
    category: "possible_error",
    briefSummary: "Possível ambiguidade no parágrafo.",
    subjectClassification: {
      status: "classified",
      automatic: {
        method: "target_scope_unclassified",
        methodVersion: 1,
        taxonomyRevision: 7,
        subjects: []
      },
      effective: {
        method: "human_topic_selection",
        methodVersion: 1,
        taxonomyRevision: 7,
        subjects: [{ topicId: "topic-a", label: "Conceito central", topicVersion: 2 }]
      },
      correctedAt: "2026-08-17T12:10:00.000Z"
    },
    state: "open",
    ownerResponse: null,
    timestamps: {
      capturedAt: "2026-08-17T12:00:00.000Z",
      createdAt: "2026-08-17T12:00:00.000Z",
      updatedAt: "2026-08-17T12:10:00.000Z",
      firstConsideredAt: null,
      respondedAt: null,
      resolvedAt: null,
      withdrawnAt: null
    },
    capabilities: {
      canRevise: false,
      canWithdraw: false,
      canConsider: true,
      canRespond: true,
      canResolve: true,
      canReopen: false,
      canCorrectSubjects: true
    },
    deepLink: `#/authoring/courses/${COURSE_ID}?section=observations&annotationId=${ANNOTATION_ID}`
  };
}

function page(query) {
  return {
    contract: "aralearn.course-anchored-annotation-page.v1",
    courseId: COURSE_ID,
    courseRevision: 7,
    annotationSetVersion: 4,
    query: structuredClone(query),
    summary: {
      matchingTotal: 1,
      byOrigin: { learner: 1 },
      byChannel: { study_interface: 1 },
      byState: { open: 1 },
      unclassifiedTotal: 0
    },
    items: [item()],
    hasMore: false,
    nextCursor: null
  };
}

function pagedItem(index) {
  const value = item();
  value.annotationId = `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  value.rawText = `Observação paginada ${index}.`;
  value.deepLink = `#/authoring/courses/${COURSE_ID}?section=observations&annotationId=${value.annotationId}`;
  return value;
}

function pagedResult(query, items, { hasMore, nextCursor }) {
  return {
    ...page(query),
    summary: {
      matchingTotal: 3,
      byOrigin: { learner: 3 },
      byChannel: { study_interface: 3 },
      byState: { open: 3 },
      unclassifiedTotal: 0
    },
    items,
    hasMore,
    nextCursor
  };
}

async function appendFailure(secondPage) {
  const root = new FakeRoot();
  let calls = 0;
  const panel = createCourseObservationsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    controller: {
      async loadAuthoringOutline() { return outline(); },
      async loadCourseAnchoredAnnotations(_courseId, options) {
        calls += 1;
        return calls === 1
          ? pagedResult(options.query, [pagedItem(1)], {
              hasMore: true,
              nextCursor: "cursor1"
            })
          : secondPage(options);
      },
      async mutateCourseAnchoredAnnotations() { throw new Error("Não deve alterar."); }
    }
  });
  await panel.open();
  const node = { dataset: { observationsAction: "load-more" } };
  root.listeners.get("click")({
    target: {
      closest(selector) {
        return selector === "[data-observations-action]" ? node : null;
      }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { root, panel, calls };
}

test("inbox usa query aninhada, resumo exato e identidade protegida", async () => {
  const root = new FakeRoot();
  const calls = [];
  const panel = createCourseObservationsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    controller: {
      async loadAuthoringOutline() { return outline(); },
      async loadCourseAnchoredAnnotations(courseId, options) {
        calls.push({ courseId, options: structuredClone(options) });
        return page(options.query);
      },
      async mutateCourseAnchoredAnnotations() { throw new Error("Não deve alterar."); }
    }
  });
  assert.equal(await panel.open(), true);

  assert.equal(calls[0].courseId, COURSE_ID);
  assert.deepEqual(Object.keys(calls[0].options).sort(), [
    "annotationSetVersion", "cursor", "expectedCourseRevision", "limit", "query"
  ]);
  assert.deepEqual(Object.keys(calls[0].options.query).sort(), [
    "annotationId", "categories", "channels", "hierarchy", "includeUncategorized",
    "mode", "origins", "states", "subjectIds"
  ]);
  assert.match(root.innerHTML, /Inbox única do Curso/u);
  assert.match(root.innerHTML, /Correspondentes<\/dt><dd>1/u);
  assert.match(root.innerHTML, /Estudante 7/u);
  assert.match(root.innerHTML, /Há uma possível ambiguidade/u);
  assert.match(root.innerHTML, /Filtros e origens/u);
  assert.match(root.innerHTML, /Assunto ausente da primeira página/u);
  assert.match(root.innerHTML, /Módulo fora da primeira página/u);
  assert.match(root.innerHTML, /Nova observação autoral/u);
  assert.match(root.innerHTML, /section=observations&amp;annotationId=/u);
  assert.doesNotMatch(root.innerHTML, new RegExp(CONTRIBUTOR_REF, "u"));
  assert.doesNotMatch(root.innerHTML, /\S+@\S+|e-?mail|>chat|fórum|thread/iu);
  panel.destroy();
});

test("append da inbox rejeita cursor repetido, página vazia e observação duplicada", async (t) => {
  await t.test("cursor repetido", async () => {
    const { root, panel, calls } = await appendFailure((options) =>
      pagedResult(options.query, [pagedItem(2)], {
        hasMore: true,
        nextCursor: "cursor1"
      }));
    assert.equal(calls, 2);
    assert.match(root.innerHTML, /repetiu um cursor/u);
    assert.doesNotMatch(root.innerHTML, /Observação paginada 2\./u);
    panel.destroy();
  });

  await t.test("página intermediária vazia", async () => {
    const { root, panel, calls } = await appendFailure((options) =>
      pagedResult(options.query, [], {
        hasMore: true,
        nextCursor: "cursor2"
      }));
    assert.equal(calls, 2);
    assert.match(root.innerHTML, /página intermediária vazia/u);
    panel.destroy();
  });

  await t.test("annotationId duplicado", async () => {
    const { root, panel, calls } = await appendFailure((options) =>
      pagedResult(options.query, [pagedItem(1)], {
        hasMore: false,
        nextCursor: null
      }));
    assert.equal(calls, 2);
    assert.match(root.innerHTML, /repetiu uma observação/u);
    panel.destroy();
  });
});

test("deep link abre detalhe, contexto, resposta única e correção de assunto", async () => {
  const root = new FakeRoot();
  const panel = createCourseObservationsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "anchored_annotation", id: ANNOTATION_ID },
    controller: {
      async loadAuthoringOutline() { return outline(); },
      async loadCourseAnchoredAnnotations(_courseId, options) {
        return page(options.query);
      },
      async mutateCourseAnchoredAnnotations() { throw new Error("Não deve alterar."); }
    }
  });
  await panel.open();

  assert.match(root.innerHTML, /Detalhe contextual/u);
  assert.match(root.innerHTML, /Abrir Unidade/u);
  assert.match(root.innerHTML, /Retorno da autoria/u);
  assert.match(root.innerHTML, /Resposta privada vinculada a esta observação/u);
  assert.match(root.innerHTML, /Corrigir assuntos/u);
  assert.match(root.innerHTML, /Conceito central/u);
  assert.doesNotMatch(root.innerHTML, /Responder a|nova resposta|conversa|fórum/iu);
  panel.destroy();
});

test("deep link nomeia cada tipo de contexto sem chamar tudo de Unidade", async () => {
  const targets = [
    ["course", COURSE_ID, "Curso", 7],
    ["module", "module-a", "Módulo", 2],
    ["lesson", "lesson-a", "Lição", 2],
    ["topic", "topic-a", "Tópico", 2],
    ["didactic_microsequence", "micro-a", "Microssequência", 2],
    ["study_unit", "unit-a", "Unidade", 2]
  ];
  for (const [kind, id, expectedLabel, targetVersion] of targets) {
    const contextual = item();
    const targetEntry = { kind, id, label: expectedLabel, version: targetVersion };
    contextual.target = {
      ...contextual.target,
      kind,
      id,
      observedPath: kind === "course"
        ? [targetEntry]
        : [{ kind: "course", id: COURSE_ID, label: "Curso", version: 7 }, targetEntry],
      currentPath: kind === "course"
        ? [targetEntry]
        : [{ kind: "course", id: COURSE_ID, label: "Curso", version: 7 }, targetEntry],
      deepLink: `#/authoring/courses/${COURSE_ID}?section=inspection`
    };
    contextual.observedRevision = {
      certainty: "known",
      courseRevision: 7,
      targetVersion
    };
    const root = new FakeRoot();
    const panel = createCourseObservationsPanel({
      root,
      course: { courseId: COURSE_ID, revision: 7 },
      routeTarget: { kind: "anchored_annotation", id: ANNOTATION_ID },
      controller: {
        async loadAuthoringOutline() { return outline(); },
        async loadCourseAnchoredAnnotations(_courseId, options) {
          return { ...page(options.query), items: [contextual] };
        },
        async mutateCourseAnchoredAnnotations() { throw new Error("Não deve alterar."); }
      }
    });
    await panel.open();
    assert.match(root.innerHTML, new RegExp(`Abrir ${expectedLabel}`, "u"));
    panel.destroy();
  }
});

test("outline permite classificar vazio e criar observação em alvo não StudyUnit", async () => {
  const root = new FakeRoot();
  const commands = [];
  const unclassified = item();
  unclassified.subjectClassification = {
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
  };
  const panel = createCourseObservationsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "anchored_annotation", id: ANNOTATION_ID },
    clock: () => new Date("2026-08-17T15:00:00.000Z"),
    controller: {
      async loadAuthoringOutline() { return outline(); },
      async loadCourseAnchoredAnnotations(_courseId, options) {
        return { ...page(options.query), items: [structuredClone(unclassified)] };
      },
      async mutateCourseAnchoredAnnotations(input) {
        commands.push(structuredClone(input));
        return {
          contract: "aralearn.course-anchored-annotation-change.v1",
          courseId: COURSE_ID,
          courseRevision: 7,
          annotationSetVersion: 5,
          requestId: input.requestId,
          idempotent: false,
          changed: true,
          annotation: null
        };
      }
    }
  });
  await panel.open();
  assert.match(root.innerHTML, /Não classificado/u);
  assert.match(root.innerHTML, /Conceito central/u);
  assert.match(root.innerHTML, /Assunto ausente da primeira página/u);

  const NativeFormData = globalThis.FormData;
  globalThis.FormData = class {
    constructor(target) { this.fields = target.fields; }
    get(name) { return this.fields[name] ?? null; }
    getAll(name) {
      const value = this.fields[name];
      return value == null ? [] : Array.isArray(value) ? value : [value];
    }
    has(name) { return Object.hasOwn(this.fields, name); }
  };
  try {
    const submit = root.listeners.get("submit");
    submit({
      preventDefault() {},
      target: {
        fields: { subject: ["topic-b"] },
        matches(selector) { return selector === "[data-observation-subject-form]"; }
      }
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(commands[0].command.subjectIds, ["topic-b"]);
    assert.equal(commands[0].expectedCourseRevision, 7);

    panel.destroy();
    const inbox = createCourseObservationsPanel({
      root,
      course: { courseId: COURSE_ID, revision: 7 },
      clock: () => new Date("2026-08-17T15:00:00.000Z"),
      controller: {
        async loadAuthoringOutline() { return outline(); },
        async loadCourseAnchoredAnnotations(_courseId, options) { return page(options.query); },
        async mutateCourseAnchoredAnnotations(input) {
          commands.push(structuredClone(input));
          return {
            contract: "aralearn.course-anchored-annotation-change.v1",
            courseId: COURSE_ID,
            courseRevision: 7,
            annotationSetVersion: 6,
            requestId: input.requestId,
            idempotent: false,
            changed: true,
            annotation: null
          };
        }
      }
    });
    await inbox.open();
    root.listeners.get("submit")({
      preventDefault() {},
      target: {
        fields: {
          target: "1",
          rawText: "Observação situada no Módulo.",
          category: "suggestion"
        },
        matches(selector) { return selector === "[data-observation-create-form]"; }
      }
    });
    await new Promise((resolve) => setImmediate(resolve));
    const creation = commands.at(-1);
    assert.equal(creation.command.type, "create_anchored_annotation");
    assert.deepEqual(creation.command.target, { kind: "module", id: "module-a" });
    assert.equal(creation.command.capturedAt, "2026-08-17T15:00:00.000Z");
    assert.equal(creation.expectedCourseRevision, 7);
    assert.deepEqual(
      outline().outline.modules[0].lessons[0].topics.map(({ id }) => id),
      ["topic-a", "topic-b"]
    );
    inbox.destroy();
  } finally {
    globalThis.FormData = NativeFormData;
  }
});
