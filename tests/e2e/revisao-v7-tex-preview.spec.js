import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// D008/D009: prosa autoral com TeX delimitado é aceita pelo contrato e o estudo precisa
// mostrar a leitura verbalizada no resumo do card, mantendo MathML no corpo da unidade.
// Nenhuma variante linguística humana foi inventada; a notação é sintética.
const BS = String.fromCharCode(92);
const tex = (source) => BS + source;
const fraction = tex("(") + tex("frac{1}{2}") + tex(")");
const linear = tex("(") + "x-3" + tex(")");

const proseContent = [{
  id: "tex-prose", package: "aralearn.resource.paragraph", version: "1.0.0",
  data: { text: "A fração " + fraction + " vale " + linear + " na reta numerada.", languageTag: "pt-BR" }
}];

async function mount(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  for (const file of ["support/studyExplanationFixture.js", "fixtures/package/project-minimal.json"]) {
    await page.route("**/tests/" + file, route => route.fulfill({ contentType: file.endsWith(".js") ? "text/javascript" : "application/json",
      body: readFileSync(new URL("../" + file, import.meta.url), "utf8") }));
  }
  await page.goto("/");
  await page.evaluate(async (content) => {
    const { mountStudyExplanationFixture } = await import("/tests/support/studyExplanationFixture.js");
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"></div></div>';
    const fixture = await mountStudyExplanationFixture(document.querySelector("#aralearn-editor-root"),
      { unit: "theory", resourceContent: content });
    await fixture.app.openEntityPath(fixture.path);
  }, proseContent);
}

test("o resumo da unidade verbaliza TeX e o corpo mantém MathML em 390px", async ({ page }, info) => {
  await mount(page);
  // A home do curso mantém cópias fora de tela; a inspeção olha o que está visível.
  const summary = page.locator('[data-study-unit-id="explanation-theory"] .card-subtitle:visible');
  await expect(summary).toHaveCount(1);
  await expect(summary).toContainText("(1)/(2)");
  await expect(summary).toContainText("x - 3");
  await expect(summary).not.toContainText(tex("("));

  // Nenhum resumo da lista de unidades expõe a fonte TeX.
  expect(await page.locator("body").innerText()).not.toContain(tex("("));
  await page.screenshot({ path: info.outputPath("tex-preview-summary-390.png") });

  await page.locator('[data-study-unit-id="explanation-theory"] [data-action="open-study-unit"]:visible').click();
  const body = page.locator(".card-sheet-content:visible");
  // O corpo materializa a fração em MathML e conserva a prosa ao redor.
  await expect(body.locator("math").first()).toBeVisible();
  await expect(body.locator("math mfrac").first()).toBeVisible();
  await expect(body).toContainText("A fração");
  await expect(body).toContainText("na reta numerada.");
  expect(await body.innerText()).not.toContain(tex("("));
  await page.screenshot({ path: info.outputPath("tex-preview-unit-390.png") });
});
