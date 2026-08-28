import {
  parsePackageManualTextSegments,
  stripPackageManualTextMarkers
} from "../kernel/manualTextMarkers.js";

function escapePackageHtmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapePackageAttribute(value) {
  return escapePackageHtml(value).replace(/\r?\n/g, "&#10;");
}

export function renderPackageActionIcon(kind) {
  if (kind === "answer") {
    return '<svg class="runtime-feedback-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>';
  }
  if (kind === "retry") {
    return '<svg class="runtime-feedback-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6"/></svg>';
  }
  if (kind === "left") {
    return '<svg class="runtime-feedback-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m15 18-6-6 6-6"/></svg>';
  }
  if (kind === "right") {
    return '<svg class="runtime-feedback-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 18 6-6-6-6"/></svg>';
  }
  throw new RangeError(`Ícone de ação desconhecido: ${String(kind || "ausente")}.`);
}

export function packageTextAttributes(value) {
  const languageTag = typeof value?.languageTag === "string" ? value.languageTag.trim() : "";
  const direction = ["auto", "ltr", "rtl"].includes(value?.textDirection)
    ? value.textDirection
    : "auto";
  return (languageTag ? ` lang="${escapePackageAttribute(languageTag)}"` : "") + ` dir="${direction}"`;
}

const GAP_MARKER = /\uE000([^\uE001]+)\uE001/gu;

export function createPackageGapMarker(value) {
  return `\uE000${encodeURIComponent(JSON.stringify(value))}\uE001`;
}

export function packageReferenceText(value, replacement = "\u2026") {
  GAP_MARKER.lastIndex = 0;
  return stripPackageManualTextMarkers(value).replace(GAP_MARKER, replacement);
}

function readPackageGapMarker(value) {
  try {
    return JSON.parse(decodeURIComponent(value));
  } catch {
    return null;
  }
}

export function escapePackageHtml(value) {
  return escapePackageHtmlText(stripPackageManualTextMarkers(value));
}

function renderPackageOrderingMarker(marker) {
  const current = String(marker.value ?? "");
  const blockKey = escapePackageAttribute(marker.blockKey);
  const itemId = escapePackageAttribute(marker.itemId);
  const position = Number(marker.slotIndex) + 1;
  const total = Math.max(position, Number(marker.totalSlots) || position);
  const layoutLength = Array.from(String(marker.layoutText ?? current)).length;
  const slotWidth = Math.max(4, Math.min(80, Math.ceil(layoutLength * 1.2)));
  const groupLabel = `Expressão ${current}, posição ${position} de ${total}`;
  const moveButton = (direction, enabled) => {
    const directionLabel = direction === "left" ? "esquerda" : "direita";
    return `<button class="runtime-ordering-move" type="button" data-action="ordering-move" data-response-block-key="${blockKey}" data-ordering-item-id="${itemId}" data-ordering-direction="${direction}" aria-label="Mover ${escapePackageAttribute(current)} para a ${directionLabel}" title="Mover para a ${directionLabel}"${enabled ? "" : " disabled"}>${renderPackageActionIcon(direction)}</button>`;
  };
  return `<span class="runtime-ordering-slot" role="group" tabindex="-1" contenteditable="false" dir="auto" data-ordering-slot-index="${escapePackageAttribute(marker.slotIndex)}" data-ordering-item-id="${itemId}" aria-label="${escapePackageAttribute(groupLabel)}" aria-atomic="true" style="--ordering-slot-ch:${slotWidth}ch">${moveButton("left", marker.canMoveLeft)}<span class="runtime-ordering-value">${escapePackageHtml(current)}</span>${moveButton("right", marker.canMoveRight)}</span>`;
}

function renderPackageGapMarker(marker) {
  if (!marker) return "";
  if (marker.responseMode === "ordering") return renderPackageOrderingMarker(marker);
  const blockKey = escapePackageAttribute(marker.blockKey);
  const blankIndex = escapePackageAttribute(marker.index);
  const current = String(marker.value ?? "");
  const classes = `runtime-text-gap-blank ${marker.code ? "runtime-code-gap-blank" : "runtime-paragraph-gap-blank"}`;
  if (marker.readOnly === true) {
    return `<span class="${classes} is-resolved" dir="auto" data-empty="false" aria-label="Resposta esperada: ${escapePackageAttribute(current)}">${escapePackageHtml(current)}</span>`;
  }
  if (marker.responseMode === "choice") {
    const label = current ? `Editar resposta: ${current}` : "Escolher resposta";
    return `<span class="${classes} runtime-text-gap-choice-blank" role="button" tabindex="0" dir="auto" data-text-gap-choice="true" data-action="text-gap-open-choice" data-complete-block-key="${blockKey}" data-complete-blank-index="${blankIndex}" data-empty="${current ? "false" : "true"}" title="${escapePackageAttribute(label)}" aria-label="${escapePackageAttribute(label)}">${escapePackageHtml(current)}</span>`;
  }
  return `<span class="${classes}" contenteditable="true" role="textbox" spellcheck="false" dir="auto" inputmode="text" enterkeyhint="done" autocapitalize="off" autocorrect="off" aria-multiline="false" data-text-gap-field="true" data-action="complete-input" data-complete-block-key="${blockKey}" data-complete-blank-index="${blankIndex}" data-empty="${current ? "false" : "true"}" aria-label="Preencher resposta${current ? `: ${escapePackageAttribute(current)}` : ""}">${escapePackageHtml(current)}</span>`;
}

