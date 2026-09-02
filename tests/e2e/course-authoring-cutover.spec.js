import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

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
      rootMatchesViewport: Math.abs(root.getBoundingClientRect().height - innerHeight) <= 1
    };
  })).toEqual({
    exactShell: true,
    documentDoesNotScroll: true,
    bodyDoesNotScroll: true,
    appDoesNotScroll: true,
    appClips: true,
    rootOwnsOverflow: true,
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
  await page.getByRole("link", { name: "Planejamento", exact: true }).first().focus();
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
    "parameters",
    "people",
    "research",
    "review",
    "sources"
  ]);
  await expect(menu).toBeVisible();
  await expect(menu.locator(":scope > summary")).toHaveCount(1);
  await expect(menu.locator(":scope > nav > a")).toHaveCount(5);
  await expect(menu.locator(":scope > summary")).toHaveAccessibleName("Abrir tarefas do Curso");
  await menu.locator(":scope > summary").click();
  await expect(menu.getByRole("button", { name: "Atualizar Curso" })).toBeVisible();
  await expect(menu.getByRole("button", {
    name: "Planejar este Curso no ChatGPT"
  })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Trabalhar no ChatGPT" })).toHaveCount(0);
  await menu.locator(":scope > summary").click();
  await expect(page.locator(".course-authoring-sidebar-navigation")).toHaveCount(0);
  await expect(page.locator(".course-authoring-primary-navigation")).toHaveCount(1);
  await expect(page.locator(".course-authoring-primary-navigation > a")).toHaveCount(2);
  const geometry = await page.locator(".course-authoring-surface").evaluate((surface) => {
    const frame = surface.querySelector(".course-authoring-frame");
    const layout = surface.querySelector(".course-authoring-layout");
    const main = surface.querySelector(".course-authoring-main-pane");
    const header = surface.querySelector(".course-authoring-course-header");
    const heading = header?.querySelector(".course-authoring-course-heading");
    const title = heading?.querySelector("h1");
    const contextTitle = heading?.querySelector(".course-authoring-context-title");
    const surfaceRect = surface.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const layoutRect = layout.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    return {
      surfaceWidth: surfaceRect.width,
      frameWidth: frameRect.width,
      leftSpace: surfaceRect.left,
      rightSpace: innerWidth - surfaceRect.right,
      layoutColumns: getComputedStyle(layout).gridTemplateColumns,
      mainAligned: Math.abs(mainRect.left - layoutRect.left) <= 1 &&
        Math.abs(mainRect.width - layoutRect.width) <= 1,
      titleHasFullLabel: Boolean(title &&
        title.getAttribute("title") === title.textContent.trim()),
      titleTransform: title ? getComputedStyle(title).textTransform : null,
      contextTitle: contextTitle?.textContent?.trim() || "",
      contextTransform: contextTitle ? getComputedStyle(contextTitle).textTransform : null
    };
  });
  expect(geometry.surfaceWidth).toBeLessThanOrEqual(430);
  expect(geometry.frameWidth).toBeLessThanOrEqual(430);
  expect(geometry.layoutColumns.trim().split(/\s+/u)).toHaveLength(1);
  expect(geometry.mainAligned).toBe(true);
  expect(geometry.titleHasFullLabel).toBe(true);
  expect(geometry.titleTransform).toBe("none");
  expect(geometry.contextTitle.length).toBeGreaterThan(0);
  expect(geometry.contextTransform).toBe("none");
  if (width > 430) {
    expect(Math.abs(geometry.leftSpace - geometry.rightSpace)).toBeLessThanOrEqual(1);
  }
  for (const selector of [
    ".course-design-parameters",
    ".course-source-catalog",
    ".course-observations-filter-grid",
    ".course-analytics-scope"
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
    observations: "review"
  })[section] || section;
  if (canonical === "content" || canonical === "planning") {
    return page.locator(
      `.course-authoring-primary-navigation > a[data-section="${canonical}"]`
    );
  }
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
  createMutationScenario = "default",
  designMutationScenario = "default",
  sourceMutationScenario = "default",
  peopleMutationScenario = "default",
  annotationMutationScenario = "default",
  objective = "Compreender relações essenciais por meio de exemplos graduais.",
  courseTitle = "Fundamentos de relações"
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
    requestedCreateMutationScenario,
    requestedDesignMutationScenario,
    requestedSourceMutationScenario,
    requestedPeopleMutationScenario,
    requestedAnnotationMutationScenario,
    requestedObjective,
    requestedCourseTitle,
    courseIds,
    createdCourseId,
    ownerId,
    studentId
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
      title: requestedCourseTitle,
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
          version: 1,
          introduced: true,
          introducedPartPosition: 0
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
            goal: "Explicar a relação por uma comparação orientada.",
            role: "explain",
            curriculumPath: {
              moduleId: "module-a",
              moduleTitle: "Base conceitual",
              lessonId: "lesson-a",
              lessonTitle: "Relações e evidências"
            },
            studyUnitCount: 2
          }],
          progress: {
            state: "materialized",
            microsequenceCount: 1,
            studyUnitCount: 2
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
          studyUnitCount: 0
        }
      });
      firstCourse.plan.counts.authoringPartCount = 2;
    }
    const count = requestedCardinality === "zero" ? 0 :
      requestedCardinality === "one" ? 1 : definitions.length;
    const courses = definitions.slice(0, count);
    const outlineFor = (courseId) => {
      const detail = courseDetail(courseId);
      return {
        contract: "aralearn.course.v1",
        ...detail,
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T12:00:00.000Z",
        outline: {
          courseId,
          title: detail.title,
          goal: detail.goal,
          modules: [{
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
    const studyUnitVersions = new Map(studyUnits.map(({ id }) => [id, 1]));
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
      {
        ...structuredClone(source),
        anchors: index < 2 ? [{
          anchorId: `anchor-${source.sourceId}`,
          revision: 1,
          sourceRevision: 1,
          status: "active",
          selector: { kind: "page_range", startPage: index + 10, endPage: index + 12 },
          humanLocator: index === 0 ? "Capítulo 2, seção 3" : null,
          verificationExcerpt: index === 0 ? "Trecho mínimo para conferência." : null,
          needsReverification: false,
          createdAt: "2026-08-17T12:00:00.000Z"
        }] : [],
        attachments: []
      }
    ]));
    const sourceTargetKey = (targetKind, targetId) => `${targetKind}:${targetId}`;
    const sourceTargets = new Map([[sourceTargetKey(
      "plan_item",
      "79000000-0000-4000-8000-000000000019"
    ), {
      targetKind: "plan_item",
      targetId: "79000000-0000-4000-8000-000000000019",
      targetVersion: 1,
      sourceLinks: [{
        sourceId: "source-01",
        relation: "supported_by",
        anchors: [{ anchorId: "anchor-source-01" }]
      }],
      createdAt: "2026-08-17T12:00:00.000Z"
    }]]);
    const sourceReceipts = new Map();
    const designReceipts = new Map();
    const peopleReceipts = new Map();
    const createReceipts = new Map();
    const people = [{
      userId: studentId,
      displayName: "Pessoa estudante",
      avatarObjectKey: null,
      grantedAt: "2026-08-17T12:00:00.000Z"
    }];
    const grantedPersonId = "8d000000-0000-4000-8000-00000000001d";
    let designAmbiguousFailureDelivered = false;
    let sourceAmbiguousFailureDelivered = false;
    let peopleAmbiguousFailureDelivered = false;
    let createAmbiguousFailureDelivered = false;
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
      createCalls: [],
      compositionMutations: [],
      studyContentOpens: [],
      closeCalls: 0
    };
    const counts = {
      moduleCount: 1,
      lessonCount: 1,
      topicCount: 2,
      microsequenceCount: 1,
      studyUnitCount: 60
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
      operationalization: "Usa a aplicação pedagógica corrente das StudyUnits.",
      limitations: "O registro não prova qualidade nem aprendizagem.",
      defaultStatus: "product_hypothesis",
      evidenceRefs: ["https://doi.org/10.1111/j.1467-9280.2006.01693.x"],
      supportedScopes: ["course", "lesson", "didactic_microsequence", "study_unit"]
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
    const designState = new Map();
    const scopeKey = (scope) => `${scope.kind}:${scope.ref}`;
    const ensureDesignState = (courseId) => {
      if (!designState.has(courseId)) {
        designState.set(courseId, {
          parameterAssignments: new Map(),
          guidance: new Map([[
            `course:${courseId}`,
            {
              guidance: "Explique cada termo antes de depender dele.",
              origin: "author",
              reason: "Evitar pressupostos ocultos."
            }
          ]]),
          policies: new Map()
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
      if (scope.kind === "study_unit") {
        const ordinal = Number.parseInt(scope.ref.replace(/^study-unit-/u, ""), 10);
        const label = ordinal === 1
          ? "Exemplo guiado com diagrama"
          : `Unidade curricular ${ordinal}`;
        return { kind: "study_unit", ref: scope.ref, label };
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
      if (scope.kind === "study_unit") {
        const microsequenceScope = scopeDescriptor(courseId, {
          kind: "didactic_microsequence",
          ref: "microsequence-a"
        });
        return [courseScope, moduleScope, lessonScope, microsequenceScope,
          scopeDescriptor(courseId, scope)];
      }
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
            value: structuredClone(definition.defaultValue),
            origin: "system_default",
            reason: "Hipótese operacional inicial do produto.",
            sourceScope: null,
            inherited: false
          }
        };
      });
      const effectiveAssignments = path.map((candidate) => ({
        assignment: store.guidance.get(scopeKey(candidate)),
        scope: candidate
      })).filter(({ assignment }) => assignment).map(({ assignment, scope: source }) => ({
        ...structuredClone(assignment),
        sourceScope: { kind: source.kind, ref: source.ref },
        inherited: scopeKey(source) !== scopeKey(current)
      }));
      const localPolicy = store.policies.get(scopeKey(current)) || null;
      const selectedPolicy = [...path].reverse().map((candidate) => ({
        change: store.policies.get(scopeKey(candidate)),
        scope: candidate
      })).find(({ change }) => change) || null;
      return {
        contract: "aralearn.course-design.v2",
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
          localAssignment: structuredClone(store.guidance.get(scopeKey(current)) || null),
          effectiveAssignments
        },
        componentCatalog: { version: "1-3e5629f8", options: structuredClone(componentOptions) },
        targetPlanItems: ["didactic_microsequence", "study_unit"].includes(current.kind) ? {
          instructionalAnalysisUnitIds: ["79000000-0000-4000-8000-000000000019"],
          evidenceRequirementIds: []
        } : null,
        componentPolicy: {
          localAssignment: structuredClone(localPolicy),
          effectiveAssignment: selectedPolicy ? {
            ...structuredClone(selectedPolicy.change),
            sourceScope: {
              kind: selectedPolicy.scope.kind,
              ref: selectedPolicy.scope.ref
            },
            inherited: scopeKey(selectedPolicy.scope) !== scopeKey(current)
          } : {
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
        }
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
        const source = sourceDetails.get(target.id);
        path.push({
          kind: "source",
          id: target.id,
          label: source?.title || target.id,
          version: source?.revision || 1
        });
        return path;
      }
      if (target.kind === "source_anchor") {
        const source = [...sourceDetails.values()].find((candidate) =>
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
        const source = [...sourceDetails.values()].find((candidate) =>
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
    const analyticsPage = (courseId, options) => {
      const selected = options.query.scope.kind === "course"
        ? { kind: "course", ref: null, label: "Curso inteiro" }
        : {
          kind: "didactic_microsequence",
          ref: "microsequence-a",
          label: "Microssequência · Comparação orientada"
        };
      const studyUnitCount = selected.kind === "course" ? 2 : 1;
      return {
        contract: "aralearn.course-authoring-analytics.v2",
        course: {
          id: courseId,
          revision: options.expectedCourseRevision,
          title: "Fundamentos de relações"
        },
        scope: {
          selected,
          options: [{
            kind: "course",
            ref: null,
            label: "Curso inteiro"
          }, {
            kind: "didactic_microsequence",
            ref: "microsequence-a",
            label: "Microssequência · Comparação orientada"
          }]
        },
        design: {
          studyUnitCount,
          parameters: [{
            parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
            label: "Novidades por StudyUnit expositiva",
            valueKind: "integer",
            effectiveValues: [{
              value: 1,
              origin: "research_condition",
              studyUnitCount
            }]
          }, {
            parameterId: "required_explanation_forms",
            label: "Formas de explicação requeridas",
            valueKind: "string_list",
            effectiveValues: [{
              value: ["definition", "contrast"],
              origin: "automatic",
              studyUnitCount
            }]
          }, {
            parameterId: "minimum_distinct_practice_opportunities_per_evidence_requirement",
            label: "Práticas distintas por requisito",
            valueKind: "integer",
            effectiveValues: [{
              value: 3,
              origin: "author",
              studyUnitCount
            }]
          }, {
            parameterId: "required_practice_variation_dimensions",
            label: "Dimensões de variação requeridas",
            valueKind: "string_list",
            effectiveValues: [{
              value: ["context", "representation"],
              origin: "automatic",
              studyUnitCount
            }]
          }],
          editorialDirections: [{
            direction: "Títulos diretos e parágrafos breves.",
            origin: "author",
            studyUnitCount
          }],
          analysisUnits: Array.from({ length: studyUnitCount }, (_, index) => ({
            position: index + 1,
            statement: index === 0
              ? "Comparação exige um critério comum."
              : "Contraste explicita uma diferença relevante.",
            introductionCount: 1
          })),
          introductionsByStudyUnit: Array.from({ length: studyUnitCount }, (_, index) => ({
            studyUnitRef: `study-unit-${String(index + 1).padStart(2, "0")}`,
            position: index + 1,
            title: index === 0 ? "Exemplo guiado com diagrama" : "Contraste aplicado",
            introducedCount: 1
          })),
          explanationForms: [{
            form: "definition",
            studyUnitCount,
            applicationCount: studyUnitCount
          }, {
            form: "contrast",
            studyUnitCount: 1,
            applicationCount: 1
          }],
          components: [{
            componentRef: "aralearn.resource.paragraph@1.0.0",
            studyUnitCount,
            instanceCount: studyUnitCount + 1
          }, {
            componentRef: "aralearn.resource.relation_map@1.0.0",
            studyUnitCount: 1,
            instanceCount: 1
          }],
          practiceByRequirement: [{
            position: 1,
            statement: "Comparar explicações com um critério explícito.",
            opportunityCount: 3
          }],
          practiceVariationDimensions: [{
            dimension: "context",
            opportunityCount: 2
          }, {
            dimension: "representation",
            opportunityCount: 1
          }],
          sourcesByRole: [{
            role: "factual_support",
            sourceCount: 2,
            anchorCount: 3,
            studyUnitCount
          }]
        },
        authorship: {
          observations: {
            createdCount: 4,
            openCount: 1,
            resolvedCount: 3
          },
          explicitParameterOverrideCount: 1,
          manuallyRevisedStudyUnitCount: 2,
          studyUnitsByOrigin: [{
            origin: "gpt",
            createdCount: studyUnitCount,
            lastRevisedCount: 1
          }, {
            origin: "manual",
            createdCount: 0,
            lastRevisedCount: 2
          }]
        },
        missingData: [
          "Uma direção editorial antiga não informou origem."
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
      async commitCourseComposition(request) {
        probe.compositionMutations.push(structuredClone(request));
        const course = courses.find(({ courseId }) => courseId === request.courseId);
        const studyUnitId = request.studyUnit.id;
        const index = studyUnits.findIndex(({ id }) => id === studyUnitId);
        if (!course || index < 0) throw new Error("Unidade de estudo ausente na fixture.");
        const studyUnit = structuredClone(request.studyUnit);
        const version = request.expectedStudyUnitVersion + 1;
        studyUnits[index] = studyUnit;
        studyUnitVersions.set(studyUnitId, version);
        course.revision += 1;
        return {
          courseId: request.courseId,
          courseRevision: course.revision,
          studyUnitId,
          studyUnitVersion: version,
          studyUnit,
          version,
          reconciled: true,
          changed: true,
          idempotent: false,
          channel: "application",
          origin: request.origin,
          updatedAt: "2026-08-20T12:01:00.000Z"
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
          version: studyUnitVersions.get(studyUnit.id),
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
            createdOrigin: "gpt",
            lastRevisionOrigin: "gpt",
            design: { snapshot: null, application: null }
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
          contract: "aralearn.course-instructional-plan.v2",
          courseId,
          courseRevision: course.revision,
          plan: {
            ...structuredClone(course.plan),
            title: course.title,
            objective: course.goal
          }
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
          const current = sourceDetails.get(options.sourceId) || null;
          items = current ? [current] : [];
          nextCursor = null;
          query = {
            sourceId: options.sourceId,
            targetKind: options.targetKind,
            targetId: options.targetId
          };
        } else {
          const current = sourceTargets.get(sourceTargetKey(
            options.targetKind,
            options.targetId
          )) || null;
          items = current ? [current] : [];
          nextCursor = null;
          query = {
            sourceId: null,
            targetKind: options.targetKind,
            targetId: options.targetId
          };
        }
        return {
          contract: "aralearn.course-sources.v2",
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
          const current = sourceDetails.get(command.sourceId) || null;
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
            anchorCount: current?.anchors.filter(({ status }) => status === "active").length || 0,
            createdAt: "2026-08-17T12:20:00.000Z",
            anchors: (current?.anchors || []).map((anchor) => ({
              ...structuredClone(anchor),
              sourceRevision: revision
            })),
            attachments: structuredClone(current?.attachments || [])
          };
          sourceDetails.set(command.sourceId, detailed);
          const {
            anchors: discardedAnchors,
            attachments: discardedAttachments,
            ...catalogItem
          } = detailed;
          void discardedAnchors;
          void discardedAttachments;
          const catalogIndex = sourceCatalog.findIndex(({ sourceId }) =>
            sourceId === command.sourceId);
          if (catalogIndex < 0) sourceCatalog.push(catalogItem);
          else sourceCatalog[catalogIndex] = catalogItem;
          subjectId = command.sourceId;
        } else if (command.type === "retire_source") {
          const current = sourceDetails.get(command.sourceId) || null;
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
          sourceDetails.set(command.sourceId, retired);
          const {
            anchors: discardedAnchors,
            attachments: discardedAttachments,
            ...catalogItem
          } = retired;
          void discardedAnchors;
          void discardedAttachments;
          const catalogIndex = sourceCatalog.findIndex(({ sourceId }) =>
            sourceId === command.sourceId);
          sourceCatalog[catalogIndex] = catalogItem;
          subjectId = command.sourceId;
        } else if (command.type === "save_anchor") {
          const source = sourceDetails.get(command.sourceId) || null;
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
            needsReverification: false,
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
          for (const candidate of sourceDetails.values()) {
            previous = candidate.anchors.find(({ anchorId }) => anchorId === command.anchorId);
            if (previous) {
              source = candidate;
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
          sourceTargets.set(key, {
            targetKind: command.targetKind,
            targetId: command.targetId,
            targetVersion: command.expectedTargetVersion,
            sourceLinks: structuredClone(command.sourceLinks),
            createdAt: "2026-08-17T12:24:00.000Z"
          });
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
          change: command.type === "set_target_sources"
            ? { type: command.type, subjectId, targetVersion: command.expectedTargetVersion }
            : { type: command.type, subjectId, revision }
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
        let changeScope = command.scope ? structuredClone(command.scope) : null;
        if (command.type === "set_parameter") {
          const key = scopeKey(command.scope);
          const assignments = store.parameterAssignments.get(key) || new Map();
          assignments.set(command.parameterId, {
            value: structuredClone(command.value),
            origin: command.origin,
            reason: command.reason
          });
          store.parameterAssignments.set(key, assignments);
        } else if (command.type === "clear_parameter") {
          store.parameterAssignments.get(scopeKey(command.scope))?.delete(command.parameterId);
        } else if (command.type === "set_guidance") {
          store.guidance.set(scopeKey(command.scope), {
            guidance: command.guidance,
            origin: command.origin,
            reason: command.reason
          });
        } else if (command.type === "clear_guidance") {
          store.guidance.delete(scopeKey(command.scope));
        } else if (command.type === "set_component_policy") {
          store.policies.set(scopeKey(command.scope), {
            policy: structuredClone(command.policy),
            origin: command.origin,
            reason: command.reason
          });
        } else if (command.type === "clear_component_policy") {
          store.policies.delete(scopeKey(command.scope));
        } else {
          throw new Error("Comando de desenho desconhecido");
        }
        course.revision += 1;
        const result = {
          contract: "aralearn.course-design-change.v2",
          courseId: request.courseId,
          courseRevision: course.revision,
          requestId: request.requestId,
          idempotent: false,
          changed: true,
          change: {
            type: command.type,
            scope: changeScope,
            parameterId: new Set(["set_parameter", "clear_parameter"])
              .has(command.type) ? command.parameterId : null
          }
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
      async loadCourseAuthoringAnalytics(courseId, options) {
        probe.analyticsReads.push({ courseId, options: structuredClone(options) });
        return analyticsPage(courseId, options);
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
      },
      updateInspectionStudyUnitParagraph(studyUnitId, text) {
        const studyUnit = studyUnits.find(({ id }) => id === studyUnitId);
        const course = courses.find(({ courseId }) => courseId === courseIds[0]);
        const paragraph = studyUnit?.content?.find(({ package: packageId }) =>
          packageId === "aralearn.resource.paragraph"
        );
        if (!studyUnit || !course || !paragraph) {
          throw new Error("Parágrafo da Unidade de estudo ausente na fixture.");
        }
        paragraph.data.text = text;
        studyUnitVersions.set(studyUnitId, (studyUnitVersions.get(studyUnitId) || 0) + 1);
        course.revision += 1;
        return course.revision;
      }
    };
    await surface.open();
  }, {
    requestedCardinality: cardinality,
    requestedPlanningScenario: planningScenario,
    requestedCreateMutationScenario: createMutationScenario,
    requestedDesignMutationScenario: designMutationScenario,
    requestedSourceMutationScenario: sourceMutationScenario,
    requestedPeopleMutationScenario: peopleMutationScenario,
    requestedAnnotationMutationScenario: annotationMutationScenario,
    requestedObjective: objective,
    requestedCourseTitle: courseTitle,
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
    await parameter.getByLabel(/^Ajustar /u).click();
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

      await expect(page.locator(".course-authoring-course-header h1"))
        .toHaveText("Fundamentos de relações");
      await expect(page.locator(".course-authoring-context-title")).toHaveText("Parâmetros");
      await expect(page.locator(".course-design-parameter")).toHaveCount(4);
      await expect(page.locator(".course-design-component-option")).toHaveCount(32);
      await expect(page.locator(".course-design-parameters").getByLabel(/^Ajustar /u))
        .toHaveCount(4);
      await expect(page.getByRole("heading", { name: "Componentes", exact: true })).toBeVisible();
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
    test(`Fontes pagina 60 registros e preserva detalhe legível em ${width} px`, async ({
      page
    }, testInfo) => {
      const clientErrors = captureClientErrors(page);
      await page.setViewportSize({ width, height: width < 600 ? 820 : 900 });
      const sourcesHash = `#/authoring/courses/${COURSE_IDS[0]}?section=sources`;
      await mountCourseAuthoring(page, { cardinality: "many", hash: sourcesHash });

      await expect(page.locator(".course-authoring-course-header h1"))
        .toHaveText("Fundamentos de relações");
      await expect(page.locator(".course-authoring-context-title")).toHaveText("Fontes");
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
        await page.getByRole("button", { name: "Editar âncora", exact: true }).click();
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
    {
      section: "parameters",
      heading: "Parâmetros",
      ready: ".course-design-parameter"
    },
    { section: "sources", heading: "Fontes", ready: ".course-source-card" },
      {
        section: "review",
        heading: "Revisão",
        ready: ".course-observations-panel"
      },
    { section: "research", heading: "Analytics", ready: ".course-analytics" },
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
        const stableHeaderHeight = await page.locator(".course-authoring-course-header")
          .evaluate((element) => element.getBoundingClientRect().height);
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
          await expect(page.locator(".course-authoring-context-title")).toHaveText(
            area.heading
          );
          await expect(page.locator(area.ready).first()).toBeVisible();
          expect(await page.locator(".course-authoring-course-header")
            .evaluate((element) => element.getBoundingClientRect().height))
            .toBe(stableHeaderHeight);
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
    await expect(menu.locator(":scope > nav > a")).toHaveCount(5);
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
    const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=content`;
    await mountCourseAuthoring(page, { cardinality: "many", hash });
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
    await expect(page.locator(".course-authoring-course-header h1"))
      .toHaveText("Fundamentos de relações");
    await expect(page.locator(".course-authoring-context-title")).toHaveText("Parâmetros");
    await expect.poll(() => root.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
    expect(clientErrors).toEqual([]);
  });

  test("Inspeção usa o rolador principal e encerra ao trocar de área", async ({
    page
  }) => {
    const clientErrors = captureClientErrors(page);
    await page.setViewportSize({ width: 390, height: 820 });
    const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
    await mountCourseAuthoring(page, { cardinality: "many", hash });

    await navigateToAuthoringArea(page, "inspection");
    await expect(page.locator('section[aria-label="Unidades de estudo"]')).toBeVisible();
    const nestedVerticalScrollers = await page.locator(
      'section[aria-label="Unidades de estudo"]'
    ).evaluate((section) => [...section.querySelectorAll("*")].filter((element) => {
      const overflow = getComputedStyle(element).overflowY;
      return ["auto", "scroll"].includes(overflow) &&
        element.scrollHeight > element.clientHeight + 1;
    }).map((element) => element.className));
    expect(nestedVerticalScrollers).toEqual([]);

    await navigateToAuthoringArea(page, "planning");
    await expect(page.locator(".course-authoring-course-header h1"))
      .toHaveText("Fundamentos de relações");
    await expect(page.locator(".course-authoring-context-title")).toHaveText("Planejamento");
    await expect(page.locator('section[aria-label="Unidades de estudo"]')).toHaveCount(0);

    await navigateToAuthoringArea(page, "inspection");
    await expect(page.locator('section[aria-label="Unidades de estudo"]')).toBeVisible();
    await page.evaluate(() => globalThis.__courseAuthoringHarness.surface.close());
    expect(await page.evaluate(() =>
      globalThis.__courseAuthoringHarness.probe.closeCalls)).toBe(1);
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
        await expect(page.locator(".course-authoring-context-title")).toHaveText("Conteúdo");
        await expect(page.locator("[data-inspection-study-unit]")).toHaveCount(1);
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

test("Conteúdo mantém cabeçalhos separados em 360 px com título longo", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  const courseTitle = "Dataprev: Gestão de Servidores e Segurança da Informação";
  await page.setViewportSize({ width: 360, height: 780 });
  const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=content`;
  await mountCourseAuthoring(page, { cardinality: "many", hash, courseTitle });

  const courseHeading = page.locator(".course-authoring-course-header h1");
  await expect(courseHeading).toHaveText(courseTitle);
  await expect(page.locator(".course-authoring-context-title")).toHaveText("Conteúdo");
  await expect(page.locator(".course-inspection-sticky-context")).toBeVisible();

  const geometry = async () => page.locator(".course-authoring-surface").evaluate((surface) => {
    const header = surface.querySelector(".course-authoring-course-header");
    const title = surface.querySelector(".course-authoring-course-header h1");
    const sticky = surface.querySelector(".course-inspection-sticky-context");
    const headerRect = header.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const stickyRect = sticky.getBoundingClientRect();
    const titleStyle = getComputedStyle(title);
    return {
      headerHeight: headerRect.height,
      separated: headerRect.bottom <= stickyRect.top + 1,
      titleWhiteSpace: titleStyle.whiteSpace,
      titleTextOverflow: titleStyle.textOverflow,
      titleInsideHeader: titleRect.top >= headerRect.top - 1 &&
        titleRect.bottom <= headerRect.bottom + 1
    };
  });

  const before = await geometry();
  expect(before).toMatchObject({
    separated: true,
    titleWhiteSpace: "nowrap",
    titleTextOverflow: "ellipsis",
    titleInsideHeader: true
  });
  await expect(courseHeading).toHaveAttribute("title", courseTitle);

  await page.locator(".course-authoring-root").evaluate((root) => {
    root.scrollTop = 640;
  });
  await expect.poll(geometry).toMatchObject({
    headerHeight: before.headerHeight,
    separated: true,
    titleWhiteSpace: "nowrap",
    titleTextOverflow: "ellipsis",
    titleInsideHeader: true
  });
  await expectNoHorizontalOverflow(page);
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
  await page.keyboard.press("Escape");
  await expect(details).not.toHaveAttribute("open", "");
  await expect(detailsTrigger).toBeFocused();
  const sourcesAction = page.getByRole("button", {
    name: "Fontes e Âncoras de Exemplo guiado com diagrama",
    exact: true
  });
  await sourcesAction.click();
  await expect(details).not.toHaveAttribute("open", "");
  const targetDialog = page.getByRole("dialog", {
    name: "Fontes de Exemplo guiado com diagrama"
  });
  await expectModalDialogOwnsTopLayer(targetDialog);
  await page.keyboard.press("Escape");
  await expect(targetDialog).toHaveCount(0);
  await expect(sourcesAction).toBeFocused();

  await sourcesAction.click();
  await expectModalDialogOwnsTopLayer(targetDialog);
  await page.getByRole("button", {
    name: "Vincular fonte: Fonte verificável 1",
    exact: true
  }).click();
  await page.getByRole("checkbox", {
    name: "Capítulo 2, seção 3 · Páginas 10–12"
  }).check();
  await page.getByRole("button", { name: "Salvar fontes" }).click();
  await expect.poll(() => page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.sourceMutations.length)).toBe(1);
  await expect(targetDialog).toHaveCount(0);
  await expect(details).not.toHaveAttribute("open", "");
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
      relation: "supported_by",
      anchors: [{ anchorId: "anchor-source-01" }]
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
    await expect(page.getByRole("button", {
      name: "Atualizar observações",
      exact: true
    })).toBeVisible();
    await expect(page.getByText(
      "A relação entre os conjuntos precisa de mais contexto.",
      { exact: true }
    )).toBeVisible();
    await page.getByLabel("Filtros", { exact: true }).click();
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

test("Observações em 390 px criam por contexto, filtram e abrem deep link corrigível", async ({
  page
}) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 820 });
  const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=review`;
  await mountCourseAuthoring(page, { cardinality: "many", hash });

  await page.getByLabel("Nova observação", { exact: true }).click();
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

  await page.getByLabel("Filtros", { exact: true }).click();
  await page.getByLabel("Origem").selectOption("author");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.locator(".course-observation-card")).toHaveCount(1);
  await page.getByRole("link", { name: "Ver detalhe" }).click();
  await expect(page).toHaveURL(new RegExp(
    `#\\/authoring\\/courses\\/${COURSE_IDS[0]}\\?section=review&annotationId=`
  ));
  await expect(page.locator(".course-observation-detail")).toBeVisible();
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

  await page.getByLabel("Nova observação", { exact: true }).click();
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
  await page.keyboard.press("Escape");
  await expect(details).not.toHaveAttribute("open", "");
  await expect(detailsTrigger).toBeFocused();
  const observationsAction = page.getByRole("button", {
    name: "Observações de Exemplo guiado com diagrama",
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
    name: "Observações de Exemplo guiado com diagrama, 2 pendentes",
    exact: true
  }).first();
  await expect(observationDialog).toHaveCount(0);
  await expect(details).not.toHaveAttribute("open", "");
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

test("Inspeção abre os Parâmetros da StudyUnit e retorna pelo cabeçalho", async ({
  page
}) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 820 });
  const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=content`;
  await mountCourseAuthoring(page, { cardinality: "many", hash });

  const item = page.locator("[data-inspection-study-unit]").first();
  const designAction = item.getByRole("link", {
    name: "Parâmetros aplicáveis a Exemplo guiado com diagrama",
    exact: true
  });
  await designAction.click();
  await expect(page.locator(".course-authoring-context-title")).toHaveText("Parâmetros");
  await expect(page.getByRole("heading", { name: "Parâmetros pedagógicos" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Voltar ao Conteúdo", exact: true })).toBeVisible();
  const probe = await page.evaluate(() => globalThis.__courseAuthoringHarness.probe);
  expect(probe.planReads).toBe(0);
  expect(probe.designReads).toHaveLength(1);

  await page.getByRole("button", { name: "Voltar ao Conteúdo", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("section=content&studyUnitId=study-unit-01"));
  await expect(page.getByRole("link", {
    name: "Parâmetros aplicáveis a Exemplo guiado com diagrama",
    exact: true
  })).toBeFocused();
  expect(clientErrors).toEqual([]);
});

test("Planejamento sinaliza de forma compacta Conteúdo ainda sem Parte", async ({
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
  await expect(notice).toHaveAccessibleName("60 Unidades sem Parte");
  await expect(notice).toHaveText("60Unidades sem Parte");
  await expect(notice).not.toContainText("Conteúdo existente ainda não vinculado ao plano");
  await expect(notice).not.toContainText("Nada foi removido");
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

for (const width of [360, 390, 430, 1280]) {
  test(`Inspeção focaliza uma de 60 Unidades de estudo em ${width} px`, async ({ page }, testInfo) => {
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
    )).toHaveCount(0);
    await expect(page.locator(
      '.package-instance[data-package="aralearn.response.choice"] .selected-correct'
    ).first()).toBeVisible();
    await expect(page.getByText("Resposta esperada exibida.").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const courseSearch = page.getByRole("combobox", { name: "Ir para" });
    await courseSearch.fill("50");
    await page.locator(
      '[data-inspection-search-option="study_unit:study-unit-50"]'
    ).click();
    await expect(page.locator('[data-inspection-study-unit="study-unit-50"]')).toHaveCount(1);

    await expect(page.locator('[data-inspection-study-unit="study-unit-60"]')).toHaveCount(0);
    await expect(page.locator("[data-inspection-study-unit]")).toHaveCount(1);
    const { courseDocumentReads, inspectionReads } = await page.evaluate(() => ({
      courseDocumentReads: globalThis.__courseAuthoringHarness.probe.courseDocumentReads,
      inspectionReads: globalThis.__courseAuthoringHarness.probe.inspectionReads
    }));
    expect(inspectionReads).toHaveLength(2);
    expect(inspectionReads.every(({ limit, maxBytes }) =>
      limit === 12 && maxBytes === 1_500_000)).toBe(true);
    expect(inspectionReads.at(-1)).toMatchObject({
      anchorStudyUnitId: "study-unit-50",
      cursor: null,
      direction: "forward"
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

test("Inspeção mantém o foco no localizador e na navegação ao trocar de Unidade", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 820 });
  const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=content`;
  await mountCourseAuthoring(page, { cardinality: "many", hash });

  const search = page.getByRole("combobox", { name: "Ir para" });
  await search.fill("Unidade curricular 12");
  await expect(page.locator(
    '[data-inspection-search-option="study_unit:study-unit-12"]'
  )).toBeVisible();
  await search.press("Enter");
  await expect(page.locator("[data-inspection-context-position]")).toHaveText("12/60");
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}?section=content&studyUnitId=study-unit-12`
  );
  await expect(search).toBeFocused();

  const next = page.getByRole("button", { name: "Próxima Unidade" });
  const nextBox = await next.boundingBox();
  expect(nextBox).not.toBeNull();
  await page.mouse.click(
    nextBox.x + nextBox.width / 2,
    nextBox.y + nextBox.height / 2
  );
  await expect(page.locator("[data-inspection-context-position]")).toHaveText("13/60");
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}?section=content&studyUnitId=study-unit-13`
  );
  await expect(next).toBeFocused();

  await page.goBack();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}?section=content&studyUnitId=study-unit-12`
  );
  await expect(page.locator("[data-inspection-context-position]")).toHaveText("12/60");
  await expect(page.locator('[data-inspection-study-unit="study-unit-12"]')).toHaveCount(1);

  await page.goForward();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}?section=content&studyUnitId=study-unit-13`
  );
  await expect(page.locator("[data-inspection-context-position]")).toHaveText("13/60");
  await expect(page.locator('[data-inspection-study-unit="study-unit-13"]')).toHaveCount(1);

  const previous = page.getByRole("button", { name: "Unidade anterior" });
  await previous.click();
  await expect(page.locator("[data-inspection-context-position]")).toHaveText("12/60");
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}?section=content&studyUnitId=study-unit-12`
  );
  await expect(previous).toBeFocused();
});

test("navegação interna genérica mantém Voltar aos Cursos apesar do deep link corrente", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 820 });
  const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=content`;
  await mountCourseAuthoring(page, { cardinality: "many", hash });

  await page.getByRole("button", { name: "Próxima Unidade" }).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toMatch(
    /section=content&studyUnitId=study-unit-\d+$/u
  );
  const back = page.getByRole("button", { name: "Voltar aos Cursos", exact: true });
  await expect(back).toBeVisible();
  await back.click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
  await expect(page.getByRole("heading", { name: "Meus cursos" })).toBeVisible();
});

test("navegação extrema mantém foco útil quando a ação usada fica indisponível", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 820 });
  const lastHash = `#/authoring/courses/${COURSE_IDS[0]}` +
    "?section=content&studyUnitId=study-unit-59";
  await mountCourseAuthoring(page, { cardinality: "many", hash: lastHash });

  const next = page.getByRole("button", { name: "Próxima Unidade" });
  const previous = page.getByRole("button", { name: "Unidade anterior" });
  await next.click();
  await expect(page.locator("[data-inspection-context-position]")).toHaveText("60/60");
  await expect(next).toBeDisabled();
  await expect(previous).toBeFocused();

  await page.evaluate((courseId) => {
    window.location.hash = `#/authoring/courses/${courseId}` +
      "?section=content&studyUnitId=study-unit-02";
  }, COURSE_IDS[0]);
  await expect(page.locator("[data-inspection-context-position]")).toHaveText("2/60");
  await previous.click();
  await expect(page.locator("[data-inspection-context-position]")).toHaveText("1/60");
  await expect(previous).toBeDisabled();
  await expect(next).toBeFocused();
});

