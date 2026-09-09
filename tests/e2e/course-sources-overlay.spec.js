import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

async function mountSources(page, { theme = "light", mode = "catalog", initialAnchorId = null, fileAccess = false, retired = false,
  deferredTarget = false, deferredUpload = false } = {}) {
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.goto("/");
  await page.evaluate(async ({ theme, mode, initialAnchorId, fileAccess, retired, deferredTarget, deferredUpload }) => {
    document.documentElement.dataset.colorMode = theme;
    document.body.innerHTML = '<div id="app-root"><main class="course-authoring-root"><section class="course-authoring-surface" data-section="sources"><div data-sources-host></div></section></main></div>';
    const { createCourseSourcesPanel } = await import("/src/ui/CourseSourcesPanel.js");
    const { createEmptyCourseSourceBibliographicMetadata } = await import("/src/domain/courseSources.js");
    const courseId = "e3060000-0000-4000-8000-000000000021";
    const targetId = "e3060000-0000-4000-8000-000000000022";
    let revision = 5;
    const source = { sourceId: "source-overlay", revision: 1, status: retired ? "retired" : "active", kind: "book",
      defaultRoles: ["technical_conceptual"], bibliographic: createEmptyCourseSourceBibliographicMetadata(),
      citationMode: "manual", title: "Fonte sintética: " + "título completo e legível ".repeat(10) + "FIM DO TÍTULO",
      authors: [{ literal: "Autoria sintética" }], publicationDate: "2026", identifier: null,
      language: "pt-BR", citationText: "Referência literal preservada. ".repeat(35) + "FIM DA REFERÊNCIA",
      url: "https://example.test/reference", editionOrVersion: null, origin: "external",
      availability: "open_access", verificationStatus: "author_verified", studyVisibility: "citation_and_link",
      publicFileAccess: "inherit", anchorCount: 1, createdAt: "2026-09-05T10:00:00.000Z" };
    const anchor = { anchorId: "anchor-overlay", revision: 1, sourceRevision: 1, status: "active",
      selector: { kind: "page_range", startPage: 10, endPage: 12 }, humanLocator: "Localização sintética",
      verificationExcerpt: null, contentHash: null, needsReverification: false, createdAt: source.createdAt };
    if (deferredUpload) {
      source.title = "Protocolos — fonte sintética";
      source.citationText = "Autoria sintética. Protocolos. 2026.";
    }
    const attachments = [];
    const pendingReads = new Map();
    let uploadConfirmed = false;
    let releaseUpload = null;
    window.sourceRequests = [];
    window.sourceReadRequests = [];
    window.sourceUploadRequests = [];
    window.failNextSourceWrite = false;
    let appliedReceipt = null;
    window.sourceAsyncControls = {
      pendingReads: () => [...pendingReads.keys()],
      releaseRead(readMode) {
        const release = pendingReads.get(readMode);
        if (!release) throw new Error("A leitura solicitada não está pendente.");
        pendingReads.delete(readMode);
        release();
      },
      async releaseUpload() {
        if (!releaseUpload) throw new Error("Nenhum upload pendente.");
        const release = releaseUpload;
        releaseUpload = null;
        await release();
      },
      snapshot: () => structuredClone({ revision, source, anchor, attachments, appliedReceipt })
    };
    const controller = {
      ...(fileAccess ? { async setCourseSourceFileAccess() { throw new Error("Esta prova visual não escreve permissões."); } } : {}),
      async mutateCourseAnchoredAnnotations() { throw new Error("Escritor fora do recorte sintético."); },
      async loadCourseSources(_courseId, options) {
        window.sourceReadRequests.push(structuredClone(options));
        const result = structuredClone({ contract: "aralearn.course-sources.v3", bibliographyStyle: "abnt-2025", courseId,
          courseRevision: revision, mode: options.mode,
          query: { sourceId: options.sourceId ?? null, targetKind: options.targetKind ?? null, targetId: options.targetId ?? null },
          pdfStorage: { uniqueBytes: attachments.reduce((sum, item) => sum + item.byteSize, 0), maxUniqueBytes: 64 * 1024 * 1024 },
          items: options.mode === "target" ? [{ targetKind: "plan_item", targetId, targetVersion: 3,
            sourceLinks: [], createdAt: source.createdAt }] : options.mode === "source"
            ? [{ ...source, anchors: [anchor], attachments }] : [source], nextCursor: null });
        if (deferredTarget && options.mode === "target" || uploadConfirmed && ["catalog", "source"].includes(options.mode)) {
          return new Promise(resolve => pendingReads.set(options.mode, () => resolve(result)));
        }
        return result;
      },
      ...(deferredUpload ? { async uploadCourseSourcePdf(request) {
        if (releaseUpload || uploadConfirmed || request.courseId !== courseId || request.sourceId !== source.sourceId ||
            request.expectedCourseRevision !== revision || request.sourceRevision !== source.revision || !(request.file instanceof File)) {
          throw new Error("Upload fora da tentativa sintética esperada.");
        }
        const { file, ...identity } = request;
        window.sourceUploadRequests.push({ ...structuredClone(identity), file: { name: file.name, size: file.size, type: file.type } });
        return new Promise(resolve => {
          releaseUpload = async () => {
            const bytes = await file.arrayBuffer();
            const contentHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
              .map(value => value.toString(16).padStart(2, "0")).join("");
            revision += 1;
            source.revision += 1;
            anchor.sourceRevision = source.revision;
            attachments.push({ contentHash, byteSize: bytes.byteLength, mediaType: "application/pdf",
              storagePath: `${courseId}/${contentHash}.pdf`, createdAt: source.createdAt, publicFileAccess: "inherit" });
            appliedReceipt = { contract: "aralearn.course-source-change.v1", courseId, courseRevision: revision,
              requestId: request.requestId, changed: true, idempotent: false,
              change: { type: "ingest_pdf", subjectId: source.sourceId, revision: source.revision } };
            uploadConfirmed = true;
            resolve(structuredClone(appliedReceipt));
          };
        });
      } } : {}),
      async loadCourseAnchoredAnnotations(_courseId, options) {
        return { contract: "aralearn.course-anchored-annotation-page.v1", courseId, courseRevision: revision,
          annotationSetVersion: 0, query: structuredClone(options.query), items: [], hasMore: false, nextCursor: null,
          summary: { matchingTotal: 0, byOrigin: {}, byChannel: {}, byState: {}, unclassifiedTotal: 0 } };
      },
      async mutateCourseSources(request) {
        window.sourceRequests.push(structuredClone(request));
        if (appliedReceipt?.requestId === request.requestId) return { ...appliedReceipt, idempotent: true };
        if (request.command.type !== "save_source") throw new Error("Escritor fora do recorte sintético.");
        if (request.expectedCourseRevision !== revision || request.command.expectedSourceRevision !== source.revision) throw new Error("CAS inválido.");
        Object.assign(source, request.command.source, { revision: source.revision + 1 });
        anchor.sourceRevision = source.revision;
        revision += 1;
        appliedReceipt = { contract: "aralearn.course-source-change.v1", courseId, courseRevision: revision,
          requestId: request.requestId, changed: true, idempotent: false,
          change: { type: "save_source", subjectId: source.sourceId, revision: source.revision } };
        if (window.failNextSourceWrite) {
          window.failNextSourceWrite = false;
          throw Object.assign(new Error("Resposta sintética perdida."), { code: "network_error", ambiguous: true });
        }
        return appliedReceipt;
      }
    };
    window.sourcesPanel = createCourseSourcesPanel({ root: document.querySelector("[data-sources-host]"), controller,
      courseId, courseRevision: revision, mode, ...(mode === "target" ? {
        targetKind: "plan_item", targetId, targetVersion: 3, targetLabel: "Item sintético" } : {}),
      ...(initialAnchorId ? { initialSourceId: source.sourceId, initialAnchorId } : {}) });
    window.sourcePanelOpening = window.sourcesPanel.open();
    if (!deferredTarget) await window.sourcePanelOpening;
  }, { theme, mode, initialAnchorId, fileAccess, retired, deferredTarget, deferredUpload });
}

