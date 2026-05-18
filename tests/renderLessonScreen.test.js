import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { validateContractDocument } from "../src/contract/validateContract.js";
import { renderLessonScreen } from "../src/ui/renderLessonScreen.js";

function countMatches(source, pattern) {
  return (source.match(pattern) || []).length;
}

function readProject() {
  const parsed = JSON.parse(fs.readFileSync("./docs/examples/aralearn-contract.renderable.json", "utf8"));
  const result = validateContractDocument(parsed);
  assert.equal(result.ok, true);
  return result.value;
}

function buildProgressState(entries = []) {
  return {
    version: 1,
    lessons: Object.fromEntries(
      entries.map(({ courseKey, moduleKey, lessonKey, completedCardKeys = [], cursor = 0 }) => [
        `${courseKey}::${moduleKey}::${lessonKey}`,
        { cursor, completedCardKeys }
      ])
    )
  };
}

test("renderiza a tela de curso mostrando apenas módulos", () => {
  const project = readProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const progress = buildProgressState([
    {
      courseKey: course.key,
      moduleKey: moduleValue.key,
      lessonKey: lesson.key,
      completedCardKeys: [lesson.microsequences[0].cards[0].key]
    }
  ]);
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
      progress,
      activeStructureVersionId: "v2",
      structureVersionContextTabs: [{ label: "C1 → C2" }],
      structureVersionTabs: [
        { versionId: "v1", lineage: "M1", displayId: "M1", updatedAt: "2026-05-10T18:32:00.000Z" },
        { versionId: "v2", lineage: "M1 → M2", displayId: "M2", updatedAt: "2026-05-10T18:40:00.000Z" }
      ]
    }
  });

  assert.match(html, /data-action="quick-create-module"/);
  assert.match(html, /data-action="open-course-screen-actions"/);
  assert.match(html, new RegExp(`data-action="open-generation-panel-course" data-course-key="${course.key}"`));
  assert.doesNotMatch(html, /C1 → C2/);
  assert.doesNotMatch(html, /data-action="select-structure-version"/);
  assert.doesNotMatch(html, /M1 → M2/);
  assert.doesNotMatch(html, /10\/05 18:40/);
  assert.doesNotMatch(html, /data-action="scroll-structure-version-prev"/);
  assert.doesNotMatch(html, /data-action="scroll-structure-version-next"/);
  assert.match(html, /data-action="structure-drag-handle" data-structure-level="module"/);
  assert.match(html, /data-action="open-module-actions"/);
  assert.match(html, /data-action="open-generation-panel-module"/);
  assert.match(html, /data-action="open-module"/);
  assert.match(html, /aria-label="3 lições" title="3 lições"/);
  assert.match(html, /class="topbar lesson-topbar navigation-topbar"/);
  assert.doesNotMatch(html, /class="structure-version-tabbar"/);
  assert.match(html, /class="navigation-list structure-navigation-list"/);
  assert.match(html, /class="lesson-copy structure-copy navigation-main"/);
  assert.match(html, /class="structure-title-row navigation-title-row"/);
  assert.match(html, /class="lesson-actions structure-actions navigation-actions"/);
  assert.equal(countMatches(html, /class="card-progress-fill"/g), (course.modules || []).length);
  assert.match(html, /card-progress-fill" style="width:[1-9]/);
  assert.equal(countMatches(html, /class="muted tiny progress-meta"/g), 1);
  assert.ok(html.indexOf('data-action="open-generation-panel-course"') < html.indexOf('data-action="quick-create-module"'));
  assert.ok(html.indexOf('data-action="quick-create-module"') < html.indexOf('data-action="open-course-screen-actions"'));
  assert.doesNotMatch(html, /data-action="open-lesson-actions"/);
  assert.doesNotMatch(html, /data-action="open-lesson"/);
  assert.match(html, /progress-meta-item-icon/);
});

