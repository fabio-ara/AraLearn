const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const PERMANENTLY_EXCLUDED_SELECTOR = [
  "script",
  "style",
  "noscript",
  "template",
  "title",
  "desc",
  ".visually-hidden",
  ".package-system-diagram-text"
].join(",");

function readPackageManualTargets(instanceRoot) {
  try {
    const encoded = instanceRoot.dataset.packageManualTargets || "";
    const parsed = JSON.parse(decodeURIComponent(encoded));
    return new Map((Array.isArray(parsed) ? parsed : [])
      .filter((target) => typeof target?.path === "string" &&
        typeof target?.value === "string")
      .map((target) => [target.path, target]));
  } catch {
    return new Map();
  }
}

function decodeFieldPath(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return "";
  }
}

function closestClosedDetails(element) {
  const details = element.closest?.("details");
  return details && !details.open ? details : null;
}

function isPermanentlyExcluded(element) {
  return Boolean(element?.closest?.(PERMANENTLY_EXCLUDED_SELECTOR));
}

function isTemporarilyHidden(element, { ignoreAriaHidden = false } = {}) {
  if (!element || element.closest?.("[hidden], [inert]")) return true;
  if (closestClosedDetails(element)) return true;
  const ariaHidden = element.closest?.('[aria-hidden="true"]');
  if (ariaHidden && !ignoreAriaHidden) return true;
  const style = globalThis.getComputedStyle?.(element);
  return Boolean(style && (style.display === "none" || style.visibility === "hidden"));
}

function applyManualFieldAttributes(field, target) {
  field.dataset.manualEditPath = target.path;
  field.dataset.manualEditOriginal = target.value;
  field.dataset.manualEditLabel = target.label || "Editar texto";
  if (target.preserveWhitespace === true) field.dataset.manualEditPreserveWhitespace = "true";
  field.setAttribute("contenteditable", "plaintext-only");
  field.setAttribute("role", "textbox");
  field.setAttribute("spellcheck", target.preserveWhitespace === true ? "false" : "true");
  field.setAttribute("aria-multiline", "true");
  field.setAttribute("aria-label", target.label || "Editar texto");
  field.setAttribute("title", target.label || "Editar texto");
  return field;
}

function applyManualSvgFieldAttributes(field, target) {
  const suffix = decodeFieldPath(field.dataset.packageManualSvgSuffix);
  field.removeAttribute("data-package-manual-svg-path");
  field.removeAttribute("data-package-manual-svg-suffix");
  applyManualFieldAttributes(field, target);
  if (suffix) field.dataset.manualEditSuffix = suffix;
  return field;
}

function materializeInstanceManualFields(instanceRoot) {
  const targets = readPackageManualTargets(instanceRoot);
  const created = [];
  instanceRoot.querySelectorAll("[data-package-manual-field-path]").forEach((field) => {
    const path = decodeFieldPath(field.dataset.packageManualFieldPath);
    const target = targets.get(path);
    if (!target || isPermanentlyExcluded(field)) {
      field.removeAttribute("data-package-manual-field-path");
      return;
    }
    // Graphviz keeps its SVG aria-hidden only while foreignObject labels are
    // installed. Leave the marker in place so the next mutation can bind it.
    if (isTemporarilyHidden(field)) return;
    field.removeAttribute("data-package-manual-field-path");
    if (field.closest("[data-manual-edit-path]")) return;
    created.push(applyManualFieldAttributes(field, target));
  });
  instanceRoot.querySelectorAll("[data-package-manual-svg-path]").forEach((field) => {
    const path = decodeFieldPath(field.dataset.packageManualSvgPath);
    const target = targets.get(path);
    if (!target || isPermanentlyExcluded(field)) {
      field.removeAttribute("data-package-manual-svg-path");
      field.removeAttribute("data-package-manual-svg-suffix");
      return;
    }
    if (isTemporarilyHidden(field, { ignoreAriaHidden: true })) return;
    created.push(applyManualSvgFieldAttributes(field, target));
  });
  return created;
}

export function materializePackageManualEditFields(container) {
  if (!container?.querySelectorAll) return [];
  return [...container.querySelectorAll(".package-instance[data-package-manual-targets]")]
    .flatMap(materializeInstanceManualFields);
}

function safeMarkdownLinkHref(value) {
  const href = String(value ?? "").trim();
  const hasControlCharacter = [...href].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 31 || codePoint === 127;
  });
  if (!href || href.length > 2048 || hasControlCharacter) return "";
  const explicitScheme = href.match(/^([a-z][a-z\d+.-]*):/iu)?.[1]?.toLowerCase() || "";
  if (explicitScheme && !["http", "https", "mailto", "tel"].includes(explicitScheme)) return "";
  try {
    const parsed = new URL(href, "https://aralearn.invalid/");
    return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol) ? href : "";
  } catch {
    return "";
  }
}