for (const theme of ["light", "dark"]) {
  test(`Acesso a PDFs usa tokens da área de fontes em 390 ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mountSources(page, { theme, fileAccess: true });
    const opener = page.locator('[data-source-action="open-source"]');
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.locator("[data-source-detail-dialog]");
    await dialog.locator('[data-source-disclosure="files"] > summary').click();
    const access = dialog.locator(".course-source-file-access");
    const before = await dialog.boundingBox();
    await access.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(access).toHaveAttribute("open", "");
    await expect(access.locator("select")).toBeVisible();
    await expect(access).toContainText("Uma exceção no PDF prevalece sobre a fonte e o curso.");
    expect(await access.evaluate(node => node.closest(".course-authoring-section"))).toBeNull();
    expect(await access.locator("option").evaluateAll(nodes => nodes.map(node => node.value))).toEqual(["inherit", "restricted", "available"]);
    const colors = await access.evaluate(node => {
      const probe = document.createElement("span");
      probe.style.borderColor = "var(--border-default)";
      probe.style.color = "var(--text-secondary)";
      probe.style.backgroundColor = "var(--surface-raised)";
      probe.style.outlineColor = "var(--focus-ring)";
      node.append(probe);
      const expected = getComputedStyle(probe);
      const controls = [...node.querySelectorAll("select, button")].map(control => {
        const style = getComputedStyle(control);
        const box = control.getBoundingClientRect();
        return { y: box.y, bottom: box.bottom, width: box.width, height: box.height, radius: parseFloat(style.borderRadius),
          fontSize: parseFloat(style.fontSize), fontWeight: Number(style.fontWeight), color: style.color, background: style.backgroundColor };
      });
      const summary = getComputedStyle(node.querySelector("summary"));
      const result = { border: getComputedStyle(node).borderTopColor, text: getComputedStyle(node.querySelector("p")).color,
        expectedBorder: expected.borderTopColor, expectedText: expected.color, expectedSurface: expected.backgroundColor,
        focusColor: summary.outlineColor, focusWidth: parseFloat(summary.outlineWidth), expectedFocus: expected.outlineColor, controls,
        support: [...node.querySelectorAll("summary, label, p, small")].map(element => {
          const style = getComputedStyle(element);
          return { fontSize: parseFloat(style.fontSize), fontWeight: Number(style.fontWeight) };
        }) };
      probe.remove();
      return result;
    });
    expect(colors.border).toBe(colors.expectedBorder);
    expect(colors.text).toBe(colors.expectedText);
    expect(colors.focusColor).toBe(colors.expectedFocus);
    expect(colors.focusWidth).toBeGreaterThanOrEqual(2);
    expect(colors.controls[0].background).toBe(colors.expectedSurface);
    expect(Math.abs(colors.controls[0].y - colors.controls[1].y)).toBeLessThanOrEqual(1);
    expect(Math.abs(colors.controls[0].bottom - colors.controls[1].bottom)).toBeLessThanOrEqual(1);
    for (const support of colors.support) {
      expect(support.fontSize).toBe(13);
      expect(support.fontWeight).toBeLessThanOrEqual(600);
    }
    for (const control of colors.controls) {
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
      expect(control.radius).toBeGreaterThanOrEqual(10);
      expect(control.fontSize).toBe(13);
      expect(control.fontWeight).toBeLessThanOrEqual(600);
      expect(control.color).not.toBe(control.background);
    }
    const after = await dialog.boundingBox();
    for (const key of ["x", "y", "width", "height"]) expect(Math.abs(after[key] - before[key])).toBeLessThanOrEqual(1);
    const back = await dialog.getByRole("button", { name: "Voltar ao catálogo", exact: true }).boundingBox();
    expect(back.width).toBeGreaterThanOrEqual(44);
    expect(back.height).toBeGreaterThanOrEqual(44);
    for (const control of [access.locator("select"), access.getByRole("button", { name: "Aplicar", exact: true })]) {
      await page.keyboard.press("Tab");
      await expect(control).toBeFocused();
      expect(await control.evaluate(node => getComputedStyle(node).outlineColor)).toBe(colors.expectedFocus);
    }
    await access.locator("summary").focus();
    await access.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`source-file-tokens-390-${theme}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => window.sourceRequests)).toEqual([]);
    await mountSources(page, { theme, fileAccess: true, retired: true });
    await page.locator('[data-source-action="open-source"]').click();
    await dialog.locator('[data-source-disclosure="files"] > summary').click();
    await access.locator("summary").click();
    for (const control of [access.locator("select"), access.getByRole("button", { name: "Aplicar", exact: true })]) {
      await expect(control).toBeDisabled();
      const box = await control.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(await control.evaluate(node => getComputedStyle(node).cursor)).toBe("not-allowed");
      expect(await control.evaluate(node => getComputedStyle(node).opacity)).toBe("1");
    }
  });
}

