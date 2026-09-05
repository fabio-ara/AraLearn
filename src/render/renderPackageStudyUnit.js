import { validateStudyUnitEnvelope } from "../resources/kernel/studyUnitEnvelope.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { escapePackageAttribute, escapePackageHtml } from "../resources/sdk/html.js";

function readPath(root, path) {
  const segments = String(path || "").match(/[^.[\]]+|\[(\d+)\]/gu) || [];
  return segments.reduce((value, segment) => {
    const key = segment.startsWith("[") ? Number(segment.slice(1, -1)) : segment;
    return value?.[key];
  }, root);
}

function responseBlockKey(studyUnit, prefix) {
  return studyUnit?.response?.id ? `${prefix}::response:${studyUnit.response.id}` : "";
}

function targetId(slot, instance) {
  return instance?.id ? `${slot}:${instance.id}` : "";
}

function manualTargets(instance, slot) {
  return RESOURCE_PACKAGE_REGISTRY.editableTargets(instance, slot)
    .map((target) => ({ ...target, value: readPath(instance.data, target.path) }))
    .filter(({ value }) => typeof value === "string");
}

function wrapInstance(instance, slot, html, options = {}, renderKey = "", editTargets = []) {
  const id = targetId(slot, instance);
  const selected = (options.selectedResourceTargetIds || []).includes(id);
  const inlineEditing = options.manualEditingTargetId === id;
  const encodedTargets = inlineEditing && editTargets.length
    ? encodeURIComponent(JSON.stringify(editTargets))
    : "";
  const packageHtml = `<section class="package-instance" data-package="${escapePackageAttribute(instance.package)}" data-package-version="${escapePackageAttribute(instance.version)}" data-package-instance-id="${escapePackageAttribute(instance.id)}" data-package-slot="${escapePackageAttribute(slot)}"${renderKey ? ` data-package-render-key="${escapePackageAttribute(renderKey)}"` : ""}${encodedTargets ? ` data-package-manual-targets="${escapePackageAttribute(encodedTargets)}"` : ""}>${html}</section>`;
  if (!options.resourceSelectionEnabled || !id) return packageHtml;
  if (Array.isArray(options.resourceSelectionTargetIds) &&
      !options.resourceSelectionTargetIds.includes(id)) return packageHtml;
  const label = options.resourceSelectionLabels?.[id] || (selected ? "Retirar recurso do reparo" : "Selecionar recurso para reparo");
  return `<section class="runtime-resource-edit-target${selected ? " is-selected" : ""}${inlineEditing ? " is-inline-editing" : ""}" data-resource-edit-target="${escapePackageAttribute(id)}" data-package-id="${escapePackageAttribute(instance.package)}"${inlineEditing ? ` data-manual-target-id="${escapePackageAttribute(id)}"` : ""}>${inlineEditing ? `<div class="runtime-resource-selection-content">${packageHtml}</div>` : `<button class="runtime-resource-selection-surface" type="button" data-action="toggle-study-unit-assistance-resource" data-resource-target-id="${escapePackageAttribute(id)}" aria-pressed="${selected ? "true" : "false"}" data-study-unit-authoring-focus="resource:${escapePackageAttribute(id)}" aria-label="${escapePackageAttribute(label)}" title="${escapePackageAttribute(label)}"${options.resourceSelectionDisabled ? " disabled aria-disabled=\"true\"" : ""}></button><div class="runtime-resource-selection-content">${packageHtml}</div>`}</section>`;
}

function renderInstance(studyUnit, instance, slot, index, options, dockExerciseParts) {
  const prefix = String(options.blockKeyPrefix || "runtime-study-unit");
  const blockKey = slot === "response"
    ? responseBlockKey(studyUnit, prefix)
    : `${prefix}::${slot}:${instance.id || index}`;
  const responseKey = responseBlockKey(studyUnit, prefix);
  const responseState = options.responseStateByBlockKey?.[responseKey] || null;
  const id = targetId(slot, instance);
  const inlineEditing = options.manualEditingTargetId === id;
  const editTargets = inlineEditing ? manualTargets(instance, slot) : [];
  const referenceTargets = (options.sourceTextTargets || []).filter(target => target.slot === slot && target.resourceId === instance.id);
  const html = RESOURCE_PACKAGE_REGISTRY.renderInstance(instance, slot, {
    ...options,
    studyUnit,
    instanceId: instance.id,
    blockKey,
    responseBlockKey: responseKey,
    responseState,
    activeTextGapPrompt: options.activeTextGapPrompt,
    studyUnitResponse: slot === "content" ? studyUnit.response : null,
    dockExerciseParts,
    manualEditing: inlineEditing,
    manualEditTargets: inlineEditing ? editTargets : referenceTargets
  });
  return wrapInstance(instance, slot, html, options, blockKey, editTargets);
}

