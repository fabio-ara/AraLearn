import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { UX_UI_328_COURSE_ID } from "../fixtures/uxUi328Fixture.js";

const fixturePath = "/tests/fixtures/uxUi328.html";
const courseRoute = `#/authoring/courses/${UX_UI_328_COURSE_ID}`;
const card = (page, ordinal = 1) => page.locator(`[data-inspection-study-unit="ux328-unit-${String(ordinal).padStart(2, "0")}"]`);
const disclosure = (page, key) => page.locator(`[data-curriculum-expansion="${key}"]`);

test.beforeEach(async ({ page }) => {
  // The release artifact deliberately excludes /tests. Fulfill only the five
  // synthetic harness assets; all /src modules and CSS come from the server
  // under test, equally for development and the existing .pages runner.
  for (const relative of ["fixtures/uxUi328.html", "fixtures/uxUi328Harness.js", "fixtures/uxUi328Fixture.js",
    "fixtures/courseCurriculumMapFixture.js", "helpers/courseDesignFixture.js"]) {
    const body = await readFile(new URL(`../${relative}`, import.meta.url), "utf8");
    await page.route(url => url.pathname === `/tests/${relative}`, route => route.fulfill({ body,
      contentType: relative.endsWith(".html") ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8" }));
  }
});

async function open(page, section = "content", query = "", ordinal = 1) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${fixturePath}${query}${courseRoute}?section=${section}${section === "content" ? `&studyUnitId=ux328-unit-${String(ordinal).padStart(2, "0")}` : ""}`);
  await expect(page.locator("html")).toHaveAttribute("data-fixture-ready", "true");
  await expect(page.locator(".course-authoring-surface")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByText(/indisponível$/u)).toHaveCount(0);
}

async function expandMap(page) {
  await open(page, "planning");
  await disclosure(page, "module:module-1").locator(":scope > summary").click();
  await disclosure(page, "lesson:lesson-1-1").locator(":scope > summary").click();
}

function knownDefect(id, message) {
  // Mark only after fixture setup and actual measurement succeeded. A setup error
  // is an unexpected failure; a correction is an unexpected pass until reviewed.
  if (process.env.ARALEARN_328_STRICT !== "1") test.fail(true, `#328 ${id}: ${message}`);
}

test("#328 fixture válida: dois lotes, mapa completo, paginação e parâmetros automáticos/fixos/herdados", async ({ page }) => {
  await open(page);
  const data = await page.evaluate(() => ({ events: globalThis.uxUi328.events, count: globalThis.uxUi328.units.length,
    partCounts: globalThis.uxUi328.plan.parts.map(part => part.progress.studyUnitCount) }));
  expect(data).toMatchObject({ count: 36, partCounts: [18, 18], events: [{ revision: 4 }, { revision: 5 }] });
  expect(data.events[0].timestamp).not.toBe(data.events[1].timestamp);
  await card(page).locator('[data-inspection-selection-action="toggle-current"]').click();
  await expect(page.locator("[data-inspection-study-unit]")).toHaveCount(12);
  await page.getByRole("button", { name: "Carregar unidades posteriores", exact: true }).click();
  await expect(page.locator("[data-inspection-study-unit]")).toHaveCount(24);
  await page.getByRole("button", { name: "Cancelar seleção", exact: true }).click();
  await expect(page.locator("[data-inspection-study-unit]")).toHaveCount(1);
  await card(page).locator("[data-inspection-open-parameters]").click();
  await expect(page.getByRole("dialog", { name: "Parâmetros", exact: true })).toBeVisible();
  const design = await page.evaluate(async () => globalThis.uxUi328.controller.loadCourseDesign(globalThis.uxUi328.course.courseId, { scope: { kind: "study_unit", ref: "ux328-unit-01" } }));
  expect(design.parameters.some(item => item.effectiveAssignment.mode === "automatic")).toBe(true);
  expect(design.parameters.some(item => item.effectiveAssignment.mode === "fixed" && item.effectiveAssignment.inherited)).toBe(true);
});

test("#328 R03: seta de módulo deve compartilhar o grupo do título", async ({ page }, info) => {
  await expandMap(page);
  const module = disclosure(page, "module:module-1");
  const title = await module.locator(":scope > summary").boundingBox();
  const arrowControl = page.locator('[data-curriculum-expansion="module:module-1"] + .course-curriculum-map-open');
  const arrow = await arrowControl.boundingBox();
  await info.attach("geometry", { body: JSON.stringify({ title, arrow }), contentType: "application/json" });
  expect(arrow.y).toBeLessThan(title.y + title.height);
  expect(arrow.x).toBeGreaterThan(title.x + title.width / 2);
  await expect(module.locator(":scope > summary a")).toHaveCount(0);
  await expect(arrowControl).toHaveAccessibleName(/Inspecionar módulo:/u);
});

test("#328 R04: destinos da cobertura precisam de recuo abaixo do caminho", async ({ page }, info) => {
  await open(page, "planning");
  await disclosure(page, "coverage").locator(":scope > summary").click();
  const item = page.locator(".course-curriculum-map-coverage-item").first();
  await item.locator(":scope > summary").click();
  const parent = await item.locator(".course-curriculum-map-path").boundingBox();
  const child = await item.locator(".course-curriculum-map-targets .course-curriculum-map-links > li > a").first().boundingBox();
  await info.attach("geometry", { body: JSON.stringify({ parent, child }), contentType: "application/json" });
  expect(child.x).toBeGreaterThan(parent.x);
});

test("#328 R05: rótulo nominal da cobertura omite ponto editorial sem modificar statement", async ({ page }) => {
  await open(page, "planning");
  await disclosure(page, "coverage").locator(":scope > summary").click();
  const data = await page.evaluate(() => globalThis.uxUi328.map.curriculumScopeItems.map(item => item.statement));
  expect(data).toContain("Redes de computadores.");
  expect(data).toContain("IEEE 802.3.");
  expect(data).toContain("H.323.");
  await expect(page.locator(".course-curriculum-map-coverage-item > summary .course-curriculum-map-node-title").first()).toHaveText("Redes de computadores");
  const labels = await page.locator(".course-curriculum-map-coverage-item > summary .course-curriculum-map-node-title").allTextContents();
  expect(labels).toContain("IEEE 802.3");
  expect(labels).toContain("H.323");
  expect(labels).toContain("Alternativas...");
  expect(labels).toContain("Explicar quando o quadro é encaminhado.");
  expect(await page.evaluate(() => globalThis.uxUi328.map.curriculumScopeItems.map(item => item.statement))).toEqual(data);
});

for (const width of [360, 390, 430]) {
  test(`#328 R06: Microssequência íntegra nos detalhes em ${width}px`, async ({ page }, info) => {
    await open(page); await page.setViewportSize({ width, height: 844 });
    await card(page).locator(".course-inspection-item-details > summary").click();
    const label = card(page).locator("dt", { hasText: "Microssequência" });
    const lines = await label.evaluate(node => {
      const range = document.createRange(); range.selectNodeContents(node);
      return [...range.getClientRects()].map(rect => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }));
    });
    await info.attach("label-lines", { body: JSON.stringify(lines), contentType: "application/json" });
    expect(new Set(lines.map(line => line.y)).size).toBe(1);
  });
}

