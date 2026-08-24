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
    this.focusedSelectors = [];
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  querySelector(selector) {
    return { focus: () => this.focusedSelectors.push(selector) };
  }
}

class FakeDocument {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
}

function outline(revision = 7) {
  return {
    contract: "aralearn.course.v1",
    courseId: COURSE_ID,
    title: "Curso",
    goal: "Compreender o tema.",
    revision,
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

function page(query, revision = 7) {
  return {
    contract: "aralearn.course-anchored-annotation-page.v1",
    courseId: COURSE_ID,
    courseRevision: revision,
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

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function decodeHtml(value) {
  return String(value || "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

function formFromRenderedHtml(html, attribute) {
  const form = String(html).match(new RegExp(
    `<form[^>]*${attribute}[^>]*>([\\s\\S]*?)<\\/form>`,
    "u"
  ));
  assert.ok(form, `formulário ${attribute} deve existir no DOM renderizado`);
  const fields = {};
  for (const match of form[1].matchAll(
    /<textarea[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/textarea>/gu
  )) {
    fields[match[1]] = decodeHtml(match[2]);
  }
  for (const match of form[1].matchAll(
    /<select[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gu
  )) {
    const options = [...match[2].matchAll(/<option value="([^"]*)"([^>]*)>/gu)];
    fields[match[1]] = decodeHtml(
      (options.find(([, , attributes]) => /\sselected(?:\s|$)/u.test(attributes)) || options[0])?.[1]
    );
  }
  return {
    fields,
    matches(selector) { return selector === `[${attribute}]`; }
  };
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
  assert.match(root.innerHTML, /section=review&amp;annotationId=/u);
  assert.doesNotMatch(root.innerHTML, new RegExp(CONTRIBUTOR_REF, "u"));
  assert.doesNotMatch(root.innerHTML, /\S+@\S+|e-?mail|>chat|fórum|thread/iu);
  panel.destroy();
});

test("retirada exige confirmação modal, contém Tab e preserva foco ao cancelar", async () => {
  const root = new FakeRoot();
  const documentValue = new FakeDocument();
  const tabMoves = [];
  const cancelControl = { focus: () => tabMoves.push("cancel") };
  const confirmControl = { focus: () => tabMoves.push("confirm") };
  root.querySelectorAll = (selector) => selector.includes("data-observation-confirmation")
    ? [cancelControl, confirmControl]
    : [];
  documentValue.activeElement = confirmControl;
  const commands = [];
  const withdrawablePage = (query) => {
    const value = item();
    value.capabilities.canWithdraw = true;
    return { ...page(query), items: [value] };
  };
  const panel = createCourseObservationsPanel({
    root,
    documentValue,
    routeTarget: { kind: "anchored_annotation", id: ANNOTATION_ID },
    course: { courseId: COURSE_ID, revision: 7 },
    controller: {
      async loadAuthoringOutline() { return outline(); },
      async loadCourseAnchoredAnnotations(_courseId, options) {
        return withdrawablePage(options.query);
      },
      async mutateCourseAnchoredAnnotations(input) {
        commands.push(structuredClone(input.command));
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
  const clickAction = (action) => root.listeners.get("click")({
    target: {
      closest(selector) {
        return selector === "[data-observations-action]"
          ? { dataset: { observationsAction: action } }
          : null;
      }
    }
  });

  clickAction("withdraw");
  assert.match(root.innerHTML, /role="alertdialog"/u);
  assert.match(root.innerHTML, /class="course-authoring-confirm-backdrop" data-observation-confirmation-backdrop/u);
  assert.match(root.innerHTML, /role="alertdialog" aria-modal="true"/u);
  assert.equal(commands.length, 0);
  assert.equal(root.focusedSelectors.at(-1), '[data-observations-action="cancel-confirmation"]');
  let tabPrevented = false;
  root.listeners.get("keydown")({
    key: "Tab",
    preventDefault() { tabPrevented = true; }
  });
  assert.equal(tabPrevented, true);
  assert.equal(tabMoves.at(-1), "cancel");
  root.listeners.get("keydown")({ key: "Escape", preventDefault() {}, stopPropagation() {} });
  assert.doesNotMatch(root.innerHTML, /role="alertdialog"/u);
  assert.equal(root.focusedSelectors.at(-1), '[data-observations-action="withdraw"]');

  clickAction("withdraw");
  documentValue.listeners.get("click")({
    target: { matches: (selector) => selector === "[data-observation-confirmation-backdrop]" }
  });
  assert.doesNotMatch(root.innerHTML, /role="alertdialog"/u);
  clickAction("withdraw");
  clickAction("confirm-withdraw");
  await settle();
  assert.deepEqual(commands, [{
    type: "withdraw_anchored_annotation",
    annotationId: ANNOTATION_ID,
    expectedAnnotationVersion: 3
  }]);
  panel.destroy();
  assert.equal(documentValue.listeners.has("click"), false);
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

test("inbox relê o catálogo e usa a revisão nova ao voltar do ChatGPT", async () => {
  const root = new FakeRoot();
  const revisions = [];
  let currentRevision = 7;
  let outlineReads = 0;
  const panel = createCourseObservationsPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    controller: {
      async loadAuthoringOutline() {
        outlineReads += 1;
        return outline(currentRevision);
      },
      async loadCourseAnchoredAnnotations(_courseId, options) {
        revisions.push(options.expectedCourseRevision);
        return page(options.query, options.expectedCourseRevision);
      },
      async mutateCourseAnchoredAnnotations() { throw new Error("Não deve alterar."); }
    }
  });

  await panel.open();
  currentRevision = 8;
  await panel.refresh(8);

  assert.deepEqual(revisions, [7, 8]);
  assert.equal(outlineReads, 2);
});

test("Registrar e copiar situa a discussão confirmada em Curso, Módulo, Lição e Microssequência", async () => {
  const cases = [
    { index: "0", kind: "course", id: COURSE_ID, title: "Curso", path: "Curso" },
    {
      index: "1",
      kind: "module",
      id: "module-a",
      title: "Módulo fora da primeira página",
      path: "Curso › Módulo fora da primeira página"
    },
    {
      index: "2",
      kind: "lesson",
      id: "lesson-a",
      title: "Lição contextual",
      path: "Curso › Módulo fora da primeira página › Lição contextual"
    },
    {
      index: "5",
      kind: "didactic_microsequence",
      id: "micro-a",
      title: "Microssequência contextual",
      path: "Curso › Módulo fora da primeira página › Lição contextual › Microssequência contextual"
    }
  ];
  const NativeFormData = globalThis.FormData;
  globalThis.FormData = class {
    constructor(target) { this.fields = target.fields; }
    get(name) { return this.fields[name] ?? null; }
  };
  try {
    for (const targetCase of cases) {
      const root = new FakeRoot();
      const commands = [];
      const deliveries = [];
      const order = [];
      const panel = createCourseObservationsPanel({
        root,
        course: { courseId: COURSE_ID, title: "Título vindo da tela", revision: 7 },
        clock: () => new Date("2026-08-17T15:00:00.000Z"),
        async onRequestChat(payload) {
          order.push("callback");
          deliveries.push(structuredClone(payload));
          payload.requestText = "alteração externa que não pode vazar";
        },
        controller: {
          async loadAuthoringOutline() { return outline(); },
          async loadCourseAnchoredAnnotations(_courseId, options) { return page(options.query); },
          async mutateCourseAnchoredAnnotations(input) {
            commands.push(structuredClone(input));
            order.push("backend-confirmed");
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
      await panel.open();
      assert.match(root.innerHTML, />Registrar<\/button>/u);
      assert.match(root.innerHTML, />Registrar e copiar<\/span><\/button>/u);
      assert.match(root.innerHTML,
        /aria-label="Copiar pedido sobre esta Observação para o ChatGPT"/u);

      root.listeners.get("submit")({
        preventDefault() {},
        submitter: { dataset: { observationCreateMode: "request-chat" } },
        target: {
          fields: {
            target: targetCase.index,
            rawText: `Argumento no alvo ${targetCase.kind}.`,
            category: "suggestion"
          },
          matches(selector) { return selector === "[data-observation-create-form]"; }
        }
      });
      await settle();

      assert.equal(commands.length, 1);
      assert.equal(deliveries.length, 1);
      assert.deepEqual(order, ["backend-confirmed", "callback"]);
      assert.deepEqual(commands[0].command.target, {
        kind: targetCase.kind,
        id: targetCase.id
      });
      const request = deliveries[0].requestText;
      assert.match(request, /Curso: “Curso”\./u);
      assert.match(request, /Revisão observada ao copiar: 7\./u);
      assert.match(request, new RegExp(`Alvo: .*\u201c${targetCase.title}\u201d, identidade ${targetCase.id}`, "u"));
      assert.match(request, new RegExp(`Caminho: ${targetCase.path}`, "u"));
      assert.match(request, new RegExp(`Observação vinculada: ${commands[0].command.annotationId}`, "u"));
      assert.match(request, new RegExp(
        `section=review&annotationId=${commands[0].command.annotationId}`,
        "u"
      ));
      assert.match(request, new RegExp(`Argumento no alvo ${targetCase.kind}`, "u"));
      assert.equal((request.match(/um Retorno da autoria/gu) || []).length, 1);
      assert.match(root.innerHTML, /Observação registrada e pedido copiado/u);
      panel.destroy();
    }
  } finally {
    globalThis.FormData = NativeFormData;
  }
});

test("falha da cópia não desfaz nem duplica a Observação confirmada", async () => {
  const root = new FakeRoot();
  const commands = [];
  let callbacks = 0;
  const NativeFormData = globalThis.FormData;
  globalThis.FormData = class {
    constructor(target) { this.fields = target.fields; }
    get(name) { return this.fields[name] ?? null; }
  };
  try {
    const panel = createCourseObservationsPanel({
      root,
      course: { courseId: COURSE_ID, revision: 7 },
      onRequestChat(payload) {
        callbacks += 1;
        payload.requestText = "modificado pelo consumidor";
        throw new Error("Clipboard indisponível.");
      },
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
    await panel.open();
    root.listeners.get("submit")({
      preventDefault() {},
      submitter: { dataset: { observationCreateMode: "request-chat" } },
      target: {
        fields: {
          target: "1",
          rawText: "Persistir mesmo quando a cópia falhar.",
          category: "possible_error"
        },
        matches(selector) { return selector === "[data-observation-create-form]"; }
      }
    });
    await settle();

    assert.equal(commands.length, 1);
    assert.equal(callbacks, 1);
    assert.match(root.innerHTML, /A Observação foi registrada, mas o pedido não foi copiado/u);
    assert.match(root.innerHTML, /Clipboard indisponível/u);

    const node = {
      dataset: { observationsAction: "request-chat", annotationId: ANNOTATION_ID },
      closest(selector) {
        return selector === "[data-observations-action]" ? this : null;
      }
    };
    root.listeners.get("click")({ target: node });
    await settle();
    assert.equal(callbacks, 2);
    assert.equal(commands.length, 1);
    assert.match(root.innerHTML, /O pedido não foi copiado/u);
    panel.destroy();
  } finally {
    globalThis.FormData = NativeFormData;
  }
});

test("validação preserva rascunhos de criação, edição e Retorno no DOM renderizado", async () => {
  const NativeFormData = globalThis.FormData;
  globalThis.FormData = class {
    constructor(target) { this.fields = target.fields; }
    get(name) { return this.fields[name] ?? null; }
  };
  const invalidText = `<rascunho>&${"x".repeat(2_000)}`;
  try {
    const inboxRoot = new FakeRoot();
    const inbox = createCourseObservationsPanel({
      root: inboxRoot,
      course: { courseId: COURSE_ID, revision: 7 },
      controller: {
        async loadAuthoringOutline() { return outline(); },
        async loadCourseAnchoredAnnotations(_courseId, options) { return page(options.query); },
        async mutateCourseAnchoredAnnotations() { throw new Error("Não deve alterar."); }
      }
    });
    await inbox.open();
    inboxRoot.listeners.get("submit")({
      preventDefault() {},
      target: {
        fields: { target: "2", category: "suggestion", rawText: invalidText },
        matches(selector) { return selector === "[data-observation-create-form]"; }
      }
    });
    const recreated = formFromRenderedHtml(inboxRoot.innerHTML, "data-observation-create-form");
    assert.deepEqual(recreated.fields, {
      rawText: invalidText,
      target: "2",
      category: "suggestion"
    });
    assert.match(inboxRoot.innerHTML, /course-observation-author-composer" open/u);
    assert.equal(
      inboxRoot.focusedSelectors.at(-1),
      '[data-observation-create-form] textarea[name="rawText"]'
    );
    inbox.destroy();

    const detailRoot = new FakeRoot();
    const editable = item();
    editable.capabilities.canRevise = true;
    const detail = createCourseObservationsPanel({
      root: detailRoot,
      routeTarget: { kind: "anchored_annotation", id: ANNOTATION_ID },
      course: { courseId: COURSE_ID, revision: 7 },
      controller: {
        async loadAuthoringOutline() { return outline(); },
        async loadCourseAnchoredAnnotations(_courseId, options) {
          return { ...page(options.query), items: [structuredClone(editable)] };
        },
        async mutateCourseAnchoredAnnotations() { throw new Error("Não deve alterar."); }
      }
    });
    await detail.open();
    detailRoot.listeners.get("submit")({
      preventDefault() {},
      target: {
        fields: { category: "", rawText: invalidText },
        matches(selector) { return selector === "[data-observation-edit-form]"; }
      }
    });
    assert.deepEqual(
      formFromRenderedHtml(detailRoot.innerHTML, "data-observation-edit-form").fields,
      { rawText: invalidText, category: "" }
    );
    assert.equal(
      detailRoot.focusedSelectors.at(-1),
      '[data-observation-edit-form] textarea[name="rawText"]'
    );

    detailRoot.listeners.get("submit")({
      preventDefault() {},
      target: {
        fields: { ownerResponse: invalidText },
        matches(selector) { return selector === "[data-observation-response-form]"; }
      }
    });
    assert.deepEqual(
      formFromRenderedHtml(detailRoot.innerHTML, "data-observation-response-form").fields,
      { ownerResponse: invalidText }
    );
    assert.equal(
      detailRoot.focusedSelectors.at(-1),
      '[data-observation-response-form] textarea[name="ownerResponse"]'
    );
    detail.destroy();
  } finally {
    globalThis.FormData = NativeFormData;
  }
});

test("nova tentativa pelo DOM renderizado reutiliza comando e requestId sem duplicar", async (t) => {
  const NativeFormData = globalThis.FormData;
  globalThis.FormData = class {
    constructor(target) { this.fields = target.fields; }
    get(name) { return this.fields[name] ?? null; }
  };
  const cases = [{
    name: "criação",
    attribute: "data-observation-create-form",
    fields: { target: "1", category: "suggestion", rawText: "Argumento autoral preservado." },
    detail: false,
    expectedType: "create_anchored_annotation"
  }, {
    name: "edição",
    attribute: "data-observation-edit-form",
    fields: { category: "confusing", rawText: "Edição autoral preservada." },
    detail: true,
    expectedType: "revise_anchored_annotation"
  }, {
    name: "Retorno",
    attribute: "data-observation-response-form",
    fields: { ownerResponse: "Retorno autoral preservado." },
    detail: true,
    expectedType: "respond_to_anchored_annotation"
  }];
  try {
    for (const testCase of cases) {
      await t.test(testCase.name, async () => {
        const root = new FakeRoot();
        const requests = [];
        const editable = item();
        editable.capabilities.canRevise = true;
        const panel = createCourseObservationsPanel({
          root,
          routeTarget: testCase.detail
            ? { kind: "anchored_annotation", id: ANNOTATION_ID }
            : null,
          course: { courseId: COURSE_ID, revision: 7 },
          clock: () => new Date("2026-08-17T15:00:00.000Z"),
          controller: {
            async loadAuthoringOutline() { return outline(); },
            async loadCourseAnchoredAnnotations(_courseId, options) {
              return {
                ...page(options.query),
                items: testCase.detail ? [structuredClone(editable)] : page(options.query).items
              };
            },
            async mutateCourseAnchoredAnnotations(input) {
              requests.push(structuredClone(input));
              if (requests.length === 1) {
                const error = new Error("A conexão caiu depois do envio.");
                error.code = "network_error";
                throw error;
              }
              return {
                contract: "aralearn.course-anchored-annotation-change.v1",
                courseId: COURSE_ID,
                courseRevision: 7,
                annotationSetVersion: 6,
                requestId: input.requestId,
                idempotent: true,
                changed: false,
                annotation: null
              };
            }
          }
        });
        await panel.open();
        const selector = `[${testCase.attribute}]`;
        root.listeners.get("submit")({
          preventDefault() {},
          target: {
            fields: testCase.fields,
            matches(value) { return value === selector; }
          }
        });
        await settle();

        assert.equal(requests.length, 1);
        assert.match(root.innerHTML, /confirmar exatamente a mesma operação/u);
        assert.equal(panel.hasPendingDraft(), true);
        const retryForm = formFromRenderedHtml(root.innerHTML, testCase.attribute);
        assert.deepEqual(retryForm.fields, testCase.fields);
        root.listeners.get("submit")({ preventDefault() {}, target: retryForm });
        await settle();

        assert.equal(requests.length, 2);
        assert.deepEqual(requests[1], requests[0]);
        assert.equal(requests[0].command.type, testCase.expectedType);
        assert.match(requests[0].requestId, /^[0-9a-f-]{36}$/u);
        assert.equal(panel.hasPendingDraft(), false);
        panel.destroy();
      });
    }
  } finally {
    globalThis.FormData = NativeFormData;
  }
});
