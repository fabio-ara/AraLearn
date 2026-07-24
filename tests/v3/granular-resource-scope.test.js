import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildGranularInterventionScopeSnapshot,
  assertGranularInterventionResultScope
} from "../../src/assist/interventionScopeGuard.js";
import {
  COMPOSITE_BLOCK_TYPES,
  RESOURCE_TYPES,
  getCompositeBlockLabel,
  getResourceLabel
} from "../../src/domain/resources.js";
import { getContractCardKindLabel } from "../../src/contract/contractCard.js";
import { listCardResourceSummaries } from "../../src/generation/resources/cardResourceDefinitions.js";
import { buildGranularInterventionProviderRequest } from "../../src/generation/runtime/granularInterventionRuntime.js";
import {
  buildGranularTargetFromAssistScope,
  createGranularAssistScope,
  selectGranularAssistScope,
  toggleGranularAssistBlock
} from "../../src/ui/granularInterventionUiState.js";

const fixtureFiles = [
  new URL("../fixtures/course-catalog/framework-ia-generativa-seed-course.json", import.meta.url),
  new URL("../fixtures/course-catalog/teoria-dos-grafos-prova.json", import.meta.url),
  new URL("../fixtures/formulas-matematica-quimica.json", import.meta.url)
];

function collectCards(value, cards = []) {
  if (!value || typeof value !== "object") return cards;
  if (!Array.isArray(value) && typeof value.resource === "string" && value.id) {
    cards.push(value);
  }
  Object.values(value).forEach((entry) => collectCards(entry, cards));
  return cards;
}

async function cardsByResource() {
  const cards = [];
  for (const file of fixtureFiles) {
    collectCards(JSON.parse(await readFile(file, "utf8")), cards);
  }
  return new Map(
    RESOURCE_TYPES.map((resource) => [
      resource,
      structuredClone(cards.find((card) => card.resource === resource))
    ])
  );
}

function projectFor(card) {
  return {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [{
      id: "course-scope",
      title: "Curso",
      modules: [{
        id: "module-scope",
        title: "Módulo",
        lessons: [{
          id: "lesson-scope",
          title: "Lição",
          microsequences: [{
            id: "micro-scope",
            title: "Microssequência",
            status: "generated",
            cards: [card]
          }]
        }]
      }]
    }]
  };
}

function selectionFor(card) {
  return {
    courseKey: "course-scope",
    moduleKey: "module-scope",
    lessonKey: "lesson-scope",
    microsequenceKey: "micro-scope",
    cardKey: card.id
  };
}

test("todos os recursos canônicos usam rótulo natural e escopo de card estável", async () => {
  const cards = await cardsByResource();
  assert.deepEqual([...cards.keys()], RESOURCE_TYPES);
  assert.deepEqual(
    listCardResourceSummaries().map(({ id, label }) => ({ id, label })),
    RESOURCE_TYPES.map((id) => ({ id, label: getResourceLabel(id) }))
  );

  for (const resourceType of RESOURCE_TYPES) {
    const card = cards.get(resourceType);
    assert.ok(card, `fixture ausente para ${resourceType}`);
    assert.notEqual(getResourceLabel(resourceType), "Recurso");
    assert.equal(getContractCardKindLabel(card), getResourceLabel(resourceType));

    const project = projectFor(card);
    const selection = selectionFor(card);
    const target = buildGranularTargetFromAssistScope(
      selectGranularAssistScope(createGranularAssistScope(), card, "card"),
      card
    );
    const snapshot = buildGranularInterventionScopeSnapshot(project, selection, target);
    assert.equal(snapshot.target.level, "card");
    assert.equal(snapshot.target.cardKey, card.id);
    assert.equal(snapshot.target.resourceType, resourceType);

    const providerRequest = buildGranularInterventionProviderRequest({
      projectDocument: project,
      selection,
      scopeSnapshot: snapshot,
      userRequest: "Revise somente este card."
    });
    assert.equal(providerRequest.engineContext.target.resourceType, resourceType);
    assert.equal(providerRequest.engineContext.target.card.resource, resourceType);
    assert.equal(providerRequest.engineContext.target.card.id, card.id);

    const nextProject = structuredClone(project);
    nextProject.courses[0].modules[0].lessons[0].microsequences[0].cards[0].title =
      `${card.title} revisto`;
    const guarded = assertGranularInterventionResultScope({
      previousProjectDocument: project,
      nextProjectDocument: nextProject,
      selection,
      scopeSnapshot: snapshot
    });
    assert.equal(guarded.resourceType, resourceType);
    assert.deepEqual(guarded.blockIndexes, []);
  }
});

