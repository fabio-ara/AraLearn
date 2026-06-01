import { createFakeProvider } from "../src/generation/providers/fakeProvider.js";
import { planCourseFromScope } from "../src/generation/topDown/planCourseFromScope.js";
import { createEmptyProjectDocument } from "../src/domain/aralearnProject.js";

const scopeContract = {
  schemaVersion: "aralearn.scope.v1",
  course: {
    title: "Matemática para Informática",
    goal: "Levar um estudante iniciante a dominar a introdução de Teoria dos Grafos com prática fechada.",
    evidencePriority: ["exercise_list", "exam"]
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
        "planaridade"
      ],
      notes: "Partir de modelagem concreta e fechar cada passo com prática verificável.",
      assessmentStyle: "mixed"
    }
  ]
};

const fakeProvider = createFakeProvider({
  script: {
    "plan-scope": {
      course: {
        title: "Matemática para Informática",
        goal: "Levar um estudante iniciante a dominar a introdução de Teoria dos Grafos com prática fechada.",
        modules: [
          {
            title: "Teoria dos Grafos",
            guide: {
              goal: "Introduzir modelagem, definição e vocabulário básico.",
              include: [
                "pontes de Königsberg e modelagem por grafos",
                "definição formal de grafo",
                "vértices, arestas, adjacência e incidência"
              ],
              exclude: ["grafos direcionados", "planaridade"],
              notation: ["Use `V` para vértices e `A` para arestas."],
              avoid: ["Não confundir desenho com estrutura do grafo."]
            },
            lessons: [
              {
                title: "Modelagem e definição de grafos",
                guide: {
                  goal: "Transformar situações concretas em vértices e arestas antes da formalização.",
                  include: [
                    "pontes de Königsberg e modelagem por grafos",
                    "definição formal de grafo",
                    "vértices, arestas, adjacência e incidência"
                  ],
                  exclude: ["grafos direcionados", "planaridade"],
                  notation: ["Use `G = (V, A)` apenas depois da modelagem concreta."],
                  avoid: ["Não misturar adjacência com incidência."]
                },
                microsequences: [
                  {
                    id: "microsequence-modelagem",
                    title: "Pontes, pontos e ligações",
                    goal: "Modelar um problema concreto com vértices e arestas.",
                    role: "explain",
                    dependsOn: [],
                    covers: ["pontes de Königsberg e modelagem por grafos"],
                    checks: ["o aluno representa a situação como grafo"]
                  },
                  {
                    id: "microsequence-definicao",
                    title: "Definição G = (V, A)",
                    goal: "Escrever um grafo como conjunto de vértices e conjunto de arestas.",
                    role: "practice",
                    dependsOn: ["microsequence-modelagem"],
                    covers: ["definição formal de grafo"],
                    checks: ["o aluno escreve `G = (V, A)` de forma coerente"]
                  },
                  {
                    id: "microsequence-adjacencia",
                    title: "Adjacência e incidência",
                    goal: "Distinguir relações entre vértices e entre vértice e aresta.",
                    role: "review",
                    dependsOn: ["microsequence-definicao"],
                    covers: ["vértices, arestas, adjacência e incidência"],
                    checks: ["o aluno diferencia adjacência de incidência"]
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