function renderInlineMarkup(value) {
  return escapePackageHtmlText(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function renderPackageInlineText(value, state) {
  const segments = String(value || "").split("`");
  let inCode = false;
  let html = "";
  segments.forEach((segment, index) => {
    const code = state ? state.inCode : inCode;
    html += code ? escapePackageHtmlText(segment).replace(/\n/g, "<br>") : renderInlineMarkup(segment);
    if (index < segments.length - 1) {
      html += code ? "</code>" : "<code>";
      if (state) state.inCode = !code;
      else inCode = !inCode;
    }
  });
  return html;
}

function manualFieldMarkup(path, html, tagName = "span") {
  if (!path) return html;
  return `<${tagName} data-package-manual-field-path="${escapePackageAttribute(encodeURIComponent(path))}">${html}</${tagName}>`;
}

function manualFieldAttribute(path) {
  return ` data-package-manual-field-path="${escapePackageAttribute(encodeURIComponent(path))}"`;
}

function renderPackageInlineSegment(value, state) {
  const source = String(value || "");
  let cursor = 0;
  let html = "";
  for (const match of source.matchAll(GAP_MARKER)) {
    html += renderPackageInlineText(source.slice(cursor, match.index), state);
    html += renderPackageGapMarker(readPackageGapMarker(match[1]));
    cursor = Number(match.index) + match[0].length;
  }
  html += renderPackageInlineText(source.slice(cursor), state);
  return html;
}

export function renderPackageInline(value) {
  const state = { inCode: false };
  const html = parsePackageManualTextSegments(value).map((segment) =>
    manualFieldMarkup(segment.path, renderPackageInlineSegment(segment.value, state))
  ).join("");
  return html + (state.inCode ? "</code>" : "");
}

function renderPackageInlineParsed(value) {
  const state = { inCode: false };
  const html = renderPackageInlineSegment(value, state);
  return html + (state.inCode ? "</code>" : "");
}

export function renderPackageInlineReference(value) {
  return parsePackageManualTextSegments(value).map((segment) => {
    GAP_MARKER.lastIndex = 0;
    return manualFieldMarkup(
      segment.path,
      renderPackageInlineParsed(segment.value.replace(GAP_MARKER, "\u2026"))
    );
  }).join("");
}

export function renderPackageCode(value) {
  return parsePackageManualTextSegments(value).map((segment) => {
    const source = String(segment.value || "");
    let cursor = 0;
    let html = "";
    for (const match of source.matchAll(GAP_MARKER)) {
      html += escapePackageHtmlText(source.slice(cursor, match.index));
      const marker = readPackageGapMarker(match[1]);
      html += renderPackageGapMarker(marker ? { ...marker, code: true } : null);
      cursor = Number(match.index) + match[0].length;
    }
    return manualFieldMarkup(
      segment.path,
      html + escapePackageHtmlText(source.slice(cursor))
    );
  }).join("");
}

function renderPackageProseText(value, metadata = {}) {
  const source = String(value || "").replace(/\r/g, "");
  const blocks = [];
  let paragraph = [];
  let activeList = null;
  const attrs = packageTextAttributes(metadata);
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p class="runtime-markdown-paragraph"${attrs}>${renderPackageInlineParsed(paragraph.join("\n"))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!activeList) return;
    blocks.push(`<${activeList.tag} class="runtime-markdown-list"${attrs}>${activeList.items.map((item) => `<li${attrs}>${renderPackageInlineParsed(item)}</li>`).join("")}</${activeList.tag}>`);
    activeList = null;
  };
  source.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }
    const unordered = trimmed.match(/^[-*+]\s+(.+)$/u);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/u);
    const tag = unordered ? "ul" : ordered ? "ol" : "";
    if (tag) {
      flushParagraph();
      if (activeList?.tag !== tag) {
        flushList();
        activeList = { tag, items: [] };
      }
      activeList.items.push(unordered?.[1] || ordered?.[1] || "");
      return;
    }
    flushList();
    paragraph.push(trimmed);
  });
  flushParagraph();
  flushList();
  return blocks.join("") || `<p class="runtime-markdown-paragraph"${attrs}></p>`;
}

export function renderPackageProse(value, metadata = {}) {
  const segments = parsePackageManualTextSegments(value);
  if (segments.length === 1 && segments[0].path) {
    const rendered = renderPackageProseText(segments[0].value, metadata);
    const topLevelBlocks = rendered.match(/<(?:p|ul|ol)\b/gu) || [];
    if (topLevelBlocks.length === 1) {
      return rendered.replace(
        /^<(p|ul|ol)\b/u,
        `<$1${manualFieldAttribute(segments[0].path)}`
      );
    }
    return manualFieldMarkup(segments[0].path, rendered, "div");
  }
  return renderPackageProseText(
    segments.map(({ value: segment }) => segment).join(""),
    metadata
  );
}
