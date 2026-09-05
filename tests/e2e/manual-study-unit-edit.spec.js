import { expect, test } from "@playwright/test";
import fs from "node:fs";

import { renderPackageStudyUnitBlocks } from "../../src/render/renderPackageStudyUnit.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";
import {
  listManualStudyUnitEditablePaths
} from "../../src/ui/manualStudyUnitEdit.js";

const STYLES = ["/styles-tokens.css", "/styles-shell-baseline.css", "/styles.css",
  "/course-authoring.css"];
const VIEWPORTS = [360, 390, 430, 1280];
const GEOMETRY_TOLERANCE = 1;
const fixture = JSON.parse(fs.readFileSync(
  new URL("../fixtures/package/project-minimal.json", import.meta.url),
  "utf8"
));

async function openSecondStudyUnitByClicks(page) {
  await page.getByRole("button", { name: "Abrir módulo" }).click();
  await page.getByRole("button", { name: "Abrir lição" }).click();
  await page.getByRole("button", { name: "Abrir microssequência didática" }).first().click();
  await page.getByRole("button", { name: "Abrir unidade" }).last().click();
}

async function openFirstStudyUnitByClicks(page) {
  await page.getByRole("button", { name: "Abrir módulo" }).click();
  await page.getByRole("button", { name: "Abrir lição" }).click();
  await page.getByRole("button", { name: "Abrir microssequência didática" }).click();
  await page.getByRole("button", { name: "Abrir unidade" }).first().click();
}

function responseUnit(manifest, index) {
  const responseId = `manual-response-${index}`;
  let content = [];
  let data;
  if (manifest.id === "aralearn.response.choice") {
    data = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(
      manifest.id,
      manifest.version
    ).contract.example;
  } else if (manifest.id === "aralearn.response.gap") {
    content = [{
      id: `manual-response-body-${index}`,
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Use DNS aqui." }
    }];
    data = {
      prompt: "Complete",
      blanks: [{
        id: "protocol",
        targetInstanceId: content[0].id,
        targetPath: "text",
        responseMode: "text",
        answer: "DNS"
      }]
    };
  } else if (manifest.id === "aralearn.response.ordering") {
    content = ["Preparar", "Executar"].map((text, entryIndex) => ({
      id: `manual-order-${index}-${entryIndex}`,
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text }
    }));
    data = {
      targets: content.map((instance, entryIndex) => ({
        id: `target-${entryIndex}`,
        targetInstanceId: instance.id,
        targetPath: "text",
        answer: instance.data.text
      }))
    };
  } else if (manifest.id === "aralearn.response.open") {
    data = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(
      manifest.id,
      manifest.version
    ).contract.example;
  } else {
    throw new Error(`Formato de resposta sem fixture: ${manifest.id}`);
  }
  return {
    id: `manual-response-unit-${index}`,
    position: 1,
    title: manifest.label,
    role: "practice",
    content,
    response: {
      id: responseId,
      package: manifest.id,
      version: manifest.version,
      data
    },
    feedback: [],
    topics: []
  };
}

function packageCatalogDocument() {
  const cases = RESOURCE_PACKAGE_REGISTRY.listCatalog().map((manifest, index) => {
    const slot = manifest.slots.includes("content") ? "content" : "response";
    let unit;
    let targetId;
    if (slot === "content") {
      const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(
        manifest.id,
        manifest.version
      );
      const instance = RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
        id: `manual-content-${index}`,
        package: manifest.id,
        version: manifest.version,
        data: contract.contract.example
      }, "content");
      unit = {
        id: `manual-content-unit-${index}`,
        position: 1,
        title: manifest.label,
        role: "theory",
        content: [instance],
        response: null,
        feedback: [],
        topics: []
      };
      targetId = `content:${instance.id}`;
    } else {
      unit = responseUnit(manifest, index);
      targetId = `response:${unit.response.id}`;
    }
    const expected = listManualStudyUnitEditablePaths(unit, targetId)
      .map(({ path, label }) => ({ path, label }));
    return {
      packageId: manifest.id,
      expected,
      html: renderPackageStudyUnitBlocks(unit, {
        blockKeyPrefix: `catalog:${index}`,
        resourceSelectionEnabled: true,
        resourceSelectionTargetIds: [targetId],
        selectedResourceTargetIds: [targetId],
        manualEditingTargetId: targetId
      })
    };
  });
  const links = STYLES.map((href) => `<link rel="stylesheet" href="${href}">`).join("");
  return {
    cases: cases.map(({ packageId, expected }) => ({ packageId, expected })),
    html: '<!doctype html><html lang="pt-BR"><head><meta name="viewport"' +
      ` content="width=device-width,initial-scale=1">${links}</head><body>` +
      '<main class="manual-package-catalog">' + cases.map(({ packageId, html }) =>
        `<article data-manual-package="${packageId}"><div class="card-sheet-content">${html}</div></article>`
      ).join("") + "</main></body></html>"
  };
}

