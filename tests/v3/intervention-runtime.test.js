import test from "node:test";
import assert from "node:assert/strict";

import { createFakeProvider } from "../../src/generation/providers/fakeProvider.js";
import { executeMicrosequenceGeneration } from "../../src/generation/runtime/interventionRuntime.js";

function projectWithSinglePlannedMicrosequence() {
  return {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [
      {
        id: "course-a",
        title: "Curso A",
        goal: "Cobrir apenas conjunção.",
        modules: [
          {
            id: "module-a",
            title: "Lógica",
            guide: {
              goal: "Explicar apenas conjunção.",
              include: ["conjunção", "tabela-verdade"],
              exclude: ["predicados"],
              notation: ["Use P e Q."],
              avoid: ["Não abrir outro tópico."]
            },
            lessons: [
              {
                id: "lesson-a",
                title: "Conjunção",
                guide: {
                  goal: "Explicar apenas conjunção.",
                  include: ["conjunção", "tabela-verdade"],
                  exclude: ["predicados"],
                  notation: ["Use P e Q."],
                  avoid: ["Não abrir outro tópico."]
                },
                topics: [],
                microsequences: [
                  {
                    id: "micro-a",
                    title: "Quando P e Q são verdadeiras",
                    goal: "Reconhecer a linha verdadeira da conjunção.",
                    role: "explain",
                    status: "planned",
                    dependsOn: [],
                    covers: ["conjunção"],
                    checks: ["o aluno reconhece a linha verdadeira"],
                    versions: [],
                    activeVersion: null
                  },
                  {
                    id: "micro-next",
                    title: "Tabela-verdade da conjunção",
                    goal: "Aplicar a regra na tabela-verdade.",
                    role: "practice",
                    status: "planned",
                    dependsOn: ["micro-a"],
                    covers: ["tabela-verdade"],
                    checks: ["o aluno encontra a linha verdadeira"],
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

function projectWithGeneratedCurrentAndPlannedNext() {
  const project = projectWithSinglePlannedMicrosequence();
  project.courses[0].modules[0].lessons[0].microsequences[0] = {
    id: "micro-a",
    title: "Base",
    goal: "Estabelecer a regra.",
    role: "explain",
    status: "generated",
    dependsOn: [],
    covers: ["conjunção"],
    checks: ["o aluno reconhece a regra"],
    versions: [
      {
        id: "version-a",
        createdAt: "2026-05-23T00:00:00.000Z",
        source: "manual",
        action: "generate",
        request: "",
        summary: "Base pronta.",
        cards: [
          {
            position: 1,
            resource: "paragraph",
            kind: "theory",
            exercise: "none",
            title: "Base",
            text: "Explicação objetiva da regra local.",
            after: ""
          }
        ],
        validation: { ok: true, issues: [] }
      }
    ],
    activeVersion: "version-a"
  };
  project.courses[0].modules[0].lessons[0].microsequences[1] = {
    id: "micro-b",
    title: "Próxima etapa",
    goal: "Aplicar a regra em tabela.",
    role: "practice",
    status: "planned",
    dependsOn: ["micro-a"],
    covers: ["tabela-verdade"],
    checks: ["o aluno aplica a regra na tabela"],
    versions: [],
    activeVersion: null
  };
  return project;
}

function basicStructuredProvider() {
  return createFakeProvider({
    script: {
      bottom_up_micro_plan: {
        text: [
          "CARD 1",
          "1: 101",
          "2: 201",
          "3: 1101",
          "4: 401",
          "5: 501",
          "6: abrir",
          "7: paragraph_theory",
          "CARD 2",
          "1: 102",
          "2: 203",
          "3: 1103",
          "4: 401",
          "5: 501",
          "6: praticar",
          "7: choice_exercise",
          "CARD 3",
          "1: 101",
          "2: 202",
          "3: 1106",
          "4: 401",
          "5: 501",
          "6: fixar",
          "7: paragraph_gap"
        ].join("\n"),
        usage: {}
      },
      bottom_up_card_build: [
        { text: "CARD 1\n1: Regra da conjunção\n2: Na conjunção, só a linha em que P e Q são verdadeiras produz V.\n3: Revise a linha verdadeira." },
        { text: "CARD 2\n1: Prática da conjunção\n2: Na conjunção, qual leitura está correta?\n3: A conjunção só é verdadeira quando P e Q são verdadeiras\n4: A conjunção é verdadeira quando apenas P é verdadeira\n5: A conjunção ignora uma das proposições\n6: a\n7: Confira a linha correta." },
        { text: "CARD 3\n1: Correção do erro comum\n2: Complete a regra da conjunção quando um aluno confunde a linha verdadeira\n3: P e Q são verdadeiras\n4: só P é verdadeira\n5: só Q é verdadeira\n6: A linha correta exige as duas proposições verdadeiras." }
      ],
      bottom_up_card_audit: {
        text: "AUDIT\nstatus: 1201",
        usage: {}
      },
      branch_microsequence_structure: {
        text: JSON.stringify({
          title: "Revisão curta da regra",
          goal: "Retomar a regra central antes da prática seguinte.",
          role: "support",
          covers: ["conjunção"],
          checks: ["o aluno retoma a regra central"]
        }),
        usage: {}
      }
    }
  });
}

function mediumStructuredProvider() {
  return createFakeProvider({
    script: {
      bottom_up_micro_plan: {
        text: [
          "CARD 1",
          "1: 101",
          "2: 201",
          "3: 1101",
          "4: 401",
          "5: 501",
          "6: abrir",
          "7: paragraph_theory",
          "CARD 2",
          "1: 102",
          "2: 203",
          "3: 1103",
          "4: 401",
          "5: 501",
          "6: praticar",
          "7: choice_exercise",
          "CARD 3",
          "1: 102",
          "2: 203",
          "3: 1104",
          "4: 401",
          "5: 501",
          "6: variar",
          "7: choice_exercise",
          "CARD 4",
          "1: 101",
          "2: 202",
          "3: 1105",
          "4: 401",
          "5: 501",
          "6: corrigir erro",
          "7: paragraph_gap",
          "CARD 5",
          "1: 101",
          "2: 201",
          "3: 1107",
          "4: 401",
          "5: 501",
          "6: consolidar",
          "7: paragraph_theory"
        ].join("\n"),
        usage: {}
      },
      bottom_up_card_build: [
        { text: "CARD 1\n1: Regra da conjunção\n2: Na conjunção, só a linha em que P e Q são verdadeiras produz V.\n3: Revise a linha verdadeira." },
        { text: "CARD 2\n1: Prática 1\n2: Na conjunção, qual leitura está correta?\n3: A conjunção só é verdadeira quando P e Q são verdadeiras\n4: A conjunção é verdadeira quando apenas P é verdadeira\n5: A conjunção ignora uma das proposições\n6: a\n7: Confira a linha correta." },
        { text: "CARD 3\n1: Prática 2\n2: Na tabela-verdade, qual linha mantém V na conjunção?\n3: A linha com P=V e Q=V\n4: A linha com P=V e Q=F\n5: A linha com P=F e Q=V\n6: a\n7: Compare com a linha verdadeira." },
        { text: "CARD 4\n1: Corrija o erro\n2: Complete a regra da conjunção quando um aluno confunde a linha verdadeira\n3: P e Q são verdadeiras\n4: só P é verdadeira\n5: só Q é verdadeira\n6: A linha correta exige as duas proposições verdadeiras." },
        { text: "CARD 5\n1: Fechamento\n2: A tabela-verdade da conjunção mantém V apenas na linha em que as duas proposições são verdadeiras.\n3: Use essa regra no próximo passo." }
      ],
      bottom_up_card_audit: {
        text: "AUDIT\nstatus: 1201",
        usage: {}
      },
      branch_microsequence_structure: {
        text: JSON.stringify({
          title: "Revisão curta da regra",
          goal: "Retomar a regra central antes da prática seguinte.",
          role: "support",
          covers: ["conjunção"],
          checks: ["o aluno retoma a regra central"]
        }),
        usage: {}
      }
    }
  });
}

function branchStructuredProvider() {
  return createFakeProvider({
    script: {
      bottom_up_micro_plan: {
        text: [
          "CARD 1",
          "1: 101",
          "2: 201",
          "3: 1101",
          "4: 401",
          "5: 501",
          "6: abrir",
          "7: paragraph_theory",
          "CARD 2",
          "1: 102",
          "2: 203",
          "3: 1102",
          "4: 401",
          "5: 501",
          "6: materializar",
          "7: choice_exercise",
          "CARD 3",
          "1: 102",
          "2: 203",
          "3: 1103",
          "4: 401",
          "5: 501",
          "6: praticar",
          "7: choice_exercise",
          "CARD 4",
          "1: 101",
          "2: 202",
          "3: 1105",
          "4: 401",
          "5: 501",
          "6: corrigir erro",
          "7: paragraph_gap",
          "CARD 5",
          "1: 101",
          "2: 201",
          "3: 1107",
          "4: 401",
          "5: 501",
          "6: consolidar",
          "7: paragraph_theory"
        ].join("\n"),
        usage: {}
      },
      bottom_up_card_build: [
        { text: "CARD 1\n1: Regra central\n2: Na conjunção, só o caso em que P e Q são verdadeiras produz V.\n3: Retome a regra central." },
        { text: "CARD 2\n1: Caso materializado\n2: Qual leitura acompanha a regra da conjunção?\n3: As duas proposições precisam ser verdadeiras\n4: Basta uma proposição verdadeira\n5: A ordem muda o resultado lógico\n6: a\n7: Compare com a regra central." },
        { text: "CARD 3\n1: Prática curta\n2: Qual caso mantém V na conjunção?\n3: P=V e Q=V\n4: P=V e Q=F\n5: P=F e Q=V\n6: a\n7: Volte ao caso em que as duas são verdadeiras." },
        { text: "CARD 4\n1: Corrija o erro\n2: Complete a regra da conjunção quando alguém esquece uma das proposições\n3: as duas proposições são verdadeiras\n4: só P é verdadeira\n5: só Q é verdadeira\n6: A regra exige as duas proposições verdadeiras." },
        { text: "CARD 5\n1: Fechamento\n2: A conjunção continua verdadeira apenas quando P e Q são verdadeiras.\n3: Siga para a próxima etapa mantendo essa regra." }
      ],
      bottom_up_card_audit: {
        text: "AUDIT\nstatus: 1201",
        usage: {}
      },
      branch_microsequence_structure: {
        text: JSON.stringify({
          title: "Revisão curta da regra",
          goal: "Retomar a regra central antes da prática seguinte.",
          role: "support",
          covers: ["conjunção"],
          checks: ["o aluno retoma a regra central"]
        }),
        usage: {}
      }
    }
  });
}

test("generate_current no runtime de intervenção gera a microssequência atual e preserva a UX de feedback", async () => {
  const provider = basicStructuredProvider();
  const feedbackUpdates = [];
  const result = await executeMicrosequenceGeneration({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      actionIntent: "generate_current",
      interventionTargetMode: "current",
      operationMode: "reinforce",
      promptText: "Reforce a diferença entre a linha verdadeira e as demais.",
      microsequenceTitle: "Quando P e Q são verdadeiras",
      attachments: []
    },
    assistConfig: {
      model: "fake:model"
    },
    selectedRefIds: [],
    preferredContainerId: "choice",
    preferredContainerLabel: "Escolha",
    lessonContext: {
      currentMicrosequenceTitle: "Quando P e Q são verdadeiras",
      microsequenceKeys: ["micro-a"],
      reusableMicrosequenceCount: 1
    },
    projectDocument: projectWithSinglePlannedMicrosequence(),
    provider,
    onFeedback: (feedback) => feedbackUpdates.push(feedback),
    ingestAttachments: async () => ({
      attachments: [],
      warnings: [],
      extractedCount: 0
    })
  });

  assert.equal(result.status, "success");
  assert.equal(feedbackUpdates.some((item) => item.status === "running"), true);
  assert.match(result.generationResult.interventionFeedback.feedbackText, /Plano local validado\./);
  assert.match(result.generationResult.interventionFeedback.feedbackText, /Plano fino estruturado validado\./);
  assert.match(result.generationResult.interventionFeedback.feedbackText, /Validação final concluída\./);
  assert.equal(result.generationResult.projectDocument.courses[0].modules[0].lessons[0].microsequences[0].status, "generated");
});

test("next_planned gera a próxima microssequência planejada quando a dependência já está satisfeita", async () => {
  const provider = mediumStructuredProvider();
  const result = await executeMicrosequenceGeneration({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      actionIntent: "next_planned",
      interventionTargetMode: "current",
      operationMode: "reinforce",
      promptText: ""
    },
    assistConfig: {
      model: "fake:model"
    },
    selectedRefIds: [],
    preferredContainerId: "",
    preferredContainerLabel: "",
    lessonContext: {
      currentMicrosequenceTitle: "Base",
      microsequenceKeys: ["micro-a", "micro-b"],
      reusableMicrosequenceCount: 2
    },
    projectDocument: projectWithGeneratedCurrentAndPlannedNext(),
    provider,
    ingestAttachments: async () => ({
      attachments: [],
      warnings: [],
      extractedCount: 0
    })
  });

  assert.equal(result.status, "success");
  assert.equal(result.generationResult.patch.target.microsequenceKey, "micro-b");
});

test("a primeira materialização aceita prompt vazio quando allowPromptlessSubmit está ativo", async () => {
  const provider = basicStructuredProvider();
  const result = await executeMicrosequenceGeneration({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      actionIntent: "generate_current",
      interventionTargetMode: "current",
      operationMode: "reinforce",
      promptText: "",
      microsequenceTitle: "Quando P e Q são verdadeiras",
      attachments: [],
      allowPromptlessSubmit: true
    },
    assistConfig: {
      model: "fake:model"
    },
    selectedRefIds: [],
    preferredContainerId: "",
    preferredContainerLabel: "",
    lessonContext: {
      currentMicrosequenceTitle: "Quando P e Q são verdadeiras",
      microsequenceKeys: ["micro-a", "micro-next"],
      reusableMicrosequenceCount: 2
    },
    projectDocument: projectWithSinglePlannedMicrosequence(),
    provider,
    ingestAttachments: async () => ({
      attachments: [],
      warnings: [],
      extractedCount: 0
    })
  });

  assert.equal(result.status, "success");
  assert.equal(result.preparedIntervention.promptText.includes("Preserve"), true);
});

test("repair_current gera nova versão com action repair", async () => {
  const provider = basicStructuredProvider();
  const project = projectWithGeneratedCurrentAndPlannedNext();
  const result = await executeMicrosequenceGeneration({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      actionIntent: "generate_current",
      interventionTargetMode: "current",
      operationMode: "repair",
      promptText: "Ajuste apenas a prática final."
    },
    assistConfig: {
      model: "fake:model"
    },
    selectedRefIds: [],
    preferredContainerId: "",
    preferredContainerLabel: "",
    lessonContext: {
      currentMicrosequenceTitle: "Base",
      microsequenceKeys: ["micro-a", "micro-b"],
      reusableMicrosequenceCount: 2
    },
    projectDocument: project,
    provider,
    ingestAttachments: async () => ({
      attachments: [],
      warnings: [],
      extractedCount: 0
    })
  });

  assert.equal(result.status, "success");
  const repairedMicrosequence = result.generationResult.projectDocument.courses[0].modules[0].lessons[0].microsequences[0];
  assert.equal(repairedMicrosequence.versions.at(-1)?.action, "repair");
});

test("branch_after_current cria uma nova microssequência local antes de voltar à trilha principal", async () => {
  const provider = branchStructuredProvider();
  const result = await executeMicrosequenceGeneration({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      actionIntent: "branch_after_current",
      interventionTargetMode: "new_after_current",
      operationMode: "reinforce",
      promptText: "Abra uma revisão curta antes da próxima prática."
    },
    assistConfig: {
      model: "fake:model"
    },
    selectedRefIds: [],
    preferredContainerId: "",
    preferredContainerLabel: "",
    lessonContext: {
      currentMicrosequenceTitle: "Quando P e Q são verdadeiras",
      microsequenceKeys: ["micro-a", "micro-next"],
      reusableMicrosequenceCount: 2
    },
    projectDocument: projectWithSinglePlannedMicrosequence(),
    provider,
    ingestAttachments: async () => ({
      attachments: [],
      warnings: [],
      extractedCount: 0
    })
  });

  assert.equal(result.status, "success");
  const microsequences = result.generationResult.projectDocument.courses[0].modules[0].lessons[0].microsequences;
  assert.equal(microsequences.length >= 3, true);
  assert.equal(microsequences[1].branchOf, "micro-a");
});

test("a retomada reaproveita plan e draft quando o build falha no compile", async () => {
  const provider = createFakeProvider({
    script: {
      bottom_up_micro_plan: {
        text: [
          "CARD 1",
          "1: 101",
          "2: 201",
          "3: 1101",
          "4: 401",
          "5: 501",
          "6: abrir",
          "7: paragraph_theory",
          "CARD 2",
          "1: 102",
          "2: 203",
          "3: 1103",
          "4: 401",
          "5: 501",
          "6: praticar",
          "7: choice_exercise",
          "CARD 3",
          "1: 101",
          "2: 202",
          "3: 1106",
          "4: 401",
          "5: 501",
          "6: fixar",
          "7: paragraph_gap"
        ].join("\n"),
        usage: {}
      },
      bottom_up_card_build: [
        new Error("Timeout no provider."),
        { text: "CARD 1\n1: Regra da conjunção\n2: Na conjunção, só a linha em que P e Q são verdadeiras produz V.\n3: Revise a linha verdadeira." },
        { text: "CARD 2\n1: Prática da conjunção\n2: Na conjunção, qual leitura está correta?\n3: A conjunção só é verdadeira quando P e Q são verdadeiras\n4: A conjunção é verdadeira quando apenas P é verdadeira\n5: A conjunção ignora uma das proposições\n6: a\n7: Confira a linha correta." },
        { text: "CARD 3\n1: Correção do erro comum\n2: Complete a regra da conjunção quando um aluno confunde a linha verdadeira\n3: P e Q são verdadeiras\n4: só P é verdadeira\n5: só Q é verdadeira\n6: A linha correta exige as duas proposições verdadeiras." }
      ],
      bottom_up_card_audit: {
        text: "AUDIT\nstatus: 1201",
        usage: {}
      }
    }
  });

  const firstAttempt = await executeMicrosequenceGeneration({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      actionIntent: "generate_current",
      interventionTargetMode: "current",
      operationMode: "reinforce",
      promptText: "Reforce a linha verdadeira da conjunção."
    },
    assistConfig: {
      model: "fake:model"
    },
    selectedRefIds: [],
    preferredContainerId: "",
    preferredContainerLabel: "",
    lessonContext: {
      currentMicrosequenceTitle: "Quando P e Q são verdadeiras",
      microsequenceKeys: ["micro-a"],
      reusableMicrosequenceCount: 1
    },
    projectDocument: projectWithSinglePlannedMicrosequence(),
    provider,
    ingestAttachments: async () => ({
      attachments: [],
      warnings: [],
      extractedCount: 0
    })
  });

  assert.equal(firstAttempt.status, "error");
  assert.equal(firstAttempt.interventionFeedback.run.resumeFrom, "compile");

  const secondAttempt = await executeMicrosequenceGeneration({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      actionIntent: "generate_current",
      interventionTargetMode: "current",
      operationMode: "reinforce",
      promptText: "Reforce a linha verdadeira da conjunção."
    },
    assistConfig: {
      model: "fake:model"
    },
    selectedRefIds: [],
    preferredContainerId: "",
    preferredContainerLabel: "",
    lessonContext: {
      currentMicrosequenceTitle: "Quando P e Q são verdadeiras",
      microsequenceKeys: ["micro-a"],
      reusableMicrosequenceCount: 1
    },
    projectDocument: projectWithSinglePlannedMicrosequence(),
    provider,
    resumeSession: firstAttempt.interventionFeedback,
    ingestAttachments: async () => ({
      attachments: [],
      warnings: [],
      extractedCount: 0
    })
  });

  assert.equal(secondAttempt.status, "success");
  assert.match(secondAttempt.generationResult.interventionFeedback.feedbackText, /Retomando da etapa compile\./);
  assert.match(secondAttempt.generationResult.interventionFeedback.feedbackText, /Plano fino reaproveitado da etapa anterior\./);
});