test("#328 R09: alvo e explicação de alcance ocupam blocos distintos", async ({ page }, info) => {
  await open(page); await card(page).locator("[data-inspection-open-parameters]").click();
  await page.locator(".course-design-scope > summary").click();
  const result = await page.locator(".course-design-scope > div").evaluate(node => {
    const title = node.querySelector("strong"), note = node.querySelector(".course-design-context-note");
    const titleRange = document.createRange(), noteRange = document.createRange(); titleRange.selectNodeContents(title); noteRange.selectNodeContents(note);
    const lastTitle = [...titleRange.getClientRects()].at(-1), firstNote = [...noteRange.getClientRects()][0];
    return { text: node.textContent, titleDisplay: getComputedStyle(title).display, noteDisplay: getComputedStyle(note).display,
      titleBottom: lastTitle.bottom, noteTop: firstNote.top, concatenated: node.textContent.includes("explicitadosOrienta") };
  });
  await info.attach("scope-context", { body: JSON.stringify(result), contentType: "application/json" });
  expect(result.noteTop).toBeGreaterThanOrEqual(result.titleBottom);
});

test("#328 R10: ancestrais do caminho identificam o papel curricular", async ({ page }) => {
  await open(page); await card(page).locator("[data-inspection-open-parameters]").click();
  await page.locator(".course-design-scope > summary").click();
  const first = page.getByRole("navigation", { name: "Caminho do escopo" }).locator("a").first();
  await expect(first).toBeVisible();
  await expect(first.locator("small")).toHaveText("Curso");
  await expect(first).toHaveAccessibleName(/^Curso\s/u);
});

