import test from "node:test";
import assert from "node:assert/strict";

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
      {
        id: "paragraph-1",
        kind: "paragraph",
        value: "P e Q precisam ser verdadeiras."
      },
      {
        id: "code-1",
        kind: "code",
        prompt: "Notação",
        language: "text",
        code: "P ∧ Q"
      }
    ],
    after: "",
    afterBlocks: [{
      id: "after-1",
      kind: "paragraph",
      value: "Compare com a disjunção."
    }]
  };
}

function projectFixture() {
  const card = compositeCard();
  return {
    project: {
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
    },
    card
  };
}

function renderWorkbench(editorSupport = {}, microsequenceMode = "play", cardOverride = null) {
  const fixture = projectFixture();
  const { project } = fixture;
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  if (cardOverride) microsequence.cards[0] = cardOverride;
  const card = microsequence.cards[0];
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
    microsequenceMode,
    editorSupport: {
      progress: { version: 1, lessons: {} },
      editMode: true,
      attachments: [],
      modelOptions: [{ value: "model-a", label: "Modelo A" }],
      selectedModel: "model-a",
      ...editorSupport
    }
  });
}

function assertOldBottomUpIsAbsent(html) {
  for (const action of [
    "select-assist-scope",
    "toggle-assist-block",
    "apply-assist",
    "apply-assist-feedback",
    "toggle-feedback-edit",
    "add-ref",
    "remove-ref",
    "apply-granular-preview",
    "discard-granular-preview"
  ]) {
    assert.doesNotMatch(html, new RegExp(`data-action="${action}"`, "u"), action);
  }
  for (const field of [
    "assist-action-intent",
    "assist-ref-picker",
    "assist-preferred-container",
    "granular-mutation-intent",
    "assist-feedback"
  ]) {
    assert.doesNotMatch(html, new RegExp(`data-field="${field}"`, "u"), field);
  }
  assert.doesNotMatch(html, /Materialização preferida|Retorno da intervenção|O que a IA deve fazer agora/u);
}

