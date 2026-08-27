import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { courseVariantComparisonFixture } from "../support/courseVariantComparisonFixture.js";

const COURSE_IDS = Object.freeze([
  "10000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "30000000-0000-4000-8000-000000000003"
]);
const CREATED_COURSE_ID = "40000000-0000-4000-8000-000000000004";
const OWNER_ID = "50000000-0000-4000-8000-000000000005";
const STUDENT_ID = "60000000-0000-4000-8000-000000000006";

function buildVariantComparisonFixture() {
  const comparison = courseVariantComparisonFixture({
    sourceCourseId: COURSE_IDS[0],
    comparisonSetId: "8b000000-0000-4000-8000-00000000001b",
    memberCourseId: COURSE_IDS[1],
    courseRevision: 5
  });
  comparison.planning.snapshot = {
    plan: {
      objective: "Compreender relações essenciais por meio de exemplos graduais.",
      audience: "Pessoas iniciantes."
    }
  };
  comparison.source.title = "Fundamentos de relações";
  comparison.source.goal = "Compreender relações essenciais por meio de exemplos graduais.";
  comparison.members[0] = {
    ...comparison.members[0],
    title: "Aplicações comparadas",
    goal: "Aplicar os conceitos em situações contrastantes.",
    attachedCourseRevision: 2,
    currentCourseRevision: 2
  };
  const secondMember = comparison.members[1];
  secondMember.courseId = COURSE_IDS[2];
  secondMember.label = "B";
  secondMember.title = "Leitura crítica de dados";
  secondMember.goal = "Interpretar dados com critérios explícitos.";
  secondMember.parameterDifferences = [{
    scopeKind: "course",
    scopeId: "course",
    parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
    value: 1,
    rationale: "Comparar uma condição de menor densidade."
  }];
  secondMember.componentPolicyDifference = {
    catalogVersion: "1-3e5629f8",
    availability: "allow_only",
    allowedRefs: ["aralearn.resource.component_01@1.0.0"],
    excludedRefs: [],
    preferredRefs: []
  };
  secondMember.effectiveParameters[0].value = 1;
  secondMember.effectiveComponentPolicies[0].policy = structuredClone(
    secondMember.componentPolicyDifference
  );
  secondMember.references.fingerprint = "e".repeat(64);
  secondMember.materialization.partFingerprint = "f".repeat(64);
  return comparison;
}

function captureClientErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  return errors;
}

async function expectNoHorizontalOverflow(page) {
  const measure = () => page.evaluate(() => {
    const root = document.querySelector(".course-authoring-root");
    const surface = document.querySelector(".course-authoring-surface");
    const frame = document.querySelector(".course-authoring-frame");
    if (!root || !surface || !frame) return null;
    const surfaceRect = surface.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    return {
      document: document.documentElement.scrollWidth <= window.innerWidth + 1,
      body: document.body.scrollWidth <= window.innerWidth + 1,
      root: root.scrollWidth <= root.clientWidth + 1,
      surface: surface.scrollWidth <= surface.clientWidth + 1,
      frame: frame.scrollWidth <= frame.clientWidth + 1,
      insideViewport: surfaceRect.left >= -1 && surfaceRect.right <= window.innerWidth + 1,
      frameWidth: Math.round(frameRect.width),
      frameScrollWidth: frame.scrollWidth,
      frameClientWidth: frame.clientWidth
    };
  });
  await expect.poll(measure).toMatchObject({
    document: true,
    body: true,
    root: true,
    surface: true,
    frame: true,
    insideViewport: true
  });
  const frameWidth = await page.locator(".course-authoring-frame").evaluate(
    (element) => element.getBoundingClientRect().width
  );
  expect(frameWidth).toBeLessThanOrEqual(430.5);
}

async function expectModalDialogOwnsTopLayer(dialog) {
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect.poll(() => dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 1, Math.max(0, bounds.left + bounds.width / 2));
    const y = Math.min(window.innerHeight - 1, Math.max(0, bounds.top + bounds.height / 2));
    const topElement = document.elementFromPoint(x, y);
    return Boolean(topElement && element.contains(topElement));
  })).toBe(true);
}

async function expectAuthoringOwnsVerticalScroll(page) {
  await expect.poll(() => page.evaluate(() => {
    const appRoot = document.querySelector("#app-root");
    const root = document.querySelector(
      "#app-root > #course-authoring-root.course-authoring-root"
    );
    if (!appRoot || !root) return null;
    const rootStyle = getComputedStyle(root);
    const appStyle = getComputedStyle(appRoot);
    return {
      exactShell: true,
      documentDoesNotScroll:
        document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1,
      bodyDoesNotScroll: document.body.scrollHeight <= document.body.clientHeight + 1,
      appDoesNotScroll: appRoot.scrollHeight <= appRoot.clientHeight + 1,
      appClips: ["hidden", "clip"].includes(appStyle.overflowY),
      rootOwnsOverflow: ["auto", "scroll"].includes(rootStyle.overflowY),
      rootHasContentToScroll: root.scrollHeight > root.clientHeight + 1,
      rootMatchesViewport: Math.abs(root.getBoundingClientRect().height - innerHeight) <= 1
    };
  })).toEqual({
    exactShell: true,
    documentDoesNotScroll: true,
    bodyDoesNotScroll: true,
    appDoesNotScroll: true,
    appClips: true,
    rootOwnsOverflow: true,
    rootHasContentToScroll: true,
    rootMatchesViewport: true
  });

  await page.evaluate(() => window.scrollTo({ top: 200, behavior: "auto" }));
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
}

async function expectVisibleTouchTargets(page) {
  const failures = await page.locator(".course-authoring-surface").evaluate((surface) => {
    const selector = "button, a, summary, input, select, textarea";
    return [...surface.querySelectorAll(selector)].flatMap((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.visibility === "hidden" || style.display === "none" ||
          rect.width <= 0 || rect.height <= 0 || element.matches('input[type="hidden"]')) {
        return [];
      }
      const usesLabelTarget = element.matches(
        'input[type="checkbox"], input[type="radio"], input[type="file"]'
      );
      const target = usesLabelTarget ? element.closest("label") || element : element;
      const targetRect = target.getBoundingClientRect();
      if (targetRect.width >= 43 && targetRect.height >= 43) return [];
      return [{
        element: element.tagName.toLowerCase(),
        label: element.getAttribute("aria-label") ||
          element.labels?.[0]?.textContent?.trim() || element.textContent?.trim() || element.id,
        width: Math.round(targetRect.width * 10) / 10,
        height: Math.round(targetRect.height * 10) / 10
      }];
    });
  });
  expect(failures).toEqual([]);
}

async function expectFinalPlanningContentReachable(page) {
  const root = page.locator(".course-authoring-root");
  const lastContent = page.locator(".course-authoring-planning > :last-child");
  const atEnd = () => page.evaluate(() => {
    const scroller = document.querySelector(".course-authoring-root");
    return Math.abs(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop) <= 2;
  });
  const finalContentVisible = () => page.evaluate(() => {
    const scroller = document.querySelector(".course-authoring-root");
    const content = document.querySelector(".course-authoring-planning > :last-child");
    if (!scroller || !content) return false;
    const scrollerRect = scroller.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    return contentRect.bottom <= scrollerRect.bottom + 1 &&
      contentRect.bottom >= scrollerRect.top - 1;
  });

  await root.evaluate((element) => { element.scrollTop = 0; });
  const rootBox = await root.boundingBox();
  await page.mouse.move(rootBox.x + rootBox.width / 2, rootBox.y + rootBox.height / 2);
  await page.mouse.wheel(0, 100_000);
  await expect.poll(atEnd).toBe(true);
  await expect(lastContent).toBeAttached();
  await expect.poll(finalContentVisible).toBe(true);

  await root.evaluate((element) => { element.scrollTop = 0; });
  await page.getByRole("button", { name: "Editar planejamento" }).focus();
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press("PageDown");
  }
  await expect.poll(atEnd).toBe(true);
  await expect.poll(finalContentVisible).toBe(true);
}

async function expectResponsiveAuthoringNavigation(page, width) {
  const menu = page.locator(".course-authoring-task-menu");
  const sections = await menu.locator('a[data-section]').evaluateAll((links) =>
    [...new Set(links.map((link) => link.dataset.section))].sort()
  );
  expect(sections).toEqual([
    "content",
    "overview",
    "parameters",
    "people",
    "planning",
    "research",
    "review",
    "sources"
  ]);
  await expect(menu).toBeVisible();
  await expect(menu.locator(":scope > summary")).toHaveCount(1);
  await expect(menu.locator(":scope > nav > a")).toHaveCount(8);
  await expect(menu.locator(":scope > summary")).toHaveAccessibleName("Abrir tarefas do Curso");
  await menu.locator(":scope > summary").click();
  await expect(menu.getByRole("button", { name: "Atualizar Curso" })).toBeVisible();
  await expect(menu.getByRole("button", {
    name: "Planejar este Curso no ChatGPT"
  })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Trabalhar no ChatGPT" })).toHaveCount(0);
  await menu.locator(":scope > summary").click();
  await expect(page.locator(".course-authoring-sidebar-navigation")).toHaveCount(0);
  await expect(page.locator(".course-authoring-primary-navigation")).toHaveCount(0);
  const geometry = await page.locator(".course-authoring-surface").evaluate((surface) => {
    const frame = surface.querySelector(".course-authoring-frame");
    const layout = surface.querySelector(".course-authoring-layout");
    const main = surface.querySelector(".course-authoring-main-pane");
    const header = surface.querySelector(".course-authoring-course-header");
    const heading = header?.querySelector(".course-authoring-course-heading");
    const surfaceRect = surface.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const layoutRect = layout.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    const headingRect = heading?.getBoundingClientRect();
    return {
      surfaceWidth: surfaceRect.width,
      frameWidth: frameRect.width,
      leftSpace: surfaceRect.left,
      rightSpace: innerWidth - surfaceRect.right,
      layoutColumns: getComputedStyle(layout).gridTemplateColumns,
      mainAligned: Math.abs(mainRect.left - layoutRect.left) <= 1 &&
        Math.abs(mainRect.width - layoutRect.width) <= 1,
      headerTitleCentered: Boolean(headerRect && headingRect &&
        Math.abs(
          headingRect.left + headingRect.width / 2 -
          (headerRect.left + headerRect.width / 2)
        ) <= 1)
    };
  });
  expect(geometry.surfaceWidth).toBeLessThanOrEqual(430);
  expect(geometry.frameWidth).toBeLessThanOrEqual(430);
  expect(geometry.layoutColumns.trim().split(/\s+/u)).toHaveLength(1);
  expect(geometry.mainAligned).toBe(true);
  expect(geometry.headerTitleCentered).toBe(true);
  if (width > 430) {
    expect(Math.abs(geometry.leftSpace - geometry.rightSpace)).toBeLessThanOrEqual(1);
  }
  for (const selector of [
    ".course-design-parameters",
    ".course-source-catalog",
    ".course-audit-preview-grid",
    ".course-observations-filter-grid",
    ".course-variants-comparison-differences",
    ".course-analytics-filters"
  ]) {
    const grid = page.locator(selector).first();
    if (await grid.count() && await grid.isVisible()) {
      expect(await grid.evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/u).length)).toBe(1);
    }
  }
}

async function authoringAreaLink(page, section) {
  const canonical = ({
    structure: "content",
    inspection: "content",
    observations: "review",
    variants: "research"
  })[section] || section;
  const menu = page.locator(".course-authoring-task-menu");
  const link = menu.locator(`:scope > nav > a[data-section="${canonical}"]`);
  if (!await menu.evaluate((element) => element.open)) {
    await menu.locator(":scope > summary").click();
  }
  await expect(menu).toHaveAttribute("open", "");
  return link;
}

async function navigateToAuthoringArea(page, section) {
  await (await authoringAreaLink(page, section)).click();
}

async function expectAuthoringAreaEndReachable(page) {
  const result = await page.locator(".course-authoring-root").evaluate((root) => {
    root.scrollTop = Math.max(0, root.scrollHeight - root.clientHeight);
    const content = root.querySelector(".course-authoring-course-content > :last-child");
    if (!content) return null;
    const rootRect = root.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    return {
      atEnd: Math.abs(root.scrollHeight - root.clientHeight - root.scrollTop) <= 2,
      finalEdgeVisible: contentRect.bottom <= rootRect.bottom + 1 &&
        contentRect.bottom >= rootRect.top - 1
    };
  });
  expect(result).toEqual({ atEnd: true, finalEdgeVisible: true });
}

async function expectSourceMetadataDoesNotOverlap(page) {
  const failures = await page.locator(".course-source-metadata > div").evaluateAll((rows) =>
    rows.flatMap((row) => {
      const term = row.querySelector("dt");
      const description = row.querySelector("dd");
      if (!term || !description) return [{ label: "estrutura ausente" }];
      const termRect = term.getBoundingClientRect();
      const descriptionRect = description.getBoundingClientRect();
      const sameRow = Math.abs(termRect.top - descriptionRect.top) <= 1;
      const hasRoom = sameRow
        ? termRect.right <= descriptionRect.left + 1
        : termRect.bottom <= descriptionRect.top + 1;
      const termFits = term.scrollWidth <= term.clientWidth + 1;
      return hasRoom && termFits ? [] : [{
        label: term.textContent?.trim(),
        term: {
          left: Math.round(termRect.left * 10) / 10,
          right: Math.round(termRect.right * 10) / 10,
          top: Math.round(termRect.top * 10) / 10,
          bottom: Math.round(termRect.bottom * 10) / 10,
          scrollWidth: term.scrollWidth,
          clientWidth: term.clientWidth
        },
        description: {
          left: Math.round(descriptionRect.left * 10) / 10,
          top: Math.round(descriptionRect.top * 10) / 10
        }
      }];
    })
  );
  expect(failures).toEqual([]);
}

