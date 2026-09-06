import { expect, test } from "@playwright/test";

const styles = ["/styles-tokens.css", "/styles-shell-baseline.css", "/styles.css", "/course-authoring.css"];
async function mountFlow(page, { long = false, structure = null } = {}) {
  await page.goto("/");
  await page.setContent('<!doctype html><html lang="pt-BR"><head>' + styles.map((href) => `<link rel="stylesheet" href="${href}">`).join("") + '</head><body style="margin:0"><main style="width:100%;max-width:900px;margin:auto;padding:12px;box-sizing:border-box" id="fixture"></main></body></html>');
  await page.evaluate(async ({ long, structure }) => {
    const { flowPackage } = await import("/src/resources/packages/flow/index.js");
    const { renderPackageStudyUnitBlocks } = await import("/src/render/renderPackageStudyUnit.js");
    const { RESOURCE_PACKAGE_REGISTRY } = await import("/src/resources/packages/index.js");
    const { activateManualStudyUnitEdit, applyManualStudyUnitEdit, readManualStudyUnitEditPathValues } = await import("/src/ui/manualStudyUnitEdit.js");
    const data = structuredClone(flowPackage.authoringContract.example);
    if (structure) data.structure = structure;
    if (long) {
      data.structure.items[2].condition = "As **credenciais** fornecidas pela pessoa correspondem a uma conta autorizada e ainda válida neste contexto?";
      data.structure.items[2].thenBranch[0].text = "Abrir a sessão e registrar a autorização para continuar a operação solicitada.";
      data.structure.items[2].elseBranch[0].text = "Informar que o acesso não foi autorizado e permitir uma nova tentativa com outros dados.";
    }
    let unit = { id: "flow-unit", title: "Acesso", role: "theory", position: 1, content: [{ id: "flow-example", package: "aralearn.resource.flow", version: "1.0.0", data }], response: null, feedback: [], topics: [] };
    let editor = null;
    globalThis.__flowRender = async (editing = false) => {
      editor?.destroy?.();
      const root = document.querySelector("#fixture");
      root.innerHTML = renderPackageStudyUnitBlocks(unit, {
        blockKeyPrefix: "flow-geometry", resourceSelectionEnabled: editing,
        ...(editing ? { manualEditingTargetId: "content:flow-example" } : {})
      });
      await RESOURCE_PACKAGE_REGISTRY.hydrate(root);
      if (editing) editor = activateManualStudyUnitEdit(root);
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    };
    globalThis.__flowSave = async () => {
      unit = applyManualStudyUnitEdit(unit, "content:flow-example", { pathValues: readManualStudyUnitEditPathValues(document.querySelector("#fixture")) });
      await globalThis.__flowRender();
      return unit;
    };
    globalThis.__flowOriginal = structuredClone(unit);
    await globalThis.__flowRender();
  }, { long, structure });
  await expect(page.locator("[data-flow-layout-status]")).toHaveAttribute("data-flow-layout-status", "ready");
}

async function geometry(page) {
  return page.locator(".package-flow-node, .package-flow-edge-label > .package-flow-label-content, .package-diagram-frame").evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }));
}

test("flow conserva rótulos legíveis e geometria ao editar em móvel, desktop e temas", async ({ page }, testInfo) => {
  await mountFlow(page, { long: true });
  for (const width of [360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => { document.documentElement.dataset.colorMode = value; }, theme);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(theme);
      await page.evaluate(() => globalThis.__flowRender(false));
      const before = await geometry(page);
      expect(await page.locator(".package-flow-canvas").evaluate((canvas) => {
        const frame = canvas.getBoundingClientRect();
        const start = canvas.querySelector('[data-flow-kind="start"]').getBoundingClientRect();
        return start.left + start.width / 2 >= frame.left && start.left + start.width / 2 <= frame.right;
      })).toBe(true);
      expect(await page.locator(".package-flow-svg").getAttribute("data-diagram-scale")).toBe("1.000");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      const labelAudit = await page.locator("foreignObject .package-flow-label-content").evaluateAll((nodes) => nodes.map((node) => ({
        text: node.textContent, font: parseFloat(getComputedStyle(node).fontSize), overflowX: node.scrollWidth - node.clientWidth, overflowY: node.scrollHeight - node.clientHeight
      })));
      for (const label of labelAudit) {
        expect(label.font).toBeGreaterThanOrEqual(14);
        expect(label.overflowX).toBeLessThanOrEqual(1);
        expect(label.overflowY, JSON.stringify(label)).toBeLessThanOrEqual(1);
      }
      await page.evaluate(() => globalThis.__flowRender(true));
      const after = await geometry(page);
      expect(after.length).toBe(before.length);
      after.forEach((box, index) => Object.keys(box).forEach((axis) => expect(Math.abs(box[axis] - before[index][axis]), `${width}/${theme}/${index}/${axis}`).toBeLessThanOrEqual(1)));
      if (width === 390 && theme === "light") await page.screenshot({ path: testInfo.outputPath("flow-390-editing.png") });
      await page.evaluate(() => globalThis.__flowRender(false));
      const undone = await geometry(page);
      undone.forEach((box, index) => Object.keys(box).forEach((axis) => expect(Math.abs(box[axis] - before[index][axis])).toBeLessThanOrEqual(1)));
    }
  }
});

