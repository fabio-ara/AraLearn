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
  } else {
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

async function openStudyUnit(page, ownership, { duplicateMicrosequence = false } = {}) {
  const project = structuredClone(fixture);
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
    let personalCopyCourseId = null;
    let pendingPersonalCopyEdit = null;
    let personalRequestIndex = 0;
    const sourceCourseId = "course-fixture-minimal";
    const nextPersonalRequestId = () =>
      `request-personal-${String.fromCharCode(80 + personalRequestIndex++)}`;
    const repository = {
      loadProgress: () => structuredClone(progress),
      loadCourseSummaries: () => canonicalProject.courses.map((course) => {
        const personalCopy = course.id === personalCopyCourseId;
        return {
          courseId: course.id,
          title: course.title,
          revision: personalCopy ? 2 : canonicalRevision,
          ownership: personalCopy ? "owned" : ownership,
          canEdit: personalCopy || ownership === "owned",
          canDerive: !personalCopy && ownership === "shared" && !personalCopyCourseId,
          isPersonalCopy: personalCopy,
          personalCopyCourseId: !personalCopy && personalCopyCourseId,
          moduleCount: 1,
          lessonCount: 1,
          studyUnitCount: 2,
          completedStudyUnitCount: personalCopy ? 0 : 1
        };
      }),
      loadAnnotationsForPath: () => [],
      loadRuntimeStatus: () => ({}),
      loadReviewItems: () => [],
      hasMoreReviewItems: () => false,
      isStudyUnitMarkedForReview: () => false,
      loadCourse: async (courseId) => canonicalProject.courses.find(({ id }) =>
        id === courseId),
      loadProject: () => structuredClone(canonicalProject),
      refreshCourses: async () => structuredClone(canonicalProject),
      loadPendingPersonalCopyEdit: async (requestedSourceCourseId = null) =>
        pendingPersonalCopyEdit && (
          requestedSourceCourseId == null ||
          requestedSourceCourseId === pendingPersonalCopyEdit.sourceCourseId
        )
          ? structuredClone(pendingPersonalCopyEdit)
          : null,
      clearPendingPersonalCopyEdit: async (
        requestedSourceCourseId = null,
        requestedRequestId = null
      ) => {
        if (!pendingPersonalCopyEdit ||
            requestedSourceCourseId != null &&
              requestedSourceCourseId !== pendingPersonalCopyEdit.sourceCourseId ||
            requestedRequestId != null &&
              requestedRequestId !== pendingPersonalCopyEdit.requestId) return false;
        pendingPersonalCopyEdit = null;
        return true;
      },
      retryPendingPersonalCopyEdit: async (requestedSourceCourseId = null) => {
        const pending = pendingPersonalCopyEdit;
        if (!pending || requestedSourceCourseId != null &&
            requestedSourceCourseId !== pending.sourceCourseId) return null;
        return saveManualEdit({
          courseId: pending.sourceCourseId,
          expectedCourseRevision: pending.expectedSourceCourseRevision,
          didacticMicrosequenceId: pending.didacticMicrosequenceId,
          studyUnitId: pending.studyUnit.id,
          expectedVersion: pending.expectedStudyUnitVersion,
          studyUnit: structuredClone(pending.studyUnit),
          origin: pending.origin,
          targetId: pending.targetId,
          sourceSelection: structuredClone(pending.sourceSelection),
          createsPersonalCopy: true,
          replacesPendingRequestId: null,
          retryRequestId: pending.requestId
        });
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
      personalCopyConflict: false,
      reconciled: true
    };

    function pendingFromRequest(request, requestId) {
      return {
        requestId,
        sourceCourseId: request.courseId,
        expectedSourceCourseRevision: request.expectedCourseRevision,
        expectedStudyUnitVersion: request.expectedVersion,
        didacticMicrosequenceId: request.didacticMicrosequenceId,
        sourceSelection: structuredClone(request.sourceSelection),
        targetId: request.targetId,
        studyUnit: structuredClone(request.studyUnit),
        origin: request.origin
      };
    }

    function personalCopyTarget() {
      const source = canonicalProject.courses.find(({ id }) => id === sourceCourseId);
      const existing = canonicalProject.courses.find(({ id }) => id === personalCopyCourseId);
      const target = structuredClone(existing || source);
      personalCopyCourseId ||= "course-fixture-personal";
      target.id = personalCopyCourseId;
      canonicalProject = {
        ...canonicalProject,
        courses: [source, target]
      };
      return { source, target };
    }

    async function saveManualEdit(request) {
      const personalCopy = request.createsPersonalCopy === true;
      let requestId = null;
      if (personalCopy) {
        if (request.retryRequestId) {
          requestId = request.retryRequestId;
        } else if (request.replacesPendingRequestId) {
          if (pendingPersonalCopyEdit?.requestId !== request.replacesPendingRequestId) {
            throw new Error("O pedido substituído não corresponde ao rascunho pendente.");
          }
          requestId = nextPersonalRequestId();
        } else {
          requestId = pendingPersonalCopyEdit?.requestId || nextPersonalRequestId();
        }
        pendingPersonalCopyEdit = pendingFromRequest(request, requestId);
      }
      const recorded = structuredClone(request);
      delete recorded.retryRequestId;
      if (requestId) recorded.requestId = requestId;
      requests.push(recorded);

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
      if (personalCopy && globalThis.__manualStudySaveControl.personalCopyConflict) {
        personalCopyTarget();
        const error = new Error("A cópia pessoal já existe.");
        error.code = "personal_copy_exists";
        error.targetCourseId = personalCopyCourseId;
        error.pending = structuredClone(pendingPersonalCopyEdit);
        throw error;
      }
      if (personalCopy) {
        const { target } = personalCopyTarget();
        const units = target.modules[0].lessons[0].microsequences[0].studyUnits;
        const unitIndex = units.findIndex(({ id }) => id === request.studyUnitId);
        units[unitIndex] = structuredClone(request.studyUnit);
        pendingPersonalCopyEdit = null;
        return {
          courseId: personalCopyCourseId,
          sourceCourseId,
          courseRevision: 2,
          studyUnitId: request.studyUnitId,
          studyUnitVersion: 2,
          studyUnit: structuredClone(request.studyUnit),
          version: 2,
          project: structuredClone(canonicalProject),
          createdCopy: true,
          reconciled: true,
          changed: true,
          idempotent: false,
          channel: "application",
          origin: request.origin,
          updatedAt: "2026-08-20T12:00:00.000Z"
        };
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
      return app.resumePendingManualEdit({ retry });
    };
    const app = mountStudyApplication();
    await app.openCourse(sourceCourseId);
  }, { project, ownership });
  await openSecondStudyUnitByClicks(page);
  await expect(page.getByLabel("Unidade 2 de 2")).toBeVisible();
}

async function openInspectionUnit(page, ownership) {
  await page.goto("/");
  await page.setContent('<!doctype html><html lang="pt-BR"><head>' +
    STYLES.map((href) => `<link rel="stylesheet" href="${href}">`).join("") +
    '</head><body><main class="course-authoring-root"><div id="inspection-root"></div></main></body></html>');
  await page.evaluate(async ({ ownership }) => {
    const { createCourseInspectionSequence } = await import(
      "/src/ui/CourseInspectionSequence.js"
    );
    const courseId = "10000000-0000-4000-8000-000000000001";
    const partId = "20000000-0000-4000-8000-000000000002";
    const studyUnit = {
      id: "inspection-unit-1",
      position: 1,
      title: "Relações",
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
              pendingObservationCount: 0,
              production: null,
              design: null
            },
            deepLink: `#/authoring/courses/${courseId}?section=inspection&studyUnitId=${studyUnit.id}`
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
    globalThis.__inspectionManualSequence = createCourseInspectionSequence({
      root: document.querySelector("#inspection-root"),
      controller,
      course: {
        courseId,
        revision: 7,
        title: "Curso de relações",
        ownership,
        canEdit: ownership === "owned"
      },
      onSaveManualEdit: (request) => controller.commitCourseComposition(request),
      windowValue: window,
      documentValue: document,
      navigatorValue: navigator
    });
    await globalThis.__inspectionManualSequence.open();
  }, { ownership });
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
  await expect(page.getByRole("region", { name: "Alcance da Assistência por IA" }))
    .toContainText("Unidade inteira");
  await expect(page.getByRole("button", { name: "Unidade inteira" })).toBeFocused();
  await page.getByRole("button", { name: "Conversar" }).click();
  const dialog = page.locator("[data-course-assistance]").getByRole("dialog");
  await expect(dialog).toBeVisible();
  const connection = dialog.locator(".course-assistance-connection");
  await expect(connection).toHaveJSProperty("open", true);
  await dialog.locator("[data-course-assistance-provider]").selectOption("openai");
  await dialog.locator("[data-course-assistance-model]").selectOption("gpt-5.6-luna");
  await dialog.getByLabel("Chave da OpenAI").fill("segredo-somente-em-memoria");
  await dialog.getByLabel("Mensagem").fill(request);
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await expect(dialog.getByText("Antes da mudança", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Confirmar e preparar" }).click();
  await expect(dialog.getByText("Proposta validada", { exact: true })).toBeVisible();
  return dialog;
}

test("os 32 packages preservam edição textual no renderer entre 360 e 1280 px", async ({ page }) => {
  const catalog = packageCatalogDocument();
  expect(catalog.cases).toHaveLength(32);
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

test("autor edita no lugar e estudante continua na cópia pessoal sem alterar o original", async ({ page }) => {
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
  await expect(page.getByText("Edição salva.", { exact: true })).toBeVisible();
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
  await assistanceDialog.getByRole("button", { name: "Ver prévia" }).click();
  await expect(page.getByText(
    "A conjunção só é verdadeira quando",
    { exact: false }
  )).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Voltar à conversa" }).click();
  await expect(assistanceDialog.getByLabel("Mensagem")).toBeFocused();
  await assistanceDialog.getByRole("button", { name: "Aplicar ao rascunho" }).click();
  await expect(page.getByRole("region", { name: "Rascunho da Assistência por IA" }))
    .toBeVisible();
  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect(page.getByText("Proposta salva.", { exact: true })).toBeVisible();
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
  await expect(page.getByText("Desfazer preparado. Confira e salve.", { exact: true })).toBeVisible();
  await expect(page.locator('[data-manual-edit-path="text"]')).toContainText(
    "A conjunção é verdadeira quando as duas são verdadeiras."
  );
  expect(await page.evaluate(() => globalThis.__manualStudyRequests.length)).toBe(2);
  await page.getByRole("button", { name: "Cancelar edição" }).click();
  expect(await page.evaluate(() => globalThis.__manualStudyRequests.length)).toBe(2);

  await openStudyUnit(page, "shared");
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Assistência por IA" })).toBeVisible();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator(
    '[data-resource-target-id="content:card-fixture-minimal-complete-content"]'
  ).click();
  await page.locator('[data-manual-edit-path="text"]').fill(
    "Na cópia, a conjunção é verdadeira quando as duas são verdadeiras."
  );
  await expect(page.getByText(
    "Ao salvar, o AraLearn criará uma cópia privada para você. O Curso compartilhado continuará intacto."
  )).toBeVisible();
  await page.getByRole("button", { name: "Salvar na minha cópia" }).click();
  await expect(page.getByText(
    "Cópia criada. Você continua nesta Unidade.",
    { exact: true }
  )).toBeVisible();
  await expect(page.getByText("Sua cópia", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Unidade 2 de 2")).toBeVisible();
  await expect(page.locator('[data-action="text-gap-open-choice"]')).toBeVisible();
  const personalCopy = await page.evaluate(() => ({
    requests: globalThis.__manualStudyRequests,
    project: globalThis.__manualStudySnapshot(),
    progressAfter: JSON.stringify(globalThis.__manualStudyRepository.loadProgress()),
    progressBefore: globalThis.__manualStudyProgressBefore
  }));
  expect(personalCopy.requests).toHaveLength(1);
  expect(personalCopy.requests[0]).toMatchObject({
    courseId: "course-fixture-minimal",
    createsPersonalCopy: true,
    origin: "manual"
  });
  expect(personalCopy.project.courses).toHaveLength(2);
  expect(personalCopy.project.courses[0].modules[0].lessons[0]
    .microsequences[0].studyUnits[1].content[0].data.text).not.toBe(
    "Na cópia, a conjunção é verdadeira quando as duas são verdadeiras."
  );
  expect(personalCopy.project.courses[1].modules[0].lessons[0]
    .microsequences[0].studyUnits[1].content[0].data.text).toBe(
    "Na cópia, a conjunção é verdadeira quando as duas são verdadeiras."
  );
  expect(personalCopy.progressAfter).toBe(personalCopy.progressBefore);
});

test("cópia pessoal permanece legível nos quatro tamanhos e nos dois temas", async ({ page }) => {
  for (const theme of ["light", "dark"]) {
    for (const width of VIEWPORTS) {
      await page.setViewportSize({
        width,
        height: width === 360 ? 800 : width === 390 ? 844 : 900
      });
      await openStudyUnit(page, "shared");
      await page.evaluate((selectedTheme) => {
        globalThis.AraLearnTheme.setPreference(selectedTheme);
        document.documentElement.dataset.themePreference = selectedTheme;
        document.documentElement.dataset.colorMode = selectedTheme;
      }, theme);
      await expect(page.locator("html")).toHaveAttribute("data-color-mode", theme);
      await page.getByRole("button", { name: "Editar", exact: true }).click();
      await page.locator(
        '[data-resource-target-id="content:card-fixture-minimal-complete-content"]'
      ).click();
      await page.locator('[data-manual-edit-path="text"]').fill(
        "Na cópia, a conjunção é verdadeira quando as duas são verdadeiras."
      );
      const save = page.getByRole("button", { name: "Salvar na minha cópia" });
      await expect(save).toBeVisible();
      const before = await page.evaluate(() => {
        const screen = document.querySelector(".screen-content")?.getBoundingClientRect();
        const saveButton = document.querySelector(
          '[data-action="study-manual-save"]'
        )?.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          screen: screen && { left: screen.left, right: screen.right, width: screen.width },
          saveButton: saveButton && { width: saveButton.width, height: saveButton.height },
          text: document.body.innerText
        };
      });
      expect(before.overflow, `${width}px ${theme} sem overflow`).toBeLessThanOrEqual(1);
      expect(before.screen.width, `${width}px ${theme} limitado a 430 px`).toBeLessThanOrEqual(431);
      expect(before.screen.left, `${width}px ${theme} dentro do viewport`).toBeGreaterThanOrEqual(-1);
      expect(before.screen.right, `${width}px ${theme} dentro do viewport`).toBeLessThanOrEqual(width + 1);
      if (width > 430) {
        expect(
          Math.abs((before.screen.left + before.screen.right) / 2 - width / 2),
          `${width}px ${theme} centralizado`
        ).toBeLessThanOrEqual(1.5);
      }
      expect(Math.min(before.saveButton.width, before.saveButton.height)).toBeGreaterThanOrEqual(43);
      expect(before.text).not.toMatch(
        /\b[0-9a-f]{8}-[0-9a-f-]{27}\b|\bsha(?:-?256)?\b|\brevis[aã]o\s+\d+/iu
      );
      await save.click();
      await expect(page.getByText("Sua cópia", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Unidade 2 de 2")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth -
        document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
  }
});

test("prévia por API e cancelamento não criam cópia pessoal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudyUnit(page, "shared");
  await installContextualAssistanceResponses(page, {
    discussionMessage: "Podemos simplificar a explicação.",
    candidateMessage: "A sugestão passou pelo renderer.",
    text: "No rascunho, a conjunção é verdadeira quando as duas são verdadeiras."
  });
  const dialog = await prepareContextualAssistance(
    page,
    "Torne a explicação mais direta."
  );
  await dialog.getByRole("button", { name: "Aplicar ao rascunho" }).click();
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
  await expect(page.getByRole("heading", { name: "Unidades" })).toBeVisible();
  await page.getByRole("button", { name: "Assistência por IA" }).click();
  const microScope = page.getByRole("region", { name: "Alcance da Assistência por IA" });
  await expect(microScope).toContainText("1 Unidade");
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
  await expect(microScope).toContainText("2 Unidades");
  await microScope.getByRole("button", { name: "Cancelar seleção" }).click();
  await expect(page.getByRole("button", { name: "Assistência por IA" })).toBeFocused();

  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(page.getByRole("heading", { name: "Microssequências didáticas" })).toBeVisible();
  await page.getByRole("button", { name: "Assistência por IA" }).click();
  const lessonScope = page.getByRole("region", { name: "Alcance da Assistência por IA" });
  await expect(lessonScope).toContainText("1 Microssequência");
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
  await expect(lessonScope).toContainText("2 Microssequências");
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

test("rascunho pessoal pendente reaparece e a reconexão retoma o mesmo pedido", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudyUnit(page, "shared");
  await page.evaluate(async () => {
    globalThis.__manualStudyInstallPendingRecovery();
    await globalThis.__manualStudyApp.resumePendingManualEdit({ retry: false });
  });
  await expect(page.getByText(
    "A alteração está guardada neste dispositivo. Conecte-se e salve novamente para criar sua cópia."
  )).toBeVisible();
  await expect(page.locator('[data-manual-edit-path="text"]')).toContainText(
    "Na retomada, a conjunção é verdadeira quando as duas são verdadeiras."
  );
  await expect(page.getByRole("button", { name: "Salvar na minha cópia" })).toBeFocused();

  await page.evaluate(() => globalThis.__manualStudyApp.resumePendingManualEdit({ retry: true }));
  await expect(page.getByText(
    "Cópia criada. Você continua nesta Unidade.",
    { exact: true }
  )).toBeVisible();
  await expect(page.getByText("Sua cópia", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Unidade 2 de 2")).toBeVisible();
});

test("duas abas convergem para uma cópia e preservam o rascunho conflitante", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudyUnit(page, "shared");
  await page.evaluate(() => {
    globalThis.__manualStudySaveControl.personalCopyConflict = true;
  });
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator(
    '[data-resource-target-id="content:card-fixture-minimal-complete-content"]'
  ).click();
  const draft = "Na segunda aba, a conjunção é verdadeira quando as duas são verdadeiras.";
  await page.locator('[data-manual-edit-path="text"]').fill(draft);
  await page.getByRole("button", { name: "Salvar na minha cópia" }).click();
  await expect(page.getByText(
    "Sua cópia já existia. Revise esta alteração na cópia e salve novamente."
  )).toBeVisible();
  await expect(page.getByText("Sua cópia", { exact: true })).toBeVisible();
  await expect(page.locator('[data-manual-edit-path="text"]')).toContainText(draft);
  await expect(page.getByRole("button", { name: "Salvar edição" })).toBeVisible();

  await page.evaluate(() => {
    globalThis.__manualStudySaveControl.personalCopyConflict = false;
  });
  await page.getByRole("button", { name: "Salvar edição" }).click();
  await expect(page.getByText("Edição salva.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__manualStudyRequests.length)).toBe(2);
});

test("rebase da cópia preserva o pedido anterior e torna o substituto durável", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudyUnit(page, "shared");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator(
    '[data-resource-target-id="content:card-fixture-minimal-complete-content"]'
  ).click();
  const draft = "No rascunho refeito, a conjunção é verdadeira quando as duas são verdadeiras.";
  const field = page.locator('[data-manual-edit-path="text"]');
  await field.fill(draft);
  await page.evaluate(() => {
    const current = globalThis.__manualStudySnapshot();
    current.courses[0].modules[0].lessons[0].microsequences[0]
      .studyUnits[1].content[0].data.text =
        "Na base atual, a conjunção continua verdadeira quando as duas são verdadeiras.";
    globalThis.__manualStudySaveControl.staleCanonical = {
      project: current,
      courseRevision: 9,
      studyUnitVersion: 5
    };
    globalThis.__manualStudySaveControl.staleFailures = 2;
  });

  await page.getByRole("button", { name: "Salvar na minha cópia" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "O Curso mudou. Revise a alteração sobre a Unidade atual e salve novamente."
  );
  await expect(field).toHaveText(draft);
  const firstRebase = await page.evaluate(() => ({
    pending: globalThis.__manualStudyPending(),
    requests: structuredClone(globalThis.__manualStudyRequests)
  }));
  expect(firstRebase.pending.requestId).toBe("request-personal-P");
  expect(firstRebase.requests).toHaveLength(1);
  expect(firstRebase.requests[0]).toMatchObject({
    requestId: "request-personal-P",
    expectedCourseRevision: 7,
    expectedVersion: 3,
    replacesPendingRequestId: null
  });

  await page.evaluate(() => globalThis.__manualStudyReload({ retry: true }));
  await expect(page.getByRole("alert")).toContainText(
    "O Curso mudou. Revise a alteração sobre a Unidade atual e salve novamente."
  );
  await expect(field).toHaveText(draft);
  const afterReload = await page.evaluate(() => ({
    pending: globalThis.__manualStudyPending(),
    requests: structuredClone(globalThis.__manualStudyRequests)
  }));
  expect(afterReload.pending.requestId).toBe("request-personal-P");
  expect(afterReload.requests).toHaveLength(2);
  expect(afterReload.requests.map(({ requestId }) => requestId)).toEqual([
    "request-personal-P",
    "request-personal-P"
  ]);

  await page.evaluate(() => {
    globalThis.__manualStudySaveControl.ambiguousFailures = 2;
  });
  await page.getByRole("button", { name: "Salvar na minha cópia" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível confirmar se a edição foi salva"
  );
  const replacement = await page.evaluate(() => ({
    pending: globalThis.__manualStudyPending(),
    request: structuredClone(globalThis.__manualStudyRequests.at(-1))
  }));
  expect(replacement.pending.requestId).toBe("request-personal-Q");
  expect(replacement.request).toMatchObject({
    requestId: "request-personal-Q",
    expectedCourseRevision: 9,
    expectedVersion: 5,
    replacesPendingRequestId: "request-personal-P"
  });

  await page.getByRole("button", { name: "Salvar na minha cópia" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível confirmar se a edição foi salva"
  );
  const retry = await page.evaluate(() => ({
    pending: globalThis.__manualStudyPending(),
    requests: structuredClone(globalThis.__manualStudyRequests.slice(-2))
  }));
  expect(retry.pending.requestId).toBe("request-personal-Q");
  expect(retry.requests.map(({ requestId }) => requestId)).toEqual([
    "request-personal-Q",
    "request-personal-Q"
  ]);

  await page.getByRole("button", { name: "Cancelar edição" }).click();
  await page.getByRole("button", {
    name: "Descartar rascunho com resultado incerto"
  }).click();
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeFocused();
  await expect(field).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__manualStudyPending())).toBeNull();
});

test("conflito de cópia sobrevive à recarga e limpar o editor remove o pedido", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudyUnit(page, "shared");
  await page.evaluate(() => {
    globalThis.__manualStudySaveControl.personalCopyConflict = true;
  });
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator(
    '[data-resource-target-id="content:card-fixture-minimal-complete-content"]'
  ).click();
  const draft = "Na cópia reencontrada, a conjunção é verdadeira quando as duas são verdadeiras.";
  const field = page.locator('[data-manual-edit-path="text"]');
  await field.fill(draft);
  await page.getByRole("button", { name: "Salvar na minha cópia" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Sua cópia já existia. Revise esta alteração na cópia e salve novamente."
  );
  const pendingRequestId = await page.evaluate(() =>
    globalThis.__manualStudyPending()?.requestId
  );
  expect(pendingRequestId).toBe("request-personal-P");

  await page.evaluate(() => globalThis.__manualStudyReload({ retry: true }));
  await expect(page.getByRole("alert")).toContainText(
    "Sua cópia já existia. Revise esta alteração na cópia e salve novamente."
  );
  await expect(page.getByText("Sua cópia", { exact: true })).toBeVisible();
  await expect(field).toHaveText(draft);
  expect(await page.evaluate(() => globalThis.__manualStudyPending()?.requestId)).toBe(
    pendingRequestId
  );

  await page.evaluate(() => {
    globalThis.__manualStudySaveControl.personalCopyConflict = false;
  });
  await page.getByRole("button", { name: "Salvar edição" }).click();
  await expect(page.getByText("Edição salva.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__manualStudyPending())).toBeNull();

  const nextPendingRequestId = await page.evaluate(async () => {
    const pending = globalThis.__manualStudyInstallPendingRecovery();
    globalThis.__manualStudySaveControl.personalCopyConflict = true;
    await globalThis.__manualStudyApp.resumePendingManualEdit({ retry: true });
    return pending.requestId;
  });
  await expect(page.getByRole("alert")).toContainText(
    "Sua cópia já existia. Revise esta alteração na cópia e salve novamente."
  );
  expect(await page.evaluate(() => globalThis.__manualStudyPending()?.requestId)).toBe(
    nextPendingRequestId
  );
  await page.getByRole("button", { name: "Cancelar edição" }).click();
  await expect(page.locator('[data-manual-edit-path="text"]')).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__manualStudyPending())).toBeNull();
});

test("alvo removido leva o rascunho à Home para descarte visível", async ({ page }) => {
  const scenarios = [{
    kind: "study_unit",
    message: "A Unidade da alteração guardada mudou ou deixou de existir. " +
      "Descarte o rascunho para continuar."
  }, {
    kind: "resource",
    message: "O conteúdo da alteração guardada mudou ou deixou de existir. " +
      "Descarte o rascunho para continuar."
  }];

  for (const scenario of scenarios) {
    await page.setViewportSize({ width: 390, height: 844 });
    await openStudyUnit(page, "shared");
    await page.evaluate(async ({ kind }) => {
      globalThis.__manualStudyInstallPendingRecovery();
      const current = globalThis.__manualStudySnapshot();
      const units = current.courses[0].modules[0].lessons[0]
        .microsequences[0].studyUnits;
      if (kind === "study_unit") {
        current.courses[0].modules[0].lessons[0]
          .microsequences[0].studyUnits = units.filter(({ id }) =>
            id !== "card-fixture-minimal-complete");
      } else {
        const unit = units.find(({ id }) => id === "card-fixture-minimal-complete");
        unit.content[0].id = "card-fixture-minimal-replacement-content";
        unit.response.data.blanks[0].targetInstanceId =
          "card-fixture-minimal-replacement-content";
      }
      globalThis.__manualStudySetCanonical({
        project: current,
        courseRevision: 9,
        studyUnitVersion: 5
      });
      globalThis.__manualStudySaveControl.staleFailures = 1;
      await globalThis.__manualStudyReload({ retry: true });
    }, scenario);

    await expect(page.getByRole("alert")).toContainText(scenario.message);
    const discard = page.getByRole("button", { name: "Descartar alteração guardada" });
    await expect(discard).toBeVisible();
    await expect(discard).toBeFocused();
    await discard.click();
    await expect(page.getByText("Alteração guardada descartada.", { exact: true }))
      .toBeVisible();
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
    await expect(page.getByText("Edição salva.", { exact: true })).toBeVisible();
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
  await expect(page.getByText("Edição salva.", { exact: true })).toBeVisible();

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
  await expect(externalField).toHaveText("Alteração externa confirmada pelo ChatGPT.");
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
  await expect(page.getByText("Edição salva.", { exact: true })).toBeVisible();
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
  await expect(page.getByText("Desfazer preparado. Confira e salve.", { exact: true })).toBeVisible();
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
  await expect(page.getByText(
    "Texto de inspeção revisado."
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
  await expect(page.getByText("Edição salva.", { exact: true })).toBeVisible();
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
  )).toBeVisible();
  expect(await page.evaluate(() => globalThis.__manualStudyRequests.length)).toBe(1);
  await expect(page.locator('[data-manual-edit-path="text"]')).toHaveCount(0);
});