test("deep link para outra Unit do mesmo Curso relê a revisão externa", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 820 });
  const firstHash = `#/authoring/courses/${COURSE_IDS[0]}` +
    "?section=content&studyUnitId=study-unit-12";
  await mountCourseAuthoring(page, { cardinality: "many", hash: firstHash });
  await expect(page.locator("[data-inspection-context-position]")).toHaveText("12/60");

  const revised = await page.evaluate(() => {
    const nextRevision = globalThis.__courseAuthoringHarness.updateInspectionStudyUnit(
      "study-unit-13",
      "Unidade 13 revisada fora desta tela"
    );
    window.location.hash = window.location.hash.replace("study-unit-12", "study-unit-13");
    return nextRevision;
  });

  await expect(page.getByRole("heading", {
    name: "Unidade 13 revisada fora desta tela"
  })).toBeVisible();
  await expect(page.locator("[data-inspection-context-position]")).toHaveText("13/60");
  await expect(page.locator('[data-inspection-study-unit="study-unit-13"]')).toHaveCount(1);
  const probe = await page.evaluate(() => globalThis.__courseAuthoringHarness.probe);
  expect(probe.headerReads).toBe(2);
  expect(probe.inspectionReads.at(-1)).toMatchObject({
    expectedRevision: revised,
    anchorStudyUnitId: "study-unit-13"
  });
});

