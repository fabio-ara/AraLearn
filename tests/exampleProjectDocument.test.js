import test from "node:test";
import assert from "node:assert/strict";

import { createExampleProjectDocument, createMatematicaParaInformaticaProjectDocument } from "../src/ui/exampleProjectDocument.js";
import { validateContractDocument } from "../src/contract/validateContract.js";
import { resolveCardRuntime } from "../src/core/cardRuntime.js";

test("o conteúdo inicial da interface valida no contrato atual", () => {
  const document = createExampleProjectDocument();
  const result = validateContractDocument(document);

  assert.equal(result.ok, true);
  assert.equal(result.value.contract, "aralearn.contract");
  assert.equal(result.value.courses.length, 2);
});

test("o projeto inicial do app contém apenas o curso de matemática para informática", () => {
  const result = validateContractDocument(createMatematicaParaInformaticaProjectDocument());
  assert.equal(result.ok, true);

  const document = result.value;
  assert.equal(document.courses.length, 1);
  assert.equal(document.courses[0].key, "course-matematica-para-informatica");
  assert.equal(document.courses[0].title, "Matemática para Informática");
  assert.deepEqual(document.courses[0].modules.map((module) => module.title), ["Lógica Proposicional", "Vetores e Matrizes"]);
});

test("o conteúdo inicial agora mantém um único curso de teste", () => {
  const result = validateContractDocument(createExampleProjectDocument());
  assert.equal(result.ok, true);
  const document = result.value;
  const course = document.courses[0];

  assert.equal(course.key, "course-teste-runtime");
  assert.equal(course.modules.length, 1);
  assert.equal(course.modules[0].lessons.length, 3);
  assert.equal(course.modules[0].lessons[0].microsequences.length, 1);
  assert.equal(course.modules[0].lessons[0].microsequences[0].cards.length, 3);
});

test("o conteúdo inicial preserva o card oficial com árvore de diretórios", () => {
  const result = validateContractDocument(createExampleProjectDocument());
  assert.equal(result.ok, true);
  const document = result.value;
  const microsequence = document.courses[0].modules[0].lessons[0].microsequences[0];
  const card = microsequence.cards[0];
  const treeBlock = resolveCardRuntime(card).blocks[2];

  assert.equal(microsequence.title, "Diretório atual e caminhos");
  assert.equal(card.title, "Onde você está na árvore");
  assert.equal(treeBlock.kind, "directory_tree");
  assert.equal(treeBlock.currentNodeId, "node-home-aluno-projetos");
  assert.equal(treeBlock.selectedNodeId, "node-home-aluno-projetos");
  assert.deepEqual(treeBlock.collapsedNodeIds, ["node-home-aluno-downloads", "node-home-aluno-publico"]);
  assert.equal(treeBlock.nodes[0].children[0].children[1].name, "projetos");
  assert.equal(treeBlock.nodes[0].children[0].children[0].children[0].name, "arquivos-antigos");
  assert.equal(treeBlock.nodes[0].children[0].children[2].children[0].name, "galeria");
});

test("o conteúdo inicial mantém a árvore apenas como exemplo expositivo", () => {
  const result = validateContractDocument(createExampleProjectDocument());
  assert.equal(result.ok, true);
  const cards = result.value.courses[0].modules[0].lessons[0].microsequences[0].cards;
  const blocks = cards.map((card) => resolveCardRuntime(card).blocks[2]);

  assert.equal(cards[1].title, "Pastas irmãs e arquivo final");
  assert.equal(cards[2].title, "Downloads e arquivo compactado");
  assert.equal(blocks.every((block) => block.practice === undefined), true);
  assert.equal(blocks[1].selectedNodeId, "node-home-aluno-publico-notas-txt");
  assert.equal(blocks[2].selectedNodeId, "node-home-aluno-downloads-pacote-zip");
});

test("o conteúdo inicial inclui uma lição de teste com todos os exercícios por opções", () => {
  const result = validateContractDocument(createExampleProjectDocument());
  assert.equal(result.ok, true);
  const lesson = result.value.courses[0].modules[0].lessons[1];
  const microsequence = lesson.microsequences[0];
  const runtimeKinds = microsequence.cards.map((card) =>
    resolveCardRuntime(card).blocks.filter((block) => block.kind !== "button").at(-1)?.kind
  );

  assert.equal(lesson.title, "Verificação dos exercícios com opções");
  assert.equal(microsequence.title, "Todos os exercícios com opções");
  assert.deepEqual(runtimeKinds, ["multiple_choice", "paragraph", "editor", "table", "flowchart"]);
  assert.equal(microsequence.cards.every((card) => typeof card.after === "string" && card.after.length > 0), true);
});

