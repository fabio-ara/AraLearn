import { createFakeProvider } from "../src/generation/providers/fakeProvider.js";
import { planCourseFromScope } from "../src/generation/topDown/planCourseFromScope.js";
import { createEmptyProjectDocument } from "../src/domain/aralearnProject.js";

const scopeContract = {
  schemaVersion: "aralearn.scope.v1",
  course: {
    title: "Matemática para Informática",
    goal: "Levar um estudante iniciante a resolver a etapa introdutória de Teoria dos Grafos no estilo esperado em prova.",
    evidencePriority: ["notebook", "exercise_list", "exam"]
  },
  modules: [
    {
      title: "Teoria dos Grafos",
      include: [
        "pontes de Königsberg e modelagem por grafos",
        "definição formal de grafo",
        "vértices, arestas, adjacência e incidência"
      ],
      exclude: [
        "grafos direcionados",
        "planaridade",
        "coloração"
      ],
      notes: "Partir de problemas concretos antes da formalização e manter progressão explícita.",
      assessmentStyle: "mixed"
    }
  ]
};

const fakeProvider = createFakeProvider({
  script: {
    "plan-scope": {
      course: {
        title: "Matemática para Informática",
        goal: "Levar um estudante iniciante a resolver a lista introdutória de Teoria dos Grafos no estilo esperado em prova.",
        modules: [
          {
            title: "Teoria dos Grafos",
            lessons: [
              {
                title: "Modelagem e definição de grafos",
                goal: "Representar situações simples como grafos e identificar seus elementos formais.",
                sourceGuideStructured: {
                  lessonGoal: "Transformar situações concretas em vértices e arestas antes da formalização.",
                  notationRules: "pontes de Königsberg e modelagem por grafos, definição formal de grafo, vértices, arestas, adjacência e incidência",
                  commonErrors: "Não confundir desenho com estrutura do grafo nem adjacência com incidência."
                },
                microsequences: [
                  {
                    title: "Pontes, pontos e ligações",
                    goal: "Modelar um problema concreto com vértices e arestas.",
                    dependsOnTitles: [],
                    scopeLabels: ["pontes de Königsberg e modelagem por grafos"]
                  },
                  {
                    title: "Definição G = (V, A)",
                    goal: "Escrever um grafo como conjunto de vértices e conjunto de arestas.",
                    dependsOnTitles: ["Pontes, pontos e ligações"],
                    scopeLabels: ["definição formal de grafo"]
                  },
                  {
                    title: "Adjacência e incidência",
                    goal: "Distinguir relações entre vértices e entre vértice e aresta.",
                    dependsOnTitles: ["Definição G = (V, A)"],
                    scopeLabels: ["vértices, arestas, adjacência e incidência"]
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  }
});

const result = await planCourseFromScope({
  scopeContract,
  provider: fakeProvider,
  modelId: "fake:model",
  project: createEmptyProjectDocument()
});

console.log(JSON.stringify(result.project, null, 2));
