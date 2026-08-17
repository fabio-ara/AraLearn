import { expect, test } from "@playwright/test";

const COURSE_IDS = Object.freeze([
  "10000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "30000000-0000-4000-8000-000000000003"
]);
const CREATED_COURSE_ID = "40000000-0000-4000-8000-000000000004";
const OWNER_ID = "50000000-0000-4000-8000-000000000005";
const STUDENT_ID = "60000000-0000-4000-8000-000000000006";

function captureClientErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  return errors;
}

async function expectNoHorizontalOverflow(page) {
  await expect.poll(() => page.evaluate(() => {
    const surface = document.querySelector(".course-authoring-surface");
    const frame = document.querySelector(".course-authoring-frame");
    if (!surface || !frame) return null;
    const surfaceRect = surface.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    return {
      document: document.documentElement.scrollWidth <= window.innerWidth + 1,
      surface: surface.scrollWidth <= surface.clientWidth + 1,
      frame: frame.scrollWidth <= frame.clientWidth + 1,
      insideViewport: surfaceRect.left >= -1 && surfaceRect.right <= window.innerWidth + 1,
      frameWidth: Math.round(frameRect.width)
    };
  })).toMatchObject({
    document: true,
    surface: true,
    frame: true,
    insideViewport: true
  });
  const frameWidth = await page.locator(".course-authoring-frame").evaluate(
    (element) => element.getBoundingClientRect().width
  );
  expect(frameWidth).toBeLessThanOrEqual(430.5);
}

