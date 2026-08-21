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

async function openStudyUnit(page, ownership) {
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
    const repository = {
      loadProgress: () => structuredClone(progress),
      loadCourseSummaries: () => [{
        courseId: "course-fixture-minimal",
        title: "Fixture Minimal",
        revision: canonicalRevision,
        ownership,
        canEdit: ownership === "owned",
        moduleCount: 1,
        lessonCount: 1,
        studyUnitCount: 2,
        completedStudyUnitCount: 1
      }],
      loadAnnotationsForPath: () => [],
      loadRuntimeStatus: () => ({}),
      loadReviewItems: () => [],
      hasMoreReviewItems: () => false,
      isStudyUnitMarkedForReview: () => false,
      loadCourse: async () => canonicalProject.courses[0],
      loadProject: () => structuredClone(canonicalProject),
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
    globalThis.__manualStudySaveControl = { ambiguousFailures: 0, reconciled: true };
    globalThis.__manualStudyApp = createCourseStudyApplication({
      root: document.querySelector("#study-root"),
      repository,
      initialProject: project,
      onSaveManualEdit: async (request) => {
        requests.push(structuredClone(request));
        if (globalThis.__manualStudySaveControl.ambiguousFailures > 0) {
          globalThis.__manualStudySaveControl.ambiguousFailures -= 1;
          const error = new TypeError("Failed to fetch");
          error.code = "network_error";
          error.ambiguous = true;
          throw error;
        }
        const version = request.expectedVersion + 1;
        return {
          courseId: request.courseId,
          courseRevision: request.expectedCourseRevision + 1,
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
    });
    await globalThis.__manualStudyApp.openCourse("course-fixture-minimal");
  }, { project: fixture, ownership });
  await page.locator('[data-action="open-module"]').click();
  await page.locator('[data-action="open-lesson"]').click();
  await page.locator('[data-action="open-microsequence"]').click();
  await page.locator(
    '[data-action="open-study-unit"][data-study-unit-id="card-fixture-minimal-complete"]'
  ).click();
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
          contract: "aralearn.course-study-unit-inspection-page.v1",
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

test("owner edita a prática no Estudo sem alterar progresso; compartilhado permanece leitura", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudyUnit(page, "owned");
  await expect(page.locator('[data-action="text-gap-open-choice"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Assistência por API" })).toBeVisible();
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

  await page.evaluate(() => {
    globalThis.__ARALEARN_ENV__ = {
      developmentRuntime: true,
      assistAllowedOrigins: ["https://api.openai.com"]
    };
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          output: [{ content: [{
            type: "output_text",
            text: JSON.stringify({
              message: "Ajustei a formulação.",
              changes: [{
                path: "text",
                value: "A conjunção só é verdadeira quando P e Q são verdadeiras."
              }]
            })
          }] }]
        };
      }
    });
  });
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator(
    '[data-resource-target-id="content:card-fixture-minimal-complete-content"]'
  ).click();
  await page.getByRole("button", { name: "Assistência por API" }).click();
  await page.getByLabel("Serviço").selectOption("openai");
  await page.getByLabel("Modelo").fill("gpt-5-mini");
  await page.getByLabel("Chave da OpenAI").fill("segredo-somente-em-memoria");
  await page.getByLabel("Pedido").fill("Deixe a frase mais direta.");
  await page.getByRole("button", { name: "Gerar prévia" }).click();
  await expect(page.getByText("Ajustei a formulação.")).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole("button", { name: "Ver no conteúdo" }).click();
  await expect(page.locator('[data-manual-edit-path="text"]')).toContainText(
    "A conjunção só é verdadeira quando P e Q são verdadeiras."
  );
  await expect(page.locator('[data-manual-edit-path="text"]')).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Voltar à sugestão" }).click();
  await page.getByRole("button", { name: "Aplicar ao rascunho" }).click();
  await page.getByRole("button", { name: "Salvar edição" }).click();
  await expect(page.getByText("Edição salva.", { exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: "Desfazer última edição" }).click();
  await expect(page.getByText("Desfazer preparado. Confira e salve.", { exact: true })).toBeVisible();
  await expect(page.locator('[data-manual-edit-path="text"]')).toContainText(
    "A conjunção é verdadeira quando P e Q são verdadeiras."
  );
  expect(await page.evaluate(() => globalThis.__manualStudyRequests.length)).toBe(2);
  await page.getByRole("button", { name: "Cancelar edição" }).click();
  expect(await page.evaluate(() => globalThis.__manualStudyRequests.length)).toBe(2);

  await openStudyUnit(page, "shared");
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Assistência por API" })).toHaveCount(0);
  await expect(page.locator('[data-action="text-gap-open-choice"]')).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Assistência por API" })).toBeVisible();
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

  await page.getByRole("button", { name: "Desfazer última edição" }).click();
  await expect(page.getByText("Desfazer preparado. Confira e salve.", { exact: true })).toBeVisible();
  await expect(page.locator('[data-manual-edit-path="text"]')).toHaveText(
    "Texto de inspeção original."
  );
  expect(await page.evaluate(() => globalThis.__inspectionManualRequests.length)).toBe(1);
  await page.getByRole("button", { name: "Cancelar edição" }).click();
  expect(await page.evaluate(() => globalThis.__inspectionManualRequests.length)).toBe(1);

  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator('[data-resource-target-id="content:inspection-paragraph-1"]').click();
  await page.getByRole("button", { name: "Assistência por API" }).click();
  await expect(page.getByRole("dialog", { name: "Assistência por API" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Assistência por API" })).toHaveCount(0);
  await expect(page.locator('[data-manual-edit-path="text"]')).toHaveText(
    "Texto de inspeção revisado."
  );

  await openInspectionUnit(page, "shared");
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Assistência por API" })).toHaveCount(0);
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
