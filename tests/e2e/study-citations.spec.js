import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";
import { wideExpression } from "../fixtures/package/rich-paragraph-limits.js";

const project = JSON.parse(readFileSync(new URL("../fixtures/package/project-minimal.json", import.meta.url), "utf8"));
const hashA = "a".repeat(64); const hashB = "b".repeat(64);
function citation(linkId, overrides = {}) {
  return { linkId, sourceId: "source-synthetic", sourceRevision: 1, kind: "article", title: "Referência sintética",
    authors: [{ literal: "Grupo de pesquisa sintético" }], publicationDate: null, identifier: null, language: "pt-BR",
    bibliographic: createEmptyCourseSourceBibliographicMetadata(), citationMode: "manual", citationText: "Referência manual íntegra <sem dados inventados>.",
    url: "https://example.test/referencia", editionOrVersion: null, relation: "informed_by", roles: ["recommended_reading"],
    occurrences: [], anchors: [], attachments: [], ...overrides };
}
function projection() {
  return { contract: "aralearn.course-study-citations.v2", bibliographyStyle: "abnt-2025", courseId: project.courses[0].id, courseRevision: 1,
    studyUnitId: "citation-unit", citations: [citation("whole"), citation("context", {
      title: "Fonte do trecho", roles: ["technical_conceptual"], relation: "supported_by",
      occurrences: [{ occurrenceId: "where", slot: "content", resourceId: "cited", path: "text", quote: "**quadro**", prefix: "Um ", suffix: " liga", status: "resolved" }],
      anchors: [{ anchorId: "page-six", selector: { kind: "page_range", startPage: 6, endPage: 6 }, humanLocator: "Seção 2", contentHash: hashB }],
      attachments: [hashA, hashB].map(contentHash => ({ contentHash, byteSize: 128, mediaType: "application/pdf" }))
    }), citation("ambiguous", { title: "Referência do trecho anterior", occurrences: [{ occurrenceId: "old-where", slot: "content", resourceId: "missing", path: "text", quote: "Trecho anteriormente presente.", prefix: null, suffix: null, status: "needs_review" }] })] };
}

