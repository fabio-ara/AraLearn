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
      progress: { version: 1, lessons: {} }
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
      progress: { version: 1, lessons: {} }
    }
  });

  assert.match(html, /data-action="open-lesson-screen-actions"/);
  assert.match(html, /data-home-tab="courses"[^>]+aria-selected="true"/);
  assert.match(html, /data-action="structure-drag-handle" data-structure-level="microsequence"/);
  assert.match(html, /data-action="toggle-microsequence-runtime"/);
  assert.match(html, /data-action="open-microsequence-actions"/);
  assert.match(html, /data-action="play-microsequence"/);
  assert.match(html, /aria-label="Progresso: 0\/7" title="0\/7"/);
  assert.match(html, /aria-label="1 microssequência" title="1 microssequência"/);
  assert.match(html, /aria-label="7 cards" title="7 cards"/);
  assert.match(html, /Microssequências/);
  assert.match(html, /class="muted tiny progress-meta lesson-panel-summary"/);
  assert.match(html, /class="microsequence-title-line"/);
  assert.match(html, /microsequence-state-icon is-ready/);
  assert.doesNotMatch(html, /Módulo experimental/);
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
      progress: { version: 1, lessons: {} }
    }
  });

  assert.match(html, /Não há microssequências prontas para estudar aqui\./);
  assert.match(html, /microsequence-state-icon is-draft/);
  assert.match(html, /aria-label="Rascunho" title="Rascunho"/);
  assert.doesNotMatch(html, /Ainda não entra no estudo\./);
  assert.match(html, /data-action="open-microsequence-assist"/);
});

test("desabilita play e sinaliza exclusão quando a microssequência sai do estudo", () => {
  const project = readProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = structuredClone(moduleValue.lessons[0]);
  lesson.microsequences = lesson.microsequences.map((microsequence, index) =>
    index === 0 ? { ...microsequence, included: false } : microsequence
  );
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
    moduleValue: { ...moduleValue, lessons: [lesson] },
    lesson,
    microsequence,
    cards: microsequence.cards,
    microsequenceMode: "play",
    editorSupport: {
      progress: { version: 1, lessons: {} }
    }
  });

  assert.match(html, /microsequence-state-icon is-excluded/);
  assert.match(html, /aria-label="Microssequência excluída do estudo" title="Microssequência excluída do estudo"/);
  assert.doesNotMatch(html, /Esta microssequência foi removida da execução do curso\./);
  assert.match(html, /data-action="toggle-microsequence-runtime"[^>]*>\+<\/button>/);
  assert.match(html, /data-action="play-microsequence"[^>]*disabled aria-disabled="true"/);
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
      dependencies: [{ key: "teste", title: "Teste" }],
      microsequenceVersions,
      activeMicrosequenceVersionId: "v7",
      selectedDependencyKeys: [],
      pendingDependencyKey: "",
      modelOptions: [{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }],
      selectedModel: "gemini-2.5-flash",
      assistModeOptions: [],
      selectedAssistMode: "edit-microsequence",
      activeWorkbenchPane: "edit",
      assistModeLocked: true,
      attachments: [{ name: "referencia.pdf" }],
      promptText: ""
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
  assert.match(html, /data-action="open-card"/);
  assert.match(html, /data-structure-draggable="true"/);
  assert.match(html, /data-structure-level="card"/);
  assert.match(html, /data-card-key="card-ideia-central"/);
  assert.doesNotMatch(html, /data-action="edit-card"/);
  assert.match(html, /<span class="editor-version-tab-label">12<\/span>/);
  assert.match(html, /data-field="assist-microsequence-title" type="text" aria-label="Microssequência" title="Microssequência"/);
  assert.match(html, /data-field="assist-dependency-picker" aria-label="Tags" title="Tags"/);
  assert.match(html, /data-field="assist-prompt" class="assist-prompt" aria-label="Pedido" title="Pedido"/);
  assert.match(html, /data-action="open-assist-container-picker" title="Adicionar recursos" aria-label="Adicionar recursos"/);
  assert.match(html, /data-field="assist-attachments" class="assist-attachment-input" type="file" multiple/);
  assert.match(html, /data-action="open-assist-attachment-picker" title="Anexar documentos" aria-label="Anexar documentos"/);
  assert.match(html, /data-action="remove-assist-attachment" data-attachment-index="0"/);
  assert.match(html, /referencia\.pdf/);
  assert.match(html, /data-action="clear-prompt" title="Limpar prompt" aria-label="Limpar prompt"/);
  assert.match(html, /data-action="open-assist-config" title="Configurar IA" aria-label="Configurar IA"/);
  assert.match(html, /data-action="apply-assist"[^>]*title="Editar cards" aria-label="Editar cards"/);
  assert.match(html, /data-action="apply-assist"[^>]*disabled aria-disabled="true"/);
  assert.match(html, /generate-submit-icon/);
  assert.doesNotMatch(html, />Preview<\/button>/);
  assert.doesNotMatch(html, />Edição<\/button>/);
  assert.doesNotMatch(html, /<label[^>]*>\s*Microssequência\s*<\/label>/);
  assert.doesNotMatch(html, /<label[^>]*>\s*Tags\s*<\/label>/);
  assert.doesNotMatch(html, /<label[^>]*>\s*Intenção\s*<\/label>/);
  assert.doesNotMatch(html, /<label[^>]*>\s*Pedido\s*<\/label>/);
  assert.doesNotMatch(html, /data-field="assist-mode"/);
  assert.doesNotMatch(html, /mini-card-kicker">Card /);
  assert.doesNotMatch(html, /Intenção do usuário/);
  assert.doesNotMatch(html, /Pedido de revisão/);
  assert.match(html, /dependency-chip-row/);
  assert.doesNotMatch(html, /generator-preview-stage/);
});