async function mountCourseAuthoring(page, {
  cardinality = "many",
  hash = ""
} = {}) {
  await page.route("**/main.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: ""
  }));
  await page.goto(hash ? `/${hash}` : "/");
  await page.evaluate(async ({
    requestedCardinality,
    courseIds,
    createdCourseId,
    ownerId,
    studentId
  }) => {
    document.body.replaceChildren();
    const root = document.createElement("main");
    root.id = "course-authoring-root";
    document.body.append(root);

    const { createCourseAuthoringSurface } = await import(
      "/src/ui/CourseAuthoringSurface.js"
    );

    const definitions = [{
      courseId: courseIds[0],
      title: "Fundamentos de relações",
      goal: "Compreender relações essenciais por meio de exemplos graduais.",
      revision: 5,
      plan: {
        id: "71000000-0000-4000-8000-000000000011",
        version: 3,
        audience: "Pessoas iniciantes.",
        scope: "Relações e evidências.",
        authoringGuidance: "Priorizar explicações completas e exemplos concretos.",
        preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
        intendedLearningOutcomes: [],
        instructionalAnalysisUnits: [],
        evidenceRequirements: [],
        parts: [{
          id: "70000000-0000-4000-8000-000000000007",
          title: "Relações iniciais",
          intent: "Materializar a comparação orientada.",
          version: 1,
          position: 0,
          microsequences: [{
            id: "microsequence-a",
            productionPosition: 0,
            title: "Comparação orientada",
            curriculumPath: {
              moduleId: "module-a",
              moduleTitle: "Base conceitual",
              lessonId: "lesson-a",
              lessonTitle: "Relações e evidências"
            },
            studyUnitCount: 2
          }],
          progress: {
            state: "materializing",
            microsequenceCount: 1,
            studyUnitCount: 2,
            lastMaterialization: {
              id: "75000000-0000-4000-8000-000000000015",
              status: "running",
              version: 2,
              completedStepCount: 1,
              failedStepCount: 0,
              totalStepCount: 2,
              startedAt: "2026-08-17T12:00:00.000Z",
              updatedAt: "2026-08-17T12:02:00.000Z",
              completedAt: null
            }
          }
        }],
        counts: {
          intendedLearningOutcomeCount: 0,
          instructionalAnalysisUnitCount: 0,
          evidenceRequirementCount: 0,
          authoringPartCount: 1,
          linkedDidacticMicrosequenceCount: 1,
          studyUnitCount: 2
        },
        updatedAt: "2026-08-17T12:00:00.000Z"
      }
    }, {
      courseId: courseIds[1],
      title: "Aplicações comparadas",
      goal: "Aplicar os conceitos em situações contrastantes.",
      revision: 2,
      plan: {
        id: "72000000-0000-4000-8000-000000000012",
        version: 1,
        audience: null,
        scope: null,
        authoringGuidance: "Alternar explicação e prática.",
        preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
        intendedLearningOutcomes: [],
        instructionalAnalysisUnits: [],
        evidenceRequirements: [],
        parts: [],
        counts: {
          intendedLearningOutcomeCount: 0,
          instructionalAnalysisUnitCount: 0,
          evidenceRequirementCount: 0,
          authoringPartCount: 0,
          linkedDidacticMicrosequenceCount: 0,
          studyUnitCount: 0
        },
        updatedAt: "2026-08-17T12:00:00.000Z"
      }
    }, {
      courseId: courseIds[2],
      title: "Leitura crítica de dados",
      goal: "Interpretar evidências com cautela.",
      revision: 3,
      plan: {
        id: "73000000-0000-4000-8000-000000000013",
        version: 1,
        audience: null,
        scope: null,
        authoringGuidance: "Distinguir dado, métrica e inferência.",
        preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
        intendedLearningOutcomes: [],
        instructionalAnalysisUnits: [],
        evidenceRequirements: [],
        parts: [],
        counts: {
          intendedLearningOutcomeCount: 0,
          instructionalAnalysisUnitCount: 0,
          evidenceRequirementCount: 0,
          authoringPartCount: 0,
          linkedDidacticMicrosequenceCount: 0,
          studyUnitCount: 0
        },
        updatedAt: "2026-08-17T12:00:00.000Z"
      }
    }];
    const count = requestedCardinality === "zero" ? 0 :
      requestedCardinality === "one" ? 1 : definitions.length;
    const courses = definitions.slice(0, count);
    const entityRows = [{
      entityType: "module",
      entityId: "module-a",
      parentType: null,
      parentId: null,
      position: 0,
      version: 1,
      content: { title: "Base conceitual" }
    }, {
      entityType: "lesson",
      entityId: "lesson-a",
      parentType: "module",
      parentId: "module-a",
      position: 0,
      version: 1,
      content: { title: "Relações e evidências" }
    }, {
      entityType: "microsequence",
      entityId: "microsequence-a",
      parentType: "lesson",
      parentId: "lesson-a",
      position: 0,
      version: 1,
      content: {
        title: "Comparação orientada",
        goal: "Comparar duas relações sem confundir associação e causa."
      }
    }, {
      entityType: "card",
      entityId: "study-unit-a",
      parentType: "microsequence",
      parentId: "microsequence-a",
      position: 1,
      version: 1,
      content: {
        title: "Exemplo guiado",
        role: "theory",
        content: [{ data: { text: "Compare primeiro as evidências disponíveis." } }]
      }
    }, {
      entityType: "card",
      entityId: "study-unit-b",
      parentType: "microsequence",
      parentId: "microsequence-a",
      position: 2,
      version: 1,
      content: {
        title: "Prática de contraste",
        role: "practice",
        content: [{ data: { text: "Identifique qual conclusão os dados sustentam." } }]
      }
    }];
    const probe = {
      listReads: 0,
      headerReads: 0,
      documentReads: 0,
      peopleReads: 0,
      planReads: 0,
      materializationReads: [],
      createCalls: [],
      planMutations: [],
      materializationRequests: [],
      closeCalls: 0
    };
    const counts = {
      moduleCount: 1,
      lessonCount: 1,
      topicCount: 0,
      microsequenceCount: 1,
      studyUnitCount: 2
    };
    const courseDetail = (courseId) => {
      const course = courses.find((item) => item.courseId === courseId);
      if (!course) {
        const error = new Error("Curso ausente");
        error.status = 404;
        throw error;
      }
      return {
        courseId: course.courseId,
        title: course.title,
        goal: course.goal,
        revision: course.revision,
        ownership: "owned",
        canEdit: true,
        counts
      };
    };
    const controller = {
      async listCourses({ query = "" } = {}) {
        probe.listReads += 1;
        const normalizedQuery = String(query).trim().toLocaleLowerCase("pt-BR");
        const items = courses.filter((course) =>
          !normalizedQuery || course.title.toLocaleLowerCase("pt-BR").includes(normalizedQuery)
        ).map((course) => ({
          ...courseDetail(course.courseId)
        }));
        return {
          contract: "aralearn.course-list.v1",
          items,
          hasMore: false,
          nextCursor: null
        };
      },
      async getCourse(courseId) {
        probe.headerReads += 1;
        return courseDetail(courseId);
      },
      async loadCourseDocument(courseId) {
        probe.documentReads += 1;
        return {
          course: courseDetail(courseId),
          rows: structuredClone(entityRows),
          document: { courses: [] },
          offline: false,
          stale: false
        };
      },
      async createCourse(value) {
        probe.createCalls.push(structuredClone(value));
        courses.push({
          courseId: createdCourseId,
          title: value.title,
          goal: value.objective,
          revision: 1,
          plan: {
            id: "74000000-0000-4000-8000-000000000014",
            version: 1,
            audience: null,
            scope: null,
            authoringGuidance: null,
            preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
            intendedLearningOutcomes: [],
            instructionalAnalysisUnits: [],
            evidenceRequirements: [],
            parts: [],
            counts: {
              intendedLearningOutcomeCount: 0,
              instructionalAnalysisUnitCount: 0,
              evidenceRequirementCount: 0,
              authoringPartCount: 0,
              linkedDidacticMicrosequenceCount: 0,
              studyUnitCount: 0
            },
            updatedAt: "2026-08-17T12:00:00.000Z"
          }
        });
        return { courseId: createdCourseId, revision: 1 };
      },
      async loadAuthoringPlan(courseId) {
        probe.planReads += 1;
        const course = courses.find((item) => item.courseId === courseId);
        if (!course) throw new Error("Curso ausente");
        return {
          contract: "aralearn.course-instructional-plan.v1",
          courseId,
          courseRevision: course.revision,
          plan: {
            ...structuredClone(course.plan),
            title: course.title,
            objective: course.goal
          },
          recentActivity: []
        };
      },
      async loadPartMaterialization(courseId, authoringPartId, materializationId) {
        probe.materializationReads.push({
          courseId,
          authoringPartId,
          materializationId
        });
        const steps = [{
          id: "76000000-0000-4000-8000-000000000016",
          position: 0,
          kind: "context_load",
          targetDidacticMicrosequenceId: null,
          productionPosition: null,
          status: "completed",
          version: 2,
          resultFacts: { loadedSources: 2 },
          updatedAt: "2026-08-17T12:01:00.000Z",
          completedAt: "2026-08-17T12:01:00.000Z"
        }, {
          id: "77000000-0000-4000-8000-000000000017",
          position: 1,
          kind: "validation",
          targetDidacticMicrosequenceId: null,
          productionPosition: null,
          status: "pending",
          version: 1,
          resultFacts: {},
          updatedAt: "2026-08-17T12:00:00.000Z",
          completedAt: null
        }];
        return {
          contract: "aralearn.course-authoring-part-materialization.v1",
          courseId,
          courseRevision: 5,
          authoringPartId,
          materialization: {
            id: materializationId,
            authoringPartVersion: 1,
            channel: "mcp",
            status: "running",
            version: 2,
            designContext: { focus: "Comparação orientada" },
            resultFacts: {},
            startedAt: "2026-08-17T12:00:00.000Z",
            updatedAt: "2026-08-17T12:02:00.000Z",
            completedAt: null,
            steps,
            nextPendingStep: steps[1]
          }
        };
      },
      async mutateAuthoringPlan(value) {
        probe.planMutations.push(structuredClone(value));
        const course = courses.find((item) => item.courseId === value.courseId);
        if (value.operation !== "update_plan") return;
        course.title = value.title;
        course.goal = value.objective;
        course.plan.audience = value.audience || null;
        course.plan.scope = value.scope || null;
        course.plan.authoringGuidance = value.authoringGuidance || null;
        course.plan.preferredPartCount = structuredClone(value.preferredPartCount);
        course.plan.version += 1;
        course.plan.updatedAt = "2026-08-17T12:05:00.000Z";
        course.revision += 1;
      },
      async requestPartMaterialization(value) {
        probe.materializationRequests.push(structuredClone(value));
        return { delivery: "chat" };
      },
      async clearCourse() {},
      async listCourseAccess(courseId) {
        probe.peopleReads += 1;
        return {
          contract: "aralearn.course-people.v1",
          courseId,
          owner: {
            userId: ownerId,
            displayName: "Pessoa proprietária",
            avatarObjectKey: null
          },
          people: [{
            userId: studentId,
            displayName: "Pessoa estudante",
            avatarObjectKey: null,
            grantedAt: "2026-08-17T12:00:00.000Z"
          }]
        };
      },
      async grantCourseAccess() { return { changed: true }; },
      async revokeCourseAccess() { return { changed: true }; }
    };
    const surface = createCourseAuthoringSurface({
      root,
      controller,
      locationValue: window.location,
      historyValue: window.history,
      windowValue: window,
      confirmValue: () => true,
      onClose() { probe.closeCalls += 1; }
    });
    globalThis.__courseAuthoringHarness = { surface, probe };
    await surface.open();
  }, {
    requestedCardinality: cardinality,
    courseIds: COURSE_IDS,
    createdCourseId: CREATED_COURSE_ID,
    ownerId: OWNER_ID,
    studentId: STUDENT_ID
  });
  await expect(page.locator(".course-authoring-surface")).toHaveAttribute(
    "aria-busy",
    "false"
  );
}

