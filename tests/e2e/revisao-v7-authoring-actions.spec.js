import { test, expect } from "@playwright/test";

const COURSE_ID = "d0010000-0035-4039-8000-000000000001";

async function mountAuthoringSurface(page) {
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.goto("/");
  await page.evaluate(async courseId => {
    const { createCoursePartsPanel } = await import("/src/ui/CoursePartsPanel.js");
    const { createCourseCopyDialog } = await import("/src/ui/CourseCopyDialog.js");
    const { bindCourseCurriculumMap, renderCourseCurriculumMap } = await import("/src/ui/CourseCurriculumMap.js");
    document.body.innerHTML = '<main id="authoring-fixture"><section id="parts-root"></section><section id="map-root"></section><section id="copy-root"></section></main>';
    const partsRoot = document.querySelector("#parts-root");
    const mapRoot = document.querySelector("#map-root");
    const copyRoot = document.querySelector("#copy-root");
    window.authoringProbe = { saveRequests: [], focusedParts: [], contexts: [], copied: [] };
    const planning = {
      courseId,
      courseRevision: 1,
      plan: {
        version: 1,
        parts: [
          { id: "part-alpha", position: 0, title: "Lote alfa", intent: "Organizar o primeiro percurso.",
            progression: ["Passo alfa 1", "Passo alfa 2"],
            microsequences: [{ id: "micro-alpha-1", title: "Micro alfa 1" }, { id: "micro-alpha-2", title: "Micro alfa 2" }] },
          { id: "part-beta", position: 1, title: "Lote beta", intent: "Organizar o segundo percurso.",
            progression: ["Passo beta 1"], microsequences: [{ id: "micro-beta-1", title: "Micro beta 1" }] }
        ]
      }
    };
    const partsController = {
      async saveCourseAuthoringPart(request) {
        window.authoringProbe.saveRequests.push(structuredClone(request));
        return { contract: "aralearn.course-authoring-part-change.v1", courseId, courseRevision: 2,
          planVersion: 2, authoringPartId: request.part.partId || "part-synthetic-new", changed: true, idempotent: false };
      }
    };
    window.partsPanel = createCoursePartsPanel({ root: partsRoot, controller: partsController, courseId,
      onFocusPart: value => window.authoringProbe.focusedParts.push(value) });
    window.partsPanel.open({ planning, partId: "part-alpha" });

    const curriculum = { modules: [{ id: "module-synthetic", title: "Módulo transversal", objective: "Percorrer o módulo.", lessons: [{
      id: "lesson-synthetic", title: "Lição transversal", objective: "Ler a lição.", microsequences: [{
        id: "micro-synthetic", title: "Microssequência demonstrativa", role: "practice", objective: "Aplicar a ideia.",
        dependencyMicrosequenceIds: [], explanationPlan: { purpose: "Relacionar a ideia ao percurso.", prerequisites: [], relations: ["A ideia se conecta ao percurso."], sourceIds: [] }
      }]
    }] }] };
    mapRoot.innerHTML = renderCourseCurriculumMap({ courseId, courseTitle: "Curso sintético", curriculum, contextual: true,
      curriculumMapStatus: "draft", completeness: { complete: false, pending: [{ reason: "explanation_plan_missing", targetId: "micro-synthetic" }] },
      approval: { inspected: false, busy: false, pending: null, message: "" } });
    bindCourseCurriculumMap(mapRoot, { onOpenContext: value => window.authoringProbe.contexts.push(value) });

    let pending = null;
    window.copyDialog = createCourseCopyDialog({ root: copyRoot, controller: {
      async loadPendingCourseCopy() { return pending; },
      async loadCourseCopySource() { return { courseId, revision: 3, title: "Curso sintético", canCopy: true }; },
      async copyCourse(request) { pending = structuredClone(request); window.authoringProbe.copied.push(structuredClone(request)); return { course: { courseId: "d0010000-0035-4039-8000-000000000002" } }; }
    }, onCopied: course => { window.authoringProbe.lastCopied = course; } });
  }, COURSE_ID);
}