async function openStudyUnit(page, ownership, { duplicateMicrosequence = false, longTitles = false } = {}) {
  const project = structuredClone(fixture);
  if (longTitles) {
    project.courses[0].title = "Curso com título extenso sobre relações entre conceitos e resolução de práticas";
    project.courses[0].modules[0].lessons[0].microsequences[0].studyUnits[1].title =
      "Uma explicação extensa da conjunção e das condições necessárias à conclusão";
  }
  if (duplicateMicrosequence) {
    const lesson = project.courses[0].modules[0].lessons[0];
    const duplicate = structuredClone(lesson.microsequences[0]);
    duplicate.id = "micro-fixture-secondary";
    duplicate.title = "Aplicação complementar";
    duplicate.studyUnits = duplicate.studyUnits.map((unit, index) => ({
      ...unit,
      id: `${unit.id}-secondary-${index}`,
      content: unit.content.map((instance) => ({
        ...instance,
        id: `${instance.id}-secondary-${index}`
      })),
      response: unit.response ? {
        ...unit.response,
        id: `${unit.response.id}-secondary-${index}`
      } : null,
      feedback: unit.feedback.map((instance) => ({
        ...instance,
        id: `${instance.id}-secondary-${index}`
      }))
    }));
    lesson.microsequences.push(duplicate);
  }
  await page.goto("/");
  await page.setContent('<!doctype html><html lang="pt-BR"><head>' +
    STYLES.map((href) => `<link rel="stylesheet" href="${href}">`).join("") +
    '</head><body><div id="study-root"></div></body></html>');
  await page.evaluate(async ({ project, ownership }) => {
    const { createCourseStudyApplication } = await import("/src/study/CourseStudyApplication.js");
    const progress = {
      version: 1,
      lessons: {
        "course-fixture-minimal::module-fixture-minimal::lesson-fixture-minimal": {
          cursorStudyUnitId: "card-fixture-minimal-regra",
          completedStudyUnitIds: ["card-fixture-minimal-regra"]
        }
      }
    };
    const requests = [];
    let canonicalProject = structuredClone(project);
    let canonicalRevision = 7;
    let canonicalStudyUnitVersion = 3;
    let pendingPersonalCopyEdit = null;
    let personalRequestIndex = 0;
    let recoveryStatus = "unresolved";
    let recoveryTargetId = null;
    const recoveryReads = [];
    const sourceCourseId = "course-fixture-minimal";
    const nextPersonalRequestId = () => `recovery-request-${++personalRequestIndex}`;
    const repository = {
      loadProgress: () => structuredClone(progress),
      loadCourseSummaries: () => canonicalProject.courses.map((course) => ({
        courseId: course.id, title: course.title, revision: canonicalRevision,
        ownership: course.id === recoveryTargetId ? "owned" : ownership,
        canEdit: course.id === recoveryTargetId || ownership === "owned",
        canObserve: true, visibility: ownership === "public" ? "public" : "private",
        publicFileAccess: "restricted", moduleCount: 1, lessonCount: 1,
        studyUnitCount: 2, completedStudyUnitCount: 1
      })),
      loadAnnotationsForPath: () => [],
      loadRuntimeStatus: () => ({}),
      loadReviewItems: () => [],
      hasMoreReviewItems: () => false,
      isStudyUnitMarkedForReview: () => false,
      loadCourse: async (courseId) => canonicalProject.courses.find(({ id }) =>
        id === courseId),
      loadProject: () => structuredClone(canonicalProject),
      refreshCourses: async () => structuredClone(canonicalProject),
      loadStudyDraftRecovery: async () => structuredClone(pendingPersonalCopyEdit),
      clearStudyDraftRecovery: async (courseId, requestId) => {
        if (pendingPersonalCopyEdit?.sourceCourseId !== courseId ||
            pendingPersonalCopyEdit?.requestId !== requestId) return false;
        pendingPersonalCopyEdit = null;
        return true;
      },
      recoverStudyDraft: async (courseId) => {
        recoveryReads.push(courseId);
        return { status: recoveryStatus, targetCourseId: recoveryTargetId };
      },
      loadStudyUnitCompositionContext: (reference) => ({
        courseId: reference.courseId,
        courseRevision: canonicalRevision,
        didacticMicrosequenceId: reference.microsequenceId,
        studyUnitId: reference.studyUnitId,
        studyUnitVersion: canonicalStudyUnitVersion
      }),
      setStudyUnitCompleted: async () => { throw new Error("progresso não deve mudar"); },
      flush: async () => true
    };
    globalThis.__manualStudyProgressBefore = JSON.stringify(progress);
    globalThis.__manualStudyRepository = repository;
    globalThis.__manualStudySnapshot = () => structuredClone(canonicalProject);
    globalThis.__manualStudyPending = () => structuredClone(pendingPersonalCopyEdit);
    globalThis.__manualStudyRecoveryReads = recoveryReads;
    globalThis.__manualStudySetRecovery = ({ status, targetCourseId = null }) => {
      recoveryStatus = status;
      recoveryTargetId = targetCourseId;
    };
    globalThis.__manualStudyInstallPendingRecovery = () => {
      pendingPersonalCopyEdit = {
        requestId: nextPersonalRequestId(),
        sourceCourseId,
        expectedSourceCourseRevision: canonicalRevision,
        expectedStudyUnitVersion: canonicalStudyUnitVersion,
        didacticMicrosequenceId: "micro-fixture-minimal",
        sourceSelection: {
          courseId: sourceCourseId,
          moduleId: "module-fixture-minimal",
          lessonId: "lesson-fixture-minimal",
          microsequenceId: "micro-fixture-minimal",
          studyUnitId: "card-fixture-minimal-complete"
        },
        targetId: "content:card-fixture-minimal-complete-content",
        studyUnit: structuredClone(
          canonicalProject.courses[0].modules[0].lessons[0]
            .microsequences[0].studyUnits[1]
        ),
        origin: "manual"
      };
      pendingPersonalCopyEdit.studyUnit.content[0].data.text =
        "Na retomada, a conjunção é verdadeira quando as duas são verdadeiras.";
      return structuredClone(pendingPersonalCopyEdit);
    };
    globalThis.__manualStudySetCanonical = ({
      project: nextProject,
      courseRevision,
      studyUnitVersion
    }) => {
      canonicalProject = structuredClone(nextProject);
      canonicalRevision = courseRevision;
      canonicalStudyUnitVersion = studyUnitVersion;
    };
    globalThis.__manualStudyRequests = requests;
    globalThis.__manualStudySaveControl = {
      ambiguousFailures: 0,
      staleFailures: 0,
      staleCanonical: null,
      reconciled: true
    };

    async function saveManualEdit(request) {
      if (ownership !== "owned" || request.courseId !== sourceCourseId) {
        throw new Error("Somente o proprietário pode editar o curso.");
      }
      requests.push(structuredClone(request));
      if (globalThis.__manualStudySaveControl.staleFailures > 0) {
        globalThis.__manualStudySaveControl.staleFailures -= 1;
        const staleCanonical = globalThis.__manualStudySaveControl.staleCanonical;
        if (staleCanonical) {
          canonicalProject = structuredClone(staleCanonical.project);
          canonicalRevision = staleCanonical.courseRevision;
          canonicalStudyUnitVersion = staleCanonical.studyUnitVersion;
          globalThis.__manualStudySaveControl.staleCanonical = null;
        }
        const error = new Error("O Curso mudou.");
        error.code = "stale_course_state";
        throw error;
      }
      if (globalThis.__manualStudySaveControl.ambiguousFailures > 0) {
        globalThis.__manualStudySaveControl.ambiguousFailures -= 1;
        const error = new TypeError("Failed to fetch");
        error.code = "network_error";
        error.ambiguous = true;
        throw error;
      }
      if (request.expectedCourseRevision !== canonicalRevision || request.expectedVersion !== canonicalStudyUnitVersion) {
        const error = new Error("O curso mudou. Releia antes de salvar.");
        error.code = "40001";
        throw error;
      }
      const course = canonicalProject.courses.find(({ id }) => id === request.courseId);
      const units = course?.modules[0].lessons[0].microsequences[0].studyUnits;
      const unitIndex = units?.findIndex(({ id }) => id === request.studyUnitId) ?? -1;
      if (unitIndex >= 0) units[unitIndex] = structuredClone(request.studyUnit);
      const version = request.expectedVersion + 1;
      const courseRevision = request.expectedCourseRevision + 1;
      if (request.courseId === sourceCourseId) {
        canonicalRevision = courseRevision;
        canonicalStudyUnitVersion = version;
      }
      return {
        courseId: request.courseId,
        courseRevision,
        studyUnitId: request.studyUnitId,
        studyUnitVersion: version,
        studyUnit: structuredClone(request.studyUnit),
        version,
        reconciled: globalThis.__manualStudySaveControl.reconciled,
        changed: true,
        idempotent: false,
        channel: "application",
        origin: request.origin,
        updatedAt: "2026-08-20T12:00:00.000Z"
      };
    }

    function mountStudyApplication() {
      const root = document.querySelector("#study-root");
      root.replaceChildren();
      globalThis.__manualStudyApp = createCourseStudyApplication({
        root,
        repository,
        initialProject: structuredClone(canonicalProject),
        onSaveManualEdit: saveManualEdit,
        onSaveAssistedStructure: ownership === "owned"
          ? async (request) => ({
              courseId: request.courseId,
              courseRevision: canonicalRevision + 1,
              project: structuredClone(request.proposedProject)
            })
          : null
      });
      return globalThis.__manualStudyApp;
    }

    globalThis.__manualStudyReload = async ({ retry = true } = {}) => {
      const app = mountStudyApplication();
      await app.openCourse(sourceCourseId);
      await app.resumePendingManualEdit({ retry });
      app.openCourses();
      return true;
    };
    const app = mountStudyApplication();
    await app.openCourse(sourceCourseId);
  }, { project, ownership });
  await openSecondStudyUnitByClicks(page);
  await expect(page.getByLabel("Unidade de estudo 2 de 2")).toBeVisible();
}

