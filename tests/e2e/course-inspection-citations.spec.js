import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { UX_UI_328_COURSE_ID } from "../fixtures/uxUi328Fixture.js";

const unit = (page, ordinal = 1) => page.locator(`[data-inspection-study-unit="ux328-unit-${String(ordinal).padStart(2, "0")}"]`);
const repeatedText = "Um **quadro** liga duas interfaces. Outro **quadro** recebe dados.";

// Inject into a private copy of the harness before createSurface. Every source
// read passes the production normalizer; fixture writes retain the actual input.
function installCitationFixture(fixture, helpers, documentValue, options) {
  const { normalizeCourseSourcesRead, normalizeCourseSourcePdfDownload,
    createEmptyCourseSourceBibliographicMetadata } = helpers;
  const timestamp = "2026-09-12T00:00:00.000Z";
  const contentHash = "a".repeat(64);
  const sourceId = "inspection-source-synthetic";
  const source = {
    sourceId, revision: 1, status: "active", kind: "book", defaultRoles: ["technical_conceptual"],
    title: "Interfaces e quadros: obra sintética", authors: [{ literal: "Grupo Sintético" }],
    publicationDate: "2026", identifier: null, language: "pt-BR", citationMode: "generated", citationText: null,
    bibliographic: { ...createEmptyCourseSourceBibliographicMetadata(), publisher: "Editora Sintética", publisherPlace: "Cidade Sintética" },
    url: "https://example.test/obra-sintetica", editionOrVersion: null, origin: "author_provided",
    availability: "private", verificationStatus: "unverified", studyVisibility: "hidden", publicFileAccess: "restricted",
    anchorCount: 1, createdAt: timestamp,
    anchors: [{ anchorId: "inspection-anchor-synthetic", revision: 1, sourceRevision: 1, status: "active",
      selector: { kind: "text_quote", exact: "Passagem sintética da obra.", prefix: null, suffix: null },
      contentHash, humanLocator: "Passagem sintética da obra", verificationExcerpt: "Passagem sintética da obra.",
      needsReverification: false, createdAt: timestamp }],
    attachments: [{ contentHash, byteSize: 128, mediaType: "application/pdf",
      storagePath: `${fixture.course.courseId}/${contentHash}.pdf`, publicFileAccess: "restricted", createdAt: timestamp }]
  };
  const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
  fixture.units[0].studyUnit.content = [
    paragraph("inspection-repeated-first", options.repeatedText),
    paragraph("inspection-repeated-second", options.repeatedText),
    paragraph("inspection-tail", "A leitura prossegue com condições e limites do exemplo sintético. ".repeat(16))
  ];
  const link = (linkId, prefix, suffix) => ({ linkId, sourceId, relation: "supported_by", roles: ["technical_conceptual"],
    anchors: [{ anchorId: source.anchors[0].anchorId }], occurrences: [{ occurrenceId: "same-occurrence-id",
      slot: "content", resourceId: "inspection-repeated-second", path: "text", quote: "**quadro**", prefix, suffix }] });
  const links = [link("inspection-link-second", "Outro ", " recebe"), link("inspection-link-first", "Um ", " liga")];
  const probe = fixture.citationProbe = { reads: [], delivered: [], writes: [], pdfReads: [], opened: [], release: null };
  const sourcePage = (mode, query, items) => normalizeCourseSourcesRead({
    contract: "aralearn.course-sources.v3", bibliographyStyle: "abnt-2025", courseId: fixture.course.courseId,
    courseRevision: fixture.course.revision, mode, query, pdfStorage: { uniqueBytes: 128, maxUniqueBytes: 64 * 1024 * 1024 },
    items, nextCursor: null
  });
  fixture.controller.loadCourseSources = async (_courseId, request = {}) => {
    probe.reads.push(structuredClone(request));
    const query = { sourceId: request.sourceId || null, targetKind: request.targetKind || null, targetId: request.targetId || null };
    const mode = request.mode || (query.sourceId ? "source" : query.targetId ? "target" : "catalog");
    let result;
    if (mode === "target") {
      const current = fixture.units.find(item => item.studyUnit.id === query.targetId);
      result = sourcePage(mode, query, current ? [{ targetKind: "study_unit", targetId: current.studyUnit.id,
        targetVersion: current.version, sourceLinks: current === fixture.units[0] ? links : [], createdAt: timestamp }] : []);
      if (options.defer && current === fixture.units[0]) await new Promise(resolve => { probe.release = resolve; });
    } else if (mode === "source") result = sourcePage(mode, query, [source]);
    else {
      const catalogSource = { ...source }; delete catalogSource.anchors; delete catalogSource.attachments;
      result = sourcePage(mode, { sourceId: null, targetKind: null, targetId: null }, [catalogSource]);
    }
    probe.delivered.push(structuredClone(request));
    return result;
  };
  fixture.controller.getCourseSourceAttachmentDownload = async request => {
    probe.pdfReads.push(structuredClone(request));
    return normalizeCourseSourcePdfDownload({ contract: "aralearn.course-source-pdf-download.v2",
      courseId: fixture.course.courseId, courseRevision: fixture.course.revision, sourceId, sourceRevision: 1,
      attachment: { contentHash, byteSize: 128, mediaType: "application/pdf" },
      signedUrl: "https://example.test/inspection-source.pdf?token=synthetic&download=1", expiresAt: "2099-01-01T00:00:00.000Z" });
  };
  fixture.controller.mutateCourseSources = async () => { throw new Error("Este ensaio permite somente leitura de fontes."); };
  const createElement = documentValue.createElement.bind(documentValue);
  documentValue.createElement = (...args) => {
    const node = createElement(...args);
    if (String(args[0]).toLowerCase() === "a") {
      const click = node.click.bind(node);
      node.click = () => node.href.startsWith("https://example.test/inspection-source.pdf")
        ? probe.opened.push({ href: node.href, target: node.target, download: node.hasAttribute("download") }) : click();
    }
    return node;
  };
  fixture.controller.commitCourseComposition = async request => {
    probe.writes.push(structuredClone(request));
    const current = fixture.units.find(item => item.studyUnit.id === request.studyUnit.id);
    if (request.expectedCourseRevision !== fixture.course.revision || request.expectedStudyUnitVersion !== current.version) {
      throw new Error("A escrita sintética exige a versão corrente.");
    }
    current.studyUnit = structuredClone(request.studyUnit); current.version += 1; fixture.course.revision += 1;
    return { courseId: fixture.course.courseId, courseRevision: fixture.course.revision,
      studyUnitId: current.studyUnit.id, studyUnit: structuredClone(current.studyUnit), version: current.version,
      origin: "manual", reconciled: true, updatedAt: timestamp };
  };
}

