import {
  appendGraphvizForeignLabel,
  graphvizGroupById,
  hasGraphvizGap,
  renderGraphvizSvg,
  unionGraphvizTextBounds
} from "../../sdk/graphviz.js";
import { escapePackageAttribute } from "../../sdk/html.js";

function templateMarkup(label) {
  return `<template data-system-label-kind="${escapePackageAttribute(label.kind)}" data-system-label-id="${escapePackageAttribute(label.id)}">${label.html}</template>`;
}

export function renderSystemDiagramFigure({
  source,
  engine,
  accessibleText,
  caption,
  labels,
  model,
  focusId = ""
}) {
  return `<figure class="package-system-diagram" data-system-diagram-engine="${escapePackageAttribute(engine)}" data-system-diagram-model="${escapePackageAttribute(encodeURIComponent(JSON.stringify(model)))}"${focusId ? ` data-system-diagram-focus-id="${escapePackageAttribute(focusId)}"` : ""}><div class="package-system-diagram-canvas" role="img" aria-label="${escapePackageAttribute(accessibleText)}" aria-busy="true" tabindex="0" data-graphviz-source="${escapePackageAttribute(source)}"></div>${labels.map(templateMarkup).join("")}<p class="package-system-diagram-pan-hint" hidden>Deslize horizontalmente para examinar o diagrama completo.</p><figcaption>${caption}</figcaption><p class="package-system-diagram-layout-error" hidden>Não foi possível diagramar o sistema.</p></figure>`;
}

function nodeBounds(group) {
  if (!group) return null;
  const box = group.getBBox();
  return { x: box.x + 7, y: box.y + 5, width: Math.max(1, box.width - 14), height: Math.max(1, box.height - 10) };
}

function replaceLabel(figure, svg, label) {
  const groupId = `system-${label.kind}-${label.id}`;
  const group = graphvizGroupById(svg, groupId);
  if (!group) return;
  group.dataset.systemObjectId = label.id;
  group.dataset.systemObjectKind = label.kind;
  if (!hasGraphvizGap(label.plain)) return;
  const template = figure.querySelector(`template[data-system-label-kind="${CSS.escape(label.kind)}"][data-system-label-id="${CSS.escape(label.id)}"]`);
  const texts = [...group.querySelectorAll("text")];
  const bounds = label.kind === "node" ? nodeBounds(group) : unionGraphvizTextBounds(texts);
  texts.forEach((element) => { element.style.visibility = "hidden"; });
  if (!bounds) return;
  const labelClass = label.kind === "node"
    ? "package-system-diagram-node-label"
    : "package-system-diagram-edge-label";
  appendGraphvizForeignLabel(group, template, label.kind === "node" ? bounds : {
    x: bounds.x - 8,
    y: bounds.y - 4,
    width: Math.max(64, bounds.width + 16),
    height: Math.max(28, bounds.height + 8)
  }, labelClass);
}

async function hydrateFigure(figure) {
  const canvas = figure.querySelector(".package-system-diagram-canvas");
  if (!canvas || canvas.dataset.graphvizStatus === "ready") return;
  try {
    const model = JSON.parse(decodeURIComponent(figure.dataset.systemDiagramModel || ""));
    const svg = await renderGraphvizSvg(canvas, {
      source: canvas.dataset.graphvizSource,
      engine: figure.dataset.systemDiagramEngine,
      className: "package-system-diagram-svg"
    });
    model.labels.forEach((label) => replaceLabel(figure, svg, label));
    const focus = graphvizGroupById(svg, figure.dataset.systemDiagramFocusId);
    if (focus && canvas.scrollWidth > canvas.clientWidth) {
      const canvasRect = canvas.getBoundingClientRect();
      const focusRect = focus.getBoundingClientRect();
      canvas.scrollLeft = Math.max(0,
        canvas.scrollLeft + focusRect.left - canvasRect.left + (focusRect.width - canvas.clientWidth) / 2
      );
    }
    const panHint = figure.querySelector(".package-system-diagram-pan-hint");
    const overflowsHorizontally = canvas.scrollWidth > canvas.clientWidth + 1;
    figure.classList.toggle("is-horizontally-scrollable", overflowsHorizontally);
    if (panHint) panHint.hidden = !overflowsHorizontally;
    canvas.dataset.graphvizStatus = "ready";
    canvas.setAttribute("aria-busy", "false");
  } catch (error) {
    canvas.dataset.graphvizStatus = "error";
    canvas.setAttribute("aria-busy", "false");
    const message = figure.querySelector(".package-system-diagram-layout-error");
    if (message) message.hidden = false;
    throw error;
  }
}

export async function hydrateSystemDiagrams(instanceRoot) {
  await Promise.all([...instanceRoot.querySelectorAll(".package-system-diagram")].map(hydrateFigure));
}

export function systemDiagramModelLabels(labels) {
  return labels.map(({ kind, id, plain }) => ({ kind, id, plain }));
}
