import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveLessonMicrosequenceOrder,
  sortLessonMicrosequencesDeterministically
} from "../src/generation/domain/resolveLessonMicrosequenceOrder.js";
import { repairCourseForgeMicrosequenceMetadataDeterministically } from "../src/generation/courseForge/courseForgeCards.js";

test("resolveLessonMicrosequenceOrder traz explicação antes de prática no mesmo domainRef", () => {
  const ordered = resolveLessonMicrosequenceOrder({
    microsequences: [
      {
        key: "micro-practice",
        title: "Prática sobre PC e IR",
        domainRefs: ["pc-ir"],
        coverageRole: "practice"
      },
      {
        key: "micro-explain",
        title: "O que são PC e IR",
        domainRefs: ["pc-ir"],
        coverageRole: "explain"
      }
    ],
    proposedOrderKeys: ["micro-practice", "micro-explain"],
    lessonDomainMap: {
      items: [{ id: "pc-ir", label: "PC e IR", priority: "core" }]
    }
  });

  assert.deepEqual(ordered, ["micro-explain", "micro-practice"]);
});

test("resolveLessonMicrosequenceOrder respeita pré-requisitos do domainMap antes da prática avançada", () => {
  const ordered = resolveLessonMicrosequenceOrder({
    microsequences: [
      {
        key: "micro-barramentos",
        title: "Barramentos na arquitetura",
        domainRefs: ["barramentos"],
        coverageRole: "explain"
      },
      {
        key: "micro-programa",
        title: "Programa armazenado",
        domainRefs: ["programa-armazenado"],
        coverageRole: "introduce"
      },
      {
        key: "micro-barramentos-pratica",
        title: "Prática de barramentos",
        domainRefs: ["barramentos"],
        coverageRole: "practice"
      }
    ],
    proposedOrderKeys: ["micro-barramentos", "micro-barramentos-pratica", "micro-programa"],
    lessonDomainMap: {
      items: [
        { id: "programa-armazenado", label: "Programa armazenado", priority: "core" },
        {
          id: "barramentos",
          label: "Barramentos",
          priority: "core",
          prerequisites: ["programa-armazenado"]
        }
      ]
    }
  });

  assert.deepEqual(ordered, ["micro-programa", "micro-barramentos", "micro-barramentos-pratica"]);
});

test("resolveLessonMicrosequenceOrder preserva a proposta da LLM quando não há sinal didático mais forte", () => {
  const ordered = resolveLessonMicrosequenceOrder({
    microsequences: [
      { key: "micro-a", title: "Tema A" },
      { key: "micro-b", title: "Tema B" },
      { key: "micro-c", title: "Tema C" }
    ],
    proposedOrderKeys: ["micro-c", "micro-a", "micro-b"],
    lessonDomainMap: {}
  });

  assert.deepEqual(ordered, ["micro-c", "micro-a", "micro-b"]);
});

test("sortLessonMicrosequencesDeterministically devolve a sequência já reordenada", () => {
  const sorted = sortLessonMicrosequencesDeterministically({
    microsequences: [
      {
        key: "micro-practice",
        title: "Exercícios iniciais",
        domainRefs: ["git-flow"],
        coverageRole: "practice"
      },
      {
        key: "micro-explain",
        title: "Fluxo local do Git",
        domainRefs: ["git-flow"],
        coverageRole: "explain"
      }
    ],
    lessonDomainMap: {
      items: [{ id: "git-flow", label: "Fluxo local do Git", priority: "core" }]
    }
  });

  assert.deepEqual(
    sorted.map((item) => item.key),
    ["micro-explain", "micro-practice"]
  );
});

test("repairCourseForgeMicrosequenceMetadataDeterministically reordena microssequências após reparar metadados", () => {
  const repaired = repairCourseForgeMicrosequenceMetadataDeterministically({
    lessonPlans: [
      {
        lessonKey: "lesson-vn",
        domainMap: {
          items: [
            { id: "stored-program", label: "Programa armazenado", priority: "core" },
            {
              id: "pc-ir",
              label: "PC e IR",
              priority: "core",
              prerequisites: ["stored-program"]
            }
          ],
          practiceVariants: [
            {
              id: "variant-pc-ir",
              domainItemRef: "pc-ir",
              variantKind: "fluency",
              purpose: "Checagem de PC e IR"
            }
          ]
        }
      }
    ],
    microsequencePlans: [
      {
        lessonKey: "lesson-vn",
        microsequences: [
          {
            key: "micro-pratica-pc-ir",
            title: "Questão sobre PC e IR",
            coverageRole: "practice",
            domainRefs: ["pc-ir"]
          },
          {
            key: "micro-base",
            title: "Programa armazenado e componentes",
            coverageRole: "explain",
            domainRefs: ["stored-program"]
          },
          {
            key: "micro-explica-pc-ir",
            title: "O que são PC e IR",
            coverageRole: "explain",
            domainRefs: ["pc-ir"]
          }
        ]
      }
    ]
  });

  assert.deepEqual(
    repaired[0].microsequences.map((item) => item.key),
    ["micro-base", "micro-explica-pc-ir", "micro-pratica-pc-ir"]
  );
  assert.deepEqual(repaired[0].microsequences[2].practiceVariantRefs, ["variant-pc-ir"]);
});