for (const width of [360, 390, 430, 1280]) for (const theme of ["light", "dark"]) {
  test(`Fontes revela detalhes sem alterar o quadro em ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await mountSources(page, { theme });
    const opener = page.locator('[data-source-action="open-source"]');
    const catalog = page.locator(".course-source-catalog");
    await expect(catalog).not.toContainText("Referência literal preservada");
    await expect(catalog.locator(".course-source-status")).toHaveAttribute("aria-label", "Ativa");
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.locator("[data-source-detail-dialog]");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Fonte", exact: true })).toBeVisible();
    expect(await dialog.locator("h2").evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeLessThanOrEqual(16);
    await expect(page.locator(".course-sources-panel")).toHaveAttribute("inert", "");
    await expect(dialog.getByText("FIM DA REFERÊNCIA", { exact: false })).not.toBeVisible();
    const before = await dialog.boundingBox();
    await dialog.locator(".course-source-display-title").focus();
    await page.keyboard.press("End");
    await dialog.getByText("Referência e dados", { exact: true }).click();
    await expect(dialog.getByText("FIM DA REFERÊNCIA", { exact: false })).toBeVisible();
    await dialog.getByText("Âncoras", { exact: true }).first().click();
    await dialog.getByText("Observações", { exact: true }).first().click();
    const after = await dialog.boundingBox();
    for (const key of ["x", "y", "width", "height"]) expect(Math.abs(after[key] - before[key])).toBeLessThanOrEqual(1);
    const last = dialog.locator('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary').filter({ visible: true }).last();
    await last.focus();
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`sources-${width}-${theme}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await page.getByRole("button", { name: "Nova fonte", exact: true }).click();
    await expect(dialog).toBeVisible();
    const newBox = await dialog.boundingBox();
    for (const key of ["x", "y", "width", "height"]) expect(Math.abs(newBox[key] - before[key])).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toContainText("ainda não foram salvas");
    await page.getByRole("button", { name: "Descartar e fechar" }).click();
    await expect(page.getByRole("button", { name: "Nova fonte", exact: true })).toBeFocused();
    expect(await page.evaluate(() => window.sourceRequests)).toEqual([]);
  });
}

