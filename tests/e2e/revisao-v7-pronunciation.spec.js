import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// D010/D008: a leitura/pronúncia é anotação sobre a escrita, com sistema próprio
// (kana, pinyin, IPA) e variedade da língua quando ela importa. Os valores aqui são
// sintéticos para inspeção; nenhuma variante linguística humana foi inventada.
const pronunciationContent = {
  format: "rich",
  languageTag: "pt-BR",
  textDirection: "ltr",
  blocks: [
    { kind: "paragraph", inlines: [
      { kind: "text", text: "A leitura registrada varia entre variedades. " },
      { kind: "ruby", base: "casa", reading: "[ˈkazɐ]", languageTag: "pt-PT", readingLanguageTag: "pt-PT-fonipa" },
      { kind: "text", text: " traz a leitura da variedade europeia." }
    ] },
    { kind: "paragraph", languageTag: "zh-Hans", inlines: [
      { kind: "ruby", base: "木", reading: "mù", readingLanguageTag: "zh-Latn-pinyin" },
      { kind: "text", text: " representa árvore." }
    ] },
    { kind: "paragraph", languageTag: "ja", inlines: [
      { kind: "ruby", base: "学校", reading: "がっこう", readingLanguageTag: "ja-Kana" },
      { kind: "text", text: " recebe a leitura em kana." }
    ] },
    { kind: "paragraph", inlines: [
      { kind: "ruby", base: "<script>alert(1)</script>", reading: "<img src=x onerror=alert(1)>", readingLanguageTag: "ja-Kana" },
      { kind: "text", text: " permanece texto literal, sem executar marcação." }
    ] }
  ]
};

async function mount(page, { practiceResponse = null } = {}) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  for (const file of ["support/studyExplanationFixture.js", "fixtures/package/project-minimal.json"]) {
    await page.route(`**/tests/${file}`, route => route.fulfill({ contentType: file.endsWith(".js") ? "text/javascript" : "application/json",
      body: readFileSync(new URL(`../${file}`, import.meta.url), "utf8") }));
  }
  await page.goto("/");
  await page.evaluate(async ({ content, practice, answer }) => {
    const { mountStudyExplanationFixture } = await import("/tests/support/studyExplanationFixture.js");
    const data = structuredClone(content);
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"></div></div>';
    await mountStudyExplanationFixture(document.querySelector("#aralearn-editor-root"), {
      unit: practice ? "practice" : "theory",
      citationOccurrences: [],
      resourceContent: [{ id: "representation", package: "aralearn.resource.paragraph", version: "1.0.0", data }],
      practiceResponse: practice ? { id: "reading-response", package: "aralearn.response.gap", version: "1.0.0", data: {
        prompt: "Recupere a leitura anotada da escrita.",
        blanks: [{ id: "pinyin", targetInstanceId: "representation", targetPath: "blocks[1].inlines[0].reading",
          responseMode: "text", answer, label: "Leitura em pinyin" }]
      } } : null
    });
  }, { content: pronunciationContent, practice: Boolean(practiceResponse), answer: "mù" });
}

async function openHost(page, host) {
  if (host === ".study-explanation-body") await page.getByRole("button", { name: "Explicação", exact: true }).click();
  const root = page.locator(host);
  await expect(root.locator(".package-instance")).toHaveCount(1);
  return root;
}

