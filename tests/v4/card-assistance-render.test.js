import test from "node:test";
import assert from "node:assert/strict";

import { renderCardRuntimeBlocks } from "../../src/render/renderCardRuntime.js";
import { renderLessonScreen } from "../../src/ui/renderLessonScreen.js";

function compositeCard() {
  return {
    id: "card-a",
    position: 1,
    resource: "composite",
    kind: "theory",
    exercise: "none",
    title: "Conjunção",
    blocks: [
      { id: "paragraph-1", kind: "paragraph", value: "P e Q precisam ser verdadeiras." },
      { id: "code-1", kind: "code", prompt: "Notação", language: "text", code: "P ∧ Q" }
    ],
    after: ""
  };
}

function projectFixture(cardOverride = null) {
  const card = cardOverride || compositeCard();
  const project = {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{
      id: "course-a",
      title: "Lógica",
      modules: [{
        id: "module-a",
        title: "Operadores",
        lessons: [{
          id: "lesson-a",
          title: "Conjunção",
          microsequences: [{
            id: "micro-a",
            title: "Regra",
            status: "generated",
            dependsOn: [],
            cards: [card]
          }]
        }]
      }]
    }]
  };
  return { project, card };
}

function renderWorkbench(editorSupport = {}, cardOverride = null) {
  const { project, card } = projectFixture(cardOverride);
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  return renderLessonScreen({
    project,
    view: "microsequence",
    selection: {
      courseKey: course.id,
      moduleKey: moduleValue.id,
      lessonKey: lesson.id,
      microsequenceKey: microsequence.id,
      cardKey: card.id,
      cardIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    cards: microsequence.cards,
    microsequenceMode: "assist",
    editorSupport: {
      progress: { version: 1, lessons: {} },
      coursePermissions: {
        canAuthorContent: true,
        canEdit: true,
        canDelete: true
      },
      entityModes: { card: "ai" },
      ...editorSupport
    }
  });
}

function assertBureaucraticFlowIsAbsent(html) {
  for (const action of [
    "select-card-assistance-operation",
    "select-card-creation-placement",
    "apply-card-assistance-preview",
    "discard-card-assistance-preview",
    "show-card-assistance-preview-current",
    "show-card-assistance-preview-proposal",
    "open-assist-attachment-picker"
  ]) {
    assert.doesNotMatch(html, new RegExp(`data-action="${action}"`, "u"));
  }
  assert.doesNotMatch(html, /Atual|Proposta|prévia|data-field="assist-model"/u);
}

test("IA seleciona o card ou resources na própria superfície e envia diretamente", () => {
  const html = renderWorkbench({
    cardAssistanceComposerOpen: true,
    cardAssistanceState: {
      operation: "repair",
      repairScope: "resources",
      wholeCardSelected: false,
      selectedCardKeys: ["card-a"],
      resourceTargetIds: ["body:paragraph-1"]
    },
    cardResourceTargets: [
      { targetId: "body:paragraph-1", location: "body", resourceType: "paragraph", label: "Parágrafo 1" },
      { targetId: "body:code-1", location: "body", resourceType: "code", label: "Código 1" }
    ],
    cardAssistanceRequestReady: true,
    promptText: "Corrija somente o exemplo selecionado."
  });
  assert.match(html, /data-action="toggle-card-assistance-whole-card" aria-pressed="false"/u);
  assert.match(html, /data-resource-target-id="body:paragraph-1"[^>]*aria-pressed="true"/u);
  assert.match(html, /data-resource-target-id="body:code-1"[^>]*aria-pressed="false"/u);
  assert.match(html, /data-field="assist-prompt"[^>]*>Corrija somente o exemplo selecionado\.<\/textarea>/u);
  assert.match(html, /data-action="open-assist-config"/u);
  assert.match(html, /data-action="submit-card-assistance"/u);
  assert.match(html, /data-action="toggle-card-assistance-composer" aria-expanded="true"/u);
  assert.match(html, /data-entity-level="card" data-entity-mode="ai"/u);
  assertBureaucraticFlowIsAbsent(html);
});

test("IA mantém a seleção direta e só revela o pedido pelo CTA", () => {
  const html = renderWorkbench({
    cardAssistanceState: {
      repairScope: "resources",
      wholeCardSelected: false,
      selectedCardKeys: ["card-a"],
      resourceTargetIds: ["body:paragraph-1"]
    },
    cardResourceTargets: [{
      targetId: "body:paragraph-1",
      location: "body",
      resourceType: "paragraph"
    }]
  });
  assert.match(html, /data-resource-target-id="body:paragraph-1"[^>]*aria-pressed="true"/u);
  assert.match(html, /data-action="toggle-card-assistance-composer" aria-expanded="false"/u);
  assert.doesNotMatch(html, /data-field="assist-prompt"|data-action="submit-card-assistance"/u);
  assert.doesNotMatch(html, /data-action="open-card-comment"|data-action="toggle-card-review"/u);
  assert.match(html, /data-action="prev-card"/u);
  assert.match(html, /data-action="next-card"/u);
});

test("todos os resources selecionados não promovem o card inteiro", () => {
  const html = renderWorkbench({
    cardAssistanceState: {
      repairScope: "resources",
      wholeCardSelected: false,
      selectedCardKeys: ["card-a"],
      resourceTargetIds: ["body:paragraph-1", "body:code-1"]
    },
    cardResourceTargets: [
      { targetId: "body:paragraph-1", location: "body", resourceType: "paragraph" },
      { targetId: "body:code-1", location: "body", resourceType: "code" }
    ]
  });
  assert.match(html, /toggle-card-assistance-whole-card" aria-pressed="false"/u);
  assert.doesNotMatch(html, /runtime-card-sheet is-editing is-selected-for-edit/u);
});

test("leitor de estudo não recebe seleção nem assistência", () => {
  const html = renderWorkbench({ entityModes: { card: "view" } });
  assert.match(html, /P e Q precisam ser verdadeiras\./u);
  for (const action of [
    "toggle-card-assistance-whole-card",
    "toggle-card-assistance-resource",
    "select-card-editor-mode",
    "submit-card-assistance"
  ]) {
    assert.doesNotMatch(html, new RegExp(`data-action="${action}"`, "u"));
  }
  assert.doesNotMatch(html, /runtime-card-drag-handle|decorative-card-drag-handle/u);
});

test("edição manual ocupa o resource e salva sem prévia", () => {
  const html = renderWorkbench({
    entityModes: { card: "edit" },
    cardAssistanceState: {
      repairScope: "resources",
      wholeCardSelected: false,
      resourceTargetIds: ["body:paragraph-1"],
      selectedCardKeys: ["card-a"]
    },
    cardResourceTargets: [{
      targetId: "body:paragraph-1",
      location: "body",
      resourceType: "paragraph",
      label: "Parágrafo 1"
    }]
  });
  assert.match(html, /data-manual-target-id="body:paragraph-1"/u);
  assert.match(html, /data-action="save-manual-card-edit"/u);
  assert.match(html, /runtime-block runtime-paragraph[^>]*data-manual-edit-path="value"/u);
  assert.match(html, /data-manual-edit-path="value"[^>]*contenteditable="plaintext-only"/u);
  assert.doesNotMatch(html, /runtime-resource-inline-editor|data-manual-edit-key="value"/u);
  assert.doesNotMatch(html, /data-action="open-resource-observation"/u);
  assert.doesNotMatch(html, /data-action="open-card-comment"|data-action="toggle-card-review"|data-action="toggle-card-assistance-composer"/u);
  assert.match(html, /data-action="prev-card"/u);
  assert.match(html, /data-action="next-card"/u);
  assertBureaucraticFlowIsAbsent(html);
});

test("edição manual do card inteiro limita a alteração ao título", () => {
  const choiceCard = {
    id: "card-choice",
    position: 1,
    resource: "choice",
    kind: "exercise",
    exercise: "choice",
    title: "Escolha",
    question: "Qual alternativa?",
    selectionMode: "single",
    selectionCriterion: "correct",
    options: [{ id: "a", text: "Primeira" }, { id: "b", text: "Segunda" }],
    answerIds: ["a"],
    after: ""
  };
  const html = renderWorkbench({
    entityModes: { card: "edit" },
    cardAssistanceState: {
      repairScope: "card",
      wholeCardSelected: true,
      resourceTargetIds: [],
      selectedCardKeys: [choiceCard.id]
    }
  }, choiceCard);
  assert.match(html, /data-manual-target-id="card"/u);
  assert.match(html, /data-manual-edit-key="title"/u);
  assert.match(html, /data-resource-target-id="main"/u);
  assert.doesNotMatch(html, /data-manual-option-index/u);
  assert.match(html, /data-action="save-manual-card-edit"/u);
});

test("edição manual de choice preserva os campos da alternativa dentro do resource", () => {
  const choiceCard = {
    id: "card-choice",
    position: 1,
    resource: "choice",
    kind: "exercise",
    exercise: "choice",
    title: "Escolha",
    question: "Qual alternativa?",
    selectionMode: "single",
    selectionCriterion: "correct",
    options: [{ id: "a", text: "Primeira" }, { id: "b", text: "Segunda" }],
    answerIds: ["a"],
    after: ""
  };
  const html = renderWorkbench({
    entityModes: { card: "edit" },
    cardAssistanceState: {
      repairScope: "resources",
      wholeCardSelected: false,
      resourceTargetIds: ["main"],
      selectedCardKeys: [choiceCard.id]
    },
    cardResourceTargets: [{
      targetId: "main",
      location: "body",
      resourceType: "choice",
      label: "Escolha"
    }]
  }, choiceCard);
  assert.match(html, /runtime-resource-selection-content/u);
  assert.match(html, /runtime-block runtime-choice-block/u);
  assert.match(html, /data-manual-edit-path="question"/u);
  assert.match(html, /data-manual-edit-path="options\[0\]\.text"/u);
  assert.match(html, /data-manual-edit-path="options\[1\]\.text"/u);
  assert.doesNotMatch(html, /runtime-resource-inline-editor|data-manual-correct-index/u);
  assert.doesNotMatch(html, /data-action="open-resource-observation"/u);
});

test("edição visual usa os caminhos canônicos do recurso principal e do fluxograma", () => {
  const paragraphHtml = renderCardRuntimeBlocks({
    id: "card-paragraph",
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: "Parágrafo",
    text: "Texto principal.",
    after: ""
  }, {
    resourceSelectionEnabled: true,
    resourceSelectionTargetIds: ["", "main"],
    manualEditingTargetId: "main"
  });
  assert.match(paragraphHtml, /data-manual-edit-path="text"/u);

  const flowHtml = renderCardRuntimeBlocks({
    id: "card-flow",
    position: 1,
    resource: "flow",
    kind: "theory",
    exercise: "none",
    title: "Fluxo",
    prompt: "Acompanhe.",
    structure: {
      id: "root",
      kind: "sequence",
      items: [
        { id: "start", kind: "start", text: "Início" },
        {
          id: "decision",
          kind: "if_then",
          condition: "x > 0",
          thenBranch: [{ id: "positive", kind: "output", text: "Positivo" }]
        },
        { id: "end", kind: "end", text: "Fim" }
      ]
    },
    after: ""
  }, {
    resourceSelectionEnabled: true,
    resourceSelectionTargetIds: ["", "main"],
    manualEditingTargetId: "main"
  });
  assert.match(flowHtml, /data-manual-edit-path="prompt"/u);
  assert.match(flowHtml, /data-manual-edit-path="structure\.items\[0\]\.text"/u);
  assert.match(flowHtml, /data-manual-edit-path="structure\.items\[1\]\.condition"/u);
  assert.match(flowHtml, /data-manual-edit-path="structure\.items\[1\]\.thenBranch\[0\]\.text"/u);
});

test("permissão sem autoria omite completamente os modos de edição", () => {
  const html = renderWorkbench({
    coursePermissions: {
      canAuthorContent: false,
      canEdit: false,
      canDelete: false
    }
  });
  assert.doesNotMatch(html, /toggle-card-edit-mode|runtime-card-authoring/u);
  assert.doesNotMatch(html, /Este curso não pode|somente leitura/u);
});