async function openInspectionUnit(page, ownership, { longTitles = false } = {}) {
  await page.goto("/");
  await page.setContent('<!doctype html><html lang="pt-BR"><head>' +
    STYLES.map((href) => `<link rel="stylesheet" href="${href}">`).join("") +
    '</head><body><main class="course-authoring-root"><div id="inspection-root"></div></main></body></html>');
  await page.evaluate(async ({ ownership, longTitles }) => {
    const { createCourseInspectionSequence } = await import(
      "/src/ui/CourseInspectionSequence.js"
    );
    const { renderCourseAuthoringSurface } = await import("/src/ui/CourseAuthoringSurface.js");
    const courseId = "10000000-0000-4000-8000-000000000001";
    const partId = "20000000-0000-4000-8000-000000000002";
    const studyUnit = {
      id: "inspection-unit-1",
      position: 1,
      title: longTitles ? "Relações entre conceitos e condições necessárias para a conclusão desta prática" : "Relações",
      role: "theory",
      content: [{
        id: "inspection-paragraph-1",
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: "Texto de inspeção original." }
      }],
      response: null,
      feedback: [],
      topics: ["Relações"]
    };
    const requests = [];
    let courseRevision = 7;
    let studyUnitVersion = 1;
    const controller = {
      async loadAuthoringStudyUnits(_courseId, options) {
        return {
          contract: "aralearn.course-study-unit-inspection-page.v2",
          courseId,
          courseRevision: 7,
          scope: options.scope,
          totalCount: 1,
          scopeOptions: {
            authoringParts: [{
              id: partId,
              position: 0,
              title: "Parte inicial",
              state: "materialized"
            }],
            unassignedStudyUnitCount: 0
          },
          items: [{
            studyUnit: structuredClone(studyUnit),
            version: 1,
            updatedAt: "2026-08-20T12:00:00.000Z",
            ordinal: 1,
            curriculumPath: {
              module: { id: "module-a", position: 0, title: "Fundamentos" },
              lesson: { id: "lesson-a", position: 0, title: "Relações" },
              didacticMicrosequence: {
                id: "micro-a",
                position: 0,
                title: "Relações essenciais"
              }
            },
            authoringPart: {
              id: partId,
              position: 0,
              title: "Parte inicial",
              state: "materialized"
            },
            authorship: {
              createdOrigin: "human",
              lastRevisionOrigin: "human",
              design: {
                application: null
              }
            },
            deepLink: `#/authoring/courses/${courseId}?section=content&studyUnitId=${studyUnit.id}`
          }],
          hasPrevious: false,
          hasMore: false,
          previousCursor: null,
          nextCursor: null,
          pageBytes: 2_048
        };
      },
      async loadAuthoringInspectionPosition() { return null; },
      async saveAuthoringInspectionPosition() {},
      async loadCourseDocument() {
        return {
          document: {
            contract: "aralearn.course-project.v1",
            courses: [{
              id: courseId,
              title: "Curso de relações",
              modules: [{
                id: "module-a",
                title: "Fundamentos",
                lessons: [{
                  id: "lesson-a",
                  title: "Relações",
                  microsequences: [{
                    id: "micro-a",
                    title: "Relações essenciais",
                    studyUnits: [structuredClone(studyUnit)]
                  }]
                }]
              }]
            }]
          }
        };
      },
      async commitCourseComposition(request) {
        requests.push(structuredClone(request));
        courseRevision += 1;
        studyUnitVersion += 1;
        return {
          courseId,
          courseRevision,
          studyUnitId: request.studyUnitId,
          studyUnitVersion,
          studyUnit: structuredClone(request.studyUnit),
          version: studyUnitVersion,
          reconciled: true,
          changed: true,
          idempotent: false,
          channel: "application",
          origin: request.origin,
          updatedAt: "2026-08-20T12:01:00.000Z"
        };
      }
    };
    globalThis.__inspectionManualRequests = requests;
    const course = { courseId, revision: 7,
      title: longTitles ? "Relações conceituais e condições para resolver problemas com clareza" : "Curso de relações",
      ownership, canEdit: ownership === "owned" };
    document.querySelector(".course-authoring-root").innerHTML = renderCourseAuthoringSurface({
      view: "course", section: "content", course
    });
    globalThis.__inspectionManualSequence = createCourseInspectionSequence({
      root: document.querySelector("[data-course-inspection-host]"),
      controller,
      course,
      onSaveManualEdit: (request) => controller.commitCourseComposition(request),
      windowValue: window,
      documentValue: document,
      navigatorValue: navigator
    });
    await globalThis.__inspectionManualSequence.open();
  }, { ownership, longTitles });
}

async function installContextualAssistanceResponses(page, {
  discussionMessage,
  candidateMessage,
  text
}) {
  await page.evaluate(({ discussionMessage, candidateMessage, text }) => {
    globalThis.__ARALEARN_ENV__ = {
      developmentRuntime: true,
      assistAllowedOrigins: ["https://api.openai.com"]
    };
    const project = globalThis.__manualStudySnapshot();
    const candidate = structuredClone(
      project.courses.at(-1).modules[0].lessons[0].microsequences[0].studyUnits[1]
    );
    candidate.content[0].data.text = text;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      const value = calls % 2 === 1
        ? {
            message: discussionMessage,
            proposal: {
              summary: "Revisar a formulação sem trocar o componente instalado.",
              changes: ["Revisar a formulação do componente textual."],
              scope: "study_unit",
              componentNeeds: []
            }
          }
        : { message: candidateMessage, candidate };
      return {
        ok: true,
        status: 200,
        async json() {
          return { output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }] };
        }
      };
    };
  }, { discussionMessage, candidateMessage, text });
}

async function prepareContextualAssistance(page, request) {
  await page.getByRole("button", { name: "Assistência por IA" }).click();
  const selection = page.getByRole("region", { name: "Edição com IA" });
  await expect(selection).toBeVisible();
  await expect(selection.getByRole("button", { name: "Abrir Edição com IA" })).toBeFocused();
  await selection.getByRole("button", { name: "Abrir Edição com IA" }).click();
  const dialog = page.locator("[data-course-assistance]").getByRole("dialog");
  await expect(dialog).toBeVisible();
  const connection = dialog.locator(".course-assistance-connection");
  await expect(connection.getByRole("button", {
    name: "Configurar IA"
  })).toHaveAttribute("aria-expanded", "true");
  await dialog.locator("[data-course-assistance-provider]").selectOption("openai");
  await dialog.locator("[data-course-assistance-model]").selectOption("gpt-5.6-luna");
  await dialog.getByLabel("Chave da OpenAI").fill("segredo-somente-em-memoria");
  await dialog.getByLabel("Mensagem").fill(request);
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await expect(dialog.getByText("Proposta", { exact: true })).toBeVisible();
  return dialog;
}

test("os 33 packages preservam edição textual no renderer entre 360 e 1280 px", async ({ page }) => {
  const catalog = packageCatalogDocument();
  expect(catalog.cases).toHaveLength(33);
  await page.goto("/");
  await page.setContent(catalog.html);
  await page.evaluate(async () => {
    const { RESOURCE_PACKAGE_REGISTRY } = await import("/src/resources/packages/index.js");
    const { activateManualStudyUnitEdit } = await import("/src/ui/manualStudyUnitEdit.js");
    await RESOURCE_PACKAGE_REGISTRY.hydrate(document);
    globalThis.__manualPackageControllers = [...document.querySelectorAll(
      ".runtime-resource-edit-target.is-inline-editing"
    )].map((container) => activateManualStudyUnitEdit(container));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <=
      document.documentElement.clientWidth), `${width}px sem overflow global`).toBe(true);
    const actual = await page.evaluate(() => Object.fromEntries(
      [...document.querySelectorAll("[data-manual-package]")].map((article) => [
        article.dataset.manualPackage,
        [...article.querySelectorAll("[data-manual-edit-path]")]
          .filter((field) => field.getClientRects().length &&
            getComputedStyle(field).display !== "none" &&
            getComputedStyle(field).visibility !== "hidden")
          .map((field) => ({
            path: field.dataset.manualEditPath,
            editable: field.getAttribute("contenteditable"),
            ariaLabel: field.getAttribute("aria-label")
          }))
      ])
    ));
    for (const entry of catalog.cases) {
      for (const target of entry.expected) {
        const fields = (actual[entry.packageId] || [])
          .filter(({ path }) => path === target.path);
        expect(fields.length, `${width}px ${entry.packageId}:${target.path}`).toBeGreaterThan(0);
        expect(fields.some(({ editable }) => editable === "plaintext-only")).toBe(true);
        expect(fields.some(({ ariaLabel }) => ariaLabel === target.label)).toBe(true);
      }
    }
  }
});

