import { validateCardEnvelope } from "../resources/kernel/cardEnvelope.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { escapePackageAttribute, escapePackageHtml } from "../resources/sdk/html.js";

function readPath(root, path) {
  const segments = String(path || "").match(/[^.[\]]+|\[(\d+)\]/gu) || [];
  return segments.reduce((value, segment) => {
    const key = segment.startsWith("[") ? Number(segment.slice(1, -1)) : segment;
    return value?.[key];
  }, root);
}

function responseBlockKey(card, prefix) {
  return card?.response?.id ? `${prefix}::response:${card.response.id}` : "";
}

function targetId(slot, instance) {
  return instance?.id ? `${slot}:${instance.id}` : "";
}

function conciseEditLabel(value) {
  return String(value || "Texto").replace(/^Editar\s+/iu, "");
}

function packageLabel(instance) {
  return RESOURCE_PACKAGE_REGISTRY.listCatalog()
    .find(({ id, version }) => id === instance.package && version === instance.version)?.label
    || instance.package;
}

function textareaRows(value, preserveWhitespace) {
  const lines = String(value).split("\n").length;
  const wrappedLines = Math.ceil(String(value).length / (preserveWhitespace ? 44 : 36));
  return Math.max(2, Math.min(8, Math.max(lines, wrappedLines)));
}

function manualEditor(instance, slot, readOnlyHtml) {
  const targets = RESOURCE_PACKAGE_REGISTRY.editableTargets(instance, slot)
    .map((target) => ({ ...target, value: readPath(instance.data, target.path) }))
    .filter(({ value }) => typeof value === "string");
  if (!targets.length) return "";
  const label = packageLabel(instance);
  return '<section class="package-manual-editor" aria-label="Editar textos de ' +
    escapePackageAttribute(label) + '">' +
    '<header class="package-manual-editor-head"><strong>Textos editáveis</strong><span>' +
    escapePackageHtml(label) + '</span><small>A estrutura do recurso permanece somente leitura.</small></header>' +
    '<div class="package-manual-fields">' +
    targets.map((target) => {
      const fieldLabel = conciseEditLabel(target.label || target.path);
      const preserveWhitespace = target.preserveWhitespace === true;
      return `<label class="package-manual-field"><span>${escapePackageHtml(fieldLabel)}</span><textarea class="package-manual-field-value${preserveWhitespace ? " preserves-whitespace" : ""}" rows="${textareaRows(target.value, preserveWhitespace)}" data-manual-edit-path="${escapePackageAttribute(target.path)}" data-manual-edit-original="${escapePackageAttribute(target.value)}"${preserveWhitespace ? ' spellcheck="false"' : ' spellcheck="true"'} aria-label="${escapePackageAttribute(`Editar ${fieldLabel}`)}">${escapePackageHtml(target.value)}</textarea></label>`;
    }).join("") +
    '</div><details class="package-manual-context"><summary>Representação — somente leitura</summary>' +
    `<div class="package-manual-preview" inert aria-hidden="true">${readOnlyHtml}</div>` +
    '</details></section>';
}

function wrapInstance(instance, slot, html, options = {}) {
  const id = targetId(slot, instance);
  const selected = (options.selectedResourceTargetIds || []).includes(id);
  const inlineEditing = options.manualEditingTargetId === id;
  const packageContent = inlineEditing ? manualEditor(instance, slot, html) : html;
  const packageHtml = `<section class="package-instance" data-package="${escapePackageAttribute(instance.package)}" data-package-version="${escapePackageAttribute(instance.version)}" data-package-instance-id="${escapePackageAttribute(instance.id)}">${packageContent}</section>`;
  if (!options.resourceSelectionEnabled || !id) return packageHtml;
  const label = options.resourceSelectionLabels?.[id] || (selected ? "Retirar recurso do reparo" : "Selecionar recurso para reparo");
  return `<section class="runtime-resource-edit-target${selected ? " is-selected" : ""}${inlineEditing ? " is-inline-editing" : ""}" data-resource-edit-target="${escapePackageAttribute(id)}" data-package-id="${escapePackageAttribute(instance.package)}"${inlineEditing ? ` data-manual-target-id="${escapePackageAttribute(id)}"` : ""}>${inlineEditing ? `<div class="runtime-resource-selection-content">${packageHtml}</div>` : `<button class="runtime-resource-selection-surface" type="button" data-action="toggle-card-assistance-resource" data-resource-target-id="${escapePackageAttribute(id)}" aria-pressed="${selected ? "true" : "false"}" data-card-authoring-focus="resource:${escapePackageAttribute(id)}" aria-label="${escapePackageAttribute(label)}" title="${escapePackageAttribute(label)}"${options.resourceSelectionDisabled ? " disabled aria-disabled=\"true\"" : ""}></button><div class="runtime-resource-selection-content">${packageHtml}</div>`}</section>`;
}

