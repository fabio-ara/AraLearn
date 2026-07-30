import test from "node:test";
import assert from "node:assert/strict";

import { compileAuthoringCardGaps } from "../../src/core/authoringGaps.js";
import { extractResourceGapAnswers } from "../../src/core/resourceGaps.js";
import { validateCard } from "../../src/domain/cards.js";
import { contractToRelationalRows } from "../../src/persistence/contractToRelationalRows.js";
import { relationalRowsToContract } from "../../src/persistence/relationalRowsToContract.js";
import { renderCardRuntimeBlocks } from "../../src/render/renderCardRuntime.js";
import {
  getAuthoringResourceContract,
  getCardResourceDefinition,
  listResourceIds
} from "../../src/resources/registry/index.js";

const systemMapCard = Object.freeze({
  id: "system-map-1",
  position: 1,
  resource: "system_map",
  kind: "theory",
  exercise: "none",
  title: "Arquitetura de pedidos",
  prompt: "Acompanhe o pedido do cliente até a persistência.",
  groups: Object.freeze([
    Object.freeze({
      id: "region",
      label: "Região sul",
      kind: "region",
      parentId: null
    }),
    Object.freeze({
      id: "application-zone",
      label: "Zona de aplicação",
      kind: "zone",
      parentId: "region"
    })
  ]),
  nodes: Object.freeze([
    Object.freeze({
      id: "client",
      label: "Cliente",
      kind: "client",
      groupId: null
    }),
    Object.freeze({
      id: "gateway",
      label: "Gateway",
      kind: "gateway",
      groupId: "application-zone"
    }),
    Object.freeze({
      id: "database",
      label: "Banco de pedidos",
      kind: "database",
      groupId: "application-zone"
    })
  ]),
  links: Object.freeze([
    Object.freeze({
      id: "request",
      from: "client",
      to: "gateway",
      label: "envia pedido",
      directed: true
    }),
    Object.freeze({
      id: "persist",
      from: "gateway",
      to: "database",
      label: "persiste",
      directed: true
    })
  ]),
  highlight: Object.freeze({
    groupIds: Object.freeze(["application-zone"]),
    nodeIds: Object.freeze(["gateway"]),
    linkIds: Object.freeze(["request"])
  }),
  after: ""
});

const reactionCard = Object.freeze({
  id: "reaction-1",
  position: 2,
  resource: "reaction",
  kind: "theory",
  exercise: "none",
  title: "Combustão do metano",
  prompt: "Interprete reagentes, produtos e condições.",
  reactionType: "forward",
  reactants: Object.freeze([
    Object.freeze({
      id: "methane",
      formula: "CH4",
      name: "metano",
      coefficient: 1,
      state: "g",
      charge: 0
    }),
    Object.freeze({
      id: "oxygen",
      formula: "O2",
      name: "oxigênio",
      coefficient: 2,
      state: "g",
      charge: 0
    })
  ]),
  products: Object.freeze([
    Object.freeze({
      id: "carbon-dioxide",
      formula: "CO2",
      name: "dióxido de carbono",
      coefficient: 1,
      state: "g",
      charge: 0
    }),
    Object.freeze({
      id: "water",
      formula: "H2O",
      name: "água",
      coefficient: 2,
      state: "g",
      charge: 0
    })
  ]),
  conditions: Object.freeze(["ignição"]),
  highlight: Object.freeze({
    speciesIds: Object.freeze(["methane", "oxygen"])
  }),
  after: ""
});

function clone(value) {
  return structuredClone(value);
}

