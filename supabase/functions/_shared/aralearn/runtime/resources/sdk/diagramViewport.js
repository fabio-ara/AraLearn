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

const DIAGRAM_ICONS = Object.freeze({
  "zoom-out": '<svg class="package-diagram-control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8"/><path d="M8.5 12h7"/></svg>',
  fit: '<svg class="package-diagram-control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>',
  "zoom-in": '<svg class="package-diagram-control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8"/><path d="M8.5 12h7M12 8.5v7"/></svg>',
  expand: '<svg class="package-diagram-control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6"/></svg>',
  collapse: '<svg class="package-diagram-control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 9h6V3M21 9h-6V3M3 15h6v6M21 15h-6v6"/></svg>'
});

function iconButton(action, label, icon, className = "") {
  return `<button type="button"${className ? ` class="${className}"` : ""} ` +
    `data-diagram-action="${action}" aria-label="${label}">${DIAGRAM_ICONS[icon]}</button>`;
}

export function renderDiagramViewportShell({ canvasHtml }) {
  return '<div class="package-diagram-viewport-home" data-diagram-viewport-home>' +
    '<section class="package-diagram-viewport" data-diagram-viewport data-diagram-expanded="false">' +
    '<div class="package-diagram-toolbar" role="toolbar" aria-label="Controles do diagrama">' +
    '<div class="package-diagram-zoom-controls" data-diagram-expanded-controls hidden>' +
    iconButton("zoom-out", "Diminuir zoom", "zoom-out") +
    iconButton("fit", "Ajustar diagrama à tela", "fit", "package-diagram-fit-control") +
    iconButton("zoom-in", "Aumentar zoom", "zoom-in") +
    '</div>' +
    '<button type="button" class="package-diagram-expand-control" data-diagram-action="toggle-expanded" ' +
    'aria-label="Explorar diagrama em tela inteira">' +
    `<span data-diagram-toggle-icon>${DIAGRAM_ICONS.expand}</span></button>` +
    '</div>' + canvasHtml + '</section></div>' +
    '<dialog class="package-diagram-modal" data-diagram-modal aria-label="Diagrama em tela inteira"></dialog>';
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function pointerDistance(first, second) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function pointerMidpoint(first, second) {
  return {
    clientX: (first.clientX + second.clientX) / 2,
    clientY: (first.clientY + second.clientY) / 2
  };
}

function isDiagramControl(target) {
  return Boolean(target?.closest?.(
    'button, input, select, textarea, [contenteditable]:not([contenteditable="false"]), ' +
    '[data-action="text-gap-open-choice"]'
  ));
}

export async function hydrateDiagramViewport({ figure, canvas, svg, stateKey }) {
  const home = figure.querySelector("[data-diagram-viewport-home]");
  const viewport = figure.querySelector("[data-diagram-viewport]");
  const dialog = figure.querySelector("[data-diagram-modal]");
  const expandedControls = viewport?.querySelector("[data-diagram-expanded-controls]");
  const zoomOut = viewport?.querySelector('[data-diagram-action="zoom-out"]');
  const zoomIn = viewport?.querySelector('[data-diagram-action="zoom-in"]');
  const fit = viewport?.querySelector('[data-diagram-action="fit"]');
  const toggleExpanded = viewport?.querySelector('[data-diagram-action="toggle-expanded"]');
  const toggleIcon = viewport?.querySelector("[data-diagram-toggle-icon]");
  if (!home || !viewport || !dialog || !canvas || !svg || !expandedControls ||
      !zoomOut || !zoomIn || !fit || !toggleExpanded || !toggleIcon) {
    throw new Error("Navegador de diagrama incompleto.");
  }

  const viewBox = svg.viewBox.baseVal;
  const naturalWidth = Math.max(1, finiteNumber(viewBox.width, 1));
  const naturalHeight = Math.max(1, finiteNumber(viewBox.height, 1));
  const activePointers = new Map();
  let currentScale = 1;
  let expanded = false;
  let scaleMode = "fit";
  let resizeFrame = 0;
  let scrollFrame = 0;
  let panOrigin = null;
  let pinchOrigin = null;
  let dockedPrompt = null;
  let promptMarker = null;

  const fitScale = () => calculateDiagramFitScale({
    naturalWidth,
    naturalHeight,
    viewportWidth: canvas.clientWidth,
    viewportHeight: canvas.clientHeight
  });

  const updateControls = () => {
    const minimum = fitScale();
    zoomOut.disabled = currentScale <= minimum + 0.001;
    zoomIn.disabled = currentScale >= MAX_DIAGRAM_SCALE - 0.001;
    fit.disabled = scaleMode === "fit" && Math.abs(currentScale - minimum) <= 0.001;
    expandedControls.hidden = !expanded;
    toggleIcon.innerHTML = expanded ? DIAGRAM_ICONS.collapse : DIAGRAM_ICONS.expand;
    viewport.dataset.diagramExpanded = expanded ? "true" : "false";
    canvas.dataset.diagramViewportMode = expanded ? "explore" : "inline";
    toggleExpanded.setAttribute("aria-label", expanded
      ? "Voltar ao card"
      : "Explorar diagrama em tela inteira");
  };

  const persistCurrentView = () => {
    rememberViewport(stateKey, {
      scaleMode,
      scale: currentScale,
      scrollLeft: canvas.scrollLeft,
      scrollTop: canvas.scrollTop,
      expanded
    });
  };

  const promptSearchRoot = () => figure.closest(".runtime-card-sheet, .card-body, main, body")
    || figure.parentElement;

  const dockPracticePrompt = () => {
    const prompt = promptSearchRoot()?.querySelector?.('[data-text-gap-prompt="true"]');
    if (!prompt || prompt.closest("[data-diagram-modal]") === dialog) return;
    promptMarker = document.createComment("diagram-practice-prompt");
    prompt.parentNode?.insertBefore(promptMarker, prompt);
    dialog.append(prompt);
    dockedPrompt = prompt;
  };

  const restorePracticePrompt = () => {
    if (!dockedPrompt) return;
    if (promptMarker?.parentNode) promptMarker.parentNode.insertBefore(dockedPrompt, promptMarker);
    promptMarker?.remove();
    promptMarker = null;
    dockedPrompt = null;
  };

  const viewportPoint = ({ clientX, clientY }) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.min(canvas.clientWidth, Math.max(0, finiteNumber(clientX) - rect.left)),
      y: Math.min(canvas.clientHeight, Math.max(0, finiteNumber(clientY) - rect.top))
    };
  };

  const centeredContentPoint = () => ({
    x: (canvas.scrollLeft + canvas.clientWidth / 2) /
      Math.max(currentScale, MIN_NUMERIC_DIAGRAM_SCALE),
    y: (canvas.scrollTop + canvas.clientHeight / 2) /
      Math.max(currentScale, MIN_NUMERIC_DIAGRAM_SCALE)
  });

  const setScale = (value, {
    anchorClientX,
    anchorClientY,
    anchorContent = null,
    restoreScroll = null,
    persist = true
  } = {}) => {
    const nextScale = normalizeDiagramScale(value, { min: fitScale(), max: MAX_DIAGRAM_SCALE });
    const rect = canvas.getBoundingClientRect();
    const anchor = viewportPoint({
      clientX: typeof anchorClientX === "number"
        ? anchorClientX
        : rect.left + canvas.clientWidth / 2,
      clientY: typeof anchorClientY === "number"
        ? anchorClientY
        : rect.top + canvas.clientHeight / 2
    });
    const content = anchorContent || {
      x: (canvas.scrollLeft + anchor.x) / Math.max(currentScale, MIN_NUMERIC_DIAGRAM_SCALE),
      y: (canvas.scrollTop + anchor.y) / Math.max(currentScale, MIN_NUMERIC_DIAGRAM_SCALE)
    };

    currentScale = nextScale;
    svg.style.width = `${naturalWidth * nextScale}px`;
    svg.style.height = `${naturalHeight * nextScale}px`;
    svg.setAttribute("data-diagram-scale", nextScale.toFixed(3));
    updateControls();

    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      if (restoreScroll) {
        canvas.scrollLeft = Math.max(0, finiteNumber(restoreScroll.left));
        canvas.scrollTop = Math.max(0, finiteNumber(restoreScroll.top));
      } else {
        canvas.scrollLeft = Math.max(0, content.x * nextScale - anchor.x);
        canvas.scrollTop = Math.max(0, content.y * nextScale - anchor.y);
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
    scaleMode = "custom";
    setScale(currentScale * factor, {
      anchorClientX: event?.clientX,
      anchorClientY: event?.clientY
    });
  };

  const moveViewport = async ({ toDialog }) => {
    const content = centeredContentPoint();
    if (toDialog) {
      dialog.append(viewport);
      dockPracticePrompt();
      dialog.showModal();
      expanded = true;
    } else {
      home.append(viewport);
      restorePracticePrompt();
      expanded = false;
    }
    rememberViewport(stateKey, { expanded });
    updateControls();
    await nextFrame();
    if (scaleMode === "fit") {
      applyFit({ persist: false });
    } else {
      const rect = canvas.getBoundingClientRect();
      setScale(currentScale, {
        anchorContent: content,
        anchorClientX: rect.left + canvas.clientWidth / 2,
        anchorClientY: rect.top + canvas.clientHeight / 2
      });
    }
    toggleExpanded.focus({ preventScroll: true });
  };

  const restoreInlineViewport = async () => {
    if (!expanded) return;
    persistCurrentView();
    await moveViewport({ toDialog: false });
  };

  const openExpandedViewport = async () => {
    if (expanded) return;
    persistCurrentView();
    await moveViewport({ toDialog: true });
  };

  const resetPointerGesture = () => {
    pinchOrigin = null;
    const remaining = [...activePointers.values()][0];
    panOrigin = remaining ? {
      pointerId: remaining.pointerId,
      clientX: remaining.clientX,
      clientY: remaining.clientY,
      scrollLeft: canvas.scrollLeft,
      scrollTop: canvas.scrollTop,
      cardScroller: canvas.closest(".card-sheet-content"),
      cardScrollTop: canvas.closest(".card-sheet-content")?.scrollTop || 0
    } : null;
    canvas.classList.toggle("is-diagram-panning", Boolean(remaining));
  };

  const beginPinch = () => {
    const [first, second] = [...activePointers.values()];
    if (!first || !second) return;
    const midpoint = pointerMidpoint(first, second);
    const anchor = viewportPoint(midpoint);
    pinchOrigin = {
      distance: Math.max(1, pointerDistance(first, second)),
      scale: currentScale,
      content: {
        x: (canvas.scrollLeft + anchor.x) / Math.max(currentScale, MIN_NUMERIC_DIAGRAM_SCALE),
        y: (canvas.scrollTop + anchor.y) / Math.max(currentScale, MIN_NUMERIC_DIAGRAM_SCALE)
      }
    };
    panOrigin = null;
    canvas.classList.add("is-diagram-panning");
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
    if (!event.ctrlKey) return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? DIAGRAM_SCALE_STEP : 1 / DIAGRAM_SCALE_STEP, event);
  }, { passive: false });
  canvas.addEventListener("pointerdown", (event) => {
    if (isDiagramControl(event.target) || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    activePointers.set(event.pointerId, {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY
    });
    if (activePointers.size >= 2) beginPinch();
    else resetPointerGesture();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!activePointers.has(event.pointerId)) return;
    event.preventDefault();
    activePointers.set(event.pointerId, {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY
    });
    if (activePointers.size >= 2) {
      if (!pinchOrigin) beginPinch();
      const [first, second] = [...activePointers.values()];
      const midpoint = pointerMidpoint(first, second);
      scaleMode = "custom";
      setScale(pinchOrigin.scale * pointerDistance(first, second) / pinchOrigin.distance, {
        anchorClientX: midpoint.clientX,
        anchorClientY: midpoint.clientY,
        anchorContent: pinchOrigin.content
      });
      return;
    }
    if (!panOrigin || panOrigin.pointerId !== event.pointerId) resetPointerGesture();
    if (!panOrigin) return;
    const canPanCanvas = canvas.scrollWidth > canvas.clientWidth + 1 ||
      canvas.scrollHeight > canvas.clientHeight + 1;
    if (!expanded && !canPanCanvas && panOrigin.cardScroller) {
      panOrigin.cardScroller.scrollTop = Math.max(0,
        panOrigin.cardScrollTop + panOrigin.clientY - event.clientY
      );
    } else {
      canvas.scrollLeft = Math.max(0, panOrigin.scrollLeft + panOrigin.clientX - event.clientX);
      canvas.scrollTop = Math.max(0, panOrigin.scrollTop + panOrigin.clientY - event.clientY);
    }
  });
  const endPointer = (event) => {
    if (!activePointers.delete(event.pointerId)) return;
    if (event.type !== "lostpointercapture" && canvas.hasPointerCapture?.(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (activePointers.size >= 2) beginPinch();
    else resetPointerGesture();
    persistCurrentView();
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("lostpointercapture", endPointer);

  const resizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(() => {
        if (!figure.isConnected) {
          resizeObserver.disconnect();
          return;
        }
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          if (scaleMode === "fit") applyFit({ persist: false });
          else updateControls();
        });
      })
    : null;
  resizeObserver?.observe(canvas);

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
  if (remembered?.expanded === true) await openExpandedViewport();

  return Object.freeze({
    get expanded() { return expanded; },
    fit: applyFit,
    zoomBy
  });
}