test("Inspeção atualiza só o trecho ancorado e conserva posição, foco e detalhe", async ({
  page
}) => {
  const clientErrors = captureClientErrors(page);
  await page.emulateMedia({ colorScheme: "dark" });
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
  await expect(page.locator("[data-inspection-study-unit]")).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

test("Inspeção retorna ao card exato, fecha menus e respeita reduced motion", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 820 });
  const hash = `#/authoring/courses/${COURSE_IDS[0]}` +
    "?section=content&studyUnitId=study-unit-25";
  await mountCourseAuthoring(page, { cardinality: "many", hash });

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
  const returnOffset = await item.evaluate((element) => {
    const sticky = document.querySelector(".course-inspection-sticky-context");
    return element.getBoundingClientRect().top - sticky.getBoundingClientRect().bottom;
  });

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
  await expect.poll(() => item.evaluate((element, expectedOffset) => {
    const sticky = document.querySelector(".course-inspection-sticky-context");
    const currentOffset = element.getBoundingClientRect().top -
      sticky.getBoundingClientRect().bottom;
    return Math.abs(currentOffset - expectedOffset);
  }, returnOffset)).toBeLessThanOrEqual(2);

  const designAction = page.locator(
    '[data-inspection-study-unit="study-unit-25"] [data-inspection-control-key="design:study-unit-25"]'
  );
  await designAction.click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}` +
      "?section=parameters&studyUnitId=study-unit-25"
  );
  await page.goBack();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}?section=content&studyUnitId=study-unit-25`
  );
  await expect(designAction).toBeFocused();

  await expect(page.getByLabel("Filtrar por Parte")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Ir para" })).toBeVisible();

  const documentScrollBefore = await page.evaluate(() => document.documentElement.scrollTop);
  const authoringScrollBefore = await page.locator(".course-authoring-root")
    .evaluate((element) => element.scrollTop);
  const positionBefore = await page.locator("[data-inspection-context-position]").textContent();
  const [ordinalBefore, totalBefore] = positionBefore.split("/").map(Number);
  await page.getByRole("button", { name: "Próxima Unidade" }).click();
  await expect(page.locator("[data-inspection-context-position]")).toHaveText(
    `${ordinalBefore + 1}/${totalBefore}`
  );
  expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(documentScrollBefore);
  expect(await page.locator(".course-authoring-root").evaluate((element) => element.scrollTop))
    .toBeLessThanOrEqual(authoringScrollBefore);
  await expect.poll(() => page.locator(
    `[data-inspection-study-unit="study-unit-${ordinalBefore + 1}"]`
  ).evaluate((element) => {
    const sticky = document.querySelector(".course-inspection-sticky-context");
    return Math.abs(element.getBoundingClientRect().top - sticky.getBoundingClientRect().bottom);
  })).toBeLessThanOrEqual(8.5);
  await expect(page.locator(".course-inspection-sticky-context")).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

test("Inspeção em desktop mantém o item 25 sob clique físico no contexto", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  const hash = `#/authoring/courses/${COURSE_IDS[0]}` +
    "?section=content&studyUnitId=study-unit-25";
  await mountCourseAuthoring(page, { cardinality: "many", hash });

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
  const nextButton = page.getByRole("button", { name: "Próxima Unidade" });
  const nextButtonBox = await nextButton.boundingBox();
  await page.mouse.click(
    nextButtonBox.x + nextButtonBox.width / 2,
    nextButtonBox.y + nextButtonBox.height / 2
  );
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
  expect(state.reads).toContainEqual(expect.objectContaining({
    expectedRevision: 5,
    anchorStudyUnitId: "study-unit-26",
    limit: 12
  }));
  expect(state.saved).toMatchObject({
    studyUnitId: "study-unit-26",
    courseRevision: 5
  });
  expect([...pageErrors, ...otherPageErrors]).toEqual([]);
  await otherPage.close();
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

test("deep link separa Planejamento, Parâmetros, Conteúdo e Pessoas", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 390, height: 820 });
  const planningHash = `#/authoring/courses/${COURSE_IDS[0]}?section=planning`;
  await mountCourseAuthoring(page, { cardinality: "many", hash: planningHash });

  await expect(page.locator(".course-authoring-course-header h1"))
    .toHaveText("Fundamentos de relações");
  await expect(page.locator(".course-authoring-context-title")).toHaveText("Planejamento");
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
    .toHaveText("Fundamentos de relações");
  await expect(page.locator(".course-authoring-context-title")).toHaveText("Parâmetros");
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
    .toHaveText("Fundamentos de relações");
  await expect(page.locator(".course-authoring-context-title")).toHaveText("Parâmetros");
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
  await navigateToAuthoringArea(page, "content", 390);
  await expect(page.locator(".course-authoring-course-header h1"))
    .toHaveText("Fundamentos de relações");
  await expect(page.locator(".course-authoring-context-title")).toHaveText("Conteúdo");
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
  )).toHaveCount(0);
  await expect(page.locator(
    '.package-instance[data-package="aralearn.response.choice"] .selected-correct'
  ).first()).toBeVisible();
  await expect(page.getByText("Resposta esperada exibida.").first()).toBeVisible();
  const scrollBeforeRefresh = await page.evaluate(() => {
    const scroller = document.querySelector(".course-authoring-root");
    scroller.scrollTop = Math.min(120, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
    return scroller.scrollTop;
  });
  await page.evaluate(() => globalThis.__courseAuthoringHarness.surface.refresh());
  await expect(page.locator(".course-authoring-course-header h1"))
    .toHaveText("Fundamentos de relações");
  await expect(page.locator(".course-authoring-context-title")).toHaveText("Conteúdo");
  await expect.poll(() => page.evaluate(() =>
    document.querySelector(".course-authoring-root").scrollTop))
    .toBe(scrollBeforeRefresh);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(
    `#/authoring/courses/${COURSE_IDS[0]}?section=content&studyUnitId=study-unit-01`
  );

  await navigateToAuthoringArea(page, "people", 390);
  await expect(page.locator(".course-authoring-course-header h1"))
    .toHaveText("Fundamentos de relações");
  await expect(page.locator(".course-authoring-context-title")).toHaveText("Pessoas e acesso");
  await expect(page.getByText("Pessoa proprietária")).toBeVisible();
  await expect(page.getByText("Pessoa estudante")).toBeVisible();
  expect(await page.evaluate(() => globalThis.__courseAuthoringHarness.probe.peopleReads)).toBe(1);
  expect(await page.evaluate(() => ({
    outlineReads: globalThis.__courseAuthoringHarness.probe.outlineReads,
    inspectionReads: globalThis.__courseAuthoringHarness.probe.inspectionReads.length
  }))).toEqual({ outlineReads: 0, inspectionReads: 3 });

  await page.getByRole("button", { name: "Voltar ao Conteúdo", exact: true }).click();
  await expect(page.locator(".course-authoring-course-header h1"))
    .toHaveText("Fundamentos de relações");
  await expect(page.locator(".course-authoring-context-title")).toHaveText("Conteúdo");
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

test("Parâmetros salva condição, direção editorial e política local", async ({
  page
}) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 430, height: 860 });
  const hash = `#/authoring/courses/${COURSE_IDS[0]}?section=parameters`;
  await mountCourseAuthoring(page, { cardinality: "many", hash });

  const parameter = page.locator(
    '[data-parameter-id="new_analysis_unit_ceiling_per_expository_study_unit"]'
  );
  await parameter.getByLabel(/^Ajustar /u).click();
  await parameter.getByRole("spinbutton", { name: "Valor", exact: true }).fill("4");
  await parameter.getByLabel("Origem", { exact: true }).selectOption("research_condition");
  await parameter.getByLabel("Justificativa").fill(
    "Condição experimental registrada antes da produção."
  );
  await parameter.getByRole("button", { name: "Salvar neste escopo" }).click();
  await expect(page.getByText("Parâmetro salvo neste escopo.")).toBeVisible();

  await page.getByLabel("Editar direção editorial neste escopo", { exact: true }).click();
  const guidanceEditor = page.locator(".course-design-local-editor");
  await guidanceEditor.getByRole("textbox", {
    name: "Direção editorial",
    exact: true
  }).fill(
    "Defina DNS, mostre resolução de nomes e contraste com DHCP."
  );
  await guidanceEditor.getByLabel("Origem da decisão").selectOption("author");
  await guidanceEditor.getByLabel("Justificativa").fill(
    "Preservar a progressão conceitual solicitada pelo autor."
  );
  await guidanceEditor.getByRole("button", { name: "Salvar direção editorial" }).click();
  await expect(page.getByText("Direção editorial salva neste escopo.")).toBeVisible();
  await expect(page.getByRole("blockquote")).toContainText(
    "Defina DNS, mostre resolução de nomes e contraste com DHCP."
  );

  await page.getByLabel("Ajustar componentes neste escopo", { exact: true }).click();
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

  await page.getByLabel("Ajustar componentes neste escopo", { exact: true }).click();
  await page.locator('[data-course-authoring-action="clear-design-policy"]').click();
  const restorePolicy = page.getByRole("alertdialog", { name: "Confirmar ação" });
  await expect(restorePolicy).toBeVisible();
  await expect(restorePolicy).toHaveAttribute("data-confirmation-tone", "secondary");
  await expect.poll(async () => page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.designMutations.length)).toBe(3);
  await restorePolicy.getByRole("button", { name: "Restaurar herança" }).click();
  await expect(page.getByText(
    "A política local foi removida; a política herdada voltou a valer."
  )).toBeVisible();

  const mutations = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.designMutations);
  expect(mutations.map((mutation) => mutation.command.type)).toEqual([
    "set_parameter",
    "set_guidance",
    "set_component_policy",
    "clear_component_policy"
  ]);
  expect(mutations.map((mutation) => mutation.expectedCourseRevision)).toEqual([5, 6, 7, 8]);
  expect(mutations[0].command).toMatchObject({
    scope: { kind: "course", ref: COURSE_IDS[0] },
    value: 4,
    origin: "research_condition"
  });
  expect(mutations[2].command.policy).toMatchObject({
    catalogVersion: "1-3e5629f8",
    availability: "allow_only"
  });
  expect(mutations[2].command.policy.allowedRefs).toEqual([
    "aralearn.resource.component_01@1.0.0"
  ]);
  expect(mutations[2].command.policy.excludedRefs).toEqual([
    "aralearn.resource.component_02@1.0.0"
  ]);
  expect(mutations[2].command.policy.preferredRefs).toEqual([
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
  await parameter.getByLabel(/^Ajustar /u).click();
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

test("Parâmetros mantém direção editorial e política após validação local", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 820 });
  await mountCourseAuthoring(page, {
    hash: `#/authoring/courses/${COURSE_IDS[0]}?section=parameters`
  });

  const guidance = page.locator(".course-design-local-editor");
  await guidance.getByLabel("Editar direção editorial neste escopo", { exact: true }).click();
  await guidance.getByRole("textbox", {
    name: "Direção editorial",
    exact: true
  }).fill("Direção que não pode ser apagada.");
  await guidance.getByLabel("Justificativa").fill("Razão ainda em revisão.");
  await guidance.locator('select[name="origin"]').evaluate((select) => {
    select.value = "";
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.closest("form").dispatchEvent(new Event("submit", {
      bubbles: true,
      cancelable: true
    }));
  });
  await expect(page.getByText("Revise a direção editorial, a origem e a justificativa.")).toBeVisible();
  await expect(guidance.getByRole("textbox", {
    name: "Direção editorial",
    exact: true
  })).toHaveValue(
    "Direção que não pode ser apagada."
  );
  await expect(guidance.getByLabel("Justificativa")).toHaveValue("Razão ainda em revisão.");
  await expect(guidance.getByLabel("Justificativa")).toBeFocused();

  const policy = page.locator(".course-design-policy");
  await policy.getByLabel("Ajustar componentes neste escopo", { exact: true }).click();
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
  await expect(page.locator(".course-authoring-course-header h1"))
    .toHaveText("Curso criado uma só vez");
  await expect(page.locator(".course-authoring-context-title")).toHaveText("Conteúdo");
  const calls = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.createCalls);
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
});


