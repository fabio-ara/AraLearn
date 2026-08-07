import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  cardAssistanceSelectionIsReady,
  createCardAssistanceUiState,
  toggleCardAssistanceResource
} from "../../src/ui/cardAssistanceUiState.js";
import { listCardResourceTargets } from "../../src/assist/cardAssistanceScope.js";
import { listManualCardEditablePaths } from "../../src/ui/manualCardEdit.js";
import { renderCardRuntimeBlocks } from "../../src/render/renderCardRuntime.js";
import { listResourceIds } from "../../src/resources/registry/index.js";

const fixtureUrl = new URL("../fixtures/v4/project-resources-gallery.json", import.meta.url);

const VISIBLE_MANUAL_PATHS = Object.freeze({
  paragraph: Object.freeze({
    main: ["text"]
  }),
  choice: Object.freeze({
    main: ["question", "options[0].text", "options[1].text", "options[2].text"]
  }),
  composite: Object.freeze({
    "body:instruction": ["value"],
    "body:code": ["prompt", "code"]
  }),
  code: Object.freeze({
    main: ["prompt", "code"]
  }),
  table: Object.freeze({
    main: [
      "columns[0]",
      "columns[1]",
      "columns[2]",
      "rows[0][0]",
      "rows[0][1]",
      "rows[0][2]"
    ]
  }),
  flow: Object.freeze({
    main: [
      "structure.items[0].condition",
      "structure.items[0].thenBranch[0].text",
      "structure.items[0].branchLabels.yes",
      "structure.items[0].branchLabels.no"
    ]
  }),
  tree: Object.freeze({
    main: ["prompt", "nodes[0].label", "nodes[1].label"]
  }),
  graph: Object.freeze({
    main: ["prompt", "edges[0].weight", "vertices[0].label", "vertices[1].label"]
  }),
  relation_map: Object.freeze({
    main: [
      "prompt",
      "leftSet.label",
      "leftSet.items[0].label",
      "rightSet.label",
      "rightSet.items[0].label"
    ]
  }),
  matrix: Object.freeze({
    main: ["values[0][0]", "values[0][1]", "values[1][0]", "values[1][1]"]
  }),
  plane: Object.freeze({
    main: ["result"]
  }),
  formula: Object.freeze({
    main: [
      "prompt",
      "expression.children[0].value",
      "expression.children[1].value",
      "expression.children[2].value"
    ]
  }),
  chart: Object.freeze({
    main: ["prompt", "xAxis.label", "yAxis.label", "yAxis.unit", "series[0].name"]
  }),
  sequence: Object.freeze({
    main: ["prompt", "items[0].label", "items[1].label", "items[2].label"]
  }),
  annotated_text: Object.freeze({
    main: [
      "prompt",
      "segments[0].text",
      "annotations[0].label",
      "annotations[0].note"
    ]
  }),
  linguistic_example: Object.freeze({
    main: [
      "prompt",
      "units[0].form",
      "units[0].reading",
      "units[0].ipa",
      "units[0].gloss",
      "units[0].translation"
    ]
  }),
  system_map: Object.freeze({
    main: [
      "prompt",
      "groups[0].label",
      "groups[1].label",
      "nodes[0].label",
      "nodes[1].label",
      "nodes[2].label",
      "links[0].label",
      "links[1].label"
    ]
  }),
  reaction: Object.freeze({
    main: [
      "prompt",
      "reactants[0].formula",
      "reactants[0].name",
      "reactants[0].coefficient",
      "reactants[1].formula",
      "reactants[1].name",
      "products[0].formula",
      "products[0].name",
      "products[0].coefficient"
    ]
  })
});

function galleryCards() {
  const project = JSON.parse(fs.readFileSync(fixtureUrl, "utf8"));
  return project.courses[0].modules[0].lessons[0].microsequences[0].cards;
}