test("autor edita no lugar e estudante alheio preserva original sem receber escritor", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudyUnit(page, "owned");
  await expect(page.locator('[data-action="text-gap-open-choice"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Assistência por IA" })).toBeVisible();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator(
    '[data-resource-target-id="content:card-fixture-minimal-complete-content"]'
  ).click();
  const field = page.locator('[data-manual-edit-path="text"]');
  await expect(field).toBeEditable();
  await field.fill("A conjunção é verdadeira quando P e Q são verdadeiras.");
  await page.getByRole("button", { name: "Salvar edição" }).click();
  await expect(page.getByText("Edição salva.", { exact: true })).toBeAttached();
  await expect(page.locator('[data-action="text-gap-open-choice"]')).toBeVisible();
  const evidence = await page.evaluate(() => ({
    requests: globalThis.__manualStudyRequests,
    progressAfter: JSON.stringify(globalThis.__manualStudyRepository.loadProgress()),
    progressBefore: globalThis.__manualStudyProgressBefore
  }));
  expect(evidence.requests).toHaveLength(1);
  expect(evidence.requests[0]).toMatchObject({
    origin: "manual",
    courseId: "course-fixture-minimal",
    expectedCourseRevision: 7,
    didacticMicrosequenceId: "micro-fixture-minimal",
    studyUnitId: "card-fixture-minimal-complete",
    expectedVersion: 3
  });
  expect(evidence.requests[0].studyUnit.content[0].data.text).toBe(
    "A conjunção é verdadeira quando P e Q são verdadeiras."
  );
  expect(evidence.requests[0].studyUnit.response.data.blanks[0].answer).toBe(
    "P e Q são verdadeiras"
  );
  expect(evidence.progressAfter).toBe(evidence.progressBefore);

  await installContextualAssistanceResponses(page, {
    discussionMessage: "Podemos deixar a formulação mais direta.",
    candidateMessage: "A formulação foi revisada.",
    text: "A conjunção só é verdadeira quando P e Q são verdadeiras."
  });
  const assistanceDialog = await prepareContextualAssistance(
    page,
    "Deixe a frase mais direta."
  );
  await page.setViewportSize({ width: 360, height: 800 });
  await assistanceDialog.getByRole("button", { name: "Preparar prévia" }).click();
  await assistanceDialog.getByRole("button", { name: "Aplicar ao rascunho", exact: true }).click();
  await expect(page.getByRole("region", { name: "Rascunho da Assistência por IA" }))
    .toBeVisible();
  await expect(page.getByText(
    "A conjunção só é verdadeira quando",
    { exact: false }
  )).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect(page.getByText("Proposta salva.", { exact: true })).toBeAttached();
  const providerRequest = await page.evaluate(() => globalThis.__manualStudyRequests.at(-1));
  expect(providerRequest.origin).toBe("provider_assistance");
  expect(providerRequest.expectedCourseRevision).toBe(8);
  expect(providerRequest.expectedVersion).toBe(4);
  expect(providerRequest.studyUnit.content[0].data.text).toBe(
    "A conjunção só é verdadeira quando P e Q são verdadeiras."
  );
  expect(await page.evaluate(() => JSON.stringify(
    globalThis.__manualStudyRepository.loadProgress()
  ))).toBe(evidence.progressBefore);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer última edição" }).click();
  await expect(page.getByText("Desfazer preparado. Confira e salve.", { exact: true })).toBeAttached();
  await expect(page.locator('[data-manual-edit-path="text"]')).toContainText(
    "A conjunção é verdadeira quando as duas são verdadeiras."
  );
  expect(await page.evaluate(() => globalThis.__manualStudyRequests.length)).toBe(2);
  await page.getByRole("button", { name: "Cancelar edição" }).click();
  expect(await page.evaluate(() => globalThis.__manualStudyRequests.length)).toBe(2);

  for (const ownership of ["shared", "public"]) {
    await openStudyUnit(page, ownership);
    await expect(page.getByRole("button", { name: "Editar", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Assistência por IA" })).toHaveCount(0);
    await expect(page.locator('[data-action="text-gap-open-choice"]')).toBeVisible();
    expect(await page.evaluate(() => {
      try {
        globalThis.__manualStudyApp.previewManualEdit({
          targetId: "content:card-fixture-minimal-complete-content", pathValues: { text: "Tentativa alheia" }
        });
        return "edição indevidamente aceita";
      } catch (error) { return error.message; }
    })).toBe("A edição contextual não está disponível nesta unidade de estudo.");
    const state = await page.evaluate(() => ({
      requests: globalThis.__manualStudyRequests, project: globalThis.__manualStudySnapshot(),
      progress: JSON.stringify(globalThis.__manualStudyRepository.loadProgress()),
      before: globalThis.__manualStudyProgressBefore
    }));
    expect(state.requests).toEqual([]);
    expect(state.project.courses).toHaveLength(1);
    expect(state.progress).toBe(state.before);
  }
});


test("rascunho por assistência do proprietário e descarte conservam original", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudyUnit(page, "owned");
  await installContextualAssistanceResponses(page, {
    discussionMessage: "Podemos simplificar a explicação.",
    candidateMessage: "A sugestão passou pelo renderer.",
    text: "No rascunho, a conjunção é verdadeira quando as duas são verdadeiras."
  });
  const dialog = await prepareContextualAssistance(
    page,
    "Torne a explicação mais direta."
  );
  await dialog.getByRole("button", { name: "Preparar prévia" }).click();
  await dialog.getByRole("button", { name: "Aplicar ao rascunho", exact: true }).click();
  await expect(page.getByText(
    "No rascunho, a conjunção é verdadeira quando",
    { exact: false }
  )).toBeVisible();
  await page.getByRole("button", { name: "Descartar rascunho" }).click();
  expect(await page.evaluate(() => globalThis.__manualStudyRequests.length)).toBe(0);
  expect(await page.evaluate(() => globalThis.__manualStudySnapshot().courses.length)).toBe(1);
});

test("seleção situada combina múltiplas Unidades e Microssequências antes da conversa", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudyUnit(page, "owned", { duplicateMicrosequence: true });
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator("[data-study-manual-title]").fill("Rascunho ainda não salvo");
  await page.getByRole("button", { name: "Assistência por IA" }).click();
  await expect(page.locator("[data-study-manual-title]")).toContainText(
    "Rascunho ainda não salvo"
  );
  await expect(page.getByText(
    "Salve ou cancele a edição antes de abrir a assistência.",
    { exact: true }
  )).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar edição" })).toBeFocused();
  await page.getByRole("button", { name: "Cancelar edição" }).click();
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(page.getByRole("heading", { name: "Unidades de estudo" })).toBeVisible();
  await page.getByRole("button", { name: "Assistência por IA" }).click();
  const microScope = page.getByRole("region", { name: "Edição com IA" });
  await expect(microScope).toContainText("1 unidade de estudo");
  await expect(page.locator(
    '[data-action="toggle-assistance-target"][aria-pressed="true"]'
  ).first()).toBeFocused();
  const secondUnit = page.locator(
    '[data-action="toggle-assistance-target"][aria-pressed="false"]'
  ).first();
  const secondUnitId = await secondUnit.getAttribute("data-assistance-target-id");
  await secondUnit.click();
  await expect(page.locator(
    `[data-action="toggle-assistance-target"][data-assistance-target-id="${secondUnitId}"]`
  )).toBeFocused();
  await expect(microScope).toContainText("2 unidades de estudo");
  await microScope.getByRole("button", { name: "Cancelar seleção" }).click();
  await expect(page.getByRole("button", { name: "Assistência por IA" })).toBeFocused();

  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(page.getByRole("heading", { name: "Microssequências didáticas" })).toBeVisible();
  await page.getByRole("button", { name: "Assistência por IA" }).click();
  const lessonScope = page.getByRole("region", { name: "Edição com IA" });
  await expect(lessonScope).toContainText("1 microssequência");
  await expect(page.locator(
    '[data-action="toggle-assistance-target"][aria-pressed="true"]'
  ).first()).toBeFocused();
  const secondMicrosequence = page.locator(
    '[data-action="toggle-assistance-target"][aria-pressed="false"]'
  ).first();
  const secondMicrosequenceId = await secondMicrosequence.getAttribute(
    "data-assistance-target-id"
  );
  await secondMicrosequence.click();
  await expect(page.locator(
    `[data-action="toggle-assistance-target"][data-assistance-target-id="${secondMicrosequenceId}"]`
  )).toBeFocused();
  await expect(lessonScope).toContainText("2 microssequências");
  await lessonScope.getByRole("button", { name: "Cancelar seleção" }).click();
  await expect(page.getByRole("button", { name: "Assistência por IA" })).toBeFocused();

  await page.getByRole("button", { name: "Assistência por IA" }).click();
  await page.getByRole("button", { name: "Visualizar", exact: true }).click();
  await expect(lessonScope).toBeHidden();
  await expect(page.getByRole("button", { name: "Visualizar", exact: true })).toBeFocused();

  await page.getByRole("button", { name: "Assistência por IA" }).click();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(lessonScope).toBeHidden();
  await expect(page.locator(".study-structure-editor")).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeFocused();

  await page.locator("[data-study-structure-field='title']").fill(
    "Rascunho estrutural preservado"
  );
  await page.getByRole("button", { name: "Assistência por IA" }).click();
  await expect(page.locator(".study-structure-editor")).toContainText(
    "Rascunho estrutural preservado"
  );
  await expect(page.getByText(
    "Salve ou cancele a edição antes de abrir a assistência.",
    { exact: true }
  )).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar edição" })).toBeFocused();
  await page.getByRole("button", { name: "Cancelar edição" }).click();
  await page.getByRole("button", { name: "Assistência por IA" }).click();
  await expect(lessonScope).toBeVisible();
  await expect(page.locator(
    '[data-action="toggle-assistance-target"][aria-pressed="true"]'
  ).first()).toBeFocused();
});

test("recuperação antiga consulta sem reaplicar e conserva pendência na reconexão", async ({ page }) => {
  await openStudyUnit(page, "shared");
  const pending = await page.evaluate(async () => {
    const value = globalThis.__manualStudyInstallPendingRecovery();
    await globalThis.__manualStudyApp.resumePendingManualEdit();
    globalThis.__manualStudyApp.openCourses();
    return value;
  });
  await page.getByText("Rascunho guardado", { exact: true }).click();
  await expect(page.getByText("Não foi possível confirmar o destino", { exact: false })).toBeVisible();
  await expect(page.locator(".study-draft-recovery-content")).toContainText(pending.studyUnit.content[0].data.text);
  await page.evaluate(() => globalThis.__manualStudyReload());
  expect(await page.evaluate(() => globalThis.__manualStudyPending())).toEqual(pending);
  expect(await page.evaluate(() => globalThis.__manualStudyRequests)).toEqual([]);
  expect(await page.evaluate(() => globalThis.__manualStudyRecoveryReads)).toHaveLength(2);
  expect(await page.evaluate(() => globalThis.__manualStudySnapshot().courses)).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Salvar edição" })).toHaveCount(0);
});

test("resposta antiga confirmada oferece apenas alvo próprio existente e mantém rascunho", async ({ page }) => {
  await openStudyUnit(page, "shared");
  await page.evaluate(async () => {
    const project = globalThis.__manualStudySnapshot();
    const owned = structuredClone(project.courses[0]);
    owned.id = "course-owned-before-upgrade";
    project.courses.push(owned);
    globalThis.__manualStudySetCanonical({ project, courseRevision: 9, studyUnitVersion: 5 });
    globalThis.__manualStudyInstallPendingRecovery();
    globalThis.__manualStudySetRecovery({ status: "confirmed", targetCourseId: owned.id });
    await globalThis.__manualStudyApp.resumePendingManualEdit();
    globalThis.__manualStudyApp.openCourses();
  });
  await page.getByText("Rascunho guardado", { exact: true }).click();
  await expect(page.getByText("O rascunho guardado não será reaplicado.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir meu curso" })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__manualStudySnapshot().courses)).toHaveLength(2);
  expect(await page.evaluate(() => globalThis.__manualStudyPending())).not.toBeNull();
  expect(await page.evaluate(() => globalThis.__manualStudyRequests)).toEqual([]);
});

