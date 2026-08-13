import { expect, test } from "@playwright/test";

async function openCard(page, { moduleIndex, microsequenceIndex, cardIndex = 0 }) {
  await page.locator('[data-action="open-course"]').click();
  await page.locator('[data-action="open-module"]').nth(moduleIndex).click();
  await page.locator('[data-action="open-lesson"]').click();
  await page.locator('[data-action="open-microsequence-overview"]').nth(microsequenceIndex).click();
  await page.locator(`[data-action="open-microsequence-card"][data-card-index="${cardIndex}"]`).click();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/teste-academico");
  await page.waitForFunction(() => globalThis.__ACADEMIC_STRESS_COURSES_READY__ === true);
});

test("laboratórios expõem os dois recortes acadêmicos sem publicar conteúdo de teste", async ({ page }) => {
  await expect(page.locator('[data-action="open-course"]')).toHaveAttribute("data-course-key", "academic-ifsp-tads");
  await page.goto("/teste-academico?curso=dataprev");
  await page.waitForFunction(() => globalThis.__ACADEMIC_STRESS_COURSES_READY__ === true);
  await expect(page.locator('[data-action="open-course"]')).toHaveAttribute("data-course-key", "academic-dataprev-2026");
});

test("TADS progride da situação concreta para código e rastreamento", async ({ page }) => {
  await openCard(page, { moduleIndex: 0, microsequenceIndex: 0 });
  await expect(page.locator(".runtime-paragraph-block")).toContainText("lista de nomes");
  await page.locator('[aria-label="Voltar para a lição"]').click();
  await page.locator('[data-action="open-microsequence-overview"]').nth(1).click();
  await page.locator('[data-action="open-microsequence-card"][data-card-index="0"]').click();
  await expect(page.locator(".runtime-code-block pre")).toContainText("busca_binaria");
});

test("Dataprev usa representações distintas para pacote, estado e topologia", async ({ page }) => {
  await page.goto("/teste-academico?curso=dataprev");
  await page.waitForFunction(() => globalThis.__ACADEMIC_STRESS_COURSES_READY__ === true);
  await openCard(page, { moduleIndex: 0, microsequenceIndex: 1 });
  await expect(page.locator(".package-packet-layout")).toBeVisible();
  await page.locator('[aria-label="Voltar para a lição"]').click();
  await page.locator('[data-action="open-microsequence-overview"]').nth(1).click();
  await page.locator('[data-action="open-microsequence-card"][data-card-index="1"]').click();
  await expect(page.locator(".package-state-machine [data-graphviz-status='ready']")).toBeVisible();
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator(".package-network-topology [data-graphviz-status='ready']")).toBeVisible();
});

test("processo de negócio materializa BPMN em vez de fluxograma genérico", async ({ page }) => {
  await page.goto("/teste-academico?curso=dataprev");
  await page.waitForFunction(() => globalThis.__ACADEMIC_STRESS_COURSES_READY__ === true);
  await openCard(page, { moduleIndex: 1, microsequenceIndex: 0, cardIndex: 3 });
  await expect(page.locator(".package-bpmn-process [data-graphviz-status='ready']")).toBeVisible();
  await expect(page.locator(".package-flowchart")).toHaveCount(0);
  await expect(page.locator(".package-bpmn-participant")).toHaveCount(2);
});