function assertPackageStudyUnit(studyUnit) {
  const validation = validateStudyUnitEnvelope(studyUnit, RESOURCE_PACKAGE_REGISTRY);
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));
}

export function renderPackageStudyUnitBlocks(studyUnit, options = {}) {
  assertPackageStudyUnit(studyUnit);
  const dockExerciseParts = Array.isArray(options.dockExerciseParts)
    ? options.dockExerciseParts
    : null;
  const content = studyUnit.content.filter((instance) => !options.toolsInActionBar ||
    !RESOURCE_PACKAGE_REGISTRY.get(instance.package, instance.version)?.manifest.tool).map((instance, index) =>
    renderInstance(studyUnit, instance, "content", index, options, dockExerciseParts)
  ).join("");
  const response = studyUnit.response
    ? renderInstance(studyUnit, studyUnit.response, "response", 0, options, dockExerciseParts)
    : "";
  const authoringFeedback = studyUnit.feedback.length && (options.resourceSelectionEnabled || options.revealPracticeAnswers)
    ? '<section class="runtime-authoring-support-resources" aria-label="Explicações da unidade de estudo"><span class="runtime-authoring-support-title">Explicações</span>' +
      studyUnit.feedback.map((instance, index) => renderInstance(studyUnit, instance, "feedback", index, options, dockExerciseParts)).join("") +
      "</section>"
    : "";
  return content + response + authoringFeedback;
}

export function renderPackageStudyUnitBlocksWithDock(studyUnit, options = {}) {
  const dockExerciseParts = [];
  const bodyHtml = renderPackageStudyUnitBlocks(studyUnit, { ...options, dockExerciseParts });
  return {
    bodyHtml,
    dockHtml: dockExerciseParts.length
      ? `<section class="card-answer-dock" data-study-unit-answer-dock="true">${dockExerciseParts.join("")}</section>`
      : ""
  };
}

export function getPackageStudyUnitFeedbackEntry(studyUnit) {
  if (!Array.isArray(studyUnit?.feedback) || !studyUnit.feedback.length) return null;
  return { instances: studyUnit.feedback, index: 0 };
}

export function renderPackageStudyUnitFeedback(entry, options = {}) {
  const studyUnit = options.studyUnit;
  if (!studyUnit || !Array.isArray(entry?.instances)) return { bodyHtml: "", dockHtml: "" };
  const dockExerciseParts = [];
  const bodyHtml = entry.instances.map((instance, index) =>
    renderInstance(studyUnit, instance, "feedback", index, options, dockExerciseParts)
  ).join("");
  return {
    bodyHtml,
    dockHtml: dockExerciseParts.length
      ? `<section class="card-answer-dock" data-study-unit-answer-dock="true">${dockExerciseParts.join("")}</section>`
      : ""
  };
}

export function renderPackageStudyUnitArticle(studyUnit, options = {}) {
  assertPackageStudyUnit(studyUnit);
  const blockKeyPrefix = `study-unit:${studyUnit.id}`;
  return `<article class="card card-package" data-study-unit-id="${escapePackageAttribute(studyUnit.id)}"><header class="card-head"><h4>${escapePackageHtml(studyUnit.title || "Unidade de estudo")}</h4></header><div class="card-body">${renderPackageStudyUnitBlocks(studyUnit, { ...options, blockKeyPrefix })}</div></article>`;
}

export function readPackageStudyUnitText(studyUnit) {
  assertPackageStudyUnit(studyUnit);
  const visibleStudyUnit = RESOURCE_PACKAGE_REGISTRY.prepareStudyUnitForSemantics(studyUnit);
  return [
    ...visibleStudyUnit.content.map((instance) => RESOURCE_PACKAGE_REGISTRY.accessibleText(instance, "content")),
    ...(visibleStudyUnit.response ? [RESOURCE_PACKAGE_REGISTRY.accessibleText(visibleStudyUnit.response, "response")] : []),
    ...visibleStudyUnit.feedback.map((instance) => RESOURCE_PACKAGE_REGISTRY.accessibleText(instance, "feedback"))
  ].filter(Boolean).join(" ");
}

export function getPackageStudyUnitResponseEntry(studyUnit, blockKeyPrefix) {
  if (!studyUnit?.response) return null;
  return {
    instance: studyUnit.response,
    block: studyUnit.response.data,
    blockKey: responseBlockKey(studyUnit, blockKeyPrefix)
  };
}

