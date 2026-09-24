import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const SMALL_HASH = "a".repeat(64);

async function prepare(page) {
  const root = process.cwd();
  for (const file of ["styles.css", "course-authoring.css"]) {
    await page.route(`**/${file}`, route => route.fulfill({
      contentType: "text/css", path: path.join(root, "public", file)
    }));
  }
  await page.route("**/src/**", async route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const target = path.resolve(root, relative);
    if (!target.startsWith(path.resolve(root, "src") + path.sep)) return route.abort();
    await route.fulfill({
      contentType: "application/javascript",
      body: await fs.readFile(target, "utf8")
    });
  });
  await page.route("**/tests/helpers/courseAuthoringAnalyticsFixture.js", route =>
    route.fulfill({
      contentType: "application/javascript",
      path: path.join(root, "tests/helpers/courseAuthoringAnalyticsFixture.js")
    }));
  await page.route("**/main.js", route => route.fulfill({
    contentType: "application/javascript", body: ""
  }));
  await page.goto("/");
  await page.setViewportSize({ width: 390, height: 844 });
}

async function createPanelShell(page, id) {
  await page.evaluate(panelId => {
    document.documentElement.dataset.colorMode = "light";
    document.body.innerHTML = `<div class="course-authoring-surface"><main class="course-authoring-frame"><div id="${panelId}"></div></main></div>`;
  }, id);
}

test("Áudio: tamanho, cancelamento explícito, feedback e foco permanecem legíveis", async ({ page }, info) => {
  await prepare(page);
  await createPanelShell(page, "audio-probe");
  await page.evaluate(async ({ courseId, smallHash }) => {
    const { createCourseAudioPanel } = await import("/src/ui/CourseAudioPanel.js");
    const { createDefaultCourseAudioConfig } = await import("/src/domain/courseMedia.js");
    let revision = 1;
    const controller = {
      async loadCourseMedia() {
        return { contract: "aralearn.course-media.v1", courseId, courseRevision: revision,
          mode: "catalog", audioConfig: createDefaultCourseAudioConfig(),
          storage: { uniqueBytes: 512, maxUniqueBytes: 64 * 1024 * 1024 },
          items: [{ contentHash: smallHash, byteSize: 48 * 1024, mediaType: "audio/wav", fileName: "Saída curta.wav" }], nextCursor: null };
      },
      async mutateCourseMedia(request) {
        revision += 1;
        return { contract: "aralearn.course-media-change.v1", courseId, courseRevision: revision,
          requestId: request.requestId, idempotent: false, changed: true, operation: "remove_media",
          media: { contentHash: smallHash, byteSize: 48 * 1024, mediaType: "audio/wav" }, fileName: "Saída curta.wav" };
      }
    };
    window.revisionPanels = { panel: createCourseAudioPanel({
      root: document.querySelector("#audio-probe"), controller, courseId, courseRevision: 1,
      loadSpeechProvider: async () => ({ GEMINI_SPEECH_VOICES: ["Kore"] })
    }) };
    await window.revisionPanels.panel.open();
  }, { courseId: COURSE_ID, smallHash: SMALL_HASH });

  const panel = page.getByRole("region", { name: "Áudio", exact: true });
  await expect(panel).toContainText("48 KiB");
  await expect(panel).not.toContainText("0.0 MiB");
  await page.screenshot({ path: info.outputPath("audio-library.png"), fullPage: true });

  await panel.getByRole("button", { name: "Remover Saída curta.wav" }).click();
  const cancel = panel.getByRole("button", { name: "Cancelar remoção do áudio" });
  const confirm = panel.getByRole("button", { name: "Remover arquivo" });
  await expect(cancel).toBeVisible();
  await expect(cancel).toHaveText("");
  await expect(confirm).toHaveClass(/is-danger/u);
  await cancel.focus();
  await expect(cancel).toBeFocused();
  await expect(cancel.evaluate(node => getComputedStyle(node).outlineWidth)).resolves.toBe("3px");
  await cancel.click();
  await expect(confirm).toBeHidden();
  await panel.getByRole("button", { name: "Remover Saída curta.wav" }).click();
  await panel.getByRole("button", { name: "Remover arquivo" }).click();
  await expect(panel).toContainText("Arquivo de áudio removido.");
  await page.evaluate(() => window.revisionPanels.panel.destroy());
});

