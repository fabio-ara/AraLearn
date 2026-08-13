import { expect, test } from "@playwright/test";

import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";
import {
  renderPackageCardArticle,
  renderPackageCardBlocks
} from "../../src/render/renderPackageCard.js";

const STYLES = ["/styles-tokens.css", "/styles-shell-baseline.css", "/styles.css"];

const graphInstance = {
  id: "graph-test",
  package: "aralearn.resource.graph",
  version: "1.0.0",
  data: {
    prompt: "Acompanhe a comunicação entre componentes.",
    layout: "network",
    vertices: [
      { id: "station", label: "Estação central de gerência" },
      { id: "agent", label: "Agente no dispositivo monitorado" },
      { id: "object", label: "Objeto gerenciado" },
      { id: "events", label: "Coletor de eventos assíncronos" },
      { id: "history", label: "Armazenamento histórico" },
      { id: "operator", label: "Operador responsável" }
    ],
    edges: [
      { id: "request", from: "station", to: "agent", label: "envia solicitação de leitura", directed: true },
      { id: "read", from: "agent", to: "object", label: "consulta localmente", directed: true },
      { id: "trap", from: "agent", to: "events", label: "notifica mudança", directed: true },
      { id: "store", from: "events", to: "history", label: "registra ocorrência", directed: true },
      { id: "inspect", from: "operator", to: "history", label: "analisa tendência", directed: true }
    ]
  }
};

const relationInstance = {
  id: "relation-test",
  package: "aralearn.resource.relation_map",
  version: "1.0.0",
  data: {
    prompt: "Relacione cada grupo à sua finalidade principal.",
    leftSet: {
      label: "Grupo de monitoramento",
      items: [
        { id: "statistics", label: "Estatísticas do segmento" },
        { id: "history", label: "Histórico por intervalo" },
        { id: "alarms", label: "Alarmes configurados" },
        { id: "events", label: "Eventos observados" }
      ]
    },
    rightSet: {
      label: "Finalidade operacional",
      items: [
        { id: "counters", label: "Consultar contadores atuais" },
        { id: "samples", label: "Preservar amostras ao longo do tempo" },
        { id: "conditions", label: "Avaliar condições e limites" },
        { id: "records", label: "Registrar avisos associados" }
      ]
    },
    relations: [
      { id: "r1", from: "statistics", to: "counters", label: "permite" },
      { id: "r2", from: "history", to: "samples", label: "permite" },
      { id: "r3", from: "alarms", to: "conditions", label: "permite" },
      { id: "r4", from: "events", to: "records", label: "permite" }
    ]
  }
};

const matrixInstance = {
  id: "matrix-test",
  package: "aralearn.resource.matrix",
  version: "1.0.0",
  data: {
    prompt: "Observe uma matriz de transformação linear.",
    name: "A",
    values: [
      ["1", "2", "0"],
      ["0", "1", "-1"]
    ]
  }
};

const treeInstance = {
  id: "tree-test",
  package: "aralearn.resource.tree",
  version: "1.0.0",
  data: {
    prompt: "Observe os níveis de um nome de documentação.",
    variant: "hierarchy",
    nodes: [
      { id: "root", label: "raiz lógica", parentId: null },
      { id: "test", label: "test", parentId: "root" },
      { id: "example", label: "example", parentId: "test" },
      { id: "app", label: "app", parentId: "example" }
    ]
  }
};

const wrongChoiceCard = {
  id: "choice-test",
  position: 1,
  title: "Escolha",
  role: "practice",
  content: [],
  response: {
    id: "choice-answer",
    package: "aralearn.response.choice",
    version: "1.0.0",
    data: {
      question: "Qual protocolo entrega um fluxo confiável?",
      selectionMode: "single",
      selectionCriterion: "correct",
      options: [
        { id: "tcp", text: "TCP" },
        { id: "dns", text: "DNS" }
      ],
      answerIds: ["tcp"]
    }
  },
  feedback: [],
  topics: [],
  sources: []
};

function documentFor(instance, mode) {
  const html = RESOURCE_PACKAGE_REGISTRY.renderInstance(instance, "content");
  return documentForHtml(html, mode);
}

function documentForHtml(html, mode) {
  const links = STYLES.map((href) => `<link rel="stylesheet" href="${href}">`).join("");
  return `<!doctype html><html lang="pt-BR" data-color-mode="${mode}"><head><meta name="viewport" content="width=device-width, initial-scale=1">${links}</head><body><main style="width:100%;max-width:420px;margin:0 auto;padding:16px">${html}</main></body></html>`;
}

function studyCardFor(instance) {
  return {
    id: `study-${instance.id}`,
    position: 1,
    title: "Card real de estudo",
    role: "theory",
    content: [instance],
    response: null,
    feedback: [],
    topics: [],
    sources: []
  };
}

async function assertContained(page, selector, viewportWidth) {
  const boxes = await page.locator(selector).evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
  }));
  boxes.forEach((box) => {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(viewportWidth + 0.5);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });
}

