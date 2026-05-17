import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCourseForgeGenerationScope,
  prepareCourseForgeLessonDeepeningDraft,
  setCourseForgeGenerationDraftInput,
  toggleCourseForgeGenerationDraftLevel
} from "../src/generation/runtime/courseForgeGenerationDraftState.js";
import {
  applyCourseForgeAssistConfigPatch,
  buildClosedCourseForgeGenerationPanelState,
  buildCourseForgeGenerationInputState,
  buildCourseForgeGenerationLevelState,
  buildCourseForgeGenerationResultClearedState,
  buildOpenedCourseForgeGenerationPanelState,
  checkCourseForgeCodexCliConnection,
  createCourseForgeCodexCliSetupStatus,
  executeCourseForgeStructureGeneration,
  normalizeCourseForgeAssistConfig,
  resolveCourseForgeGenerationScopeViewState,
  resolveCourseForgeOpenGeneratedLessonState
} from "../src/generation/runtime/courseForgeGenerationEditorRuntime.js";
import {
  resolveCourseForgeProviderReadiness,
  resolveGenerationAssistMode,
  resolveGenerationPanelScopeFromAction,
  resolveGenerationScopeState
} from "../src/generation/runtime/courseForgeGenerationViewModel.js";

test("resolveGenerationPanelScopeFromAction abre painel global sem escopo", () => {
  assert.deepEqual(
    resolveGenerationPanelScopeFromAction({
      action: "open-generation-panel-global",
      dataset: {},
      selection: {}
    }),
    {}
  );
});

test("resolveGenerationPanelScopeFromAction resolve curso pelo dataset", () => {
  assert.deepEqual(
    resolveGenerationPanelScopeFromAction({
      action: "open-generation-panel-course",
      dataset: { courseKey: "course-a" },
      selection: {}
    }),
    { courseKey: "course-a" }
  );
});

test("resolveGenerationPanelScopeFromAction resolve módulo pelo dataset completo", () => {
  assert.deepEqual(
    resolveGenerationPanelScopeFromAction({
      action: "open-generation-panel-module",
      dataset: { courseKey: "course-a", moduleKey: "module-a" },
      selection: {}
    }),
    { courseKey: "course-a", moduleKey: "module-a" }
  );
});

test("resolveGenerationPanelScopeFromAction resolve lição pelo dataset completo", () => {
  assert.deepEqual(
    resolveGenerationPanelScopeFromAction({
      action: "open-generation-panel-lesson",
      dataset: { courseKey: "course-a", moduleKey: "module-a", lessonKey: "lesson-a" },
      selection: {}
    }),
    { courseKey: "course-a", moduleKey: "module-a", lessonKey: "lesson-a" }
  );
});

test("resolveGenerationPanelScopeFromAction usa fallback da seleção nas telas internas", () => {
  assert.deepEqual(
    resolveGenerationPanelScopeFromAction({
      action: "open-generation-panel-module",
      dataset: {},
      selection: { courseKey: "course-a", moduleKey: "module-a" }
    }),
    { courseKey: "course-a", moduleKey: "module-a" }
  );

  assert.deepEqual(
    resolveGenerationPanelScopeFromAction({
      action: "open-generation-panel-lesson",
      dataset: {},
      selection: { courseKey: "course-a", moduleKey: "module-a", lessonKey: "lesson-a" }
    }),
    { courseKey: "course-a", moduleKey: "module-a", lessonKey: "lesson-a" }
  );
});

test("resolveGenerationPanelScopeFromAction rejeita ação sem escopo suficiente", () => {
  assert.equal(
    resolveGenerationPanelScopeFromAction({
      action: "open-generation-panel-course",
      dataset: {},
      selection: {}
    }),
    null
  );

  assert.equal(
    resolveGenerationPanelScopeFromAction({
      action: "open-generation-panel-lesson",
      dataset: { courseKey: "course-a" },
      selection: {}
    }),
    null
  );
});

test("resolveGenerationAssistMode mantém a geração estrutural mesmo com lição resolvida", () => {
  assert.equal(
    resolveGenerationAssistMode({
      lessonFixed: true,
      hasResolvedLesson: true
    }),
    "generate-top-down-structure"
  );
});

test("resolveGenerationAssistMode mantém geração estrutural fora da lição resolvida", () => {
  assert.equal(
    resolveGenerationAssistMode({
      lessonFixed: true,
      hasResolvedLesson: false
    }),
    "generate-top-down-structure"
  );
  assert.equal(
    resolveGenerationAssistMode({
      lessonFixed: false,
      hasResolvedLesson: true
    }),
    "generate-top-down-structure"
  );
});

