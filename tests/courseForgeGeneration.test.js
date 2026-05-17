import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveCourseForgeGenerationScope,
  resolveCourseForgeNavigationTarget,
  summarizeCourseForgeTopDownResult
} from "../src/generation/runtime/courseForgeGenerationState.js";
import {
  buildCourseForgePhaseModelOverrides,
  resolveCourseForgeDidacticProfileId,
  resolveCourseForgeLaunchConfig,
  resolveCourseForgeTopDownProfileId
} from "../src/generation/runtime/courseForgeLaunchConfig.js";
import {
  buildCourseForgeEngineProfileOverrides,
  createCourseForgeProfileTuning
} from "../src/generation/runtime/courseForgeProfileTuning.js";
import {
  buildAppliedCourseForgeGeneration,
  prepareCourseForgeStructureGeneration
} from "../src/generation/runtime/courseForgeGenerationRuntime.js";
import {
  buildCourseForgeGenerationSuccessState,
  buildOpenGeneratedCourseViewState,
  resolveOpenGeneratedCourseTarget,
  resolvePendingCourseForgeNavigation
} from "../src/generation/runtime/courseForgeGenerationNavigation.js";

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

test("resolveCourseForgeDidacticProfileId e buildCourseForgeEngineProfileOverrides normalizam customização didática", () => {
  assert.equal(resolveCourseForgeDidacticProfileId(""), "aralearn.engine.ads.general.v3");
  assert.deepEqual(
    buildCourseForgeEngineProfileOverrides({
      profileTuning: createCourseForgeProfileTuning("aralearn.engine.ads.general.v3", {
        targetStudentProfile: "estudante em revisão final",
        conceptualReappearances: 2,
        operationalReappearances: 5
      })
    }),
    {
      didacticPolicy: {
        targetStudentProfile: "estudante em revisão final",
        defaultMinimumReappearances: {
          conceptual: 2,
          operational: 5
        },
        topDownCourseStrategy: {
          defaultBudgetByLesson: {
            minMicrosequences: 3,
            targetMicrosequences: 5,
            maxMicrosequences: 8
          },
          requireCoreCoverageBeforeExtensions: true,
          requireVocabularyMap: true
        }
      }
    }
  );
});

test("resolveCourseForgeLaunchConfig monta runtime e intent config fora da UI", () => {
  const launchConfig = resolveCourseForgeLaunchConfig({
    selectedModel: "gemini-2.5-flash",
    apiKey: "chave",
    didacticProfileId: "aralearn.engine.ads.programming.v1",
    profileTuning: createCourseForgeProfileTuning("aralearn.engine.ads.programming.v1", {
      targetStudentProfile: "estudante que precisa de operadores bem explicados"
    })
  });

  assert.equal(launchConfig.providerId, "google");
  assert.equal(launchConfig.selectedTopDownProfileId, "custom");
  assert.equal(launchConfig.didacticProfileId, "aralearn.engine.ads.programming.v1");
  assert.equal(
    launchConfig.engineProfileOverrides.didacticPolicy.targetStudentProfile,
    "estudante que precisa de operadores bem explicados"
  );
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
      apiKey: "chave",
      didacticProfileId: "aralearn.engine.ads.programming.v1",
      profileTuning: createCourseForgeProfileTuning("aralearn.engine.ads.programming.v1", {
        targetStudentProfile: "estudante que precisa de passo a passo"
      })
    },
    ingestAttachments: async (attachments) => ({
      attachments: attachments.map((item) => ({ ...item, contentText: "conteúdo" })),
      extractedCount: 1,
      warnings: []
    })
  });

  assert.equal(prepared.promptText, "Gerar arquitetura de revisão");
  assert.equal(prepared.launchConfig.providerId, "google");
  assert.equal(prepared.request.intent.didacticProfileId, "aralearn.engine.ads.programming.v1");
  assert.equal(
    prepared.request.intent.engineProfileOverrides.didacticPolicy.targetStudentProfile,
    "estudante que precisa de passo a passo"
  );
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

test("buildCourseForgeGenerationSuccessState limpa draft e prepara seleção", () => {
  const successState = buildCourseForgeGenerationSuccessState({
    draft: {
      promptText: "gerar",
      attachments: [{ name: "base.md" }],
      lastResult: null,
      isSubmitting: true
    },
    applied: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      message: "ok"
    }
  });

  assert.equal(successState.draft.promptText, "");
  assert.deepEqual(successState.draft.attachments, []);
  assert.equal(successState.draft.lastResult.message, "ok");
  assert.deepEqual(successState.selection, {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: null,
    cardKey: null,
    cardIndex: 0
  });
  assert.deepEqual(successState.pendingGeneratedNavigation, {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a"
  });
});

test("resolveOpenGeneratedCourseTarget valida alvo antes de abrir em cursos", () => {
  assert.deepEqual(
    resolveOpenGeneratedCourseTarget({
      pendingGeneratedNavigation: {
        courseKey: "course-a",
        moduleKey: "module-a",
        lessonKey: "lesson-a",
        firstMicrosequenceKey: "micro-1"
      }
    }),
    {
      ok: true,
      target: {
        courseKey: "course-a",
        moduleKey: "module-a",
        lessonKey: "lesson-a",
        firstMicrosequenceKey: "micro-1"
      }
    }
  );

  assert.deepEqual(resolveOpenGeneratedCourseTarget({}), {
    ok: false,
    errorMessage: "Nenhuma estrutura nova foi gerada para abrir em Cursos."
  });
});

test("buildOpenGeneratedCourseViewState prepara navegação final da UI", () => {
  const viewState = buildOpenGeneratedCourseViewState({
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    firstMicrosequenceKey: "micro-1"
  });

  assert.deepEqual(viewState.selection, {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: null,
    cardKey: null,
    cardIndex: 0
  });
  assert.deepEqual(viewState.viewState, {
    homeTab: "courses",
    generationPanelOpen: false,
    view: "lesson",
    entityEditor: null,
    microsequenceMode: "play",
    pendingGeneratedNavigation: null
  });
  assert.deepEqual(viewState.focusTarget, {
    view: "lesson",
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-1"
  });
});

test("resolvePendingCourseForgeNavigation normaliza alvo mínimo pendente", () => {
  assert.deepEqual(
    resolvePendingCourseForgeNavigation({
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a"
    }),
    {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a"
    }
  );
});