test("descarte antigo detecta mudança em outra aba sem apagar intenção substituta", async ({ page }) => {
  await openStudyUnit(page, "shared");
  await page.evaluate(async () => {
    globalThis.__manualStudyInstallPendingRecovery();
    await globalThis.__manualStudyApp.resumePendingManualEdit();
    globalThis.__manualStudyApp.openCourses();
  });
  await page.getByText("Rascunho guardado", { exact: true }).click();
  const replacement = await page.evaluate(() => globalThis.__manualStudyInstallPendingRecovery());
  await page.getByRole("button", { name: "Descartar rascunho guardado" }).click();
  await expect(page.getByText("O rascunho guardado mudou.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__manualStudyPending())).toEqual(replacement);
  await page.evaluate(() => globalThis.__manualStudyReload());
  await page.getByText("Rascunho guardado", { exact: true }).click();
  await page.getByRole("button", { name: "Descartar rascunho guardado" }).click();
  expect(await page.evaluate(() => globalThis.__manualStudyPending())).toBeNull();
  expect(await page.evaluate(() => globalThis.__manualStudyRequests)).toEqual([]);
});

test("origem ou unidade removida não apaga rascunho antigo nem cria curso", async ({ page }) => {
  for (const removeCourse of [false, true]) {
    await openStudyUnit(page, "shared");
    const pending = await page.evaluate(async (removeCourse) => {
      const value = globalThis.__manualStudyInstallPendingRecovery();
      const project = globalThis.__manualStudySnapshot();
      if (removeCourse) project.courses = [];
      else project.courses[0].modules[0].lessons[0].microsequences[0].studyUnits.pop();
      globalThis.__manualStudySetCanonical({ project, courseRevision: 9, studyUnitVersion: 5 });
      await globalThis.__manualStudyReload();
      return value;
    }, removeCourse);
    await page.getByText("Rascunho guardado", { exact: true }).click();
    await expect(page.locator(".study-draft-recovery-content")).toContainText(pending.studyUnit.content[0].data.text);
    expect(await page.evaluate(() => globalThis.__manualStudyPending())).toEqual(pending);
    expect(await page.evaluate(() => globalThis.__manualStudyRequests)).toEqual([]);
    await page.getByRole("button", { name: "Descartar rascunho guardado" }).click();
    expect(await page.evaluate(() => globalThis.__manualStudyPending())).toBeNull();
  }
});

test("histórico manual permanece isolado quando dois Cursos reutilizam a mesma Unidade", async ({ page }) => {
  await page.goto("/");
  await page.setContent('<!doctype html><html lang="pt-BR"><head>' +
    STYLES.map((href) => `<link rel="stylesheet" href="${href}">`).join("") +
    '</head><body><div id="study-root"></div></body></html>');
  await page.evaluate(async (projectValue) => {
    const { createCourseStudyApplication } = await import("/src/study/CourseStudyApplication.js");
    const courseA = structuredClone(projectValue.courses[0]);
    const courseB = structuredClone(projectValue.courses[0]);
    courseA.id = "course-history-a";
    courseA.title = "Curso de Ana";
    courseB.id = "course-history-b";
    courseB.title = "Curso de Bruno";
    const canonicalProject = {
      contract: projectValue.contract,
      courses: [courseA, courseB]
    };
    const revisionByCourse = new Map([
      [courseA.id, 3],
      [courseB.id, 5]
    ]);
    const versionByCourse = new Map([
      [courseA.id, 1],
      [courseB.id, 1]
    ]);
    const navigation = {
      contract: "aralearn.course-study-navigation.v1",
      selectedCourseId: courseA.id,
      positions: {},
      updatedAt: "2026-08-21T12:00:00.000Z"
    };
    const summaries = () => canonicalProject.courses.map((course) => ({
      courseId: course.id,
      title: course.title,
      revision: revisionByCourse.get(course.id),
      ownership: "owned",
      canEdit: true,
      moduleCount: 1,
      lessonCount: 1,
      studyUnitCount: 2,
      completedStudyUnitCount: 0,
      availableOffline: true
    }));
    const repository = {
      loadProgress: () => ({ version: 1, lessons: {} }),
      loadCourseSummaries: summaries,
      loadAnnotationsForPath: () => [],
      loadRuntimeStatus: () => ({}),
      loadReviewItems: () => [],
      hasMoreReviewItems: () => false,
      isStudyUnitMarkedForReview: () => false,
      loadCourse: async (courseId) => canonicalProject.courses.find(({ id }) => id === courseId),
      loadProject: () => structuredClone(canonicalProject),
      loadStudyNavigation: () => structuredClone(navigation),
      saveStudyNavigation: async ({ selectedCourseId, position }) => {
        navigation.selectedCourseId = selectedCourseId;
        navigation.updatedAt = new Date().toISOString();
        if (position) navigation.positions[selectedCourseId] = {
          ...structuredClone(position),
          updatedAt: navigation.updatedAt
        };
      },
      clearStudyNavigationPosition: async (courseId) => {
        delete navigation.positions[courseId];
      },
      loadStudyUnitCompositionContext: (reference) => ({
        courseId: reference.courseId,
        courseRevision: revisionByCourse.get(reference.courseId),
        didacticMicrosequenceId: reference.microsequenceId,
        studyUnitId: reference.studyUnitId,
        studyUnitVersion: versionByCourse.get(reference.courseId)
      }),
      flush: async () => true
    };
    const app = createCourseStudyApplication({
      root: document.querySelector("#study-root"),
      repository,
      initialProject: structuredClone(canonicalProject),
      onSaveManualEdit: async (request) => {
        const course = canonicalProject.courses.find(({ id }) => id === request.courseId);
        const units = course.modules[0].lessons[0].microsequences[0].studyUnits;
        const unitIndex = units.findIndex(({ id }) => id === request.studyUnitId);
        units[unitIndex] = structuredClone(request.studyUnit);
        const courseRevision = request.expectedCourseRevision + 1;
        const version = request.expectedVersion + 1;
        revisionByCourse.set(request.courseId, courseRevision);
        versionByCourse.set(request.courseId, version);
        return {
          courseId: request.courseId,
          courseRevision,
          studyUnitId: request.studyUnitId,
          studyUnitVersion: version,
          studyUnit: structuredClone(request.studyUnit),
          version,
          reconciled: true,
          changed: true,
          idempotent: false,
          channel: "application",
          origin: request.origin,
          updatedAt: "2026-08-21T12:01:00.000Z"
        };
      }
    });
    globalThis.__manualHistoryApp = app;
    await app.openCourse(courseA.id);
  }, fixture);
  await openFirstStudyUnitByClicks(page);

  const editCurrentParagraph = async (text) => {
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await page.locator(
      '[data-resource-target-id="content:card-fixture-minimal-regra-content"]'
    ).click();
    await page.locator('[data-manual-edit-path="text"]').fill(text);
    await page.getByRole("button", { name: "Salvar edição" }).click();
    await expect(page.getByText("Edição salva.", { exact: true })).toBeAttached();
  };

  await editCurrentParagraph("Texto salvo somente no Curso de Ana.");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Desfazer última edição" })).toBeVisible();

  await page.evaluate(() => globalThis.__manualHistoryApp.openCourses());
  await page.getByRole("combobox", { name: "Selecionar Curso" }).selectOption("course-history-b");
  await page.getByRole("button", { name: "Abrir Curso de Bruno" }).click();
  await openFirstStudyUnitByClicks(page);
  await expect(page.getByText("Texto salvo somente no Curso de Ana.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Desfazer última edição" })).toBeDisabled();

  await page.evaluate(() => globalThis.__manualHistoryApp.openCourses());
  await page.getByRole("combobox", { name: "Selecionar Curso" }).selectOption("course-history-a");
  await page.getByRole("button", { name: "Abrir Curso de Ana" }).click();
  await openFirstStudyUnitByClicks(page);
  await expect(page.getByText("Texto salvo somente no Curso de Ana.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Desfazer última edição" })).toBeVisible();
});

