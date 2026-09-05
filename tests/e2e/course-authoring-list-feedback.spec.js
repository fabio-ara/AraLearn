import { test, expect } from "@playwright/test";

async function mount(page, theme, items = null) {
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.goto("/");
  await page.evaluate(async ({ theme, items }) => {
    document.documentElement.dataset.colorMode = theme;
    document.body.innerHTML = '<div id="app-root"><main id="course-authoring-root" class="course-authoring-root"></main></div>';
    const { createCourseAuthoringSurface } = await import("/src/ui/CourseAuthoringSurface.js");
    const courseId = "e3060000-0000-4000-8000-000000000011";
    const unused = async () => { throw new Error("Fora desta jornada de lista."); };
    const controller = Object.fromEntries(["getCourse", "loadAuthoringOutline", "loadAuthoringStudyUnits", "loadAuthoringInspectionPosition",
      "saveAuthoringInspectionPosition", "createCourse", "loadAuthoringPlan", "loadCourseDesign", "mutateCourseDesign"].map(name => [name, unused]));
    window.listRequests = [];
    Object.assign(controller, {
      getCourse: items ? async id => { window.listOpenedCourseId = id; return unused(); } : unused,
      listCourses: async () => {
        if (window.listReadFailure) throw Object.assign(new Error("Conexão interrompida"), { code: "network_error" });
        return { items: items || [{ courseId, title: "Curso sintético de avisos", revision: 1, ownership: "owned", canEdit: true }], hasMore: false, nextCursor: null };
      },
      createCourse: async request => {
        window.listRequests.push(request);
        throw Object.assign(new Error("Resposta sintética perdida"), { code: "network_error", ambiguous: true });
      }
    });
    window.listSurface = createCourseAuthoringSurface({ root: document.querySelector("#course-authoring-root"), controller,
      locationValue: { pathname: "/", search: "", hash: "" } });
    await window.listSurface.open();
    await document.fonts.ready;
  }, { theme, items });
}

for (const width of [360, 390, 430, 1280]) for (const theme of ["light", "dark"]) {
  test(`Lista mantém slots e texto integral com conteúdo variável ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const entries = [
      { title: "Curso curto", goal: "Objetivo curto." },
      { title: "Duas linhas", goal: "Objetivo distribuído em duas linhas visíveis numa tela compacta." },
      { title: "Título integral para leitura com várias palavras e relações. ".repeat(4) + "FIM DO TÍTULO",
        goal: "Objetivo integral: reconhecer relações, desenvolver explicações e resolver exemplos com critérios claros. ".repeat(14) + "FIM DO OBJETIVO" },
      { title: "Sem objetivo" }
    ].map((entry, index) => ({ courseId: `e3060000-0000-4000-8000-00000000002${index}`, revision: 1,
      ownership: "owned", canEdit: true, counts: index === 3 ? null : { moduleCount: 1, lessonCount: 1, topicCount: 0,
        microsequenceCount: index ? 123456 : 1, studyUnitCount: index ? 987654 : 2 }, ...entry }));
    await mount(page, theme, entries);
    const cards = page.locator(".course-authoring-course-card");
    await expect(cards).toHaveCount(entries.length);
    const geometry = await cards.evaluateAll(nodes => nodes.map(node => {
      const card = node.getBoundingClientRect();
      return { width: card.width, height: card.height,
        slots: [...node.querySelector(".course-authoring-course-copy").children].map(child => {
          const box = child.getBoundingClientRect();
          return { x: box.x - card.x, y: box.y - card.y, width: box.width, height: box.height };
        }) };
    }));
    for (const measured of geometry) {
      expect(measured.height).toBe(140);
      expect(measured).toEqual(geometry[0]);
      expect(measured.slots.map(slot => slot.height)).toEqual([44, 44, 20]);
    }
    for (const [index, entry] of entries.entries()) {
      await expect(cards.nth(index)).toHaveAttribute("data-course-id", entry.courseId);
      await expect(cards.nth(index)).toHaveAttribute("href", `#/authoring/courses/${entry.courseId}?section=content`);
      await expect(cards.nth(index)).toHaveAccessibleName(`Abrir ${entry.title}`);
      await expect(cards.nth(index).locator(".course-authoring-course-copy > span")).toHaveText(entry.goal || "");
    }
    const longCard = cards.nth(2), title = longCard.locator("strong"), goal = longCard.locator(".course-authoring-course-copy > span");
    const meta = longCard.locator(".course-authoring-meta");
    const before = await longCard.boundingBox();
    if (width === 390) {
      const goalBox = await goal.boundingBox();
      const touch = await page.context().newCDPSession(page);
      const touchX = goalBox.x + goalBox.width / 2;
      await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: touchX, y: goalBox.y + 35 }] });
      await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: touchX, y: goalBox.y + 15 }] });
      await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: touchX, y: goalBox.y - 45 }] });
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(() => goal.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.listOpenedCourseId ?? null)).toBeNull();
      await touch.detach();
    }
    await longCard.focus(); await expect(longCard).toBeFocused();
    await page.keyboard.press("Tab"); await expect(title).toBeFocused();
    await page.keyboard.press("End");
    await expect.poll(() => title.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await expect(title).toContainText("FIM DO TÍTULO");
    await page.keyboard.press("Tab"); await expect(goal).toBeFocused();
    await page.keyboard.press("End");
    await expect.poll(() => goal.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await expect(goal).toContainText("FIM DO OBJETIVO");
    if (await meta.evaluate(node => node.scrollHeight > node.clientHeight)) {
      await page.keyboard.press("Tab"); await expect(meta).toBeFocused();
      await page.keyboard.press("End");
      await expect.poll(() => meta.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    } else {
      expect(await meta.evaluate(node => node.scrollHeight)).toBeLessThanOrEqual(20);
    }
    await expect(meta).toContainText("987654 unidades");
    expect(await page.evaluate(() => window.listOpenedCourseId ?? null)).toBeNull();
    expect(await longCard.boundingBox()).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await goal.evaluate(node => { node.scrollTop = 0; });
    await title.evaluate(node => { node.scrollTop = 0; });
    await meta.evaluate(node => { node.scrollTop = 0; });
    await cards.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`course-list-slots-${width}-${theme}.png`) });
    await longCard.focus(); await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => window.listOpenedCourseId)).toBe(entries[2].courseId);
  });
}

