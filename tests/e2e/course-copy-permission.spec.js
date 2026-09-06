import { test, expect } from "@playwright/test";

const courseId = "e3060000-0000-4000-8000-000000000001";
const personId = "e3060000-0000-4000-8000-000000000002";
const handle = "estudante.com.identificador306";

for (const width of [360, 390, 430, 1280]) for (const theme of ["light", "dark"]) {
  test(`Pessoas permite e revoga somente cópia com foco e alcance em ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.install();
    await page.route("**/main.js", (route) => route.fulfill({ contentType: "application/javascript", body: "" }));
    await page.goto("/");
    await page.evaluate(async ({ courseId, personId, handle, theme }) => {
      document.documentElement.dataset.colorMode = theme;
      document.body.innerHTML = '<div id="app-root"><main id="course-authoring-root" class="course-authoring-root"></main></div>';
      const { createCourseAuthoringSurface } = await import("/src/ui/CourseAuthoringSurface.js");
      const { buildCourseAuthoringRoute } = await import("/src/ui/courseAuthoringRoute.js");
      let canCopy = false;
      window.copyPermissionRequests = [];
      const unused = async () => { throw new Error("Operação fora da jornada Pessoas."); };
      const controller = Object.fromEntries(["listCourses", "loadAuthoringOutline", "loadAuthoringStudyUnits",
        "loadAuthoringInspectionPosition", "saveAuthoringInspectionPosition", "createCourse", "loadAuthoringPlan",
        "loadCourseDesign", "mutateCourseDesign"].map((name) => [name, unused]));
      Object.assign(controller, {
        async getCourse() { return { courseId, revision: 1, title: "Curso sintético de permissão", goal: "Provar o alcance da cópia.",
          ownership: "owned", canEdit: true, canObserve: true, visibility: "public", publicFileAccess: "restricted" }; },
        async listCourseAccess() { return { contract: "aralearn.course-people.v3", courseId,
          owner: { userId: "e3060000-0000-4000-8000-000000000003", handle: "autor306", avatarObjectKey: null },
          people: [{ userId: personId, handle, canCopy, avatarObjectKey: null, grantedAt: "2026-09-05T12:00:00Z" }] }; },
        async grantCourseAccess(request) {
          window.copyPermissionRequests.push(request); canCopy = request.canCopy;
          if (window.losePermissionResponse) {
            window.losePermissionResponse = false;
            throw Object.assign(new Error("Resposta sintética perdida."), { code: "network_error", ambiguous: true });
          }
          return { changed: true };
        },
        async revokeCourseAccess() { throw new Error("Não retirar acesso ao Estudo nesta jornada."); }
      });
      window.peopleSurface = createCourseAuthoringSurface({ root: document.querySelector("#course-authoring-root"),
        controller, locationValue: { pathname: "/", search: "", hash: buildCourseAuthoringRoute(courseId, { section: "people" }) } });
      await window.peopleSurface.open();
    }, { courseId, personId, handle, theme });
    const control = page.locator(`[data-course-authoring-action="set-copy-permission"][data-user-id="${personId}"]`);
    await expect(page.locator('[data-people-settings]')).not.toHaveAttribute("open", "");
    await expect(page.locator('[data-course-visibility-form]')).not.toBeVisible();
    await expect(control).toHaveAttribute("aria-pressed", "false");
    await control.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("curso privado independente");
    await expect(dialog).toContainText("Cópias já criadas permanecem");
    await page.keyboard.press("Escape");
    await expect(control).toBeFocused();
    expect(await page.evaluate(() => window.copyPermissionRequests)).toEqual([]);
    await control.tap();
    await dialog.getByRole("button", { name: "Permitir cópia", exact: true }).tap();
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await expect(control).toBeFocused();
    await expect(page.getByText("Estudo e cópia independente", { exact: true })).toBeVisible();
    const stableCard = await control.boundingBox();
    await page.clock.fastForward(3501);
    await expect(page.locator(".course-authoring-transient-feedback")).toHaveCount(0);
    await expect(control).toBeFocused();
    expect(await control.boundingBox()).toEqual(stableCard);
    await control.tap();
    await expect(dialog).toContainText("continuará com acesso ao Estudo");
    await expect(dialog).toContainText("Cópias independentes já criadas e seus arquivos permanecem");
    await page.screenshot({ path: testInfo.outputPath(`people-${width}-${theme}.png`) });
    const geometry = await page.evaluate(() => {
      const row = document.querySelector('[data-course-authoring-action="set-copy-permission"]').closest(".course-authoring-person");
      return { overflow: document.documentElement.scrollWidth - innerWidth,
        rowOverflow: row.scrollWidth - row.clientWidth,
        buttons: [...row.querySelectorAll("button")].map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })) };
    });
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.rowOverflow).toBeLessThanOrEqual(1);
    for (const box of geometry.buttons) { expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); }
    await dialog.getByRole("button", { name: "Revogar permissão de cópia", exact: true }).tap();
    await expect(control).toHaveAttribute("aria-pressed", "false");
    await expect(control).toBeFocused();
    const requests = await page.evaluate(() => window.copyPermissionRequests);
    expect(requests.map((request) => request.canCopy)).toEqual([true, false]);
    expect(requests[0].requestId).not.toBe(requests[1].requestId);
    expect(requests.every((request) => request.courseId === courseId && request.userId === personId && request.handle === handle && request.confirmed)).toBe(true);
    if (width === 390 && theme === "light") {
      const menu = page.locator(".course-authoring-task-menu > summary");
      const anchor = await menu.boundingBox();
      await page.evaluate(() => { window.losePermissionResponse = true; });
      await control.click();
      await dialog.getByRole("button", { name: "Permitir cópia", exact: true }).click();
      await expect(menu).toHaveAttribute("aria-label", "Abrir tarefas do curso: há um aviso");
      expect(await menu.boundingBox()).toEqual(anchor);
      await expect(page.locator(".course-authoring-feedback-layer [role=alert]")).toHaveCount(0);
      await expect(page.locator(".course-authoring-feedback-explanation")).not.toBeVisible();
      await menu.click();
      await expect(page.locator(".course-authoring-feedback-explanation")).toContainText("mesmo pedido");
      await expect(page.getByRole("button", { name: "Encerrar recuperação da permissão de cópia" })).toBeVisible();
      await page.keyboard.press("Escape");
      await control.click();
      await dialog.getByRole("button", { name: "Permitir cópia", exact: true }).click();
      await expect(control).toHaveAttribute("aria-pressed", "true");
      const recovered = await page.evaluate(() => window.copyPermissionRequests);
      expect(recovered).toHaveLength(4);
      expect(recovered[3]).toEqual(recovered[2]);
      await page.getByRole("button", { name: "Fechar aviso", exact: true }).click();
      await expect(page.locator(".course-authoring-transient-feedback")).toHaveCount(0);
      await expect(menu).toBeFocused();
    }
  });
}