test("snapshot canônico externo rebasa CAS local sem perder posição nem progresso", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudyUnit(page, "owned");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator(
    '[data-resource-target-id="content:card-fixture-minimal-complete-content"]'
  ).click();
  await page.locator('[data-manual-edit-path="text"]').fill(
    "A conjunção é verdadeira quando P e Q são verdadeiras."
  );
  await page.getByRole("button", { name: "Salvar edição" }).click();
  await expect(page.getByText("Edição salva.", { exact: true })).toBeAttached();

  await page.evaluate(async ({ project }) => {
    const external = structuredClone(project);
    const unit = external.courses[0].modules[0].lessons[0].microsequences[0]
      .studyUnits.find(({ id }) => id === "card-fixture-minimal-complete");
    unit.content[0].data.text = "Alteração externa confirmada pelo ChatGPT.";
    unit.response.data.blanks[0].answer = "Alteração externa confirmada pelo ChatGPT";
    globalThis.__manualStudySetCanonical({
      project: external,
      courseRevision: 9,
      studyUnitVersion: 5
    });
    await globalThis.__manualStudyApp.replaceProject(external);
  }, { project: fixture });
  await expect(page.locator('[data-action="text-gap-open-choice"]')).toBeVisible();

  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator(
    '[data-resource-target-id="content:card-fixture-minimal-complete-content"]'
  ).click();
  const externalField = page.locator('[data-manual-edit-path="text"]');
  await expect(externalField).toHaveAttribute("data-manual-edit-original", "Alteração externa confirmada pelo ChatGPT.");
  await expect(page.locator('[data-action="text-gap-open-choice"]')).toBeVisible();
  await externalField.fill(
    "Alteração externa confirmada pelo ChatGPT em versão posterior."
  );
  await page.getByRole("button", { name: "Salvar edição" }).click();

  const evidence = await page.evaluate(() => ({
    requests: globalThis.__manualStudyRequests,
    progress: JSON.stringify(globalThis.__manualStudyRepository.loadProgress()),
    progressBefore: globalThis.__manualStudyProgressBefore
  }));
  expect(evidence.requests).toHaveLength(2);
  expect(evidence.requests[0]).toMatchObject({
    expectedCourseRevision: 7,
    expectedVersion: 3
  });
  expect(evidence.requests[1]).toMatchObject({
    expectedCourseRevision: 9,
    expectedVersion: 5
  });
  expect(evidence.progress).toBe(evidence.progressBefore);
});