test("resolveGenerationScopeState monta o view-model de escopo fora da UI", () => {
  const projectDocument = {
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
  };

  const state = resolveGenerationScopeState({
    draft: {
      courseFixed: true,
      moduleFixed: true,
      lessonFixed: true,
      courseInput: "Curso A",
      moduleInput: "Módulo A",
      lessonInput: "Lição A",
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      promptText: "Gerar estrutura.",
      attachments: []
    },
    projectDocument,
    visibleCourses: projectDocument.courses,
    findCourse: (project, key) => project.courses.find((item) => item.key === key) || null,
    findModule: (project, courseKey, moduleKey) =>
      project.courses.find((item) => item.key === courseKey)?.modules.find((item) => item.key === moduleKey) || null,
    findLesson: (project, courseKey, moduleKey, lessonKey) =>
      project.courses
        .find((item) => item.key === courseKey)
        ?.modules.find((item) => item.key === moduleKey)
        ?.lessons.find((item) => item.key === lessonKey) || null
  });

  assert.equal(state.canSubmit, true);
  assert.equal(state.actionSummary, "Lição e microssequências planejadas");
  assert.equal(state.lessonInputEnabled, true);
  assert.equal(state.generationMode, "generate-top-down-structure");
});

test("resolveCourseForgeProviderReadiness só valida provider local", async () => {
  const gemini = await resolveCourseForgeProviderReadiness({
    selectedModel: "gemini-2.5-flash"
  });
  assert.equal(gemini.ok, true);

  const codex = await resolveCourseForgeProviderReadiness({
    selectedModel: "codex-cli-local",
    codexEndpoint: "http://127.0.0.1:4183/assist",
    codexToken: "segredo",
    checkCodexLocalHealth: async ({ endpoint, token }) => ({
      ok: endpoint === "http://127.0.0.1:4183/assist" && token === "segredo",
      error: "",
      data: { ok: true }
    })
  });
  assert.equal(codex.ok, true);
});

test("createCourseForgeCodexCliSetupStatus normaliza payload transitório", () => {
  assert.deepEqual(createCourseForgeCodexCliSetupStatus({ checking: true, data: "ignorar" }), {
    ok: false,
    checking: true,
    error: "",
    data: null
  });
});

test("normalizeCourseForgeAssistConfig e patch consolidam config fora da UI", () => {
  assert.deepEqual(normalizeCourseForgeAssistConfig({ codexEndpoint: " " }), {
    model: "gemini-2.5-flash",
    apiKey: "",
    codexEndpoint: "http://127.0.0.1:4183/assist",
    codexToken: ""
  });

  const patched = applyCourseForgeAssistConfigPatch({
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: " chave ",
      codexEndpoint: "",
      codexToken: " token "
    },
    patch: {
      model: "codex-cli-local",
      codexEndpoint: " http://127.0.0.1:9999/assist "
    }
  });

  assert.equal(patched.assistConfig.model, "codex-cli-local");
  assert.equal(patched.assistConfig.apiKey, "chave");
  assert.equal(patched.assistConfig.codexEndpoint, "http://127.0.0.1:9999/assist");
  assert.equal(patched.assistConfigDraft.codexToken, "token");
});

test("checkCourseForgeCodexCliConnection normaliza erro do health-check", async () => {
  const failed = await checkCourseForgeCodexCliConnection({
    assistConfig: {
      codexEndpoint: "http://127.0.0.1:4183/assist",
      codexToken: "segredo"
    },
    checkCodexLocalHealth: async () => {
      throw new Error("porta fechada");
    }
  });

  assert.equal(failed.status.ok, false);
  assert.equal(failed.setupStatus.error, "porta fechada");
  assert.equal(failed.setupStatus.checking, false);
});