test("Análise: exportação confirma o arquivo na própria interface", async ({ page }, info) => {
  await prepare(page);
  await createPanelShell(page, "analytics-probe");
  await page.evaluate(async courseId => {
    const { createCourseAnalyticsPanel } = await import("/src/ui/CourseAnalyticsPanel.js");
    const { courseAuthoringAnalyticsFixture } = await import("/tests/helpers/courseAuthoringAnalyticsFixture.js");
    const { assembleCourseAuthoringExport } = await import("/src/domain/courseAuthoringComparison.js");
    const reading = courseAuthoringAnalyticsFixture({ courseId, title: "Curso de referência" });
    window.revisionPanels = { downloads: [], panel: createCourseAnalyticsPanel({
      root: document.querySelector("#analytics-probe"),
      course: { courseId, revision: 7 },
      controller: {
        async loadCourseAuthoringAnalytics() { return reading; },
        async exportCourseAuthoring() {
          return assembleCourseAuthoringExport({ analytics: reading,
            document: { contract: "aralearn.course.v1", courses: [{ id: courseId, title: "Curso de referência", goal: "Objetivo", modules: [] }] } });
        }
      },
      download: value => window.revisionPanels.downloads.push(value)
    }) };
    await window.revisionPanels.panel.open();
  }, COURSE_ID);

  const panel = page.getByRole("region", { name: "Dados de autoria", exact: true });
  await panel.getByRole("button", { name: "Exportar curso e análise" }).click();
  const downloadButton = panel.getByRole("dialog").getByRole("button", { name: "Baixar arquivo JSON" });
  await expect(downloadButton).toHaveText("");
  await downloadButton.click();
  await expect(panel.getByRole("status")).toContainText("Arquivo preparado para download:");
  await page.screenshot({ path: info.outputPath("analytics-export-feedback.png"), fullPage: true });
  await page.evaluate(() => window.revisionPanels.panel.destroy());
});

function observationsOutline(courseId) {
  return { contract: "aralearn.course.v1", courseId, title: "Curso", goal: "Compreender o tema.",
    revision: 7, ownership: "owned", canEdit: true,
    counts: { moduleCount: 1, lessonCount: 1, topicCount: 1, microsequenceCount: 1, studyUnitCount: 1 },
    createdAt: "2026-08-17T09:00:00.000Z", updatedAt: "2026-08-17T10:00:00.000Z",
    outline: { courseId, title: "Curso", goal: "Compreender o tema.", modules: [{ id: "module-a", title: "Módulo", lessons: [{
      id: "lesson-a", title: "Lição", topics: [{ id: "topic-a", title: "Conceito", summary: null }],
      microsequences: [{ id: "micro-a", title: "Microssequência", studyUnitCount: 1 }]
    }] }] }, deepLink: `#/authoring/courses/${courseId}?section=content` };
}

