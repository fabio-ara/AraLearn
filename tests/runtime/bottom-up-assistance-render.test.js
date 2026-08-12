import test from "node:test";
import assert from "node:assert/strict";

import { renderLessonScreen } from "../../src/ui/renderLessonScreen.js";

function fixture() {
  const project = {
    contract: "aralearn.project.v4",
    courses: [{
      id: "course-a",
      title: "Curso",
      goal: "Objetivo.",
      modules: [{
        id: "module-a",
        title: "Módulo",
        goal: "Objetivo do módulo.",
        lessons: [{
          id: "lesson-a",
          title: "Lição",
          description: "Descrição.",
          microsequences: [{
            id: "micro-a",
            position: 0,
            title: "Microssequência A",
            goal: "Explicar.",
            role: "explain",
            status: "generated",
            dependsOn: [],
            covers: [],
            checks: [],
            cards: [{
              id: "card-a",
              position: 1,
              resource: "paragraph",
              kind: "theory",
              exercise: "none",
              title: "Card A",
              text: "Texto.",
              after: ""
            }]
          }, {
            id: "micro-b",
            position: 1,
            title: "Microssequência B",
            goal: "Praticar.",
            role: "practice",
            status: "planned",
            dependsOn: [],
            covers: [],
            checks: [],
            cards: []
          }]
        }]
      }]
    }]
  };
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const selection = {
    courseKey: course.id,
    moduleKey: moduleValue.id,
    lessonKey: lesson.id,
    microsequenceKey: microsequence.id,
    cardKey: "card-a",
    cardIndex: 0
  };
  return { project, course, moduleValue, lesson, microsequence, selection };
}

function support(overrides = {}) {
  return {
    progress: { version: 1, lessons: {} },
    coursePermissions: {
      canAuthorContent: true,
      canEdit: true,
      canDelete: true
    },
    entityModes: { course: "view", module: "view", lesson: "view", microsequence: "view" },
    bottomUpAssistance: null,
    ...overrides
  };
}

test("lição seleciona microssequências por outline e compõe pedido direto", () => {
  const value = fixture();
  const html = renderLessonScreen({
    ...value,
    view: "lesson",
    cards: value.microsequence.cards,
    microsequenceMode: "play",
    editorSupport: support({
      entityModes: { lesson: "ai" },
      bottomUpAssistance: {
        level: "lesson",
        kind: "items",
        selectedIds: ["micro-a"],
        composerOpen: true,
        promptText: "Acrescente uma prática.",
        ready: true,
        isSubmitting: false,
        canUndo: true
      }
    })
  });
  assert.match(html, /data-entity-level="lesson" data-entity-mode="ai"/u);
  assert.match(html, /data-action="toggle-bottom-up-container"/u);
  assert.match(html, /data-assistance-item-id="micro-a" aria-pressed="true"/u);
  assert.match(html, /data-assistance-item-id="micro-b" aria-pressed="false"/u);
  assert.match(html, /data-field="bottom-up-assist-prompt"[^>]*>Acrescente uma prática\.<\/textarea>/u);
  assert.match(html, /data-action="toggle-bottom-up-composer"[^>]*aria-expanded="true"/u);
  assert.match(html, /submit-bottom-up-assistance|undo-bottom-up-assistance/u);
  assert.match(html, /<\/main><nav class="study-reader-footer bottom-up-assistance-dock"[\s\S]*bottom-up-composer-shell/u);
  const mainContent = html.match(/<main class="screen-content lesson-structure-screen navigation-screen">([\s\S]*?)<\/main>/u)?.[1] || "";
  assert.doesNotMatch(mainContent, /bottom-up-composer/u);
  assert.doesNotMatch(html, /type="checkbox"|Atual|Proposta|Aplicar|Descartar|prévia/u);
});

test("lição seleciona o escopo antes de revelar o campo de pedido", () => {
  const value = fixture();
  const html = renderLessonScreen({
    ...value,
    view: "lesson",
    cards: value.microsequence.cards,
    microsequenceMode: "play",
    editorSupport: support({
      entityModes: { lesson: "ai" },
      bottomUpAssistance: {
        level: "lesson",
        kind: "items",
        selectedIds: ["micro-a"],
        composerOpen: false,
        promptText: "",
        ready: false
      }
    })
  });
  assert.match(html, /data-assistance-item-id="micro-a" aria-pressed="true"/u);
  assert.match(html, /data-action="toggle-bottom-up-composer"[^>]*aria-expanded="false"/u);
  assert.doesNotMatch(html, /data-field="bottom-up-assist-prompt"|submit-bottom-up-assistance/u);
});

test("microssequência tem overview de cards e IA não oferece criar outra micro explicitamente", () => {
  const value = fixture();
  const html = renderLessonScreen({
    ...value,
    view: "microsequence",
    cards: value.microsequence.cards,
    microsequenceMode: "overview",
    editorSupport: support({
      entityModes: { microsequence: "ai" },
      bottomUpAssistance: {
        level: "microsequence",
        kind: "container",
        selectedIds: ["card-a"],
        composerOpen: false,
        promptText: "Crie um card de prática.",
        ready: true
      }
    })
  });
  assert.match(html, /data-assistance-level="microsequence"/u);
  assert.match(html, /data-assistance-item-id="card-a" aria-pressed="true"/u);
  assert.match(html, /data-action="toggle-bottom-up-composer"/u);
  assert.doesNotMatch(html, /data-field="bottom-up-assist-prompt"/u);
  assert.doesNotMatch(html, /nova microssequência|new_microsequence|type="checkbox"/u);
});

test("catálogo sem autoridade vê apenas conteúdo, sem controles ou aviso", () => {
  const value = fixture();
  const html = renderLessonScreen({
    ...value,
    view: "lesson",
    cards: value.microsequence.cards,
    microsequenceMode: "play",
    editorSupport: support({
      coursePermissions: {
        canAuthorContent: false,
        canEdit: false,
        canDelete: false
      },
      entityModes: { lesson: "ai" }
    })
  });
  assert.doesNotMatch(html, /entity-mode-switcher|toggle-bottom-up|bottom-up-composer/u);
  assert.doesNotMatch(html, /somente leitura|não pode ser alterado|Disponível somente/u);
});

test("edição estrutural mantém o conteúdo no lugar e expõe ações fora do resumo", () => {
  const value = fixture();
  const html = renderLessonScreen({
    ...value,
    view: "course",
    cards: value.microsequence.cards,
    microsequenceMode: "play",
    editorSupport: support({
      entityModes: { course: "edit" },
      inlineStructureEditor: { level: "course", courseKey: "course-a" }
    })
  });
  assert.match(html, /data-field="inline-entity-title"[^>]*>Curso<\/span>/u);
  assert.match(html, /data-field="inline-entity-description"[^>]*>Objetivo\.<\/span>/u);
  assert.match(html, /<\/main><nav class="study-reader-footer structure-edit-dock"/u);
  assert.match(html, /data-action="save-inline-entity" data-structure-level="course"/u);
  assert.doesNotMatch(html, /inline-entity-editor|structure-inline-entity-editor/u);
});
