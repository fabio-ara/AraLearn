import assert from "node:assert/strict";
import test from "node:test";

import { renderLessonScreen } from "../../src/ui/renderLessonScreen.js";

function fixture() {
  const card = {
    id: "card-a",
    position: 1,
    resource: "composite",
    kind: "theory",
    exercise: "none",
    title: "Conjunção",
    blocks: [{
      id: "paragraph-a",
      kind: "paragraph",
      value: "P e Q precisam ser verdadeiras."
    }],
    after: ""
  };
  const microsequence = {
    id: "micro-a",
    title: "Regra",
    status: "generated",
    dependsOn: [],
    cards: [card]
  };
  const lesson = {
    id: "lesson-a",
    title: "Conjunção",
    microsequences: [microsequence]
  };
  const moduleValue = {
    id: "module-a",
    title: "Operadores",
    lessons: [lesson]
  };
  const course = {
    id: "course-a",
    title: "Lógica",
    modules: [moduleValue]
  };
  return {
    project: {
      contract: "aralearn.contract",
      version: 4,
      kind: "project",
      courses: [course]
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    card
  };
}

function editorSupport(canAuthorContent, extra = {}) {
  return {
    progress: { version: 1, lessons: {} },
    coursePermissions: {
      canAuthorContent,
      canEdit: canAuthorContent,
      canDelete: canAuthorContent
    },
    entityModes: {},
    ...extra
  };
}

function renderLevel(level, canAuthorContent) {
  const values = fixture();
  const common = {
    ...values,
    selection: {
      courseKey: values.course.id,
      moduleKey: values.moduleValue.id,
      lessonKey: values.lesson.id,
      microsequenceKey: values.microsequence.id,
      cardKey: values.card.id,
      cardIndex: 0
    },
    cards: values.microsequence.cards,
    editorSupport: editorSupport(canAuthorContent)
  };
  if (level === "microsequence") {
    return renderLessonScreen({
      ...common,
      view: "microsequence",
      microsequenceMode: "overview"
    });
  }
  return renderLessonScreen({
    ...common,
    view: level,
    microsequenceMode: "assist"
  });
}

test("observações contextuais aparecem nos níveis estruturais somente para quem pode autorar", () => {
  for (const level of ["course", "module", "lesson", "microsequence"]) {
    const authorHtml = renderLevel(level, true);
    const readerHtml = renderLevel(level, false);

    assert.match(authorHtml, /data-action="open-context-observation"/u, level);
    assert.doesNotMatch(readerHtml, /data-action="open-context-observation"/u, level);
    assert.match(authorHtml, /data-action="open-central"/u, level);
    assert.match(readerHtml, /data-action="open-central"/u, level);
  }
});

test("edição de resource permanece inline e não abre o painel de observações", () => {
  const values = fixture();
  const common = {
    ...values,
    view: "microsequence",
    selection: {
      courseKey: values.course.id,
      moduleKey: values.moduleValue.id,
      lessonKey: values.lesson.id,
      microsequenceKey: values.microsequence.id,
      cardKey: values.card.id,
      cardIndex: 0
    },
    cards: values.microsequence.cards,
    microsequenceMode: "assist"
  };
  const authorHtml = renderLessonScreen({
    ...common,
    editorSupport: editorSupport(true, {
      entityModes: { card: "edit" },
      cardAssistanceState: {
        repairScope: "resources",
        wholeCardSelected: false,
        selectedCardKeys: [values.card.id],
        resourceTargetIds: ["body:paragraph-a"]
      },
      cardResourceTargets: [{
        targetId: "body:paragraph-a",
        location: "body",
        resourceType: "paragraph",
        label: "Parágrafo 1"
      }]
    })
  });
  const readerHtml = renderLessonScreen({
    ...common,
    editorSupport: editorSupport(false, {
      entityModes: { card: "edit" },
      cardAssistanceState: {
        repairScope: "resources",
        wholeCardSelected: false,
        selectedCardKeys: [values.card.id],
        resourceTargetIds: ["body:paragraph-a"]
      },
      cardResourceTargets: [{
        targetId: "body:paragraph-a",
        location: "body",
        resourceType: "paragraph",
        label: "Parágrafo 1"
      }]
    })
  });

  assert.doesNotMatch(authorHtml, /data-action="open-resource-observation"/u);
  assert.match(authorHtml, /data-resource-edit-target="body:paragraph-a"/u);
  assert.doesNotMatch(readerHtml, /data-action="open-resource-observation"/u);
  assert.doesNotMatch(readerHtml, /data-manual-target-id/u);
});
