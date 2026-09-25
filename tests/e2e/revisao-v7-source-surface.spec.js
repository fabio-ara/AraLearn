import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";

const project = JSON.parse(readFileSync(new URL("../fixtures/package/project-minimal.json", import.meta.url), "utf8"));
const explanationHash = "a".repeat(64);
const unitHash = "b".repeat(64);
const locatedOccurrence = { occurrenceId: "explanation-where", slot: "content", resourceId: "explanation-cited",
  path: "text", quote: "**camada**", prefix: "Uma ", suffix: " relaciona" };
const unlocatedOccurrence = { occurrenceId: "explanation-where", slot: "content", resourceId: "explanation-absent",
  path: "text", quote: "Trecho ausente da cópia atual.", prefix: null, suffix: null };
const unitOccurrence = { occurrenceId: "unit-where", slot: "content", resourceId: "cited", path: "text",
  quote: "**quadro**", prefix: "Um ", suffix: " liga" };

function source({ linkId, citationText, occurrence, page, humanLocator, contentHash }) {
  return { linkId, sourceId: "source-" + linkId, sourceRevision: 1, kind: "article", title: "Obra " + linkId,
    authors: [{ literal: "Autoria sintética" }], publicationDate: null, identifier: null, language: "pt-BR",
    bibliographic: createEmptyCourseSourceBibliographicMetadata(), citationMode: "manual", citationText, url: null,
    editionOrVersion: null, relation: "supported_by", roles: ["technical_conceptual"], occurrences: [occurrence],
    anchors: [{ anchorId: linkId + "-page", selector: { kind: "page_range", startPage: page, endPage: page },
      humanLocator, contentHash }],
    attachments: [{ contentHash, byteSize: 128, mediaType: "application/pdf" }] };
}
const explanationSource = occurrence => source({ linkId: "explanation-source",
  citationText: "Autoria sintética. Obra da explicação para inspeção. 2026.", occurrence, page: 3,
  humanLocator: "Mecanismo", contentHash: explanationHash });
const unitSource = source({ linkId: "unit-source",
  citationText: "Autoria sintética. Obra da unidade para inspeção. 2026.", occurrence: unitOccurrence, page: 6,
  humanLocator: "Seção 2", contentHash: unitHash });

