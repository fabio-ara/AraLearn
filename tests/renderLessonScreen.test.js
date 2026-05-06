import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { validateContractDocument } from "../src/contract/validateContract.js";
import { renderLessonScreen } from "../src/ui/renderLessonScreen.js";

function readProject() {
  const parsed = JSON.parse(fs.readFileSync("./docs/examples/aralearn-contract.renderable.json", "utf8"));
  const result = validateContractDocument(parsed);
  assert.equal(result.ok, true);
  return result.value;
}

test("renderiza a tela de curso com ações globais e menus contextuais por módulo e lição", () => {
  const project = readProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const html = renderLessonScreen({
    project,
    view: "course",
    selection: {
      courseKey: course.key,
      moduleKey: moduleValue.key,
      lessonKey: lesson.key,
      microsequenceKey: lesson.microsequences[0].key,
      cardKey: lesson.microsequences[0].cards[0].key,
      cardIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence: lesson.microsequences[0],
    cards: lesson.microsequences[0].cards,
    microsequenceMode: "play",
    editorSupport: {
      progress: { version: 1, lessons: {} },
      draftCourseKey: "__draft__",
      draftMicrosequences: []
    }
  });

  assert.match(html, /data-action="open-course-screen-actions"/);
  assert.match(html, /data-action="open-module-actions"/);
  assert.match(html, /data-action="open-lesson-actions"/);
});

test("renderiza a tela de lição com ações globais e pilha de ações da microssequência", () => {
  const project = readProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const html = renderLessonScreen({
    project,
    view: "lesson",
    selection: {
      courseKey: course.key,
      moduleKey: moduleValue.key,
      lessonKey: lesson.key,
      microsequenceKey: microsequence.key,
      cardKey: microsequence.cards[0].key,
      cardIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    cards: microsequence.cards,
    microsequenceMode: "play",
    editorSupport: {
      progress: { version: 1, lessons: {} },
      draftCourseKey: "__draft__",
      draftMicrosequences: []
    }
  });

  assert.match(html, /data-action="open-lesson-screen-actions"/);
  assert.match(html, /data-action="open-microsequence-actions"/);
  assert.match(html, /data-action="play-microsequence"/);
});

test("renderiza o painel da microssequência sem botão próprio de ações e com área de tags", () => {
  const project = readProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const microsequenceVersions = Array.from({ length: 12 }, (_, index) => ({
    id: `v${index + 1}`,
    label: `Iteração ${index + 1}`
  }));
  const html = renderLessonScreen({
    project,
    view: "microsequence-assist",
    selection: {
      courseKey: course.key,
      moduleKey: moduleValue.key,
      lessonKey: lesson.key,
      microsequenceKey: microsequence.key,
      cardKey: microsequence.cards[0].key,
      cardIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    cards: microsequence.cards,
    microsequenceMode: "play",
    editorSupport: {
      progress: { version: 1, lessons: {} },
      draftCourseKey: "__draft__",
      draftMicrosequences: [],
      dependencies: [],
      microsequenceVersions,
      activeMicrosequenceVersionId: "v7",
      selectedDependencyKeys: [],
      pendingDependencyKey: "",
      modelOptions: [],
      selectedModel: "",
      assistModeOptions: [],
      selectedAssistMode: "edit-microsequence",
      assistModeLocked: true,
      promptText: "",
      currentMicrosequenceIsPlaceholder: false
    }
  });

  assert.doesNotMatch(html, /data-action="open-microsequence-actions"/);
  assert.doesNotMatch(html, /data-action="open-version-history"/);
  assert.match(html, /data-action="select-microsequence-version"/);
  assert.doesNotMatch(html, /data-action="version-tabs-prev"/);
  assert.doesNotMatch(html, /data-action="version-tabs-next"/);
  assert.match(html, /data-action="delete-microsequence-version"/);
  assert.match(html, /class="editor-version-tab active"/);
  assert.match(html, /<span class="editor-version-tab-label">12<\/span>/);
  assert.match(html, /<label>Tags<\/label>/);
  assert.match(html, /dependency-chip-row/);
});
