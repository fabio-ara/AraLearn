import { expect, test } from "@playwright/test";

const widths = [360, 390, 412];
const themes = ["light", "dark"];

for (const theme of themes) {
  for (const width of widths) {
    test(`todos os cards declarados não criam overflow em ${width}px no modo ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((selectedTheme) => {
        localStorage.setItem("aralearn.ui.theme", selectedTheme);
      }, theme);
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto("/tests/gallery/resource-test-matrix.html");
      await page.waitForFunction(() => globalThis.__RESOURCE_TEST_MATRIX_READY__ === true);

      expect(await page.locator(".resource-test-card").count()).toBeGreaterThan(0);
      await expect(page.locator('.resource-test-card[data-package="aralearn.resource.relation_map"]'))
        .toHaveCount(3);
      await expect(page.locator('.resource-test-card[data-package="aralearn.resource.relation_map"] .package-relation-map-set'))
        .toHaveCount(6);
      await expect(page.locator('.resource-test-card[data-package="aralearn.resource.relation_map"] .package-relation-map-edge text'))
        .toHaveCount(0);
      await expect(page.locator('.resource-test-card[data-package="aralearn.resource.set_diagram"]'))
        .toHaveCount(3);
      await expect(page.locator('.resource-test-card[data-package="aralearn.resource.set_diagram"] .package-set-shape'))
        .toHaveCount(9);
      await expect(page.locator('.resource-test-card[data-package="aralearn.resource.set_diagram"] .package-set-region-marker'))
        .toHaveCount(12);
      const audit = await page.evaluate(() => ({
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        cards: [...document.querySelectorAll(".resource-test-card")]
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .map((element) => `${element.dataset.package}:${element.dataset.modality}`),
        setDiagramCollisions: [...document.querySelectorAll('.resource-test-card[data-package="aralearn.resource.set_diagram"]')]
          .flatMap((card) => {
            const labels = [...card.querySelectorAll(".package-set-name, .package-set-region-marker")];
            return labels.flatMap((left, leftIndex) => labels.slice(leftIndex + 1).flatMap((right) => {
              const a = left.getBoundingClientRect();
              const b = right.getBoundingClientRect();
              const overlaps = a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
              return overlaps ? [`${left.textContent.trim()}:${right.textContent.trim()}`] : [];
            }));
          }),
        setDiagramMembershipErrors: [...document.querySelectorAll('.resource-test-card[data-package="aralearn.resource.set_diagram"]')]
          .flatMap((card) => {
            const canvas = card.querySelector("[data-set-diagram]");
            const data = JSON.parse(decodeURIComponent(canvas.dataset.setDiagram));
            const regionById = new Map(data.regions.map((region) => [region.id, new Set(region.setIds)]));
            const paths = [...card.querySelectorAll(".package-set-shape")];
            return [...card.querySelectorAll(".package-set-region-marker")].flatMap((marker) => {
              const region = regionById.get(marker.dataset.regionId);
              const circle = marker.querySelector("circle");
              const point = new DOMPoint(Number(circle.getAttribute("cx")), Number(circle.getAttribute("cy")));
              const wrongSet = paths.find((path) => path.isPointInFill(point) !== region.has(path.dataset.setId));
              const clearance = Number(marker.dataset.regionClearance);
              return wrongSet || clearance < 13
                ? [`${marker.dataset.regionId}:${wrongSet?.dataset.setId || `margem-${clearance}`}`]
                : [];
            });
          }),
        callStackErrors: [...document.querySelectorAll('.resource-test-card[data-package="aralearn.resource.call_stack"]')]
          .flatMap((card) => {
            const frames = [...card.querySelectorAll(".package-call-stack li")];
            const text = card.textContent;
            return [
              ...(frames[0]?.dataset.frameId === "fact3" ? [] : ["quadro ativo não está no topo"]),
              ...(frames.at(-1)?.dataset.frameId === "main" ? [] : ["chamada inicial não está na base"]),
              ...(frames.some((frame) => frame.scrollWidth > frame.clientWidth + 1) ? ["quadro com overflow"] : []),
              ...(/…|\.{3}/u.test(text) ? ["continuação truncada"] : [])
            ];
          })
      }));
      expect(audit.documentOverflow).toBeLessThanOrEqual(1);
      expect(audit.cards).toEqual([]);
      expect(audit.setDiagramCollisions).toEqual([]);
      expect(audit.setDiagramMembershipErrors).toEqual([]);
      expect(audit.callStackErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
    });
  }
}

for (const [theme, width] of [["light", 360], ["dark", 412]]) {
  test(`terminal_session mantém saída longa local, acessível e selecionável em ${width}px no modo ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((selectedTheme) => {
      localStorage.setItem("aralearn.ui.theme", selectedTheme);
    }, theme);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/tests/gallery/resource-test-matrix.html");
    await page.waitForFunction(() => globalThis.__RESOURCE_TEST_MATRIX_READY__ === true);

    const audit = await page.evaluate(async () => {
      const [{ terminalSessionPackage }, response] = await Promise.all([
        import("/src/resources/packages/terminal-session/index.js"),
        fetch("/tests/fixtures/package/terminal-session-stress.json", { cache: "no-store" })
      ]);
      const fixture = await response.json();
      const data = fixture.cases.find(({ id }) => id === "administrative-cloud-long-output").data;
      const article = document.createElement("article");
      article.className = "resource-test-card terminal-session-stress";
      article.innerHTML = terminalSessionPackage.render(data);
      document.querySelector(".resource-test-matrix").replaceChildren(article);

      const output = article.querySelector(".package-terminal-stream.is-stdout pre");
      const code = output.querySelector("samp");
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const selectedText = selection.toString();
      selection.removeAllRanges();
      return {
        colorMode: document.documentElement.dataset.colorMode,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        cardOverflow: article.scrollWidth - article.clientWidth,
        outputScrollsVertically: output.scrollHeight > output.clientHeight + 1,
        outputScrollsHorizontally: output.scrollWidth > output.clientWidth + 1,
        outputTabIndex: output.tabIndex,
        outputAriaLabel: output.getAttribute("aria-label"),
        outputUserSelect: getComputedStyle(output).userSelect,
        selectedText,
        interactionLabel: article.querySelector("ol").getAttribute("aria-label"),
        visualBackground: getComputedStyle(article.querySelector("figure")).backgroundColor,
        visualColor: getComputedStyle(output).color
      };
    });

    expect(audit.colorMode).toBe(theme);
    expect(audit.documentOverflow).toBeLessThanOrEqual(1);
    expect(audit.cardOverflow).toBeLessThanOrEqual(1);
    expect(audit.outputScrollsVertically).toBe(true);
    expect(audit.outputScrollsHorizontally).toBe(true);
    expect(audit.outputTabIndex).toBe(0);
    expect(audit.outputAriaLabel).toBe("Saída padrão da interação 1");
    expect(audit.outputUserSelect).toBe("text");
    expect(audit.selectedText).toContain("service: api <principal> & worker");
    expect(audit.selectedText).toContain("sha256:9f86d081");
    expect(audit.interactionLabel).toBe("Interações da sessão");
    expect(audit.visualBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(audit.visualColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(pageErrors).toEqual([]);
  });
}

test("lacunas preenchidas permanecem visíveis dentro dos objetos acadêmicos", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.addInitScript(() => localStorage.setItem("aralearn.ui.theme", "dark"));
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/tests/gallery/resource-test-matrix.html?state=filled");
  await page.waitForFunction(() => globalThis.__RESOURCE_TEST_MATRIX_READY__ === true);

  const gapFields = page.locator(".runtime-text-gap-blank");
  expect(await gapFields.count()).toBeGreaterThan(20);
  await expect(page.locator('.runtime-text-gap-blank[data-empty="true"]')).toHaveCount(0);
  const audit = await page.evaluate(() => ({
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    overflowingCards: [...document.querySelectorAll(".resource-test-card")]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => `${element.dataset.package}:${element.dataset.modality}`),
    invisibleGaps: [...document.querySelectorAll(".runtime-text-gap-blank")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 2 || rect.height < 2;
      }).length,
    overflowingGraphvizLabels: [...document.querySelectorAll("foreignObject")]
      .filter((foreignObject) => foreignObject.querySelector(".runtime-text-gap-blank"))
      .flatMap((foreignObject) => {
        const content = foreignObject.firstElementChild;
        if (!content || (content.scrollWidth <= content.clientWidth + 1 && content.scrollHeight <= content.clientHeight + 1)) return [];
        const card = foreignObject.closest(".resource-test-card");
        return [`${card?.dataset.package}:${card?.dataset.modality}`];
      })
  }));
  expect(audit.documentOverflow).toBeLessThanOrEqual(1);
  expect(audit.overflowingCards).toEqual([]);
  expect(audit.invisibleGaps).toBe(0);
  expect(audit.overflowingGraphvizLabels).toEqual([]);
  expect(pageErrors).toEqual([]);
});
