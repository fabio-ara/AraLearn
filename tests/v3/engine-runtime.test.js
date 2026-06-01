import test from "node:test";
import assert from "node:assert/strict";

import { createFakeProvider } from "../../src/generation/providers/fakeProvider.js";
import { generateMicrosequenceCards } from "../../src/generation/bottomUp/generateMicrosequenceCards.js";
import { runBottomUpCardBuild } from "../../src/generation/engine/bottomUpBuildRuntime.js";

function projectWithPlannedMicrosequence() {
  return {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [
      {
        id: "course-a",
        title: "Curso A",
        goal: "Objetivo",
        modules: [
          {
            id: "module-a",
            title: "Módulo A",
            guide: {
              goal: "Objetivo do módulo",
              include: ["matriz"],
              exclude: ["determinante"],
              notation: [],
              avoid: []
            },
            lessons: [
              {
                id: "lesson-a",
                title: "Lição A",
                guide: {
                  goal: "Objetivo da lição",
                  include: ["matriz"],
                  exclude: ["determinante"],
                  notation: [],
                  avoid: []
                },
                topics: [],
                microsequences: [
                  {
                    id: "micro-a",
                    title: "Posição a_ij",
                    goal: "Ler posição em matriz",
                    role: "explain",
                    status: "planned",
                    dependsOn: [],
                    covers: ["matriz"],
                    checks: ["ler posição"],
                    versions: [],
                    activeVersion: null
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

test("runtime estruturado aplica versão quando validação final ok", async () => {
  const provider = createFakeProvider({
    structuredEngine: true,
    script: {
      bottom_up_micro_plan: {
        text: `
CARD 1
1: 103
2: 205
3: 1101
4: 402
5: 502
6: usar matriz
7: matrix_theory
CARD 2
1: 103
2: 204
3: 1103
4: 402
5: 502
6: praticar
7: matrix_locate_cell_choice
CARD 3
1: 103
2: 204
3: 1103
4: 402
5: 502
6: consolidar
7: matrix_locate_cell_choice
`,
        usage: {}
      },
      bottom_up_card_build: [
        { text: "CARD 1\n1: Matriz A\n2: Observe a matriz.\n3: A\n4: 1|2\n5: 3|4\n6: A posição depende de linha e coluna.", usage: {} },
        { text: "CARD 2\n1: Posição\n2: Observe a matriz.\n3: A\n4: 1|2\n5: 3|4\n6: 2\n7: 1\n8: Qual valor está na linha 2, coluna 1?\n9: 1\n10: 3\n11: 4\n12: Primeiro vem a linha.", usage: {} },
        { text: "CARD 3\n1: Outra posição\n2: Observe a matriz.\n3: A\n4: 5|6\n5: 7|8\n6: 1\n7: 2\n8: Qual valor está na linha 1, coluna 2?\n9: 7\n10: 6\n11: 8\n12: Primeiro vem a linha.", usage: {} }
      ],
      bottom_up_card_audit: {
        text: "AUDIT\nstatus: 1201",
        usage: {}
      }
    }
  });

  const result = await generateMicrosequenceCards({
    project: projectWithPlannedMicrosequence(),
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    provider,
    modelId: "gemini-2.5-flash"
  });

  assert.equal(result.version.validation.ok, true);
  assert.equal(result.version.cards.length, 3);
  assert.equal(result.version.cards[0].resource, "matrix");
});

test("runtime não altera projeto em fail_closed", async () => {
  const project = projectWithPlannedMicrosequence();
  const provider = createFakeProvider({
    structuredEngine: true,
    script: {
      bottom_up_micro_plan: {
        text: "CARD 1\n1: 101\n2: 201\n3: 1101\n4: 401\n5: 501\n6: texto",
        usage: {}
      },
      bottom_up_card_build: [
        { text: "CARD 1\n1: Teoria\n2: Fale de determinante.\n3: depois", usage: {} }
      ],
      bottom_up_card_audit: {
        text: "AUDIT\nstatus: 1206",
        usage: {}
      }
    }
  });

  await assert.rejects(() => generateMicrosequenceCards({
    project,
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    provider,
    modelId: "gemini-2.5-flash"
  }), /fail_closed|determinante/);
  assert.equal(project.courses[0].modules[0].lessons[0].microsequences[0].versions.length, 0);
});

test("auditoria aplica patch de slot e recompila o card final", async () => {
  const provider = createFakeProvider({
    structuredEngine: true,
    script: {
      bottom_up_micro_plan: {
        text: `CARD 1
1: 103
2: 204
3: 1103
4: 402
5: 502
6: praticar
7: matrix_locate_cell_choice
CARD 2
1: 103
2: 204
3: 1103
4: 402
5: 502
6: variar
7: matrix_locate_cell_choice
CARD 3
1: 103
2: 205
3: 1106
4: 402
5: 502
6: consolidar
7: matrix_theory`,
        usage: {}
      },
      bottom_up_card_build: [
        { text: "CARD 1\n1: Posição\n2: Observe a matriz.\n3: A\n4: 1|2\n5: 3|4\n6: 2\n7: 1\n8: Qual valor está na linha 2, coluna 1?\n9: 1\n10: 3\n11: 4\n12: Feedback genérico.", usage: {} },
        { text: "CARD 2\n1: Outra posição\n2: Observe a matriz.\n3: A\n4: 5|6\n5: 7|8\n6: 1\n7: 2\n8: Qual valor está na linha 1, coluna 2?\n9: 7\n10: 6\n11: 8\n12: Compare linha e coluna.", usage: {} },
        { text: "CARD 3\n1: Consolidação\n2: A posição combina linha e coluna sempre na mesma ordem.\n3: A\n4: 1|2\n5: 3|4\n6: Retome a ordem antes de avançar.", usage: {} }
      ],
      bottom_up_card_audit: {
        text: "AUDIT\nstatus: 1201\nCARD 1\naction: 1209\n12: Primeiro vem a linha e depois a coluna.",
        usage: {}
      }
    }
  });

  const result = await generateMicrosequenceCards({
    project: projectWithPlannedMicrosequence(),
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    provider,
    modelId: "fake:model"
  });

  assert.equal(result.version.cards[0].after, "Primeiro vem a linha e depois a coluna.");
});

test("auditoria normaliza aspas externas em patch textual", async () => {
  const provider = createFakeProvider({
    structuredEngine: true,
    script: {
      bottom_up_micro_plan: {
        text: `CARD 1
1: 103
2: 204
3: 1103
4: 402
5: 502
6: praticar
7: matrix_locate_cell_choice
CARD 2
1: 103
2: 204
3: 1103
4: 402
5: 502
6: variar
7: matrix_locate_cell_choice
CARD 3
1: 103
2: 205
3: 1106
4: 402
5: 502
6: consolidar
7: matrix_theory`,
        usage: {}
      },
      bottom_up_card_build: [
        { text: "CARD 1\n1: Posição\n2: Observe a matriz.\n3: A\n4: 1|2\n5: 3|4\n6: 2\n7: 1\n8: Qual valor está na linha 2, coluna 1?\n9: 1\n10: 3\n11: 4\n12: Feedback genérico.", usage: {} },
        { text: "CARD 2\n1: Outra posição\n2: Observe a matriz.\n3: A\n4: 5|6\n5: 7|8\n6: 1\n7: 2\n8: Qual valor está na linha 1, coluna 2?\n9: 7\n10: 6\n11: 8\n12: Compare linha e coluna.", usage: {} },
        { text: "CARD 3\n1: Consolidação\n2: A posição combina linha e coluna sempre na mesma ordem.\n3: A\n4: 1|2\n5: 3|4\n6: Retome a ordem antes de avançar.", usage: {} }
      ],
      bottom_up_card_audit: {
        text: "AUDIT\nstatus: 1201\nCARD 1\naction: 1209\n12: \"Ele disse \\\"correto\\\" no exemplo.\"",
        usage: {}
      }
    }
  });

  const result = await generateMicrosequenceCards({
    project: projectWithPlannedMicrosequence(),
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    provider,
    modelId: "fake:model"
  });

  assert.equal(result.version.cards[0].after, "Ele disse \"correto\" no exemplo.");
});

test("runtime estruturado falha quando a auditoria devolve patch inválido não numérico", async () => {
  const provider = createFakeProvider({
    structuredEngine: true,
    script: {
      bottom_up_micro_plan: {
        text: `CARD 1
1: 103
2: 204
3: 1103
4: 402
5: 502
6: praticar
7: matrix_locate_cell_choice`,
        usage: {}
      },
      bottom_up_card_build: [
        { text: "CARD 1\n1: Posição\n2: Observe a matriz.\n3: A\n4: 1|2\n5: 3|4\n6: 2\n7: 1\n8: Qual valor está na linha 2, coluna 1?\n9: 1\n10: 3\n11: 4\n12: Feedback genérico.", usage: {} }
      ],
      bottom_up_card_audit: [
        { text: "AUDIT\nCARD 1\naction: 1202\nvalues: [", usage: {} },
        { text: "AUDIT\nCARD 1\naction: 1202\nvalues: [", usage: {} }
      ]
    }
  });

  await assert.rejects(() => generateMicrosequenceCards({
    project: projectWithPlannedMicrosequence(),
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    provider,
    modelId: "fake:model"
  }), /Auditoria inválida|fail_closed/);
});

test("retry do build corrige slot textual com vazamento estrutural", async () => {
  const provider = createFakeProvider({
    structuredEngine: true,
    script: {
      bottom_up_card_build: [
        {
          text: "CARD 1\n1: Posição\n2: Observe a matriz.\n3: A\n4: 1|2\n5: 3|4\n6: 2\n7: 1\n8: Qual valor está na linha 2, coluna 1?\n9: 1\n10: 3\n11: 4\n12: CARD 2",
          usage: {}
        },
        {
          text: "CARD 1\n12: Primeiro vem a linha e depois a coluna.",
          usage: {}
        }
      ]
    }
  });
  const result = await runBottomUpCardBuild({
    provider,
    modelId: "fake:model",
    generationContract: { microsequence: { title: "Posição a_ij" } },
    planItems: [{ position: 1, templateId: "matrix_locate_cell_choice" }]
  });
  assert.equal(result.slotPackets[0].slots["12"], "Primeiro vem a linha e depois a coluna.");
  assert.equal(result.cards[0].after, "Primeiro vem a linha e depois a coluna.");
});

test("build falha quando choice_exercise mantém answer inválido sem fallback", async () => {
  const provider = createFakeProvider({
    structuredEngine: true,
    script: {
      bottom_up_card_build: [
        {
          text: "CARD 1\n1: Escolha\n2: Qual alternativa resolve o caso?\n3: opção correta\n4: distrator 1\n5: distrator 2\n6: z\n7: Explique o motivo.",
          usage: {}
        },
        {
          text: "CARD 1\n6: z",
          usage: {}
        },
        {
          text: "CARD 1\n6: z",
          usage: {}
        }
      ]
    }
  });

  await assert.rejects(() => runBottomUpCardBuild({
    provider,
    modelId: "fake:model",
    generationContract: { microsequence: { title: "Escolha simples" } },
    planItems: [{ position: 1, templateId: "choice_exercise", goal: "Escolher uma alternativa válida." }]
  }), /answerId inválido|fail_closed/i);
});
