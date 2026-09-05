import { test, expect } from "@playwright/test";

const sourceCourseId = "e3060000-0000-4000-8000-000000000001";

test("cópia mantém quadro e ações entre carregamento, recusa e repetição da mesma operação", async ({ page }, testInfo) => {
  for (const width of [360, 390, 430, 1280]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 844 });
    await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
    await page.goto("/");
    await page.evaluate(async ({ sourceCourseId, theme }) => {
      document.documentElement.dataset.colorMode = theme;
      document.body.innerHTML = '<div id="app-root"><button id="open-copy">Copiar curso</button><div id="copy-root"></div></div>';
      const { createCourseCopyDialog } = await import("/src/ui/CourseCopyDialog.js");
      let pending = null;
      window.copyProbe = { requests: [], copied: [], denied: false, loseReply: true };
      const controller = {
        async loadPendingCourseCopy() { return pending; },
        async loadCourseCopySource() {
          if (window.copyProbe.denied) throw Object.assign(new Error("Sem permissão."), { status: 403 });
          return { courseId: sourceCourseId, revision: 4, title: "Curso sintético", canCopy: true };
        },
        async copyCourse(request) {
          window.copyProbe.requests.push(structuredClone(request));
          pending = structuredClone(request);
          if (window.copyProbe.loseReply) {
            window.copyProbe.loseReply = false;
            throw Object.assign(new Error("Resposta perdida."), { code: "network_error" });
          }
          pending = null;
          return { course: { courseId: request.destinationCourseId, revision: 1, title: request.title } };
        }
      };
      window.copyDialog = createCourseCopyDialog({ root: document.querySelector("#copy-root"), controller,
        onCopied: course => window.copyProbe.copied.push(course) });
      document.querySelector("#open-copy").onclick = () => window.copyDialog.open(sourceCourseId);
    }, { sourceCourseId, theme });
    await page.getByRole("button", { name: "Copiar curso", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Copiar curso", exact: true });
    const title = dialog.getByRole("textbox", { name: "Título da cópia" });
    await expect(title).toHaveValue("Curso sintético — cópia");
    await expect(title).toBeFocused();
    const geometry = () => dialog.evaluate(element => ({
      frame: element.getBoundingClientRect().toJSON(),
      actions: [...element.querySelectorAll(".course-authoring-confirm-actions button")].map(button => button.getBoundingClientRect().toJSON()),
      field: element.querySelector("input").getBoundingClientRect().toJSON()
    }));
    const initial = await geometry();
    expect(initial.frame.height).toBe(430);
    expect(Math.abs(initial.frame.x + initial.frame.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    expect(844 - initial.frame.bottom).toBe(8);
    expect(initial.actions[0].y).toBe(initial.actions[1].y);
    expect(initial.actions[1].height).toBe(44);
    expect(initial.frame.bottom - initial.actions[1].bottom).toBe(17);
    await title.fill("Cópia própria com título extenso " + "teste ".repeat(40));
    expect(await geometry()).toEqual(initial);
    await dialog.getByRole("button", { name: "Criar cópia", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Repetir pedido" })).toBeFocused();
    await expect(title).toBeDisabled();
    expect(await geometry()).toEqual(initial);
    await page.screenshot({ path: testInfo.outputPath(`copy-pending-${width}-${theme}.png`) });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar curso", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Copiar curso", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Repetir pedido" })).toBeVisible();
    expect(await geometry()).toEqual(initial);
    await dialog.getByRole("button", { name: "Repetir pedido" }).click();
    await expect(dialog).not.toBeVisible();
    const probe = await page.evaluate(() => window.copyProbe);
    expect(probe.requests).toHaveLength(2);
    expect(probe.requests[0]).toEqual(probe.requests[1]);
    expect(probe.requests[0]).toMatchObject({ sourceCourseId, expectedSourceRevision: 4, confirmed: true });
    expect(probe.copied).toHaveLength(1);
    await page.evaluate(() => { window.copyProbe.denied = true; });
    await page.getByRole("button", { name: "Copiar curso", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("permissão");
    await expect(title).toBeDisabled();
    expect(await geometry()).toEqual(initial);
    await expect(dialog.getByRole("button", { name: "Criar cópia" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
});
