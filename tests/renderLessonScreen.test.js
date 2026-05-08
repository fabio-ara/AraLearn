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
  assert.match(html, /data-home-tab="courses"[^>]+aria-selected="true"/);
  assert.match(html, /data-home-tab="generate"[^>]+aria-selected="false"/);
  assert.match(html, /data-action="structure-drag-handle" data-structure-level="module"/);
  assert.match(html, /data-action="structure-drag-handle" data-structure-level="lesson"/);
  assert.match(html, /data-action="open-module-actions"/);
  assert.match(html, /data-action="open-lesson-actions"/);
  assert.match(html, /aria-label="1 lição" title="1 lição"/);
  assert.match(html, /aria-label="1 microssequência" title="1 microssequência"/);
  assert.match(html, /progress-meta-item-icon/);
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
  assert.match(html, /data-home-tab="courses"[^>]+aria-selected="true"/);
  assert.match(html, /data-action="structure-drag-handle" data-structure-level="microsequence"/);
  assert.match(html, /data-action="open-microsequence-actions"/);
  assert.match(html, /data-action="play-microsequence"/);
  assert.match(html, /aria-label="Módulo: Módulo experimental" title="Módulo: Módulo experimental"/);
  assert.match(html, /aria-label="Progresso: 0\/7" title="Progresso: 0\/7"/);
  assert.match(html, /aria-label="1 microssequência" title="1 microssequência"/);
  assert.match(html, /aria-label="7 cards" title="7 cards"/);
  assert.doesNotMatch(html, />Mód\.:/);
  assert.doesNotMatch(html, />Progr\.:/);
});