test("Observações: filtro vazio preserva coleção, contadores, retorno e icon-only", async ({ page }, info) => {
  await prepare(page);
  await createPanelShell(page, "observations-probe");
  await page.evaluate(async ({ courseId, outline }) => {
    const { createCourseObservationsPanel } = await import("/src/ui/CourseObservationsPanel.js");
    const summary = { matchingTotal: 0, unclassifiedTotal: 0, byOrigin: {}, byChannel: {}, byState: {} };
    window.revisionPanels = { reads: 0, panel: createCourseObservationsPanel({
      root: document.querySelector("#observations-probe"), course: { courseId, revision: 7 },
      controller: {
        async loadAuthoringOutline() { return outline; },
        async loadCourseAnchoredAnnotations(_id, options) {
          window.revisionPanels.reads += 1;
          return { contract: "aralearn.course-anchored-annotation-page.v1", courseId,
            courseRevision: 7, annotationSetVersion: 4, query: structuredClone(options.query),
            summary, items: [], hasMore: false, nextCursor: null };
        },
        async mutateCourseAnchoredAnnotations() { throw new Error("Não deve alterar."); }
      }
    }) };
    await window.revisionPanels.panel.open();
  }, { courseId: COURSE_ID, outline: observationsOutline(COURSE_ID) });

  const panel = page.getByRole("region", { name: "Observações", exact: true });
  await panel.locator('summary[aria-label="Filtros"]').click();
  await panel.locator("select[name=origin]").selectOption("learner");
  await panel.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(panel).toContainText("Correspondentes");
  await expect(panel).toContainText("Nenhuma observação corresponde aos filtros aplicados; a coleção continua disponível.");
  await expect(panel).toContainText("Por origem");
  const emptyClear = panel.locator(".course-observations-empty").getByRole("button", { name: "Limpar filtros" });
  await expect(emptyClear).toHaveText("");
  await page.evaluate(() => document.activeElement?.blur());
  for (let index = 0; index < 20 && !(await emptyClear.evaluate(node => node === document.activeElement)); index += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(emptyClear).toBeFocused();
  await expect(emptyClear.evaluate(node => getComputedStyle(node).outlineOffset)).resolves.toBe("2px");
  await page.screenshot({ path: info.outputPath("observations-empty-filter.png"), fullPage: true });
  await page.evaluate(() => window.revisionPanels.panel.destroy());
});

function inspectionUnitFixture(courseId) {
  const unitId = "unit-inspection-v7";
  return {
    unitId,
    item: {
      studyUnit: { id: unitId, position: 1, title: "Unidade de teste", role: "theory",
        content: [{ id: "paragraph-v7", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "Conteúdo sintético." } }],
        response: null, feedback: [], topics: [] },
      version: 1, updatedAt: "2026-09-24T12:00:00.000Z", ordinal: 1,
      curriculumPath: {
        module: { id: "module-v7", position: 0, title: "Módulo" },
        lesson: { id: "lesson-v7", position: 0, title: "Lição" },
        didacticMicrosequence: { id: "micro-v7", position: 0, title: "Microssequência" }
      },
      authoringPart: null,
      authorship: { createdOrigin: "ai", lastRevisionOrigin: "ai", design: { application: null } },
      pendingAuthoringObservationCount: 0,
      deepLink: `#/authoring/courses/${courseId}?section=content&studyUnitId=${unitId}`
    }
  };
}

