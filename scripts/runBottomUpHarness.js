import { createFakeProvider } from "../src/generation/providers/fakeProvider.js";
import { addPracticeToMicrosequence } from "../src/generation/bottomUp/addPracticeToMicrosequence.js";
import { generateMicrosequenceCards } from "../src/generation/bottomUp/generateMicrosequenceCards.js";
import { planCourseFromScope } from "../src/generation/topDown/planCourseFromScope.js";
import { createEmptyProjectDocument } from "../src/domain/aralearnProject.js";

function parseEnvelope(prompt = "") {
  return JSON.parse(String(prompt).split("\n").slice(1).join("\n"));
}

function buildDraftFromPlan(plan = [], resources = []) {
  return plan.map((item) => {
    if (item.role === "example") {
      return {
        position: item.position,
        resource: "code",
        kind: "theory",
        exercise: "none",
        goal: "Mostrar o comando em um caso mínimo."
      };
    }
    if (item.role === "fix_error") {
      return {
        position: item.position,
        resource: "choice",
        kind: "exercise",
        exercise: "choice",
        goal: "Separar a função correta do comando do erro provável."
      };
    }
    if (item.role === "practice" || item.role === "practice_more" || item.role === "review") {
      if (Array.isArray(resources) && resources.includes("code")) {
        return {
          position: item.position,
          resource: "code",
          kind: "exercise",
          exercise: "choice",
          goal: "Fazer o aluno ler o comando e escolher o efeito correto."
        };
      }
      return {
        position: item.position,
        resource: "paragraph",
        kind: "exercise",
        exercise: "gap",
        goal: "Fazer o aluno aplicar o comando em prática fechada."
      };
    }
    return {
      position: item.position,
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      goal: item.role === "next" ? "Consolidar o comando e preparar o próximo passo." : "Explicar a função central do comando."
    };
  });
}

