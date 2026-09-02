import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const project = JSON.parse(readFileSync(new URL(
  "../fixtures/package/project-minimal.json",
  import.meta.url
), "utf8"));

const HOME_COURSE_IDS = Object.freeze({
  a: "a0000000-0000-4000-8000-00000000000a",
  b: "b0000000-0000-4000-8000-00000000000b",
  c: "c0000000-0000-4000-8000-00000000000c"
});

async function expectHomeGeometry(page, width, colorMode) {
  await page.setViewportSize({ width, height: width < 600 ? 780 : 900 });
  await page.evaluate((mode) => {
    document.documentElement.dataset.colorMode = mode;
  }, colorMode);
  const geometry = await page.locator(".app-shell").evaluate((shell) => {
    const screen = shell.querySelector(".courses-home-screen");
    const preview = shell.querySelector(".home-course-selector-preview");
    const controls = [...shell.querySelectorAll(
      ".home-course-selector-card > select, .home-course-preview-actions > button"
    )];
    const shellRect = shell.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    return {
      documentFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
      shellFits: shellRect.left >= -1 && shellRect.right <= window.innerWidth + 1,
      shellWidth: shellRect.width,
      screenFits: screen.scrollWidth <= screen.clientWidth + 1,
      previewFits: previewRect.left >= shellRect.left - 1 &&
        previewRect.right <= shellRect.right + 1 &&
        preview.scrollWidth <= preview.clientWidth + 1,
      minimumTouch: Math.min(...controls.map((node) => node.getBoundingClientRect().height))
    };
  });
  expect(geometry).toMatchObject({
    documentFits: true,
    shellFits: true,
    screenFits: true,
    previewFits: true
  });
  expect(geometry.shellWidth).toBeLessThanOrEqual(431);
  expect(geometry.minimumTouch).toBeGreaterThanOrEqual(43);
}

async function ensureReviewQueueOpen(page) {
  const queue = page.locator(".study-review-queue");
  if (!await queue.evaluate((details) => details.open === true)) {
    await queue.locator("> summary").click();
  }
  await expect(queue).toHaveAttribute("open", "");
}

async function openFirstStudyUnitByClicks(page) {
  await page.getByRole("button", { name: "Abrir módulo" }).click();
  await page.getByRole("button", { name: "Abrir lição" }).click();
  await page.getByRole("button", { name: "Abrir microssequência didática" }).click();
  await page.getByRole("button", { name: "Abrir unidade" }).first().click();
}

