import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";

import { validateCard } from "../../src/domain/cards.js";
import { validateFormulaExpression } from "../../src/domain/formulaExpression.js";
import { runBottomUpCardBuild } from "../../src/generation/engine/bottomUpBuildRuntime.js";
import { compileCardFromTemplate } from "../../src/generation/engine/cardCompilers/index.js";
import { createFakeProvider } from "../../src/generation/providers/fakeProvider.js";
import { canonicalCourseHash } from "../../src/persistence/canonicalCourseHash.js";
import { contractToRelationalRows } from "../../src/persistence/contractToRelationalRows.js";
import { IndexedDbRelationalStore } from "../../src/persistence/IndexedDbRelationalStore.js";
import { relationalRowsToContract } from "../../src/persistence/relationalRowsToContract.js";
import { validateRelationalCourse } from "../../src/persistence/validateRelationalCourse.js";
import { renderCardRuntimeBlocks } from "../../src/render/renderCardRuntime.js";

const formulaFixtureUrl = new URL("../fixtures/formulas-matematica-quimica.json", import.meta.url);

async function readFormulaProject() {
  return {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [JSON.parse(await fs.readFile(formulaFixtureUrl, "utf8"))]
  };
}

function fixtureCards(project) {
  return project.courses[0].modules[0].lessons[0].microsequences[0].cards;
}

function mathExpression() {
  return {
    type: "row",
    children: [
      { type: "identifier", value: "x" },
      { type: "operator", value: "=" },
      {
        type: "fraction",
        numerator: { type: "number", value: "1" },
        denominator: { type: "root", radicand: { type: "identifier", value: "y" } }
      }
    ]
  };
}

function baseFormulaCard(overrides = {}) {
  return {
    id: "card-formula-teste",
    position: 1,
    resource: "formula",
    kind: "theory",
    exercise: "none",
    title: "Expressão",
    prompt: "Observe a igualdade.",
    notation: "mathematics",
    accessibleText: "x é igual a um dividido pela raiz de y.",
    expression: mathExpression(),
    after: "A fração mantém numerador e denominador explícitos.",
    ...overrides
  };
}

test("formula faz round-trip exato sem armazenar a expressão em JSONB", async () => {
  const project = await readFormulaProject();
  const rows = contractToRelationalRows(project);
  const rebuilt = relationalRowsToContract(rows);

  assert.deepEqual(rebuilt, project);
  assert.equal(validateRelationalCourse(rows).ok, true);
  assert.equal(await canonicalCourseHash(rebuilt.courses[0]), await canonicalCourseHash(project.courses[0]));

  const formulaBlocks = rows.blocks.filter((row) => row.blockType === "formula");
  const formulaNodes = rows.nodes.filter((row) => row.nodeScope === "formula");
  assert.equal(formulaBlocks.length, 4);
  assert.ok(formulaNodes.length > formulaBlocks.length);
  assert.ok(formulaBlocks.every((row) => !("expression" in row)));
  assert.ok(formulaNodes.every((row) => !("payload" in row) && !("properties" in row)));
  assert.ok(formulaNodes.some((row) => row.nodeKind === "fraction"));
  assert.ok(formulaNodes.some((row) => row.nodeKind === "subscript"));
  assert.ok(formulaNodes.some((row) => row.nodeKind === "fenced"));
});

test("IndexedDB conserva bloco e nós da fórmula sem documento paralelo", async () => {
  const project = await readFormulaProject();
  const rows = contractToRelationalRows(project);
  const courseId = rows.courses[0].id;
  const userId = "10000000-0000-4000-8000-000000000099";
  const store = await IndexedDbRelationalStore.open(new IDBFactory(), { userId });
  try {
    await store.bindReplicaToUser(userId);
    await store.replaceOfficialCourseReplica(courseId, rows, {
      publicationSeq: 1,
      contentHash: await canonicalCourseHash(project.courses[0])
    });
    const expectedBlock = rows.blocks.find((row) => row.blockType === "formula");
    const byId = (left, right) => left.id.localeCompare(right.id);
    const expectedNodes = rows.nodes.filter((row) => row.blockId === expectedBlock.id).sort(byId);
    assert.deepEqual(await store.get("blocks", expectedBlock.id), expectedBlock);
    assert.deepEqual(
      (await store.getAll("nodes")).filter((row) => row.blockId === expectedBlock.id).sort(byId),
      expectedNodes
    );
    assert.equal(await store.get("syncState", `catalog.replica:${courseId}`) != null, true);
  } finally {
    store.close();
  }
});