test("#328 R11: trocar alcance e fechar conserva unidade, origem e foco", async ({ page }) => {
  await open(page); const origin = card(page).locator("[data-inspection-open-parameters]");
  const before = page.url(); await origin.click();
  await page.locator(".course-design-scope > summary").click();
  await page.getByRole("navigation", { name: "Caminho do escopo" }).locator("a").first().click();
  await expect(page.locator(".course-design-scope > summary")).toContainText("Curso");
  await page.getByRole("button", { name: "Fechar parâmetros", exact: true }).click();
  await expect(origin).toBeFocused(); expect(page.url()).toBe(before);
  await expect(card(page)).toBeVisible();
});

test("#328 R13: aviso de cancelar edição não cobre envio de observação", async ({ page }, info) => {
  await open(page); await page.clock.install();
  await card(page).getByRole("button", { name: "Editar", exact: true }).click();
  await card(page).getByRole("button", { name: "Visualizar", exact: true }).click();
  await card(page).locator("[data-inspection-observations]").click();
  await expect(page.locator("[data-observation-composer]")).toBeVisible();
  await expect(page.getByText("Não foi possível carregar as observações.", { exact: true })).toHaveCount(0);
  const notice = page.locator(".course-authoring-transient-feedback"); await expect(notice).toContainText("Edição cancelada.");
  const measured = await page.evaluate(() => {
    const message = document.querySelector(".course-authoring-transient-feedback").getBoundingClientRect();
    const submit = document.querySelector('[data-observation-composer] button[type="submit"]'); const button = submit.getBoundingClientRect();
    const overlap = Math.max(0, Math.min(message.right, button.right) - Math.max(message.left, button.left)) * Math.max(0, Math.min(message.bottom, button.bottom) - Math.max(message.top, button.top));
    return { overlap, message: message.toJSON(), button: button.toJSON(), hitIsSubmit: submit.contains(document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2)) };
  });
  await info.attach("notice-submit", { body: JSON.stringify(measured), contentType: "application/json" });
  if (process.env.ARALEARN_328_CAPTURE_DIR) {
    await page.screenshot({ path: `${process.env.ARALEARN_328_CAPTURE_DIR}/observacao-existente-colisao-e2e-390-light.png` });
  }
  expect(measured.overlap).toBe(0);
  expect(measured.hitIsSubmit).toBe(true);
  await expect(notice).toBeHidden();
  await page.locator('[data-field="study-unit-observation"]').fill("Envio sintético com aviso de fundo.");
  await page.locator('[data-observation-composer] button[type="submit"]').click();
  await expect(page.getByText("Envio sintético com aviso de fundo.", { exact: true })).toBeVisible();
});

for (const ordinal of [1, 2]) {
  test(`#328 R15/R16: segundo comando focaliza unidade ${ordinal} e recolhe múltipla`, async ({ page }) => {
    await open(page); await card(page).locator('[data-inspection-selection-action="toggle-current"]').click();
    await expect(page.locator("[data-inspection-study-unit]")).toHaveCount(12);
    await card(page, ordinal).locator('[data-inspection-selection-action="toggle-current"]').click();
    knownDefect("R15/R16", "toggle altera alvos de lote e mantém selectionMode=true");
    await expect(page.locator("[data-inspection-study-unit]")).toHaveCount(1);
    await expect(card(page, ordinal)).toBeVisible();
  });
}

test("#328 R17/R18: edição manual na múltipla focaliza alvo sem chamada de IA", async ({ page }) => {
  await open(page); const requests = [];
  page.on("request", request => { if (["fetch", "xhr"].includes(request.resourceType())) requests.push(request.url()); });
  await card(page).locator('[data-inspection-selection-action="toggle-current"]').click();
  await card(page, 2).getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.locator("[data-course-feedback-indicator]")).toBeVisible();
  await page.locator(".course-authoring-task-menu > summary").click();
  await expect(page.getByRole("alert")).toHaveText("Volte à unidade de referência antes de iniciar a edição.");
  expect(requests).toEqual([]);
  knownDefect("R17", "bloqueio local selectionMode propaga aviso global; nenhum request fetch/xhr");
  await expect(card(page, 2).getByRole("textbox", { name: "Título da unidade de estudo", exact: true })).toBeVisible();
});

