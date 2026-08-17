import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const project = JSON.parse(readFileSync(new URL(
  "../fixtures/package/project-minimal.json",
  import.meta.url
), "utf8"));

test("Cursos navegam até a unidade, praticam e salvam estado pessoal no runtime canônico", async ({ page }) => {
  await page.route("**/main.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: ""
  }));
  await page.goto("/");
  await page.evaluate(async (documentValue) => {
    document.body.innerHTML = '<main id="study-root"></main>';
    const { createCourseStudyApplication } = await import("/src/study/CourseStudyApplication.js");
    const progress = { version: 1, lessons: {} };
    const state = {
      completed: [], observations: {}, review: new Map(), loadedCourses: [], failDelete: false,
      externalProject: null, remotePersonal: null, refreshes: 0, revoked: false
    };
    globalThis.__courseStudyProbe = state;
    const initialProject = {
      contract: documentValue.contract,
      courses: documentValue.courses.map((course) => ({
        id: course.id,
        title: course.title,
        goal: course.goal,
        modules: []
      }))
    };
    let activeProject = initialProject;
    const repository = {
      loadProgress: () => structuredClone(progress),
      loadCourseSummaries: () => documentValue.courses.map((course) => ({
        courseId: course.id,
        canEdit: true,
        moduleCount: course.modules.length,
        lessonCount: course.modules.reduce((total, moduleValue) =>
          total + moduleValue.lessons.length, 0),
        studyUnitCount: course.modules.reduce((courseTotal, moduleValue) =>
          courseTotal + moduleValue.lessons.reduce((lessonTotal, lesson) =>
            lessonTotal + lesson.microsequences.reduce((microTotal, microsequence) =>
              microTotal + microsequence.cards.length, 0), 0), 0),
        completedStudyUnitCount: state.completed.length
      })),
      loadProject: () => structuredClone(activeProject),
      loadCourse: async (courseId) => {
        state.loadedCourses.push(courseId);
        activeProject = state.externalProject || documentValue;
        return structuredClone(activeProject.courses.find((course) => course.id === courseId));
      },
      loadCommentForPath: (reference) => state.observations[reference.studyUnitId] || null,
      saveCommentForPath: async (reference, draft) => {
        const value = { ...structuredClone(draft), updatedAt: "2026-08-17T12:00:00.000Z" };
        state.observations[reference.studyUnitId] = value;
        return value;
      },
      deleteCommentForPath: async (reference) => {
        if (state.failDelete) throw new Error("Sem conexão para retirar a observação.");
        delete state.observations[reference.studyUnitId];
      },
      loadReviewItems: () => [...state.review.values()].map((value) => structuredClone(value)),
      isStudyUnitMarkedForReview: (reference) => state.review.has(reference.studyUnitId),
      setStudyUnitReviewMark: async (reference, marked) => {
        if (marked) {
          state.review.set(reference.studyUnitId, {
            title: "Unidade marcada",
            context: "Curso · Lição",
            entityPath: [reference.courseId, reference.moduleId, reference.lessonId,
              reference.microsequenceId, reference.studyUnitId],
            reviewMarkedAt: "2026-08-17T12:00:00.000Z"
          });
        }
        else state.review.delete(reference.studyUnitId);
      },
      setStudyUnitCompleted: async (reference) => {
        if (!state.completed.some(({ studyUnitId }) =>
          studyUnitId === reference.studyUnitId)) {
          state.completed.push(structuredClone(reference));
        }
        const path = [reference.courseId, reference.moduleId, reference.lessonId].join("::");
        progress.lessons[path] = {
          cursorStudyUnitId: reference.studyUnitId,
          completedStudyUnitIds: [...new Set(
            state.completed.map(({ studyUnitId }) => studyUnitId)
          )]
        };
      },
      clearCourseProgress: async (courseId) => {
        state.completed.splice(0, state.completed.length);
        for (const path of Object.keys(progress.lessons)) {
          if (path.startsWith(`${courseId}::`)) delete progress.lessons[path];
        }
      },
      loadRuntimeStatus: () => ({ offline: false, stale: false, readOnly: false }),
      refreshPersonalState: async () => {
        state.refreshes += 1;
        if (state.remotePersonal) {
          state.completed.splice(
            0,
            state.completed.length,
            ...structuredClone(state.remotePersonal.completed)
          );
          for (const path of Object.keys(progress.lessons)) delete progress.lessons[path];
          Object.assign(progress.lessons, structuredClone(state.remotePersonal.progressLessons));
          state.observations = structuredClone(state.remotePersonal.observations);
          state.review.clear();
          for (const [studyUnitId, item] of state.remotePersonal.review) {
            state.review.set(studyUnitId, structuredClone(item));
          }
        }
        return state.revoked
          ? { contract: activeProject.contract, courses: [] }
          : structuredClone(activeProject);
      },
      flush: async () => undefined
    };
    globalThis.__courseStudyApp = createCourseStudyApplication({
      root: document.querySelector("#study-root"),
      repository,
      initialProject
    });
  }, project);

  await expect(page.getByRole("button", { name: "Abrir Curso" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir Curso" }).click();
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.loadedCourses.length)).toBe(1);
  await page.getByRole("button", { name: "Abrir módulo" }).click();
  await page.getByRole("button", { name: "Abrir lição" }).click();
  await page.getByRole("button", { name: "Abrir microssequência didática" }).click();
  await page.getByRole("button", { name: "Abrir unidade" }).first().click();
  await expect(page.getByText("A conjunção só é verdadeira", { exact: false })).toBeVisible();

  await page.evaluate(() => globalThis.__courseStudyApp.setOfflineStatus(true));
  await expect(page.getByRole("status")).toContainText(
    "Sem conexão · alterações pessoais ficam salvas neste dispositivo."
  );
  await expect(page.getByRole("button", { name: "Marcar para rever" })).toBeEnabled();
  await page.getByRole("button", { name: "Marcar para rever" }).click();
  await page.getByRole("button", { name: "Observação" }).click();
  await page.getByRole("textbox", { name: "Observação" }).fill("Guardada durante a desconexão.");
  await page.getByRole("button", { name: "Salvar" }).click();
  expect(await page.evaluate(() => ({
    review: globalThis.__courseStudyProbe.review.size,
    observations: Object.keys(globalThis.__courseStudyProbe.observations).length
  }))).toEqual({ review: 1, observations: 1 });

  const refreshContext = await page.evaluate(() => {
    const probe = globalThis.__courseStudyProbe;
    const reference = {
      courseId: "course-fixture-minimal",
      moduleId: "module-fixture-minimal",
      lessonId: "lesson-fixture-minimal",
      microsequenceId: "micro-fixture-minimal",
      studyUnitId: "card-fixture-minimal-regra"
    };
    probe.remotePersonal = {
      completed: [reference],
      progressLessons: {
        "course-fixture-minimal::module-fixture-minimal::lesson-fixture-minimal": {
          cursorStudyUnitId: reference.studyUnitId,
          completedStudyUnitIds: [reference.studyUnitId]
        }
      },
      observations: {
        [reference.studyUnitId]: {
          category: "possible_error",
          body: "Observação recebida de outro dispositivo.",
          updatedAt: "2026-08-17T12:30:00.000Z"
        }
      },
      review: [[reference.studyUnitId, {
        title: "Unidade remota",
        context: "Curso · Lição",
        entityPath: Object.values(reference),
        reviewMarkedAt: "2026-08-17T12:20:00.000Z"
      }]]
    };
    const style = document.createElement("style");
    style.textContent = ".screen-content{height:120px!important;overflow:auto!important}" +
      ".study-reader-screen{min-height:800px!important}";
    document.head.append(style);
    const scroller = document.querySelector(".screen-content");
    scroller.scrollTop = 70;
    document.querySelector("[data-action='open-observation']").focus();
    return { scrollTop: scroller.scrollTop };
  });
  await page.evaluate(() => globalThis.__courseStudyApp.refreshPersonalState());
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Observação" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Marcar para rever" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() =>
    document.querySelector(".screen-content").scrollTop)).toBe(refreshContext.scrollTop);
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.refreshes)).toBe(1);
  await page.getByRole("button", { name: "Observação" }).click();
  await expect(page.getByRole("textbox", { name: "Observação" }))
    .toHaveValue("Observação recebida de outro dispositivo.");
  await page.getByRole("button", { name: "Fechar" }).click();
  await page.evaluate(() => globalThis.__courseStudyApp.openCourses());
  await expect(page.getByLabel("Progresso: 1 de 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir para rever: Unidade remota" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir para rever: Unidade remota" }).click();

  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Se uma delas for falsa", { exact: false })).toBeVisible();
  await page.locator("[data-action='continue-feedback']").click();
  await expect(page.getByText("Complete", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.completed.length)).toBe(1);

  await page.getByRole("button", { name: "Observação" }).click();
  await page.getByRole("textbox", { name: "Observação" }).fill("Conferir a formulação.");
  await page.getByRole("button", { name: "Salvar" }).click();
  expect(await page.evaluate(() => Object.keys(globalThis.__courseStudyProbe.observations).length)).toBe(2);
  await page.getByRole("button", { name: "Observação" }).click();
  await page.getByRole("textbox", { name: "Observação" }).fill("Rascunho local preservado.");
  await page.evaluate(() => { globalThis.__courseStudyProbe.failDelete = true; });
  await page.getByRole("button", { name: "Retirar observação" }).click();
  await expect(page.getByRole("alert")).toHaveText("Sem conexão para retirar a observação.");
  await expect(page.getByRole("textbox", { name: "Observação" }))
    .toHaveValue("Rascunho local preservado.");
  expect(await page.evaluate(() => Object.keys(globalThis.__courseStudyProbe.observations).length)).toBe(2);
  await page.getByRole("button", { name: "Fechar" }).click();

  await page.getByRole("button", { name: "Marcar para rever" }).click();
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.review.size)).toBe(2);

  await page.evaluate(() => globalThis.__courseStudyApp.openCourses());
  await expect(page.getByRole("button", { name: "Abrir para rever: Unidade marcada" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir para rever: Unidade marcada" }).click();
  await expect(page.getByText("Complete", { exact: true }).first()).toBeVisible();

  const loadedBeforeExternalRefresh = await page.evaluate(() =>
    globalThis.__courseStudyProbe.loadedCourses.length);
  const scrollBeforeExternalRefresh = await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = ".screen-content{height:120px!important;overflow:auto!important}";
    document.head.append(style);
    const scroller = document.querySelector(".screen-content");
    scroller.scrollTop = Math.min(60, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
    return scroller.scrollTop;
  });
  await page.evaluate(async (documentValue) => {
    const updated = structuredClone(documentValue);
    updated.courses[0].title = "Curso atualizado pelo chat";
    globalThis.__courseStudyProbe.externalProject = updated;
    await globalThis.__courseStudyApp.replaceProject({
      contract: updated.contract,
      courses: [{
        id: updated.courses[0].id,
        title: updated.courses[0].title,
        goal: updated.courses[0].goal,
        modules: []
      }]
    });
  }, project);
  await expect(page.getByText("Complete", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.loadedCourses.length))
    .toBe(loadedBeforeExternalRefresh + 1);
  await expect.poll(() => page.evaluate(() => document.querySelector(".screen-content").scrollTop))
    .toBe(scrollBeforeExternalRefresh);

  await page.evaluate(() => globalThis.__courseStudyApp.openCourses());
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Zerar progresso do Curso" }).click();
  await expect(page.getByRole("button", { name: "Zerar progresso do Curso" })).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.completed.length)).toBe(0);
  await page.getByRole("button", { name: "Abrir para rever: Unidade marcada" }).click();

  await page.locator("[data-action='text-gap-open-choice']").click();
  await page.locator("[data-action='text-gap-set-choice'][data-text-gap-value='as duas são verdadeiras']").click();
  await page.locator("[data-action='next-study-unit']").click();
  await expect(page.getByText("As duas partes precisam ser verdadeiras.", { exact: true })).toBeVisible();
  await page.locator("[data-action='continue-feedback']").click();
  await expect(page.getByRole("heading", { name: "Microssequências didáticas" })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.completed.length)).toBe(1);

  await page.evaluate(async () => {
    globalThis.__courseStudyProbe.revoked = true;
    await globalThis.__courseStudyApp.refreshPersonalState();
  });
  await expect(page.getByText("Nenhum Curso acessível.")).toBeVisible();
  await expect(page.locator(".comment-sheet")).toHaveCount(0);
});

