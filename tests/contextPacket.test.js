import test from "node:test";
import assert from "node:assert/strict";

import { buildContextPacket } from "../src/generation/bottomUp/buildContextPacket.js";
import { createMicrosequenceVersion } from "../src/domain/microsequenceVersion.js";

const project = {
  contract: "aralearn.contract",
  version: 1,
  kind: "project",
  courses: [
    {
      key: "course-mat",
      title: "Matemática para Informática",
      evidencePriority: ["exam"],
      modules: [
        {
          key: "module-logica",
          title: "Lógica",
          include: [{ id: "scope-conectivos", label: "conectivos", normalizedLabel: "conectivos" }],
          exclude: [{ id: "scope-predicados", label: "lógica de predicados", normalizedLabel: "logica de predicados" }],
          assessmentStyle: "mixed",
          lessons: [
            {
              key: "lesson-1",
              title: "Conectivos",
              goal: "Entender conectivos.",
              microsequences: [
                {
                  key: "micro-1",
                  title: "Ler proposições",
                  goal: "Ler proposições simples.",
                  type: "main",
                  status: "ready",
                  dependsOn: [],
                  scopeRefs: ["scope-conectivos"],
                  versions: [
                    createMicrosequenceVersion({
                      cards: [{ key: "card-1", resourceType: "say", content: "..." }],
                      summary: "Resumo da etapa anterior."
                    })
                  ]
                },
                {
                  key: "micro-2",
                  title: "Tabela-verdade",
                  goal: "Montar tabelas-verdade.",
                  type: "main",
                  status: "planned",
                  dependsOn: ["micro-1"],
                  scopeRefs: ["scope-conectivos"],
                  versions: []
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

test("context packet usa somente contexto local da microssequência", () => {
  const packet = buildContextPacket(project, {
    courseKey: "course-mat",
    moduleKey: "module-logica",
    lessonKey: "lesson-1",
    microsequenceKey: "micro-2"
  });

  assert.equal(packet.courseTitle, "Matemática para Informática");
  assert.equal(packet.module.include[0], "conectivos");
  assert.equal(packet.currentMicrosequence.key, "micro-2");
  assert.equal(packet.neighborMicrosequences.previous.key, "micro-1");
  assert.equal(packet.dependsOn, undefined);
  assert.equal(packet.currentMicrosequence.dependsOn[0].summary, "Resumo da etapa anterior.");
});