test("renderiza popup final do continuar no rodapé sem vazar o bloco inline no corpo do card", () => {
  const card = {
    key: "card-popup",
    title: "Card com popup",
    type: "text",
    runtime: {
      title: "Card com popup",
      blocks: [
        { kind: "heading", value: "Card com popup" },
        { kind: "paragraph", value: "Enunciado principal." },
        {
          kind: "button",
          popupEnabled: true,
          popupBlocks: [
            { kind: "paragraph", value: "Comentário final" },
            {
              kind: "multiple_choice",
              ask: "Qual alternativa está correta?",
              answerState: "single",
              options: [
                { value: "Resposta correta", answer: true },
                { value: "Distrator", answer: false }
              ]
            }
          ]
        }
      ]
    }
  };
  const project = readProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = {
    ...lesson.microsequences[0],
    cards: [card]
  };

  const html = renderLessonScreen({
    project,
    view: "microsequence",
    selection: {
      courseKey: course.key,
      moduleKey: moduleValue.key,
      lessonKey: lesson.key,
      microsequenceKey: microsequence.key,
      cardKey: card.key,
      cardIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    cards: [card],
    microsequenceMode: "play",
    editorSupport: {
      progress: { version: 1, lessons: {} },
      cardRuntimeOptions: {},
      continuePopup: {
        open: true,
        blockKey: "course::module::lesson::card::2"
      }
    }
  });

  assert.match(html, /study-next-wrap is-popup-open/);
  assert.match(html, /study-continue-popup/);
  assert.match(html, /data-action="continue-popup-next"/);
  assert.match(html, /Comentário final/);
  assert.match(html, /Qual alternativa está correta\?/);
  assert.doesNotMatch(html, /runtime-popup-summary/);
});

test("renderiza o painel da microssequência vazia em modo de geração de cards", () => {
  const project = readProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = {
    ...lesson.microsequences[0],
    cards: []
  };
  const html = renderLessonScreen({
    project,
    view: "microsequence-assist",
    selection: {
      courseKey: course.key,
      moduleKey: moduleValue.key,
      lessonKey: lesson.key,
      microsequenceKey: microsequence.key,
      cardKey: "",
      cardIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    cards: [],
    microsequenceMode: "play",
    editorSupport: {
      progress: { version: 1, lessons: {} },
      dependencies: [],
      microsequenceVersions: [{ id: "v1", label: "Versão 1" }],
      activeMicrosequenceVersionId: "v1",
      selectedDependencyKeys: [],
      pendingDependencyKey: "",
      modelOptions: [{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }],
      selectedModel: "gemini-2.5-flash",
      assistModeOptions: [],
      selectedAssistMode: "edit-microsequence",
      activeWorkbenchPane: "edit",
      assistModeLocked: true,
      attachments: [],
      promptText: ""
    }
  });

  assert.match(html, /<div class="topbar-title">Gerar cards<\/div>/);
  assert.doesNotMatch(html, /editor-step-nav/);
  assert.doesNotMatch(html, /editor-version-count-value/);
  assert.doesNotMatch(html, /Os cards gerados aparecerão aqui após o envio do prompt\./);
  assert.match(html, /data-workbench-pane="edit"/);
  assert.match(html, /data-action="open-assist-container-picker" title="Adicionar recursos" aria-label="Adicionar recursos"/);
  assert.match(html, /data-action="open-assist-attachment-picker" title="Anexar documentos" aria-label="Anexar documentos"/);
  assert.match(html, /data-action="select-workbench-pane" data-workbench-pane="edit" aria-label="Geração" title="Geração"/);
  assert.doesNotMatch(html, /data-action="select-workbench-pane" data-workbench-pane="preview"/);
  assert.doesNotMatch(html, /Sem cards ainda/);
  assert.doesNotMatch(html, /Envie o pedido para gerar os cards da microssequência\./);
  assert.match(html, /data-action="apply-assist"[^>]*title="Gerar cards" aria-label="Gerar cards"/);
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
      dependencies: [],
      microsequenceVersions: [{ id: "v1", label: "Versão 1" }],
      activeMicrosequenceVersionId: "v1",
      selectedDependencyKeys: [],
      pendingDependencyKey: "",
      modelOptions: [{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }],
      selectedModel: "gemini-2.5-flash",
      assistModeOptions: [],
      selectedAssistMode: "edit-microsequence",
      activeWorkbenchPane: "preview",
      assistModeLocked: true,
      promptText: ""
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
      cardRuntimeOptions: {}
    }
  });

  assert.match(html, /<span class="study-reader-context-line study-reader-course-title">Curso renderizável<\/span>/);
  assert.doesNotMatch(html, /data-home-tab="courses"/);
  assert.doesNotMatch(html, /data-home-tab="generate"/);
  assert.doesNotMatch(html, /Lição experimental - Modelo cascata/);
  assert.match(html, /class="study-context-tags compact-study-tags"/);
  assert.match(html, /class="study-reader-count" aria-label="Card 1 de 7" title="Card 1 de 7"/);
  assert.match(html, /study-reader-count-value">1\/7<\/span>/);
  assert.match(html, /Diretório atual e caminhos/);
  assert.match(html, /Teste/);
});
