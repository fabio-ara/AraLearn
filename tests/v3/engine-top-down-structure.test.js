import test from "node:test";
import assert from "node:assert/strict";

import { createFakeProvider } from "../../src/generation/providers/fakeProvider.js";
import { createEmptyProjectDocument } from "../../src/domain/aralearnProject.js";
import { planCourseFromScope } from "../../src/generation/topDown/planCourseFromScope.js";

test("top-down estruturado aplica auditoria e mantém contrato", async () => {
  const provider = createFakeProvider({
    structuredEngine: true,
    script: {
      top_down_structure: {
        text: JSON.stringify({
          course: {
            title: "Curso",
            goal: "Objetivo",
            modules: [
              {
                title: "Módulo",
                guide: {
                  goal: "Objetivo do módulo",
                  include: ["linha", "coluna"],
                  exclude: ["determinante"],
                  notation: [],
                  avoid: []
                },
                lessons: [
                  {
                    title: "Lição",
                    guide: {
                      goal: "Objetivo da lição",
                      include: ["linha", "coluna"],
                      exclude: ["determinante"],
                      notation: [],
                      avoid: []
                    },
                    microsequences: [
                      { title: "Linha", goal: "Ler linha", role: "explain", dependsOn: [], covers: ["linha"], checks: ["ler linha"] },
                      { title: "Coluna", goal: "Ler coluna", role: "practice", dependsOn: ["Linha"], covers: ["coluna"], checks: ["ler coluna"] }
                    ]
                  }
                ]
              }
            ]
          }
        }),
        usage: {}
      },
      top_down_structure_audit: {
        text: "PATCH MICROSEQUENCE\ntarget: Coluna\ngoal: Ler coluna com caso mínimo",
        usage: {}
      }
    }
  });

  const result = await planCourseFromScope({
    scopeContract: {
      schemaVersion: "aralearn.scope.v1",
      course: { title: "Curso", goal: "Objetivo" },
      modules: [{ title: "Módulo", include: ["linha", "coluna"], exclude: ["determinante"], notes: "", assessmentStyle: "mixed" }]
    },
    provider,
    modelId: "gemini-2.5-flash",
    project: createEmptyProjectDocument()
  });

  assert.equal(result.project.courses[0].modules[0].lessons[0].microsequences.length, 2);
  assert.equal(result.project.courses[0].modules[0].lessons[0].microsequences[1].goal, "Ler coluna com caso mínimo");
});

test("top-down preserva dependsOn válido sem linearização automática", async () => {
  const provider = createFakeProvider({
    structuredEngine: true,
    script: {
      top_down_structure: {
        text: JSON.stringify({
          course: {
            title: "Curso",
            goal: "Objetivo",
            modules: [
              {
                title: "Módulo",
                lessons: [
                  {
                    title: "Lição",
                    microsequences: [
                      { title: "Linha", goal: "Ler linha", role: "explain", dependsOn: [], covers: ["linha"], checks: ["ler linha"] },
                      { title: "Coluna", goal: "Ler coluna", role: "explain", dependsOn: [], covers: ["coluna"], checks: ["ler coluna"] },
                      { title: "Posição", goal: "Cruzar linha e coluna", role: "practice", dependsOn: ["Linha", "Coluna"], covers: ["linha", "coluna"], checks: ["cruzar linha e coluna"] }
                    ]
                  }
                ]
              }
            ]
          }
        }),
        usage: {}
      },
      top_down_structure_audit: {
        text: "",
        usage: {}
      }
    }
  });

  const result = await planCourseFromScope({
    scopeContract: {
      schemaVersion: "aralearn.scope.v1",
      course: { title: "Curso", goal: "Objetivo" },
      modules: [{ title: "Módulo", include: ["linha", "coluna"], exclude: ["determinante"], notes: "", assessmentStyle: "mixed" }]
    },
    provider,
    modelId: "fake:model",
    project: createEmptyProjectDocument()
  });

  const microsequences = result.project.courses[0].modules[0].lessons[0].microsequences;
  assert.deepEqual(microsequences[2].dependsOn, [microsequences[0].id, microsequences[1].id]);
});