async function mountCourseAuthoring(page, {
  cardinality = "many",
  hash = "",
  planningScenario = "default",
  planningMutationScenario = "default",
  createMutationScenario = "default",
  designMutationScenario = "default",
  sourceMutationScenario = "default",
  variantMutationScenario = "default",
  peopleMutationScenario = "default",
  annotationMutationScenario = "default",
  objective = "Compreender relações essenciais por meio de exemplos graduais."
} = {}) {
  await page.route("**/main.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: ""
  }));
  await page.goto(hash ? `/${hash}` : "/");
  await page.evaluate(async ({
    requestedCardinality,
    requestedPlanningScenario,
    requestedPlanningMutationScenario,
    requestedCreateMutationScenario,
    requestedDesignMutationScenario,
    requestedSourceMutationScenario,
    requestedVariantMutationScenario,
    requestedPeopleMutationScenario,
    requestedAnnotationMutationScenario,
    requestedObjective,
    courseIds,
    createdCourseId,
    ownerId,
    studentId,
    variantComparisonFixture
  }) => {
    document.body.replaceChildren();
    const appRoot = document.createElement("div");
    appRoot.id = "app-root";
    const root = document.createElement("main");
    root.id = "course-authoring-root";
    root.className = "course-authoring-root";
    appRoot.append(root);
    document.body.append(appRoot);

    const { createCourseAuthoringSurface } = await import(
      "/src/ui/CourseAuthoringSurface.js"
    );

    const definitions = [{
      courseId: courseIds[0],
      title: "Fundamentos de relações",
      goal: requestedObjective,
      revision: 5,
      plan: {
        id: "71000000-0000-4000-8000-000000000011",
        version: 3,
        audience: "Pessoas iniciantes.",
        scope: "Relações e evidências.",
        preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
        intendedLearningOutcomes: [],
        instructionalAnalysisUnits: [{
          id: "79000000-0000-4000-8000-000000000019",
          position: 0,
          statement: "Relação entre nomes e endereços.",
          version: 1
        }],
        evidenceRequirements: [{
          id: "7a000000-0000-4000-8000-00000000001a",
          position: 0,
          statement: "Explicar um caso novo de resolução.",
          version: 1
        }],
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
            materializations: [{
              id: "75000000-0000-4000-8000-000000000015",
              status: "running",
              progressState: "running",
              channel: "mcp",
              version: 2,
              completedStepCount: 1,
              failedStepCount: 0,
              totalStepCount: 2,
              startedAt: "2026-08-17T12:00:00.000Z",
              updatedAt: "2026-08-17T12:02:00.000Z",
              completedAt: null,
              summary: "1 de 2 etapas concluídas"
            }, {
              id: "75000000-0000-4000-8000-000000000014",
              status: "completed",
              progressState: "completed",
              channel: "actions",
              version: 3,
              completedStepCount: 2,
              failedStepCount: 0,
              totalStepCount: 2,
              startedAt: "2026-08-17T11:00:00.000Z",
              updatedAt: "2026-08-17T11:04:00.000Z",
              completedAt: "2026-08-17T11:04:00.000Z",
              summary: "2 de 2 etapas concluídas"
            }, {
              id: "75000000-0000-4000-8000-000000000013",
              status: "failed",
              progressState: "failed",
              channel: "mcp",
              version: 2,
              completedStepCount: 1,
              failedStepCount: 1,
              totalStepCount: 2,
              startedAt: "2026-08-17T10:00:00.000Z",
              updatedAt: "2026-08-17T10:03:00.000Z",
              completedAt: "2026-08-17T10:03:00.000Z",
              summary: "1 etapa falhou"
            }, {
              id: "75000000-0000-4000-8000-000000000012",
              status: "completed",
              progressState: "partial",
              channel: "application",
              version: 2,
              completedStepCount: 1,
              failedStepCount: 1,
              totalStepCount: 2,
              startedAt: "2026-08-17T09:00:00.000Z",
              updatedAt: "2026-08-17T09:03:00.000Z",
              completedAt: "2026-08-17T09:03:00.000Z",
              summary: "1 de 2 etapas concluídas"
            }],
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
          instructionalAnalysisUnitCount: 1,
          evidenceRequirementCount: 1,
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
    if (requestedPlanningScenario === "zero-microsequences") {
      const firstCourse = definitions[0];
      const firstPart = firstCourse.plan.parts[0];
      firstPart.microsequences = [];
      firstPart.progress = {
        state: "planned",
        microsequenceCount: 0,
        studyUnitCount: 0,
        materializations: [],
        lastMaterialization: null
      };
      firstCourse.plan.counts.linkedDidacticMicrosequenceCount = 0;
      firstCourse.plan.counts.studyUnitCount = 0;
    }
    if (requestedPlanningScenario === "unlinked-existing") {
      const firstCourse = definitions[0];
      firstCourse.plan.parts = [];
      firstCourse.plan.counts.authoringPartCount = 0;
      firstCourse.plan.counts.linkedDidacticMicrosequenceCount = 0;
      firstCourse.plan.counts.studyUnitCount = 0;
    }
    if (requestedPlanningScenario === "two-parts") {
      const firstCourse = definitions[0];
      firstCourse.plan.parts.push({
        id: "70000000-0000-4000-8000-000000000008",
        title: "Relações em contexto",
        intent: "Aplicar a comparação em um segundo contexto.",
        version: 1,
        position: 1,
        microsequences: [],
        progress: {
          state: "planned",
          microsequenceCount: 0,
          studyUnitCount: 0,
          materializations: [],
          lastMaterialization: null
        }
      });
      firstCourse.plan.counts.authoringPartCount = 2;
    }
    const count = requestedCardinality === "zero" ? 0 :
      requestedCardinality === "one" ? 1 : definitions.length;
    const courses = definitions.slice(0, count);
    const outlineFor = (courseId) => {
      const detail = courseDetail(courseId);
      const noMicrosequences = requestedPlanningScenario === "zero-microsequences" &&
        courseId === courseIds[0];
      return {
        contract: "aralearn.course.v1",
        ...detail,
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T12:00:00.000Z",
        outline: {
          courseId,
          title: detail.title,
          goal: detail.goal,
          modules: noMicrosequences ? [] : [{
            id: "module-a",
            title: "Base conceitual",
            lessons: [{
              id: "lesson-a",
              title: "Relações e evidências",
              topics: [{
                id: "topic-a",
                title: "Relações",
                summary: "Relações entre entidades."
              }, {
                id: "topic-b",
                title: "Evidências",
                summary: "Evidências e limites."
              }],
              microsequences: [{
                id: "microsequence-a",
                title: "Comparação orientada",
                goal: "Comparar duas relações sem confundir associação e causa.",
                studyUnitCount: 60
              }]
            }]
          }]
        },
        deepLink: `#/authoring/courses/${courseId}?section=content`
      };
    };
    const studyUnits = Array.from({ length: 60 }, (_, index) => {
      const ordinal = index + 1;
      const diagram = ordinal === 1 ? [{
        id: "set-diagram-1",
        package: "aralearn.resource.set_diagram",
        version: "1.0.0",
        data: {
          prompt: "Compare os conjuntos.",
          kind: "venn",
          sets: [{ id: "a", symbol: "A", label: "Grupo A" },
            { id: "b", symbol: "B", label: "Grupo B" }],
          regions: [{ id: "a-only", setIds: ["a"], items: ["x"] },
            { id: "both", setIds: ["a", "b"], items: ["y"] }]
        }
      }] : [{
        id: `paragraph-${ordinal}`,
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: `Conteúdo curricular da Unidade ${ordinal}.` }
      }];
      const practice = ordinal === 1;
      return {
        id: `study-unit-${String(ordinal).padStart(2, "0")}`,
        position: ordinal,
        title: ordinal === 1 ? "Exemplo guiado com diagrama" : `Unidade curricular ${ordinal}`,
        role: practice ? "practice" : "theory",
        content: diagram,
        response: practice ? {
          id: "choice-1",
          package: "aralearn.response.choice",
          version: "1.0.0",
          data: {
            question: "Qual elemento pertence aos dois conjuntos?",
            selectionMode: "single",
            selectionCriterion: "correct",
            options: [{ id: "x", kind: "text", text: "x" },
              { id: "y", kind: "text", text: "y" }],
            answerIds: ["y"]
          }
        } : null,
        feedback: [],
        topics: []
      };
    });
    const sourceCatalog = Array.from({ length: 60 }, (_, index) => {
      const ordinal = index + 1;
      return {
        sourceId: `source-${String(ordinal).padStart(2, "0")}`,
        revision: 1,
        status: "active",
        kind: ordinal % 2 === 0 ? "article" : "book",
        title: `Fonte verificável ${ordinal}`,
        authorship: `Autoria ${ordinal}`,
        publicationDate: "2026",
        identifier: null,
        language: "pt-BR",
        citationText: `Autoria ${ordinal}. Fonte verificável ${ordinal}. 2026.`,
        url: `https://example.test/fontes/${ordinal}`,
        editionOrVersion: ordinal % 2 === 0 ? null : "1ª edição",
        origin: "external",
        availability: "open_access",
        verificationStatus: "author_verified",
        studyVisibility: "citation_and_link",
        anchorCount: ordinal <= 2 ? 1 : 0,
        createdAt: "2026-08-17T12:00:00.000Z"
      };
    });
    const sourceDetails = new Map(sourceCatalog.map((source, index) => [
      source.sourceId,
      [{
        ...structuredClone(source),
        actorId: ownerId,
        anchors: index < 2 ? [{
          anchorId: `anchor-${source.sourceId}`,
          revision: 1,
          sourceRevision: 1,
          status: "active",
          selector: { kind: "page_range", startPage: index + 10, endPage: index + 12 },
          humanLocator: index === 0 ? "Capítulo 2, seção 3" : null,
          verificationExcerpt: index === 0 ? "Trecho mínimo para conferência." : null,
          actorId: ownerId,
          createdAt: "2026-08-17T12:00:00.000Z"
        }] : [],
        attachments: []
      }]
    ]));
    const sourceTargetKey = (targetKind, targetId) => `${targetKind}:${targetId}`;
    const sourceTargets = new Map([[sourceTargetKey(
      "plan_item",
      "79000000-0000-4000-8000-000000000019"
    ), [{
      attributionId: "7b000000-0000-4000-8000-00000000001b",
      targetKind: "plan_item",
      targetId: "79000000-0000-4000-8000-000000000019",
      targetVersion: 1,
      targetHash: "a".repeat(64),
      revision: 1,
      sourceLinks: [{
        sourceId: "source-01",
        sourceRevision: 1,
        relation: "supported_by",
        anchors: [{ anchorId: "anchor-source-01", anchorRevision: 1 }]
      }],
      actorId: ownerId,
      createdAt: "2026-08-17T12:00:00.000Z",
      effective: true
    }]]]);
    const sourceReceipts = new Map();
    const designReceipts = new Map();
    const variantReceipts = new Map();
    const peopleReceipts = new Map();
    const createReceipts = new Map();
    const planningReceipts = new Map();
    const people = [{
      userId: studentId,
      displayName: "Pessoa estudante",
      avatarObjectKey: null,
      grantedAt: "2026-08-17T12:00:00.000Z"
    }];
    const grantedPersonId = "8d000000-0000-4000-8000-00000000001d";
    let designAmbiguousFailureDelivered = false;
    let sourceAmbiguousFailureDelivered = false;
    let variantAmbiguousFailureDelivered = false;
    let peopleAmbiguousFailureDelivered = false;
    let createAmbiguousFailureDelivered = false;
    let planningAmbiguousFailureDelivered = false;
    let annotationMutationConfirmed = false;
    let annotationReconciliationFailureDelivered = false;
    const probe = {
      listReads: 0,
      headerReads: 0,
      outlineReads: 0,
      courseDocumentReads: [],
      inspectionReads: [],
      annotationReads: [],
      annotationMutations: [],
      auditReads: [],
      auditMutations: [],
      analyticsReads: [],
      positionLoads: 0,
      positionSaves: [],
      peopleReads: 0,
      peopleMutations: [],
      peopleAppliedMutations: 0,
      planReads: 0,
      designReads: [],
      designMutations: [],
      sourceReads: [],
      sourceMutations: [],
      variantReads: [],
      variantMutations: [],
      variantAppliedMutations: 0,
      materializationReads: [],
      createCalls: [],
      planMutations: [],
      materializationRequests: [],
      studyContentOpens: [],
      closeCalls: 0
    };
    const counts = {
      moduleCount: requestedPlanningScenario === "zero-microsequences" ? 0 : 1,
      lessonCount: requestedPlanningScenario === "zero-microsequences" ? 0 : 1,
      topicCount: requestedPlanningScenario === "zero-microsequences" ? 0 : 2,
      microsequenceCount: requestedPlanningScenario === "zero-microsequences" ? 0 : 1,
      studyUnitCount: requestedPlanningScenario === "zero-microsequences" ? 0 : 60
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
    const designDefinitions = [{
      id: "new_analysis_unit_ceiling_per_expository_study_unit",
      label: "Novas unidades de análise por Unidade expositiva",
      valueSchema: { type: "integer", minimum: 1, maximum: 8 },
      defaultValue: 2
    }, {
      id: "required_explanation_forms",
      label: "Formas exigidas de explicação",
      valueSchema: {
        type: "set",
        allowedValues: [
          "plain_definition", "concrete_example", "mechanism", "contrast",
          "application_condition", "limit_or_exception", "worked_example", "representation_link"
        ],
        minimumItems: 1,
        maximumItems: 8
      },
      defaultValue: ["plain_definition", "concrete_example", "mechanism", "contrast"]
    }, {
      id: "minimum_distinct_practice_opportunities_per_evidence_requirement",
      label: "Oportunidades distintas de prática",
      valueSchema: { type: "integer", minimum: 1, maximum: 16 },
      defaultValue: 2
    }, {
      id: "required_practice_variation_dimensions",
      label: "Dimensões exigidas de variação",
      valueSchema: {
        type: "set",
        allowedValues: [
          "case_or_data", "context", "task_feature", "external_representation", "support_level"
        ],
        minimumItems: 1,
        maximumItems: 5
      },
      defaultValue: ["case_or_data"]
    }].map((definition) => ({
      ...definition,
      construct: `Construto de ${definition.label}.`,
      operationalization: "Usa identidades e fatos persistidos pela materialização.",
      limitations: "O registro não prova qualidade nem aprendizagem.",
      defaultStatus: "product_hypothesis",
      evidenceRefs: ["https://doi.org/10.1111/j.1467-9280.2006.01693.x"],
      supportedScopes: ["course", "lesson", "didactic_microsequence"]
    }));
    const componentOptions = Array.from({ length: 32 }, (_, index) => ({
      ref: `aralearn.resource.component_${String(index + 1).padStart(2, "0")}@1.0.0`,
      label: `Componente ${index + 1}`,
      purpose: `Finalidade acadêmica ${index + 1}.`
    }));
    const moduleScopes = [
      { kind: "module", ref: "module-a", label: "Base conceitual", position: 0 },
      ...Array.from({ length: 54 }, (_, index) => ({
        kind: "module",
        ref: `module-${String(index + 2).padStart(2, "0")}`,
        label: `Módulo adicional ${index + 2}`,
        position: index + 1
      }))
    ];
    let designChangeId = 20;
    let interpretationSequence = 20;
    const designState = new Map();
    const scopeKey = (scope) => `${scope.kind}:${scope.ref}`;
    const scopeFromKey = (value) => {
      const separator = value.indexOf(":");
      return { kind: value.slice(0, separator), ref: value.slice(separator + 1) };
    };
    const ensureDesignState = (courseId) => {
      if (!designState.has(courseId)) {
        const initialGuidanceId = courseId === courseIds[0]
          ? "81000000-0000-4000-8000-000000000018"
          : crypto.randomUUID();
        designState.set(courseId, {
          parameterAssignments: new Map(),
          guidance: new Map([[
            `course:${courseId}`,
            {
              revisionId: initialGuidanceId,
              guidance: "Explique cada termo antes de depender dele.",
              origin: "author",
              reason: "Evitar pressupostos ocultos."
            }
          ]]),
          interpretations: new Map([[
            initialGuidanceId,
            {
              interpretationId: "11",
              guidanceRevisionId: initialGuidanceId,
              interpretation: {
                summary: "Definir os termos antes do uso.",
                directives: [{ kind: "require", statement: "Definir todo termo novo." }],
                divergences: [],
                questions: ["Qual exemplo deve abrir a explicação?"]
              },
              createdAt: "2026-08-17T12:00:00.000Z"
            }
          ]]),
          policies: new Map(),
          targetPlanItems: new Map([["microsequence-a", {
            instructionalAnalysisUnitIds: ["79000000-0000-4000-8000-000000000019"],
            evidenceRequirementIds: []
          }]])
        });
      }
      return designState.get(courseId);
    };
    const scopeDescriptor = (courseId, scope) => {
      const course = courseDetail(courseId);
      if (scope.kind === "course") return { kind: "course", ref: courseId, label: course.title };
      if (scope.kind === "module") {
        const found = moduleScopes.find((item) => item.ref === scope.ref);
        if (!found) throw new Error("Módulo ausente");
        return { kind: found.kind, ref: found.ref, label: found.label };
      }
      if (scope.kind === "lesson") {
        const label = scope.ref === "lesson-a" ? "Relações e evidências" : `Lição ${scope.ref}`;
        return { kind: "lesson", ref: scope.ref, label };
      }
      if (scope.kind === "didactic_microsequence") {
        const label = scope.ref === "microsequence-a" ? "Comparação orientada" : `Microssequência ${scope.ref}`;
        return { kind: "didactic_microsequence", ref: scope.ref, label };
      }
      throw new Error("Escopo ausente");
    };
    const scopePath = (courseId, scope) => {
      const courseScope = scopeDescriptor(courseId, { kind: "course", ref: courseId });
      if (scope.kind === "course") return [courseScope];
      const moduleRef = scope.kind === "module" ? scope.ref : "module-a";
      const moduleScope = scopeDescriptor(courseId, { kind: "module", ref: moduleRef });
      if (scope.kind === "module") return [courseScope, moduleScope];
      const lessonRef = scope.kind === "lesson" ? scope.ref : "lesson-a";
      const lessonScope = scopeDescriptor(courseId, { kind: "lesson", ref: lessonRef });
      if (scope.kind === "lesson") return [courseScope, moduleScope, lessonScope];
      return [courseScope, moduleScope, lessonScope, scopeDescriptor(courseId, scope)];
    };
    const immediateChildren = (courseId, scope) => {
      if (scope.kind === "course") return moduleScopes;
      if (scope.kind === "module") return [{
        kind: "lesson",
        ref: scope.ref === "module-a" ? "lesson-a" : `lesson-${scope.ref}`,
        label: scope.ref === "module-a" ? "Relações e evidências" : `Lição de ${scope.ref}`,
        position: 0
      }];
      if (scope.kind === "lesson") return [{
        kind: "didactic_microsequence",
        ref: scope.ref === "lesson-a" ? "microsequence-a" : `micro-${scope.ref}`,
        label: scope.ref === "lesson-a" ? "Comparação orientada" : `Microssequência de ${scope.ref}`,
        position: 0
      }];
      return [];
    };
    const buildCourseDesign = (courseId, { scope, limit = 32, cursor = null }) => {
      const course = courseDetail(courseId);
      const store = ensureDesignState(courseId);
      const path = scopePath(courseId, scope);
      const current = path.at(-1);
      const allChildren = immediateChildren(courseId, scope);
      const cursorIndex = cursor == null ? -1 : allChildren.findIndex((item) => item.ref === cursor);
      const start = cursorIndex + 1;
      const children = allChildren.slice(start, start + limit);
      const hasMoreChildren = start + children.length < allChildren.length;
      const parameterAt = (candidate, parameterId) =>
        store.parameterAssignments.get(scopeKey(candidate))?.get(parameterId) || null;
      const parameters = designDefinitions.map((definition) => {
        const localAssignment = parameterAt(current, definition.id);
        const explicit = [...path].reverse().map((candidate) => ({
          assignment: parameterAt(candidate, definition.id),
          scope: candidate
        })).find(({ assignment }) => assignment && assignment.origin !== "automatic");
        const automatic = [...path].reverse().map((candidate) => ({
          assignment: parameterAt(candidate, definition.id),
          scope: candidate
        })).find(({ assignment }) => assignment?.origin === "automatic");
        const selected = explicit || automatic || null;
        return {
          parameterId: definition.id,
          localAssignment: localAssignment ? structuredClone(localAssignment) : null,
          effectiveAssignment: selected ? {
            ...structuredClone(selected.assignment),
            sourceScope: { kind: selected.scope.kind, ref: selected.scope.ref },
            inherited: scopeKey(selected.scope) !== scopeKey(current)
          } : {
            changeId: null,
            value: structuredClone(definition.defaultValue),
            origin: "system_default",
            reason: "Hipótese operacional inicial do produto.",
            sourceScope: null,
            inherited: false
          }
        };
      });
      const effectiveRevisions = path.map((candidate) => ({
        revision: store.guidance.get(scopeKey(candidate)),
        scope: candidate
      })).filter(({ revision }) => revision).map(({ revision, scope: source }) => ({
        ...structuredClone(revision),
        sourceScope: { kind: source.kind, ref: source.ref },
        currentInterpretation: structuredClone(store.interpretations.get(revision.revisionId) || null)
      }));
      const localPolicy = store.policies.get(scopeKey(current)) || null;
      const selectedPolicy = [...path].reverse().map((candidate) => ({
        change: store.policies.get(scopeKey(candidate)),
        scope: candidate
      })).find(({ change }) => change) || null;
      return {
        contract: "aralearn.course-design.v1",
        courseId,
        courseRevision: course.revision,
        parameterCatalogVersion: "1.0.0",
        scopeContext: {
          current,
          ancestors: path.slice(0, -1),
          children,
          childCount: allChildren.length,
          hasMoreChildren,
          nextChildCursor: hasMoreChildren ? children.at(-1).ref : null
        },
        definitions: structuredClone(designDefinitions),
        parameters,
        guidance: {
          localRevision: structuredClone(store.guidance.get(scopeKey(current)) || null),
          effectiveRevisions
        },
        componentCatalog: { version: "1-3e5629f8", options: structuredClone(componentOptions) },
        targetPlanItems: current.kind === "didactic_microsequence"
          ? structuredClone(store.targetPlanItems.get(current.ref) || {
              instructionalAnalysisUnitIds: [],
              evidenceRequirementIds: []
            })
          : null,
        componentPolicy: {
          localChange: structuredClone(localPolicy),
          effectiveChange: selectedPolicy ? {
            ...structuredClone(selectedPolicy.change),
            sourceScope: {
              kind: selectedPolicy.scope.kind,
              ref: selectedPolicy.scope.ref
            },
            inherited: scopeKey(selectedPolicy.scope) !== scopeKey(current)
          } : {
            changeId: null,
            policy: {
              catalogVersion: "1-3e5629f8",
              availability: "all",
              allowedRefs: [],
              excludedRefs: [],
              preferredRefs: []
            },
            origin: "system_default",
            reason: "Todos os componentes começam disponíveis.",
            sourceScope: null,
            inherited: false
          }
        },
        recentApplications: [{
          materializationId: "75000000-0000-4000-8000-000000000015",
          stepId: "76000000-0000-4000-8000-000000000016",
          didacticMicrosequenceId: "microsequence-a",
          recordedAt: "2026-08-17T12:10:00.000Z",
          contextHash: "c".repeat(64),
          studyUnitCount: 3,
          modeCounts: { expository: 1, practice: 1, mixed: 1 },
          introducedInstructionalAnalysisUnitIds: [
            "79000000-0000-4000-8000-000000000019"
          ],
          developedExplanationForms: ["plain_definition", "concrete_example"],
          practiceOpportunityCount: 2,
          variedDimensions: ["case_or_data"],
          componentRefs: [componentOptions[0].ref]
        }]
      };
    };
    const inspectionPositionKey = (courseId) =>
      `aralearn.e2e.inspection-position:${courseId}`;
    let annotationSetVersion = 1;
    const annotationPath = (courseId, target) => {
      const course = courseDetail(courseId);
      const path = [{ kind: "course", id: courseId, label: course.title, version: course.revision }];
      if (target.kind === "course") return path;
      if (target.kind === "source") {
        const source = sourceDetails.get(target.id)?.[0];
        path.push({
          kind: "source",
          id: target.id,
          label: source?.title || target.id,
          version: source?.revision || 1
        });
        return path;
      }
      if (target.kind === "source_anchor") {
        const source = [...sourceDetails.values()].flat().find((candidate) =>
          candidate.anchors.some(({ anchorId }) => anchorId === target.id)
        );
        const anchor = source?.anchors.find(({ anchorId }) => anchorId === target.id);
        path.push({
          kind: "source",
          id: source?.sourceId || "source-01",
          label: source?.title || "Fonte",
          version: source?.revision || 1
        }, {
          kind: "source_anchor",
          id: target.id,
          label: null,
          version: anchor?.revision || 1
        });
        return path;
      }
      path.push({ kind: "module", id: "module-a", label: "Base conceitual", version: 1 });
      if (target.kind === "module") return path;
      path.push({ kind: "lesson", id: "lesson-a", label: "Relações e evidências", version: 1 });
      if (target.kind === "lesson") return path;
      if (target.kind === "topic") {
        path.push({
          kind: "topic",
          id: target.id,
          label: target.id === "topic-b" ? "Evidências" : "Relações",
          version: 1
        });
        return path;
      }
      if (target.kind === "didactic_microsequence") {
        path.push({
          kind: "didactic_microsequence",
          id: target.id,
          label: "Comparação orientada",
          version: 1
        });
        return path;
      }
      path.push({
        kind: "didactic_microsequence",
        id: "microsequence-a",
        label: "Comparação orientada",
        version: 1
      }, {
        kind: "study_unit",
        id: target.id,
        label: studyUnits.find(({ id }) => id === target.id)?.title || "Unidade de estudo",
        version: 1
      });
      return path;
    };
    const annotationTargetLink = (courseId, target) => {
      const base = `#/authoring/courses/${courseId}?section=content`;
      if (target.kind === "course") return base;
      if (target.kind === "source") {
        return `#/authoring/courses/${courseId}?section=sources&sourceId=${target.id}`;
      }
      if (target.kind === "source_anchor") {
        const source = [...sourceDetails.values()].flat().find((candidate) =>
          candidate.anchors.some(({ anchorId }) => anchorId === target.id)
        );
        return `#/authoring/courses/${courseId}?section=sources&sourceId=${source?.sourceId || "source-01"}&anchorId=${target.id}`;
      }
      const params = ["moduleId=module-a"];
      if (target.kind === "module") return `${base}&${params.join("&")}`;
      params.push("lessonId=lesson-a");
      if (target.kind === "lesson" || target.kind === "topic") {
        return `${base}&${params.join("&")}`;
      }
      params.push(`didacticMicrosequenceId=${target.kind === "didactic_microsequence"
        ? target.id : "microsequence-a"}`);
      if (target.kind === "study_unit") params.push(`studyUnitId=${target.id}`);
      return `${base}&${params.join("&")}`;
    };
    const classification = (subjects = []) => ({
      status: subjects.length ? "classified" : "unclassified",
      automatic: {
        method: "target_scope_unclassified",
        methodVersion: 1,
        taxonomyRevision: 5,
        subjects: []
      },
      effective: subjects.length ? {
        method: "human_topic_selection",
        methodVersion: 1,
        taxonomyRevision: 5,
        subjects
      } : {
        method: "target_scope_unclassified",
        methodVersion: 1,
        taxonomyRevision: 5,
        subjects: []
      },
      correctedAt: subjects.length ? "2026-08-17T13:30:00.000Z" : null
    });
    const annotationItem = ({
      courseId,
      annotationId,
      target,
      rawText,
      category = null,
      origin = "learner",
      channel = "study_interface"
    }) => {
      const path = annotationPath(courseId, target);
      return {
        contract: "aralearn.course-anchored-annotation.v1",
        annotationId,
        annotationVersion: 1,
        courseId,
        provenance: { origin, channel },
        contributor: origin === "author"
          ? { kind: "self", role: "author", ref: "self", label: "Você" }
          : { kind: "protected_person", role: "learner",
            ref: "person-0123456789abcdef", label: "Estudante 7" },
        target: {
          kind: target.kind,
          id: target.id,
          observedPath: structuredClone(path),
          currentAvailable: true,
          currentPath: structuredClone(path),
          deepLink: annotationTargetLink(courseId, target)
        },
        observedRevision: {
          certainty: "known",
          courseRevision: courseDetail(courseId).revision,
          targetVersion: target.kind === "course" ? courseDetail(courseId).revision : 1
        },
        rawText,
        category,
        briefSummary: null,
        subjectClassification: classification(),
        state: "open",
        ownerResponse: null,
        timestamps: {
          capturedAt: "2026-08-17T12:00:00.000Z",
          createdAt: "2026-08-17T12:00:00.000Z",
          updatedAt: "2026-08-17T12:00:00.000Z",
          firstConsideredAt: null,
          respondedAt: null,
          resolvedAt: null,
          withdrawnAt: null
        },
        capabilities: {
          canRevise: origin === "author",
          canWithdraw: origin === "author",
          canConsider: true,
          canRespond: true,
          canResolve: true,
          canReopen: false,
          canCorrectSubjects: true
        },
        deepLink: `#/authoring/courses/${courseId}?section=review&annotationId=${annotationId}`
      };
    };
    const annotations = courses.some(({ courseId }) => courseId === courseIds[0]) ? [annotationItem({
      courseId: courseIds[0],
      annotationId: "81000000-0000-4000-8000-000000000081",
      target: { kind: "study_unit", id: "study-unit-01" },
      rawText: "A relação entre os conjuntos precisa de mais contexto.",
      category: "confusing"
    })] : [];
    const annotationMatches = (item, query) => {
      if (query.mode === "detail") return item.annotationId === query.annotationId;
      if (query.origins.length && !query.origins.includes(item.provenance.origin)) return false;
      if (query.channels.length && !query.channels.includes(item.provenance.channel)) return false;
      if (query.states.length && !query.states.includes(item.state)) return false;
      if (query.categories.length && !query.categories.includes(item.category) &&
          !(item.category === null && query.includeUncategorized)) return false;
      if (!query.categories.length && !query.includeUncategorized && item.category === null) return false;
      if (query.subjectIds.length && !item.subjectClassification.effective.subjects.some(({ topicId }) =>
        query.subjectIds.includes(topicId))) return false;
      if (query.hierarchy) {
        const exact = item.target.kind === query.hierarchy.target.kind &&
          item.target.id === query.hierarchy.target.id;
        const descendant = item.target.currentPath.some(({ kind, id }) =>
          kind === query.hierarchy.target.kind && id === query.hierarchy.target.id);
        if (!exact && !(query.hierarchy.includeDescendants && descendant)) return false;
      }
      return true;
    };
    const annotationPage = (courseId, options) => {
      const items = annotations.filter((item) => item.courseId === courseId &&
        annotationMatches(item, options.query));
      const countBy = (field) => Object.fromEntries([...new Set(items.map((item) => field(item)))]
        .map((value) => [value, items.filter((item) => field(item) === value).length]));
      return {
        contract: "aralearn.course-anchored-annotation-page.v1",
        courseId,
        courseRevision: courseDetail(courseId).revision,
        annotationSetVersion,
        query: structuredClone(options.query),
        summary: {
          matchingTotal: items.length,
          byOrigin: countBy((item) => item.provenance.origin),
          byChannel: countBy((item) => item.provenance.channel),
          byState: countBy((item) => item.state),
          unclassifiedTotal: items.filter((item) =>
            item.subjectClassification.status === "unclassified").length
        },
        items: structuredClone(items),
        hasMore: false,
        nextCursor: null
      };
    };
    const auditRunId = "85000000-0000-4000-8000-000000000005";
    const auditRunChecks = () => [
      "structural_conformance", "pedagogical_quality", "factual_quality", "editorial_quality"
    ].map((dimension, index) => ({
      checkId: `86000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      dimension,
      criterion: {
        code: `automatic.${dimension}`,
        version: "1",
        statement: `Critério preservado de ${dimension}.`
      },
      result: "passed",
      publicEvidence: `Evidência preservada de ${dimension}.`,
      adequacy: "sufficient",
      planItemRefs: [],
      parameterRefs: [],
      sourceLinks: dimension === "factual_quality" ? [{
        sourceId: "source-01",
        sourceRevision: 1,
        relation: "supported_by",
        anchors: [{ anchorId: "anchor-source-01", anchorRevision: 1 }]
      }] : []
    }));
    const auditRunPage = (courseId, options) => ({
      contract: "aralearn.course-audit-cycle-page.v1",
      courseId,
      courseRevision: options.expectedCourseRevision,
      auditSetVersion: options.auditSetVersion ?? 1,
      query: structuredClone(options.query),
      summary: {
        matchingTotal: 0,
        byState: { open: 0, awaiting_verification: 0, resolved: 0, dismissed: 0 },
        byDimension: {
          structural_conformance: 0,
          pedagogical_quality: 0,
          factual_quality: 0,
          editorial_quality: 0
        },
        bySeverity: { low: 0, medium: 0, high: 0, critical: 0 }
      },
      context: null,
      items: [],
      runs: [],
      detail: null,
      runDetail: {
        contract: "aralearn.course-instructional-audit-run.v1",
        auditRunId,
        runKind: "audit",
        origin: "automatic_audit",
        method: { id: "aralearn.automatic-course-audit", version: "1" },
        courseRevision: options.expectedCourseRevision,
        contextHash: "c".repeat(64),
        target: {
          studyUnitId: "study-unit-01",
          version: 1,
          hash: "a".repeat(64),
          path: [
            { kind: "course", id: courseId, label: "Fundamentos de relações", version: 5 },
            { kind: "module", id: "module-a", label: "Base conceitual", version: 1 },
            { kind: "lesson", id: "lesson-a", label: "Relações e evidências", version: 1 },
            {
              kind: "didactic_microsequence",
              id: "microsequence-a",
              label: "Comparação orientada",
              version: 1
            },
            {
              kind: "study_unit",
              id: "study-unit-01",
              label: "Exemplo guiado com diagrama",
              version: 1
            }
          ]
        },
        checks: auditRunChecks(),
        metrics: {
          checksTotal: 4,
          byResult: {
            passed: 4,
            failed: 0,
            uncertain: 0,
            not_applicable: 0,
            not_checked: 0
          },
          findingsCreated: 0
        },
        createdAt: "2026-08-17T13:00:00Z"
      },
      hasMore: false,
      nextCursor: null
    });
    const analyticsFacts = (courseId) => [{
      factId: "annotation:open:1",
      dataset: "annotations",
      kind: "annotation_reopened",
      occurredAt: "2026-08-18T14:30:00.000Z",
      courseRevision: 5,
      channel: "study_interface",
      origin: "learner",
      state: "open",
      subject: {
        kind: "anchored_annotation",
        id: "81000000-0000-4000-8000-000000000081",
        label: "Observação sobre a comparação"
      },
      related: {
        kind: "study_unit",
        id: "study-unit-01",
        label: "Exemplo guiado com diagrama"
      },
      values: {
        annotation_version: 3,
        event_type: "reopened",
        target_kind: "study_unit",
        subject_count: 1
      },
      missingData: [],
      deepLink: `${window.location.origin}/#/authoring/courses/${courseId}` +
        "?section=content&studyUnitId=study-unit-01"
    }, {
      factId: "annotation:resolved:2",
      dataset: "annotations",
      kind: "annotation_resolved",
      occurredAt: "2026-08-19T16:45:00.000Z",
      courseRevision: null,
      channel: "study_interface",
      origin: "learner",
      state: "resolved",
      subject: {
        kind: "anchored_annotation",
        id: "82000000-0000-4000-8000-000000000082",
        label: "Observação resolvida sem revisão registrada"
      },
      related: null,
      values: {
        annotation_version: 4,
        event_type: "resolved",
        target_kind: "study_unit",
        subject_count: null
      },
      missingData: [
        "A revisão do Curso e a quantidade de assuntos não foram registradas neste fato."
      ],
      deepLink: `${window.location.origin}/#/authoring/courses/${courseId}` +
        "?section=review"
    }];
    const analyticsPage = (courseId, options) => {
      const { query } = options;
      const matching = analyticsFacts(courseId).filter((fact) =>
        query.datasets.includes(fact.dataset) &&
        (!query.channels.length || query.channels.includes(fact.channel)) &&
        (!query.origins.length || query.origins.includes(fact.origin)) &&
        (!query.states.length || query.states.includes(fact.state)) &&
        (query.from === null || Date.parse(fact.occurredAt) >= Date.parse(query.from)) &&
        (query.to === null || Date.parse(fact.occurredAt) <= Date.parse(query.to))
      );
      const secondPage = query.cursor === "pagina_2";
      return {
        contract: "aralearn.course-authoring-analytics.v1",
        dictionaryVersion: "aralearn.course-authoring-analytics-dictionary.v1",
        courseId,
        courseRevision: options.expectedCourseRevision,
        generatedAt: "2026-08-20T09:00:00.000Z",
        query: structuredClone(query),
        metrics: [{
          id: "annotations_by_state",
          version: 1,
          label: "Observações por estado",
          question: "Qual é o estado corrente das observações do recorte?",
          definition: "Conta cada observação corrente uma vez pelo estado registrado.",
          unit: "count",
          denominator: "Quatro observações correntes no recorte.",
          missingData: "A ausência de uma contagem permanece indicada como dado ausente.",
          prohibitedInferences: [
            "A contagem não mede aprendizagem, atenção ou dificuldade."
          ]
        }],
        overview: {
          metricId: "annotations_by_state",
          title: "Estado das observações",
          question: "Qual é o estado corrente das observações do recorte?",
          series: [{
            key: "open",
            label: "Aberta",
            value: 3,
            unit: "count",
            denominator: 4,
            missing: false
          }, {
            key: "resolved",
            label: "Resolvida",
            value: null,
            unit: "count",
            denominator: 4,
            missing: true
          }]
        },
        facts: structuredClone(secondPage ? matching.slice(1, 2) : matching.slice(0, 1)),
        nextCursor: !secondPage && matching.length > 1 ? "pagina_2" : null,
        limitations: [
          "O estado da observação não mede a aprendizagem da pessoa estudante.",
          "Os números descrevem este recorte e não demonstram relação causal."
        ],
        deepLink: `${window.location.origin}/#/authoring/courses/${courseId}?section=research`
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
      async loadAuthoringOutline(courseId) {
        probe.outlineReads += 1;
        return outlineFor(courseId);
      },
      async loadCourseDocument(courseId, options = {}) {
        probe.courseDocumentReads.push({ courseId, options: structuredClone(options) });
        const detail = courseDetail(courseId);
        if (options.verifiedRevision != null && options.verifiedRevision !== detail.revision) {
          const error = new Error("Revisão alterada");
          error.code = "course_revision_changed";
          throw error;
        }
        const source = courseId === courseIds[0] ? studyUnits : [];
        return {
          document: {
            contract: "aralearn.course-project.v1",
            courses: [{
              id: courseId,
              position: 0,
              title: detail.title,
              modules: [{
                id: "module-a",
                position: 0,
                title: "Base conceitual",
                lessons: [{
                  id: "lesson-a",
                  position: 0,
                  title: "Relações e evidências",
                  microsequences: [{
                    id: "microsequence-a",
                    position: 0,
                    title: "Comparação orientada",
                    studyUnits: structuredClone(source)
                  }]
                }]
              }]
            }]
          }
        };
      },
      async loadCourseAnchoredAnnotations(courseId, options) {
        probe.annotationReads.push({ courseId, options: structuredClone(options) });
        if (requestedAnnotationMutationScenario === "reconciliation-fails-once" &&
            annotationMutationConfirmed && !annotationReconciliationFailureDelivered) {
          annotationReconciliationFailureDelivered = true;
          const error = new Error("A conexão caiu durante a atualização da lista.");
          error.code = "network_error";
          throw error;
        }
        return annotationPage(courseId, options);
      },
      async mutateCourseAnchoredAnnotations(input) {
        probe.annotationMutations.push(structuredClone(input));
        const { command } = input;
        const index = annotations.findIndex(({ annotationId }) =>
          annotationId === command.annotationId);
        let item;
        if (command.type === "create_anchored_annotation") {
          item = annotationItem({
            courseId: input.courseId,
            annotationId: command.annotationId,
            target: command.target,
            rawText: command.rawText,
            category: command.category,
            origin: "author",
            channel: "authoring_interface"
          });
          item.timestamps.capturedAt = command.capturedAt;
          annotations.push(item);
        } else {
          item = structuredClone(annotations[index]);
          item.annotationVersion += 1;
          item.timestamps.updatedAt = "2026-08-17T13:30:00.000Z";
          if (command.type === "revise_anchored_annotation") {
            item.rawText = command.rawText;
            item.category = command.category;
            item.briefSummary = command.briefSummary;
          } else if (command.type === "withdraw_anchored_annotation") {
            item.rawText = null;
            item.ownerResponse = null;
            item.state = "withdrawn";
            item.timestamps.withdrawnAt = "2026-08-17T13:30:00.000Z";
            item.capabilities = Object.fromEntries(Object.keys(item.capabilities)
              .map((key) => [key, false]));
          } else if (command.type === "consider_anchored_annotation") {
            item.state = "considered";
            item.timestamps.firstConsideredAt ||= "2026-08-17T13:30:00.000Z";
          } else if (command.type === "resolve_anchored_annotation") {
            item.state = "resolved";
            item.timestamps.resolvedAt = "2026-08-17T13:30:00.000Z";
            item.capabilities.canResolve = false;
            item.capabilities.canReopen = true;
          } else if (command.type === "reopen_anchored_annotation") {
            item.state = "open";
            item.timestamps.resolvedAt = null;
            item.capabilities.canResolve = true;
            item.capabilities.canReopen = false;
          } else if (command.type === "respond_to_anchored_annotation") {
            item.ownerResponse = {
              text: command.ownerResponse,
              kind: command.responseKind,
              consideredSourceLinks: structuredClone(command.consideredSourceLinks),
              updatedAt: "2026-08-17T13:30:00.000Z"
            };
            item.timestamps.respondedAt = "2026-08-17T13:30:00.000Z";
          } else if (command.type === "correct_anchored_annotation_subjects") {
            item.subjectClassification = classification(command.subjectIds.map((topicId) => ({
              topicId,
              label: topicId === "topic-b" ? "Evidências" : "Relações",
              topicVersion: 1
            })));
          }
          annotations[index] = item;
        }
        annotationSetVersion += 1;
        annotationMutationConfirmed = true;
        return {
          contract: "aralearn.course-anchored-annotation-change.v1",
          courseId: input.courseId,
          courseRevision: courseDetail(input.courseId).revision,
          annotationSetVersion,
          requestId: input.requestId,
          idempotent: false,
          changed: true,
          annotation: structuredClone(item)
        };
      },
      async loadCourseAuditCycle(courseId, options) {
        probe.auditReads.push({ courseId, options: structuredClone(options) });
        if (options.query.mode === "detail" && options.query.auditRunId === auditRunId) {
          return auditRunPage(courseId, options);
        }
        throw new Error("A fixture de Auditoria só é lida pelos cenários dedicados.");
      },
      async mutateCourseAuditCycle(input) {
        probe.auditMutations.push(structuredClone(input));
        throw new Error("A fixture de Auditoria só é alterada pelos cenários dedicados.");
      },
      async loadAuthoringStudyUnits(courseId, options) {
        probe.inspectionReads.push(structuredClone(options));
        const detail = courseDetail(courseId);
        if (options.expectedRevision !== detail.revision) {
          const error = new Error("Revisão alterada");
          error.code = "course_revision_changed";
          throw error;
        }
        const source = courseId === courseIds[0] ? studyUnits : [];
        const anchorIndex = options.anchorStudyUnitId
          ? source.findIndex(({ id }) => id === options.anchorStudyUnitId)
          : -1;
        const cursorIndex = options.cursor
          ? source.findIndex(({ id }) => id === options.cursor.studyUnitId)
          : -1;
        if ((options.anchorStudyUnitId && anchorIndex < 0) ||
            (options.cursor && cursorIndex < 0)) {
          const error = new Error("Unidade ausente");
          error.status = 404;
          throw error;
        }
        let start;
        let selected;
        if (options.direction === "backward" && cursorIndex >= 0) {
          start = Math.max(0, cursorIndex - options.limit);
          selected = source.slice(start, cursorIndex);
        } else {
          start = cursorIndex >= 0 ? cursorIndex + 1 : Math.max(0, anchorIndex);
          selected = source.slice(start, start + options.limit);
        }
        const end = start + selected.length;
        const items = selected.map((studyUnit, index) => ({
          studyUnit: structuredClone(studyUnit),
          version: 1,
          updatedAt: "2026-08-17T12:00:00.000Z",
          ordinal: start + index + 1,
          curriculumPath: {
            module: { id: "module-a", position: 0, title: "Base conceitual" },
            lesson: { id: "lesson-a", position: 0, title: "Relações e evidências" },
            didacticMicrosequence: {
              id: "microsequence-a",
              position: 0,
              title: "Comparação orientada"
            }
          },
          authoringPart: {
            id: "70000000-0000-4000-8000-000000000007",
            position: 0,
            title: "Relações iniciais",
            state: "materialized"
          },
          authorship: {
            pendingObservationCount: 0,
            production: null,
            design: null
          },
          deepLink: `#/authoring/courses/${courseId}?section=content&studyUnitId=${studyUnit.id}`
        }));
        return {
          contract: "aralearn.course-study-unit-inspection-page.v2",
          courseId,
          courseRevision: detail.revision,
          scope: structuredClone(options.scope),
          totalCount: source.length,
          scopeOptions: {
            authoringParts: [{
              id: "70000000-0000-4000-8000-000000000007",
              position: 0,
              title: "Relações iniciais",
              state: "materialized"
            }],
            unassignedStudyUnitCount: 0
          },
          items,
          hasPrevious: start > 0,
          hasMore: end < source.length,
          previousCursor: start > 0 && items.length
            ? { studyUnitId: items[0].studyUnit.id }
            : null,
          nextCursor: end < source.length && items.length
            ? { studyUnitId: items.at(-1).studyUnit.id }
            : null,
          pageBytes: 32_768
        };
      },
      async loadAuthoringInspectionPosition(courseId) {
        probe.positionLoads += 1;
        const serialized = localStorage.getItem(inspectionPositionKey(courseId));
        return serialized ? JSON.parse(serialized) : null;
      },
      async saveAuthoringInspectionPosition(courseId, position) {
        probe.positionSaves.push({ courseId, ...structuredClone(position) });
        localStorage.setItem(inspectionPositionKey(courseId), JSON.stringify(position));
      },
      async createCourse(value) {
        probe.createCalls.push(structuredClone(value));
        const receipt = createReceipts.get(value.requestId);
        if (receipt) return structuredClone(receipt);
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
        const result = { courseId: createdCourseId, revision: 1 };
        createReceipts.set(value.requestId, structuredClone(result));
        if (requestedCreateMutationScenario === "ambiguous-once" &&
            !createAmbiguousFailureDelivered) {
          createAmbiguousFailureDelivered = true;
          const error = new Error("A conexão terminou depois da confirmação.");
          error.code = "network_error";
          throw error;
        }
        return result;
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
      async loadCourseSources(courseId, options) {
        probe.sourceReads.push({ courseId, ...structuredClone(options) });
        const detail = courseDetail(courseId);
        if (options.expectedRevision !== detail.revision) {
          const error = new Error("Revisão alterada");
          error.code = "course_revision_changed";
          throw error;
        }
        const cursorOffset = options.cursor === null
          ? 0
          : Number(String(options.cursor).replace(/^source-page-/u, ""));
        if (!Number.isSafeInteger(cursorOffset) || cursorOffset < 0) {
          throw new TypeError("Cursor inválido");
        }
        let items;
        let nextCursor;
        let query;
        if (options.mode === "catalog") {
          items = sourceCatalog.slice(cursorOffset, cursorOffset + options.limit);
          nextCursor = cursorOffset + items.length < sourceCatalog.length
            ? `source-page-${cursorOffset + items.length}`
            : null;
          query = { sourceId: null, targetKind: null, targetId: null };
        } else if (options.mode === "source") {
          const history = sourceDetails.get(options.sourceId) || [];
          if (options.targetKind !== null) {
            const targetHistory = sourceTargets.get(sourceTargetKey(
              options.targetKind,
              options.targetId
            )) || [];
            const effective = targetHistory.find((item) => item.effective) || null;
            const link = effective?.sourceLinks.find(({ sourceId }) =>
              sourceId === options.sourceId) || null;
            const pinned = link == null
              ? null
              : history.find(({ revision }) => revision === link.sourceRevision) || null;
            items = pinned ? [pinned] : [];
            nextCursor = null;
            query = {
              sourceId: options.sourceId,
              targetKind: options.targetKind,
              targetId: options.targetId
            };
          } else {
            items = history.slice(cursorOffset, cursorOffset + options.limit);
            nextCursor = cursorOffset + items.length < history.length
              ? `source-page-${cursorOffset + items.length}`
              : null;
            query = { sourceId: options.sourceId, targetKind: null, targetId: null };
          }
        } else {
          const history = sourceTargets.get(sourceTargetKey(
            options.targetKind,
            options.targetId
          )) || [];
          items = history.slice(cursorOffset, cursorOffset + options.limit);
          nextCursor = cursorOffset + items.length < history.length
            ? `source-page-${cursorOffset + items.length}`
            : null;
          query = {
            sourceId: null,
            targetKind: options.targetKind,
            targetId: options.targetId
          };
        }
        return {
          contract: "aralearn.course-sources.v1",
          courseId,
          courseRevision: detail.revision,
          mode: options.mode,
          query,
          pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
          items: structuredClone(items),
          nextCursor
        };
      },
      async mutateCourseSources(request) {
        probe.sourceMutations.push(structuredClone(request));
        if (sourceReceipts.has(request.requestId)) {
          return {
            ...structuredClone(sourceReceipts.get(request.requestId)),
            idempotent: true
          };
        }
        const course = courses.find((item) => item.courseId === request.courseId);
        if (!course) throw new Error("Curso ausente");
        if (request.expectedCourseRevision !== course.revision) {
          const error = new Error("Revisão alterada");
          error.code = "course_revision_changed";
          throw error;
        }
        const command = request.command;
        let subjectId;
        let revision;
        if (command.type === "save_source") {
          const history = sourceDetails.get(command.sourceId) || [];
          const current = history[0] || null;
          if ((current?.revision || 0) !== command.expectedSourceRevision) {
            const error = new Error("Fonte alterada");
            error.status = 409;
            throw error;
          }
          revision = command.expectedSourceRevision + 1;
          const detailed = {
            sourceId: command.sourceId,
            revision,
            status: "active",
            ...structuredClone(command.source),
            anchorCount: 0,
            createdAt: "2026-08-17T12:20:00.000Z",
            actorId: ownerId,
            anchors: [],
            attachments: []
          };
          sourceDetails.set(command.sourceId, [detailed, ...history]);
          const {
            actorId: discardedActor,
            anchors: discardedAnchors,
            attachments: discardedAttachments,
            ...catalogItem
          } = detailed;
          void discardedActor;
          void discardedAnchors;
          void discardedAttachments;
          const catalogIndex = sourceCatalog.findIndex(({ sourceId }) =>
            sourceId === command.sourceId);
          if (catalogIndex < 0) sourceCatalog.push(catalogItem);
          else sourceCatalog[catalogIndex] = catalogItem;
          subjectId = command.sourceId;
        } else if (command.type === "retire_source") {
          const history = sourceDetails.get(command.sourceId) || [];
          const current = history[0] || null;
          if (!current || current.revision !== command.expectedSourceRevision) {
            const error = new Error("Fonte alterada");
            error.status = 409;
            throw error;
          }
          revision = current.revision + 1;
          const retired = {
            ...structuredClone(current),
            revision,
            status: "retired",
            anchorCount: 0,
            createdAt: "2026-08-17T12:21:00.000Z",
            anchors: []
          };
          sourceDetails.set(command.sourceId, [retired, ...history]);
          const {
            actorId: discardedActor,
            anchors: discardedAnchors,
            attachments: discardedAttachments,
            ...catalogItem
          } = retired;
          void discardedActor;
          void discardedAnchors;
          void discardedAttachments;
          const catalogIndex = sourceCatalog.findIndex(({ sourceId }) =>
            sourceId === command.sourceId);
          sourceCatalog[catalogIndex] = catalogItem;
          subjectId = command.sourceId;
        } else if (command.type === "save_anchor") {
          const history = sourceDetails.get(command.sourceId) || [];
          const source = history.find(({ revision: sourceRevision }) =>
            sourceRevision === command.sourceRevision);
          const previous = source?.anchors.find(({ anchorId }) =>
            anchorId === command.anchorId) || null;
          if (!source || (previous?.revision || 0) !== command.expectedAnchorRevision) {
            const error = new Error("Âncora alterada");
            error.status = 409;
            throw error;
          }
          revision = command.expectedAnchorRevision + 1;
          const anchor = {
            anchorId: command.anchorId,
            revision,
            sourceRevision: command.sourceRevision,
            status: "active",
            selector: structuredClone(command.selector),
            humanLocator: command.humanLocator,
            verificationExcerpt: command.verificationExcerpt,
            actorId: ownerId,
            createdAt: "2026-08-17T12:22:00.000Z"
          };
          source.anchors = [anchor, ...source.anchors.filter(({ anchorId }) =>
            anchorId !== command.anchorId)];
          source.anchorCount = source.anchors.filter(({ status }) => status === "active").length;
          const catalog = sourceCatalog.find(({ sourceId }) => sourceId === command.sourceId);
          if (catalog?.revision === source.revision) catalog.anchorCount = source.anchorCount;
          subjectId = command.anchorId;
        } else if (command.type === "retire_anchor") {
          let source = null;
          let previous = null;
          for (const history of sourceDetails.values()) {
            source = history.find((candidate) => candidate.anchors.some(({ anchorId }) =>
              anchorId === command.anchorId));
            if (source) {
              previous = source.anchors.find(({ anchorId }) => anchorId === command.anchorId);
              break;
            }
          }
          if (!source || previous.revision !== command.expectedAnchorRevision) {
            const error = new Error("Âncora alterada");
            error.status = 409;
            throw error;
          }
          revision = previous.revision + 1;
          Object.assign(previous, {
            revision,
            status: "retired",
            createdAt: "2026-08-17T12:23:00.000Z"
          });
          source.anchorCount = source.anchors.filter(({ status }) => status === "active").length;
          const catalog = sourceCatalog.find(({ sourceId }) => sourceId === source.sourceId);
          if (catalog?.revision === source.revision) catalog.anchorCount = source.anchorCount;
          subjectId = command.anchorId;
        } else if (command.type === "set_target_sources") {
          const key = sourceTargetKey(command.targetKind, command.targetId);
          const history = sourceTargets.get(key) || [];
          history.forEach((attribution) => { attribution.effective = false; });
          revision = (history[0]?.revision || 0) + 1;
          history.unshift({
            attributionId: crypto.randomUUID(),
            targetKind: command.targetKind,
            targetId: command.targetId,
            targetVersion: command.expectedTargetVersion,
            targetHash: "b".repeat(64),
            revision,
            sourceLinks: structuredClone(command.sourceLinks),
            actorId: ownerId,
            createdAt: "2026-08-17T12:24:00.000Z",
            effective: true
          });
          sourceTargets.set(key, history);
          subjectId = command.targetId;
        } else {
          throw new TypeError("Comando de Fonte desconhecido");
        }
        course.revision += 1;
        const result = {
          contract: "aralearn.course-source-change.v1",
          courseId: request.courseId,
          courseRevision: course.revision,
          requestId: request.requestId,
          idempotent: false,
          changed: true,
          change: { type: command.type, subjectId, revision }
        };
        sourceReceipts.set(request.requestId, structuredClone(result));
        if (requestedSourceMutationScenario === "ambiguous-once" &&
            !sourceAmbiguousFailureDelivered) {
          sourceAmbiguousFailureDelivered = true;
          const error = new Error("A conexão terminou depois da confirmação.");
          error.code = "network_error";
          throw error;
        }
        return result;
      },
      async loadCourseDesign(courseId, options) {
        probe.designReads.push({ courseId, ...structuredClone(options) });
        return buildCourseDesign(courseId, options);
      },
      async mutateCourseDesign(request) {
        probe.designMutations.push(structuredClone(request));
        const receipt = designReceipts.get(request.requestId);
        if (receipt) return { ...structuredClone(receipt), idempotent: true };
        const course = courses.find((item) => item.courseId === request.courseId);
        if (!course) throw new Error("Curso ausente");
        if (request.expectedCourseRevision !== course.revision) {
          const error = new Error("Revisão alterada");
          error.code = "course_revision_changed";
          throw error;
        }
        const store = ensureDesignState(request.courseId);
        const command = request.command;
        const changeId = String(++designChangeId);
        let changeScope = command.scope ? structuredClone(command.scope) : null;
        if (command.type === "set_parameter") {
          const key = scopeKey(command.scope);
          const assignments = store.parameterAssignments.get(key) || new Map();
          assignments.set(command.parameterId, {
            changeId,
            value: structuredClone(command.value),
            origin: command.origin,
            reason: command.reason
          });
          store.parameterAssignments.set(key, assignments);
        } else if (command.type === "clear_parameter") {
          store.parameterAssignments.get(scopeKey(command.scope))?.delete(command.parameterId);
        } else if (command.type === "set_guidance") {
          store.guidance.set(scopeKey(command.scope), {
            revisionId: crypto.randomUUID(),
            guidance: command.guidance,
            origin: command.origin,
            reason: command.reason
          });
        } else if (command.type === "clear_guidance") {
          store.guidance.delete(scopeKey(command.scope));
        } else if (command.type === "interpret_guidance") {
          const knownRevision = [...store.guidance.entries()].find(([, revision]) =>
            revision.revisionId === command.guidanceRevisionId);
          if (!knownRevision) throw new Error("Orientação ausente");
          changeScope = scopeFromKey(knownRevision[0]);
          store.interpretations.set(command.guidanceRevisionId, {
            interpretationId: String(++interpretationSequence),
            guidanceRevisionId: command.guidanceRevisionId,
            interpretation: structuredClone(command.interpretation),
            createdAt: "2026-08-17T12:12:00.000Z"
          });
        } else if (command.type === "set_component_policy") {
          store.policies.set(scopeKey(command.scope), {
            changeId,
            policy: structuredClone(command.policy),
            origin: command.origin,
            reason: command.reason
          });
        } else if (command.type === "clear_component_policy") {
          store.policies.delete(scopeKey(command.scope));
        } else if (command.type === "set_target_plan_items") {
          store.targetPlanItems.set(command.scope.ref, {
            instructionalAnalysisUnitIds: structuredClone(
              command.instructionalAnalysisUnitIds
            ),
            evidenceRequirementIds: structuredClone(command.evidenceRequirementIds)
          });
        } else {
          throw new Error("Comando de desenho desconhecido");
        }
        course.revision += 1;
        const result = {
          contract: "aralearn.course-design-change.v1",
          courseId: request.courseId,
          courseRevision: course.revision,
          requestId: request.requestId,
          idempotent: false,
          changed: true,
          change: { changeId, type: command.type, scope: changeScope }
        };
        designReceipts.set(request.requestId, structuredClone(result));
        if (requestedDesignMutationScenario === "ambiguous-once" &&
            !designAmbiguousFailureDelivered) {
          designAmbiguousFailureDelivered = true;
          const error = new Error("A conexão terminou depois da confirmação.");
          error.code = "network_error";
          throw error;
        }
        return result;
      },
      async listCourseVariantComparisons(courseId, expectedCourseRevision) {
        probe.variantReads.push({ type: "list", courseId, expectedCourseRevision });
        return {
          contract: "aralearn.course-variant-comparison-list.v1",
          sourceCourseId: courseId,
          sourceCourseRevision: expectedCourseRevision,
          items: [{
            comparisonSetId: "8b000000-0000-4000-8000-00000000001b",
            checkpointId: "8c000000-0000-4000-8000-00000000001c",
            checkpointHash: "c".repeat(64),
            checkpointCourseRevision: expectedCourseRevision,
            memberCount: 2,
            attachedCount: 2,
            detachedCount: 0,
            createdAt: "2026-08-18T12:00:00.000Z",
            updatedAt: "2026-08-18T12:00:00.000Z"
          }]
        };
      },
      async loadCourseAuthoringAnalytics(courseId, options) {
        probe.analyticsReads.push({ courseId, options: structuredClone(options) });
        return analyticsPage(courseId, options);
      },
      async loadCourseVariantComparison(courseId, options) {
        probe.variantReads.push({ type: "comparison", courseId, options: structuredClone(options) });
        return structuredClone(variantComparisonFixture);
      },
      async mutateCourseVariants(request) {
        probe.variantMutations.push(structuredClone(request));
        const receipt = variantReceipts.get(request.requestId);
        if (receipt) return { ...structuredClone(receipt), idempotent: true };
        probe.variantAppliedMutations += 1;
        const result = { courseId: request.courseId, courseRevision: 5, requestId: request.requestId, idempotent: false, changed: true };
        variantReceipts.set(request.requestId, structuredClone(result));
        if (requestedVariantMutationScenario === "ambiguous-once" &&
            !variantAmbiguousFailureDelivered) {
          variantAmbiguousFailureDelivered = true;
          const error = new Error("A conexão terminou depois da confirmação.");
          error.code = "network_error";
          throw error;
        }
        return result;
      },
      async loadPartMaterialization(courseId, authoringPartId, materializationId) {
        probe.materializationReads.push({
          courseId,
          authoringPartId,
          materializationId
        });
        const failed = materializationId === "75000000-0000-4000-8000-000000000013";
        const completed = materializationId === "75000000-0000-4000-8000-000000000014";
        const partial = materializationId === "75000000-0000-4000-8000-000000000012";
        const channel = completed ? "actions" : partial ? "application" : "mcp";
        const status = failed ? "failed" : completed || partial ? "completed" : "running";
        const steps = [{
          id: "76000000-0000-4000-8000-000000000016",
          position: 0,
          kind: "context_load",
          targetDidacticMicrosequenceId: null,
          productionPosition: null,
          status: "completed",
          version: 2,
          resultFacts: {
            loadedSources: 2,
            changedObjects: [{ entityType: "study_unit", entityId: "study-unit-01" }]
          },
          updatedAt: "2026-08-17T12:01:00.000Z",
          completedAt: "2026-08-17T12:01:00.000Z"
        }, {
          id: "77000000-0000-4000-8000-000000000017",
          position: 1,
          kind: "validation",
          targetDidacticMicrosequenceId: null,
          productionPosition: null,
          status: failed || partial ? "failed" : completed ? "completed" : "pending",
          version: 1,
          resultFacts: failed || partial ? { warning: "A validação precisa ser revista." } : {},
          updatedAt: "2026-08-17T12:00:00.000Z",
          completedAt: failed || partial || completed ? "2026-08-17T12:02:00.000Z" : null
        }];
        return {
          contract: "aralearn.course-authoring-part-materialization.v1",
          courseId,
          courseRevision: 5,
          authoringPartId,
          materialization: {
            id: materializationId,
            authoringPartVersion: 1,
            channel,
            status,
            version: 2,
            designContext: { focus: "Comparação orientada" },
            contextHash: "a".repeat(64),
            resultFacts: completed ? { producedStudyUnitCount: 1 } : {},
            startedAt: "2026-08-17T12:00:00.000Z",
            updatedAt: "2026-08-17T12:02:00.000Z",
            completedAt: status === "running" ? null : "2026-08-17T12:02:00.000Z",
            steps,
            nextPendingStep: status === "running" ? steps[1] : null
          }
        };
      },
      async mutateAuthoringPlan(value) {
        probe.planMutations.push(structuredClone(value));
        const receipt = planningReceipts.get(value.requestId);
        if (receipt) return { ...structuredClone(receipt), idempotent: true };
        const course = courses.find((item) => item.courseId === value.courseId);
        if (value.operation !== "update_plan") return;
        course.title = value.title;
        course.goal = value.objective;
        course.plan.audience = value.audience || null;
        course.plan.scope = value.scope || null;
        course.plan.preferredPartCount = structuredClone(value.preferredPartCount);
        course.plan.version += 1;
        course.plan.updatedAt = "2026-08-17T12:05:00.000Z";
        course.revision += 1;
        const result = {
          changed: true,
          requestId: value.requestId,
          courseRevision: course.revision,
          idempotent: false
        };
        planningReceipts.set(value.requestId, structuredClone(result));
        if (requestedPlanningMutationScenario === "ambiguous-once" &&
            !planningAmbiguousFailureDelivered) {
          planningAmbiguousFailureDelivered = true;
          const error = new Error("A conexão terminou depois da confirmação.");
          error.code = "network_error";
          throw error;
        }
        return result;
      },
      async requestPartMaterialization(value) {
        probe.materializationRequests.push(structuredClone(value));
        return { delivery: "clipboard" };
      },
      async requestAuthoringRequest(value) {
        probe.materializationRequests.push(structuredClone(value));
        return { delivery: "clipboard" };
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
          people: structuredClone(people)
        };
      },
      async grantCourseAccess(request) {
        probe.peopleMutations.push({ method: "grant", request: structuredClone(request) });
        const receipt = peopleReceipts.get(request.requestId);
        if (receipt) return { ...structuredClone(receipt), idempotent: true };
        probe.peopleAppliedMutations += 1;
        people.push({
          userId: grantedPersonId,
          displayName: "Pessoa recém-convidada",
          avatarObjectKey: null,
          grantedAt: "2026-08-20T12:00:00.000Z"
        });
        const result = {
          changed: true,
          requestId: request.requestId,
          idempotent: false
        };
        peopleReceipts.set(request.requestId, structuredClone(result));
        if (requestedPeopleMutationScenario === "grant-ambiguous-once" &&
            !peopleAmbiguousFailureDelivered) {
          peopleAmbiguousFailureDelivered = true;
          const error = new Error("A conexão terminou depois da confirmação.");
          error.code = "network_error";
          throw error;
        }
        return result;
      },
      async revokeCourseAccess(request) {
        probe.peopleMutations.push({ method: "revoke", request: structuredClone(request) });
        const receipt = peopleReceipts.get(request.requestId);
        if (receipt) return { ...structuredClone(receipt), idempotent: true };
        probe.peopleAppliedMutations += 1;
        const index = people.findIndex(({ userId }) => userId === request.userId);
        if (index >= 0) people.splice(index, 1);
        const result = {
          changed: index >= 0,
          requestId: request.requestId,
          idempotent: false
        };
        peopleReceipts.set(request.requestId, structuredClone(result));
        if (requestedPeopleMutationScenario === "revoke-ambiguous-once" &&
            !peopleAmbiguousFailureDelivered) {
          peopleAmbiguousFailureDelivered = true;
          const error = new Error("A conexão terminou depois da confirmação.");
          error.code = "network_error";
          throw error;
        }
        return result;
      }
    };
    const authoringWindow = {
      addEventListener: window.addEventListener.bind(window),
      removeEventListener: window.removeEventListener.bind(window),
      requestAnimationFrame: window.requestAnimationFrame.bind(window),
      cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
      scrollBy: window.scrollBy.bind(window),
      matchMedia: window.matchMedia.bind(window),
      BroadcastChannel: window.BroadcastChannel
    };
    const surface = createCourseAuthoringSurface({
      root,
      controller,
      locationValue: window.location,
      historyValue: window.history,
      windowValue: authoringWindow,
      onOpenStudyContent(value) {
        probe.studyContentOpens.push(structuredClone(value));
        return true;
      },
      onClose() { probe.closeCalls += 1; }
    });
    globalThis.__courseAuthoringHarness = {
      surface,
      probe,
      updateInspectionStudyUnit(studyUnitId, title) {
        const studyUnit = studyUnits.find(({ id }) => id === studyUnitId);
        const course = courses.find(({ courseId }) => courseId === courseIds[0]);
        if (!studyUnit || !course) throw new Error("Unidade de estudo ausente na fixture.");
        studyUnit.title = title;
        course.revision += 1;
        return course.revision;
      }
    };
    await surface.open();
  }, {
    requestedCardinality: cardinality,
    requestedPlanningScenario: planningScenario,
    requestedPlanningMutationScenario: planningMutationScenario,
    requestedCreateMutationScenario: createMutationScenario,
    requestedDesignMutationScenario: designMutationScenario,
    requestedSourceMutationScenario: sourceMutationScenario,
    requestedVariantMutationScenario: variantMutationScenario,
    requestedPeopleMutationScenario: peopleMutationScenario,
    requestedAnnotationMutationScenario: annotationMutationScenario,
    requestedObjective: objective,
    courseIds: COURSE_IDS,
    createdCourseId: CREATED_COURSE_ID,
    ownerId: OWNER_ID,
    studentId: STUDENT_ID,
    variantComparisonFixture: buildVariantComparisonFixture()
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

  for (const width of [360, 390, 1280]) {
    test(`histórico de materializações abre sob demanda sem overflow em ${width} px`, async ({
      page
    }, testInfo) => {
      const clientErrors = captureClientErrors(page);
      await page.setViewportSize({ width, height: width < 600 ? 780 : 900 });
      const planningHash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
      await mountCourseAuthoring(page, { cardinality: "many", hash: planningHash });

      await expect(page.locator('[data-course-authoring-action="materialize-part"]'))
        .toHaveCount(0);
      await expect(page.getByRole("dialog", { name: "Trabalhar no ChatGPT" }))
        .toHaveCount(0);
      expect(await page.evaluate(() =>
        globalThis.__courseAuthoringHarness.probe.materializationRequests)).toEqual([]);

      expect(await page.evaluate(() =>
        globalThis.__courseAuthoringHarness.probe.materializationReads)).toEqual([]);
      await page.locator(".course-authoring-last-materialization a").click();
      await expect(page.getByRole("heading", { name: "Materializações", exact: true }))
        .toBeVisible();
      await expect(page.locator(".course-authoring-materialization-history li")).toHaveCount(4);
      await expect(page.locator('.course-authoring-materialization-history li[data-status="failed"]'))
        .toHaveCount(1);
      await expect(page.getByText("Actions", { exact: false }).first()).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`course-authoring-materialization-history-${width}.png`),
        fullPage: true,
        animations: "disabled"
      });
      await page.locator(".course-authoring-materialization-history li > a").first().click();
      await expect(page.getByText("Etapas e resultados", { exact: true })).toBeVisible();
      await expect(page.getByText("Próxima: etapa 2 · Validar produção", {
        exact: true
      })).toBeVisible();
      await expect(page.getByLabel("Etapas e resultados da materialização")
        .getByText("Unidade produzida 1", { exact: true })).toBeVisible();
      expect(await page.evaluate(() =>
        globalThis.__courseAuthoringHarness.probe.materializationReads)).toEqual([{
        courseId: COURSE_IDS[0],
        authoringPartId: "70000000-0000-4000-8000-000000000007",
        materializationId: "75000000-0000-4000-8000-000000000015"
      }]);
      const executionHash = await page.evaluate(() => window.location.hash);
      await page.getByRole("link", { name: /Unidade produzida 1/u }).click();
      await expect(page.locator(".course-authoring-surface")).toHaveAttribute(
        "data-section", "content"
      );
      await expect(page.locator('[data-inspection-study-unit="study-unit-01"]'))
        .toBeInViewport();
      await expect(page.getByRole("heading", { name: "Exemplo guiado com diagrama" }))
        .toBeVisible();
      await expect(page.getByText("Ponto não encontrado", { exact: true })).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath(`course-authoring-produced-object-${width}.png`),
        fullPage: true,
        animations: "disabled"
      });
      await page.getByRole("link", { name: "Voltar à execução", exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(executionHash);
      await expect(page.getByText("Etapas e resultados", { exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.screenshot({
        path: testInfo.outputPath(`course-authoring-materialization-${width}.png`),
        fullPage: true,
        animations: "disabled"
      });
      expect(clientErrors).toEqual([]);
    });
  }

  test("retorno ao AraLearn preserva formulário alterado e permite atualizar após cancelar", async ({
    page
  }) => {
    const clientErrors = captureClientErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=parameters`;
    await mountCourseAuthoring(page, { cardinality: "many", hash });

    const parameter = page.locator(
      '[data-parameter-id="new_analysis_unit_ceiling_per_expository_study_unit"]'
    );
    await parameter.getByText("Entender e ajustar", { exact: true }).click();
    const reason = parameter.getByLabel("Justificativa");
    const draft = "Hipótese ainda em discussão com a equipe autora.";
    await reason.fill(draft);
    const readsBefore = await page.evaluate(() =>
      globalThis.__courseAuthoringHarness.probe.headerReads);

    expect(await page.evaluate(() =>
      globalThis.__courseAuthoringHarness.surface.refresh())).toBe("deferred");
    await expect(reason).toHaveValue(draft);
    expect(await page.evaluate(() =>
      globalThis.__courseAuthoringHarness.probe.headerReads)).toBe(readsBefore);

    await parameter.getByRole("button", { name: "Descartar alterações" }).click();
    await expect(reason).not.toHaveValue(draft);
    await page.evaluate(() => globalThis.__courseAuthoringHarness.surface.refresh());
    await expect.poll(() => page.evaluate(() =>
      globalThis.__courseAuthoringHarness.probe.headerReads)).toBe(readsBefore + 1);
    expect(clientErrors).toEqual([]);
  });


  for (const width of [360, 390, 430, 1280]) {
    test(`Parâmetros preserva controles progressivos sem overflow em ${width} px`, async ({
      page
    }, testInfo) => {
      const clientErrors = captureClientErrors(page);
      await page.setViewportSize({ width, height: width < 600 ? 820 : 900 });
      const parametersHash = `#/authoring/courses/${COURSE_IDS[0]}?section=parameters`;
      await mountCourseAuthoring(page, { cardinality: "many", hash: parametersHash });

      await expect(page.getByRole("heading", { name: "Parâmetros", exact: true })).toBeVisible();
      await expect(page.locator(".course-design-parameter")).toHaveCount(4);
      await expect(page.locator(".course-design-component-option")).toHaveCount(32);
      await expect(page.getByText(/valores iniciais são hipóteses operacionais/u)).toBeVisible();
      await expect(page.getByRole("heading", { name: "Componentes", exact: true })).toBeVisible();
      await expect(page.getByText("Planejado × aplicado", { exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(await page.evaluate(() => globalThis.__courseAuthoringHarness.probe)).toMatchObject({
        outlineReads: 0,
        planReads: 0,
        designReads: [{
          courseId: COURSE_IDS[0],
          scope: { kind: "course", ref: COURSE_IDS[0] },
          limit: 32,
          cursor: null
        }]
      });

      await page.screenshot({
        path: testInfo.outputPath(`course-parameters-${width}.png`),
        fullPage: true,
        animations: "disabled"
      });
      expect(clientErrors).toEqual([]);
    });
  }

  for (const width of [360, 390, 430, 1280]) {
    test(`Variantes compara Cursos concretos sem overflow em ${width} px`, async ({
      page
    }, testInfo) => {
      const clientErrors = captureClientErrors(page);
      await page.setViewportSize({ width, height: width < 600 ? 820 : 900 });
      const variantsHash = `#/authoring/courses/${COURSE_IDS[0]}?section=research`;
      await mountCourseAuthoring(page, { cardinality: "many", hash: variantsHash });

      await expect(page.getByRole("heading", { name: "Variantes", exact: true })).toBeVisible();
      await expectResponsiveAuthoringNavigation(page, width);
      await expect(page.locator(
        '.course-authoring-task-menu a[data-section="research"]'
      )).toHaveClass(/\bis-active\b/u);
      await page.getByRole("button", { name: "Comparar", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Comparação", exact: true })).toBeVisible();
      await expect(page.getByText("Novas unidades de análise por Unidade expositiva:", {
        exact: false
      })).toBeVisible();
      await expect(page.getByText("1 componente permitido.", { exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.screenshot({
        path: testInfo.outputPath(`course-variants-comparison-${width}.png`),
        fullPage: true,
        animations: "disabled"
      });

      await page.getByRole("button", { name: "Abrir Curso", exact: true }).first().click();
      await expect(page.locator(".course-authoring-surface")).toHaveAttribute(
        "data-section", "overview"
      );
      await expect(page.getByRole("heading", { name: "Visão geral", exact: true })).toBeVisible();
      expect(await page.evaluate(() => globalThis.__courseAuthoringHarness.probe.variantReads))
        .toHaveLength(2);
      await expectNoHorizontalOverflow(page);

      await page.screenshot({
        path: testInfo.outputPath(`course-variants-${width}.png`),
        fullPage: true,
        animations: "disabled"
      });
      expect(clientErrors).toEqual([]);
    });
  }

  test("Variantes cria uma alternativa com parâmetro e política canônicos", async ({ page }) => {
    const clientErrors = captureClientErrors(page);
    await page.setViewportSize({ width: 390, height: 820 });
    const variantsHash = `#/authoring/courses/${COURSE_IDS[0]}?section=research`;
    await mountCourseAuthoring(page, { cardinality: "many", hash: variantsHash });

    await page.getByRole("button", { name: "Criar variantes", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Criar variantes", exact: true })).toBeVisible();
    await page.getByLabel("Por que essa diferença é intencional?").fill(
      "Comparar uma condição de menor densidade declarada."
    );
    await page.locator(".course-variants-policy summary").click();
    await page.locator('input[name="policy-enabled-1"]').check();
    await page.locator('input[name="policy-allowed-1"]').first().check();
    await page.getByRole("button", { name: "Criar e comparar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Comparação", exact: true })).toBeVisible();

    const mutation = await page.evaluate(() =>
      globalThis.__courseAuthoringHarness.probe.variantMutations.at(-1)
    );
    expect(mutation.command).toMatchObject({
      type: "create_comparison_variants",
      expectedCourseRevision: 5,
      variants: [{ parameterDifferences: [], componentPolicyDifference: null }, {
        parameterDifferences: [{
          scopeKind: "course",
          scopeId: "course",
          parameterId: "minimum_distinct_practice_opportunities_per_evidence_requirement",
          value: 1,
          rationale: "Comparar uma condição de menor densidade declarada."
        }],
        componentPolicyDifference: {
          catalogVersion: "1-3e5629f8",
          availability: "allow_only",
          allowedRefs: ["aralearn.resource.component_01@1.0.0"],
          excludedRefs: [],
          preferredRefs: []
        }
      }]
    });
    await expectNoHorizontalOverflow(page);
    expect(clientErrors).toEqual([]);
  });

  test("Variantes protege o rascunho oculto após voltar à lista", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 820 });
    await mountCourseAuthoring(page, {
      hash: `#/authoring/courses/${COURSE_IDS[0]}?section=research`
    });

    await page.getByRole("button", { name: "Criar variantes", exact: true }).click();
    const variantTitle = page.locator('input[name="title-1"]');
    await variantTitle.fill("Contraste ainda em elaboração");
    await page.getByRole("button", { name: "Voltar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Variantes", exact: true })).toBeVisible();

    expect(await page.evaluate(() =>
      globalThis.__courseAuthoringHarness.surface.refresh())).toBe("deferred");
    await navigateToAuthoringArea(page, "structure");
    await expect(page.locator(".course-authoring-surface")).toHaveAttribute(
      "data-section",
      "research"
    );
    await expect(page.locator(
      ".course-authoring-main-pane > [data-course-authoring-request-feedback]"
    )).toContainText("Navegação adiada para preservar sua edição");

    await page.getByRole("button", { name: "Criar variantes", exact: true }).click();
    await expect(page.locator('input[name="title-1"]')).toHaveValue(
      "Contraste ainda em elaboração"
    );
  });

  test("Variantes e Fontes preservam rascunho e identidade após retorno ambíguo", async ({
    page
  }) => {
    const clientErrors = captureClientErrors(page);
    await page.setViewportSize({ width: 390, height: 820 });
    await mountCourseAuthoring(page, {
      hash: `#/authoring/courses/${COURSE_IDS[0]}?section=research`,
      sourceMutationScenario: "ambiguous-once",
      variantMutationScenario: "ambiguous-once"
    });

    const expectReturnRefreshesDeferred = async () => {
      const readsBefore = await page.evaluate(() =>
        globalThis.__courseAuthoringHarness.probe.headerReads);
      const results = await page.evaluate(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        const visibility = await globalThis.__courseAuthoringHarness.surface.refresh();
        globalThis.dispatchEvent(new Event("focus"));
        const focus = await globalThis.__courseAuthoringHarness.surface.refresh();
        return [visibility, focus];
      });
      expect(results).toEqual(["deferred", "deferred"]);
      expect(await page.evaluate(() =>
        globalThis.__courseAuthoringHarness.probe.headerReads)).toBe(readsBefore);
    };

    await page.getByRole("button", { name: "Criar variantes", exact: true }).click();
    const baseTitle = page.locator('input[name="title-0"]');
    const baseGoal = page.locator('textarea[name="goal-0"]');
    const variantTitle = page.locator('input[name="title-1"]');
    const variantGoal = page.locator('textarea[name="goal-1"]');
    const rationale = page.getByLabel("Por que essa diferença é intencional?");
    const policyEnabled = page.locator('input[name="policy-enabled-1"]');
    const allowedComponent = page.locator('input[name="policy-allowed-1"]').first();
    const submit = page.getByRole("button", { name: "Criar e comparar", exact: true });

    await baseTitle.fill("Base preservada");
    await baseGoal.fill("Objetivo preservado da base");
    await variantTitle.fill("Contraste preservado");
    await variantGoal.fill("Objetivo preservado do contraste");
    await rationale.fill("Justificativa preservada para a confirmação idempotente.");
    await page.locator(".course-variants-policy summary").click();
    await policyEnabled.check();
    await allowedComponent.check();
    await submit.click();

    await expect(page.getByText(/Tente novamente para confirmar a mesma operação/u))
      .toBeVisible();
    await expect(baseTitle).toHaveValue("Base preservada");
    await expect(baseGoal).toHaveValue("Objetivo preservado da base");
    await expect(variantTitle).toHaveValue("Contraste preservado");
    await expect(variantGoal).toHaveValue("Objetivo preservado do contraste");
    await expect(rationale).toHaveValue(
      "Justificativa preservada para a confirmação idempotente."
    );
    await expect(policyEnabled).toBeChecked();
    await expect(allowedComponent).toBeChecked();
    await expect(submit).toBeFocused();

    await expectReturnRefreshesDeferred();
    await navigateToAuthoringArea(page, "structure");
    await expect(page.locator(".course-authoring-surface"))
      .toHaveAttribute("data-section", "research");
    await expect(page.locator(
      ".course-authoring-main-pane > [data-course-authoring-request-feedback]"
    )).toContainText("Navegação adiada para preservar sua edição");
    await expect(variantTitle).toHaveValue("Contraste preservado");

    await submit.click();
    await expect(page.getByRole("heading", { name: "Comparação", exact: true })).toBeVisible();
    const variantMutations = await page.evaluate(() =>
      globalThis.__courseAuthoringHarness.probe.variantMutations);
    expect(variantMutations).toHaveLength(2);
    expect(variantMutations[1].requestId).toBe(variantMutations[0].requestId);
    expect(variantMutations[1].command.comparisonSetId).toBe(
      variantMutations[0].command.comparisonSetId
    );
    expect(variantMutations[1].command).toEqual(variantMutations[0].command);

    await navigateToAuthoringArea(page, "sources");
    await expect(page.locator(".course-authoring-course-header h1")).toHaveText("Fontes");
    await page.getByRole("button", { name: "Nova fonte", exact: true }).click();

    const sourceId = page.locator('[data-source-form="source"] input[name="sourceId"]');
    const sourceTitle = page.getByLabel("Título", { exact: true });
    const sourceCitation = page.getByLabel("Citação legível");
    const sourceUrl = page.getByLabel("Link canônico");
    const saveSource = page.getByRole("button", { name: "Salvar fonte", exact: true });
    const generatedSourceId = await sourceId.inputValue();
    expect(generatedSourceId).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/u);
    await sourceTitle.fill("Fonte preservada no retorno");
    await sourceCitation.fill("Autoria. Fonte preservada no retorno. 2026.");
    await sourceUrl.fill("https://example.com/fonte-preservada");
    await saveSource.click();

    await expect(page.getByText(/Confirme novamente para consultar o mesmo requestId/u))
      .toBeVisible();
    await expectReturnRefreshesDeferred();
    await navigateToAuthoringArea(page, "structure");
    await expect(page.locator(".course-authoring-surface"))
      .toHaveAttribute("data-section", "sources");
    await expect(sourceId).toHaveValue(generatedSourceId);
    await expect(sourceTitle).toHaveValue("Fonte preservada no retorno");
    await expect(sourceCitation).toHaveValue("Autoria. Fonte preservada no retorno. 2026.");
    await expect(sourceUrl).toHaveValue("https://example.com/fonte-preservada");

    await saveSource.click();
    await expect(sourceId).toHaveCount(0);
    for (let pageIndex = 0; pageIndex < 6; pageIndex += 1) {
      await page.getByRole("button", { name: "Carregar mais fontes", exact: true }).click();
    }
    await expect(page.getByRole("button", {
      name: "Abrir fonte: Fonte preservada no retorno",
      exact: true
    })).toBeVisible();
    const sourceMutations = await page.evaluate(() =>
      globalThis.__courseAuthoringHarness.probe.sourceMutations);
    expect(sourceMutations).toHaveLength(2);
    expect(sourceMutations[1].requestId).toBe(sourceMutations[0].requestId);
    expect(sourceMutations[1].command).toEqual(sourceMutations[0].command);
    expect(clientErrors).toEqual([]);
  });

  test("Variantes confirma a mesma desvinculação após commit com resposta ambígua", async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 820 });
    await mountCourseAuthoring(page, {
      hash: `#/authoring/courses/${COURSE_IDS[0]}?section=research`,
      variantMutationScenario: "ambiguous-once"
    });

    await page.getByRole("button", { name: "Comparar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Comparação", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Desvincular", exact: true }).first().click();
    await page.getByRole("alertdialog").getByRole("button", {
      name: "Desvincular",
      exact: true
    }).click();
    await expect(page.getByText(/Tente novamente para confirmar a mesma operação/u))
      .toBeVisible();

    const retryButton = page.getByRole("button", { name: "Desvincular", exact: true }).first();
    await retryButton.click();
    await page.getByRole("alertdialog").getByRole("button", {
      name: "Desvincular",
      exact: true
    }).click();
    await expect(page.getByRole("heading", { name: "Variantes", exact: true })).toBeVisible();

    const probe = await page.evaluate(() => globalThis.__courseAuthoringHarness.probe);
    expect(probe.variantMutations).toHaveLength(2);
    expect(probe.variantAppliedMutations).toBe(1);
    expect(probe.variantMutations[1].requestId).toBe(probe.variantMutations[0].requestId);
    expect(probe.variantMutations[1].command).toEqual(probe.variantMutations[0].command);
    expect(probe.variantMutations[0].command.type).toBe("detach_comparison_variant");
  });

  for (const width of [360, 390, 430, 1280]) {
    test(`Fontes pagina 60 registros e preserva detalhe legível em ${width} px`, async ({
      page
    }, testInfo) => {
      const clientErrors = captureClientErrors(page);
      await page.setViewportSize({ width, height: width < 600 ? 820 : 900 });
      const sourcesHash = `#/authoring/courses/${COURSE_IDS[0]}?section=sources`;
      await mountCourseAuthoring(page, { cardinality: "many", hash: sourcesHash });

      await expect(page.locator(".course-authoring-course-header h1")).toHaveText("Fontes");
      await expect(page.locator(".course-source-card")).toHaveCount(10);
      await page.getByRole("button", { name: "Carregar mais fontes" }).click();
      await expect(page.locator(".course-source-card")).toHaveCount(20);
      await page.getByRole("button", { name: "Carregar mais fontes" }).click();
      await expect(page.locator(".course-source-card")).toHaveCount(30);
      await page.getByRole("button", { name: "Carregar mais fontes" }).click();
      await expect(page.locator(".course-source-card")).toHaveCount(40);
      await page.getByRole("button", { name: "Carregar mais fontes" }).click();
      await expect(page.locator(".course-source-card")).toHaveCount(50);
      await page.getByRole("button", { name: "Carregar mais fontes" }).click();
      await expect(page.locator(".course-source-card")).toHaveCount(60);
      await expect(page.getByRole("button", {
        name: "Abrir fonte: Fonte verificável 1",
        exact: true
      })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.getByRole("button", {
        name: "Abrir fonte: Fonte verificável 1",
        exact: true
      }).click();
      await expect(page.locator("#course-source-detail-title")).toHaveText(
        "Fonte verificável 1"
      );
      await expect(page.getByText("Capítulo 2, seção 3 · Páginas 10–12", {
        exact: true
      })).toBeVisible();
      await expect(page.getByText("Trecho mínimo para conferência.", {
        exact: true
      })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Observação", exact: true }))
        .toBeVisible();
      if (width === 390) {
        await page.getByRole("button", { name: "Revisar âncora", exact: true }).click();
        const humanLocator = page.getByLabel("Localizador para pessoas");
        await expect(humanLocator).toHaveValue("Capítulo 2, seção 3");
        await humanLocator.fill("Capítulo 2, seção 4");
        await page.getByRole("button", { name: "Salvar âncora", exact: true }).click();
        await expect(page.getByText("Capítulo 2, seção 4 · Páginas 10–12", {
          exact: true
        })).toBeVisible();
        const anchorMutation = await page.evaluate(() =>
          globalThis.__courseAuthoringHarness.probe.sourceMutations.at(-1)
        );
        expect(anchorMutation.command).toMatchObject({
          type: "save_anchor",
          anchorId: "anchor-source-01",
          humanLocator: "Capítulo 2, seção 4",
          selector: { kind: "page_range", startPage: 10, endPage: 12 }
        });
        const observationForm = page.locator('[data-source-form="observation"]');
        await observationForm.getByLabel("Tipo").selectOption("contestation");
        await observationForm.getByLabel("Alvo").selectOption("anchor-source-01");
        await observationForm.getByRole("textbox", {
          name: "Observação",
          exact: true
        }).fill(
          "Esta Âncora não sustenta a interpretação apresentada."
        );
        await observationForm.getByRole("button", {
          name: "Salvar observação",
          exact: true
        }).click();
        await expect(page.getByText(
          "Esta Âncora não sustenta a interpretação apresentada.",
          { exact: true }
        )).toBeVisible();
        const mutation = await page.evaluate(() =>
          globalThis.__courseAuthoringHarness.probe.annotationMutations.at(-1)
        );
        expect(mutation.command).toMatchObject({
          type: "create_anchored_annotation",
          target: { kind: "source_anchor", id: "anchor-source-01" },
          category: "possible_error"
        });
      }
      await expectNoHorizontalOverflow(page);

      await page.screenshot({
        path: testInfo.outputPath(`course-sources-${width}.png`),
        fullPage: true,
        animations: "disabled"
      });
      const catalogReads = await page.evaluate(() => globalThis.__courseAuthoringHarness.probe.sourceReads
        .filter(({ mode }) => mode === "catalog")
        .map(({ limit, cursor }) => ({ limit, cursor })));
      expect(catalogReads).toEqual([
        { limit: 10, cursor: null },
        { limit: 10, cursor: "source-page-10" },
        { limit: 10, cursor: "source-page-20" },
        { limit: 10, cursor: "source-page-30" },
        { limit: 10, cursor: "source-page-40" },
        { limit: 10, cursor: "source-page-50" },
        ...(width === 390 ? [{ limit: 10, cursor: null }] : [])
      ]);
      expect(clientErrors).toEqual([]);
    });
  }
});

test.describe("aceite focal do shell simples da Autoria", () => {
  const layouts = [
    { width: 360, height: 780 },
    { width: 390, height: 820 },
    { width: 430, height: 860 },
    { width: 1280, height: 900 }
  ];
  const remainingAreas = [
    { section: "overview", heading: "Visão geral", ready: "[data-course-authoring-task-list]" },
    { section: "content", heading: "Conteúdo", ready: "[data-inspection-study-unit]" },
    {
      section: "parameters",
      heading: "Parâmetros e componentes",
      ready: ".course-design-parameter"
    },
    { section: "sources", heading: "Fontes", ready: ".course-source-card" },
    {
      section: "review",
      heading: "Revisão",
      ready: ".course-audit-panel"
    },
    { section: "research", heading: "Variantes e pesquisa", ready: ".course-variants" },
    { section: "people", heading: "Pessoas e acesso", ready: ".course-authoring-people" }
  ];

  for (const colorScheme of ["light", "dark"]) {
    for (const { width, height } of layouts) {
      test(`${width} px em tema ${colorScheme} preserva navegação, toque e rolagem`, async ({
        page
      }, testInfo) => {
        test.setTimeout(120_000);
        const clientErrors = captureClientErrors(page);
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await page.setViewportSize({ width, height });
        const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
        await mountCourseAuthoring(page, { cardinality: "many", hash });

        await expect.poll(() => page.evaluate(() =>
          document.documentElement.dataset.colorMode)).toBe(colorScheme);
        await expect(page.locator(
          "#app-root > #course-authoring-root.course-authoring-root"
        )).toHaveCount(1);

        await expectResponsiveAuthoringNavigation(page, width);
        await expectNoHorizontalOverflow(page);
        await expectAuthoringOwnsVerticalScroll(page);
        await expectVisibleTouchTargets(page);
        await expect.poll(() => page.locator(".course-authoring-root").evaluate(
          (element) => element.scrollTop
        )).toBeLessThanOrEqual(1);
        if ((width === 390 && colorScheme === "light") ||
            (width === 1280 && colorScheme === "dark")) {
          await page.screenshot({
            path: testInfo.outputPath(`authoring-planning-${width}-${colorScheme}.png`),
            animations: "disabled"
          });
        }
        await expectFinalPlanningContentReachable(page);

        for (const area of remainingAreas) {
          await navigateToAuthoringArea(page, area.section, width);
          await expect(page.locator(".course-authoring-surface")).toHaveAttribute(
            "data-section",
            area.section
          );
          await expect(page.locator(".course-authoring-surface")).toHaveAttribute(
            "aria-busy",
            "false"
          );
          await expect(page.locator(".course-authoring-course-header h1")).toHaveText(
            area.heading
          );
          await expect(page.locator(area.ready).first()).toBeVisible();
          await expect.poll(() => page.locator(".course-authoring-root").evaluate(
            (element) => element.scrollTop
          )).toBeLessThanOrEqual(1);
          await expectResponsiveAuthoringNavigation(page, width);
          await expectNoHorizontalOverflow(page);
          await expectVisibleTouchTargets(page);

          if (area.section === "parameters" && width === 1280 && colorScheme === "light") {
            await page.screenshot({
              path: testInfo.outputPath("authoring-parameters-1280-light.png"),
              animations: "disabled"
            });
          }
          if (area.section === "research") {
            await page.getByRole("button", { name: "Pesquisa", exact: true }).click();
            await expect(page.locator(".course-analytics")).toBeVisible();
          }
          if (area.section === "research" && width === 1280 && colorScheme === "dark") {
            await page.screenshot({
              path: testInfo.outputPath("authoring-research-1280-dark.png"),
              animations: "disabled"
            });
          }

          if (area.section === "content") {
            const chatAssistance = page.locator("[data-inspection-study-unit]").first().getByRole(
              "button",
              {
                name: "Assistência por IA",
                exact: true
              }
            );
            await expect(chatAssistance).toBeVisible();
            await expect(chatAssistance).toHaveAttribute("title", "Assistência por IA");
            if (width === 390 && colorScheme === "dark") {
              await page.screenshot({
                path: testInfo.outputPath("authoring-inspection-390-dark.png"),
                animations: "disabled"
              });
            }
          }
          if (area.section === "sources") {
            await page.getByRole("button", {
              name: "Abrir fonte: Fonte verificável 1",
              exact: true
            }).click();
            await expect(page.locator("#course-source-detail-title")).toHaveText(
              "Fonte verificável 1"
            );
            await expect(page.getByRole("button", {
              name: /Trabalhar com o ChatGPT/u
            })).toHaveCount(0);
            await expectSourceMetadataDoesNotOverlap(page);
            await expectNoHorizontalOverflow(page);
            await expectVisibleTouchTargets(page);
            if (width === 1280 && colorScheme === "light") {
              await page.screenshot({
                path: testInfo.outputPath("authoring-sources-1280-light.png"),
                animations: "disabled"
              });
            }
          }
          await expectAuthoringAreaEndReachable(page);
        }
        expect(clientErrors).toEqual([]);
      });
    }
  }

  test("destinos progressivos cabem no shell, fecham fora e devolvem foco com Esc", async ({
    page
  }) => {
    const clientErrors = captureClientErrors(page);
    await page.setViewportSize({ width: 390, height: 820 });
    const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
    await mountCourseAuthoring(page, { cardinality: "many", hash });

    const menu = page.locator(".course-authoring-task-menu");
    const trigger = menu.locator(":scope > summary");
    await expect(trigger).toHaveCount(1);
    await expect(trigger).toHaveAccessibleName("Abrir tarefas do Curso");
    await expect(trigger).toHaveAttribute("title", "Tarefas");
    await trigger.click();
    await expect(menu).toHaveAttribute("open", "");
    await expect(menu.locator(":scope > nav")).toBeVisible();
    await expect(menu.locator(":scope > nav > a")).toHaveCount(8);
    expect(await menu.locator(":scope > nav").evaluate((content) => {
      const surface = content.closest(".course-authoring-surface");
      const contentRect = content.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      return contentRect.left >= surfaceRect.left - 1 &&
        contentRect.right <= surfaceRect.right + 1;
    })).toBe(true);
    await page.keyboard.press("Escape");
    await expect(menu).not.toHaveAttribute("open", "");
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(menu).toHaveAttribute("open", "");
    await page.mouse.click(4, 4);
    await expect(menu).not.toHaveAttribute("open", "");

    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveAttribute("open", "");
    await page.keyboard.press("Escape");
    await expect(menu).not.toHaveAttribute("open", "");
    await expect(trigger).toBeFocused();
    expect(clientErrors).toEqual([]);
  });

  test("rerender preserva a posição e mudança de área inicia o conteúdo no topo", async ({
    page
  }) => {
    const clientErrors = captureClientErrors(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
    await mountCourseAuthoring(page, {
      cardinality: "many",
      hash,
      planningScenario: "two-parts"
    });
    const root = page.locator(".course-authoring-root");

    const beforeRefresh = await root.evaluate((element) => {
      element.scrollTop = Math.min(480, element.scrollHeight - element.clientHeight);
      return element.scrollTop;
    });
    expect(beforeRefresh).toBeGreaterThan(100);
    await page.evaluate(() => globalThis.__courseAuthoringHarness.surface.refresh());
    await expect(page.locator(".course-authoring-surface")).toHaveAttribute(
      "aria-busy",
      "false"
    );
    await expect.poll(() => root.evaluate((element) => element.scrollTop))
      .toBe(beforeRefresh);

    await navigateToAuthoringArea(page, "parameters");
    await expect(page.getByRole("heading", { name: "Parâmetros", exact: true })).toBeVisible();
    await expect.poll(() => root.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
    expect(clientErrors).toEqual([]);
  });

  test("Inspeção observa o host rolável e remove o listener ao sair e fechar", async ({
    page
  }) => {
    const clientErrors = captureClientErrors(page);
    await page.setViewportSize({ width: 390, height: 820 });
    const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
    await mountCourseAuthoring(page, { cardinality: "many", hash });
    await page.evaluate(() => {
      const root = document.querySelector(".course-authoring-root");
      const originalAdd = root.addEventListener.bind(root);
      const originalRemove = root.removeEventListener.bind(root);
      const probe = { adds: 0, removes: 0, listeners: new Set() };
      root.addEventListener = (type, listener, options) => {
        if (type === "scroll" && !probe.listeners.has(listener)) {
          probe.listeners.add(listener);
          probe.adds += 1;
        }
        return originalAdd(type, listener, options);
      };
      root.removeEventListener = (type, listener, options) => {
        if (type === "scroll" && probe.listeners.delete(listener)) probe.removes += 1;
        return originalRemove(type, listener, options);
      };
      globalThis.__authoringRootScrollProbe = probe;
    });
    const scrollListeners = () => page.evaluate(() => ({
      adds: globalThis.__authoringRootScrollProbe.adds,
      removes: globalThis.__authoringRootScrollProbe.removes,
      active: globalThis.__authoringRootScrollProbe.listeners.size
    }));

    await navigateToAuthoringArea(page, "inspection");
    await expect(page.locator('section[aria-label="Unidades de estudo"]')).toBeVisible();
    await expect.poll(scrollListeners).toEqual({ adds: 1, removes: 0, active: 1 });

    await navigateToAuthoringArea(page, "planning");
    await expect(page.locator(".course-authoring-course-header h1")).toHaveText("Planejamento");
    await expect.poll(scrollListeners).toEqual({ adds: 1, removes: 1, active: 0 });

    await navigateToAuthoringArea(page, "inspection");
    await expect(page.locator('section[aria-label="Unidades de estudo"]')).toBeVisible();
    await expect.poll(scrollListeners).toEqual({ adds: 2, removes: 1, active: 1 });
    await page.evaluate(() => globalThis.__courseAuthoringHarness.surface.close());
    await expect.poll(scrollListeners).toEqual({ adds: 2, removes: 2, active: 0 });
    expect(clientErrors).toEqual([]);
  });

  test("Mais mantém ferramentas de Parte acessíveis e cancelar união não grava", async ({
    page
  }) => {
    const clientErrors = captureClientErrors(page);
    await page.setViewportSize({ width: 390, height: 820 });
    const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
    await mountCourseAuthoring(page, {
      cardinality: "many",
      hash,
      planningScenario: "two-parts"
    });

    const secondPart = page.locator(
      '[data-course-authoring-part-card="70000000-0000-4000-8000-000000000008"]'
    );
    const tools = secondPart.locator(".course-authoring-part-tools");
    const more = tools.locator(":scope > summary");
    await more.click();
    await expect(tools).toHaveAttribute("open", "");
    await expect(tools.getByRole("button", { name: "Mover Parte para cima" })).toBeVisible();
    await expect(tools.getByRole("button", { name: "Editar Parte" })).toBeVisible();
    await expect(tools.getByRole("button", { name: "Unir com Relações iniciais" })).toBeVisible();
    await expect(tools.getByRole("button", { name: "Remover Parte" })).toBeVisible();

    await tools.getByRole("button", { name: "Unir com Relações iniciais" }).click();
    await expect(secondPart.getByRole("alertdialog")).toBeVisible();
    expect(await page.evaluate(() =>
      globalThis.__courseAuthoringHarness.probe.planMutations)).toEqual([]);
    await secondPart.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(secondPart.getByRole("alertdialog")).toHaveCount(0);
    expect(await page.evaluate(() =>
      globalThis.__courseAuthoringHarness.probe.planMutations)).toEqual([]);
    await expect(more).toBeFocused();
    expect(clientErrors).toEqual([]);
  });

  test("objetivo extenso permanece inteiro, legível e alcançável em 360 px", async ({ page }) => {
    const clientErrors = captureClientErrors(page);
    const objective = [
      "Compreender como nomes, endereços e evidências se relacionam em diferentes contextos,",
      "comparar explicações concorrentes, explicitar limites e exceções,",
      "justificar cada conclusão com fontes verificáveis e aplicar os critérios em casos novos",
      "sem confundir associação, sequência temporal e causalidade."
    ].join(" ").repeat(3);
    await page.setViewportSize({ width: 360, height: 780 });
    const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
    await mountCourseAuthoring(page, { cardinality: "many", hash, objective });

    const renderedObjective = page.locator(
      ".course-authoring-planning-details.is-objective .course-authoring-planning-copy > p"
    );
    await expect(renderedObjective).toHaveText(objective);
    expect(await renderedObjective.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        overflow: style.overflow,
        lineClamp: style.webkitLineClamp,
        fullyLaidOut: element.scrollHeight <= element.clientHeight + 1
      };
    })).toEqual({ overflow: "visible", lineClamp: "none", fullyLaidOut: true });
    await renderedObjective.scrollIntoViewIfNeeded();
    await expect(renderedObjective).toBeInViewport();
    await expectNoHorizontalOverflow(page);
    expect(clientErrors).toEqual([]);
  });

  test("sem Microssequência orienta vínculo e nunca abre compositor ou materialização", async ({ page }) => {
    const clientErrors = captureClientErrors(page);
    await page.setViewportSize({ width: 430, height: 860 });
    const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
    await mountCourseAuthoring(page, {
      cardinality: "many",
      hash,
      planningScenario: "zero-microsequences"
    });

    await expect(page.getByRole("heading", { name: "Vincule uma microssequência" }))
      .toBeVisible();
    await expect(page.locator('[data-course-authoring-action="materialize-part"]'))
      .toHaveCount(0);
    await expect(page.locator('[data-course-authoring-action="prepare-structure"]'))
      .toHaveCount(0);

    await page.getByRole("region", { name: "Vincule uma microssequência" })
      .getByRole("button", { name: "Vincular microssequência existente" }).click();
    const emptyAssignment = page.locator(".course-authoring-assignment-empty");
    await expect(emptyAssignment).toContainText("Nenhuma microssequência disponível.");
    await expect(page.getByRole("dialog", { name: "Trabalhar no ChatGPT" }))
      .toHaveCount(0);
    const requests = await page.evaluate(() =>
      globalThis.__courseAuthoringHarness.probe.materializationRequests);
    expect(requests).toEqual([]);
    expect(await page.evaluate(() =>
      globalThis.__courseAuthoringHarness.probe.planMutations)).toEqual([]);
    expect(clientErrors).toEqual([]);
  });
});

test.describe("entrada e Conteúdo cotidiano da Autoria", () => {
  const layouts = [
    { width: 360, height: 780 },
    { width: 390, height: 820 },
    { width: 430, height: 860 },
    { width: 1280, height: 900 }
  ];

  for (const colorScheme of ["light", "dark"]) {
    for (const { width, height } of layouts) {
      test(`${width} px em tema ${colorScheme} mantém lista e tarefas legíveis`, async ({
        page
      }, testInfo) => {
        const clientErrors = captureClientErrors(page);
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await page.setViewportSize({ width, height });
        await mountCourseAuthoring(page, { cardinality: "many" });

        await expect(page.getByRole("heading", { name: "Meus cursos", exact: true }))
          .toBeVisible();
        await expect(page.getByText("Seu Curso", { exact: true })).toHaveCount(0);
        await expectNoHorizontalOverflow(page);
        await expectVisibleTouchTargets(page);
        await page.screenshot({
          path: testInfo.outputPath(`authoring-list-${width}-${colorScheme}.png`),
          fullPage: true,
          animations: "disabled"
        });

        await page.locator(".course-authoring-course-card").first().click();
        await expect(page.getByRole("heading", { name: "Conteúdo", exact: true }))
          .toBeVisible();
        await expect(page.locator("[data-inspection-study-unit]")).toHaveCount(12);
        await expect(page.locator(".course-authoring-task-menu > summary"))
          .toHaveAccessibleName("Abrir tarefas do Curso");
        await expectNoHorizontalOverflow(page);
        await expectVisibleTouchTargets(page);
        await page.screenshot({
          path: testInfo.outputPath(`authoring-content-${width}-${colorScheme}.png`),
          fullPage: true,
          animations: "disabled"
        });
        expect(clientErrors).toEqual([]);
      });
    }
  }
});

test("Planejamento substitui o conjunto completo de Fontes sem formulário JSON", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 820 });
  const planningHash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
  await mountCourseAuthoring(page, { cardinality: "many", hash: planningHash });

  const planReferences = page.locator(".course-authoring-plan-items");
  await planReferences.locator(":scope > summary").click();
  await expect(planReferences).toHaveAttribute("open", "");
  const sourceTrigger = planReferences.getByRole("button", {
    name: "Definir fontes do item"
  }).first();
  await sourceTrigger.click();
  const targetDialog = page.getByRole("dialog", { name: /Fontes de Relação entre nomes/u });
  await expect(targetDialog).toBeVisible();
  await expect(targetDialog).toBeFocused();
  const targetGeometry = () => targetDialog.evaluate((dialog) => {
    const sheet = dialog.parentElement;
    const header = dialog.querySelector(":scope > header");
    const title = header.querySelector("h2");
    const close = header.querySelector('button[data-source-action="close-target"]');
    const body = dialog.querySelector(":scope > .course-source-target-body");
    const sheetRect = sheet.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const closeRect = close.getBoundingClientRect();
    return {
      sheetHeight: sheetRect.height,
      titleCenterDelta: Math.abs(
        titleRect.left + titleRect.width / 2 -
        (headerRect.left + headerRect.width / 2)
      ),
      closeWidth: closeRect.width,
      closeHeight: closeRect.height,
      bodyOverflowY: getComputedStyle(body).overflowY,
      sheetOverflow: getComputedStyle(sheet).overflow
    };
  });
  const initialTargetGeometry = await targetGeometry();
  expect(initialTargetGeometry.titleCenterDelta).toBeLessThanOrEqual(1);
  expect(Math.abs(
    initialTargetGeometry.closeWidth - initialTargetGeometry.closeHeight
  )).toBeLessThanOrEqual(1);
  expect(initialTargetGeometry.bodyOverflowY).toBe("auto");
  expect(initialTargetGeometry.sheetOverflow).toBe("hidden");
  await page.keyboard.press("Shift+Tab");
  expect(await targetDialog.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Tab");
  await expect(targetDialog.getByRole("button", { name: "Fechar" })).toBeFocused();
  await expect(page.locator(".course-source-target-link")).toHaveCount(1);
  await page.getByRole("button", {
    name: "Vincular fonte: Fonte verificável 2",
    exact: true
  }).click();
  await expect(page.locator(".course-source-target-link")).toHaveCount(2);
  expect((await targetGeometry()).sheetHeight).toBe(initialTargetGeometry.sheetHeight);
  await page.getByRole("checkbox", { name: "Páginas 11–13" }).check();
  await page.keyboard.press("Escape");
  const discard = page.getByRole("alertdialog", { name: "Descartar alterações?" });
  await expect(discard).toBeVisible();
  await expect(discard).toContainText("ainda não foram salvas");
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.sourceMutations)).toEqual([]);
  await discard.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(discard).toHaveCount(0);
  await expect(targetDialog.getByRole("button", { name: "Fechar" })).toBeFocused();
  await expect(page.locator(".course-source-target-link")).toHaveCount(2);

  await page.locator(".course-source-target-overlay").click({ position: { x: 2, y: 2 } });
  await expect(discard).toBeVisible();
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.sourceMutations)).toEqual([]);
  await discard.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(targetDialog).toHaveCount(0);
  await expect(planReferences).toHaveAttribute("open", "");
  await expect(sourceTrigger).toBeFocused();

  await sourceTrigger.click();
  await expect(targetDialog).toBeVisible();
  await page.getByRole("button", {
    name: "Vincular fonte: Fonte verificável 2",
    exact: true
  }).click();
  await expect(page.locator(".course-source-target-link")).toHaveCount(2);
  await page.getByRole("checkbox", { name: "Páginas 11–13" }).check();
  await expect(page.getByRole("dialog")).not.toContainText("JSON");
  await page.getByRole("button", { name: "Salvar conjunto completo" }).click();
  await expect.poll(() => page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.sourceMutations.length)).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const writes = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.sourceMutations);
  expect(writes).toHaveLength(1);
  expect(writes[0].command).toEqual({
    type: "set_target_sources",
    targetKind: "plan_item",
    targetId: "79000000-0000-4000-8000-000000000019",
    expectedTargetVersion: 1,
    sourceLinks: [{
      sourceId: "source-01",
      sourceRevision: 1,
      relation: "supported_by",
      anchors: [{ anchorId: "anchor-source-01", anchorRevision: 1 }]
    }, {
      sourceId: "source-02",
      sourceRevision: 1,
      relation: "supported_by",
      anchors: [{ anchorId: "anchor-source-02", anchorRevision: 1 }]
    }]
  });
  expect(clientErrors).toEqual([]);
});