async function mount(page, { explanation = "located", unit = "located" } = {}) {
  await page.route("**/main.js", route => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.goto("/");
  const explanationCitations = explanation === "empty" ? [] : [explanationSource(
    explanation === "unlocated" ? unlocatedOccurrence : locatedOccurrence)];
  const unitCitations = unit === "empty" ? [] : [{ ...unitSource,
    occurrences: unit === "general" ? [] : unit === "unlocated"
      ? [{ ...unitOccurrence, resourceId: "absent", quote: "Trecho conservado da unidade." }] : [unitOccurrence],
    anchors: unit === "general" ? [] : unitSource.anchors }];
  await page.evaluate(async ({ initial, explanationCitations, unitCitations }) => {
    document.body.innerHTML = "<div id='source-root'></div>";
    const { createCourseStudyApplication } = await import("/src/study/CourseStudyApplication.js");
    const course = structuredClone(initial.courses[0]);
    const moduleValue = course.modules[0]; const lesson = moduleValue.lessons[0];
    const micro = lesson.microsequences[0];
    const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
    micro.studyUnits = [{ id: "source-unit", title: "Leitura com fonte", position: 1, role: "theory",
      response: null, feedback: [], topics: [], content: [paragraph("lead", "Leitura sintética de apoio. ".repeat(20)),
        paragraph("cited", "Um **quadro** liga duas interfaces."), paragraph("tail", "Retomada final. ".repeat(20))] }];
    micro.explanation = { title: "Camadas e pontas",
      content: [paragraph("explanation-cited", "Uma **camada** relaciona pontas de comunicação.")] };
    const path = [course.id, moduleValue.id, lesson.id, micro.id];
    const probe = { reads: 0, downloads: [] };
    const citations = { contract: "aralearn.course-study-citations.v2", bibliographyStyle: "abnt-2025",
      courseId: course.id, courseRevision: 1 };
    const repository = {
      loadProject: () => structuredClone({ ...initial, courses: [course] }),
      loadCourse: async () => structuredClone(course),
      loadProgress: () => ({ version: 1, lessons: {} }),
      loadAnnotationsForPath: () => [], loadReviewItems: () => [], loadRuntimeStatus: () => ({}),
      isStudyUnitMarkedForReview: () => false,
      loadCourseSummaries: () => [{ courseId: course.id, title: course.title, ownership: "public",
        canEdit: false, revision: 1, studyUnitCount: 1, availableOffline: true }],
      loadStudyUnitCompositionContext: reference => ({ courseId: reference.courseId, courseRevision: 1,
        didacticMicrosequenceId: reference.microsequenceId, studyUnitId: reference.studyUnitId, studyUnitVersion: 1 }),
      loadStudyUnitCitations: async reference => ({ ...structuredClone(citations),
        studyUnitId: reference.studyUnitId, citations: structuredClone(unitCitations) }),
      loadExplanationContext: () => ({ courseId: course.id, courseRevision: 1, microsequenceId: micro.id,
        targetKind: "microsequence_explanation", targetId: micro.id, explanation: structuredClone(micro.explanation),
        contentReview: { state: "current", approvedAt: "2026-09-07T00:00:00Z" }, state: "available",
        retainedForReview: false, availableRevision: 1, offline: false }),
      loadExplanationCitations: async () => { probe.reads += 1;
        return { ...structuredClone(citations), targetKind: "microsequence_explanation", targetId: micro.id,
          citations: structuredClone(explanationCitations) }; },
      getStudyCitationAttachmentDownload: async (reference, request) => { probe.downloads.push(structuredClone(request));
        return { signedUrl: "https://example.test/surface.pdf" }; },
      flush: async () => true };
    const app = createCourseStudyApplication({ root: document.querySelector("#source-root"), initialProject: initial,
      repository, visitor: true, downloadCitationPdf: url => probe.downloads.push(url) });
    globalThis.__sourceProbe = probe; globalThis.__sourcePath = path;
    await app.openEntityPath([...path, "source-unit"]);
    await document.fonts.ready;
  }, { initial: project, explanationCitations, unitCitations });
}

test("explicação e unidade conservam escopos próprios de fontes e o retorno ao trecho", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page);
  const dialog = page.getByRole("dialog", { name: "Explicação", exact: true });
  await page.getByRole("button", { name: "Explicação", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Referências", exact: true })).toBeVisible();
  await expect(dialog.locator(".study-bibliography")).toHaveCount(1);
  await expect(dialog.locator(".study-bibliography")).toHaveAttribute("data-citation-context", "explanation");
  await expect(dialog).toContainText("Obra da explicação para inspeção");
  await expect(dialog).not.toContainText("Obra da unidade para inspeção");
  await expect(dialog.getByRole("region", { name: "Referências desta unidade", exact: true })).toHaveCount(0);
  const marker = dialog.getByRole("button", { name: "Referência 1", exact: true });
  const reference = dialog.locator("[data-citation-reference-id='explanation-source']");
  await marker.click();
  await expect(reference).toBeFocused();
  await expect(reference.locator(".study-citation-quote")).toHaveText("camada");
  await expect(reference).toContainText("Mecanismo · p. 3");
  await page.screenshot({ path: info.outputPath("explanation-scope-390.png") });
  await reference.getByRole("button", { name: "Voltar ao trecho 1 da referência 1 na explicação", exact: true }).click();
  await expect(marker).toBeFocused();
  await dialog.getByRole("button", { name: "Fechar explicação", exact: true }).click();
  const unitMarker = page.locator(".study-reader-screen").getByRole("button", { name: "Referência 1", exact: true });
  await unitMarker.click();
  const unitDialog = page.getByRole("dialog", { name: "Fontes da unidade", exact: true });
  await expect(unitDialog.getByRole("region", { name: "Referências desta unidade", exact: true })).toBeVisible();
  await expect(unitDialog.locator(".study-bibliography")).toHaveCount(1);
  await expect(unitDialog.locator(".study-bibliography")).toHaveAttribute("data-citation-context", "unit");
  await expect(unitDialog).toContainText("Obra da unidade para inspeção");
  await expect(unitDialog).not.toContainText("Obra da explicação para inspeção");
  await expect(unitDialog).not.toContainText("Uma camada relaciona");
  await expect(unitDialog.getByRole("region", { name: "Referências", exact: true })).toHaveCount(0);
  await expect(unitDialog.locator("[data-citation-reference-id='unit-source']")).toBeFocused();
  await page.screenshot({ path: info.outputPath("unit-scope-390.png") });
  await unitDialog.getByRole("button", { name: "Voltar ao trecho 1 da referência 1 na unidade", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(unitMarker).toBeFocused();
});

test("Fontes da unidade usa entrada própria e a Explicação mantém sua leitura ao reabrir", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page);
  const dialog = page.getByRole("dialog", { name: "Explicação", exact: true });
  const explanationButton = page.getByRole("button", { name: "Explicação", exact: true });
  await explanationButton.click();
  const explanationMarker = dialog.getByRole("button", { name: "Referência 1", exact: true });
  await explanationMarker.click();
  await expect(dialog.getByRole("region", { name: "Referências", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(explanationMarker).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(explanationButton).toBeFocused();
  const unitMarker = page.locator(".study-reader-screen").getByRole("button", { name: "Referência 1", exact: true });
  await unitMarker.click();
  const unitDialog = page.getByRole("dialog", { name: "Fontes da unidade", exact: true });
  await expect(unitDialog.getByRole("region", { name: "Referências desta unidade", exact: true })).toBeVisible();
  await expect(unitDialog.getByRole("button", { name: "Referência 1", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(unitMarker).toBeFocused();
  await explanationButton.click();
  await explanationMarker.click();
  await expect(dialog.getByRole("region", { name: "Referências", exact: true })).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Referências desta unidade", exact: true })).toHaveCount(0);
  await expect(dialog).not.toContainText("Obra da unidade para inspeção");
  await expect(dialog.locator("[data-citation-reference-id='explanation-source']")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(explanationMarker).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const unit of ["unlocated", "general"]) {
  test(`Fontes da unidade alcança fonte ${unit} sem inventar retorno e restaura o acionador`, async ({ page }, info) => {
    await page.setViewportSize({ width: unit === "general" ? 320 : 390, height: 844 });
    await mount(page, { unit });
    if (unit === "general") await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const button = page.getByRole("button", { name: "Fontes da unidade", exact: true });
    await expect(button).toBeVisible();
    await expect(button).toHaveText("");
    await expect(button.locator("svg")).toHaveCount(1);
    await expect(button).toHaveAttribute("aria-expanded", "false");
    const bounds = await button.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator(".study-reader-screen .source-marker")).toHaveCount(0);
    await page.locator(".card-sheet-content").evaluate(node => { node.scrollTop = 140; });
    const before = await page.locator(".card-sheet-content").evaluate(node => node.scrollTop);
    await button.focus();
    await page.screenshot({ path: info.outputPath(`unit-source-entry-${unit}.png`) });
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Fontes da unidade", exact: true });
    const bibliography = dialog.getByRole("region", { name: "Referências desta unidade", exact: true });
    await expect(bibliography).toBeFocused();
    // O fundo está inert: o controle mantém estado no DOM, fora da árvore acessível.
    await expect(page.locator("[data-action='open-unit-sources']")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("[data-action='open-explanation']")).toHaveAttribute("aria-expanded", "false");
    await expect(dialog).toContainText("Obra da unidade para inspeção");
    await expect(dialog).not.toContainText("Nenhuma fonte.");
    await expect(dialog).not.toContainText("Obra da explicação para inspeção");
    await expect(dialog.getByRole("button", { name: /Voltar ao trecho/u })).toHaveCount(0);
    await expect(dialog.locator(".study-explanation-tools")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (unit === "unlocated") {
      await expect(dialog).toContainText("O trecho citado não foi localizado nesta cópia. A referência foi conservada.");
      await expect(dialog.locator(".study-citation-quote")).toHaveText("Trecho conservado da unidade.");
    } else {
      await expect(dialog).toContainText("Referência do conteúdo; sem trecho específico vinculado.");
      await expect(dialog.locator(".study-citation-quote, .study-citation-locations")).toHaveCount(0);
    }
    expect(await page.evaluate(() => globalThis.__sourceProbe.reads)).toBe(0);
    const close = dialog.getByRole("button", { name: "Fechar fontes", exact: true });
    await dialog.locator("button, a[href]").last().focus();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.screenshot({ path: info.outputPath(`unit-source-${unit}.png`) });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    expect(await page.locator(".card-sheet-content").evaluate(node => node.scrollTop)).toBe(before);
    await button.tap();
    await expect(bibliography).toBeFocused();
    await close.tap();
    await expect(button).toBeFocused();
  });
}

test("unidade sem fontes não recebe o controle nem herda a referência da Explicação", async ({ page }) => {
  await mount(page, { unit: "empty" });
  await expect(page.getByRole("button", { name: "Fontes da unidade", exact: true })).toHaveCount(0);
  await expect(page.locator(".study-reader-screen .source-marker")).toHaveCount(0);
  await page.getByRole("button", { name: "Explicação", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Explicação", exact: true });
  await expect(dialog).toContainText("Obra da explicação para inspeção");
  await expect(dialog).not.toContainText("Obra da unidade para inspeção");
});

test("explicação sem fonte não anuncia estado vazio nem recebe a fonte da unidade", async ({ page }) => {
  await mount(page, { explanation: "empty" });
  const dialog = page.getByRole("dialog", { name: "Explicação", exact: true });
  await page.getByRole("button", { name: "Explicação", exact: true }).click();
  await expect(dialog.locator(".study-explanation-body > h3")).toContainText("Camadas e pontas");
  await expect(dialog.locator(".study-bibliography")).toHaveCount(0);
  await expect(dialog).not.toContainText("Nenhuma fonte.");
  await expect(dialog).not.toContainText("Obra da unidade para inspeção");
  await expect(dialog.getByRole("region", { name: "Referências desta unidade", exact: true })).toHaveCount(0);
});

test("fonte existente sem trecho localizado é declarada e não oferece retorno fictício", async ({ page }, info) => {
  await mount(page, { explanation: "unlocated" });
  const dialog = page.getByRole("dialog", { name: "Explicação", exact: true });
  await page.getByRole("button", { name: "Explicação", exact: true }).click();
  const reference = dialog.locator("[data-citation-reference-id='explanation-source']");
  await expect(reference).toContainText("O trecho citado não foi localizado nesta cópia. A referência foi conservada.");
  await expect(dialog.locator("[data-explanation-source-markers]"))
    .toContainText("Fontes registradas sem trecho localizado nesta cópia:");
  await expect(reference.getByRole("button", { name: /Voltar ao trecho/u })).toHaveCount(0);
  const pending = dialog.getByRole("button", { name: "Referência 1, trecho a revisar", exact: true });
  await expect(pending).toHaveCount(1);
  await pending.click();
  await expect(reference).toBeFocused();
  await page.screenshot({ path: info.outputPath("unlocated-source-390.png") });
});

for (const width of [390, 320]) for (const textScale of [100, 200]) {
  test("obra conduz trecho e âncora em " + width + "px com texto " + textScale + "%", async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 });
    await mount(page);
    if (textScale !== 100) await page.evaluate(scale => { document.documentElement.style.fontSize = scale + "%"; }, textScale);
    const dialog = page.getByRole("dialog", { name: "Explicação", exact: true });
    await page.getByRole("button", { name: "Explicação", exact: true }).click();
    await dialog.getByRole("button", { name: "Referência 1", exact: true }).click();
    const measured = await dialog.locator("[data-citation-reference-id='explanation-source']").evaluate(node => {
      const read = selector => {
        const target = node.querySelector(selector);
        const value = getComputedStyle(target);
        return { fontSize: Number.parseFloat(value.fontSize), fontWeight: Number.parseInt(value.fontWeight, 10),
          color: value.color, borderInlineStartWidth: Number.parseFloat(value.borderInlineStartWidth),
          text: target.textContent };
      };
      return { quote: read(".study-citation-quote"), reference: read(".study-citation-reference"),
        locations: read(".study-citation-locations"),
        overflow: document.documentElement.scrollWidth - innerWidth };
    });
    expect(measured.quote.text).toBe("camada");
    expect(measured.reference.text).toContain("Obra da explicação para inspeção");
    expect(measured.locations.text).toContain("Mecanismo · p. 3");
    expect(measured.quote.fontSize).toBeLessThanOrEqual(measured.reference.fontSize);
    expect(measured.locations.fontSize).toBeLessThanOrEqual(measured.reference.fontSize);
    expect(measured.quote.fontWeight).toBeLessThanOrEqual(measured.reference.fontWeight);
    expect(measured.quote.borderInlineStartWidth).toBeLessThanOrEqual(2);
    expect(measured.overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("source-hierarchy-" + width + "-" + textScale + ".png") });
  });
}