test("#328 S11: Observações aberta sem rascunho permite atualização", async ({ page }, info) => {
  await open(page); await card(page).locator("[data-inspection-observations]").click();
  await expect(page.locator('[data-field="study-unit-observation"]')).toHaveValue("");
  await expect(page.getByText("Não foi possível carregar as observações.", { exact: true })).toHaveCount(0);
  const before = await page.evaluate(() => globalThis.uxUi328.requests.length);
  const result = await page.evaluate(() => globalThis.uxUi328.surface.refresh());
  const after = await page.evaluate(() => globalThis.uxUi328.requests.length);
  await expect(page.locator(".course-authoring-transient-feedback").filter({ hasText: "Atualização adiada para preservar sua edição" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: /Observações/u })).toBeVisible();
  await info.attach("empty-observation-refresh", { body: JSON.stringify({ result, before, after }), contentType: "application/json" });
  expect(result).not.toBe("deferred");
});

test("#329 nuvem da Autoria executa nova leitura e preserva unidade focal", async ({ page }) => {
  await open(page, "content", "", 13);
  const before = await page.evaluate(() => globalThis.uxUi328.requests.length);
  await page.locator('[data-authoring-runtime-status] [data-action="synchronize-study"]').click();
  await expect.poll(() => page.evaluate(() => globalThis.uxUi328.requests.length)).toBeGreaterThan(before);
  await expect(card(page, 13)).toBeVisible();
  await expect(page.locator('[data-authoring-runtime-status] [aria-busy="true"]')).toHaveCount(0);
});