function buildCardsFromPlan(plan = [], variant = "initial") {
  return plan.map((item, index) => {
    if (item.kind === "exercise" && item.exercise === "choice" && item.resource !== "choice") {
      const isMorePractice = item.role === "practice_more";
      const practiceVariantIndex = Math.max(0, (Number(item.position) || index + 1) - 3);
      const morePracticePrompts = [
        "Observe o novo comando no outro contexto.",
        "Observe a variação curta do comando.",
        "Observe o comando em um caso resumido.",
        "Observe o comando em outro estado do repositório."
      ];
      const morePracticeCodes = ["git status --short", "git status -sb", "git status --short", "git status -sb"];
      const morePracticeQuestions = [
        "Qual opção corresponde ao uso mais adequado no novo caso mostrado?",
        "Qual opção corresponde melhor à leitura desta variação curta?",
        "Qual opção corresponde ao efeito principal neste caso resumido?",
        "Qual opção corresponde à leitura correta neste outro estado?"
      ];
      const morePracticeOptions = [
        [
          { id: "a", text: "Inspecionar o estado depois de editar um arquivo" },
          { id: "b", text: "Apagar o histórico do repositório" },
          { id: "c", text: "Enviar alterações para o repositório remoto" }
        ],
        [
          { id: "a", text: "Ver o estado local de forma resumida" },
          { id: "b", text: "Descartar mudanças não salvas" },
          { id: "c", text: "Criar um commit automaticamente" }
        ],
        [
          { id: "a", text: "Ler mudanças curtas antes de decidir o próximo passo" },
          { id: "b", text: "Apagar arquivos não rastreados" },
          { id: "c", text: "Mesclar a branch atual" }
        ],
        [
          { id: "a", text: "Inspecionar outro estado do repositório sem alterar arquivos" },
          { id: "b", text: "Enviar tudo para o remoto imediatamente" },
          { id: "c", text: "Apagar a branch atual" }
        ]
      ];
      const base = {
        position: item.position,
        resource: item.resource,
        kind: "exercise",
        exercise: "choice",
        title: item.role === "review" ? "Revisão objetiva" : "Leitura guiada",
        question: isMorePractice
          ? morePracticeQuestions[practiceVariantIndex % morePracticeQuestions.length]
          : "Qual opção corresponde ao efeito principal do caso mostrado?",
        options: isMorePractice
          ? morePracticeOptions[practiceVariantIndex % morePracticeOptions.length]
          : [
              { id: "a", text: "Mostrar o estado atual do repositório" },
              { id: "b", text: "Apagar o histórico local" },
              { id: "c", text: "Criar uma branch remota" }
            ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: isMorePractice
          ? "A nova variação continua exigindo leitura do estado, mas em outro contexto."
          : "A leitura correta continua sendo inspeção do estado."
      };
      if (item.resource === "code") {
        return {
          ...base,
          title: isMorePractice ? "Variação de prática em comando" : "Prática em comando",
          prompt: isMorePractice
            ? morePracticePrompts[practiceVariantIndex % morePracticePrompts.length]
            : "Observe o comando.",
          language: "bash",
          code: isMorePractice ? morePracticeCodes[practiceVariantIndex % morePracticeCodes.length] : "git status"
        };
      }
      if (item.resource === "table") {
        return {
          ...base,
          columns: ["Situação", "Comando"],
          rows: isMorePractice
            ? [[
                morePracticeOptions[practiceVariantIndex % morePracticeOptions.length][0].text,
                morePracticeCodes[practiceVariantIndex % morePracticeCodes.length]
              ]]
            : [["Inspecionar o estado local", "git status"]]
        };
      }
    }
    if (item.resource === "paragraph" && item.kind === "theory") {
      return {
        position: item.position,
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: index === 0 && variant === "practice" ? "Lembrete rápido" : item.role === "next" ? "Fechamento" : "O que o comando faz",
        text:
          item.role === "next"
            ? "Use `git status` antes e depois de mudanças relevantes para confirmar o estado do repositório."
            : "O comando `git status` mostra o estado atual do repositório.",
        after:
          item.role === "next"
            ? "Isso ajuda a consolidar a leitura básica do fluxo local."
            : "Ele não altera arquivos; apenas inspeciona o estado atual."
      };
    }
    if (item.resource === "code") {
      return {
        position: item.position,
        resource: "code",
        kind: "theory",
        exercise: "none",
        title: "Exemplo mínimo",
        prompt: "Observe o comando.",
        language: "bash",
        code: "git status",
        after: "Esse é o formato mínimo do comando."
      };
    }
    if (item.resource === "table") {
      return {
        position: item.position,
        resource: "table",
        kind: "theory",
        exercise: "none",
        title: "Leitura guiada",
        columns: ["Situação", "Comando"],
        rows: [["Inspecionar o estado local", "git status"]],
        after: "A tabela mantém o foco no comando de inspeção."
      };
    }
    if (item.resource === "choice") {
      return {
        position: item.position,
        resource: "choice",
        kind: "exercise",
        exercise: "choice",
        title: "Função correta",
        question: item.role === "fix_error"
          ? "Qual opção corrige a leitura errada do comando?"
          : "Qual opção corresponde ao efeito principal do comando?",
        options: item.role === "fix_error"
          ? [
              { id: "a", text: "O comando só inspeciona o estado atual" },
              { id: "b", text: "O comando publica alterações no remoto" },
              { id: "c", text: "O comando apaga arquivos rastreados" }
            ]
          : [
              { id: "a", text: "Mostrar o estado atual do repositório" },
              { id: "b", text: "Apagar o histórico local" },
              { id: "c", text: "Criar uma branch remota" }
            ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: item.role === "fix_error"
          ? "A correção é lembrar que `git status` só inspeciona o estado atual."
          : "A leitura correta continua sendo inspeção do estado."
      };
    }
    return {
      position: item.position,
      resource: "paragraph",
      kind: "exercise",
      exercise: "gap",
      title: item.role === "fix_error" ? "Erro provável" : "Prática guiada",
      text:
        item.role === "fix_error"
          ? "É erro pensar que `git status` [[altera arquivos::altera arquivos|só inspeciona o estado|mostra mudanças locais]]."
          : "Para inspecionar o estado do repositório, use [[git status::git status|git clone|git add]].",
      after:
        item.role === "fix_error"
          ? "`git status` não altera arquivos; ele apenas inspeciona o estado atual."
          : "O comando correto para inspeção é `git status`."
    };
  });
}

const fakeProvider = createFakeProvider({
  script: {
    "plan-scope": {
      course: {
        title: "Git e GitHub",
        goal: "Criar repertório mínimo com prática fechada.",
        modules: [
          {
            title: "Comandos básicos",
            guide: {
              goal: "Introduzir o primeiro comando operacional do fluxo local.",
              include: ["git status"],
              exclude: ["git rebase"],
              notation: ["Use comandos em minúsculas."],
              avoid: ["Não confundir inspeção com alteração."]
            },
            lessons: [
              {
                title: "Primeiros comandos",
                guide: {
                  goal: "Introduzir o primeiro comando operacional do fluxo local.",
                  include: ["git status"],
                  exclude: ["git rebase"],
                  notation: ["Use comandos em minúsculas."],
                  avoid: ["Não confundir inspeção com alteração."]
                },
                microsequences: [
                  {
                    id: "microsequence-git-status",
                    title: "git status",
                    goal: "Entender o estado do repositório.",
                    role: "explain",
                    dependsOn: [],
                    covers: ["git status"],
                    checks: ["o aluno reconhece a função do comando"]
                  }
                ]
              }
            ]
          }
        ]
      }
    },
    "plan-microsequence": [
      {
        type: "code_or_command",
        size: "medium",
        goal: "Explicar o comando e fechar com prática básica.",
        extraResources: ["code"],
        sources: [],
        reason: "Abrir com explicação e exemplo de comando."
      },
      {
        type: "guided_practice",
        size: "long",
        goal: "Adicionar mais prática fechada com o mesmo comando.",
        extraResources: ["code"],
        sources: [],
        reason: "Aumentar a prática mantendo o foco local."
      }
    ],
    "draft-cards": [
      (request) => {
        const envelope = parseEnvelope(request.prompt);
        return {
          draft: buildDraftFromPlan(envelope.plan, envelope.resources)
        };
      },
      (request) => {
        const envelope = parseEnvelope(request.prompt);
        return {
          draft: buildDraftFromPlan(envelope.plan, envelope.resources)
        };
      }
    ],
    "write-cards": [
      (request) => {
        const envelope = parseEnvelope(request.prompt);
        return {
          summary: "Versão inicial da microssequência.",
          cards: buildCardsFromPlan(envelope.plan, "initial")
        };
      },
      (request) => {
        const envelope = parseEnvelope(request.prompt);
        return {
          summary: "Versão com mais prática.",
          cards: buildCardsFromPlan(envelope.plan, "practice")
        };
      }
    ]
  }
});

const planned = await planCourseFromScope({
  scopeContract: {
    schemaVersion: "aralearn.scope.v1",
    course: { title: "Git e GitHub", goal: "Criar repertório mínimo com prática fechada.", evidencePriority: ["exercise_list"] },
    modules: [
      {
        title: "Comandos básicos",
        include: ["git status"],
        exclude: ["git rebase"],
        assessmentStyle: "practical"
      }
    ]
  },
  provider: fakeProvider,
  modelId: "fake:model",
  project: createEmptyProjectDocument()
});

const selection = {
  courseKey: planned.project.courses[0].id,
  moduleKey: planned.project.courses[0].modules[0].id,
  lessonKey: planned.project.courses[0].modules[0].lessons[0].id,
  microsequenceKey: planned.project.courses[0].modules[0].lessons[0].microsequences[0].id
};

const generated = await generateMicrosequenceCards({
  project: planned.project,
  selection,
  provider: fakeProvider,
  modelId: "fake:model"
});

const practiced = await addPracticeToMicrosequence({
  project: generated.project,
  selection,
  provider: fakeProvider,
  modelId: "fake:model"
});

console.log(JSON.stringify(practiced.project, null, 2));