test("formula renderiza MathML nativo, leitura acessível e escolha contextual", async () => {
  const project = await readFormulaProject();
  const [mathematics, chemistry, exercise] = fixtureCards(project);
  const mathHtml = renderCardRuntimeBlocks(mathematics);
  const chemistryHtml = renderCardRuntimeBlocks(chemistry);
  const exerciseHtml = renderCardRuntimeBlocks(exercise);

  assert.match(mathHtml, /<math[^>]+role="math"/u);
  assert.match(mathHtml, /aria-label="x é igual a um dividido pela raiz cúbica de y\."/u);
  assert.match(mathHtml, /<mfrac>/u);
  assert.match(mathHtml, /<mroot>/u);
  assert.match(mathHtml, /<annotation encoding="text\/plain">/u);
  assert.match(chemistryHtml, /<msub>/u);
  assert.match(chemistryHtml, /<mi mathvariant="normal">H<\/mi>/u);
  assert.match(exerciseHtml, /runtime-formula-block/u);
  assert.match(exerciseHtml, /runtime-choice-block/u);
});

test("conteúdo de fórmula nunca injeta HTML ou atributos no MathML", () => {
  const malicious = baseFormulaCard({
    accessibleText: "x & y \" onfocus=\"alert(1)",
    expression: { type: "text", value: "<script>alert(1)</script>" }
  });
  const validation = validateCard(malicious);
  const html = renderCardRuntimeBlocks(malicious);

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((entry) => entry.path.endsWith(".expression.value")));
  assert.doesNotMatch(html, /<script>/u);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  assert.doesNotMatch(html, /aria-label="[^"]*" onfocus=/u);
  assert.match(html, /x &amp; y &quot; onfocus=&quot;alert\(1\)/u);
});

test("AST aceita Unicode e rejeita marcação, campos desconhecidos, ciclos lógicos e profundidade excessiva", () => {
  const unicode = validateFormulaExpression({
    type: "row",
    children: [
      { type: "identifier", value: "漢" },
      { type: "operator", value: "∈" },
      { type: "identifier", value: "ℂ" },
      { type: "text", value: "ΔG°" }
    ]
  });
  assert.equal(unicode.ok, true);
  assert.equal(unicode.value.children[0].value, "漢");
  assert.equal(validateFormulaExpression({ type: "text", value: "𐍈".repeat(256) }).ok, true);
  assert.equal(validateFormulaExpression({ type: "text", value: "𐍈".repeat(257) }).ok, false);

  assert.equal(validateFormulaExpression({ type: "identifier", value: "<mi>x</mi>" }).ok, false);
  assert.equal(validateFormulaExpression({ type: "text", value: "x\u0007y" }).ok, false);
  assert.equal(validateFormulaExpression({ type: "number", value: "2", color: "red" }).ok, false);
  assert.equal(validateFormulaExpression({
    type: "fenced",
    open: "(",
    close: "]",
    content: { type: "number", value: "1" }
  }).ok, false);

  const cyclic = { type: "row", children: [] };
  cyclic.children.push(cyclic);
  assert.equal(validateFormulaExpression(cyclic).ok, false);

  let deep = { type: "identifier", value: "x" };
  for (let index = 0; index < 33; index += 1) {
    deep = { type: "root", radicand: deep };
  }
  assert.equal(validateFormulaExpression(deep).ok, false);
});

test("formula preserva somente none na teoria e choice na prática", () => {
  assert.equal(validateCard(baseFormulaCard()).ok, true);
  assert.equal(validateCard(baseFormulaCard({ kind: "exercise", exercise: "gap" })).ok, false);
  assert.equal(validateCard(baseFormulaCard({
    kind: "exercise",
    exercise: "choice",
    question: "Qual leitura corresponde à expressão?",
    options: [
      { id: "a", text: "um dividido pela raiz de y" },
      { id: "b", text: "y dividido por um" },
      { id: "c", text: "x multiplicado por y" }
    ],
    answer: "a"
  })).ok, true);
  assert.equal(validateCard(baseFormulaCard({
    question: "Questão indevida",
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" }
    ],
    answer: "a"
  })).ok, false);
});

