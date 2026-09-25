import {
  appendGraphvizForeignLabel,
  dotQuote,
  escapeGraphvizHtml,
  graphvizGroupById,
  renderGraphvizSvg,
  unionGraphvizTextBounds
} from "../../sdk/graphviz.js";
import {
  hydrateDiagramViewport,
  renderDiagramViewportShell
} from "../../sdk/diagramViewport.js";
import {
  escapePackageAttribute,
  escapePackageHtml,
  packageReferenceText
} from "../../sdk/html.js";

const INLINE_LABEL_CONTROL_SELECTOR = '[data-action="text-gap-open-choice"], [data-action="complete-input"], ' +
  '[contenteditable]:not([contenteditable="false"]), [data-package-manual-field-path], .package-rich-tex, ruby';
const GAP_CONTROL_SELECTOR = '[data-action="text-gap-open-choice"], [data-action="complete-input"], .package-rich-tex, ruby';

function safeLabelText(value, fallback = "Elemento") {
  return packageReferenceText(value)
    .replace(/[*`]/gu, "")
    .replace(/\s+/gu, " ")
    .trim() || fallback;
}

function templateMarkup(label) {
  return `<template data-system-label-kind="${escapePackageAttribute(label.kind)}" ` +
    `data-system-label-id="${escapePackageAttribute(label.id)}">${label.html}</template>`;
}

export function renderSystemDiagramFigure({
  source,
  engine,
  accessibleText,
  caption,
  labels,
  model,
  focusId = "",
  errorMessage = "Não foi possível diagramar a representação."
}) {
  const safeAccessibleText = safeLabelText(accessibleText, "Diagrama");
  const canvas = '<div class="package-system-diagram-canvas" data-resource-scroll-frame="diagram" role="region" ' +
    `aria-label="${escapePackageAttribute(safeAccessibleText)}" aria-busy="true" tabindex="0" ` +
    `data-graphviz-source="${escapePackageAttribute(source)}"></div>`;
  const viewport = renderDiagramViewportShell({ canvasHtml: canvas });
  return `<figure class="package-system-diagram" data-system-diagram-engine="${escapePackageAttribute(engine)}" ` +
    `data-system-diagram-model="${escapePackageAttribute(encodeURIComponent(JSON.stringify(model)))}"` +
    (focusId ? ` data-system-diagram-focus-id="${escapePackageAttribute(focusId)}"` : "") + ">" +
    viewport + labels.map(templateMarkup).join("") + `<figcaption>${caption}</figcaption>` +
    `<p class="package-system-diagram-layout-error" hidden>${escapePackageHtml(errorMessage)}</p></figure>`;
}

function nodeBounds(group) {
  if (!group) return null;
  const box = group.getBBox();
  return {
    x: box.x + 7,
    y: box.y + 1,
    width: Math.max(1, box.width - 14),
    height: Math.max(1, box.height - 2)
  };
}

function labelTemplate(figure, label) {
  return figure.querySelector(
    `template[data-system-label-kind="${CSS.escape(label.kind)}"]` +
    `[data-system-label-id="${CSS.escape(label.id)}"]`
  );
}

// Graphviz mede texto SVG; campos interativos e títulos HTML têm outra altura.
// Medimos o HTML real antes do layout final e devolvemos somente o tamanho do
// nó ao motor. A autoria continua responsável apenas pela semântica.
function reserveInteractiveLabelSpace(figure, svg, labels, source) {
  let next = source;
  for (const label of labels.filter(item => ["node", "edge"].includes(item.kind))) {
    const template = labelTemplate(figure, label);
    if (!template?.content.querySelector(INLINE_LABEL_CONTROL_SELECTOR)) continue;
    if (label.kind === "edge" && !template.content.querySelector(GAP_CONTROL_SELECTOR)) continue;
    const id = label.graphvizId || `system-${label.kind}-${label.id}`;
    const group = graphvizGroupById(svg, id);
    const bounds = label.kind === "node" ? nodeBounds(group) : group && unionGraphvizTextBounds([...group.querySelectorAll(":scope > text")]);
    if (!bounds) continue;
    const probe = document.createElement("div");
    probe.className = `package-system-diagram-${label.kind}-label`;
    Object.assign(probe.style, { position: "absolute", visibility: "hidden", pointerEvents: "none",
      width: `${bounds.width}px`, height: "auto", left: "0", top: "0" });
    probe.append(template.content.cloneNode(true));
    figure.append(probe);
    if (label.kind === "edge") probe.style.width = "max-content";
    const child = probe.firstElementChild;
    if (child) child.style.height = "auto";
    const width = Math.max(probe.scrollWidth, child?.scrollWidth || 0) + 18;
    const height = Math.max(probe.scrollHeight, child?.scrollHeight || 0) + 12;
    if (label.kind === "edge") label.measuredSize = { width, height };
    probe.remove();
    if (width <= bounds.width + 14 && height <= bounds.height + 2) continue;
    next = next.split("\n").map(line => {
      if (!line.includes(`id=${dotQuote(id)}`)) return line;
      if (label.kind === "edge") {
        const box = `<TABLE BORDER="0" CELLBORDER="0" CELLPADDING="0" WIDTH="${Math.ceil(width)}" HEIGHT="${Math.ceil(height)}"><TR><TD>${escapeGraphvizHtml(label.plain)}</TD></TR></TABLE>`;
        return line.replace(/label="(?:[^"\\]|\\.)*"/u, `label=<${box}>`);
      }
      if (line.includes(" -> ")) return line;
      return line.replace("[", `[width=${dotQuote((width / 72).toFixed(4))}, height=${dotQuote((height / 72).toFixed(4))}, `);
    }).join("\n");
  }
  return next;
}

function replaceInteractiveLabel(figure, svg, label) {
  const group = graphvizGroupById(svg, label.graphvizId || `system-${label.kind}-${label.id}`);
  if (!group) return;
  group.dataset.systemObjectId = label.id;
  group.dataset.systemObjectKind = label.kind;
  // Graphviz só emite IDs de células quando elas possuem HREF. Estes links
  // internos servem à localização da célula e nunca são ações do estudante.
  if (label.kind === "cell") {
    group.querySelectorAll(":scope > a").forEach(link => link.replaceWith(...link.childNodes));
  }
  const template = labelTemplate(figure, label);
  if (!template?.content.querySelector(INLINE_LABEL_CONTROL_SELECTOR)) return;

  const texts = [...group.querySelectorAll(":scope > text")].slice(label.textStart || 0);
  const bounds = label.kind === "node" ? nodeBounds(group) : unionGraphvizTextBounds(texts);
  if (!bounds) return;
  texts.forEach((element) => { element.style.visibility = "hidden"; });
  const labelClass = label.kind === "node"
    ? "package-system-diagram-node-label"
    : label.kind === "edge"
      ? "package-system-diagram-edge-label"
      : "package-system-diagram-boundary-label";
  const hasGap = Boolean(template.content.querySelector(GAP_CONTROL_SELECTOR));
  const gapWidth = Math.max(64, bounds.width + 16, label.measuredSize?.width || 0);
  const gapHeight = Math.max(28, bounds.height + 8, label.measuredSize?.height || 0);
  const foreignLabel = appendGraphvizForeignLabel(group, template, label.kind === "node" || !hasGap ? bounds : {
    x: bounds.x + bounds.width / 2 - gapWidth / 2,
    y: bounds.y + bounds.height / 2 - gapHeight / 2,
    width: gapWidth,
    height: gapHeight
  }, labelClass);
  // Marcadores autorais não são controles de resposta. O texto HTML equivalente
  // conserva a tipografia e as linhas medidas no SVG, em vez de herdar o corpo
  // da página dentro de uma caixa calculada com outra fonte.
  if (label.kind !== "node" && !hasGap && texts.length
      && !template.content.querySelector('[contenteditable]:not([contenteditable="false"])')) {
    const style = getComputedStyle(texts[0]);
    const lineHeight = texts.length > 1
      ? Math.abs(Number(texts[1].getAttribute("y")) - Number(texts[0].getAttribute("y")))
      : bounds.height;
    const wrapper = foreignLabel.firstElementChild;
    wrapper.style.fontFamily = style.fontFamily;
    wrapper.style.fontSize = style.fontSize;
    wrapper.style.lineHeight = `${lineHeight}px`;
    wrapper.style.display = "block";
    wrapper.style.whiteSpace = texts.length === 1 ? "nowrap" : "normal";
    foreignLabel.setAttribute("x", String(bounds.x - 1));
    foreignLabel.setAttribute("y", String(bounds.y - 1));
    foreignLabel.setAttribute("width", String(Math.ceil(bounds.width) + 2));
    foreignLabel.setAttribute("height", String(Math.ceil(Math.max(bounds.height, lineHeight * texts.length)) + 2));
  }
}

async function hydrateFigure(figure, stateKey) {
  const canvas = figure.querySelector(".package-system-diagram-canvas");
  if (!canvas || ["loading", "ready", "error"].includes(canvas.dataset.graphvizStatus)) return;
  canvas.dataset.graphvizStatus = "loading";
  try {
    const model = JSON.parse(decodeURIComponent(figure.dataset.systemDiagramModel || ""));
    let svg = await renderGraphvizSvg(canvas, {
      source: canvas.dataset.graphvizSource,
      engine: figure.dataset.systemDiagramEngine,
      className: "package-system-diagram-svg"
    });
    svg.style.visibility = "hidden";
    const measuredSource = reserveInteractiveLabelSpace(figure, svg, model.labels, canvas.dataset.graphvizSource);
    if (measuredSource !== canvas.dataset.graphvizSource) {
      svg = await renderGraphvizSvg(canvas, { source: measuredSource,
        engine: figure.dataset.systemDiagramEngine, className: "package-system-diagram-svg" });
      svg.style.visibility = "hidden";
    }
    svg.setAttribute("aria-hidden", "true");
    model.labels.forEach((label) => replaceInteractiveLabel(figure, svg, label));
    await hydrateDiagramViewport({ figure, canvas, svg, stateKey });
    svg.style.removeProperty("visibility");
    svg.removeAttribute("aria-hidden");
    figure.classList.remove("is-horizontally-scrollable");
    canvas.dataset.graphvizStatus = "ready";
    canvas.setAttribute("aria-busy", "false");
  } catch (error) {
    canvas.replaceChildren();
    canvas.dataset.graphvizStatus = "error";
    canvas.setAttribute("aria-busy", "false");
    canvas.removeAttribute("tabindex");
    canvas.setAttribute("aria-disabled", "true");
    canvas.setAttribute("aria-label", "Diagrama indisponível");
    figure.querySelectorAll("[data-diagram-action]").forEach((control) => {
      control.disabled = true;
    });
    const explore = figure.querySelector('[data-diagram-action="toggle-expanded"]');
    if (explore) {
      explore.setAttribute("aria-expanded", "false");
      explore.setAttribute("aria-label", "Exploração indisponível");
    }
    const message = figure.querySelector(".package-system-diagram-layout-error");
    if (message) message.hidden = false;
    throw error;
  }
}

export async function hydrateSystemDiagrams(instanceRoot) {
  const baseKey = instanceRoot.dataset.packageRenderKey
    || `${instanceRoot.dataset.package || "package"}:${instanceRoot.dataset.packageInstanceId || "instance"}`;
  await Promise.all([...instanceRoot.querySelectorAll(".package-system-diagram")]
    .map((figure, index) => hydrateFigure(figure, `${baseKey}:diagram:${index}`)));
}

export function systemDiagramModelLabels(labels) {
  return labels.map(({ kind, id, plain, graphvizId, textStart }) => ({
    kind,
    id,
    plain: safeLabelText(plain, kind === "node" ? "Elemento" : "Relação"),
    ...(graphvizId ? { graphvizId } : {}),
    ...(textStart ? { textStart } : {})
  }));
}