test("Inspeção substitui o conjunto completo da versão exata da Unidade", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 820 });
  const inspectionHash = `#/authoring/courses/${COURSE_IDS[0]}?section=content`;
  await mountCourseAuthoring(page, { cardinality: "many", hash: inspectionHash });

  const details = page.locator(
    'summary[aria-label="Abrir detalhes de Exemplo guiado com diagrama"]'
  ).locator("..");
  const detailsTrigger = details.locator(":scope > summary");
  await detailsTrigger.click();
  await expect(details).toHaveAttribute("open", "");
  const sourcesAction = details.getByRole("button", { name: "Fontes", exact: true });
  await sourcesAction.click();
  await expect(details).not.toHaveAttribute("open", "");
  const targetDialog = page.getByRole("dialog", {
    name: "Fontes de Exemplo guiado com diagrama"
  });
  await expectModalDialogOwnsTopLayer(targetDialog);
  await page.getByRole("button", {
    name: "Vincular fonte: Fonte verificável 1",
    exact: true
  }).click();
  await page.getByRole("checkbox", {
    name: "Capítulo 2, seção 3 · Páginas 10–12"
  }).check();
  await page.getByRole("button", { name: "Salvar conjunto completo" }).click();
  await expect.poll(() => page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.sourceMutations.length)).toBe(1);
  await expect(targetDialog).toHaveCount(0);
  await expect(details).toHaveAttribute("open", "");
  await expect(sourcesAction).toBeFocused();

  const command = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.sourceMutations[0].command);
  expect(command).toEqual({
    type: "set_target_sources",
    targetKind: "study_unit",
    targetId: "study-unit-01",
    expectedTargetVersion: 1,
    sourceLinks: [{
      sourceId: "source-01",
      sourceRevision: 1,
      relation: "supported_by",
      anchors: [{ anchorId: "anchor-source-01", anchorRevision: 1 }]
    }]
  });
  expect(clientErrors).toEqual([]);
});