function targetIdsByRuntimeIndex(card, targetIds) {
  const result = [];
  if (card.resource === "composite") {
    card.blocks.forEach((block, index) => {
      const targetId = `body:${block.id}`;
      if (targetIds.includes(targetId)) result[index + 1] = targetId;
    });
  } else if (targetIds.includes("main")) {
    result[1] = "main";
  }
  return result;
}

function renderedManualPaths(card, targetId) {
  const html = renderCardRuntimeBlocks(card, {
    omitRepeatedHeading: true,
    resourceSelectionEnabled: true,
    resourceSelectionTargetIds: targetIdsByRuntimeIndex(card, [targetId]),
    manualEditingTargetId: targetId
  });
  return {
    html,
    paths: [...html.matchAll(/data-manual-edit-path="([^"]+)"/gu)]
      .map((match) => match[1])
  };
}

function selectionFixture(card) {
  return {
    courseKey: "course-gallery",
    moduleKey: "module-gallery",
    lessonKey: "lesson-gallery",
    microsequenceKey: "microsequence-gallery",
    cardKey: card.id
  };
}

test("matriz de autoria cobre exatamente os 18 resources canônicos", () => {
  assert.deepEqual(Object.keys(VISIBLE_MANUAL_PATHS), listResourceIds());
  assert.deepEqual(galleryCards().map((card) => card.resource), listResourceIds());
});

test("campos textuais visíveis dos 18 resources possuem path manual no próprio resource", () => {
  for (const card of galleryCards()) {
    const targets = VISIBLE_MANUAL_PATHS[card.resource];
    for (const [targetId, expectedPaths] of Object.entries(targets)) {
      const modelPaths = listManualCardEditablePaths(card, targetId).map(({ path }) => path);
      const rendered = renderedManualPaths(card, targetId);

      for (const path of expectedPaths) {
        assert.ok(
          modelPaths.includes(path),
          `${card.resource}:${targetId} não declarou o path manual visível ${path}`
        );
        assert.ok(
          rendered.paths.includes(path),
          `${card.resource}:${targetId} não renderizou o path manual visível ${path}`
        );
      }

      for (const path of rendered.paths) {
        assert.ok(
          modelPaths.includes(path),
          `${card.resource}:${targetId} renderizou o path manual não autorizado ${path}`
        );
      }
      assert.match(rendered.html, new RegExp(
        `data-manual-target-id="${targetId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}"`,
        "u"
      ));
    }
  }
});

test("assistência por IA torna selecionável o resource principal de cada um dos 18 tipos", () => {
  for (const card of galleryCards()) {
    const available = listCardResourceTargets(card);
    const selectedTargetIds = card.resource === "composite"
      ? card.blocks.map((block) => `body:${block.id}`)
      : ["main"];
    for (const targetId of selectedTargetIds) {
      assert.ok(
        available.some((target) => target.targetId === targetId),
        `${card.resource} não publicou o alvo IA ${targetId}`
      );
    }

    const selection = selectionFixture(card);
    const context = { selection, card };
    let state = createCardAssistanceUiState(selection);
    for (const targetId of selectedTargetIds) {
      state = toggleCardAssistanceResource(state, context, targetId);
    }
    assert.deepEqual(state.resourceTargetIds, selectedTargetIds, card.resource);
    assert.equal(cardAssistanceSelectionIsReady(state, context), true, card.resource);

    const html = renderCardRuntimeBlocks(card, {
      omitRepeatedHeading: true,
      resourceSelectionEnabled: true,
      resourceSelectionTargetIds: targetIdsByRuntimeIndex(card, selectedTargetIds),
      selectedResourceTargetIds: selectedTargetIds
    });
    for (const targetId of selectedTargetIds) {
      const escapedTarget = targetId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      assert.match(
        html,
        new RegExp(`data-resource-target-id="${escapedTarget}"[^>]*aria-pressed="true"`, "u"),
        `${card.resource}:${targetId}`
      );
    }
  }
});
