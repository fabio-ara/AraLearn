import { expect, test } from "@playwright/test";

async function mount(page, { target = false, paged = false, detail = false } = {}) {
  await page.route("**/main.js", route => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.goto("/");
  await page.evaluate(async ({ target, paged, detail }) => {
    document.body.innerHTML = "<div id='source-root'></div>";
    const pageSource = (id = "source-01", title = "Obra de teste") => ({
      sourceId: id, revision: 1, status: "active", kind: "book",
      defaultRoles: ["technical_conceptual"], title, authors: [{ literal: "Autoria" }],
      publicationDate: "2026", identifier: null, language: "pt-BR", citationMode: "manual",
      citationText: `Autoria. ${title}. 2026.`, bibliographic: { editors: [], containerTitle: null,
        publisher: null, publisherPlace: null, volume: null, issue: null, pages: null,
        articleNumber: null, doi: null, isbn: null, issn: null, accessedDate: null,
        genre: null, number: null },
      url: `https://example.test/${id}`, editionOrVersion: null, origin: "external",
      availability: "open_access", verificationStatus: "author_verified",
      studyVisibility: "citation_and_link", publicFileAccess: "inherit", anchorCount: 2,
      createdAt: "2026-09-24T00:00:00.000Z"
    });
    const first = pageSource();
    const second = pageSource("source-02", "Segunda obra");
    const catalog = (items, nextCursor = null) => ({ contract: "aralearn.course-sources.v3", courseId: "10000000-0000-4000-8000-000000000001", courseRevision: 5, bibliographyStyle: "abnt-2025", mode: "catalog", query: { sourceId: null, targetKind: null, targetId: null }, pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 }, items, nextCursor });
    const targetPage = { contract: "aralearn.course-sources.v3", courseId: "10000000-0000-4000-8000-000000000001", courseRevision: 5, bibliographyStyle: "abnt-2025", mode: "target", query: { sourceId: null, targetKind: "plan_item", targetId: "20000000-0000-4000-8000-000000000002" }, pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 }, items: [{ targetKind: "plan_item", targetId: "20000000-0000-4000-8000-000000000002", targetVersion: 1, sourceLinks: [], createdAt: "2026-09-24T00:00:00.000Z" }], nextCursor: null };
    const controller = {
      loadCourseSources: async (_id, options) => {
        if (options.mode === "target") return targetPage;
        if (options.mode === "catalog") return catalog(paged ? [first] : [first, second], paged ? "next-page" : null);
        return { contract: "aralearn.course-sources.v3", courseId: "10000000-0000-4000-8000-000000000001", courseRevision: 5, bibliographyStyle: "abnt-2025", mode: "source", query: { sourceId: options.sourceId, targetKind: null, targetId: null }, pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 }, items: detail ? [{ ...first, anchorCount: 0, anchors: [], attachments: [] }] : [], nextCursor: null };
      },
      loadCourseAnchoredAnnotations: async (_id, options) => ({ contract: "aralearn.course-anchored-annotation-page.v1", courseId: "10000000-0000-4000-8000-000000000001", courseRevision: options.expectedCourseRevision, annotationSetVersion: 0, query: options.query, summary: { matchingTotal: 0, byOrigin: {}, byChannel: {}, byState: {}, unclassifiedTotal: 0 }, items: [], hasMore: false, nextCursor: null }),
      mutateCourseSources: async request => ({ contract: "aralearn.course-source-change.v1", courseId: request.courseId, courseRevision: request.expectedCourseRevision, requestId: request.requestId, idempotent: false, changed: false, change: null }),
      mutateCourseAnchoredAnnotations: async () => { throw new Error("não usado"); }
    };
    const panel = window.__sourcePanel = window.__sourcePanel || {};
    panel.instance = (globalThis.__sourcePanelCreate = (await import("/src/ui/CourseSourcesPanel.js")).createCourseSourcesPanel)({
      root: document.querySelector("#source-root"), controller, courseId: "10000000-0000-4000-8000-000000000001", courseRevision: 5,
      mode: target ? "target" : "catalog", targetKind: target ? "plan_item" : null,
      targetId: target ? "20000000-0000-4000-8000-000000000002" : null,
      targetVersion: target ? 1 : null, targetLabel: target ? "Unidade · Relações" : ""
    });
    return panel.instance.open();
  }, { target, paged, detail });
}

test("confirmação de fonte conserva decisão, foco e nomes com ações somente por ícones", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page, { detail: true });
  await page.locator('[data-source-action="open-source"]').first().click();
  await page.getByRole("button", { name: "Aposentar fonte", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  const cancel = dialog.getByRole("button", { name: "Cancelar", exact: true });
  const retire = dialog.getByRole("button", { name: "Aposentar", exact: true });
  await expect(cancel).toBeFocused();
  await expect(retire).toHaveClass(/is-danger/u);
  for (const action of [cancel, retire]) {
    await expect(action).toHaveText("");
    await expect(action.locator("svg")).toBeVisible();
  }
  await expect(dialog).toContainText("Aposentar fonte?");
  await page.screenshot({ path: info.outputPath("source-confirmation-icons-390.png") });
  await cancel.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Aposentar fonte", exact: true })).toBeVisible();
});

test("painel contextual mostra fonte existente e âncoras não demonstradas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page, { target: true });
  await page.getByRole("button", { name: "Adicionar fonte", exact: true }).click();
  await expect(page.locator(".course-source-available")).toBeVisible();
  await page.locator("button[data-source-action='add-target-source']").first().click();
  await expect(page.locator(".course-source-target-link")).toContainText("Fonte existente; as âncoras ainda não foram demonstradas");
  await expect(page.locator(".course-source-link-kind")).toHaveText("Fonte · obra");
  await expect(page.locator(".course-source-occurrence-summary")).toContainText("0 ocorrências");
  await page.screenshot({ path: ".tmp/agent/revisao-v7/source-panel/source-panel-target-390.png", fullPage: true });
});

test("catálogo explicita carregamento parcial e oferece controle nomeado", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mount(page, { paged: true });
  await expect(page.locator(".course-source-catalog-summary")).toContainText("1+ fontes");
  await expect(page.locator(".course-source-catalog-summary")).toContainText("1 carregada; há mais fontes");
  await expect(page.getByRole("button", { name: "Carregar mais fontes", exact: true })).toBeVisible();
  await page.screenshot({ path: ".tmp/agent/revisao-v7/source-panel/source-panel-catalog-progress-1280.png", fullPage: true });
});
