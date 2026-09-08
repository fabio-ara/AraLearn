import { expect, test } from "@playwright/test";

test("pedido contextual é copiado por gesto explícito e continua legível em 430 px", async ({ page, context }, info) => {
  await page.setViewportSize({ width: 430, height: 650 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/main.js", route => route.fulfill({ contentType: "text/javascript", body: "" }));
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderCourseAuthoringDebate, bindCourseAuthoringDebate } = await import("/src/ui/courseAuthoringDebate.js");
    document.body.replaceChildren();
    document.documentElement.dataset.colorMode = "dark";
    const root = document.createElement("main");
    root.className = "course-authoring-root";
    root.innerHTML = renderCourseAuthoringDebate({ courseId: "123e4567-e89b-42d3-a456-426614174000",
      courseRevision: 9, title: "Interfaces e conexões — exemplo sintético", contextLabel: "a Explicação compartilhada",
      route: "#/authoring/courses/123e4567-e89b-42d3-a456-426614174000?section=content&didacticMicrosequenceId=interfaces" });
    document.body.append(root);
    bindCourseAuthoringDebate(root);
  });
  await page.getByText("Debater com GPT", { exact: true }).click();
  await page.getByRole("button", { name: "Copiar pedido", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Pedido copiado");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain(`${new URL(page.url()).origin}/#/authoring/courses/123e4567-e89b-42d3-a456-426614174000`);
  expect(text).toContain("didacticMicrosequenceId=interfaces");
  expect(text).toContain("Revisão observada: 9");
  expect(text).toContain("não autoriza escrita");
  expect(await page.locator("textarea").evaluate(node => node.readOnly)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("345-debate-430-dark.png"), fullPage: true });
});
