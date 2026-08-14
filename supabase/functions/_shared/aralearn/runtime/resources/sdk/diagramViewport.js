const MIN_DIAGRAM_SCALE = 0.08;
const MIN_NUMERIC_DIAGRAM_SCALE = 0.000001;
const MAX_DIAGRAM_SCALE = 2.4;
const DIAGRAM_SCALE_STEP = 1.25;
const MAX_REMEMBERED_VIEWPORTS = 128;

const viewportMemory = new Map();

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeDiagramScale(value, {
  min = MIN_DIAGRAM_SCALE,
  max = MAX_DIAGRAM_SCALE
} = {}) {
  return Math.min(max, Math.max(min, finiteNumber(value, 1)));
}

export function calculateDiagramFitScale({
  naturalWidth,
  naturalHeight,
  viewportWidth,
  viewportHeight,
  padding = 20,
  min = MIN_NUMERIC_DIAGRAM_SCALE,
  max = 1
}) {
  const width = Math.max(1, finiteNumber(naturalWidth, 1));
  const height = Math.max(1, finiteNumber(naturalHeight, 1));
  const availableWidth = Math.max(1, finiteNumber(viewportWidth, 1) - padding);
  const availableHeight = Math.max(1, finiteNumber(viewportHeight, 1) - padding);
  return normalizeDiagramScale(Math.min(availableWidth / width, availableHeight / height), { min, max });
}

function rememberedViewport(key) {
  return key && viewportMemory.get(key) || null;
}

function rememberViewport(key, patch) {
  if (!key) return;
  const next = { ...(viewportMemory.get(key) || {}), ...patch };
  viewportMemory.delete(key);
  viewportMemory.set(key, next);
  while (viewportMemory.size > MAX_REMEMBERED_VIEWPORTS) {
    viewportMemory.delete(viewportMemory.keys().next().value);
  }
}