test("Fonte conserva rascunho, CAS e pedido após resposta perdida", async ({ page }) => {
  await mountSources(page);
  await page.locator('[data-source-action="open-source"]').click();
  const dialog = page.locator("[data-source-detail-dialog]");
  await dialog.getByRole("button", { name: "Editar fonte", exact: true }).click();
  const citation = dialog.locator('[name="citationText"]');
  await citation.fill("Referência literal em rascunho, sem resumo.");
  await citation.evaluate(node => node.setSelectionRange(5, 14));
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(citation).toHaveValue("Referência literal em rascunho, sem resumo.");
  await expect(citation).toBeFocused();
  expect(await citation.evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([5, 14]);
  await page.evaluate(() => { window.failNextSourceWrite = true; });
  await dialog.getByRole("button", { name: "Salvar fonte", exact: true }).click();
  await expect(dialog).toContainText("Confirme novamente");
  await expect(citation).toHaveValue("Referência literal em rascunho, sem resumo.");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toContainText("A alteração pode ter sido salva");
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Confirmar a mesma operação", exact: true }).click();
  await expect(dialog.locator('[data-source-action="edit-source"]')).toBeVisible();
  const requests = await page.evaluate(() => window.sourceRequests);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[0].expectedCourseRevision).toBe(5);
  expect(requests[0].command.expectedSourceRevision).toBe(1);
  await dialog.getByText("Referência e dados", { exact: true }).click();
  await expect(dialog).toContainText("Referência literal em rascunho, sem resumo.");
});