test("runtime do painel de geração abre, limpa e fecha sem depender da UI", () => {
  const projectDocument = {
    courses: [
      {
        key: "course-a",
        title: "Curso A",
        modules: [
          {
            key: "module-a",
            title: "Módulo A",
            lessons: [{ key: "lesson-a", title: "Lição A" }]
          }
        ]
      }
    ]
  };
  const visibleCourses = projectDocument.courses;
  const opened = buildOpenedCourseForgeGenerationPanelState({
    draft: {
      promptText: "manter",
      errorMessage: "erro antigo",
      lastResult: { message: "anterior" }
    },
    scope: { courseKey: "course-a", moduleKey: "module-a" },
    projectDocument,
    visibleCourses,
    findCourse: (project, key) => project.courses.find((item) => item.key === key) || null,
    findModule: (project, courseKey, moduleKey) =>
      project.courses.find((item) => item.key === courseKey)?.modules.find((item) => item.key === moduleKey) || null,
    findLesson: (project, courseKey, moduleKey, lessonKey) =>
      project.courses
        .find((item) => item.key === courseKey)
        ?.modules.find((item) => item.key === moduleKey)
        ?.lessons.find((item) => item.key === lessonKey) || null
  });

  assert.equal(opened.generationPanelOpen, true);
  assert.equal(opened.entityEditor, null);
  assert.equal(opened.draft.courseFixed, true);
  assert.equal(opened.draft.moduleFixed, true);
  assert.equal(opened.draft.errorMessage, "");
  assert.equal(opened.pendingGeneratedNavigation, null);

  const scopeViewState = resolveCourseForgeGenerationScopeViewState({
    draft: opened.draft,
    projectDocument,
    visibleCourses,
    findCourse: (project, key) => project.courses.find((item) => item.key === key) || null,
    findModule: (project, courseKey, moduleKey) =>
      project.courses.find((item) => item.key === courseKey)?.modules.find((item) => item.key === moduleKey) || null,
    findLesson: (project, courseKey, moduleKey, lessonKey) =>
      project.courses
        .find((item) => item.key === courseKey)
        ?.modules.find((item) => item.key === moduleKey)
        ?.lessons.find((item) => item.key === lessonKey) || null
  });
  assert.equal(scopeViewState.lessonToggleEnabled, true);

  const changedLevel = buildCourseForgeGenerationLevelState({
    draft: opened.draft,
    level: "lesson",
    projectDocument,
    visibleCourses,
    findCourse: (project, key) => project.courses.find((item) => item.key === key) || null,
    findModule: (project, courseKey, moduleKey) =>
      project.courses.find((item) => item.key === courseKey)?.modules.find((item) => item.key === moduleKey) || null,
    findLesson: (project, courseKey, moduleKey, lessonKey) =>
      project.courses
        .find((item) => item.key === courseKey)
        ?.modules.find((item) => item.key === moduleKey)
        ?.lessons.find((item) => item.key === lessonKey) || null
  });
  assert.equal(changedLevel.draft.lessonFixed, true);

  const changedInput = buildCourseForgeGenerationInputState({
    draft: changedLevel.draft,
    level: "lesson",
    value: "Lição A",
    visibleCourses
  });
  assert.equal(changedInput.draft.lessonKey, "lesson-a");

  const cleared = buildCourseForgeGenerationResultClearedState({
    draft: {
      ...changedInput.draft,
      errorMessage: "erro",
      lastResult: { message: "ok" }
    },
    pendingGeneratedNavigation: { lessonKey: "lesson-a" }
  });
  assert.equal(cleared.draft.errorMessage, "");
  assert.equal(cleared.draft.lastResult, null);
  assert.equal(cleared.pendingGeneratedNavigation, null);

  const closed = buildClosedCourseForgeGenerationPanelState({
    draft: changedInput.draft,
    preserveGeneratedResult: true,
    pendingGeneratedNavigation: { lessonKey: "lesson-a" }
  });
  assert.equal(closed.generationPanelOpen, false);
  assert.equal(closed.pendingGeneratedNavigation.lessonKey, "lesson-a");
});

test("resolveCourseForgeOpenGeneratedLessonState valida abertura fora da UI", () => {
  const failed = resolveCourseForgeOpenGeneratedLessonState({});
  assert.equal(failed.ok, false);
  assert.match(failed.errorMessage, /Nenhuma estrutura nova/);

  const opened = resolveCourseForgeOpenGeneratedLessonState({
    pendingGeneratedNavigation: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a"
    }
  });
  assert.equal(opened.ok, true);
  assert.equal(opened.viewState.view, "lesson");
});

