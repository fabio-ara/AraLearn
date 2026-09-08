import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

for (const [width, theme] of [[390, "dark"], [1280, "light"]]) {
  test(`topologia conserva texto completo e alvo autoral em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    for (const [url, file, contentType] of [
      ["**/tests/gallery/study-explanation.html*", "../gallery/study-explanation.html", "text/html"],
      ["**/tests/support/studyExplanationFixture.js", "../support/studyExplanationFixture.js", "text/javascript"],
      ["**/tests/fixtures/package/project-minimal.json", "../fixtures/package/project-minimal.json", "application/json"]
    ]) await page.route(url, route => route.fulfill({ status: 200, contentType,
      body: readFileSync(new URL(file, import.meta.url), "utf8") }));
    await page.goto(`/tests/gallery/study-explanation.html?unit=practice&theme=${theme}`);
    await page.getByRole("button", { name: "Explicação", exact: true }).click();
    await page.getByRole("button", { name: "Explorar diagrama em tela inteira", exact: true }).click();
    const labels = page.locator(".package-network-topology foreignObject.package-system-diagram-boundary-label, .package-network-topology foreignObject.package-system-diagram-edge-label");
    await expect(labels).toHaveCount(5);
    const measured = await labels.evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect();
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const fragments = [];
      while (walker.nextNode()) {
        const text = walker.currentNode;
        if (!text.textContent.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(text);
        for (const rect of range.getClientRects()) {
          const hit = document.elementFromPoint(rect.right - 1, rect.top + rect.height / 2);
          fragments.push({ inside: rect.left >= box.left - 1 && rect.right <= box.right + 1 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1,
            hit: Boolean(hit?.closest("[data-package-manual-field-path]")) });
        }
      }
      return { text: node.textContent, fontSize: parseFloat(getComputedStyle(node.firstElementChild).fontSize), fragments };
    }));
    expect(measured.map(label => label.text)).toEqual(["Trechos Ethernet ligados por repetição", "Ethernet", "Ethernet", "Ethernet", "Ethernet"]);
    expect(measured[0].fontSize).toBeGreaterThanOrEqual(16);
    for (const label of measured.slice(1)) expect(label.fontSize).toBeGreaterThanOrEqual(14);
    for (const label of measured) {
      expect(label.fragments.length).toBeGreaterThan(0);
      expect(label.fragments.every(fragment => fragment.inside && fragment.hit), label.text).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`network-labels-${width}-${theme}.png`) });
  });
}