function renderInstance(card, instance, slot, index, options, dockExerciseParts) {
  const prefix = String(options.blockKeyPrefix || "runtime-card");
  const blockKey = slot === "response"
    ? responseBlockKey(card, prefix)
    : `${prefix}::${slot}:${instance.id || index}`;
  const responseKey = responseBlockKey(card, prefix);
  const responseState = options.responseStateByBlockKey?.[responseKey] || null;
  const html = RESOURCE_PACKAGE_REGISTRY.renderInstance(instance, slot, {
    ...options,
    card,
    instanceId: instance.id,
    blockKey,
    responseBlockKey: responseKey,
    responseState,
    cardResponse: slot === "content" ? card.response : null,
    dockExerciseParts
  });
  return wrapInstance(instance, slot, html, options);
}

function assertPackageCard(card) {
  const validation = validateCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY);
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));
}

export function renderPackageCardBlocks(card, options = {}) {
  assertPackageCard(card);
  const dockExerciseParts = Array.isArray(options.dockExerciseParts)
    ? options.dockExerciseParts
    : null;
  const content = card.content.map((instance, index) =>
    renderInstance(card, instance, "content", index, options, dockExerciseParts)
  ).join("");
  const response = card.response
    ? renderInstance(card, card.response, "response", 0, options, dockExerciseParts)
    : "";
  const authoringFeedback = options.resourceSelectionEnabled
    ? '<section class="runtime-authoring-support-resources" aria-label="Explicações do card"><span class="runtime-authoring-support-title">Explicações</span>' +
      card.feedback.map((instance, index) => renderInstance(card, instance, "feedback", index, options, dockExerciseParts)).join("") +
      "</section>"
    : "";
  return content + response + authoringFeedback;
}

export function renderPackageCardBlocksWithDock(card, options = {}) {
  const dockExerciseParts = [];
  const bodyHtml = renderPackageCardBlocks(card, { ...options, dockExerciseParts });
  return {
    bodyHtml,
    dockHtml: dockExerciseParts.length
      ? `<section class="card-answer-dock" data-card-answer-dock="true">${dockExerciseParts.join("")}</section>`
      : ""
  };
}

export function getPackageFeedbackEntry(card) {
  if (!Array.isArray(card?.feedback) || !card.feedback.length) return null;
  return { instances: card.feedback, index: 0 };
}

export function renderPackageFeedback(entry, options = {}) {
  const card = options.card;
  if (!card || !Array.isArray(entry?.instances)) return { bodyHtml: "", dockHtml: "" };
  const dockExerciseParts = [];
  const bodyHtml = entry.instances.map((instance, index) =>
    renderInstance(card, instance, "feedback", index, options, dockExerciseParts)
  ).join("");
  return {
    bodyHtml,
    dockHtml: dockExerciseParts.length
      ? `<section class="card-answer-dock" data-card-answer-dock="true">${dockExerciseParts.join("")}</section>`
      : ""
  };
}

export function renderPackageCardArticle(card) {
  assertPackageCard(card);
  return `<article class="card card-package" data-card-id="${escapePackageAttribute(card.id)}"><header class="card-head"><h4>${escapePackageHtml(card.title || "Card")}</h4></header><div class="card-body">${renderPackageCardBlocks(card)}</div></article>`;
}

export function readPackageCardText(card) {
  assertPackageCard(card);
  return [
    ...card.content.map((instance) => RESOURCE_PACKAGE_REGISTRY.accessibleText(instance, "content")),
    ...(card.response ? [RESOURCE_PACKAGE_REGISTRY.accessibleText(card.response, "response")] : []),
    ...card.feedback.map((instance) => RESOURCE_PACKAGE_REGISTRY.accessibleText(instance, "feedback"))
  ].filter(Boolean).join(" ");
}

export function getPackageResponseEntry(card, blockKeyPrefix) {
  if (!card?.response) return null;
  return {
    instance: card.response,
    block: card.response.data,
    blockKey: responseBlockKey(card, blockKeyPrefix)
  };
}