async function mountInspectionSequence(page, { courseId = COURSE_ID, host = "inspection" } = {}) {
  await createPanelShell(page, "inspection-v7-probe");
  await page.evaluate(async ({ courseId, fixture, host }) => {
    const { createCourseInspectionSequence } = await import("/src/ui/CourseInspectionSequence.js");
    const revision = 7;
    const annotations = [];
    const annotationPage = options => {
      const items = annotations.filter(item => options.query.mode === "detail"
        ? item.annotationId === options.query.annotationId : item.state === "open");
      return { contract: "aralearn.course-anchored-annotation-page.v1", courseId, courseRevision: revision,
        annotationSetVersion: 1, query: structuredClone(options.query),
        summary: { matchingTotal: items.length, byOrigin: { author: items.length },
          byChannel: { authoring_interface: items.length }, byState: { open: items.length }, unclassifiedTotal: items.length },
        items: structuredClone(items), hasMore: false, nextCursor: null };
    };
    const emptySourcesPage = options => ({
      contract: "aralearn.course-sources.v3", bibliographyStyle: "abnt-2025", courseId,
      courseRevision: revision, mode: options.mode,
      query: { sourceId: options.sourceId ?? null, targetKind: options.targetKind ?? null, targetId: options.targetId ?? null },
      pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 }, items: [], nextCursor: null
    });
    const writes = [];
    const controller = {
      async loadAuthoringInspectionPosition() { return null; },
      async saveAuthoringInspectionPosition() {},
      async loadAuthoringStudyUnits(_courseId, options) {
        return { contract: "aralearn.course-study-unit-inspection-page.v2", courseId, courseRevision: revision,
          scope: options.scope, totalCount: 1, scopeOptions: { authoringParts: [], unassignedStudyUnitCount: 1 },
          items: [fixture.item], hasPrevious: false, hasMore: false, previousCursor: null, nextCursor: null,
          pageBytes: 2048, offline: false, stale: false, offlineKnown: false, readFailure: null };
      },
      async loadCourseSources(_courseId, options) { return emptySourcesPage(options); },
      async loadCourseAnchoredAnnotations(_courseId, options) { return annotationPage(options); },
      async mutateCourseAnchoredAnnotations(request) {
        writes.push(structuredClone(request));
        const command = request.command;
        if (command.type === "create_anchored_annotation") {
          const target = command.target;
          const timestamp = "2026-09-24T12:00:00.000Z";
          const path = [{ kind: "course", id: courseId, label: "Curso", version: revision },
            { ...target, label: "Unidade de teste", version: 1 }];
          const classification = { method: "target_scope_unclassified", methodVersion: 1, taxonomyRevision: revision, subjects: [] };
          annotations.push({ contract: "aralearn.course-anchored-annotation.v1", courseId,
            annotationId: command.annotationId, annotationVersion: 1, targetSetVersion: 1,
            provenance: { origin: "author", channel: "authoring_interface" },
            contributor: { kind: "self", role: "author", ref: "self", label: "Você" },
            target: { ...target, observedPath: path, currentAvailable: true, currentPath: path, deepLink: null },
            targets: (command.targets || [target]).map(value => ({ ...value, state: "pending", path,
              basis: { hash: "a".repeat(64), content: {}, sources: [], sourceLinks: [] },
              current: { hash: "b".repeat(64), content: {}, sources: [], sourceLinks: [] } })),
            observedRevision: { certainty: "known", courseRevision: revision, targetVersion: 1 },
            rawText: command.rawText, category: command.category, briefSummary: null, state: "open", ownerResponse: null,
            subjectClassification: { status: "unclassified", automatic: classification, effective: classification, correctedAt: null },
            timestamps: { capturedAt: timestamp, createdAt: timestamp, updatedAt: timestamp, firstConsideredAt: null,
              respondedAt: null, resolvedAt: null, withdrawnAt: null },
            capabilities: { canRevise: true, canWithdraw: false, canConsider: true, canRespond: true,
              canResolve: false, canReopen: false, canCorrectSubjects: true }, deepLink: null });
        } else if (command.type === "decide_anchored_annotation") {
          const item = annotations.find(value => value.annotationId === command.annotationId);
          item.annotationVersion += 1;
          for (const target of item.targets) {
            if (command.targets.some(value => value.kind === target.kind && value.id === target.id)) {
              target.state = command.decision === "approve" ? "approved" : "cancelled";
              target.basis = null; target.current = null;
            }
          }
          if (item.targets.every(value => value.state !== "pending")) item.state = "resolved";
        } else throw new Error(`Operação inesperada: ${command.type}`);
        return { contract: "aralearn.course-anchored-annotation-change.v1", courseId, courseRevision: revision,
          annotationSetVersion: 2, requestId: request.requestId, idempotent: false, changed: true,
          annotation: structuredClone(annotations.find(value => value.annotationId === command.annotationId)) };
      }
    };
    if (host === "queue") {
      const { createAuthoringObservationQueue } = await import("/src/ui/renderCourseAuthoringObservationQueue.js");
      const queue = createAuthoringObservationQueue({ document, controller, courseId, targetKind: "study_unit",
        targetId: fixture.unitId, expectedRevision: revision, label: "Unidade de teste" });
      document.querySelector("#inspection-v7-probe").append(queue.element);
      window.revisionInspection = { sequence: queue, writes, annotations };
      await queue.load();
      return;
    }
    const sequence = createCourseInspectionSequence({
      root: document.querySelector("#inspection-v7-probe"), controller,
      course: { courseId, revision, title: "Curso", ownership: "owned", canEdit: true },
      onEditSources() {}
    });
    window.revisionInspection = { sequence, writes, annotations };
    await sequence.open();
  }, { courseId, fixture: inspectionUnitFixture(courseId), host });
}

