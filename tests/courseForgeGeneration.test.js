import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveCourseForgeGenerationScope,
  resolveCourseForgeNavigationTarget,
  summarizeCourseForgeTopDownResult
} from "../src/ui/courseForgeGeneration.js";
import {
  buildCourseForgePhaseModelOverrides,
  resolveCourseForgeLaunchConfig,
  resolveCourseForgeTopDownProfileId
} from "../src/generation/runtime/courseForgeLaunchConfig.js";
import {
  buildAppliedCourseForgeGeneration,
  prepareCourseForgeStructureGeneration
} from "../src/generation/runtime/courseForgeGenerationRuntime.js";

test("resolveCourseForgeGenerationScope usa o menor escopo existente", () => {
  assert.deepEqual(
    resolveCourseForgeGenerationScope({
      course: { key: "course-a" },
      moduleValue: { key: "module-a" },
      lesson: { key: "lesson-a" }
    }),
    {
      level: "lesson",
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a"
    }
  );

  assert.deepEqual(
    resolveCourseForgeGenerationScope({
      course: { key: "course-a" },
      moduleValue: { key: "module-a" },
      lesson: null
    }),
    {
      level: "module",
      courseKey: "course-a",
      moduleKey: "module-a"
    }
  );

  assert.deepEqual(resolveCourseForgeGenerationScope({}), { level: "project" });
});

test("buildCourseForgePhaseModelOverrides fixa o mesmo modelo nas fases roteáveis", () => {
  const overrides = buildCourseForgePhaseModelOverrides("gemini-2.5-flash");

  assert.equal(overrides.plan_architecture, "gemini-2.5-flash");
  assert.equal(overrides.repair_cards, "gemini-2.5-flash");
  assert.equal(overrides.repair_card_adherence, "gemini-2.5-flash");
});

test("resolveCourseForgeTopDownProfileId seleciona perfil operacional por provider", () => {
  assert.equal(resolveCourseForgeTopDownProfileId("codex-cli-local"), "codex_all");
  assert.equal(resolveCourseForgeTopDownProfileId("gemini-2.5-flash"), "custom");
});

test("resolveCourseForgeLaunchConfig monta runtime e intent config fora da UI", () => {
  const launchConfig = resolveCourseForgeLaunchConfig({
    selectedModel: "gemini-2.5-flash",
    apiKey: "chave"
  });

  assert.equal(launchConfig.providerId, "google");
  assert.equal(launchConfig.selectedTopDownProfileId, "custom");
  assert.equal(launchConfig.phaseModelOverrides.plan_architecture, "gemini-2.5-flash");
  assert.equal(typeof launchConfig.providerRegistry.get("google")?.callJson, "function");
});

test("resolveCourseForgeNavigationTarget usa patch e fallback do projeto final", () => {
  const target = resolveCourseForgeNavigationTarget({
    patch: {
      target: {
        courseKey: "course-a",
        moduleKey: "module-a",
        lessonKey: "lesson-a"
      }
    },
    projectDocument: {
      courses: [
        {
          key: "course-a",
          modules: [
            {
              key: "module-a",
              lessons: [{ key: "lesson-a" }]
            }
          ]
        }
      ]
    }
  });

  assert.deepEqual(target, {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a"
  });
});

test("summarizeCourseForgeTopDownResult resume patch aplicado", () => {
  assert.deepEqual(
    summarizeCourseForgeTopDownResult({
      patch: {
        operations: [{}, {}],
        events: [{}]
      }
    }),
    {
      message: "Fluxo top-down aplicado com 2 operações e 1 evento auditável.",
      openActionLabel: "Abrir em Cursos"
    }
  );
});

test("prepareCourseForgeStructureGeneration monta request fora da UI", async () => {
  const prepared = await prepareCourseForgeStructureGeneration({
    scopeState: {
      course: { key: "course-a" },
      moduleValue: { key: "module-a" }
    },
    draft: {
      promptText: "  Gerar arquitetura de revisão  ",
      attachments: [{ name: "base.md" }]
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    ingestAttachments: async (attachments) => ({
      attachments: attachments.map((item) => ({ ...item, contentText: "conteúdo" })),
      extractedCount: 1,
      warnings: []
    })
  });

  assert.equal(prepared.promptText, "Gerar arquitetura de revisão");
  assert.equal(prepared.launchConfig.providerId, "google");
  assert.deepEqual(prepared.request.intent.scope, {
    level: "module",
    courseKey: "course-a",
    moduleKey: "module-a"
  });
  assert.equal(prepared.request.intent.selectedTopDownProfileId, "custom");
  assert.equal(prepared.request.intent.attachments[0].contentText, "conteúdo");
});

test("prepareCourseForgeStructureGeneration rejeita anexo sem texto aproveitável", async () => {
  await assert.rejects(
    () =>
      prepareCourseForgeStructureGeneration({
        draft: {
          promptText: "",
          attachments: [{ name: "scan.pdf" }]
        },
        assistConfig: {
          model: "gemini-2.5-flash",
          apiKey: "chave"
        },
        ingestAttachments: async (attachments) => ({
          attachments,
          extractedCount: 0,
          warnings: []
        })
      }),
    /ainda não geraram texto utilizável/
  );
});

test("buildAppliedCourseForgeGeneration compõe resumo, avisos e navegação", () => {
  const applied = buildAppliedCourseForgeGeneration({
    courseForgeResult: {
      patch: {
        operations: [{}, {}],
        events: [{}],
        target: {
          courseKey: "course-a",
          moduleKey: "module-a",
          lessonKey: "lesson-a"
        }
      },
      projectDocument: {
        courses: [
          {
            key: "course-a",
            modules: [
              {
                key: "module-a",
                lessons: [{ key: "lesson-a" }]
              }
            ]
          }
        ]
      }
    },
    ingestedAttachments: {
      warnings: ["OCR ausente.", "Use prompt complementar."]
    }
  });

  assert.deepEqual(applied, {
    message:
      "Fluxo top-down aplicado com 2 operações e 1 evento auditável. Avisos de ingestão: OCR ausente. Use prompt complementar.",
    openActionLabel: "Abrir em Cursos",
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a"
  });
});