test("criação abre Conteúdo e mantém Planejamento consultivo", async ({ page }) => {
  const clientErrors = captureClientErrors(page);
  await page.setViewportSize({ width: 430, height: 860 });
  await mountCourseAuthoring(page, { cardinality: "one" });

  await page.getByRole("button", { name: "Criar Curso" }).last().click();
  await page.getByLabel("Título").fill("Curso criado na Autoria");
  await page.getByLabel("Objetivo").fill("Investigar a comparação de explicações.");
  await page.getByRole("button", { name: "Criar Curso" }).last().click();
  await expect(page.locator(".course-authoring-course-header h1"))
    .toHaveText("Curso criado na Autoria");
  await expect(page.locator(".course-authoring-course-heading .course-authoring-context-title"))
    .toHaveText("Conteúdo");
  const createCalls = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.createCalls);
  expect(createCalls).toHaveLength(1);
  expect(createCalls[0]).toMatchObject({
    title: "Curso criado na Autoria",
    objective: "Investigar a comparação de explicações.",
    requestId: expect.any(String)
  });

  await page.getByRole("link", { name: /Planejamento/u }).first().click();
  await expect(page.locator(".course-authoring-course-header h1"))
    .toHaveText("Curso criado na Autoria");
  await expect(page.locator(".course-authoring-context-title")).toHaveText("Planejamento");
  await expect(page.getByRole("button", { name: "Editar planejamento" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Salvar planejamento" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  expect(clientErrors).toEqual([]);
});

test("Analytics em 390 px preserva escopo, números e exportação do snapshot", async ({
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
  const analyticsHash = `#/authoring/courses/${COURSE_IDS[0]}?section=research`;
  await mountCourseAuthoring(page, { cardinality: "many", hash: analyticsHash });
  const analytics = page.locator(".course-analytics");
  const scope = analytics.getByRole("combobox", { name: "Escopo", exact: true });
  await expect(analytics).toBeVisible();
  await expect(scope).toHaveValue("0");
  await expect(analytics.getByRole("heading", { name: "Desenho", exact: true })).toBeVisible();
  await expect(analytics.getByRole("heading", { name: "Autoria", exact: true })).toBeVisible();
  await expect(analytics.getByRole("heading", { level: 3 })).toHaveCount(2);
  await expect(analytics.locator(".course-analytics-metrics")).toHaveCount(2);
  await expect(analytics.locator('.course-analytics-metrics[aria-label="Resumo do desenho"] dt', {
    hasText: "StudyUnits"
  })).toBeVisible();
  await expect(analytics.locator('.course-analytics-metrics[aria-label="Resumo do desenho"] dt', {
    hasText: "AnalysisUnits"
  })).toBeVisible();
  await expect(analytics.locator('.course-analytics-metrics[aria-label="Resumo da autoria"] dt', {
    hasText: "Observações abertas"
  })).toBeVisible();
  await expect(analytics).toContainText("Unidades no escopo.");
  await expect(analytics).toContainText("Intervenções explícitas observáveis");
  await expect(analytics).not.toContainText(
    /Fatos do recorte|execução|etapa|duração|hash|payload|percentual de autoria/iu
  );

  const details = analytics.locator("details.course-analytics-details");
  await expect(details).toHaveCount(4);
  await expect(details.filter({ hasText: "Configuração aplicada" })).not.toHaveAttribute("open", "");
  await details.filter({ hasText: "Configuração aplicada" }).locator("summary").click();
  const configuration = analytics.getByRole("table", { name: "Configuração aplicada" });
  await expect(configuration).toBeVisible();
  await expect(configuration).toContainText("Novidades por StudyUnit expositiva");
  await expect(configuration).toContainText("1 · 2 StudyUnits · Condição de pesquisa");
  await expect(configuration).toContainText("Definição, Contraste");
  await expect(analytics).not.toContainText(
    /new_analysis_unit_ceiling|provider_assistance|componentRef|studyUnitRef|aralearn\.resource/iu
  );

  await scope.selectOption("1");
  await analytics.getByRole("button", { name: "Aplicar escopo" }).click();
  await expect.poll(() => page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.analyticsReads.length)).toBe(2);
  const scopedRead = await page.evaluate(() =>
    globalThis.__courseAuthoringHarness.probe.analyticsReads.at(-1));
  expect(scopedRead).toEqual({
    courseId: COURSE_IDS[0],
    options: {
      expectedCourseRevision: 5,
      query: {
        scope: {
          kind: "didactic_microsequence",
          ref: "microsequence-a"
        }
      }
    }
  });
  await expect(scope).toHaveValue("1");
  await expect(analytics.locator(
    '.course-analytics-metrics[aria-label="Resumo do desenho"] dd'
  )).toHaveText(["1", "1", "3", "2"]);

  const jsonStarted = page.waitForEvent("download");
  await analytics.getByRole("button", { name: "Exportar Analytics em JSON" }).click();
  const jsonDownload = await jsonStarted;
  const jsonPath = await jsonDownload.path();
  const exported = JSON.parse(await readFile(jsonPath, "utf8"));
  expect(jsonDownload.suggestedFilename()).toBe("aralearn-analytics-snapshot-r5.json");
  expect(exported.contract).toBe("aralearn.course-authoring-analytics.v2");
  expect(exported.scope.selected).toEqual({
    kind: "didactic_microsequence",
    ref: "microsequence-a",
    label: "Microssequência · Comparação orientada"
  });
  expect(exported.design.studyUnitCount).toBe(1);
  expect(exported.design.analysisUnits).toHaveLength(1);
  expect(exported.design.practiceByRequirement[0].opportunityCount).toBe(3);
  expect(exported.design.sourcesByRole[0].sourceCount).toBe(2);
  expect(exported.authorship).toMatchObject({
    observations: { createdCount: 4, openCount: 1, resolvedCount: 3 },
    explicitParameterOverrideCount: 1,
    manuallyRevisedStudyUnitCount: 2,
    studyUnitsByOrigin: expect.any(Array)
  });
  expect(JSON.stringify(exported)).not.toMatch(
    /"facts"|"runs"|"steps"|"duration"|"hash"|"payload"/iu
  );

  const nestedVerticalScrollers = await analytics.evaluate((root) =>
    [...root.querySelectorAll("*")].filter((element) => {
      const overflow = getComputedStyle(element).overflowY;
      return ["auto", "scroll"].includes(overflow) &&
        element.scrollHeight > element.clientHeight + 1;
    }).map((element) => element.className));
  expect(nestedVerticalScrollers).toEqual([]);
  await expectNoHorizontalOverflow(page);
  await expectVisibleTouchTargets(page);
  await page.screenshot({
    path: testInfo.outputPath("course-authoring-analytics-390.png"),
    fullPage: true,
    animations: "disabled"
  });

  expect(clientErrors).toEqual([]);
  expect(networkErrors).toEqual([]);
});