test("Inspeção: lote sem itens bloqueia ações, compositor exige texto e bibliografia vazia tem estado", async ({ page }, info) => {
  await prepare(page);
  await mountInspectionSequence(page);

  const unit = page.locator('[data-inspection-study-unit="unit-inspection-v7"]');
  await expect(unit.locator("[data-inspection-references]")).toContainText("Nenhuma referência preparada para esta unidade.");

  await unit.locator("[data-inspection-observations]").click();
  for (const name of ["Aprovar selecionadas", "Encerrar selecionadas", "Aprovar todas apresentadas", "Encerrar todas apresentadas"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name, exact: true })).toHaveText("");
  }
  await page.getByRole("button", { name: "Fechar", exact: true }).click();

  await unit.getByRole("button", { name: "Mostrar várias unidades", exact: true }).click();
  await unit.getByRole("checkbox", { name: "Adicionar Unidade de teste à seleção para observação", exact: true }).click();
  const textarea = page.getByRole("textbox", { name: "Observação", exact: true });
  const submit = page.locator('[data-observation-action="save"]');
  await expect(submit).toBeDisabled();
  await textarea.fill("   ");
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAttribute("title", "Escreva a observação antes de salvar.");
  await textarea.fill("Texto válido para o lote.");
  const validSubmit = page.getByRole("button", { name: "Enviar observação", exact: true });
  await expect(validSubmit).toBeEnabled();
  await validSubmit.click();
  await expect(page.locator(".course-inspection-selection-status")).toContainText("Observação registrada nesta unidade.");
  await expect.poll(() => page.evaluate(() => window.revisionInspection.writes.map(({ command }) => ({ type: command.type, rawText: command.rawText })))).toEqual([
    { type: "create_anchored_annotation", rawText: "Texto válido para o lote." }
  ]);
  await page.screenshot({ path: info.outputPath("inspection-batch-and-empty-states.png"), fullPage: true });
  await page.evaluate(() => window.revisionInspection.sequence.destroy());
});