function project(cards = [clone(systemMapCard), clone(reactionCard)]) {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{
      id: "course-specialized",
      title: "Representações especializadas",
      goal: "Interpretar sistemas e reações.",
      modules: [{
        id: "module-specialized",
        title: "Modelos",
        guide: {
          goal: "Ler representações semânticas.",
          include: [],
          exclude: [],
          notation: [],
          avoid: []
        },
        lessons: [{
          id: "lesson-specialized",
          title: "Sistemas e transformações",
          guide: {
            goal: "Relacionar entidades e transformações.",
            include: [],
            exclude: [],
            notation: [],
            avoid: []
          },
          topics: [],
          microsequences: [{
            id: "micro-specialized",
            title: "Leitura especializada",
            goal: "Interpretar duas representações complementares.",
            role: "explain",
            status: "generated",
            dependsOn: [],
            covers: [],
            checks: [],
            cards
          }]
        }]
      }]
    }]
  };
}

function asCompositeBlock(card, id) {
  const block = clone(card);
  delete block.position;
  delete block.resource;
  delete block.exercise;
  delete block.title;
  delete block.after;
  block.id = id;
  block.kind = card.resource;
  return block;
}

function validationMessages(result) {
  return (result.errors || [])
    .map((entry) => `${entry.path}: ${entry.message}`)
    .join("\n");
}

test("registro canônico expõe resources especializados e seus limites semânticos", () => {
  assert.ok(listResourceIds().includes("system_map"));
  assert.ok(listResourceIds().includes("reaction"));
  assert.deepEqual(
    getCardResourceDefinition("system_map").semanticLimits,
    {
      maxGroups: 8,
      maxGroupDepth: 4,
      maxNodes: 16,
      maxLinks: 24
    }
  );
  assert.deepEqual(
    getCardResourceDefinition("reaction").semanticLimits,
    {
      maxSpeciesPerSide: 8,
      maxConditions: 4
    }
  );
});

test("system_map e reaction válidos passam pelo contrato fechado", () => {
  for (const card of [systemMapCard, reactionCard]) {
    const result = validateCard(clone(card));
    assert.equal(result.ok, true, validationMessages(result));
  }
});

test("system_map rejeita referências ausentes, ciclos e limites excedidos", () => {
  const danglingGroup = clone(systemMapCard);
  danglingGroup.nodes[1].groupId = "missing-group";
  let result = validateCard(danglingGroup);
  assert.equal(result.ok, false);
  assert.match(validationMessages(result), /groupId referencia grupo inexistente/u);

  const danglingLink = clone(systemMapCard);
  danglingLink.links[0].to = "missing-node";
  result = validateCard(danglingLink);
  assert.equal(result.ok, false);
  assert.match(validationMessages(result), /to referencia componente inexistente/u);

  const cycle = clone(systemMapCard);
  cycle.groups[0].parentId = "application-zone";
  result = validateCard(cycle);
  assert.equal(result.ok, false);
  assert.match(validationMessages(result), /hierarquia de grupos contém ciclo/u);

  const limits = getCardResourceDefinition("system_map").semanticLimits;
  const tooManyGroups = clone(systemMapCard);
  while (tooManyGroups.groups.length <= limits.maxGroups) {
    const index = tooManyGroups.groups.length;
    tooManyGroups.groups.push({
      id: `extra-group-${index}`,
      label: `Grupo ${index}`,
      kind: "boundary",
      parentId: null
    });
  }
  result = validateCard(tooManyGroups);
  assert.equal(result.ok, false);
  assert.match(validationMessages(result), /no máximo 8 grupos/u);

  const tooDeep = clone(systemMapCard);
  tooDeep.groups = Array.from(
    { length: limits.maxGroupDepth + 1 },
    (_, index) => ({
      id: `depth-${index}`,
      label: `Nível ${index + 1}`,
      kind: "boundary",
      parentId: index === 0 ? null : `depth-${index - 1}`
    })
  );
  tooDeep.nodes[1].groupId = `depth-${limits.maxGroupDepth}`;
  tooDeep.nodes[2].groupId = `depth-${limits.maxGroupDepth}`;
  result = validateCard(tooDeep);
  assert.equal(result.ok, false);
  assert.match(validationMessages(result), /profundidade máxima de 4 grupos/u);
});