test("applyCourseForgeGenerationScope fixa escopo resolvido fora da UI", () => {
  const projectDocument = {
    courses: [
      {
        key: "course-a",
        title: "Curso A",
        modules: [
          {
            key: "module-a",
            title: "Módulo A",
            lessons: [{ key: "lesson-a", title: "Lição A" }]
          }
        ]
      }
    ]
  };
  const visibleCourses = projectDocument.courses;
  const draft = applyCourseForgeGenerationScope({
    draft: { promptText: "manter" },
    scope: { courseKey: "course-a", moduleKey: "module-a", lessonKey: "lesson-a" },
    projectDocument,
    visibleCourses,
    findCourse: (project, key) => project.courses.find((item) => item.key === key) || null,
    findModule: (project, courseKey, moduleKey) =>
      project.courses.find((item) => item.key === courseKey)?.modules.find((item) => item.key === moduleKey) || null,
    findLesson: (project, courseKey, moduleKey, lessonKey) =>
      project.courses
        .find((item) => item.key === courseKey)
        ?.modules.find((item) => item.key === moduleKey)
        ?.lessons.find((item) => item.key === lessonKey) || null
  });

  assert.equal(draft.courseFixed, true);
  assert.equal(draft.moduleFixed, true);
  assert.equal(draft.lessonFixed, true);
  assert.equal(draft.courseInput, "Curso A");
  assert.equal(draft.moduleInput, "Módulo A");
  assert.equal(draft.lessonInput, "Lição A");
  assert.equal(draft.promptText, "manter");
});

test("toggleCourseForgeGenerationDraftLevel limpa hierarquia descendente ao desligar nível pai", () => {
  const visibleCourses = [
    {
      key: "course-a",
      title: "Curso A",
      modules: [
        {
          key: "module-a",
          title: "Módulo A",
          lessons: [{ key: "lesson-a", title: "Lição A" }]
        }
      ]
    }
  ];
  const draft = toggleCourseForgeGenerationDraftLevel({
    draft: {
      courseFixed: true,
      moduleFixed: true,
      lessonFixed: true,
      courseInput: "Curso A",
      courseKey: "course-a",
      moduleInput: "Módulo A",
      moduleKey: "module-a",
      lessonInput: "Lição A",
      lessonKey: "lesson-a"
    },
    level: "course",
    scopeState: {
      moduleToggleEnabled: true,
      lessonToggleEnabled: true
    },
    visibleCourses
  });

  assert.equal(draft.courseFixed, false);
  assert.equal(draft.courseInput, "");
  assert.equal(draft.moduleFixed, false);
  assert.equal(draft.moduleInput, "");
  assert.equal(draft.lessonFixed, false);
  assert.equal(draft.lessonInput, "");
});

test("setCourseForgeGenerationDraftInput resolve keys por título no estado puro", () => {
  const visibleCourses = [
    {
      key: "course-a",
      title: "Curso A",
      modules: [
        {
          key: "module-a",
          title: "Módulo A",
          lessons: [{ key: "lesson-a", title: "Lição A" }]
        }
      ]
    }
  ];

  let draft = setCourseForgeGenerationDraftInput({
    draft: {
      courseFixed: true
    },
    level: "course",
    value: "Curso A",
    visibleCourses
  });
  draft = toggleCourseForgeGenerationDraftLevel({
    draft,
    level: "module",
    scopeState: { moduleToggleEnabled: true, lessonToggleEnabled: false },
    visibleCourses
  });
  draft = setCourseForgeGenerationDraftInput({
    draft,
    level: "module",
    value: "Módulo A",
    visibleCourses
  });
  draft = toggleCourseForgeGenerationDraftLevel({
    draft,
    level: "lesson",
    scopeState: { moduleToggleEnabled: true, lessonToggleEnabled: true },
    visibleCourses
  });
  draft = setCourseForgeGenerationDraftInput({
    draft,
    level: "lesson",
    value: "Lição A",
    visibleCourses
  });

  assert.equal(draft.courseKey, "course-a");
  assert.equal(draft.moduleKey, "module-a");
  assert.equal(draft.lessonKey, "lesson-a");
});