test("ações de autoria preservam ordem, comandos e affordances icon-only em 390 e 1280", async ({ page }, testInfo) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await mountAuthoringSurface(page);

    const panel = page.locator("#parts-root");
    for (const name of ["Dividir", "Reunir", "Reordenar", "Inspecionar lote"]) {
      const button = panel.getByRole("button", { name, exact: true });
      await expect(button).toHaveText("");
      await expect(button).toHaveAttribute("title", name);
      await expect(button.locator("svg")).toHaveCount(1);
    }
    await expect(panel.getByLabel("Lote", { exact: true })).toBeVisible();
    await expect(panel.getByText("Divida, reúna ou reposicione grupos de microssequências existentes. A ordem curricular não muda.")).toBeVisible();
    await panel.getByRole("button", { name: "Inspecionar lote", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.authoringProbe.focusedParts)).toEqual([{ partId: "part-alpha" }]);

    await panel.getByRole("button", { name: "Dividir", exact: true }).click();
    await expect(panel.getByLabel("Dividir depois de", { exact: true })).toBeVisible();
    const removeStep = panel.getByRole("button", { name: "Retirar passo 1", exact: true });
    await expect(removeStep).toHaveText("");
    await expect(removeStep).toHaveClass(/is-danger/);
    await expect(removeStep).toHaveAttribute("title", "Retirar passo 1");
    await removeStep.click();
    await expect(panel.locator('[name="progression-0"]')).toHaveValue("Passo alfa 2");
    await panel.getByRole("button", { name: "Fechar reorganização", exact: true }).click();
    const warning = panel.getByRole("alertdialog", { name: "Rascunho da reorganização" });
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Há uma reorganização não salva");
    for (const name of ["Descartar e fechar", "Continuar editando"]) {
      const button = warning.getByRole("button", { name, exact: true });
      await expect(button).toHaveText("");
      await expect(button).toHaveAttribute("title", name);
      if (name === "Descartar e fechar") await expect(button).toHaveClass(/is-danger/);
    }
    await warning.getByRole("button", { name: "Continuar editando", exact: true }).click();
    await expect(warning).toBeHidden();
    await panel.getByRole("button", { name: "Fechar reorganização", exact: true }).click();
    await panel.getByRole("alertdialog", { name: "Rascunho da reorganização" }).getByRole("button", { name: "Descartar e fechar", exact: true }).click();
    await expect(panel).toHaveAttribute("hidden", "");
    expect(await page.evaluate(() => window.authoringProbe.saveRequests)).toEqual([]);

    const map = page.locator("#map-root");
    const moduleDetails = map.locator('[data-curriculum-expansion="module:module-synthetic"]');
    await moduleDetails.locator(":scope > summary").click();
    await map.locator('[data-curriculum-expansion="lesson:lesson-synthetic"] > summary').click();
    await expect(map.getByRole("button", { name: "Explicação de Microssequência demonstrativa", exact: true })).toHaveText("");
    const contextButton = map.getByRole("button", { name: "Explicação de Microssequência demonstrativa", exact: true });
    await expect(contextButton).toHaveAttribute("title", "Explicação de Microssequência demonstrativa");
    await contextButton.click();
    await expect.poll(() => page.evaluate(() => window.authoringProbe.contexts.map(item => item.action))).toEqual(["explanation"]);
    const pending = map.getByRole("button", { name: "Mostrar somente pendências do mapa, 1", exact: true });
    await expect(pending).toHaveAttribute("title", "Mostrar somente pendências do mapa, 1");
    await pending.click();
    await expect(pending).toHaveAttribute("aria-pressed", "true");

    await page.evaluate(() => window.copyDialog.open("d0010000-0035-4039-8000-000000000001"));
    const dialog = page.getByRole("dialog", { name: "Copiar curso", exact: true });
    await expect(dialog.getByRole("button", { name: "Criar cópia", exact: true })).toBeVisible();
    const copyButton = dialog.getByRole("button", { name: "Criar cópia", exact: true });
    await expect(copyButton).toHaveText("");
    await expect(copyButton).toHaveAttribute("title", "Criar cópia");
    await expect(dialog.getByRole("button", { name: "Cancelar", exact: true })).toHaveText("");
    await dialog.getByLabel("Título da cópia").fill("Cópia determinística");
    await copyButton.click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.authoringProbe.copied.length)).toBe(1);
    expect(await page.evaluate(() => window.authoringProbe.copied[0])).toMatchObject({ sourceCourseId: COURSE_ID, confirmed: true, title: "Cópia determinística" });

    await page.screenshot({ path: testInfo.outputPath(`authoring-actions-${width}.png`), fullPage: true });
  }
});
