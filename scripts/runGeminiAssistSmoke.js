import { runCourseForge } from "../src/generation/courseForge/courseForgeRunner.js";
import { resolveCourseForgeLaunchConfig } from "../src/generation/runtime/courseForgeLaunchConfig.js";

const apiKey =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_AI_API_KEY;
const selectedModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fail(message) {
  throw new Error(message);
}

function createSmokeProjectDocument() {
  return {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [
      {
        key: "course-smoke",
        title: "Curso de smoke",
        description: "Projeto mínimo para validar o fluxo real do CourseForge com Gemini.",
        modules: [
          {
            key: "module-shell",
            title: "Shell Linux",
            description: "Módulo mínimo de teste.",
            lessons: [
              {
                key: "lesson-navegacao",
                title: "Navegação básica no terminal",
                description: "Lição vazia para o smoke real do runtime atual.",
                sourceGuideStructured: {
                  lessonGoal: "Fazer o aluno navegar pelo sistema de arquivos com cd, pwd e ls.",
                  lessonPrerequisites: "Assumir apenas leitura básica de caminhos e noção simples de pasta.",
                  notationRules: "Usar comandos com crases e mostrar caminhos curtos como `/home/aluno`.",
                  commonErrors: "Confundir diretório atual com conteúdo listado e usar `cd` sem destino.",
                  masteryGoal: "Interpretar pwd, listar com ls e trocar de diretório com exemplos curtos."
                },
                microsequences: []
              }
            ]
          }
        ]
      }
    ]
  };
}

function assessGeneratedLesson(projectDocument = {}) {
  const lesson = projectDocument?.courses?.[0]?.modules?.[0]?.lessons?.[0];
  const microsequences = Array.isArray(lesson?.microsequences) ? lesson.microsequences : [];
  const issues = [];

  if (!microsequences.length) {
    issues.push("nenhuma microssequência foi criada");
    return { issues, microsequences };
  }

  microsequences.forEach((microsequence, microIndex) => {
    const cards = Array.isArray(microsequence?.cards) ? microsequence.cards : [];
    if (!text(microsequence?.title)) {
      issues.push(`microssequência ${microIndex + 1} sem título`);
    }
    if (cards.length < 3) {
      issues.push(`microssequência ${microIndex + 1} com poucos cards (${cards.length})`);
    }
    cards.forEach((card, cardIndex) => {
      if (!text(card?.title)) {
        issues.push(`card ${microIndex + 1}.${cardIndex + 1} sem título`);
      }
      const hasBody = [card?.say, card?.ask, card?.code, card?.table, card?.flow, card?.tree, card?.matrix, card?.plane]
        .some((value) => (typeof value === "string" ? text(value) : value));
      if (!hasBody) {
        issues.push(`card ${microIndex + 1}.${cardIndex + 1} sem conteúdo útil`);
      }
    });
  });

  return { issues, microsequences };
}

function summarizeMicrosequences(microsequences = []) {
  return microsequences
    .map((microsequence, index) => {
      const cards = Array.isArray(microsequence?.cards) ? microsequence.cards : [];
      const cardTitles = cards.map((card) => text(card?.title) || "Card sem título").join(" | ");
      return `${index + 1}. ${text(microsequence?.title) || "Microssequência sem título"} (${cards.length} cards)\n   ${cardTitles}`;
    })
    .join("\n");
}

if (!apiKey) {
  fail("Defina GEMINI_API_KEY, GOOGLE_API_KEY ou GOOGLE_AI_API_KEY no ambiente antes de rodar este teste.");
}

const projectDocument = createSmokeProjectDocument();
const launchConfig = resolveCourseForgeLaunchConfig({
  selectedModel,
  apiKey
});

const result = await runCourseForge({
  intent: {
    operation: "create",
    scope: {
      level: "lesson",
      courseKey: "course-smoke",
      moduleKey: "module-shell",
      lessonKey: "lesson-navegacao"
    },
    promptText: "Crie uma microssequência curta e prática para iniciantes sobre pwd, ls e cd, com foco em navegação básica no terminal.",
    attachments: []
  },
  projectDocument,
  providerRegistry: launchConfig.providerRegistry,
  providerId: launchConfig.providerId
});

const { issues, microsequences } = assessGeneratedLesson(result.projectDocument);
const patchOperations = Array.isArray(result?.patch?.operations) ? result.patch.operations.length : 0;

console.log(`Modelo: ${selectedModel}`);
console.log(`Patch operations: ${patchOperations}`);
console.log(summarizeMicrosequences(microsequences));

if (!patchOperations) {
  fail("O smoke não produziu operações de patch.");
}

if (issues.length) {
  fail(`O smoke gerou conteúdo inválido: ${issues.join("; ")}`);
}

console.log("Smoke concluído com sucesso.");
