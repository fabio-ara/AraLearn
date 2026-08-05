import assert from "node:assert/strict";

import {
  applyCardAssistanceChangeSet,
  buildCardAssistanceScopeSnapshot,
  listCardMainResourceFieldNames,
  listCardResourceTargets
} from "../src/assist/cardAssistanceScope.js";
import {
  generateCardAssistanceChangeSet
} from "../src/generation/runtime/cardAssistanceRuntime.js";
import { contractToRelationalRows } from "../src/persistence/contractToRelationalRows.js";
import { relationalRowsToContract } from "../src/persistence/relationalRowsToContract.js";
import {
  assertProviderStrictValue,
  buildHighReachValidationCases,
  buildSpecializedValidationCases,
  CHART_VARIANTS,
  HIGH_REACH_RESOURCES,
  REACTION_TYPES,
  SPECIALIZED_RESOURCES,
  SYSTEM_MAP_GROUP_KINDS,
  SEQUENCE_VARIANTS
} from "./runResourceCorpusValidation.js";

const ATOMIC_REPAIR_RESOURCES = Object.freeze([
  ...HIGH_REACH_RESOURCES,
  ...SPECIALIZED_RESOURCES
]);

function clone(value) {
  return structuredClone(value);
}

function projectFixture(card) {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{
      id: "course-a",
      title: "Lógica",
      goal: "Compreender representações.",
      modules: [{
        id: "module-a",
        title: "Representações",
        guide: {
          goal: "Compreender representações.",
          include: ["representação"],
          exclude: [],
          notation: [],
          avoid: []
        },
        lessons: [{
          id: "lesson-a",
          title: "Leitura de representações",
          guide: {
            goal: "Interpretar uma representação.",
            include: ["interpretação"],
            exclude: [],
            notation: [],
            avoid: []
          },
          topics: [],
          microsequences: [{
            id: "micro-a",
            title: "Regra central",
            goal: "Interpretar uma representação de modo preciso.",
            role: "explain",
            status: "generated",
            dependsOn: [],
            covers: ["representação"],
            checks: ["reconhecer a informação central"],
            cards: [clone(card)]
          }]
        }]
      }]
    }]
  };
}

function selectionFor(cardKey) {
  return {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-a",
    cardKey
  };
}

function selectedCard(projectDocument) {
  return projectDocument.courses[0].modules[0].lessons[0]
    .microsequences[0].cards[0];
}

function blockFromCard(card, blockId) {
  const block = clone(card);
  const resource = block.resource;
  [
    "id",
    "position",
    "resource",
    "kind",
    "exercise",
    "title",
    "after",
    "afterBlocks",
    "sources",
    "topics",
    "gaps"
  ].forEach((fieldName) => {
    delete block[fieldName];
  });
  return {
    id: blockId,
    kind: resource,
    ...block
  };
}

function cardForLocation(coverageCase, location) {
  const source = {
    ...clone(coverageCase.card),
    id: `card-${location}-${coverageCase.id}`,
    position: 1
  };
  if (location === "main") return source;
  const block = blockFromCard(source, `block-${coverageCase.id}`);
  if (location === "body") {
    return {
      id: source.id,
      position: 1,
      resource: "composite",
      kind: "theory",
      exercise: "none",
      title: `Composição com ${coverageCase.resource}`,
      blocks: [
        block,
        {
          id: `context-${coverageCase.id}`,
          kind: "paragraph",
          value: "Contexto complementar preservado durante o reparo."
        }
      ],
      after: ""
    };
  }
  return {
    id: source.id,
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: `Card com apoio ${coverageCase.resource}`,
    text: "O recurso de apoio complementa este conteúdo.",
    after: "",
    afterBlocks: [block]
  };
}

function targetFor(card, location) {
  const targets = listCardResourceTargets(card);
  const target = targets.find((item) => item.location === location);
  assert.ok(target, `alvo ${location} ausente em ${card.id}`);
  return target;
}

function valueForTarget(card, target) {
  if (target.location === "main") {
    return Object.fromEntries(
      listCardMainResourceFieldNames(card)
        .filter((fieldName) => Object.hasOwn(card, fieldName))
        .map((fieldName) => [fieldName, clone(card[fieldName])])
    );
  }
  const collection = target.location === "body" ? card.blocks : card.afterBlocks;
  return clone(collection.find((block) => block.id === target.blockId));
}