test.describe("Autoria canônica mobile-first", () => {
  for (const width of [360, 390, 430, 1280]) {
    test(`lista de muitos Cursos permanece legível em ${width} px`, async ({ page }, testInfo) => {
      const clientErrors = captureClientErrors(page);
      await page.setViewportSize({ width, height: width < 600 ? 780 : 900 });
      await mountCourseAuthoring(page, { cardinality: "many" });

      await expect(page.getByRole("heading", { name: "Meus cursos" })).toBeVisible();
      await expect(page.locator(".course-authoring-course-list")).toHaveAttribute(
        "data-cardinality",
        "many"
      );
      await expect(page.locator(".course-authoring-course-card")).toHaveCount(3);
      await expectNoHorizontalOverflow(page);

      await page.screenshot({
        path: testInfo.outputPath(`course-authoring-${width}.png`),
        fullPage: true,
        animations: "disabled"
      });
      expect(clientErrors).toEqual([]);
    });
  }

  for (const width of [360, 1280]) {
    test(`etapas retomáveis abrem sob demanda sem overflow em ${width} px`, async ({
      page
    }, testInfo) => {
      const clientErrors = captureClientErrors(page);
      await page.setViewportSize({ width, height: width < 600 ? 780 : 900 });
      const planningHash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
      await mountCourseAuthoring(page, { cardinality: "many", hash: planningHash });

      expect(await page.evaluate(() =>
        globalThis.__courseAuthoringHarness.probe.materializationReads)).toEqual([]);
      await page.getByRole("button", { name: "Ver etapas" }).click();
      await expect(page.getByText("Etapas da materialização", { exact: true })).toBeVisible();
      await expect(page.getByText("Próxima: etapa 2 · Validar produção", {
        exact: true
      })).toBeVisible();
      await expect(page.getByLabel("Etapas da materialização")
        .getByText("Comparação orientada", { exact: true })).toBeVisible();
      expect(await page.evaluate(() =>
        globalThis.__courseAuthoringHarness.probe.materializationReads)).toEqual([{
        courseId: COURSE_IDS[0],
        authoringPartId: "70000000-0000-4000-8000-000000000007",
        materializationId: "75000000-0000-4000-8000-000000000015"
      }]);
      await expectNoHorizontalOverflow(page);

      await page.screenshot({
        path: testInfo.outputPath(`course-authoring-materialization-${width}.png`),
        fullPage: true,
        animations: "disabled"
      });
      expect(clientErrors).toEqual([]);
    });
  }
});