test("Home escolhe um entre três Cursos e usa uma entrada única sem expor a carga interna", async ({
  page
}) => {
  await page.route("**/main.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: ""
  }));
  await page.goto("/");
  await page.evaluate(async (documentValue) => {
    document.body.innerHTML = '<main id="study-root"></main>';
    const { createCourseStudyApplication } = await import("/src/study/CourseStudyApplication.js");
    const baseCourse = documentValue.courses[0];
    const makeCourse = (suffix, title, goal) => {
      const replacements = [
        ["course-fixture-minimal", documentValue.homeCourseIds[suffix]],
        ["module-fixture-minimal", `module-home-${suffix}`],
        ["lesson-fixture-minimal", `lesson-home-${suffix}`],
        ["micro-fixture-minimal", `micro-home-${suffix}`],
        ["card-fixture-minimal-regra", `unit-home-${suffix}-first`],
        ["card-fixture-minimal-complete", `unit-home-${suffix}-second`]
      ];
      let serialized = JSON.stringify(baseCourse);
      for (const [before, after] of replacements) serialized = serialized.replaceAll(before, after);
      const course = JSON.parse(serialized);
      course.title = title;
      course.goal = goal;
      course.modules[0].lessons[0].microsequences[0].studyUnits[0]
        .content[0].data.text = `Conteúdo inicial de ${title}.`;
      return course;
    };
    const fullCourses = [
      makeCourse("a", "Curso A", "Compreender o primeiro objetivo do Curso A."),
      makeCourse("b", "Curso B", "Praticar o segundo objetivo do Curso B."),
      makeCourse("c", "Curso C", "Investigar o terceiro objetivo do Curso C.")
    ];
    const thinCourse = (course) => ({
      id: course.id,
      title: course.title,
      goal: course.goal,
      modules: []
    });
    const state = {
      activeProject: {
        contract: documentValue.contract,
        courses: fullCourses.map(thinCourse)
      },
      loads: [],
      offlineChecks: [],
      availableOffline: {
        [documentValue.homeCourseIds.a]: true,
        [documentValue.homeCourseIds.b]: false,
        [documentValue.homeCourseIds.c]: false
      },
      delayCourseId: "",
      failCourseId: "",
      revokeCourseId: "",
      failLifecycle: false,
      releaseCourseLoad: null,
      reviewItems: [{
        title: "Rever regra do Curso A",
        context: "Curso A · Regra central",
        entityPath: [
          documentValue.homeCourseIds.a,
          "module-home-a",
          "lesson-home-a",
          "micro-home-a",
          "unit-home-a-first"
        ]
      }],
      reviewHasMore: true,
      reviewNextItems: [{
        title: "Rever outro exemplo do Curso A",
        context: "Curso A · Segundo exemplo",
        entityPath: [
          documentValue.homeCourseIds.a,
          "module-home-a",
          "lesson-home-a",
          "micro-home-a",
          "unit-home-a-second"
        ]
      }],
      navigation: {
        contract: "aralearn.course-study-navigation.v1",
        selectedCourseId: documentValue.homeCourseIds.a,
        positions: {},
        updatedAt: "2026-08-21T12:00:00.000Z"
      },
      app: null
    };
    const courseCounts = (course) => ({
      moduleCount: course.modules.length,
      lessonCount: course.modules.reduce((total, moduleValue) =>
        total + moduleValue.lessons.length, 0),
      studyUnitCount: course.modules.reduce((courseTotal, moduleValue) =>
        courseTotal + moduleValue.lessons.reduce((lessonTotal, lesson) =>
          lessonTotal + lesson.microsequences.reduce((microTotal, microsequence) =>
            microTotal + microsequence.studyUnits.length, 0), 0), 0)
    });
    const repository = {
      loadProject: () => structuredClone(state.activeProject),
      loadCourse: async (courseId) => {
        state.loads.push(courseId);
        if (state.delayCourseId === courseId) {
          await new Promise((resolve) => {
            state.releaseCourseLoad = () => {
              state.delayCourseId = "";
              state.releaseCourseLoad = null;
              resolve();
            };
          });
        }
        if (state.failCourseId === courseId) {
          state.failCourseId = "";
          throw new Error("Falha simulada ao carregar o Curso.");
        }
        if (state.revokeCourseId === courseId) {
          state.revokeCourseId = "";
          state.activeProject.courses = state.activeProject.courses
            .filter((course) => course.id !== courseId);
          throw Object.assign(new Error("Curso não encontrado."), {
            status: 404,
            code: "PT404"
          });
        }
        const fullCourse = fullCourses.find((course) => course.id === courseId);
        state.activeProject.courses = state.activeProject.courses.map((course) =>
          course.id === courseId ? structuredClone(fullCourse) : course);
        return structuredClone(fullCourse);
      },
      loadCourseSummaries: () => fullCourses
        .filter((course) => state.activeProject.courses.some(({ id }) => id === course.id))
        .map((course, index) => ({
          courseId: course.id,
          ownership: index === 0 ? "owned" : "shared",
          canEdit: index === 0,
          ...courseCounts(course),
          completedStudyUnitCount: 0,
          availableOffline: state.availableOffline[course.id]
        })),
      loadProgress: () => ({ version: 1, lessons: {} }),
      loadReviewItems: () => structuredClone(state.reviewItems),
      hasMoreReviewItems: () => state.reviewHasMore,
      loadMoreReviewItems: async () => {
        state.reviewItems.push(...structuredClone(state.reviewNextItems));
        state.reviewNextItems = [];
        state.reviewHasMore = false;
      },
      setStudyUnitReviewMark: async (reference, marked) => {
        if (marked) return;
        state.reviewItems = state.reviewItems.filter((item) =>
          item.entityPath.at(-1) !== reference.studyUnitId);
        state.reviewNextItems = state.reviewNextItems.filter((item) =>
          item.entityPath.at(-1) !== reference.studyUnitId);
      },
      loadAnnotationsForPath: () => [],
      isStudyUnitMarkedForReview: () => false,
      loadRuntimeStatus: () => ({ offline: false, stale: false, readOnly: false }),
      loadStudyUnitCitations: async (reference) => ({
        contract: "aralearn.course-study-citations.v1",
        courseId: reference.courseId,
        courseRevision: 1,
        studyUnitId: reference.studyUnitId,
        citations: [{
          sourceId: "fonte-exclusiva-a",
          title: "Fonte exclusiva do Curso anterior",
          citationText: "Fonte exibida apenas para comprovar o isolamento entre Cursos.",
          url: null,
          editionOrVersion: null,
          anchors: []
        }]
      }),
      loadStudyNavigation: () => structuredClone(state.navigation),
      saveStudyNavigation: async ({ selectedCourseId, position }) => {
        state.navigation.selectedCourseId = selectedCourseId;
        state.navigation.updatedAt = new Date().toISOString();
        if (position) {
          state.navigation.positions[selectedCourseId] = {
            ...structuredClone(position),
            updatedAt: state.navigation.updatedAt
          };
        }
      },
      clearStudyNavigationPosition: async (courseId) => {
        delete state.navigation.positions[courseId];
      },
      refreshCourseOfflineAvailability: async (courseId) => {
        state.offlineChecks.push(courseId);
        return state.availableOffline[courseId];
      },
      maintainCourse: async ({ courseId }) => {
        if (state.failLifecycle) throw new Error("Falha simulada no ciclo de vida.");
        state.activeProject.courses = state.activeProject.courses
          .filter((course) => course.id !== courseId);
      },
      flush: async () => undefined
    };
    state.mount = () => {
      state.app?.destroy?.();
      const root = document.querySelector("#study-root");
      root.replaceChildren();
      state.app = createCourseStudyApplication({
        root,
        repository,
        initialProject: structuredClone(state.activeProject)
      });
      return state.app;
    };
    globalThis.__home148Probe = state;
    state.mount();
  }, { ...project, homeCourseIds: HOME_COURSE_IDS });

  const selector = page.getByRole("combobox", { name: "Selecionar Curso" });
  await expect(selector).toHaveCount(1);
  await expect(selector.locator("option")).toHaveCount(3);
  await expect(page.locator(".home-course-selector-preview")).toHaveCount(1);
  await expect(page.locator(".home-course-selector-preview")).toContainText(
    "Compreender o primeiro objetivo do Curso A."
  );
  await expect(page.locator(".home-course-selector-preview")).toContainText("Curso próprio");
  await expect(page.locator("body")).not.toContainText("course-home-");

  for (const colorMode of ["light", "dark"]) {
    for (const width of [360, 390, 430, 1280]) {
      await expectHomeGeometry(page, width, colorMode);
    }
  }
  await page.evaluate(() => { document.documentElement.dataset.colorMode = "light"; });

  await ensureReviewQueueOpen(page);
  await page.getByRole("button", { name: "Mostrar mais" }).press("Enter");
  await expect(page.locator(".study-review-queue")).toHaveAttribute("open", "");
  await expect(page.getByRole("button", {
    name: "Abrir para rever: Rever outro exemplo do Curso A"
  })).toBeVisible();
  await expect(page.locator(".study-review-queue > summary")).toBeFocused();
  await page.getByRole("button", {
    name: "Retirar de Rever: Rever outro exemplo do Curso A"
  }).click();
  await expect(page.getByRole("button", { name: "Desfazer" })).toBeFocused();
  await page.evaluate((courseId) => {
    globalThis.__home148Probe.failCourseId = courseId;
  }, HOME_COURSE_IDS.a);
  const failedReview = page.getByRole("button", { name: "Abrir para rever: Rever regra do Curso A" });
  await failedReview.press("Enter");
  await expect(page.getByRole("alert")).toHaveText(
    "Não foi possível abrir este Curso. Tente novamente."
  );
  await expect(page.getByRole("button", { name: "Desfazer" })).toHaveCount(0);
  await expect(page.locator(".study-review-queue > summary")).toBeFocused();
  await page.evaluate(() => { globalThis.__home148Probe.loads = []; });

  expect(await page.evaluate(() => globalThis.__home148Probe.loads)).toEqual([]);
  await page.getByRole("button", { name: "Tentar novamente Curso A" }).press("Enter");
  await openFirstStudyUnitByClicks(page);
  await page.getByRole("button", { name: "Fontes" }).click();
  await expect(page.getByText("Fonte exclusiva do Curso anterior", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    for (let index = 0; index < 5; index += 1) globalThis.__home148Probe.app.handleBack();
  });

  await selector.selectOption(HOME_COURSE_IDS.b);
  await expect(selector).toHaveValue(HOME_COURSE_IDS.b);
  await expect(page.locator(".home-course-selector-preview")).toContainText("Curso B");
  await expect(page.locator(".home-course-selector-preview"))
    .toContainText("Curso compartilhado");
  expect(await page.evaluate(() => globalThis.__home148Probe.loads)).toEqual([HOME_COURSE_IDS.a]);

  await page.evaluate((courseId) => {
    globalThis.__home148Probe.delayCourseId = courseId;
  }, HOME_COURSE_IDS.b);
  await page.getByRole("button", { name: "Abrir Curso B" }).click();
  await expect(selector).toBeDisabled();
  await expect(page.getByRole("status", { name: "" }).filter({
    hasText: "Preparando este Curso…"
  })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrindo… Curso B" })).toBeDisabled();
  await page.evaluate(() => globalThis.__home148Probe.releaseCourseLoad());
  await openFirstStudyUnitByClicks(page);
  await expect(page.getByText("Conteúdo inicial de Curso B.", { exact: true })).toBeVisible();
  await expect(page.getByText("Fonte exclusiva do Curso anterior", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__home148Probe.loads)).toEqual([
    HOME_COURSE_IDS.a,
    HOME_COURSE_IDS.b
  ]);

  await page.evaluate(() => {
    for (let index = 0; index < 5; index += 1) globalThis.__home148Probe.app.handleBack();
  });
  const openB = page.getByRole("button", { name: "Abrir Curso B" });
  await expect(openB).toBeVisible();
  await expect(openB).toBeFocused();
  await expect.poll(() => page.evaluate((courseId) =>
    globalThis.__home148Probe.navigation.positions[courseId]?.entityPath?.at(-1),
  HOME_COURSE_IDS.b)).toBe("unit-home-b-first");
  await expect.poll(() => page.evaluate((courseId) =>
    globalThis.__home148Probe.navigation.positions[courseId]?.view,
  HOME_COURSE_IDS.b)).toBe("course");

  await page.evaluate((courseId) => {
    const probe = globalThis.__home148Probe;
    probe.navigation.positions[courseId] = {
      view: "microsequence",
      entityPath: [courseId, "module-home-b", "lesson-home-b", "micro-home-b", "unit-home-b-first"],
      microsequenceMode: "play",
      updatedAt: new Date().toISOString()
    };
    probe.mount();
  }, HOME_COURSE_IDS.b);
  await expect(selector).toHaveValue(HOME_COURSE_IDS.b);
  await expect(page.getByRole("button", { name: "Abrir Curso B" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir Curso B" }).click();
  await expect(page.getByRole("heading", { name: "Curso B", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir módulo" })).toBeVisible();
  await expect(page.locator(".runtime-card-title")).toHaveCount(0);
  await page.evaluate(() => {
    for (let index = 0; index < 4; index += 1) globalThis.__home148Probe.app.handleBack();
  });

  await selector.selectOption(HOME_COURSE_IDS.a);
  await page.evaluate(() => globalThis.__home148Probe.app.setOfflineStatus(true));
  await expect(page.getByText("Disponível neste dispositivo", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Abrir Curso A" })).toBeEnabled();
  await page.getByRole("button", { name: "Sem conexão" }).click();
  await expect(page.getByText(
    "Sem conexão. A cópia deste dispositivo continua disponível.",
    { exact: true }
  )).toBeVisible();
  await page.keyboard.press("Escape");
  await selector.selectOption(HOME_COURSE_IDS.c);
  await page.getByRole("button", { name: "Sem conexão" }).click();
  await expect(page.getByText(
    "Sem conexão. Conecte-se para abrir este Curso.",
    { exact: true }
  )).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir Curso C" })).toBeDisabled();
  await page.evaluate(() => globalThis.__home148Probe.app.setOfflineStatus(false));

  await page.evaluate((courseId) => {
    globalThis.__home148Probe.failCourseId = courseId;
  }, HOME_COURSE_IDS.c);
  await page.getByRole("button", { name: "Abrir Curso C" }).press("Enter");
  await expect(page.getByRole("alert")).toHaveText(
    "Não foi possível abrir este Curso. Tente novamente."
  );
  await expect(page.getByRole("button", { name: "Tentar novamente Curso C" })).toBeFocused();

  await page.evaluate((courseId) => {
    globalThis.__home148Probe.revokeCourseId = courseId;
  }, HOME_COURSE_IDS.c);
  await page.getByRole("button", { name: "Tentar novamente Curso C" }).press("Enter");
  await expect(page.getByText("Seu acesso a Curso C foi encerrado.", { exact: true })).toBeVisible();
  await expect(selector.locator("option")).toHaveCount(2);
  await expect(selector.locator("option", { hasText: "Curso C" })).toHaveCount(0);
  await expect(page.locator(".home-course-selector-preview")).toHaveCount(1);
  await expect(selector).toBeFocused();

  await page.evaluate((courseId) => {
    const probe = globalThis.__home148Probe;
    probe.navigation.selectedCourseId = courseId;
    probe.reviewItems = [];
    probe.reviewNextItems = [];
    probe.reviewHasMore = true;
    probe.mount();
  }, HOME_COURSE_IDS.a);
  await ensureReviewQueueOpen(page);
  await page.getByRole("button", { name: "Mostrar mais" }).press("Enter");
  await expect(page.locator(".study-review-queue")).toHaveCount(0);
  await expect(selector).toBeFocused();

  const lifecycleMenu = page.locator("[data-action='course-lifecycle-menu']");
  await lifecycleMenu.click();
  await expect(page.getByRole("menuitem", { name: "Excluir este Curso" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Excluir este Curso" })).toBeHidden();
  await expect(lifecycleMenu).toBeFocused();
  await lifecycleMenu.click();
  const studyArea = page.getByRole("button", { name: "Estudo", exact: true });
  await studyArea.click();
  await expect(page.getByRole("menuitem", { name: "Excluir este Curso" })).toBeHidden();
  await expect(studyArea).toBeFocused();
  await lifecycleMenu.click();
  await page.evaluate(() => { globalThis.__home148Probe.failLifecycle = true; });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("menuitem", { name: "Excluir este Curso" }).click();
  await expect(page.getByRole("alert")).toHaveText("Falha simulada no ciclo de vida.");
  await expect(lifecycleMenu).toBeFocused();

  await lifecycleMenu.click();
  await page.evaluate(() => { globalThis.__home148Probe.failLifecycle = false; });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("menuitem", { name: "Excluir este Curso" }).click();
  await expect(page.getByText("Curso A foi excluído.", { exact: true })).toBeVisible();
  await expect(selector).toBeFocused();
  await expect(selector).toHaveValue(HOME_COURSE_IDS.b);
});

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
    const citationStressUnit = documentValue.courses[0].modules[0].lessons[0]
      .microsequences[0].studyUnits[0];
    citationStressUnit.content[0].data.text += ` ${"Contexto extenso antes das Fontes. ".repeat(90)}`;
    const progress = { version: 1, lessons: {} };
    const state = {
      completed: [], annotations: {}, annotationListeners: new Map(), annotationIndex: 0,
      review: new Map(), loadedCourses: [], failWithdraw: false,
      failReviewUpdate: false,
      annotationsRevoked: false, annotationNotFound: false,
      externalProject: null, remotePersonal: null, refreshes: 0, revoked: false,
      citationReads: [], citationRevision: 4, citationsRevoked: false
    };
    const annotationItems = (reference) => state.annotations[reference.studyUnitId] || [];
    const annotation = (reference, draft, overrides = {}) => {
      state.annotationIndex += 1;
      return {
        annotationId: `annotation-${state.annotationIndex}`,
        annotationVersion: 1,
        provenance: { origin: "learner", channel: "study_interface" },
        contributor: { kind: "self", role: "learner", ref: "self", label: "Você" },
        target: { kind: "study_unit", id: reference.studyUnitId },
        rawText: draft.rawText,
        category: draft.category,
        briefSummary: null,
        state: "open",
        ownerResponse: null,
        timestamps: { updatedAt: "2026-08-17T12:00:00.000Z" },
        capabilities: { canRevise: true, canWithdraw: true },
        syncStatus: "synced",
        ...overrides
      };
    };
    state.replaceAnnotations = (studyUnitId, items, { stale = true } = {}) => {
      state.annotations[studyUnitId] = structuredClone(items);
      for (const listener of state.annotationListeners.get(studyUnitId) || []) {
        listener({ stale, annotationIds: items.map(({ annotationId }) => annotationId) });
      }
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
              microTotal + microsequence.studyUnits.length, 0), 0), 0),
        completedStudyUnitCount: state.completed.length
      })),
      loadProject: () => structuredClone(activeProject),
      loadCourse: async (courseId) => {
        state.loadedCourses.push(courseId);
        activeProject = state.externalProject || documentValue;
        return structuredClone(activeProject.courses.find((course) => course.id === courseId));
      },
      loadStudyUnitCitations: async (reference) => {
        state.citationReads.push(structuredClone(reference));
        if (state.citationsRevoked) {
          activeProject = { contract: activeProject.contract, courses: [] };
          throw Object.assign(new Error("Curso não encontrado."), {
            status: 404,
            code: "PT404"
          });
        }
        const revisedProjection = state.citationRevision === 5;
        return {
          contract: "aralearn.course-study-citations.v1",
          courseId: reference.courseId,
          courseRevision: state.citationRevision,
          studyUnitId: reference.studyUnitId,
          citations: [{
            sourceId: "fonte-somente-citada",
            title: revisedProjection ? "Fonte somente citada atualizada" : "Fonte somente citada",
            citationText: revisedProjection
              ? "Autoria. Fonte somente citada atualizada. 2026."
              : "Autoria. Fonte somente citada. 2026.",
            url: null,
            editionOrVersion: "2ª edição",
            anchors: [{
              anchorId: "anchor-publica",
              humanLocator: "Capítulo 4, seção 2",
              selector: { kind: "page_range", startPage: 8, endPage: 9 }
            }]
          }, {
            sourceId: "fonte-com-link",
            title: revisedProjection ? "Fonte com link público atualizada" : "Fonte com link público",
            citationText: revisedProjection
              ? "Autoria. Fonte com link público atualizada. 2026."
              : "Autoria. Fonte com link público. 2026.",
            url: "https://example.test/fonte-publica",
            editionOrVersion: null,
            anchors: []
          }, ...Array.from({ length: 18 }, (_, index) => ({
            sourceId: `fonte-extensa-${index + 1}`,
            title: `Fonte extensa ${index + 1}`,
            citationText: `Autoria. Fonte extensa ${index + 1}. 2026.`,
            url: null,
            editionOrVersion: null,
            anchors: []
          }))]
        };
      },
      loadAnnotationsForPath: (reference) => structuredClone(annotationItems(reference)),
      refreshAnnotationsForPath: async (reference) => {
        if (state.annotationsRevoked) {
          activeProject = { contract: activeProject.contract, courses: [] };
          throw Object.assign(new Error("Curso não encontrado."), {
            status: 404,
            code: "PT404"
          });
        }
        if (state.annotationNotFound) {
          throw Object.assign(new Error("Observação não encontrada."), {
            status: 404,
            code: "COURSE_ANCHORED_ANNOTATION_NOT_FOUND"
          });
        }
        return structuredClone(annotationItems(reference));
      },
      createAnnotationForPath: async (reference, draft) => {
        const value = annotation(reference, structuredClone(draft));
        state.annotations[reference.studyUnitId] = [...annotationItems(reference), value];
        return structuredClone(value);
      },
      reviseAnnotation: async (reference, annotationId, draft) => {
        const items = annotationItems(reference);
        const index = items.findIndex((item) => item.annotationId === annotationId);
        items[index] = {
          ...items[index],
          annotationVersion: items[index].annotationVersion + 1,
          rawText: draft.rawText,
          category: draft.category
        };
        return structuredClone(items[index]);
      },
      withdrawAnnotation: async (reference, annotationId) => {
        if (state.failWithdraw) throw new Error("Sem conexão para retirar a observação.");
        const items = annotationItems(reference);
        const index = items.findIndex((item) => item.annotationId === annotationId);
        items[index] = {
          ...items[index],
          annotationVersion: items[index].annotationVersion + 1,
          rawText: null,
          state: "withdrawn",
          capabilities: { canRevise: false, canWithdraw: false }
        };
      },
      discardFailedAnnotation: async () => true,
      subscribeToAnnotations: (reference, listener) => {
        const listeners = state.annotationListeners.get(reference.studyUnitId) || new Set();
        listeners.add(listener);
        state.annotationListeners.set(reference.studyUnitId, listeners);
        return () => listeners.delete(listener);
      },
      loadReviewItems: () => [...state.review.values()].map((value) => structuredClone(value)),
      isStudyUnitMarkedForReview: (reference) => state.review.has(reference.studyUnitId),
      setStudyUnitReviewMark: async (reference, marked) => {
        if (state.failReviewUpdate) throw new Error("Falha simulada ao atualizar Rever.");
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

  await expect(page.getByRole("button", { name: "Abrir Fixture Minimal" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir Fixture Minimal" }).click();
  await openFirstStudyUnitByClicks(page);
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.loadedCourses.length)).toBe(1);
  await expect(page.getByText("A conjunção só é verdadeira", { exact: false })).toBeVisible();

  expect(await page.evaluate(() => globalThis.__courseStudyProbe.citationReads)).toEqual([]);
  await page.locator("[data-action='toggle-citations']").click();
  await expect(page.getByRole("heading", { name: "Fontes", exact: true })).toBeVisible();
  await expect(page.getByText("Fonte somente citada", { exact: true })).toBeVisible();
  await expect(page.getByText("Capítulo 4, seção 2 · pp. 8–9", {
    exact: true
  })).toBeVisible();
  await expect(page.getByText("Fonte com link público", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir fonte" })).toHaveCount(1);
  await expect(page.locator(".study-citations-panel"))
    .not.toContainText("Fonte oculta");
  await expect(page.locator(".study-citations-panel"))
    .not.toContainText("Legado não resolvido");
  await expect(page.locator(".study-citations-panel [data-source-action]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Fechar fontes" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Fechar fontes" })).toBeInViewport();
  await expect(page.getByRole("heading", { name: "Fontes", exact: true })).toBeInViewport();
  expect(await page.locator(".study-citations-panel").evaluate((panel) =>
    panel.parentElement?.classList.contains("card-sheet-content"))).toBe(true);
  expect(await page.evaluate(() => ({
    documentFits: document.documentElement.scrollHeight <= innerHeight + 1,
    outerScrollable: document.querySelector(".microsequence-generator-screen").scrollHeight >
      document.querySelector(".microsequence-generator-screen").clientHeight + 1,
    contentOverflowY: getComputedStyle(document.querySelector(".card-sheet-content")).overflowY
  }))).toEqual({ documentFits: true, outerScrollable: false, contentOverflowY: "auto" });
  await page.locator(".card-sheet-content").evaluate((content) => {
    content.scrollTop = content.scrollHeight;
  });
  await expect(page.getByText("Fonte extensa 18", { exact: true })).toBeInViewport();
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.citationReads.length)).toBe(1);
  await page.getByRole("button", { name: "Fontes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fontes", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Fontes", exact: true }).click();
  await expect(page.getByText("Fonte com link público", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.citationReads.length)).toBe(1);
  await page.getByRole("button", { name: "Fechar fontes" }).click();

  await page.evaluate(async (documentValue) => {
    globalThis.__courseStudyProbe.citationRevision = 5;
    await globalThis.__courseStudyApp.replaceProject(structuredClone(documentValue));
  }, project);
  await expect(page.locator(".study-citations-panel")).toHaveCount(0);
  await page.locator("[data-action='toggle-citations']").click();
  await expect(page.getByText("Fonte somente citada atualizada", { exact: true })).toBeVisible();
  await expect(page.getByText("Fonte com link público atualizada", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.citationReads.length)).toBe(2);
  await page.getByRole("button", { name: "Fechar fontes" }).click();

  await page.evaluate(() => globalThis.__courseStudyApp.setOfflineStatus(true));
  await page.getByRole("button", { name: "Sem conexão" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Sem conexão. A cópia deste dispositivo continua disponível."
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Marcar para rever" })).toBeEnabled();
  await page.getByRole("button", { name: "Marcar para rever" }).click();
  await page.getByRole("button", { name: /^Observações/u }).click();
  await page.getByRole("textbox", { name: "Observação" }).fill("Guardada durante a desconexão.");
  await page.getByRole("button", { name: "Enviar observação" }).click();
  await expect(page.getByText("Guardada durante a desconexão.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fechar" }).click();
  expect(await page.evaluate(() => ({
    review: globalThis.__courseStudyProbe.review.size,
    observations: Object.values(globalThis.__courseStudyProbe.annotations)
      .reduce((total, items) => total + items.length, 0)
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
      review: [[reference.studyUnitId, {
        title: "Unidade remota",
        context: "Curso · Lição",
        entityPath: Object.values(reference),
        reviewMarkedAt: "2026-08-17T12:20:00.000Z"
      }]]
    };
    const remote = structuredClone(probe.annotations[reference.studyUnitId][0]);
    remote.rawText = "Observação recebida de outro dispositivo.";
    remote.category = "possible_error";
    remote.annotationVersion += 1;
    remote.ownerResponse = {
      text: "Retorno privado da autoria.",
      updatedAt: "2026-08-17T12:30:00.000Z"
    };
    probe.replaceAnnotations(reference.studyUnitId, [remote], { stale: false });
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
  await expect(page.getByRole("button", { name: /^Observações/u })).toBeFocused();
  await expect(page.getByRole("button", { name: "Marcar para rever" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate((previousScrollTop) => {
    const scroller = document.querySelector(".screen-content");
    return scroller.scrollTop === Math.min(
      previousScrollTop,
      scroller.scrollHeight - scroller.clientHeight
    );
  }, refreshContext.scrollTop)).toBe(true);
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.refreshes)).toBe(1);
  await page.getByRole("button", { name: /^Observações/u }).click();
  const observationClose = page.getByRole("button", { name: "Fechar" });
  const studyScreen = page.locator(".app-shell > .screen");
  await expect(observationClose).toBeFocused();
  await expect(studyScreen).toHaveAttribute("inert", "");
  await expect(studyScreen).toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Enviar observação" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(observationClose).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Observações da Unidade de estudo" }))
    .toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Observações/u })).toBeFocused();
  await expect(studyScreen).not.toHaveAttribute("inert", "");
  await expect(studyScreen).not.toHaveAttribute("aria-hidden", "true");
  await page.getByRole("button", { name: /^Observações/u }).click();
  await expect(page.getByText("Observação recebida de outro dispositivo.", { exact: true }))
    .toBeVisible();
  await expect(page.getByText("Retorno privado da autoria.", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Observação" })).toHaveValue("");
  await page.getByRole("button", { name: "Fechar" }).click();
  await page.evaluate(() => globalThis.__courseStudyApp.openCourses());
  await expect(page.getByLabel("Progresso: 1 de 2")).toBeVisible();
  await ensureReviewQueueOpen(page);
  await expect(page.getByRole("button", { name: "Abrir para rever: Unidade remota" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir para rever: Unidade remota" }).click();
  await expect(page.locator("[data-study-destination-heading]")).toBeFocused();
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(page.getByRole("button", { name: "Abrir para rever: Unidade remota" }))
    .toBeFocused();
  await page.getByRole("button", { name: "Abrir para rever: Unidade remota" }).click();

  await page.getByRole("button", { name: "Ver explicação" }).click();
  await expect(page.getByText("Se uma delas for falsa", { exact: false })).toBeVisible();
  await page.locator("[data-action='continue-feedback']").click();
  await expect(page.getByText("Complete", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.completed.length)).toBe(1);

  await page.getByRole("button", { name: /^Observações/u }).click();
  await page.getByRole("textbox", { name: "Observação" }).fill("Conferir a formulação.");
  await page.getByRole("button", { name: "Enviar observação" }).click();
  await page.getByRole("textbox", { name: "Observação" }).fill("Segunda observação no mesmo alvo.");
  await page.getByRole("button", { name: "Enviar observação" }).click();
  expect(await page.evaluate(() => Object.values(globalThis.__courseStudyProbe.annotations)
    .reduce((total, items) => total + items.length, 0))).toBe(3);
  await page.getByRole("button", { name: "Editar observação" }).first().click();
  await page.getByRole("textbox", { name: "Observação" }).fill("Formulação revisada.");
  await page.getByRole("button", { name: "Salvar edição" }).click();
  await expect(page.getByText("Formulação revisada.", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Observação" }).fill("Rascunho local preservado.");
  await page.evaluate(() => {
    const probe = globalThis.__courseStudyProbe;
    const target = "card-fixture-minimal-complete";
    const items = structuredClone(probe.annotations[target]);
    items.push({
      ...structuredClone(items[0]),
      annotationId: "annotation-remote-session",
      annotationVersion: 1,
      rawText: "Chegou de outra sessão.",
      category: "question"
    });
    probe.replaceAnnotations(target, items, { stale: true });
    probe.failWithdraw = true;
  });
  await expect(page.getByText("Há mudanças em outra sessão.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Retirar observação" }).first().click();
  await expect(page.getByRole("alert")).toHaveText("Sem conexão para retirar a observação.");
  await expect(page.getByRole("textbox", { name: "Observação" }))
    .toHaveValue("Rascunho local preservado.");
  expect(await page.evaluate(() => Object.values(globalThis.__courseStudyProbe.annotations)
    .reduce((total, items) => total + items.length, 0))).toBe(4);
  await page.getByRole("button", { name: "Fechar" }).click();
  await page.evaluate(() => { globalThis.__courseStudyProbe.failWithdraw = false; });
  await page.getByRole("button", { name: /^Observações/u }).click();
  await expect(page.getByText("Chegou de outra sessão.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retirar observação" }).first().click();
  await expect(page.getByText("Conteúdo retirado.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fechar" }).click();

  await page.getByRole("button", { name: "Marcar para rever" }).click();
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.review.size)).toBe(2);

  await page.evaluate(() => globalThis.__courseStudyApp.openCourses());
  await ensureReviewQueueOpen(page);
  await expect(page.getByRole("button", { name: "Abrir para rever: Unidade marcada" })).toBeVisible();
  await page.getByRole("button", { name: "Retirar de Rever: Unidade marcada" }).click();
  await expect(page.getByRole("button", { name: "Abrir para rever: Unidade marcada" }))
    .toHaveCount(0);
  await expect(page.getByRole("button", { name: "Desfazer" })).toBeFocused();
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.review.size)).toBe(1);
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByRole("button", { name: "Abrir para rever: Unidade marcada" })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.review.size)).toBe(2);
  await page.evaluate(() => { globalThis.__courseStudyProbe.failReviewUpdate = true; });
  const removeReview = page.getByRole("button", { name: "Retirar de Rever: Unidade marcada" });
  await removeReview.click();
  await expect(page.getByRole("alert")).toHaveText("Falha simulada ao atualizar Rever.");
  await expect(removeReview).toBeFocused();
  await page.evaluate(() => { globalThis.__courseStudyProbe.failReviewUpdate = false; });
  await removeReview.click();
  await page.evaluate(() => { globalThis.__courseStudyProbe.failReviewUpdate = true; });
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByRole("alert")).toHaveText("Falha simulada ao atualizar Rever.");
  await expect(page.getByRole("button", { name: "Desfazer" })).toBeFocused();
  await page.evaluate(() => { globalThis.__courseStudyProbe.failReviewUpdate = false; });
  await page.getByRole("button", { name: "Desfazer" }).click();
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
  await page.getByRole("button", { name: "Ações deste Curso" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("menuitem", { name: "Zerar progresso" }).click();
  await page.getByRole("button", { name: "Ações deste Curso" }).click();
  await expect(page.getByRole("menuitem", { name: "Zerar progresso" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.completed.length)).toBe(0);
  await ensureReviewQueueOpen(page);
  await page.getByRole("button", { name: "Abrir para rever: Unidade marcada" }).click();

  await page.locator("[data-action='text-gap-open-choice']").click();
  await page.locator("[data-action='text-gap-set-choice'][data-text-gap-value='as duas são verdadeiras']").click();
  await page.locator("[data-action='next-study-unit']").click();
  await expect(page.getByText("As duas partes precisam ser verdadeiras.", { exact: true })).toBeVisible();
  await page.locator("[data-action='continue-feedback']").click();
  await expect(page.getByRole("heading", { name: "Microssequências didáticas" })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseStudyProbe.completed.length)).toBe(1);

  await page.getByRole("button", { name: "Abrir microssequência didática" }).click();
  await page.getByRole("button", { name: "Abrir unidade" }).first().click();
  await page.evaluate(() => { globalThis.__courseStudyProbe.annotationNotFound = true; });
  await page.getByRole("button", { name: /^Observações/u }).click();
  await expect(page.getByRole("alert")).toHaveText("Observação não encontrada.");
  await expect(page.getByText("A conjunção só é verdadeira", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Fechar" }).click();
  await page.evaluate(() => {
    globalThis.__courseStudyProbe.annotationNotFound = false;
    globalThis.__courseStudyProbe.annotationsRevoked = true;
  });
  await page.getByRole("button", { name: /^Observações/u }).click();
  await expect(page.getByText(
    "Nenhum Curso está disponível para estudo nesta conta."
  )).toBeVisible();
  await expect(page.locator(".study-observation-sheet")).toHaveCount(0);
  await expect(page.locator(".study-citations-panel")).toHaveCount(0);
  await expect(page.getByText("A conjunção só é verdadeira", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Fonte com link público atualizada", { exact: true })).toHaveCount(0);
});

test("sheet de Observações preserva toque e enquadramento em 360/390/430/1280", async ({ page }) => {
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
    createCourseStudyApplication({
      root: document.querySelector("#study-root"),
      initialProject: documentValue,
      repository: {
        loadProject: () => structuredClone(documentValue),
        loadProgress: () => ({ version: 1, lessons: {} }),
        loadReviewItems: () => [],
        loadCourseSummaries: () => [{
          courseId: course.id,
          canEdit: true,
          moduleCount: course.modules.length,
          lessonCount: course.modules.reduce((total, moduleValue) =>
            total + moduleValue.lessons.length, 0),
          studyUnitCount: 2,
          completedStudyUnitCount: 0
        }],
        loadAnnotationsForPath: () => [],
        refreshAnnotationsForPath: async () => [],
        subscribeToAnnotations: () => () => {},
        isStudyUnitMarkedForReview: () => false,
        flush: async () => undefined
      }
    });
  }, project);
  await page.getByRole("button", { name: "Abrir Fixture Minimal" }).click();
  await openFirstStudyUnitByClicks(page);

  for (const width of [360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: width < 600 ? 780 : 900 });
    await page.getByRole("button", { name: /^Observações/u }).click();
    await expect(page.getByRole("dialog", { name: "Observações da Unidade", exact: true }))
      .toBeVisible();
    await page.getByRole("textbox", { name: "Observação" }).fill("😀a");
    await expect(page.locator("#study-observation-counter"))
      .toHaveText("2/2.000 caracteres · 5 B/16 KiB");
    const stableHeight = await page.locator(".study-observation-sheet")
      .evaluate((sheet) => sheet.getBoundingClientRect().height);
    await page.getByRole("textbox", { name: "Observação" }).fill("observação ".repeat(180));
    const geometry = await page.locator(".study-observation-sheet").evaluate((sheet) => {
      const rect = sheet.getBoundingClientRect();
      const body = sheet.querySelector(".study-observation-body");
      const textarea = sheet.querySelector(".study-observation-textarea");
      const controls = [...sheet.querySelectorAll("button, textarea, .study-observation-category-chip")]
        .filter((node) => {
          const nodeRect = node.getBoundingClientRect();
          return nodeRect.width > 0 && nodeRect.height > 0;
        });
      return {
        documentFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
        sheetFits: rect.left >= -1 && rect.right <= window.innerWidth + 1 &&
          sheet.scrollWidth <= sheet.clientWidth + 1,
        height: rect.height,
        bodyOverflowY: getComputedStyle(body).overflowY,
        internalScrollable: textarea.scrollHeight > textarea.clientHeight,
        minimumTouch: Math.min(...controls.map((node) => node.getBoundingClientRect().height))
      };
    });
    expect(geometry).toMatchObject({ documentFits: true, sheetFits: true });
    expect(Math.abs(geometry.height - stableHeight)).toBeLessThanOrEqual(1);
    expect(geometry.bodyOverflowY).toBe("auto");
    expect(geometry.internalScrollable).toBe(true);
    expect(geometry.minimumTouch).toBeGreaterThanOrEqual(43);
    await page.getByRole("button", { name: "Fechar" }).click();
  }
});

test("zerar progresso mostra falhas de carga e gravação antes de concluir", async ({ page }) => {
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
    const firstModule = course.modules[0];
    const firstLesson = firstModule.lessons[0];
    const firstStudyUnit = firstLesson.microsequences[0].studyUnits[0];
    const progress = {
      version: 1,
      lessons: {
        [`${course.id}::${firstModule.id}::${firstLesson.id}`]: {
          cursorStudyUnitId: firstStudyUnit.id,
          completedStudyUnitIds: [firstStudyUnit.id]
        }
      }
    };
    const probe = { loads: 0, clears: 0, fail: true, failClear: true };
    globalThis.__thinStudyProbe = probe;
    createCourseStudyApplication({
      root: document.querySelector("#study-root"),
      initialProject,
      repository: {
        loadProject: () => structuredClone(activeProject),
        loadCourse: async () => {
          probe.loads += 1;
          if (probe.fail) throw new Error("Falha simulada ao carregar o Curso.");
          activeProject = documentValue;
          return structuredClone(course);
        },
        loadProgress: () => structuredClone(progress),
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
        clearCourseProgress: async () => {
          if (probe.failClear) throw new Error("Falha simulada ao zerar o progresso.");
          progress.lessons = {};
          probe.clears += 1;
        },
        loadAnnotationsForPath: () => [],
        isStudyUnitMarkedForReview: () => false,
        flush: async () => undefined
      }
    });
  }, project);

  const courseActions = page.getByRole("button", { name: "Ações deste Curso" });
  await courseActions.click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("menuitem", { name: "Zerar progresso" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Não foi possível abrir este Curso. Tente novamente."
  );
  await expect(courseActions).toBeFocused();
  await expect.poll(() => page.evaluate(() => ({
    loads: globalThis.__thinStudyProbe.loads,
    clears: globalThis.__thinStudyProbe.clears
  }))).toEqual({ loads: 1, clears: 0 });

  await page.evaluate(() => { globalThis.__thinStudyProbe.fail = false; });
  await courseActions.click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("menuitem", { name: "Zerar progresso" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Não foi possível zerar o progresso. Tente novamente."
  );
  await expect(courseActions).toBeFocused();
  await expect.poll(() => page.evaluate(() => ({
    loads: globalThis.__thinStudyProbe.loads,
    clears: globalThis.__thinStudyProbe.clears
  }))).toEqual({ loads: 2, clears: 0 });

  await page.evaluate(() => { globalThis.__thinStudyProbe.failClear = false; });
  await courseActions.click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("menuitem", { name: "Zerar progresso" }).click();
  await expect.poll(() => page.evaluate(() => ({
    loads: globalThis.__thinStudyProbe.loads,
    clears: globalThis.__thinStudyProbe.clears
  }))).toEqual({
    loads: 3,
    clears: 1
  });
  await courseActions.click();
  await expect(page.getByRole("menuitem", { name: "Zerar progresso" })).toHaveCount(0);
});

test("avanço guarda localmente, não espera o flush e bloqueia ativações concorrentes", async ({
  page
}) => {
  await page.route("**/main.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: ""
  }));
  await page.goto("/");
  await page.evaluate(async (documentValue) => {
    document.body.innerHTML = '<main id="study-root"></main>';
    const { createCourseStudyApplication } = await import("/src/study/CourseStudyApplication.js");
    const projectValue = structuredClone(documentValue);
    const course = projectValue.courses[0];
    const microsequence = course.modules[0].lessons[0].microsequences[0];
    for (const studyUnit of microsequence.studyUnits) {
      studyUnit.feedback = [];
      studyUnit.response = null;
      studyUnit.role = "theory";
    }
    let releaseLocal = null;
    const probe = {
      mode: "pending",
      completionCalls: [],
      flushCalls: 0,
      releaseLocal: () => releaseLocal?.()
    };
    globalThis.__studyAdvanceProbe = probe;
    createCourseStudyApplication({
      root: document.querySelector("#study-root"),
      initialProject: projectValue,
      repository: {
        loadProject: () => structuredClone(projectValue),
        loadProgress: () => ({ version: 1, lessons: {} }),
        loadReviewItems: () => [],
        loadCourseSummaries: () => [{
          courseId: course.id,
          canEdit: true,
          moduleCount: course.modules.length,
          lessonCount: course.modules[0].lessons.length,
          studyUnitCount: microsequence.studyUnits.length,
          completedStudyUnitCount: 0
        }],
        loadAnnotationsForPath: () => [],
        isStudyUnitMarkedForReview: () => false,
        async setStudyUnitCompleted(reference, completed, options) {
          probe.completionCalls.push({
            reference: structuredClone(reference),
            completed,
            options: structuredClone(options)
          });
          if (probe.mode === "fail") throw new Error("Falha local simulada.");
          if (probe.mode === "pending") {
            await new Promise((resolve) => { releaseLocal = resolve; });
          }
        },
        flush() {
          probe.flushCalls += 1;
          return new Promise(() => {});
        }
      }
    });
  }, project);

  await page.getByRole("button", { name: "Abrir Fixture Minimal" }).click();
  await openFirstStudyUnitByClicks(page);
  const initialTitle = await page.locator(".runtime-card-title").textContent();
  const nextButton = page.locator("[data-action='next-study-unit']");
  await nextButton.evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  });
  await expect(page.getByRole("button", { name: "Guardando progresso" })).toBeDisabled();
  expect(await page.evaluate(() => globalThis.__studyAdvanceProbe.completionCalls)).toHaveLength(1);
  expect(await page.evaluate(() => globalThis.__studyAdvanceProbe.completionCalls[0])).toMatchObject({
    completed: true,
    options: { synchronize: false }
  });
  await expect(page.locator(".runtime-card-title")).toHaveText(initialTitle);

  await page.evaluate(() => globalThis.__studyAdvanceProbe.releaseLocal());
  await expect(page.locator(".runtime-card-title")).not.toHaveText(initialTitle);
  await expect.poll(() => page.evaluate(() => globalThis.__studyAdvanceProbe.flushCalls)).toBe(1);

  await page.getByRole("button", { name: "Unidade anterior" }).click();
  await expect(page.locator(".runtime-card-title")).toHaveText(initialTitle);
  await page.evaluate(() => { globalThis.__studyAdvanceProbe.mode = "fail"; });
  await page.getByRole("button", { name: "Próxima Unidade" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Não foi possível guardar o progresso neste dispositivo. Tente novamente."
  );
  await expect(page.locator(".runtime-card-title")).toHaveText(initialTitle);
  await expect(page.getByRole("button", { name: "Próxima Unidade" })).toBeEnabled();
  expect(await page.evaluate(() => globalThis.__studyAdvanceProbe.completionCalls)).toHaveLength(2);
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
    topics: []
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
            studyUnits: [
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
                { text: "Escolha certo, repita certo e finalize agora." }
              )], packageInstance("choice-gap-response", "aralearn.response.gap", {
                prompt: "Complete.",
                blanks: [{
                  id: "choice-gap",
                  targetInstanceId: "choice-gap-copy",
                  targetPath: "text",
                  responseMode: "choice",
                  answer: "certo",
                  distractors: ["errado"]
                }, {
                  id: "choice-gap-same",
                  targetInstanceId: "choice-gap-copy",
                  targetPath: "text",
                  responseMode: "choice",
                  answer: "certo",
                  distractors: ["errado"]
                }, {
                  id: "choice-gap-different",
                  targetInstanceId: "choice-gap-copy",
                  targetPath: "text",
                  responseMode: "choice",
                  answer: "agora",
                  distractors: ["depois"]
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
        loadAnnotationsForPath: () => [],
        isStudyUnitMarkedForReview: () => false,
        setStudyUnitCompleted: async (reference) => { completed.push(structuredClone(reference)); },
        flush: async () => undefined
      }
    });
  }, projectValue);

  await page.getByRole("button", { name: "Abrir Interações de Estudo" }).click();
  await openFirstStudyUnitByClicks(page);

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

  let choiceGaps = page.locator("[data-action='text-gap-open-choice']");
  await expect(choiceGaps).toHaveCount(3);
  await page.locator("[data-action='next-study-unit']").click();
  await expect(page.getByRole("alert")).toContainText("Complete todas as lacunas.");
  await expect(page.locator("[data-action='text-gap-set-choice']").first()).toBeFocused();
  await choiceGaps.nth(0).focus();
  await choiceGaps.nth(0).press("Enter");
  await expect(page.locator("[data-text-gap-prompt='true']")).toBeVisible();
  await page.locator("[data-action='text-gap-set-choice'][data-text-gap-value='certo']").click();
  choiceGaps = page.locator("[data-action='text-gap-open-choice']");
  await expect(choiceGaps.nth(0)).toHaveAttribute("data-empty", "false");
  await expect(choiceGaps.nth(1)).toHaveAttribute("data-empty", "true");
  await choiceGaps.nth(0).press("Space");
  await expect(page.locator("[data-text-gap-prompt='true']")).toHaveCount(0);
  choiceGaps = page.locator("[data-action='text-gap-open-choice']");
  await expect(choiceGaps.nth(0)).toHaveAttribute("data-empty", "true");
  await expect(choiceGaps.nth(1)).toHaveAttribute("data-empty", "true");
  await choiceGaps.nth(1).click();
  await page.locator("[data-action='text-gap-set-choice'][data-text-gap-value='certo']").click();
  choiceGaps = page.locator("[data-action='text-gap-open-choice']");
  await expect(choiceGaps.nth(0)).toHaveAttribute("data-empty", "true");
  await expect(choiceGaps.nth(1)).toHaveAttribute("data-empty", "false");
  await choiceGaps.nth(0).click();
  await page.locator("[data-action='text-gap-set-choice'][data-text-gap-value='certo']").click();
  choiceGaps = page.locator("[data-action='text-gap-open-choice']");
  await choiceGaps.nth(2).click();
  await page.locator("[data-action='text-gap-set-choice'][data-text-gap-value='agora']").click();
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