for (const host of [".card-sheet-content", ".study-explanation-body"]) {
  for (const width of [390, 320]) {
    test(`leitura anotada em kana, pinyin e IPA é acessível e não executa marcação em ${host} com ${width}px`, async ({ page }, info) => {
      await mount(page);
      await page.setViewportSize({ width, height: 844 });
      const root = await openHost(page, host);
      const paragraph = root.locator(".package-rich-paragraph");
      await expect(paragraph.locator("ruby")).toHaveCount(4);

      // O sistema da própria leitura é declarado no rt; a escrita continua no ruby.
      await expect(paragraph.locator('rt[lang="pt-PT-fonipa"]')).toHaveText("[ˈkazɐ]");
      await expect(paragraph.locator('rt[lang="zh-Latn-pinyin"]')).toHaveText("mù");
      await expect(paragraph.locator('rt[lang="ja-Kana"]')).toHaveCount(2);
      await expect(paragraph.locator('rt[lang="ja-Kana"]').first()).toHaveText("がっこう");
      await expect(paragraph.locator('rt[lang="pt-PT-fonipa"]')).toHaveAttribute("dir", "auto");

      // Nome acessível real do grupo e leitura por caractere, sem perda de diacríticos.
      await expect(root.getByRole("group", { name: "学校 (がっこう)", exact: true })).toBeVisible();
      await expect(root.getByRole("group", { name: "casa ([ˈkazɐ])", exact: true })).toBeVisible();

      // Escape: nenhum nó nem atributo é criado pela escrita ou pela leitura hostis.
      expect(await root.locator("script, img, iframe, object").count()).toBe(0);
      expect(await root.locator("[onerror], [onload]").count()).toBe(0);
      await expect(paragraph).toContainText("<script>alert(1)</script>");
      const rtAttributes = await paragraph.locator("rt[lang]").evaluateAll(nodes =>
        nodes.map(node => [...node.getAttributeNames()].sort()));
      expect(rtAttributes.every(names => names.join(",") === "dir,lang")).toBe(true);

      // Ruby preservado: leitura acima da escrita, menor que o corpo, centralizada.
      const measured = await paragraph.evaluate((node) => {
        const ruby = node.querySelector("ruby");
        const rt = ruby.querySelector("rt");
        const range = document.createRange();
        range.selectNodeContents(ruby.firstChild);
        const base = range.getBoundingClientRect();
        const reading = rt.getBoundingClientRect();
        return { baseTop: base.top, baseFont: Number.parseFloat(getComputedStyle(ruby).fontSize),
          readingBottom: reading.bottom, readingFont: Number.parseFloat(getComputedStyle(rt).fontSize),
          rubyAlign: getComputedStyle(ruby).rubyAlign, readingWidth: reading.width,
          overflow: document.documentElement.scrollWidth - innerWidth };
      });
      expect(measured.rubyAlign).toBe("center");
      expect(measured.readingFont).toBeLessThan(measured.baseFont);
      expect(measured.readingWidth).toBeGreaterThan(0);
      // A métrica de fonte do Chromium deixa uma pequena folga entre o rt e o
      // topo da escrita. O limite proporcional conserva a exigência visual sem
      // transformar esse arredondamento de pixels em falha.
      expect(measured.readingBottom).toBeLessThanOrEqual(measured.baseTop + Math.max(4, measured.baseFont * 0.25));
      expect(measured.overflow).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath(`pronunciation-${host.includes("explanation") ? "explanation" : "unit"}-${width}.png`) });

      if (width === 390) {
        await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
        await expect(paragraph.locator('rt[lang="pt-PT-fonipa"]')).toHaveText("[ˈkazɐ]");
        const scaled = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth,
          clipped: [...document.querySelectorAll("rt[lang]")].some(node => node.scrollWidth > node.clientWidth + 1) }));
        expect(scaled.overflow).toBeLessThanOrEqual(1);
        expect(scaled.clipped).toBe(false);
        await page.screenshot({ path: info.outputPath(`pronunciation-${host.includes("explanation") ? "explanation" : "unit"}-${width}-text-200.png`) });
      }
    });
  }
}

test("a leitura anotada aceita prática no lugar da pronúncia sem quebrar o ruby", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page, { unit: "practice", practiceResponse: true });
  const root = page.locator(".card-sheet-content");
  const field = root.locator('rt[lang="zh-Latn-pinyin"] > [data-action="complete-input"]');
  await expect(field).toHaveCount(1);
  await expect(field).toHaveAttribute("contenteditable", "true");
  await field.click();
  await page.keyboard.type("mù");
  await expect(field).toHaveText("mù");
  await expect(root.locator('rt[lang="ja-Kana"]').first()).toHaveText("がっこう");
  await expect(root.locator('rt[lang="pt-PT-fonipa"]')).toHaveText("[ˈkazɐ]");
  expect(await root.locator("script, img, iframe").count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("pronunciation-practice-390.png") });
});
