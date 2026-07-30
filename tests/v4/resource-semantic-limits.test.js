import assert from "node:assert/strict";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import { validateCard } from "../../src/domain/cards.js";
import {
  compileAndValidateAuthoringCard
} from "../../src/generation/engine/cardAuthoringSchema.js";
import {
  getAuthoringResourceContract,
  getCardResourceDefinition
} from "../../src/resources/registry/index.js";

function clone(value) {
  return structuredClone(value);
}

function canonicalCard(resource) {
  return compileAndValidateAuthoringCard(
    clone(getAuthoringResourceContract(resource).example),
    `$.canonical.${resource}`
  );
}

function schemaCard(card) {
  const value = clone(card);
  delete value.id;
  return value;
}

function flowChain(depth) {
  if (depth <= 1) {
    return { id: "leaf", kind: "process", text: "Executar" };
  }
  return {
    id: `level-${depth}`,
    kind: "sequence",
    items: [flowChain(depth - 1)]
  };
}

function treeChain(length) {
  return Array.from({ length }, (_, index) => ({
    id: `node-${index}`,
    label: `Nó ${index}`,
    parentId: index ? `node-${index - 1}` : null
  }));
}

function graphVertices(length) {
  return Array.from({ length }, (_, index) => ({
    id: `v${index}`,
    label: `Vértice ${index}`
  }));
}

function graphEdges(length) {
  return Array.from({ length }, (_, index) => ({
    id: `e${index}`,
    from: "v0",
    to: "v1",
    label: `Relação ${index}`
  }));
}

function relationItems(length, prefix) {
  return Array.from({ length }, (_, index) => ({
    id: `${prefix}${index}`,
    label: `${prefix.toUpperCase()} ${index}`
  }));
}

function relations(length) {
  return Array.from({ length }, (_, index) => ({
    from: `l${index % 5}`,
    to: `r${Math.floor(index / 5)}`,
    label: `Relação ${index}`
  }));
}

function formulaDepth(depth) {
  let expression = { type: "identifier", value: "x" };
  for (let index = 1; index < depth; index += 1) {
    expression = {
      type: "fenced",
      open: "(",
      close: ")",
      content: expression
    };
  }
  return expression;
}

function points(length) {
  return Array.from({ length }, (_, index) => [`p${index}`, index]);
}

function items(length, prefix = "item") {
  return Array.from({ length }, (_, index) => ({
    id: `${prefix}-${index}`,
    label: `Item ${index}`
  }));
}