test("prepareCourseForgeLessonDeepeningDraft monta pedido focado sem depender da UI", () => {
  const projectDocument = {
    courses: [
      {
        key: "course-a",
        title: "Curso A",
        modules: [
          {
            key: "module-a",
            title: "Módulo A",
            lessons: [{ key: "lesson-a", title: "Lição A" }]
          }
        ]
      }
    ]
  };
  const visibleCourses = projectDocument.courses;
  const draft = prepareCourseForgeLessonDeepeningDraft({
    draft: {
      attachments: [{ name: "base.md" }]
    },
    projectDocument,
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    promptText: "Aprofundar lacunas.",
    visibleCourses,
    findCourse: (project, key) => project.courses.find((item) => item.key === key) || null,
    findModule: (project, courseKey, moduleKey) =>
      project.courses.find((item) => item.key === courseKey)?.modules.find((item) => item.key === moduleKey) || null,
    findLesson: (project, courseKey, moduleKey, lessonKey) =>
      project.courses
        .find((item) => item.key === courseKey)
        ?.modules.find((item) => item.key === moduleKey)
        ?.lessons.find((item) => item.key === lessonKey) || null
  });

  assert.equal(draft.courseFixed, true);
  assert.equal(draft.moduleFixed, true);
  assert.equal(draft.lessonFixed, true);
  assert.equal(draft.promptText, "Aprofundar lacunas.");
  assert.equal(draft.lessonKey, "lesson-a");
  assert.equal(draft.attachments.length, 1);
});

test("executeCourseForgeStructureGeneration bloqueia submissão inválida antes do provider", async () => {
  const result = await executeCourseForgeStructureGeneration({
    draft: {
      promptText: "",
      attachments: []
    },
    assistConfig: {
      model: "gemini-2.5-flash"
    },
    projectDocument: { courses: [] },
    visibleCourses: [],
    runCourseForge: async () => {
      throw new Error("não deveria executar");
    }
  });

  assert.equal(result.status, "invalid");
  assert.match(result.draft.errorMessage, /Informe texto e\/ou anexo/);
});

test("executeCourseForgeStructureGeneration abre setup quando provider local não responde", async () => {
  const projectDocument = {
    courses: [{ key: "course-a", title: "Curso A", modules: [] }]
  };
  const result = await executeCourseForgeStructureGeneration({
    draft: {
      promptText: "Gerar estrutura",
      attachments: []
    },
    assistConfig: {
      model: "codex-cli-local",
      codexEndpoint: "http://127.0.0.1:4183/assist",
      codexToken: "segredo"
    },
    projectDocument,
    visibleCourses: projectDocument.courses,
    checkCodexLocalHealth: async () => ({
      ok: false,
      error: "bridge offline",
      data: { status: 503 }
    }),
    runCourseForge: async () => {
      throw new Error("não deveria executar");
    }
  });

  assert.equal(result.status, "provider-unready");
  assert.equal(result.shouldOpenCodexCliSetup, true);
  assert.equal(result.codexCliSetupStatus.error, "bridge offline");
});

test("executeCourseForgeStructureGeneration retorna sucesso aplicável fora da UI", async () => {
  const projectDocument = {
    courses: [
      {
        key: "course-a",
        title: "Curso A",
        modules: [
          {
            key: "module-a",
            title: "Módulo A",
            lessons: [{ key: "lesson-a", title: "Lição A" }]
          }
        ]
      }
    ]
  };
  const visibleCourses = projectDocument.courses;
  const result = await executeCourseForgeStructureGeneration({
    draft: {
      courseFixed: true,
      courseInput: "Curso A",
      courseKey: "course-a",
      moduleFixed: true,
      moduleInput: "Módulo A",
      moduleKey: "module-a",
      promptText: "Gerar estrutura",
      attachments: [{ name: "base.md" }]
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    projectDocument,
    visibleCourses,
    findCourse: (project, key) => project.courses.find((item) => item.key === key) || null,
    findModule: (project, courseKey, moduleKey) =>
      project.courses.find((item) => item.key === courseKey)?.modules.find((item) => item.key === moduleKey) || null,
    findLesson: (project, courseKey, moduleKey, lessonKey) =>
      project.courses
        .find((item) => item.key === courseKey)
        ?.modules.find((item) => item.key === moduleKey)
        ?.lessons.find((item) => item.key === lessonKey) || null,
    ingestAttachments: async (attachments) => ({
      attachments: attachments.map((item) => ({ ...item, contentText: "conteúdo" })),
      extractedCount: 1,
      warnings: []
    }),
    runCourseForge: async () => ({
      projectDocument,
      patch: {
        operations: [{}],
        events: [{}],
        target: {
          courseKey: "course-a",
          moduleKey: "module-a",
          lessonKey: "lesson-a"
        }
      }
    })
  });

  assert.equal(result.status, "success");
  assert.equal(result.selection.lessonKey, "lesson-a");
  assert.equal(result.pendingGeneratedNavigation.lessonKey, "lesson-a");
  assert.equal(result.draft.lastResult.message, "Fluxo top-down aplicado com 1 operações e 1 evento auditável.");
});