test("lista fina carrega o Curso somente quando o progresso é zerado", async ({ page }) => {
  await page.route("**/main.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: ""
  }));
  await page.goto("/");
  await page.evaluate(async (documentValue) => {
    document.body.innerHTML = '<main id="study-root"></main>';
    const { createCourseStudyApplication } = await import("/src/study/CourseStudyApplication.js");
    const course = documentValue.courses[0];
    const initialProject = {
      contract: documentValue.contract,
      courses: [{ id: course.id, title: course.title, goal: course.goal, modules: [] }]
    };
    let activeProject = initialProject;
    const probe = { loads: 0, clears: 0 };
    globalThis.__thinStudyProbe = probe;
    createCourseStudyApplication({
      root: document.querySelector("#study-root"),
      initialProject,
      repository: {
        loadProject: () => structuredClone(activeProject),
        loadCourse: async () => {
          probe.loads += 1;
          activeProject = documentValue;
          return structuredClone(course);
        },
        loadProgress: () => ({ version: 1, lessons: {} }),
        loadReviewItems: () => [],
        loadCourseSummaries: () => [{
          courseId: course.id,
          canEdit: true,
          moduleCount: course.modules.length,
          lessonCount: course.modules.reduce((total, moduleValue) =>
            total + moduleValue.lessons.length, 0),
          studyUnitCount: 3,
          completedStudyUnitCount: 1
        }],
        clearCourseProgress: async () => { probe.clears += 1; },
        loadCommentForPath: () => null,
        isStudyUnitMarkedForReview: () => false,
        flush: async () => undefined
      }
    });
  }, project);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Zerar progresso do Curso" }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__thinStudyProbe)).toEqual({
    loads: 1,
    clears: 1
  });
});

