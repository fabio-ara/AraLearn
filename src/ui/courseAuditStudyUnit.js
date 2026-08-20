import { renderPackageStudyUnitBlocksWithDock } from "../render/renderPackageStudyUnit.js";
import {
  normalizeStudyUnitEnvelope,
  validateStudyUnitEnvelope
} from "../resources/kernel/studyUnitEnvelope.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";

const EDITABLE_SLOTS = Object.freeze(["content", "response", "feedback"]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parsePath(path) {
  const segments = [];
  String(path || "").replace(/([^.[]+)|\[(\d+)\]/gu, (_match, key, index) => {
    segments.push(index === undefined ? key : Number(index));
    return "";
  });
  return segments;
}

function readPath(target, path) {
  return parsePath(path).reduce((value, segment) => value?.[segment], target);
}

function writeStringPath(target, path, value) {
  const segments = parsePath(path);
  const last = segments.pop();
  const parent = segments.reduce((current, segment) => current?.[segment], target);
  if (last === undefined || !parent || typeof parent !== "object" ||
      !Object.hasOwn(parent, last) || typeof parent[last] !== "string") return false;
  parent[last] = String(value ?? "");
  return true;
}

function instancesForSlot(studyUnit, slot) {
  if (slot === "response") return studyUnit.response ? [studyUnit.response] : [];
  return Array.isArray(studyUnit[slot]) ? studyUnit[slot] : [];
}

function fieldKey(slot, instanceId, path) {
  return encodeURIComponent(JSON.stringify([slot, instanceId, path]));
}

export function materializeCourseAuditStudyUnit(content, {
  studyUnitId = "audit-preview",
  position = 1
} = {}) {
  const source = structuredClone(content || {});
  const studyUnit = {
    id: String(studyUnitId || "audit-preview"),
    position: Number.isSafeInteger(position) && position > 0 ? position : 1,
    title: source.title,
    role: source.role,
    content: source.content,
    response: source.response ?? null,
    feedback: source.feedback,
    topics: Array.isArray(source.topics) ? structuredClone(source.topics) : []
  };
  const validation = validateStudyUnitEnvelope(
    studyUnit,
    RESOURCE_PACKAGE_REGISTRY,
    "$.courseAudit.studyUnit"
  );
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));
  return normalizeStudyUnitEnvelope(studyUnit, RESOURCE_PACKAGE_REGISTRY);
}

export function relationFreeCourseAuditContent(studyUnit) {
  const normalized = normalizeStudyUnitEnvelope(studyUnit, RESOURCE_PACKAGE_REGISTRY);
  return {
    title: normalized.title,
    role: normalized.role,
    content: structuredClone(normalized.content),
    response: structuredClone(normalized.response),
    feedback: structuredClone(normalized.feedback),
    topics: structuredClone(normalized.topics)
  };
}

export function listCourseAuditEditableFields(content, options = {}) {
  const studyUnit = materializeCourseAuditStudyUnit(content, options);
  const fields = [{
    key: "title",
    slot: "study_unit",
    instanceId: studyUnit.id,
    path: "title",
    label: "Título da Unidade",
    value: studyUnit.title,
    preserveWhitespace: false
  }];
  for (const slot of EDITABLE_SLOTS) {
    for (const instance of instancesForSlot(studyUnit, slot)) {
      for (const target of RESOURCE_PACKAGE_REGISTRY.editableTargets(instance, slot)) {
        const value = readPath(instance.data, target.path);
        if (typeof value !== "string") continue;
        fields.push({
          key: fieldKey(slot, instance.id, target.path),
          slot,
          instanceId: instance.id,
          path: target.path,
          label: target.label || target.path,
          value,
          preserveWhitespace: target.preserveWhitespace === true
        });
      }
    }
  }
  return fields;
}

export function applyCourseAuditEditableFields(content, values, options = {}) {
  const studyUnit = materializeCourseAuditStudyUnit(content, options);
  const allowed = new Map(listCourseAuditEditableFields(content, options).map((field) => [
    field.key,
    field
  ]));
  for (const [key, rawValue] of Object.entries(values || {})) {
    const field = allowed.get(key);
    if (!field) throw new TypeError("O campo editável deixou de existir.");
    if (key === "title") {
      const title = String(rawValue ?? "").trim();
      if (!title) throw new TypeError("O título da Unidade é obrigatório.");
      studyUnit.title = title;
      continue;
    }
    const instance = instancesForSlot(studyUnit, field.slot)
      .find((candidate) => candidate.id === field.instanceId);
    if (!instance || !writeStringPath(instance.data, field.path, rawValue)) {
      throw new TypeError("O recurso editável deixou de corresponder ao checkpoint.");
    }
  }
  const validation = validateStudyUnitEnvelope(
    studyUnit,
    RESOURCE_PACKAGE_REGISTRY,
    "$.courseAudit.editedStudyUnit"
  );
  if (!validation.valid) {
    throw new TypeError(`A correção deixou a Unidade inválida: ${validation.errors[0]}`);
  }
  return relationFreeCourseAuditContent(studyUnit);
}

export function renderCourseAuditStudyUnitPreview(snapshot, {
  studyUnitId = "audit-preview",
  position = 1,
  heading = "Prévia"
} = {}) {
  const studyUnit = materializeCourseAuditStudyUnit(snapshot?.content, { studyUnitId, position });
  const runtime = renderPackageStudyUnitBlocksWithDock(studyUnit, {
    omitRepeatedHeading: true,
    blockKeyPrefix: `course-audit:${studyUnitId}:${snapshot?.hash || heading}`
  });
  return '<article class="course-audit-preview-card">' +
    `<header><div><p class="course-audit-caption">${escapeHtml(heading)}</p>` +
    `<h4>${escapeHtml(studyUnit.title)}</h4></div></header>` +
    '<p class="course-audit-network-note">Prévia somente leitura; respostas estão desativadas.</p>' +
    '<div class="runtime-card-rendered-content course-audit-preview-runtime" data-course-audit-preview>' +
    `<div class="card-sheet-content">${runtime.bodyHtml}</div>${runtime.dockHtml}</div></article>`;
}

export async function hydrateCourseAuditStudyUnitPreviews(root) {
  if (!root) return;
  await RESOURCE_PACKAGE_REGISTRY.hydrate(root);
  root.querySelectorAll?.("[data-course-audit-preview]").forEach((preview) => {
    preview.querySelectorAll?.("button, input, select, textarea").forEach((control) => {
      control.disabled = true;
      control.setAttribute?.("aria-disabled", "true");
      control.setAttribute?.("tabindex", "-1");
    });
    preview.querySelectorAll?.("a[href]").forEach((link) => {
      link.setAttribute?.("aria-disabled", "true");
      link.setAttribute?.("tabindex", "-1");
    });
  });
}