const LIMIT_CASES = [
  {
    name: "paragraph/maxCharacters",
    resource: "paragraph",
    mutate: (card) => { card.text = "a".repeat(1801); },
    message: /1800 caracteres/u
  },
  {
    name: "paragraph/maxParagraphs",
    resource: "paragraph",
    mutate: (card) => { card.text = ["a", "b", "c", "d", "e"].join("\n\n"); },
    message: /4 parágrafos/u
  },
  {
    name: "composite/minBlocks",
    resource: "composite",
    mutate: (card) => { card.blocks = [card.blocks[0]]; },
    message: /2 a 5 blocos/u
  },
  {
    name: "composite/maxBlocks",
    resource: "composite",
    mutate: (card) => {
      card.blocks = Array.from({ length: 6 }, (_, index) => ({
        id: `p${index}`,
        kind: "paragraph",
        value: `Apoio ${index}`
      }));
    },
    message: /2 a 5 blocos/u
  },
  {
    name: "code/maxLines",
    resource: "code",
    mutate: (card) => { card.code = Array(33).fill("pass").join("\n"); },
    message: /32 linhas/u
  },
  {
    name: "code/maxLineLength",
    resource: "code",
    mutate: (card) => { card.code = "x".repeat(121); },
    message: /120 caracteres/u
  },
  {
    name: "table/maxColumns",
    resource: "table",
    mutate: (card) => {
      card.columns = Array.from({ length: 8 }, (_, index) => `C${index}`);
      card.rows = [Array(8).fill("x")];
    },
    message: /7 colunas/u
  },
  {
    name: "table/maxRows",
    resource: "table",
    mutate: (card) => { card.rows = Array.from({ length: 17 }, () => ["x"]); card.columns = ["C"]; },
    message: /16 linhas/u
  },
  {
    name: "flow/maxNodes",
    resource: "flow",
    mutate: (card) => {
      card.structure = {
        id: "root",
        kind: "sequence",
        items: Array.from({ length: 24 }, (_, index) => ({
          id: `n${index}`,
          kind: "process",
          text: `Etapa ${index}`
        }))
      };
    },
    message: /24 nós/u
  },
  {
    name: "flow/maxDepth",
    resource: "flow",
    mutate: (card) => { card.structure = flowChain(7); },
    message: /6 níveis/u
  },
  {
    name: "tree/maxNodes",
    resource: "tree",
    mutate: (card) => { card.nodes = treeChain(33); },
    message: /32 nós/u
  },
  {
    name: "graph/maxVertices",
    resource: "graph",
    mutate: (card) => { card.vertices = graphVertices(17); card.edges = []; },
    message: /16 vértices/u
  },
  {
    name: "graph/maxEdges",
    resource: "graph",
    mutate: (card) => { card.vertices = graphVertices(2); card.edges = graphEdges(25); },
    message: /24 arestas/u
  },
  {
    name: "relation_map/maxItemsPerSet",
    resource: "relation_map",
    mutate: (card) => { card.leftSet = { label: "L", items: relationItems(9, "l") }; },
    message: /8 itens/u
  },
  {
    name: "relation_map/maxRelations",
    resource: "relation_map",
    mutate: (card) => {
      card.leftSet = { label: "L", items: relationItems(5, "l") };
      card.rightSet = { label: "R", items: relationItems(4, "r") };
      card.relations = relations(17);
    },
    message: /16 relações/u
  },
  {
    name: "matrix/maxRows",
    resource: "matrix",
    mutate: (card) => { card.values = Array.from({ length: 5 }, () => [1]); delete card.sequence; },
    message: /4 linhas/u
  },
  {
    name: "matrix/maxColumns",
    resource: "matrix",
    mutate: (card) => { card.values = [Array(6).fill(1)]; delete card.sequence; },
    message: /5 colunas/u
  },
  {
    name: "matrix/maxSequenceItems",
    resource: "matrix",
    mutate: (card) => {
      delete card.values;
      card.sequence = Array.from({ length: 6 }, (_, index) => ({
        name: `M${index}`,
        values: [[index]]
      }));
    },
    message: /5 itens/u
  },
  {
    name: "plane/maxObjects",
    resource: "plane",
    mutate: (card) => {
      delete card.sum;
      card.vectors = Array.from({ length: 11 }, (_, index) => [index, index + 1]);
    },
    message: /10 objetos/u
  },
  {
    name: "formula/maxDepth",
    resource: "formula",
    mutate: (card) => { card.expression = formulaDepth(11); },
    message: /10 níveis/u
  },
  {
    name: "formula/maxLeaves",
    resource: "formula",
    mutate: (card) => {
      card.expression = {
        type: "row",
        children: Array.from({ length: 65 }, (_, index) => ({
          type: "number",
          value: String(index)
        }))
      };
    },
    message: /64 folhas/u
  },
  {
    name: "chart/maxSeries",
    resource: "chart",
    mutate: (card) => {
      card.series = Array.from({ length: 7 }, (_, index) => ({
        id: `s${index}`,
        name: `Série ${index}`,
        values: [["p", index]]
      }));
    },
    message: /6 séries/u
  },
  {
    name: "chart/maxPointsPerSeries",
    resource: "chart",
    mutate: (card) => { card.series = [{ id: "s", name: "Série", values: points(25) }]; },
    message: /24 pontos/u
  },
  {
    name: "sequence/minItems",
    resource: "sequence",
    mutate: (card) => { card.items = items(1); delete card.highlight; },
    message: /2 a 12 itens/u
  },
  {
    name: "sequence/maxItems",
    resource: "sequence",
    mutate: (card) => { card.items = items(13); delete card.highlight; },
    message: /2 a 12 itens/u
  },
  {
    name: "annotated_text/maxSegments",
    resource: "annotated_text",
    mutate: (card) => {
      card.segments = Array.from({ length: 13 }, (_, index) => ({
        id: `s${index}`,
        text: `Trecho ${index}`
      }));
    },
    message: /12 segmentos/u
  },
  {
    name: "annotated_text/maxAnnotations",
    resource: "annotated_text",
    mutate: (card) => {
      card.segments = [{ id: "s", text: "Trecho" }];
      card.annotations = Array.from({ length: 13 }, (_, index) => ({
        id: `a${index}`,
        targetIds: ["s"],
        label: `Nota ${index}`,
        note: "Comentário"
      }));
    },
    message: /12 anotações/u
  },
  {
    name: "linguistic_example/maxUnits",
    resource: "linguistic_example",
    mutate: (card) => {
      card.units = Array.from({ length: 13 }, (_, index) => ({
        id: `u${index}`,
        form: `forma-${index}`,
        translation: `tradução-${index}`
      }));
    },
    message: /12 unidades/u
  }
];

const DOMAIN_ONLY_CASES = [
  {
    name: "tree/maxDepth",
    resource: "tree",
    mutate: (card) => { card.nodes = treeChain(8); },
    message: /7 níveis/u
  }
];

test("cardSchema rejeita payloads acima dos semanticLimits canônicos", async (t) => {
  for (const descriptor of LIMIT_CASES) {
    await t.test(descriptor.name, () => {
      const card = canonicalCard(descriptor.resource);
      descriptor.mutate(card);
      const validate = new Ajv2020({
        allErrors: true,
        strict: true,
        strictRequired: false,
        allowUnionTypes: true
      }).compile(getCardResourceDefinition(descriptor.resource).cardSchema);
      assert.equal(validate(schemaCard(card)), false, JSON.stringify(validate.errors));
      assert.ok(validate.errors?.length);
    });
  }
});

test("validateCard rejeita payloads acima dos mesmos semanticLimits", async (t) => {
  for (const descriptor of [...LIMIT_CASES, ...DOMAIN_ONLY_CASES]) {
    await t.test(descriptor.name, () => {
      const card = canonicalCard(descriptor.resource);
      descriptor.mutate(card);
      const result = validateCard(card, `$.${descriptor.name}`);
      assert.equal(result.ok, false);
      assert.match(
        result.errors.map((entry) => entry.message).join("\n"),
        descriptor.message
      );
    });
  }
});

test("os exemplos canônicos permanecem dentro dos limites no schema e no domínio", () => {
  for (const resource of new Set(LIMIT_CASES.map((entry) => entry.resource))) {
    const card = canonicalCard(resource);
    const validate = new Ajv2020({
      allErrors: true,
      strict: true,
      strictRequired: false,
      allowUnionTypes: true
    }).compile(getCardResourceDefinition(resource).cardSchema);
    assert.equal(validate(schemaCard(card)), true, `${resource}: ${JSON.stringify(validate.errors)}`);
    assert.equal(validateCard(card).ok, true, resource);
  }
});
