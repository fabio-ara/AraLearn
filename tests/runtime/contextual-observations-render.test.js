import assert from "node:assert/strict";
import test from "node:test";

import { renderLessonScreen } from "../../src/ui/renderLessonScreen.js";

function fixture() {
  const card = {
    id: "card-a",
    position: 1,
    title: "Conjunção",
    role: "theory",
    content: [{
      id: "paragraph-a",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "P e Q precisam ser verdadeiras." }
    }],
    response: null,
    feedback: [],
    topics: [],
    sources: []
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

function editorSupport(canAuthorContent, extra = {}, canComment = false) {
  return {
    progress: { version: 1, lessons: {} },
    coursePermissions: {
      canAuthorContent,
      canComment,
      canEdit: canAuthorContent,
      canDelete: canAuthorContent,
      canEditMetadata: canAuthorContent,
      canEditCards: canAuthorContent,
      canUseBottomUpAi: canAuthorContent,
      canUseCardAi: canAuthorContent
    },
    entityModes: {},
    ...extra
  };
}

function renderLevel(level, canAuthorContent, canComment = false) {
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
    editorSupport: editorSupport(canAuthorContent, {}, canComment)
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

test("observações contextuais dependem de comentário, não de autoria", () => {
  for (const level of ["course", "module", "lesson", "microsequence"]) {
    const authorOnlyHtml = renderLevel(level, true, false);
    const commenterHtml = renderLevel(level, false, true);
    const readerHtml = renderLevel(level, false, false);

    assert.doesNotMatch(authorOnlyHtml, /data-action="open-context-observation"/u, level);
    assert.match(commenterHtml, /data-action="open-context-observation"/u, level);
    assert.doesNotMatch(readerHtml, /data-action="open-context-observation"/u, level);
    assert.doesNotMatch(
      commenterHtml.match(/<header[\s\S]*?<\/header>/u)?.[0] || "",
      /data-action="open-context-observation"/u,
      level
    );
    assert.match(commenterHtml, /entity-summary-wrap has-context-action/u, level);
    assert.doesNotMatch(authorOnlyHtml, /data-action="open-central"|Chatbot/u, level);
    assert.doesNotMatch(commenterHtml, /data-action="open-central"|Chatbot/u, level);
    assert.doesNotMatch(readerHtml, /data-action="open-central"|Chatbot/u, level);
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
        scope: "resources",
        wholeCardSelected: false,
        selectedCardKeys: [values.card.id],
        resourceTargetIds: ["content:paragraph-a"]
      },
      cardResourceTargets: [{
        targetId: "content:paragraph-a",
        location: "content",
        resourceType: "aralearn.resource.paragraph",
        label: "Parágrafo 1"
      }]
    })
  });
  const readerHtml = renderLessonScreen({
    ...common,
    editorSupport: editorSupport(false, {
      entityModes: { card: "edit" },
      cardAssistanceState: {
        scope: "resources",
        wholeCardSelected: false,
        selectedCardKeys: [values.card.id],
        resourceTargetIds: ["content:paragraph-a"]
      },
      cardResourceTargets: [{
        targetId: "content:paragraph-a",
        location: "content",
        resourceType: "aralearn.resource.paragraph",
        label: "Parágrafo 1"
      }]
    })
  });

  assert.doesNotMatch(authorHtml, /data-action="open-resource-observation"/u);
  assert.match(authorHtml, /data-resource-edit-target="content:paragraph-a"/u);
  assert.doesNotMatch(readerHtml, /data-action="open-resource-observation"/u);
  assert.doesNotMatch(readerHtml, /data-manual-target-id/u);
});
