import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { validateContractDocument } from "../src/contract/validateContract.js";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function projectWithCards(cards) {
  return {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [
      {
        title: "Curso",
        modules: [
          {
            title: "Módulo",
            lessons: [
              {
                title: "Lição",
                microsequences: [
              {
                title: "Microssequência",
                status: "draft",
                cards
              }
            ]
              }
            ]
          }
        ]
      }
    ]
  };
}

test("valida o exemplo público do contrato principal e gera keys ausentes", () => {
  const document = readJson("./docs/examples/aralearn-contract.renderable.json");

  const result = validateContractDocument(document);

  assert.equal(result.ok, true);
  assert.equal(result.value.contract, "aralearn.contract");
  assert.equal(result.value.version, 1);
  assert.equal(result.value.kind, "project");
  assert.equal(result.value.courses[0].key, "course-curso-renderizavel");
  assert.equal(
    result.value.courses[0].modules[0].lessons[0].microsequences[0].key,
    "microsequence-modelo-cascata"
  );
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].say, "O modelo cascata organiza o trabalho em fases sequenciais.");
});

test("valida o exemplo público dedicado a plane e matrix", () => {
  const document = readJson("./docs/examples/aralearn-contract.plane-matrix.json");

  const result = validateContractDocument(document);

  assert.equal(result.ok, true);
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].plane.vector[0], 3);
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[4].matrix.highlight, "mainDiagonal");
});

test("valida o curso público de matemática para informática", () => {
  const document = readJson("./docs/examples/aralearn-contract.logic-plane-matrix-course.json");

  const result = validateContractDocument(document);
  const vectorModule = result.value.courses[0].modules[1];
  const transformationsLesson = vectorModule.lessons[2];
  const matrixVisualMicrosequence = transformationsLesson.microsequences[0];
  const inverseMicrosequence = transformationsLesson.microsequences[2];
  const compositionPracticeCard = inverseMicrosequence.cards.find((card) => card.key === "card-composicao-pratica");
  const augmentedCard = matrixVisualMicrosequence.cards.find((card) => card.key === "card-matrizes-aumentada");
  const inverseIdentityCard = inverseMicrosequence.cards.find((card) => card.key === "card-inversa-identidade");

  assert.equal(result.ok, true);
  assert.equal(result.value.courses[0].title, "Matemática para Informática");
  assert.deepEqual(result.value.courses[0].modules.map((module) => module.title), ["Lógica Proposicional", "Vetores e Matrizes"]);
  assert.equal(result.value.courses[0].modules[0].lessons.length, 3);
  assert.equal(result.value.courses[0].modules[1].lessons.length, 3);
  assert.equal(result.value.courses[0].modules[0].lessons[2].microsequences[2].title, "Detecção de erro em equivalência");
  assert.equal(augmentedCard?.matrix?.dividerAfterColumn, 2);
  assert.equal(compositionPracticeCard?.matrix?.sequence?.[2]?.highlight, "cell:1,1");
  assert.equal(inverseIdentityCard?.matrix?.sequence?.[3]?.name, "T⁻¹(T(v))");
});