test("flow usa teclado, toque e expansão sem perder o enquadramento nem capturar edição", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountFlow(page);
  const canvas = page.locator(".package-flow-canvas");
  await canvas.focus();
  await page.keyboard.press("ArrowDown");
  expect(await canvas.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press("Home");
  expect(await canvas.evaluate((node) => node.scrollTop)).toBe(0);
  await page.keyboard.press("+");
  await expect(page.locator(".package-flow-svg")).toHaveAttribute("data-diagram-scale", "1.250");
  await page.getByRole("button", { name: "Explorar diagrama em tela inteira" }).tap();
  await expect(page.locator("dialog")).toBeVisible();
  expect(await page.locator(".package-diagram-toolbar button").first().evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: testInfo.outputPath("flow-390-expanded.png") });
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Explorar diagrama em tela inteira" })).toBeFocused();
  const touchCanvasBox = await canvas.boundingBox();
  const touchSession = await page.context().newCDPSession(page);
  await touchSession.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: touchCanvasBox.x + 35, y: touchCanvasBox.y + 140 }] });
  await touchSession.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: touchCanvasBox.x + 35, y: touchCanvasBox.y + 65 }] });
  await touchSession.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await touchSession.detach();
  await expect(canvas).not.toHaveClass(/is-diagram-panning/u);
  expect(await canvas.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await page.evaluate(() => globalThis.__flowRender(true));
  const field = page.locator('.package-flow-node [data-manual-edit-path="structure.items[0].text"]');
  await field.fill("Início revisto");
  await field.press("Home");
  await field.press("+");
  await expect(field).toContainText("+");
  const saved = await page.evaluate(() => globalThis.__flowSave());
  expect(saved.content[0].data.structure.items[0].text).toBe("+Início revisto");
  const original = await page.evaluate(() => globalThis.__flowOriginal);
  original.content[0].data.structure.items[0].text = "+Início revisto";
  expect(saved).toEqual(original);
});

test("fluxograma mantém conteúdo hostil inerte e caminhos alternativos acessíveis", async ({ page }) => {
  await mountFlow(page, { structure: { kind: "sequence", items: [{ id: "d", kind: "if_then_else", condition: '<img src=x onerror="globalThis.__flowXss=true">', branchLabels: { yes: "Autorizado", no: "Negado" }, thenBranch: [{ id: "a", kind: "output", text: "Permitir" }], elseBranch: [{ id: "b", kind: "output", text: "Recusar" }] }] } });
  expect(await page.evaluate(() => globalThis.__flowXss)).toBeUndefined();
  await expect(page.locator("#fixture img, #fixture script")).toHaveCount(0);
  await expect(page.locator(".package-flow-outline")).toContainText("Autorizado");
  await expect(page.locator(".package-flow-outline")).toContainText("Negado");
  await expect(page.locator(".package-flow-outline")).toContainText("Recusar");
});

test("falha de Graphviz deixa os caminhos legíveis e os controles indisponíveis", async ({ page }) => {
  await page.route("**/vendor/viz-global.js", (route) => route.abort());
  await page.goto("/");
  await page.setContent('<!doctype html><html><head>' + styles.map((href) => `<link rel="stylesheet" href="${href}">`).join("") + '</head><body><main id="fixture"></main></body></html>');
  await page.evaluate(async () => {
    const { flowPackage } = await import("/src/resources/packages/flow/index.js");
    const root = document.querySelector("#fixture");
    root.innerHTML = flowPackage.render(flowPackage.authoringContract.example);
    await flowPackage.hydrate(root).catch(() => {});
  });
  await expect(page.locator("[data-flow-layout-status]")).toHaveAttribute("data-flow-layout-status", "error");
  await expect(page.locator(".package-flow-outline")).toBeVisible();
  await expect(page.locator(".package-flow-outline")).toContainText("Sim");
  for (const control of await page.locator("[data-diagram-action]").all()) await expect(control).toBeDisabled();
});

test("decisões sucessivas e repetição preservam rótulos CJK, IPA e bidi misto", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 430, height: 900 });
  const structure = { kind: "sequence", items: [{ id: "begin", kind: "start", text: "Início" }, {
    id: "chain", kind: "if_chain", cases: [
      { id: "first", condition: "木 significa árvore?", thenBranch: [{ id: "tree", kind: "output", text: "木 — mù /mu˥˩/" }] },
      { id: "second", condition: "林 significa bosque?", thenBranch: [{ id: "woods", kind: "output", text: "林 — lín /lin˧˥/" }] }
    ], elseBranch: [{ id: "retry", kind: "do_while", condition: "Repetir a leitura?", body: [{ id: "read", kind: "process", text: "Leia: العربية — A1 — português" }] }]
  }, { id: "finish", kind: "end", text: "Fim" }] };
  await mountFlow(page, { structure });
  const positions = await page.evaluate(() => {
    const one = document.querySelector('[data-flow-source-id="first"]');
    const two = document.querySelector('[data-flow-source-id="second"]');
    return { first: one.getBoundingClientRect().top, second: two.getBoundingClientRect().top };
  });
  expect(positions.second).toBeGreaterThan(positions.first);
  await expect(page.locator(".package-flow-outline")).toContainText("木 — mù /mu˥˩/");
  await expect(page.locator(".package-flow-outline")).toContainText("العربية — A1 — português");
  await page.getByRole("button", { name: "Explorar diagrama em tela inteira" }).tap();
  await page.screenshot({ path: testInfo.outputPath("flow-chain-430.png") });
  await page.keyboard.press("Escape");
  await page.evaluate(() => globalThis.__flowRender(true));
  const unchanged = await page.evaluate(() => globalThis.__flowSave());
  expect(unchanged.content[0].data.structure).toEqual(structure);
});