test("renderiza a tela de módulo mostrando apenas lições", () => {
  const project = readProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const progress = buildProgressState([
    {
      courseKey: course.key,
      moduleKey: moduleValue.key,
      lessonKey: lesson.key,
      completedCardKeys: [lesson.microsequences[0].cards[0].key]
    }
  ]);
  const html = renderLessonScreen({
    project,
    view: "module",
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
      progress,
      structureVersionContextTabs: [
        { label: "C1 → C2" },
        { label: "M1 → M2" }
      ],
      activeStructureVersionId: "v2",
      structureVersionTabs: [
        { versionId: "v1", lineage: "L1", displayId: "L1", updatedAt: "2026-05-10T18:32:00.000Z" },
        { versionId: "v2", lineage: "L1 → L2", displayId: "L2", updatedAt: "2026-05-10T18:40:00.000Z" }
      ]
    }
  });

  assert.match(html, /data-action="quick-create-lesson"/);
  assert.match(html, /data-action="open-module-screen-actions"/);
  assert.match(
    html,
    new RegExp(`data-action="open-lesson-source-guide" data-course-key="${course.key}" data-module-key="${moduleValue.key}" data-lesson-key="${lesson.key}"`)
  );
  assert.match(
    html,
    new RegExp(`data-action="open-generation-panel-module" data-course-key="${course.key}" data-module-key="${moduleValue.key}"`)
  );
  assert.doesNotMatch(html, /C1 → C2/);
  assert.doesNotMatch(html, /M1 → M2/);
  assert.doesNotMatch(html, /L1 → L2/);
  assert.doesNotMatch(html, /10\/05 18:40/);
  assert.match(html, /data-action="structure-drag-handle" data-structure-level="lesson"/);
  assert.match(html, /data-action="open-lesson-actions"/);
  assert.match(html, /data-action="open-generation-panel-lesson"/);
  assert.match(html, /data-action="open-lesson"/);
  assert.doesNotMatch(html, /C1 → C2 · M1 → M2/);
  assert.doesNotMatch(html, /class="structure-version-tabbar"/);
  assert.match(html, /class="navigation-list structure-navigation-list"/);
  assert.match(html, /class="structure-title-row navigation-title-row"/);
  assert.match(html, /class="lesson-actions structure-actions navigation-actions"/);
  assert.equal(countMatches(html, /class="card-progress-fill"/g), (moduleValue.lessons || []).length);
  assert.match(html, /card-progress-fill" style="width:[1-9]/);
  assert.equal(countMatches(html, /class="muted tiny progress-meta"/g), 3);
  assert.ok(html.indexOf('data-action="open-generation-panel-module"') < html.indexOf('data-action="quick-create-lesson"'));
  assert.ok(html.indexOf('data-action="quick-create-lesson"') < html.indexOf('data-action="open-module-screen-actions"'));
  assert.doesNotMatch(html, /aria-label="Progresso: 0\/12" title="0\/12"/);
  assert.match(html, /aria-label="1 microssequência" title="1 microssequência"/);
  assert.doesNotMatch(html, /data-action="open-microsequence-actions"/);
  assert.doesNotMatch(html, /data-action="play-microsequence"/);
});

