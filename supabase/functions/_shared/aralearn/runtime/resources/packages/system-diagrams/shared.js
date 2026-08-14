import {
  appendGraphvizForeignLabel,
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

const GAP_CONTROL_SELECTOR = '[data-action="text-gap-open-choice"], [data-action="complete-input"]';

function labelKey(label) {
  return `${label.kind}:${label.id}`;
}

function safeLabelText(value, fallback = "Elemento") {
  return packageReferenceText(value)
    .replace(/[*`]/gu, "")
    .replace(/\s+/gu, " ")
    .trim() || fallback;
}

function preferredLabel(labels, focusId) {
  return labels.find(({ html }) => html.includes('data-action="text-gap-open-choice"') || html.includes('data-action="complete-input"'))
    || labels.find(({ kind, id }) => `system-${kind}-${id}` === focusId)
    || labels[0]
    || null;
}

function detailMarkup(labels, selectedKey) {
  const options = labels.map((label, index) => {
    const prefix = label.kind === "node" ? "Elemento" : "Relação";
    const text = safeLabelText(label.plain, `${prefix} ${index + 1}`);
    const key = labelKey(label);
    return `<option value="${escapePackageAttribute(key)}"${key === selectedKey ? " selected" : ""}>${escapePackageHtml(`${prefix}: ${text}`)}</option>`;
  }).join("");
  const panels = labels.map((label) => {
    const key = labelKey(label);
    const kind = label.kind === "node" ? "Elemento do diagrama" : "Relação do diagrama";
    return `<article class="package-system-diagram-detail-item" data-system-detail-key="${escapePackageAttribute(key)}"${key === selectedKey ? "" : " hidden"}>` +
      `<small>${kind}</small><div class="package-system-diagram-detail-content">${label.html}</div></article>`;
  }).join("");
  return '<section class="package-system-diagram-detail" aria-label="Detalhes do diagrama">' +
    '<label class="package-system-diagram-detail-picker"><span>Detalhe para leitura</span>' +
    `<select data-system-detail-picker aria-label="Escolher elemento ou relação do diagrama">${options}</select></label>` +
    `<div class="package-system-diagram-detail-body" aria-live="polite">${panels}</div></section>`;
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
  const selected = preferredLabel(labels, focusId);
  const selectedKey = selected ? labelKey(selected) : "";
  const safeAccessibleText = safeLabelText(accessibleText, "Descrição textual do diagrama indisponível.");
  const canvas = '<div class="package-system-diagram-canvas" data-resource-scroll-frame="diagram" role="region" ' +
    'aria-label="Visão global do diagrama. Selecione um elemento para ler os detalhes." aria-busy="true" tabindex="0" ' +
    `data-graphviz-source="${escapePackageAttribute(source)}"></div>`;
  const details = detailMarkup(labels, selectedKey) +
    '<p class="package-system-diagram-navigation-hint">A visão global cabe no quadro. Selecione um elemento para ler; use Explorar para ampliar e mover o diagrama.</p>';
  const viewport = renderDiagramViewportShell({ canvasHtml: canvas, detailHtml: details });
  return `<figure class="package-system-diagram" data-system-diagram-engine="${escapePackageAttribute(engine)}" ` +
    `data-system-diagram-model="${escapePackageAttribute(encodeURIComponent(JSON.stringify(model)))}" ` +
    `data-system-diagram-default-selection="${escapePackageAttribute(selectedKey)}"` +
    (focusId ? ` data-system-diagram-focus-id="${escapePackageAttribute(focusId)}"` : "") + ">" +
    viewport + `<figcaption>${caption}</figcaption>` +
    '<details class="package-system-diagram-text"><summary>Descrição textual completa</summary>' +
    `<p>${escapePackageHtml(safeAccessibleText)}</p></details>` +
    `<p class="package-system-diagram-layout-error" hidden>${escapePackageHtml(errorMessage)}</p></figure>`;
}

function nodeBounds(group) {
  if (!group) return null;
  const box = group.getBBox();
  return { x: box.x + 7, y: box.y + 1, width: Math.max(1, box.width - 14), height: Math.max(1, box.height - 2) };
}

function previewTemplate(detailContent) {
  const template = document.createElement("template");
  template.content.append(detailContent.cloneNode(true));
  [...template.content.children].forEach((element) => {
    element.setAttribute("aria-hidden", "true");
  });
  template.content.querySelectorAll(GAP_CONTROL_SELECTOR).forEach((control) => {
    const placeholder = document.createElement("span");
    placeholder.className = "package-system-diagram-gap-preview";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.textContent = String(control.textContent || "").trim() || "\u2026";
    control.replaceWith(placeholder);
  });
  return template;
}

function prepareLabel(figure, svg, label) {
  const key = labelKey(label);
  const groupId = `system-${label.kind}-${label.id}`;
  const group = graphvizGroupById(svg, groupId);
  const detail = figure.querySelector(`[data-system-detail-key="${CSS.escape(key)}"]`);
  const detailContent = detail?.querySelector(".package-system-diagram-detail-content");
  if (!group || !detailContent) return null;

  const safeText = safeLabelText(label.plain, label.kind === "node" ? "Elemento" : "Relação");
  group.dataset.systemObjectId = label.id;
  group.dataset.systemObjectKind = label.kind;
  group.dataset.systemDetailKey = key;
  group.setAttribute("role", "button");
  group.setAttribute("tabindex", "-1");
  group.setAttribute("aria-label", `Ler detalhes: ${safeText}`);
  group.setAttribute("aria-pressed", "false");

  if (detailContent.querySelector(GAP_CONTROL_SELECTOR)) {
    const texts = [...group.querySelectorAll("text")];
    const bounds = label.kind === "node" ? nodeBounds(group) : unionGraphvizTextBounds(texts);
    texts.forEach((element) => { element.style.visibility = "hidden"; });
    if (bounds) {
      const labelClass = label.kind === "node"
        ? "package-system-diagram-node-label"
        : "package-system-diagram-edge-label";
      appendGraphvizForeignLabel(group, previewTemplate(detailContent), label.kind === "node" ? bounds : {
        x: bounds.x - 8,
        y: bounds.y - 4,
        width: Math.max(64, bounds.width + 16),
        height: Math.max(28, bounds.height + 8)
      }, `${labelClass} package-system-diagram-inert-label`);
    }
  }
  return { key, group };
}

function bindSelection(figure) {
  const picker = figure.querySelector("[data-system-detail-picker]");
  const panels = [...figure.querySelectorAll(
    ".package-system-diagram-detail-item[data-system-detail-key]"
  )];
  const availableKeys = new Set(panels.map((panel) => panel.dataset.systemDetailKey));
  let groups = new Map();
  let controller = null;
  const select = (requestedKey, { center = false } = {}) => {
    const key = availableKeys.has(requestedKey)
      ? requestedKey
      : availableKeys.has(figure.dataset.systemDiagramDefaultSelection)
        ? figure.dataset.systemDiagramDefaultSelection
        : availableKeys.values().next().value;
    if (!key) return;
    if (picker) picker.value = key;
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.systemDetailKey !== key;
    });
    groups.forEach((group, candidate) => {
      const selected = candidate === key;
      group.classList.toggle("is-selected", selected);
      group.setAttribute("aria-pressed", selected ? "true" : "false");
      group.setAttribute("tabindex", selected ? "0" : "-1");
    });
    controller?.rememberSelection(key);
    if (center) controller?.centerElement(groups.get(key));
  };

  picker?.addEventListener("change", () => select(picker.value, { center: true }));
  select(figure.dataset.systemDiagramDefaultSelection);
  return Object.freeze({
    attach(prepared, viewportController) {
      groups = new Map(prepared.filter(Boolean).map((entry) => [entry.key, entry.group]));
      controller = viewportController;
      const orderedKeys = [...groups.keys()];
      prepared.filter(Boolean).forEach(({ key, group }) => {
        group.addEventListener("click", () => select(key, { center: true }));
        group.addEventListener("keydown", (event) => {
          if (["Enter", " "].includes(event.key)) {
            event.preventDefault();
            select(key, { center: true });
            return;
          }
          const direction = ["ArrowRight", "ArrowDown"].includes(event.key)
            ? 1
            : ["ArrowLeft", "ArrowUp"].includes(event.key)
              ? -1
              : 0;
          if (!direction || orderedKeys.length < 2) return;
          event.preventDefault();
          const index = orderedKeys.indexOf(key);
          const nextKey = orderedKeys[(index + direction + orderedKeys.length) % orderedKeys.length];
          select(nextKey, { center: true });
          groups.get(nextKey)?.focus({ preventScroll: true });
        });
      });
      select(controller.rememberedSelection || picker?.value ||
        figure.dataset.systemDiagramDefaultSelection);
    }
  });
}

async function hydrateFigure(figure, stateKey) {
  const canvas = figure.querySelector(".package-system-diagram-canvas");
  if (!canvas || ["loading", "ready", "error"].includes(canvas.dataset.graphvizStatus)) return;
  canvas.dataset.graphvizStatus = "loading";
  const selection = bindSelection(figure);
  try {
    const model = JSON.parse(decodeURIComponent(figure.dataset.systemDiagramModel || ""));
    const svg = await renderGraphvizSvg(canvas, {
      source: canvas.dataset.graphvizSource,
      engine: figure.dataset.systemDiagramEngine,
      className: "package-system-diagram-svg"
    });
    svg.style.visibility = "hidden";
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", "Elementos e relações do diagrama");
    const prepared = model.labels.map((label) => prepareLabel(figure, svg, label));
    const controller = await hydrateDiagramViewport({ figure, canvas, svg, stateKey });
    selection.attach(prepared, controller);
    svg.style.removeProperty("visibility");
    svg.removeAttribute("aria-hidden");
    figure.classList.remove("is-horizontally-scrollable");
    canvas.dataset.graphvizStatus = "ready";
    canvas.setAttribute("aria-busy", "false");
  } catch (error) {
    canvas.replaceChildren();
    canvas.dataset.graphvizStatus = "error";
    canvas.setAttribute("aria-busy", "false");
    const explore = figure.querySelector('[data-diagram-action="toggle-expanded"]');
    if (explore) {
      explore.disabled = true;
      explore.setAttribute("aria-label", "Exploração indisponível");
      const label = explore.querySelector("[data-diagram-expand-label]");
      if (label) label.textContent = "Exploração indisponível";
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
  return labels.map(({ kind, id, plain }) => ({
    kind,
    id,
    plain: safeLabelText(plain, kind === "node" ? "Elemento" : "Relação")
  }));
}