test("Lista conserva cards e controles com erro revelado, recuperação e aviso transitório", async ({ page }, testInfo) => {
  await page.clock.install();
  for (const width of [360, 390, 430, 1280]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 844 });
    await mount(page, theme);
    const menu = page.locator(".course-authoring-task-menu > summary");
    const card = page.locator(".course-authoring-course-card").first();
    const before = { card: await card.boundingBox(), menu: await menu.boundingBox(), search: await page.locator(".course-authoring-search").boundingBox() };
    await page.evaluate(() => { window.listReadFailure = true; });
    await menu.click();
    await page.getByRole("button", { name: "Atualizar cursos", exact: true }).click();
    await expect(menu).toHaveAttribute("aria-label", "Tarefas dos cursos: há um aviso");
    await expect(page.locator("[data-list-feedback-explanation]")).not.toBeVisible();
    await expect(page.locator(".course-authoring-feedback-layer [role=alert]")).toHaveCount(0);
    expect({ card: await card.boundingBox(), menu: await menu.boundingBox(), search: await page.locator(".course-authoring-search").boundingBox() }).toEqual(before);
    await menu.click();
    await expect(page.locator("[data-list-feedback-message]")).not.toHaveText("");
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    await page.evaluate(() => { window.listReadFailure = false; });
    await menu.click(); await page.getByRole("button", { name: "Atualizar cursos", exact: true }).click();
    await expect(menu).toHaveAttribute("aria-label", "Tarefas dos cursos");
    await expect(page.locator("[data-list-feedback-indicator]")).not.toBeVisible();
    expect(await card.boundingBox()).toEqual(before.card);
    await menu.click(); await page.getByRole("button", { name: "Criar curso", exact: true }).click();
    const title = page.locator("#course-authoring-create-title"), objective = page.locator("#course-authoring-create-objective");
    await title.fill("Título de rascunho preservado"); await objective.fill("Objetivo que continua inteiro.");
    const draftGeometry = await card.boundingBox();
    await menu.click(); await page.getByRole("button", { name: "Atualizar cursos", exact: true }).click();
    await expect(page.locator(".course-authoring-transient-feedback")).toContainText("preservar sua edição");
    await title.focus(); await page.clock.fastForward(3501);
    await expect(page.locator(".course-authoring-transient-feedback")).toHaveCount(0);
    await expect(title).toBeFocused(); await expect(title).toHaveValue("Título de rascunho preservado");
    expect(await card.boundingBox()).toEqual(draftGeometry);
    await page.locator('[data-course-authoring-create] button[type="submit"]').click();
    await expect(menu).toHaveAttribute("aria-label", "Tarefas dos cursos: há um aviso");
    expect(await card.boundingBox()).toEqual(draftGeometry);
    await menu.click(); await page.getByRole("button", { name: "Continuar criação", exact: true }).click();
    await expect(title).toHaveValue("Título de rascunho preservado");
    await page.locator('[data-course-authoring-create] button[type="submit"]').click();
    await expect.poll(() => page.evaluate(() => window.listRequests.length)).toBe(2);
    const requests = await page.evaluate(() => window.listRequests);
    expect(requests[1]).toEqual(requests[0]);
    await page.locator('[data-course-authoring-action="cancel-create"]').click();
    await expect(page.getByRole("alertdialog")).toContainText("não exclui esse curso");
    await page.keyboard.press("Escape"); await expect(title).toHaveValue("Título de rascunho preservado");
    await page.locator('[data-course-authoring-action="cancel-create"]').click();
    await page.getByRole("button", { name: "Encerrar recuperação", exact: true }).click();
    await expect(menu).toBeFocused(); await expect(title).toHaveCount(0);
    expect(await card.boundingBox()).toEqual(before.card);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`list-${width}-${theme}.png`) });
  }
});