for (const width of [360, 390, 430, 1280]) {
  test(`Observações mantêm caixa de entrada, filtros e rota própria sem overflow em ${width} px`, async ({
    page
  }, testInfo) => {
    const clientErrors = captureClientErrors(page);
    await page.setViewportSize({ width, height: width < 600 ? 820 : 900 });
    const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=review`;
    await mountCourseAuthoring(page, { cardinality: "many", hash });

    await expect(page.locator(".course-authoring-surface")).toHaveAttribute(
      "data-section",
      "review"
    );
    await expectResponsiveAuthoringNavigation(page, width);
    await expect(page.getByRole("heading", { name: "Observações", exact: true })).toBeVisible();
    await expect(page.getByText("Inbox única do Curso", { exact: true })).toBeVisible();
    await expect(page.getByText(
      "A relação entre os conjuntos precisa de mais contexto.",
      { exact: true }
    )).toBeVisible();
    await page.getByText("Filtros e origens", { exact: true }).click();
    await expect(page.getByLabel("Assunto").locator("option")).toContainText([
      "Todos", "Evidências", "Relações"
    ]);
    await expect(page.locator(
      '.course-observations-filters select[name="hierarchy"] option'
    ).filter({ hasText: "Base conceitual" }).first()).toBeAttached();
    await expectNoHorizontalOverflow(page);
    const undersized = await page.locator(
      ".course-observations-panel :is(button, select, summary, a)"
    ).evaluateAll((nodes) => nodes.filter((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && rect.width > 0 && rect.height > 0 && rect.height < 43;
    }).map((node) => ({ tag: node.tagName, text: node.textContent.trim(), height: node.getBoundingClientRect().height })));
    expect(undersized).toEqual([]);

    await page.screenshot({
      path: testInfo.outputPath(`course-observations-${width}.png`),
      animations: "disabled"
    });
    expect(clientErrors).toEqual([]);
  });
}

for (const width of [360, 390, 430, 1280]) {
  test(`Surface encaminha auditRunId estrito à área de Auditoria em ${width} px`, async ({
    page
  }, testInfo) => {
    const clientErrors = captureClientErrors(page);
    await page.setViewportSize({ width, height: width < 600 ? 820 : 900 });
    const auditRunId = "85000000-0000-4000-8000-000000000005";
    const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=review&auditRunId=${auditRunId}`;
    await mountCourseAuthoring(page, { cardinality: "many", hash });

    await expect(page.locator(".course-authoring-surface")).toHaveAttribute(
      "data-section",
      "review"
    );
    await expectResponsiveAuthoringNavigation(page, width);
    const auditArea = page.locator('.course-authoring-task-menu a[data-section="review"]');
    await expect(auditArea).toHaveClass(/\bis-active\b/u);
    await expect(auditArea).toContainText("Revisão");
    await expect(page.locator(`[data-audit-run-detail-id="${auditRunId}"]`)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Auditoria ·/u })).toBeVisible();
    const auditReads = await page.evaluate(() =>
      globalThis.__courseAuthoringHarness.probe.auditReads);
    expect(auditReads).toHaveLength(1);
    expect(auditReads[0].options.query).toEqual({
      mode: "detail",
      targetStudyUnitId: null,
      findingId: null,
      correctionId: null,
      auditRunId,
      states: [],
      dimensions: [],
      severities: [],
      annotationIds: []
    });
    if (width === 390) {
      await expect(page.getByRole("button", {
        name: "Trabalhar com o ChatGPT sobre esta rodada de auditoria"
      })).toHaveCount(0);
      await expect(page.getByRole("dialog", { name: "Trabalhar no ChatGPT" }))
        .toHaveCount(0);
      expect(await page.evaluate(() =>
        globalThis.__courseAuthoringHarness.probe.auditMutations)).toEqual([]);
    }
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`course-audit-run-surface-${width}.png`),
      fullPage: true,
      animations: "disabled"
    });
    expect(clientErrors).toEqual([]);
  });
}