function markdownLinkLabel(value) {
  return String(value || "").replace(/([\\[\]])/gu, "\\$1");
}

function markdownLinkHref(value) {
  return String(value || "")
    .replace(/\\/gu, "\\\\")
    .replace(/\(/gu, "\\(")
    .replace(/\)/gu, "\\)")
    .replace(/ /gu, "%20");
}

export function serializeManualEditableNode(node) {
  if (node?.nodeType === 3) return String(node.data ?? "");
  if (node?.nodeType !== 1) return "";
  const tagName = String(node.tagName || "").toUpperCase();
  if (node.dataset?.manualEditDecoration === "true") return "";
  if (tagName === "BR") return "\n";
  const value = [...(node.childNodes || [])].map(serializeManualEditableNode).join("");
  if (tagName === "STRONG") return `**${value}**`;
  if (tagName === "EM") return `*${value}*`;
  if (tagName === "CODE" && node.dataset?.manualMarkdownCode === "true") {
    return `\`${value}\``;
  }
  if (tagName === "A") {
    const href = safeMarkdownLinkHref(node.getAttribute?.("href"));
    return href ? `[${markdownLinkLabel(value)}](${markdownLinkHref(href)})` : value;
  }
  if (tagName === "UL") {
    const items = [...(node.children || [])];
    return items.length
      ? items.map((item) => `- ${serializeManualEditableNode(item)}`).join("\n") + "\n"
      : value;
  }
  if (tagName === "OL") {
    const items = [...(node.children || [])];
    return items.length
      ? items.map((item, index) => `${index + 1}. ${serializeManualEditableNode(item)}`).join("\n") + "\n"
      : value;
  }
  if (tagName === "P") return `${value}\n\n`;
  if (tagName === "DIV") return `${value}\n`;
  return value;
}

function fieldText(node) {
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) return node.value;
  return serializeManualEditableNode(node).replace(/\r\n?/gu, "\n").replace(/\n+$/u, "");
}

function markRenderedMarkdownCode(field) {
  const explicitCode = String(field.dataset.manualEditOriginal || "")
    .split("`")
    .filter((_part, index) => index % 2 === 1);
  if (!explicitCode.length) return;
  const remaining = [...explicitCode];
  field.querySelectorAll("code").forEach((code) => {
    const index = remaining.indexOf(code.textContent || "");
    if (index < 0) return;
    code.dataset.manualMarkdownCode = "true";
    remaining.splice(index, 1);
  });
}

function decorateContentsField(field) {
  if (globalThis.getComputedStyle?.(field).display !== "contents") return;
  const children = [...field.children];
  children.forEach((child) => child.classList.add("runtime-manual-edit-fragment"));
  field.addEventListener("focus", () => children.forEach((child) => {
    child.classList.add("is-manual-edit-fragment-focused");
  }));
  field.addEventListener("blur", () => children.forEach((child) => {
    child.classList.remove("is-manual-edit-fragment-focused");
  }));
}

function selectionBelongsToField(field) {
  const selection = field.ownerDocument.getSelection?.();
  return Boolean(selection?.rangeCount && selection.anchorNode && field.contains(selection.anchorNode));
}