test("Fonte mantém vínculo contextual e abre âncora de entrada", async ({ page }) => {
  await mountSources(page, { mode: "target" });
  await page.locator('[data-source-action="add-target-source"]').click();
  const linkId = await page.locator('[data-source-action="remove-target-source"]').getAttribute("data-link-id");
  const opener = page.locator('[data-source-action="open-source"]');
  await opener.click();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await expect(page.locator('[data-source-action="remove-target-source"]')).toHaveAttribute("data-link-id", linkId);
  expect(await page.evaluate(() => window.sourcesPanel.hasPendingDraft())).toBe(true);
  await mountSources(page, { initialAnchorId: "anchor-overlay" });
  await expect(page.locator('[data-source-disclosure="anchors"]')).toHaveAttribute("open", "");
  await expect(page.locator("[data-source-deep-linked-anchor]")).toContainText("Localização sintética · Páginas 10–12");
});

test("Vincular fonte aguarda a atribuição inicial e conserva vínculo e foco após a leitura", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountSources(page, { mode: "target", deferredTarget: true });
  const add = page.locator('[data-source-action="add-target-source"]');
  await expect(add).toBeVisible();
  await expect(add).toBeDisabled();
  await expect(page.getByText("Carregando atribuição…", { exact: true })).toBeVisible();
  await expect(page.locator(".course-source-target-link")).toHaveCount(0);
  expect(await page.evaluate(() => window.sourceAsyncControls.pendingReads())).toEqual(["target"]);
  expect(await page.evaluate(() => window.sourceReadRequests.map(value => value.mode))).toEqual(["catalog", "target"]);
  await page.evaluate(async () => {
    window.sourceAsyncControls.releaseRead("target");
    await window.sourcePanelOpening;
  });
  await expect(add).toBeEnabled();
  await add.focus();
  await page.keyboard.press("Enter");
  const link = page.locator(".course-source-target-link");
  await expect(link).toHaveCount(1);
  await expect(link.getByText("Carregando âncoras…", { exact: true })).toHaveCount(0);
  await expect(add).toBeFocused();
  const remove = link.locator('[data-source-action="remove-target-source"]');
  const linkId = await remove.getAttribute("data-link-id");
  expect(linkId).toBeTruthy();
  await expect(link.locator("[data-source-target-relation]")).toHaveValue("supported_by");
  const opener = link.locator('[data-source-action="open-source"]');
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-source-detail-dialog]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await expect(link).toHaveCount(1);
  await expect(remove).toHaveAttribute("data-link-id", linkId);
  expect(await page.evaluate(() => window.sourcesPanel.hasPendingDraft())).toBe(true);
  expect(await page.evaluate(() => window.sourceRequests)).toEqual([]);
});