test("renderiza a tela de lição com microssequências agrupadas", () => {
  const project = readProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const progress = buildProgressState([
    {
      courseKey: course.key,
      moduleKey: moduleValue.key,
      lessonKey: lesson.key,
      completedCardKeys: microsequence.cards.slice(0, 2).map((card) => card.key)
    }
  ]);
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
      progress,
      structureVersionContextTabs: [
        { label: "C1 → C2" },
        { label: "M1 → M2" },
        { label: "L1 → L2" }
      ],
      activeStructureVersionId: "v2",
      structureVersionTabs: [
        { versionId: "v1", lineage: "V1", displayId: "V1", updatedAt: "2026-05-10T18:32:00.000Z" },
        { versionId: "v2", lineage: "V1 → V2", displayId: "V2", updatedAt: "2026-05-10T18:40:00.000Z" }
      ]
    }
  });

  assert.match(html, /data-action="quick-create-microsequence"/);
  assert.match(html, /data-action="open-lesson-screen-actions"/);
  assert.match(
    html,
    new RegExp(
      `data-action="open-lesson-source-guide" data-course-key="${course.key}" data-module-key="${moduleValue.key}" data-lesson-key="${lesson.key}"`
    )
  );
  assert.match(
    html,
    new RegExp(
      `data-action="open-generation-panel-lesson" data-course-key="${course.key}" data-module-key="${moduleValue.key}" data-lesson-key="${lesson.key}"`
    )
  );
  assert.doesNotMatch(html, /C1 → C2/);
  assert.doesNotMatch(html, /M1 → M2/);
  assert.doesNotMatch(html, /L1 → L2/);
  assert.doesNotMatch(html, /V1 → V2/);
  assert.doesNotMatch(html, /10\/05 18:40/);
  assert.match(html, /Microssequências/);
  assert.match(html, /data-action="structure-drag-handle" data-structure-level="microsequence"/);
  assert.match(html, /data-action="open-microsequence-actions"/);
  assert.match(html, /data-action="open-microsequence-assist"/);
  assert.match(html, /data-action="play-microsequence"/);
  assert.match(html, /class="microsequence-group navigation-list"/);
  assert.match(html, /class="lesson-actions structure-actions navigation-actions"/);
  assert.match(html, /aria-label="Progresso: 2\/7" title="2\/7"/);
  assert.equal(countMatches(html, /class="card-progress-fill"/g), 1);
  assert.match(html, /card-progress-fill" style="width:28\.57142857142857%"/);
  assert.doesNotMatch(html, /aria-label="1 microssequência" title="1 microssequência"/);
  assert.match(html, /aria-label="7 cards" title="7 cards"/);
  assert.match(html, /class="didactic-tag-row microsequence-tag-row"/);
  assert.match(html, /<span class="didactic-tag-text">Processos de software<\/span>/);
  assert.equal(countMatches(html, /class="muted tiny progress-meta"/g), 1);
  assert.ok(html.indexOf('data-action="open-lesson-source-guide"') < html.indexOf('data-action="open-generation-panel-lesson"'));
  assert.ok(html.indexOf('data-action="open-generation-panel-lesson"') < html.indexOf('data-action="quick-create-microsequence"'));
  assert.ok(html.indexOf('data-action="quick-create-microsequence"') < html.indexOf('data-action="open-lesson-screen-actions"'));
  assert.doesNotMatch(html, /data-action="select-structure-version"/);
  assert.match(html, /microsequence-state-icon is-ready/);
  assert.doesNotMatch(html, /aria-label="pronta" title="pronta"/);
  assert.doesNotMatch(html, /data-action="open-microsequence-source-guide"/);
  assert.doesNotMatch(html, /data-action="toggle-microsequence-runtime"/);
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

  assert.match(html, /Não há microssequências prontas para estudar aqui\. As etapas planejadas abaixo podem ser materializadas quando você quiser\./);
  assert.match(html, /Planejadas/);
  assert.match(html, /microsequence-state-icon is-draft/);
  assert.match(html, /aria-label="Microssequência planejada" title="Microssequência planejada"/);
  assert.match(html, /data-action="open-microsequence-assist"/);
  assert.match(html, /Etapa planejada da trilha\. Abra para materializar ou reformular\./);
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
  assert.match(html, /Fora do estudo/);
  assert.doesNotMatch(html, /data-action="toggle-microsequence-runtime"/);
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
    label: `Iteração ${index + 1}`,
    updatedAt: `2026-05-${String(index + 1).padStart(2, "0")}T18:4${index % 10}:00.000Z`
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
      visualizedMicrosequenceVersionId: "v6",
      editBaseMicrosequenceVersionId: "v7",
      visualizedMicrosequenceVersion: microsequenceVersions[5],
      canDeleteVisualizedMicrosequenceVersion: true,
      selectedDependencyKeys: [],
      pendingDependencyKey: "",
      assistActionOptions: [
        { value: "continue_current", label: "Continuar na microssequência", icon: "sparkles" },
        { value: "repair_current", label: "Corrigir microssequência", icon: "edit" },
        { value: "next_planned", label: "Ir a nova microssequência", icon: "microsequence" },
        { value: "create_after_current", label: "Criar nova microssequência", icon: "add" }
      ],
      selectedAssistAction: "",
      assistPromptLabel: "Pedido dos próximos cards",
      assistSubmitLabel: "Gerar próximos cards",
      assistPromptPlaceholder: "Diga o que deve vir agora.",
      assistRequestReady: false,
      containerOptions: [
        { value: "", label: "Automático" },
        { value: "ask", label: "Pergunta" }
      ],
      preferredContainer: "",
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
  assert.match(html, /data-action="open-version-history"/);
  assert.doesNotMatch(html, /data-action="save-microsequence-snapshot"/);
  assert.doesNotMatch(html, /data-action="open-microsequence-version-compare"/);
  assert.doesNotMatch(html, /data-action="select-microsequence-version"/);
  assert.doesNotMatch(html, /data-action="editor-prev-version"/);
  assert.doesNotMatch(html, /data-action="editor-next-version"/);
  assert.doesNotMatch(html, /data-action="editor-prev-card"/);
  assert.doesNotMatch(html, /data-action="editor-next-card"/);
  assert.doesNotMatch(html, /data-action="scroll-card-strip-prev"/);
  assert.doesNotMatch(html, /data-action="scroll-card-strip-next"/);
  assert.doesNotMatch(html, /data-action="version-tabs-prev"/);
  assert.doesNotMatch(html, /data-action="version-tabs-next"/);
  assert.doesNotMatch(html, /data-action="use-microsequence-version"/);
  assert.doesNotMatch(html, /data-action="toggle-microsequence-version-more"/);
  assert.doesNotMatch(html, /data-action="duplicate-microsequence-version"/);
  assert.doesNotMatch(html, /class="editor-version-tab active"/);
  assert.doesNotMatch(html, /class="chip-muted editor-version-count"/);
  assert.doesNotMatch(html, /editor-version-count-value">6\/12<\/span>/);
  assert.doesNotMatch(html, /aria-label="Versão 6 de 12" title="Versão 6 de 12"/);
  assert.doesNotMatch(html, /Em uso: v7/);
  assert.doesNotMatch(html, /Visualizando: v6/);
  assert.match(html, /data-action="select-workbench-pane" data-workbench-pane="preview" aria-label="Preview" title="Preview"/);
  assert.match(html, /workbench-surface-tab active" type="button" role="tab" aria-selected="true" data-action="select-workbench-pane" data-workbench-pane="edit" aria-label="Edição" title="Edição"/);
  assert.match(html, /workbench-surface-tab-icon/);
  assert.doesNotMatch(html, /mini-card-kicker-icon/);
  assert.doesNotMatch(html, /data-action="open-card"/);
  assert.doesNotMatch(html, /data-structure-draggable="true"/);
  assert.doesNotMatch(html, /data-structure-level="card"/);
  assert.doesNotMatch(html, /data-card-key="card-ideia-central"/);
  assert.doesNotMatch(html, /data-action="edit-card"/);
  assert.doesNotMatch(html, /<span class="editor-version-tab-label">v12<\/span>/);
  assert.doesNotMatch(html, /<span class="editor-version-tab-meta">12\/05 18:41<\/span>/);
  assert.match(html, /data-field="assist-dependency-picker" aria-label="Tags" title="Tags"/);
  assert.match(html, /assist-action-options/);
  assert.match(html, /data-field="assist-action-intent" value="continue_current"/);
  assert.match(html, /assist-action-heading/);
  assert.match(html, /Continuar na microssequência/);
  assert.match(html, /Corrigir microssequência/);
  assert.match(html, /Ir a nova microssequência/);
  assert.match(html, /Criar nova microssequência/);
  assert.match(html, /data-field="assist-preferred-container" aria-label="Materialização preferida" title="Materialização preferida"/);
  assert.match(html, /<option value="__unset__" selected>Selecionar materialização<\/option>/);
  assert.doesNotMatch(html, /Os cards atuais são só o trecho já materializado\./);
  assert.match(html, /data-field="assist-prompt" class="assist-prompt" aria-label="Pedido dos próximos cards" title="Pedido dos próximos cards" placeholder="Diga o que deve vir agora\."/);
  assert.match(html, /data-field="assist-attachments" class="assist-attachment-input" type="file" multiple/);
  assert.match(html, /data-action="open-assist-attachment-picker" title="Anexar documentos" aria-label="Anexar documentos"/);
  assert.match(html, /data-action="remove-assist-attachment" data-attachment-index="0"/);
  assert.match(html, /referencia\.pdf/);
  assert.match(html, /data-action="clear-prompt" title="Limpar prompt" aria-label="Limpar prompt"/);
  assert.match(html, /data-action="open-assist-config" title="Configurar IA" aria-label="Configurar IA"/);
  assert.match(html, /data-action="apply-assist"[^>]*title="Gerar próximos cards" aria-label="Gerar próximos cards"/);
  assert.match(html, /data-action="apply-assist"[^>]*disabled aria-disabled="true"/);
  assert.match(html, /generate-submit-icon/);
  assert.doesNotMatch(html, />Preview<\/button>/);
  assert.doesNotMatch(html, />Edição<\/button>/);
  assert.doesNotMatch(html, /<label[^>]*>\s*Microssequência\s*<\/label>/);
  assert.doesNotMatch(html, /<label[^>]*>\s*Tags\s*<\/label>/);
  assert.doesNotMatch(html, /<label[^>]*>\s*Intenção\s*<\/label>/);
  assert.doesNotMatch(html, /<label[^>]*>\s*Pedido\s*<\/label>/);
  assert.doesNotMatch(html, /data-field="assist-mode"/);
  assert.doesNotMatch(html, /data-field="assist-didactic-type"/);
  assert.doesNotMatch(html, /data-field="assist-target-mode"/);
  assert.doesNotMatch(html, /data-field="assist-operation-mode"/);
  assert.doesNotMatch(html, /data-field="assist-intervention-type"/);
  assert.doesNotMatch(html, /data-field="assist-microsequence-title"/);
  assert.doesNotMatch(html, /mini-card-kicker">Card /);
  assert.doesNotMatch(html, /Intenção do usuário/);
  assert.doesNotMatch(html, /Pedido de revisão/);
  assert.doesNotMatch(html, /Editar a partir desta/);
  assert.doesNotMatch(html, /Excluir versão/);
  assert.doesNotMatch(html, /Duplicar como variação/);
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
    status: "draft",
    included: false,
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
      assistActionOptions: [
        { value: "materialize_current", label: "Continuar na microssequência", icon: "sparkles" },
        { value: "reformulate_current", label: "Corrigir microssequência", icon: "edit" },
        { value: "next_planned", label: "Ir a nova microssequência", icon: "microsequence" },
        { value: "create_after_current", label: "Criar nova microssequência", icon: "add" }
      ],
      selectedAssistAction: "materialize_current",
      assistPromptLabel: "Pedido dos primeiros cards",
      assistSubmitLabel: "Gerar primeiros cards",
      assistPromptPlaceholder: "Gere os primeiros cards.",
      assistRequestReady: false,
      containerOptions: [
        { value: "", label: "Automático" },
        { value: "ask", label: "Pergunta" }
      ],
      preferredContainer: "",
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

  assert.match(html, /<div class="topbar-title">Modelo cascata<\/div>/);
  assert.match(html, /data-action="open-version-history"/);
  assert.doesNotMatch(html, /data-action="save-microsequence-snapshot"/);
  assert.doesNotMatch(html, /data-action="open-version-compare"/);
  assert.doesNotMatch(html, /editor-step-nav/);
  assert.doesNotMatch(html, /editor-version-count-value/);
  assert.doesNotMatch(html, /Os cards gerados aparecerão aqui após o envio do prompt\./);
  assert.match(html, /data-workbench-pane="edit"/);
  assert.doesNotMatch(html, /Esta etapa ainda não tem cards\./);
  assert.doesNotMatch(html, /Gere os primeiros cards a partir do plano já definido/);
  assert.match(html, /data-field="assist-action-intent" value="materialize_current" checked/);
  assert.match(html, /Continuar na microssequência/);
  assert.match(html, /Corrigir microssequência/);
  assert.match(html, /data-action="open-assist-attachment-picker" title="Anexar documentos" aria-label="Anexar documentos"/);
  assert.match(html, /data-action="select-workbench-pane" data-workbench-pane="edit" aria-label="Geração" title="Geração"/);
  assert.match(html, /<option value="__unset__" selected>Selecionar materialização<\/option>/);
  assert.match(html, /data-field="assist-preferred-container" aria-label="Materialização preferida" title="Materialização preferida"/);
  assert.doesNotMatch(html, /data-action="select-workbench-pane" data-workbench-pane="preview"/);
  assert.doesNotMatch(html, /Sem cards ainda/);
  assert.doesNotMatch(html, /Envie o pedido para gerar os cards da microssequência\./);
  assert.match(html, /data-field="assist-prompt" class="assist-prompt" aria-label="Pedido dos primeiros cards" title="Pedido dos primeiros cards" placeholder="Gere os primeiros cards\."/);
  assert.match(html, /data-action="apply-assist"[^>]*title="Gerar primeiros cards" aria-label="Gerar primeiros cards"/);
  assert.doesNotMatch(html, /data-field="assist-target-mode"/);
  assert.doesNotMatch(html, /data-field="assist-operation-mode"/);
  assert.doesNotMatch(html, /data-field="assist-intervention-type"/);
  assert.doesNotMatch(html, /data-field="assist-didactic-type"/);
});

test("renderiza ação intermediária quando há próxima microssequência planejada", () => {
  const project = readProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = structuredClone(moduleValue.lessons[0]);
  lesson.microsequences = [
    {
      ...lesson.microsequences[0]
    },
    {
      key: "microsequence-planejada",
      title: "Próxima etapa",
      status: "draft",
      included: false,
      tags: ["Contraste"],
      cards: []
    }
  ];
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
    moduleValue: { ...moduleValue, lessons: [lesson] },
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
      assistActionOptions: [
        { value: "continue_current", label: "Continuar na microssequência", icon: "sparkles" },
        { value: "repair_current", label: "Corrigir microssequência", icon: "edit" },
        { value: "next_planned", label: "Ir a nova microssequência", icon: "microsequence" },
        { value: "create_after_current", label: "Criar nova microssequência", icon: "add" }
      ],
      selectedAssistAction: "",
      assistPromptLabel: "Pedido",
      assistSubmitLabel: "Enviar pedido",
      assistPromptPlaceholder: "Descreva o pedido.",
      assistRequestReady: false,
      containerOptions: [{ value: "", label: "Automático" }],
      preferredContainer: "",
      modelOptions: [{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }],
      selectedModel: "gemini-2.5-flash",
      assistModeOptions: [],
      selectedAssistMode: "edit-microsequence",
      activeWorkbenchPane: "edit",
      assistModeLocked: true,
      attachments: [],
      promptText: "",
      nextPlannedMicrosequence: lesson.microsequences[1]
    }
  });

  assert.match(html, /Ir a nova microssequência/);
  assert.doesNotMatch(html, /data-action="open-next-planned-microsequence"/);
});