test("Inspeção usa o mesmo editor, mantém assistência owner-only e desfaz apenas como rascunho", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 860 });
  await openInspectionUnit(page, "owned");
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Assistência por IA" })).toBeVisible();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator('[data-resource-target-id="content:inspection-paragraph-1"]').click();
  const field = page.locator('[data-manual-edit-path="text"]');
  await field.fill("Texto de inspeção revisado.");
  await page.getByRole("button", { name: "Salvar edição" }).click();
  await expect(page.getByText("Edição salva.", { exact: true })).toBeAttached();
  expect(await page.evaluate(() => globalThis.__inspectionManualRequests)).toMatchObject([{
    courseId: "10000000-0000-4000-8000-000000000001",
    expectedCourseRevision: 7,
    didacticMicrosequenceId: "micro-a",
    studyUnitId: "inspection-unit-1",
    expectedVersion: 1,
    origin: "manual",
    studyUnit: {
      content: [{ data: { text: "Texto de inspeção revisado." } }]
    }
  }]);

  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer última edição" }).click();
  await expect(page.getByText("Desfazer preparado. Confira e salve.", { exact: true })).toBeAttached();
  await expect(page.locator('[data-manual-edit-path="text"]')).toHaveText(
    "Texto de inspeção original."
  );
  expect(await page.evaluate(() => globalThis.__inspectionManualRequests.length)).toBe(1);
  await page.getByRole("button", { name: "Cancelar edição" }).click();
  expect(await page.evaluate(() => globalThis.__inspectionManualRequests.length)).toBe(1);

  await page.getByRole("button", { name: "Assistência por IA" }).click();
  const assistanceDialog = page.locator("[data-course-assistance]").getByRole("dialog");
  await expect(assistanceDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(assistanceDialog).toHaveCount(0);
  await expect(page.locator(".course-inspection-runtime").getByText(
    "Texto de inspeção revisado.",
    { exact: true }
  )).toBeVisible();

  await openInspectionUnit(page, "shared");
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Assistência por IA" })).toHaveCount(0);
});

test("gravação incerta conserva o rascunho e só libera outro pedido após retry ou descarte explícito", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudyUnit(page, "owned");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator(
    '[data-resource-target-id="content:card-fixture-minimal-complete-content"]'
  ).click();
  const field = page.locator('[data-manual-edit-path="text"]');
  await field.fill("A conjunção somente é verdadeira quando as duas são verdadeiras.");
  await page.evaluate(() => {
    globalThis.__manualStudySaveControl.ambiguousFailures = 1;
  });
  await page.getByRole("button", { name: "Salvar edição" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível confirmar se a edição foi salva"
  );
  await expect(field).toHaveText(
    "A conjunção somente é verdadeira quando as duas são verdadeiras."
  );

  expect(await page.evaluate(async ({ project }) => ({
    replaceResult: await globalThis.__manualStudyApp.replaceProject(project),
    refreshResult: await globalThis.__manualStudyApp.refreshPersonalState(),
    pending: globalThis.__manualStudyApp.hasPendingManualEdit()
  }), { project: fixture })).toEqual({
    replaceResult: false,
    refreshResult: false,
    pending: true
  });
  await expect(field).toHaveText(
    "A conjunção somente é verdadeira quando as duas são verdadeiras."
  );

  await page.getByRole("button", { name: "Cancelar edição" }).click();
  await expect(page.getByRole("button", {
    name: "Descartar rascunho com resultado incerto"
  })).toBeVisible();
  await page.getByRole("button", { name: "Manter rascunho" }).click();
  await page.getByRole("button", { name: "Salvar edição" }).click();
  await expect(page.getByText("Edição salva.", { exact: true })).toBeAttached();
  const attempts = await page.evaluate(() => globalThis.__manualStudyRequests);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);

  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator(
    '[data-resource-target-id="content:card-fixture-minimal-complete-content"]'
  ).click();
  await field.fill(
    "A conjunção permanece verdadeira somente quando as duas são verdadeiras."
  );
  await page.evaluate(() => {
    globalThis.__manualStudySaveControl.ambiguousFailures = 1;
  });
  await page.getByRole("button", { name: "Salvar edição" }).click();
  await page.getByRole("button", { name: "Cancelar edição" }).click();
  await page.getByRole("button", {
    name: "Descartar rascunho com resultado incerto"
  }).click();
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeFocused();
  await expect(page.locator('[data-manual-edit-path="text"]')).toHaveCount(0);
});

test("confirmação gravada sem releitura encerra o pedido e sinaliza sincronização pendente", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudyUnit(page, "owned");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator(
    '[data-resource-target-id="content:card-fixture-minimal-complete-content"]'
  ).click();
  await page.locator('[data-manual-edit-path="text"]').fill(
    "A conjunção só é verdadeira quando as duas são verdadeiras."
  );
  await page.evaluate(() => {
    globalThis.__manualStudySaveControl.reconciled = false;
  });
  await page.getByRole("button", { name: "Salvar edição" }).click();
  await expect(page.getByText(
    "Edição salva. A atualização completa ocorrerá na próxima sincronização.",
    { exact: true }
  )).toBeAttached();
  expect(await page.evaluate(() => globalThis.__manualStudyRequests.length)).toBe(1);
  await expect(page.locator('[data-manual-edit-path="text"]')).toHaveCount(0);
});