export function renderDiagramViewportShell({ canvasHtml, detailHtml }) {
  return '<div class="package-diagram-viewport-home" data-diagram-viewport-home>' +
    '<section class="package-diagram-viewport" data-diagram-viewport data-diagram-expanded="false">' +
    '<div class="package-diagram-toolbar" role="toolbar" aria-label="Controles do diagrama">' +
    '<div class="package-diagram-zoom-controls">' +
    '<button type="button" data-diagram-action="zoom-out" aria-label="Diminuir zoom">−</button>' +
    '<button type="button" class="package-diagram-fit-control" data-diagram-action="fit" aria-label="Ajustar todo o diagrama ao quadro">' +
    '<span>Ajustar</span><output data-diagram-scale-output>100%</output></button>' +
    '<button type="button" data-diagram-action="zoom-in" aria-label="Aumentar zoom">+</button>' +
    '</div>' +
    '<button type="button" class="package-diagram-expand-control" data-diagram-action="toggle-expanded" aria-label="Explorar diagrama em tela inteira">' +
    '<span data-diagram-expand-label>Explorar</span></button>' +
    '</div>' +
    canvasHtml + detailHtml +
    '</section></div>' +
    '<dialog class="package-diagram-modal" data-diagram-modal aria-label="Explorar diagrama em tela inteira"></dialog>';
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export async function hydrateDiagramViewport({ figure, canvas, svg, stateKey }) {
  const home = figure.querySelector("[data-diagram-viewport-home]");
  const viewport = figure.querySelector("[data-diagram-viewport]");
  const dialog = figure.querySelector("[data-diagram-modal]");
  const output = viewport?.querySelector("[data-diagram-scale-output]");
  const zoomOut = viewport?.querySelector('[data-diagram-action="zoom-out"]');
  const zoomIn = viewport?.querySelector('[data-diagram-action="zoom-in"]');
  const fit = viewport?.querySelector('[data-diagram-action="fit"]');
  const toggleExpanded = viewport?.querySelector('[data-diagram-action="toggle-expanded"]');
  const expandLabel = viewport?.querySelector("[data-diagram-expand-label]");
  if (!home || !viewport || !dialog || !canvas || !svg || !zoomOut || !zoomIn || !fit || !toggleExpanded) {
    throw new Error("Navegador de diagrama incompleto.");
  }

  const viewBox = svg.viewBox.baseVal;
  const naturalWidth = Math.max(1, finiteNumber(viewBox.width, 1));
  const naturalHeight = Math.max(1, finiteNumber(viewBox.height, 1));
  let currentScale = 1;
  let expanded = false;
  let scaleMode = "fit";
  let resizeFrame = 0;

  const fitScale = () => calculateDiagramFitScale({
    naturalWidth,
    naturalHeight,
    viewportWidth: canvas.clientWidth,
    viewportHeight: canvas.clientHeight
  });

  const updateControls = () => {
    const minimum = fitScale();
    if (output) output.textContent = `${Math.round(currentScale * 100)}%`;
    zoomOut.disabled = !expanded || currentScale <= minimum + 0.001;
    zoomIn.disabled = !expanded || currentScale >= MAX_DIAGRAM_SCALE - 0.001;
    fit.disabled = !expanded;
    viewport.dataset.diagramExpanded = expanded ? "true" : "false";
    canvas.dataset.diagramViewportMode = expanded ? "explore" : "overview";
    if (expandLabel) expandLabel.textContent = expanded ? "Voltar ao card" : "Explorar";
    toggleExpanded.setAttribute("aria-label", expanded
      ? "Voltar ao card"
      : "Explorar diagrama em tela inteira");
  };

  const persistCurrentView = () => {
    if (!expanded) return;
    rememberViewport(stateKey, {
      scaleMode,
      scale: currentScale,
      scrollLeft: canvas.scrollLeft,
      scrollTop: canvas.scrollTop
    });
  };

  const setScale = (value, {
    anchorClientX,
    anchorClientY,
    restoreScroll = null,
    persist = true
  } = {}) => {
    const minimum = fitScale();
    const nextScale = normalizeDiagramScale(value, { min: minimum, max: MAX_DIAGRAM_SCALE });
    const rect = canvas.getBoundingClientRect();
    const offsetX = typeof anchorClientX === "number"
      ? Math.min(canvas.clientWidth, Math.max(0, anchorClientX - rect.left))
      : canvas.clientWidth / 2;
    const offsetY = typeof anchorClientY === "number"
      ? Math.min(canvas.clientHeight, Math.max(0, anchorClientY - rect.top))
      : canvas.clientHeight / 2;
    const contentX = (canvas.scrollLeft + offsetX) /
      Math.max(currentScale, MIN_NUMERIC_DIAGRAM_SCALE);
    const contentY = (canvas.scrollTop + offsetY) /
      Math.max(currentScale, MIN_NUMERIC_DIAGRAM_SCALE);

    currentScale = nextScale;
    svg.style.width = `${naturalWidth * nextScale}px`;
    svg.style.height = `${naturalHeight * nextScale}px`;
    svg.setAttribute("data-diagram-scale", nextScale.toFixed(3));
    updateControls();

    requestAnimationFrame(() => {
      if (!expanded) {
        canvas.scrollLeft = 0;
        canvas.scrollTop = 0;
      } else if (restoreScroll) {
        canvas.scrollLeft = Math.max(0, finiteNumber(restoreScroll.left));
        canvas.scrollTop = Math.max(0, finiteNumber(restoreScroll.top));
      } else {
        canvas.scrollLeft = Math.max(0, contentX * nextScale - offsetX);
        canvas.scrollTop = Math.max(0, contentY * nextScale - offsetY);
      }
      if (persist) persistCurrentView();
    });
  };

  const applyFit = ({ persist = true } = {}) => {
    scaleMode = "fit";
    setScale(fitScale(), {
      restoreScroll: { left: 0, top: 0 },
      persist
    });
  };

  const zoomBy = (factor, event = null) => {
    if (!expanded) return;
    scaleMode = "custom";
    setScale(currentScale * factor, {
      anchorClientX: event?.clientX,
      anchorClientY: event?.clientY
    });
  };

  const restoreInlineViewport = async () => {
    if (!expanded) return;
    persistCurrentView();
    home.append(viewport);
    expanded = false;
    updateControls();
    await nextFrame();
    applyFit({ persist: false });
    toggleExpanded.focus({ preventScroll: true });
  };

  const openExpandedViewport = async () => {
    if (expanded) return;
    dialog.append(viewport);
    dialog.showModal();
    expanded = true;
    updateControls();
    await nextFrame();
    const remembered = rememberedViewport(stateKey);
    if (remembered?.scaleMode === "custom") {
      scaleMode = "custom";
      setScale(remembered.scale, {
        restoreScroll: {
          left: remembered.scrollLeft,
          top: remembered.scrollTop
        },
        persist: false
      });
    } else {
      applyFit({ persist: false });
    }
    toggleExpanded.focus({ preventScroll: true });
  };

  zoomOut.addEventListener("click", () => zoomBy(1 / DIAGRAM_SCALE_STEP));
  zoomIn.addEventListener("click", () => zoomBy(DIAGRAM_SCALE_STEP));
  fit.addEventListener("click", () => applyFit());
  toggleExpanded.addEventListener("click", () => {
    if (expanded) dialog.close();
    else void openExpandedViewport();
  });
  dialog.addEventListener("close", () => void restoreInlineViewport());
  canvas.addEventListener("scroll", persistCurrentView, { passive: true });
  canvas.addEventListener("wheel", (event) => {
    if (!expanded || !event.ctrlKey) return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? DIAGRAM_SCALE_STEP : 1 / DIAGRAM_SCALE_STEP, event);
  }, { passive: false });
  viewport.addEventListener("click", (event) => {
    if (expanded && event.target.closest?.('[data-action="text-gap-open-choice"]')) {
      dialog.close();
    }
  }, { capture: true });

  const resizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(() => {
        if (!figure.isConnected) {
          resizeObserver.disconnect();
          return;
        }
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          if (!expanded || scaleMode === "fit") applyFit({ persist: false });
        });
      })
    : null;
  resizeObserver?.observe(canvas);

  await nextFrame();
  applyFit({ persist: false });

  return Object.freeze({
    get expanded() { return expanded; },
    get rememberedSelection() { return rememberedViewport(stateKey)?.selection || ""; },
    rememberSelection(selection) {
      rememberViewport(stateKey, { selection });
    },
    centerElement(element) {
      if (!expanded || !element) return;
      const canvasRect = canvas.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const left = canvas.scrollLeft + elementRect.left - canvasRect.left -
        (canvas.clientWidth - elementRect.width) / 2;
      const top = canvas.scrollTop + elementRect.top - canvasRect.top -
        (canvas.clientHeight - elementRect.height) / 2;
      const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      canvas.scrollTo({
        left: Math.max(0, left),
        top: Math.max(0, top),
        behavior: reducedMotion ? "auto" : "smooth"
      });
    }
  });
}