test("renderiza ida para a próxima microssequência planejada sem exigir pedido para IA", () => {
  const project = readProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = structuredClone(moduleValue.lessons[0]);
  lesson.microsequences = [
    { ...lesson.microsequences[0] },
    {
      key: "microsequence-planejada",
      title: "Próxima etapa",
      status: "draft",
      included: false,
      tags: ["Contraste"],
      cards: []
    }
  ];
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
    moduleValue: { ...moduleValue, lessons: [lesson] },
    lesson,
    microsequence,
    cards: microsequence.cards,
    microsequenceMode: "play",
    editorSupport: {
      progress: { version: 1, lessons: {} },
      dependencies: [{ key: "contraste", title: "Contraste" }],
      microsequenceVersions: [{ id: "v1", label: "Versão 1" }],
      activeMicrosequenceVersionId: "v1",
      selectedDependencyKeys: [],
      pendingDependencyKey: "contraste",
      assistActionOptions: [
        { value: "continue_current", label: "Continuar na microssequência", icon: "sparkles" },
        { value: "repair_current", label: "Corrigir microssequência", icon: "edit" },
        { value: "next_planned", label: "Ir a nova microssequência", icon: "microsequence" },
        { value: "create_after_current", label: "Criar nova microssequência", icon: "add" }
      ],
      selectedAssistAction: "next_planned",
      assistPromptLabel: "Próxima microssequência",
      assistSubmitLabel: "Abrir próxima microssequência",
      assistPromptPlaceholder: "Sem pedido necessário.",
      assistRequestReady: true,
      containerOptions: [{ value: "", label: "Automático" }],
      preferredContainer: "",
      preferredContainerConfirmed: false,
      modelOptions: [{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }],
      selectedModel: "gemini-2.5-flash",
      assistModeOptions: [],
      selectedAssistMode: "edit-microsequence",
      activeWorkbenchPane: "edit",
      assistModeLocked: true,
      attachments: [],
      promptText: "",
      nextPlannedMicrosequence: lesson.microsequences[1]
    }
  });

  assert.match(html, /data-field="assist-action-intent" value="next_planned" checked/);
  assert.match(html, /data-action="apply-assist"[^>]*title="Abrir próxima microssequência" aria-label="Abrir próxima microssequência"/);
  assert.doesNotMatch(html, /data-action="apply-assist"[^>]*disabled aria-disabled="true"/);
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
  assert.doesNotMatch(html, /editor-version-count-value">1\/1<\/span>/);
  assert.doesNotMatch(html, /data-action="open-version-compare"/);
  assert.match(html, /study-reader-screen/);
  assert.match(html, /runtime-card-title/);
  assert.match(html, /class="study-reader-count" aria-label="Card 1 de 7" title="Card 1 de 7"/);
  assert.match(html, /study-reader-count-value">1\/7<\/span>/);
  assert.doesNotMatch(html, /<label[^>]*>\s*Tags\s*<\/label>/);
});