async function mount(page, { defer = false, owned = false } = {}) {
  await page.route("**/main.js", route => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.goto("/");
  await page.evaluate(async ({ initial, citations, expression, defer, owned }) => {
    document.body.innerHTML = '<main id="citation-root"></main>';
    const { createCourseStudyApplication } = await import("/src/study/CourseStudyApplication.js");
    const canonical = structuredClone(initial);
    if (owned) {
      canonical.courses[0].id = "30200000-0000-4000-8000-000000000001";
      citations.courseId = canonical.courses[0].id;
    }
    const micro = canonical.courses[0].modules[0].lessons[0].microsequences[0];
    const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
    const makeUnit = (id, title, content) => ({ id, title, position: id === "citation-unit" ? 1 : 2, role: "theory", content, response: null, feedback: [], topics: [] });
    micro.studyUnits = [makeUnit("citation-unit", "Leitura com referências", [
      paragraph("lead", "O leitor percorre uma explicação completa antes da referência. ".repeat(20)),
      paragraph("cited", "Um **quadro** liga duas interfaces."),
      { id: "wide", package: "aralearn.resource.paragraph", version: "1.0.0", data: { format: "rich", blocks: [{ kind: "math", notation: "mathematics", accessibleText: "Soma sintética extensa", expression }] } },
      paragraph("tail", "A discussão prossegue depois do trecho, sem trocar a identidade da fonte. ".repeat(16))
    ]), makeUnit("next-unit", "Outra unidade", [paragraph("next", "Uma leitura independente.")])];
    const path = [canonical.courses[0].id, canonical.courses[0].modules[0].id, canonical.courses[0].modules[0].lessons[0].id, micro.id];
    const probe = { reads: [], downloads: [], opened: [], edits: [], defer, offline: false, rejectPdf: false, release: null };
    const repository = {
      loadProject: () => structuredClone(canonical), loadCourse: async () => structuredClone(canonical.courses[0]),
      loadProgress: () => ({ version: 1, lessons: {} }), loadAnnotationsForPath: () => [], loadReviewItems: () => [],
      loadRuntimeStatus: () => ({}), isStudyUnitMarkedForReview: () => false,
      loadCourseSummaries: () => [{ courseId: path[0], title: "Leitura sintética", ownership: owned ? "owned" : "public", canEdit: owned, revision: 1, studyUnitCount: 2 }],
      loadStudyUnitCompositionContext: reference => ({ courseId: reference.courseId, courseRevision: 1,
        didacticMicrosequenceId: reference.microsequenceId, studyUnitId: reference.studyUnitId, studyUnitVersion: 1 }),
      loadStudyUnitCitations: async reference => {
        probe.reads.push(structuredClone(reference));
        const result = reference.studyUnitId === "citation-unit" ? structuredClone(citations) : { ...structuredClone(citations), studyUnitId: "next-unit", citations: [] };
        if (probe.defer && reference.studyUnitId === "citation-unit") await new Promise(resolve => { probe.release = resolve; });
        if (probe.offline) throw Object.assign(new Error("Sem conexão"), { code: "network_error" });
        return result;
      },
      getStudyCitationAttachmentDownload: async (reference, request) => {
        probe.downloads.push({ reference: structuredClone(reference), request: structuredClone(request) });
        if (probe.rejectPdf) throw Object.assign(new Error("Acesso ao arquivo negado."), { status: 403, code: "42501" });
        return { signedUrl: `https://example.test/arquivo.pdf?token=fresh-${probe.downloads.length}` };
      }, flush: async () => true
    };
    const app = createCourseStudyApplication({ root: document.querySelector("#citation-root"), initialProject: canonical, repository, visitor: !owned,
      onSaveManualEdit: async request => {
        probe.edits.push(structuredClone(request));
        micro.studyUnits[0] = structuredClone(request.studyUnit);
        return { courseId: path[0], courseRevision: 2, version: 2, studyUnit: structuredClone(request.studyUnit) };
      },
      downloadCitationPdf: url => { probe.opened.push(url); } });
    globalThis.__citationProbe = probe; globalThis.__citationApp = app; globalThis.__citationPath = path;
    await app.openEntityPath([...path, "citation-unit"]);
    await document.fonts.ready;
  }, { initial: project, citations: projection(), expression: wideExpression(), defer, owned });
}

test("chamadas de unidade e trecho abrem folha acessível e restauram leitura em oito combinações", async ({ page }, testInfo) => {
  await mount(page);
  const marker = page.getByRole("button", { name: "Referência 2", exact: true });
  await expect(marker).toBeVisible();
  expect(await page.evaluate(() => globalThis.__citationProbe.reads.length)).toBe(1);
  expect(await marker.evaluate(node => node.parentElement.previousElementSibling?.dataset.packageManualFieldPath)).toBe("text");
  for (const width of [360, 390, 430, 1280]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 850 });
    await page.evaluate(mode => { document.documentElement.dataset.colorMode = mode; }, theme);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(theme);
    await marker.scrollIntoViewIfNeeded(); await marker.focus();
    const before = await page.locator(".card-sheet-content").evaluate(node => node.scrollTop);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Referência", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Fechar fontes" })).toBeFocused();
    await expect(page.getByText("Seção 2 · p. 6", { exact: true })).toBeVisible();
    await expect(page.getByText("Sustentação conceitual", { exact: true })).toBeVisible();
    expect(await page.locator(".app-shell > .screen").evaluate(node => node.inert)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const last = page.getByRole("dialog").locator("a,button").last();
    await last.focus(); await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Fechar fontes" })).toBeFocused();
    if (width === 390 && theme === "dark") await page.screenshot({ path: testInfo.outputPath("study-reference-390-dark.png"), fullPage: true });
    await page.keyboard.press("Escape");
    await expect(marker).toBeFocused();
    expect(Math.abs(await page.locator(".card-sheet-content").evaluate(node => node.scrollTop) - before)).toBeLessThanOrEqual(1);
  }
  await page.getByRole("button", { name: "Referência 3, trecho a revisar" }).click();
  await expect(page.getByText("O trecho mudou e precisa de revisão. A referência foi conservada.", { exact: true })).toBeVisible();
  await expect(page.getByText("Leitura complementar", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).not.toContainText("missing");
  await page.getByRole("button", { name: "Fechar fontes" }).click();
});

