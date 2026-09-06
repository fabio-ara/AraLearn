import { test, expect } from "@playwright/test";

async function mountSources(page, { theme = "light", mode = "catalog", initialAnchorId = null, fileAccess = false, retired = false } = {}) {
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.goto("/");
  await page.evaluate(async ({ theme, mode, initialAnchorId, fileAccess, retired }) => {
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
    window.sourceRequests = [];
    window.failNextSourceWrite = false;
    let appliedReceipt = null;
    const controller = {
      ...(fileAccess ? { async setCourseSourceFileAccess() { throw new Error("Esta prova visual não escreve permissões."); } } : {}),
      async mutateCourseAnchoredAnnotations() { throw new Error("Escritor fora do recorte sintético."); },
      async loadCourseSources(_courseId, options) {
        return { contract: "aralearn.course-sources.v3", bibliographyStyle: "abnt-2025", courseId,
          courseRevision: revision, mode: options.mode,
          query: { sourceId: options.sourceId ?? null, targetKind: options.targetKind ?? null, targetId: options.targetId ?? null },
          pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
          items: options.mode === "target" ? [{ targetKind: "plan_item", targetId, targetVersion: 3,
            sourceLinks: [], createdAt: source.createdAt }] : options.mode === "source"
            ? [{ ...source, anchors: [anchor], attachments: [] }] : [source], nextCursor: null };
      },
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
    await window.sourcesPanel.open();
  }, { theme, mode, initialAnchorId, fileAccess, retired });
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