test("cada tipo de bloco composto tem rótulo, identidade e payload sem duplicação", () => {
  assert.deepEqual(
    COMPOSITE_BLOCK_TYPES,
    ["heading", ...RESOURCE_TYPES.filter((resource) => resource !== "composite")]
  );
  const card = {
    id: "card-composite-scope",
    position: 1,
    resource: "composite",
    kind: "theory",
    exercise: "none",
    title: "Recursos",
    blocks: COMPOSITE_BLOCK_TYPES.map((kind, index) => ({
      kind,
      value: `conteúdo-${index}`
    })),
    after: ""
  };
  const project = projectFor(card);
  const selection = selectionFor(card);

  COMPOSITE_BLOCK_TYPES.forEach((blockKind, blockIndex) => {
    assert.notEqual(getCompositeBlockLabel(blockKind), "Bloco");
    const uiTarget = buildGranularTargetFromAssistScope(
      toggleGranularAssistBlock(
        selectGranularAssistScope(createGranularAssistScope(), card, "blocks"),
        card,
        blockIndex
      ),
      card
    );
    const snapshot = buildGranularInterventionScopeSnapshot(project, selection, uiTarget);
    assert.deepEqual(snapshot.target.blocks, [{
      blockIndex,
      blockIdentity: `content:${blockIndex}`,
      blockKind
    }]);

    const request = buildGranularInterventionProviderRequest({
      projectDocument: project,
      selection,
      scopeSnapshot: snapshot,
      userRequest: "Altere somente o recurso selecionado."
    }).engineContext;
    assert.equal(request.target.resourceType, "composite");
    assert.equal(Object.hasOwn(request.target, "readOnlyCard"), false);
    assert.deepEqual(
      request.target.selectedBlocks.map((block) => [block.blockIndex, block.blockKind]),
      [[blockIndex, blockKind]]
    );
    assert.equal(
      request.target.readOnlyBlocks.some((block) => block.blockIndex === blockIndex),
      false
    );
    assert.equal(
      request.target.selectedBlocks.length + request.target.readOnlyBlocks.length,
      card.blocks.length
    );
  });
});

test("seleção de vários recursos permanece canônica e não alcança os demais", () => {
  const card = {
    id: "card-multiple-scope",
    position: 1,
    resource: "composite",
    kind: "theory",
    exercise: "none",
    title: "Seleção múltipla",
    blocks: [
      { kind: "paragraph", value: "Primeiro." },
      { kind: "code", prompt: "Código", language: "text", code: "segundo" },
      { kind: "formula", prompt: "Fórmula", notation: "mathematics", accessibleText: "x", expression: { type: "symbol", value: "x" } }
    ],
    after: ""
  };
  const project = projectFor(card);
  const selection = selectionFor(card);
  let scope = selectGranularAssistScope(createGranularAssistScope(), card, "blocks");
  scope = toggleGranularAssistBlock(scope, card, 2);
  scope = toggleGranularAssistBlock(scope, card, 0);
  const snapshot = buildGranularInterventionScopeSnapshot(
    project,
    selection,
    buildGranularTargetFromAssistScope(scope, card)
  );

  assert.deepEqual(
    snapshot.target.blocks.map(({ blockIndex, blockKind }) => ({ blockIndex, blockKind })),
    [
      { blockIndex: 0, blockKind: "paragraph" },
      { blockIndex: 2, blockKind: "formula" }
    ]
  );
  const request = buildGranularInterventionProviderRequest({
    projectDocument: project,
    selection,
    scopeSnapshot: snapshot,
    userRequest: "Ajuste os dois recursos."
  }).engineContext;
  assert.deepEqual(request.target.readOnlyBlocks.map((block) => block.blockIndex), [1]);
});