async function mount(page, { width = 390, defer = false } = {}) {
  await page.setViewportSize({ width, height: 844 });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  for (const relative of ["fixtures/uxUi328.html", "fixtures/uxUi328Harness.js", "fixtures/uxUi328Fixture.js",
    "fixtures/courseCurriculumMapFixture.js", "helpers/courseDesignFixture.js"]) {
    let body = await readFile(new URL(`../${relative}`, import.meta.url), "utf8");
    if (relative.endsWith(".html")) body = body.replace("</head>", '<link rel="stylesheet" href="/study-references.css"></head>');
    if (relative.endsWith("Harness.js")) {
      body = 'import * as citationHelpers from "../../src/domain/courseSources.js";\n' + body.replace(
        "const surface = createCourseAuthoringSurface(",
        `(${installCitationFixture.toString()})(fixture, citationHelpers, document, ${JSON.stringify({ repeatedText, defer })});\nconst surface = createCourseAuthoringSurface(`);
    }
    await page.route(url => url.pathname === `/tests/${relative}`, route => route.fulfill({ body,
      contentType: relative.endsWith(".html") ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8" }));
  }
  await page.goto(`/tests/fixtures/uxUi328.html#/authoring/courses/${UX_UI_328_COURSE_ID}?section=content&studyUnitId=ux328-unit-01`);
  await expect(page.locator("html")).toHaveAttribute("data-fixture-ready", "true");
  await expect(page.locator(".course-authoring-surface")).toHaveAttribute("aria-busy", "false");
  return errors;
}

const marker = (page, linkId) => unit(page).locator(`[data-action="open-citation"][data-citation-link-id="${linkId}"]`);

for (const width of [390, 1280]) test(`citações da unidade preservam trecho, vínculo, referência e acesso em ${width}px`, async ({ page }, info) => {
  const errors = await mount(page, { width });
  const current = unit(page);
  const first = current.locator('[data-package-instance-id="inspection-repeated-first"]');
  const second = current.locator('[data-package-instance-id="inspection-repeated-second"]');
  await expect(current.locator('[data-action="open-citation"]')).toHaveCount(2);
  await expect(first.locator(".source-marker")).toHaveCount(0);
  await expect(second.locator(".source-marker")).toHaveCount(2);
  expect((await second.innerText()).replaceAll("\u2060", "")).toBe("Um quadro2 liga duas interfaces. Outro quadro1 recebe dados.");
  await expect(marker(page, "inspection-link-second").locator("sup")).toHaveText("1");
  await second.screenshot({ path: info.outputPath(`inspection-inline-citations-${width}.png`) });
  const references = current.locator("[data-inspection-references]");
  await expect(references.locator(".study-citation-list > li")).toHaveCount(2);
  await expect(current.locator(".course-inspection-item-actions [data-inspection-edit-sources]")).toHaveCount(0);
  await expect(references.locator("[data-inspection-edit-sources]")).toHaveCount(1);
  expect(await references.evaluate(node => Boolean(node.compareDocumentPosition(node.closest("article").querySelector(".course-inspection-runtime")) & Node.DOCUMENT_POSITION_PRECEDING))).toBe(true);
  for (const linkId of ["inspection-link-second", "inspection-link-first"]) {
    const citation = marker(page, linkId);
    await citation.scrollIntoViewIfNeeded(); await citation.click();
    const reference = references.locator(`[data-citation-reference-id="${linkId}"]`);
    await expect(reference).toBeFocused();
    await expect(reference.locator(".study-citation-reference")).toContainText(/Grupo Sintético/iu);
    await expect(reference.locator(".study-citation-reference")).toContainText("Interfaces e quadros: obra sintética");
    await expect(reference.locator(".study-citation-reference")).toContainText("2026");
    const backlink = reference.locator('[data-action="return-citation"][data-citation-occurrence-id="same-occurrence-id"]');
    await expect(backlink).toHaveAttribute("data-citation-link-id", linkId);
    await backlink.click(); await expect(citation).toBeFocused();
  }
  await marker(page, "inspection-link-second").click();
  await references.locator('[data-citation-reference-id="inspection-link-second"] [data-action="download-citation-attachment"]').click();
  await expect.poll(() => page.evaluate(() => globalThis.uxUi328.citationProbe.opened.length)).toBe(1);
  expect(await page.evaluate(() => globalThis.uxUi328.citationProbe.opened[0])).toEqual({
    href: "https://example.test/inspection-source.pdf?token=synthetic#:~:text=Passagem%20sint%C3%A9tica%20da%20obra.", target: "_blank", download: false });
  expect(await page.evaluate(() => globalThis.uxUi328.citationProbe.pdfReads[0])).toMatchObject({
    courseId: UX_UI_328_COURSE_ID, expectedCourseRevision: 5, sourceId: "inspection-source-synthetic", sourceRevision: 1, contentHash: "a".repeat(64) });
  await references.screenshot({ path: info.outputPath(`inspection-references-${width}.png`) });
  await page.getByRole("button", { name: "Próxima unidade", exact: true }).click();
  await expect(unit(page, 2)).toBeVisible();
  const emptyReferences = unit(page, 2).locator("[data-inspection-references]");
  await expect(emptyReferences.locator(".study-citation-list")).toHaveCount(0);
  await expect(emptyReferences.locator("[data-inspection-edit-sources]")).toBeVisible();
  await expect(unit(page, 2).locator(".course-inspection-item-actions [data-inspection-edit-sources]")).toHaveCount(0);
  await emptyReferences.locator("[data-inspection-edit-sources]").click();
  const sourceDialog = page.getByRole("dialog", { name: "Fontes", exact: true });
  await expect(sourceDialog).toBeVisible();
  await expect(sourceDialog).toContainText("Sem fontes vinculadas");
  await expect(sourceDialog.getByRole("button", { name: "Nova fonte: PDF ou link", exact: true })).toBeVisible();
  await sourceDialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(emptyReferences.locator("[data-inspection-edit-sources]")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("edição de unidade citada preserva geometria e salva somente o texto do autor", async ({ page }, info) => {
  const errors = await mount(page);
  const current = unit(page);
  await expect(current.locator(".source-marker")).toHaveCount(2);
  const measure = () => current.locator(".course-inspection-runtime").evaluate(node => {
    const box = node.getBoundingClientRect(), item = node.closest("[data-inspection-study-unit]").getBoundingClientRect();
    return { x: box.x, y: box.y - item.y, width: box.width, height: box.height };
  });
  const before = await measure();
  await current.getByRole("button", { name: "Editar", exact: true }).click();
  for (const [key, value] of Object.entries(await measure())) expect(Math.abs(value - before[key]), key).toBeLessThanOrEqual(1);
  await current.getByRole("button", { name: "Selecionar recurso para edição", exact: true }).nth(1).click();
  const field = current.locator('[data-package-instance-id="inspection-repeated-second"] [data-manual-edit-path="text"]');
  await expect(field).toBeEditable();
  expect(await field.evaluate(async node => {
    const { serializeManualEditableNode } = await import("/src/ui/manualInlineFields.js");
    return serializeManualEditableNode(node).replace(/\n+$/u, "");
  })).toBe(repeatedText);
  await current.locator('[data-package-instance-id="inspection-repeated-second"]').screenshot({ path: info.outputPath("inspection-citation-noop-390.png") });
  for (const [key, value] of Object.entries(await measure())) expect(Math.abs(value - before[key]), key).toBeLessThanOrEqual(1);
  await current.getByRole("button", { name: "Salvar edição", exact: true }).click();
  expect(await page.evaluate(() => globalThis.uxUi328.citationProbe.writes)).toEqual([]);
  for (const [key, value] of Object.entries(await measure())) expect(Math.abs(value - before[key]), key).toBeLessThanOrEqual(1);
  await current.getByRole("button", { name: "Editar", exact: true }).click();
  await current.getByRole("button", { name: "Selecionar recurso para edição", exact: true }).nth(1).click();
  const edited = `${repeatedText} Condição acrescentada pelo autor sintético.`;
  await field.fill(edited);
  await current.getByRole("button", { name: "Salvar edição", exact: true }).click();
  await expect.poll(() => page.evaluate(() => globalThis.uxUi328.citationProbe.writes.length)).toBe(1);
  expect(await page.evaluate(() => globalThis.uxUi328.units[0].studyUnit.content[1].data.text)).toBe(edited);
  const saved = await page.evaluate(() => globalThis.uxUi328.citationProbe.writes[0].studyUnit);
  expect(saved.content[1].data.text).toBe(edited);
  expect(JSON.stringify(saved)).not.toMatch(/source-marker|data-citation|same-occurrence-id|\u2060/u);
  await page.screenshot({ path: info.outputPath("inspection-citation-edit-390.png") });
  expect(errors).toEqual([]);
});

test("fonte da unidade anterior que chega tarde conserva unidade, foco, rolagem e rascunho correntes", async ({ page }) => {
  const errors = await mount(page, { defer: true });
  await expect.poll(() => page.evaluate(() => typeof globalThis.uxUi328.citationProbe.release)).toBe("function");
  await page.getByRole("button", { name: "Próxima unidade", exact: true }).click();
  const next = unit(page, 2);
  await next.getByRole("button", { name: "Editar", exact: true }).click();
  await next.getByRole("button", { name: "Selecionar recurso para edição", exact: true }).click();
  const field = next.locator('[data-manual-edit-path="text"]');
  const draft = "Rascunho sintético preservado na unidade seguinte. ".repeat(20);
  await field.fill(draft); await field.focus();
  const before = await page.evaluate(() => ({ hash: location.hash, windowY: scrollY,
    scrollers: [...document.querySelectorAll(".course-authoring-root, .course-authoring-surface")].map(node => node.scrollTop) }));
  await page.evaluate(() => globalThis.uxUi328.citationProbe.release());
  await expect.poll(() => page.evaluate(() => globalThis.uxUi328.citationProbe.delivered.some(read => read.targetId === "ux328-unit-01"))).toBe(true);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForLoadState("networkidle");
  await expect(field).toBeFocused(); await expect(field).toHaveText(draft);
  await expect(page.locator("[data-inspection-study-unit]")).toHaveCount(1);
  await expect(next.locator(".source-marker")).toHaveCount(0);
  const after = await page.evaluate(() => ({ hash: location.hash, windowY: scrollY,
    scrollers: [...document.querySelectorAll(".course-authoring-root, .course-authoring-surface")].map(node => node.scrollTop) }));
  expect(after).toEqual(before);
  expect(await page.evaluate(() => globalThis.uxUi328.citationProbe.writes)).toEqual([]);
  expect(errors).toEqual([]);
});