test("runtime canônico preserva teclado, lacunas, anotações e avanço simples", async ({ page }) => {
  const packageInstance = (id, packageId, data) => ({
    id,
    package: packageId,
    version: packageId === "aralearn.response.ordering" ? "3.0.0" : "1.0.0",
    data
  });
  const card = (id, position, title, content, response = null, feedback = []) => ({
    id,
    position,
    title,
    role: response ? "practice" : "theory",
    content,
    response,
    feedback,
    topics: [],
    sources: []
  });
  const projectValue = {
    contract: "aralearn.library.v1",
    scope: "course",
    courses: [{
      id: "course-interactions",
      title: "Interações de Estudo",
      goal: "Verificar as interações essenciais do runtime canônico.",
      modules: [{
        id: "module-interactions",
        title: "Módulo",
        lessons: [{
          id: "lesson-interactions",
          title: "Lição",
          microsequences: [{
            id: "micro-interactions",
            title: "Interações",
            goal: "Operar respostas e anotações pelo teclado e por toque.",
            cards: [
              card("choice-card", 1, "Escolha", [packageInstance(
                "choice-context",
                "aralearn.resource.paragraph",
                { text: `Contexto longo. ${"Texto de apoio para rolagem. ".repeat(120)}` }
              )], packageInstance(
                "choice-response",
                "aralearn.response.choice",
                {
                  question: "Qual alternativa está correta?",
                  options: [
                    { id: "correct", kind: "text", text: "Correta" },
                    { id: "middle", kind: "text", text: "Intermediária" },
                    { id: "last", kind: "text", text: "Última" }
                  ],
                  selectionMode: "single",
                  selectionCriterion: "correct",
                  answerIds: ["correct"]
                }
              )),
              card("choice-gap-card", 2, "Lacuna de opção", [packageInstance(
                "choice-gap-copy",
                "aralearn.resource.paragraph",
                { text: "Escolha certo." }
              )], packageInstance("choice-gap-response", "aralearn.response.gap", {
                prompt: "Complete.",
                blanks: [{
                  id: "choice-gap",
                  targetInstanceId: "choice-gap-copy",
                  targetPath: "text",
                  responseMode: "choice",
                  answer: "certo",
                  distractors: ["errado"]
                }]
              })),
              card("free-gap-card", 3, "Lacuna livre", [packageInstance(
                "free-gap-copy",
                "aralearn.resource.paragraph",
                { text: "Escreva livre agora." }
              )], packageInstance("free-gap-response", "aralearn.response.gap", {
                prompt: "Complete.",
                blanks: [{
                  id: "free-gap",
                  targetInstanceId: "free-gap-copy",
                  targetPath: "text",
                  responseMode: "text",
                  answer: "livre agora"
                }]
              })),
              card("annotation-card", 4, "Anotações", [packageInstance(
                "annotated-copy",
                "aralearn.resource.annotated_text",
                {
                  segments: [
                    { id: "shared", text: "Trecho compartilhado" },
                    { id: "second", text: " e segundo trecho." }
                  ],
                  annotations: [
                    { id: "first-note", targetIds: ["shared"], label: "Primeira", note: "Nota um." },
                    { id: "second-note", targetIds: ["shared", "second"], label: "Segunda", note: "Nota dois." }
                  ]
                }
              )]),
              card("ordering-card", 5, "Ordenação", [
                packageInstance("ordering-first", "aralearn.resource.paragraph", {
                  text: "Primeiro"
                }),
                packageInstance("ordering-second", "aralearn.resource.paragraph", {
                  text: "Depois"
                })
              ], packageInstance("ordering-response", "aralearn.response.ordering", {
                targets: [
                  {
                    id: "first",
                    targetInstanceId: "ordering-first",
                    targetPath: "text",
                    answer: "Primeiro"
                  },
                  {
                    id: "second",
                    targetInstanceId: "ordering-second",
                    targetPath: "text",
                    answer: "Depois"
                  }
                ]
              })),
              card("feedback-card", 6, "Confirmação", [packageInstance(
                "feedback-copy",
                "aralearn.resource.paragraph",
                { text: "Conteúdo antes da confirmação." }
              )], null, [packageInstance(
                "feedback-message",
                "aralearn.resource.paragraph",
                { text: "Confira antes de continuar." }
              )]),
              card("final-card", 7, "Concluído", [packageInstance(
                "final-copy",
                "aralearn.resource.paragraph",
                { text: "Fim das interações." }
              )])
            ]
          }]
        }]
      }]
    }]
  };

  await page.route("**/main.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: ""
  }));
  await page.goto("/");
  await page.evaluate(async (documentValue) => {
    document.body.innerHTML = '<main id="study-root"></main>';
    const { createCourseStudyApplication } = await import("/src/study/CourseStudyApplication.js");
    const completed = [];
    globalThis.__studyInteractionProbe = { completed, scrolledAnnotation: null };
    createCourseStudyApplication({
      root: document.querySelector("#study-root"),
      initialProject: documentValue,
      repository: {
        loadProject: () => structuredClone(documentValue),
        loadProgress: () => ({ version: 1, lessons: {} }),
        loadReviewItems: () => [],
        loadCourseSummaries: () => [{
          courseId: "course-interactions",
          canEdit: true,
          moduleCount: 1,
          lessonCount: 1,
          studyUnitCount: 7,
          completedStudyUnitCount: completed.length
        }],
        loadCommentForPath: () => null,
        isStudyUnitMarkedForReview: () => false,
        setStudyUnitCompleted: async (reference) => { completed.push(structuredClone(reference)); },
        flush: async () => undefined
      }
    });
  }, projectValue);

  await page.getByRole("button", { name: "Abrir Curso" }).click();
  await page.getByRole("button", { name: "Abrir módulo" }).click();
  await page.getByRole("button", { name: "Abrir lição" }).click();
  await page.getByRole("button", { name: "Abrir microssequência didática" }).click();
  await page.getByRole("button", { name: "Abrir unidade" }).first().click();

  const choices = page.locator("[data-action='choice-toggle'][role='radio']");
  const firstChoice = choices.first();
  const lastChoice = choices.last();
  await page.locator("[data-action='next-study-unit']").click();
  await expect(page.getByRole("alert")).toContainText("Selecione pelo menos uma resposta.");
  await expect(firstChoice).toBeFocused();
  const scrollBeforeChoice = await page.evaluate(() => {
    const screen = document.querySelector(".screen-content");
    const cardContent = document.querySelector(".card-sheet-content");
    screen.scrollTop = Math.min(80, Math.max(0, screen.scrollHeight - screen.clientHeight));
    cardContent.scrollTop = Math.min(80,
      Math.max(0, cardContent.scrollHeight - cardContent.clientHeight));
    return [screen.scrollTop, cardContent.scrollTop];
  });
  await firstChoice.press("Space");
  await expect(firstChoice).toBeFocused();
  await expect.poll(() => page.evaluate(() => [
    document.querySelector(".screen-content").scrollTop,
    document.querySelector(".card-sheet-content").scrollTop
  ])).toEqual(scrollBeforeChoice);
  await firstChoice.focus();
  await firstChoice.press("ArrowLeft");
  await expect(lastChoice).toBeFocused();
  await expect(lastChoice).toHaveAttribute("aria-checked", "true");
  await lastChoice.press("ArrowRight");
  await expect(firstChoice).toBeFocused();
  await expect(firstChoice).toHaveAttribute("aria-checked", "true");
  const correctChoice = page.locator("[data-choice-option-id='correct']");
  if (await correctChoice.getAttribute("aria-checked") !== "true") await correctChoice.click();
  await page.locator("[data-action='next-study-unit']").click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Lacuna de opção");

  let choiceGap = page.locator("[data-action='text-gap-open-choice']");
  await page.locator("[data-action='next-study-unit']").click();
  await expect(page.getByRole("alert")).toContainText("Complete todas as lacunas.");
  await expect(page.locator("[data-action='text-gap-set-choice']").first()).toBeFocused();
  await choiceGap.focus();
  await choiceGap.press("Enter");
  await expect(page.locator("[data-text-gap-prompt='true']")).toBeVisible();
  await page.locator("[data-action='text-gap-set-choice'][data-text-gap-value='certo']").click();
  choiceGap = page.locator("[data-action='text-gap-open-choice']");
  await choiceGap.focus();
  await choiceGap.press("Space");
  await expect(page.locator("[data-text-gap-prompt='true']")).toBeVisible();
  await page.locator("[data-action='text-gap-set-choice'][data-text-gap-value='certo']").click();
  await page.locator("[data-action='next-study-unit']").click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Lacuna livre");

  const freeGap = page.locator("[data-action='complete-input'][contenteditable='true']");
  await page.locator("[data-action='next-study-unit']").click();
  await expect(page.getByRole("alert")).toContainText("Complete todas as lacunas.");
  await expect(freeGap).toBeFocused();
  const blockedLineBreaks = await freeGap.evaluate((node) => {
    const keydown = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    const beforeInput = new InputEvent("beforeinput", {
      inputType: "insertLineBreak",
      bubbles: true,
      cancelable: true
    });
    node.dispatchEvent(keydown);
    node.dispatchEvent(beforeInput);
    return [keydown.defaultPrevented, beforeInput.defaultPrevented];
  });
  expect(blockedLineBreaks).toEqual([true, true]);
  await freeGap.evaluate((node) => {
    node.textContent = "\u2007";
    node.dispatchEvent(new InputEvent("input", { bubbles: true }));
    node.blur();
  });
  await expect(freeGap).toHaveText("");
  await expect(freeGap).toHaveAttribute("data-empty", "true");
  await freeGap.evaluate((node) => {
    node.textContent = "\u00a0livre\u2007agora\u00a0";
    node.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await expect(freeGap).toHaveAttribute("data-empty", "false");
  await page.locator("[data-action='next-study-unit']").click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Anotações");

  await page.locator(".runtime-annotated-text-note").evaluateAll((notes) => {
    notes.forEach((note) => {
      note.scrollIntoView = () => {
        globalThis.__studyInteractionProbe.scrolledAnnotation =
          note.getAttribute("data-annotation-indexes");
      };
    });
  });
  await page.locator(".runtime-annotated-text-segment").first().click();
  await expect(page.locator(".runtime-annotated-text-note.is-active")).toHaveCount(2);
  await expect(page.locator(".runtime-annotated-text-segment.is-active")).toHaveCount(2);
  expect(await page.evaluate(() => globalThis.__studyInteractionProbe.scrolledAnnotation)).toBe("0");
  await page.locator("[data-action='next-study-unit']").click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Ordenação");
  const moveOrdering = page.locator("[data-action='ordering-move']:not([disabled])").first();
  const movedStudyItemId = await moveOrdering.getAttribute("data-ordering-item-id");
  await moveOrdering.click();
  await expect(page.locator(
    `.runtime-ordering-slot[data-ordering-item-id='${movedStudyItemId}']`
  )).toBeFocused();
  await page.locator("[data-action='next-study-unit']").click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Confirmação");

  await page.locator("[data-action='next-study-unit']").dispatchEvent("click", { detail: 2 });
  await expect(page.locator(".study-continue-popup")).toHaveCount(0);
  await expect(page.locator(".runtime-card-title")).toHaveText("Confirmação");
  await page.locator("[data-action='next-study-unit']").click();
  const popup = page.locator(".study-continue-popup");
  await expect(popup).toBeVisible();
  await popup.getByText("Confira antes de continuar.").click();
  await expect(popup).toBeVisible();
  await page.locator(".runtime-card-title").click();
  await expect(popup).toHaveCount(0);
  await page.locator("[data-action='next-study-unit']").click();
  await page.locator("[data-action='continue-feedback']").dispatchEvent("click", { detail: 2 });
  await expect(page.locator(".study-continue-popup")).toBeVisible();
  await expect(page.locator(".runtime-card-title")).toHaveText("Confirmação");
  await page.locator("[data-action='continue-feedback']").click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Concluído");
});