function maskedCard(card, target) {
  const masked = clone(card);
  if (target.location === "main") {
    listCardMainResourceFieldNames(masked).forEach((fieldName) => {
      delete masked[fieldName];
    });
    return masked;
  }
  const collectionName = target.location === "body" ? "blocks" : "afterBlocks";
  masked[collectionName] = masked[collectionName].map((block) =>
    block.id === target.blockId
      ? { id: block.id, kind: block.kind }
      : block
  );
  return masked;
}

function persistedRoundTrip(projectDocument) {
  const rows = contractToRelationalRows(projectDocument);
  return relationalRowsToContract(rows);
}

async function runRepairScenario(descriptor, phases) {
  const card = cardForLocation(descriptor.coverageCase, descriptor.location);
  const projectDocument = projectFixture(card);
  const untouchedProject = clone(projectDocument);
  const selection = selectionFor(card.id);
  const target = targetFor(card, descriptor.location);
  const revisedPrompt = `${valueForTarget(card, target).prompt} Revisão atômica confirmada.`;
  let strictChecks = 0;

  const provider = {
    async generateStructured(request) {
      phases.push(request.phase);
      assert.equal(request.phase, "card_assistance_resource_repair");
      assert.equal(request.engineContext.writableTargets.length, 1);
      const writableTarget = request.engineContext.writableTargets[0];
      assert.equal(writableTarget.targetId, target.targetId);
      const replacementValue = {
        ...clone(writableTarget.value),
        prompt: revisedPrompt
      };
      const response = {
        replacements: [{
          targetId: writableTarget.targetId,
          value: replacementValue,
          gaps: []
        }]
      };
      assertProviderStrictValue(
        request.schema,
        response,
        `${descriptor.coverageCase.id}:${descriptor.location}`
      );
      strictChecks += 1;
      return { value: response };
    }
  };

  const generated = await generateCardAssistanceChangeSet({
    projectDocument,
    selection,
    request: {
      operation: "repair",
      repairScope: "resources",
      resourceTargetIds: [target.targetId],
      promptText: "Torne o recurso mais preciso sem alterar o restante do card."
    },
    provider,
    modelId: "fake:strict-local"
  });
  assert.deepEqual(projectDocument, untouchedProject, "a geração não pode mutar o projeto");
  assert.equal(
    valueForTarget(generated.changeSet.card, target).prompt,
    revisedPrompt
  );
  assert.deepEqual(
    maskedCard(generated.changeSet.card, target),
    maskedCard(card, target),
    "o reparo alcançou conteúdo fora do resource selecionado"
  );

  const applied = await applyCardAssistanceChangeSet({
    projectDocument,
    selection,
    snapshot: generated.snapshot,
    changeSet: generated.changeSet
  });
  const appliedCard = selectedCard(applied.projectDocument);
  assert.deepEqual(appliedCard, generated.changeSet.card);
  assert.equal(valueForTarget(appliedCard, target).prompt, revisedPrompt);
  assert.deepEqual(
    persistedRoundTrip(applied.projectDocument),
    applied.projectDocument,
    "o reparo não sobreviveu ao round-trip relacional"
  );
  const undoSnapshot = await buildCardAssistanceScopeSnapshot(
    applied.projectDocument,
    selection,
    {
      operation: "repair",
      repairScope: "resources",
      resourceTargetIds: [target.targetId]
    }
  );
  const undone = await applyCardAssistanceChangeSet({
    projectDocument: applied.projectDocument,
    selection,
    snapshot: undoSnapshot,
    changeSet: {
      contract: "aralearn.card-assistance-change.v1",
      operation: "repair",
      card
    }
  });
  assert.deepEqual(undone.projectDocument, projectDocument, "desfazer não restaurou o projeto");
  assert.deepEqual(
    persistedRoundTrip(undone.projectDocument),
    projectDocument,
    "o estado desfeito não sobreviveu ao round-trip relacional"
  );

  return {
    id: `${descriptor.coverageCase.id}:${descriptor.location}`,
    resource: descriptor.coverageCase.resource,
    location: descriptor.location,
    ...(descriptor.coverageCase.variant
      ? { variant: descriptor.coverageCase.variant }
      : {}),
    ...(descriptor.coverageCase.writingMode
      ? { writingMode: descriptor.coverageCase.writingMode }
      : {}),
    ...(descriptor.coverageCase.textDirection
      ? { textDirection: descriptor.coverageCase.textDirection }
      : {}),
    ...(descriptor.coverageCase.groupKind
      ? { groupKind: descriptor.coverageCase.groupKind }
      : {}),
    ...(descriptor.coverageCase.reactionType
      ? { reactionType: descriptor.coverageCase.reactionType }
      : {}),
    strictChecks,
    generated: true,
    directApplied: true,
    persisted: true,
    undone: true
  };
}