test("aceita sourceGuideStructured e recompila sourceGuide legível", () => {
  const result = validateContractDocument({
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [
      {
        title: "Curso",
        sourceGuideStructured: {
          audience: "Saber ler instruções curtas.",
          globalScope: "Dominar a habilidade principal."
        },
        modules: [
          {
            title: "Módulo",
            sourceGuideStructured: {
              moduleOutOfScope: "Não avançar para exceções."
            },
            lessons: [
              {
                title: "Lição",
                sourceGuideStructured: {
                  lessonGoal: "Passo a passo simples.",
                  masteryGoal: "Aplicar sozinho em caso básico."
                },
                microsequences: []
              }
            ]
          }
        ]
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.match(result.value.courses[0].sourceGuide, /Público e ponto de entrada: Saber ler instruções curtas\./);
  assert.match(result.value.courses[0].sourceGuide, /Escopo do curso: Dominar a habilidade principal\./);
  assert.deepEqual(result.value.courses[0].sourceGuideStructured, {
    audience: "Saber ler instruções curtas.",
    globalScope: "Dominar a habilidade principal."
  });
  assert.match(result.value.courses[0].modules[0].lessons[0].sourceGuide, /Meta da lição: Passo a passo simples\./);
  assert.match(result.value.courses[0].modules[0].lessons[0].sourceGuide, /Ao final: Aplicar sozinho em caso básico\./);
});

test("rejeita sourceGuide textual puro sem sourceGuideStructured", () => {
  const result = validateContractDocument({
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [
      {
        title: "Curso",
        sourceGuide: "Texto corrido legado.",
        modules: []
      }
    ]
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.map((error) => error.message).join("\n"), /sourceGuide textual puro/);
});

test("rejeita campos legados de card no contrato principal", () => {
  const result = validateContractDocument(projectWithCards([{ type: "text", title: "Antigo", text: "x" }]));

  assert.equal(result.ok, false);
  assert.match(
    result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"),
    /Campo não suportado em card: "type"/
  );
});

test("aceita card flow com estrutura pública composta", () => {
  const result = validateContractDocument(
    projectWithCards([
      {
        title: "Decisão",
        flow: [
          { start: "Início" },
          {
            if: "x > 0",
            then: [{ process: "Seguir" }],
            else: [{ output: "Parar" }]
          },
          { end: "Fim" }
        ]
      }
    ])
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].flow[1].if, "x > 0");
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].flow[1].id, "flow-2");
});

test("aceita card plane com vector simples", () => {
  const result = validateContractDocument(
    projectWithCards([
      {
        title: "Vetor",
        plane: {
          vector: ["3", "2"]
        }
      }
    ])
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].plane.vector, [3, 2]);
});

test("aceita card plane com soma e resultado em lacunas", () => {
  const result = validateContractDocument(
    projectWithCards([
      {
        title: "Soma",
        plane: {
          sum: [[1, 2], [3, 1]],
          result: ["[[4::3|5]]", "[[3::2|4]]"]
        }
      }
    ])
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].plane.sum, [[1, 2], [3, 1]]);
});

test("aceita card plane com multiplicação por escalar", () => {
  const result = validateContractDocument(
    projectWithCards([
      {
        title: "Escalar",
        plane: {
          scale: {
            k: "2",
            vector: [2, 1]
          }
        }
      }
    ])
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].plane.scale.k, 2);
});

test("aceita card plane com distância entre pontos", () => {
  const result = validateContractDocument(
    projectWithCards([
      {
        title: "Distância",
        plane: {
          distance: [[1, 1], [4, 5]]
        }
      }
    ])
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].plane.distance, [[1, 1], [4, 5]]);
});

test("aceita card matrix com values básicos", () => {
  const result = validateContractDocument(
    projectWithCards([
      {
        title: "Matriz",
        matrix: {
          name: "A",
          values: [[1, 2], [3, 4]]
        }
      }
    ])
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].matrix.values, [[1, 2], [3, 4]]);
});

test("aceita card matrix com highlight simples", () => {
  const result = validateContractDocument(
    projectWithCards([
      {
        title: "Diagonal",
        matrix: {
          values: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
          highlight: { row: 2 }
        }
      }
    ])
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].matrix.highlight, "row:2");
});

test("aceita matrix com célula lacunada", () => {
  const result = validateContractDocument(
    projectWithCards([
      {
        title: "Lacuna",
        matrix: {
          values: [[1, 2, 3], [4, 5, "[[6::5|7|8]]"]],
          highlight: "cell:2,3"
        }
      }
    ])
  );

  assert.equal(result.ok, true);
  assert.equal(
    result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].matrix.values[1][2],
    "[[6::5|7|8]]"
  );
});

test("aceita matrix com sequência de resolução", () => {
  const result = validateContractDocument(
    projectWithCards([
      {
        title: "Sequência",
        matrix: {
          sequence: [
            { name: "A", values: [[1, 2], [3, 4]] },
            { connector: "+", name: "B", values: [[5, 6], [7, 8]] },
            { connector: "=", name: "A+B", values: [["1 + 5", "2 + 6"], ["3 + 7", "4 + 8"]], highlight: "cell:1,1" },
            { connector: "=", values: [[6, 8], [10, 12]] }
          ]
        }
      }
    ])
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].matrix.sequence[1].connector, "+");
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0].matrix.sequence[2].highlight, "cell:1,1");
});

