import test from "node:test";
import assert from "node:assert/strict";

import { createFakeProvider } from "../../src/generation/providers/fakeProvider.js";
import { createEmptyProjectDocument } from "../../src/domain/aralearnProject.js";
import { planCourseFromScope } from "../../src/generation/topDown/planCourseFromScope.js";

const scopeContract = {
  schemaVersion: "aralearn.scope.v1",
  course: { title: "Curso", goal: "Objetivo" },
  modules: [{
    title: "Módulo",
    include: ["linha", "coluna", "posição"],
    exclude: ["determinante"],
    notes: "",
    assessmentStyle: "mixed"
  }]
};

function structure(microsequences) {
  return {
    value: {
      course: {
        title: "Curso",
        goal: "Objetivo",
        modules: [{
          title: "Módulo",
          lessons: [{ title: "Lição", microsequences }]
        }]
      }
    },
    usage: {}
  };
}

function microsequences({ includePosition = false } = {}) {
  return [
    {
      title: "Linha",
      goal: "Ler linha",
      role: "explain",
      dependsOn: [],
      covers: ["linha"],
      checks: ["ler linha"]
    },
    {
      title: "Coluna",
      goal: "Ler coluna",
      role: "practice",
      dependsOn: ["Linha"],
      covers: ["coluna"],
      checks: ["ler coluna"]
    },
    ...(includePosition ? [{
      title: "Posição",
      goal: "Cruzar linha e coluna",
      role: "practice",
      dependsOn: ["Coluna"],
      covers: ["posição"],
      checks: ["cruzar linha e coluna"]
    }] : [])
  ];
}

async function run(script) {
  return planCourseFromScope({
    scopeContract,
    provider: createFakeProvider({ structuredEngine: true, script }),
    modelId: "fake:model",
    project: createEmptyProjectDocument()
  });
}

test("top-down estruturado aplica patch atômico e mantém contrato", async () => {
  const result = await run({
    top_down_structure: structure(microsequences()),
    top_down_structure_audit: {
      value: {
        patches: [{
          target: "Coluna",
          updates: [{ field: "goal", value: "Ler coluna com caso mínimo" }]
        }]
      },
      usage: {}
    }
  });

  const items = result.project.courses[0].modules[0].lessons[0].microsequences;
  assert.equal(items.length, 2);
  assert.equal(items[1].goal, "Ler coluna com caso mínimo");
});

test("top-down preserva dependsOn válido sem linearização automática", async () => {
  const items = microsequences({ includePosition: true });
  items[1].dependsOn = [];
  items[2].dependsOn = ["Linha", "Coluna"];
  const result = await run({
    top_down_structure: structure(items),
    top_down_structure_audit: { value: { patches: [] }, usage: {} }
  });

  const planned = result.project.courses[0].modules[0].lessons[0].microsequences;
  assert.deepEqual(planned[2].dependsOn, [planned[0].id, planned[1].id]);
});

test("top-down rejeita referência inexistente em patch estruturado", async () => {
  const invalidAudit = {
    value: {
      patches: [{
        target: "Coluna",
        updates: [{ field: "moveAfter", value: "Microssequência inexistente" }]
      }]
    },
    usage: {}
  };
  await assert.rejects(() => run({
    top_down_structure: structure(microsequences()),
    top_down_structure_audit: [invalidAudit, invalidAudit, invalidAudit]
  }), /referência inexistente/i);
});

test("top-down rejeita patch que piora dependências", async () => {
  const harmfulAudit = {
    value: {
      patches: [{
        target: "Coluna",
        updates: [{ field: "moveAfter", value: "Posição" }]
      }]
    },
    usage: {}
  };
  await assert.rejects(() => run({
    top_down_structure: structure(microsequences({ includePosition: true })),
    top_down_structure_audit: [harmfulAudit, harmfulAudit, harmfulAudit]
  }), /piorou dependências/i);
});
