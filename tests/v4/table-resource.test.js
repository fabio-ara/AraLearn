import assert from "node:assert/strict";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import { getAuthoringResourceContract } from "../../src/core/authoringResourceContract.js";
import { validateCard, normalizeGeneratedCard } from "../../src/domain/cards.js";
import { buildExactAuthoringBlockSchema } from "../../src/generation/engine/cardAuthoringSchema.js";
import { renderRuntimeBlockList } from "../../src/render/renderCardRuntime.js";

function tableCard(overrides = {}) {
  return {
    id: "table-contract",
    position: 1,
    resource: "table",
    kind: "theory",
    exercise: "none",
    title: "Tabela contratual",
    columns: ["Tópico", "Síntese"],
    rows: [["Identidade", "Princípio do menor privilégio"]],
    after: "",
    ...overrides
  };
}

test("table aceita somente cabeçalhos e células textuais, sem coerção silenciosa", () => {
  const cases = [
    {
      value: tableCard({ columns: [["Tópico A", "Tópico B"]], rows: [["Síntese"]] }),
      path: "$.card.columns[0]"
    },
    {
      value: tableCard({ columns: ["Tópico"], rows: [[[["Linha A", "Linha B"]]]] }),
      path: "$.card.rows[0][0]"
    },
    {
      value: tableCard({ columns: ["Tópico"], rows: [[{ label: "Linha A" }]] }),
      path: "$.card.rows[0][0]"
    }
  ];

  cases.forEach(({ value, path }) => {
    const result = validateCard(value);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.path === path));
    assert.throws(
      () => normalizeGeneratedCard(value),
      (error) => error instanceof Error && error.message.includes(path)
    );
  });
});

test("table conserva células textuais vazias sem inventar conteúdo", () => {
  const result = validateCard(tableCard({ rows: [["Identidade", ""]] }));

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.rows, [["Identidade", ""]]);
});

test("bloco table de composite aplica o mesmo contrato textual", () => {
  const value = {
    id: "composite-table-contract",
    position: 1,
    resource: "composite",
    kind: "theory",
    exercise: "none",
    title: "Tabela composta",
    blocks: [
      { id: "intro", kind: "paragraph", value: "Compare os conceitos." },
      {
        id: "comparison",
        kind: "table",
        columns: ["Conceito"],
        rows: [[{ label: "Autenticação" }]]
      }
    ],
    after: ""
  };
  const result = validateCard(value);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) =>
    error.path === "$.card.blocks[1].rows[0][0]"
  ));
  assert.equal(
    buildExactAuthoringBlockSchema("table").properties.rows.items.items.type,
    "string"
  );
  assert.equal(
    getAuthoringResourceContract("composite")
      .authoringSchema.properties.blocks.items.properties.rows.items.items.type,
    "string"
  );
});

test("schema autoral genérico exige columns e rows somente no bloco table", () => {
  const validate = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true
  }).compile(getAuthoringResourceContract("composite").authoringSchema);
  const card = {
    id: "composite-table-authoring-schema",
    position: 1,
    resource: "composite",
    kind: "theory",
    exercise: "none",
    title: "Tabela composta",
    blocks: [
      { id: "intro", kind: "paragraph", value: "Introdução." },
      {
        id: "comparison",
        kind: "table",
        columns: ["Conceito"],
        rows: [["Autenticação"]]
      }
    ],
    after: "Compare os conceitos."
  };

  assert.equal(validate(card), true, JSON.stringify(validate.errors));

  for (const missingProperty of ["columns", "rows"]) {
    const incomplete = structuredClone(card);
    delete incomplete.blocks[1][missingProperty];
    assert.equal(validate(incomplete), false, missingProperty);
    assert.ok(validate.errors.some((error) =>
      error.instancePath === "/blocks/1" &&
      error.keyword === "required" &&
      error.params.missingProperty === missingProperty
    ), JSON.stringify(validate.errors));
  }

  const paragraph = structuredClone(card);
  paragraph.blocks = [
    { id: "intro", kind: "paragraph", value: "Introdução." },
    { id: "summary", kind: "paragraph", value: "Síntese." }
  ];
  assert.equal(validate(paragraph), true, JSON.stringify(validate.errors));
});

test("topics permanece metadado e o contrato indica onde pôr conteúdo visível", () => {
  const contract = getAuthoringResourceContract("table");
  const html = renderRuntimeBlockList([{
    kind: "table",
    columns: ["Tópico", "Síntese"],
    rows: [["Visível", "Conteúdo da célula"]],
    topics: ["Metadado invisível"]
  }]);

  assert.ok(contract.shape.rules.some((rule) =>
    /topics.+não aparece.+columns e rows/iu.test(rule)
  ));
  assert.match(html, />Visível</u);
  assert.match(html, />Conteúdo da célula</u);
  assert.doesNotMatch(html, /Metadado invisível/u);
});

test("table renderiza tópicos e quebras de linha dentro da célula sem fundir linhas", () => {
  const html = renderRuntimeBlockList([{
    kind: "table",
    columns: ["Camada", "Responsabilidades"],
    rows: [[
      "Aplicação\nServiço",
      "- atender usuários\n- validar entrada"
    ]]
  }]);

  assert.match(html, /Aplicação<br>Serviço/u);
  assert.match(
    html,
    /<ul class="runtime-markdown-list"[^>]*><li[^>]*>atender usuários<\/li><li[^>]*>validar entrada<\/li><\/ul>/u
  );
  assert.match(html, /class="runtime-table-cell-content"/u);
});