test("aceita card tree expositivo sem prática", () => {
  const result = validateContractDocument(
    projectWithCards([
      {
        title: "Árvore",
        say: "Observe os diretórios.",
        tree: {
          base: "/",
          current: "/home/aluno",
          items: {
            home: {
              aluno: {
                "README.txt": null
              }
            }
          }
        }
      }
    ])
  );

  assert.equal(result.ok, true);
  const card = result.value.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
  assert.equal(card.tree.items.home.aluno["README.txt"], null);
  assert.equal("practice" in card.tree, false);
});

test("aceita microssequência sem cards quando o status é explícito", () => {
  const result = validateContractDocument(projectWithCards([]));

  assert.equal(result.ok, true);
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].status, "draft");
  assert.deepEqual(result.value.courses[0].modules[0].lessons[0].microsequences[0].cards, []);
});

test("rejeita microssequência sem status explícito", () => {
  const document = projectWithCards([
    {
      title: "Ideia",
      say: "Leia a ideia."
    }
  ]);
  delete document.courses[0].modules[0].lessons[0].microsequences[0].status;

  const result = validateContractDocument(document);

  assert.equal(result.ok, false);
  assert.match(
    result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"),
    /Campo obrigatório inválido: "status"/
  );
});

test("aceita status explícito de rascunho", () => {
  const document = projectWithCards([]);
  document.courses[0].modules[0].lessons[0].microsequences[0].status = "draft";

  const result = validateContractDocument(document);

  assert.equal(result.ok, true);
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].status, "draft");
});

test("aceita indicador explícito de inclusão no estudo", () => {
  const document = projectWithCards([
    {
      title: "Ideia",
      say: "Leia a ideia."
    }
  ]);
  document.courses[0].modules[0].lessons[0].microsequences[0].status = "ready";
  document.courses[0].modules[0].lessons[0].microsequences[0].included = false;

  const result = validateContractDocument(document);

  assert.equal(result.ok, true);
  assert.equal(result.value.courses[0].modules[0].lessons[0].microsequences[0].included, false);
});

test("aceita curso, módulo e lição vazios no contrato público", () => {
  const result = validateContractDocument({
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [
      {
        title: "Curso vazio",
        modules: [
          {
            title: "Módulo vazio",
            lessons: [
              {
                title: "Lição vazia",
                microsequences: []
              }
            ]
          }
        ]
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.courses[0].modules[0].lessons[0].microsequences, []);
});

test("aceita projeto sem cursos", () => {
  const result = validateContractDocument({
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: []
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.courses, []);
});

test("rejeita runtime autorado no JSON público", () => {
  const result = validateContractDocument(
    projectWithCards([
      {
        title: "Árvore",
        say: "Fallback",
        runtime: {
          blocks: [{ kind: "directory_tree", base: "/", nodes: [] }]
        }
      }
    ])
  );

  assert.equal(result.ok, false);
  assert.match(
    result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"),
    /Campo não suportado em card: "runtime"/
  );
});

test("rejeita campos visuais livres em plane e matrix", () => {
  const result = validateContractDocument(
    projectWithCards([
      {
        title: "Plane inválido",
        plane: {
          vector: [1, 2],
          svg: "<svg></svg>"
        }
      },
      {
        title: "Matrix inválida",
        matrix: {
          values: [[1, 2], [3, 4]],
          html: "<table></table>"
        }
      }
    ])
  );

  assert.equal(result.ok, false);
  const summary = result.errors.map((error) => `${error.path}: ${error.message}`).join("\n");
  assert.match(summary, /Campo não suportado em plane: "svg"/);
  assert.match(summary, /Campo não suportado em matrix: "html"/);
});

test("rejeita markup HTML ou SVG em valores de matrix", () => {
  const result = validateContractDocument(
    projectWithCards([
      {
        title: "Matrix inválida",
        matrix: {
          values: [["<svg></svg>", 2], [3, 4]]
        }
      }
    ])
  );

  assert.equal(result.ok, false);
  assert.match(
    result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"),
    /Campo obrigatório inválido: "matrix.values\[0\]"/
  );
});