test("#328 Observações válidas: existentes, longa, lista vazia e envio separado", async ({ page }) => {
  for (const ordinal of [1, 2, 3]) {
    await open(page, "content", `?observation=${ordinal}`, ordinal);
    await card(page, ordinal).locator("[data-inspection-observations]").click();
    await expect(page.locator('[data-field="study-unit-observation"]')).toHaveValue("");
    await expect(page.getByText("Não foi possível carregar as observações.", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Carregando observações…", { exact: true })).toHaveCount(0);
    if (ordinal === 1) await expect(page.getByText("Conferir a relação entre o endereço de origem e a porta aprendida.", { exact: true })).toBeVisible();
    if (ordinal === 2) await expect(page.locator(".study-observation-text")).toContainText("Observação longa sintética");
    if (ordinal === 3) {
      await page.locator('[data-field="study-unit-observation"]').fill("Registro sintético separado para a unidade 3.");
      await page.locator('[data-observation-composer] button[type="submit"]').click();
      await expect(page.getByText("Registro sintético separado para a unidade 3.", { exact: true })).toBeVisible();
      const observations = await page.evaluate(() => globalThis.uxUi328.annotations.map(item => ({ target: item.target.id, text: item.rawText })));
      expect(observations).toHaveLength(3);
      expect(observations.at(-1)).toEqual({ target: "ux328-unit-03", text: "Registro sintético separado para a unidade 3." });
    }
  }
});

test("#328 mapa abre a microssequência correta e retorna com expansão e foco", async ({ page }) => {
  await expandMap(page);
  const link = page.locator('[data-curriculum-key="microsequence:micro-1-1-2"]');
  await link.click();
  await expect(card(page, 6)).toBeVisible();
  await expect(page.locator("[data-inspection-context-position]")).toHaveText("1/5");
  expect(page.url()).toContain("didacticMicrosequenceId=micro-1-1-2");
  const lastRead = await page.evaluate(() => globalThis.uxUi328.requests.filter(request => request.kind === "inspection").at(-1));
  expect(lastRead.options.scope).toEqual({ kind: "didactic_microsequence", id: "micro-1-1-2" });
  await page.getByRole("button", { name: "Voltar para Planejamento", exact: true }).click();
  await expect(disclosure(page, "module:module-1")).toHaveAttribute("open", "");
  await expect(disclosure(page, "lesson:lesson-1-1")).toHaveAttribute("open", "");
  await expect(link).toBeFocused();
});

for (const [width, height, theme, zoom, ordinal = 3] of [[360, 640, "light", 1], [390, 440, "dark", 1],
  [430, 932, "dark", 1], [1366, 768, "light", 1], [390, 844, "light", 2], [390, 440, "dark", 1, 2]]) {
  test(`#330 Observações: foco e envio alcançáveis ${width}x${height} ${theme} ${zoom}x unidade${ordinal}`, async ({ page }, info) => {
    await open(page, "content", `?theme=${theme}&zoom=${zoom}`, ordinal);
    await page.setViewportSize({ width, height });
    const origin = card(page, ordinal).locator("[data-inspection-observations]");
    await origin.click();
    const dialog = page.getByRole("dialog", { name: "Observações da unidade", exact: true });
    const field = dialog.getByRole("textbox", { name: "Observação", exact: true });
    await expect(field).toBeFocused();
    const focus = await field.evaluate(node => {
      const css = getComputedStyle(node);
      return { outline: css.outlineWidth, border: css.borderColor, shadow: css.boxShadow };
    });
    expect(parseFloat(focus.outline)).toBeGreaterThan(0);
    expect(focus.border).toBe("rgba(0, 0, 0, 0)");
    expect(focus.shadow).toBe("none");
    expect(await field.evaluate(node => {
      const box = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
    const submit = dialog.getByRole("button", { name: "Enviar observação", exact: true });
    await submit.scrollIntoViewIfNeeded();
    const hit = await submit.evaluate(node => {
      const box = node.getBoundingClientRect();
      return { width: box.width, height: box.height, visible: node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
    });
    expect(hit.visible).toBe(true);
    await info.attach("focus-and-hit", { body: JSON.stringify({ focus, hit }), contentType: "application/json" });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(origin).toBeFocused();
  });
}

test("#331 alcance percorre curso e descendentes sem mudar tarefa nem dados", async ({ page }) => {
  await open(page);
  const origin = card(page).locator("[data-inspection-open-parameters]");
  const route = page.url();
  const original = await page.evaluate(() => JSON.stringify(globalThis.uxUi328.units));
  await origin.click();
  await page.locator(".course-design-scope > summary").click();
  await page.getByRole("navigation", { name: "Caminho do escopo" }).locator("a").first().click();
  for (const kind of ["module", "lesson", "didactic_microsequence", "study_unit"]) {
    const scope = page.locator(".course-design-scope");
    if (!(await scope.getAttribute("open"))) await scope.locator(":scope > summary").click();
    const form = page.locator("[data-course-design-scope]");
    await expect(form.locator('[name="scopeKind"]')).toHaveValue(kind);
    await form.locator("select").selectOption({ index: 1 });
    await form.getByRole("button", { name: "Abrir escopo", exact: true }).click();
    expect(page.url()).toBe(route);
  }
  await expect(page.locator(".course-design-scope > summary")).toContainText(/unidade de estudo/iu);
  await page.getByRole("button", { name: "Fechar parâmetros", exact: true }).click();
  await expect(origin).toBeFocused();
  expect(await page.evaluate(() => JSON.stringify(globalThis.uxUi328.units))).toBe(original);
});

test("#331 parâmetros por link direto conservam escopo e fecham no conteúdo", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto(`${fixturePath}?theme=dark${courseRoute}?section=parameters&studyUnitId=ux328-unit-01`);
  await expect(page.locator("html")).toHaveAttribute("data-fixture-ready", "true");
  await expect(page.locator(".course-design-scope > summary")).toContainText(/unidade de estudo/iu);
  await page.getByRole("button", { name: "Fechar parâmetros", exact: true }).click();
  await expect(card(page)).toBeVisible();
  expect(page.url()).toContain("section=content");
});

test("#331 alcance preserva rascunho modificado até descarte explícito", async ({ page }) => {
  await open(page);
  await card(page).locator("[data-inspection-open-parameters]").click();
  await page.locator('[data-course-authoring-action="edit-design-parameter"]').first().click();
  const form = page.locator("[data-course-design-parameter]");
  await form.locator('[name="reason"]').fill("Justificativa sintética ainda não salva.");
  await page.locator(".course-design-scope > summary").click();
  await page.getByRole("navigation", { name: "Caminho do escopo" }).locator("a").first().click();
  await expect(page.locator(".course-design-scope > summary")).toContainText("Curso");
  for (const kind of ["module", "lesson", "didactic_microsequence", "study_unit"]) {
    const scope = page.locator(".course-design-scope");
    if (!(await scope.getAttribute("open"))) await scope.locator(":scope > summary").click();
    const selector = page.locator("[data-course-design-scope]");
    await expect(selector.locator('[name="scopeKind"]')).toHaveValue(kind);
    await selector.locator("select").selectOption({ index: 1 });
    await selector.getByRole("button", { name: "Abrir escopo", exact: true }).click();
  }
  await expect(form.locator('[name="reason"]')).toHaveValue("Justificativa sintética ainda não salva.");
  await expect(page.locator(".course-design-scope > summary")).toContainText(/unidade de estudo/iu);
  await form.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  const scope = page.locator(".course-design-scope");
  if (!(await scope.getAttribute("open"))) await scope.locator(":scope > summary").click();
  await page.getByRole("navigation", { name: "Caminho do escopo" }).locator("a").first().click();
  await expect(page.locator(".course-design-scope > summary")).toContainText("Curso");
  await page.getByRole("button", { name: "Fechar parâmetros", exact: true }).click();
  await expect(card(page).locator("[data-inspection-open-parameters]")).toBeFocused();
});

test("#331 detalhes e Parâmetros mantêm reflow e hierarquia com ampliação", async ({ page }) => {
  await open(page, "content", "?theme=dark&zoom=2");
  await card(page).locator(".course-inspection-item-details > summary").click();
  const label = card(page).locator("dt", { hasText: "Microssequência" });
  expect(await label.evaluate(node => {
    const range = document.createRange(); range.selectNodeContents(node);
    return new Set([...range.getClientRects()].map(rect => rect.y)).size;
  })).toBe(1);
  await page.keyboard.press("Escape");
  await card(page).locator("[data-inspection-open-parameters]").click();
  const geometry = await page.locator(".course-design-context-body").evaluate(node => ({
    overflow: node.scrollWidth - node.clientWidth,
    groupWeight: getComputedStyle(node.querySelector(".course-design-category-menu > summary")).fontWeight,
    itemWeight: getComputedStyle(node.querySelector(".course-design-parameter h3")).fontWeight,
    emptyFeedback: node.querySelector(".course-design-feedback").getBoundingClientRect().height
  }));
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(Number(geometry.groupWeight)).toBeGreaterThan(Number(geometry.itemWeight));
  expect(geometry.emptyFeedback).toBe(0);
});

for (const [width, theme, zoom] of [[360, "dark", 2], [1366, "light", 1]]) {
  test(`#332 objetivo integral e cobertura legível ${width}px ${theme} ${zoom}x`, async ({ page }) => {
    await open(page, "planning", `?theme=${theme}&zoom=${zoom}`);
    await page.setViewportSize({ width, height: 844 });
    const objective = page.locator(".is-objective .course-authoring-planning-copy > p");
    await expect(objective).toHaveText(await page.evaluate(() => globalThis.uxUi328.course.goal));
    const metrics = await objective.evaluate(node => {
      const body = getComputedStyle(node), title = getComputedStyle(node.previousElementSibling);
      return { bodySize: parseFloat(body.fontSize), titleSize: parseFloat(title.fontSize),
        bodyWeight: Number(body.fontWeight), titleWeight: Number(title.fontWeight),
        overflow: node.scrollWidth - node.clientWidth, clamp: body.webkitLineClamp };
    });
    expect(metrics.bodySize).toBeGreaterThanOrEqual(12);
    expect(metrics.bodySize).toBeLessThan(metrics.titleSize);
    expect(metrics.bodyWeight).toBeLessThan(metrics.titleWeight);
    expect(metrics.overflow).toBeLessThanOrEqual(1);
    expect(metrics.clamp).toBe("none");
    await disclosure(page, "coverage").locator(":scope > summary").click();
    await page.locator(".course-curriculum-map-coverage-item").first().locator(":scope > summary").click();
    const map = page.locator(".course-curriculum-map");
    expect(await map.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await expect(page.locator(".course-curriculum-map-coverage-item[open]")).toHaveCount(1);
  });
}