test("Upload PDF conserva rascunho de âncora, seleção, foco e scroll nas releituras atrasadas", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountSources(page, { deferredUpload: true });
  await page.locator('[data-source-action="open-source"]').click();
  const dialog = page.locator("[data-source-detail-dialog]");
  await dialog.locator('[data-source-disclosure="files"] > summary').click();
  await dialog.locator('[data-source-disclosure="anchors"] > summary').click();
  await dialog.getByRole("button", { name: "Editar âncora", exact: true }).click();
  const form = dialog.locator('[data-source-form="anchor"]');
  const excerpt = form.locator('[name="verificationExcerpt"]');
  const locatorText = "Capítulo de protocolos — localização ainda não salva";
  const excerptText = "Trecho em rascunho: regras compartilhadas e programas que as implementam.";
  await form.locator('[name="startPage"]').fill("11");
  await form.locator('[name="endPage"]').fill("13");
  await form.locator('[name="humanLocator"]').fill(locatorText);
  await excerpt.fill(excerptText);
  expect(await page.evaluate(() => window.sourcesPanel.hasPendingDraft())).toBe(true);
  const pdfPath = fileURLToPath(new URL("../fixtures/pdf/edital-dataprev-2026-perfil-13-pagina-44.pdf", import.meta.url));
  await dialog.locator("[data-source-pdf-input]").setInputFiles(pdfPath);
  await expect.poll(() => page.evaluate(() => window.sourceUploadRequests.length)).toBe(1);
  await expect(form.getByRole("button", { name: "Salvar âncora", exact: true })).toBeDisabled();
  await expect(excerpt).toBeEditable();
  await excerpt.scrollIntoViewIfNeeded();
  await excerpt.focus();
  await excerpt.evaluate(node => node.setSelectionRange(7, 24));
  const scrollBefore = await dialog.locator(".course-source-detail-body").evaluate(node => node.scrollTop);
  expect(scrollBefore).toBeGreaterThan(0);
  const assertDraft = async () => {
    await expect(form).toBeVisible();
    await expect(form.locator('[name="selectorKind"]')).toHaveValue("page_range");
    await expect(form.locator('[name="startPage"]')).toHaveValue("11");
    await expect(form.locator('[name="endPage"]')).toHaveValue("13");
    await expect(form.locator('[name="contentHash"]')).toHaveValue("");
    await expect(form.locator('[name="humanLocator"]')).toHaveValue(locatorText);
    await expect(excerpt).toHaveValue(excerptText);
    await expect(excerpt).toBeFocused();
    expect(await excerpt.evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([7, 24]);
    const scrollAfter = await dialog.locator(".course-source-detail-body").evaluate(node => node.scrollTop);
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => window.sourcesPanel.hasPendingDraft())).toBe(true);
  };
  await assertDraft();
  await page.screenshot({ path: testInfo.outputPath("source-anchor-pdf-pending-390.png") });
  expect(await page.evaluate(() => window.sourceAsyncControls.snapshot().revision)).toBe(5);
  await page.evaluate(() => window.sourceAsyncControls.releaseUpload());
  await expect.poll(() => page.evaluate(() => window.sourceAsyncControls.pendingReads())).toEqual(["catalog"]);
  await assertDraft();
  await page.evaluate(() => window.sourceAsyncControls.releaseRead("catalog"));
  await expect.poll(() => page.evaluate(() => window.sourceAsyncControls.pendingReads())).toEqual(["source"]);
  await assertDraft();
  await page.evaluate(() => window.sourceAsyncControls.releaseRead("source"));
  await expect(dialog.locator('[data-source-action="download-attachment"]')).toHaveCount(1);
  await expect(form.getByRole("button", { name: "Salvar âncora", exact: true })).toBeEnabled();
  await assertDraft();
  await page.screenshot({ path: testInfo.outputPath("source-anchor-pdf-refreshed-390.png") });
  const result = await page.evaluate(() => ({ ...window.sourceAsyncControls.snapshot(),
    uploads: window.sourceUploadRequests, reads: window.sourceReadRequests, writes: window.sourceRequests }));
  expect(result.uploads).toHaveLength(1);
  expect(result.uploads[0]).toMatchObject({ expectedCourseRevision: 5, sourceRevision: 1,
    sourceId: "source-overlay", file: { name: "edital-dataprev-2026-perfil-13-pagina-44.pdf", type: "application/pdf" } });
  expect(result.uploads[0].file.size).toBeGreaterThan(0);
  expect(result.revision).toBe(6);
  expect(result.source.revision).toBe(2);
  expect(result.appliedReceipt).toMatchObject({ requestId: result.uploads[0].requestId, courseRevision: 6,
    changed: true, change: { type: "ingest_pdf", subjectId: "source-overlay", revision: 2 } });
  expect(result.anchor).toMatchObject({ anchorId: "anchor-overlay", revision: 1, sourceRevision: 2,
    selector: { kind: "page_range", startPage: 10, endPage: 12 }, humanLocator: "Localização sintética",
    verificationExcerpt: null, contentHash: null });
  expect(result.attachments).toHaveLength(1);
  expect(result.attachments[0].byteSize).toBe(result.uploads[0].file.size);
  expect(result.reads.filter(value => value.mode === "catalog").map(value => value.expectedRevision)).toEqual([5, 6]);
  expect(result.reads.filter(value => value.mode === "source").map(value => value.expectedRevision)).toEqual([5, 6]);
  expect(result.writes).toEqual([]);
});