test("reparo renderiza card inteiro, todos os targets fornecidos e pedido configurável", () => {
  const html = renderWorkbench({
    cardAssistanceState: {
      operation: "repair",
      repairScope: "resources",
      resourceTargetIds: ["body:paragraph-1", "after:after-1"],
      placement: "after_current"
    },
    cardResourceTargets: [
      {
        targetId: "body:paragraph-1",
        location: "body",
        resourceType: "paragraph",
        label: "Parágrafo 1"
      },
      {
        targetId: "after:after-1",
        location: "after",
        resourceType: "paragraph",
        label: "Parágrafo 1 · apoio"
      }
    ],
    cardAssistanceRequestReady: true,
    promptText: "Corrija somente os exemplos selecionados.",
    attachments: [{ name: "referência.pdf" }],
    assistIngestionMessage: "referência.pdf: somente parte do texto pôde ser extraída."
  });

  assert.match(html, /class="runtime-card-authoring is-ai is-repairing"/u);
  assert.match(html, /data-action="select-card-editor-mode" data-editor-mode="manual"/u);
  assert.match(
    html,
    /data-action="select-card-editor-mode" data-editor-mode="ai" aria-pressed="true"/u
  );
  assert.match(html, /data-action="select-card-assistance-operation" data-operation="create"/u);
  assert.match(html, /data-action="select-card-repair-scope" data-repair-scope="card"/u);
  assert.match(
    html,
    /data-action="select-card-repair-scope" data-repair-scope="resources" aria-pressed="true"/u
  );
  for (const targetId of ["body:paragraph-1", "after:after-1"]) {
    assert.match(
      html,
      new RegExp(`data-action="toggle-card-assistance-resource" data-resource-target-id="${targetId}"`, "u"),
      targetId
    );
  }
  assert.match(
    html,
    /data-resource-target-id="body:paragraph-1"[^>]*aria-pressed="true"[^>]*aria-label="Retirar Parágrafo 1 do reparo"/u
  );
  assert.match(
    html,
    /data-resource-target-id="after:after-1"[^>]*data-resource-location="after"[^>]*aria-pressed="true"/u
  );
  assert.match(html, /data-field="assist-prompt"[^>]*>Corrija somente os exemplos selecionados\.<\/textarea>/u);
  assert.match(html, /referência\.pdf/u);
  assert.match(html, /data-field="assist-model"[^>]*>[\s\S]*Modelo A/u);
  assert.match(html, /data-action="open-assist-attachment-picker"/u);
  assert.match(html, /accept="[^"]*\.pdf[^"]*\.docx[^"]*"/u);
  assert.doesNotMatch(html, /(?:^|[,"'])\.(?:pptx|js|py)(?:[,"']|$)/u);
  assert.match(html, /somente parte do texto pôde ser extraída\./u);
  assert.match(html, /data-action="open-assist-config"/u);
  assert.match(html, /data-action="submit-card-assistance" title="Reparar card"/u);
  assert.doesNotMatch(html, /runtime-card-edit-select|contextual-card-editor/u);
  assertOldBottomUpIsAbsent(html);
});

test("criação oferece os quatro destinos e prévia mínima com nova microssequência", () => {
  const creationHtml = renderWorkbench({
    cardAssistanceState: {
      operation: "create",
      repairScope: "card",
      resourceTargetIds: [],
      placement: "new_microsequence"
    },
    cardAssistanceRequestReady: true,
    promptText: "Crie uma prática curta."
  });

  for (const placement of [
    "before_current",
    "after_current",
    "end_current",
    "new_microsequence"
  ]) {
    assert.match(
      creationHtml,
      new RegExp(`data-action="select-card-creation-placement" data-placement="${placement}"`, "u"),
      placement
    );
  }
  assert.match(
    creationHtml,
    /data-placement="new_microsequence" aria-pressed="true"/u
  );
  assert.match(creationHtml, /data-action="submit-card-assistance" title="Criar card"/u);
  assert.match(creationHtml, /class="runtime-card-authoring is-ai is-creating"/u);
  assert.match(
    creationHtml,
    /data-action="select-card-assistance-operation" data-operation="repair"[^>]*aria-label="Voltar à edição do card"/u
  );
  assert.doesNotMatch(creationHtml, /data-action="select-card-repair-scope"/u);
  assertOldBottomUpIsAbsent(creationHtml);

  const previewHtml = renderWorkbench({
    cardAssistanceState: {
      operation: "create",
      repairScope: "card",
      resourceTargetIds: [],
      placement: "new_microsequence"
    },
    cardAssistanceRequestReady: true,
    cardAssistancePreview: {
      contract: "aralearn.card-assistance-preview.v1",
      snapshot: {
        selection: {
          courseKey: "course-a",
          moduleKey: "module-a",
          lessonKey: "lesson-a",
          microsequenceKey: "micro-a",
          cardKey: "card-a"
        }
      },
      changeSet: {
        contract: "aralearn.card-assistance-change.v1",
        operation: "create",
        microsequence: {
          id: "micro-b",
          title: "Aplicação da conjunção"
        },
        card: {
          id: "card-b",
          position: 1,
          resource: "paragraph",
          kind: "theory",
          exercise: "none",
          title: "Exemplo novo",
          text: "A conjunção exige que as duas condições sejam satisfeitas.",
          after: "Retome a regra antes de avançar.",
          afterBlocks: [{
            id: "support-new",
            kind: "paragraph",
            value: "Apoio corrigido visível antes da aplicação."
          }]
        }
      }
    }
  });

  assert.match(previewHtml, /data-role="card-assistance-preview"/u);
  assert.match(previewHtml, /aria-live="polite"/u);
  assert.match(previewHtml, /data-action="show-card-assistance-preview-current"/u);
  assert.match(previewHtml, /data-action="show-card-assistance-preview-proposal"[^>]*aria-pressed="true"/u);
  assert.match(previewHtml, /Nova microssequência/u);
  assert.match(previewHtml, /Aplicação da conjunção/u);
  assert.match(previewHtml, /Exemplo novo/u);
  assert.match(previewHtml, /A conjunção exige que as duas condições sejam satisfeitas\./u);
  assert.match(previewHtml, /class="runtime-card-preview-support"/u);
  assert.match(previewHtml, /Retome a regra antes de avançar\./u);
  assert.match(previewHtml, /Apoio corrigido visível antes da aplicação\./u);
  assert.match(
    previewHtml,
    /class="runtime-card-rendered-content" data-card-preview-content="proposal" aria-disabled="true"/u
  );
  assert.match(previewHtml, /data-action="prev-card" disabled aria-disabled="true"/u);
  assert.match(previewHtml, /data-action="next-card" disabled aria-disabled="true"/u);
  assert.match(previewHtml, /data-action="toggle-card-edit-mode"[^>]*disabled aria-disabled="true"/u);
  assert.match(previewHtml, /data-action="apply-card-assistance-preview"/u);
  assert.match(previewHtml, /data-action="discard-card-assistance-preview"/u);
  assert.doesNotMatch(previewHtml, /card-assistance-preview-card|contextual-card-editor/u);
  assertOldBottomUpIsAbsent(previewHtml);
});

test("leitor de estudo não recebe seleção, assistência nem alça de card", () => {
  const html = renderWorkbench({
    editMode: false,
    cardAssistanceState: {
      operation: "repair",
      repairScope: "resources",
      resourceTargetIds: ["body:paragraph-1"],
      placement: "after_current"
    },
    cardResourceTargets: [{
      targetId: "body:paragraph-1",
      location: "body",
      resourceType: "paragraph",
      label: "Parágrafo 1"
    }]
  });

  assert.match(html, /P e Q precisam ser verdadeiras\./u);
  for (const action of [
    "select-card-assistance-operation",
    "select-card-editor-mode",
    "select-card-repair-scope",
    "toggle-card-assistance-resource",
    "select-card-creation-placement",
    "submit-card-assistance",
    "apply-card-assistance-preview",
    "discard-card-assistance-preview"
  ]) {
    assert.doesNotMatch(html, new RegExp(`data-action="${action}"`, "u"), action);
  }
  assert.doesNotMatch(html, /data-action="structure-drag-handle"/u);
  assert.doesNotMatch(html, /authoring-card-drag-handle|decorative-card-drag-handle|runtime-card-drag-handle/u);
});

test("modo contextual de edição não reintroduz alça dentro do card", () => {
  const authoringHtml = renderWorkbench({
    editMode: true
  }, "assist");
  const studyHtml = renderWorkbench({
    editMode: false
  }, "play");

  assert.match(authoringHtml, /data-action="toggle-card-edit-mode" title="Voltar à leitura"/u);
  assert.match(authoringHtml, /class="runtime-card-authoring is-ai is-repairing"/u);
  assert.doesNotMatch(authoringHtml, /runtime-card-edit-select|contextual-card-editor/u);
  assert.doesNotMatch(authoringHtml, /data-action="toggle-card-assistance-card"/u);
  assert.doesNotMatch(authoringHtml, /authoring-card-drag-handle|decorative-card-drag-handle|runtime-card-drag-handle/u);
  assert.doesNotMatch(studyHtml, /toggle-card-assistance-card|authoring-card-drag-handle/u);
});

test("microssequência vazia permite criar no fim ou em nova microssequência", () => {
  const { project } = projectFixture();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  microsequence.cards = [];
  const html = renderLessonScreen({
    project,
    view: "microsequence",
    selection: {
      courseKey: course.id,
      moduleKey: moduleValue.id,
      lessonKey: lesson.id,
      microsequenceKey: microsequence.id,
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
      editMode: true,
      attachments: [],
      modelOptions: [{ value: "model-a", label: "Modelo A" }],
      selectedModel: "model-a",
      cardAssistanceState: {
        operation: "create",
        repairScope: "card",
        resourceTargetIds: [],
        placement: "end_current"
      },
      cardAssistanceRequestReady: true
    }
  });

  assert.match(html, /class="runtime-card-authoring is-ai is-creating"/u);
  assert.doesNotMatch(html, /contextual-card-editor|runtime-card-edit-select/u);
  assert.match(html, /data-editor-mode="manual"[^>]*disabled/u);
  assert.match(html, /data-placement="before_current"[^>]*disabled/u);
  assert.match(html, /data-placement="after_current"[^>]*disabled/u);
  assert.match(html, /data-placement="end_current" aria-pressed="true"/u);
  assert.match(html, /data-placement="new_microsequence"/u);
  assert.match(html, /data-action="submit-card-assistance" title="Criar card"/u);
  assert.doesNotMatch(html, /data-action="toggle-card-edit-mode"/u);

  const proposedCard = {
    id: "card-created",
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: "Primeiro card proposto",
    text: "Conteúdo materializado na prévia.",
    after: ""
  };
  const previewHtml = renderLessonScreen({
    project,
    view: "microsequence",
    selection: {
      courseKey: course.id,
      moduleKey: moduleValue.id,
      lessonKey: lesson.id,
      microsequenceKey: microsequence.id,
      cardKey: "",
      cardIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    cards: [],
    microsequenceMode: "assist",
    editorSupport: {
      progress: { version: 1, lessons: {} },
      editMode: true,
      attachments: [],
      modelOptions: [{ value: "model-a", label: "Modelo A" }],
      selectedModel: "model-a",
      cardAssistanceState: {
        operation: "create",
        repairScope: "card",
        resourceTargetIds: [],
        placement: "end_current"
      },
      cardAssistancePreview: {
        contract: "aralearn.card-assistance-preview-batch.v1",
        selection: {
          courseKey: course.id,
          moduleKey: moduleValue.id,
          lessonKey: lesson.id,
          microsequenceKey: microsequence.id,
          cardKey: ""
        },
        items: [{
          selection: {
            courseKey: course.id,
            moduleKey: moduleValue.id,
            lessonKey: lesson.id,
            microsequenceKey: microsequence.id,
            cardKey: ""
          },
          changeSet: {
            contract: "aralearn.card-assistance-change.v1",
            operation: "create",
            card: proposedCard
          }
        }]
      },
      cardAssistancePreviewView: "proposal"
    }
  });
  assert.match(previewHtml, /Primeiro card proposto/u);
  assert.match(previewHtml, /Conteúdo materializado na prévia\./u);
  assert.doesNotMatch(previewHtml, /Sem cards ainda/u);
  assert.doesNotMatch(previewHtml, /data-action="toggle-card-edit-mode"/u);
});

test("edição manual gera prévia efêmera no card antes de aplicar", () => {
  const html = renderWorkbench({
    cardEditorMode: "manual",
    cardAssistanceState: {
      operation: "repair",
      repairScope: "resources",
      resourceTargetIds: ["body:paragraph-1"],
      selectedCardKeys: ["card-a"]
    },
    cardResourceTargets: [{
      targetId: "body:paragraph-1",
      location: "body",
      resourceType: "paragraph",
      label: "Parágrafo 1"
    }]
  }, "assist");

  assert.match(html, /class="runtime-card-authoring is-manual is-repairing"/u);
  assert.match(html, /data-action="preview-manual-card-edit"/u);
  assert.match(html, /data-card-authoring-focus="manual-first-field"/u);
  assert.doesNotMatch(html, /data-action="save-manual-card-edit"|data-field="assist-prompt"/u);
  assert.doesNotMatch(html, /contextual-card-editor/u);
});

test("alternativas da edição manual têm nomes acessíveis inequívocos", () => {
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
    options: [
      { id: "a", text: "Primeira" },
      { id: "b", text: "Segunda" }
    ],
    answerIds: ["a"],
    after: ""
  };
  const html = renderWorkbench({
    cardEditorMode: "manual",
    cardAssistanceState: {
      operation: "repair",
      repairScope: "card",
      resourceTargetIds: [],
      selectedCardKeys: [choiceCard.id]
    }
  }, "assist", choiceCard);

  assert.match(html, /aria-label="Alternativa 1 correta"/u);
  assert.match(html, /aria-label="Alternativa 2 correta"/u);
  assert.match(html, /aria-label="Texto da alternativa 1"/u);
  assert.match(html, /aria-label="Texto da alternativa 2"/u);
});