test("Observações em 390 px criam por contexto, filtram e abrem deep link corrigível", async ({
  page
}) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 820 });
  const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=review`;
  await mountCourseAuthoring(page, { cardinality: "many", hash });

  await page.getByText("Nova observação autoral", { exact: true }).click();
  await page.locator('.course-observation-author-composer select[name="target"]')
    .selectOption({ label: "Base conceitual · Módulo" });
  await page.locator('.course-observation-author-composer select[name="category"]')
    .selectOption("suggestion");
  await page.locator(".course-observation-author-composer textarea")
    .fill("Observação autoral situada no Módulo.");
  await expect(page.locator("#course-author-observation-count"))
    .toHaveText("37/2.000 caracteres · 40 B/16 KiB");
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByText("Observação autoral situada no Módulo.", { exact: true }))
    .toBeVisible();

  const creation = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.annotationMutations[0]);
  expect(creation.expectedCourseRevision).toBe(5);
  expect(creation.command.target).toEqual({ kind: "module", id: "module-a" });
  expect(creation.command.type).toBe("create_anchored_annotation");

  await page.getByText("Filtros e origens", { exact: true }).click();
  await page.getByLabel("Origem").selectOption("author");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.locator(".course-observation-card")).toHaveCount(1);
  await page.getByRole("link", { name: "Ver detalhe" }).click();
  await expect(page).toHaveURL(new RegExp(
    `#\\/authoring\\/courses\\/${COURSE_IDS[0]}\\?section=review&annotationId=`
  ));
  await expect(page.getByText("Detalhe contextual", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir Módulo" })).toBeVisible();
  await expect(page.getByText("Relações", { exact: true })).toBeVisible();
  await expect(page.getByText("Evidências", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

test("Observações confirmam a escrita uma vez quando a atualização da lista falha", async ({
  page
}) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 820 });
  const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=review`;
  await mountCourseAuthoring(page, {
    cardinality: "many",
    hash,
    annotationMutationScenario: "reconciliation-fails-once"
  });

  await page.getByText("Nova observação autoral", { exact: true }).click();
  const composer = page.locator(".course-observation-author-composer");
  await composer.locator('select[name="target"]')
    .selectOption({ label: "Base conceitual · Módulo" });
  await composer.locator('select[name="category"]').selectOption("suggestion");
  await composer.locator("textarea").fill("Argumento confirmado antes da falha de leitura.");
  await composer.getByRole("button", { name: "Registrar", exact: true }).click();

  await expect(page.getByRole("status").filter({
    hasText: "Observação registrada. A lista será atualizada na próxima sincronização."
  })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "A conexão caiu" })).toHaveCount(0);
  await expect(page.getByText(/confirmar exatamente a mesma operação/u)).toHaveCount(0);
  await expect(composer.locator("textarea")).toHaveValue("");
  await expect.poll(() => page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.annotationMutations.length)).toBe(1);

  await page.getByRole("button", { name: "Atualizar observações" }).click();
  await expect(page.getByText(
    "Argumento confirmado antes da falha de leitura.",
    { exact: true }
  )).toBeVisible();
  await expect(page.getByText(/será atualizada na próxima sincronização/u)).toHaveCount(0);
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.annotationMutations.length)).toBe(1);
  expect(clientErrors).toEqual([]);
});

test("Inspeção abre contagem contextual sob demanda e não faz N+1 decorativo", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 820 });
  const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=content`;
  await mountCourseAuthoring(page, { cardinality: "many", hash });
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.annotationReads.length)).toBe(0);

  const details = page.locator(".course-inspection-item-details").first();
  const detailsTrigger = details.locator(":scope > summary");
  await detailsTrigger.click();
  await expect(details).toHaveAttribute("open", "");
  const observationsAction = details.getByRole("button", {
    name: "Observações",
    exact: true
  });
  await observationsAction.click();
  await expect(details).not.toHaveAttribute("open", "");
  const observationDialog = page.getByRole("dialog", { name: "Observações da Unidade" });
  await expectModalDialogOwnsTopLayer(observationDialog);
  await expect(page.getByText(
    "A relação entre os conjuntos precisa de mais contexto.",
    { exact: true }
  )).toBeVisible();
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.annotationReads.length)).toBe(1);
  await page.getByRole("textbox", { name: "Observação" }).fill("😀a");
  await expect(page.locator("#study-observation-counter"))
    .toHaveText("2/2.000 caracteres · 5 B/16 KiB");
  await page.getByRole("button", { name: "Enviar observação" }).click();
  await expect(page.getByText("😀a", { exact: true })).toBeVisible();
  await observationDialog
    .getByRole("button", { name: "Fechar" }).click();
  const observationsWithCount = page.getByRole("button", {
    name: "Observações · 2",
    exact: true
  }).first();
  await expect(observationDialog).toHaveCount(0);
  await expect(details).toHaveAttribute("open", "");
  await expect(observationsWithCount).toBeFocused();
  await expect(observationsWithCount).toBeVisible();

  const mutation = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.annotationMutations[0]);
  expect(mutation.expectedCourseRevision).toBe(5);
  expect(mutation.command.target).toEqual({ kind: "study_unit", id: "study-unit-01" });

  await observationsWithCount.click();
  await expect(details).not.toHaveAttribute("open", "");
  await expectModalDialogOwnsTopLayer(observationDialog);
  const withdraw = page.getByRole("button", { name: "Retirar observação", exact: true });
  await withdraw.click();
  const confirmation = page.getByRole("alertdialog", { name: "Retirar observação?" });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toHaveAttribute("aria-modal", "true");
  await expect(page.locator(".study-observation-overlay")).toHaveAttribute("inert", "");
  const bounds = await confirmation.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(820);
  const cancel = confirmation.getByRole("button", { name: "Cancelar", exact: true });
  const confirmWithdrawal = confirmation.getByRole("button", { name: "Retirar", exact: true });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(confirmWithdrawal).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.locator("[data-inspection-confirmation-backdrop]").click({ position: { x: 2, y: 2 } });
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retirar observação", exact: true })).toBeFocused();
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(clientErrors).toEqual([]);
});