test("toque mantém rolagem interna e PDF escolhe hash/posição com autorização nova em cada tentativa", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mount(page);
  const math = page.locator(".package-rich-math");
  await math.scrollIntoViewIfNeeded();
  await math.evaluate(node => { node.scrollLeft = 260; });
  await page.getByRole("button", { name: "Fontes", exact: true }).tap();
  await expect(page.getByRole("dialog", { name: "Fontes", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fechar fontes" }).tap();
  expect(await math.evaluate(node => node.scrollLeft)).toBe(260);
  await page.getByRole("button", { name: "Referência 2", exact: true }).tap();
  const pdf = page.getByRole("button", { name: "Abrir PDF em p. 6 de Fonte do trecho", exact: true });
  await page.evaluate(() => { globalThis.__citationProbe.rejectPdf = true; });
  await pdf.tap(); await expect(page.getByRole("alert")).toBeVisible();
  expect(await page.evaluate(() => globalThis.__citationProbe.opened.length)).toBe(0);
  await page.evaluate(() => { globalThis.__citationProbe.rejectPdf = false; });
  await pdf.tap();
  await expect.poll(() => page.evaluate(() => globalThis.__citationProbe.opened.length)).toBe(1);
  expect(await page.evaluate(() => globalThis.__citationProbe.downloads.map(item => item.request.attachment.contentHash))).toEqual([hashB, hashB]);
  expect(await page.evaluate(() => globalThis.__citationProbe.opened[0])).toBe("https://example.test/arquivo.pdf?token=fresh-2#page=6");
  await pdf.tap();
  expect(await page.evaluate(() => globalThis.__citationProbe.opened[1])).toBe("https://example.test/arquivo.pdf?token=fresh-3#page=6");
  await page.context().route("https://example.test/referencia", route => route.fulfill({
    status: 200, contentType: "text/html; charset=utf-8", body: "<meta charset='utf-8'><title>Fonte sintética aberta</title><p>Referência externa de teste.</p>"
  }));
  const externalLink = page.getByRole("link", { name: "Abrir fonte", exact: true });
  const popupPromise = page.waitForEvent("popup");
  await externalLink.tap();
  const popup = await popupPromise;
  await expect(popup).toHaveTitle("Fonte sintética aberta");
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await popup.close();
  await expect(page.getByRole("dialog", { name: "Referência", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fechar fontes" }).tap();
  await expect(page.getByRole("button", { name: "Referência 2", exact: true })).toBeFocused();
});

test("resposta tardia da unidade anterior não reaponta chamadas nem reabre a folha", async ({ page }) => {
  await mount(page, { defer: true });
  await page.evaluate(async () => { await globalThis.__citationApp.openEntityPath([...globalThis.__citationPath, "next-unit"]); });
  await expect(page.getByText("Uma leitura independente.", { exact: true })).toBeVisible();
  await page.evaluate(() => { globalThis.__citationProbe.release(); });
  await expect(page.locator(".source-marker")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Fontes", exact: true }).click();
  await expect(page.getByText("Nenhuma fonte.", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).not.toContainText("Fonte do trecho");
});

test("editar a folha citada conserva vínculo sem persistir números e torna trecho alterado uma pendência", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page, { owned: true });
  await expect(page.getByRole("button", { name: "Referência 2", exact: true })).toBeVisible();
  const cited = page.locator('[data-package-instance-id="cited"]');
  const geometry = () => cited.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const reader = node.closest(".card-sheet-content");
    return { width: rect.width, height: rect.height, x: rect.x,
      offset: rect.top - reader.getBoundingClientRect().top + reader.scrollTop };
  });
  const before = await geometry();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.locator('[data-resource-target-id="content:cited"]').click();
  const field = page.locator('[data-package-instance-id="cited"] [data-manual-edit-path="text"]');
  await expect(field).toBeEditable();
  const editing = await geometry();
  for (const key of Object.keys(before)) expect(Math.abs(editing[key] - before[key]), key).toBeLessThanOrEqual(1);
  expect(await field.locator(".source-marker").count()).toBe(0);
  await field.fill("Um bloco liga interfaces e preserva a explicação completa.");
  await page.getByRole("button", { name: "Salvar edição", exact: true }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__citationProbe.edits.length)).toBe(1);
  expect(await page.evaluate(() => globalThis.__citationProbe.edits[0].studyUnit.content.find(item => item.id === "cited").data))
    .toEqual({ text: "Um bloco liga interfaces e preserva a explicação completa." });
  await expect(page.getByRole("button", { name: "Referência 2, trecho a revisar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Referência 2, trecho a revisar", exact: true }).click();
  await expect(page.getByText("O trecho mudou e precisa de revisão. A referência foi conservada.", { exact: true })).toBeVisible();
  await expect(page.locator(".study-citation-quote")).toHaveText("quadro");
  expect(await page.evaluate(() => globalThis.__citationProbe.reads.length)).toBe(2);
});