test("reaction rejeita espécies ambíguas e limites excedidos", () => {
  const duplicateId = clone(reactionCard);
  duplicateId.products[0].id = "methane";
  let result = validateCard(duplicateId);
  assert.equal(result.ok, false);
  assert.match(validationMessages(result), /id único em toda a reação/u);

  const invalidState = clone(reactionCard);
  invalidState.reactants[0].state = "plasma";
  result = validateCard(invalidState);
  assert.equal(result.ok, false);
  assert.match(validationMessages(result), /state deve ser s, l, g ou aq/u);

  const invalidCoefficient = clone(reactionCard);
  invalidCoefficient.reactants[0].coefficient = 0;
  result = validateCard(invalidCoefficient);
  assert.equal(result.ok, false);
  assert.match(validationMessages(result), /coefficient deve ser inteiro de 1 a 99/u);

  const limits = getCardResourceDefinition("reaction").semanticLimits;
  const tooManySpecies = clone(reactionCard);
  while (tooManySpecies.reactants.length <= limits.maxSpeciesPerSide) {
    const index = tooManySpecies.reactants.length;
    tooManySpecies.reactants.push({
      id: `reactant-${index}`,
      formula: `R${index}`,
      name: `reagente ${index}`,
      coefficient: 1,
      state: "aq",
      charge: 0
    });
  }
  result = validateCard(tooManySpecies);
  assert.equal(result.ok, false);
  assert.match(validationMessages(result), /no máximo 8 espécies/u);

  const tooManyConditions = clone(reactionCard);
  tooManyConditions.conditions = Array.from(
    { length: limits.maxConditions + 1 },
    (_, index) => `condição ${index + 1}`
  );
  result = validateCard(tooManyConditions);
  assert.equal(result.ok, false);
  assert.match(validationMessages(result), /no máximo 4 condições/u);
});

test("os três tipos de reação têm seta visual e descrição acessível próprias", () => {
  const expectations = {
    forward: { arrow: "→", label: "direta" },
    reversible: { arrow: "⇄", label: "reversível" },
    equilibrium: { arrow: "⇌", label: "em equilíbrio" }
  };

  Object.entries(expectations).forEach(([reactionType, expected]) => {
    const card = clone(reactionCard);
    card.reactionType = reactionType;
    const result = validateCard(card);
    assert.equal(result.ok, true, `${reactionType}: ${validationMessages(result)}`);
    const html = renderCardRuntimeBlocks(result.value);

    assert.match(html, new RegExp(`data-reaction-type="${reactionType}"`, "u"));
    assert.match(html, new RegExp(`runtime-reaction-arrow" aria-hidden="true">${expected.arrow}`, "u"));
    assert.match(html, new RegExp(`Equação de reação ${expected.label}\\.`), reactionType);
    assert.match(html, new RegExp(`runtime-reaction-arrow-label">${expected.label}<`, "u"));
  });
});