test("Inspeção abre o Desenho situado uma vez e oferece retorno visível à Unidade", async ({
  page
}) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 820 });
  const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=content`;
  await mountCourseAuthoring(page, { cardinality: "many", hash });

  const item = page.locator("[data-inspection-study-unit]").first();
  await item.locator(".course-inspection-item-details > summary").click();
  const menu = item.locator(".course-inspection-item-menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Desenho", exact: true }).click();
  await expect(page.getByRole("heading", {
    name: "Cobertura planejada desta Microssequência"
  })).toBeVisible();
  await expect(page.getByText("Não foi possível carregar os itens do Planejamento."))
    .toHaveCount(0);
  await expect(page.getByRole("link", { name: "Voltar à Unidade" })).toBeVisible();
  const probe = await page.evaluate(() => globalThis.__courseAuthoringHarness.probe);
  expect(probe.planReads).toBe(1);
  expect(probe.designReads).toHaveLength(1);

  await page.getByRole("link", { name: "Voltar à Unidade" }).click();
  await expect(page).toHaveURL(new RegExp("section=content&studyUnitId=study-unit-01"));
  await expect(page.getByRole("link", { name: "Desenho", exact: true })).toBeFocused();
  expect(clientErrors).toEqual([]);
});

test("Planejamento explica Conteúdo existente que ainda não está ligado a Partes", async ({
  page
}) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 820 });
  const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
  await mountCourseAuthoring(page, {
    cardinality: "many",
    hash,
    planningScenario: "unlinked-existing"
  });

  const notice = page.locator(".course-authoring-unlinked-content");
  await expect(notice).toContainText("Conteúdo existente ainda não vinculado ao plano");
  await expect(notice).toContainText("60 Unidades permanecem disponíveis em Conteúdo");
  await expect(notice).toContainText("Nada foi removido");
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

for (const width of [360, 390, 430, 1280]) {
  test(`Inspeção virtualiza 60 Unidades de estudo em ${width} px`, async ({ page }, testInfo) => {
    const clientErrors = captureClientErrors(page);
    const colorMode = width === 390 || width === 1280 ? "dark" : "light";
    await page.emulateMedia({ colorScheme: colorMode });
    await page.setViewportSize({ width, height: width < 600 ? 800 : 900 });
    const inspectionHash = `#/authoring/courses/${COURSE_IDS[0]}?section=content`;
    await mountCourseAuthoring(page, { cardinality: "many", hash: inspectionHash });

    await expect(page.locator('section[aria-label="Unidades de estudo"]')).toBeVisible();
    await expect(page.locator("[data-inspection-context-position]")).toHaveText("1/60");
    await expect(page.locator(".course-inspection-sticky-context")).toBeVisible();
    await expect(page.getByLabel("Filtrar por Parte")).toHaveCount(0);
    await expect(page.locator("[data-inspection-jump], [data-inspection-scope]"))
      .toHaveCount(0);
    await expect(page.locator("[data-set-diagram-state=ready]")).toHaveCount(1);
    await expect(page.locator(
      '.package-instance[data-package="aralearn.response.choice"] button'
    ).first()).toBeDisabled();
    await expectNoHorizontalOverflow(page);

    const courseSearch = page.getByRole("combobox", { name: "Ir para" });
    await courseSearch.fill("50");
    await page.locator(
      '[data-inspection-search-option="study_unit:study-unit-50"]'
    ).click();
    await expect(page.locator('[data-inspection-study-unit="study-unit-50"]')).toHaveCount(1);

    await expect(page.locator('[data-inspection-study-unit="study-unit-60"]')).toHaveCount(1);
    expect(await page.locator("[data-inspection-study-unit]").count()).toBeLessThanOrEqual(36);
    const { courseDocumentReads, inspectionReads } = await page.evaluate(() => ({
      courseDocumentReads: globalThis.__courseAuthoringHarness.probe.courseDocumentReads,
      inspectionReads: globalThis.__courseAuthoringHarness.probe.inspectionReads
    }));
    expect(inspectionReads).toHaveLength(3);
    expect(inspectionReads.every(({ limit, maxBytes }) =>
      limit === 12 && maxBytes === 1_500_000)).toBe(true);
    expect(inspectionReads.at(-2)).toMatchObject({
      anchorStudyUnitId: "study-unit-50",
      cursor: null,
      direction: "forward"
    });
    expect(inspectionReads.at(-1)).toMatchObject({
      cursor: { studyUnitId: "study-unit-50" },
      direction: "backward"
    });
    expect(courseDocumentReads).toEqual([{
      courseId: COURSE_IDS[0],
      options: { verifiedRevision: 5 }
    }]);
    await expect(page.locator(".course-inspection-sequence"))
      .toHaveAttribute("aria-label", "Sequência curricular de Unidades");
    expect(await page.locator("[data-inspection-study-unit]").evaluateAll((items) =>
      items.every((item) => item.getAttribute("aria-setsize") === "60" &&
        item.getAttribute("aria-posinset") === item.dataset.inspectionOrdinal &&
        item.querySelector("article")?.getAttribute("aria-labelledby") ===
          item.querySelector("h3")?.id))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.dataset.colorMode)).toBe(colorMode);
    const undersized = await page.locator(
      ".course-authoring-inspection :is(button, select, summary, a)"
    ).evaluateAll((nodes) => nodes.filter((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && rect.width > 0 && rect.height > 0 && rect.height < 43;
    }).map((node) => ({
      tag: node.tagName,
      text: node.textContent.trim(),
      height: node.getBoundingClientRect().height
    })));
    expect(undersized).toEqual([]);
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`course-inspection-${width}.png`),
      animations: "disabled"
    });
    expect(clientErrors).toEqual([]);
  });
}