function placeCaretAtEnd(field) {
  const selection = field.ownerDocument.getSelection?.();
  if (!selection || selectionBelongsToField(field)) return;
  const range = field.ownerDocument.createRange();
  range.selectNodeContents(field);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function copyManualFieldMetadata(source, target) {
  [
    "manualEditPath",
    "manualEditOriginal",
    "manualEditLabel",
    "manualEditPreserveWhitespace",
    "manualEditSuffix"
  ].forEach((key) => {
    if (source.dataset[key] !== undefined) target.dataset[key] = source.dataset[key];
  });
  ["role", "spellcheck", "aria-multiline", "aria-label", "title"].forEach((name) => {
    const value = source.getAttribute(name);
    if (value !== null) target.setAttribute(name, value);
  });
  target.setAttribute("contenteditable", "plaintext-only");
}

function ensureFieldDecoration(field) {
  const suffix = field.dataset.manualEditSuffix || "";
  if (!suffix || field.querySelector('[data-manual-edit-decoration="true"]')) return;
  const decoration = field.ownerDocument.createElement("span");
  decoration.dataset.manualEditDecoration = "true";
  decoration.setAttribute("contenteditable", "false");
  decoration.textContent = suffix;
  field.append(decoration);
}

function visualLayerHost(source, fallbackHost) {
  return source.closest("[data-diagram-viewport]") ||
    source.closest("[data-resource-scroll-frame]") || fallbackHost;
}

function visualLayer(host) {
  let layer = [...host.children].find((child) =>
    child.classList?.contains("runtime-manual-svg-layer")
  );
  if (layer) return layer;
  layer = host.ownerDocument.createElement("div");
  layer.className = "runtime-manual-svg-layer";
  Object.assign(layer.style, {
    position: "absolute",
    inset: "0",
    zIndex: "9",
    overflow: "hidden",
    pointerEvents: "none"
  });
  if (globalThis.getComputedStyle?.(host).position === "static") host.style.position = "relative";
  host.append(layer);
  return layer;
}

function makeVisualFieldEditable(field, fallbackHost) {
  if (!field || field.namespaceURI === HTML_NAMESPACE || !fallbackHost) return field;
  const host = visualLayerHost(field, fallbackHost);
  const layer = visualLayer(host);
  const overlay = field.ownerDocument.createElement("span");
  overlay.className = "runtime-manual-svg-field";
  copyManualFieldMetadata(field, overlay);
  overlay.textContent = field.dataset.manualEditOriginal || field.textContent || "";
  ensureFieldDecoration(overlay);
  Object.assign(overlay.style, {
    position: "absolute",
    display: "block",
    minWidth: "0",
    margin: "0",
    padding: "0",
    overflow: "hidden",
    boxSizing: "border-box",
    border: "0",
    background: "transparent",
    color: "transparent",
    whiteSpace: "pre-wrap",
    pointerEvents: "auto"
  });
  const refreshPosition = () => {
    if (!field.isConnected || !layer.isConnected) return;
    const fieldRect = field.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    if (!fieldRect.width || !fieldRect.height) return;
    const computed = getComputedStyle(field);
    const matrix = typeof field.getScreenCTM === "function" ? field.getScreenCTM() : null;
    const scaleX = matrix ? Math.hypot(matrix.a, matrix.b) || 1 : 1;
    const scaleY = matrix ? Math.hypot(matrix.c, matrix.d) || 1 : 1;
    const fontSize = Number.parseFloat(computed.fontSize) || 0;
    const letterSpacing = Number.parseFloat(computed.letterSpacing) || 0;
    const screenFontSize = fontSize ? fontSize * scaleY : 0;
    Object.assign(overlay.style, {
      left: `${fieldRect.left - layerRect.left}px`,
      top: `${fieldRect.top - layerRect.top}px`,
      width: `${Math.max(1, fieldRect.width)}px`,
      height: `${Math.max(1, fieldRect.height)}px`,
      fontFamily: computed.fontFamily,
      fontSize: screenFontSize ? `${screenFontSize}px` : computed.fontSize,
      fontWeight: computed.fontWeight,
      fontStyle: computed.fontStyle,
      letterSpacing: letterSpacing ? `${letterSpacing * scaleX}px` : computed.letterSpacing,
      lineHeight: screenFontSize ? `${screenFontSize * 1.15}px` : computed.lineHeight,
      textAlign: computed.textAnchor === "middle"
        ? "center"
        : computed.textAnchor === "end" ? "right" : "left"
    });
    overlay.manualEditInk = computed.fill && computed.fill !== "none"
      ? computed.fill
      : computed.color;
  };
  overlay.manualEditRefreshPosition = refreshPosition;
  overlay.manualEditSource = field;
  field.classList.add("is-manual-edit-proxied-source");
  field.removeAttribute("data-manual-edit-path");
  field.removeAttribute("contenteditable");
  field.removeAttribute("role");
  field.setAttribute("aria-hidden", "true");
  layer.append(overlay);
  refreshPosition();
  return overlay;
}

function markManualFieldDirty(field) {
  field.dataset.manualEditDirty = "true";
  field.classList.add("is-manual-edit-dirty");
  if (field.classList.contains("runtime-manual-svg-field")) {
    field.style.color = field.manualEditInk || "currentColor";
  }
  field.manualEditSource?.classList.add("is-manual-edit-source-hidden");
}

export function activateManualInlineFields(container, draftValues = null) {
  if (!(container instanceof HTMLElement)) return null;
  const content = container.querySelector(".runtime-resource-selection-content") || container;
  const draft = draftValues?.pathValues && typeof draftValues.pathValues === "object"
    ? draftValues.pathValues
    : {};
  const fieldsByPath = new Map();
  const visualOverlays = [];
  let firstEditableField = null;
  let resizeObserver = null;
  let mutationObserver = null;
  let materializeFrame = 0;

  const bindField = (sourceField) => {
    if (sourceField.dataset.manualEditBound === "true" ||
        sourceField.classList.contains("is-manual-edit-proxied-source")) return;
    const field = sourceField.namespaceURI === HTML_NAMESPACE
      ? sourceField
      : makeVisualFieldEditable(sourceField, content);
    if (!field || field.dataset.manualEditBound === "true") return;
    field.dataset.manualEditBound = "true";
    field.dataset.manualEditReady = "true";
    const path = field.dataset.manualEditPath;
    if (!path) return;
    const mirrors = fieldsByPath.get(path) || [];
    const currentMirror = mirrors.find((candidate) => candidate.dataset.manualEditDirty === "true");
    mirrors.push(field);
    fieldsByPath.set(path, mirrors);
    markRenderedMarkdownCode(field);
    decorateContentsField(field);
    const draftValue = Object.hasOwn(draft, path)
      ? draft[path]
      : currentMirror ? fieldText(currentMirror) : undefined;
    if (draftValue !== undefined) {
      field.textContent = String(draftValue ?? "");
      ensureFieldDecoration(field);
      markManualFieldDirty(field);
    } else {
      ensureFieldDecoration(field);
    }
    if (!firstEditableField) {
      firstEditableField = field;
      field.dataset.cardAuthoringFocus = "manual-first-field";
    }
    let isComposing = false;
    const synchronize = () => {
      const nextValue = fieldText(field);
      ensureFieldDecoration(field);
      markManualFieldDirty(field);
      (fieldsByPath.get(path) || []).forEach((mirror) => {
        if (mirror === field) return;
        mirror.textContent = nextValue;
        ensureFieldDecoration(mirror);
        markManualFieldDirty(mirror);
      });
      container.dispatchEvent(new CustomEvent("manual-card-edit-change", {
        bubbles: true,
        detail: { path }
      }));
    };
    ["click", "pointerdown", "keydown"].forEach((type) => {
      field.addEventListener(type, (event) => event.stopPropagation());
    });
    field.addEventListener("focus", () => {
      field.dataset.manualEditActive = "true";
      queueMicrotask(() => {
        if (field.ownerDocument.activeElement === field) placeCaretAtEnd(field);
      });
    });
    field.addEventListener("blur", () => {
      delete field.dataset.manualEditActive;
    });
    field.addEventListener("compositionstart", () => { isComposing = true; });
    field.addEventListener("compositionend", () => {
      isComposing = false;
      synchronize();
    });
    field.addEventListener("input", () => {
      if (!isComposing) synchronize();
    });
    if (field.classList.contains("runtime-manual-svg-field")) {
      visualOverlays.push(field);
      resizeObserver?.observe(field.manualEditSource);
    }
  };

  const materialize = () => {
    materializePackageManualEditFields(container);
    container.querySelectorAll("[data-manual-edit-path]").forEach(bindField);
    visualOverlays.forEach((field) => field.manualEditRefreshPosition?.());
  };
  materialize();
  const initialRect = container.getBoundingClientRect();
  container.style.setProperty("--manual-edit-height", `${initialRect.height}px`);
  container.classList.add("is-manual-edit-ready");

  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(() => {
      visualOverlays.forEach((field) => field.manualEditRefreshPosition?.());
    });
    resizeObserver.observe(content);
    visualOverlays.forEach((field) => resizeObserver.observe(field.manualEditSource));
  }
  if (typeof MutationObserver === "function") {
    mutationObserver = new MutationObserver(() => {
      if (!container.isConnected) {
        resizeObserver?.disconnect();
        mutationObserver?.disconnect();
        return;
      }
      cancelAnimationFrame(materializeFrame);
      materializeFrame = requestAnimationFrame(materialize);
    });
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-hidden", "hidden", "open"]
    });
  }
  ["scroll", "wheel", "pointermove", "pointerup", "transitionend"].forEach((type) => {
    container.addEventListener(type, () => {
      requestAnimationFrame(() => {
        visualOverlays.forEach((field) => field.manualEditRefreshPosition?.());
      });
    }, { capture: true, passive: true });
  });
  return {
    get fields() { return [...fieldsByPath.values()].flat(); },
    content,
    refreshVisualFields() {
      visualOverlays.forEach((field) => field.manualEditRefreshPosition?.());
    },
    destroy() {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      cancelAnimationFrame(materializeFrame);
    }
  };
}

export function readManualInlineFieldValues(container) {
  if (!(container instanceof HTMLElement)) return {};
  const result = {};
  const fieldsByPath = new Map();
  container.querySelectorAll("[data-manual-edit-path]").forEach((field) => {
    const path = field.dataset.manualEditPath;
    if (!path) return;
    const mirrors = fieldsByPath.get(path) || [];
    mirrors.push(field);
    fieldsByPath.set(path, mirrors);
  });
  fieldsByPath.forEach((mirrors, path) => {
    const dirty = mirrors.find((field) => field.dataset.manualEditDirty === "true");
    const field = dirty || mirrors[0];
    result[path] = dirty
      ? fieldText(field)
      : field.dataset.manualEditOriginal ?? fieldText(field);
  });
  return result;
}