function repairDescriptors() {
  const cases = [
    ...buildHighReachValidationCases(),
    ...buildSpecializedValidationCases()
  ];
  const baseCases = new Map([
    ["chart", cases.find((item) => item.resource === "chart" && item.variant === "line")],
    ["sequence", cases.find((item) =>
      item.resource === "sequence" && item.variant === "cycle")],
    ["annotated_text", cases.find((item) => item.resource === "annotated_text")],
    ["linguistic_example", cases.find((item) =>
      item.resource === "linguistic_example" &&
      item.writingMode === "horizontal" &&
      item.textDirection === "ltr")],
    ["system_map", cases.find((item) =>
      item.resource === "system_map" && item.groupKind === "region")],
    ["reaction", cases.find((item) =>
      item.resource === "reaction" && item.reactionType === "forward")]
  ]);
  const descriptors = ATOMIC_REPAIR_RESOURCES.flatMap((resource) =>
    ["main", "body", "after"].map((location) => ({
      coverageCase: baseCases.get(resource),
      location
    }))
  );
  const known = new Set(
    descriptors.map((descriptor) =>
      `${descriptor.coverageCase.id}:${descriptor.location}`)
  );
  cases.forEach((coverageCase) => {
    const key = `${coverageCase.id}:main`;
    if (!known.has(key)) {
      descriptors.push({ coverageCase, location: "main" });
      known.add(key);
    }
  });
  return descriptors;
}

function uniqueValues(results, fieldName, predicate = () => true) {
  return [...new Set(
    results.filter(predicate).map((result) => result[fieldName]).filter(Boolean)
  )];
}

export async function main() {
  const phases = [];
  const repairResults = [];
  for (const descriptor of repairDescriptors()) {
    repairResults.push(await runRepairScenario(descriptor, phases));
  }
  const strictChecks = repairResults
    .reduce((total, result) => total + result.strictChecks, 0);

  const report = {
    contract: "aralearn.card-assistance-harness.v3",
    ok: true,
    calls: {
      total: phases.length,
      phases: Object.fromEntries(
        [...new Set(phases)].map((phase) => [
          phase,
          phases.filter((item) => item === phase).length
        ])
      ),
      network: 0
    },
    strictProviderChecks: strictChecks,
    repair: {
      scenarios: repairResults.length,
      resources: uniqueValues(repairResults, "resource"),
      targetLocationsByResource: Object.fromEntries(
        ATOMIC_REPAIR_RESOURCES.map((resource) => [
          resource,
          uniqueValues(
            repairResults,
            "location",
            (result) => result.resource === resource
          )
        ])
      ),
      chartVariants: uniqueValues(
        repairResults,
        "variant",
        (result) => result.resource === "chart" && result.location === "main"
      ),
      sequenceVariants: uniqueValues(
        repairResults,
        "variant",
        (result) => result.resource === "sequence" && result.location === "main"
      ),
      linguisticWritingModes: uniqueValues(
        repairResults,
        "writingMode",
        (result) =>
          result.resource === "linguistic_example" &&
          result.location === "main"
      ),
      linguisticTextDirections: uniqueValues(
        repairResults,
        "textDirection",
        (result) =>
          result.resource === "linguistic_example" &&
          result.location === "main"
      ),
      systemMapGroupKinds: uniqueValues(
        repairResults,
        "groupKind",
        (result) =>
          result.resource === "system_map" &&
          result.location === "main"
      ),
      reactionTypes: uniqueValues(
        repairResults,
        "reactionType",
        (result) =>
          result.resource === "reaction" &&
          result.location === "main"
      ),
      generated: repairResults.filter((result) => result.generated).length,
      directApplied: repairResults.filter((result) => result.directApplied).length,
      persisted: repairResults.filter((result) => result.persisted).length,
      undone: repairResults.filter((result) => result.undone).length
    },
    expected: {
      resources: [...ATOMIC_REPAIR_RESOURCES],
      targetLocations: ["main", "body", "after"],
      chartVariants: [...CHART_VARIANTS],
      sequenceVariants: [...SEQUENCE_VARIANTS],
      linguisticWritingModes: ["horizontal", "vertical"],
      linguisticTextDirections: ["auto", "ltr", "rtl"],
      systemMapGroupKinds: [...SYSTEM_MAP_GROUP_KINDS],
      reactionTypes: [...REACTION_TYPES]
    }
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