test("lista distingue zero e um Curso sem criar outra superfície", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 780 });
  await mountCourseAuthoring(page, { cardinality: "zero" });
  await expect(page.getByRole("heading", { name: "Nenhum Curso ainda" })).toBeVisible();
  await expect(page.locator(".course-authoring-course-card")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.reload();
  await mountCourseAuthoring(page, { cardinality: "one" });
  await expect(page.locator(".course-authoring-course-list")).toHaveAttribute(
    "data-cardinality",
    "one"
  );
  await expect(page.locator(".course-authoring-course-card")).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

test("deep link lê só o cabeçalho no Planejamento e navega por toda a inspeção", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 820 });
  const planningHash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
  await mountCourseAuthoring(page, { cardinality: "many", hash: planningHash });

  await expect(page.getByRole("heading", { name: "Planejamento" })).toBeVisible();
  await expect(page.getByText("Priorizar explicações completas", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseAuthoringHarness.probe)).toMatchObject({
    headerReads: 1,
    documentReads: 0,
    planReads: 1
  });

  await page.getByRole("link", { name: "Estrutura" }).click();
  await expect(page.getByRole("heading", { name: "Estrutura" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Base conceitual" })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseAuthoringHarness.probe.documentReads)).toBe(1);

  await page.getByRole("link", { name: "Conteúdo" }).click();
  await expect(page.getByRole("heading", { name: "Conteúdo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Exemplo guiado" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Prática de contraste" })).toBeVisible();
  const scrollBeforeRefresh = await page.evaluate(() => {
    const scroller = document.scrollingElement;
    scroller.scrollTop = Math.min(120, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
    return scroller.scrollTop;
  });
  await page.evaluate(() => globalThis.__courseAuthoringHarness.surface.refresh());
  await expect(page.getByRole("heading", { name: "Conteúdo" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.scrollingElement.scrollTop))
    .toBe(scrollBeforeRefresh);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}?section=content`
  );

  await page.getByRole("link", { name: "Pessoas" }).click();
  await expect(page.getByRole("heading", { name: "Pessoas" })).toBeVisible();
  await expect(page.getByText("Pessoa proprietária")).toBeVisible();
  await expect(page.getByText("Pessoa estudante")).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseAuthoringHarness.probe.peopleReads)).toBe(1);

  await page.getByRole("button", { name: "Voltar aos Cursos" }).click();
  await expect(page.getByRole("heading", { name: "Meus cursos" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

test("criação e edição persistem pelo controlador compartilhado", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 430, height: 860 });
  await mountCourseAuthoring(page, { cardinality: "one" });

  await page.getByRole("button", { name: "Criar Curso" }).last().click();
  await page.getByLabel("Título").fill("Curso criado na Autoria");
  await page.getByLabel("Objetivo").fill("Investigar a comparação de explicações.");
  await page.getByRole("button", { name: "Criar Curso" }).last().click();
  await expect(page.getByRole("heading", { name: "Planejamento" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Curso criado na Autoria" })).toBeVisible();
  const createCalls = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.createCalls);
  expect(createCalls).toHaveLength(1);
  expect(createCalls[0]).toMatchObject({
    title: "Curso criado na Autoria",
    objective: "Investigar a comparação de explicações.",
    requestId: expect.any(String)
  });

  await page.getByRole("button", { name: "Editar planejamento" }).click();
  await page.getByLabel("Título do Curso").fill("Curso revisado na Autoria");
  await page.getByLabel("Objetivo").fill("Comparar explicações com critérios explícitos.");
  await page.getByLabel("Orientação para a autoria")
    .fill("Registrar decisões e manter exemplos completos.");
  await page.getByRole("button", { name: "Salvar planejamento" }).click();

  await expect(page.getByRole("heading", { name: "Curso revisado na Autoria" })).toBeVisible();
  await expect(page.getByText("Planejamento salvo.")).toBeVisible();
  const planMutations = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.planMutations);
  expect(planMutations).toHaveLength(1);
  expect(planMutations[0]).toMatchObject({
    courseId: CREATED_COURSE_ID,
    expectedCourseRevision: 1,
    expectedPlanVersion: 1,
    operation: "update_plan",
    title: "Curso revisado na Autoria",
    objective: "Comparar explicações com critérios explícitos.",
    authoringGuidance: "Registrar decisões e manter exemplos completos.",
    preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
    requestId: expect.any(String)
  });
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});