test("mostra aviso quando a lição tem apenas rascunhos", () => {
  const project = readProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = structuredClone(moduleValue.lessons[0]);
  lesson.microsequences = lesson.microsequences.map((microsequence) => ({
    ...microsequence,
    status: "draft",
    cards: []
  }));
  const moduleWithDraftLesson = {
    ...moduleValue,
    lessons: [lesson]
  };
  const microsequence = lesson.microsequences[0];
  const html = renderLessonScreen({
    project,
    view: "lesson",
    selection: {
      courseKey: course.key,
      moduleKey: moduleWithDraftLesson.key,
      lessonKey: lesson.key,
      microsequenceKey: microsequence.key,
      cardKey: "",
      cardIndex: 0
    },
    course,
    moduleValue: moduleWithDraftLesson,
    lesson,
    microsequence,
    cards: [],
    microsequenceMode: "play",
    editorSupport: {
      progress: { version: 1, lessons: {} },
      draftCourseKey: "__draft__",
      draftMicrosequences: []
    }
  });

  assert.match(html, /Não há microssequências prontas para estudar aqui\./);
  assert.match(html, /microsequence-status-badge">rascunho/);
  assert.doesNotMatch(html, /data-action="play-microsequence"/);
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
      dependencies: [{ key: "teste", title: "Teste" }],
      microsequenceVersions,
      activeMicrosequenceVersionId: "v7",
      selectedDependencyKeys: [],
      pendingDependencyKey: "",
      modelOptions: [],
      selectedModel: "",
      assistModeOptions: [],
      selectedAssistMode: "edit-microsequence",
      activeWorkbenchPane: "edit",
      assistModeLocked: true,
      promptText: "",
      currentMicrosequenceIsPlaceholder: false
    }
  });

  assert.doesNotMatch(html, /data-action="open-microsequence-actions"/);
  assert.doesNotMatch(html, /data-action="open-version-history"/);
  assert.match(html, /data-home-tab="courses"[^>]+aria-selected="true"/);
  assert.match(html, /data-action="select-microsequence-version"/);
  assert.match(html, /data-action="editor-prev-version"/);
  assert.match(html, /data-action="editor-next-version"/);
  assert.doesNotMatch(html, /data-action="editor-prev-card"/);
  assert.doesNotMatch(html, /data-action="editor-next-card"/);
  assert.match(html, /data-action="scroll-card-strip-prev"/);
  assert.match(html, /data-action="scroll-card-strip-next"/);
  assert.doesNotMatch(html, /data-action="version-tabs-prev"/);
  assert.doesNotMatch(html, /data-action="version-tabs-next"/);
  assert.match(html, /data-action="delete-microsequence-version"/);
  assert.match(html, /class="editor-version-tab active"/);
  assert.match(html, /class="chip-muted editor-version-count"/);
  assert.match(html, /editor-version-count-value">7\/12<\/span>/);
  assert.match(html, /aria-label="Versão 7 de 12" title="Versão 7 de 12"/);
  assert.match(html, /data-action="select-workbench-pane" data-workbench-pane="preview" aria-label="Preview" title="Preview"/);
  assert.match(html, /workbench-surface-tab active" type="button" role="tab" aria-selected="true" data-action="select-workbench-pane" data-workbench-pane="edit" aria-label="Edição" title="Edição"/);
  assert.match(html, /workbench-surface-tab-icon/);
  assert.match(html, /mini-card-kicker-icon/);
  assert.match(html, /data-action="open-card" data-card-index="0" aria-label="Card 1: Ideia central" title="Card 1"/);
  assert.match(html, /data-action="edit-card"/);
  assert.match(html, /<span class="editor-version-tab-label">12<\/span>/);
  assert.match(html, /data-field="assist-microsequence-title" type="text" aria-label="Título da microssequência" title="Título da microssequência"/);
  assert.match(html, /data-field="assist-dependency-picker" aria-label="Tags" title="Tags"/);
  assert.match(html, /data-field="assist-mode" aria-label="Intenção" title="Intenção"/);
  assert.match(html, /data-field="assist-prompt" class="assist-prompt" aria-label="Pedido" title="Pedido"/);
  assert.match(html, /workbench-icon-label/);
  assert.doesNotMatch(html, />Preview<\/button>/);
  assert.doesNotMatch(html, />Edição<\/button>/);
  assert.doesNotMatch(html, /<label[^>]*>\s*Título da microssequência\s*<\/label>/);
  assert.doesNotMatch(html, /<label[^>]*>\s*Tags\s*<\/label>/);
  assert.doesNotMatch(html, /<label[^>]*>\s*Intenção\s*<\/label>/);
  assert.doesNotMatch(html, /<label[^>]*>\s*Pedido\s*<\/label>/);
  assert.doesNotMatch(html, /mini-card-kicker">Card /);
  assert.doesNotMatch(html, /Intenção do usuário/);
  assert.doesNotMatch(html, /Pedido de revisão/);
  assert.match(html, /dependency-chip-row/);
  assert.doesNotMatch(html, /generator-preview-stage/);
});

test("renderiza a aba preview da microssequência dentro da superfície combinada", () => {
  const project = readProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
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
      microsequenceVersions: [{ id: "v1", label: "Versão 1" }],
      activeMicrosequenceVersionId: "v1",
      selectedDependencyKeys: [],
      pendingDependencyKey: "",
      modelOptions: [],
      selectedModel: "",
      assistModeOptions: [],
      selectedAssistMode: "edit-microsequence",
      activeWorkbenchPane: "preview",
      assistModeLocked: true,
      promptText: "",
      currentMicrosequenceIsPlaceholder: false
    }
  });

  assert.match(html, /workbench-surface-tab active" type="button" role="tab" aria-selected="true" data-action="select-workbench-pane" data-workbench-pane="preview" aria-label="Preview" title="Preview"/);
  assert.match(html, /workbench-surface-tab-icon/);
  assert.match(html, /editor-version-count-value">1\/1<\/span>/);
  assert.match(html, /generator-preview-stage/);
  assert.match(html, /runtime-card-title/);
  assert.match(html, /class="chip-muted editor-card-stage-count" aria-label="Card 1 de 7" title="Card 1 de 7"/);
  assert.match(html, /editor-card-count-value">1\/7<\/span>/);
  assert.doesNotMatch(html, /<label[^>]*>\s*Tags\s*<\/label>/);
});

test("mantém o gerador da oficina sem preview de cards", () => {
  const project = readProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = {
    ...lesson.microsequences[0],
    key: "__draft-placeholder__",
    title: "Gerador"
  };
  const html = renderLessonScreen({
    project,
    view: "draft-generator",
    selection: {
      courseKey: "__draft-course__",
      moduleKey: "__draft-module__",
      lessonKey: "__draft-lesson__",
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
      draftCourseKey: "__draft-course__",
      draftMicrosequences: [],
      dependencies: [],
      microsequenceVersions: [{ id: "v1", label: "Versão 1" }],
      activeMicrosequenceVersionId: "v1",
      selectedDependencyKeys: [],
      pendingDependencyKey: "",
      modelOptions: [],
      selectedModel: "",
      assistModeOptions: [{ value: "compose", label: "Gerar microssequência" }],
      selectedAssistMode: "compose",
      activeWorkbenchPane: "preview",
      assistModeLocked: true,
      promptText: "",
      currentMicrosequenceIsPlaceholder: true
    }
  });

  assert.match(html, /data-action="apply-assist"/);
  assert.match(html, /data-field="assist-prompt" class="assist-prompt" aria-label="Pedido" title="Pedido"/);
  assert.doesNotMatch(html, /Escreva um pedido de estudo/);
  assert.doesNotMatch(html, /draft-generator-guidance/);
  assert.doesNotMatch(html, /editor-card-count-value">1\/7<\/span>/);
  assert.doesNotMatch(html, /runtime-card-title/);
  assert.doesNotMatch(html, /workbench-surface/);
  assert.doesNotMatch(html, /data-field="assist-microsequence-title"/);
  assert.doesNotMatch(html, /data-action="select-workbench-pane"/);
  assert.doesNotMatch(html, /Os cards aparecerão aqui após o envio do prompt/);
});

test("renderiza status da oficina em painel rolável", () => {
  const project = readProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const html = renderLessonScreen({
    project,
    view: "draft-generator",
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
      draftCourseKey: "__draft-course__",
      draftMicrosequences: [],
      dependencies: [],
      microsequenceVersions: [{ id: "v1", label: "Versão 1" }],
      activeMicrosequenceVersionId: "v1",
      selectedDependencyKeys: [],
      pendingDependencyKey: "",
      modelOptions: [],
      selectedModel: "",
      assistModeOptions: [{ value: "compose", label: "Gerar microssequência" }],
      selectedAssistMode: "compose",
      activeWorkbenchPane: "edit",
      assistModeLocked: true,
      promptText: "",
      currentMicrosequenceIsPlaceholder: false,
      lastRequest: {
        title: "Microssequência gerada",
        description: "4 cards aplicados em Git básico com Gemini 2.5 Flash."
      }
    }
  });

  assert.match(html, /class="microsequence-assist-panel assist-status-panel"/);
  assert.match(html, /4 cards aplicados em Git básico/);
  assert.doesNotMatch(html, /runtime-card-title/);
  assert.doesNotMatch(html, /workbench-surface/);
  assert.doesNotMatch(html, /data-field="assist-microsequence-title"/);
});

test("renderiza a execução do card com nome do curso e faixa estável de tags", () => {
  const project = readProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const html = renderLessonScreen({
    project,
    view: "microsequence",
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
      dependencies: [
        { key: "diretorio", title: "Diretório atual e caminhos" },
        { key: "teste", title: "Teste" }
      ],
      draftCourseKey: "__draft__",
      draftMicrosequences: [],
      cardRuntimeOptions: {}
    }
  });

  assert.match(html, /<span class="study-reader-context-line">Curso renderizável<\/span>/);
  assert.match(html, /data-home-tab="courses"[^>]+aria-selected="true"/);
  assert.doesNotMatch(html, /Lição experimental - Modelo cascata/);
  assert.match(html, /class="study-context-tags compact-study-tags"/);
  assert.match(html, /class="study-reader-count" aria-label="Card 1 de 7" title="Card 1 de 7"/);
  assert.match(html, /study-reader-count-value">1\/7<\/span>/);
  assert.match(html, /Diretório atual e caminhos/);
  assert.match(html, /Teste/);
});