for (const host of ["inspection", "queue"]) test(`${host}: integração dos helpers preserva rascunho, filtros e decisões em lote`, async ({ page }, info) => {
  await prepare(page);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await mountInspectionSequence(page, { host });
  await page.locator(host === "inspection" ? "[data-inspection-observations]" : "[data-author-queue-action='toggle']").click();
  const sheet = page.getByRole("dialog");
  const bulk = action => sheet.locator(`[data-observation-action="${action}"]`);
  const field = sheet.getByRole("textbox", { name: "Observação", exact: true });
  const submit = sheet.getByRole("button", { name: "Enviar observação", exact: true });
  for (const action of ["approve-selected", "cancel-selected", "approve-all", "cancel-all"]) {
    await expect(bulk(action)).toBeDisabled();
    await expect(bulk(action)).toHaveText("");
    if (action.startsWith("cancel")) await expect(bulk(action)).toHaveClass(/is-danger/u);
  }
  await expect(submit).toBeDisabled();
  await field.fill(" \n\t ");
  await expect(submit).toBeDisabled();
  await page.screenshot({ path: info.outputPath(`${host}-empty-submit.png`), fullPage: true });
  await field.evaluate(node => node.form.requestSubmit());
  await expect(sheet.getByRole("alert")).toContainText("Escreva a observação");
  expect(await page.evaluate(() => window.revisionInspection.writes)).toEqual([]);
  await field.fill("😀".repeat(2001));
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAttribute("title", /máximo 2.000 caracteres/u);
  await field.fill("Primeira observação para decidir.");
  await expect(field).toBeFocused();
  await expect(submit).toBeEnabled();
  await field.fill("");
  await expect(submit).toBeDisabled();
  await field.fill("Primeira observação para decidir.");
  await sheet.getByLabel("Categoria da observação (opcional)").selectOption("question");
  await submit.click();
  await expect(sheet.locator(".study-observation-text")).toHaveText("Primeira observação para decidir.");
  await expect(field).toHaveValue("");
  await expect(submit).toBeDisabled();
  await expect(bulk("approve-all")).toBeEnabled();
  await expect(bulk("approve-selected")).toBeDisabled();

  const select = sheet.locator("[data-observation-select]");
  await select.check();
  await expect(bulk("approve-selected")).toBeEnabled();
  await select.uncheck();
  await expect(bulk("approve-selected")).toBeDisabled();
  await select.check();
  await field.fill("Rascunho preservado durante a decisão.");
  await page.screenshot({ path: info.outputPath(`${host}-valid-submit.png`), fullPage: true });
  await sheet.getByLabel("Categoria da observação (opcional)").selectOption("suggestion");
  await sheet.locator("[data-observation-cancel-reason]").selectOption("keep_current");
  await sheet.locator('[data-observation-filter="category"]').selectOption("suggestion");
  for (const action of ["approve-selected", "cancel-selected", "approve-all", "cancel-all"]) await expect(bulk(action)).toBeDisabled();
  await expect(sheet.locator("[data-observation-filter-count]")).toHaveText("0 apresentadas · 1 pendentes no curso");
  await expect(field).toHaveValue("Rascunho preservado durante a decisão.");
  await sheet.locator('[data-observation-filter="category"]').selectOption("");
  await expect(select).toBeChecked();
  await expect(bulk("approve-selected")).toBeEnabled();
  await bulk("approve-selected").focus();
  await page.screenshot({ path: info.outputPath(`${host}-selection-and-draft.png`), fullPage: true });
  await bulk("approve-selected").click();
  await expect(sheet.locator(".study-observation-text")).toHaveCount(0);
  await expect(bulk("approve-all")).toBeDisabled();
  await expect(field).toHaveValue("Rascunho preservado durante a decisão.");
  await expect(sheet.getByLabel("Categoria da observação (opcional)")).toHaveValue("suggestion");
  await expect(sheet.locator("[data-observation-cancel-reason]")).toHaveValue("keep_current");

  await submit.click();
  await expect(sheet.locator(".study-observation-text")).toHaveText("Rascunho preservado durante a decisão.");
  await bulk("cancel-all").click();
  await expect(sheet.locator(".study-observation-text")).toHaveCount(0);
  await expect(bulk("cancel-all")).toBeDisabled();
  const result = await page.evaluate(() => ({
    commands: window.revisionInspection.writes.map(value => value.command),
    states: window.revisionInspection.annotations.map(value => value.targets[0].state)
  }));
  expect(result.commands.map(value => value.type)).toEqual([
    "create_anchored_annotation", "decide_anchored_annotation", "create_anchored_annotation", "decide_anchored_annotation"
  ]);
  expect(result.commands[1]).toMatchObject({ decision: "approve", expectedAnnotationVersion: 1, expectedTargetSetVersion: 1,
    targets: [{ kind: "study_unit", id: "unit-inspection-v7", expectedBasisHash: "b".repeat(64) }] });
  expect(result.commands[3]).toMatchObject({ decision: "cancel", reason: "keep_current" });
  expect(result.states).toEqual(["approved", "cancelled"]);
  expect(errors).toEqual([]);
  await page.evaluate(() => window.revisionInspection.sequence.destroy());
});