test("top-down rejeita patch inline de auditoria", async () => {
  const provider = createFakeProvider({
    structuredEngine: true,
    script: {
      top_down_structure: {
        text: JSON.stringify({
          course: {
            title: "Curso",
            goal: "Objetivo",
            modules: [
              {
                title: "Módulo",
                lessons: [
                  {
                    title: "Lição",
                    microsequences: [
                      { title: "Linha", goal: "Ler linha", role: "explain", dependsOn: [], covers: ["linha"], checks: ["ler linha"] },
                      { title: "Coluna", goal: "Ler coluna", role: "practice", dependsOn: ["Linha"], covers: ["coluna"], checks: ["ler coluna"] }
                    ]
                  }
                ]
              }
            ]
          }
        }),
        usage: {}
      },
      top_down_structure_audit: [
        { text: 'PATCH MICROSEQUENCE "Coluna" goal "Ler coluna com caso mínimo"', usage: {} },
        { text: 'PATCH MICROSEQUENCE "Coluna" goal "Ler coluna com caso mínimo"', usage: {} },
        { text: 'PATCH MICROSEQUENCE "Coluna" goal "Ler coluna com caso mínimo"', usage: {} }
      ]
    }
  });

  await assert.rejects(() => planCourseFromScope({
    scopeContract: {
      schemaVersion: "aralearn.scope.v1",
      course: { title: "Curso", goal: "Objetivo" },
      modules: [{ title: "Módulo", include: ["linha", "coluna"], exclude: ["determinante"], notes: "", assessmentStyle: "mixed" }]
    },
    provider,
    modelId: "fake:model",
    project: createEmptyProjectDocument()
  }), /patch top-down|target/i);
});

test("top-down rejeita auditoria contraditória com patch e STATUS OK", async () => {
  const provider = createFakeProvider({
    structuredEngine: true,
    script: {
      top_down_structure: {
        text: JSON.stringify({
          course: {
            title: "Curso",
            goal: "Objetivo",
            modules: [
              {
                title: "Módulo",
                lessons: [
                  {
                    title: "Lição",
                    microsequences: [
                      { title: "Linha", goal: "Ler linha", role: "explain", dependsOn: [], covers: ["linha"], checks: ["ler linha"] },
                      { title: "Coluna", goal: "Ler coluna", role: "practice", dependsOn: ["Linha"], covers: ["coluna"], checks: ["ler coluna"] }
                    ]
                  }
                ]
              }
            ]
          }
        }),
        usage: {}
      },
      top_down_structure_audit: [
        { text: "PATCH MICROSEQUENCE\ntarget: Coluna\ngoal: Ler coluna com caso mínimo\nSTATUS OK", usage: {} },
        { text: "PATCH MICROSEQUENCE\ntarget: Coluna\ngoal: Ler coluna com caso mínimo\nSTATUS OK", usage: {} },
        { text: "PATCH MICROSEQUENCE\ntarget: Coluna\ngoal: Ler coluna com caso mínimo\nSTATUS OK", usage: {} }
      ]
    }
  });

  await assert.rejects(() => planCourseFromScope({
    scopeContract: {
      schemaVersion: "aralearn.scope.v1",
      course: { title: "Curso", goal: "Objetivo" },
      modules: [{ title: "Módulo", include: ["linha", "coluna"], exclude: ["determinante"], notes: "", assessmentStyle: "mixed" }]
    },
    provider,
    modelId: "fake:model",
    project: createEmptyProjectDocument()
  }), /misturar PATCH MICROSEQUENCE com STATUS OK|contradi/i);
});

test("top-down rejeita patch que piora dependências", async () => {
  const provider = createFakeProvider({
    structuredEngine: true,
    script: {
      top_down_structure: {
        text: JSON.stringify({
          course: {
            title: "Curso",
            goal: "Objetivo",
            modules: [
              {
                title: "Módulo",
                lessons: [
                  {
                    title: "Lição",
                    microsequences: [
                      { title: "Linha", goal: "Ler linha", role: "explain", dependsOn: [], covers: ["linha"], checks: ["ler linha"] },
                      { title: "Coluna", goal: "Ler coluna", role: "explain", dependsOn: ["Linha"], covers: ["coluna"], checks: ["ler coluna"] },
                      { title: "Posição", goal: "Cruzar linha e coluna", role: "practice", dependsOn: ["Coluna"], covers: ["posição"], checks: ["cruzar linha e coluna"] }
                    ]
                  }
                ]
              }
            ]
          }
        }),
        usage: {}
      },
      top_down_structure_audit: [
        { text: "PATCH MICROSEQUENCE\ntarget: Coluna\nmoveAfter: Posição", usage: {} },
        { text: "PATCH MICROSEQUENCE\ntarget: Coluna\nmoveAfter: Posição", usage: {} },
        { text: "PATCH MICROSEQUENCE\ntarget: Coluna\nmoveAfter: Posição", usage: {} }
      ]
    }
  });

  await assert.rejects(() => planCourseFromScope({
    scopeContract: {
      schemaVersion: "aralearn.scope.v1",
      course: { title: "Curso", goal: "Objetivo" },
      modules: [{ title: "Módulo", include: ["linha", "coluna", "posição"], exclude: ["determinante"], notes: "", assessmentStyle: "mixed" }]
    },
    provider,
    modelId: "fake:model",
    project: createEmptyProjectDocument()
  }), /piorou dependências/i);
});