test("Inspeção atualiza só o trecho ancorado e conserva posição, foco e detalhe", async ({
  page
}) => {
  const clientErrors = captureClientErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.setViewportSize({ width: 390, height: 820 });
  const studyUnitId = "study-unit-25";
  const hash = `#/authoring/courses/${COURSE_IDS[0]}` +
    `?section=content&studyUnitId=${studyUnitId}`;
  await mountCourseAuthoring(page, { cardinality: "many", hash });

  const item = page.locator(`[data-inspection-study-unit="${studyUnitId}"]`);
  const summary = item.locator(".course-inspection-item-details > summary");
  await expect(item).toHaveCount(1);
  await summary.click();
  await summary.focus();
  const offsetBefore = await item.evaluate((element) => {
    const sticky = document.querySelector(".course-inspection-sticky-context");
    return element.getBoundingClientRect().top - sticky.getBoundingClientRect().bottom;
  });
  const readsBefore = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.inspectionReads.length);

  await page.evaluate(({ id }) => {
    globalThis.__courseAuthoringHarness.updateInspectionStudyUnit(
      id,
      "Unidade curricular 25 atualizada no trecho exato"
    );
  }, { id: studyUnitId });
  await page.evaluate(() => globalThis.__courseAuthoringHarness.surface.refresh());

  await expect(page.getByRole("heading", {
    name: "Unidade curricular 25 atualizada no trecho exato"
  })).toBeVisible();
  await expect(item.locator(".course-inspection-item-details")).toHaveAttribute("open", "");
  await expect(summary).toBeFocused();
  const offsetAfter = await item.evaluate((element) => {
    const sticky = document.querySelector(".course-inspection-sticky-context");
    return element.getBoundingClientRect().top - sticky.getBoundingClientRect().bottom;
  });
  expect(Math.abs(offsetAfter - offsetBefore)).toBeLessThanOrEqual(2);

  const probe = await page.evaluate(() => globalThis.__courseAuthoringHarness.probe);
  expect(probe.inspectionReads).toHaveLength(readsBefore + 1);
  expect(probe.inspectionReads.at(-1)).toMatchObject({
    expectedRevision: 6,
    anchorStudyUnitId: studyUnitId,
    cursor: null,
    direction: "forward",
    limit: 12,
    maxBytes: 1_500_000
  });
  expect(probe.outlineReads).toBe(0);
  await expect(page.locator("[data-inspection-study-unit]")).toHaveCount(12);
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

test("Inspeção retorna ao card exato, fecha menus e respeita reduced motion", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 820 });
  const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=content`;
  await mountCourseAuthoring(page, { cardinality: "many", hash });

  for (let index = 0; index < 2; index += 1) {
    await page.locator('[data-inspection-load="forward"]').click();
  }
  const item = page.locator('[data-inspection-study-unit="study-unit-25"]');
  await item.evaluate((element) => {
    const sticky = document.querySelector(".course-inspection-sticky-context");
    const delta = element.getBoundingClientRect().top - sticky.getBoundingClientRect().bottom - 16;
    document.querySelector(".course-authoring-root").scrollBy({
      top: delta,
      behavior: "auto"
    });
  });
  await expect.poll(() => page.locator("[data-inspection-context-position]").textContent())
    .toBe("25/60");

  const context = page.locator(".course-inspection-context-selector");
  const contextSummary = context.locator(":scope > summary");
  await contextSummary.evaluate((summary) => summary.focus({ preventScroll: true }));
  await page.keyboard.press("Enter");
  await expect(context).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(context).not.toHaveAttribute("open", "");
  await expect(contextSummary).toBeFocused();
  await expect(page.locator("[data-inspection-context-position]")).toHaveText("25/60");

  const contextSummaryBox = await contextSummary.boundingBox();
  await page.mouse.click(
    contextSummaryBox.x + contextSummaryBox.width / 2,
    contextSummaryBox.y + contextSummaryBox.height / 2
  );
  await expect(context).toHaveAttribute("open", "");
  await page.mouse.click(4, 4);
  await expect(context).not.toHaveAttribute("open", "");
  await expect(page.locator("[data-inspection-context-position]")).toHaveText("25/60");

  await page.mouse.click(
    contextSummaryBox.x + contextSummaryBox.width / 2,
    contextSummaryBox.y + contextSummaryBox.height / 2
  );
  await expect(context.getByRole("link", {
    name: "Unidade · Unidade curricular 25"
  })).toHaveAttribute(
    "href",
    `#/authoring/courses/${COURSE_IDS[0]}?section=content&studyUnitId=study-unit-25`
  );
  await expect(context.getByRole("link", {
    name: "Microssequência · Comparação orientada"
  })).toHaveAttribute(
    "href",
    `#/authoring/courses/${COURSE_IDS[0]}` +
      "?section=content&didacticMicrosequenceId=microsequence-a"
  );
  await context.getByRole("link", {
    name: "Microssequência · Comparação orientada"
  }).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}` +
      "?section=content&didacticMicrosequenceId=microsequence-a"
  );
  await expect.poll(() => page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.positionSaves.map(({ studyUnitId }) => studyUnitId)))
    .toContain("study-unit-25");
  await page.goBack();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}?section=content&studyUnitId=study-unit-25`
  );
  await expect(page.locator('[data-inspection-study-unit="study-unit-25"]')).toHaveCount(1);
  await expect(page.locator("[data-inspection-context-position]")).toHaveText("25/60");

  const designAction = page.locator(
    '[data-inspection-study-unit="study-unit-25"] [data-inspection-control-key="design:study-unit-25"]'
  );
  const itemDetails = item.locator(".course-inspection-item-details");
  await itemDetails.locator(":scope > summary").click();
  await expect(itemDetails).toHaveAttribute("open", "");
  await designAction.click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}` +
      "?section=parameters&didacticMicrosequenceId=microsequence-a"
  );
  await page.goBack();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}?section=content&studyUnitId=study-unit-25`
  );
  await expect(designAction).toBeFocused();

  await expect(page.getByLabel("Filtrar por Parte")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Ir para" })).toBeVisible();

  await page.evaluate(() => {
    globalThis.__inspectionScrollOptions = [];
    globalThis.__inspectionOriginalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function captureInspectionScroll(options) {
      globalThis.__inspectionScrollOptions.push(options);
    };
  });
  await page.getByRole("button", { name: "Próxima Unidade" }).click();
  expect(await page.evaluate(() => globalThis.__inspectionScrollOptions.at(-1))).toEqual({
    block: "start",
    behavior: "auto"
  });
  await page.evaluate(() => {
    Element.prototype.scrollIntoView = globalThis.__inspectionOriginalScrollIntoView;
    delete globalThis.__inspectionOriginalScrollIntoView;
  });
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

test("Inspeção em desktop mantém o item 25 sob clique físico no contexto", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=content`;
  await mountCourseAuthoring(page, { cardinality: "many", hash });

  for (let index = 0; index < 2; index += 1) {
    await page.locator('[data-inspection-load="forward"]').click();
  }
  const item = page.locator('[data-inspection-study-unit="study-unit-25"]');
  await item.evaluate((element) => {
    const sticky = document.querySelector(".course-inspection-sticky-context");
    const delta = element.getBoundingClientRect().top - sticky.getBoundingClientRect().bottom - 16;
    document.querySelector(".course-authoring-root").scrollBy({ top: delta, behavior: "auto" });
  });
  await expect(page.locator("[data-inspection-context-position]")).toHaveText("25/60");

  const context = page.locator(".course-inspection-context-selector");
  const summary = context.locator(":scope > summary");
  const box = await summary.boundingBox();
  expect(await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    return Boolean(target?.closest?.(".course-inspection-context-selector > summary"));
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBe(true);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(context).toHaveAttribute("open", "");
  await expect(context.getByRole("link", {
    name: "Unidade · Unidade curricular 25"
  })).toHaveAttribute(
    "href",
    `#/authoring/courses/${COURSE_IDS[0]}?section=content&studyUnitId=study-unit-25`
  );
  await context.getByRole("link", {
    name: "Microssequência · Comparação orientada"
  }).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}` +
      "?section=content&didacticMicrosequenceId=microsequence-a"
  );
  await page.goBack();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}?section=content&studyUnitId=study-unit-25`
  );
  await expect(page.locator("[data-inspection-context-position]")).toHaveText("25/60");
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

test("duas abas compartilham somente a posição persistida e reancoram pela revisão", async ({
  page,
  context
}) => {
  const otherPage = await context.newPage();
  const pageErrors = captureClientErrors(page);
  const otherPageErrors = captureClientErrors(otherPage);
  await Promise.all([
    page.emulateMedia({ reducedMotion: "reduce" }),
    otherPage.emulateMedia({ reducedMotion: "reduce" }),
    page.setViewportSize({ width: 390, height: 820 }),
    otherPage.setViewportSize({ width: 390, height: 820 })
  ]);
  const rootHash = `#/authoring/courses/${COURSE_IDS[0]}?section=content`;
  await mountCourseAuthoring(otherPage, { cardinality: "many", hash: rootHash });
  await mountCourseAuthoring(page, {
    cardinality: "many",
    hash: `${rootHash}&studyUnitId=study-unit-25`
  });

  await expect(otherPage.locator("[data-inspection-context-position]")).toHaveText("1/60");
  await otherPage.waitForTimeout(1_600);
  await page.getByRole("button", { name: "Próxima Unidade" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(
    "aralearn.e2e.inspection-position:10000000-0000-4000-8000-000000000001"
  ))?.studyUnitId)).toBe("study-unit-26");
  await expect.poll(() => otherPage.locator(
    "[data-inspection-context-position]"
  ).textContent()).toBe("26/60");
  await expect(otherPage.locator(
    '[data-inspection-study-unit="study-unit-26"]'
  )).toHaveCount(1);

  const state = await otherPage.evaluate(() => ({
    reads: globalThis.__courseAuthoringHarness.probe.inspectionReads,
    positionLoads: globalThis.__courseAuthoringHarness.probe.positionLoads,
    saved: JSON.parse(localStorage.getItem(
      "aralearn.e2e.inspection-position:10000000-0000-4000-8000-000000000001"
    ))
  }));
  expect(state.positionLoads).toBeGreaterThanOrEqual(2);
  expect(state.reads.at(-1)).toMatchObject({
    expectedRevision: 5,
    anchorStudyUnitId: "study-unit-26",
    limit: 12
  });
  expect(state.saved).toMatchObject({
    studyUnitId: "study-unit-26",
    courseRevision: 5
  });
  expect([...pageErrors, ...otherPageErrors]).toEqual([]);
  await otherPage.close();
});

test("Parâmetros pagina 55 Módulos e permite descer até Lição sem carregar outline", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 820 });
  const parametersHash = `#/authoring/courses/${COURSE_IDS[0]}?section=parameters`;
  await mountCourseAuthoring(page, { cardinality: "many", hash: parametersHash });

  await expect(page.locator("#course-design-child-scope option")).toHaveCount(33);
  await page.getByRole("button", { name: "Carregar mais escopos" }).click();
  await expect(page.locator("#course-design-child-scope option")).toHaveCount(56);
  await page.getByLabel("Abrir módulo").selectOption("module-a");
  await page.getByRole("button", { name: "Abrir escopo" }).click();
  await expect(page.getByText("Módulo: Base conceitual", { exact: true })).toBeVisible();
  await expect(page.locator(".course-design-parameter")).toHaveCount(4);
  await page.getByText("Entender e ajustar", { exact: true }).first().click();
  await expect(page.locator("p:visible").filter({
    hasText: "Parâmetros pedagógicos não são definidos em Módulo"
  }).first()).toBeVisible();
  await expect(page.locator("[data-course-design-parameter]")).toHaveCount(0);

  await page.getByLabel("Abrir lição").selectOption("lesson-a");
  await page.getByRole("button", { name: "Abrir escopo" }).click();
  await expect(page.getByText("Lição: Relações e evidências", { exact: true })).toBeVisible();
  await expect(page.locator("[data-course-design-parameter]")).toHaveCount(4);
  expect(await page.evaluate(() => globalThis.__courseAuthoringHarness.probe.outlineReads)).toBe(0);
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

for (const width of [360, 1280]) {
  test(`Microssequência atribui cobertura planejada sem JSON em ${width} px`, async ({ page }) => {
    const clientErrors = captureClientErrors(page);
    await page.setViewportSize({ width, height: width < 600 ? 820 : 900 });
    const hash = `#/authoring/courses/${COURSE_IDS[0]}` +
      "?section=parameters&didacticMicrosequenceId=microsequence-a";
    await mountCourseAuthoring(page, { cardinality: "many", hash });

    await expect(page.getByRole("heading", {
      name: "Cobertura planejada desta Microssequência"
    })).toBeVisible();
    const analysis = page.getByRole("checkbox", {
      name: "Relação entre nomes e endereços."
    });
    const evidence = page.getByRole("checkbox", {
      name: "Explicar um caso novo de resolução."
    });
    await expect(analysis).toBeChecked();
    await expect(evidence).not.toBeChecked();
    await analysis.uncheck();
    await evidence.check();
    await page.getByRole("button", { name: "Salvar cobertura" }).click();
    await expect(page.getByText(
      "Cobertura planejada salva para esta Microssequência."
    )).toBeVisible();

    const probe = await page.evaluate(() => globalThis.__courseAuthoringHarness.probe);
    expect(probe.planReads).toBe(2);
    expect(probe.designMutations.at(-1)).toMatchObject({
      courseId: COURSE_IDS[0],
      expectedCourseRevision: 5,
      command: {
        type: "set_target_plan_items",
        scope: { kind: "didactic_microsequence", ref: "microsequence-a" },
        instructionalAnalysisUnitIds: [],
        evidenceRequirementIds: ["7a000000-0000-4000-8000-00000000001a"]
      }
    });
    await expectNoHorizontalOverflow(page);
    expect(clientErrors).toEqual([]);
  });
}

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

test("deep link separa Planejamento, Parâmetros, Conteúdo e Pessoas", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 820 });
  const planningHash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
  await mountCourseAuthoring(page, { cardinality: "many", hash: planningHash });

  await expect(page.locator(".course-authoring-course-header h1")).toHaveText("Planejamento");
  const planningContext = page.locator(".course-authoring-planning-context");
  await expect(planningContext).not.toHaveAttribute("open", "");
  await planningContext.locator(":scope > summary").click();
  await expect(page.getByText("Relações e evidências.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseAuthoringHarness.probe)).toMatchObject({
    headerReads: 1,
    outlineReads: 0,
    inspectionReads: [],
    planReads: 1
  });

  await navigateToAuthoringArea(page, "parameters", 390);
  await expect(page.locator(".course-authoring-course-header h1"))
    .toHaveText("Parâmetros e componentes");
  await expect(page.locator(".course-design-parameter")).toHaveCount(4);
  expect(await page.evaluate(() => globalThis.__courseAuthoringHarness.probe)).toMatchObject({
    outlineReads: 0,
    planReads: 1,
    designReads: [{
      courseId: COURSE_IDS[0],
      scope: { kind: "course", ref: COURSE_IDS[0] },
      limit: 32,
      cursor: null
    }]
  });
  await page.locator("#course-design-child-scope").focus();
  const parametersScroll = await page.evaluate(() => {
    const scroller = document.querySelector(".course-authoring-root");
    scroller.scrollTop = Math.min(180, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
    return scroller.scrollTop;
  });
  await page.evaluate(() => globalThis.__courseAuthoringHarness.surface.refresh());
  await expect(page.locator(".course-authoring-course-header h1"))
    .toHaveText("Parâmetros e componentes");
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}?section=parameters`
  );
  await expect.poll(() => page.evaluate(() =>
    document.querySelector(".course-authoring-root").scrollTop))
    .toBe(parametersScroll);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe("course-design-child-scope");

  await expect(page.getByRole("button", { name: /Revisar parâmetros de .+ no ChatGPT/u }))
    .toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Trabalhar no ChatGPT" }))
    .toHaveCount(0);
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.materializationRequests)).toEqual([]);

  await navigateToAuthoringArea(page, "content", 390);
  await expect(page.locator(".course-authoring-course-header h1")).toHaveText("Conteúdo");
  await expect(page.getByRole("heading", { name: "Exemplo guiado com diagrama" })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseAuthoringHarness.probe.outlineReads)).toBe(0);
  await page.evaluate(({ courseId }) => {
    window.location.hash = `#/authoring/courses/${courseId}?section=content&studyUnitId=study-unit-01`;
  }, { courseId: COURSE_IDS[0] });
  await expect.poll(() => page.evaluate(() => window.location.hash)).toContain(
    "section=content&studyUnitId=study-unit-01"
  );
  await expect(page.locator('[data-inspection-study-unit="study-unit-01"]')).toBeInViewport();
  await expect(page.locator("[data-set-diagram-state=ready]")).toHaveCount(1);
  await expect(page.locator(
    '.package-instance[data-package="aralearn.response.choice"] button'
  ).first()).toBeDisabled();
  const scrollBeforeRefresh = await page.evaluate(() => {
    const scroller = document.querySelector(".course-authoring-root");
    scroller.scrollTop = Math.min(120, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
    return scroller.scrollTop;
  });
  await page.evaluate(() => globalThis.__courseAuthoringHarness.surface.refresh());
  await expect(page.locator(".course-authoring-course-header h1")).toHaveText("Conteúdo");
  await expect.poll(() => page.evaluate(() =>
    document.querySelector(".course-authoring-root").scrollTop))
    .toBe(scrollBeforeRefresh);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}?section=content&studyUnitId=study-unit-01`
  );

  await navigateToAuthoringArea(page, "people", 390);
  await expect(page.locator(".course-authoring-course-header h1")).toHaveText("Pessoas e acesso");
  await expect(page.getByText("Pessoa proprietária")).toBeVisible();
  await expect(page.getByText("Pessoa estudante")).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseAuthoringHarness.probe.peopleReads)).toBe(1);
  expect(await page.evaluate(() => ({
    outlineReads: globalThis.__courseAuthoringHarness.probe.outlineReads,
    inspectionReads: globalThis.__courseAuthoringHarness.probe.inspectionReads.length
  }))).toEqual({ outlineReads: 0, inspectionReads: 3 });

  await page.getByRole("link", { name: "Voltar à Visão geral" }).click();
  await page.getByRole("button", { name: "Voltar aos Cursos" }).click();
  await expect(page.getByRole("heading", { name: "Meus cursos" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

test("Pessoas repete a mesma concessão após commit com resposta ambígua", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 820 });
  await mountCourseAuthoring(page, {
    hash: `#/authoring/courses/${COURSE_IDS[0]}?section=people`,
    peopleMutationScenario: "grant-ambiguous-once"
  });

  await page.locator('[data-course-authoring-action="open-grant"]').click();
  const form = page.locator("[data-course-authoring-grant]");
  const email = form.getByLabel("E-mail exato");
  await email.fill("nova@example.test");
  await form.getByRole("button", { name: "Conceder acesso", exact: true }).click();
  const firstConfirmation = page.getByRole("alertdialog");
  await expect(firstConfirmation).toHaveAttribute("data-confirmation-tone", "primary");
  await firstConfirmation.getByRole("button", {
    name: "Conceder acesso",
    exact: true
  }).click();
  await expect(page.getByText(/Tente novamente para confirmar a mesma operação/u))
    .toBeVisible();
  await expect(email).toHaveValue("nova@example.test");
  await navigateToAuthoringArea(page, "structure");
  await expect(page.locator(".course-authoring-surface")).toHaveAttribute(
    "data-section",
    "people"
  );
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.surface.handleBack())).toBe(true);
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.surface.close())).toBe("deferred");
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.closeCalls)).toBe(0);
  await expect(email).toHaveValue("nova@example.test");

  await form.getByRole("button", { name: "Conceder acesso", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", {
    name: "Conceder acesso",
    exact: true
  }).click();
  await expect(page.getByText("Pessoa recém-convidada", { exact: true })).toHaveCount(0);
  await expect(page.getByText(
    "Solicitação recebida. Por segurança, o AraLearn não informa se o endereço corresponde a uma conta. Use Atualizar Curso depois para conferir o acesso.",
    { exact: true }
  )).toBeVisible();

  const probe = await page.evaluate(() => globalThis.__courseAuthoringHarness.probe);
  expect(probe.peopleMutations).toHaveLength(2);
  expect(probe.peopleAppliedMutations).toBe(1);
  expect(probe.peopleMutations[1]).toEqual(probe.peopleMutations[0]);
  expect(probe.peopleMutations[0]).toMatchObject({
    method: "grant",
    request: {
      courseId: COURSE_IDS[0],
      email: "nova@example.test",
      confirmed: true
    }
  });
  expect(probe.peopleMutations[0].request.requestId).toMatch(/^[0-9a-f-]{36}$/u);
});

test("Pessoas repete a mesma revogação após commit com resposta ambígua", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 820 });
  await mountCourseAuthoring(page, {
    hash: `#/authoring/courses/${COURSE_IDS[0]}?section=people`,
    peopleMutationScenario: "revoke-ambiguous-once"
  });

  const revoke = page.getByRole("button", {
    name: "Revogar acesso de Pessoa estudante",
    exact: true
  });
  await revoke.click();
  await page.getByRole("alertdialog").getByRole("button", {
    name: "Revogar acesso",
    exact: true
  }).click();
  await expect(page.getByText(/Tente novamente para confirmar a mesma operação/u))
    .toBeVisible();
  await expect(page.getByText("Pessoa estudante", { exact: true })).toBeVisible();

  await revoke.click();
  await page.getByRole("alertdialog").getByRole("button", {
    name: "Revogar acesso",
    exact: true
  }).click();
  await expect(page.getByText("Pessoa estudante", { exact: true })).toHaveCount(0);
  await expect(page.getByText(
    "Acesso revogado; o estado pessoal foi preservado.",
    { exact: true }
  )).toBeVisible();

  const probe = await page.evaluate(() => globalThis.__courseAuthoringHarness.probe);
  expect(probe.peopleMutations).toHaveLength(2);
  expect(probe.peopleAppliedMutations).toBe(1);
  expect(probe.peopleMutations[1]).toEqual(probe.peopleMutations[0]);
  expect(probe.peopleMutations[0]).toMatchObject({
    method: "revoke",
    request: {
      courseId: COURSE_IDS[0],
      userId: STUDENT_ID,
      confirmed: true
    }
  });
  expect(probe.peopleMutations[0].request.requestId).toMatch(/^[0-9a-f-]{36}$/u);
});

