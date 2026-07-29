import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGranularTargetFromAssistScope,
  createGranularAssistScope,
  granularAssistScopeIsReady,
  granularPreviewMatchesSelection,
  reconcileGranularAssistScope,
  selectGranularMutationIntent,
  selectGranularAssistScope,
  toggleGranularAssistBlock
} from "../../src/ui/granularInterventionUiState.js";
import { buildGranularInterventionScopeSnapshot } from "../../src/assist/interventionScopeGuard.js";
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
      { id: "code-1", kind: "code", prompt: "Notação", language: "text", code: "P ∧ Q" },
      { id: "paragraph-2", kind: "paragraph", value: "Somente V e V produz V." }
    ],
    after: ""
  };
}

function projectFixture(card = compositeCard()) {
  return {
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
}

const selection = {
  courseKey: "course-a",
  moduleKey: "module-a",
  lessonKey: "lesson-a",
  microsequenceKey: "micro-a",
  cardKey: "card-a",
  cardIndex: 0
};

test("estado de interface preserva a geração integral e monta destinos granulares explícitos", () => {
  const card = compositeCard();
  const initial = reconcileGranularAssistScope(createGranularAssistScope(), card);
  assert.equal(initial.mode, "microsequence");
  assert.equal(buildGranularTargetFromAssistScope(initial, card), null);
  assert.equal(granularAssistScopeIsReady(initial, card), true);

  const wholeCard = selectGranularAssistScope(initial, card, "card");
  assert.deepEqual(buildGranularTargetFromAssistScope(wholeCard, card), {
    level: "card",
    cardKey: "card-a",
    intent: "rewrite_content"
  });

  let blocks = selectGranularAssistScope(wholeCard, card, "blocks");
  assert.equal(granularAssistScopeIsReady(blocks, card), false);
  blocks = toggleGranularAssistBlock(blocks, card, 2);
  blocks = toggleGranularAssistBlock(blocks, card, 0);
  assert.deepEqual(buildGranularTargetFromAssistScope(blocks, card), {
    level: "blocks",
    cardKey: "card-a",
    blockIds: ["paragraph-1", "paragraph-2"],
    intent: "rewrite_content"
  });
  blocks = toggleGranularAssistBlock(blocks, card, 2);
  assert.deepEqual(blocks.blockIds, ["paragraph-1"]);
  assert.equal(
    selectGranularMutationIntent(blocks, card, "change_resource").intent,
    "change_resource"
  );
});

test("mudança de card limpa a seleção anterior e cards simples não oferecem blocos isolados", () => {
  const first = compositeCard();
  const selected = toggleGranularAssistBlock(
    selectGranularAssistScope(createGranularAssistScope(), first, "blocks"),
    first,
    1
  );
  const simple = {
    id: "card-b",
    resource: "paragraph",
    text: "Outro card."
  };
  const reconciled = reconcileGranularAssistScope(selected, simple);
  assert.deepEqual(reconciled, {
    mode: "microsequence",
    cardKey: "card-b",
    blockIds: [],
    intent: "rewrite_content"
  });
  assert.equal(selectGranularAssistScope(reconciled, simple, "blocks").mode, "microsequence");
});

test("prévia pertence somente ao card e ao caminho que originaram a chamada", () => {
  const project = projectFixture();
  const scopeSnapshot = buildGranularInterventionScopeSnapshot(project, selection, {
    level: "card",
    cardKey: "card-a"
  });
  const preview = { projectDocument: project, scopeSnapshot };
  assert.equal(granularPreviewMatchesSelection(preview, selection), true);
  assert.equal(granularPreviewMatchesSelection(preview, { ...selection, cardKey: "card-b" }), false);
  assert.equal(granularPreviewMatchesSelection(preview, { ...selection, lessonKey: "lesson-b" }), false);
});

test("painel de edição apresenta controles iconográficos e exige aplicar ou descartar a prévia", () => {
  const project = projectFixture();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const nextProject = structuredClone(project);
  nextProject.courses[0].modules[0].lessons[0].microsequences[0].cards[0]
    .blocks[0].value = "P e Q devem ser verdadeiras ao mesmo tempo.";
  const scopeSnapshot = buildGranularInterventionScopeSnapshot(project, selection, {
    level: "blocks",
    cardKey: "card-a",
    blockIds: ["paragraph-1"]
  });
  const html = renderLessonScreen({
    project,
    view: "microsequence",
    selection,
    course,
    moduleValue,
    lesson,
    microsequence,
    cards: microsequence.cards,
    microsequenceMode: "play",
    editorSupport: {
      progress: { version: 1, lessons: {} },
      refs: [],
      selectedRefIds: [],
      activeWorkbenchPane: "edit",
      interventionTargetMode: "current",
      operationMode: "repair",
      assistActionOptions: [],
      attachments: [],
      modelOptions: [],
      granularScope: {
        mode: "blocks",
        cardKey: "card-a",
        blockIds: ["paragraph-1"],
        intent: "rewrite_content"
      },
      granularPreview: {
        projectDocument: nextProject,
        scopeSnapshot,
        stale: false,
        errorMessage: ""
      }
    }
  });

  assert.match(html, /data-action="select-assist-scope" data-scope-mode="microsequence"/u);
  assert.match(html, /data-action="select-assist-scope" data-scope-mode="card"/u);
  assert.match(html, /data-action="select-assist-scope" data-scope-mode="blocks"/u);
  assert.match(html, /title="Card atual: Composto"/u);
  assert.match(html, /title="Recursos do card"/u);
  assert.match(html, /title="Parágrafo 1"/u);
  assert.match(
    html,
    /data-action="toggle-assist-block"[^>]*data-block-id="paragraph-1"[^>]*aria-pressed="true"/u
  );
  assert.match(html, /data-field="granular-mutation-intent"/u);
  assert.match(html, /data-role="granular-preview"/u);
  assert.match(html, /data-action="apply-granular-preview" title="Aplicar alteração"/u);
  assert.match(html, /data-action="discard-granular-preview" title="Descartar prévia"/u);
  assert.match(html, /P e Q devem ser verdadeiras ao mesmo tempo/u);
  assert.doesNotMatch(html, /Aplicar alteração<\/button>/u);
});