test("renderiza a execução do card com nome do curso e contexto compacto", () => {
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
        { key: "teste", title: "Teste" },
        { key: "extra", title: "Dependência extra" }
      ],
      visualizedMicrosequenceVersion: {
        id: "v-runtime",
        title: microsequence.title,
        tags: ["diretorio", "teste", "extra"],
        cards: microsequence.cards
      },
      cardRuntimeOptions: {}
    }
  });

  assert.match(html, /<span class="study-reader-context-line study-reader-course-title">Curso renderizável<\/span>/);
  assert.doesNotMatch(html, /Lição experimental - Modelo cascata/);
  assert.doesNotMatch(html, /editor-step-nav/);
  assert.match(html, /class="study-context-tags compact-study-tags"/);
  assert.match(html, /class="study-reader-count" aria-label="Card 1 de 7" title="Card 1 de 7"/);
  assert.match(html, /study-reader-count-value">1\/7<\/span>/);
  assert.match(html, /Diretório atual e caminhos/);
  assert.match(html, /Teste/);
  assert.match(html, />\+1<\/span>/);
  assert.doesNotMatch(html, /Dependência extra/);
});

test("renderiza CTAs de aceitar e excluir quando a iteracao gerada atual esta pendente", () => {
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
      microsequenceVersions: [{ id: "v1", label: "Versão 1", operationType: "generated-pending" }],
      activeMicrosequenceVersionId: "v1",
      visualizedMicrosequenceVersionId: "v1",
      editBaseMicrosequenceVersionId: "v1",
      visualizedMicrosequenceVersion: {
        id: "v1",
        title: microsequence.title,
        tags: microsequence.tags,
        cards: microsequence.cards
      },
      pendingGeneratedVersionId: "v1",
      pendingGeneratedVersionActive: true,
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

  assert.match(html, /data-action="discard-generated-version"/);
  assert.match(html, /data-action="accept-generated-version"/);
  assert.match(html, /workbench-preview-footer/);
});

test("mantém o botão continuar ativo no último card do modo de estudo", () => {
  const project = readProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[1];
  const microsequence = lesson.microsequences[0];
  const card = microsequence.cards[4];
  const html = renderLessonScreen({
    project,
    view: "microsequence",
    selection: {
      courseKey: course.key,
      moduleKey: moduleValue.key,
      lessonKey: lesson.key,
      microsequenceKey: microsequence.key,
      cardKey: card.key,
      cardIndex: 4
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    cards: microsequence.cards,
    card,
    microsequenceMode: "play",
    editorSupport: {
      progress: {},
      dependencies: [],
      cardRuntimeOptions: {}
    }
  });

  assert.match(html, /data-action="next-card"/);
  assert.doesNotMatch(html, /data-action="next-card"[^>]*disabled/);
});
