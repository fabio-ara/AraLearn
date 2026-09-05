import { test, expect } from "@playwright/test";

async function mount(page, theme) {
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.goto("/");
  await page.evaluate(async theme => {
    document.documentElement.dataset.colorMode = theme;
    document.body.innerHTML = '<div id="app-root"><main id="course-authoring-root" class="course-authoring-root"></main></div>';
    const { createCourseAuthoringSurface } = await import("/src/ui/CourseAuthoringSurface.js");
    const courseId = "e3060000-0000-4000-8000-000000000011";
    const unused = async () => { throw new Error("Fora desta jornada de lista."); };
    const controller = Object.fromEntries(["getCourse", "loadAuthoringOutline", "loadAuthoringStudyUnits", "loadAuthoringInspectionPosition",
      "saveAuthoringInspectionPosition", "createCourse", "loadAuthoringPlan", "loadCourseDesign", "mutateCourseDesign"].map(name => [name, unused]));
    window.listRequests = [];
    Object.assign(controller, {
      listCourses: async () => {
        if (window.listReadFailure) throw Object.assign(new Error("Conexão interrompida"), { code: "network_error" });
        return { items: [{ courseId, title: "Curso sintético de avisos", revision: 1, ownership: "owned", canEdit: true }], hasMore: false, nextCursor: null };
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
  }, theme);
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