test("render especializado comunica agrupamentos, conexões, espécies e estados", () => {
  const systemHtml = renderCardRuntimeBlocks(clone(systemMapCard));
  assert.match(systemHtml, /class="runtime-block runtime-system-map"/u);
  assert.match(systemHtml, /aria-label="Mapa de sistema com 2 agrupamentos, 3 componentes e 2 conexões\./u);
  assert.match(systemHtml, /data-system-group-depth="1"/u);
  assert.match(systemHtml, /runtime-system-map-group kind-zone is-highlighted/u);
  assert.match(systemHtml, /runtime-system-map-node kind-gateway is-highlighted/u);
  assert.match(systemHtml, /runtime-system-map-link is-highlighted/u);

  const reactionHtml = renderCardRuntimeBlocks(clone(reactionCard));
  assert.match(reactionHtml, /class="runtime-block runtime-reaction"/u);
  assert.match(reactionHtml, /aria-label="Equação de reação direta\./u);
  assert.match(reactionHtml, /CH<sub>4<\/sub>/u);
  assert.match(reactionHtml, /O<sub>2<\/sub>/u);
  assert.match(reactionHtml, /runtime-reaction-state">\(g\)<\/span>/u);
  assert.match(reactionHtml, /runtime-reaction-species is-highlighted/u);
  assert.match(reactionHtml, /Condições: ignição\./u);
});

test("lacunas dos resources especializados não expõem resposta antes do feedback", () => {
  const systemAuthoring = clone(getAuthoringResourceContract("system_map").example);
  const reactionAuthoring = clone(getAuthoringResourceContract("reaction").example);
  reactionAuthoring.reactants[0].coefficient = 2;
  reactionAuthoring.reactants[0].name = "{gap:hydrogenName}";
  reactionAuthoring.gaps = [{
    id: "hydrogenName",
    response: "choice",
    answer: "dihidrogênio",
    distractors: ["hélio", "nitrogênio"]
  }];

  for (const [resource, authoring] of [
    ["system_map", systemAuthoring],
    ["reaction", reactionAuthoring]
  ]) {
    const compiled = compileAuthoringCardGaps(authoring);
    const result = validateCard(compiled);
    assert.equal(result.ok, true, `${resource}: ${validationMessages(result)}`);
    const [answer] = extractResourceGapAnswers(compiled);
    const prefix = `specialized-gap-${resource}`;
    const key = `${prefix}::1`;
    const initial = renderCardRuntimeBlocks(compiled, {
      blockKeyPrefix: prefix,
      textGapExerciseStateByBlockKey: {
        [key]: { values: [""], feedback: null }
      }
    });

    assert.match(initial, /runtime-text-gap-blank/u, resource);
    assert.doesNotMatch(initial, new RegExp(answer, "iu"), resource);
    assert.doesNotMatch(initial, /\[\[|\{gap:/u, resource);

    const evaluated = renderCardRuntimeBlocks(compiled, {
      blockKeyPrefix: prefix,
      textGapExerciseStateByBlockKey: {
        [key]: { values: [answer], feedback: "correct" }
      }
    });
    assert.match(evaluated, new RegExp(answer, "iu"), resource);
    assert.match(evaluated, /Correto\./u, resource);
  }
});

test("system_map e reaction funcionam como blocos independentes em composite", () => {
  const card = {
    id: "composite-specialized",
    position: 1,
    resource: "composite",
    kind: "theory",
    exercise: "none",
    title: "Sistema e transformação",
    blocks: [
      asCompositeBlock(systemMapCard, "system-map-block"),
      asCompositeBlock(reactionCard, "reaction-block")
    ],
    after: ""
  };
  const result = validateCard(card);
  assert.equal(result.ok, true, validationMessages(result));

  const html = renderCardRuntimeBlocks(result.value);
  assert.match(html, /runtime-system-map/u);
  assert.match(html, /runtime-reaction/u);
});

test("round-trip relacional preserva payload semântico especializado", () => {
  const document = project();
  const rows = contractToRelationalRows(document);
  const specializedRows = rows.blocks.filter((row) =>
    ["system_map", "reaction"].includes(row.blockType)
  );

  assert.equal(specializedRows.length, 2);
  assert.equal(specializedRows.every((row) => row.semanticPayload), true);
  assert.deepEqual(relationalRowsToContract(rows), document);
});

test("contrato especializado não aceita geometria nem estilo autoral", () => {
  const authoredPayload = JSON.stringify([systemMapCard, reactionCard]);
  assert.doesNotMatch(
    authoredPayload,
    /"(?:x|y|width|height|color|style|layout)"\s*:/u
  );

  const mapWithGeometry = clone(systemMapCard);
  mapWithGeometry.layout = "freeform";
  mapWithGeometry.nodes[0].x = 120;
  let result = validateCard(mapWithGeometry);
  assert.equal(result.ok, false);
  assert.match(validationMessages(result), /Campo fora do schema/u);

  const reactionWithStyle = clone(reactionCard);
  reactionWithStyle.style = { color: "red" };
  result = validateCard(reactionWithStyle);
  assert.equal(result.ok, false);
  assert.match(validationMessages(result), /Campo fora do schema/u);
});