test("o conteúdo inicial inclui uma lição de teste com plane e matrix", () => {
  const result = validateContractDocument(createExampleProjectDocument());
  assert.equal(result.ok, true);
  const lesson = result.value.courses[0].modules[0].lessons[2];
  const microsequence = lesson.microsequences[0];
  const runtimeKinds = microsequence.cards.map((card) =>
    resolveCardRuntime(card).blocks.filter((block) => block.kind !== "button").at(-1)?.kind
  );

  assert.equal(lesson.title, "Plano cartesiano e matrizes");
  assert.equal(microsequence.title, "Vetores e matrizes");
  assert.deepEqual(runtimeKinds, ["plane", "plane", "plane", "plane", "matrix", "matrix"]);
  assert.equal(microsequence.cards[1].plane.sum[0][0], 1);
  assert.equal(microsequence.cards[4].matrix.highlight, "mainDiagonal");
});

test("o conteúdo inicial inclui o curso de matemática para informática", () => {
  const result = validateContractDocument(createExampleProjectDocument());
  assert.equal(result.ok, true);
  const course = result.value.courses[1];
  const logicModule = course.modules[0];
  const vectorModule = course.modules[1];
  const truthTableLesson = logicModule.lessons[1];
  const equivalenceLesson = logicModule.lessons[2];
  const measuresLesson = vectorModule.lessons[1];
  const transformationsLesson = vectorModule.lessons[2];
  const learnerFacingText = JSON.stringify(course.modules.flatMap((module) =>
    module.lessons.flatMap((lesson) =>
      lesson.microsequences.flatMap((microsequence) =>
        microsequence.cards.map((card) => ({
          title: card.title,
          say: card.say,
          ask: card.ask,
          after: card.after
        }))
      )
    )
  ));

  assert.equal(course.title, "Matemática para Informática");
  assert.equal(course.modules.length, 2);
  assert.deepEqual(course.modules.map((module) => module.title), ["Lógica Proposicional", "Vetores e Matrizes"]);
  assert.equal(logicModule.lessons.length, 3);
  assert.equal(vectorModule.lessons.length, 3);
  assert.equal(truthTableLesson.microsequences[1].title, "Montagem de tabela composta");
  assert.equal(truthTableLesson.microsequences[1].cards[0].key, "card-logica-por-que-linhas");
  assert.equal(truthTableLesson.microsequences[1].cards[1].key, "card-logica-numero-linhas");
  assert.ok(truthTableLesson.microsequences[1].cards[0].say.includes("`2^n`"));
  assert.deepEqual(truthTableLesson.microsequences[1].cards[0].table.columns, ["`n`", "Proposições simples", "Linhas da tabela-verdade"]);
  assert.equal(truthTableLesson.microsequences[1].cards[0].table.rows[2][2], "`2^3 = 8` linhas");
  const matrixVectorMicrosequence = transformationsLesson.microsequences.find(
    (microsequence) => microsequence.key === "microsequence-transformacao-linear"
  );
  const lineColumnCard = matrixVectorMicrosequence.cards.find((card) => card.key === "card-transformacao-linha-coluna");
  const matrixVectorPracticeCard = matrixVectorMicrosequence.cards.find(
    (card) => card.key === "card-transformacao-pratica-matriz-vetor"
  );
  const compositionMicrosequence = transformationsLesson.microsequences.find(
    (microsequence) => microsequence.key === "microsequence-composicao-inversa"
  );
  const compositionExampleCard = compositionMicrosequence.cards.find((card) => card.key === "card-composicao-exemplo");
  const compositionPracticeCard = compositionMicrosequence.cards.find((card) => card.key === "card-composicao-pratica");
  const inverseIdentityCard = compositionMicrosequence.cards.find((card) => card.key === "card-inversa-identidade");
  assert.ok(lineColumnCard?.say.includes("produto escalar"));
  assert.equal(lineColumnCard?.matrix.sequence[2].values[0][0], "2·1 + 1·2");
  assert.ok(matrixVectorPracticeCard?.say.includes("Primeira linha: `2·1 + 1·2`"));
  assert.equal(matrixVectorPracticeCard?.matrix.sequence[2].values[1][0], "[[6::6|3|5]]");
  assert.ok(compositionExampleCard?.say.includes("`v = (1,1)`"));
  assert.equal(compositionExampleCard?.matrix.sequence[3].name, "T2(T1(v))");
  assert.equal(compositionPracticeCard?.matrix.sequence[2].name, "T2 · T1");
  assert.ok(inverseIdentityCard?.say.includes("voltamos para `(1,2)`"));
  assert.equal(inverseIdentityCard?.matrix.sequence[3].name, "T⁻¹(T(v))");
  assert.equal(logicModule.lessons[0].microsequences[0].cards[0].table.rows[0][0], "`2 + 2 = 4`");
  assert.equal(truthTableLesson.microsequences[1].cards[4].table.columns[5], "p → (q ∧ (¬q ∨ r))");
  assert.equal(equivalenceLesson.microsequences[0].cards[4].table.focus.row, 2);
  assert.equal(equivalenceLesson.microsequences[1].cards[0].table.columns[2], "¬p");
  assert.deepEqual(equivalenceLesson.microsequences[1].cards[0].table.focus.columns, [4, 5]);
  assert.equal(equivalenceLesson.microsequences[1].cards[1].table.columns[2], "`¬q`");
  assert.equal(equivalenceLesson.microsequences[1].cards[2].table.rows[0][4], "F");
  assert.doesNotMatch(JSON.stringify(course), /como no caderno|formato de caderno|anotações|notação de aula/);
  assert.equal(vectorModule.lessons[0].microsequences[1].cards[2].key, "card-vetores-soma-geometrica-ideia");
  assert.equal(vectorModule.lessons[0].microsequences[1].cards[3].key, "card-vetores-soma-geometrica");
  assert.equal(equivalenceLesson.microsequences[2].title, "Detecção de erro em equivalência");
  assert.equal(measuresLesson.microsequences[0].cards[0].key, "card-vetores-modulo-definicao");
  assert.ok(measuresLesson.microsequences[0].cards[0].plane.distance);
  assert.equal(measuresLesson.microsequences[0].cards[1].key, "card-vetores-modulo-pitagoras");
  assert.ok(measuresLesson.microsequences[0].cards[2].say.includes("√(1² + 2² + 3² + 4²)"));
  assert.ok(measuresLesson.microsequences[0].cards[3].plane.distance);
  assert.equal(measuresLesson.microsequences[1].cards[3].key, "card-vetores-ortogonalidade-algebra");
  assert.ok(measuresLesson.microsequences[1].cards[5].say.includes("`||v||` significa o comprimento"));
  assert.equal(measuresLesson.microsequences[1].cards[5].plane.vectors[0][0], 3);
  assert.ok(measuresLesson.microsequences[1].cards[6].say.includes("primeiro calcule `v · w`"));
  assert.ok(measuresLesson.microsequences[1].cards[7].say.includes("[[40/(√30 · √54)::40/(√30 · √54)|40/30|√54/40]]"));
  assert.doesNotMatch(measuresLesson.microsequences[1].cards[7].after, /próximo de 1|direções muito parecidas/);
  assert.equal(transformationsLesson.microsequences[0].cards[1].matrix.sequence.length, 4);
  assert.equal(transformationsLesson.microsequences[1].cards[1].matrix.values.length, 3);
  assert.ok(transformationsLesson.microsequences[1].cards[2].say.includes("(3,2,4) + (5,5,5)"));
  assert.equal(transformationsLesson.microsequences[2].cards[2].matrix.sequence[2].highlight, "cell:1,1");
  assert.ok(JSON.stringify(equivalenceLesson).includes("¬(p ∧ ¬q)"));
  assert.ok(vectorModule.lessons[0].microsequences[1].cards[1].say.includes("some coordenada por coordenada"));
  assert.ok(vectorModule.lessons[0].microsequences[1].cards[1].say.includes("`v1 + v2 = (1+2, 2+3, 3+4, 4+5) ="));
  assert.match(vectorModule.lessons[0].microsequences[1].cards[1].after, /posição de cada coordenada/);
  assert.doesNotMatch(learnerFacingText, /exemplo anterior|card anterior|na aula|no material/);
  assert.doesNotMatch(learnerFacingText, /\bCorreto!/);
  assert.doesNotMatch(learnerFacingText, /Venn|Euler/);
});