async function elementGeometry(page, selectors) {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate((selectors) => Object.fromEntries(selectors.map((selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Elemento geométrico ausente: ${selector}`);
    const { x, y, width, height } = element.getBoundingClientRect();
    return [selector, { x, y, width, height }];
  })), selectors);
}

function expectSameGeometry(before, after, context) {
  for (const [selector, values] of Object.entries(before)) {
    for (const property of ["x", "y", "width", "height"]) {
      expect(Math.abs(values[property] - after[selector][property]),
        `${context}: ${selector} ${property}`).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);
    }
  }
}

test("edição conserva cabeçalho e prática até 1px; prosa cresce sem mover controles", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const controls = ['header [data-action="go-back"]', 'header [data-action="go-home"]',
    'header [aria-label="Visualizar"]', 'header [aria-label="Editar"]',
    'header [aria-label="Assistência por IA"]', 'header [data-action="open-settings"]'];
  const content = [".runtime-card-title", ".runtime-paragraph-block > p", ".study-stage"];
  for (const theme of ["light", "dark"]) {
    for (const width of VIEWPORTS) {
      await page.setViewportSize({ width, height: 900 });
      await openStudyUnit(page, "owned", { longTitles: true });
      await page.evaluate((theme) => {
        document.documentElement.dataset.colorMode = theme;
        document.documentElement.dataset.themePreference = theme;
        document.documentElement.style.fontSize = "16px";
      }, theme);
      const before = await elementGeometry(page, [...controls, ...content]);
      await page.getByRole("button", { name: "Editar", exact: true }).click();
      expectSameGeometry(before, await elementGeometry(page, [...controls, ...content]), `${width}/${theme}/título`);
      await expect(page.locator('[data-action="text-gap-open-choice"]')).toBeVisible();
      await page.locator('[data-resource-target-id="content:card-fixture-minimal-complete-content"]').click();
      const field = page.locator('[data-manual-edit-path="text"]');
      await expect(field).toBeFocused();
      expectSameGeometry(before, await elementGeometry(page, [...controls, ...content]), `${width}/${theme}/componente`);
      await expect(page.locator('[data-action="text-gap-open-choice"]')).toBeVisible();
      await field.press("End");
      await field.pressSequentially(" A mesma regra pode ser conferida em cada combinação.");
      const canonicalDraft = await page.evaluate(async () => {
        const { readManualStudyUnitEditPathValues } = await import("/src/ui/manualStudyUnitEdit.js");
        return readManualStudyUnitEditPathValues(document.querySelector('.is-inline-editing')).text;
      });
      expect(canonicalDraft).toContain("as duas são verdadeiras");
      expect(canonicalDraft).not.toMatch(/[\uE000-\uE102]/u);
      await field.fill("A conjunção é verdadeira quando as duas são verdadeiras. " +
        "Esta explicação adicional conserva a largura e desenvolve o raciocínio sem reduzir a fonte. ".repeat(8));
      const grown = await elementGeometry(page, [...controls, ...content]);
      expectSameGeometry(Object.fromEntries(controls.map((key) => [key, before[key]])), grown, `${width}/${theme}/crescimento`);
      expect(grown[content[1]].height).toBeGreaterThan(before[content[1]].height);
      expect(Math.abs(grown[content[1]].x - before[content[1]].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(grown[content[1]].width - before[content[1]].width)).toBeLessThanOrEqual(1);
      await page.getByRole("button", { name: "Cancelar edição" }).click();
      await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeFocused();
      expectSameGeometry(before, await elementGeometry(page, [...controls, ...content]), `${width}/${theme}/cancelar`);
      expect(await page.evaluate(() => globalThis.__manualStudyRequests)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      if (width === 390) await testInfo.attach(`estudo-${theme}-390`, {
        body: await page.screenshot({ path: `.tmp/manual-299-geometry/estudo-${theme}-390.png` }), contentType: "image/png"
      });
    }
  }
});

test("inspeção preserva título e cabeçalho ao editar nos temas e quatro larguras", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  for (const theme of ["light", "dark"]) {
    for (const width of VIEWPORTS) {
      await page.setViewportSize({ width, height: 900 });
      await openInspectionUnit(page, "owned", { longTitles: true });
      await page.evaluate((theme) => { document.documentElement.dataset.colorMode = theme; }, theme);
      const selectors = ['.course-inspection-item-heading', '.course-inspection-item-heading h3',
        '.course-inspection-mode-actions [aria-label="Visualizar"]',
        '.course-inspection-mode-actions [aria-label="Editar"]',
        '.course-inspection-mode-actions [aria-label="Assistência por IA"]',
        '.runtime-paragraph-block > p'];
      const before = await elementGeometry(page, selectors);
      await page.getByRole("button", { name: "Editar", exact: true }).click();
      expectSameGeometry(before, await elementGeometry(page, selectors), `${width}/${theme}/inspeção`);
      await page.locator('[data-resource-target-id="content:inspection-paragraph-1"]').click();
      await expect(page.locator('[data-manual-edit-path="text"]')).toBeEditable();
      expectSameGeometry(Object.fromEntries(selectors.filter((key) => !key.endsWith("h3")).map((key) => [key, before[key]])),
        await elementGeometry(page, selectors.filter((key) => !key.endsWith("h3"))), `${width}/${theme}/texto da inspeção`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      if (width === 390) await testInfo.attach(`inspecao-${theme}-390`, {
        body: await page.screenshot({ path: `.tmp/manual-299-geometry/inspecao-${theme}-390.png` }), contentType: "image/png"
      });
    }
  }
});

test("controles equivalentes mantêm coordenadas entre os níveis de Estudo", async ({ page }) => {
  test.setTimeout(120_000);
  const selectors = ['header [data-action="go-back"]', 'header [data-action="go-home"]',
    'header [aria-label="Visualizar"]', 'header [aria-label="Editar"]',
    'header [data-action="open-settings"]'];
  const evidence = [];
  for (const theme of ["light", "dark"]) {
    for (const width of VIEWPORTS) {
      await page.setViewportSize({ width, height: 900 });
      await openStudyUnit(page, "owned", { longTitles: true });
      await page.evaluate((theme) => { document.documentElement.dataset.colorMode = theme; }, theme);
      const reference = await elementGeometry(page, selectors);
      await page.getByRole("button", { name: "Voltar", exact: true }).click();
      const microsequence = await elementGeometry(page, selectors);
      expectSameGeometry(reference, microsequence, `${width}/${theme}/microssequência`);
      evidence.push({ width, theme, level: "microssequência", controls: microsequence });
      await page.evaluate(() => globalThis.__manualStudyApp.openCourse("course-fixture-minimal"));
      for (const [level, next] of [["curso", "Abrir módulo"], ["módulo", "Abrir lição"],
        ["lição", "Abrir microssequência didática"]]) {
        const actual = await elementGeometry(page, selectors);
        expectSameGeometry(reference, actual, `${width}/${theme}/${level}`);
        evidence.push({ width, theme, level, controls: actual });
        await page.getByRole("button", { name: next, exact: true }).first().click({ timeout: 5000 });
      }
    }
  }
  fs.mkdirSync(".tmp/manual-299-geometry", { recursive: true });
  fs.writeFileSync(".tmp/manual-299-geometry/header-levels.json", JSON.stringify({ tolerancePx: GEOMETRY_TOLERANCE, evidence }, null, 2));
});

test("rascunho manual mantém sua revisão de origem quando outra aba grava", async ({ page }) => {
  await openStudyUnit(page, "owned");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator('[data-resource-target-id="content:card-fixture-minimal-complete-content"]').click();
  const draft = "No meu rascunho, a conjunção é verdadeira quando as duas são verdadeiras.";
  const field = page.locator('[data-manual-edit-path="text"]');
  await field.fill(draft);
  const replaced = await page.evaluate(async () => {
    const project = globalThis.__manualStudySnapshot();
    project.courses[0].modules[0].lessons[0].microsequences[0].studyUnits[1].title = "Título da outra aba";
    globalThis.__manualStudySetCanonical({ project, courseRevision: 9, studyUnitVersion: 5 });
    return globalThis.__manualStudyApp.replaceProject(project);
  });
  expect(replaced).toBe(false);
  await expect(field).toHaveText(draft);
  await page.getByRole("button", { name: "Salvar edição" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(field).toHaveText(draft);
  const state = await page.evaluate(() => ({ requests: globalThis.__manualStudyRequests,
    project: globalThis.__manualStudySnapshot() }));
  expect(state.requests).toHaveLength(1);
  expect(state.requests[0]).toMatchObject({ expectedCourseRevision: 7, expectedVersion: 3 });
  expect(state.project.courses[0].modules[0].lessons[0].microsequences[0].studyUnits[1].title).toBe("Título da outra aba");
  expect(state.project.courses[0].modules[0].lessons[0].microsequences[0].studyUnits[1].content[0].data.text).not.toBe(draft);
  await page.getByRole("button", { name: "Cancelar edição" }).click();
  expect(await page.evaluate(() => globalThis.__manualStudyRequests)).toHaveLength(1);
});