test("validação relacional rejeita raiz adicional, aridade inválida, pai em outro bloco e ciclo desconectado", async () => {
  const project = await readFormulaProject();
  const rows = contractToRelationalRows(project);
  const mathematicsBlock = rows.blocks.find((row) => row.blockType === "formula" && row.notation === "mathematics");
  const chemistryBlock = rows.blocks.find((row) => row.blockType === "formula" && row.notation === "chemistry");
  const child = rows.nodes.find((row) => row.blockId === mathematicsBlock.id && row.parentNodeId != null);

  const extraRootRows = structuredClone(rows);
  extraRootRows.nodes.find((row) => row.id === child.id).parentNodeId = null;
  assert.ok(validateRelationalCourse(extraRootRows).errors.some((entry) => entry.code === "formula_shape"));

  const badPositionRows = structuredClone(rows);
  badPositionRows.nodes.find((row) => row.id === child.id).position = 9;
  assert.ok(validateRelationalCourse(badPositionRows).errors.some((entry) => entry.code === "formula_shape"));

  const badFenceRows = structuredClone(rows);
  const fenced = badFenceRows.nodes.find((row) => row.nodeScope === "formula" && row.nodeKind === "fenced");
  fenced.fenceClose = "]";
  assert.ok(validateRelationalCourse(badFenceRows, { assemble: false }).errors.some((entry) => entry.code === "formula_shape"));

  const markupRows = structuredClone(rows);
  const leaf = markupRows.nodes.find((row) => row.nodeScope === "formula" && row.nodeKind === "identifier");
  leaf.formulaValue = "<mi>x</mi>";
  assert.ok(validateRelationalCourse(markupRows, { assemble: false }).errors.some((entry) => entry.code === "formula_shape"));

  const crossBlockRows = structuredClone(rows);
  crossBlockRows.nodes.find((row) => row.id === child.id).blockId = chemistryBlock.id;
  assert.ok(validateRelationalCourse(crossBlockRows).errors.some((entry) => entry.code === "foreign_key"));

  const disconnectedCycleRows = structuredClone(rows);
  const root = disconnectedCycleRows.nodes.find((row) => row.blockId === mathematicsBlock.id && row.parentNodeId == null);
  const firstCycleId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const secondCycleId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
  disconnectedCycleRows.nodes.push(
    {
      ...root,
      id: firstCycleId,
      contractKey: "formula-cycle-a",
      parentNodeId: secondCycleId,
      parentContractKey: "formula-cycle-b",
      position: 0
    },
    {
      ...root,
      id: secondCycleId,
      contractKey: "formula-cycle-b",
      parentNodeId: firstCycleId,
      parentContractKey: "formula-cycle-a",
      position: 0
    }
  );
  const cycleValidation = validateRelationalCourse(disconnectedCycleRows, { assemble: false });
  assert.ok(cycleValidation.errors.some((entry) => entry.code === "formula_shape" && /cíclica|desconectada/u.test(entry.message)));
});

test("compilador de fórmula aceita teoria e escolha e fecha diante de AST inválida", () => {
  const expressionJson = JSON.stringify(mathExpression());
  const theory = compileCardFromTemplate({
    templateId: "formula_theory",
    position: 1,
    slots: {
      1: "Fração",
      2: "Observe.",
      3: "mathematics",
      4: "x é igual a um dividido pela raiz de y.",
      5: expressionJson,
      6: "A estrutura explicita a operação."
    }
  });
  const exercise = compileCardFromTemplate({
    templateId: "formula_choice",
    position: 2,
    slots: {
      1: "Leia",
      2: "Observe.",
      3: "chemistry",
      4: "H dois O.",
      5: JSON.stringify({
        type: "row",
        children: [
          {
            type: "subscript",
            base: { type: "identifier", value: "H" },
            subscript: { type: "number", value: "2" }
          },
          { type: "identifier", value: "O" }
        ]
      }),
      6: "Qual leitura corresponde à fórmula?",
      7: "H dois O",
      8: "H O dois",
      9: "H ao quadrado O",
      10: "a",
      11: "O índice pertence ao H."
    }
  });

  assert.equal(theory.resource, "formula");
  assert.equal(theory.kind, "theory");
  assert.equal(exercise.exercise, "choice");
  assert.equal(exercise.answer, "a");
  assert.throws(() => compileCardFromTemplate({
    templateId: "formula_theory",
    position: 3,
    slots: {
      1: "Inválida",
      2: "Observe.",
      3: "mathematics",
      4: "Expressão inválida.",
      5: "{não é JSON}",
      6: ""
    }
  }), /AST de fórmula em JSON válido/iu);
});

test("build bottom-up pede somente a correção da AST inválida e conserva os demais campos", async () => {
  const validExpression = JSON.stringify(mathExpression());
  const provider = createFakeProvider({
    structuredEngine: true,
    script: {
      bottom_up_card_build: [
        {
          text: [
            "CARD 1",
            "1: Fração",
            "2: Observe.",
            "3: mathematics",
            "4: x é igual a um dividido pela raiz de y.",
            "5: {\"type\":\"identifier\",\"value\":\"<mi>x</mi>\"}",
            "6: A estrutura explicita a operação."
          ].join("\n")
        },
        { text: `CARD 1\n5: ${validExpression}` }
      ]
    }
  });

  const result = await runBottomUpCardBuild({
    provider,
    modelId: "fake:model",
    generationContract: { microsequence: { title: "Fração" } },
    planItems: [{ position: 1, templateId: "formula_theory", goal: "Interpretar a fração." }]
  });

  assert.equal(result.cards[0].resource, "formula");
  assert.deepEqual(result.cards[0].expression, mathExpression());
  assert.equal(result.cards[0].title, "Fração");
  assert.equal(result.slotPackets[0].trace.missing.length, 0);
  assert.equal(result.slotPackets[0].trace.invalid.length, 0);
});