test("Parâmetros salva decisões, interpreta texto sem sobrescrevê-lo e limpa política local", async ({
  page
}) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 430, height: 860 });
  const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=parameters`;
  await mountCourseAuthoring(page, { cardinality: "many", hash });

  const parameter = page.locator(
    '[data-parameter-id="new_analysis_unit_ceiling_per_expository_study_unit"]'
  );
  await parameter.getByText("Entender e ajustar", { exact: true }).click();
  await parameter.getByRole("spinbutton", { name: "Valor", exact: true }).fill("4");
  await parameter.getByLabel("Origem", { exact: true }).selectOption("research_condition");
  await parameter.getByLabel("Justificativa").fill(
    "Condição experimental registrada antes da produção."
  );
  await parameter.getByRole("button", { name: "Salvar neste escopo" }).click();
  await expect(page.getByText("Parâmetro salvo neste escopo.")).toBeVisible();

  await page.getByText("Editar orientação neste escopo", { exact: true }).click();
  const guidanceEditor = page.locator(".course-design-local-editor");
  await guidanceEditor.getByLabel("Texto original").fill(
    "Defina DNS, mostre resolução de nomes e contraste com DHCP."
  );
  await guidanceEditor.getByLabel("Origem da decisão").selectOption("author");
  await guidanceEditor.getByLabel("Justificativa").fill(
    "Preservar a progressão conceitual solicitada pelo autor."
  );
  await guidanceEditor.getByRole("button", { name: "Salvar orientação" }).click();
  await expect(page.getByText(
    "Texto original salvo; interpretações anteriores não foram sobrescritas."
  )).toBeVisible();
  await expect(page.getByRole("blockquote")).toContainText(
    "Defina DNS, mostre resolução de nomes e contraste com DHCP."
  );

  await page.getByText("Interpretar separadamente", { exact: true }).click();
  const interpretationEditor = page.locator(".course-design-interpretation-editor");
  await interpretationEditor.getByLabel("Resumo estruturado").fill(
    "Desenvolver DNS antes de compará-lo com DHCP."
  );
  await interpretationEditor.getByLabel("Exigir").fill(
    "Definir DNS em linguagem direta.\nMostrar um exemplo nome → IP."
  );
  await interpretationEditor.getByLabel("Evitar").fill(
    "Usar comprimento do texto como medida de densidade."
  );
  await interpretationEditor.getByLabel("Divergências").fill(
    "A orientação não especifica qual registro DNS usar."
  );
  await interpretationEditor.getByLabel("Perguntas em aberto").fill(
    "Qual exemplo deve apresentar a hierarquia?"
  );
  await interpretationEditor.getByRole("button", { name: "Salvar interpretação" }).click();
  await expect(page.getByText(
    "Interpretação salva separadamente do texto original."
  )).toBeVisible();
  await expect(page.getByRole("blockquote")).toContainText(
    "Defina DNS, mostre resolução de nomes e contraste com DHCP."
  );
  await expect(page.locator(".course-design-interpretation > p")).toHaveText(
    "Desenvolver DNS antes de compará-lo com DHCP."
  );

  await page.getByText("Ajustar componentes neste escopo", { exact: true }).click();
  const policy = page.locator(".course-design-policy");
  await policy.getByLabel("Disponibilidade").selectOption("allow_only");
  await policy.getByLabel("Permitir").nth(0).check();
  await policy.getByLabel("Permitir").nth(1).check();
  await policy.getByLabel("Excluir").nth(1).check();
  await policy.getByLabel("Preferir").nth(0).check();
  await policy.getByLabel("Origem da decisão").selectOption("author");
  await policy.getByLabel("Justificativa").fill(
    "Usar somente os componentes necessários à explicação e à prática."
  );
  await policy.getByRole("button", { name: "Salvar componentes" }).click();
  await expect(page.getByText("Política de componentes salva neste escopo.")).toBeVisible();

  await page.getByText("Ajustar componentes neste escopo", { exact: true }).click();
  await page.locator('[data-course-authoring-action="clear-design-policy"]').click();
  const restorePolicy = page.getByRole("alertdialog", { name: "Confirmar ação" });
  await expect(restorePolicy).toBeVisible();
  await expect(restorePolicy).toHaveAttribute("data-confirmation-tone", "secondary");
  await expect.poll(async () => page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.designMutations.length)).toBe(4);
  await restorePolicy.getByRole("button", { name: "Restaurar herança" }).click();
  await expect(page.getByText(
    "A política local foi removida; a política herdada voltou a valer."
  )).toBeVisible();

  const mutations = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.designMutations);
  expect(mutations.map((mutation) => mutation.command.type)).toEqual([
    "set_parameter",
    "set_guidance",
    "interpret_guidance",
    "set_component_policy",
    "clear_component_policy"
  ]);
  expect(mutations.map((mutation) => mutation.expectedCourseRevision)).toEqual([5, 6, 7, 8, 9]);
  expect(mutations[0].command).toMatchObject({
    scope: { kind: "course", ref: COURSE_IDS[0] },
    value: 4,
    origin: "research_condition"
  });
  expect(mutations[2].command).not.toHaveProperty("scope");
  expect(mutations[3].command.policy).toMatchObject({
    catalogVersion: "1-3e5629f8",
    availability: "allow_only"
  });
  expect(mutations[3].command.policy.allowedRefs).toEqual([
    "aralearn.resource.component_01@1.0.0"
  ]);
  expect(mutations[3].command.policy.excludedRefs).toEqual([
    "aralearn.resource.component_02@1.0.0"
  ]);
  expect(mutations[3].command.policy.preferredRefs).toEqual([
    "aralearn.resource.component_01@1.0.0"
  ]);
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

test("Parâmetros preserva o formulário e repete a mesma operação após resposta ambígua", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 820 });
  await mountCourseAuthoring(page, {
    hash: `#/authoring/courses/${COURSE_IDS[0]}?section=parameters`,
    designMutationScenario: "ambiguous-once"
  });

  const parameter = page.locator(
    '[data-parameter-id="new_analysis_unit_ceiling_per_expository_study_unit"]'
  );
  await parameter.getByText("Entender e ajustar", { exact: true }).click();
  const value = parameter.getByRole("spinbutton", { name: "Valor", exact: true });
  const origin = parameter.getByLabel("Origem", { exact: true });
  const reason = parameter.getByLabel("Justificativa");
  await value.fill("4");
  await origin.selectOption("research_condition");
  await reason.fill("Condição preservada para confirmar a mesma gravação.");
  await parameter.getByRole("button", { name: "Salvar neste escopo" }).click();

  await expect(page.getByText(/Tente novamente para confirmar a mesma operação/u)).toBeVisible();
  await expect(value).toHaveValue("4");
  await expect(origin).toHaveValue("research_condition");
  await expect(reason).toHaveValue("Condição preservada para confirmar a mesma gravação.");
  await expect(reason).toBeFocused();
  await navigateToAuthoringArea(page, "structure");
  await expect(page.locator(".course-authoring-surface")).toHaveAttribute(
    "data-section",
    "parameters"
  );
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.surface.handleBack())).toBe(true);
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.surface.close())).toBe("deferred");
  await expect(reason).toHaveValue("Condição preservada para confirmar a mesma gravação.");

  await page.locator("#course-design-child-scope").selectOption("module-a");
  await page.getByRole("button", { name: "Abrir escopo" }).click();
  await page.getByText("Entender e ajustar", { exact: true }).first().click();
  await expect(page.locator("p:visible").filter({
    hasText: "Parâmetros pedagógicos não são definidos em Módulo"
  }).first()).toBeVisible();
  await page.getByRole("navigation", { name: "Caminho do escopo" })
    .getByRole("link", { name: "Fundamentos de relações" }).click();
  await expect(value).toHaveValue("4");
  await expect(origin).toHaveValue("research_condition");
  await expect(reason).toHaveValue("Condição preservada para confirmar a mesma gravação.");

  await parameter.getByRole("button", { name: "Salvar neste escopo" }).click();
  await expect(page.getByText("Parâmetro salvo neste escopo.")).toBeVisible();
  const mutations = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.designMutations);
  expect(mutations).toHaveLength(2);
  expect(mutations[1].requestId).toBe(mutations[0].requestId);
  expect(mutations[1].command).toEqual(mutations[0].command);
});

test("Parâmetros mantém orientação, interpretação e política após validação local", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 820 });
  await mountCourseAuthoring(page, {
    hash: `#/authoring/courses/${COURSE_IDS[0]}?section=parameters`
  });

  const guidance = page.locator(".course-design-local-editor");
  await guidance.getByText("Editar orientação neste escopo", { exact: true }).click();
  await guidance.getByLabel("Texto original").fill("Orientação que não pode ser apagada.");
  await guidance.getByLabel("Justificativa").fill("Razão ainda em revisão.");
  await guidance.locator('select[name="origin"]').evaluate((select) => {
    select.value = "";
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.closest("form").dispatchEvent(new Event("submit", {
      bubbles: true,
      cancelable: true
    }));
  });
  await expect(page.getByText("Revise o texto original, a origem e a justificativa.")).toBeVisible();
  await expect(guidance.getByLabel("Texto original")).toHaveValue(
    "Orientação que não pode ser apagada."
  );
  await expect(guidance.getByLabel("Justificativa")).toHaveValue("Razão ainda em revisão.");
  await expect(guidance.getByLabel("Justificativa")).toBeFocused();

  const interpretation = page.locator(".course-design-interpretation-editor").first();
  await interpretation.locator("summary").click();
  await interpretation.getByLabel("Resumo estruturado").fill("Resumo preservado.");
  await interpretation.getByLabel("Exigir").fill("Mesma diretiva.\nMesma diretiva.");
  await interpretation.getByRole("button", { name: "Salvar interpretação" }).click();
  await expect(page.getByText(/Exigir: use até 16 linhas diferentes/u)).toBeVisible();
  await expect(interpretation.getByLabel("Resumo estruturado")).toHaveValue("Resumo preservado.");
  await expect(interpretation.getByLabel("Exigir")).toHaveValue(
    "Mesma diretiva.\nMesma diretiva."
  );
  await expect(interpretation.getByLabel("Exigir")).toBeFocused();

  const policy = page.locator(".course-design-policy");
  await policy.getByText("Ajustar componentes neste escopo", { exact: true }).click();
  await policy.getByLabel("Disponibilidade").selectOption("allow_only");
  await policy.getByLabel("Justificativa").fill("Seleção ainda incompleta.");
  await policy.getByRole("button", { name: "Salvar componentes" }).click();
  await expect(page.getByText(
    "Revise disponibilidade, exclusões, preferências e justificativa."
  )).toBeVisible();
  await expect(policy.getByLabel("Disponibilidade")).toHaveValue("allow_only");
  await expect(policy.getByLabel("Justificativa")).toHaveValue("Seleção ainda incompleta.");
  await expect(policy.getByLabel("Justificativa")).toBeFocused();
});

test("rascunho e criação ambígua na lista bloqueiam atualização, Back e saída sem perder dados", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 820 });
  await mountCourseAuthoring(page, {
    cardinality: "one",
    createMutationScenario: "ambiguous-once"
  });

  const openCreate = page.getByRole("button", { name: "Criar Curso" }).last();
  await openCreate.click();
  const title = page.getByLabel("Título", { exact: true });
  const objective = page.getByLabel("Objetivo", { exact: true });
  await title.fill("Rascunho protegido na lista");
  await objective.fill("Preservar uma intenção ainda não enviada.");

  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.surface.refresh())).toBe("deferred");
  await expect(page.locator("[data-course-authoring-request-feedback]")).toContainText(
    "Atualização adiada para preservar sua edição"
  );
  await expect(title).toHaveValue("Rascunho protegido na lista");
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.surface.close())).toBe("deferred");
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.surface.handleBack())).toBe(true);
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.closeCalls)).toBe(0);
  await expect(title).toHaveValue("Rascunho protegido na lista");

  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(title).toHaveCount(0);
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.surface.refresh())).toBe(true);

  await page.getByRole("button", { name: "Criar Curso" }).last().click();
  const retryTitle = page.getByLabel("Título", { exact: true });
  const retryObjective = page.getByLabel("Objetivo", { exact: true });
  await retryTitle.fill("Curso criado uma só vez");
  await retryObjective.fill("Confirmar a criação com identidade estável.");
  await page.getByRole("button", { name: "Criar Curso" }).last().click();
  await expect(page.getByText(/Tente novamente para confirmar a mesma operação/u))
    .toBeVisible();
  await expect(retryTitle).toHaveValue("Curso criado uma só vez");
  await expect(retryObjective).toHaveValue("Confirmar a criação com identidade estável.");
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.surface.close())).toBe("deferred");
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.surface.handleBack())).toBe(true);

  await page.getByRole("button", { name: "Criar Curso" }).last().click();
  await expect(page.locator(".course-authoring-course-header h1")).toHaveText("Visão geral");
  const calls = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.createCalls);
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
});

test("planejamento ambíguo mantém formulário e envelope até a mesma confirmação", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 820 });
  const planningHash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
  await mountCourseAuthoring(page, {
    hash: planningHash,
    planningMutationScenario: "ambiguous-once"
  });

  await page.getByRole("button", { name: "Editar planejamento" }).click();
  const title = page.getByLabel("Título do Curso");
  const objective = page.getByLabel("Objetivo", { exact: true });
  await title.fill("Planejamento confirmado uma vez");
  await objective.fill("Manter a intenção durante a confirmação idempotente.");
  await page.getByRole("button", { name: "Salvar planejamento" }).click();
  await expect(page.getByText(/Tente novamente para confirmar a mesma operação/u))
    .toBeVisible();
  await expect(title).toHaveValue("Planejamento confirmado uma vez");
  await expect(objective).toHaveValue(
    "Manter a intenção durante a confirmação idempotente."
  );

  await navigateToAuthoringArea(page, "structure");
  await expect(page.locator(".course-authoring-surface")).toHaveAttribute(
    "data-section",
    "planning"
  );
  await expect(page.locator(
    ".course-authoring-main-pane > [data-course-authoring-request-feedback]"
  )).toContainText("Navegação adiada para preservar sua edição");
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.surface.handleBack())).toBe(true);
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.surface.close())).toBe("deferred");
  expect(await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.closeCalls)).toBe(0);

  await page.getByRole("button", { name: "Salvar planejamento" }).click();
  await expect(page.locator(".course-authoring-course-header h1")).toHaveText("Planejamento");
  await expect(page.locator(".course-authoring-course-heading .course-authoring-eyebrow"))
    .toHaveText("Planejamento confirmado uma vez");
  await expect(page.getByText("Planejamento salvo.")).toBeVisible();
  const calls = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.planMutations);
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
});

test("criação e edição persistem pelo controlador compartilhado", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 430, height: 860 });
  await mountCourseAuthoring(page, { cardinality: "one" });

  await page.getByRole("button", { name: "Criar Curso" }).last().click();
  await page.getByLabel("Título").fill("Curso criado na Autoria");
  await page.getByLabel("Objetivo").fill("Investigar a comparação de explicações.");
  await page.getByRole("button", { name: "Criar Curso" }).last().click();
  await expect(page.locator(".course-authoring-course-header h1")).toHaveText("Visão geral");
  await expect(page.getByRole("heading", { name: "Curso criado na Autoria" })).toBeVisible();
  const createCalls = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.createCalls);
  expect(createCalls).toHaveLength(1);
  expect(createCalls[0]).toMatchObject({
    title: "Curso criado na Autoria",
    objective: "Investigar a comparação de explicações.",
    requestId: expect.any(String)
  });

  await page.getByRole("link", { name: /Planejamento/u }).first().click();
  await page.getByRole("button", { name: "Editar planejamento" }).click();
  await page.getByLabel("Título do Curso").fill("Curso revisado na Autoria");
  await page.getByLabel("Objetivo").fill("Comparar explicações com critérios explícitos.");
  await page.getByRole("button", { name: "Salvar planejamento" }).click();

  await expect(page.locator(".course-authoring-course-heading .course-authoring-eyebrow"))
    .toHaveText("Curso revisado na Autoria");
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
    preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
    requestId: expect.any(String)
  });
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

test("Pesquisa em 390 px preserva o recorte no gráfico, nos fatos e nas exportações", async ({
  page
}, testInfo) => {
  const clientErrors = captureClientErrors(page);
  const networkErrors = [];
  page.on("requestfailed", (request) => {
    networkErrors.push(`request: ${request.method()} ${request.url()} ${request.failure()?.errorText}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      networkErrors.push(`response: ${response.status()} ${response.url()}`);
    }
  });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.setViewportSize({ width: 390, height: 820 });
  const researchHash = `#/authoring/courses/${COURSE_IDS[0]}?section=research`;
  await mountCourseAuthoring(page, { cardinality: "many", hash: researchHash });

  await page.getByRole("button", { name: "Pesquisa", exact: true }).click();
  const research = page.getByRole("region", { name: "Pesquisa", exact: true });
  const datasetFilter = research.getByRole("combobox", { name: "Fatos", exact: true });
  const channelFilter = research.getByRole("combobox", {
    name: "Origem da interação",
    exact: true
  });
  await expect(research).toBeVisible();
  await expect(datasetFilter).toHaveValue("all");
  await expect(channelFilter).toHaveValue("all");
  await expect(research.getByLabel("Desde")).toHaveValue("");
  await expect(research.getByLabel("Até")).toHaveValue("");

  const chart = research.getByRole("img", { name: /Estado das observações/u });
  await expect(chart).toHaveAccessibleName(
    "Estado das observações. Aberta: 3; Resolvida: Dado ausente"
  );
  const table = research.getByRole("table", { name: "Valores equivalentes ao gráfico" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row", {
    name: "Categoria Aberta Valor 3 Denominador 4 Ausência Não"
  })).toBeVisible();
  await expect(table.getByRole("row", {
    name: "Categoria Resolvida Valor Dado ausente Denominador 4 Ausência Sim"
  })).toBeVisible();
  await expect(research.getByText("Revisão 5", { exact: true })).toBeVisible();
  await research.getByText("Como esta métrica é definida", { exact: true }).click();
  await expect(research.getByText("Quatro observações correntes no recorte.", {
    exact: true
  })).toBeVisible();
  await expect(research.getByText(
    "A ausência de uma contagem permanece indicada como dado ausente.",
    { exact: true }
  )).toBeVisible();

  await datasetFilter.selectOption("annotations");
  await channelFilter.selectOption("study_interface");
  await research.getByLabel("Desde").fill("2026-08-18");
  await research.getByLabel("Até").fill("2026-08-19");
  await research.getByRole("button", { name: "Aplicar recorte" }).click();
  await expect.poll(() => page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.analyticsReads.length)).toBe(2);
  const filteredQuery = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.analyticsReads.at(-1));
  expect(filteredQuery).toEqual({
    courseId: COURSE_IDS[0],
    options: {
      expectedCourseRevision: 5,
      query: {
        datasets: ["annotations"],
        channels: ["study_interface"],
        origins: [],
        states: [],
        from: "2026-08-18T00:00:00.000Z",
        to: "2026-08-19T23:59:59.999Z",
        limit: 100,
        cursor: null
      }
    }
  });

  const facts = research.locator(".course-analytics-facts > ol > li");
  await expect(facts).toHaveCount(1);
  await expect(facts.first()).toContainText("Observação sobre a comparação");
  await expect(facts.first()).toContainText("Observações · Observação reaberta");
  await expect(facts.first()).toContainText("Versão da Observação: 3");
  await expect(facts.first()).toContainText("Tipo do evento: Reabertura");
  await expect(facts.first()).toContainText("Tipo do objeto: Unidade de estudo");
  await expect(facts.first()).toContainText("OrigemPessoa estudante");
  await expect(facts.first()).toContainText("EstadoEm aberto");
  await research.getByRole("button", { name: "Carregar mais fatos" }).click();
  await expect(facts).toHaveCount(2);
  await expect(research.getByRole("button", { name: "Carregar mais fatos" })).toHaveCount(0);
  await expect(facts.nth(1)).toContainText("RevisãoNão registrada");
  await expect(facts.nth(1)).toContainText("EstadoResolução registrada");
  await expect(facts.nth(1)).toContainText(
    "A revisão do Curso e a quantidade de assuntos não foram registradas neste fato."
  );
  await expect(research).not.toContainText(/annotation_(?:reopened|resolved)|learner|study_unit/u);

  const interactiveTargets = await research.locator(
    ":is(button, select, input, summary, a)"
  ).evaluateAll((nodes) => nodes.filter((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && rect.width > 0 && rect.height > 0 && rect.height < 43;
  }).map((node) => ({
    element: node.tagName,
    label: node.getAttribute("aria-label") || node.textContent.trim(),
    height: node.getBoundingClientRect().height
  })));
  expect(interactiveTargets).toEqual([]);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("course-authoring-research-390.png"),
    fullPage: true,
    animations: "disabled"
  });

  const csvStarted = page.waitForEvent("download");
  await research.getByRole("button", { name: "CSV", exact: true }).click();
  const csvDownload = await csvStarted;
  const csvPath = await csvDownload.path();
  const csv = await readFile(csvPath, "utf8");
  expect(csvDownload.suggestedFilename()).toBe(
    `aralearn-analytics-${COURSE_IDS[0]}-r5.csv`
  );
  expect(csv).toContain("annotation:open:1");
  expect(csv).toContain("annotation:resolved:2");

  const jsonStarted = page.waitForEvent("download");
  await research.getByRole("button", { name: "JSON", exact: true }).click();
  const jsonDownload = await jsonStarted;
  const jsonPath = await jsonDownload.path();
  const exported = JSON.parse(await readFile(jsonPath, "utf8"));
  expect(jsonDownload.suggestedFilename()).toBe(
    `aralearn-analytics-${COURSE_IDS[0]}-r5.json`
  );
  expect(exported.query).toEqual(filteredQuery.options.query);
  expect(exported.facts.map(({ factId }) => factId)).toEqual([
    "annotation:open:1",
    "annotation:resolved:2"
  ]);
  expect(exported.facts.map(({ kind, origin, state, values }) => ({
    kind,
    origin,
    state,
    values
  }))).toEqual([{
    kind: "annotation_reopened",
    origin: "learner",
    state: "open",
    values: {
      annotation_version: 3,
      event_type: "reopened",
      target_kind: "study_unit",
      subject_count: 1
    }
  }, {
    kind: "annotation_resolved",
    origin: "learner",
    state: "resolved",
    values: {
      annotation_version: 4,
      event_type: "resolved",
      target_kind: "study_unit",
      subject_count: null
    }
  }]);
  expect(csv).toContain("annotation_reopened");
  expect(csv).toContain("learner");
  expect(csv.trim().split(/\r?\n/u)).toHaveLength(exported.facts.length + 1);

  await facts.first().getByRole("link", { name: "Abrir o objeto relacionado" }).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}` +
      "?section=content&studyUnitId=study-unit-01"
  );
  await expect(page.locator('section[aria-label="Unidades de estudo"]')).toBeVisible();
  await expect(page.locator('[data-inspection-study-unit="study-unit-01"]')).toHaveCount(1);
  expect(clientErrors).toEqual([]);
  expect(networkErrors).toEqual([]);
});