for (const width of [360, 390, 412]) {
  for (const mode of ["light", "dark"]) {
    test(`graph preserva rótulos e limites em ${width}px no modo ${mode}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.setContent(documentFor(graphInstance, mode));
      await expect(page.locator(".package-graph-node")).toHaveCount(6);
      await expect(page.locator(".package-graph-relations li")).toHaveCount(5);
      await expect(page.locator(".package-graph-edge-index")).toHaveCount(0);
      await assertContained(page, ".package-graph-node, .package-graph-relations li", width);
      const nodes = await page.locator(".package-graph-node").evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }));
      for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
          const left = nodes[leftIndex];
          const right = nodes[rightIndex];
          const overlapWidth = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
          const overlapHeight = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
          expect(overlapWidth * overlapHeight).toBeLessThanOrEqual(0.5);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const labels = await page.locator(".package-graph-relations").innerText();
      expect(labels).toContain("envia solicitação de leitura");
      expect(labels).toContain("Agente no dispositivo monitorado");
    });

    test(`relation_map preserva conjuntos e pares sem sobreposição em ${width}px no modo ${mode}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.setContent(documentFor(relationInstance, mode));
      await expect(page.locator(".package-relation-set")).toHaveCount(2);
      await expect(page.locator(".package-relation-pairs > li")).toHaveCount(4);
      await assertContained(page, ".package-relation-set, .package-relation-set li, .package-relation-pairs > li", width);
      const setPanels = await page.locator(".package-relation-set").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect()).map(({ left, right, top, bottom }) => ({ left, right, top, bottom })));
      const overlapWidth = Math.max(0, Math.min(setPanels[0].right, setPanels[1].right) - Math.max(setPanels[0].left, setPanels[1].left));
      const overlapHeight = Math.max(0, Math.min(setPanels[0].bottom, setPanels[1].bottom) - Math.max(setPanels[0].top, setPanels[1].top));
      expect(overlapWidth * overlapHeight).toBeLessThanOrEqual(0.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });

    test(`modo Estudo usa renderização segura de graph e relation_map em ${width}px no modo ${mode}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const html = [graphInstance, relationInstance]
        .map((instance) => renderPackageCardArticle(studyCardFor(instance)))
        .join("");
      await page.setContent(documentForHtml(html, mode));
      await expect(page.locator(".package-graph-edge-index")).toHaveCount(0);
      await expect(page.locator(".package-graph-relations li")).toHaveCount(5);
      await expect(page.locator(".package-relation-map svg")).toHaveCount(0);
      await expect(page.locator(".package-relation-map .package-relation-set")).toHaveCount(2);
      await expect(page.locator(".package-relation-map .package-relation-pairs > li")).toHaveCount(4);
      await assertContained(page, ".package-graph-relations li, .package-relation-map .package-relation-set, .package-relation-map .package-relation-pairs > li", width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });

    test(`choice, matrix e tree preservam estado e riqueza visual em ${width}px no modo ${mode}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const choicePrefix = "visual-choice";
      const choiceKey = `${choicePrefix}::response:${wrongChoiceCard.response.id}`;
      const html = [
        renderPackageCardBlocks(wrongChoiceCard, {
          blockKeyPrefix: choicePrefix,
          responseStateByBlockKey: {
            [choiceKey]: { selected: ["dns"], feedback: "wrong" }
          }
        }),
        renderPackageCardArticle(studyCardFor(matrixInstance)),
        renderPackageCardArticle(studyCardFor(treeInstance))
      ].join("");
      await page.setContent(documentForHtml(html, mode));

      const tcp = page.locator('[data-choice-option-id="tcp"]');
      const dns = page.locator('[data-choice-option-id="dns"]');
      await expect(tcp).not.toHaveClass(/expected-selection|selected-correct/u);
      await expect(dns).toHaveClass(/selected-incorrect/u);
      await expect(page.locator(".runtime-feedback-icon")).toHaveCount(2);
      const iconStyles = await page.locator(".runtime-feedback-icon").evaluateAll((icons) => icons.map((icon) => ({
        fill: getComputedStyle(icon).fill,
        stroke: getComputedStyle(icon).stroke,
        color: getComputedStyle(icon.closest("button")).color
      })));
      iconStyles.forEach(({ fill, stroke, color }) => {
        expect(fill).toBe("none");
        expect(stroke).toBe(color);
      });

      await expect(page.locator(".runtime-matrix-delimiter")).toHaveCount(2);
      await expect(page.locator('.runtime-matrix-grid [role="cell"]')).toHaveCount(6);
      await expect(page.locator(".runtime-tree-entry")).toHaveCount(4);
      await expect(page.locator('.runtime-tree-item[aria-level="4"]')).toHaveCount(1);
      await assertContained(page, ".runtime-tree-structure, .runtime-tree-entry", width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }
}
